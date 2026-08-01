import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardCharts, type DashboardData } from "./dashboard-charts";

export const dynamic = "force-dynamic";

// =====================================================================
// Organizational Dashboard — server component
// Layout:
//   Row 1: Header + 4 KPI cards
//   Row 2: 2/3 Trend chart + 1/3 Top revenue assets
//   Row 3: Personnel performance (only users with login accounts)
//   Row 4: Strategic topic S-curves (1.1 - 1.5)
//   Row 5: Risk overview + heatmap
//   Row 6: Recent activities table
// =====================================================================
export default async function PublicDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        لطفاً وارد شوید
      </div>
    );
  }

  const [data] = await Promise.all([fetchDashboardData()]);
  return <DashboardCharts data={data} />;
}

// =====================================================================
// Helper: parse JSON array safely
// =====================================================================
function parseIdArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// =====================================================================
// fetchDashboardData — all DB queries in parallel
// =====================================================================
async function fetchDashboardData(): Promise<DashboardData> {
  const [
    wbsCount,
    personelCount,
    assetCount,
    openRiskCount,
    rootWbs,
    totalCost,
    totalRevenue,
    recentActivities,
    recentWbs,
    personnel,
    users,
    level2Wbs,
    riskEvaluations,
    risks,
    revenueRows,
  ] = await Promise.all([
    db.wBS.count(),
    db.personel.count(),
    db.asset.count(),
    db.risk.count({ where: { status: { in: ["open", "in_progress", "mitigating"] } } }),
    db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } }),
    db.costBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.revenueBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.activity.findMany({
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: {
        personAssignments: { include: { personel: { select: { name: true } } } },
      },
    }),
    db.wBS.findMany({
      where: { level: { gte: 4 } },
      take: 10,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        wbsCode: true,
        title: true,
        progressActual: true,
        updatedAt: true,
        hrActual: true,
      },
    }),
    // Personnel with linked User account only (those who have username/password)
    db.personel.findMany({
      where: { user: { isNot: null } },
      include: {
        orgChart: { select: { id: true, position: true } },
        user: { select: { id: true, lastLoginAt: true, lastActivityAt: true } },
        activityAssignments: {
          include: {
            activity: {
              select: {
                id: true,
                progressPct: true,
                isCorrective: true,
                delayCauseId: true,
                status: true,
                hrPlan: true,
                hrActual: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    // All users (for log counts)
    db.user.findMany({
      where: { personelId: { not: null } },
      select: {
        id: true,
        personelId: true,
        logs: {
          select: { id: true, createdAt: true },
          take: 100,
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    // Level-2 WBS (strategic topics 1.1 - 1.5) with monthly progress
    db.wBS.findMany({
      where: { level: 2 },
      orderBy: { wbsCode: "asc" },
      include: { monthlyProgress: { orderBy: { monthDate: "asc" } } },
    }),
    // Risk evaluations (latest per risk)
    db.riskEvaluation.findMany({
      orderBy: [{ evaluatedAt: "desc" }],
      take: 500,
    }),
    // All risks for type distribution
    db.risk.findMany({
      select: { id: true, code: true, riskType: true, status: true },
    }),
    // Revenue breakdown joined with assets
    db.revenueBreakdown.findMany({
      where: { programForecast: { gt: 0 } },
      select: {
        id: true,
        programForecast: true,
        actualRevenue: true,
        title: true,
        description: true,
        theme: true,
        asset: { select: { id: true, title: true, assetId: true } },
      },
      take: 200,
    }),
  ]);

  // Root S-curve
  const rootMonthlyProgress = rootWbs
    ? await db.wBSMonthlyProgress.findMany({
        where: { wbsId: rootWbs.id },
        orderBy: { monthDate: "asc" },
      })
    : [];

  // ===== Top revenue assets (aggregated by asset) =====
  const assetRevenueMap = new Map<string, { name: string; value: number }>();
  for (const r of revenueRows) {
    if (!r.asset) continue;
    const assetId = r.asset.id;
    const assetName = r.asset.title || r.asset.assetId || "نامشخص";
    const value = r.actualRevenue || r.programForecast || 0;
    const existing = assetRevenueMap.get(assetId);
    if (existing) {
      existing.value += value;
    } else {
      assetRevenueMap.set(assetId, { name: assetName, value });
    }
  }
  const topAssets = Array.from(assetRevenueMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Also aggregate cost by category for fallback
  const costByCategory: { name: string; value: number }[] = [];

  // ===== Recent items (merge activities + WBS) =====
  const activityItems = recentActivities.map((a) => ({
    id: a.id,
    code: a.code,
    title: a.title,
    status: a.status,
    progressPct: (a.progressPct || 0) * 100,
    updatedAt: a.updatedAt.toISOString(),
    type: "activity" as const,
    assigneeName: a.personAssignments[0]?.personel?.name || null,
  }));

  const wbsItems = recentWbs.map((w) => ({
    id: w.id,
    code: w.wbsCode,
    title: w.title,
    status: "pending" as const,
    progressPct: Math.round((w.progressActual || 0) * 100),
    updatedAt: w.updatedAt.toISOString(),
    type: "pms" as const,
    assigneeName: null as string | null,
  }));

  const recentItems = [...activityItems, ...wbsItems]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  // ===== User log counts (presence) in last 30 days =====
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userLogCounts = new Map<string, number>();
  for (const u of users) {
    const recentLogs = u.logs.filter((l) => new Date(l.createdAt) >= thirtyDaysAgo);
    if (u.personelId) {
      userLogCounts.set(u.personelId, recentLogs.length);
    }
  }

  // ===== Fetch WBS activities for each personnel (where personelId is in hrActual) =====
  // We need this to count PMS activities per person
  const personnelIds = personnel.map((p) => p.id);
  const allWbsForPersonnel = await db.wBS.findMany({
    where: { level: { gte: 4 } },
    select: {
      id: true,
      wbsCode: true,
      title: true,
      progressActual: true,
      progressPlan: true,
      hrActual: true,
      hrPlan: true,
      status: true,
      // WBS doesn't have isCorrective — that's only on Activity
      // delayCauseId is also not on WBS directly — counted via WBSStatusUpdate
    },
  });

  // Build a map: personelId → list of WBS where they're in hrActual
  const wbsByPersonel = new Map<string, typeof allWbsForPersonnel>();
  for (const p of personnel) {
    const matching = allWbsForPersonnel.filter((w) => {
      const hrActualIds = parseIdArray(w.hrActual);
      return hrActualIds.includes(p.id);
    });
    wbsByPersonel.set(p.id, matching);
  }

  // ===== Build personnel stats =====
  const personnelStats = personnel.map((p) => {
    const userOrgChartId = p.orgChart?.id || null;

    // ===== Activity (non-PMS) activities =====
    const activities = p.activityAssignments.map((ap) => ap.activity);
    const activityProgressSum = activities.reduce((s, a) => s + (a.progressPct || 0), 0);
    // Note: progressPct is stored as 0-1 (e.g. 0.5 = 50%)
    // So avgProgress should be (sum / count) * 100, NOT (sum * 100) / count
    const activityAvgProgress = activities.length > 0
      ? (activityProgressSum / activities.length) * 100
      : 0;
    const activityCorrective = activities.filter((a) => a.isCorrective).length;
    const activityDelayCause = activities.filter(
      (a) => a.delayCauseId !== null && a.delayCauseId !== undefined
    ).length;
    // Activity off-chart: where user is in hrActual but their orgChartId is NOT in hrPlan
    const activityOffChart = activities.filter((a) => {
      if (!userOrgChartId) return false;
      const hrPlanIds = parseIdArray(a.hrPlan);
      const hrActualIds = parseIdArray(a.hrActual);
      // Off-chart if user's orgChart is NOT in hrPlan (means they're working on something
      // that wasn't planned for their position)
      return !hrPlanIds.includes(userOrgChartId) && hrActualIds.length > 0;
    }).length;

    // ===== PMS (WBS) activities =====
    const pmsActivities = wbsByPersonel.get(p.id) || [];
    const pmsProgressSum = pmsActivities.reduce((s, w) => s + (w.progressActual || 0), 0);
    // progressActual is stored as 0-1, so to get percentage: (sum / count) * 100
    const pmsAvgProgress = pmsActivities.length > 0
      ? (pmsProgressSum / pmsActivities.length) * 100
      : 0;
    // WBS doesn't have isCorrective or delayCauseId — these are Activity-only fields
    // For PMS, "corrective" and "delay cause" are tracked via WBSStatusUpdate records
    // For now, count PMS items with status "on_hold" as proxy for delay
    const pmsCorrective = 0; // Not applicable to WBS
    const pmsDelayCause = pmsActivities.filter((w) => w.status === "on_hold").length;
    // PMS off-chart: where user's personelId is in hrActual but their orgChartId is NOT in hrPlan
    const pmsOffChart = pmsActivities.filter((w) => {
      if (!userOrgChartId) return false;
      const hrPlanIds = parseIdArray(w.hrPlan);
      return !hrPlanIds.includes(userOrgChartId);
    }).length;

    // ===== Combined stats =====
    const totalCount = activities.length + pmsActivities.length;
    const totalProgressSum = activityProgressSum + pmsProgressSum;
    // Combined average: weighted by count
    const avgProgress = totalCount > 0
      ? (totalProgressSum / totalCount) * 100  // progressPct/progressActual are 0-1
      : 0;
    const correctiveCount = activityCorrective + pmsCorrective;
    const delayCauseCount = activityDelayCause + pmsDelayCause;
    const offChartCount = activityOffChart + pmsOffChart;
    const presenceCount = userLogCounts.get(p.id) || 0;

    return {
      id: p.id,
      name: p.name,
      position: p.orgChart?.position || null,
      initials: p.name.charAt(0),
      activityCount: totalCount,
      avgProgress: Math.round(avgProgress),
      offChartCount,
      correctiveCount,
      delayCauseCount,
      presenceCount,
    };
  });

  // ===== Strategic topics S-curves (1.1 - 1.5) =====
  const strategicTopics = level2Wbs
    .filter((w) => {
      const code = (w as any).strategicTopic || w.wbsCode;
      return code && code.startsWith("1.");
    })
    .map((w) => {
      const code = (w as any).strategicTopic || w.wbsCode;
      return {
        code,
        label: w.title,
        progress: w.progressActual || 0,
        scurve: w.monthlyProgress.map((m) => ({
          monthDate: m.monthDate.toISOString(),
          plannedPct: m.plannedPct,
          actualPct: m.actualPct,
        })),
      };
    });

  // ===== Risk stats + heatmap =====
  // Build latest evaluation per risk
  const latestEvalByRisk = new Map<string, typeof riskEvaluations[0]>();
  for (const ev of riskEvaluations) {
    if (!latestEvalByRisk.has(ev.riskId)) {
      latestEvalByRisk.set(ev.riskId, ev);
    }
  }

  // Type distribution
  const typeMap = new Map<string, number>();
  for (const r of risks) {
    const t = r.riskType || "نامشخص";
    typeMap.set(t, (typeMap.get(t) || 0) + 1);
  }
  const byType = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }));

  // Level distribution + heatmap cells
  const levelCounts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  const heatmapMap = new Map<string, { impact: string; probability: string; count: number; level: string }>();

  for (const r of risks) {
    const ev = latestEvalByRisk.get(r.id);
    if (!ev || !ev.impactCurrent || !ev.probabilityCurrent) continue;
    const level = ev.levelCurrent || computeHeatLevel(ev.impactCurrent, ev.probabilityCurrent);
    if (levelCounts[level] !== undefined) levelCounts[level]++;
    const key = `${ev.impactCurrent}|${ev.probabilityCurrent}`;
    const existing = heatmapMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      heatmapMap.set(key, {
        impact: ev.impactCurrent,
        probability: ev.probabilityCurrent,
        count: 1,
        level,
      });
    }
  }

  const byLevel = [
    { level: "Low", count: levelCounts.Low, color: "#10b981" },
    { level: "Medium", count: levelCounts.Medium, color: "#f59e0b" },
    { level: "High", count: levelCounts.High, color: "#f97316" },
    { level: "Critical", count: levelCounts.Critical, color: "#ef4444" },
  ];

  const heatmap = Array.from(heatmapMap.values());

  const closedCount = risks.filter((r) => r.status === "closed").length;

  return {
    stats: {
      wbsCount,
      personelCount,
      assetCount,
      openRiskCount,
    },
    pms: {
      rootScurve: rootMonthlyProgress.map((m) => ({
        monthDate: m.monthDate.toISOString(),
        plannedPct: m.plannedPct,
        actualPct: m.actualPct,
      })),
      rootProgress: rootWbs?.progressActual || 0,
      rootPlan: rootWbs?.progressPlan || 0,
    },
    financial: {
      totalCost: totalCost._sum.programForecast || 0,
      totalRevenue: totalRevenue._sum.programForecast || 0,
      costByCategory,
      topAssets,
    },
    recentItems,
    personnelStats,
    strategicTopics,
    risk: {
      total: risks.length,
      openCount: openRiskCount,
      closedCount,
      byType,
      byLevel,
      heatmap,
    },
  };
}

// Heat level computation (same as risk heatmap page)
function computeHeatLevel(impact: string, prob: string): string {
  const impactMap: Record<string, number> = { اساسی: 5, عمده: 4, متوسط: 3, جزئی: 2, ناچیز: 1 };
  const probMap: Record<string, number> = { نادر: 1, بعید: 2, ممکن: 3, محتمل: 4, مکرر: 5 };
  const i = impactMap[impact];
  const p = probMap[prob];
  if (!i || !p) return "Low";
  const score = i * p;
  if (score >= 16) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}
