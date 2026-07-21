import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  AlertTriangle,
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { SCurveChart } from "@/components/s-curve-chart";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

const urgencyMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "کم", variant: "secondary" },
  normal: { label: "عادی", variant: "outline" },
  high: { label: "زیاد", variant: "default" },
  urgent: { label: "فوری", variant: "destructive" },
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "در انتظار", variant: "secondary" },
  in_progress: { label: "در حال انجام", variant: "default" },
  completed: { label: "تکمیل شده", variant: "outline" },
  cancelled: { label: "لغو شده", variant: "destructive" },
  on_hold: { label: "متوقف", variant: "secondary" },
};

const urgencyWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
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
    include: {
      personAssignments: { include: { personel: true } },
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
  const notifActivityIds = new Set(
    unreadNotifs
      .map((n) => n.actionUrl?.split("/activities/")[1])
      .filter((x): x is string => !!x)
  );

  // Date helpers
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Persian week starts on Saturday. daysSinceSaturday: Sat=0, Sun=1, ... Fri=6
  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - daysSinceSaturday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7); // exclusive end (start of next Saturday)

  const hasUnreadNotif = (aId: string) => notifActivityIds.has(aId);

  // "Today" = (startDate <= today < endDate-tomorrow) i.e. today is within [start, end]
  //   OR past due (endDate < today) and not completed/cancelled
  const todayActivities = assignedActivities.filter((a) => {
    const s = a.startDate ? new Date(a.startDate) : null;
    const e = a.endDate ? new Date(a.endDate) : null;
    const active = a.status !== "completed" && a.status !== "cancelled";
    if (s && e) {
      // today overlaps [start, end]
      if (s <= endOfToday && e >= startOfToday) return true;
      // past due & active
      if (e < startOfToday && active) return true;
      return false;
    }
    if (e) {
      // only end date — due today or past due & active
      if (e >= startOfToday && e < endOfToday) return true;
      if (e < startOfToday && active) return true;
      return false;
    }
    if (s) {
      // only start date — started today
      return s >= startOfToday && s < endOfToday;
    }
    return false;
  });

  // "This week" = activity's [start, end] overlaps [weekStart, weekEnd),
  //   excluding the ones already counted in today (to avoid duplication)
  const todayIds = new Set(todayActivities.map((a) => a.id));
  const weekActivities = assignedActivities.filter((a) => {
    if (todayIds.has(a.id)) return false;
    const s = a.startDate ? new Date(a.startDate) : null;
    const e = a.endDate ? new Date(a.endDate) : null;
    if (!s && !e) return false;
    const start = s || e!;
    const end = e || s!;
    return start < weekEnd && end >= weekStart;
  });

  // Top 10 by priority (urgency weight + priority)
  const topPriority = [...assignedActivities]
    .filter((a) => a.status !== "completed" && a.status !== "cancelled")
    .sort((a, b) => {
      const ua = urgencyWeight[a.urgency] || 2;
      const ub = urgencyWeight[b.urgency] || 2;
      const scoreA = ua * 10 + (a.priority || 0);
      const scoreB = ub * 10 + (b.priority || 0);
      return scoreB - scoreA;
    })
    .slice(0, 10);

  const totalAssigned = assignedActivities.length;
  const completedCount = assignedActivities.filter(
    (a) => a.status === "completed"
  ).length;
  const overdueCount = assignedActivities.filter((a) => {
    if (a.status === "completed" || a.status === "cancelled") return false;
    return a.endDate ? new Date(a.endDate) < startOfToday : false;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">سلام، {personName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            آنچه باید امروز و این هفته انجام دهید
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-xs">
            <Activity className="w-3.5 h-3.5" />
            کل فعالیت‌ها: <span className="font-num font-bold">{totalAssigned.toLocaleString("fa-IR")}</span>
          </Badge>
          <Badge variant="outline" className="gap-1 px-3 py-1.5 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تکمیل شده: <span className="font-num font-bold">{completedCount.toLocaleString("fa-IR")}</span>
          </Badge>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1 px-3 py-1.5 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              عقب‌افتاده: <span className="font-num font-bold">{overdueCount.toLocaleString("fa-IR")}</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Today's activities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            فعالیت‌های امروز
            <Badge variant="secondary" className="font-num text-xs">
              {todayActivities.length.toLocaleString("fa-IR")}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            فعالیت‌هایی که امروز در بازه زمانی آن‌ها هستید یا از موعد آن‌ها گذشته است
          </p>
        </CardHeader>
        <CardContent>
          {todayActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              فعالیتی برای امروز ندارید
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {todayActivities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  hasUnreadNotif={hasUnreadNotif(a.id)}
                  overdue={
                    !!a.endDate &&
                    new Date(a.endDate) < startOfToday &&
                    a.status !== "completed" &&
                    a.status !== "cancelled"
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* This week's activities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            فعالیت‌های این هفته
            <Badge variant="secondary" className="font-num text-xs">
              {weekActivities.length.toLocaleString("fa-IR")}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            فعالیت‌هایی که در جریان این هفته (شنبه تا جمعه) برنامه‌ریزی شده‌اند
          </p>
        </CardHeader>
        <CardContent>
          {weekActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              در این هفته فعالیتی ندارید
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {weekActivities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  hasUnreadNotif={hasUnreadNotif(a.id)}
                  overdue={
                    !!a.endDate &&
                    new Date(a.endDate) < startOfToday &&
                    a.status !== "completed" &&
                    a.status !== "cancelled"
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 10 by priority */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-rose-600" />
            ۱۰ فعالیت با بالاترین اولویت
            <Badge variant="secondary" className="font-num text-xs">
              {topPriority.length.toLocaleString("fa-IR")}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            بر اساس فوریت و اولویت — ابتدا فوری‌ترین‌ها
          </p>
        </CardHeader>
        <CardContent>
          {topPriority.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              همه فعالیت‌های شما تکمیل شده‌اند
            </p>
          ) : (
            <div className="space-y-2">
              {topPriority.map((a, idx) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  rank={idx + 1}
                  hasUnreadNotif={hasUnreadNotif(a.id)}
                  overdue={
                    !!a.endDate &&
                    new Date(a.endDate) < startOfToday
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Activity card (grid layout for today/week sections) ----
function ActivityCard({
  activity,
  hasUnreadNotif,
  overdue,
}: {
  activity: {
    id: string;
    code: string;
    title: string;
    startDate: Date | string | null;
    endDate: Date | string | null;
    urgency: string;
    status: string;
    progressPct: number;
  };
  hasUnreadNotif: boolean;
  overdue: boolean;
}) {
  const us = urgencyMap[activity.urgency] || { label: activity.urgency, variant: "secondary" as const };
  const ss = statusMap[activity.status] || { label: activity.status, variant: "secondary" as const };
  return (
    <Link
      href={`/activities/${activity.id}`}
      className="block rounded-lg border p-3 hover:shadow-md hover:border-primary/40 transition-all relative"
    >
      {hasUnreadNotif && (
        <span
          className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-background"
          title="اعلان جدید"
          aria-label="اعلان جدید"
        />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="font-mono text-xs shrink-0">{activity.code}</Badge>
          <Badge variant={us.variant} className="text-xs shrink-0">{us.label}</Badge>
        </div>
        <Badge variant={ss.variant} className="text-xs shrink-0">{ss.label}</Badge>
      </div>
      <h3 className="font-medium text-sm leading-snug line-clamp-2 mb-2">{activity.title}</h3>
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">پیشرفت</span>
          <span className="font-num font-medium">{Math.round(activity.progressPct).toLocaleString("fa-IR")}%</span>
        </div>
        <Progress value={activity.progressPct} className="h-1.5" />
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="w-3 h-3" />
        <span>{formatJalali(activity.startDate)}</span>
        <span>تا</span>
        <span className={overdue ? "text-red-600 font-medium" : ""}>{formatJalali(activity.endDate)}</span>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] mr-1 px-1 py-0">عقب‌افتاده</Badge>
        )}
      </div>
    </Link>
  );
}

// ---- Compact activity row (for top-10 list) ----
function ActivityRow({
  activity,
  rank,
  hasUnreadNotif,
  overdue,
}: {
  activity: {
    id: string;
    code: string;
    title: string;
    startDate: Date | string | null;
    endDate: Date | string | null;
    urgency: string;
    status: string;
    progressPct: number;
    priority: number;
  };
  rank: number;
  hasUnreadNotif: boolean;
  overdue: boolean;
}) {
  const us = urgencyMap[activity.urgency] || { label: activity.urgency, variant: "secondary" as const };
  const ss = statusMap[activity.status] || { label: activity.status, variant: "secondary" as const };
  return (
    <Link
      href={`/activities/${activity.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors relative"
    >
      {hasUnreadNotif && (
        <span
          className="absolute top-2 left-2 w-2.5 h-2.5 bg-red-500 rounded-full"
          title="اعلان جدید"
          aria-label="اعلان جدید"
        />
      )}
      <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold font-num shrink-0">
        {rank.toLocaleString("fa-IR")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="outline" className="font-mono text-[10px] shrink-0">{activity.code}</Badge>
          <span className="text-sm font-medium truncate">{activity.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>{formatJalali(activity.startDate)}</span>
          <span>تا</span>
          <span className={overdue ? "text-red-600 font-medium" : ""}>{formatJalali(activity.endDate)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant={us.variant} className="text-[10px]">{us.label}</Badge>
        <Badge variant={ss.variant} className="text-[10px]">{ss.label}</Badge>
        <span className="font-num text-xs font-bold w-10 text-center">
          {Math.round(activity.progressPct).toLocaleString("fa-IR")}%
        </span>
      </div>
    </Link>
  );
}
