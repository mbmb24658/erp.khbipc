"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Network,
  Users,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Activity as ActivityIcon,
  Clock,
  Wrench,
  AlertCircle,
  Flame,
  ShieldAlert,
  Calendar,
  Search,
} from "lucide-react";
import { ElectricBorder, ELECTRIC_PRESETS } from "@/components/modern/electric-border";
import { useModernMode } from "@/components/modern/modern-mode-provider";
import { getTodayJalaliLong } from "@/lib/actual-progress-distribution";

// =================================================================
// Types
// =================================================================
interface Stats {
  wbsCount: number;
  personelCount: number;
  assetCount: number;
  openRiskCount: number;
}

interface TrendPoint {
  monthDate: string;
  plannedPct: number;
  actualPct: number | null;
}

interface TopItem {
  name: string;
  value: number;
  date?: string;
}

interface RecentItem {
  id: string;
  code: string;
  title: string;
  status: string;
  progressPct: number;
  updatedAt: string;
  type: "activity" | "pms";
  assigneeName: string | null;
}

interface PersonnelStat {
  id: string;
  name: string;
  position: string | null;
  initials: string;
  activityCount: number;
  avgProgress: number;
  offChartCount: number;
  correctiveCount: number;
  delayCauseCount: number;
  presenceCount: number;
}

interface StrategicTopic {
  code: string;       // "1.1"
  label: string;      // "1.1 - حکمرانی دارایی‌محور"
  progress: number;
  scurve: TrendPoint[];
}

interface RiskStats {
  total: number;
  openCount: number;
  closedCount: number;
  byType: { name: string; value: number }[];
  byLevel: { level: string; count: number; color: string }[];
  heatmap: { impact: string; probability: string; count: number; level: string }[];
}

export interface DashboardData {
  stats: Stats;
  pms: {
    rootScurve: TrendPoint[];
    rootProgress: number;
    rootPlan: number;
  };
  financial: {
    totalCost: number;
    totalRevenue: number;
    costByCategory: TopItem[];
    topAssets: TopItem[]; // پردرآمدترین دارایی‌ها
  };
  recentItems: RecentItem[];
  personnelStats: PersonnelStat[];
  strategicTopics: StrategicTopic[];
  risk: RiskStats;
}

// =================================================================
// Helpers — All amounts are stored as "million tomans" in the DB.
// So a value of 500 means 500 million tomans, 6150 = 6.15 billion tomans.
// We display:
//   - values >= 1000  →  (value/1000) + " میلیارد تومان"  (e.g. 6.15 میلیارد تومان)
//   - values < 1000   →  value + " میلیون تومان"          (e.g. 500 میلیون تومان)
// =================================================================
function formatAmount(value: number): string {
  if (!value || isNaN(value)) return "۰";
  if (value >= 1000) {
    const billions = value / 1000;
    // Show 1 decimal if not whole, else integer
    const formatted = billions % 1 === 0
      ? billions.toLocaleString("fa-IR")
      : billions.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
    return `${formatted} میلیارد تومان`;
  }
  return `${value.toLocaleString("fa-IR")} میلیون تومان`;
}

// Compact version for tight spaces (KPI cards)
function formatAmountCompact(value: number): string {
  if (!value || isNaN(value)) return "۰";
  if (value >= 1000) {
    const billions = value / 1000;
    const formatted = billions % 1 === 0
      ? billions.toLocaleString("fa-IR")
      : billions.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
    return `${formatted} م.ت`; // میلیارد تومان
  }
  return `${value.toLocaleString("fa-IR")} م.م`; // میلیون تومان
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMonth(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fa-IR", { month: "short", year: "2-digit" });
  } catch {
    return iso;
  }
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "در انتظار", variant: "secondary" },
  in_progress: { label: "در حال انجام", variant: "default" },
  completed: { label: "تکمیل", variant: "outline" },
  cancelled: { label: "لغو", variant: "destructive" },
  on_hold: { label: "متوقف", variant: "secondary" },
};

// Strategic topic labels
const strategicTopicLabels: Record<string, string> = {
  "1.1": "۱.۱ - حکمرانی دارایی‌محور",
  "1.2": "۱.۲ - دارایی‌های داخلی",
  "1.3": "۱.۳ - دارایی‌های بیرونی",
  "1.4": "۱.۴ - دارایی‌های دانشی",
  "1.5": "۱.۵ - پایداری مالی",
};

const strategicTopicColors: Record<string, string> = {
  "1.1": "#f43f5e", // rose
  "1.2": "#f59e0b", // amber
  "1.3": "#10b981", // emerald
  "1.4": "#8b5cf6", // violet
  "1.5": "#3b82f6", // blue
};

// Risk heatmap helpers
const impactMap: Record<string, number> = { اساسی: 5, عمده: 4, متوسط: 3, جزئی: 2, ناچیز: 1 };
const probMap: Record<string, number> = { نادر: 1, بعید: 2, ممکن: 3, محتمل: 4, مکرر: 5 };
const heatLevel: Record<string, string> = {
  Low: "bg-emerald-500",
  Medium: "bg-amber-500",
  High: "bg-orange-500",
  Critical: "bg-red-500",
};
const impactsOrder = ["اساسی", "عمده", "متوسط", "جزئی", "ناچیز"];
const probsOrder = ["نادر", "بعید", "ممکن", "محتمل", "مکرر"];

function computeHeatLevel(impact: string, prob: string): string {
  const i = impactMap[impact];
  const p = probMap[prob];
  if (!i || !p) return "Low";
  // Simple matrix: i*p
  const score = i * p;
  if (score >= 16) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

// =================================================================
// 1) KPI Stat Card
// =================================================================
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  preset = "stat",
  suffix,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
  preset?: keyof typeof ELECTRIC_PRESETS;
  suffix?: string;
}) {
  const { isModern } = useModernMode();
  const card = (
    <Card className="elevated-card surface-tint-1">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold truncate font-num">
              {value}
              {suffix && <span className="text-xs font-normal text-muted-foreground mr-1">{suffix}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS[preset]}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// 2) TrendChart — AreaChart of PMS root S-curve
// Shows both planned AND actual progress
// =================================================================
export function TrendChart({ data, title, subtitle }: { data: TrendPoint[]; title: string; subtitle?: string }) {
  const { isModern } = useModernMode();
  const chartData = (data || []).map((p) => ({
    name: formatMonth(p.monthDate),
    "برنامه": Math.round((p.plannedPct || 0) * 100),
    "واقعی": p.actualPct != null ? Math.round(p.actualPct * 100) : null,
  }));

  // Check if there's any actual data
  const hasActual = chartData.some((p) => p["واقعی"] != null);

  const card = (
    <Card className="h-full elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {!hasActual && chartData.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠ هنوز پیشرفت واقعی ثبت نشده است — برای محاسبه، از صفحه PMS روی «محاسبه خودکار پیشرفت برنامه» کلیک کنید
          </p>
        )}
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 0.1)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fontFamily: "Vazirmatn" }}
                stroke="oklch(0.5 0 0 / 0.4)"
              />
              <YAxis
                tick={{ fontSize: 11, fontFamily: "Vazirmatn" }}
                stroke="oklch(0.5 0 0 / 0.4)"
                tickFormatter={(v) => `${v}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontFamily: "Vazirmatn",
                }}
                formatter={(value: any) => (value == null ? "—" : `${value}%`)}
              />
              <Area
                type="monotone"
                dataKey="برنامه"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorPlan)"
                name="پیشرفت برنامه"
              />
              <Area
                type="monotone"
                dataKey="واقعی"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#colorActual)"
                name="پیشرفت واقعی"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.project}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// 3) TopItemsList — top 5 by value (generic, used for assets and costs)
// =================================================================
export function TopItemsList({
  items,
  title,
  subtitle,
  emptyLabel,
}: {
  items: TopItem[];
  title: string;
  subtitle?: string;
  emptyLabel?: string;
}) {
  const { isModern } = useModernMode();
  const top5 = (items || [])
    .slice()
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  const max = top5.length > 0 ? Math.max(...top5.map((i) => i.value || 0)) : 0;

  const card = (
    <Card className="h-full elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        {top5.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            {emptyLabel || "موردی یافت نشد"}
          </div>
        ) : (
          <div className="space-y-3">
            {top5.map((item, idx) => {
              const pct = max > 0 ? Math.round(((item.value || 0) / max) * 100) : 0;
              return (
                <div key={`${item.name}-${idx}`} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 font-num">
                        {(idx + 1).toLocaleString("fa-IR")}
                      </span>
                      <span className="text-xs font-medium truncate">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold font-num shrink-0 text-right">
                      {formatAmount(item.value || 0)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.financial}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// 4) RecentTable — full-width recent activities table
//    With per-column filtering + centered alignment
// =================================================================
export function RecentTable({ items }: { items: RecentItem[] }) {
  const { isModern } = useModernMode();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Apply filters
  const filtered = items.filter((item) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q) &&
        !(item.assigneeName || "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (statusFilter && item.status !== statusFilter) return false;
    if (typeFilter && item.type !== typeFilter) return false;
    return true;
  });

  const hasFilters = search || statusFilter || typeFilter;

  const card = (
    <Card className="elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-primary" />
          آخرین فعالیت‌ها
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString("fa-IR")} فعالیت — فیلتر بر اساس ستون‌ها
        </p>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <div className="relative max-w-xs flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="جستجو در عنوان، کد، مسئول..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-9 text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 rounded-md border bg-background text-xs"
          >
            <option value="">همه انواع</option>
            <option value="pms">PMS</option>
            <option value="activity">جاری</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-md border bg-background text-xs"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="pending">در انتظار</option>
            <option value="in_progress">در حال انجام</option>
            <option value="completed">تکمیل</option>
            <option value="on_hold">متوقف</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setTypeFilter("");
              }}
              className="h-9 text-xs"
            >
              پاک کردن
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {hasFilters ? "موردی با این فیلترها یافت نشد" : "هنوز فعالیتی ثبت نشده است"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground">عنوان</th>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground w-32">نوع</th>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground w-32">وضعیت</th>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground w-40">مسئول</th>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground w-32">تاریخ</th>
                  <th className="text-center font-semibold p-3 text-xs text-muted-foreground w-32">پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 10).map((item, idx) => {
                  const st = statusMap[item.status] || { label: item.status, variant: "outline" as const };
                  return (
                    <tr
                      key={`${item.type}-${item.id}`}
                      className={idx % 2 === 0 ? "" : "bg-muted/20"}
                    >
                      <td className="p-3 text-center">
                        <div className="flex items-center gap-2 justify-center min-w-0">
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {item.code}
                          </span>
                          <span className="font-medium truncate">{item.title}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={item.type === "pms" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {item.type === "pms" ? "PMS" : "جاری"}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={st.variant} className="text-xs">
                          {st.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground text-center">
                        {item.assigneeName || "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-num text-center">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={item.progressPct || 0} className="h-1.5 flex-1" />
                          <span className="text-xs font-bold font-num shrink-0 w-8 text-center">
                            {Math.round(item.progressPct || 0).toLocaleString("fa-IR")}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.kpi}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// 5) PersonnelStatsGrid — only users with login accounts
// Each card: avatar + 6 metrics
// =================================================================
export function PersonnelStatsGrid({ personnel }: { personnel: PersonnelStat[] }) {
  const { isModern } = useModernMode();
  const card = (
    <Card className="elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          عملکرد پرسنل
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          آمار تفصیلی کاربران دارای حساب کاربری — فعالیت، اصلاحی، علت تأخیر و حضور در سامانه
        </p>
      </CardHeader>
      <CardContent>
        {personnel.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            کاربری با حساب کاربری ثبت نشده است
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personnel.map((p) => (
              <div
                key={p.id}
                className="border rounded-xl p-3 bg-card hover:shadow-md transition-shadow space-y-3"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-white ring-2 ring-background">
                    <AvatarFallback className="bg-transparent text-sm font-bold">
                      {p.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.position || "بدون سمت"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <MetricCell
                    icon={ActivityIcon}
                    value={p.activityCount}
                    label="فعالیت"
                    color="text-blue-600"
                  />
                  <MetricCell
                    icon={TrendingUp}
                    value={p.avgProgress}
                    suffix="٪"
                    label="میانگین پیشرفت"
                    color="text-emerald-600"
                  />
                  <MetricCell
                    icon={AlertCircle}
                    value={p.offChartCount}
                    label="خارج از چارت"
                    color="text-amber-600"
                  />
                  <MetricCell
                    icon={Wrench}
                    value={p.correctiveCount}
                    label="اصلاحی"
                    color="text-purple-600"
                  />
                  <MetricCell
                    icon={AlertTriangle}
                    value={p.delayCauseCount}
                    label="علت تأخیر"
                    color="text-rose-600"
                  />
                  <MetricCell
                    icon={Clock}
                    value={p.presenceCount}
                    label="حضور در سامانه"
                    color="text-cyan-600"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.hr}>
      {card}
    </ElectricBorder>
  );
}

function MetricCell({
  icon: Icon,
  value,
  suffix,
  label,
  color,
}: {
  icon: any;
  value: number;
  suffix?: string;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-2 text-center">
      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
      <p className={`text-sm font-bold font-num ${color}`}>
        {value.toLocaleString("fa-IR")}
        {suffix}
      </p>
      <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

// =================================================================
// 6) StrategicTopicCharts — S-curve per strategic topic (1.1 - 1.5)
// =================================================================
export function StrategicTopicCharts({ topics }: { topics: StrategicTopic[] }) {
  const { isModern } = useModernMode();

  const card = (
    <Card className="elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          روند پیشرفت موضوعات استراتژیک
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          منحنی S پیشرفت برنامه‌ریزی‌شده در برابر واقعی برای هر یک از ۵ موضوع استراتژیک
        </p>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            موضوع استراتژیکی ثبت نشده است
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => {
              const color = strategicTopicColors[topic.code] || "#10b981";
              const chartData = topic.scurve.map((p) => ({
                name: formatMonth(p.monthDate),
                برنامه: Math.round((p.plannedPct || 0) * 100),
                واقعی: p.actualPct != null ? Math.round(p.actualPct * 100) : null,
              }));
              return (
                <div key={topic.code} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-xs font-semibold truncate">
                        {strategicTopicLabels[topic.code] || topic.label}
                      </span>
                    </div>
                    <span className="text-xs font-bold font-num shrink-0" style={{ color }}>
                      {Math.round((topic.progress || 0) * 100).toLocaleString("fa-IR")}٪
                    </span>
                  </div>
                  {chartData.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-[11px] text-muted-foreground">
                      داده‌ای ثبت نشده
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`grad-plan-${topic.code}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 0.08)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fontFamily: "Vazirmatn" }}
                          stroke="oklch(0.5 0 0 / 0.3)"
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 9, fontFamily: "Vazirmatn" }}
                          stroke="oklch(0.5 0 0 / 0.3)"
                          tickFormatter={(v) => `${v}%`}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            fontSize: "10px",
                            fontFamily: "Vazirmatn",
                          }}
                          formatter={(value: any) => (value == null ? "—" : `${value}%`)}
                        />
                        <Area
                          type="monotone"
                          dataKey="برنامه"
                          stroke={color}
                          strokeWidth={1.5}
                          fill={`url(#grad-plan-${topic.code})`}
                          name="برنامه"
                        />
                        <Area
                          type="monotone"
                          dataKey="واقعی"
                          stroke="#10b981"
                          strokeWidth={1.5}
                          fill="transparent"
                          name="واقعی"
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.project}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// 7) RiskCharts — risk overview + heatmap
// =================================================================
export function RiskCharts({ risk }: { risk: RiskStats }) {
  const { isModern } = useModernMode();

  // Build 5x5 heatmap matrix from risk.heatmap array
  // Each cell: { impact, probability, count, level }
  const matrix: { count: number; level: string }[][] = [];
  for (let i = 0; i < 5; i++) {
    matrix.push([]);
    for (let j = 0; j < 5; j++) matrix[i].push({ count: 0, level: "Low" });
  }
  for (const cell of risk.heatmap || []) {
    const iIdx = impactMap[cell.impact];
    const pIdx = probMap[cell.probability];
    if (!iIdx || !pIdx) continue;
    const row = 5 - iIdx; // impact 5 (اساسی) → row 0 (top)
    const col = pIdx - 1; // prob 1 (نادر) → col 0 (left)
    if (row >= 0 && row < 5 && col >= 0 && col < 5) {
      matrix[row][col].count += cell.count;
      matrix[row][col].level = cell.level || computeHeatLevel(cell.impact, cell.probability);
    }
  }

  const byTypeData = (risk.byType || []).map((t) => ({
    name: t.name,
    تعداد: t.value,
  }));

  const card = (
    <Card className="elevated-card surface-tint-1">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-primary" />
          وضعیت ریسک و نقشه حرارتی
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          توزیع ریسک‌ها بر اساس نوع، سطح و ماتریس ۵×۵ احتمال-اثر
        </p>
      </CardHeader>
      <CardContent>
        {/* Top: 4 stat cards */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-lg font-bold font-num">{(risk.total || 0).toLocaleString("fa-IR")}</p>
            <p className="text-[10px] text-muted-foreground">کل ریسک‌ها</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
            <p className="text-lg font-bold font-num text-amber-600">
              {(risk.openCount || 0).toLocaleString("fa-IR")}
            </p>
            <p className="text-[10px] text-muted-foreground">ریسک‌های باز</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
            <p className="text-lg font-bold font-num text-emerald-600">
              {(risk.closedCount || 0).toLocaleString("fa-IR")}
            </p>
            <p className="text-[10px] text-muted-foreground">ریسک‌های بسته</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/20 rounded-lg p-3 text-center">
            <p className="text-lg font-bold font-num text-rose-600">
              {((risk.byLevel || []).find((l) => l.level === "Critical")?.count || 0).toLocaleString("fa-IR")}
            </p>
            <p className="text-[10px] text-muted-foreground">بحرانی</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: bar chart of risk by type */}
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">توزیع بر اساس نوع</p>
            {byTypeData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                داده‌ای موجود نیست
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byTypeData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 0.08)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fontFamily: "Vazirmatn" }}
                    stroke="oklch(0.5 0 0 / 0.4)"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: "Vazirmatn" }}
                    stroke="oklch(0.5 0 0 / 0.4)"
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontFamily: "Vazirmatn",
                    }}
                  />
                  <Bar dataKey="تعداد" radius={[4, 4, 0, 0]}>
                    {byTypeData.map((_, idx) => (
                      <Cell key={idx} fill={idx % 2 === 0 ? "#f43f5e" : "#8b5cf6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Right: heatmap */}
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">
              نقشه حرارتی (احتمال × اثر)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr>
                    <th className="p-1 text-muted-foreground"></th>
                    {probsOrder.map((p) => (
                      <th key={p} className="p-1 text-center font-medium text-muted-foreground">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {impactsOrder.map((imp, rowIdx) => (
                    <tr key={imp}>
                      <td className="p-1 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {imp}
                      </td>
                      {probsOrder.map((prob, colIdx) => {
                        const cell = matrix[rowIdx][colIdx];
                        const bg = heatLevel[cell.level] || "bg-muted";
                        return (
                          <td key={prob} className="p-0.5">
                            <div
                              className={`${bg} rounded text-white text-center font-bold font-num h-8 flex items-center justify-center ${
                                cell.count > 0 ? "" : "opacity-30"
                              }`}
                            >
                              {cell.count > 0 ? cell.count.toLocaleString("fa-IR") : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> پایین
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> متوسط
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500"></span> زیاد
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500"></span> بحرانی
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!isModern) return card;
  return (
    <ElectricBorder enabled {...ELECTRIC_PRESETS.kpi}>
      {card}
    </ElectricBorder>
  );
}

// =================================================================
// Main DashboardCharts — new layout
// =================================================================
export function DashboardCharts({ data }: { data: DashboardData }) {
  const stats = data?.stats || { wbsCount: 0, personelCount: 0, assetCount: 0, openRiskCount: 0 };
  const pms = data?.pms || { rootScurve: [], rootProgress: 0, rootPlan: 0 };
  const financial = data?.financial || { totalCost: 0, totalRevenue: 0, costByCategory: [], topAssets: [] };
  const recentItems = data?.recentItems || [];
  const personnelStats = data?.personnelStats || [];
  const strategicTopics = data?.strategicTopics || [];
  const risk = data?.risk || { total: 0, openCount: 0, closedCount: 0, byType: [], byLevel: [], heatmap: [] };

  return (
    <div className="space-y-6">
      {/* ===== Row 1: Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">داشبورد</h1>
          <p className="text-sm text-muted-foreground mt-1">
            نمای کلی عملکرد سازمان — فعالیت‌ها، مالی، پرسنل، موضوعات استراتژیک و ریسک
          </p>
        </div>
        {/* Today's date (Shamsi) */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border text-sm">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-medium">{getTodayJalaliLong()}</span>
        </div>
      </div>

      {/* ===== Row 2: 4 KPI Cards ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          label="تعداد کاربران"
          value={stats.personelCount.toLocaleString("fa-IR")}
          icon={Users}
          color="bg-gradient-to-br from-emerald-500 to-teal-600"
          preset="hr"
        />
        <StatCard
          label="هزینه کل (پیش‌بینی برنامه‌ای)"
          value={formatAmountCompact(financial.totalCost || 0)}
          icon={DollarSign}
          color="bg-gradient-to-br from-rose-500 to-red-600"
          preset="kpi"
          suffix={financial.totalCost >= 1000 ? "(میلیارد تومان)" : "(میلیون تومان)"}
        />
        <StatCard
          label="درآمد کل (پیش‌بینی برنامه‌ای)"
          value={formatAmountCompact(financial.totalRevenue || 0)}
          icon={DollarSign}
          color="bg-gradient-to-br from-amber-500 to-orange-600"
          preset="financial"
          suffix={financial.totalRevenue >= 1000 ? "(میلیارد تومان)" : "(میلیون تومان)"}
        />
        <StatCard
          label="ریسک‌های باز"
          value={stats.openRiskCount.toLocaleString("fa-IR")}
          icon={AlertTriangle}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
          preset="project"
        />
      </div>

      {/* ===== Row 3: Trend chart (2/3) + Top revenue assets (1/3) ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            data={pms.rootScurve}
            title="روند پیشرفت سازمان"
            subtitle="منحنی پیشرفت برنامه‌ریزی‌شده در برابر پیشرفت واقعی (درصد)"
          />
        </div>
        <div className="lg:col-span-1">
          <TopItemsList
            items={financial.topAssets}
            title="پردرآمدترین دارایی‌ها"
            subtitle="۵ دارایی برتر بر اساس درآمد پیش‌بینی‌شده"
            emptyLabel="دارایی‌ای با درآمد ثبت نشده است"
          />
        </div>
      </div>

      {/* ===== Row 4: Personnel performance ===== */}
      <PersonnelStatsGrid personnel={personnelStats} />

      {/* ===== Row 5: Strategic topic S-curves ===== */}
      <StrategicTopicCharts topics={strategicTopics} />

      {/* ===== Row 6: Risk charts + heatmap ===== */}
      <RiskCharts risk={risk} />

      {/* ===== Row 7: Recent activities table ===== */}
      <RecentTable items={recentItems} />
    </div>
  );
}
