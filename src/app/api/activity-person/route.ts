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
  const items = await db.activityPerson.findMany({
    where: activityId ? { activityId } : undefined,
    include: { activity: true, personel: true },
    orderBy: [{ assignedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.activityId || !data.personelId) {
    return NextResponse.json({ error: "شناسه فعالیت و پرسنل الزامی است" }, { status: 400 });
  }

  try {
    const ap = await db.activityPerson.create({
      data: {
        activityId: data.activityId,
        personelId: data.personelId,
        role: data.role || null,
      },
      include: { personel: true },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity_person.assign",
        description: `تخصیص پرسنل ${ap.personel.name} به فعالیت`,
      },
    });

    return NextResponse.json(ap, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const activityId = searchParams.get("activityId");
  const personelId = searchParams.get("personelId");

  try {
    if (id) {
      await db.activityPerson.delete({ where: { id } });
    } else if (activityId && personelId) {
      await db.activityPerson.delete({
        where: { activityId_personelId: { activityId, personelId } },
      });
    } else {
      return NextResponse.json({ error: "شناسه مورد نیاز است" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
