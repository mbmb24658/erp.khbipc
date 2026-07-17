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
  const item = await db.kPIAssignment.findUnique({
    where: { id },
    include: { kpi: true, personel: true, records: true },
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
  const existing = await db.kPIAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    const p = await db.kPIAssignment.update({
      where: { id },
      data: {
        kpiId: data.kpiId ?? existing.kpiId,
        personelId: data.personelId ?? existing.personelId,
        status: data.status ?? existing.status,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-assignment.update",
        description: `ویرایش تخصیص شاخص`,
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
  const existing = await db.kPIAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.kPIAssignment.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-assignment.delete",
        description: `حذف تخصیص شاخص`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
