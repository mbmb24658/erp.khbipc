"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { formatJalali, formatJalaliDateTime } from "@/lib/jalali";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  ListChecks,
  History,
  Flame,
  BookOpen,
  ClipboardCheck,
  TrendingUp,
  ArrowLeft,
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

// Heat map level → numeric value for gauge computation
const levelToValue: Record<string, number> = {
  Low: 25,
  Medium: 50,
  High: 75,
  Critical: 100,
};

const heatmapLegend: { label: string; color: string; desc: string; value: string }[] = [
  { label: "Low — پایین", color: "bg-emerald-500", desc: "ریسک کم", value: "۲۵" },
  { label: "Medium — متوسط", color: "bg-amber-500", desc: "ریسک متوسط", value: "۵۰" },
  { label: "High — زیاد", color: "bg-orange-500", desc: "ریسک زیاد", value: "۷۵" },
  { label: "Critical — بحرانی", color: "bg-red-500", desc: "ریسک بحرانی", value: "۱۰۰" },
];

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

const lessonCategoryMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "ریسک": { label: "ریسک", variant: "destructive" },
  "فرصت": { label: "فرصت", variant: "default" },
  "عملیات": { label: "عملیات", variant: "secondary" },
  "استراتژی": { label: "استراتژی", variant: "outline" },
};

const lessonImpactMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "مثبت": { label: "مثبت", variant: "default" },
  "منفی": { label: "منفی", variant: "destructive" },
};

const lessonFields: FormField[] = [
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

// ============================================================
// Gauge chart — half-circle gauge with two concentric arcs
// Outer arc = وضعیت هدف (target), Inner arc = وضعیت فعلی (current)
// ============================================================
function GaugeChart({
  title,
  subtitle,
  currentValue,
  targetValue,
  currentColor,
  targetColor,
  icon,
  count,
}: {
  title: string;
  subtitle?: string;
  currentValue: number;
  targetValue: number;
  currentColor: string;
  targetColor: string;
  icon: React.ReactNode;
  count: number;
}) {
  // First item is the outer ring (target), second is inner (current)
  const data = [
    { name: "هدف", value: targetValue, fill: targetColor },
    { name: "فعلی", value: currentValue, fill: currentColor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          <div>
            <div>{title}</div>
            {subtitle && <div className="text-xs font-normal text-muted-foreground">{subtitle}</div>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative w-full" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="100%"
              innerRadius="30%"
              outerRadius="100%"
              barSize={28}
              data={data}
              startAngle={180}
              endAngle={0}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={14}
                background={{ fill: "#f1f5f9" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          {/* Center value display */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 pointer-events-none">
            <span className="text-5xl font-bold leading-none" style={{ color: currentColor }}>
              {currentValue.toFixed(0)}
            </span>
            <span className="text-sm text-muted-foreground mt-1">از ۱۰۰</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-3 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: currentColor }} />
            <span>وضعیت فعلی: <span className="font-bold">{currentValue.toFixed(0)}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: targetColor }} />
            <span>وضعیت هدف: <span className="font-bold">{targetValue.toFixed(0)}</span></span>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground mt-2">
          تعداد ریسک ارزیابی شده: {count.toLocaleString("fa-IR")}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RisksPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [risks, setRisks] = useState<Risk[]>([]);
  const [histories, setHistories] = useState<RiskHistory[]>([]);
  const [evaluations, setEvaluations] = useState<RiskEvaluation[]>([]);
  const [lessons, setLessons] = useState<LessonLearned[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonsLoading, setLessonsLoading] = useState(true);

  const [riskEditOpen, setRiskEditOpen] = useState(false);
  const [riskEditing, setRiskEditing] = useState<Risk | null>(null);
  const [riskDeleteOpen, setRiskDeleteOpen] = useState(false);
  const [riskDeleting, setRiskDeleting] = useState<Risk | null>(null);

  const [evalEditOpen, setEvalEditOpen] = useState(false);
  const [evalDeleteOpen, setEvalDeleteOpen] = useState(false);
  const [evalDeleting, setEvalDeleting] = useState<RiskEvaluation | null>(null);

  const [lessonEditOpen, setLessonEditOpen] = useState(false);
  const [lessonEditing, setLessonEditing] = useState<LessonLearned | null>(null);
  const [lessonDeleteOpen, setLessonDeleteOpen] = useState(false);
  const [lessonDeleting, setLessonDeleting] = useState<LessonLearned | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/risk"),
        fetch("/api/risk-history"),
        fetch("/api/risk-evaluation"),
      ]);
      setRisks(await r1.json());
      setHistories(await r2.json());
      setEvaluations(await r3.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  const fetchLessons = async () => {
    setLessonsLoading(true);
    try {
      const res = await fetch("/api/lesson-learned");
      setLessons(await res.json());
    } catch {
      notifyError("خطا در بارگذاری درس آموخته‌ها");
    }
    setLessonsLoading(false);
  };

  useEffect(() => {
    fetchData();
    fetchLessons();
  }, []);

  // Compute gauge averages: latest evaluation per risk, grouped by impactType
  const gaugeData = useMemo(() => {
    const latestByRisk = new Map<string, RiskEvaluation>();
    for (const ev of evaluations) {
      const existing = latestByRisk.get(ev.riskId);
      if (!existing || new Date(ev.evaluatedAt) > new Date(existing.evaluatedAt)) {
        latestByRisk.set(ev.riskId, ev);
      }
    }
    const latestEvals = Array.from(latestByRisk.values());

    const computeAvg = (
      type: string,
      field: "levelCurrent" | "levelTarget",
    ) => {
      const filtered = latestEvals.filter((e) => e.impactType === type);
      if (filtered.length === 0) return 0;
      const sum = filtered.reduce((acc, e) => {
        const v = e[field] ? levelToValue[e[field]!] : 0;
        return acc + v;
      }, 0);
      return sum / filtered.length;
    };

    const positiveEvals = latestEvals.filter((e) => e.impactType === "مثبت");
    const negativeEvals = latestEvals.filter((e) => e.impactType === "منفی");

    return {
      positive: {
        current: computeAvg("مثبت", "levelCurrent"),
        target: computeAvg("مثبت", "levelTarget"),
        count: positiveEvals.length,
      },
      negative: {
        current: computeAvg("منفی", "levelCurrent"),
        target: computeAvg("منفی", "levelTarget"),
        count: negativeEvals.length,
      },
    };
  }, [evaluations]);

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

  const saveLesson = async (formData: Record<string, any>) => {
    const url = lessonEditing ? `/api/lesson-learned/${lessonEditing.id}` : "/api/lesson-learned";
    const method = lessonEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(lessonEditing ? "درس آموخته ویرایش شد" : "درس آموخته جدید ثبت شد");
    fetchLessons();
  };
  const deleteLesson = async () => {
    if (!lessonDeleting) return;
    try {
      const res = await fetch(`/api/lesson-learned/${lessonDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("درس آموخته حذف شد");
      setLessonDeleteOpen(false);
      setLessonDeleting(null);
      fetchLessons();
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

  const lessonColumns: Column<LessonLearned>[] = [
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
        const c = r.category ? lessonCategoryMap[r.category] : null;
        return c ? <Badge variant={c.variant}>{c.label}</Badge> : "-";
      },
    },
    {
      key: "impact",
      label: "اثر",
      render: (r) => {
        const i = r.impact ? lessonImpactMap[r.impact] : null;
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

  const riskOptions = risks.map((r) => ({ value: r.id, label: `${r.code} - ${r.title}` }));

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

      <Tabs defaultValue="dashboard">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="dashboard">داشبورد ریسک</TabsTrigger>
          <TabsTrigger value="risks">ریسک‌ها</TabsTrigger>
          <TabsTrigger value="evaluations">
            <ClipboardCheck className="w-4 h-4 ml-1" />
            ارزیابی‌ها
          </TabsTrigger>
          <TabsTrigger value="history">تاریخچه</TabsTrigger>
          <TabsTrigger value="lessons">
            <BookOpen className="w-4 h-4 ml-1" />
            درس آموخته‌ها
          </TabsTrigger>
        </TabsList>

        {/* ============= Tab 1: Dashboard (gauges + heat map links) ============= */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold mb-1">سنجه میانگین ریسک</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  میانگین سطح ریسک بر اساس آخرین ارزیابی هر ریسک. مقیاس ۰ تا ۱۰۰
                  (پایین = ۲۵، متوسط = ۵۰، زیاد = ۷۵، بحرانی = ۱۰۰).
                  قوس بیرونی «وضعیت هدف» و قوس درونی «وضعیت فعلی» را نشان می‌دهد.
                </p>
                <div className="grid gap-6 md:grid-cols-2">
                  <GaugeChart
                    title="ریسک‌های مثبت (فرصت‌ها)"
                    subtitle="میانگین ارزیابی ریسک‌های با اثر مثبت"
                    currentValue={gaugeData.positive.current}
                    targetValue={gaugeData.positive.target}
                    currentColor="#16a34a"
                    targetColor="#86efac"
                    icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                    count={gaugeData.positive.count}
                  />
                  <GaugeChart
                    title="ریسک‌های منفی"
                    subtitle="میانگین ارزیابی ریسک‌های با اثر منفی"
                    currentValue={gaugeData.negative.current}
                    targetValue={gaugeData.negative.target}
                    currentColor="#dc2626"
                    targetColor="#fca5a5"
                    icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
                    count={gaugeData.negative.count}
                  />
                </div>
              </div>

              {/* Heat map link card */}
              <div>
                <h2 className="text-lg font-semibold mb-3">نقشه حرارتی ریسک</h2>
                <Link href="/risks/heatmap">
                  <Card className="hover:border-primary transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shrink-0">
                        <Flame className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">مشاهده نقشه حرارتی ریسک</p>
                        <p className="text-xs text-muted-foreground">
                          ماتریس ۵×۵ اثر و احتمال — وضعیت فعلی و هدف
                        </p>
                      </div>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              </div>

              {/* Legend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">راهنمای رنگ‌ها</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {heatmapLegend.map((l) => (
                      <div key={l.label} className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded ${l.color}`} />
                        <div>
                          <p className="text-sm font-medium">{l.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.desc} — مقدار {l.value}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ============= Tab 2: Risks ============= */}
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

        {/* ============= Tab 3: Evaluations ============= */}
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

        {/* ============= Tab 4: History ============= */}
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

        {/* ============= Tab 5: Lessons ============= */}
        <TabsContent value="lessons" className="mt-4">
          {lessonsLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={lessons}
              columns={lessonColumns}
              title=""
              searchKeys={["title", "description"]}
              onAdd={canEdit ? (() => { setLessonEditing(null); setLessonEditOpen(true); }) : undefined}
              onEdit={canEdit ? ((row) => { setLessonEditing(row); setLessonEditOpen(true); }) : undefined}
              onDelete={canEdit ? ((row) => { setLessonDeleting(row); setLessonDeleteOpen(true); }) : undefined}
              pageSize={15}
              addLabel="افزودن درس آموخته"
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

      <EditDialog
        open={lessonEditOpen}
        onOpenChange={setLessonEditOpen}
        title={lessonEditing ? `ویرایش: ${lessonEditing.title}` : "افزودن درس آموخته جدید"}
        fields={lessonFields}
        initialData={lessonEditing || { category: "ریسک", impact: "منفی" }}
        onSubmit={saveLesson}
      />
      <ConfirmDialog
        open={lessonDeleteOpen}
        onOpenChange={setLessonDeleteOpen}
        title="حذف درس آموخته"
        message={`آیا از حذف «${lessonDeleting?.title}» مطمئن هستید؟`}
        onConfirm={deleteLesson}
      />
    </div>
  );
}
