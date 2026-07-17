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
  const items = await db.activityOrgChart.findMany({
    where: activityId ? { activityId } : undefined,
    include: { activity: true, orgChart: true },
    orderBy: [{ assignedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.activityId || !data.orgChartId) {
    return NextResponse.json({ error: "شناسه فعالیت و سمت سازمانی الزامی است" }, { status: 400 });
  }

  try {
    const ao = await db.activityOrgChart.create({
      data: {
        activityId: data.activityId,
        orgChartId: data.orgChartId,
        role: data.role || null,
      },
      include: { orgChart: true },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity_org.assign",
        description: `تخصیص سمت سازمانی ${ao.orgChart.position} به فعالیت`,
      },
    });

    return NextResponse.json(ao, { status: 201 });
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
  const orgChartId = searchParams.get("orgChartId");

  try {
    if (id) {
      await db.activityOrgChart.delete({ where: { id } });
    } else if (activityId && orgChartId) {
      await db.activityOrgChart.delete({
        where: { activityId_orgChartId: { activityId, orgChartId } },
      });
    } else {
      return NextResponse.json({ error: "شناسه مورد نیاز است" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
