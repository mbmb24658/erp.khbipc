import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const riskId = searchParams.get("riskId");
  const period = searchParams.get("period");

  const items = await db.riskEvaluation.findMany({
    where: {
      ...(riskId ? { riskId } : {}),
      ...(period ? { period } : {}),
    },
    include: {
      risk: true,
      evaluatedBy: true,
    },
    orderBy: [{ evaluatedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  if (!data.riskId || !data.period) {
    return NextResponse.json({ error: "ریسک و دوره الزامی است" }, { status: 400 });
  }

  // Find evaluator from session user
  let evaluatedById: string | null = null;
  const userId = (session.user as any).id;
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user?.personelId) evaluatedById = user.personelId;
  }

  // Compute levels using heat map
  const levelCurrent = riskLevel(data.impactCurrent, data.probabilityCurrent);
  const levelTarget = riskLevel(data.impactTarget, data.probabilityTarget);

  try {
    const ev = await db.riskEvaluation.create({
      data: {
        riskId: data.riskId,
        period: data.period,
        periodType: data.periodType || "monthly",
        impactCurrent: data.impactCurrent || null,
        probabilityCurrent: data.probabilityCurrent || null,
        levelCurrent,
        impactTarget: data.impactTarget || null,
        probabilityTarget: data.probabilityTarget || null,
        levelTarget,
        response: data.response || null,
        impactType: data.impactType || "منفی",
        physicalProgress: data.physicalProgress ?? null,
        notes: data.notes || null,
        evaluatedById,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk_evaluation.create",
        description: `ایجاد ارزیابی ریسک برای دوره ${data.period}`,
      },
    });

    return NextResponse.json(ev, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
