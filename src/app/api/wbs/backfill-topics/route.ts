import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes on Vercel Pro plan
export const maxDuration = 300;

// POST: Backfill strategicTopic for ALL existing WBS items AND Activities using bulk SQL.
//
// - For WBS: derive from wbsCode (e.g. "1.3.2.1" → "1.3")
// - For Activity: derive from linked WBS.strategicTopic (or wbsCode if strategicTopic is null)
//
// Both operations use single bulk UPDATE with FROM VALUES clause for performance.
// Without this, the previous per-row UPDATE loop would timeout on Vercel.
export async function POST(req: Request) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  try {
    // Step 1: Ensure the columns exist on both tables
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "WBS" ADD COLUMN IF NOT EXISTS "strategicTopic" TEXT`
      );
    } catch {
      // ignore
    }
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "strategicTopic" TEXT`
      );
    } catch {
      // ignore
    }

    // ============================================================
    // STEP 2: Backfill WBS.strategicTopic from wbsCode
    // ============================================================
    const allWbs = await db.$queryRawUnsafe<
      { id: string; wbsCode: string; strategicTopic: string | null }[]
    >(`SELECT "id", "wbsCode", "strategicTopic" FROM "WBS" ORDER BY "wbsCode"`);

    const wbsUpdates: { id: string; topic: string | null }[] = [];
    let wbsSkipped = 0;

    for (const w of Array.isArray(allWbs) ? allWbs : []) {
      const wbsCode = w.wbsCode;
      const existingTopic = w.strategicTopic;

      // Skip if already has strategicTopic and not forced
      if (!force && existingTopic) {
        wbsSkipped++;
        continue;
      }

      // Compute strategicTopic from wbsCode
      // "1" → null (vision), "1.1" → "1.1", "1.2.3.4" → "1.2"
      const parts = String(wbsCode).split(".");
      const topic = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
      wbsUpdates.push({ id: w.id, topic });
    }

    // Bulk UPDATE WBS.strategicTopic using FROM VALUES
    if (wbsUpdates.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < wbsUpdates.length; i += CHUNK) {
        const chunk = wbsUpdates.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: any[] = [];
        let p = 1;
        chunk.forEach((u) => {
          values.push(`($${p}::text, $${p + 1}::text)`);
          params.push(u.id, u.topic);
          p += 2;
        });
        try {
          await db.$executeRawUnsafe(
            `UPDATE "WBS" w
             SET "strategicTopic" = v.topic
             FROM (VALUES ${values.join(",")}) AS v(id, topic)
             WHERE w."id" = v.id`,
            ...params
          );
        } catch (e: any) {
          console.error("[backfill-topics] WBS bulk update failed:", e?.message);
        }
      }
    }

    // ============================================================
    // STEP 3: Backfill Activity.strategicTopic from linked WBS
    // ============================================================
    // Activities link to WBS via wbsId. We derive the strategicTopic
    // from the linked WBS's wbsCode (more reliable than strategicTopic
    // column which might not be populated yet at the time of the query).
    const activitiesNeedingTopic = await db.$queryRawUnsafe<
      { id: string; wbsCode: string | null; existingTopic: string | null }[]
    >(
      `SELECT a."id", w."wbsCode" AS "wbsCode", a."strategicTopic" AS "existingTopic"
       FROM "Activity" a
       LEFT JOIN "WBS" w ON a."wbsId" = w."id"
       WHERE ${force ? "TRUE" : 'a."strategicTopic" IS NULL'}
         AND w."wbsCode" IS NOT NULL`
    );

    const activityUpdates: { id: string; topic: string | null }[] = [];
    let activitySkipped = 0;

    for (const a of Array.isArray(activitiesNeedingTopic) ? activitiesNeedingTopic : []) {
      if (!a.wbsCode) {
        activitySkipped++;
        continue;
      }
      const parts = String(a.wbsCode).split(".");
      const topic = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
      if (topic) {
        activityUpdates.push({ id: a.id, topic });
      } else {
        activitySkipped++;
      }
    }

    // Bulk UPDATE Activity.strategicTopic
    if (activityUpdates.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < activityUpdates.length; i += CHUNK) {
        const chunk = activityUpdates.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: any[] = [];
        let p = 1;
        chunk.forEach((u) => {
          values.push(`($${p}::text, $${p + 1}::text)`);
          params.push(u.id, u.topic);
          p += 2;
        });
        try {
          await db.$executeRawUnsafe(
            `UPDATE "Activity" a
             SET "strategicTopic" = v.topic
             FROM (VALUES ${values.join(",")}) AS v(id, topic)
             WHERE a."id" = v.id`,
            ...params
          );
        } catch (e: any) {
          console.error("[backfill-topics] Activity bulk update failed:", e?.message);
        }
      }
    }

    // Log (best-effort)
    try {
      await db.userLog.create({
        data: {
          userId: (session.user as any).id,
          action: "wbs.backfill_topics",
          description: `بروزرسانی موضوع استراتژیک: ${wbsUpdates.length} WBS + ${activityUpdates.length} Activity`,
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: `${wbsUpdates.length.toLocaleString("fa-IR")} فعالیت PMS و ${activityUpdates.length.toLocaleString(
        "fa-IR"
      )} فعالیت دیگر به موضوع استراتژیک متصل شد`,
      wbsUpdated: wbsUpdates.length,
      wbsSkipped,
      activityUpdated: activityUpdates.length,
      activitySkipped,
      total: Array.isArray(allWbs) ? allWbs.length : 0,
    });
  } catch (e: any) {
    console.error("[backfill-topics] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
