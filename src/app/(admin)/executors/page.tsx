"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, StatCard, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, Briefcase, Package, Building2, User } from "lucide-react";

interface Executor {
  id: string;
  code: string;
  name: string;
  type: string | null;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  description: string | null;
  _count?: { assets: number };
}

const typeMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  "شخص حقیقی": { label: "شخص حقیقی", variant: "outline" },
  "شرکت": { label: "شرکت", variant: "default" },
  "پیمانکار": { label: "پیمانکار", variant: "secondary" },
};

export default function ExecutorsPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<Executor[]>([]);
  const [personels, setPersonels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Executor | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Executor | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/executor"),
        fetch("/api/personel"),
      ]);
      if (r1.ok) setData(await r1.json());
      if (r2.ok) setPersonels(await r2.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const personelOptions = personels.map((p) => ({
    value: p.id,
    label: `${p.personelId} - ${p.name}`,
  }));

  const fields: FormField[] = [
    { key: "code", label: "کد مجری", required: true, placeholder: "مثال: EX-001" },
    { key: "name", label: "نام", required: true, placeholder: "نام شرکت یا پیمانکار" },
    { key: "type", label: "نوع", type: "select", options: [
      { value: "شخص حقیقی", label: "شخص حقیقی" },
      { value: "شرکت", label: "شرکت" },
      { value: "پیمانکار", label: "پیمانکار" },
    ] },
    { key: "nationalId", label: "شناسه ملی / کد ملی" },
    { key: "phone", label: "تلفن" },
    { key: "email", label: "ایمیل" },
    {
      key: "contactPerson",
      label: "شخص مسئول ارتباط",
      type: "select",
      options: personelOptions,
      helpText: "از بین پرسنل شرکت انتخاب کنید",
    },
    { key: "address", label: "آدرس", type: "textarea" },
    { key: "description", label: "توضیحات", type: "textarea" },
  ];

  const totalAssets = data.reduce((s, e) => s + (e._count?.assets ?? 0), 0);
  const byType = {
    "شخص حقیقی": data.filter((e) => e.type === "شخص حقیقی").length,
    "شرکت": data.filter((e) => e.type === "شرکت").length,
    "پیمانکار": data.filter((e) => e.type === "پیمانکار").length,
  };

  const columns: Column<Executor>[] = [
    {
      key: "code",
      label: "کد",
      render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge>,
    },
    { key: "name", label: "نام" },
    {
      key: "type",
      label: "نوع",
      render: (r) => {
        const t = r.type ? typeMap[r.type] : null;
        return t ? <Badge variant={t.variant}>{t.label}</Badge> : "-";
      },
    },
    { key: "nationalId", label: "شناسه ملی", render: (r) => r.nationalId || "-" },
    {
      key: "contactPerson",
      label: "مسئول ارتباط",
      render: (r) => {
        const p = personels.find((p) => p.id === r.contactPerson);
        return p ? p.name : (r.contactPerson || "-");
      },
    },
    { key: "phone", label: "تلفن", render: (r) => r.phone || "-" },
    {
      key: "assets",
      label: "تعداد دارایی",
      render: (r) => (
        <Badge variant="secondary" className="font-num">
          {(r._count?.assets ?? 0).toLocaleString("fa-IR")}
        </Badge>
      ),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/executor/${editing.id}` : "/api/executor";
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
    notifySuccess(editing ? "مجری ویرایش شد" : "مجری جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/executor/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("مجری حذف شد");
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
        title="مدیریت مجریان"
        description="مدیریت شرکت‌ها و پیمانکارانی که مجری دارایی‌های شرکت هستند"
      >
        {canEdit && (
          <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن مجری
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="کل مجریان"
          value={data.length.toLocaleString("fa-IR")}
          icon={Briefcase}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="دارایی‌های واگذار شده"
          value={totalAssets.toLocaleString("fa-IR")}
          icon={Package}
          color="from-violet-500 to-purple-600"
        />
        <StatCard
          label="شرکت‌ها"
          value={byType["شرکت"].toLocaleString("fa-IR")}
          icon={Building2}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          label="پیمانکاران"
          value={byType["پیمانکار"].toLocaleString("fa-IR")}
          icon={User}
          color="from-amber-500 to-orange-600"
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
          searchKeys={["code", "name", "nationalId", "contactPerson"]}
          onEdit={canEdit ? ((row) => { setEditing(row); setEditOpen(true); }) : undefined}
          onDelete={canEdit ? ((row) => { setDeleting(row); setDeleteOpen(true); }) : undefined}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.code}` : "افزودن مجری جدید"}
        description="اطلاعات مجری را تکمیل کنید"
        fields={fields}
        initialData={editing || { type: "شرکت" }}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف مجری"
        message={`آیا از حذف «${deleting?.name}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
