import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// POST: Import Excel file with updated progress percentages
// Available to ALL authenticated users (including 'user' role)
// Expected columns: ID | نام فعالیت | کد WBS | سطح | درصد پیشرفت برنامه (%) | درصد پیشرفت واقعی (%)
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

    // Validate headers
    const firstRow = rows[0];
    const requiredCols = ["ID", "کد WBS", "درصد پیشرفت برنامه (%)", "درصد پیشرفت واقعی (%)"];
    const missingCols = requiredCols.filter((c) => !(c in firstRow));
    if (missingCols.length > 0) {
      return NextResponse.json(
        { error: `ستون‌های الزامی موجود نیست: ${missingCols.join(", ")}` },
        { status: 400 }
      );
    }

    // Process each row
    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = String(row["ID"] || "").trim();
      const wbsCode = String(row["کد WBS"] || "").trim();
      const planPct = Number(row["درصد پیشرفت برنامه (%)"]);
      const actualPct = Number(row["درصد پیشرفت واقعی (%)"]);

      if (!id) {
        skipped++;
        continue;
      }

      // Validate percentages
      if (isNaN(planPct) || planPct < 0 || planPct > 100) {
        errors.push(`ردیف ${i + 2}: درصد برنامه نامعتبر (${planPct})`);
        skipped++;
        continue;
      }
      if (isNaN(actualPct) || actualPct < 0 || actualPct > 100) {
        errors.push(`ردیف ${i + 2}: درصد واقعی نامعتبر (${actualPct})`);
        skipped++;
        continue;
      }

      try {
        // Find by ID (preferred) or by wbsCode (fallback)
        let wbs = await db.wBS.findUnique({ where: { id } });
        if (!wbs && wbsCode) {
          wbs = await db.wBS.findUnique({ where: { wbsCode } });
        }
        if (!wbs) {
          errors.push(`ردیف ${i + 2}: فعالیت با ID ${id} یافت نشد`);
          skipped++;
          continue;
        }

        // Update progress (convert 0-100 to 0-1)
        await db.wBS.update({
          where: { id: wbs.id },
          data: {
            progressPlan: planPct / 100,
            progressActual: actualPct / 100,
          },
        });
        updated++;
      } catch (e: any) {
        errors.push(`ردیف ${i + 2}: ${e.message}`);
        skipped++;
      }
    }

    // Log the action
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.progress_import",
        description: `بازنشانی پیشرفت ${updated} فعالیت از فایل ${file.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${updated.toLocaleString("fa-IR")} فعالیت به‌روزرسانی شد`,
      updated,
      skipped,
      errors: errors.slice(0, 20), // first 20 errors
      totalRows: rows.length,
    });
  } catch (e: any) {
    console.error("[wbs.progress_import] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
