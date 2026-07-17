"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, StatCard, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError, notifyInfo } from "@/lib/notify";
import { Plus, BarChart3, TrendingUp, Activity, PieChart, LineChart } from "lucide-react";

interface ChartConfig {
  id: string;
  code: string;
  title: string;
  chartType: string | null;
  dataSource: string | null;
  config: string | null;
  description: string | null;
  isActive: boolean;
}

const chartTypeMap: Record<string, { label: string; icon: any; color: string }> = {
  s_curve: { label: "منحنی S", icon: TrendingUp, color: "from-emerald-500 to-teal-600" },
  bar: { label: "میله‌ای", icon: BarChart3, color: "from-blue-500 to-cyan-600" },
  line: { label: "خطی", icon: LineChart, color: "from-violet-500 to-purple-600" },
  pie: { label: "دایره‌ای", icon: PieChart, color: "from-amber-500 to-orange-600" },
  heatmap: { label: "نقشه حرارتی", icon: Activity, color: "from-rose-500 to-red-600" },
};

const fields: FormField[] = [
  { key: "code", label: "کد چارت", required: true, placeholder: "مثال: CHART-001" },
  { key: "title", label: "عنوان", required: true },
  {
    key: "chartType",
    label: "نوع نمودار",
    type: "select",
    options: [
      { value: "s_curve", label: "منحنی S" },
      { value: "bar", label: "میله‌ای" },
      { value: "line", label: "خطی" },
      { value: "pie", label: "دایره‌ای" },
      { value: "heatmap", label: "نقشه حرارتی" },
    ],
  },
  {
    key: "dataSource",
    label: "منبع داده",
    type: "select",
    options: [
      { value: "wbs", label: "WBS" },
      { value: "financial", label: "مالی" },
      { value: "risk", label: "ریسک" },
      { value: "kpi", label: "شاخص عملکرد" },
    ],
  },
  { key: "config", label: "تنظیمات (JSON)", type: "textarea", placeholder: '{"filters":{}}' },
  { key: "description", label: "توضیحات", type: "textarea" },
  {
    key: "isActive",
    label: "فعال",
    type: "select",
    options: [
      { value: "true", label: "فعال" },
      { value: "false", label: "غیرفعال" },
    ],
  },
];

export default function ChartsPage() {
  const [data, setData] = useState<ChartConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ChartConfig | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<ChartConfig | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chart-config");
      const json = await res.json();
      setData(json);
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const columns: Column<ChartConfig>[] = [
    { key: "code", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge> },
    { key: "title", label: "عنوان" },
    {
      key: "chartType",
      label: "نوع نمودار",
      render: (r) => {
        const t = r.chartType ? chartTypeMap[r.chartType] : null;
        return t ? (
          <Badge variant="secondary" className="gap-1">
            {t.label}
          </Badge>
        ) : "-";
      },
    },
    { key: "dataSource", label: "منبع داده", render: (r) => r.dataSource || "-" },
    {
      key: "isActive",
      label: "وضعیت",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "secondary"}>
          {r.isActive ? "فعال" : "غیرفعال"}
        </Badge>
      ),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/chart-config/${editing.id}` : "/api/chart-config";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(editing ? "چارت ویرایش شد" : "چارت جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/chart-config/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("چارت حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setEditOpen(true);
  };

  const openEdit = (row: ChartConfig) => {
    setEditing(row);
    setEditOpen(true);
  };

  const activeCount = data.filter((d) => d.isActive).length;

  return (
    <div>
      <PageHeader
        title="چارت‌ها و منحنی S"
        description={`${data.length.toLocaleString("fa-IR")} پیکربندی نمودار ثبت شده است`}
      >
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 ml-1" />
          افزودن چارت
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          label="کل چارت‌ها"
          value={data.length.toLocaleString("fa-IR")}
          icon={BarChart3}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="چارت‌های فعال"
          value={activeCount.toLocaleString("fa-IR")}
          icon={Activity}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          label="منحنی‌های S"
          value={data.filter((d) => d.chartType === "s_curve").length.toLocaleString("fa-IR")}
          icon={TrendingUp}
          color="from-violet-500 to-purple-600"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["code", "title", "chartType"]}
          onEdit={openEdit}
          onView={(row) => notifyInfo(`نمایش نمودار «${row.title}» — به‌زودی`)}
          onDelete={(row) => {
            setDeleting(row);
            setDeleteOpen(true);
          }}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.code}` : "افزودن چارت جدید"}
        description="پیکربندی نمودار را تکمیل کنید"
        fields={fields}
        initialData={editing
          ? { ...editing, isActive: String(editing.isActive) }
          : { isActive: "true", chartType: "s_curve", dataSource: "wbs" }}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف چارت"
        message={`آیا از حذف «${deleting?.title}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
