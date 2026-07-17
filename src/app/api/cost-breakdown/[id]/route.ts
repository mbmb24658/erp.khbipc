import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await db.costBreakdown.findUnique({ where: { id }, include: { wbs: true } });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const existing = await db.costBreakdown.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  try {
    const c = await db.costBreakdown.update({
      where: { id },
      data: {
        costId: data.costId ?? existing.costId,
        rowNumber: data.rowNumber ?? existing.rowNumber,
        budgetType: data.budgetType ?? existing.budgetType,
        category: data.category ?? existing.category,
        description: data.description ?? existing.description,
        theme: data.theme ?? existing.theme,
        initialForecast: data.initialForecast ?? existing.initialForecast,
        programForecast: data.programForecast ?? existing.programForecast,
        percentTotal: data.percentTotal ?? existing.percentTotal,
        notes: data.notes ?? existing.notes,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
      },
    });
    return NextResponse.json(c);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await db.costBreakdown.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
