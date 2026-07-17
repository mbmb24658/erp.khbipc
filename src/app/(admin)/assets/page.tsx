"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, StatCard, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, Package, CheckCircle2, DollarSign } from "lucide-react";

interface Asset {
  id: string;
  assetId: string;
  title: string;
  category: string | null;
  description: string | null;
  status: string | null;
  assetType: string | null;
  wbsId: string | null;
  wbs?: { wbsCode: string; title: string } | null;
  purchaseDate: string | null;
  initialValue: number | null;
  currentValue: number | null;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "فعال": { label: "فعال", variant: "default" },
  "در حال توسعه": { label: "در حال توسعه", variant: "secondary" },
  "غیرفعال": { label: "غیرفعال", variant: "destructive" },
};

export default function AssetsPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<Asset[]>([]);
  const [executors, setExecutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/asset"),
        fetch("/api/executor"),
      ]);
      if (r1.ok) setData(await r1.json());
      if (r2.ok) setExecutors(await r2.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const executorOptions = executors.map((e) => ({
    value: e.id,
    label: `${e.code} - ${e.name}`,
  }));

  const fields: FormField[] = [
    { key: "assetId", label: "کد دارایی", required: true, placeholder: "مثال: p3.1" },
    { key: "title", label: "عنوان", required: true },
    { key: "category", label: "دسته‌بندی", placeholder: "مثال: نرم‌افزار" },
    { key: "assetType", label: "نوع دارایی", placeholder: "مثال: نامشهود" },
    { key: "status", label: "وضعیت", type: "select", options: [
      { value: "فعال", label: "فعال" },
      { value: "در حال توسعه", label: "در حال توسعه" },
      { value: "غیرفعال", label: "غیرفعال" },
    ] },
    {
      key: "executorId",
      label: "مجری",
      type: "select",
      options: executorOptions,
      helpText: "شرکت یا پیمانکار مجری این دارایی",
    },
    { key: "wbsId", label: "کد WBS", helpText: "کد فعالیت مرتبط (اختیاری)" },
    { key: "purchaseDate", label: "تاریخ خرید", type: "date" },
    { key: "initialValue", label: "ارزش اولیه (تومان)", type: "number" },
    { key: "actualValue", label: "ارزش واقعی (تومان)", type: "number", helpText: "برای محاسبه درآمد واقعی" },
    { key: "currentValue", label: "ارزش فعلی (تومان)", type: "number" },
    { key: "description", label: "توضیحات", type: "textarea" },
  ];

  const totalValue = data.reduce((s, a) => s + (a.currentValue ?? a.initialValue ?? 0), 0);
  const activeCount = data.filter((a) => a.status === "فعال").length;

  const columns: Column<Asset>[] = [
    {
      key: "assetId",
      label: "کد",
      render: (r) => <Badge variant="outline" className="font-mono">{r.assetId}</Badge>,
    },
    { key: "title", label: "عنوان" },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    {
      key: "status",
      label: "وضعیت",
      render: (r) => {
        const s = r.status ? statusMap[r.status] : null;
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : "-";
      },
    },
    {
      key: "purchaseDate",
      label: "تاریخ خرید",
      render: (r) => r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString("fa-IR") : "-",
    },
    {
      key: "initialValue",
      label: "ارزش اولیه",
      render: (r) => r.initialValue != null
        ? `${Number(r.initialValue).toLocaleString("fa-IR")} تومان`
        : "-",
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/asset/${editing.id}` : "/api/asset";
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
    notifySuccess(editing ? "دارایی ویرایش شد" : "دارایی جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/asset/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("دارایی حذف شد");
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

  const openEdit = (row: Asset) => {
    setEditing(row);
    setEditOpen(true);
  };

  const initialForForm = editing
    ? {
        ...editing,
        purchaseDate: editing.purchaseDate ? editing.purchaseDate.split("T")[0] : "",
      }
    : { status: "فعال" };

  return (
    <div>
      <PageHeader
        title="مدیریت دارایی‌ها"
        description={`${data.length.toLocaleString("fa-IR")} دارایی ثبت شده است`}
      >
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن دارایی
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          label="کل دارایی‌ها"
          value={data.length.toLocaleString("fa-IR")}
          icon={Package}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="دارایی‌های فعال"
          value={activeCount.toLocaleString("fa-IR")}
          icon={CheckCircle2}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          label="ارزش کل (تومان)"
          value={totalValue.toLocaleString("fa-IR")}
          icon={DollarSign}
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
          searchKeys={["assetId", "title", "category"]}
          onEdit={canEdit ? openEdit : undefined}
          onDelete={canEdit ? ((row) => {
            setDeleting(row);
            setDeleteOpen(true);
          }) : undefined}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.assetId}` : "افزودن دارایی جدید"}
        description="اطلاعات دارایی را تکمیل کنید"
        fields={fields}
        initialData={initialForForm}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف دارایی"
        message={`آیا از حذف «${deleting?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
