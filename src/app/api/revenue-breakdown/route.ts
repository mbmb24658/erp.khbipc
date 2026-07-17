import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await db.revenueBreakdown.findMany({
    include: { wbs: true, asset: true },
    orderBy: [{ revenueId: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  if (!data.revenueId) return NextResponse.json({ error: "کد درآمد الزامی است" }, { status: 400 });
  const dup = await db.revenueBreakdown.findUnique({ where: { revenueId: data.revenueId } });
  if (dup) return NextResponse.json({ error: "کد تکراری است" }, { status: 400 });
  try {
    const r = await db.revenueBreakdown.create({
      data: {
        revenueId: data.revenueId,
        rowNumber: data.rowNumber || null,
        theme: data.theme || null,
        description: data.description || null,
        title: data.title || null,
        wbsCode: data.wbsCode || null,
        wbsId: data.wbsId || null,
        initialForecast: data.initialForecast ?? null,
        programForecast: data.programForecast ?? null,
        ownershipShare: data.ownershipShare ?? null,
        percentTotal: data.percentTotal ?? null,
        revenueType: data.revenueType || null,
        status: data.status || null,
        progressPct: data.progressPct ?? null,
        actualRevenue: data.actualRevenue ?? null,
        ev: data.ev ?? null,
        trlLevel: data.trlLevel ?? null,
        assetId: data.assetId || null,
        notes: data.notes || null,
      },
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
