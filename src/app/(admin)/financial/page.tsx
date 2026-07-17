"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog } from "@/components/edit-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface CostBreakdown {
  id: string;
  costId: string;
  rowNumber: string | null;
  budgetType: string | null;
  category: string | null;
  description: string | null;
  theme: string | null;
  initialForecast: number | null;
  programForecast: number | null;
  percentTotal: number | null;
  notes: string | null;
  wbsId: string | null;
  wbs?: { wbsCode: string; title: string } | null;
  _count?: { personels: number };
}

interface RevenueBreakdown {
  id: string;
  revenueId: string;
  rowNumber: string | null;
  theme: string | null;
  description: string | null;
  title: string | null;
  wbsCode: string | null;
  wbsId: string | null;
  wbs?: { wbsCode: string; title: string } | null;
  initialForecast: number | null;
  programForecast: number | null;
  ownershipShare: number | null;
  percentTotal: number | null;
  revenueType: string | null;
  status: string | null;
  progressPct: number | null;
  actualRevenue: number | null;
  ev: number | null;
  trlLevel: number | null;
  notes: string | null;
}

export default function FinancialPage() {
  const [tab, setTab] = useState("cost");
  return (
    <div>
      <PageHeader title="مدیریت مالی" description="هزینه‌ها و درآمدهای پروژه" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cost">
            <TrendingDown className="w-4 h-4 ml-1" />
            هزینه‌ها
          </TabsTrigger>
          <TabsTrigger value="revenue">
            <TrendingUp className="w-4 h-4 ml-1" />
            درآمدها
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cost" className="mt-4">
          <CostTab />
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <RevenueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CostTab() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<CostBreakdown[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CostBreakdown | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<CostBreakdown | null>(null);

  const fetchData = async () => {
    const res = await fetch("/api/cost-breakdown");
    setData(await res.json());
  };
  useEffect(() => { fetchData(); }, []);

  const total = data.reduce((s, r) => s + (r.programForecast || 0), 0);

  const fields = [
    { key: "costId", label: "کد هزینه", required: true, placeholder: "c1.1.1" },
    { key: "rowNumber", label: "ردیف" },
    {
      key: "budgetType",
      label: "نوع بودجه",
      type: "select" as const,
      options: [
        { value: "جاری", label: "جاری" },
        { value: "سرمایه‌ای", label: "سرمایه‌ای" },
      ],
    },
    { key: "category", label: "دسته‌بندی", placeholder: "مثال: حقوق منابع انسانی" },
    { key: "description", label: "شرح هزینه" },
    { key: "theme", label: "موضوع هزینه" },
    { key: "initialForecast", label: "پیش‌بینی اولیه (میلیون تومان)", type: "number" as const },
    { key: "programForecast", label: "پیش‌بینی برنامه‌ای (میلیون تومان)", type: "number" as const },
    { key: "percentTotal", label: "درصد از کل", type: "number" as const },
    { key: "notes", label: "توضیحات", type: "textarea" as const },
  ];

  const columns: Column<CostBreakdown>[] = [
    { key: "costId", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.costId}</Badge> },
    {
      key: "budgetType",
      label: "نوع",
      render: (r) => (
        <Badge variant={r.budgetType === "سرمایه‌ای" ? "default" : "secondary"}>
          {r.budgetType || "-"}
        </Badge>
      ),
    },
    { key: "category", label: "دسته" },
    { key: "description", label: "شرح" },
    {
      key: "programForecast",
      label: "مبلغ برنامه",
      render: (r) => r.programForecast ? <span className="font-num">{r.programForecast.toLocaleString("fa-IR")}</span> : "-",
    },
    {
      key: "percentTotal",
      label: "درصد",
      render: (r) => r.percentTotal ? <span className="font-num">{r.percentTotal.toLocaleString("fa-IR")}%</span> : "-",
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/cost-breakdown/${editing.id}` : "/api/cost-breakdown";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا");
    }
    notifySuccess(editing ? "ویرایش شد" : "ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/cost-breakdown/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) return notifyError("خطا در حذف");
    notifySuccess("حذف شد");
    setDeleteOpen(false);
    fetchData();
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Wallet className="w-10 h-10 text-amber-500" />
          <div><p className="text-xl font-bold font-num">{total.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">کل هزینه برنامه (م.ت)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="w-10 h-10 text-blue-500" />
          <div><p className="text-xl font-bold">{data.length.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">سرفصل‌های هزینه</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingDown className="w-10 h-10 text-red-500" />
          <div><p className="text-xl font-bold">{data.filter(r => r.budgetType === "سرمایه‌ای").length.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">سرفصل سرمایه‌ای</p></div>
        </CardContent></Card>
      </div>
      <div className="flex justify-end mb-4">
        {canEdit && (
          <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن هزینه
          </Button>
        )}
      </div>
      <DataTable
        data={data}
        columns={columns}
        title=""
        searchKeys={["costId", "category", "description"]}
        onEdit={canEdit ? ((row) => { setEditing(row); setEditOpen(true); }) : undefined}
        onDelete={canEdit ? ((row) => { setDeleting(row); setDeleteOpen(true); }) : undefined}
        pageSize={20}
      />
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.costId}` : "افزودن هزینه"}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف هزینه"
        message={`حذف «${deleting?.description}»؟`}
        onConfirm={handleDelete}
      />
    </>
  );
}

function RevenueTab() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<RevenueBreakdown[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueBreakdown | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<RevenueBreakdown | null>(null);

  const fetchData = async () => {
    const [r1, r2] = await Promise.all([
      fetch("/api/revenue-breakdown"),
      fetch("/api/asset"),
    ]);
    if (r1.ok) setData(await r1.json());
    if (r2.ok) setAssets(await r2.json());
  };
  useEffect(() => { fetchData(); }, []);

  const total = data.reduce((s, r) => s + (r.programForecast || 0), 0);

  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: `${a.assetId} - ${a.title} (ارزش: ${a.actualValue ?? a.currentValue ?? a.initialValue ?? 0})`,
  }));

  const fields = [
    { key: "revenueId", label: "کد درآمد", required: true, placeholder: "I1.1" },
    { key: "rowNumber", label: "ردیف" },
    { key: "theme", label: "موضوع درآمد" },
    { key: "description", label: "شرح درآمد" },
    { key: "title", label: "عنوان درآمد" },
    { key: "wbsCode", label: "کد WBS مرتبط" },
    {
      key: "assetId",
      label: "دارایی مرتبط",
      type: "select" as const,
      options: assetOptions,
      helpText: "اگر این درآمد دارایی‌محور است، دارایی مربوطه را انتخاب کنید. ارزش دارایی برای محاسبه درآمد واقعی استفاده می‌شود.",
    },
    { key: "initialForecast", label: "پیش‌بینی اولیه", type: "number" as const },
    { key: "programForecast", label: "پیش‌بینی برنامه‌ای (ارزش کل دارایی)", type: "number" as const },
    { key: "ownershipShare", label: "سهم مالکانه (0-1)", type: "number" as const, helpText: "مثال: 0.5 یعنی ۵۰٪" },
    { key: "percentTotal", label: "درصد از کل", type: "number" as const },
    {
      key: "revenueType",
      label: "نوع درآمد",
      type: "select" as const,
      options: [
        { value: "عملیاتی", label: "عملیاتی" },
        { value: "غیرعملیاتی", label: "غیرعملیاتی" },
        { value: "بدون درآمد", label: "بدون درآمد" },
      ],
    },
    { key: "status", label: "وضعیت" },
    { key: "progressPct", label: "درصد پیشرفت", type: "number" as const },
    { key: "actualRevenue", label: "درآمد واقعی تا کنون", type: "number" as const },
    { key: "ev", label: "ارزش کسب شده (EV)", type: "number" as const },
    { key: "trlLevel", label: "TRL Level", type: "number" as const },
    { key: "notes", label: "توضیحات", type: "textarea" as const },
  ];

  const columns: Column<RevenueBreakdown>[] = [
    { key: "revenueId", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.revenueId}</Badge> },
    { key: "description", label: "شرح" },
    { key: "title", label: "عنوان" },
    {
      key: "revenueType",
      label: "نوع",
      render: (r) => (
        <Badge variant={r.revenueType === "عملیاتی" ? "default" : "secondary"}>
          {r.revenueType || "-"}
        </Badge>
      ),
    },
    {
      key: "programForecast",
      label: "مبلغ برنامه",
      render: (r) => r.programForecast ? <span className="font-num">{r.programForecast.toLocaleString("fa-IR")}</span> : "-",
    },
    {
      key: "progressPct",
      label: "پیشرفت",
      render: (r) => r.progressPct ? <span className="font-num">{r.progressPct.toLocaleString("fa-IR")}%</span> : "-",
    },
    {
      key: "trlLevel",
      label: "TRL",
      render: (r) => r.trlLevel ? <Badge variant="outline">TRL-{r.trlLevel.toLocaleString("fa-IR")}</Badge> : "-",
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/revenue-breakdown/${editing.id}` : "/api/revenue-breakdown";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا");
    }
    notifySuccess(editing ? "ویرایش شد" : "ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/revenue-breakdown/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) return notifyError("خطا در حذف");
    notifySuccess("حذف شد");
    setDeleteOpen(false);
    fetchData();
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="w-10 h-10 text-emerald-500" />
          <div><p className="text-xl font-bold font-num">{total.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">کل درآمد برنامه (م.ت)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="w-10 h-10 text-blue-500" />
          <div><p className="text-xl font-bold">{data.length.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">سرفصل‌های درآمد</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="w-10 h-10 text-violet-500" />
          <div><p className="text-xl font-bold">{data.filter(r => r.revenueType === "عملیاتی").length.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">درآمد عملیاتی</p></div>
        </CardContent></Card>
      </div>
      <div className="flex justify-end mb-4">
        {canEdit && (
          <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن درآمد
          </Button>
        )}
      </div>
      <DataTable
        data={data}
        columns={columns}
        title=""
        searchKeys={["revenueId", "description", "title"]}
        onEdit={canEdit ? ((row) => { setEditing(row); setEditOpen(true); }) : undefined}
        onDelete={canEdit ? ((row) => { setDeleting(row); setDeleteOpen(true); }) : undefined}
        pageSize={20}
      />
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.revenueId}` : "افزودن درآمد"}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف درآمد"
        message={`حذف «${deleting?.description}»؟`}
        onConfirm={handleDelete}
      />
    </>
  );
}
