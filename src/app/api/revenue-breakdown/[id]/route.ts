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
  const item = await db.revenueBreakdown.findUnique({ where: { id }, include: { wbs: true, asset: true } });
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
  const existing = await db.revenueBreakdown.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  try {
    const r = await db.revenueBreakdown.update({
      where: { id },
      data: {
        revenueId: data.revenueId ?? existing.revenueId,
        rowNumber: data.rowNumber ?? existing.rowNumber,
        theme: data.theme ?? existing.theme,
        description: data.description ?? existing.description,
        title: data.title ?? existing.title,
        wbsCode: data.wbsCode ?? existing.wbsCode,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        initialForecast: data.initialForecast ?? existing.initialForecast,
        programForecast: data.programForecast ?? existing.programForecast,
        ownershipShare: data.ownershipShare ?? existing.ownershipShare,
        percentTotal: data.percentTotal ?? existing.percentTotal,
        revenueType: data.revenueType ?? existing.revenueType,
        status: data.status ?? existing.status,
        progressPct: data.progressPct ?? existing.progressPct,
        actualRevenue: data.actualRevenue ?? existing.actualRevenue,
        ev: data.ev ?? existing.ev,
        trlLevel: data.trlLevel ?? existing.trlLevel,
        assetId: data.assetId === undefined ? existing.assetId : data.assetId || null,
        notes: data.notes ?? existing.notes,
      },
    });

    // If assetActualValue is provided, update the linked asset's actualValue too
    if (data.assetActualValue !== undefined && data.assetActualValue !== null && r.assetId) {
      await db.asset.update({
        where: { id: r.assetId },
        data: { actualValue: Number(data.assetActualValue) },
      });
    }

    return NextResponse.json(r);
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
    await db.revenueBreakdown.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
