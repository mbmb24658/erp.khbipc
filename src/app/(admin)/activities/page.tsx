"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PageHeader, StatCard } from "@/components/data-table";
import { EditDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Plus,
  Activity as ActivityIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Search,
  List as ListIcon,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";

interface Personel {
  id: string;
  personelId: string;
  name: string;
}

interface Asset {
  id: string;
  assetId: string;
  title: string;
}

interface ActivityPerson {
  id: string;
  personelId: string;
  personel: Personel;
  role: string | null;
}

interface ActivityOrgChart {
  id: string;
  orgChartId: string;
  orgChart: { id: string; orgId: string; position: string };
  role: string | null;
}

interface Activity {
  id: string;
  code: string;
  title: string;
  description: string | null;
  assetId: string | null;
  asset?: { id: string; assetId: string; title: string } | null;
  wbsId: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  urgency: string;
  priority: number;
  status: string;
  progressPct: number;
  hrPlan: string | null;
  hrActual: string | null;
  notes: string | null;
  personAssignments: ActivityPerson[];
  orgAssignments: ActivityOrgChart[];
  _count?: { statusUpdates: number };
}

interface OrgChart {
  id: string;
  orgId: string;
  position: string;
}

const urgencyMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "کم", variant: "secondary" },
  normal: { label: "عادی", variant: "outline" },
  high: { label: "زیاد", variant: "default" },
  urgent: { label: "فوری", variant: "destructive" },
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "در انتظار", variant: "secondary" },
  in_progress: { label: "در حال انجام", variant: "default" },
  completed: { label: "تکمیل شده", variant: "outline" },
  cancelled: { label: "لغو شده", variant: "destructive" },
  on_hold: { label: "متوقف", variant: "secondary" },
};

const statusOptions = [
  { value: "pending", label: "در انتظار (Todo)" },
  { value: "in_progress", label: "در حال انجام (Doing)" },
  { value: "completed", label: "تکمیل شده (Done)" },
  { value: "on_hold", label: "متوقف (On Hold)" },
  { value: "cancelled", label: "لغو شده" },
];

const PIE_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444"];

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
      title={name}
    >
      {name.charAt(0)}
    </div>
  );
}

export default function ActivitiesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<Activity[]>([]);
  const [personel, setPersonel] = useState<Personel[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [orgCharts, setOrgCharts] = useState<OrgChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [a, p, as, oc] = await Promise.all([
        fetch("/api/activity"),
        fetch("/api/personel"),
        fetch("/api/asset"),
        fetch("/api/org-chart"),
      ]);
      setData(await a.json());
      setPersonel(await p.json());
      setAssets(await as.json());
      if (oc.ok) setOrgCharts(await oc.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return data.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !a.code.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (urgencyFilter !== "all" && a.urgency !== urgencyFilter) return false;
      if (personFilter !== "all" && !a.personAssignments.some((p) => p.personelId === personFilter)) return false;
      return true;
    });
  }, [data, search, statusFilter, urgencyFilter, personFilter]);

  const completed = data.filter((a) => a.status === "completed").length;
  const inProgress = data.filter((a) => a.status === "in_progress").length;
  const urgent = data.filter((a) => a.urgency === "urgent").length;

  // Pie chart data — distribution by status
  const statusChartData = useMemo(() => {
    const items = [
      { name: "در انتظار", value: data.filter((a) => a.status === "pending").length, color: PIE_COLORS[0] },
      { name: "در حال انجام", value: data.filter((a) => a.status === "in_progress").length, color: PIE_COLORS[1] },
      { name: "تکمیل شده", value: data.filter((a) => a.status === "completed").length, color: PIE_COLORS[2] },
      { name: "متوقف", value: data.filter((a) => a.status === "on_hold").length, color: PIE_COLORS[3] },
      { name: "لغو شده", value: data.filter((a) => a.status === "cancelled").length, color: PIE_COLORS[4] },
    ];
    return items.filter((d) => d.value > 0);
  }, [data]);

  // Kanban columns
  const todoActivities = useMemo(
    () => filtered.filter((a) => a.status === "pending" || a.status === "on_hold"),
    [filtered]
  );
  const doingActivities = useMemo(
    () => filtered.filter((a) => a.status === "in_progress"),
    [filtered]
  );
  const doneActivities = useMemo(
    () => filtered.filter((a) => a.status === "completed" || a.status === "cancelled"),
    [filtered]
  );

  const getResponsiblePerson = (a: Activity) => {
    return a.personAssignments.find((p) => p.role === "مسئول")?.personel;
  };

  const handleQuickStatusUpdate = async (activityId: string, newStatus: string) => {
    setUpdatingStatus(activityId);
    try {
      const res = await fetch("/api/activity-status-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, newStatus, notes: "" }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در بروزرسانی وضعیت");
      }
      notifySuccess("وضعیت فعالیت بروزرسانی شد");
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در بروزرسانی وضعیت");
    }
    setUpdatingStatus(null);
  };

  const fields: FormField[] = [
    { key: "code", label: "کد فعالیت", required: true, placeholder: "مثال: ACT-001" },
    { key: "title", label: "عنوان", required: true },
    { key: "description", label: "توضیحات", type: "textarea" },
    {
      key: "assetId",
      label: "دارایی مرتبط",
      type: "select",
      options: assets.map((a) => ({ value: a.id, label: `${a.assetId} - ${a.title}` })),
    },
    { key: "wbsId", label: "کد WBS (اختیاری)" },
    { key: "startDate", label: "تاریخ شروع", type: "date" },
    { key: "endDate", label: "تاریخ پایان", type: "date" },
    { key: "durationDays", label: "مدت زمان (روز)", type: "number" },
    {
      key: "urgency",
      label: "فوریت",
      type: "select",
      options: [
        { value: "low", label: "کم" },
        { value: "normal", label: "عادی" },
        { value: "high", label: "زیاد" },
        { value: "urgent", label: "فوری" },
      ],
    },
    { key: "priority", label: "اولویت (1-5)", type: "number", helpText: "عددی بین 1 تا 5" },
    {
      key: "status",
      label: "وضعیت",
      type: "select",
      options: statusOptions,
    },
    { key: "progressPct", label: "درصد پیشرفت (0-100)", type: "number" },
    {
      key: "hrPlan",
      label: "منابع انسانی برنامه (سمت‌ها)",
      type: "multiselect",
      options: orgCharts.map((o) => ({ value: o.id, label: `${o.orgId} - ${o.position}` })),
      helpText: "سمت‌های سازمانی مورد نیاز فعالیت",
    },
    {
      key: "hrActual",
      label: "منابع انسانی واقعی (پرسنل)",
      type: "multiselect",
      options: personel.map((p) => ({ value: p.id, label: `${p.personelId} - ${p.name}` })),
      helpText: "پرسنل واقعی اختصاص یافته به فعالیت",
    },
    {
      key: "responsiblePersonId",
      label: "مسئول فعالیت",
      type: "select",
      options: personel.map((p) => ({ value: p.id, label: `${p.personelId} - ${p.name}` })),
      helpText: "این شخص می‌تواند وضعیت فعالیت را به‌روزرسانی کند",
      required: true,
    },
    { key: "notes", label: "یادداشت", type: "textarea" },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    // Extract responsiblePersonId — not part of activity schema, handled separately
    const { responsiblePersonId, ...activityData } = formData;

    // Convert multiselect arrays to JSON strings before sending to API
    if (Array.isArray(activityData.hrPlan)) {
      activityData.hrPlan = activityData.hrPlan.length > 0 ? JSON.stringify(activityData.hrPlan) : null;
    }
    if (Array.isArray(activityData.hrActual)) {
      activityData.hrActual = activityData.hrActual.length > 0 ? JSON.stringify(activityData.hrActual) : null;
    }

    const url = editing ? `/api/activity/${editing.id}` : "/api/activity";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activityData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    const savedActivity = await res.json();

    // Handle responsible person assignment via /api/activity-person
    if (responsiblePersonId) {
      if (editing) {
        const existingResponsible = editing.personAssignments.find(
          (p) => p.role === "مسئول"
        );
        if (existingResponsible && existingResponsible.personelId !== responsiblePersonId) {
          // Remove old responsible, then assign new
          await fetch(`/api/activity-person?id=${existingResponsible.id}`, { method: "DELETE" });
          await fetch("/api/activity-person", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activityId: savedActivity.id,
              personelId: responsiblePersonId,
              role: "مسئول",
            }),
          });
        } else if (!existingResponsible) {
          // No existing responsible — assign new
          await fetch("/api/activity-person", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activityId: savedActivity.id,
              personelId: responsiblePersonId,
              role: "مسئول",
            }),
          });
        }
      } else {
        // New activity — assign responsible person
        await fetch("/api/activity-person", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityId: savedActivity.id,
            personelId: responsiblePersonId,
            role: "مسئول",
          }),
        });
      }
    }

    notifySuccess(editing ? "فعالیت ویرایش شد" : "فعالیت جدید ایجاد شد");
    fetchData();
  };

  const openEdit = (row: Activity) => {
    setEditing(row);
    setEditOpen(true);
  };

  // Parse JSON-encoded array fields for multiselects
  const parseArrayField = (val: string | null | undefined): string[] => {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const initialForForm = editing
    ? {
        ...editing,
        responsiblePersonId:
          editing.personAssignments.find((p) => p.role === "مسئول")?.personelId || "",
        startDate: editing.startDate ? editing.startDate.split("T")[0] : "",
        endDate: editing.endDate ? editing.endDate.split("T")[0] : "",
        hrPlan: parseArrayField(editing.hrPlan),
        hrActual: parseArrayField(editing.hrActual),
      }
    : { status: "pending", urgency: "normal", priority: 3, progressPct: 0, hrPlan: [], hrActual: [] };

  const renderQuickStatusDropdown = (activity: Activity) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={updatingStatus === activity.id}
            className="gap-1"
          >
            {updatingStatus === activity.id ? "..." : "تغییر وضعیت"}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {statusOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleQuickStatusUpdate(activity.id, opt.value)}
              disabled={opt.value === activity.status}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const renderKanbanCard = (a: Activity) => {
    const us = urgencyMap[a.urgency] || { label: a.urgency, variant: "secondary" as const };
    const responsible = getResponsiblePerson(a);
    return (
      <Card
        key={a.id}
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => router.push(`/activities/${a.id}`)}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Badge variant="outline" className="font-mono text-xs shrink-0">{a.code}</Badge>
            <Badge variant={us.variant} className="text-xs">{us.label}</Badge>
          </div>
          <h4 className="font-medium text-sm leading-snug line-clamp-2">{a.title}</h4>
          {responsible && (
            <div className="flex items-center gap-1.5">
              <Avatar name={responsible.name} />
              <span className="text-xs text-muted-foreground truncate">{responsible.name}</span>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">پیشرفت</span>
              <span className="font-num font-medium">{Math.round(a.progressPct).toLocaleString("fa-IR")}%</span>
            </div>
            <Progress value={a.progressPct} className="h-1.5" />
          </div>
          {canEdit && renderQuickStatusDropdown(a)}
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title="مدیریت فعالیت‌های جاری"
        description="فعالیت‌هایی که به اشخاص حقیقی و سمت‌های سازمانی اساین شده‌اند"
      >
        {canEdit && (
          <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن فعالیت
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="کل فعالیت‌ها"
          value={data.length.toLocaleString("fa-IR")}
          icon={ActivityIcon}
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="در حال انجام"
          value={inProgress.toLocaleString("fa-IR")}
          icon={Clock}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          label="تکمیل شده"
          value={completed.toLocaleString("fa-IR")}
          icon={CheckCircle2}
          color="from-violet-500 to-purple-600"
        />
        <StatCard
          label="فوری"
          value={urgent.toLocaleString("fa-IR")}
          icon={AlertCircle}
          color="from-rose-500 to-red-600"
        />
      </div>

      {/* Status overview pie chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>توزیع فعالیت‌ها بر اساس وضعیت</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              داده‌ای موجود نیست
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    innerRadius={40}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ value }: { value?: number }) =>
                      value ? value.toLocaleString("fa-IR") : ""
                    }
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const total = data.length;
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                      return [`${value.toLocaleString("fa-IR")} (${pct}%)`, name];
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">جستجو</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="عنوان یا کد..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">وضعیت</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="pending">در انتظار (Todo)</SelectItem>
                  <SelectItem value="in_progress">در حال انجام (Doing)</SelectItem>
                  <SelectItem value="completed">تکمیل شده (Done)</SelectItem>
                  <SelectItem value="on_hold">متوقف (On Hold)</SelectItem>
                  <SelectItem value="cancelled">لغو شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">فوریت</Label>
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="low">کم</SelectItem>
                  <SelectItem value="normal">عادی</SelectItem>
                  <SelectItem value="high">زیاد</SelectItem>
                  <SelectItem value="urgent">فوری</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">پرسنل تخصیص‌یافته</Label>
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger><SelectValue placeholder="همه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {personel.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          فعالیت‌ها ({filtered.length.toLocaleString("fa-IR")})
        </h2>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as "list" | "kanban"); }}
          variant="outline"
        >
          <ToggleGroupItem value="list" aria-label="نمای لیست">
            <ListIcon className="w-4 h-4 ml-1" />
            لیست
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban" aria-label="نمای کانبان">
            <LayoutGrid className="w-4 h-4 ml-1" />
            کانبان
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">موردی یافت نشد</CardContent></Card>
      ) : view === "list" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const us = urgencyMap[a.urgency] || { label: a.urgency, variant: "secondary" as const };
            const ss = statusMap[a.status] || { label: a.status, variant: "secondary" as const };
            return (
              <Card
                key={a.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/activities/${a.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono shrink-0">{a.code}</Badge>
                      <Badge variant={us.variant}>{us.label}</Badge>
                    </div>
                    <Badge variant={ss.variant}>{ss.label}</Badge>
                  </div>
                  <h3 className="font-semibold leading-snug">{a.title}</h3>
                  {a.asset && (
                    <div className="text-xs text-muted-foreground">
                      دارایی: <span className="font-medium text-foreground">{a.asset.assetId} - {a.asset.title}</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">پیشرفت</span>
                      <span className="font-num font-medium">{Math.round(a.progressPct).toLocaleString("fa-IR")}%</span>
                    </div>
                    <Progress value={a.progressPct} className="h-2" />
                  </div>
                  {a.personAssignments.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground ml-1">مسئولین:</span>
                      {a.personAssignments.slice(0, 5).map((p) => (
                        <Avatar key={p.id} name={p.personel.name} />
                      ))}
                      {a.personAssignments.length > 5 && (
                        <span className="text-xs text-muted-foreground">+{(a.personAssignments.length - 5).toLocaleString("fa-IR")}</span>
                      )}
                    </div>
                  )}
                  {a.orgAssignments.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground ml-1">سمت‌ها:</span>
                      {a.orgAssignments.map((o) => (
                        <Badge key={o.id} variant="secondary" className="text-xs">
                          {o.orgChart.position}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {a.startDate ? new Date(a.startDate).toLocaleDateString("fa-IR") : "-"}
                      {a.endDate ? ` تا ${new Date(a.endDate).toLocaleDateString("fa-IR")}` : ""}
                    </span>
                    {a.durationDays != null && (
                      <span className="font-num">{a.durationDays.toLocaleString("fa-IR")} روز</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center gap-2 pt-1">
                    {canEdit ? renderQuickStatusDropdown(a) : <span />}
                    <div className="flex gap-2">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                        >
                          ویرایش
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); router.push(`/activities/${a.id}`); }}
                      >
                        مشاهده جزئیات
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Kanban view */
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {/* Todo column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-2">
              <h3 className="font-semibold text-amber-700 dark:text-amber-400">در انتظار (Todo)</h3>
              <Badge variant="secondary">{todoActivities.length.toLocaleString("fa-IR")}</Badge>
            </div>
            <div className="space-y-3 min-h-[200px]">
              {todoActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">موردی یافت نشد</p>
              ) : (
                todoActivities.map(renderKanbanCard)
              )}
            </div>
          </div>

          {/* Doing column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-4 py-2">
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">در حال انجام (Doing)</h3>
              <Badge variant="secondary">{doingActivities.length.toLocaleString("fa-IR")}</Badge>
            </div>
            <div className="space-y-3 min-h-[200px]">
              {doingActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">موردی یافت نشد</p>
              ) : (
                doingActivities.map(renderKanbanCard)
              )}
            </div>
          </div>

          {/* Done column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-2">
              <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">تکمیل شده (Done)</h3>
              <Badge variant="secondary">{doneActivities.length.toLocaleString("fa-IR")}</Badge>
            </div>
            <div className="space-y-3 min-h-[200px]">
              {doneActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">موردی یافت نشد</p>
              ) : (
                doneActivities.map(renderKanbanCard)
              )}
            </div>
          </div>
        </div>
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.code}` : "افزودن فعالیت جدید"}
        description="اطلاعات فعالیت را تکمیل کنید"
        fields={fields}
        initialData={initialForForm}
        onSubmit={handleSave}
      />
    </div>
  );
}
