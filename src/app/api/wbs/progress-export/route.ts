import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// GET: Export Excel file with all WBS activities and their progress
// Available to ALL authenticated users (including 'user' role)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.wBS.findMany({
    orderBy: [{ level: "asc" }, { wbsCode: "asc" }],
    select: {
      id: true,
      wbsCode: true,
      title: true,
      level: true,
      progressPlan: true,
      progressActual: true,
    },
  });

  // Build worksheet data
  // Format: ID | نام فعالیت | کد WBS | درصد پیشرفت برنامه (%) | درصد پیشرفت واقعی (%)
  // Note: percentages are stored as 0-1 in DB, exported as 0-100
  const rows = items.map((w) => ({
    "ID": w.id,
    "نام فعالیت": w.title,
    "کد WBS": w.wbsCode,
    "سطح": w.level,
    "درصد پیشرفت برنامه (%)": Math.round(w.progressPlan * 10000) / 100,
    "درصد پیشرفت واقعی (%)": Math.round(w.progressActual * 10000) / 100,
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
    { wch: 25 }, // درصد برنامه
    { wch: 25 }, // درصد واقعی
  ];

  XLSX.utils.book_append_sheet(wb, ws, "پیشرفت فعالیت‌ها");

  // Generate buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // Return as downloadable file
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wbs-progress-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
