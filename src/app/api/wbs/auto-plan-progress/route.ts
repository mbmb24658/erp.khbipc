import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// POST: Auto-compute monthly progress plan for all WBS items
// For each WBS item with startDate and finishDate:
// 1. Divide the duration into monthly segments
// 2. Compute cumulative planned progress for each month (linear distribution)
// 3. Update WBSMonthlyProgress records
// 4. Update WBS.progressPlan (overall planned % based on today's date)
export async function POST() {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch all WBS items with dates
    const allWbs = await db.wBS.findMany({
      where: {
        startDate: { not: null },
        finishDate: { not: null },
      },
      select: { id: true, wbsCode: true, title: true, startDate: true, finishDate: true, durationDays: true },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = new Date();

    for (const wbs of allWbs) {
      const start = new Date(wbs.startDate!);
      const end = new Date(wbs.finishDate!);
      
      if (start >= end) {
        skipped++;
        continue;
      }

      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (totalDays <= 0) {
        skipped++;
        continue;
      }

      // Generate monthly segments
      const segments: { monthDate: Date; plannedPct: number }[] = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= endMonth) {
        // Calculate what % of the total duration has elapsed by the END of this month
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // Last day of month
        const adjustedMonthEnd = monthEnd > end ? end : monthEnd;
        const adjustedMonthStart = current < start ? start : current;
        
        if (adjustedMonthEnd < start) {
          // Month is before start — skip
          current.setMonth(current.getMonth() + 1);
          continue;
        }

        const daysElapsed = Math.max(0, Math.ceil((adjustedMonthEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        const pct = Math.min(1, daysElapsed / totalDays);
        
        segments.push({
          monthDate: new Date(current.getFullYear(), current.getMonth(), 15), // Mid-month
          plannedPct: Math.round(pct * 1000) / 1000,
        });

        current.setMonth(current.getMonth() + 1);
      }

      if (segments.length === 0) {
        skipped++;
        continue;
      }

      // Delete existing monthly progress for this WBS
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM "WBSMonthlyProgress" WHERE "wbsId" = $1`,
          wbs.id
        );
      } catch {
        // Table might not exist — skip
      }

      // Insert new monthly progress
      for (const seg of segments) {
        try {
          await db.$executeRawUnsafe(
            `INSERT INTO "WBSMonthlyProgress" ("id", "wbsId", "monthDate", "plannedPct", "actualPct", "createdAt")
             VALUES ($1, $2, $3, $4, NULL, NOW())`,
            `mp_${wbs.id}_${seg.monthDate.getTime()}`,
            wbs.id,
            seg.monthDate,
            seg.plannedPct
          );
        } catch (e: any) {
          // Might be duplicate — try update
          try {
            await db.$executeRawUnsafe(
              `UPDATE "WBSMonthlyProgress" SET "plannedPct" = $1 WHERE "wbsId" = $2 AND "monthDate" = $3`,
              seg.plannedPct, wbs.id, seg.monthDate
            );
          } catch {
            // ignore
          }
        }
      }

      // Compute overall planned progress based on today
      const daysElapsedNow = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const overallPlan = Math.min(1, daysElapsedNow / totalDays);

      try {
        await db.$executeRawUnsafe(
          `UPDATE "WBS" SET "progressPlan" = $1 WHERE "id" = $2`,
          overallPlan, wbs.id
        );
      } catch {
        // ignore
      }

      updated++;
    }

    // Log
    try {
      await db.userLog.create({
        data: {
          userId: (session.user as any).id,
          action: "wbs.auto_plan_progress",
          description: `محاسبه خودکار پیشرفت برنامه برای ${updated} فعالیت`,
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
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
