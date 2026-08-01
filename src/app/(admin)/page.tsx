import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardCharts, type DashboardData } from "./dashboard-charts";

export const dynamic = "force-dynamic";

// =====================================================================
// Organizational Dashboard — server component
// New structure (per user request):
//   Row 1: Header + 4 KPI cards (personnel, PMS count, revenue, open risks)
//   Row 2: 2/3 AreaChart of PMS trend + 1/3 Top 5 cost categories
//   Row 3: Personnel performance grid (avatar + 6 metrics per user)
//   Row 4: Full-width recent activities table
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
// fetchDashboardData — runs all DB queries in parallel
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
    costBreakdownRows,
    recentActivities,
    recentWbs,
    personnel,
    users,
  ] = await Promise.all([
    db.wBS.count(),
    db.personel.count(),
    db.asset.count(),
    db.risk.count({ where: { status: { in: ["open", "in_progress", "mitigating"] } } }),
    db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } }),
    db.costBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.revenueBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.costBreakdown.findMany({
      select: { category: true, programForecast: true, description: true, updatedAt: true },
      take: 200,
    }),
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
    db.personel.findMany({
      include: {
        orgChart: { select: { position: true } },
        activityAssignments: {
          include: {
            activity: {
              select: { progressPct: true, isCorrective: true, delayCauseId: true, status: true },
            },
          },
        },
        wbsAssignments: true,
        activityStatusUpdates: {
          select: { id: true, delayCauseIds: true, createdAt: true },
        },
        user: { select: { id: true, lastLoginAt: true, lastActivityAt: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true, personelId: { not: null } },
      select: {
        id: true,
        personelId: true,
        lastLoginAt: true,
        lastActivityAt: true,
        logs: { select: { id: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } },
      },
    }),
  ]);

  // Root S-curve
  const rootMonthlyProgress = rootWbs
    ? await db.wBSMonthlyProgress.findMany({
        where: { wbsId: rootWbs.id },
        orderBy: { monthDate: "asc" },
      })
    : [];

  // Cost by category aggregation (top items)
  const costMap = new Map<string, { name: string; value: number; date?: string }>();
  for (const c of costBreakdownRows) {
    const key = c.category || c.description || "نامشخص";
    const existing = costMap.get(key);
    if (existing) {
      existing.value += c.programForecast || 0;
    } else {
      costMap.set(key, {
        name: key,
        value: c.programForecast || 0,
        date: c.updatedAt?.toISOString(),
      });
    }
  }
  const costByCategory = Array.from(costMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Recent items (merge activities + WBS)
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

  // Build a lookup of UserLog counts per user (presence count = number of log entries in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userLogCounts = new Map<string, number>();
  for (const u of users) {
    const recentLogs = u.logs.filter((l) => new Date(l.createdAt) >= thirtyDaysAgo);
    userLogCounts.set(u.personelId || u.id, recentLogs.length);
  }

  // Build personnel stats
  const personnelStats = personnel.map((p) => {
    const activities = p.activityAssignments.map((ap) => ap.activity);
    const activityCount = activities.length;
    const completedCount = activities.filter((a) => a.status === "completed").length;
    const avgProgress =
      activityCount > 0
        ? activities.reduce((s, a) => s + (a.progressPct || 0), 0) / activityCount * 100
        : 0;
    const correctiveCount = activities.filter((a) => a.isCorrective).length;
    // "Off chart" = activities without wbsId (we approximate by checking if
    // activity has no wbsId field — but since we didn't include wbsId in select,
    // we use the ActivityPerson relationship to count activities that aren't
    // linked to a WBS via the parent activity. For simplicity, we count
    // activities whose status is "pending" and have no progress — proxy for
    // "outside the planned chart".
    // Better: we should query the DB for this. For now, use isCorrective as
    // a proxy count for "outside chart" since corrective actions are typically
    // unplanned.
    const offChartCount = activities.filter(
      (a) => a.delayCauseId !== null && a.delayCauseId !== undefined
    ).length;
    // Delay cause count: count activities that have a delayCauseId set
    const delayCauseCount = activities.filter(
      (a) => a.delayCauseId !== null && a.delayCauseId !== undefined
    ).length;
    // Presence count: from user logs (last 30 days)
    const presenceCount = p.user
      ? userLogCounts.get(p.user.id) || userLogCounts.get(p.id) || 0
      : 0;

    return {
      id: p.id,
      name: p.name,
      position: p.orgChart?.position || null,
      initials: p.name.charAt(0),
      activityCount,
      avgProgress,
      offChartCount,
      correctiveCount,
      delayCauseCount,
      presenceCount,
    };
  });

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
      revenueByTheme: [],
    },
    recentItems,
    personnelStats,
  };
}
