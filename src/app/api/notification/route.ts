import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// GET: List notifications
// - admin: sees all notifications
// - moderator/user: sees only their own notifications (where userId matches)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  const { searchParams } = new URL(req.url);
  const onlyUnread = searchParams.get("unread") === "true";

  const where: any = {};
  // Non-admin users only see their own notifications
  if (role !== "admin") {
    where.userId = userId;
  }
  if (onlyUnread) {
    where.isRead = false;
  }

  const items = await db.notification.findMany({
    where,
    include: { template: true },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

// POST: Create a notification (admin + moderator only)
export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.title || !data.message) {
    return NextResponse.json({ error: "عنوان و پیام الزامی است" }, { status: 400 });
  }

  try {
    const p = await db.notification.create({
      data: {
        templateId: data.templateId || null,
        userId: data.userId || null,
        title: data.title,
        message: data.message,
        category: data.category || null,
        priority: data.priority || "normal",
        isRead: data.isRead ?? false,
        actionUrl: data.actionUrl || null,
      },
    });
    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
