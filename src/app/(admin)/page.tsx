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
import { formatJalaliDateTime } from "@/lib/jalali";

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
  const [wbsRoot, recentActivities, recentWbs, level2WbsList] = await Promise.all([
    db.wBS.findFirst({ where: { level: 1 }, orderBy: { wbsCode: "asc" } }),
    db.activity.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: {
        personAssignments: { include: { personel: true } },
      },
    }),
    db.wBS.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      where: { level: { gte: 4 } },
    }),
    db.wBS.findMany({
      where: { level: 2 },
      orderBy: { wbsCode: "asc" },
      include: {
        monthlyProgress: { orderBy: { monthDate: "asc" } },
      },
    }),
  ]);

  // Merge recent activities + WBS into one sorted list, take 8
  type RecentItem = {
    id: string;
    code: string;
    title: string;
    status: string;
    progressPct: number;
    progressActual?: number;
    updatedAt: Date;
    type: "pms" | "activity";
    assigneeName?: string | null;
  };
  const recentItems: RecentItem[] = [
    ...recentActivities.map((a) => ({
      id: a.id,
      code: a.code,
      title: a.title,
      status: a.status,
      progressPct: a.progressPct,
      updatedAt: a.updatedAt,
      type: "activity" as const,
      assigneeName: a.personAssignments[0]?.personel?.name ?? null,
    })),
    ...recentWbs.map((w) => ({
      id: w.id,
      code: w.wbsCode,
      title: w.title,
      status: (w as any).status || "pending",
      updatedAt: w.updatedAt,
      type: "pms" as const,
      assigneeName: null as string | null,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  const rootMonthlyProgress = wbsRoot
    ? await db.wBSMonthlyProgress.findMany({
        where: { wbsId: wbsRoot.id },
        orderBy: { monthDate: "asc" },
      })
    : [];

  const overallProgress = wbsRoot?.progressActual
    ? Math.round(wbsRoot.progressActual * 100)
    : 0;
  // Compute overall plan from multiple sources to avoid showing equal plan/actual
  // when progressPlan is unset or zero.
  let overallPlan = 0;
  if (wbsRoot?.progressPlan && wbsRoot.progressPlan > 0) {
    overallPlan = Math.round(wbsRoot.progressPlan * 100);
  } else if (rootMonthlyProgress.length > 0) {
    const last = rootMonthlyProgress[rootMonthlyProgress.length - 1];
    if (last && last.plannedPct) {
      overallPlan = Math.round(last.plannedPct * 100);
    }
  }
  if (overallPlan === 0 && wbsRoot?.startDate && wbsRoot?.finishDate) {
    const now = new Date();
    const total = wbsRoot.finishDate.getTime() - wbsRoot.startDate.getTime();
    if (total > 0) {
      const elapsed = now.getTime() - wbsRoot.startDate.getTime();
      overallPlan = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    }
  }

  const personelWorkload = await db.personel.findMany({
    include: {
      orgChart: true,
      _count: {
        select: {
          wbsAssignments: true,
          activityAssignments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // For each personel, compute:
  //  - PMS count: WBS items where level >= 4 AND personelId is in wbs.hrActual JSON array
  //  - فعالیت count: Activity items where the personel is in personAssignments (== activityAssignments count)
  // Fetch all level-4+ WBS items once and filter by hrActual
  const allLevel4Wbs = await db.wBS.findMany({
    where: { level: { gte: 4 } },
    select: { id: true, hrActual: true },
  });

  const sortedWorkload = personelWorkload
    .map((p) => {
      // Count PMS where personelId is in hrActual JSON
      let pmsCount = 0;
      for (const w of allLevel4Wbs) {
        if (!w.hrActual) continue;
        try {
          const ids: string[] = JSON.parse(w.hrActual);
          if (Array.isArray(ids) && ids.includes(p.id)) {
            pmsCount++;
          }
        } catch {
          // ignore
        }
      }
      const activityCount = p._count.activityAssignments;
      const totalLoad = pmsCount + activityCount;
      return {
        ...p,
        pmsCount,
        activityCount,
        totalLoad,
      };
    })
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
                // Compute planPct from multiple sources to avoid showing
                // equal plan/actual when progressPlan is unset or zero.
                let planPct = 0;
                if (wbs.progressPlan && wbs.progressPlan > 0) {
                  planPct = Math.round(wbs.progressPlan * 100);
                } else if (wbs.monthlyProgress.length > 0) {
                  const last = wbs.monthlyProgress[wbs.monthlyProgress.length - 1];
                  if (last && last.plannedPct) {
                    planPct = Math.round(last.plannedPct * 100);
                  }
                }
                if (
                  planPct === 0 &&
                  wbs.startDate &&
                  wbs.finishDate
                ) {
                  const now = new Date();
                  const total = wbs.finishDate.getTime() - wbs.startDate.getTime();
                  if (total > 0) {
                    const elapsed = now.getTime() - wbs.startDate.getTime();
                    planPct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
                  }
                }
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
      strategicTopic: true,
      isCorrective: true,
      updatedAt: true,
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  // Fetch WBS activities assigned to this user (via hrActual JSON array)
  // Only levels >= 4 (processes and below — actual activities, not vision/strategy)
  // and only items that have a startDate or finishDate
  const allWbs = await db.wBS.findMany({
    where: {
      level: { gte: 4 },
      OR: [{ startDate: { not: null } }, { finishDate: { not: null } }],
    },
    select: {
      id: true,
      wbsCode: true,
      title: true,
      startDate: true,
      finishDate: true,
      progressPlan: true,
      progressActual: true,
      urgency: true,
      priority: true,
      hrActual: true,
      hrPlan: true,
      strategicTopic: true,
      updatedAt: true,
    },
  });

  // Get the user's orgChartId (to flag WBS items where the user's position is needed in hrPlan)
  const personelRec = await db.personel.findUnique({
    where: { id: personelId },
    select: { orgChartId: true },
  });
  const myOrgChartId = personelRec?.orgChartId || null;

  // Helper: parse JSON array of IDs
  const parseIds = (val: string | null | undefined): string[] => {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Filter WBS where user's personelId is in hrActual JSON array
  const userWbsActivities = allWbs
    .filter((w) => {
      const ids = parseIds(w.hrActual);
      return ids.includes(personelId);
    })
    .map((w) => {
      // "needs me" = user's org position is in hrPlan AND user is in hrActual
      const planIds = parseIds(w.hrPlan);
      const needsMe = !!myOrgChartId && planIds.includes(myOrgChartId);
      // Status: prefer explicit WBS status, fall back to derived from progress
      const derivedStatus =
        w.progressActual >= 1
          ? "completed"
          : w.progressActual > 0
          ? "in_progress"
          : "pending";
      return {
        id: w.id,
        code: w.wbsCode,
        title: w.title,
        description: null as string | null,
        startDate: w.startDate ? w.startDate.toISOString() : null,
        endDate: w.finishDate ? w.finishDate.toISOString() : null,
        durationDays: null as number | null,
        urgency: w.urgency || "normal",
        priority: w.priority ?? 3,
        status: (w as any).status || derivedStatus,
        progressPct: (w.progressActual || 0) * 100,
        updatedAt: w.updatedAt.toISOString(),
        type: "pms" as const,
        strategicTopic: (w as any).strategicTopic || null,
        isCorrective: false,
        needsMe,
      };
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

  // Serialize dates for the client component — merge Activity records
  // (marked "activity") with WBS-derived activities (marked "pms").
  // FILTER OUT completed activities (progressPct >= 100 or status = completed)
  const serialized = [
    ...assignedActivities
      .filter((a) => a.status !== "completed" && (a.progressPct || 0) < 100)
      .map((a) => ({
        ...a,
        startDate: a.startDate ? a.startDate.toISOString() : null,
        endDate: a.endDate ? a.endDate.toISOString() : null,
        updatedAt: a.updatedAt.toISOString(),
        type: "activity" as const,
        strategicTopic: a.strategicTopic || null,
        isCorrective: a.isCorrective || false,
        needsMe: false,
      })),
    ...userWbsActivities.filter((w) => (w as any).status !== "completed" && (w.progressPct || 0) < 100),
  ];

  // ---- Fetch recent status updates (WBS + Activity) — last 10 ----
  // Only include updates for activities / WBS items the user is assigned to.
  const myActivityIds = assignedActivities.map((a) => a.id);
  const myWbsIds = userWbsActivities.map((w) => w.id);

  // Use try-catch in case WBSStatusUpdate model doesn't exist in DB yet
  let wbsStatusUpdates: any[] = [];
  let activityStatusUpdates: any[] = [];

  try {
    wbsStatusUpdates = await (db as any).wBSStatusUpdate?.findMany({
      where: { wbsId: { in: myWbsIds } },
      include: {
        personel: { select: { name: true } },
        wbs: { select: { wbsCode: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }) ?? [];
  } catch {
    // Model or table doesn't exist yet — skip
  }

  try {
    activityStatusUpdates = await db.activityStatusUpdate.findMany({
      where: { activityId: { in: myActivityIds } },
      include: {
        personel: { select: { name: true } },
        activity: { select: { code: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch {
    // Skip
  }

  const recentStatusUpdates = [
    ...wbsStatusUpdates.map((su) => ({
      id: su.id,
      entityType: "wbs" as const,
      entityId: su.wbsId,
      entityCode: su.wbs?.wbsCode || "",
      entityTitle: su.wbs?.title || "",
      previousStatus: su.previousStatus,
      newStatus: su.newStatus,
      progressPct: su.progressPct,
      notes: su.notes,
      createdAt: su.createdAt.toISOString(),
      personelName: su.personel?.name || null,
    })),
    ...activityStatusUpdates.map((su) => ({
      id: su.id,
      entityType: "activity" as const,
      entityId: su.activityId,
      entityCode: su.activity?.code || "",
      entityTitle: su.activity?.title || "",
      previousStatus: su.previousStatus,
      newStatus: su.newStatus,
      progressPct: su.progressPct,
      notes: su.notes,
      createdAt: su.createdAt.toISOString(),
      personelName: su.personel?.name || null,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <UserDashboardClient
      activities={serialized}
      personName={personName}
      notifActivityIds={notifActivityIds}
      statusUpdates={recentStatusUpdates}
    />
  );
}
