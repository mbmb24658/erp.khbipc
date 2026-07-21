"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  AlertTriangle,
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { formatJalali } from "@/lib/jalali";

// ============================================================
// Types
// ============================================================

export interface UserDashboardActivity {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  durationDays?: number | null;
  urgency: string;
  status: string;
  progressPct: number;
  priority: number;
  updatedAt: string | Date;
}

interface UserDashboardProps {
  activities: UserDashboardActivity[];
  personName: string;
  notifActivityIds: string[];
}

// ============================================================
// Maps & constants
// ============================================================

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

type StatusFilter = "all" | "pending" | "in_progress" | "completed";
type UrgencyFilter = "all" | "low" | "normal" | "high" | "urgent";
type SortKey = "priority" | "urgency" | "dueDate" | "updatedAt" | "title";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "priority", label: "اولویت (نزولی)" },
  { value: "urgency", label: "فوریت (نزولی)" },
  { value: "dueDate", label: "تاریخ پایان (صعودی)" },
  { value: "updatedAt", label: "آخرین تغییر (نزولی)" },
  { value: "title", label: "عنوان (الفبا)" },
];

// ============================================================
// Date helpers — runs on client. Same logic as the original
// server-side UserDashboard.
// ============================================================

function toDate(val: string | Date | null): Date | null {
  if (!val) return null;
  return val instanceof Date ? val : new Date(val);
}

function applyFilterSort(
  list: UserDashboardActivity[],
  statusFilter: StatusFilter,
  urgencyFilter: UrgencyFilter,
  sortBy: SortKey
): UserDashboardActivity[] {
  const filtered = list.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (urgencyFilter !== "all" && a.urgency !== urgencyFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "priority":
        return (b.priority || 0) - (a.priority || 0);
      case "urgency": {
        const ua = urgencyWeight[a.urgency] || 2;
        const ub = urgencyWeight[b.urgency] || 2;
        return ub - ua;
      }
      case "dueDate": {
        const da = toDate(a.endDate)?.getTime() ?? Infinity;
        const db = toDate(b.endDate)?.getTime() ?? Infinity;
        return da - db;
      }
      case "updatedAt": {
        const da = new Date(a.updatedAt).getTime();
        const db = new Date(b.updatedAt).getTime();
        return db - da;
      }
      case "title":
        return a.title.localeCompare(b.title, "fa");
      default:
        return 0;
    }
  });

  return sorted;
}

// ============================================================
// Section: filter/sort controls
// ============================================================

function SectionControls({
  statusFilter,
  setStatusFilter,
  urgencyFilter,
  setUrgencyFilter,
  sortBy,
  setSortBy,
}: {
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  urgencyFilter: UrgencyFilter;
  setUrgencyFilter: (v: UrgencyFilter) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue placeholder="وضعیت" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">همه وضعیت‌ها</SelectItem>
          <SelectItem value="pending">در انتظار</SelectItem>
          <SelectItem value="in_progress">در حال انجام</SelectItem>
          <SelectItem value="completed">تکمیل شده</SelectItem>
        </SelectContent>
      </Select>
      <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v as UrgencyFilter)}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="فوریت" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">همه فوریت‌ها</SelectItem>
          <SelectItem value="low">کم</SelectItem>
          <SelectItem value="normal">عادی</SelectItem>
          <SelectItem value="high">زیاد</SelectItem>
          <SelectItem value="urgent">فوری</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="مرتب‌سازی" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================
// Activity card (grid layout)
// ============================================================

function ActivityCard({
  activity,
  hasUnreadNotif,
  overdue,
}: {
  activity: UserDashboardActivity;
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

// ============================================================
// Activity row (compact list layout for top-10)
// ============================================================

function ActivityRow({
  activity,
  rank,
  hasUnreadNotif,
  overdue,
}: {
  activity: UserDashboardActivity;
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

// ============================================================
// Section wrapper with its own filter/sort state
// ============================================================

function DashboardSection({
  icon,
  iconColor,
  title,
  description,
  totalCount,
  items,
  notifSet,
  startOfToday,
  renderMode,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  totalCount: number;
  items: UserDashboardActivity[];
  notifSet: Set<string>;
  startOfToday: Date;
  renderMode: "grid" | "list";
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>(renderMode === "list" ? "priority" : "priority");

  const processed = useMemo(
    () => applyFilterSort(items, statusFilter, urgencyFilter, sortBy),
    [items, statusFilter, urgencyFilter, sortBy]
  );

  const emptyText =
    totalCount === 0
      ? "موردی برای نمایش وجود ندارد"
      : "با فیلتر فعلی موردی یافت نشد";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span className={iconColor}>{icon}</span>
              {title}
              <Badge variant="secondary" className="font-num text-xs">
                {processed.length.toLocaleString("fa-IR")}
                {processed.length !== totalCount && (
                  <span className="text-muted-foreground mr-1">/ {totalCount.toLocaleString("fa-IR")}</span>
                )}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <SectionControls
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            urgencyFilter={urgencyFilter}
            setUrgencyFilter={setUrgencyFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        </div>
      </CardHeader>
      <CardContent>
        {processed.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{emptyText}</p>
        ) : renderMode === "grid" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {processed.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                hasUnreadNotif={notifSet.has(a.id)}
                overdue={
                  !!a.endDate &&
                  new Date(a.endDate) < startOfToday &&
                  a.status !== "completed" &&
                  a.status !== "cancelled"
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {processed.map((a, idx) => (
              <ActivityRow
                key={a.id}
                activity={a}
                rank={idx + 1}
                hasUnreadNotif={notifSet.has(a.id)}
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
  );
}

// ============================================================
// Main UserDashboard client component
// ============================================================

export function UserDashboard({ activities, personName, notifActivityIds }: UserDashboardProps) {
  const notifSet = useMemo(() => new Set(notifActivityIds), [notifActivityIds]);

  // ---- Date boundaries (Persian week starts Saturday) ----
  const now = useMemo(() => new Date(), []);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - daysSinceSaturday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // ---- Today's activities ----
  const todayActivities = useMemo(() => {
    return activities.filter((a) => {
      const s = toDate(a.startDate);
      const e = toDate(a.endDate);
      const active = a.status !== "completed" && a.status !== "cancelled";
      if (s && e) {
        if (s <= endOfToday && e >= startOfToday) return true;
        if (e < startOfToday && active) return true;
        return false;
      }
      if (e) {
        if (e >= startOfToday && e < endOfToday) return true;
        if (e < startOfToday && active) return true;
        return false;
      }
      if (s) {
        return s >= startOfToday && s < endOfToday;
      }
      return false;
    });
  }, [activities, startOfToday, endOfToday]);

  // ---- This week's activities (excluding today's) ----
  const todayIds = useMemo(() => new Set(todayActivities.map((a) => a.id)), [todayActivities]);
  const weekActivities = useMemo(() => {
    return activities.filter((a) => {
      if (todayIds.has(a.id)) return false;
      const s = toDate(a.startDate);
      const e = toDate(a.endDate);
      if (!s && !e) return false;
      const start = s || e!;
      const end = e || s!;
      return start < weekEnd && end >= weekStart;
    });
  }, [activities, todayIds, weekStart, weekEnd]);

  // ---- Top 10 by priority (urgency weight + priority) ----
  // NOTE: this is a *suggested* initial ordering. The user can re-sort via controls.
  const topPriorityBase = useMemo(() => {
    return [...activities]
      .filter((a) => a.status !== "completed" && a.status !== "cancelled")
      .sort((a, b) => {
        const ua = urgencyWeight[a.urgency] || 2;
        const ub = urgencyWeight[b.urgency] || 2;
        const scoreA = ua * 10 + (a.priority || 0);
        const scoreB = ub * 10 + (b.priority || 0);
        return scoreB - scoreA;
      });
  }, [activities]);

  // ---- Stats ----
  const totalAssigned = activities.length;
  const completedCount = activities.filter((a) => a.status === "completed").length;
  const overdueCount = activities.filter((a) => {
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

      <DashboardSection
        icon={<Clock className="w-4 h-4 text-amber-600" />}
        iconColor=""
        title="فعالیت‌های امروز"
        description="فعالیت‌هایی که امروز در بازه زمانی آن‌ها هستید یا از موعد آن‌ها گذشته است"
        totalCount={todayActivities.length}
        items={todayActivities}
        notifSet={notifSet}
        startOfToday={startOfToday}
        renderMode="grid"
      />

      <DashboardSection
        icon={<Calendar className="w-4 h-4 text-emerald-600" />}
        iconColor=""
        title="فعالیت‌های این هفته"
        description="فعالیت‌هایی که در جریان این هفته (شنبه تا جمعه) برنامه‌ریزی شده‌اند"
        totalCount={weekActivities.length}
        items={weekActivities}
        notifSet={notifSet}
        startOfToday={startOfToday}
        renderMode="grid"
      />

      <DashboardSection
        icon={<Target className="w-4 h-4 text-rose-600" />}
        iconColor=""
        title="فعالیت‌های با بالاترین اولویت"
        description="بر اساس فوریت و اولویت — ابتدا فوری‌ترین‌ها (امکان تغییر مرتب‌سازی)"
        totalCount={topPriorityBase.length}
        items={topPriorityBase}
        notifSet={notifSet}
        startOfToday={startOfToday}
        renderMode="list"
      />
    </div>
  );
}
