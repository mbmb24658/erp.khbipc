"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  Plus,
  Network,
  ChevronLeft,
  ChevronDown,
  Filter,
  TreePine,
  List,
  Pencil,
  FolderInput,
  Trash2,
  Loader2,
} from "lucide-react";

interface WBS {
  id: string;
  wbsCode: string;
  title: string;
  parentId: string | null;
  parent?: WBS;
  level: number;
  hierarchyPath: string;
  durationDays: number;
  progressPlan: number;
  progressActual: number;
  startDate: string | null;
  finishDate: string | null;
  startDateJalali: string | null;
  finishDateJalali: string | null;
  hrPlan: string | null;
  hrActual: string | null;
  actualCost: number | null;
  costVariance: number | null;
  scheduleVariance: number | null;
  dayComplete: number | null;
  description: string | null;
  _count?: { children: number; personels: number };
}

const fields = [
  { key: "wbsCode", label: "کد WBS", required: true, placeholder: "مثال: 1.2.1.1", helpText: "کد یکتای فعالیت" },
  { key: "title", label: "عنوان فعالیت", required: true },
  { key: "level", label: "سطح", type: "number" as const, required: true, placeholder: "1", helpText: "هنگام تغییر والد، سطح به‌طور خودکار محاسبه می‌شود. در صورت نیاز می‌توانید سطح را دستی تنظیم کنید." },
  { key: "parentId", label: "کد والد", type: "select" as const, options: [] as any, placeholder: "انتخاب والد" },
  { key: "requiredOrgPositionId", label: "سمت سازمانی مورد نیاز", type: "select" as const, options: [] as any, helpText: "سمت سازمانی که باید این فعالیت را انجام دهد" },
  { key: "durationDays", label: "مدت (روز)", type: "number" as const },
  { key: "progressPlan", label: "پیشرفت برنامه‌ریزی شده (%)", type: "number" as const, placeholder: "0-100" },
  { key: "progressActual", label: "پیشرفت واقعی (%)", type: "number" as const, placeholder: "0-100" },
  { key: "startDate", label: "تاریخ شروع", type: "date" as const },
  { key: "finishDate", label: "تاریخ پایان", type: "date" as const },
  { key: "hrPlan", label: "منابع انسانی برنامه (سمت‌ها)", type: "multiselect" as const, options: [] as any, helpText: "سمت‌های سازمانی مورد نیاز فعالیت" },
  { key: "hrActual", label: "منابع انسانی واقعی (پرسنل)", type: "multiselect" as const, options: [] as any, helpText: "پرسنل واقعی اختصاص یافته به فعالیت" },
  { key: "actualCost", label: "هزینه واقعی (میلیون تومان)", type: "number" as const },
  { key: "costVariance", label: "انحراف هزینه", type: "number" as const },
  { key: "scheduleVariance", label: "انحراف زمانی", type: "number" as const },
  { key: "description", label: "توضیحات", type: "textarea" as const },
];

// Helper: collect all descendant ids of a WBS (to prevent cycle creation when moving)
function getDescendantIds(wbsId: string, allWbs: WBS[]): Set<string> {
  const ids = new Set<string>();
  const queue = [wbsId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allWbs.filter((w) => w.parentId === current);
    for (const child of children) {
      ids.add(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

export default function WBSPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role !== "user";
  const [data, setData] = useState<WBS[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<WBS | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<WBS | null>(null);
  const [allWbs, setAllWbs] = useState<WBS[]>([]);
  const [orgCharts, setOrgCharts] = useState<any[]>([]);
  const [personels, setPersonels] = useState<any[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState<WBS | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [moveLoading, setMoveLoading] = useState(false);
  // Presets for "add child" flow — pre-fill parentId + level in the EditDialog
  const [presetParentId, setPresetParentId] = useState<string | null>(null);
  const [presetLevel, setPresetLevel] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resWbs, resOrg, resPersonel] = await Promise.all([
        fetch("/api/wbs"),
        fetch("/api/org-chart"),
        fetch("/api/personel"),
      ]);
      const json = await resWbs.json();
      setData(json);
      setAllWbs(json);
      if (resOrg.ok) setOrgCharts(await resOrg.json());
      if (resPersonel.ok) setPersonels(await resPersonel.json());
      // Auto-expand top 2 levels
      const top = json.filter((w: WBS) => w.level <= 2).map((w: WBS) => w.id);
      setExpanded(new Set(top));
    } catch (e) {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Tree view building
  const tree = useMemo(() => {
    const byParent: Record<string, WBS[]> = {};
    data.forEach((w) => {
      const p = w.parentId || "root";
      if (!byParent[p]) byParent[p] = [];
      byParent[p].push(w);
    });
    return byParent;
  }, [data]);

  const filtered = useMemo(() => {
    if (!search && !levelFilter) return data;
    return data.filter((w) => {
      if (levelFilter && w.level !== levelFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          w.wbsCode.toLowerCase().includes(q) ||
          w.title.toLowerCase().includes(q) ||
          (w.hrPlan || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, levelFilter]);

  const renderTree = (parentId: string | null, depth: number = 0): React.ReactNode => {
    const items = tree[parentId || "root"] || [];
    if (items.length === 0) return null;
    return items.map((w) => {
      const hasChildren = (tree[w.id] || []).length > 0;
      const isExpanded = expanded.has(w.id);
      // Look up parent WBS code from allWbs (list API does not include `parent`)
      const parentWbs = w.parentId ? allWbs.find((p) => p.id === w.parentId) : null;
      return (
        <div key={w.id}>
          <div
            className="flex items-center gap-2 px-2 py-2 hover:bg-muted/50 rounded-md cursor-pointer border-b border-border/50"
            style={{ paddingRight: `${depth * 24 + 8}px` }}
            onClick={() => router.push(`/wbs/${w.id}`)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) {
                  const next = new Set(expanded);
                  if (isExpanded) next.delete(w.id);
                  else next.add(w.id);
                  setExpanded(next);
                }
              }}
              className="w-5 h-5 flex items-center justify-center hover:bg-muted rounded"
              disabled={!hasChildren}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />
              ) : null}
            </button>
            <Badge variant="outline" className="font-mono text-xs shrink-0">
              {w.wbsCode}
            </Badge>
            <span className="text-sm font-medium truncate flex-1">{w.title}</span>
            {parentWbs && (
              <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                (والد: {parentWbs.wbsCode})
              </span>
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              سطح: {w.level.toLocaleString("fa-IR")}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
              مدت: {w.durationDays.toLocaleString("fa-IR")} روز
            </span>
            {/* Row action buttons */}
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="افزودن زیرفعالیت"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAddChild(w);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="ویرایش"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(w);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="انتقال به والد جدید"
                  disabled={w.level === 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMove(w);
                  }}
                >
                  <FolderInput className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="حذف"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(w);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <Badge
              variant={w.progressActual >= 1 ? "default" : "secondary"}
              className="shrink-0 font-num text-xs"
            >
              {Math.round(w.progressActual * 100).toLocaleString("fa-IR")}%
            </Badge>
          </div>
          {isExpanded && renderTree(w.id, depth + 1)}
        </div>
      );
    });
  };

  const columns: Column<WBS>[] = [
    {
      key: "wbsCode",
      label: "کد",
      render: (r) => <Badge variant="outline" className="font-mono">{r.wbsCode}</Badge>,
    },
    { key: "title", label: "عنوان" },
    {
      key: "level",
      label: "سطح",
      render: (r) => r.level.toLocaleString("fa-IR"),
    },
    {
      key: "durationDays",
      label: "مدت (روز)",
      render: (r) => r.durationDays.toLocaleString("fa-IR"),
    },
    {
      key: "progressPlan",
      label: "پیشرفت برنامه",
      render: (r) => (
        <span className="font-num">{Math.round(r.progressPlan * 100).toLocaleString("fa-IR")}%</span>
      ),
    },
    {
      key: "progressActual",
      label: "پیشرفت واقعی",
      render: (r) => (
        <Badge variant={r.progressActual >= r.progressPlan ? "default" : "destructive"} className="font-num">
          {Math.round(r.progressActual * 100).toLocaleString("fa-IR")}%
        </Badge>
      ),
    },
    {
      key: "startDate",
      label: "شروع",
      render: (r) => r.startDate ? new Date(r.startDate).toLocaleDateString("fa-IR") : "-",
    },
    {
      key: "finishDate",
      label: "پایان",
      render: (r) => r.finishDate ? new Date(r.finishDate).toLocaleDateString("fa-IR") : "-",
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    // Convert percent (0-100) to decimal (0-1)
    if (formData.progressPlan !== null) formData.progressPlan = formData.progressPlan / 100;
    if (formData.progressActual !== null) formData.progressActual = formData.progressActual / 100;
    if (formData.parentId === "") formData.parentId = null;

    // Convert multiselect arrays to JSON strings before sending to API
    if (Array.isArray(formData.hrPlan)) {
      formData.hrPlan = formData.hrPlan.length > 0 ? JSON.stringify(formData.hrPlan) : null;
    }
    if (Array.isArray(formData.hrActual)) {
      formData.hrActual = formData.hrActual.length > 0 ? JSON.stringify(formData.hrActual) : null;
    }

    const url = editing ? `/api/wbs/${editing.id}` : "/api/wbs";
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
    notifySuccess(editing ? "فعالیت ویرایش شد" : "فعالیت جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/wbs/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("فعالیت حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setPresetParentId(null);
    setPresetLevel(null);
    setEditOpen(true);
  };

  const openEdit = (row: WBS) => {
    setEditing(row);
    setPresetParentId(null);
    setPresetLevel(null);
    setEditOpen(true);
  };

  // Open the edit dialog pre-filled to add a child under the given row
  const openAddChild = (row: WBS) => {
    setEditing(null);
    setPresetParentId(row.id);
    setPresetLevel(row.level + 1);
    setEditOpen(true);
  };

  // Open the move dialog for the given row
  const openMove = (row: WBS) => {
    setMoving(row);
    setMoveTargetId("");
    setMoveOpen(true);
  };

  // Save the new parent for the WBS being moved
  const handleMove = async () => {
    if (!moving || !moveTargetId) return;
    setMoveLoading(true);
    try {
      const res = await fetch(`/api/wbs/${moving.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: moveTargetId }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در انتقال فعالیت");
      }
      notifySuccess("فعالیت به والد جدید منتقل شد");
      setMoveOpen(false);
      setMoving(null);
      setMoveTargetId("");
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در انتقال فعالیت");
    } finally {
      setMoveLoading(false);
    }
  };

  // Fields with parent options + org position options + multiselect options
  const fieldsWithParents = fields.map((f) =>
    f.key === "parentId"
      ? {
          ...f,
          options: allWbs
            .filter((w) => w.id !== editing?.id)
            .map((w) => ({ value: w.id, label: `${w.wbsCode} - ${w.title}` })),
        }
      : f.key === "requiredOrgPositionId"
      ? {
          ...f,
          options: orgCharts.map((o: any) => ({
            value: o.id,
            label: `${o.orgId} - ${o.position}`,
          })),
        }
      : f.key === "hrPlan"
      ? {
          ...f,
          options: orgCharts.map((o: any) => ({
            value: o.id,
            label: `${o.orgId} - ${o.position}`,
          })),
        }
      : f.key === "hrActual"
      ? {
          ...f,
          options: personels.map((p: any) => ({
            value: p.id,
            label: `${p.personelId} - ${p.name}`,
          })),
        }
      : f.key === "progressPlan" || f.key === "progressActual"
      ? {
          ...f,
          // Display as 0-100
          helpText: "مقدار را به صورت درصد وارد کنید (0 تا 100)",
        }
      : f
  );

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

  // Convert initial data for editing (percent 0-1 to 0-100)
  const initialForForm = editing
    ? {
        ...editing,
        progressPlan: Math.round(editing.progressPlan * 100),
        progressActual: Math.round(editing.progressActual * 100),
        startDate: editing.startDate ? editing.startDate.split("T")[0] : "",
        finishDate: editing.finishDate ? editing.finishDate.split("T")[0] : "",
        hrPlan: parseArrayField(editing.hrPlan),
        hrActual: parseArrayField(editing.hrActual),
      }
    : {
        level: presetLevel ?? 1,
        parentId: presetParentId ?? "",
        durationDays: 0,
        progressPlan: 0,
        progressActual: 0,
        hrPlan: [],
        hrActual: [],
      };

  return (
    <div>
      <PageHeader
        title="ساختار شکست کار (WBS)"
        description={`${data.length.toLocaleString("fa-IR")} فعالیت ثبت شده است`}
      >
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 ml-1" />
            افزودن فعالیت
          </Button>
        )}
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{data.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کل فعالیت‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <TreePine className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {data.filter((w) => w.level === 1).length.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">سطح ۱ (چشم‌انداز)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Filter className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {new Set(data.map((w) => w.level)).size.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">سطوح مختلف</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <List className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {data.filter((w) => w._count?.children === 0).length.toLocaleString("fa-IR")}
              </p>
              <p className="text-xs text-muted-foreground">فعالیت‌های پایه</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View toggle + filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <Button
            size="sm"
            variant={view === "tree" ? "default" : "ghost"}
            onClick={() => setView("tree")}
          >
            <TreePine className="w-4 h-4 ml-1" />
            درختی
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
          >
            <List className="w-4 h-4 ml-1" />
            لیستی
          </Button>
        </div>
        <Input
          placeholder="جستجو بر اساس کد یا عنوان..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={levelFilter ?? ""}
          onChange={(e) => setLevelFilter(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 border rounded-md text-sm bg-background"
        >
          <option value="">همه سطوح</option>
          {[1, 2, 3, 4, 5, 6, 7].map((l) => (
            <option key={l} value={l}>سطح {l.toLocaleString("fa-IR")}</option>
          ))}
        </select>
      </div>

      {view === "tree" ? (
        <Card>
          <CardContent className="p-2">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">موردی یافت نشد</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
                {renderTree(null)}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          title=""
          searchKeys={["wbsCode", "title", "hrPlan"]}
          onView={(row) => router.push(`/wbs/${row.id}`)}
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
        title={editing ? `ویرایش: ${editing.wbsCode}` : "افزودن فعالیت جدید"}
        description="برای ذخیره، اطلاعات فعالیت را تکمیل کنید"
        fields={fieldsWithParents as any}
        initialData={initialForForm}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف فعالیت"
        message={`آیا از حذف «${deleting?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست و تمام زیرفعالیت‌ها نیز حذف می‌شوند.`}
        onConfirm={handleDelete}
      />

      {/* Move-to-parent dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>انتقال فعالیت به والد جدید</DialogTitle>
            {moving && (
              <DialogDescription>
                فعالیت «{moving.title}» ({moving.wbsCode}) را به والد جدید منتقل
                کنید. سطح و مسیر سلسله‌مراتبی به‌طور خودکار به‌روزرسانی می‌شوند.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="move-target">والد جدید</Label>
            <Select value={moveTargetId} onValueChange={setMoveTargetId}>
              <SelectTrigger id="move-target" className="w-full">
                <SelectValue placeholder="انتخاب والد جدید" />
              </SelectTrigger>
              <SelectContent>
                {moving &&
                  allWbs
                    .filter(
                      (w) =>
                        w.id !== moving.id &&
                        !getDescendantIds(moving.id, allWbs).has(w.id)
                    )
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.wbsCode} - {w.title}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveOpen(false)}
              disabled={moveLoading}
            >
              انصراف
            </Button>
            <Button
              type="button"
              onClick={handleMove}
              disabled={moveLoading || !moveTargetId}
            >
              {moveLoading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
