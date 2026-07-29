import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardCharts, type DashboardData } from "./dashboard-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

// =====================================================================
// Organizational Dashboard — server component
// Shows organization-wide overview: PMS S-curves, financial summary,
// risk overview, issues overview, personnel evaluation overview,
// recent activities, and personnel workload.
// Visible to all authenticated users.
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

  const data = await fetchDashboardData();
  const [recentItems, sortedWorkload] = await Promise.all([
    fetchRecentActivities(),
    fetchPersonnelWorkload(),
  ]);

  return (
    <div className="space-y-6">
      <DashboardCharts data={data} />

      {/* Recent activities — moved from old admin dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخرین فعالیت‌های به‌روزرسانی شده</CardTitle>
        </CardHeader>
        <CardContent>
          {recentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              هنوز فعالیتی ثبت نشده است
            </p>
          ) : (
            <div className="space-y-2">
              {recentItems.map((item) => {
                const href = item.type === "pms" ? `/wbs/${item.id}` : `/activities/${item.id}`;
                return (
                  <Link
                    key={`${item.type}-${item.id}`}
                    href={href}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        variant={item.type === "pms" ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {item.type === "pms" ? "PMS" : "جاری"}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs shrink-0">
                        {item.code}
                      </Badge>
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {item.assigneeName && <span>{item.assigneeName}</span>}
                      <Badge
                        variant={
                          item.status === "completed" ? "default" :
                          item.status === "in_progress" ? "secondary" : "outline"
                        }
                        className="text-xs"
                      >
                        {item.status === "completed" ? "تکمیل" :
                         item.status === "in_progress" ? "در حال انجام" :
                         item.status === "pending" ? "در انتظار" :
                         item.status === "on_hold" ? "متوقف" : item.status}
                      </Badge>
                      <span className="font-num">
                        {Math.round(item.progressPct || 0).toLocaleString("fa-IR")}%
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personnel workload — moved from old admin dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">نقش سازمانی اجرا شده</CardTitle>
          <p className="text-xs text-muted-foreground">
            مرتب شده بر اساس بیشترین بار کاری — مسئولیت سنگین‌تر در صدر
          </p>
        </CardHeader>
        <CardContent>
          {sortedWorkload.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              پرسنلی ثبت نشده است
            </p>
          ) : (
            <div className="space-y-2">
              {sortedWorkload.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    idx === 0 ? "bg-red-50 dark:bg-red-950/20 border-red-200" :
                    idx === 1 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200" :
                    idx === 2 ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200" :
                    ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.position || "بدون سمت"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="bg-muted/50 rounded px-2 py-1">
                      PMS: <span className="font-bold font-num">{p.pmsCount.toLocaleString("fa-IR")}</span>
                    </span>
                    <span className="bg-muted/50 rounded px-2 py-1">
                      فعالیت: <span className="font-bold font-num">{p.activityCount.toLocaleString("fa-IR")}</span>
                    </span>
                  </div>
                  <Badge
                    variant={p.totalLoad > 5 ? "destructive" : p.totalLoad > 2 ? "secondary" : "outline"}
                    className="font-num shrink-0"
                  >
                    {p.totalLoad.toLocaleString("fa-IR")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// fetchDashboardData — runs all DB queries in parallel
// =====================================================================
async function fetchDashboardData(): Promise<DashboardData> {
  const [wbsCount, personelCount, assetCount, openRiskCount] = await Promise.all([
    db.wBS.count(),
    db.personel.count(),
    db.asset.count(),
    db.risk.count({ where: { status: { in: ["open", "in_progress", "mitigating"] } } }),
  ]);

  const rootWbs = await db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } });
  const rootMonthlyProgress = rootWbs
    ? await db.wBSMonthlyProgress.findMany({ where: { wbsId: rootWbs.id }, orderBy: { monthDate: "asc" } })
    : [];

  const level2Wbs = await db.wBS.findMany({
    where: { level: 2 },
    orderBy: { wbsCode: "asc" },
    include: { monthlyProgress: { orderBy: { monthDate: "asc" } } },
  });

  const totalCost = await db.costBreakdown.aggregate({ _sum: { programForecast: true } });
  const totalRevenue = await db.revenueBreakdown.aggregate({ _sum: { programForecast: true } });

  const risks = await db.risk.findMany({ select: { status: true, riskType: true } });
  const positiveRisks = risks.filter((r) => r.riskType === "مثبت");
  const negativeRisks = risks.filter((r) => r.riskType !== "مثبت");

  const riskByStatus = [
    { name: "باز", value: risks.filter((r) => r.status === "open").length },
    { name: "در حال اقدام", value: risks.filter((r) => r.status === "mitigating" || r.status === "in_progress").length },
    { name: "بسته", value: risks.filter((r) => r.status === "closed").length },
  ];

  // Issues (simplified — count from risk evaluations + activities with delays)
  const totalIssues = await db.riskEvaluation.count();
  const criticalIssues = await db.riskEvaluation.count({
    where: { levelCurrent: { in: ["Critical", "High"] } },
  });

  // Personnel evaluations
  const now = new Date();
  const evalsThisMonth = await db.kPIEvaluation.count({
    where: {
      evaluatedAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
      },
    },
  });
  const allEvals = await db.kPIEvaluation.findMany({
    select: { percentageScore: true, template: { select: { positionName: true } } },
    take: 100,
    orderBy: { evaluatedAt: "desc" },
  });
  const avgScore = allEvals.length > 0
    ? allEvals.reduce((s, e) => s + (e.percentageScore || 0), 0) / allEvals.length
    : 0;

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
      rootProgressPlan: rootWbs?.progressPlan || 0,
      rootProgressActual: rootWbs?.progressActual || 0,
      topics: level2Wbs.map((w) => ({
        topic: (w as any).strategicTopic || w.wbsCode,
        label: w.title,
        progress: w.progressActual || 0,
        scurve: w.monthlyProgress.map((m) => ({
          monthDate: m.monthDate.toISOString(),
          plannedPct: m.plannedPct,
          actualPct: m.actualPct,
        })),
      })),
    },
    financial: {
      totalCost: totalCost._sum.programForecast || 0,
      totalRevenue: totalRevenue._sum.programForecast || 0,
    },
    risk: {
      positiveCount: positiveRisks.length,
      negativeCount: negativeRisks.length,
      byStatus: riskByStatus,
    },
    issues: {
      total: totalIssues,
      critical: criticalIssues,
    },
    evaluation: {
      thisMonthCount: evalsThisMonth,
      avgScore: Math.round(avgScore * 10) / 10,
    },
  };
}

// =====================================================================
// fetchRecentActivities — latest 8 updated items (WBS + Activities)
// =====================================================================
async function fetchRecentActivities() {
  const [recentActivities, recentWbs] = await Promise.all([
    db.activity.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: {
        personAssignments: { include: { personel: { select: { name: true } } } },
      },
    }),
    db.wBS.findMany({
      where: { level: { gte: 4 } },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: { id: true, wbsCode: true, title: true, progressActual: true, updatedAt: true },
    }),
  ]);

  const activityItems = recentActivities.map((a) => ({
    id: a.id,
    code: a.code,
    title: a.title,
    status: a.status,
    progressPct: (a.progressPct || 0) * 100,
    updatedAt: a.updatedAt,
    type: "activity" as const,
    assigneeName: a.personAssignments[0]?.personel?.name || null,
  }));

  const wbsItems = recentWbs.map((w) => ({
    id: w.id,
    code: w.wbsCode,
    title: w.title,
    status: "pending" as const,
    progressPct: Math.round((w.progressActual || 0) * 100),
    updatedAt: w.updatedAt,
    type: "pms" as const,
    assigneeName: null as string | null,
  }));

  return [...activityItems, ...wbsItems]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);
}

// =====================================================================
// fetchPersonnelWorkload — sorted by total load descending
// =====================================================================
async function fetchPersonnelWorkload() {
  const personnel = await db.personel.findMany({
    include: {
      orgChart: { select: { position: true } },
      _count: {
        select: {
          wbsAssignments: true,
          activityAssignments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return personnel
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.orgChart?.position || null,
      pmsCount: p._count.wbsAssignments,
      activityCount: p._count.activityAssignments,
      totalLoad: p._count.wbsAssignments + p._count.activityAssignments,
    }))
    .sort((a, b) => b.totalLoad - a.totalLoad)
    .slice(0, 12);
}
