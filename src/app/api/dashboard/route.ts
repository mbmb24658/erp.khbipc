import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { strategicTopicColors, strategicTopicLabels, strategicTopicOrder } from "@/lib/topic-colors";

export const dynamic = "force-dynamic";

// GET: aggregated dashboard overview data for the public organizational dashboard.
// Returns stats, PMS S-curves, financial summary, risk overview, issues overview,
// and personnel evaluation overview — all in one call.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---------- 1. STATS ----------
  const [wbsCount, personelCount, assetCount, openRiskCount] = await Promise.all([
    db.wBS.count(),
    db.personel.count(),
    db.asset.count(),
    db.risk.count({ where: { status: { in: ["open", "in_progress", "mitigating"] } } }),
  ]);

  // ---------- 2. PMS S-CURVES ----------
  // Root WBS (level 1) S-curve
  const wbsRoot = await db.wBS.findFirst({
    where: { level: 1 },
    orderBy: { wbsCode: "asc" },
    include: { monthlyProgress: { orderBy: { monthDate: "asc" } } },
  });

  const rootScurve = (wbsRoot?.monthlyProgress ?? []).map((m) => ({
    monthDate: m.monthDate.toISOString(),
    plannedPct: m.plannedPct,
    actualPct: m.actualPct,
  }));

  // Level-2 WBS topics (1.1 through 1.5)
  const level2WbsList = await db.wBS.findMany({
    where: { level: 2 },
    orderBy: { wbsCode: "asc" },
    include: { monthlyProgress: { orderBy: { monthDate: "asc" } } },
  });

  const topics = level2WbsList.map((wbs) => {
    const topic = wbs.strategicTopic || wbs.wbsCode;
    const label = strategicTopicLabels[topic] || wbs.title;
    return {
      topic,
      label: `${topic} - ${wbs.title}`,
      wbsCode: wbs.wbsCode,
      color: strategicTopicColors[topic]?.chart || "#94a3b8",
      progress: Math.round((wbs.progressActual || 0) * 100),
      scurve: wbs.monthlyProgress.map((m) => ({
        monthDate: m.monthDate.toISOString(),
        plannedPct: m.plannedPct,
        actualPct: m.actualPct,
      })),
    };
  });

  // ---------- 3. FINANCIAL OVERVIEW ----------
  const costs = await db.costBreakdown.findMany({
    where: {
      OR: [
        { programForecast: { gt: 0 } },
        { initialForecast: { gt: 0 } },
      ],
    },
  });

  const revenues = await db.revenueBreakdown.findMany({
    where: {
      OR: [
        { programForecast: { gt: 0 } },
        { initialForecast: { gt: 0 } },
      ],
    },
    include: { asset: true },
  });

  const totalCost = costs.reduce((s, c) => s + (c.programForecast || c.initialForecast || 0), 0);
  const totalRevenue = revenues.reduce((s, r) => s + (r.programForecast || r.initialForecast || 0), 0);

  // Group costs by category
  const costsByCategoryMap: Record<string, number> = {};
  for (const c of costs) {
    const cat = c.category || "سایر";
    costsByCategoryMap[cat] = (costsByCategoryMap[cat] || 0) + (c.programForecast || c.initialForecast || 0);
  }
  const costByCategory = Object.entries(costsByCategoryMap)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Group revenues by theme
  const revenuesByThemeMap: Record<string, number> = {};
  for (const r of revenues) {
    const theme = r.theme || "سایر";
    revenuesByThemeMap[theme] = (revenuesByThemeMap[theme] || 0) + (r.programForecast || r.initialForecast || 0);
  }
  const revenueByTheme = Object.entries(revenuesByThemeMap)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ---------- 4. RISK OVERVIEW ----------
  const allRisks = await db.risk.findMany({
    select: {
      id: true,
      status: true,
      riskType: true,
      evaluations: {
        orderBy: { evaluatedAt: "desc" },
        take: 1,
        select: { impactType: true },
      },
    },
  });

  // positiveCount / negativeCount: based on latest evaluation's impactType per risk
  let positiveCount = 0;
  let negativeCount = 0;
  for (const r of allRisks) {
    const lastEval = r.evaluations[0];
    const impactType = lastEval?.impactType || r.riskType || "منفی";
    if (impactType === "مثبت") {
      positiveCount++;
    } else {
      negativeCount++;
    }
  }

  // By status
  const statusMap: Record<string, number> = {};
  for (const r of allRisks) {
    const s = r.status || "open";
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  const statusLabels: Record<string, string> = {
    open: "باز",
    in_progress: "در حال انجام",
    mitigating: "در حال کاهش",
    closed: "بسته شده",
    resolved: "حل شده",
  };
  const byStatus = Object.entries(statusMap).map(([key, count]) => ({
    key,
    label: statusLabels[key] || key,
    count,
  }));

  // ---------- 5. ISSUES OVERVIEW ----------
  // High-level: total, critical (high importance + low feasibility), byTopic
  const wbsItems = await db.wBS.findMany({
    where: { level: { gte: 4 } },
    select: {
      id: true,
      urgency: true,
      priority: true,
      progressActual: true,
      hrPlan: true,
      strategicTopic: true,
    },
  });

  const activities = await db.activity.findMany({
    select: {
      id: true,
      urgency: true,
      priority: true,
      progressPct: true,
      hrPlan: true,
      strategicTopic: true,
    },
  });

  const urgencyWeight: Record<string, number> = {
    low: 1,
    normal: 2,
    high: 3,
    urgent: 4,
  };
  const HIGH_IMPORTANCE_THRESHOLD = 12;
  const LOW_FEASIBILITY_THRESHOLD = 0.3;

  // Collect all org IDs from hrPlan
  const allOrgIds = new Set<string>();
  for (const c of [...wbsItems, ...activities]) {
    if (!c.hrPlan) continue;
    try {
      const ids: unknown = JSON.parse(c.hrPlan);
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") allOrgIds.add(id);
        }
      }
    } catch {
      // ignore
    }
  }

  const personnel = await db.personel.findMany({
    where: { orgChartId: { in: Array.from(allOrgIds) } },
    select: { id: true, orgChartId: true, user: { select: { id: true } } },
  });
  const personnelByOrg = new Map<string, { total: number; withUser: number }>();
  for (const p of personnel) {
    if (!p.orgChartId) continue;
    const entry = personnelByOrg.get(p.orgChartId) || { total: 0, withUser: 0 };
    entry.total += 1;
    if (p.user) entry.withUser += 1;
    personnelByOrg.set(p.orgChartId, entry);
  }

  type IssueAgg = {
    id: string;
    importance: number;
    feasibility: number;
    strategicTopic: string | null;
  };

  const issues: IssueAgg[] = [];
  for (const c of wbsItems) {
    const uWeight = urgencyWeight[c.urgency || "normal"] ?? urgencyWeight.normal;
    const importance = uWeight * (c.priority ?? 3);
    let feasibility = 1;
    if (c.hrPlan) {
      let orgIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(c.hrPlan);
        if (Array.isArray(parsed)) {
          orgIds = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        // ignore
      }
      if (orgIds.length > 0) {
        let personnelInPositions = 0;
        let usersFound = 0;
        for (const oid of orgIds) {
          const entry = personnelByOrg.get(oid);
          if (entry) {
            personnelInPositions += entry.total;
            usersFound += entry.withUser;
          }
        }
        if (personnelInPositions === 0) {
          feasibility = (c.progressActual ?? 0) > 0 ? 0.5 : 0;
        } else {
          feasibility = usersFound / personnelInPositions;
        }
      }
    }
    const issueScore = importance * (1 - feasibility);
    if (issueScore <= 0) continue;
    issues.push({
      id: c.id,
      importance,
      feasibility,
      strategicTopic: c.strategicTopic || null,
    });
  }
  for (const a of activities) {
    const uWeight = urgencyWeight[a.urgency || "normal"] ?? urgencyWeight.normal;
    const importance = uWeight * (a.priority ?? 3);
    let feasibility = 1;
    if (a.hrPlan) {
      let orgIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(a.hrPlan);
        if (Array.isArray(parsed)) {
          orgIds = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        // ignore
      }
      if (orgIds.length > 0) {
        let personnelInPositions = 0;
        let usersFound = 0;
        for (const oid of orgIds) {
          const entry = personnelByOrg.get(oid);
          if (entry) {
            personnelInPositions += entry.total;
            usersFound += entry.withUser;
          }
        }
        if (personnelInPositions === 0) {
          feasibility = (a.progressPct ?? 0) > 0 ? 0.5 : 0;
        } else {
          feasibility = usersFound / personnelInPositions;
        }
      }
    }
    const issueScore = importance * (1 - feasibility);
    if (issueScore <= 0) continue;
    issues.push({
      id: a.id,
      importance,
      feasibility,
      strategicTopic: a.strategicTopic || null,
    });
  }

  const totalIssues = issues.length;
  const criticalIssues = issues.filter(
    (i) => i.importance >= HIGH_IMPORTANCE_THRESHOLD && i.feasibility < LOW_FEASIBILITY_THRESHOLD
  ).length;

  // byTopic — count issues per strategic topic (1.1 - 1.5 + "سایر")
  const topicMap: Record<string, number> = {};
  for (const t of strategicTopicOrder) topicMap[t] = 0;
  topicMap["سایر"] = 0;
  for (const i of issues) {
    const key = i.strategicTopic && strategicTopicOrder.includes(i.strategicTopic)
      ? i.strategicTopic
      : "سایر";
    topicMap[key] = (topicMap[key] || 0) + 1;
  }
  const issuesByTopic = Object.entries(topicMap).map(([topic, count]) => ({
    topic,
    label: strategicTopicLabels[topic] || topic,
    color: strategicTopicColors[topic]?.chart || "#94a3b8",
    count,
  }));

  // ---------- 6. PERSONNEL EVALUATION OVERVIEW ----------
  // This month's KPI evaluations
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const evaluationsThisMonth = await db.kPIEvaluation.findMany({
    where: {
      evaluatedAt: { gte: startOfMonth, lte: endOfMonth },
      percentageScore: { not: null },
    },
    select: {
      id: true,
      percentageScore: true,
      totalScore: true,
      maxScore: true,
      personelId: true,
      orgChartId: true,
      orgChart: { select: { position: true } },
      personel: { select: { name: true } },
    },
  });

  const thisMonthCount = evaluationsThisMonth.length;
  const validScores = evaluationsThisMonth
    .map((e) => e.percentageScore ?? (e.totalScore && e.maxScore ? (e.totalScore / e.maxScore) * 100 : null))
    .filter((s): s is number => s != null && !isNaN(s));
  const avgScore =
    validScores.length > 0
      ? Math.round((validScores.reduce((s, v) => s + v, 0) / validScores.length) * 10) / 10
      : 0;

  // Average score by position
  const byPositionMap: Record<string, { sum: number; count: number }> = {};
  for (const e of evaluationsThisMonth) {
    const score = e.percentageScore ?? (e.totalScore && e.maxScore ? (e.totalScore / e.maxScore) * 100 : null);
    if (score == null || isNaN(score)) continue;
    const pos = e.orgChart?.position || (e.personel ? "بدون سمت" : "نامشخص");
    if (!byPositionMap[pos]) byPositionMap[pos] = { sum: 0, count: 0 };
    byPositionMap[pos].sum += score;
    byPositionMap[pos].count += 1;
  }
  const byPosition = Object.entries(byPositionMap)
    .map(([position, v]) => ({
      position,
      avgScore: Math.round((v.sum / v.count) * 10) / 10,
      count: v.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  return NextResponse.json({
    stats: { wbsCount, personelCount, assetCount, openRiskCount },
    pms: {
      rootScurve,
      rootProgress: wbsRoot ? Math.round((wbsRoot.progressActual || 0) * 100) : 0,
      rootPlan: wbsRoot ? Math.round((wbsRoot.progressPlan || 0) * 100) : 0,
      topics,
    },
    financial: {
      totalCost: Math.round(totalCost),
      totalRevenue: Math.round(totalRevenue),
      costByCategory,
      revenueByTheme,
    },
    risk: {
      positiveCount,
      negativeCount,
      byStatus,
    },
    issues: {
      total: totalIssues,
      critical: criticalIssues,
      byTopic: issuesByTopic,
    },
    evaluation: {
      thisMonthCount,
      avgScore,
      byPosition,
    },
  });
}
