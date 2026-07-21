"use client";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/data-table";
import { notifyError } from "@/lib/notify";
import {
  AlertCircle,
  Gauge,
  TrendingUp,
  Flame,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Issue {
  id: string;
  type: "PMS" | "جاری";
  title: string;
  code: string;
  urgency: string;
  urgencyLabel: string;
  priority: number;
  importance: number;
  feasibility: number;
  issueScore: number;
  weightPct: number;
  recommendation: string;
  criticality: "critical" | "moderate" | "low";
  progressActual: number;
  personnelInPositions: number;
  usersFound: number;
  hrPlanCount: number;
}

const urgencyBadgeVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "secondary",
  normal: "outline",
  high: "default",
  urgent: "destructive",
};

const criticalityMap: Record<
  Issue["criticality"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  critical: { label: "بحرانی", variant: "destructive" },
  moderate: { label: "متوسط", variant: "default" },
  low: { label: "کم", variant: "secondary" },
};

function feasibilityBg(f: number): string {
  if (f < 0.3) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  if (f < 0.7)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
}

function toPersianDigits(s: string | number): string {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
}

type SortKey = "issueScore" | "importance" | "feasibility" | "weightPct";
type TypeFilter = "all" | "PMS" | "جاری";
type CriticalityFilter = "all" | "critical" | "moderate" | "low";

export default function IssuesPage() {
  const [data, setData] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [criticalityFilter, setCriticalityFilter] =
    useState<CriticalityFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("issueScore");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/issues");
        if (!res.ok) throw new Error("خطا در بارگذاری اطلاعات");
        const json = await res.json();
        if (mounted) setData(Array.isArray(json) ? json : []);
      } catch (e: any) {
        notifyError(e.message || "خطا در بارگذاری اطلاعات");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ----- Summary stats -----
  const stats = useMemo(() => {
    if (data.length === 0) {
      return {
        total: 0,
        avgFeasibility: 0,
        totalImportance: 0,
        criticalCount: 0,
      };
    }
    const total = data.length;
    const avgFeasibility =
      data.reduce((sum, i) => sum + i.feasibility, 0) / total;
    const totalImportance = data.reduce((sum, i) => sum + i.importance, 0);
    const criticalCount = data.filter(
      (i) => i.criticality === "critical"
    ).length;
    return { total, avgFeasibility, totalImportance, criticalCount };
  }, [data]);

  // ----- Scatter plot data: separate by type -----
  const scatterData = useMemo(() => {
    const pms = data
      .filter((i) => i.type === "PMS")
      .map((i) => ({
        x: i.feasibility,
        y: i.importance,
        z: Math.max(50, i.issueScore * 80),
        name: i.title,
        code: i.code,
        issueScore: i.issueScore,
      }));
    const current = data
      .filter((i) => i.type === "جاری")
      .map((i) => ({
        x: i.feasibility,
        y: i.importance,
        z: Math.max(50, i.issueScore * 80),
        name: i.title,
        code: i.code,
        issueScore: i.issueScore,
      }));
    return { pms, current };
  }, [data]);

  // ----- Filtered + sorted data for table -----
  const filteredData = useMemo(() => {
    let result = [...data];

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((i) => i.type === typeFilter);
    }

    // Criticality filter
    if (criticalityFilter !== "all") {
      result = result.filter((i) => i.criticality === criticalityFilter);
    }

    // Search (title or code)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "issueScore") return b.issueScore - a.issueScore;
      if (sortBy === "importance") return b.importance - a.importance;
      if (sortBy === "feasibility") return a.feasibility - b.feasibility; // ascending: worst first
      if (sortBy === "weightPct") return b.weightPct - a.weightPct;
      return 0;
    });

    return result;
  }, [data, typeFilter, criticalityFilter, search, sortBy]);

  // ----- Export to Excel -----
  const handleExport = async () => {
    if (filteredData.length === 0) {
      notifyError("داده‌ای برای خروجی وجود ندارد");
      return;
    }
    setExporting(true);
    try {
      const rows = filteredData.map((i, idx) => ({
        "ردیف": idx + 1,
        "نوع": i.type === "PMS" ? "PMS" : "جاری",
        "کد": i.code,
        "عنوان فعالیت": i.title,
        "فوریت": i.urgency,
        "اولویت (1-5)": i.priority,
        "اهمیت": i.importance,
        "امکان‌پذیری (0-1)": i.feasibility,
        "امکان‌پذیری (%)": Math.round(i.feasibility * 1000) / 10,
        "امتیاز مسئله": i.issueScore,
        "وزن (%)": i.weightPct,
        "بحرانی": criticalityMap[i.criticality].label,
        "پرسنل در سمت‌ها": i.personnelInPositions,
        "کاربران سیستم": i.usersFound,
        "تعداد سمت‌های مورد نیاز": i.hrPlanCount,
        "پیشرفت واقعی (%)": Math.round(i.progressActual * 1000) / 10,
        "راهکار پیشنهادی": i.recommendation,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 10 },
        { wch: 15 },
        { wch: 40 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 16 },
        { wch: 70 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "نظام مسائل");

      XLSX.writeFile(
        wb,
        `issues-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (e: any) {
      notifyError(e.message || "خطا در تولید فایل اکسل");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="نظام مسائل"
        description="تحلیل ترکیبی فعالیت‌های PMS و جاری بر اساس اهمیت و امکان‌پذیری منابع انسانی"
      >
        <Button onClick={handleExport} disabled={exporting || loading}>
          {exporting ? (
            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
          ) : (
            <Download className="w-4 h-4 ml-1" />
          )}
          خروجی اکسل
        </Button>
      </PageHeader>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="کل مسائل شناسایی‌شده"
          value={toPersianDigits(stats.total)}
          icon={AlertCircle}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="میانگین امکان‌پذیری"
          value={`${toPersianDigits(
            Math.round(stats.avgFeasibility * 1000) / 10
          )}٪`}
          icon={Gauge}
          color="from-amber-500 to-orange-600"
        />
        <StatCard
          label="مجموع امتیاز اهمیت"
          value={toPersianDigits(Math.round(stats.totalImportance))}
          icon={TrendingUp}
          color="from-violet-500 to-purple-600"
        />
        <StatCard
          label="مسائل بحرانی"
          value={toPersianDigits(stats.criticalCount)}
          icon={Flame}
          color="from-red-500 to-rose-600"
        />
      </div>

      {/* Scatter plot */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            نمودار پراکندگی: اهمیت در برابر امکان‌پذیری
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            محور افقی: امکان‌پذیری (۰ تا ۱) — محور عمودی: اهمیت (۱ تا ۲۰) —
            اندازه نقطه = امتیاز مسئله — خط‌چین‌ها: آستانه بحرانی
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              موردی یافت نشد
            </div>
          ) : (
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 30, bottom: 30, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="امکان‌پذیری"
                    domain={[0, 1]}
                    tickCount={11}
                    tickFormatter={(v: number) =>
                      toPersianDigits(Math.round(v * 100)) + "٪"
                    }
                    label={{
                      value: "امکان‌پذیری",
                      position: "insideBottom",
                      offset: -10,
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="اهمیت"
                    domain={[0, 20]}
                    tickFormatter={(v: number) => toPersianDigits(v)}
                    label={{
                      value: "اهمیت",
                      angle: -90,
                      position: "insideLeft",
                      fontSize: 12,
                    }}
                  />
                  <ZAxis
                    type="number"
                    dataKey="z"
                    range={[60, 600]}
                    name="امتیاز مسئله"
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }: any) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-md p-2 shadow-md text-xs">
                          <div className="font-bold mb-1">{p.name}</div>
                          <div>کد: {toPersianDigits(p.code)}</div>
                          <div>
                            امکان‌پذیری:{" "}
                            {toPersianDigits(Math.round(p.x * 100))}٪
                          </div>
                          <div>اهمیت: {toPersianDigits(p.y)}</div>
                          <div>
                            امتیاز مسئله: {toPersianDigits(p.issueScore)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) => (
                      <span style={{ marginRight: 4 }}>
                        {value === "pms"
                          ? "PMS (ساختار شکست کار)"
                          : "فعالیت‌های جاری"}
                      </span>
                    )}
                  />
                  {/* Quadrant reference lines */}
                  <ReferenceLine
                    y={12}
                    stroke="#ef4444"
                    strokeDasharray="6 4"
                    label={{
                      value: "آستانه اهمیت بالا",
                      position: "insideTopRight",
                      fill: "#ef4444",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    x={0.5}
                    stroke="#ef4444"
                    strokeDasharray="6 4"
                    label={{
                      value: "آستانه امکان‌پذیری",
                      position: "insideBottomRight",
                      fill: "#ef4444",
                      fontSize: 10,
                    }}
                  />
                  <Scatter
                    name="pms"
                    data={scatterData.pms}
                    fill="#10b981"
                    fillOpacity={0.65}
                  />
                  <Scatter
                    name="current"
                    data={scatterData.current}
                    fill="#f59e0b"
                    fillOpacity={0.65}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="جستجو بر اساس عنوان یا کد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as TypeFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="نوع فعالیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه انواع</SelectItem>
            <SelectItem value="PMS">PMS (ساختار شکست کار)</SelectItem>
            <SelectItem value="جاری">فعالیت‌های جاری</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={criticalityFilter}
          onValueChange={(v) => setCriticalityFilter(v as CriticalityFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="بحرانی" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه سطوح بحرانی</SelectItem>
            <SelectItem value="critical">بحرانی</SelectItem>
            <SelectItem value="moderate">متوسط</SelectItem>
            <SelectItem value="low">کم</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortKey)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="مرتب‌سازی" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="issueScore">امتیاز مسئله (نزولی)</SelectItem>
            <SelectItem value="importance">اهمیت (نزولی)</SelectItem>
            <SelectItem value="feasibility">
              امکان‌پذیری (صعودی — بدترین اول)
            </SelectItem>
            <SelectItem value="weightPct">وزن (نزولی)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Issues table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            فهرست مسائل ({toPersianDigits(filteredData.length)} مورد)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              موردی یافت نشد
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="min-w-[200px]">عنوان فعالیت</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>فوریت</TableHead>
                    <TableHead>اولویت</TableHead>
                    <TableHead>اهمیت</TableHead>
                    <TableHead>امکان‌پذیری</TableHead>
                    <TableHead>امتیاز مسئله</TableHead>
                    <TableHead>وزن</TableHead>
                    <TableHead>راهکار پیشنهادی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((i) => {
                    const uBadge = urgencyBadgeVariant[i.urgency] || "outline";
                    const crit = criticalityMap[i.criticality];
                    return (
                      <TableRow key={`${i.type}-${i.id}`}>
                        <TableCell>
                          <div className="font-medium">{i.title}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {toPersianDigits(i.code)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              i.type === "PMS"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            }
                          >
                            {i.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={uBadge}>{i.urgencyLabel}</Badge>
                        </TableCell>
                        <TableCell className="font-num">
                          {toPersianDigits(i.priority)}
                        </TableCell>
                        <TableCell className="font-num font-bold">
                          {toPersianDigits(i.importance)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-num font-bold ${feasibilityBg(
                              i.feasibility
                            )}`}
                          >
                            {toPersianDigits(
                              Math.round(i.feasibility * 1000) / 10
                            )}
                            ٪
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {toPersianDigits(i.usersFound)} از{" "}
                            {toPersianDigits(i.personnelInPositions)} پرسنل
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-num font-bold text-red-600 dark:text-red-400">
                            {toPersianDigits(i.issueScore)}
                          </span>
                          <div className="mt-0.5">
                            <Badge variant={crit.variant} className="text-[10px]">
                              {crit.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-num">
                          {toPersianDigits(i.weightPct)}٪
                        </TableCell>
                        <TableCell className="text-xs leading-relaxed max-w-[400px]">
                          {i.recommendation}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend / explanation */}
      <Card className="mt-4">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
          <div className="font-semibold text-foreground mb-2">
            راهنمای تفسیر نتایج:
          </div>
          <ul className="space-y-1 list-disc list-inside leading-relaxed">
            <li>
              <strong>اهمیت</strong> = وزن فوریت × اولویت (۱ تا ۲۰). وزن فوریت:
              کم=۱، عادی=۲، زیاد=۳، فوری=۴.
            </li>
            <li>
              <strong>امکان‌پذیری</strong> = نسبت پرسنل دارای حساب کاربری به
              کل پرسنل اختصاص‌یافته در سمت‌های سازمانی مورد نیاز فعالیت. اگر
              هیچ پرسنلی در سمت‌ها نباشد و فعالیت پیشرفت داشته باشد = ۰.۵، در
              غیر این صورت = ۰.
            </li>
            <li>
              <strong>امتیاز مسئله</strong> = اهمیت × (۱ − امکان‌پذیری). هرچه
              بالاتر، مسئله بزرگ‌تر.
            </li>
            <li>
              <strong>وزن</strong> = سهم مسئله از مجموع کل امتیاز مسائل (برای
              اولویت‌بندی).
            </li>
            <li>
              <strong>بحرانی</strong>: اهمیت ≥ ۱۲ و امکان‌پذیری &lt; ۰.۳. این
              مسائل نیازمند مداخله فوری هستند.
            </li>
            <li className="flex items-center gap-2 mt-2">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500"></span>
              PMS (ساختار شکست کار)
              <span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-3"></span>
              فعالیت‌های جاری
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
