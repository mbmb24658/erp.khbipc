import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// POST: Backfill strategicTopic for all existing WBS items
// This auto-computes the strategic topic from wbsCode for every WBS record
// that doesn't have strategicTopic set yet (or all records if force=true)
export async function POST(req: Request) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  try {
    // Fetch all WBS items
    const allWbs = await db.wBS.findMany({
      select: { id: true, wbsCode: true, strategicTopic: true },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const w of allWbs) {
      // Skip if already has strategicTopic and not forced
      if (!force && (w as any).strategicTopic) {
        skipped++;
        continue;
      }

      // Compute strategicTopic from wbsCode
      // "1" → null (vision), "1.1" → "1.1", "1.2.3.4" → "1.2"
      const parts = w.wbsCode.split(".");
      const strategicTopic = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;

      try {
        // Use raw SQL to update (in case strategicTopic column doesn't exist in Prisma client)
        await db.$executeRawUnsafe(
          `UPDATE "WBS" SET "strategicTopic" = $1 WHERE "id" = $2`,
          strategicTopic, w.id
        );
        updated++;
      } catch (e: any) {
        // Column might not exist — try to add it first
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "WBS" ADD COLUMN IF NOT EXISTS "strategicTopic" TEXT`);
          await db.$executeRawUnsafe(
            `UPDATE "WBS" SET "strategicTopic" = $1 WHERE "id" = $2`,
            strategicTopic, w.id
          );
          updated++;
        } catch (e2: any) {
          errors.push(`${w.wbsCode}: ${e2.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updated.toLocaleString("fa-IR")} فعالیت به‌روزرسانی شد`,
      updated,
      skipped,
      total: allWbs.length,
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
