import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// ---- Jalali (Persian Solar) date helpers (inlined for server-side use) ----
// Algorithm by Kazimierz M. Borkowski
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

// Format Gregorian Date to Jalali string "YYYY/MM/DD" (Persian digits)
function formatJalali(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(String(jd).padStart(2, "0"))}`;
}

// Level descriptions for the help sheet
const LEVEL_DESCRIPTIONS: { level: number; name: string; desc: string }[] = [
  { level: 1, name: "چشم‌انداز", desc: "بالاترین سطح استراتژیک" },
  { level: 2, name: "موضوع استراتژیک", desc: "محورهای اصلی استراتژیک" },
  { level: 3, name: "هدف اصلی", desc: "اهداف کلان هر موضوع استراتژیک" },
  { level: 4, name: "فرآیند", desc: "فرآیندهای تحقق اهداف" },
  { level: 5, name: "فعالیت کلیدی", desc: "فعالیت‌های محوری هر فرآیند" },
  { level: 6, name: "فعالیت اصلی", desc: "فعالیت‌های اجرایی اصلی" },
  { level: 7, name: "فعالیت فرعی", desc: "زیرفعالیت‌های تفصیلی" },
];

// GET: Export Excel file with ALL WBS fields + reference data sheet
// Available to ALL authenticated users (including 'user' role)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch WBS items with all fields
  const items = await db.wBS.findMany({
    orderBy: [{ level: "asc" }, { wbsCode: "asc" }],
    select: {
      id: true,
      wbsCode: true,
      title: true,
      level: true,
      durationDays: true,
      progressPlan: true,
      progressActual: true,
      startDate: true,
      finishDate: true,
      requiredOrgPositionId: true,
      hrPlan: true,
      hrActual: true,
      description: true,
    },
  });

  // Fetch all org charts for reference
  const orgCharts = await db.orgChart.findMany({
    select: { id: true, orgId: true, position: true },
  });
  const orgChartMap = new Map(orgCharts.map((o) => [o.id, o]));

  // Fetch all personnel for reference
  const personels = await db.personel.findMany({
    select: { id: true, personelId: true, name: true },
  });
  const personelMap = new Map(personels.map((p) => [p.id, p]));

  // Helper: parse JSON array and return names
  function parseHrNames(jsonStr: string | null, type: "org" | "person"): string {
    if (!jsonStr) return "";
    try {
      const ids: string[] = JSON.parse(jsonStr);
      if (type === "org") {
        return ids
          .map((id) => {
            const o = orgChartMap.get(id);
            return o ? `${o.orgId} - ${o.position}` : "";
          })
          .filter(Boolean)
          .join(" | ");
      } else {
        return ids
          .map((id) => {
            const p = personelMap.get(id);
            return p ? `${p.personelId} - ${p.name}` : "";
          })
          .filter(Boolean)
          .join(" | ");
      }
    } catch {
      // If it's not JSON, return as-is (legacy free text)
      return jsonStr;
    }
  }

  // Build worksheet data — ALL fields
  const rows = items.map((w) => ({
    "ID": w.id, // hidden / internal
    "کد WBS": w.wbsCode,
    "عنوان فعالیت": w.title,
    "سطح": w.level,
    "مدت زمان (روز)": w.durationDays,
    "درصد پیشرفت برنامه (%)": Math.round(w.progressPlan * 10000) / 100,
    "درصد پیشرفت واقعی (%)": Math.round(w.progressActual * 10000) / 100,
    "تاریخ شروع": formatJalali(w.startDate),
    "تاریخ پایان": formatJalali(w.finishDate),
    "سمت سازمانی مورد نیاز": w.requiredOrgPositionId
      ? (() => {
          const o = orgChartMap.get(w.requiredOrgPositionId);
          return o ? `${o.orgId} - ${o.position}` : "";
        })()
      : "",
    "منابع انسانی برنامه": parseHrNames(w.hrPlan, "org"),
    "منابع انسانی واقعی": parseHrNames(w.hrActual, "person"),
    "توضیحات": w.description || "",
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths — ID is hidden/very narrow (internal use only)
  ws["!cols"] = [
    { wch: 2, hidden: true }, // ID (hidden)
    { wch: 15 }, // کد WBS
    { wch: 40 }, // عنوان فعالیت
    { wch: 8 },  // سطح
    { wch: 14 }, // مدت زمان (روز)
    { wch: 20 }, // درصد برنامه
    { wch: 20 }, // درصد واقعی
    { wch: 14 }, // تاریخ شروع
    { wch: 14 }, // تاریخ پایان
    { wch: 25 }, // سمت سازمانی مورد نیاز
    { wch: 40 }, // منابع انسانی برنامه
    { wch: 40 }, // منابع انسانی واقعی
    { wch: 40 }, // توضیحات
  ];

  // Add data validation for percentage columns (0-100)
  // Column F = درصد برنامه, Column G = درصد واقعی
  if (rows.length > 0) {
    const pctRange = `F2:G${rows.length + 1}`;
    // Level column = D, validate 1-7
    const levelRange = `D2:D${rows.length + 1}`;
    ws["!dataValidations"] = [
      {
        type: "decimal",
        operator: "between",
        formula1: "0",
        formula2: "100",
        sqref: pctRange,
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "مقدار نامعتبر",
        error: "درصد باید بین ۰ تا ۱۰۰ باشد",
      },
      {
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "7",
        sqref: levelRange,
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "سطح نامعتبر",
        error: "سطح باید عدد صحیح بین ۱ تا ۷ باشد",
      },
    ];
  }

  XLSX.utils.book_append_sheet(wb, ws, "فعالیت‌های WBS");

  // ----- Second sheet: راهنما (کدها) -----
  // Reference data: org positions, personnel, level descriptions
  const refRows: any[] = [];

  // Section: Org chart positions
  refRows.push({ "نوع": "=== سمت‌های سازمانی ===", "کد": "", "نام": "", "توضیحات": "" });
  for (const o of orgCharts) {
    refRows.push({
      "نوع": "سمت سازمانی",
      "کد": o.orgId,
      "نام": o.position,
      "توضیحات": "",
    });
  }

  // Spacer
  refRows.push({ "نوع": "", "کد": "", "نام": "", "توضیحات": "" });

  // Section: Personnel
  refRows.push({ "نوع": "=== پرسنل ===", "کد": "", "نام": "", "توضیحات": "" });
  for (const p of personels) {
    refRows.push({
      "نوع": "پرسنل",
      "کد": p.personelId,
      "نام": p.name,
      "توضیحات": "",
    });
  }

  // Spacer
  refRows.push({ "نوع": "", "کد": "", "نام": "", "توضیحات": "" });

  // Section: Levels
  refRows.push({ "نوع": "=== سطوح WBS ===", "کد": "", "نام": "", "توضیحات": "" });
  for (const lv of LEVEL_DESCRIPTIONS) {
    refRows.push({
      "نوع": "سطح",
      "کد": String(lv.level),
      "نام": lv.name,
      "توضیحات": lv.desc,
    });
  }

  const refWs = XLSX.utils.json_to_sheet(refRows);
  refWs["!cols"] = [
    { wch: 22 },
    { wch: 15 },
    { wch: 35 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, refWs, "راهنما (کدها)");

  // Generate buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wbs-full-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
