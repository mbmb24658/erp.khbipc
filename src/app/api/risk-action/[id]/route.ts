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
  const item = await db.riskAction.findUnique({
    where: { id },
    include: { risk: true, assignedTo: true },
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
  const existing = await db.riskAction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    const p = await db.riskAction.update({
      where: { id },
      data: {
        riskId: data.riskId ?? existing.riskId,
        title: data.title ?? existing.title,
        description: data.description === undefined ? existing.description : data.description || null,
        status: data.status ?? existing.status,
        assignedToId: data.assignedToId === undefined ? existing.assignedToId : data.assignedToId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
        completedDate: data.completedDate ? new Date(data.completedDate) : existing.completedDate,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk-action.update",
        description: `ویرایش اقدام ریسک`,
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
  const existing = await db.riskAction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.riskAction.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk-action.delete",
        description: `حذف اقدام ریسک`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
