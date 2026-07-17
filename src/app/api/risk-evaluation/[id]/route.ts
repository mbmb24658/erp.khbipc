import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Heat map computation helper (negative impact)
const impactMap: Record<string, number> = { اساسی: 5, عمده: 4, متوسط: 3, جزئی: 2, ناچیز: 1 };
const probMap: Record<string, number> = { نادر: 1, بعید: 2, ممکن: 3, محتمل: 4, مکرر: 5 };
const heatMap: Record<number, Record<number, string>> = {
  5: { 1: "Medium", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  4: { 1: "Low", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  3: { 1: "Low", 2: "Medium", 3: "Medium", 4: "High", 5: "High" },
  2: { 1: "Low", 2: "Medium", 3: "Medium", 4: "Medium", 5: "Medium" },
  1: { 1: "Low", 2: "Low", 3: "Low", 4: "Low", 5: "Medium" },
};
function riskLevel(impactStr: string, probStr: string): string | null {
  const i = impactMap[impactStr];
  const p = probMap[probStr];
  if (!i || !p) return null;
  return heatMap[i][p];
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await req.json();
  const existing = await db.riskEvaluation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Recompute levels if impact/probability changed
  const impactCurrent = data.impactCurrent ?? existing.impactCurrent;
  const probabilityCurrent = data.probabilityCurrent ?? existing.probabilityCurrent;
  const impactTarget = data.impactTarget ?? existing.impactTarget;
  const probabilityTarget = data.probabilityTarget ?? existing.probabilityTarget;
  const levelCurrent = riskLevel(impactCurrent || "", probabilityCurrent || "");
  const levelTarget = riskLevel(impactTarget || "", probabilityTarget || "");

  try {
    const ev = await db.riskEvaluation.update({
      where: { id },
      data: {
        period: data.period ?? existing.period,
        periodType: data.periodType ?? existing.periodType,
        impactCurrent,
        probabilityCurrent,
        levelCurrent,
        impactTarget,
        probabilityTarget,
        levelTarget,
        response: data.response ?? existing.response,
        impactType: data.impactType ?? existing.impactType,
        physicalProgress: data.physicalProgress ?? existing.physicalProgress,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
      },
    });
    return NextResponse.json(ev);
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
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await db.riskEvaluation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
