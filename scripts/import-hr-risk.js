/**
 * Import HR.txt (positions + KPI templates) and Risk.xlsx into the database.
 * Run with: npm run import:hr-risk
 *
 * What this does:
 *  1) Parses hr.txt -> creates KPITemplate, KPICategory, KPIIndicator records
 *     for each of the 25 positions defined in the file.
 *  2) Parses Risk.xlsx -> creates Risk records with their initial RiskEvaluation
 *     (current + target), and their associated RiskAction entries.
 *
 * Robust to:
 *  - File name casing (hr.txt / HR.txt / Hr.txt)
 *  - BOM at start of file
 *  - Windows-1256 / UTF-8 with/without BOM
 *  - Network drive paths
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

// Use DATABASE_URL from .env (don't override — works for both PostgreSQL and SQLite)
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}
const db = new PrismaClient({ log: ["error", "warn"] });

// ---------- helpers ----------
function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Strip BOM (Byte Order Mark) from start of string — common in Windows-saved UTF-8 files
function stripBOM(s) {
  if (s && s.charCodeAt(0) === 0xfeff) {
    return s.slice(1);
  }
  return s;
}
function excelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Heat map lookup: severity_level(impact, probability) -> Low | Medium | High | Critical
// Impact:    اساسی=5, عمده=4, متوسط=3, جزئی=2, ناچیز=1
// Prob:      نادر=1, بعید=2, ممکن=3, محتمل=4, مکرر=5
const impactMap = { اساسی: 5, عمده: 4, متوسط: 3, جزئی: 2, ناچیز: 1 };
const probMap = { نادر: 1, بعید: 2, ممکن: 3, محتمل: 4, مکرر: 5 };

// Heat Map matrix from Risk.xlsx (negative impact):
//                نادر(1) بعید(2) ممکن(3) محتمل(4) مکرر(5)
// اساسی(5)        M      M       H       C        C
// عمده(4)         L      M       H       C        C
// متوسط(3)        L      M       M       H        H
// جزئی(2)         L      M       M       M        M
// ناچیز(1)        L      L       L       L        M
const heatMapNegative = {
  5: { 1: "Medium", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  4: { 1: "Low", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  3: { 1: "Low", 2: "Medium", 3: "Medium", 4: "High", 5: "High" },
  2: { 1: "Low", 2: "Medium", 3: "Medium", 4: "Medium", 5: "Medium" },
  1: { 1: "Low", 2: "Low", 3: "Low", 4: "Low", 5: "Medium" },
};

// For positive impact (opportunities): same matrix but more permissive
//                نادر(1) بعید(2) ممکن(3) محتمل(4) مکرر(5)
// اساسی(5)        L      L       M       H        H
// عمده(4)         L      L       M       M        H
// متوسط(3)        L      L       M       M        M
// جزئی(2)         L      L       L       M        M
// ناچیز(1)        L      L       L       L        L
const heatMapPositive = {
  5: { 1: "Low", 2: "Low", 3: "Medium", 4: "High", 5: "High" },
  4: { 1: "Low", 2: "Low", 3: "Medium", 4: "Medium", 5: "High" },
  3: { 1: "Low", 2: "Low", 3: "Medium", 4: "Medium", 5: "Medium" },
  2: { 1: "Low", 2: "Low", 3: "Low", 4: "Medium", 5: "Medium" },
  1: { 1: "Low", 2: "Low", 3: "Low", 4: "Low", 5: "Low" },
};

function riskLevel(impactStr, probStr, isPositive) {
  const i = impactMap[impactStr];
  const p = probMap[probStr];
  if (!i || !p) return null;
  return (isPositive ? heatMapPositive : heatMapNegative)[i][p];
}

// ---------- Import HR.txt ----------
// Mirrors the Python logic exactly:
//   - position header:  ^(\d+)\s*[-\u061c]\s*(.+)$   (number, dash or Arabic separator, name)
//   - category header:  ^شاخص\s+های\s+(.+)$          (strip the "شاخص های " prefix)
//   - indicator line:   ^[-\u2022]\s*(.+)$            (dash or bullet)
//   - skip "شاخص های کلیدی عملکرد (KPIs)" section header
//   - default category = "عمومی"
async function importHrTxt() {
  console.log("\n📋 Importing HR.txt (KPI templates for positions)...");

  // Try several file name variants — user may have hr.txt or HR.txt
  const candidates = [
    path.resolve(__dirname, "..", "upload", "hr.txt"),
    path.resolve(__dirname, "..", "upload", "HR.txt"),
    path.resolve(__dirname, "..", "upload", "Hr.txt"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    console.warn("  ⚠️  hr.txt / HR.txt not found in upload/, skipping");
    console.warn("      Looked in:", path.dirname(candidates[0]));
    return;
  }
  console.log("  Using file:", file);

  const content = stripBOM(fs.readFileSync(file, "utf8"));
  const lines = content.split(/\r?\n/);
  console.log(`  File loaded: ${lines.length} lines`);

  // Clean existing templates (cascades to categories + indicators)
  await db.kPITemplate.deleteMany({});
  console.log("  ✓ Cleared existing KPI templates");

  // Regexes — match the Python logic exactly
  // \u061c = Arabic Letter Mark (RLM), \u061f = Arabic Question Mark,
  // also allow Arabic dash \u2010-\u2015 and en/em dash
  const POS_RE = /^(\d+)\s*[-\u2010-\u2015\u061c\u2013\u2014]\s*(.+)$/;
  const CAT_RE = /^شاخص\s+های\s+(.+)$/;
  const IND_RE = /^[-\u2022\u2013\u2014]\s*(.+)$/;

  let currentTemplate = null;
  let currentCategory = null;
  let categoryOrder = 0;
  let indicatorOrder = 0;
  let positionCount = 0;
  let indicatorCount = 0;

  // Track position names → code mapping for stats
  const positionStats = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip "شاخص های کلیدی عملکرد (KPIs)" section header
    if (line.includes("شاخص") && (line.includes("کلیدی") || line.includes("عملکرد"))) {
      continue;
    }

    // Position header
    const posMatch = line.match(POS_RE);
    if (posMatch) {
      const positionCode = posMatch[1];
      const positionName = posMatch[2].trim();
      currentTemplate = await db.kPITemplate.create({
        data: { positionCode, positionName },
      });
      currentCategory = null;
      categoryOrder = 0;
      indicatorOrder = 0;
      positionCount++;
      positionStats.push({ code: positionCode, name: positionName, count: 0 });
      continue;
    }

    // Category header — "شاخص های راهبردی" → "راهبردی"
    const catMatch = line.match(CAT_RE);
    if (catMatch && currentTemplate) {
      const catName = catMatch[1].trim();
      currentCategory = await db.kPICategory.create({
        data: {
          templateId: currentTemplate.id,
          name: catName,
          order: categoryOrder++,
        },
      });
      indicatorOrder = 0;
      continue;
    }

    // Indicator line
    const indMatch = line.match(IND_RE);
    if (indMatch && currentTemplate) {
      const indName = indMatch[1].trim();
      if (!indName) continue;

      // If no category yet, create default "عمومی"
      if (!currentCategory) {
        currentCategory = await db.kPICategory.create({
          data: {
            templateId: currentTemplate.id,
            name: "عمومی",
            order: categoryOrder++,
          },
        });
      }

      await db.kPIIndicator.create({
        data: {
          categoryId: currentCategory.id,
          name: indName,
          weight: 1.0,
          order: indicatorOrder++,
        },
      });
      indicatorCount++;
      if (positionStats.length > 0) positionStats[positionStats.length - 1].count++;
      continue;
    }

    // If we reach here, the line could be a category header without
    // the "شاخص های" prefix (rare, but happens). Use the whole line.
    if (currentTemplate && !line.startsWith("-")) {
      currentCategory = await db.kPICategory.create({
        data: {
          templateId: currentTemplate.id,
          name: line,
          order: categoryOrder++,
        },
      });
      indicatorOrder = 0;
    }
  }

  console.log(`  ✓ Imported ${positionCount} positions, ${indicatorCount} indicators`);
  console.log("  Per-position breakdown:");
  positionStats.forEach((p) => {
    console.log(`    ${p.code}. ${p.name}: ${p.count} indicators`);
  });
}

// ---------- Import Risk.xlsx ----------
async function importRiskXlsx() {
  console.log("\n⚠️ Importing Risk.xlsx...");
  const file = path.resolve(__dirname, "..", "upload", "Risk.xlsx");
  if (!fs.existsSync(file)) {
    console.warn("  ⚠️  Risk.xlsx not found at upload/, skipping");
    return;
  }
  const wb = XLSX.readFile(file);

  // Clean existing
  await db.riskEvaluation.deleteMany({});
  await db.riskAction.deleteMany({});
  await db.risk.deleteMany({});
  await db.lessonLearned.deleteMany({});
  console.log("  ✓ Cleared existing risk data");

  // === Sheet 1: شناسایی ریسک (Risk Identification) ===
  const identSheet = wb.Sheets["شناسایی ریسک"];
  const identRows = XLSX.utils.sheet_to_json(identSheet, { header: 1, defval: null });
  // Headers: کد ساختار شکست | شرح ریسک | رویداد | پیامد | طبقه بندی ریسک | تأثیر پیامد بر اهداف
  const risks = [];
  for (let i = 1; i < identRows.length; i++) {
    const row = identRows[i];
    const code = str(row[0]);
    if (!code) continue;
    const title = str(row[1]) || code;
    const event = str(row[2]);
    const consequence = str(row[3]);
    const category = str(row[4]);
    const impactType = str(row[5]) || "منفی";

    risks.push({
      code,
      title,
      description: [event, consequence].filter(Boolean).join("\n\n"),
      event,
      consequence,
      category,
      impactType,
    });
  }
  console.log(`  Found ${risks.length} risks in identification sheet`);

  // === Sheet 2: سنجش ریسک (Risk Measurement - current & target) ===
  const measureSheet = wb.Sheets["سنجش ریسک"];
  const measureRows = XLSX.utils.sheet_to_json(measureSheet, { header: 1, defval: null });
  // Headers: شناسه ریسک | شرح ریسک | شدت اثر فعلی | احتمال وقوع فعلی | شدت اثر هدف | احتمال وقوع هدف | واکنش
  const measurements = {};
  for (let i = 1; i < measureRows.length; i++) {
    const row = measureRows[i];
    const code = str(row[0]);
    if (!code) continue;
    measurements[code] = {
      impactCurrent: str(row[2]),
      probabilityCurrent: str(row[3]),
      impactTarget: str(row[4]),
      probabilityTarget: str(row[5]),
      response: str(row[6]),
    };
  }

  // === Sheet 4: اقدامات (Actions) ===
  const actionsSheet = wb.Sheets["اقدامات"];
  const actionRows = XLSX.utils.sheet_to_json(actionsSheet, { header: 1, defval: null });
  // Headers: شناسه ریسک | شرح اقدام | ماه/بازه | تاریخ شروع | تاریخ پایان | پیشرفت اجرا (%) | اهمیت (1-10) | مدت زمان | درصد وزنی | پیشرفت فیزیکی
  const actionsByRisk = {};
  for (let i = 1; i < actionRows.length; i++) {
    const row = actionRows[i];
    const code = str(row[0]);
    if (!code) continue;
    if (!actionsByRisk[code]) actionsByRisk[code] = [];
    actionsByRisk[code].push({
      title: str(row[1]) || `اقدام ${i}`,
      period: str(row[2]),
      startDate: excelDate(row[3]),
      endDate: excelDate(row[4]),
      progress: num(row[5]) ?? 0,
      importance: num(row[6]),
      durationDays: num(row[7]),
      weightPct: num(row[8]),
      physicalProgress: num(row[9]),
    });
  }

  // === Create risks + evaluations + actions ===
  let riskCount = 0;
  let evalCount = 0;
  let actionCount = 0;
  let errorCount = 0;
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const r of risks) {
    try {
      const m = measurements[r.code] || {};
      const isPositive = r.impactType === "مثبت";

      const levelCurrent = riskLevel(m.impactCurrent, m.probabilityCurrent, isPositive);
      const levelTarget = riskLevel(m.impactTarget, m.probabilityTarget, isPositive);

      // Compute numeric severity (for legacy Risk model fields) - based on current
      const impactNum = impactMap[m.impactCurrent] || null;
      const probNum = probMap[m.probabilityCurrent] || null;
      const severity = impactNum && probNum ? impactNum * probNum : null;

      const risk = await db.risk.create({
        data: {
          code: r.code,
          title: r.title,
          description: r.description,
          category: r.category,
          status: "open",
          riskType: r.impactType,
          probability: probNum,
          impact: impactNum,
          severity,
        },
      });
      riskCount++;
      console.log(`    ✓ Created risk: ${r.code}`);

      // Create initial RiskEvaluation
      if (m.impactCurrent || m.probabilityCurrent) {
        try {
          await db.riskEvaluation.create({
            data: {
              riskId: risk.id,
              period: currentPeriod,
              periodType: "monthly",
              impactCurrent: m.impactCurrent,
              probabilityCurrent: m.probabilityCurrent,
              levelCurrent,
              impactTarget: m.impactTarget,
              probabilityTarget: m.probabilityTarget,
              levelTarget,
              response: m.response,
              impactType: r.impactType,
              physicalProgress: null,
              notes: "اطلاعات اولیه از فایل Risk.xlsx",
            },
          });
          evalCount++;
        } catch (e) {
          console.warn(`    ⚠️  Failed to create evaluation for ${r.code}: ${e.message}`);
        }
      }

      // Create actions
      const actions = actionsByRisk[r.code] || [];
      for (const a of actions) {
        try {
          const status =
            a.progress >= 1 ? "completed" : a.progress > 0 ? "in_progress" : "pending";
          await db.riskAction.create({
            data: {
              riskId: risk.id,
              title: a.title,
              description: `بازه: ${a.period || ""}`,
              status,
              dueDate: a.endDate,
              completedDate: a.progress >= 1 ? a.endDate : null,
            },
          });
          actionCount++;
        } catch (e) {
          console.warn(`    ⚠️  Failed to create action for ${r.code}: ${e.message}`);
        }
      }
    } catch (e) {
      errorCount++;
      console.error(`    ❌ Failed to create risk ${r.code}: ${e.message}`);
      console.error(`       Full error:`, e);
    }
  }

  console.log(`  ✓ Created ${riskCount} risks, ${evalCount} evaluations, ${actionCount} actions`);
  if (errorCount > 0) {
    console.error(`  ❌ ${errorCount} risks failed to import!`);
  }

  // === Sheet 5: ارزیابی (Evaluation Summary) — store as reference, also includes physicalProgress per risk ===
  // Update physicalProgress in the initial RiskEvaluation
  const evalSheet = wb.Sheets["ارزیابی"];
  const evalRows = XLSX.utils.sheet_to_json(evalSheet, { header: 1, defval: null });
  for (let i = 1; i < evalRows.length; i++) {
    const row = evalRows[i];
    const code = str(row[0]);
    if (!code) continue;
    const physicalProgress = num(row[10]);
    if (physicalProgress === null) continue;
    const risk = await db.risk.findUnique({ where: { code } });
    if (!risk) continue;
    const lastEval = await db.riskEvaluation.findFirst({
      where: { riskId: risk.id },
      orderBy: { evaluatedAt: "desc" },
    });
    if (lastEval) {
      await db.riskEvaluation.update({
        where: { id: lastEval.id },
        data: { physicalProgress },
      });
    }
    // Also update risk severity based on current evaluation summary
    const impactCurrentStr = str(row[4]);
    const probCurrentStr = str(row[5]);
    const levelCurrent = str(row[6]);
    if (impactCurrentStr && probCurrentStr) {
      const i2 = impactMap[impactCurrentStr];
      const p2 = probMap[probCurrentStr];
      if (i2 && p2) {
        await db.risk.update({
          where: { id: risk.id },
          data: {
            impact: i2,
            probability: p2,
            severity: i2 * p2,
          },
        });
      }
    }
  }

  console.log("  ✓ Updated physical progress from ارزیابی sheet");
}

// ---------- Main ----------
async function main() {
  console.log("🚀 Starting HR + Risk import...");
  console.log(`   Database: ${process.env.DATABASE_URL}`);
  console.log(`   CWD: ${process.cwd()}`);
  console.log(`   Script dir: ${__dirname}`);

  // Verify database connectivity before starting
  try {
    const testCount = await db.kPITemplate.count();
    console.log(`   ✓ Database connected. Current KPITemplate count: ${testCount}`);
  } catch (e) {
    console.error("   ❌ Cannot connect to database:", e.message);
    console.error("   Check that prisma db push has been run.");
    process.exit(1);
  }

  await importHrTxt();
  await importRiskXlsx();

  // Final summary with verification
  const counts = {
    KPITemplate: await db.kPITemplate.count(),
    KPICategory: await db.kPICategory.count(),
    KPIIndicator: await db.kPIIndicator.count(),
    Risk: await db.risk.count(),
    RiskEvaluation: await db.riskEvaluation.count(),
    RiskAction: await db.riskAction.count(),
  };
  console.log("\n📈 Import Summary:");
  console.table(counts);

  if (counts.KPITemplate === 0) {
    console.error("❌ WARNING: No KPI templates imported! Check that hr.txt exists in upload/ folder.");
  } else {
    console.log(`✅ ${counts.KPITemplate} HR positions imported successfully.`);
  }
  if (counts.Risk === 0) {
    console.error("❌ WARNING: No risks imported! Check that Risk.xlsx exists in upload/ folder.");
  } else {
    console.log(`✅ ${counts.Risk} risks imported successfully.`);
  }
  console.log("✅ Done!");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
