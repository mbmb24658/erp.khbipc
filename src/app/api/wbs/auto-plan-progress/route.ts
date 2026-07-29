import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes on Vercel Pro plan (Hobby plan caps at 60s)
export const maxDuration = 300;

// POST: Auto-compute monthly progress plan for all WBS items using bulk SQL.
//
// For each WBS item with startDate and finishDate:
// 1. Compute cumulative planned progress for each month (linear distribution)
// 2. Bulk-insert WBSMonthlyProgress records (single multi-row INSERT)
// 3. Bulk-update WBS.progressPlan (single UPDATE with FROM VALUES)
//
// This implementation uses bulk SQL operations to avoid 504 Gateway Timeout
// that occurred with per-row UPDATE/INSERT loops.
export async function POST() {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch all WBS items with valid date range in ONE query
    const allWbs = await db.$queryRawUnsafe<
      { id: string; wbsCode: string; startDate: Date; finishDate: Date }[]
    >(
      `SELECT "id", "wbsCode", "startDate", "finishDate"
       FROM "WBS"
       WHERE "startDate" IS NOT NULL
         AND "finishDate" IS NOT NULL
         AND "startDate" < "finishDate"
       ORDER BY "wbsCode"`
    );

    if (!Array.isArray(allWbs) || allWbs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "فعالیتی برای محاسبه یافت نشد",
        updated: 0,
        skipped: 0,
        total: 0,
      });
    }

    const now = new Date();
    const wbsProgressUpdates: { id: string; pct: number }[] = [];
    const monthlyRows: {
      id: string;
      wbsId: string;
      monthDate: Date;
      plannedPct: number;
    }[] = [];
    let skipped = 0;

    for (const wbs of allWbs) {
      const start = new Date(wbs.startDate);
      const end = new Date(wbs.finishDate);

      if (start >= end) {
        skipped++;
        continue;
      }

      const totalDays = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (totalDays <= 0) {
        skipped++;
        continue;
      }

      // Compute overall planned progress based on today
      const daysElapsedNow = Math.max(
        0,
        Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );
      const overallPlan = Math.min(1, daysElapsedNow / totalDays);
      wbsProgressUpdates.push({ id: wbs.id, pct: overallPlan });

      // Compute monthly segments
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= endMonth) {
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // Last day of month
        const adjustedMonthEnd = monthEnd > end ? end : monthEnd;

        if (adjustedMonthEnd < start) {
          current.setMonth(current.getMonth() + 1);
          continue;
        }

        const daysElapsed = Math.max(
          0,
          Math.ceil(
            (adjustedMonthEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
          )
        );
        const pct = Math.min(1, daysElapsed / totalDays);

        monthlyRows.push({
          id: `mp_${wbs.id}_${current.getFullYear()}_${current.getMonth() + 1}`,
          wbsId: wbs.id,
          monthDate: new Date(current.getFullYear(), current.getMonth(), 15),
          plannedPct: Math.round(pct * 1000) / 1000,
        });

        current.setMonth(current.getMonth() + 1);
      }
    }

    const updated = wbsProgressUpdates.length;

    // ============================================================
    // BULK UPDATE #1: WBS.progressPlan using FROM VALUES
    // Single SQL statement instead of N individual UPDATEs.
    // ============================================================
    if (wbsProgressUpdates.length > 0) {
      const CHUNK = 200; // Stay well below 65535 param limit
      for (let i = 0; i < wbsProgressUpdates.length; i += CHUNK) {
        const chunk = wbsProgressUpdates.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: any[] = [];
        let p = 1;
        chunk.forEach((u) => {
          values.push(`($${p}::text, $${p + 1}::float8)`);
          params.push(u.id, u.pct);
          p += 2;
        });
        try {
          await db.$executeRawUnsafe(
            `UPDATE "WBS" w
             SET "progressPlan" = v.pct
             FROM (VALUES ${values.join(",")}) AS v(id, pct)
             WHERE w."id" = v.id`,
            ...params
          );
        } catch (e: any) {
          console.error("bulk update WBS.progressPlan failed:", e?.message);
        }
      }
    }

    // ============================================================
    // BULK UPDATE #2: WBSMonthlyProgress records
    // Single DELETE + single multi-row INSERT per chunk.
    // ============================================================
    if (monthlyRows.length > 0) {
      // First, delete existing rows for these wbsIds (one bulk DELETE)
      const wbsIds = [...new Set(monthlyRows.map((r) => r.wbsId))];
      const DELETE_CHUNK = 500;
      for (let i = 0; i < wbsIds.length; i += DELETE_CHUNK) {
        const chunk = wbsIds.slice(i, i + DELETE_CHUNK);
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(",");
        try {
          await db.$executeRawUnsafe(
            `DELETE FROM "WBSMonthlyProgress" WHERE "wbsId" IN (${placeholders})`,
            ...chunk
          );
        } catch {
          // Table might not exist yet — skip
        }
      }

      // Then bulk INSERT all monthly rows in chunks
      const INSERT_CHUNK = 250; // 250 rows × 4 params = 1000 params per query
      for (let i = 0; i < monthlyRows.length; i += INSERT_CHUNK) {
        const chunk = monthlyRows.slice(i, i + INSERT_CHUNK);
        const values: string[] = [];
        const params: any[] = [];
        let p = 1;
        chunk.forEach((row) => {
          values.push(
            `($${p}::text, $${p + 1}::text, $${p + 2}::timestamp, $${p + 3}::float8, NOW())`
          );
          params.push(row.id, row.wbsId, row.monthDate, row.plannedPct);
          p += 4;
        });
        try {
          await db.$executeRawUnsafe(
            `INSERT INTO "WBSMonthlyProgress" ("id", "wbsId", "monthDate", "plannedPct", "createdAt")
             VALUES ${values.join(",")}
             ON CONFLICT ("wbsId", "monthDate") DO UPDATE
             SET "plannedPct" = EXCLUDED."plannedPct"`,
            ...params
          );
        } catch (e: any) {
          // Try without ON CONFLICT (older schema without unique constraint)
          try {
            await db.$executeRawUnsafe(
              `INSERT INTO "WBSMonthlyProgress" ("id", "wbsId", "monthDate", "plannedPct", "createdAt")
               VALUES ${values.join(",")}`,
              ...params
            );
          } catch {
            // Table might not exist — skip silently
          }
        }
      }
    }

    // Log (best-effort)
    try {
      await db.userLog.create({
        data: {
          userId: (session.user as any).id,
          action: "wbs.auto_plan_progress",
          description: `محاسبه خودکار پیشرفت برنامه برای ${updated} فعالیت (${monthlyRows.length} رکورد ماهانه)`,
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: `پیشرفت برنامه برای ${updated.toLocaleString("fa-IR")} فعالیت محاسبه شد`,
      updated,
      skipped,
      total: allWbs.length,
      monthlyRecords: monthlyRows.length,
    });
  } catch (e: any) {
    console.error("[auto-plan-progress] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
