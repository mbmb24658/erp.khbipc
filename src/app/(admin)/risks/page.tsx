"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { formatJalali, formatJalaliDateTime } from "@/lib/jalali";
import {
  Plus,
  AlertTriangle,
  ListChecks,
  History,
  Flame,
  BookOpen,
  ClipboardCheck,
} from "lucide-react";

interface Risk {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  probability: number | null;
  impact: number | null;
  severity: number | null;
  riskType: string | null;
  dueDate: string | null;
}

interface RiskAction {
  id: string;
  riskId: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedDate: string | null;
  risk?: { code: string; title: string };
  assignedTo?: { personelId: string; name: string } | null;
}

interface RiskHistory {
  id: string;
  riskId: string;
  changeDate: string;
  changeType: string | null;
  oldValue: string | null;
  newValue: string | null;
  notes: string | null;
  risk?: { code: string; title: string };
  changedBy?: { personelId: string; name: string } | null;
}

interface RiskEvaluation {
  id: string;
  riskId: string;
  period: string;
  periodType: string;
  impactCurrent: string | null;
  probabilityCurrent: string | null;
  levelCurrent: string | null;
  impactTarget: string | null;
  probabilityTarget: string | null;
  levelTarget: string | null;
  response: string | null;
  impactType: string;
  physicalProgress: number | null;
  notes: string | null;
  evaluatedAt: string;
  risk?: { code: string; title: string };
  evaluatedBy?: { name: string } | null;
}

function severityVariant(s: number | null): "default" | "secondary" | "destructive" {
  if (s == null) return "secondary";
  if (s >= 15) return "destructive";
  if (s >= 8) return "default";
  return "secondary";
}

function severityLabel(s: number | null): string {
  if (s == null) return "-";
  if (s >= 15) return `بحرانی (${s.toLocaleString("fa-IR")})`;
  if (s >= 8) return `متوسط (${s.toLocaleString("fa-IR")})`;
  return `پایین (${s.toLocaleString("fa-IR")})`;
}

const riskStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "باز", variant: "destructive" },
  mitigated: { label: "تضعیف شده", variant: "default" },
  closed: { label: "بسته شده", variant: "secondary" },
};

const actionStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "در انتظار", variant: "secondary" },
  in_progress: { label: "در حال انجام", variant: "default" },
  completed: { label: "تکمیل شده", variant: "outline" },
};

const levelVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Low: "outline",
  Medium: "secondary",
  High: "default",
  Critical: "destructive",
};

const levelLabel: Record<string, string> = {
  Low: "پایین",
  Medium: "متوسط",
  High: "زیاد",
  Critical: "بحرانی",
};

const riskFields: FormField[] = [
  { key: "code", label: "کد ریسک", required: true, placeholder: "مثال: R-001" },
  { key: "title", label: "عنوان", required: true },
  { key: "category", label: "دسته‌بندی" },
  { key: "riskType", label: "نوع ریسک", type: "select", options: [
    { value: "operational", label: "عملیاتی" },
    { value: "financial", label: "مالی" },
    { value: "strategic", label: "استراتژیک" },
    { value: "technical", label: "فنی" },
  ] },
  { key: "status", label: "وضعیت", type: "select", options: [
    { value: "open", label: "باز" },
    { value: "mitigated", label: "تضعیف شده" },
    { value: "closed", label: "بسته شده" },
  ] },
  { key: "probability", label: "احتمال (1-5)", type: "number", helpText: "عددی بین 1 تا 5" },
  { key: "impact", label: "اثر (1-5)", type: "number", helpText: "عددی بین 1 تا 5" },
  { key: "dueDate", label: "تاریخ سررسید", type: "date" },
  { key: "description", label: "توضیحات", type: "textarea" },
];

const impactOptions = [
  { value: "اساسی", label: "اساسی" },
  { value: "عمده", label: "عمده" },
  { value: "متوسط", label: "متوسط" },
  { value: "جزئی", label: "جزئی" },
  { value: "ناچیز", label: "ناچیز" },
];

const probOptions = [
  { value: "نادر", label: "نادر" },
  { value: "بعید", label: "بعید" },
  { value: "ممکن", label: "ممکن" },
  { value: "محتمل", label: "محتمل" },
  { value: "مکرر", label: "مکرر" },
];

const responseOptions = [
  { value: "اجتناب", label: "اجتناب" },
  { value: "انتقال", label: "انتقال" },
  { value: "کاهش", label: "کاهش" },
  { value: "پذیرش", label: "پذیرش" },
  { value: "بهره برداری", label: "بهره برداری" },
  { value: "اشتراک گذاری", label: "اشتراک گذاری" },
  { value: "افزایش/تقویت", label: "افزایش/تقویت" },
];

export default function RisksPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [risks, setRisks] = useState<Risk[]>([]);
  const [actions, setActions] = useState<RiskAction[]>([]);
  const [histories, setHistories] = useState<RiskHistory[]>([]);
  const [evaluations, setEvaluations] = useState<RiskEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  const [riskEditOpen, setRiskEditOpen] = useState(false);
  const [riskEditing, setRiskEditing] = useState<Risk | null>(null);
  const [riskDeleteOpen, setRiskDeleteOpen] = useState(false);
  const [riskDeleting, setRiskDeleting] = useState<Risk | null>(null);

  const [actEditOpen, setActEditOpen] = useState(false);
  const [actEditing, setActEditing] = useState<RiskAction | null>(null);
  const [actDeleteOpen, setActDeleteOpen] = useState(false);
  const [actDeleting, setActDeleting] = useState<RiskAction | null>(null);

  const [evalEditOpen, setEvalEditOpen] = useState(false);
  const [evalDeleteOpen, setEvalDeleteOpen] = useState(false);
  const [evalDeleting, setEvalDeleting] = useState<RiskEvaluation | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch("/api/risk"),
        fetch("/api/risk-action"),
        fetch("/api/risk-history"),
        fetch("/api/risk-evaluation"),
      ]);
      setRisks(await r1.json());
      setActions(await r2.json());
      setHistories(await r3.json());
      setEvaluations(await r4.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveRisk = async (formData: Record<string, any>) => {
    const url = riskEditing ? `/api/risk/${riskEditing.id}` : "/api/risk";
    const method = riskEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(riskEditing ? "ریسک ویرایش شد" : "ریسک جدید ایجاد شد");
    fetchData();
  };
  const deleteRisk = async () => {
    if (!riskDeleting) return;
    try {
      const res = await fetch(`/api/risk/${riskDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("ریسک حذف شد");
      setRiskDeleteOpen(false);
      setRiskDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const saveAct = async (formData: Record<string, any>) => {
    const url = actEditing ? `/api/risk-action/${actEditing.id}` : "/api/risk-action";
    const method = actEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(actEditing ? "اقدام ویرایش شد" : "اقدام جدید ایجاد شد");
    fetchData();
  };
  const deleteAct = async () => {
    if (!actDeleting) return;
    try {
      const res = await fetch(`/api/risk-action/${actDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("اقدام حذف شد");
      setActDeleteOpen(false);
      setActDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const saveEval = async (formData: Record<string, any>) => {
    const res = await fetch("/api/risk-evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess("ارزیابی ریسک ثبت شد");
    fetchData();
  };
  const deleteEval = async () => {
    if (!evalDeleting) return;
    try {
      const res = await fetch(`/api/risk-evaluation/${evalDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("ارزیابی حذف شد");
      setEvalDeleteOpen(false);
      setEvalDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const riskColumns: Column<Risk>[] = [
    { key: "code", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge> },
    { key: "title", label: "عنوان" },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    {
      key: "status",
      label: "وضعیت",
      render: (r) => {
        const s = riskStatusMap[r.status];
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : r.status;
      },
    },
    { key: "probability", label: "احتمال", render: (r) => r.probability?.toLocaleString("fa-IR") || "-" },
    { key: "impact", label: "اثر", render: (r) => r.impact?.toLocaleString("fa-IR") || "-" },
    {
      key: "severity",
      label: "شدت",
      render: (r) => <Badge variant={severityVariant(r.severity)}>{severityLabel(r.severity)}</Badge>,
    },
  ];

  const actColumns: Column<RiskAction>[] = [
    {
      key: "risk",
      label: "ریسک",
      render: (r) => r.risk
        ? <span><Badge variant="outline" className="font-mono ml-1">{r.risk.code}</Badge>{r.risk.title}</span>
        : "-",
    },
    { key: "title", label: "عنوان اقدام" },
    {
      key: "status",
      label: "وضعیت",
      render: (r) => {
        const s = actionStatusMap[r.status];
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : r.status;
      },
    },
    {
      key: "assignedTo",
      label: "مسئول",
      render: (r) => r.assignedTo?.name || "-",
    },
    {
      key: "dueDate",
      label: "سررسید",
      render: (r) => formatJalali(r.dueDate),
    },
  ];

  const histColumns: Column<RiskHistory>[] = [
    {
      key: "risk",
      label: "ریسک",
      render: (r) => r.risk
        ? <span><Badge variant="outline" className="font-mono ml-1">{r.risk.code}</Badge>{r.risk.title}</span>
        : "-",
    },
    {
      key: "changeDate",
      label: "تاریخ تغییر",
      render: (r) => formatJalaliDateTime(r.changeDate),
    },
    { key: "changeType", label: "نوع تغییر", render: (r) => r.changeType || "-" },
    {
      key: "change",
      label: "تغییر",
      render: (r) => (
        <span className="text-xs">
          <span className="text-muted-foreground">{r.oldValue || "-"}</span>
          {" → "}
          <span className="font-medium">{r.newValue || "-"}</span>
        </span>
      ),
    },
    {
      key: "changedBy",
      label: "تغییر دهنده",
      render: (r) => r.changedBy?.name || "-",
    },
  ];

  const evalColumns: Column<RiskEvaluation>[] = [
    {
      key: "risk",
      label: "ریسک",
      render: (r) => r.risk
        ? <span><Badge variant="outline" className="font-mono ml-1">{r.risk.code}</Badge>{r.risk.title}</span>
        : "-",
    },
    { key: "period", label: "دوره", render: (r) => <span className="font-mono">{r.period}</span> },
    {
      key: "current",
      label: "وضعیت فعلی",
      render: (r) => (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {r.impactCurrent || "-"} / {r.probabilityCurrent || "-"}
          </div>
          {r.levelCurrent && (
            <Badge variant={levelVariant[r.levelCurrent]}>
              {levelLabel[r.levelCurrent]}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "target",
      label: "وضعیت هدف",
      render: (r) => (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {r.impactTarget || "-"} / {r.probabilityTarget || "-"}
          </div>
          {r.levelTarget && (
            <Badge variant={levelVariant[r.levelTarget]}>
              {levelLabel[r.levelTarget]}
            </Badge>
          )}
        </div>
      ),
    },
    { key: "response", label: "پاسخ", render: (r) => r.response || "-" },
    { key: "impactType", label: "نوع اثر", render: (r) => (
      <Badge variant={r.impactType === "مثبت" ? "default" : "destructive"}>{r.impactType}</Badge>
    ) },
    {
      key: "evaluatedAt",
      label: "تاریخ ارزیابی",
      render: (r) => formatJalali(r.evaluatedAt),
    },
  ];

  const riskOptions = risks.map((r) => ({ value: r.id, label: `${r.code} - ${r.title}` }));

  const actFields: FormField[] = [
    { key: "riskId", label: "ریسک", type: "select", required: true, options: riskOptions },
    { key: "title", label: "عنوان اقدام", required: true },
    { key: "status", label: "وضعیت", type: "select", options: [
      { value: "pending", label: "در انتظار" },
      { value: "in_progress", label: "در حال انجام" },
      { value: "completed", label: "تکمیل شده" },
    ] },
    { key: "assignedToId", label: "کد مسئول", placeholder: "شناسه پرسنل (اختیاری)" },
    { key: "dueDate", label: "تاریخ سررسید", type: "date" },
    { key: "description", label: "توضیحات", type: "textarea" },
  ];

  const evalFields: FormField[] = [
    { key: "riskId", label: "ریسک", type: "select", required: true, options: riskOptions },
    { key: "period", label: "دوره", required: true, placeholder: "مثال: 1405-07" },
    {
      key: "impactCurrent",
      label: "اثر فعلی",
      type: "select",
      options: impactOptions,
    },
    {
      key: "probabilityCurrent",
      label: "احتمال فعلی",
      type: "select",
      options: probOptions,
    },
    {
      key: "impactTarget",
      label: "اثر هدف",
      type: "select",
      options: impactOptions,
    },
    {
      key: "probabilityTarget",
      label: "احتمال هدف",
      type: "select",
      options: probOptions,
    },
    {
      key: "response",
      label: "استراتژی پاسخ",
      type: "select",
      options: responseOptions,
    },
    {
      key: "impactType",
      label: "نوع اثر",
      type: "select",
      options: [
        { value: "منفی", label: "منفی" },
        { value: "مثبت", label: "مثبت" },
      ],
    },
    { key: "physicalProgress", label: "پیشرفت فیزیکی (0-1)", type: "number", helpText: "عددی بین 0 تا 1" },
    { key: "notes", label: "یادداشت", type: "textarea" },
  ];

  const criticalCount = risks.filter((r) => (r.severity ?? 0) >= 15).length;
  const openCount = risks.filter((r) => r.status === "open").length;

  return (
    <div>
      <PageHeader
        title="مدیریت ریسک"
        description="شناسایی، ارزیابی و پیگیری ریسک‌های پروژه"
      />

      {/* Navigation buttons to sub-pages */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/risks/heatmap">
          <Button variant="outline">
            <Flame className="w-4 h-4 ml-1" />
            نقشه حرارتی ریسک
          </Button>
        </Link>
        <Link href="/risks/lessons">
          <Button variant="outline">
            <BookOpen className="w-4 h-4 ml-1" />
            درس آموخته‌ها
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{risks.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کل ریسک‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{openCount.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">ریسک‌های باز</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{criticalCount.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">ریسک‌های بحرانی</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="risks">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="risks">ریسک‌ها</TabsTrigger>
          <TabsTrigger value="actions">اقدامات</TabsTrigger>
          <TabsTrigger value="evaluations">
            <ClipboardCheck className="w-4 h-4 ml-1" />
            ارزیابی‌ها
          </TabsTrigger>
          <TabsTrigger value="history">تاریخچه</TabsTrigger>
        </TabsList>

        <TabsContent value="risks" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={risks}
              columns={riskColumns}
              title=""
              searchKeys={["code", "title", "category"]}
              onAdd={canEdit ? (() => { setRiskEditing(null); setRiskEditOpen(true); }) : undefined}
              onEdit={canEdit ? ((row) => { setRiskEditing(row); setRiskEditOpen(true); }) : undefined}
              onDelete={canEdit ? ((row) => { setRiskDeleting(row); setRiskDeleteOpen(true); }) : undefined}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={actions}
              columns={actColumns}
              title=""
              searchKeys={["title", "riskId"]}
              onAdd={canEdit ? (() => { setActEditing(null); setActEditOpen(true); }) : undefined}
              onEdit={canEdit ? ((row) => { setActEditing(row); setActEditOpen(true); }) : undefined}
              onDelete={canEdit ? ((row) => { setActDeleting(row); setActDeleteOpen(true); }) : undefined}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="evaluations" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={evaluations}
              columns={evalColumns}
              title=""
              searchKeys={["period", "riskId"]}
              onAdd={canEdit ? (() => setEvalEditOpen(true)) : undefined}
              onDelete={canEdit ? ((row) => { setEvalDeleting(row); setEvalDeleteOpen(true); }) : undefined}
              pageSize={15}
              addLabel="افزودن ارزیابی"
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={histories}
              columns={histColumns}
              title=""
              searchKeys={["riskId", "changeType"]}
              pageSize={20}
            />
          )}
        </TabsContent>
      </Tabs>

      <EditDialog
        open={riskEditOpen}
        onOpenChange={setRiskEditOpen}
        title={riskEditing ? `ویرایش: ${riskEditing.code}` : "افزودن ریسک جدید"}
        fields={riskFields}
        initialData={riskEditing
          ? { ...riskEditing, dueDate: riskEditing.dueDate ? riskEditing.dueDate.split("T")[0] : "" }
          : { status: "open", probability: 3, impact: 3 }}
        onSubmit={saveRisk}
      />
      <ConfirmDialog
        open={riskDeleteOpen}
        onOpenChange={setRiskDeleteOpen}
        title="حذف ریسک"
        message={`آیا از حذف «${riskDeleting?.title}» مطمئن هستید؟`}
        onConfirm={deleteRisk}
      />

      <EditDialog
        open={actEditOpen}
        onOpenChange={setActEditOpen}
        title={actEditing ? "ویرایش اقدام" : "افزودن اقدام جدید"}
        fields={actFields}
        initialData={actEditing
          ? { ...actEditing, dueDate: actEditing.dueDate ? actEditing.dueDate.split("T")[0] : "" }
          : { status: "pending" }}
        onSubmit={saveAct}
      />
      <ConfirmDialog
        open={actDeleteOpen}
        onOpenChange={setActDeleteOpen}
        title="حذف اقدام"
        message="آیا از حذف این اقدام مطمئن هستید؟"
        onConfirm={deleteAct}
      />

      <EditDialog
        open={evalEditOpen}
        onOpenChange={setEvalEditOpen}
        title="افزودن ارزیابی ریسک"
        description="سنجش ریسک فعلی و هدف، به همراه استراتژی پاسخ"
        fields={evalFields}
        initialData={{ impactType: "منفی", impactCurrent: "متوسط", probabilityCurrent: "ممکن", impactTarget: "جزئی", probabilityTarget: "بعید" }}
        onSubmit={saveEval}
      />
      <ConfirmDialog
        open={evalDeleteOpen}
        onOpenChange={setEvalDeleteOpen}
        title="حذف ارزیابی"
        message="آیا از حذف این ارزیابی مطمئن هستید؟"
        onConfirm={deleteEval}
      />
    </div>
  );
}
