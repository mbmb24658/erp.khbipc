import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const activityId = searchParams.get("activityId");
  const items = await db.activityStatusUpdate.findMany({
    where: activityId ? { activityId } : undefined,
    include: { personel: true, activity: true },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.activityId || !data.newStatus) {
    return NextResponse.json({ error: "شناسه فعالیت و وضعیت جدید الزامی است" }, { status: 400 });
  }

  try {
    const activity = await db.activity.findUnique({ where: { id: data.activityId } });
    if (!activity) return NextResponse.json({ error: "فعالیت یافت نشد" }, { status: 404 });

    // Find personel from session user
    let personelId: string | null = null;
    const userId = (session.user as any).id;
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user?.personelId) personelId = user.personelId;
    }

    const update = await db.activityStatusUpdate.create({
      data: {
        activityId: data.activityId,
        personelId,
        previousStatus: activity.status,
        newStatus: data.newStatus,
        progressPct: data.progressPct ?? null,
        notes: data.notes || null,
      },
    });

    // Update the parent activity status + progress
    await db.activity.update({
      where: { id: data.activityId },
      data: {
        status: data.newStatus,
        progressPct: data.progressPct !== undefined ? data.progressPct : activity.progressPct,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity_status.update",
        description: `بروزرسانی وضعیت فعالیت ${activity.code} به ${data.newStatus}`,
      },
    });

    return NextResponse.json(update, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
