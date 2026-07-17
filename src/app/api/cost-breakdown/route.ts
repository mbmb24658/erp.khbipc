import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await db.costBreakdown.findMany({
    include: { wbs: true, _count: { select: { personels: true, budgets: true } } },
    orderBy: [{ costId: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  if (!data.costId) return NextResponse.json({ error: "کد هزینه الزامی است" }, { status: 400 });
  const dup = await db.costBreakdown.findUnique({ where: { costId: data.costId } });
  if (dup) return NextResponse.json({ error: "کد تکراری است" }, { status: 400 });
  try {
    const c = await db.costBreakdown.create({
      data: {
        costId: data.costId,
        rowNumber: data.rowNumber || null,
        budgetType: data.budgetType || null,
        category: data.category || null,
        description: data.description || null,
        theme: data.theme || null,
        initialForecast: data.initialForecast ?? null,
        programForecast: data.programForecast ?? null,
        percentTotal: data.percentTotal ?? null,
        notes: data.notes || null,
        wbsId: data.wbsId || null,
      },
    });
    return NextResponse.json(c, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
