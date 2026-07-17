import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get("templateId");
  const orgChartId = searchParams.get("orgChartId");
  const personelId = searchParams.get("personelId");

  const items = await db.kPIEvaluation.findMany({
    where: {
      ...(templateId ? { templateId } : {}),
      ...(orgChartId ? { orgChartId } : {}),
      ...(personelId ? { personelId } : {}),
    },
    include: {
      template: true,
      personel: true,
      orgChart: true,
      evaluatedBy: true,
      _count: { select: { records: true } },
    },
    orderBy: [{ evaluatedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  if (!data.templateId || !data.period) {
    return NextResponse.json({ error: "الگو و دوره الزامی است" }, { status: 400 });
  }

  try {
    // Find personel from session user
    let personelId: string | null = data.personelId || null;
    if (!personelId) {
      const userId = (session.user as any).id;
      if (userId) {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (user?.personelId) personelId = user.personelId;
      }
    }

    // Find evaluator from session user
    let evaluatedById: string | null = null;
    const userId = (session.user as any).id;
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user?.personelId) evaluatedById = user.personelId;
    }

    // Compute total score from records
    let totalScore = 0;
    let maxScore = 0;
    const records: any[] = data.records || [];

    // Create evaluation with records
    const evaluation = await db.kPIEvaluation.create({
      data: {
        templateId: data.templateId,
        personelId,
        orgChartId: data.orgChartId || null,
        period: data.period,
        periodType: data.periodType || "monthly",
        status: data.status || "draft",
        notes: data.notes || null,
        evaluatedById,
        records: {
          create: records.map((r: any) => {
            const value = Number(r.value || 0);
            const target = r.targetValue ? Number(r.targetValue) : null;
            const weight = r.weight ? Number(r.weight) : 1;
            let score: number | null = null;
            if (target && target > 0) {
              score = Math.min(100, (value / target) * 100);
            }
            if (score != null) {
              totalScore += score * weight;
              maxScore += 100 * weight;
            }
            return {
              indicatorId: r.indicatorId,
              value,
              targetValue: target,
              score,
              weight,
              notes: r.notes || null,
            };
          }),
        },
      },
      include: { records: true },
    });

    // Update total/percentage score
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : null;
    await db.kPIEvaluation.update({
      where: { id: evaluation.id },
      data: {
        totalScore: totalScore > 0 ? totalScore : null,
        maxScore: maxScore > 0 ? maxScore : null,
        percentageScore: percentage,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi_evaluation.create",
        description: `ایجاد ارزیابی برای دوره ${data.period}`,
      },
    });

    return NextResponse.json(evaluation, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
