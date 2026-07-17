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
  const item = await db.kPIRecord.findUnique({
    where: { id },
    include: { assignment: { include: { kpi: true, personel: true } }, confirmedBy: true },
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
  const existing = await db.kPIRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    const p = await db.kPIRecord.update({
      where: { id },
      data: {
        assignmentId: data.assignmentId ?? existing.assignmentId,
        recordDate: data.recordDate ? new Date(data.recordDate) : existing.recordDate,
        value: data.value !== undefined ? Number(data.value) : existing.value,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
        confirmedById: data.confirmedById === undefined ? existing.confirmedById : data.confirmedById || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-record.update",
        description: `ویرایش رکورد شاخص`,
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
  const existing = await db.kPIRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.kPIRecord.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-record.delete",
        description: `حذف رکورد شاخص`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
