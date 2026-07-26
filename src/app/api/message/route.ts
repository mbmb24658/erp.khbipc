import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List messages for current user
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const box = searchParams.get("box") || "all";

  try {
    let whereClause: string;
    if (box === "inbox") {
      whereClause = `m."toUserId" = $1`;
    } else if (box === "sent") {
      whereClause = `m."fromUserId" = $1`;
    } else {
      whereClause = `(m."fromUserId" = $1 OR m."toUserId" = $1)`;
    }

    const messages = await db.$queryRawUnsafe(
      `SELECT m."id", m."fromUserId", m."toUserId", m."content", m."isRead", m."readAt", m."createdAt",
              fu."username" AS "fromUsername", fp."name" AS "fromName",
              tu."username" AS "toUsername", tp."name" AS "toName"
       FROM "Message" m
       LEFT JOIN "User" fu ON m."fromUserId" = fu."id"
       LEFT JOIN "Personel" fp ON fu."personelId" = fp."id"
       LEFT JOIN "User" tu ON m."toUserId" = tu."id"
       LEFT JOIN "Personel" tp ON tu."personelId" = tp."id"
       WHERE ${whereClause}
       ORDER BY m."createdAt" DESC
       LIMIT 200`,
      userId
    );

    const serialized = (Array.isArray(messages) ? messages : []).map((m: any) => ({
      id: m.id,
      fromUserId: m.fromUserId,
      toUserId: m.toUserId,
      content: m.content,
      isRead: m.isRead,
      readAt: m.readAt ? new Date(m.readAt).toISOString() : null,
      createdAt: new Date(m.createdAt).toISOString(),
      fromUser: {
        id: m.fromUserId,
        username: m.fromUsername,
        name: m.fromName || m.fromUsername,
      },
      toUser: {
        id: m.toUserId,
        username: m.toUsername,
        name: m.toName || m.toUsername,
      },
    }));

    return NextResponse.json(serialized);
  } catch (e: any) {
    // Message table might not exist
    return NextResponse.json([]);
  }
}

// POST: Send a message
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fromUserId = (session.user as any).id;
  const data = await req.json().catch(() => ({}));

  if (!data.toUserId || typeof data.toUserId !== "string") {
    return NextResponse.json({ error: "گیرنده پیام الزامی است" }, { status: 400 });
  }
  if (!data.content || typeof data.content !== "string" || data.content.trim() === "") {
    return NextResponse.json({ error: "متن پیام الزامی است" }, { status: 400 });
  }
  if (data.toUserId === fromUserId) {
    return NextResponse.json({ error: "نمی‌توان به خودتان پیام بدهید" }, { status: 400 });
  }

  // Verify recipient exists
  const recipient = await db.user.findUnique({
    where: { id: data.toUserId },
    select: { id: true, isActive: true },
  });
  if (!recipient) {
    return NextResponse.json({ error: "گیرنده یافت نشد" }, { status: 404 });
  }

  try {
    // Use raw SQL to create message (avoids Prisma model issues if table just created)
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "Message" ("id", "fromUserId", "toUserId", "content", "isRead", "createdAt")
       VALUES ($1, $2, $3, $4, false, NOW())`,
      msgId, fromUserId, data.toUserId, data.content.trim()
    );

    // Fetch with user info
    const result = await db.$queryRawUnsafe(
      `SELECT m."id", m."fromUserId", m."toUserId", m."content", m."isRead", m."createdAt",
              fu."username" AS "fromUsername", fp."name" AS "fromName",
              tu."username" AS "toUsername", tp."name" AS "toName"
       FROM "Message" m
       LEFT JOIN "User" fu ON m."fromUserId" = fu."id"
       LEFT JOIN "Personel" fp ON fu."personelId" = fp."id"
       LEFT JOIN "User" tu ON m."toUserId" = tu."id"
       LEFT JOIN "Personel" tp ON tu."personelId" = tp."id"
       WHERE m."id" = $1`,
      msgId
    );

    const m = Array.isArray(result) && result.length > 0 ? result[0] : null;
    if (!m) {
      return NextResponse.json({ error: "خطا در ایجاد پیام" }, { status: 500 });
    }

    return NextResponse.json({
      id: (m as any).id,
      fromUserId: (m as any).fromUserId,
      toUserId: (m as any).toUserId,
      content: (m as any).content,
      isRead: (m as any).isRead,
      readAt: null,
      createdAt: new Date((m as any).createdAt).toISOString(),
      fromUser: {
        id: (m as any).fromUserId,
        username: (m as any).fromUsername,
        name: (m as any).fromName || (m as any).fromUsername,
      },
      toUser: {
        id: (m as any).toUserId,
        username: (m as any).toUsername,
        name: (m as any).toName || (m as any).toUsername,
      },
    }, { status: 201 });
  } catch (e: any) {
    // Message table might not exist — try to create it
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Message" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "fromUserId" TEXT NOT NULL,
          "toUserId" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "readAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Message_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE,
          CONSTRAINT "Message_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE
        )
      `);
      // Retry insert
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "Message" ("id", "fromUserId", "toUserId", "content", "isRead", "createdAt")
         VALUES ($1, $2, $3, $4, false, NOW())`,
        msgId, fromUserId, data.toUserId, data.content.trim()
      );

      return NextResponse.json({
        id: msgId,
        fromUserId,
        toUserId: data.toUserId,
        content: data.content.trim(),
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
        fromUser: { id: fromUserId, username: "", name: "" },
        toUser: { id: data.toUserId, username: "", name: "" },
      }, { status: 201 });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
  }
}
