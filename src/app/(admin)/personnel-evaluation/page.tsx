"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/data-table";
import { ConfirmDialog, EditDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { formatJalali, formatJalaliDateTime } from "@/lib/jalali";
import { useSession } from "next-auth/react";
import {
  Target,
  ClipboardList,
  BarChart3,
  Link2,
  PlayCircle,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface KPITemplate {
  id: string;
  positionCode: string;
  positionName: string;
  description: string | null;
  _count?: { categories: number; evaluations: number };
  categories?: any[];
}

interface OrgChart {
  id: string;
  orgId: string;
  position: string;
  level: string;
  hrPositionId: string | null;
  personResponsible?: { id: string; name: string } | null;
  hrTemplate?: KPITemplate | null;
}

interface KPIEvaluation {
  id: string;
  period: string;
  periodType: string;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  notes: string | null;
  evaluatedAt: string;
  template?: { positionCode: string; positionName: string } | null;
  personel?: { id: string; name: string } | null;
  orgChart?: { id: string; orgId: string; position: string } | null;
  _count?: { records: number };
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444", "#8b5cf6", "#06b6d4"];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "پیش‌نویس", variant: "secondary" },
  submitted: { label: "ارسال شده", variant: "default" },
  approved: { label: "تایید شده", variant: "outline" },
};

export default function PersonnelEvaluationPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "user";
  const canManage = userRole === "admin" || userRole === "moderator";

  return (
    <div>
      <PageHeader
        title="ارزیابی پرسنل"
        description="ارزیابی دوره‌ای سمت‌های سازمانی بر اساس شاخص‌های HR"
      />
      <Tabs defaultValue="positions">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="positions">
            <Target className="w-4 h-4 ml-1" />
            سمت‌ها
          </TabsTrigger>
          <TabsTrigger value="evaluations">
            <ClipboardList className="w-4 h-4 ml-1" />
            ارزیابی‌ها
          </TabsTrigger>
          <TabsTrigger value="results">
            <BarChart3 className="w-4 h-4 ml-1" />
            نتایج و نمودارها
          </TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="mt-4">
          <PositionsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="evaluations" className="mt-4">
          <EvaluationsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          <ResultsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PositionsTab({ canManage }: { canManage: boolean }) {
  const [orgCharts, setOrgCharts] = useState<OrgChart[]>([]);
  const [templates, setTemplates] = useState<KPITemplate[]>([]);
  const [personel, setPersonel] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState<OrgChart | null>(null);
  const [autoEvalOrg, setAutoEvalOrg] = useState<OrgChart | null>(null);
  const [autoEvalPeriod, setAutoEvalPeriod] = useState("");
  const [autoEvalLoading, setAutoEvalLoading] = useState(false);
  const [evalState, setEvalState] = useState<{
    open: boolean;
    org: OrgChart | null;
    template: KPITemplate | null;
  }>({ open: false, org: null, template: null });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/org-chart"),
        fetch("/api/kpi-template"),
        fetch("/api/personel"),
      ]);
      setOrgCharts(await r1.json());
      setTemplates(await r2.json());
      setPersonel(await r3.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open auto-evaluate dialog for an org chart (requires an HR template to be linked)
  const openAutoEvalDialog = (org: OrgChart) => {
    if (!org.hrPositionId) {
      notifyError("برای این سمت الگوی HR متصل نیست");
      return;
    }
    setAutoEvalOrg(org);
    setAutoEvalPeriod("");
    setAutoEvalLoading(false);
  };

  const runAutoEvaluate = async () => {
    if (!autoEvalOrg || !autoEvalPeriod) {
      notifyError("وارد کردن دوره الزامی است");
      return;
    }
    setAutoEvalLoading(true);
    try {
      const res = await fetch("/api/kpi-evaluation/auto-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgChartId: autoEvalOrg.id,
          period: autoEvalPeriod,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در ارزیابی خودکار");
      }
      const result = await res.json();
      const devPct = result.averageDeviation != null
        ? Math.round(result.averageDeviation * 100).toLocaleString("fa-IR")
        : "۰";
      notifySuccess(`ارزیابی خودکار با میانگین انحراف ${devPct}٪ ثبت شد`);
      setAutoEvalOrg(null);
      fetchData();
    } catch (e: any) {
      notifyError(e.message);
    }
    setAutoEvalLoading(false);
  };

  const linkFields: FormField[] = [
    {
      key: "hrPositionId",
      label: "الگوی HR",
      type: "select",
      options: templates.map((t) => ({
        value: t.positionCode,
        label: `${t.positionCode} - ${t.positionName}`,
      })),
    },
  ];

  const handleLink = async (formData: Record<string, any>) => {
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
  };

  const openEvalDialog = async (org: OrgChart) => {
    if (!org.hrPositionId) {
      notifyError("برای این سمت الگوی HR متصل نیست");
      return;
    }
    const t = templates.find((x) => x.positionCode === org.hrPositionId);
    if (!t) {
      notifyError("الگو یافت نشد");
      return;
    }
    try {
      const res = await fetch(`/api/kpi-template/${t.id}`);
      const full = await res.json();
      setEvalState({ open: true, org, template: full });
    } catch {
      notifyError("خطا در بارگذاری الگو");
    }
  };

  if (loading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سمت‌های سازمانی و الگوی HR</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3">کد</th>
                  <th className="text-right p-3">سمت</th>
                  <th className="text-right p-3">سطح</th>
                  <th className="text-right p-3">مسئول</th>
                  <th className="text-right p-3">الگوی HR</th>
                  {canManage && <th className="text-left p-3">عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {orgCharts.map((o) => (
                  <tr key={o.id} className="border-t hover:bg-muted/30">
                    <td className="p-3"><Badge variant="outline" className="font-mono">{o.orgId}</Badge></td>
                    <td className="p-3 font-medium">{o.position}</td>
                    <td className="p-3"><Badge variant="secondary">{o.level}</Badge></td>
                    <td className="p-3">{o.personResponsible?.name || "-"}</td>
                    <td className="p-3">
                      {o.hrTemplate ? (
                        <Badge variant="default">
                          {o.hrTemplate.positionCode} - {o.hrTemplate.positionName}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">متصل نشده</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setLinking(o); setLinkOpen(true); }}
                          >
                            <Link2 className="w-4 h-4 ml-1" />
                            اتصال به الگوی HR
                          </Button>
                          {o.hrPositionId && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openAutoEvalDialog(o)}
                              >
                                <Sparkles className="w-4 h-4 ml-1" />
                                ارزیابی خودکار بر اساس انحراف
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openEvalDialog(o)}
                              >
                                <PlayCircle className="w-4 h-4 ml-1" />
                                شروع ارزیابی
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {orgCharts.length === 0 && (
                  <tr><td colSpan={canManage ? 6 : 5} className="p-6 text-center text-muted-foreground">سمتی ثبت نشده است</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EditDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={`اتصال به الگوی HR: ${linking?.position ?? ""}`}
        description="الگوی HR متناظر با این سمت را انتخاب کنید"
        fields={linkFields}
        initialData={{ hrPositionId: linking?.hrPositionId ?? "" }}
        onSubmit={handleLink}
      />

      <EvaluationDialog
        open={evalState.open}
        onOpenChange={(open) => setEvalState((s) => ({ ...s, open }))}
        org={evalState.org}
        template={evalState.template}
        personel={personel}
        onDone={fetchData}
      />

      {/* Auto-evaluate (based on plan deviation) dialog */}
      <Dialog open={!!autoEvalOrg} onOpenChange={(o) => { if (!o) setAutoEvalOrg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ارزیابی خودکار بر اساس انحراف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              برای سمت «{autoEvalOrg?.position ?? ""}» یک ارزیابی خودکار ایجاد می‌شود.
              امتیاز هر شاخص بر اساس میانگین انحراف فعالیت‌های WBS مرتبط با این سمت محاسبه
              می‌شود (امتیاز = ۱۰۰ − میانگین انحراف × ۱۰۰).
            </p>
            <div className="space-y-1.5">
              <Label>دوره ارزیابی</Label>
              <Input
                placeholder="مثال: 1405-07"
                value={autoEvalPeriod}
                onChange={(e) => setAutoEvalPeriod(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAutoEvalOrg(null)}
              disabled={autoEvalLoading}
            >
              انصراف
            </Button>
            <Button
              type="button"
              onClick={runAutoEvaluate}
              disabled={autoEvalLoading || !autoEvalPeriod}
            >
              {autoEvalLoading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              <Sparkles className="w-4 h-4 ml-1" />
              اجرای ارزیابی خودکار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EvaluationDialog({
  open,
  onOpenChange,
  org,
  template,
  personel,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  org: OrgChart | null;
  template: KPITemplate | null;
  personel: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [personelId, setPersonelId] = useState("");
  const [notes, setNotes] = useState("");
  const [recordValues, setRecordValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPeriod("");
      setPersonelId("");
      setNotes("");
      setRecordValues({});
    }
  }, [open]);

  const submit = async () => {
    if (!template || !org) return;
    if (!period) {
      notifyError("وارد کردن دوره الزامی است");
      return;
    }
    const records: any[] = [];
    if (template.categories) {
      for (const cat of template.categories) {
        for (const ind of cat.indicators) {
          const v = recordValues[ind.id];
          if (v !== undefined && v !== "") {
            records.push({
              indicatorId: ind.id,
              value: Number(v),
              targetValue: ind.targetValue,
              weight: ind.weight,
            });
          }
        }
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/kpi-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          orgChartId: org.id,
          personelId: personelId || null,
          period,
          periodType: "monthly",
          status: "submitted",
          notes,
          records,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در ثبت");
      }
      notifySuccess("ارزیابی با موفقیت ثبت شد");
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      notifyError(e.message);
    }
    setLoading(false);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>شروع ارزیابی: {org?.position}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>دوره ارزیابی</Label>
              <Input
                placeholder="مثال: 1405-07"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>پرسنل ارزیابی شونده (اختیاری)</Label>
              <Select value={personelId} onValueChange={setPersonelId}>
                <SelectTrigger><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                <SelectContent>
                  {personel.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {template.categories && template.categories.length > 0 ? (
            <div className="space-y-4">
              {template.categories.map((cat: any) => (
                <div key={cat.id} className="border rounded-md p-3">
                  <h4 className="font-medium mb-2">{cat.name}</h4>
                  <div className="space-y-2">
                    {cat.indicators.map((ind: any) => (
                      <div key={ind.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-7 text-sm">
                          <p>{ind.name}</p>
                          {ind.targetValue && (
                            <p className="text-xs text-muted-foreground">
                              هدف: {Number(ind.targetValue).toLocaleString("fa-IR")} {ind.unit || ""}
                              {ind.weight ? ` (وزن: ${ind.weight.toLocaleString("fa-IR")})` : ""}
                            </p>
                          )}
                        </div>
                        <div className="col-span-5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="مقدار کسب شده (۰ تا ۱۰۰)"
                            value={recordValues[ind.id] ?? ""}
                            onChange={(e) =>
                              setRecordValues({ ...recordValues, [ind.id]: e.target.value })
                            }
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">مقدار باید بین ۰ تا ۱۰۰ باشد</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              این الگو شاخصی ندارد. ابتدا شاخص‌ها را تعریف کنید.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>یادداشت</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            ثبت ارزیابی
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvaluationsTab({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<KPIEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<KPIEvaluation | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kpi-evaluation");
      setData(await res.json());
    } catch {
      notifyError("خطا در بارگذاری");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/kpi-evaluation/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("ارزیابی حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  if (loading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ارزیابی‌های ثبت شده ({data.length.toLocaleString("fa-IR")})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3">سمت/الگو</th>
                  <th className="text-right p-3">پرسنل</th>
                  <th className="text-right p-3">دوره</th>
                  <th className="text-right p-3">وضعیت</th>
                  <th className="text-right p-3">امتیاز</th>
                  <th className="text-right p-3">تاریخ</th>
                  {canManage && <th className="text-left p-3">عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((e) => {
                  const ss = statusMap[e.status] || { label: e.status, variant: "secondary" as const };
                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        {e.template ? `${e.template.positionName}` : "-"}
                        {e.orgChart && (
                          <span className="text-xs text-muted-foreground block">{e.orgChart.position}</span>
                        )}
                      </td>
                      <td className="p-3">{e.personel?.name || "-"}</td>
                      <td className="p-3 font-mono">{e.period}</td>
                      <td className="p-3"><Badge variant={ss.variant}>{ss.label}</Badge></td>
                      <td className="p-3">
                        {e.percentageScore != null ? (
                          <Badge variant="default" className="font-num">
                            {Math.round(e.percentageScore).toLocaleString("fa-IR")}%
                          </Badge>
                        ) : "-"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatJalali(e.evaluatedAt)}
                      </td>
                      {canManage && (
                        <td className="p-3 text-left">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => { setDeleting(e); setDeleteOpen(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {data.length === 0 && (
                  <tr><td colSpan={canManage ? 7 : 6} className="p-6 text-center text-muted-foreground">ارزیابی‌ای ثبت نشده است</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف ارزیابی"
        message="آیا از حذف این ارزیابی مطمئن هستید؟"
        onConfirm={handleDelete}
      />
    </>
  );
}

function ResultsTab() {
  const [data, setData] = useState<KPIEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/kpi-evaluation");
        setData(await res.json());
      } catch {
        notifyError("خطا در بارگذاری");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>;
  }

  const byPosition: Record<string, { sum: number; count: number }> = {};
  data.forEach((e) => {
    if (e.percentageScore != null && e.template) {
      const key = e.template.positionName;
      if (!byPosition[key]) byPosition[key] = { sum: 0, count: 0 };
      byPosition[key].sum += e.percentageScore;
      byPosition[key].count++;
    }
  });
  const barData = Object.entries(byPosition).map(([name, v]) => ({
    name,
    score: Math.round(v.sum / v.count),
  }));

  const statusCount: Record<string, number> = {};
  data.forEach((e) => {
    statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  });
  const statusLabels: Record<string, string> = {
    draft: "پیش‌نویس",
    submitted: "ارسال شده",
    approved: "تایید شده",
  };
  const pieData = Object.entries(statusCount).map(([k, v]) => ({
    name: statusLabels[k] || k,
    value: v,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">میانگین امتیاز بر اساس سمت</CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">داده‌ای موجود نیست</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={70} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="score" fill="#10b981" name="امتیاز (%)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزیع وضعیت ارزیابی‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">داده‌ای موجود نیست</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry: any) => `${entry.name}: ${entry.value.toLocaleString("fa-IR")}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
