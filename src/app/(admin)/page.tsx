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
  TrendingDown,
  Activity,
  Calendar,
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
    totalCost,
    totalRevenue,
    recentWbs,
    personelWorkload,
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
    db.costBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.revenueBreakdown.aggregate({ _sum: { programForecast: true } }),
    db.wBS.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { children: true, personels: true } } },
    }),
    // Personnel workload: count of org positions + count of in-progress activities per person
    db.personel.findMany({
      take: 8,
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
    }),
  ]);

  // Fetch root monthly progress separately (depends on wbsRoot)
  const rootMonthlyProgress = wbsRoot
    ? await db.wBSMonthlyProgress.findMany({
        where: { wbsId: wbsRoot.id },
        orderBy: { monthDate: "asc" },
      })
    : [];

  const totalCostVal = totalCost._sum.programForecast || 0;
  const totalRevenueVal = totalRevenue._sum.programForecast || 0;
  const profit = totalRevenueVal - totalCostVal;
  const overallProgress = wbsRoot?.progressActual
    ? Math.round(wbsRoot.progressActual * 100)
    : 0;
  const overallPlan = wbsRoot?.progressPlan
    ? Math.round(wbsRoot.progressPlan * 100)
    : 0;

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

      {/* Financial summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              کل هزینه برنامه‌ریزی شده
            </CardTitle>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalCostVal.toLocaleString("fa-IR")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">میلیون تومان</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              کل درآمد برنامه‌ریزی شده
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalRevenueVal.toLocaleString("fa-IR")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">میلیون تومان</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              سود/زیان برنامه‌ریزی شده
            </CardTitle>
            <Activity className="w-4 h-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                profit >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {profit.toLocaleString("fa-IR")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">میلیون تومان</p>
          </CardContent>
        </Card>
      </div>

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

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخرین فعالیت‌های به‌روزرسانی شده</CardTitle>
        </CardHeader>
        <CardContent>
          {recentWbs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              هنوز فعالیتی ثبت نشده است
            </p>
          ) : (
            <div className="space-y-2">
              {recentWbs.map((wbs) => (
                <Link
                  key={wbs.id}
                  href={`/wbs/${wbs.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className="font-mono text-xs">
                      {wbs.wbsCode}
                    </Badge>
                    <span className="text-sm font-medium truncate">{wbs.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>سطح: {wbs.level.toLocaleString("fa-IR")}</span>
                    <span>
                      پیشرفت: {Math.round(wbs.progressActual * 100).toLocaleString("fa-IR")}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personnel workload - renamed to "نقش سازمانی اجرا شده" */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">نقش سازمانی اجرا شده</CardTitle>
          <p className="text-xs text-muted-foreground">
            تعداد نقش‌های سازمانی و فعالیت‌های اجرا شده توسط هر فرد
          </p>
        </CardHeader>
        <CardContent>
          {personelWorkload.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              پرسنلی ثبت نشده است
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {personelWorkload.map((p) => {
                const activityCount = p._count.activityAssignments;
                const wbsCount = p._count.wbsAssignments;
                const kpiCount = p._count.kpiAssignments;
                const totalLoad = activityCount + wbsCount + kpiCount;
                return (
                  <div key={p.id} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                        {p.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.orgChart?.position || "بدون سمت"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center text-xs">
                      <div className="bg-muted/50 rounded p-1.5">
                        <p className="font-bold font-num">
                          {activityCount.toLocaleString("fa-IR")}
                        </p>
                        <p className="text-muted-foreground">فعالیت</p>
                      </div>
                      <div className="bg-muted/50 rounded p-1.5">
                        <p className="font-bold font-num">
                          {wbsCount.toLocaleString("fa-IR")}
                        </p>
                        <p className="text-muted-foreground">نقش WBS</p>
                      </div>
                      <div className="bg-muted/50 rounded p-1.5">
                        <p className="font-bold font-num">
                          {kpiCount.toLocaleString("fa-IR")}
                        </p>
                        <p className="text-muted-foreground">KPI</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t flex justify-between text-xs">
                      <span className="text-muted-foreground">کل نقش‌ها:</span>
                      <Badge
                        variant={totalLoad > 5 ? "destructive" : totalLoad > 2 ? "secondary" : "outline"}
                        className="font-num"
                      >
                        {totalLoad.toLocaleString("fa-IR")}
                      </Badge>
                    </div>
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
