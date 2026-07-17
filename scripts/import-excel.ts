/**
 * Excel Import Script
 * Imports data from MASTER_R05.xlsx and Book1.xlsx into the Prisma database.
 *
 * Strategy:
 *  - Use Book1.xlsx as primary source (already relational)
 *  - Enrich with MASTER_R05.xlsx for monthly progress and Persian dates
 *
 * Run: bun run ./scripts/import-excel.ts
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

const db = new PrismaClient({ log: ['error', 'warn'] });

// Use relative path so the script works on any machine / OS
const PROJECT_ROOT = path.resolve(__dirname, "..");
const UPLOAD_DIR = path.join(PROJECT_ROOT, "upload");
const MASTER_FILE = path.join(UPLOAD_DIR, "MASTER_R05.xlsx");
const BOOK1_FILE = path.join(UPLOAD_DIR, "Book1.xlsx");

// ---------- helpers ----------

function excelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return d;
  }
  if (typeof value === 'string') {
    // Try ISO
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    // Try Jalali-like "1404/10/30" - store as string only
    return null;
  }
  return null;
}

function num(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function str(value: any): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

// Convert "1.2.1.1.3.1" -> hierarchy path and level
function parseWbsCode(code: string): { level: number; parts: string[] } {
  const parts = code.split('.').filter(Boolean);
  return { level: parts.length, parts };
}

async function resetDb() {
  console.log('🧹 Cleaning database...');
  // Raw SQL delete to avoid casing issues and FK ordering
  const tables = [
    'WBSMonthlyProgress', 'WBSPersonel', 'WBSOrgChart',
    'RiskHistory', 'RiskAction', 'Risk',
    'KPIRecord', 'KPIAssignment', 'KPI',
    'AssetEvaluation', 'Asset',
    'RevenueBreakdown', 'BudgetAllocation', 'CostBreakdown',
    'Notification', 'NotificationTemplate', 'NotificationConfig',
    'ChartCache', 'ChartConfig',
    'DashboardAlert', 'DashboardConfig', 'DashboardWidget',
    'UserLog', 'User', 'Role', 'SystemConfig',
    'Personel', 'OrgChart', 'WBS',
  ];
  for (const tname of tables) {
    // @ts-ignore - Prisma accessor is lowercase first letter
    const accessor = tname.charAt(0).toLowerCase() + tname.slice(1);
    try {
      // @ts-ignore
      await (db as any)[accessor].deleteMany({});
    } catch (e) {
      console.warn(`  ⚠️  Could not clean ${tname}:`, (e as Error).message);
    }
  }
  console.log('✓ Database cleaned');
}

// ---------- Import MASTER_R05.xlsx ----------

async function importMasterWBS() {
  console.log('\n📊 Importing MASTER_R05.xlsx - WBS sheet (hierarchical)...');
  const wb = XLSX.readFile(MASTER_FILE);
  const sheet = wb.Sheets['WBS'];
  if (!sheet) {
    console.warn('  ⚠️  WBS sheet not found, skipping');
    return;
  }
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 2) return;

  const header = rows[0] as any[];
  // Find column indexes
  const colIdx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) colIdx[String(h).trim()] = i;
  });

  const wbsCol = colIdx['WBS'] ?? 0;
  const taskCol = colIdx['Task Name'] ?? 1;
  const durCol = colIdx['Duration'] ?? 2;
  const pctCompCol = colIdx['% Complete'] ?? 3;
  const pctPlanCol = colIdx['%Plan'] ?? 4;
  const startCol = colIdx['Start'] ?? 5;
  const finishCol = colIdx['Finish'] ?? 6;
  const hrPlanCol = colIdx['HR (Plan)'];
  const hrActualCol = colIdx['HR (Actual)'];
  const dayCompCol = colIdx['day_complete'];
  const acCol = colIdx['AC (Actual Cost)'];
  const cvCol = colIdx['Cost Variance'];
  const svCol = colIdx['Schedule Variance'];

  // Collect monthly columns (date headers like "2026-01-20" or Excel date serials)
  const monthlyCols: { idx: number; date: Date }[] = [];
  header.forEach((h, i) => {
    if (!h) return;
    // Try as string ISO date
    if (typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h)) {
      const d = new Date(h);
      if (!isNaN(d.getTime())) monthlyCols.push({ idx: i, date: d });
      return;
    }
    // Try as Excel serial date (number)
    if (typeof h === 'number' && h > 40000 && h < 60000) {
      const d = excelDate(h);
      if (d) monthlyCols.push({ idx: i, date: d });
      return;
    }
    // Try as Date object
    if (h instanceof Date && !isNaN(h.getTime())) {
      monthlyCols.push({ idx: i, date: h });
    }
  });
  console.log(`  Found ${monthlyCols.length} monthly columns`);

  // Build a map of WBS code -> row for parent lookup
  const wbsByCode: Record<string, any> = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = str(row[wbsCol]);
    if (!code) continue;
    wbsByCode[code] = row;
  }

  // First pass: create all WBS records (without parent)
  const wbsRecordMap: Record<string, any> = {};
  const allCodes = Object.keys(wbsByCode);
  console.log(`  Total WBS rows: ${allCodes.length}`);

  // Sort by code so parents come before children
  allCodes.sort((a, b) => {
    const ap = a.split('.').map((x) => parseInt(x) || 0);
    const bp = b.split('.').map((x) => parseInt(x) || 0);
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
      const av = ap[i] || 0;
      const bv = bp[i] || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });

  let idx = 0;
  for (const code of allCodes) {
    idx++;
    const row = wbsByCode[code];
    const { level, parts } = parseWbsCode(code);

    // Find parent code (drop last segment)
    let parentCode: string | null = null;
    if (parts.length > 1) {
      parentCode = parts.slice(0, -1).join('.');
    }

    const title = str(row[taskCol]) || code;
    const duration = num(row[durCol]) ?? 0;
    const progressActual = num(row[pctCompCol]) ?? 0;
    const progressPlan = num(row[pctPlanCol]) ?? 0;
    const startDate = excelDate(row[startCol]);
    const finishDate = excelDate(row[finishCol]);
    const hrPlan = str(row[hrPlanCol]);
    const hrActual = str(row[hrActualCol]);
    const dayComplete = num(row[dayCompCol]);
    const actualCost = num(row[acCol]);
    const costVariance = num(row[cvCol]);
    const scheduleVariance = num(row[svCol]);

    const parentId = parentCode && wbsRecordMap[parentCode] ? wbsRecordMap[parentCode].id : null;

    const rec = await db.wBS.create({
      data: {
        wbsCode: code,
        title,
        level,
        hierarchyPath: parts.join('/'),
        durationDays: duration,
        progressPlan,
        progressActual,
        startDate,
        finishDate,
        hrPlan,
        hrActual,
        dayComplete,
        actualCost,
        costVariance,
        scheduleVariance,
        parentId,
      },
    });
    wbsRecordMap[code] = rec;

    // Save monthly progress
    const monthlyData: any[] = [];
    for (const mc of monthlyCols) {
      const val = num(row[mc.idx]);
      if (val !== null) {
        monthlyData.push({
          wbsId: rec.id,
          monthDate: mc.date,
          plannedPct: val,
        });
      }
    }
    if (monthlyData.length > 0) {
      for (const md of monthlyData) {
        try {
          await db.wBSMonthlyProgress.create({ data: md });
        } catch (e) {
          // ignore duplicate
        }
      }
    }

    if (idx % 100 === 0) console.log(`  Imported ${idx}/${allCodes.length}`);
  }

  console.log(`  ✓ Imported ${allCodes.length} WBS records with monthly progress`);
}

// ---------- Import Org_Chart sheet from MASTER ----------

async function importMasterOrgChart() {
  console.log('\n📊 Importing MASTER_R05.xlsx - Org_Chart sheet...');
  const wb = XLSX.readFile(MASTER_FILE);
  const sheet = wb.Sheets['Org_Chart'];
  if (!sheet) return;
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 4) return;

  // Header is at row 3 (index 2)
  const header = rows[2] as any[];
  const colIdx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) colIdx[String(h).trim()] = i;
  });

  const codeCol = colIdx['کد پرسنلی'] ?? 0;
  const wbsCol = colIdx['کد WBS مرتبط'];
  const titleCol = colIdx['عنوان سازمانی'] ?? 2;
  const levelCol = colIdx['سطح'] ?? 3;
  const monthlyPlanCol = colIdx['حقوق ماهانه (میلیون تومان)'];
  const annualPlanCol = colIdx['حقوق سالانه (میلیون تومان)'];
  // Note: there are duplicate headers - need to find the second one (actual)
  const monthlyActualCol = header.findIndex((h, i) => h === 'حقوق ماهانه (میلیون تومان)' && i > (monthlyPlanCol ?? -1));
  const annualActualCol = header.findIndex((h, i) => h === 'حقوق سالانه (میلیون تومان)' && i > (annualPlanCol ?? -1));
  const notesCol = colIdx['توضیحات'];
  const dailyCol = colIdx['روزانه'];
  const neededCol = colIdx['مورد نیاز فعالیت ها'];
  const plannedAmtCol = colIdx['مبلغ برنامه'];

  let count = 0;
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    const code = str(row[codeCol]);
    if (!code) continue;
    const title = str(row[titleCol]) || `Position ${code}`;
    const level = str(row[levelCol]) || 'عملیاتی';

    // Create Personel record from org chart
    const monthlySalary = num(row[monthlyPlanCol]);
    const annualSalary = num(row[annualPlanCol]);
    const monthlySalaryActual = num(row[monthlyActualCol >= 0 ? monthlyActualCol : -1]);
    const annualSalaryActual = num(row[annualActualCol >= 0 ? annualActualCol : -1]);
    const dailyRate = num(row[dailyCol]);
    const name = str(row[notesCol]) || title;

    // First create or find OrgChart
    const orgChart = await db.orgChart.create({
      data: {
        orgId: code,
        position: title,
        level,
        costBreakdownCode: str(row[wbsCol]) ?? undefined,
      },
    });

    // Then create Personel
    const personel = await db.personel.create({
      data: {
        personelId: code,
        name,
        orgChartId: orgChart.id,
        monthlySalary,
        annualSalary,
        monthlySalaryActual,
        annualSalaryActual,
        dailyRate,
        role: 'user',
        notes: title,
      },
    });

    // Link OrgChart.personResponsible
    await db.orgChart.update({
      where: { id: orgChart.id },
      data: { personResponsibleId: personel.id },
    });

    count++;
  }
  console.log(`  ✓ Imported ${count} org chart + personnel records`);
}

// ---------- Import Cost_Breakdown sheet from MASTER ----------

async function importMasterCostBreakdown() {
  console.log('\n📊 Importing MASTER_R05.xlsx - Cost_Breakdown sheet...');
  const wb = XLSX.readFile(MASTER_FILE);
  const sheet = wb.Sheets['Cost_Breakdown'];
  if (!sheet) return;
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 4) return;

  const header = rows[2] as any[];
  const colIdx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) colIdx[String(h).trim()] = i;
  });

  const rowNoCol = colIdx['ردیف هزینه'] ?? 0;
  const codeCol = colIdx['کد هزینه'] ?? 1;
  const typeCol = colIdx['نوع بودجه'] ?? 2;
  const catCol = colIdx['دسته‌بندی هزینه'] ?? 3;
  const descCol = colIdx['شرح هزینه'] ?? 4;
  const themeCol = colIdx['موضوع هزینه'] ?? 5;
  const initCol = colIdx['پیش‌بینی اولیه ۱۴۰۵'] ?? 6;
  // "پیش‌بینی برنامه ای ۱۴۰5" with mixed digits
  const planCol = header.findIndex((h) => h && String(h).includes('پیش‌بینی برنامه'));
  const pctCol = colIdx['درصد از کل'] ?? 8;
  const notesCol = colIdx['توضیحات'];

  let count = 0;
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    const code = str(row[codeCol]);
    if (!code) continue;
    try {
      await db.costBreakdown.create({
        data: {
          costId: code,
          rowNumber: str(row[rowNoCol]),
          budgetType: str(row[typeCol]),
          category: str(row[catCol]),
          description: str(row[descCol]),
          theme: str(row[themeCol]),
          initialForecast: num(row[initCol]),
          programForecast: num(row[planCol >= 0 ? planCol : -1]),
          percentTotal: num(row[pctCol]),
          notes: str(row[notesCol]),
        },
      });
      count++;
    } catch (e) {
      // skip duplicates
    }
  }
  console.log(`  ✓ Imported ${count} cost breakdown records`);
}

// ---------- Import Revenue_Breakdown sheet from MASTER ----------

async function importMasterRevenueBreakdown() {
  console.log('\n📊 Importing MASTER_R05.xlsx - Revenue_Breakdown sheet...');
  const wb = XLSX.readFile(MASTER_FILE);
  const sheet = wb.Sheets['Revenue_Breakdown'];
  if (!sheet) return;
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 4) return;

  const header = rows[2] as any[];
  const colIdx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) colIdx[String(h).trim()] = i;
  });

  const rowNoCol = colIdx['ردیف درآمد'] ?? 0;
  const codeCol = colIdx['کد درآمد'] ?? 1;
  const themeCol = colIdx['موضوع درآمد'] ?? 2;
  const descCol = colIdx['شرح درآمد'] ?? 3;
  const wbsCol = colIdx['کد WBS مرتبط'] ?? 4;
  const titleCol = colIdx['عنوان درآمد'] ?? 5;
  const initCol = colIdx['پیش‌بینی اولیه ۱۴۰۵'] ?? 6;
  const planCol = colIdx['پیش‌بینی برنامه ۱۴۰۵'] ?? 7;
  const shareCol = colIdx['سهم مالکانه'] ?? 8;
  const pctCol = colIdx['درصد از کل'] ?? 9;
  const typeCol = colIdx['نوع درآمد'] ?? 10;
  const statusCol = colIdx['وضعیت/توضیحات'] ?? 11;
  const progressCol = colIdx['درصد پیشرفت'] ?? 12;
  const actualCol = colIdx['درآمد واقعی تا کنون'] ?? 13;
  const evCol = colIdx['EV (میلیون تومان)'] ?? 14;
  const trlCol = colIdx['TRL LVL'] ?? 15;

  // Cache WBS lookup
  const wbsByCode: Record<string, any> = {};
  const allWbs = await db.wBS.findMany({ select: { id: true, wbsCode: true } });
  allWbs.forEach((w) => (wbsByCode[w.wbsCode] = w));

  let count = 0;
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    const code = str(row[codeCol]);
    if (!code) continue;
    const wbsCode = str(row[wbsCol]);
    const wbsId = wbsCode && wbsByCode[wbsCode] ? wbsByCode[wbsCode].id : null;

    try {
      await db.revenueBreakdown.create({
        data: {
          revenueId: code,
          rowNumber: str(row[rowNoCol]),
          theme: str(row[themeCol]),
          description: str(row[descCol]),
          title: str(row[titleCol]),
          wbsCode,
          wbsId,
          initialForecast: num(row[initCol]),
          programForecast: num(row[planCol]),
          ownershipShare: num(row[shareCol]),
          percentTotal: num(row[pctCol]),
          revenueType: str(row[typeCol]),
          status: str(row[statusCol]),
          progressPct: num(row[progressCol]),
          actualRevenue: num(row[actualCol]),
          ev: num(row[evCol]),
          trlLevel: num(row[trlCol]) !== null ? Math.round(num(row[trlCol])!) : null,
        },
      });
      count++;
    } catch (e) {
      // skip duplicates
    }
  }
  console.log(`  ✓ Imported ${count} revenue breakdown records`);
}

// ---------- Import Book1.xlsx (extra relational data) ----------

async function importBook1() {
  console.log('\n📊 Importing Book1.xlsx...');
  const wb = XLSX.readFile(BOOK1_FILE);

  // Sheet: assets
  const assetsSheet = wb.Sheets['assets'];
  if (assetsSheet) {
    const rows: any[] = XLSX.utils.sheet_to_json(assetsSheet, { defval: null, raw: true });
    console.log(`  Assets sheet: ${rows.length} rows`);
    for (const row of rows) {
      const assetId = str(row.asset_id) || row['asset_id'];
      if (!assetId) continue;
      const title = str(row.asset) || `Asset ${assetId}`;
      const wbsCode = str(row['wbs(strategytopic)']);
      const wbs = wbsCode ? await db.wBS.findUnique({ where: { wbsCode } }) : null;
      await db.asset.create({
        data: {
          assetId,
          title,
          description: title,
          assetType: str(row.type),
          wbsId: wbs?.id,
        },
      }).catch(() => { /* skip duplicates */ });
    }
    console.log('  ✓ Assets imported');
  }

  // Sheet: KPI seed (we'll create a few default KPIs if not present)
  const existingKpis = await db.kPI.count();
  if (existingKpis === 0) {
    console.log('  Creating default KPIs...');
    const defaultKpis = [
      { code: 'KPI-001', title: 'پیشرفت برنامه‌ای', category: 'پیشرفت', weight: 30, unit: 'درصد' },
      { code: 'KPI-002', title: 'پیشرفت واقعی', category: 'پیشرفت', weight: 30, unit: 'درصد' },
      { code: 'KPI-003', title: 'هزینه واقعی در برابر برنامه', category: 'مالی', weight: 20, unit: 'میلیون تومان' },
      { code: 'KPI-004', title: 'مدیریت ریسک', category: 'ریسک', weight: 10, unit: 'عدد' },
      { code: 'KPI-005', title: 'بهره‌وری منابع انسانی', category: 'منابع انسانی', weight: 10, unit: 'درصد' },
    ];
    for (const k of defaultKpis) {
      await db.kPI.create({ data: k });
    }
    console.log('  ✓ Default KPIs created');
  }
}

// ---------- Seed Roles, Admin User, System Configs ----------

async function seedAdminData() {
  console.log('\n🔐 Seeding roles, admin user, and system configs...');

  // Roles
  const adminRole = await db.role.create({
    data: {
      name: 'admin',
      description: 'مدیر سیستم با دسترسی کامل',
      permissions: JSON.stringify(['*']),
      isSystem: true,
    },
  });
  const userRole = await db.role.create({
    data: {
      name: 'user',
      description: 'کاربر عادی با دسترسی مشاهده',
      permissions: JSON.stringify(['read:*']),
      isSystem: true,
    },
  });
  const modRole = await db.role.create({
    data: {
      name: 'moderator',
      description: 'ناظر با دسترسی ویرایش',
      permissions: JSON.stringify(['read:*', 'write:*']),
      isSystem: true,
    },
  });
  console.log('  ✓ Roles created');

  // Admin user
  // Find any personel to link
  const anyPersonel = await db.personel.findFirst();
  const bcrypt = await import('bcryptjs');
  const passwordHash = bcrypt.hashSync('admin123', 10);
  await db.user.create({
    data: {
      username: 'admin',
      email: 'admin@kharazmi.ir',
      passwordHash,
      roleId: adminRole.id,
      personelId: anyPersonel?.id,
      isActive: true,
    },
  });
  console.log('  ✓ Admin user created (username: admin, password: admin123)');

  // System configs
  const configs = [
    { key: 'company.name', value: 'شرکت خوارزمی بندر امام', description: 'نام شرکت', category: 'general' },
    { key: 'company.code', value: 'KBI', description: 'کد شرکت', category: 'general' },
    { key: 'fiscal.year', value: '1405', description: 'سال مالی جاری', category: 'financial' },
    { key: 'currency.unit', value: 'میلیون تومان', description: 'واحد پول', category: 'financial' },
    { key: 'date.format', value: 'jalali', description: 'فرمت تاریخ (jalali/gregorian)', category: 'general' },
  ];
  for (const c of configs) {
    await db.systemConfig.create({ data: c });
  }
  console.log('  ✓ System configs created');

  // Notification templates
  const templates = [
    { code: 'NTF-001', title: 'اعلان ریسک جدید', category: 'risk', bodyTemplate: 'ریسک جدید «{{title}}» با شدت {{severity}} ثبت شد.', subjectTemplate: 'ریسک جدید: {{title}}' },
    { code: 'NTF-002', title: 'یادآوری KPI', category: 'kpi', bodyTemplate: 'یادآوری: KPI «{{title}}» برای {{person}}', subjectTemplate: 'یادآوری KPI' },
    { code: 'NTF-003', title: 'تغییر وضعیت WBS', category: 'wbs', bodyTemplate: 'وضعیت فعالیت {{title}} به {{status}} تغییر کرد.', subjectTemplate: 'تغییر وضعیت WBS' },
    { code: 'NTF-004', title: 'هشدار هزینه', category: 'financial', bodyTemplate: 'هزینه واقعی فعالیت {{title}} از برنامه فراتر رفته است.', subjectTemplate: 'هشدار هزینه' },
  ];
  for (const t of templates) {
    await db.notificationTemplate.create({ data: t });
  }
  console.log('  ✓ Notification templates created');

  // Chart configs
  const charts = [
    { code: 'CHART-001', title: 'منحنی S پروژه', chartType: 's_curve', dataSource: 'wbs', description: 'پیشرفت برنامه‌ای و واقعی بر اساس زمان' },
    { code: 'CHART-002', title: 'نمودار هزینه و درآمد', chartType: 'bar', dataSource: 'financial', description: 'مقایسه هزینه و درآمد' },
    { code: 'CHART-003', title: 'نقشه حرارتی ریسک', chartType: 'heatmap', dataSource: 'risk', description: 'احتمال در برابر تاثیر ریسک‌ها' },
    { code: 'CHART-004', title: 'عملکرد پرسنل', chartType: 'bar', dataSource: 'kpi', description: 'عملکرد پرسنل بر اساس KPI' },
  ];
  for (const c of charts) {
    await db.chartConfig.create({ data: c });
  }
  console.log('  ✓ Chart configs created');

  // Dashboard widgets
  const widgets = [
    { code: 'W-001', title: 'پیشرفت کلی پروژه', widgetType: 'stat', dataSource: 'wbs', config: '{"type":"overall_progress"}' },
    { code: 'W-002', title: 'تعداد ریسک‌های باز', widgetType: 'stat', dataSource: 'risk', config: '{"type":"open_risks"}' },
    { code: 'W-003', title: 'هزینه کل', widgetType: 'stat', dataSource: 'financial', config: '{"type":"total_cost"}' },
    { code: 'W-004', title: 'درآمد کل', widgetType: 'stat', dataSource: 'financial', config: '{"type":"total_revenue"}' },
    { code: 'W-005', title: 'منحنی S', widgetType: 'chart', dataSource: 'wbs', config: '{"chartCode":"CHART-001"}' },
    { code: 'W-006', title: 'آخرین اعلان‌ها', widgetType: 'table', dataSource: 'notification', config: '{"limit":5}' },
    { code: 'W-007', title: 'هشدارهای داشبورد', widgetType: 'alert', dataSource: 'system', config: '{}' },
    { code: 'W-008', title: 'تعداد پرسنل', widgetType: 'stat', dataSource: 'hr', config: '{"type":"personel_count"}' },
  ];
  for (const w of widgets) {
    await db.dashboardWidget.create({ data: w });
  }
  console.log('  ✓ Dashboard widgets created');
}

// ---------- Main ----------

async function main() {
  console.log('🚀 Starting Excel import...');
  await resetDb();

  await importMasterWBS();
  await importMasterOrgChart();
  await importMasterCostBreakdown();
  await importMasterRevenueBreakdown();
  await importBook1();
  await seedAdminData();

  // Print summary
  const counts = {
    WBS: await db.wBS.count(),
    WBSMonthlyProgress: await db.wBSMonthlyProgress.count(),
    Personel: await db.personel.count(),
    OrgChart: await db.orgChart.count(),
    CostBreakdown: await db.costBreakdown.count(),
    RevenueBreakdown: await db.revenueBreakdown.count(),
    Asset: await db.asset.count(),
    KPI: await db.kPI.count(),
    Risk: await db.risk.count(),
    Role: await db.role.count(),
    User: await db.user.count(),
    SystemConfig: await db.systemConfig.count(),
    NotificationTemplate: await db.notificationTemplate.count(),
    ChartConfig: await db.chartConfig.count(),
    DashboardWidget: await db.dashboardWidget.count(),
  };
  console.log('\n📈 Import Summary:');
  console.table(counts);
  console.log('✅ Import complete!');
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
