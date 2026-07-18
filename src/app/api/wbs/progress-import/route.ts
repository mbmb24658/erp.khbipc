import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// POST: Import Excel file with updated progress percentages + HR assignments
// Available to ALL authenticated users (including 'user' role)
//
// Expected columns:
//   ID | نام فعالیت | کد WBS | سطح | درصد پیشرفت برنامه (%) | درصد پیشرفت واقعی (%) |
//   سمت سازمانی مورد نیاز | منابع انسانی برنامه (سمت‌ها) | منابع انسانی واقعی (پرسنل)
//
// HR fields are text like "ORG-1.1 - مدیرعامل | ORG-1.2 - مسئول دفتر" (pipe-separated)
// We'll parse them back to IDs
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

    // Fetch reference data for parsing HR fields
    const orgCharts = await db.orgChart.findMany({ select: { id: true, orgId: true, position: true } });
    const personels = await db.personel.findMany({ select: { id: true, personelId: true, name: true } });

    // Build lookup maps — match by "code - name" format
    const orgChartByLabel = new Map<string, string>();
    for (const o of orgCharts) {
      orgChartByLabel.set(`${o.orgId} - ${o.position}`, o.id);
      orgChartByLabel.set(`${o.orgId}-${o.position}`, o.id);
    }
    const personelByLabel = new Map<string, string>();
    for (const p of personels) {
      personelByLabel.set(`${p.personelId} - ${p.name}`, p.id);
      personelByLabel.set(`${p.personelId}-${p.name}`, p.id);
    }

    // Parse pipe-separated text to array of IDs
    function parseHrToIds(text: string | null, type: "org" | "person"): string[] | null {
      if (!text || String(text).trim() === "") return null;
      const parts = String(text).split("|").map((s) => s.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const part of parts) {
        const id = type === "org" ? orgChartByLabel.get(part) : personelByLabel.get(part);
        if (id) ids.push(id);
      }
      return ids.length > 0 ? ids : null;
    }

    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = String(row["ID"] || "").trim();
      const wbsCode = String(row["کد WBS"] || "").trim();
      const planPct = Number(row["درصد پیشرفت برنامه (%)"]);
      const actualPct = Number(row["درصد پیشرفت واقعی (%)"]);
      const hrPlanText = row["منابع انسانی برنامه (سمت‌ها)"];
      const hrActualText = row["منابع انسانی واقعی (پرسنل)"];

      if (!id) {
        skipped++;
        continue;
      }

      // Validate percentages (if provided)
      if (!isNaN(planPct) && (planPct < 0 || planPct > 100)) {
        errors.push(`ردیف ${i + 2}: درصد برنامه نامعتبر (${planPct})`);
        skipped++;
        continue;
      }
      if (!isNaN(actualPct) && (actualPct < 0 || actualPct > 100)) {
        errors.push(`ردیف ${i + 2}: درصد واقعی نامعتبر (${actualPct})`);
        skipped++;
        continue;
      }

      try {
        let wbs = await db.wBS.findUnique({ where: { id } });
        if (!wbs && wbsCode) {
          wbs = await db.wBS.findUnique({ where: { wbsCode } });
        }
        if (!wbs) {
          errors.push(`ردیف ${i + 2}: فعالیت با ID ${id} یافت نشد`);
          skipped++;
          continue;
        }

        // Build update data
        const updateData: any = {};

        // Update progress if provided
        if (!isNaN(planPct)) updateData.progressPlan = planPct / 100;
        if (!isNaN(actualPct)) updateData.progressActual = actualPct / 100;

        // Update HR fields if provided
        if (hrPlanText !== undefined && hrPlanText !== null) {
          const ids = parseHrToIds(String(hrPlanText), "org");
          updateData.hrPlan = ids ? JSON.stringify(ids) : null;
        }
        if (hrActualText !== undefined && hrActualText !== null) {
          const ids = parseHrToIds(String(hrActualText), "person");
          updateData.hrActual = ids ? JSON.stringify(ids) : null;
        }

        if (Object.keys(updateData).length > 0) {
          await db.wBS.update({
            where: { id: wbs.id },
            data: updateData,
          });
          updated++;
        }
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
        description: `بازنشانی پیشرفت و منابع انسانی ${updated} فعالیت از فایل ${file.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${updated.toLocaleString("fa-IR")} فعالیت به‌روزرسانی شد`,
      updated,
      skipped,
      errors: errors.slice(0, 20),
      totalRows: rows.length,
    });
  } catch (e: any) {
    console.error("[wbs.progress_import] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
