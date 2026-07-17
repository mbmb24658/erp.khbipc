import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  const { id } = await params;
  const item = await db.notification.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Non-admin users can only see their own notifications
  if (role !== "admin" && item.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(item);
}

// PUT: Update a notification
// Special case: any user can mark their OWN notification as read/unread
// Other fields (title, message, etc.) require admin/moderator
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  const { id } = await params;
  const data = await req.json();
  const existing = await db.notification.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Check if this is a "mark as read" operation (only isRead field changing)
  const isMarkAsReadOperation =
    data.isRead !== undefined &&
    Object.keys(data).every((k) => k === "isRead" || k === "readAt");

  if (isMarkAsReadOperation) {
    // Any user can mark their OWN notification as read
    if (role !== "admin" && existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Other modifications require admin/moderator
    const { isAuthorized, error } = await checkWriteAccess();
    if (!isAuthorized) {
      return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });
    }
  }

  try {
    const p = await db.notification.update({
      where: { id },
      data: {
        templateId: data.templateId === undefined ? existing.templateId : data.templateId || null,
        userId: data.userId === undefined ? existing.userId : data.userId || null,
        title: data.title ?? existing.title,
        message: data.message ?? existing.message,
        category: data.category === undefined ? existing.category : data.category || null,
        priority: data.priority ?? existing.priority,
        isRead: data.isRead ?? existing.isRead,
        readAt: data.isRead && !existing.isRead ? new Date() : existing.readAt,
        actionUrl: data.actionUrl === undefined ? existing.actionUrl : data.actionUrl || null,
      },
    });
    return NextResponse.json(p);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.notification.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.notification.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
