"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  FileBarChart,
  Calendar,
  Loader2,
  TrendingUp,
  Users,
  Activity as ActivityIcon,
  AlertCircle,
  Target,
} from "lucide-react";
import { formatJalali, formatJalaliLong } from "@/lib/jalali";
import {
  strategicTopicColors,
  strategicTopicOrder,
  getTopicColor,
} from "@/lib/topic-colors";
import { SCurveChart } from "@/components/s-curve-chart";

// ============================================================
// Types (mirror of API response)
// ============================================================
interface ReportActivity {
  id: string;
  code: string;
  title: string;
  type: "pms" | "activity";
  priority: number;
  status: string;
  progressPct: number;
  statusChangeCount: number;
  strategicTopic: string | null;
}

interface ReportTopic {
  topic: string;
  label: string;
  progress: number;
  sCurveData: { date: string; planned: number; actual: number }[];
  level3Activities: { name: string; progress: number }[];
  topActivities: ReportActivity[];
}

interface UserActivityRow {
  personelId: string | null;
  name: string;
  statusChangeCount: number;
  lastUpdate: string | null;
}

interface ReportResponse {
  from: string;
  to: string;
  topActivities: ReportActivity[];
  topics: ReportTopic[];
  userActivities: UserActivityRow[];
  progressTrend: Record<string, number | string>[];
  trackingTrend: Record<string, number | string>[];
  creationTrend: { date: string; count: number }[];
  onlineTrend: { date: string; count: number }[];
}

// Vision data: full-timeline S-curves for root WBS + each strategic topic
interface VisionMonthly {
  monthDate: string;
  plannedPct: number;
  actualPct: number | null;
}
interface VisionWBS {
  id: string;
  wbsCode: string;
  title: string;
  strategicTopic: string | null;
  progressPlan: number;
  progressActual: number;
  startDate: string | null;
  finishDate: string | null;
  monthlyProgress: VisionMonthly[];
}
interface VisionData {
  root: VisionWBS | null;
  topics: VisionWBS[];
}

// ============================================================
// Constants & helpers
// ============================================================

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  in_progress: "در حال انجام",
  completed: "تکمیل شده",
  cancelled: "لغو شده",
  on_hold: "متوقف",
};

const CHART_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

// Convert Gregorian Date to YYYY-MM-DD (used for <input type="date"> value)
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert YYYY-MM-DD input value to ISO string (start of day for from, end of day for to)
function inputToISO(value: string, endOfDay = false): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return new Date().toISOString();
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

// ============================================================
// Page
// ============================================================
export default function ReportsPage() {
  // Default range: first day of current month → today
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
    [now]
  );
  const defaultTo = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now]
  );

  const [fromDate, setFromDate] = useState(toInputDate(defaultFrom));
  const [toDate, setToDate] = useState(toInputDate(defaultTo));
  const [data, setData] = useState<ReportResponse | null>(null);
  const [vision, setVision] = useState<VisionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cover image URL — fetched from public/upload/cover.jpg
  const coverImageUrl = "/upload/cover.jpg";
  const [coverOk, setCoverOk] = useState(true);

  // Build a "Jalali range" string for the cover overlay
  const jalaliRangeLabel = useMemo(() => {
    const f = new Date(fromDate);
    const t = new Date(toDate);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) return "";
    return `${formatJalaliLong(f)} تا ${formatJalaliLong(t)}`;
  }, [fromDate, toDate]);

  // Fetch report data (with vision)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = inputToISO(fromDate, false);
      const to = inputToISO(toDate, true);
      const res = await fetch(
        `/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&vision=true`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "خطا در بارگذاری گزارش");
      }
      const json = (await res.json()) as ReportResponse & { vision?: VisionData };
      setData(json);
      if (json.vision) setVision(json.vision);
    } catch (e: any) {
      setError(e.message || "خطا در بارگذاری گزارش");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  // Pre-check cover image existence
  useEffect(() => {
    fetch(coverImageUrl, { method: "HEAD" })
      .then((r) => setCoverOk(r.ok))
      .catch(() => setCoverOk(false));
  }, [coverImageUrl]);

  // Collect unique user names from progressTrend (for chart series)
  const trendUsers = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const row of data.progressTrend) {
      for (const key of Object.keys(row)) {
        if (key !== "date") set.add(key);
      }
    }
    return Array.from(set);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBarChart className="w-6 h-6 text-emerald-600" />
            گزارشات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            گزارش جامع فعالیت‌ها، پیشرفت موضوعات استراتژیک و عملکرد کاربران
          </p>
        </div>
      </div>

      {/* Time range selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="from-date" className="text-xs">
                از تاریخ (میلادی)
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-[180px]"
              />
              <span className="text-xs text-muted-foreground">
                {fromDate && formatJalaliLong(new Date(fromDate))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="to-date" className="text-xs">
                تا تاریخ (میلادی)
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-[180px]"
              />
              <span className="text-xs text-muted-foreground">
                {toDate && formatJalaliLong(new Date(toDate))}
              </span>
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 ml-1 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 ml-1" />
              )}
              تولید گزارش
            </Button>
            {error && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cover image */}
      <Card className="overflow-hidden">
        <div
          className="relative h-64 md:h-80 w-full bg-cover bg-center"
          style={
            coverOk
              ? { backgroundImage: `url(${coverImageUrl})` }
              : {
                  background:
                    "linear-gradient(135deg, #047857 0%, #0f766e 50%, #115e59 100%)",
                }
          }
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-white/95 drop-shadow">
              گزارش شرکت خوارزمی
            </h2>
            <p className="text-base md:text-lg text-white/85 mt-2 drop-shadow">
              در بازه زمانی {jalaliRangeLabel}
            </p>
          </div>
        </div>
      </Card>

      {loading && !data && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      )}

      {data && (
        <>
          {/* Most important activities (top 10) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4 text-emerald-600" />
                مهم‌ترین فعالیت‌های بازه (۱۰ مورد برتر بر اساس اولویت)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                فعالیت‌هایی که در این بازه زمانی حداقل یک تغییر وضعیت داشته‌اند
              </p>
            </CardHeader>
            <CardContent>
              {data.topActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  در این بازه موردی یافت نشد
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pl-1">
                  {data.topActivities.map((a, idx) => (
                    <div
                      key={`${a.type}-${a.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(idx + 1).toLocaleString("fa-IR")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {a.code}
                          </Badge>
                          <Badge
                            variant={a.type === "pms" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {a.type === "pms" ? "PMS" : "جاری"}
                          </Badge>
                          <span className="text-sm font-medium truncate">{a.title}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>وضعیت: {STATUS_LABELS[a.status] || a.status}</span>
                          <span>اولویت: {a.priority.toLocaleString("fa-IR")}</span>
                          <span>تعداد تغییر: {a.statusChangeCount.toLocaleString("fa-IR")}</span>
                        </div>
                      </div>
                      <div className="shrink-0 w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">پیشرفت</span>
                          <span className="font-num font-medium">
                            {Math.round(a.progressPct).toLocaleString("fa-IR")}%
                          </span>
                        </div>
                        <Progress value={a.progressPct} className="h-1.5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ===== Vision section: full-timeline S-curves ===== */}
          {vision && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  چشم‌انداز سازمان
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  منحنی‌های S پیشرفت برنامه‌ای و واقعی در کل بازه زمانی پروژه
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Root WBS (level 1) */}
                {vision.root && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="font-mono shrink-0">
                          {vision.root.wbsCode}
                        </Badge>
                        <h3 className="text-sm font-semibold truncate">
                          {vision.root.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          برنامه:{" "}
                          <span className="font-num font-bold text-blue-600">
                            {vision.root.progressPlan.toLocaleString("fa-IR")}٪
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          واقعی:{" "}
                          <span className="font-num font-bold text-emerald-600">
                            {vision.root.progressActual.toLocaleString("fa-IR")}٪
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={[
                            { idx: 0, plan: 0, actual: 0 },
                            ...vision.root.monthlyProgress.map((m) => ({
                              idx: m.plannedPct,
                              plan: Math.round((m.plannedPct ?? 0) * 1000) / 10,
                              actual:
                                m.actualPct != null
                                  ? Math.round(m.actualPct * 1000) / 10
                                  : null,
                            })),
                          ]}
                          margin={{ right: 16, left: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="idx"
                            hide
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                          />
                          <RTooltip
                            formatter={(value: number, name: string) => [
                              `${Number(value).toLocaleString("fa-IR")}٪`,
                              name === "plan" ? "برنامه‌ای" : "واقعی",
                            ]}
                          />
                          <Legend
                            formatter={(v) =>
                              v === "plan" ? "برنامه‌ای" : "واقعی"
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="plan"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Strategic topics (level 2) */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {vision.topics.map((w) => {
                    const tc = getTopicColor(w.strategicTopic);
                    const deviation = w.progressActual - w.progressPlan;
                    return (
                      <div
                        key={w.id}
                        className={`border rounded-lg p-3 space-y-2 ${tc.bg} ${tc.border}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] shrink-0 ${tc.text}`}
                            >
                              {w.wbsCode}
                            </Badge>
                            <p className="text-xs font-medium truncate mt-1">
                              {w.title}
                            </p>
                          </div>
                          <Badge
                            variant={deviation >= 0 ? "default" : "destructive"}
                            className="font-num text-[10px] shrink-0"
                          >
                            {deviation >= 0 ? "+" : ""}
                            {deviation.toLocaleString("fa-IR")}٪
                          </Badge>
                        </div>
                        <div className="h-20 min-h-20">
                          <SCurveChart
                            data={w.monthlyProgress.map((m) => ({
                              monthDate: m.monthDate,
                              plannedPct: m.plannedPct,
                              actualPct: m.actualPct,
                            }))}
                            overallActual={(w.progressActual ?? 0) / 100}
                          />
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            برنامه:{" "}
                            <span className="font-num font-bold text-blue-600">
                              {w.progressPlan.toLocaleString("fa-IR")}٪
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            واقعی:{" "}
                            <span className="font-num font-bold text-emerald-600">
                              {w.progressActual.toLocaleString("fa-IR")}٪
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strategic topic dividers */}
          {data.topics.map((t) => (
            <Card
              key={t.topic}
              className={`${getTopicColor(t.topic).border}`}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${getTopicColor(t.topic).bg}`}
                      style={{ backgroundColor: getTopicColor(t.topic).chart }}
                    />
                    <CardTitle className="text-base">{t.label}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">پیشرفت کلی:</div>
                    <div className="text-lg font-bold font-num text-emerald-700">
                      {t.progress.toLocaleString("fa-IR")}%
                    </div>
                    <div className="w-40">
                      <Progress value={t.progress} className="h-2" />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* S-curve */}
                <div>
                  <h4 className="text-sm font-medium mb-2">منحنی S پیشرفت برنامه‌ای و واقعی</h4>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={t.sCurveData} margin={{ right: 16, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => formatJalali(new Date(v))}
                          minTickGap={20}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          domain={[0, 100]}
                          tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                        />
                        <RTooltip
                          labelFormatter={(v) => formatJalaliLong(new Date(v as string))}
                          formatter={(value: number, name: string) => [
                            `${Number(value).toLocaleString("fa-IR")}٪`,
                            name === "planned" ? "برنامه‌ای" : "واقعی",
                          ]}
                        />
                        <Legend
                          formatter={(v) =>
                            v === "planned" ? "برنامه‌ای" : "واقعی"
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="planned"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Level-3 activities progress */}
                {t.level3Activities.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      پیشرفت فعالیت‌های سطح ۳ (اهداف اصلی)
                    </h4>
                    <div className="grid gap-2 md:grid-cols-2 max-h-72 overflow-y-auto pl-1">
                      {t.level3Activities.map((a, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded border"
                        >
                          <span className="text-xs flex-1 truncate" title={a.name}>
                            {a.name}
                          </span>
                          <div className="w-24">
                            <Progress value={a.progress} className="h-1.5" />
                          </div>
                          <span className="text-xs font-num font-medium w-10 text-left">
                            {Math.round(a.progress).toLocaleString("fa-IR")}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top 6 activities */}
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    ۶ فعالیت برتر (بر اساس اولویت و تعداد تغییر وضعیت)
                  </h4>
                  {t.topActivities.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      موردی یافت نشد
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {t.topActivities.map((a) => (
                        <div
                          key={`${a.type}-${a.id}`}
                          className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 transition-colors"
                        >
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {a.code}
                          </Badge>
                          <Badge
                            variant={a.type === "pms" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {a.type === "pms" ? "PMS" : "جاری"}
                          </Badge>
                          <span className="text-sm flex-1 truncate" title={a.title}>
                            {a.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            تغییرات: {a.statusChangeCount.toLocaleString("fa-IR")}
                          </span>
                          <div className="w-24">
                            <Progress value={a.progressPct} className="h-1.5" />
                          </div>
                          <span className="text-xs font-num font-medium w-10 text-left">
                            {Math.round(a.progressPct).toLocaleString("fa-IR")}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* User activities table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-emerald-600" />
                فعالیت کاربران در بازه (بر اساس تعداد تغییر وضعیت)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.userActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  موردی یافت نشد
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>نام</TableHead>
                        <TableHead className="text-center">تعداد تغییر وضعیت</TableHead>
                        <TableHead className="text-center">آخرین بروزرسانی</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.userActivities.map((u, idx) => (
                        <TableRow key={u.personelId || `idx-${idx}`}>
                          <TableCell className="text-center font-num">
                            {(idx + 1).toLocaleString("fa-IR")}
                          </TableCell>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-center font-num">
                            {u.statusChangeCount.toLocaleString("fa-IR")}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground font-num">
                            {u.lastUpdate ? formatJalali(new Date(u.lastUpdate)) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trend charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Progress trend per user */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">روند میانگین پیشرفت به تفکیک کاربر</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.progressTrend} margin={{ right: 16, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatJalali(new Date(v))}
                        minTickGap={20}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        domain={[0, 100]}
                        tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                      />
                      <RTooltip
                        labelFormatter={(v) => formatJalaliLong(new Date(v as string))}
                        formatter={(value: number, name: string) => [
                          `${Number(value).toLocaleString("fa-IR")}٪`,
                          name,
                        ]}
                      />
                      <Legend />
                      {trendUsers.map((u, idx) => (
                        <Line
                          key={u}
                          type="monotone"
                          dataKey={u}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tracking trend per user */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">روند روزانه پیگیری فعالیت‌ها به تفکیک کاربر</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trackingTrend} margin={{ right: 16, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatJalali(new Date(v))}
                        minTickGap={20}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                      />
                      <RTooltip
                        labelFormatter={(v) => formatJalaliLong(new Date(v as string))}
                        formatter={(value: number, name: string) => [
                          Number(value).toLocaleString("fa-IR"),
                          name,
                        ]}
                      />
                      <Legend />
                      {trendUsers.map((u, idx) => (
                        <Line
                          key={u}
                          type="monotone"
                          dataKey={u}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Creation trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">روند روزانه ایجاد فعالیت جدید</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.creationTrend} margin={{ right: 16, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatJalali(new Date(v))}
                        minTickGap={20}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                      />
                      <RTooltip
                        labelFormatter={(v) => formatJalaliLong(new Date(v as string))}
                        formatter={(value: number) => [
                          Number(value).toLocaleString("fa-IR"),
                          "تعداد",
                        ]}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Online activity trend (area chart) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ActivityIcon className="w-4 h-4 text-emerald-600" />
                  روند فعالیت آنلاین کاربران
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.onlineTrend} margin={{ right: 16, left: 0 }}>
                      <defs>
                        <linearGradient id="onlineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatJalali(new Date(v))}
                        minTickGap={20}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        tickFormatter={(v) => Number(v).toLocaleString("fa-IR")}
                      />
                      <RTooltip
                        labelFormatter={(v) => formatJalaliLong(new Date(v as string))}
                        formatter={(value: number) => [
                          `${Number(value).toLocaleString("fa-IR")} کاربر`,
                          "آنلاین",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#onlineGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
