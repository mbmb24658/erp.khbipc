"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Wallet, DollarSign, ChevronDown, ChevronLeft } from "lucide-react";
import { EditDialog, ConfirmDialog } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

interface FinancialSummary {
  costsByCategory: {
    name: string;
    initial: number;
    program: number;
    count: number;
    programPct: number;
  }[];
  revenuesByTheme: {
    name: string;
    initial: number;
    program: number;
    count: number;
    programPct: number;
  }[];
  revenuesDetailed: {
    id: string;
    revenueId: string;
    description: string | null;
    title: string | null;
    theme: string | null;
    ownershipShare: number;
    assetValue: number;
    actualRevenue: number;
    programForecast: number | null;
    initialForecast: number | null;
  }[];
  totals: {
    totalCostInitial: number;
    totalCostProgram: number;
    totalRevenueInitial: number;
    totalRevenueProgram: number;
    totalActualRevenue: number;
    profitInitial: number;
    profitProgram: number;
  };
}

// Distinct colors for pie chart
const COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#a855f7", // purple
  "#6366f1", // indigo
];

export default function FinancialDashboardPage() {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/financial-summary");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">در حال بارگذاری...</p>
      </div>
    );
  }

  const { totals } = data;

  return (
    <div>
      <PageHeader
        title="داشبورد مالی"
        description="نمودار هزینه‌ها، درآمدها و صورت سود و زیان شرکت (سال ۱۴۰۵)"
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold font-num">
                {Math.round(totals.totalCostProgram).toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">کل هزینه (برنامه‌ای)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold font-num">
                {Math.round(totals.totalRevenueProgram).toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">کل درآمد (برنامه‌ای)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold font-num">
                {Math.round(totals.totalActualRevenue).toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">درآمد واقعی (محاسبه شده)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                totals.profitProgram >= 0
                  ? "bg-gradient-to-br from-green-500 to-emerald-600"
                  : "bg-gradient-to-br from-red-500 to-rose-600"
              }`}
            >
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <p
                className={`text-xl font-bold font-num ${
                  totals.profitProgram >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {Math.round(totals.profitProgram).toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">سود/زیان (برنامه‌ای)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Costs pie chart — shows only percentages, descriptions in legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تفکیک هزینه‌ها</CardTitle>
            <p className="text-xs text-muted-foreground">
              سهم هر دسته از کل هزینه (درصد)
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={data.costsByCategory}
                  dataKey="program"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                  label={({ programPct }) => `${programPct.toFixed(1).toLocaleString("fa-IR")}%`}
                  labelLine={false}
                >
                  {data.costsByCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, _n: any, p: any) =>
                    [
                      `${Math.round(v).toLocaleString("fa-IR")} میلیون تومان (${p.payload.programPct.toFixed(1).toLocaleString("fa-IR")}%)`,
                      p.payload.name,
                    ]
                  }
                  contentStyle={{ fontFamily: "Vazirmatn, sans-serif", direction: "rtl" }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ fontFamily: "Vazirmatn, sans-serif", fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenues bar chart — narrower bars, X-axis labels visible */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">درآمد به تفکیک موضوع</CardTitle>
            <p className="text-xs text-muted-foreground">
              مبلغ پیش‌بینی برنامه‌ای به تفکیک موضوع درآمد
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={data.revenuesByTheme}
                margin={{ top: 20, right: 20, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  tick={{ fontSize: 11, fontFamily: "Vazirmatn, sans-serif" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: "Vazirmatn, sans-serif" }}
                  tickFormatter={(v) => `${(v / 1000).toLocaleString("fa-IR")}k`}
                />
                <Tooltip
                  formatter={(v: any) => [`${Math.round(v).toLocaleString("fa-IR")} میلیون تومان`, "مبلغ"]}
                  contentStyle={{ fontFamily: "Vazirmatn, sans-serif", direction: "rtl" }}
                />
                <Bar
                  dataKey="program"
                  name="مبلغ برنامه‌ای"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement — collapsible */}
      <PnLStatement data={data} />

      {/* Detailed revenue table */}
      <RevenueTable data={data.revenuesDetailed} onUpdate={fetchData} />
    </div>
  );
}

// Collapsible P&L statement
function PnLStatement({ data }: { data: FinancialSummary }) {
  const [revOpen, setRevOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  const { totals } = data;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">صورت سود و زیان (برنامه ۱۴۰۵)</CardTitle>
        <p className="text-xs text-muted-foreground">
          بر اساس پیش‌بینی اولیه و برنامه‌ای - برای دیدن جزئیات روی هر سطر کلیک کنید
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-right py-2 px-3">شرح</th>
                <th className="text-left py-2 px-3 font-num">پیش‌بینی اولیه ۱۴۰۵</th>
                <th className="text-left py-2 px-3 font-num">پیش‌بینی برنامه‌ای ۱۴۰۵</th>
              </tr>
            </thead>
            <tbody>
              {/* Revenue section */}
              <tr
                className="border-b bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer hover:bg-emerald-100/50"
                onClick={() => setRevOpen(!revOpen)}
              >
                <td className="py-3 px-3 font-semibold flex items-center gap-2">
                  {revOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rotate-180" />}
                  درآمدها
                </td>
                <td className="text-left py-3 px-3 font-num font-semibold">
                  {Math.round(totals.totalRevenueInitial).toLocaleString("fa-IR")}
                </td>
                <td className="text-left py-3 px-3 font-num font-semibold text-emerald-600">
                  {Math.round(totals.totalRevenueProgram).toLocaleString("fa-IR")}
                </td>
              </tr>
              {revOpen &&
                data.revenuesByTheme.map((r, i) => (
                  <tr key={i} className="border-b text-xs">
                    <td className="py-2 px-3 pr-8 text-muted-foreground">{r.name}</td>
                    <td className="text-left py-2 px-3 font-num">
                      {Math.round(r.initial).toLocaleString("fa-IR")}
                    </td>
                    <td className="text-left py-2 px-3 font-num">
                      {Math.round(r.program).toLocaleString("fa-IR")}
                    </td>
                  </tr>
                ))}

              {/* Cost section */}
              <tr
                className="border-b bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:bg-amber-100/50"
                onClick={() => setCostOpen(!costOpen)}
              >
                <td className="py-3 px-3 font-semibold flex items-center gap-2">
                  {costOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rotate-180" />}
                  هزینه‌ها
                </td>
                <td className="text-left py-3 px-3 font-num font-semibold">
                  {Math.round(totals.totalCostInitial).toLocaleString("fa-IR")}
                </td>
                <td className="text-left py-3 px-3 font-num font-semibold text-amber-600">
                  {Math.round(totals.totalCostProgram).toLocaleString("fa-IR")}
                </td>
              </tr>
              {costOpen &&
                data.costsByCategory.map((c, i) => (
                  <tr key={i} className="border-b text-xs">
                    <td className="py-2 px-3 pr-8 text-muted-foreground">{c.name}</td>
                    <td className="text-left py-2 px-3 font-num">
                      {Math.round(c.initial).toLocaleString("fa-IR")}
                    </td>
                    <td className="text-left py-2 px-3 font-num">
                      {Math.round(c.program).toLocaleString("fa-IR")}
                    </td>
                  </tr>
                ))}

              {/* Profit/Loss row */}
              <tr className="bg-muted/30 font-bold">
                <td className="py-3 px-3">سود / زیان</td>
                <td
                  className={`text-left py-3 px-3 font-num ${
                    totals.profitInitial >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {Math.round(totals.profitInitial).toLocaleString("fa-IR")}
                </td>
                <td
                  className={`text-left py-3 px-3 font-num ${
                    totals.profitProgram >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {Math.round(totals.profitProgram).toLocaleString("fa-IR")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          * همه مبالغ به میلیون تومان است
        </p>
      </CardContent>
    </Card>
  );
}

// Revenue detailed table with editable actualValue & ownershipShare via asset
function RevenueTable({
  data,
  onUpdate,
}: {
  data: FinancialSummary["revenuesDetailed"];
  onUpdate: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const handleSave = async (formData: Record<string, any>) => {
    // Update revenue's ownershipShare + asset's actualValue
    const res = await fetch(`/api/revenue-breakdown/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownershipShare: formData.ownershipShare !== null ? Number(formData.ownershipShare) : null,
        // Update asset actual value too if provided
        assetActualValue: formData.assetActualValue !== null ? Number(formData.assetActualValue) : null,
      }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess("اطلاعات درآمد به‌روزرسانی شد");
    onUpdate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">جدول درآمد</CardTitle>
        <p className="text-xs text-muted-foreground">
          برای ویرایش مقدار دارایی یا سهم مالکانه، روی دکمه ویرایش کلیک کنید
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-right py-2 px-3">کد</th>
                <th className="text-right py-2 px-3">شرح درآمد</th>
                <th className="text-right py-2 px-3">موضوع</th>
                <th className="text-left py-2 px-3">سهم مالکانه</th>
                <th className="text-left py-2 px-3">ارزش دارایی</th>
                <th className="text-left py-2 px-3">درآمد واقعی</th>
                <th className="text-left py-2 px-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-8">
                    موردی یافت نشد
                  </td>
                </tr>
              ) : (
                data.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">
                      <Badge variant="outline" className="font-mono">
                        {r.revenueId}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">{r.description || r.title || "-"}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{r.theme || "-"}</td>
                    <td className="text-left py-2 px-3 font-num">
                      {(r.ownershipShare * 100).toLocaleString("fa-IR")}%
                    </td>
                    <td className="text-left py-2 px-3 font-num">
                      {r.assetValue > 0
                        ? Math.round(r.assetValue).toLocaleString("fa-IR")
                        : "-"}
                    </td>
                    <td className="text-left py-2 px-3 font-num font-semibold text-emerald-600">
                      {r.actualRevenue > 0
                        ? Math.round(r.actualRevenue).toLocaleString("fa-IR")
                        : "-"}
                    </td>
                    <td className="text-left py-2 px-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setEditOpen(true);
                        }}
                      >
                        ویرایش
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          * درآمد واقعی = سهم مالکانه × ارزش واقعی دارایی — برای تنظیم، ارزش واقعی دارایی را
          در ماژول دارایی‌ها ویرایش کنید یا از دکمه ویرایش این جدول استفاده کنید.
        </p>
      </CardContent>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`ویرایش درآمد: ${editing?.revenueId || ""}`}
        fields={[
          {
            key: "ownershipShare",
            label: "سهم مالکانه (0 تا 1)",
            type: "number",
            helpText: "مثال: 0.5 یعنی ۵۰٪",
          },
          {
            key: "assetActualValue",
            label: "ارزش واقعی دارایی (میلیون تومان)",
            type: "number",
            helpText: "این مقدار در دارایی مرتبط ذخیره می‌شود",
          },
        ]}
        initialData={{
          ownershipShare: editing?.ownershipShare ?? 0,
          assetActualValue: editing?.assetValue ?? 0,
        }}
        onSubmit={handleSave}
      />
    </Card>
  );
}
