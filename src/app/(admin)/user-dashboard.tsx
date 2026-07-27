"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Activity as ActivityIcon,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  Target,
} from "lucide-react";
import { formatJalali, formatJalaliDateTime } from "@/lib/jalali";

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
  type?: "pms" | "activity";
  strategicTopic?: string | null;
  // For "needed me" filter — only set on PMS activities where the user's
  // org position is in hrPlan AND user's personelId is in hrActual.
  needsMe?: boolean;
}

export interface UserDashboardStatusUpdate {
  id: string;
  entityType: "activity" | "wbs";
  entityId: string;
  entityCode: string;
  entityTitle: string;
  previousStatus: string | null;
  newStatus: string;
  progressPct: number | null;
  notes: string | null;
  createdAt: string;
  personelName: string | null;
}

interface UserDashboardProps {
  activities: UserDashboardActivity[];
  personName: string;
  notifActivityIds: string[];
  statusUpdates: UserDashboardStatusUpdate[];
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

const strategicTopicMap: Record<string, string> = {
  "1.1": "1.1 - حکمرانی دارایی‌محور",
  "1.2": "1.2 - دارایی‌های داخلی",
  "1.3": "1.3 - دارایی‌های بیرونی",
  "1.4": "1.4 - دارایی‌های دانشی",
  "1.5": "1.5 - پایداری مالی",
};

const strategicTopicOrder = ["1.1", "1.2", "1.3", "1.4", "1.5"];

const PIE_COLORS_STATUS: Record<string, string> = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  completed: "#10b981",
  on_hold: "#8b5cf6",
  cancelled: "#ef4444",
};

const BAR_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

type StatusFilter = "all" | "pending" | "in_progress" | "completed";
type UrgencyFilter = "all" | "low" | "normal" | "high" | "urgent";
type SortKey = "priority" | "urgency" | "dueDate" | "updatedAt" | "title";
type TimeFilter = "today" | "week" | "all";
type HrTypeFilter = "all" | "mine" | "needed";
type ActivityTypeFilter = "all" | "pms" | "activity";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "priority", label: "اولویت (نزولی)" },
  { value: "urgency", label: "فوریت (نزولی)" },
  { value: "dueDate", label: "تاریخ پایان (صعودی)" },
  { value: "updatedAt", label: "آخرین تغییر (نزولی)" },
  { value: "title", label: "عنوان (الفبا)" },
];

// ============================================================
// Date helpers
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

// Time-based filter (today / this week / all)
function applyTimeFilter(
  list: UserDashboardActivity[],
  timeFilter: TimeFilter,
  startOfToday: Date,
  endOfToday: Date,
  weekStart: Date,
  weekEnd: Date
): UserDashboardActivity[] {
  if (timeFilter === "all") return list;
  return list.filter((a) => {
    const s = toDate(a.startDate);
    const e = toDate(a.endDate);
    const active = a.status !== "completed" && a.status !== "cancelled";
    if (timeFilter === "today") {
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
    }
    // week
    if (!s && !e) return false;
    const start = s || e!;
    const end = e || s!;
    return start < weekEnd && end >= weekStart;
  });
}

// "عقب‌افتاده" (delayed) filter — shows activities that are either past their
// end date without being completed OR are behind their expected progress
// based on the time elapsed since the start date.
function isActivityDelayed(a: UserDashboardActivity, now: Date): boolean {
  if (a.progressPct >= 100) return false;
  const s = toDate(a.startDate);
  const e = toDate(a.endDate);
  // Past end date and not completed
  if (e && e.getTime() < now.getTime() && a.status !== "completed" && a.status !== "cancelled") {
    return true;
  }
  // Behind schedule based on time elapsed
  if (s && e) {
    const total = e.getTime() - s.getTime();
    const elapsed = now.getTime() - s.getTime();
    if (total > 0 && elapsed > 0) {
      const expectedProgress = Math.min(100, Math.max(0, (elapsed / total) * 100));
      if (a.progressPct < expectedProgress) return true;
    }
  }
  return false;
}

function applyDelayedFilter(
  list: UserDashboardActivity[],
  enabled: boolean,
  now: Date
): UserDashboardActivity[] {
  if (!enabled) return list;
  return list.filter((a) => isActivityDelayed(a, now));
}

function applyTypeFilter(
  list: UserDashboardActivity[],
  typeFilter: ActivityTypeFilter
): UserDashboardActivity[] {
  if (typeFilter === "all") return list;
  return list.filter((a) =>
    typeFilter === "pms" ? a.type === "pms" : a.type === "activity"
  );
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
  const isPms = activity.type === "pms";
  const href = isPms ? `/wbs/${activity.id}` : `/activities/${activity.id}`;
  return (
    <Link
      href={href}
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
          <Badge
            variant={isPms ? "default" : "secondary"}
            className="text-[10px] shrink-0"
            title={isPms ? "فعالیت PMS" : "فعالیت جاری"}
          >
            {isPms ? "PMS" : "جاری"}
          </Badge>
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
// Collapsible section by strategic topic
// ============================================================

function StrategicTopicSection({
  topic,
  topicLabel,
  items,
  notifSet,
  startOfToday,
  endOfToday,
  weekStart,
  weekEnd,
  defaultExpanded,
  hrType,
  now,
}: {
  topic: string;
  topicLabel: string;
  items: UserDashboardActivity[];
  notifSet: Set<string>;
  startOfToday: Date;
  endOfToday: Date;
  weekStart: Date;
  weekEnd: Date;
  defaultExpanded?: boolean;
  hrType: HrTypeFilter;
  now: Date;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? items.length > 0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [delayedFilter, setDelayedFilter] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>("all");

  // Apply HR category filter first (same logic as top-level)
  const hrFilteredItems = useMemo(() => {
    if (hrType === "all") return items;
    if (hrType === "mine") return items.filter((a) => a.needsMe);
    return items.filter((a) => !a.needsMe);
  }, [items, hrType]);

  // Apply delayed filter, then type filter, then time filter, then status/urgency, then sort
  const delayedFiltered = useMemo(
    () => applyDelayedFilter(hrFilteredItems, delayedFilter, now),
    [hrFilteredItems, delayedFilter, now]
  );
  const typeFiltered = useMemo(
    () => applyTypeFilter(delayedFiltered, typeFilter),
    [delayedFiltered, typeFilter]
  );
  const timeFiltered = useMemo(
    () => applyTimeFilter(typeFiltered, timeFilter, startOfToday, endOfToday, weekStart, weekEnd),
    [typeFiltered, timeFilter, startOfToday, endOfToday, weekStart, weekEnd]
  );
  const processed = useMemo(
    () => applyFilterSort(timeFiltered, statusFilter, urgencyFilter, sortBy),
    [timeFiltered, statusFilter, urgencyFilter, sortBy]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-right"
        >
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <CardTitle className="text-base">{topicLabel}</CardTitle>
            <Badge variant="secondary" className="font-num text-xs">
              {hrFilteredItems.length.toLocaleString("fa-IR")} فعالیت
            </Badge>
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={timeFilter}
                onValueChange={(v) => { if (v) setTimeFilter(v as TimeFilter); }}
                variant="outline"
                className="gap-1"
              >
                <ToggleGroupItem value="today" className="h-7 text-xs px-3">امروز</ToggleGroupItem>
                <ToggleGroupItem value="week" className="h-7 text-xs px-3">این هفته</ToggleGroupItem>
                <ToggleGroupItem value="all" className="h-7 text-xs px-3">همه</ToggleGroupItem>
              </ToggleGroup>
              <Button
                type="button"
                variant={delayedFilter ? "default" : "outline"}
                size="sm"
                onClick={() => setDelayedFilter(!delayedFilter)}
                className="h-7 text-xs px-3"
                aria-pressed={delayedFilter}
              >
                <AlertTriangle className="w-3.5 h-3.5 ml-1" />
                عقب‌افتاده
              </Button>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ActivityTypeFilter)}>
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue placeholder="نوع فعالیت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه انواع</SelectItem>
                  <SelectItem value="pms">PMS</SelectItem>
                  <SelectItem value="activity">جاری</SelectItem>
                </SelectContent>
              </Select>
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
          {processed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {hrFilteredItems.length === 0
                ? "موردی برای نمایش وجود ندارد"
                : "با فیلتر فعلی موردی یافت نشد"}
            </p>
          ) : (
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
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================
// Main UserDashboard client component
// ============================================================

export function UserDashboard({
  activities,
  personName,
  notifActivityIds,
  statusUpdates,
}: UserDashboardProps) {
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

  // ---- HR type filter ----
  const [hrType, setHrType] = useState<HrTypeFilter>("all");
  const hrFiltered = useMemo(() => {
    if (hrType === "all") return activities;
    if (hrType === "mine") return activities.filter((a) => a.needsMe);
    // "outside chart" — activities where user's org position is NOT in hrPlan
    return activities.filter((a) => !a.needsMe);
  }, [activities, hrType]);

  // ---- Stats ----
  const totalAssigned = hrFiltered.length;
  const inProgressCount = hrFiltered.filter((a) => a.status === "in_progress").length;
  // Completed this month (Persian/Jalali month — approximate using Gregorian month)
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const completedThisMonth = hrFiltered.filter((a) => {
    if (a.status !== "completed") return false;
    const upd = new Date(a.updatedAt);
    return upd.getMonth() === currentMonth && upd.getFullYear() === currentYear;
  }).length;
  const avgProgress =
    totalAssigned > 0
      ? Math.round(
          hrFiltered.reduce((sum, a) => sum + (a.progressPct || 0), 0) / totalAssigned
        )
      : 0;

  // ---- Pie chart: distribution by status ----
  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      on_hold: 0,
    };
    hrFiltered.forEach((a) => {
      if (counts[a.status] !== undefined) counts[a.status]++;
      else counts[a.status] = 0;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: statusMap[key]?.label || key,
      value,
      color: PIE_COLORS_STATUS[key] || "#94a3b8",
    }));
  }, [hrFiltered]);

  // ---- Bar chart: activity count by strategic topic ----
  const topicChartData = useMemo(() => {
    return strategicTopicOrder.map((t) => ({
      topic: t,
      label: strategicTopicMap[t].split(" - ")[1],
      count: hrFiltered.filter((a) => a.strategicTopic === t).length,
    }));
  }, [hrFiltered]);

  // ---- Activities grouped by strategic topic ----
  // Activities without a strategic topic go into "سایر" (other)
  const groupedByTopic = useMemo(() => {
    const groups: Record<string, UserDashboardActivity[]> = {};
    strategicTopicOrder.forEach((t) => {
      groups[t] = [];
    });
    groups["other"] = [];
    hrFiltered.forEach((a) => {
      const t = a.strategicTopic;
      if (t && groups[t]) groups[t].push(a);
      else groups["other"].push(a);
    });
    return groups;
  }, [hrFiltered]);

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
        <ToggleGroup
          type="single"
          value={hrType}
          onValueChange={(v) => { if (v) setHrType(v as HrTypeFilter); }}
          variant="outline"
        >
          <ToggleGroupItem value="mine" className="text-xs">فعالیت‌های اصلی</ToggleGroupItem>
          <ToggleGroupItem value="needed" className="text-xs">فعالیت‌های خارج از چارت</ToggleGroupItem>
          <ToggleGroupItem value="all" className="text-xs">همه فعالیت‌ها</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Top section — stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
              <ActivityIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-num">
                {totalAssigned.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">تعداد کل فعالیت‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-num">
                {inProgressCount.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">در حال انجام</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-num">
                {completedThisMonth.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">تکمیل شده (این ماه)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-num">
                {avgProgress.toLocaleString("fa-IR")}%
              </p>
              <p className="text-xs text-muted-foreground">میانگین پیشرفت</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top section — charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">توزیع فعالیت‌ها بر اساس وضعیت</CardTitle>
          </CardHeader>
          <CardContent>
            {totalAssigned === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                داده‌ای موجود نیست
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={90}
                      innerRadius={40}
                      dataKey="value"
                      label={({ value }: { value?: number }) =>
                        value ? value.toLocaleString("fa-IR") : ""
                      }
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        value.toLocaleString("fa-IR"),
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تعداد فعالیت بر اساس موضوع استراتژیک</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicChartData} layout="vertical" margin={{ right: 16, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString("fa-IR"), "تعداد"]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {topicChartData.map((_, index) => (
                      <Cell key={`bar-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle section — collapsible topics */}
      <div className="space-y-3">
        {strategicTopicOrder.map((t) => (
          <StrategicTopicSection
            key={t}
            topic={t}
            topicLabel={strategicTopicMap[t]}
            items={groupedByTopic[t]}
            notifSet={notifSet}
            startOfToday={startOfToday}
            endOfToday={endOfToday}
            weekStart={weekStart}
            weekEnd={weekEnd}
            defaultExpanded={groupedByTopic[t].length > 0}
            hrType={hrType}
            now={now}
          />
        ))}
        {groupedByTopic["other"].length > 0 && (
          <StrategicTopicSection
            topic="other"
            topicLabel="سایر فعالیت‌ها (بدون موضوع استراتژیک)"
            items={groupedByTopic["other"]}
            notifSet={notifSet}
            startOfToday={startOfToday}
            endOfToday={endOfToday}
            weekStart={weekStart}
            weekEnd={weekEnd}
            defaultExpanded
            hrType={hrType}
            now={now}
          />
        )}
      </div>

      {/* Bottom section — recent status updates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            آخرین وضعیت فعالیت‌ها
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            ۱۰ بروزرسانی اخیر در فعالیت‌های PMS و جاری
          </p>
        </CardHeader>
        <CardContent>
          {statusUpdates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              هنوز بروزرسانی ثبت نشده است
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {statusUpdates.map((su) => {
                const href =
                  su.entityType === "wbs"
                    ? `/wbs/${su.entityId}`
                    : `/activities/${su.entityId}`;
                const prevLabel =
                  statusMap[su.previousStatus || ""]?.label || su.previousStatus || "-";
                const newLabel =
                  statusMap[su.newStatus]?.label || su.newStatus;
                const typeBadge =
                  su.entityType === "wbs" ? "PMS" : "جاری";
                return (
                  <Link
                    key={su.id}
                    href={href}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                          {su.entityCode}
                        </Badge>
                        <Badge
                          variant={su.entityType === "wbs" ? "default" : "secondary"}
                          className="text-[10px] shrink-0"
                        >
                          {typeBadge}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {su.entityTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{prevLabel}</span>
                        <span>→</span>
                        <span className="font-medium text-foreground">{newLabel}</span>
                        {su.progressPct != null && (
                          <Badge variant="secondary" className="font-num text-[10px]">
                            {Math.round(su.progressPct).toLocaleString("fa-IR")}%
                          </Badge>
                        )}
                        {su.notes && (
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            — {su.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-xs text-muted-foreground">
                        {su.personelName || "سیستم"}
                      </p>
                      <p className="text-xs text-muted-foreground font-num">
                        {formatJalaliDateTime(su.createdAt)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
