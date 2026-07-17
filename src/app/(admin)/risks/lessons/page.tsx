"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, StatCard, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, BookOpen, AlertTriangle, TrendingUp, Sparkles } from "lucide-react";

interface LessonLearned {
  id: string;
  title: string;
  description: string;
  category: string | null;
  impact: string | null;
  recommendations: string | null;
  capturedAt: string;
  isArchived: boolean;
  capturedBy?: { id: string; name: string } | null;
  risk?: { id: string; code: string; title: string } | null;
}

const categoryMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "ریسک": { label: "ریسک", variant: "destructive" },
  "فرصت": { label: "فرصت", variant: "default" },
  "عملیات": { label: "عملیات", variant: "secondary" },
  "استراتژی": { label: "استراتژی", variant: "outline" },
};

const impactMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "مثبت": { label: "مثبت", variant: "default" },
  "منفی": { label: "منفی", variant: "destructive" },
};

const fields: FormField[] = [
  { key: "title", label: "عنوان", required: true },
  { key: "description", label: "توضیحات", type: "textarea", required: true },
  {
    key: "category",
    label: "دسته‌بندی",
    type: "select",
    options: [
      { value: "ریسک", label: "ریسک" },
      { value: "فرصت", label: "فرصت" },
      { value: "عملیات", label: "عملیات" },
      { value: "استراتژی", label: "استراتژی" },
    ],
  },
  {
    key: "impact",
    label: "نوع اثر",
    type: "select",
    options: [
      { value: "مثبت", label: "مثبت" },
      { value: "منفی", label: "منفی" },
    ],
  },
  { key: "riskId", label: "شناسه ریسک (اختیاری)", placeholder: "کد ریسک مرتبط" },
  { key: "recommendations", label: "پیشنهادات", type: "textarea" },
];

export default function LessonsLearnedPage() {
  const [data, setData] = useState<LessonLearned[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LessonLearned | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<LessonLearned | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lesson-learned");
      setData(await res.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const byCategory = {
    "ریسک": data.filter((l) => l.category === "ریسک").length,
    "فرصت": data.filter((l) => l.category === "فرصت").length,
    "عملیات": data.filter((l) => l.category === "عملیات").length,
    "استراتژی": data.filter((l) => l.category === "استراتژی").length,
  };
  const byImpact = {
    "مثبت": data.filter((l) => l.impact === "مثبت").length,
    "منفی": data.filter((l) => l.impact === "منفی").length,
  };

  const columns: Column<LessonLearned>[] = [
    { key: "title", label: "عنوان", render: (r) => (
      <div>
        <p className="font-medium">{r.title}</p>
        {r.risk && (
          <span className="text-xs text-muted-foreground">ریسک مرتبط: {r.risk.code}</span>
        )}
      </div>
    ) },
    {
      key: "category",
      label: "دسته",
      render: (r) => {
        const c = r.category ? categoryMap[r.category] : null;
        return c ? <Badge variant={c.variant}>{c.label}</Badge> : "-";
      },
    },
    {
      key: "impact",
      label: "اثر",
      render: (r) => {
        const i = r.impact ? impactMap[r.impact] : null;
        return i ? <Badge variant={i.variant}>{i.label}</Badge> : "-";
      },
    },
    {
      key: "capturedBy",
      label: "ثبت کننده",
      render: (r) => r.capturedBy?.name || "-",
    },
    {
      key: "capturedAt",
      label: "تاریخ ثبت",
      render: (r) => new Date(r.capturedAt).toLocaleDateString("fa-IR"),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/lesson-learned/${editing.id}` : "/api/lesson-learned";
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
    notifySuccess(editing ? "درس آموخته ویرایش شد" : "درس آموخته جدید ثبت شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/lesson-learned/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("درس آموخته حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  return (
    <div>
      <PageHeader
        title="درس آموخته‌ها"
        description="ثبت و مدیریت درس آموخته‌های سازمانی از ریسک‌ها و فرصت‌ها"
      >
        <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4 ml-1" />
          افزودن درس آموخته
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="کل درس آموخته‌ها"
          value={data.length.toLocaleString("fa-IR")}
          icon={BookOpen}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="از ریسک‌ها"
          value={byCategory["ریسک"].toLocaleString("fa-IR")}
          icon={AlertTriangle}
          color="from-rose-500 to-red-600"
        />
        <StatCard
          label="از فرصت‌ها"
          value={byCategory["فرصت"].toLocaleString("fa-IR")}
          icon={TrendingUp}
          color="from-violet-500 to-purple-600"
        />
        <StatCard
          label="اثر مثبت"
          value={byImpact["مثبت"].toLocaleString("fa-IR")}
          icon={Sparkles}
          color="from-amber-500 to-orange-600"
        />
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["title", "description"]}
          onEdit={(row) => { setEditing(row); setEditOpen(true); }}
          onDelete={(row) => { setDeleting(row); setDeleteOpen(true); }}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.title}` : "افزودن درس آموخته جدید"}
        fields={fields}
        initialData={editing || { category: "ریسک", impact: "منفی" }}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف درس آموخته"
        message={`آیا از حذف «${deleting?.title}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
