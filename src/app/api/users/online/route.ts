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
  try {
    await db.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() },
    });
  } catch {
    // ignore — non-fatal
  }

  // Users active within the last 5 minutes (excluding the current user)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const onlineUsers = await db.user.findMany({
    where: {
      isActive: true,
      lastActivityAt: { gte: fiveMinutesAgo },
      id: { not: userId },
    },
    select: {
      id: true,
      username: true,
      lastActivityAt: true,
      personel: { select: { name: true } },
    },
  });

  const serialized = onlineUsers.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.personel?.name || u.username,
    lastActivityAt: u.lastActivityAt ? u.lastActivityAt.toISOString() : null,
  }));

  return NextResponse.json(serialized);
}
