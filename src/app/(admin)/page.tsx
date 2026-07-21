import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { SCurveChart } from "@/components/s-curve-chart";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserDashboard as UserDashboardClient } from "./user-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        لطفاً وارد شوید
      </div>
    );
  }
  const role = (session?.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  if (role === "admin") {
    return <AdminDashboard />;
  }
  return <UserDashboard userId={userId} />;
}

// ============================================================
// ADMIN DASHBOARD — S-curves + recent activities + workload
// (8 stat cards removed per redesign)
// ============================================================
async function AdminDashboard() {
  const [wbsRoot, recentActivities, level2WbsList] = await Promise.all([
    db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } }),
    db.activity.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        personAssignments: { include: { personel: true } },
      },
    }),
    db.wBS.findMany({
      where: { level: 2 },
      orderBy: { wbsCode: "asc" },
      include: {
        monthlyProgress: { orderBy: { monthDate: "asc" } },
      },
    }),
  ]);

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
  const sortedWorkload = personelWorkload
    .map((p) => ({
      ...p,
      totalLoad: p._count.wbsAssignments + p._count.activityAssignments + p._count.kpiAssignments,
    }))
    .sort((a, b) => b.totalLoad - a.totalLoad)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">داشبورد مدیریتی</h1>
        <p className="text-sm text-muted-foreground mt-1">
          نمای کلی وضعیت پروژه‌ها و فعالیت‌های شرکت
        </p>
      </div>

      {/* Overall progress — S-Curve chart */}
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

      {/* S-Curves for all level-2 WBS activities */}
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

      {/* Recent activities */}
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

      {/* Personnel workload */}
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

// ============================================================
// USER / MODERATOR DASHBOARD — "what should I do"
// Shows activities assigned to the current user (via personelId),
// grouped by: today, this week, top 10 by priority.
// ============================================================
async function UserDashboard({ userId }: { userId: string }) {
  // Resolve the user's linked personel record
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, personelId: true, personel: { select: { name: true } } },
      })
    : null;

  const personelId = user?.personelId;
  const personName = user?.personel?.name || "کاربر";

  if (!personelId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">داشبورد شخصی</h1>
          <p className="text-sm text-muted-foreground mt-1">
            فعالیت‌هایی که به شما اختصاص داده شده‌اند
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              حساب کاربری شما به هیچ پرسنلی متصل نیست.
            </p>
            <p className="text-xs text-muted-foreground">
              لطفاً از مدیر سیستم بخواهید حساب کاربری شما را به پروفایل پرسنلی شما متصل کند تا فعالیت‌های اختصاص‌یافته نمایش داده شوند.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch all activities assigned to this person
  const assignedActivities = await db.activity.findMany({
    where: {
      personAssignments: { some: { personelId } },
    },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      durationDays: true,
      urgency: true,
      status: true,
      progressPct: true,
      priority: true,
      updatedAt: true,
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  // Fetch unread notifications for this user linked to activities
  // (notifications use actionUrl = /activities/{activityId})
  const unreadNotifs = await db.notification.findMany({
    where: {
      userId,
      isRead: false,
      actionUrl: { startsWith: "/activities/" },
    },
    select: { actionUrl: true },
  });
  const notifActivityIds = unreadNotifs
    .map((n) => n.actionUrl?.split("/activities/")[1])
    .filter((x): x is string => !!x);

  // Serialize dates for the client component
  const serialized = assignedActivities.map((a) => ({
    ...a,
    startDate: a.startDate ? a.startDate.toISOString() : null,
    endDate: a.endDate ? a.endDate.toISOString() : null,
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <UserDashboardClient
      activities={serialized}
      personName={personName}
      notifActivityIds={notifActivityIds}
    />
  );
}
