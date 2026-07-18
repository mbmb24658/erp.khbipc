import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/kpi-evaluation/auto-evaluate
// Body: { orgChartId, period }
//
// Builds a KPIEvaluation automatically based on the average plan deviation of
// WBS activities whose `requiredOrgPositionId` matches the given orgChartId.
//   deviation (0..1) = average of (progressPlan - progressActual)
//   score = clamp(100 - deviation * 100, 0, 100)
// All indicators of the linked template get the same score.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const { orgChartId, period } = data;
  if (!orgChartId || !period) {
    return NextResponse.json(
      { error: "orgChartId و period الزامی است" },
      { status: 400 }
    );
  }

  // 1) Find the org chart and its linked HR template
  const orgChart = await db.orgChart.findUnique({ where: { id: orgChartId } });
  if (!orgChart) {
    return NextResponse.json({ error: "سمت سازمانی یافت نشد" }, { status: 404 });
  }
  if (!orgChart.hrPositionId) {
    return NextResponse.json(
      { error: "الگوی HR برای این سمت متصل نیست" },
      { status: 400 }
    );
  }

  const template = await db.kPITemplate.findUnique({
    where: { positionCode: orgChart.hrPositionId },
    include: {
      categories: {
        orderBy: { order: "asc" },
        include: { indicators: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!template) {
    return NextResponse.json(
      { error: "الگوی KPI متناظر با این سمت یافت نشد" },
      { status: 404 }
    );
  }

  // 2) Find all WBS where this org chart is the required org position
  const wbsItems = await db.wBS.findMany({
    where: { requiredOrgPositionId: orgChartId },
    select: { progressPlan: true, progressActual: true },
  });

  // 3) Compute average deviation (in 0..1)
  //    deviation = max(0, progressPlan - progressActual) per WBS, then averaged.
  //    We clamp at 0 because if actual > plan (over-performing) the deviation is 0.
  let averageDeviation = 0;
  if (wbsItems.length > 0) {
    const sum = wbsItems.reduce((acc, w) => {
      const dev = (w.progressPlan ?? 0) - (w.progressActual ?? 0);
      return acc + Math.max(0, dev);
    }, 0);
    averageDeviation = sum / wbsItems.length;
    // Clamp to [0, 1] since progress values are stored as 0..1
    if (averageDeviation < 0) averageDeviation = 0;
    if (averageDeviation > 1) averageDeviation = 1;
  }

  // 4) Score = clamp(100 - averageDeviation * 100, 0, 100)
  const score = Math.max(0, Math.min(100, 100 - averageDeviation * 100));

  // 5) Find evaluator from session user (optional)
  let evaluatedById: string | null = null;
  const userId = (session.user as any).id;
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user?.personelId) evaluatedById = user.personelId;
  }

  // 6) Build records for every indicator (value = score, targetValue = 100)
  const records: { indicatorId: string; value: number; targetValue: number; score: number; weight: number }[] = [];
  for (const cat of template.categories) {
    for (const ind of cat.indicators) {
      records.push({
        indicatorId: ind.id,
        value: score,
        targetValue: 100,
        score,
        weight: ind.weight ?? 1,
      });
    }
  }

  // 7) Compute weighted totals
  let totalScore = 0;
  let maxScore = 0;
  for (const r of records) {
    totalScore += r.score * r.weight;
    maxScore += 100 * r.weight;
  }
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : null;

  try {
    const evaluation = await db.kPIEvaluation.create({
      data: {
        templateId: template.id,
        orgChartId: orgChart.id,
        personelId: null,
        period,
        periodType: "monthly",
        status: "submitted",
        notes: `ارزیابی خودکار بر اساس انحراف برنامه WBS — میانگین انحراف: ${(averageDeviation * 100).toFixed(2)}٪، امتیاز محاسبه‌شده: ${score.toFixed(2)}٪`,
        evaluatedById,
        records: {
          create: records.map((r) => ({
            indicatorId: r.indicatorId,
            value: r.value,
            targetValue: r.targetValue,
            score: r.score,
            weight: r.weight,
            notes: "محاسبه خودکار بر اساس انحراف",
          })),
        },
      },
      include: { records: true },
    });

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
        action: "kpi_evaluation.auto_evaluate",
        description: `ارزیابی خودکار برای سمت ${orgChart.position} در دوره ${period}`,
      },
    });

    return NextResponse.json(
      {
        evaluation,
        averageDeviation,
        score,
        wbsCount: wbsItems.length,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
