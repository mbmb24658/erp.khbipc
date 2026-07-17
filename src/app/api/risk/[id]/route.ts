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
  const item = await db.risk.findUnique({
    where: { id },
    include: {
      wbs: true,
      asset: true,
      identifiedBy: true,
      actions: { include: { assignedTo: true } },
      history: { include: { changedBy: true }, orderBy: [{ changeDate: "desc" }] },
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
  const existing = await db.risk.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.risk.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد ریسک تکراری است" }, { status: 400 });
  }

  const probability = data.probability != null ? Number(data.probability) : existing.probability;
  const impact = data.impact != null ? Number(data.impact) : existing.impact;
  const severity = (probability != null && impact != null) ? probability * impact : existing.severity;

  try {
    const p = await db.risk.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        description: data.description === undefined ? existing.description : data.description || null,
        category: data.category === undefined ? existing.category : data.category || null,
        status: data.status ?? existing.status,
        probability: probability,
        impact: impact,
        severity: severity,
        riskType: data.riskType === undefined ? existing.riskType : data.riskType || null,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        assetId: data.assetId === undefined ? existing.assetId : data.assetId || null,
        identifiedById: data.identifiedById === undefined ? existing.identifiedById : data.identifiedById || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
        resolutionDate: data.resolutionDate ? new Date(data.resolutionDate) : existing.resolutionDate,
      },
    });

    // Record status change in history
    if (data.status && data.status !== existing.status) {
      await db.riskHistory.create({
        data: {
          riskId: p.id,
          changeType: "status_change",
          oldValue: existing.status,
          newValue: data.status,
          changedById: (session.user as any).id,
        },
      });
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk.update",
        description: `ویرایش ریسک ${p.code}: ${p.title}`,
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
  const existing = await db.risk.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.risk.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk.delete",
        description: `حذف ریسک ${existing.code}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
