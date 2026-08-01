"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { SCurveChart } from "@/components/s-curve-chart";
import {
  Network,
  Users,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ClipboardCheck,
  DollarSign,
} from "lucide-react";
import { formatJalali } from "@/lib/jalali";
import { ElectricBorder, ELECTRIC_PRESETS } from "@/components/modern/electric-border";
import { useModernMode } from "@/components/modern/modern-mode-provider";

// =================================================================
// Types — mirror the shape returned by /api/dashboard
// =================================================================
interface Stats {
  wbsCount: number;
  personelCount: number;
  assetCount: number;
  openRiskCount: number;
}

interface SCurvePoint {
  monthDate: string;
  plannedPct: number;
  actualPct: number | null;
}

interface TopicScurve {
  topic: string;
  label: string;
  wbsCode: string;
  color: string;
  progress: number;
  scurve: SCurvePoint[];
}

interface PmsData {
  rootScurve: SCurvePoint[];
  rootProgress: number;
  rootPlan: number;
  topics: TopicScurve[];
}

interface FinancialData {
  totalCost: number;
  totalRevenue: number;
  costByCategory: { name: string; value: number }[];
  revenueByTheme: { name: string; value: number }[];
}

interface RiskData {
  positiveCount: number;
  negativeCount: number;
  byStatus: { key: string; label: string; count: number }[];
}

interface IssuesData {
  total: number;
  critical: number;
  byTopic: { topic: string; label: string; color: string; count: number }[];
}

interface EvaluationData {
  thisMonthCount: number;
  avgScore: number;
  byPosition: { position: string; avgScore: number; count: number }[];
}

export interface DashboardData {
  stats: Stats;
  pms: PmsData;
  financial: FinancialData;
  risk: RiskData;
  issues: IssuesData;
  evaluation: EvaluationData;
}

// Helper: format currency amounts in Persian with thousands separators
function formatAmount(n: number): string {
  if (!n || isNaN(n)) return "۰";
  return Math.round(n).toLocaleString("fa-IR");
}

// Helper: compact amount for axis labels (میلیون / میلیارد)
// Note: String.prototype.toLocaleString in TS doesn't accept locale args,
// so we convert the toFixed string back to a Number before calling toLocaleString.
function formatCompact(n: number): string {
  if (!n || isNaN(n)) return "۰";
  if (n >= 1_000_000_000) return Number((n / 1_000_000_000).toFixed(1)).toLocaleString("fa-IR") + " م.ت";
  if (n >= 1_000_000) return Number((n / 1_000_000).toFixed(0)).toLocaleString("fa-IR") + " م.م";
  if (n >= 1_000) return Number((n / 1_000).toFixed(0)).toLocaleString("fa-IR") + " ه.ت";
  return n.toLocaleString("fa-IR");
}

// Risk status colors
const riskStatusColors: Record<string, string> = {
  open: "#dc2626",          // red
  in_progress: "#f59e0b",   // amber
  mitigating: "#3b82f6",    // blue
  closed: "#16a34a",        // emerald
  resolved: "#059669",      // green
};

// =================================================================
// Stat Cards Row — with ElectricBorder in modern mode
// =================================================================
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  preset = "stat",
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
  preset?: keyof typeof ELECTRIC_PRESETS;
}) {
  const { isModern } = useModernMode();
  const card = (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold truncate font-num">{value}</p>
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
// Section Card wrapper — with ElectricBorder in modern mode
// =================================================================
function SectionCard({
  title,
  subtitle,
  children,
  preset = "project",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  preset?: keyof typeof ELECTRIC_PRESETS;
}) {
  const { isModern } = useModernMode();
  const card = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
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
// Main DashboardCharts component
// =================================================================
export function DashboardCharts({ data }: { data: DashboardData }) {
  const stats = data?.stats || { wbsCount: 0, personelCount: 0, assetCount: 0, openRiskCount: 0 };
  const pms = data?.pms || { rootScurve: [], rootProgress: 0, rootPlan: 0, topics: [] };
  const financial = data?.financial || { totalCost: 0, totalRevenue: 0 };
  const risk = data?.risk || { positiveCount: 0, negativeCount: 0, byStatus: [] };
  const issues = data?.issues || { total: 0, critical: 0, byTopic: [] };
  const evaluation = data?.evaluation || { thisMonthCount: 0, avgScore: 0, byPosition: [] };

  // Financial bar chart data: top categories from both cost and revenue
  const costByCat = (financial as any)?.costByCategory || [];
  const revByTheme = (financial as any)?.revenueByTheme || [];
  const financialBarData = costByCat.slice(0, 6).map((c) => ({
    name: c.name,
    هزینه: c.value,
    درآمد: revByTheme.find((r) => r.name === c.name)?.value || 0,
  }));

  // Risk donut chart data
  const riskByStatus = (risk as any)?.byStatus || [];
  const riskDonutData = riskByStatus.filter((s) => s.count > 0).map((s) => ({
    name: s.label,
    value: s.count,
    color: (riskStatusColors as any)[s.key] || "#94a3b8",
  }));

  // Issues by topic bar chart data
  const issuesByTopic = (issues as any)?.byTopic || [];
  const issuesBarData = issuesByTopic.map((t) => ({
    name: t.topic,
    label: t.label,
    تعداد: t.count,
    color: t.color,
  }));

  // Evaluation by position bar chart data
  const evalByPos = (evaluation as any)?.byPosition || [];
  const evaluationBarData = evalByPos.map((p) => ({
    name: p.position,
    میانگین: p.avgScore,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">داشبورد سازمانی</h1>
        <p className="text-sm text-muted-foreground mt-1">
          نمای کلی وضعیت سازمان در حوزه‌های PMS، مالی، ریسک، نظام مسائل و ارزیابی پرسنل
        </p>
      </div>

      {/* Top row: 4 stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="تعداد فعالیت‌های PMS"
          value={stats.wbsCount.toLocaleString("fa-IR")}
          icon={Network}
          color="bg-gradient-to-br from-emerald-500 to-teal-600"
          preset="project"
        />
        <StatCard
          label="تعداد پرسنل"
          value={stats.personelCount.toLocaleString("fa-IR")}
          icon={Users}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
          preset="hr"
        />
        <StatCard
          label="تعداد دارایی‌ها"
          value={stats.assetCount.toLocaleString("fa-IR")}
          icon={Package}
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

      {/* ============= Section 1: PMS S-curves ============= */}
      <SectionCard
        title="پیشرفت PMS"
        subtitle="منحنی S پیشرفت برنامه‌ریزی شده در برابر پیشرفت واقعی — ریشه و موضوعات استراتژیک"
        preset="project"
      >
        {/* Root S-curve */}
        <div className="border rounded-lg p-4 mb-4 bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
          <div className="grid gap-4 md:grid-cols-3 items-center">
            <div>
              <p className="text-xs text-muted-foreground">پیشرفت واقعی چشم‌انداز</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1 font-num">
                {(pms.rootProgress || 0).toLocaleString("fa-IR")}%
              </p>
              <Progress value={pms.rootProgress || 0} className="mt-2 h-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">پیشرفت برنامه‌ریزی شده</p>
              <p className="text-3xl font-bold text-blue-700 mt-1 font-num">
                {(pms.rootPlan || 0).toLocaleString("fa-IR")}%
              </p>
              <Progress value={pms.rootPlan || 0} className="mt-2 h-2" />
            </div>
            <div className="h-32 min-h-32">
              <SCurveChart data={pms?.rootScurve || []} />
            </div>
          </div>
        </div>

        {/* Level-2 topic S-curves */}
        {(pms?.topics || []).length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pms.topics.map((t) => {
              const deviation = (t.progress || 0) - (pms.rootPlan || 0);
              return (
                <div key={t.topic} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={t.label}>
                        {t.label}
                      </p>
                    </div>
                    <Badge
                      variant={deviation >= 0 ? "default" : "destructive"}
                      className="font-num text-xs shrink-0"
                      style={deviation >= 0 ? { background: t.color } : undefined}
                    >
                      {deviation >= 0 ? "+" : ""}
                      {deviation.toLocaleString("fa-IR")}%
                    </Badge>
                  </div>
                  <div className="h-20 min-h-20">
                    <SCurveChart data={t.scurve} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      پیشرفت:{" "}
                      <span className="font-num font-bold" style={{ color: t.color }}>
                        {t.progress.toLocaleString("fa-IR")}%
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            موضوع استراتژیک سطح ۲ تعریف نشده است
          </p>
        )}
      </SectionCard>

      {/* ============= Section 2: Financial Overview ============= */}
      <SectionCard
        title="وضعیت مالی"
        subtitle="نمای کلی هزینه‌ها و درآمدها به تفکیک دسته‌بندی"
        preset="financial"
      >
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="border rounded-lg p-4 bg-gradient-to-br from-rose-50/50 to-red-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shrink-0">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">کل هزینه</p>
                <p className="text-2xl font-bold text-rose-700 font-num">
                  {formatAmount(financial.totalCost)}
                </p>
                <p className="text-[10px] text-muted-foreground">تومان</p>
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">کل درآمد</p>
                <p className="text-2xl font-bold text-emerald-700 font-num">
                  {formatAmount(financial.totalRevenue)}
                </p>
                <p className="text-[10px] text-muted-foreground">تومان</p>
              </div>
            </div>
          </div>
        </div>

        {financialBarData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialBarData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  angle={-15}
                  textAnchor="end"
                  height={60}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={formatCompact}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number) => formatAmount(v) + " تومان"}
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="هزینه" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="درآمد" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            داده مالی موجود نیست
          </p>
        )}
      </SectionCard>

      {/* ============= Section 3: Risk Overview ============= */}
      <SectionCard
        title="وضعیت ریسک"
        subtitle="تعداد ریسک‌های مثبت و منفی و توزیع بر اساس وضعیت"
        preset="kpi"
      >
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <div className="border rounded-lg p-4 text-center bg-emerald-50/50 dark:bg-emerald-950/20">
            <p className="text-xs text-muted-foreground mb-1">ریسک‌های مثبت (فرصت‌ها)</p>
            <p className="text-3xl font-bold text-emerald-700 font-num">
              {risk.positiveCount.toLocaleString("fa-IR")}
            </p>
          </div>
          <div className="border rounded-lg p-4 text-center bg-rose-50/50 dark:bg-rose-950/20">
            <p className="text-xs text-muted-foreground mb-1">ریسک‌های منفی</p>
            <p className="text-3xl font-bold text-rose-700 font-num">
              {risk.negativeCount.toLocaleString("fa-IR")}
            </p>
          </div>
          <div className="border rounded-lg p-4 text-center bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">مجموع ریسک‌ها</p>
            <p className="text-3xl font-bold font-num">
              {(risk.positiveCount + risk.negativeCount).toLocaleString("fa-IR")}
            </p>
          </div>
        </div>

        {riskDonutData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value.toLocaleString("fa-IR")}`}
                  labelLine={false}
                  style={{ fontSize: 11 }}
                >
                  {riskDonutData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => v.toLocaleString("fa-IR")}
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            ریسکی ثبت نشده است
          </p>
        )}
      </SectionCard>

      {/* ============= Section 4: Issues Overview ============= */}
      <SectionCard
        title="نظام مسائل"
        subtitle="مجموع مسائل، مسائل بحرانی و توزیع بر اساس موضوع استراتژیک"
        preset="hr"
      >
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مجموع مسائل</p>
                <p className="text-2xl font-bold font-num">
                  {issues.total.toLocaleString("fa-IR")}
                </p>
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مسائل بحرانی</p>
                <p className="text-2xl font-bold text-rose-700 font-num">
                  {issues.critical.toLocaleString("fa-IR")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  اهمیت بالا + قابلیت اجرا پایین
                </p>
              </div>
            </div>
          </div>
        </div>

        {issuesBarData.some((d) => d["تعداد"] > 0) ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={issuesBarData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  allowDecimals={false}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number) => v.toLocaleString("fa-IR")}
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                />
                <Bar dataKey="تعداد" radius={[4, 4, 0, 0]}>
                  {issuesBarData.map((entry, idx) => (
                    <Cell key={`cell-issue-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            مسئله‌ای شناسایی نشده است
          </p>
        )}
      </SectionCard>

      {/* ============= Section 5: Personnel Evaluation Overview ============= */}
      <SectionCard
        title="ارزیابی پرسنل"
        subtitle="نمای کلی ارزیابی‌های انجام‌شده در ماه جاری و میانگین امتیاز به تفکیک سمت"
        preset="hr"
      >
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ارزیابی‌های ماه جاری</p>
                <p className="text-2xl font-bold font-num">
                  {evaluation.thisMonthCount.toLocaleString("fa-IR")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  از {formatJalali(new Date())}
                </p>
              </div>
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">میانگین امتیاز</p>
                <p className="text-2xl font-bold text-emerald-700 font-num">
                  {evaluation.avgScore.toLocaleString("fa-IR")}
                  <span className="text-sm text-muted-foreground"> / ۱۰۰</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {evaluationBarData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evaluationBarData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  angle={-15}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  domain={[0, 100]}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number) => v.toLocaleString("fa-IR") + " / ۱۰۰"}
                  contentStyle={{ fontSize: 12, fontFamily: "inherit" }}
                />
                <Bar dataKey="میانگین" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            ارزیابی‌ای در ماه جاری ثبت نشده است
          </p>
        )}
      </SectionCard>
    </div>
  );
}
