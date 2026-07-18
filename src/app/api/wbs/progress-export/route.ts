import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// GET: Export Excel file with all WBS activities, progress, and HR assignments
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
      progressPlan: true,
      progressActual: true,
      hrPlan: true,
      hrActual: true,
      requiredOrgPositionId: true,
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

  // Build worksheet data
  const rows = items.map((w) => ({
    "ID": w.id,
    "نام فعالیت": w.title,
    "کد WBS": w.wbsCode,
    "سطح": w.level,
    "درصد پیشرفت برنامه (%)": Math.round(w.progressPlan * 10000) / 100,
    "درصد پیشرفت واقعی (%)": Math.round(w.progressActual * 10000) / 100,
    "سمت سازمانی مورد نیاز": w.requiredOrgPositionId
      ? (() => {
          const o = orgChartMap.get(w.requiredOrgPositionId);
          return o ? `${o.orgId} - ${o.position}` : "";
        })()
      : "",
    "منابع انسانی برنامه (سمت‌ها)": parseHrNames(w.hrPlan, "org"),
    "منابع انسانی واقعی (پرسنل)": parseHrNames(w.hrActual, "person"),
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 35 }, // ID
    { wch: 40 }, // نام فعالیت
    { wch: 15 }, // کد WBS
    { wch: 8 },  // سطح
    { wch: 20 }, // درصد برنامه
    { wch: 20 }, // درصد واقعی
    { wch: 25 }, // سمت سازمانی مورد نیاز
    { wch: 40 }, // منابع انسانی برنامه
    { wch: 40 }, // منابع انسانی واقعی
  ];

  // Add data validation for percentage columns (0-100)
  // Column E (index 4) = درصد برنامه, Column F (index 5) = درصد واقعی
  const range = `E2:F${rows.length + 1}`;
  ws["!dataValidations"] = [
    {
      type: "decimal",
      operator: "between",
      formula1: "0",
      formula2: "100",
      sqref: range,
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "مقدار نامعتبر",
      error: "درصد باید بین ۰ تا ۱۰۰ باشد",
    },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "پیشرفت فعالیت‌ها");

  // Add a second sheet with reference data (org charts and personnel)
  const refRows = [
    ...orgCharts.map((o) => ({
      "نوع": "سمت سازمانی",
      "کد": o.orgId,
      "نام": o.position,
    })),
    ...personels.map((p) => ({
      "نوع": "پرسنل",
      "کد": p.personelId,
      "نام": p.name,
    })),
  ];
  const refWs = XLSX.utils.json_to_sheet(refRows);
  refWs["!cols"] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, refWs, "راهنما (کدها)");

  // Generate buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wbs-progress-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
