import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// ============================================================
// Jalali → Gregorian conversion (inlined for server-side use)
// ============================================================

function jdnToGregorian(jdn: number): [number, number, number] {
  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l1 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l1 + 1)) / 1461001);
  const l2 = l1 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l2) / 2447);
  const day = l2 - Math.floor((2447 * j) / 80);
  const l3 = Math.floor(j / 11);
  const month = j + 2 - 12 * l3;
  const year = 100 * (n - 49) + i + l3;
  return [year, month, day];
}

function jalaliToJDN(jy: number, jm: number, jd: number): number {
  const epoch = 1948321;
  const epbase = jy - (jy >= 0 ? 474 : 473);
  const epyear = 474 + (((epbase % 2820) + 2820) % 2820);
  const md = jm <= 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6;
  return (
    jd +
    md +
    Math.floor(((epyear * 682) - 110) / 2816) +
    (epyear - 1) * 365 +
    Math.floor(epbase / 2820) * 1029983 +
    (epoch - 1)
  );
}

function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const jdn = jalaliToJDN(jy, jm, jd);
  const [y, m, d] = jdnToGregorian(jdn);
  return new Date(y, m - 1, d);
}

function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function parseJalaliToDate(s: any): Date | null {
  if (s === null || s === undefined) return null;
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return null;
    return s;
  }
  const str = String(s).trim();
  if (!str || str === "-" || str === "/") return null;
  const latin = toLatinDigits(str);
  let datePart = latin.split(" - ")[0].split(" ")[0];
  const parts = datePart.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);
  if (isNaN(jy) || isNaN(jm) || isNaN(jd)) return null;
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  try {
    return jalaliToGregorian(jy, jm, jd);
  } catch {
    return null;
  }
}

// Gregorian → Jalali formatter for storing startDateJalali/finishDateJalali
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy: number;
  if (gy > 1600) {
    jy = 979;
    gy -= 1600;
  } else {
    jy = 0;
    gy -= 621;
  }
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function toPersianDigits(s: string | number): string {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
}

function formatJalaliLocal(date: Date): string {
  if (!date || isNaN(date.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(String(jd).padStart(2, "0"))}`;
}

// GET: Download an empty template Excel file with the correct headers
// and data validation. Useful for the user to fill in and upload.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch reference data so the user knows valid codes
  const [orgCharts, personels] = await Promise.all([
    db.orgChart.findMany({ select: { orgId: true, position: true } }),
    db.personel.findMany({ select: { personelId: true, name: true } }),
  ]);

  // Build an empty worksheet with just headers (one example row, blank)
  const headerRow = {
    "کد WBS": "",
    "عنوان فعالیت": "",
    "سطح": "",
    "مدت زمان (روز)": "",
    "درصد پیشرفت برنامه (%)": "",
    "درصد پیشرفت واقعی (%)": "",
    "تاریخ شروع": "",
    "تاریخ پایان": "",
    "فوریت": "",
    "اولویت (1-5)": "",
    "سمت سازمانی مورد نیاز": "",
    "منابع انسانی برنامه": "",
    "منابع انسانی واقعی": "",
    "توضیحات": "",
  };

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([headerRow]);

  ws["!cols"] = [
    { wch: 15 }, // کد WBS
    { wch: 40 }, // عنوان فعالیت
    { wch: 8 },  // سطح
    { wch: 14 }, // مدت زمان (روز)
    { wch: 20 }, // درصد برنامه
    { wch: 20 }, // درصد واقعی
    { wch: 14 }, // تاریخ شروع
    { wch: 14 }, // تاریخ پایان
    { wch: 12 }, // فوریت
    { wch: 14 }, // اولویت (1-5)
    { wch: 25 }, // سمت سازمانی مورد نیاز
    { wch: 40 }, // منابع انسانی برنامه
    { wch: 40 }, // منابع انسانی واقعی
    { wch: 40 }, // توضیحات
  ];

  // Data validation on row 2 (the first data row)
  ws["!dataValidations"] = [
    {
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "7",
      sqref: "C2:C2",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "سطح نامعتبر",
      error: "سطح باید عدد صحیح بین ۱ تا ۷ باشد",
    },
    {
      type: "decimal",
      operator: "between",
      formula1: "0",
      formula2: "100",
      sqref: "E2:F2",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "مقدار نامعتبر",
      error: "درصد باید بین ۰ تا ۱۰۰ باشد",
    },
    {
      type: "list",
      formula1: '"low,normal,high,urgent"',
      sqref: "I2:I2",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "فوریت نامعتبر",
      error: "مقدار باید یکی از low, normal, high, urgent باشد",
    },
    {
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "5",
      sqref: "J2:J2",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "اولویت نامعتبر",
      error: "اولویت باید عدد صحیح بین ۱ تا ۵ باشد",
    },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "فعالیت‌های جدید");

  // Reference sheet
  const refRows: any[] = [];
  refRows.push({ "نوع": "=== سمت‌های سازمانی ===", "کد": "", "نام": "" });
  for (const o of orgCharts) {
    refRows.push({ "نوع": "سمت سازمانی", "کد": o.orgId, "نام": o.position });
  }
  refRows.push({ "نوع": "", "کد": "", "نام": "" });
  refRows.push({ "نوع": "=== پرسنل ===", "کد": "", "نام": "" });
  for (const p of personels) {
    refRows.push({ "نوع": "پرسنل", "کد": p.personelId, "نام": p.name });
  }

  const refWs = XLSX.utils.json_to_sheet(refRows);
  refWs["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, refWs, "راهنما (کدها)");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wbs-template-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

// POST: Accept Excel file with NEW WBS activities.
// Parse the file, create new WBS items (auto-detect parent/level from wbsCode).
// Existing wbsCodes are SKIPPED (use progress-import to update).
export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
    }
    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "فقط فایل‌های .xlsx پشتیبانی می‌شوند" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (rows.length === 0) {
      return NextResponse.json({ error: "فایل خالی است" }, { status: 400 });
    }

    // Fetch reference data
    const [orgCharts, personels, existingWbs] = await Promise.all([
      db.orgChart.findMany({ select: { id: true, orgId: true, position: true } }),
      db.personel.findMany({ select: { id: true, personelId: true, name: true, orgChartId: true } }),
      db.wBS.findMany({ select: { id: true, wbsCode: true, level: true, hierarchyPath: true } }),
    ]);

    const orgChartByLabel = new Map<string, string>();
    const orgChartByOrgId = new Map<string, string>();
    for (const o of orgCharts) {
      orgChartByLabel.set(`${o.orgId} - ${o.position}`, o.id);
      orgChartByLabel.set(`${o.orgId}-${o.position}`, o.id);
      orgChartByOrgId.set(o.orgId, o.id);
    }
    const personelByLabel = new Map<string, string>();
    const personelByCode = new Map<string, string>();
    for (const p of personels) {
      personelByLabel.set(`${p.personelId} - ${p.name}`, p.id);
      personelByLabel.set(`${p.personelId}-${p.name}`, p.id);
      personelByCode.set(p.personelId, p.id);
    }

    // Pre-populate codeToIdMap with existing WBS records (so children can find existing parents)
    const codeToIdMap = new Map<string, { id: string; level: number; hierarchyPath: string }>();
    for (const w of existingWbs) {
      codeToIdMap.set(w.wbsCode, { id: w.id, level: w.level, hierarchyPath: w.hierarchyPath });
    }

    function parseHrToIds(text: any, type: "org" | "person"): string[] {
      if (!text || String(text).trim() === "") return [];
      const parts = String(text).split("|").map((s) => s.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const part of parts) {
        const id = type === "org" ? orgChartByLabel.get(part) : personelByLabel.get(part);
        if (id) {
          ids.push(id);
          continue;
        }
        const codeMatch = part.split(/\s*-\s*/)[0]?.trim();
        if (codeMatch) {
          const fallbackId = type === "org" ? orgChartByOrgId.get(codeMatch) : personelByCode.get(codeMatch);
          if (fallbackId) ids.push(fallbackId);
        }
      }
      return [...new Set(ids)];
    }

    // Sort by wbsCode (numeric-aware) so parents come before children
    const sortedRows = [...rows].sort((a, b) => {
      const aCode = String(a["کد WBS"] || "").trim();
      const bCode = String(b["کد WBS"] || "").trim();
      const aParts = aCode.split(".").map((p) => parseInt(p) || 0);
      const bParts = bCode.split(".").map((p) => parseInt(p) || 0);
      const maxLen = Math.max(aParts.length, bParts.length);
      for (let i = 0; i < maxLen; i++) {
        const av = aParts[i] || 0;
        const bv = bParts[i] || 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      // Find original index for error messages (1-based, +1 for header)
      const originalIdx = rows.indexOf(row);
      const rowNumber = originalIdx >= 0 ? originalIdx + 2 : i + 2;

      const wbsCode = String(row["کد WBS"] || "").trim();
      const title = String(row["عنوان فعالیت"] || "").trim();
      const levelRaw = row["سطح"];
      const durationRaw = row["مدت زمان (روز)"];
      const planPctRaw = row["درصد پیشرفت برنامه (%)"];
      const actualPctRaw = row["درصد پیشرفت واقعی (%)"];
      const urgencyRaw = row["فوریت"];
      const priorityRaw = row["اولویت (1-5)"];
      const startDateRaw = row["تاریخ شروع"];
      const finishDateRaw = row["تاریخ پایان"];
      const requiredOrgPosText = row["سمت سازمانی مورد نیاز"];
      const hrPlanText = row["منابع انسانی برنامه"];
      const hrActualText = row["منابع انسانی واقعی"];
      const description = row["توضیحات"];

      if (!wbsCode) {
        errors.push(`ردیف ${rowNumber}: کد WBS خالی است — رد شد`);
        skipped++;
        continue;
      }
      if (!title) {
        errors.push(`ردیف ${rowNumber}: عنوان فعالیت خالی است (کد ${wbsCode}) — رد شد`);
        skipped++;
        continue;
      }

      // Skip existing wbsCodes (this endpoint is for creating NEW items only)
      if (codeToIdMap.has(wbsCode)) {
        errors.push(`ردیف ${rowNumber}: کد ${wbsCode} قبلاً وجود دارد — برای ویرایش از به‌روزرسانی پیشرفت استفاده کنید`);
        skipped++;
        continue;
      }

      // Validate percentages
      const planPct = planPctRaw === null || planPctRaw === undefined || planPctRaw === "" ? null : Number(planPctRaw);
      const actualPct = actualPctRaw === null || actualPctRaw === undefined || actualPctRaw === "" ? null : Number(actualPctRaw);
      if (planPct !== null && (isNaN(planPct) || planPct < 0 || planPct > 100)) {
        errors.push(`ردیف ${rowNumber}: درصد برنامه نامعتبر (${planPctRaw}) — رد شد`);
        skipped++;
        continue;
      }
      if (actualPct !== null && (isNaN(actualPct) || actualPct < 0 || actualPct > 100)) {
        errors.push(`ردیف ${rowNumber}: درصد واقعی نامعتبر (${actualPctRaw}) — رد شد`);
        skipped++;
        continue;
      }

      // Parse level (1-7) — auto-compute from wbsCode if missing/invalid
      const codeDepth = wbsCode.split(".").filter(Boolean).length;
      let level: number;
      if (levelRaw === null || levelRaw === undefined || levelRaw === "") {
        level = codeDepth;
      } else {
        const lv = Number(levelRaw);
        level = (!isNaN(lv) && lv >= 1 && lv <= 7) ? lv : codeDepth;
      }

      const durationDays = durationRaw === null || durationRaw === undefined || durationRaw === ""
        ? 0
        : (Number(durationRaw) || 0);

      const validUrgencies = ["low", "normal", "high", "urgent"];
      const urgencyRawStr = String(urgencyRaw ?? "").trim().toLowerCase();
      const urgency = validUrgencies.includes(urgencyRawStr) ? urgencyRawStr : "normal";

      let priority = 3;
      if (priorityRaw !== null && priorityRaw !== undefined && priorityRaw !== "") {
        const p = Number(priorityRaw);
        if (!isNaN(p) && p >= 1 && p <= 5) {
          priority = Math.round(p);
        }
      }

      const startDate = parseJalaliToDate(startDateRaw);
      const finishDate = parseJalaliToDate(finishDateRaw);

      let requiredOrgPositionId: string | null = null;
      if (requiredOrgPosText) {
        const text = String(requiredOrgPosText).trim();
        requiredOrgPositionId = orgChartByLabel.get(text) || null;
        if (!requiredOrgPositionId) {
          const codeMatch = text.split(/\s*-\s*/)[0]?.trim();
          if (codeMatch) {
            requiredOrgPositionId = orgChartByOrgId.get(codeMatch) || null;
          }
        }
      }

      const hrPlanIds = parseHrToIds(hrPlanText, "org");
      const hrActualIds = parseHrToIds(hrActualText, "person");

      // Auto-link hrPlan → hrActual
      if (hrPlanIds.length > 0) {
        const personnelInPositions = personels
          .filter((p) => p.orgChartId && hrPlanIds.includes(p.orgChartId))
          .map((p) => p.id);
        const merged = [...new Set([...hrActualIds, ...personnelInPositions])];
        hrActualIds.length = 0;
        hrActualIds.push(...merged);
      }

      const hrPlanJson = hrPlanIds.length > 0 ? JSON.stringify(hrPlanIds) : null;
      const hrActualJson = hrActualIds.length > 0 ? JSON.stringify(hrActualIds) : null;

      // Detect parent from wbsCode
      const codeParts = wbsCode.split(".").filter(Boolean);
      let parentId: string | null = null;
      let parentHierarchyPath = "";
      let parentLevel = 0;
      if (codeParts.length > 1) {
        const parentCode = codeParts.slice(0, -1).join(".");
        const parentFromMap = codeToIdMap.get(parentCode);
        if (parentFromMap) {
          parentId = parentFromMap.id;
          parentLevel = parentFromMap.level;
          parentHierarchyPath = parentFromMap.hierarchyPath;
        }
      }

      const hierarchyPath = parentId
        ? `${parentHierarchyPath}/${wbsCode}`
        : wbsCode.split(".").join("/");

      const finalLevel = parentId ? parentLevel + 1 : level;

      try {
        const newWbs = await db.wBS.create({
          data: {
            wbsCode,
            title,
            parentId,
            level: finalLevel,
            hierarchyPath,
            durationDays,
            progressPlan: planPct !== null ? planPct / 100 : 0,
            progressActual: actualPct !== null ? actualPct / 100 : 0,
            urgency,
            priority,
            startDate,
            finishDate,
            startDateJalali: startDate ? formatJalaliLocal(startDate) : null,
            finishDateJalali: finishDate ? formatJalaliLocal(finishDate) : null,
            hrPlan: hrPlanJson,
            hrActual: hrActualJson,
            requiredOrgPositionId,
            description: description ? String(description) : null,
          },
        });
        // Register the new item so any subsequent children in this batch can find it
        codeToIdMap.set(wbsCode, { id: newWbs.id, level: finalLevel, hierarchyPath });
        created++;
      } catch (e: any) {
        errors.push(`ردیف ${rowNumber} (کد ${wbsCode}): ${e.message}`);
        skipped++;
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.bulk_create",
        description: `افزودن دسته‌ای WBS از فایل ${file.name}: ${created} ایجاد، ${skipped} رد شده`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `ایجاد: ${created.toLocaleString("fa-IR")} | رد شده: ${skipped.toLocaleString("fa-IR")}`,
      created,
      skipped,
      errors: errors.slice(0, 30),
      totalRows: rows.length,
    });
  } catch (e: any) {
    console.error("[wbs.bulk_create] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
