"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, Users, Building, UserPlus, Link2, Eye } from "lucide-react";

interface Personel {
  id: string;
  personelId: string;
  name: string;
  orgChartId: string | null;
  orgChart?: { id: string; orgId: string; position: string; level: string } | null;
  costBreakdownCode: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  gender: string | null;
  monthlySalary: number | null;
  annualSalary: number | null;
  monthlySalaryActual: number | null;
  annualSalaryActual: number | null;
  dailyRate: number | null;
  notes: string | null;
  _count?: { wbsAssignments: number; kpiAssignments: number };
}

interface OrgChart {
  id: string;
  orgId: string;
  position: string;
  level: string;
  parentId: string | null;
  personResponsibleId: string | null;
  personResponsible?: Personel | null;
  costBreakdownCode: string | null;
  hrPositionId: string | null;
  hrTemplate?: { id: string; positionCode: string; positionName: string } | null;
  _count?: { personels: number; children: number };
}

interface KPITemplate {
  id: string;
  positionCode: string;
  positionName: string;
  description: string | null;
}

export default function HRPage() {
  const [tab, setTab] = useState("personel");
  return (
    <div>
      <PageHeader
        title="مدیریت منابع انسانی"
        description="مدیریت پرسنل و سمت‌های سازمانی"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="personel">
            <Users className="w-4 h-4 ml-1" />
            پرسنل
          </TabsTrigger>
          <TabsTrigger value="orgchart">
            <Building className="w-4 h-4 ml-1" />
            چارت سازمانی
          </TabsTrigger>
        </TabsList>
        <TabsContent value="personel" className="mt-4">
          <PersonelTab />
        </TabsContent>
        <TabsContent value="orgchart" className="mt-4">
          <OrgChartTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PersonelTab() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<Personel[]>([]);
  const [orgCharts, setOrgCharts] = useState<OrgChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Personel | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Personel | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/personel");
    const json = await res.json();
    setData(json);
    const res2 = await fetch("/api/org-chart");
    setOrgCharts(await res2.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fields = [
    { key: "personelId", label: "کد پرسنلی", required: true, placeholder: "مثال: p1" },
    { key: "name", label: "نام و نام خانوادگی", required: true },
    {
      key: "orgChartId",
      label: "سمت سازمانی",
      type: "select" as const,
      options: orgCharts.map((o) => ({ value: o.id, label: `${o.orgId} - ${o.position}` })),
    },
    { key: "phone", label: "تلفن" },
    { key: "email", label: "ایمیل" },
    {
      key: "role",
      label: "نقش سیستم",
      type: "select" as const,
      options: [
        { value: "user", label: "کاربر" },
        { value: "moderator", label: "ناظر" },
        { value: "admin", label: "مدیر" },
      ],
    },
    {
      key: "gender",
      label: "جنسیت",
      type: "select" as const,
      options: [
        { value: "male", label: "مرد" },
        { value: "female", label: "زن" },
      ],
    },
    { key: "monthlySalary", label: "حقوق ماهانه (میلیون تومان)", type: "number" as const },
    { key: "annualSalary", label: "حقوق سالانه (میلیون تومان)", type: "number" as const },
    { key: "monthlySalaryActual", label: "حقوق ماهانه واقعی", type: "number" as const },
    { key: "annualSalaryActual", label: "حقوق سالانه واقعی", type: "number" as const },
    { key: "dailyRate", label: "نرخ روزانه", type: "number" as const },
    { key: "notes", label: "توضیحات", type: "textarea" as const },
  ];

  const columns: Column<Personel>[] = [
    {
      key: "personelId",
      label: "کد",
      render: (r) => <Badge variant="outline" className="font-mono">{r.personelId}</Badge>,
    },
    { key: "name", label: "نام" },
    {
      key: "orgChartPosition",
      label: "سمت",
      render: (r) => r.orgChart?.position || "-",
    },
    {
      key: "orgChartLevel",
      label: "سطح",
      render: (r) =>
        r.orgChart?.level ? (
          <Badge variant="secondary">
            {r.orgChart.level}
          </Badge>
        ) : (
          "-"
        ),
    },
    {
      key: "monthlySalary",
      label: "حقوق ماهانه",
      render: (r) =>
        r.monthlySalary ? (
          <span className="font-num">{r.monthlySalary.toLocaleString("fa-IR")}</span>
        ) : (
          "-"
        ),
    },
    {
      key: "role",
      label: "نقش",
      render: (r) => (
        <Badge variant={r.role === "admin" ? "default" : "secondary"}>
          {r.role === "admin" ? "مدیر" : r.role === "moderator" ? "ناظر" : "کاربر"}
        </Badge>
      ),
    },
    { key: "phone", label: "تلفن", render: (r) => r.phone || "-" },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    if (formData.orgChartId === "") formData.orgChartId = null;
    const url = editing ? `/api/personel/${editing.id}` : "/api/personel";
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
    notifySuccess(editing ? "پرسنل ویرایش شد" : "پرسنل جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/personel/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      notifyError("خطا در حذف");
      return;
    }
    notifySuccess("پرسنل حذف شد");
    setDeleteOpen(false);
    setDeleting(null);
    fetchData();
  };

  return (
    <>
      {canEdit && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4 ml-1" />
            افزودن پرسنل
          </Button>
        </div>
      )}
      <DataTable
        data={data}
        columns={columns}
        title=""
        searchKeys={["personelId", "name", "phone"]}
        onEdit={canEdit ? ((row) => {
          setEditing(row);
          setEditOpen(true);
        }) : undefined}
        onDelete={canEdit ? ((row) => {
          setDeleting(row);
          setDeleteOpen(true);
        }) : undefined}
        pageSize={15}
      />
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.name}` : "افزودن پرسنل"}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف پرسنل"
        message={`آیا از حذف «${deleting?.name}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </>
  );
}

function OrgChartTab() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<OrgChart[]>([]);
  const [templates, setTemplates] = useState<KPITemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<OrgChart | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<OrgChart | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState<OrgChart | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      fetch("/api/org-chart"),
      fetch("/api/kpi-template"),
    ]);
    setData(await r1.json());
    setTemplates(await r2.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fields = [
    { key: "orgId", label: "کد سازمانی", required: true, placeholder: "مثال: ORG-1.1" },
    { key: "position", label: "عنوان سمت", required: true },
    {
      key: "level",
      label: "سطح",
      type: "select" as const,
      options: [
        { value: "حکمرانی", label: "حکمرانی" },
        { value: "مدیریتی", label: "مدیریتی" },
        { value: "عملیاتی", label: "عملیاتی" },
      ],
    },
    {
      key: "parentId",
      label: "سمت والد",
      type: "select" as const,
      options: data.filter((o) => o.id !== editing?.id).map((o) => ({
        value: o.id,
        label: `${o.orgId} - ${o.position}`,
      })),
    },
    { key: "costBreakdownCode", label: "کد هزینه مرتبط" },
    { key: "personResponsibleId", label: "کد پرسنل مسئول" },
  ];

  const columns: Column<OrgChart>[] = [
    {
      key: "orgId",
      label: "کد",
      render: (r) => <Badge variant="outline" className="font-mono">{r.orgId}</Badge>,
    },
    { key: "position", label: "سمت" },
    {
      key: "level",
      label: "سطح",
      render: (r) => <Badge variant="secondary">{r.level}</Badge>,
    },
    {
      key: "personResponsible",
      label: "مسئول",
      render: (r) => r.personResponsible?.name || "-",
    },
    {
      key: "hrTemplate",
      label: "الگوی HR",
      render: (r) => r.hrTemplate ? (
        <Badge variant="default">{r.hrTemplate.positionName}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">متصل نشده</span>
      ),
    },
    {
      key: "personels",
      label: "تعداد پرسنل",
      render: (r) => (r._count?.personels ?? 0).toLocaleString("fa-IR"),
    },
    {
      key: "actions2",
      label: "عملیات HR",
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setLinking(r); setLinkOpen(true); }}
            >
              <Link2 className="w-4 h-4 ml-1" />
              اتصال به الگوی HR
            </Button>
          )}
          <Link href="/personnel-evaluation">
            <Button size="sm" variant="ghost">
              <Eye className="w-4 h-4 ml-1" />
              مشاهده ارزیابی‌ها
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    if (formData.parentId === "") formData.parentId = null;
    if (formData.personResponsibleId === "") formData.personResponsibleId = null;
    const url = editing ? `/api/org-chart/${editing.id}` : "/api/org-chart";
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
    notifySuccess(editing ? "سمت ویرایش شد" : "سمت جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/org-chart/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      notifyError("خطا در حذف");
      return;
    }
    notifySuccess("سمت حذف شد");
    setDeleteOpen(false);
    setDeleting(null);
    fetchData();
  };

  return (
    <>
      {canEdit && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
            }}
          >
            <Plus className="w-4 h-4 ml-1" />
            افزودن سمت
          </Button>
        </div>
      )}
      <DataTable
        data={data}
        columns={columns}
        title=""
        searchKeys={["orgId", "position"]}
        onEdit={canEdit ? ((row) => {
          setEditing(row);
          setEditOpen(true);
        }) : undefined}
        onDelete={canEdit ? ((row) => {
          setDeleting(row);
          setDeleteOpen(true);
        }) : undefined}
        pageSize={20}
      />
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.position}` : "افزودن سمت سازمانی"}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف سمت"
        message={`آیا از حذف «${deleting?.position}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
      <EditDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={`اتصال به الگوی HR: ${linking?.position ?? ""}`}
        description="الگوی HR متناظر با این سمت را انتخاب کنید"
        fields={[
          {
            key: "hrPositionId",
            label: "الگوی HR",
            type: "select" as const,
            options: templates.map((t) => ({
              value: t.positionCode,
              label: `${t.positionCode} - ${t.positionName}`,
            })),
          },
        ]}
        initialData={{ hrPositionId: linking?.hrPositionId ?? "" }}
        onSubmit={async (formData) => {
          if (!linking) return;
          const res = await fetch(`/api/org-chart/${linking.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hrPositionId: formData.hrPositionId || null }),
          });
          if (!res.ok) {
            const e = await res.json();
            throw new Error(e.error || "خطا در ذخیره‌سازی");
          }
          notifySuccess("اتصال الگوی HR ذخیره شد");
          fetchData();
        }}
      />
    </>
  );
}
