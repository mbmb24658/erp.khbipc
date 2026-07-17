"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, Target, UserCheck, ClipboardList } from "lucide-react";

interface KPI {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  weight: number;
  targetValue: number | null;
  unit: string | null;
  frequency: string | null;
  status: string;
  _count?: { assignments: number };
}

interface KPIAssignment {
  id: string;
  kpiId: string;
  personelId: string;
  kpi?: { code: string; title: string };
  personel?: { personelId: string; name: string };
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  _count?: { records: number };
}

interface KPIRecord {
  id: string;
  assignmentId: string;
  recordDate: string;
  value: number;
  notes: string | null;
  assignment?: {
    kpi?: { code: string; title: string };
    personel?: { personelId: string; name: string };
  };
  confirmedBy?: { personelId: string; name: string } | null;
}

const kpiFields: FormField[] = [
  { key: "code", label: "کد شاخص", required: true, placeholder: "مثال: KPI-001" },
  { key: "title", label: "عنوان", required: true },
  { key: "category", label: "دسته‌بندی" },
  { key: "weight", label: "وزن", type: "number", placeholder: "1" },
  { key: "targetValue", label: "مقدار هدف", type: "number" },
  { key: "unit", label: "واحد", placeholder: "مثال: درصد، تعداد" },
  { key: "frequency", label: "دوره", type: "select", options: [
    { value: "ماهانه", label: "ماهانه" },
    { value: "فصلی", label: "فصلی" },
    { value: "سالانه", label: "سالانه" },
  ] },
  { key: "status", label: "وضعیت", type: "select", options: [
    { value: "active", label: "فعال" },
    { value: "inactive", label: "غیرفعال" },
    { value: "draft", label: "پیش‌نویس" },
  ] },
  { key: "description", label: "توضیحات", type: "textarea" },
];

const assignmentStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "فعال", variant: "default" },
  completed: { label: "تکمیل شده", variant: "secondary" },
  suspended: { label: "معلق", variant: "destructive" },
};

export default function KPIPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [assignments, setAssignments] = useState<KPIAssignment[]>([]);
  const [records, setRecords] = useState<KPIRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [kpiEditOpen, setKpiEditOpen] = useState(false);
  const [kpiEditing, setKpiEditing] = useState<KPI | null>(null);
  const [kpiDeleteOpen, setKpiDeleteOpen] = useState(false);
  const [kpiDeleting, setKpiDeleting] = useState<KPI | null>(null);

  const [asgEditOpen, setAsgEditOpen] = useState(false);
  const [asgEditing, setAsgEditing] = useState<KPIAssignment | null>(null);
  const [asgDeleteOpen, setAsgDeleteOpen] = useState(false);
  const [asgDeleting, setAsgDeleting] = useState<KPIAssignment | null>(null);

  const [recEditOpen, setRecEditOpen] = useState(false);
  const [recEditing, setRecEditing] = useState<KPIRecord | null>(null);
  const [recDeleteOpen, setRecDeleteOpen] = useState(false);
  const [recDeleting, setRecDeleting] = useState<KPIRecord | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/kpi"),
        fetch("/api/kpi-assignment"),
        fetch("/api/kpi-record"),
      ]);
      setKpis(await r1.json());
      setAssignments(await r2.json());
      setRecords(await r3.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // KPI handlers
  const saveKpi = async (formData: Record<string, any>) => {
    const url = kpiEditing ? `/api/kpi/${kpiEditing.id}` : "/api/kpi";
    const method = kpiEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(kpiEditing ? "شاخص ویرایش شد" : "شاخص جدید ایجاد شد");
    fetchData();
  };
  const deleteKpi = async () => {
    if (!kpiDeleting) return;
    try {
      const res = await fetch(`/api/kpi/${kpiDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("شاخص حذف شد");
      setKpiDeleteOpen(false);
      setKpiDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  // Assignment handlers
  const saveAsg = async (formData: Record<string, any>) => {
    const url = asgEditing ? `/api/kpi-assignment/${asgEditing.id}` : "/api/kpi-assignment";
    const method = asgEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(asgEditing ? "تخصیص ویرایش شد" : "تخصیص جدید ایجاد شد");
    fetchData();
  };
  const deleteAsg = async () => {
    if (!asgDeleting) return;
    try {
      const res = await fetch(`/api/kpi-assignment/${asgDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("تخصیص حذف شد");
      setAsgDeleteOpen(false);
      setAsgDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  // Record handlers
  const saveRec = async (formData: Record<string, any>) => {
    const url = recEditing ? `/api/kpi-record/${recEditing.id}` : "/api/kpi-record";
    const method = recEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(recEditing ? "رکورد ویرایش شد" : "رکورد جدید ایجاد شد");
    fetchData();
  };
  const deleteRec = async () => {
    if (!recDeleting) return;
    try {
      const res = await fetch(`/api/kpi-record/${recDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("رکورد حذف شد");
      setRecDeleteOpen(false);
      setRecDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const kpiColumns: Column<KPI>[] = [
    { key: "code", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge> },
    { key: "title", label: "عنوان" },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    { key: "weight", label: "وزن", render: (r) => r.weight.toLocaleString("fa-IR") },
    {
      key: "targetValue",
      label: "هدف",
      render: (r) => r.targetValue != null
        ? `${Number(r.targetValue).toLocaleString("fa-IR")} ${r.unit || ""}`.trim()
        : "-",
    },
    {
      key: "status",
      label: "وضعیت",
      render: (r) => (
        <Badge variant={r.status === "active" ? "default" : r.status === "draft" ? "secondary" : "outline"}>
          {r.status === "active" ? "فعال" : r.status === "draft" ? "پیش‌نویس" : "غیرفعال"}
        </Badge>
      ),
    },
  ];

  const asgColumns: Column<KPIAssignment>[] = [
    {
      key: "kpi",
      label: "شاخص",
      render: (r) => r.kpi
        ? <span><Badge variant="outline" className="font-mono ml-1">{r.kpi.code}</Badge>{r.kpi.title}</span>
        : "-",
    },
    {
      key: "personel",
      label: "پرسنل",
      render: (r) => r.personel ? `${r.personel.name}` : "-",
    },
    {
      key: "status",
      label: "وضعیت",
      render: (r) => {
        const s = assignmentStatusMap[r.status];
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : r.status;
      },
    },
    {
      key: "startDate",
      label: "شروع",
      render: (r) => r.startDate ? new Date(r.startDate).toLocaleDateString("fa-IR") : "-",
    },
    {
      key: "endDate",
      label: "پایان",
      render: (r) => r.endDate ? new Date(r.endDate).toLocaleDateString("fa-IR") : "-",
    },
  ];

  const recColumns: Column<KPIRecord>[] = [
    {
      key: "assignment",
      label: "تخصیص",
      render: (r) => r.assignment?.kpi
        ? `${r.assignment.kpi.title} - ${r.assignment.personel?.name || ""}`
        : "-",
    },
    {
      key: "recordDate",
      label: "تاریخ",
      render: (r) => new Date(r.recordDate).toLocaleDateString("fa-IR"),
    },
    {
      key: "value",
      label: "مقدار",
      render: (r) => Number(r.value).toLocaleString("fa-IR"),
    },
    {
      key: "confirmedBy",
      label: "تایید کننده",
      render: (r) => r.confirmedBy?.name || "-",
    },
  ];

  // For assignment & record dialogs, we need dynamic options
  const kpiOptions = kpis.map((k) => ({ value: k.id, label: `${k.code} - ${k.title}` }));
  const asgOptions = assignments.map((a) => ({
    value: a.id,
    label: `${a.kpi?.code || ""} - ${a.personel?.name || ""}`.trim(),
  }));

  const asgFields: FormField[] = [
    { key: "kpiId", label: "شاخص", type: "select", required: true, options: kpiOptions },
    { key: "personelId", label: "کد پرسنل", required: true, placeholder: "شناسه پرسنل" },
    { key: "status", label: "وضعیت", type: "select", options: [
      { value: "active", label: "فعال" },
      { value: "completed", label: "تکمیل شده" },
      { value: "suspended", label: "معلق" },
    ] },
    { key: "startDate", label: "تاریخ شروع", type: "date" },
    { key: "endDate", label: "تاریخ پایان", type: "date" },
    { key: "notes", label: "یادداشت", type: "textarea" },
  ];

  const recFields: FormField[] = [
    { key: "assignmentId", label: "تخصیص", type: "select", required: true, options: asgOptions },
    { key: "recordDate", label: "تاریخ ثبت", type: "date" },
    { key: "value", label: "مقدار", type: "number", required: true },
    { key: "confirmedById", label: "کد تایید کننده", placeholder: "شناسه پرسنل (اختیاری)" },
    { key: "notes", label: "یادداشت", type: "textarea" },
  ];

  return (
    <div>
      <PageHeader
        title="ارزیابی عملکرد (KPI)"
        description="مدیریت شاخص‌های کلیدی عملکرد، تخصیص‌ها و سوابق"
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{kpis.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">شاخص‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{assignments.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">تخصیص‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{records.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سوابق ثبت شده</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="kpis">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="kpis">شاخص‌ها</TabsTrigger>
          <TabsTrigger value="assignments">تخصیص‌ها</TabsTrigger>
          <TabsTrigger value="records">سوابق</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={kpis}
              columns={kpiColumns}
              title=""
              searchKeys={["code", "title", "category"]}
              onAdd={() => { setKpiEditing(null); setKpiEditOpen(true); }}
              onEdit={(row) => { setKpiEditing(row); setKpiEditOpen(true); }}
              onDelete={(row) => { setKpiDeleting(row); setKpiDeleteOpen(true); }}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={assignments}
              columns={asgColumns}
              title=""
              searchKeys={["kpiId", "personelId"]}
              onAdd={() => { setAsgEditing(null); setAsgEditOpen(true); }}
              onEdit={(row) => { setAsgEditing(row); setAsgEditOpen(true); }}
              onDelete={(row) => { setAsgDeleting(row); setAsgDeleteOpen(true); }}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={records}
              columns={recColumns}
              title=""
              searchKeys={["assignmentId"]}
              onAdd={() => { setRecEditing(null); setRecEditOpen(true); }}
              onEdit={(row) => { setRecEditing(row); setRecEditOpen(true); }}
              onDelete={(row) => { setRecDeleting(row); setRecDeleteOpen(true); }}
              pageSize={15}
            />
          )}
        </TabsContent>
      </Tabs>

      <EditDialog
        open={kpiEditOpen}
        onOpenChange={setKpiEditOpen}
        title={kpiEditing ? `ویرایش: ${kpiEditing.code}` : "افزودن شاخص جدید"}
        fields={kpiFields}
        initialData={kpiEditing ?? { status: "active", weight: 1 }}
        onSubmit={saveKpi}
      />
      <ConfirmDialog
        open={kpiDeleteOpen}
        onOpenChange={setKpiDeleteOpen}
        title="حذف شاخص"
        message={`آیا از حذف «${kpiDeleting?.title}» مطمئن هستید؟`}
        onConfirm={deleteKpi}
      />

      <EditDialog
        open={asgEditOpen}
        onOpenChange={setAsgEditOpen}
        title={asgEditing ? "ویرایش تخصیص" : "افزودن تخصیص جدید"}
        fields={asgFields}
        initialData={asgEditing
          ? { ...asgEditing, startDate: asgEditing.startDate ? asgEditing.startDate.split("T")[0] : "", endDate: asgEditing.endDate ? asgEditing.endDate.split("T")[0] : "" }
          : { status: "active" }}
        onSubmit={saveAsg}
      />
      <ConfirmDialog
        open={asgDeleteOpen}
        onOpenChange={setAsgDeleteOpen}
        title="حذف تخصیص"
        message="آیا از حذف این تخصیص مطمئن هستید؟"
        onConfirm={deleteAsg}
      />

      <EditDialog
        open={recEditOpen}
        onOpenChange={setRecEditOpen}
        title={recEditing ? "ویرایش رکورد" : "افزودن رکورد جدید"}
        fields={recFields}
        initialData={recEditing
          ? { ...recEditing, recordDate: recEditing.recordDate ? recEditing.recordDate.split("T")[0] : "" }
          : { recordDate: new Date().toISOString().split("T")[0] }}
        onSubmit={saveRec}
      />
      <ConfirmDialog
        open={recDeleteOpen}
        onOpenChange={setRecDeleteOpen}
        title="حذف رکورد"
        message="آیا از حذف این رکورد مطمئن هستید؟"
        onConfirm={deleteRec}
      />
    </div>
  );
}
