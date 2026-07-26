import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List messages for current user (sent + received), newest first
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const box = searchParams.get("box") || "all"; // all | inbox | sent

  const where: any = {};
  if (box === "inbox") where.toUserId = userId;
  else if (box === "sent") where.fromUserId = userId;
  else where.OR = [{ fromUserId: userId }, { toUserId: userId }];

  const messages = await db.message.findMany({
    where,
    include: {
      fromUser: {
        select: {
          id: true,
          username: true,
          personel: { select: { name: true } },
        },
      },
      toUser: {
        select: {
          id: true,
          username: true,
          personel: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Serialize dates
  const serialized = messages.map((m) => ({
    id: m.id,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    content: m.content,
    isRead: m.isRead,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    fromUser: {
      id: m.fromUser.id,
      username: m.fromUser.username,
      name: m.fromUser.personel?.name || m.fromUser.username,
    },
    toUser: {
      id: m.toUser.id,
      username: m.toUser.username,
      name: m.toUser.personel?.name || m.toUser.username,
    },
  }));

  return NextResponse.json(serialized);
}

// POST: Send a message to another user
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

  const message = await db.message.create({
    data: {
      fromUserId,
      toUserId: data.toUserId,
      content: data.content.trim(),
    },
    include: {
      fromUser: {
        select: { id: true, username: true, personel: { select: { name: true } } },
      },
      toUser: {
        select: { id: true, username: true, personel: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({
    id: message.id,
    fromUserId: message.fromUserId,
    toUserId: message.toUserId,
    content: message.content,
    isRead: message.isRead,
    readAt: message.readAt ? message.readAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
    fromUser: {
      id: message.fromUser.id,
      username: message.fromUser.username,
      name: message.fromUser.personel?.name || message.fromUser.username,
    },
    toUser: {
      id: message.toUser.id,
      username: message.toUser.username,
      name: message.toUser.personel?.name || message.toUser.username,
    },
  }, { status: 201 });
}
