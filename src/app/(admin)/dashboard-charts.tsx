"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Network,
  Users,
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Activity as ActivityIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Tablet,
  Wrench,
} from "lucide-react";
import { ElectricBorder, ELECTRIC_PRESETS } from "@/components/modern/electric-border";
import { useModernMode } from "@/components/modern/modern-mode-provider";

// =================================================================
// Types
// =================================================================
interface Stats {
  wbsCount: number;
  personelCount: number;
  assetCount: number;
  openRiskCount: number;
  activeProjects?: number;
  totalRevenue?: number;
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
    revenueByTheme: TopItem[];
  };
  recentItems: RecentItem[];
  personnelStats: PersonnelStat[];
}

// =================================================================
// Helpers
// =================================================================
function formatAmount(n: number): string {
  if (!n || isNaN(n)) return "۰";
  return Math.round(n).toLocaleString("fa-IR");
}

function formatCompact(n: number): string {
  if (!n || isNaN(n)) return "۰";
  if (n >= 1_000_000_000) return Number((n / 1_000_000_000).toFixed(1)).toLocaleString("fa-IR") + " م.ت";
  if (n >= 1_000_000) return Number((n / 1_000_000).toFixed(0)).toLocaleString("fa-IR") + " م.م";
  if (n >= 1_000) return Number((n / 1_000).toFixed(0)).toLocaleString("fa-IR") + " ه.ت";
  return n.toLocaleString("fa-IR");
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
    <Card>
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
// 2) TrendChart — AreaChart of revenue trend / S-curve
// =================================================================
export function TrendChart({ data, title, subtitle }: { data: TrendPoint[]; title: string; subtitle?: string }) {
  const { isModern } = useModernMode();
  const chartData = (data || []).map((p) => ({
    name: formatMonth(p.monthDate),
    "برنامه": Math.round((p.plannedPct || 0) * 100),
    "واقعی": p.actualPct != null ? Math.round(p.actualPct * 100) : null,
  }));

  const card = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
                name="برنامه"
              />
              <Area
                type="monotone"
                dataKey="واقعی"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#colorActual)"
                name="واقعی"
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
// 3) TopItemsList — top 5 by value
// =================================================================
export function TopItemsList({
  items,
  title,
  subtitle,
  emptyLabel,
  valueFormatter = formatCompact,
}: {
  items: TopItem[];
  title: string;
  subtitle?: string;
  emptyLabel?: string;
  valueFormatter?: (n: number) => string;
}) {
  const { isModern } = useModernMode();
  const top5 = (items || [])
    .slice()
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  const max = top5.length > 0 ? Math.max(...top5.map((i) => i.value || 0)) : 0;

  const card = (
    <Card className="h-full">
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
                    <span className="text-xs font-bold font-num shrink-0">
                      {valueFormatter(item.value || 0)}
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
// =================================================================
export function RecentTable({ items }: { items: RecentItem[] }) {
  const { isModern } = useModernMode();
  const card = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-primary" />
          آخرین فعالیت‌ها
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          ۱۰ فعالیت آخر به‌روزرسانی شده در سامانه (PMS و جاری)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            هنوز فعالیتی ثبت نشده است
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr>
                  <th className="text-right font-semibold p-3 text-xs text-muted-foreground">عنوان</th>
                  <th className="text-right font-semibold p-3 text-xs text-muted-foreground w-32">وضعیت</th>
                  <th className="text-right font-semibold p-3 text-xs text-muted-foreground w-40">مسئول</th>
                  <th className="text-right font-semibold p-3 text-xs text-muted-foreground w-32">تاریخ</th>
                  <th className="text-right font-semibold p-3 text-xs text-muted-foreground w-32">پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((item, idx) => {
                  const st = statusMap[item.status] || { label: item.status, variant: "outline" as const };
                  return (
                    <tr
                      key={`${item.type}-${item.id}`}
                      className={idx % 2 === 0 ? "" : "bg-muted/20"}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant={item.type === "pms" ? "default" : "secondary"}
                            className="text-[10px] shrink-0"
                          >
                            {item.type === "pms" ? "PMS" : "جاری"}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {item.code}
                          </span>
                          <span className="font-medium truncate">{item.title}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={st.variant} className="text-xs">
                          {st.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.assigneeName || "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-num">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={item.progressPct || 0} className="h-1.5 flex-1" />
                          <span className="text-xs font-bold font-num shrink-0 w-8 text-left">
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
// 5) PersonnelStatsGrid — avatars + 6 metrics per user
// =================================================================
export function PersonnelStatsGrid({ personnel }: { personnel: PersonnelStat[] }) {
  const { isModern } = useModernMode();
  const card = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          عملکرد پرسنل
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          آمار تفصیلی فعالیت، اصلاحی، علت تأخیر و حضور هر کاربر در سامانه
        </p>
      </CardHeader>
      <CardContent>
        {personnel.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            پرسنلی ثبت نشده است
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personnel.map((p) => (
              <div
                key={p.id}
                className="border rounded-xl p-3 bg-card hover:shadow-md transition-shadow space-y-3"
              >
                {/* Header: avatar + name */}
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

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  <MetricCell
                    icon={ActivityIcon}
                    value={p.activityCount}
                    label="فعالیت"
                    color="text-blue-600"
                  />
                  <MetricCell
                    icon={TrendingUp}
                    value={Math.round(p.avgProgress)}
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

// Small metric cell with icon
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
// Main DashboardCharts component — assembles the new layout
// =================================================================
export function DashboardCharts({ data }: { data: DashboardData }) {
  const stats = data?.stats || { wbsCount: 0, personelCount: 0, assetCount: 0, openRiskCount: 0 };
  const pms = data?.pms || { rootScurve: [], rootProgress: 0, rootPlan: 0 };
  const financial = data?.financial || { totalCost: 0, totalRevenue: 0, costByCategory: [], revenueByTheme: [] };
  const recentItems = data?.recentItems || [];
  const personnelStats = data?.personnelStats || [];

  return (
    <div className="space-y-6">
      {/* ===== Row 1: Header ===== */}
      <div>
        <h1 className="text-2xl font-bold">داشبورد</h1>
        <p className="text-sm text-muted-foreground mt-1">
          نمای کلی عملکرد سازمان — فعالیت‌ها، مالی، پرسنل و آخرین به‌روزرسانی‌ها
        </p>
      </div>

      {/* ===== Row 1: 4 KPI Cards ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="تعداد پرسنل"
          value={stats.personelCount.toLocaleString("fa-IR")}
          icon={Users}
          color="bg-gradient-to-br from-emerald-500 to-teal-600"
          preset="hr"
        />
        <StatCard
          label="پروژه‌های فعال (PMS)"
          value={stats.wbsCount.toLocaleString("fa-IR")}
          icon={Network}
          color="bg-gradient-to-br from-blue-500 to-indigo-600"
          preset="project"
        />
        <StatCard
          label="درآمد کل (پیش‌بینی برنامه‌ای)"
          value={formatCompact(financial.totalRevenue || 0)}
          icon={DollarSign}
          color="bg-gradient-to-br from-amber-500 to-orange-600"
          preset="financial"
        />
        <StatCard
          label="ریسک‌های باز"
          value={stats.openRiskCount.toLocaleString("fa-IR")}
          icon={AlertTriangle}
          color="bg-gradient-to-br from-rose-500 to-red-600"
          preset="kpi"
        />
      </div>

      {/* ===== Row 2: Trend chart (2/3) + Top items (1/3) ===== */}
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
            items={financial.costByCategory}
            title="پرهزینه‌ترین دسته‌ها"
            subtitle="۵ دسته برتر بر اساس پیش‌بینی برنامه‌ای"
            emptyLabel="هزینه‌ای ثبت نشده است"
            valueFormatter={formatCompact}
          />
        </div>
      </div>

      {/* ===== Row 3: Personnel performance grid ===== */}
      <PersonnelStatsGrid personnel={personnelStats} />

      {/* ===== Row 4: Recent activities table ===== */}
      <RecentTable items={recentItems} />
    </div>
  );
}
