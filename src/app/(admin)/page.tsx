import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Network,
  Users,
  DollarSign,
  Package,
  Target,
  AlertTriangle,
  TrendingUp,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { SCurveChart } from "@/components/s-curve-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    wbsCount,
    wbsRoot,
    personelCount,
    costBreakdownCount,
    revenueCount,
    assetCount,
    kpiCount,
    riskCount,
    openRiskCount,
    recentActivities,
    level2WbsList,
  ] = await Promise.all([
    db.wBS.count(),
    db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } }),
    db.personel.count(),
    db.costBreakdown.count(),
    db.revenueBreakdown.count(),
    db.asset.count(),
    db.kPI.count(),
    db.risk.count(),
    db.risk.count({ where: { status: "open" } }),
    // Recent activities from the Activities module (5 latest)
    db.activity.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        personAssignments: { include: { personel: true } },
      },
    }),
    // All level-2 WBS activities (for S-curves)
    db.wBS.findMany({
      where: { level: 2 },
      orderBy: { wbsCode: "asc" },
      include: {
        monthlyProgress: { orderBy: { monthDate: "asc" } },
      },
    }),
  ]);

  // Fetch root monthly progress separately (depends on wbsRoot)
  const rootMonthlyProgress = wbsRoot
    ? await db.wBSMonthlyProgress.findMany({
        where: { wbsId: wbsRoot.id },
        orderBy: { monthDate: "asc" },
      })
    : [];

  const overallProgress = wbsRoot?.progressActual
    ? Math.round(wbsRoot.progressActual * 100)
    : 0;
  const overallPlan = wbsRoot?.progressPlan
    ? Math.round(wbsRoot.progressPlan * 100)
    : 0;

  // Personnel workload sorted by activity count desc
  const personelWorkload = await db.personel.findMany({
    include: {
      orgChart: true,
      _count: {
        select: {
          wbsAssignments: true,
          activityAssignments: true,
          kpiAssignments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  // Sort by total load descending
  const sortedWorkload = personelWorkload
    .map((p) => ({
      ...p,
      totalLoad: p._count.wbsAssignments + p._count.activityAssignments + p._count.kpiAssignments,
    }))
    .sort((a, b) => b.totalLoad - a.totalLoad)
    .slice(0, 12); // Top 12 most loaded

  const stats = [
    {
      label: "فعالیت‌های WBS",
      value: wbsCount.toLocaleString("fa-IR"),
      icon: Network,
      href: "/wbs",
      color: "from-emerald-500 to-teal-600",
    },
    {
      label: "پرسنل",
      value: personelCount.toLocaleString("fa-IR"),
      icon: Users,
      href: "/hr",
      color: "from-blue-500 to-cyan-600",
    },
    {
      label: "سرفصل‌های هزینه",
      value: costBreakdownCount.toLocaleString("fa-IR"),
      icon: DollarSign,
      href: "/financial",
      color: "from-amber-500 to-orange-600",
    },
    {
      label: "سرفصل‌های درآمد",
      value: revenueCount.toLocaleString("fa-IR"),
      icon: TrendingUp,
      href: "/financial",
      color: "from-green-500 to-emerald-600",
    },
    {
      label: "دارایی‌ها",
      value: assetCount.toLocaleString("fa-IR"),
      icon: Package,
      href: "/assets",
      color: "from-purple-500 to-pink-600",
    },
    {
      label: "شاخص‌های KPI",
      value: kpiCount.toLocaleString("fa-IR"),
      icon: Target,
      href: "/kpi",
      color: "from-violet-500 to-purple-600",
    },
    {
      label: "ریسک‌های باز",
      value: openRiskCount.toLocaleString("fa-IR"),
      icon: AlertTriangle,
      href: "/risks",
      color: "from-red-500 to-rose-600",
    },
    {
      label: "کل ریسک‌ها",
      value: riskCount.toLocaleString("fa-IR"),
      icon: Activity,
      href: "/risks",
      color: "from-slate-500 to-gray-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">داشبورد مدیریتی</h1>
        <p className="text-sm text-muted-foreground mt-1">
          نمای کلی وضعیت پروژه‌ها و فعالیت‌های شرکت
        </p>
      </div>

      {/* Overall progress — S-Curve chart (no labels/axes/legend per request) */}
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="p-6">
          <div className="grid gap-6 md:grid-cols-3 items-center">
            <div>
              <p className="text-sm text-muted-foreground">پیشرفت کلی چشم‌انداز</p>
              <p className="text-4xl font-bold text-emerald-700 mt-1">
                {overallProgress}%
              </p>
              <Progress value={overallProgress} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                پیشرفت واقعی تاکنون
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">پیشرفت برنامه‌ریزی شده</p>
              <p className="text-4xl font-bold text-blue-700 mt-1">
                {overallPlan}%
              </p>
              <Progress value={overallPlan} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                بر اساس برنامه زمان‌بندی
              </p>
            </div>
            <div className="h-32 min-h-32">
              <SCurveChart
                data={rootMonthlyProgress.map((m) => ({
                  monthDate: m.monthDate.toISOString(),
                  plannedPct: m.plannedPct,
                  actualPct: m.actualPct,
                }))}
                overallActual={wbsRoot?.progressActual ?? undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* S-Curves for all level-2 WBS activities (replaces financial cards) */}
      {level2WbsList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">منحنی S موضوعات استراتژیک (سطح ۲)</CardTitle>
            <p className="text-xs text-muted-foreground">
              پیشرفت برنامه و واقعی برای هر موضوع استراتژیک
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {level2WbsList.map((wbs) => {
                const actualPct = Math.round((wbs.progressActual || 0) * 100);
                const planPct = Math.round((wbs.progressPlan || 0) * 100);
                const deviation = actualPct - planPct;
                return (
                  <div key={wbs.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <Link href={`/wbs/${wbs.id}`} className="hover:underline">
                          <p className="text-sm font-medium truncate">
                            {wbs.wbsCode} - {wbs.title}
                          </p>
                        </Link>
                      </div>
                      <Badge
                        variant={deviation >= 0 ? "default" : "destructive"}
                        className="font-num text-xs shrink-0"
                      >
                        {deviation >= 0 ? "+" : ""}
                        {deviation.toLocaleString("fa-IR")}%
                      </Badge>
                    </div>
                    <div className="h-20 min-h-20">
                      <SCurveChart
                        data={wbs.monthlyProgress.map((m) => ({
                          monthDate: m.monthDate.toISOString(),
                          plannedPct: m.plannedPct,
                          actualPct: m.actualPct,
                        }))}
                        overallActual={wbs.progressActual ?? undefined}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>برنامه: <span className="font-num font-bold text-blue-600">{planPct.toLocaleString("fa-IR")}%</span></span>
                      <span>واقعی: <span className="font-num font-bold text-emerald-600">{actualPct.toLocaleString("fa-IR")}%</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center mb-3`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent activities (from Activities module - 5 latest) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخرین فعالیت‌های به‌روزرسانی شده</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              هنوز فعالیتی ثبت نشده است
            </p>
          ) : (
            <div className="space-y-2">
              {recentActivities.map((act) => (
                <Link
                  key={act.id}
                  href={`/activities/${act.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className="font-mono text-xs">
                      {act.code}
                    </Badge>
                    <span className="text-sm font-medium truncate">{act.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {act.personAssignments[0]?.personel && (
                      <span>{act.personAssignments[0].personel.name}</span>
                    )}
                    <Badge
                      variant={
                        act.status === "completed" ? "default" :
                        act.status === "in_progress" ? "secondary" : "outline"
                      }
                      className="text-xs"
                    >
                      {act.status === "completed" ? "تکمیل" :
                       act.status === "in_progress" ? "در حال انجام" :
                       act.status === "pending" ? "در انتظار" : act.status}
                    </Badge>
                    <span className="font-num">
                      {Math.round((act.progressPct || 0) * 100).toLocaleString("fa-IR")}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personnel workload - "نقش سازمانی اجرا شده" sorted by load desc */}
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
              {sortedWorkload.map((p, idx) => {
                const activityCount = p._count.activityAssignments;
                const wbsCount = p._count.wbsAssignments;
                const kpiCount = p._count.kpiAssignments;
                const totalLoad = p.totalLoad;
                return (
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
                        {p.orgChart?.position || "بدون سمت"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="bg-muted/50 rounded px-2 py-1">
                        فعالیت: <span className="font-bold font-num">{activityCount.toLocaleString("fa-IR")}</span>
                      </span>
                      <span className="bg-muted/50 rounded px-2 py-1">
                        WBS: <span className="font-bold font-num">{wbsCount.toLocaleString("fa-IR")}</span>
                      </span>
                      <span className="bg-muted/50 rounded px-2 py-1">
                        KPI: <span className="font-bold font-num">{kpiCount.toLocaleString("fa-IR")}</span>
                      </span>
                    </div>
                    <Badge
                      variant={totalLoad > 5 ? "destructive" : totalLoad > 2 ? "secondary" : "outline"}
                      className="font-num shrink-0"
                    >
                      {totalLoad.toLocaleString("fa-IR")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
