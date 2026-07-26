import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List users who were active in the last 5 minutes.
// Also updates the current user's lastActivityAt (heartbeat).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  // Update the current user's lastActivityAt timestamp (heartbeat)
  // Use raw SQL to avoid Prisma issues if column doesn't exist
  try {
    await db.$executeRawUnsafe(
      `UPDATE "User" SET "lastActivityAt" = $1 WHERE "id" = $2`,
      new Date(), userId
    );
  } catch {
    // Column might not exist — try without it
    try {
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "lastLoginAt" = $1 WHERE "id" = $2`,
        new Date(), userId
      );
    } catch {
      // ignore
    }
  }

  // Users active within the last 5 minutes (excluding the current user)
  // Use raw SQL to avoid Prisma issues with lastActivityAt column
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineUsers = await db.$queryRawUnsafe(
      `SELECT u."id", u."username", u."lastActivityAt", p."name"
       FROM "User" u
       LEFT JOIN "Personel" p ON u."personelId" = p."id"
       WHERE u."isActive" = true
         AND u."lastActivityAt" >= $1
         AND u."id" != $2
       ORDER BY u."lastActivityAt" DESC`,
      fiveMinutesAgo, userId
    );

    const serialized = (Array.isArray(onlineUsers) ? onlineUsers : []).map((u: any) => ({
      id: u.id,
      username: u.username,
      name: u.name || u.username,
      lastActivityAt: u.lastActivityAt ? new Date(u.lastActivityAt).toISOString() : null,
    }));

    return NextResponse.json(serialized);
  } catch {
    // lastActivityAt column doesn't exist — return empty list
    return NextResponse.json([]);
  }
}
