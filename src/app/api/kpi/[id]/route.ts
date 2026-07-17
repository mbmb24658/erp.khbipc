import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.kPI.findUnique({
    where: { id },
    include: { wbs: true, orgChart: true, assignments: { include: { personel: true } } },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const existing = await db.kPI.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.kPI.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد شاخص تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.kPI.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        description: data.description === undefined ? existing.description : data.description || null,
        category: data.category === undefined ? existing.category : data.category || null,
        weight: data.weight ?? existing.weight,
        targetValue: data.targetValue ?? existing.targetValue,
        unit: data.unit === undefined ? existing.unit : data.unit || null,
        frequency: data.frequency === undefined ? existing.frequency : data.frequency || null,
        orgChartId: data.orgChartId === undefined ? existing.orgChartId : data.orgChartId || null,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        status: data.status ?? existing.status,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi.update",
        description: `ویرایش شاخص ${p.code}: ${p.title}`,
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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.kPI.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.kPI.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi.delete",
        description: `حذف شاخص ${existing.code}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
