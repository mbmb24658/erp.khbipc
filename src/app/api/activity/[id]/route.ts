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

  const { id } = await params;
  const item = await db.activity.findUnique({
    where: { id },
    include: {
      asset: true,
      wbs: true,
      personAssignments: { include: { personel: true } },
      orgAssignments: { include: { orgChart: true } },
      statusUpdates: {
        include: { personel: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const existing = await db.activity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.activity.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد فعالیت تکراری است" }, { status: 400 });
  }

  try {
    const a = await db.activity.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        description: data.description === undefined ? existing.description : data.description || null,
        assetId: data.assetId === undefined ? existing.assetId : data.assetId || null,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
        durationDays: data.durationDays ?? existing.durationDays,
        urgency: data.urgency ?? existing.urgency,
        priority: data.priority ?? existing.priority,
        status: data.status ?? existing.status,
        progressPct: data.progressPct ?? existing.progressPct,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity.update",
        description: `ویرایش فعالیت ${a.code}: ${a.title}`,
      },
    });

    return NextResponse.json(a);
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
  const existing = await db.activity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.activity.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity.delete",
        description: `حذف فعالیت ${existing.code}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
