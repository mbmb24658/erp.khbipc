import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PUT: Update a message (mark as read/unread)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { id } = await params;
  const data = await req.json().catch(() => ({}));

  // Find message — only the recipient can mark it as read/unread
  const message = await db.message.findUnique({ where: { id } });
  if (!message) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (message.toUserId !== userId) {
    return NextResponse.json({ error: "فقط گیرنده می‌تواند پیام را به‌روزرسانی کند" }, { status: 403 });
  }

  const isRead = !!data.isRead;
  const updated = await db.message.update({
    where: { id },
    data: {
      isRead,
      readAt: isRead ? new Date() : null,
    },
  });

  return NextResponse.json({
    id: updated.id,
    isRead: updated.isRead,
    readAt: updated.readAt ? updated.readAt.toISOString() : null,
  });
}

// DELETE: Delete a message (sender or recipient can delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { id } = await params;

  const message = await db.message.findUnique({ where: { id } });
  if (!message) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (message.fromUserId !== userId && message.toUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.message.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
