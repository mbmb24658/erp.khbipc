import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// POST: Backfill strategicTopic for all existing WBS items using raw SQL
// This does NOT use Prisma model fields (which might not exist in the generated client)
// Instead, it uses raw SQL exclusively
export async function POST(req: Request) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  try {
    // Step 1: Ensure the column exists
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "WBS" ADD COLUMN IF NOT EXISTS "strategicTopic" TEXT`);
    } catch {
      // ignore — might already exist
    }

    // Step 2: Fetch all WBS codes using raw SQL
    const allWbs = await db.$queryRawUnsafe(
      `SELECT "id", "wbsCode", "strategicTopic" FROM "WBS" ORDER BY "wbsCode"`
    );

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const w of Array.isArray(allWbs) ? allWbs : []) {
      const wbsCode = (w as any).wbsCode;
      const existingTopic = (w as any).strategicTopic;

      // Skip if already has strategicTopic and not forced
      if (!force && existingTopic) {
        skipped++;
        continue;
      }

      // Compute strategicTopic from wbsCode
      // "1" → null (vision), "1.1" → "1.1", "1.2.3.4" → "1.2"
      const parts = String(wbsCode).split(".");
      const strategicTopic = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;

      try {
        await db.$executeRawUnsafe(
          `UPDATE "WBS" SET "strategicTopic" = $1 WHERE "id" = $2`,
          strategicTopic, (w as any).id
        );
        updated++;
      } catch (e: any) {
        errors.push(`${wbsCode}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updated.toLocaleString("fa-IR")} فعالیت به‌روزرسانی شد`,
      updated,
      skipped,
      total: Array.isArray(allWbs) ? allWbs.length : 0,
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
