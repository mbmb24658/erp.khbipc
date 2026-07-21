import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// ============================================================
// Jalali → Gregorian conversion (inlined for server-side use)
// ============================================================

// Convert Julian Day Number to Gregorian [y, m, d]
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

// Convert Jalali [jy, jm, jd] → Julian Day Number
function jalaliToJDN(jy: number, jm: number, jd: number): number {
  const epoch = 1948321; // JDN of 1 Farvardin 1 (Persian epoch)
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

// Convert Jalali [jy, jm, jd] → Gregorian Date (local midnight)
function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const jdn = jalaliToJDN(jy, jm, jd);
  const [y, m, d] = jdnToGregorian(jdn);
  return new Date(y, m - 1, d);
}

// Convert Persian/Arabic digits in a string to Latin digits
function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// Parse a Jalali date string ("YYYY/MM/DD" with Persian or Latin digits) to a Gregorian Date
function parseJalaliToDate(s: any): Date | null {
  if (s === null || s === undefined) return null;
  // If it's already a Date (from Excel), use it directly
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return null;
    return s;
  }
  const str = String(s).trim();
  if (!str || str === "-" || str === "/") return null;
  const latin = toLatinDigits(str);
  // Take the date part only (before " - " if datetime)
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

// POST: Import Excel file with ALL WBS fields, handling structural changes
// (create new codes, update existing, delete codes not present in the file).
// Available to ALL authenticated users (including 'user' role).
//
// Expected columns (Persian headers):
//   ID (hidden) | کد WBS | عنوان فعالیت | سطح | مدت زمان (روز) |
//   درصد پیشرفت برنامه (%) | درصد پیشرفت واقعی (%) |
//   تاریخ شروع | تاریخ پایان |
//   سمت سازمانی مورد نیاز | منابع انسانی برنامه | منابع انسانی واقعی | توضیحات
export async function POST(req: NextRequest) {
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

    // ----- Fetch reference data -----
    const orgCharts = await db.orgChart.findMany({ select: { id: true, orgId: true, position: true } });
    const personels = await db.personel.findMany({ select: { id: true, personelId: true, name: true, orgChartId: true } });

    // Build lookup maps for HR fields — match by "code - name" format (with or without spaces around dash)
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

    // Parse pipe-separated text to array of IDs
    function parseHrToIds(text: any, type: "org" | "person"): string[] {
      if (!text || String(text).trim() === "") return [];
      const parts = String(text).split("|").map((s) => s.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const part of parts) {
        // Try exact label match first
        const id = type === "org" ? orgChartByLabel.get(part) : personelByLabel.get(part);
        if (id) {
          ids.push(id);
          continue;
        }
        // Fallback: try matching just by code prefix (e.g. "ORG-1.1" or "P-001")
        const codeMatch = part.split(/\s*-\s*/)[0]?.trim();
        if (codeMatch) {
          const fallbackId = type === "org" ? orgChartByOrgId.get(codeMatch) : personelByCode.get(codeMatch);
          if (fallbackId) ids.push(fallbackId);
        }
      }
      // Dedupe
      return [...new Set(ids)];
    }

    // ----- Sort rows by wbsCode (numeric-aware) so parents come before children -----
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
    let updated = 0;
    let skipped = 0;
    let deleted = 0;
    const errors: string[] = [];
    const processedCodes = new Set<string>();
    // Map of wbsCode -> created/updated id (so children can find parent quickly)
    const codeToIdMap = new Map<string, string>();

    // Pre-populate codeToIdMap with existing DB records (by wbsCode)
    const allExisting = await db.wBS.findMany({ select: { id: true, wbsCode: true } });
    for (const w of allExisting) {
      codeToIdMap.set(w.wbsCode, w.id);
    }

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const rowNumber = rows.indexOf(row) + 2; // 1-based header + 1 for this row

      const id = String(row["ID"] || "").trim();
      const wbsCode = String(row["کد WBS"] || "").trim();
      const title = String(row["عنوان فعالیت"] || "").trim();
      const levelRaw = row["سطح"];
      const durationRaw = row["مدت زمان (روز)"];
      const planPctRaw = row["درصد پیشرفت برنامه (%)"];
      const actualPctRaw = row["درصد پیشرفت واقعی (%)"];
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

      // Parse duration
      const durationDays = durationRaw === null || durationRaw === undefined || durationRaw === ""
        ? 0
        : (Number(durationRaw) || 0);

      // Parse dates (Jalali → Gregorian)
      const startDate = parseJalaliToDate(startDateRaw);
      const finishDate = parseJalaliToDate(finishDateRaw);

      // Parse required org position
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

      // Parse HR fields
      const hrPlanIds = parseHrToIds(hrPlanText, "org");
      const hrActualIds = parseHrToIds(hrActualText, "person");

      // ----- Auto-link hrPlan → hrActual (Change 4 logic) -----
      if (hrPlanIds.length > 0) {
        const personnelInPositions = personels
          .filter((p) => p.orgChartId && hrPlanIds.includes(p.orgChartId))
          .map((p) => p.id);
        // Merge: keep existing actual + add auto-found personnel (no duplicates)
        const merged = [...new Set([...hrActualIds, ...personnelInPositions])];
        hrActualIds.length = 0;
        hrActualIds.push(...merged);
      }

      const hrPlanJson = hrPlanIds.length > 0 ? JSON.stringify(hrPlanIds) : null;
      const hrActualJson = hrActualIds.length > 0 ? JSON.stringify(hrActualIds) : null;

      // ----- Detect parent from wbsCode -----
      const codeParts = wbsCode.split(".").filter(Boolean);
      let parentId: string | null = null;
      let parentHierarchyPath = "";
      let parentLevel = 0;
      if (codeParts.length > 1) {
        const parentCode = codeParts.slice(0, -1).join(".");
        const parentIdFromMap = codeToIdMap.get(parentCode);
        if (parentIdFromMap) {
          // Fetch parent to get level + hierarchyPath
          const parent = await db.wBS.findUnique({
            where: { id: parentIdFromMap },
            select: { id: true, level: true, hierarchyPath: true },
          });
          if (parent) {
            parentId = parent.id;
            parentLevel = parent.level;
            parentHierarchyPath = parent.hierarchyPath;
          }
        }
      }

      // Compute hierarchyPath
      const hierarchyPath = parentId
        ? `${parentHierarchyPath}/${wbsCode}`
        : wbsCode.split(".").join("/");

      // Final level (parent level + 1 if parent exists)
      const finalLevel = parentId ? parentLevel + 1 : level;

      // ----- Find existing WBS by ID or wbsCode -----
      let existing: { id: string } | null = null;
      try {
        if (id) {
          existing = await db.wBS.findUnique({ where: { id }, select: { id: true } });
        }
        if (!existing) {
          existing = await db.wBS.findUnique({ where: { wbsCode }, select: { id: true } });
        }
      } catch {
        existing = null;
      }

      try {
        if (existing) {
          // UPDATE all fields
          await db.wBS.update({
            where: { id: existing.id },
            data: {
              wbsCode,
              title,
              parentId,
              level: finalLevel,
              hierarchyPath,
              durationDays,
              progressPlan: planPct !== null ? planPct / 100 : 0,
              progressActual: actualPct !== null ? actualPct / 100 : 0,
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
          updated++;
          codeToIdMap.set(wbsCode, existing.id);
          processedCodes.add(wbsCode);
        } else {
          // CREATE new WBS
          const created_wbs = await db.wBS.create({
            data: {
              wbsCode,
              title,
              parentId,
              level: finalLevel,
              hierarchyPath,
              durationDays,
              progressPlan: planPct !== null ? planPct / 100 : 0,
              progressActual: actualPct !== null ? actualPct / 100 : 0,
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
          created++;
          codeToIdMap.set(wbsCode, created_wbs.id);
          processedCodes.add(wbsCode);
        }
      } catch (e: any) {
        errors.push(`ردیف ${rowNumber} (کد ${wbsCode}): ${e.message}`);
        skipped++;
      }
    }

    // ----- Delete WBS in DB that are NOT in Excel -----
    // (Cascade delete will handle children automatically)
    const toDelete = allExisting
      .filter((w) => !processedCodes.has(w.wbsCode))
      .map((w) => w.id);

    if (toDelete.length > 0) {
      // Sort: delete parents last to avoid issues, though cascade handles it
      // Delete one by one to ensure cascade works
      for (const delId of toDelete) {
        try {
          await db.wBS.delete({ where: { id: delId } });
          deleted++;
        } catch (e: any) {
          // Likely a foreign key issue — try SetNull relations might block it
          errors.push(`حذف ${delId}: ${e.message}`);
        }
      }
    }

    // Log the action
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.full_import",
        description: `واردسازی کامل WBS: ${created} ایجاد، ${updated} به‌روزرسانی، ${deleted} حذف از فایل ${file.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `ایجاد: ${created.toLocaleString("fa-IR")} | به‌روزرسانی: ${updated.toLocaleString("fa-IR")} | حذف: ${deleted.toLocaleString("fa-IR")} | رد شده: ${skipped.toLocaleString("fa-IR")}`,
      created,
      updated,
      deleted,
      skipped,
      errors: errors.slice(0, 30),
      totalRows: rows.length,
    });
  } catch (e: any) {
    console.error("[wbs.full_import] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ----- Local Jalali formatter for startDateJalali/finishDateJalali fields -----
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
