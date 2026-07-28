"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Pencil, RefreshCw, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { EditDialog } from "@/components/edit-dialog";
import { useRouter } from "next/navigation";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WBSDetailClientProps {
  wbs: any;
}

export function WBSDetailClient({ wbs }: WBSDetailClientProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  const fields = [
    { key: "wbsCode", label: "کد WBS", required: true },
    { key: "title", label: "عنوان فعالیت", required: true },
    { key: "durationDays", label: "مدت (روز)", type: "number" as const },
    {
      key: "progressPlan",
      label: "پیشرفت برنامه (%)",
      type: "number" as const,
      helpText: "0 تا 100",
    },
    {
      key: "progressActual",
      label: "پیشرفت واقعی (%)",
      type: "number" as const,
      helpText: "0 تا 100",
    },
    { key: "startDate", label: "تاریخ شروع", type: "date" as const },
    { key: "finishDate", label: "تاریخ پایان", type: "date" as const },
    { key: "hrPlan", label: "منابع انسانی برنامه", type: "textarea" as const },
    { key: "hrActual", label: "منابع انسانی واقعی", type: "textarea" as const },
    { key: "actualCost", label: "هزینه واقعی", type: "number" as const },
    { key: "costVariance", label: "انحراف هزینه", type: "number" as const },
    { key: "scheduleVariance", label: "انحراف زمانی", type: "number" as const },
    { key: "description", label: "توضیحات", type: "textarea" as const },
  ];

  const handleSave = async (data: Record<string, any>) => {
    // Convert percent (0-100) to decimal (0-1)
    if (data.progressPlan !== null) data.progressPlan = data.progressPlan / 100;
    if (data.progressActual !== null) data.progressActual = data.progressActual / 100;

    const res = await fetch(`/api/wbs/${wbs.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess("فعالیت ویرایش شد");
    router.refresh();
  };

  const initialData = {
    ...wbs,
    progressPlan: Math.round(wbs.progressPlan * 100),
    progressActual: Math.round(wbs.progressActual * 100),
    startDate: wbs.startDate ? wbs.startDate.split("T")[0] : "",
    finishDate: wbs.finishDate ? wbs.finishDate.split("T")[0] : "",
  };

  return (
    <div className="flex justify-end mb-2">
      <Button onClick={() => setEditOpen(true)} size="sm">
        <Pencil className="w-4 h-4 ml-1" />
        ویرایش فعالیت
      </Button>
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`ویرایش: ${wbs.wbsCode}`}
        fields={fields}
        initialData={initialData}
        onSubmit={handleSave}
      />
    </div>
  );
}

// ============================================================
// WBS Status Update Form — used inside the WBS detail page
// Allows any user with assignment to update WBS status + progress
// Now supports delay cause selection when status is "on_hold" or "pending"
// ============================================================
interface WBSStatusUpdateFormProps {
  wbsId: string;
  currentStatus: string;
  currentProgressPct: number;
}

interface DelayCause {
  id: string;
  mainCategory: string;
  subCategory: string;
  rootCause: string;
  solution: string;
  impactPercent: number;
  durationDays: number;
  unit: string;
  warning: string | null;
}

export function WBSStatusUpdateForm({
  wbsId,
  currentStatus,
  currentProgressPct,
}: WBSStatusUpdateFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus || "pending");
  const [progressPct, setProgressPct] = useState<string>(
    String(currentProgressPct ?? 0)
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Delay cause state — cascading single-select
  const [delayCauses, setDelayCauses] = useState<DelayCause[]>([]);
  const [selectedMainCat, setSelectedMainCat] = useState<string>("");
  const [selectedSubCat, setSelectedSubCat] = useState<string>("");
  const [selectedCauseId, setSelectedCauseId] = useState<string>("");

  // Whether to show the delay cause field
  const isDelayedState = status === "on_hold" || status === "pending";

  useEffect(() => {
    if (isDelayedState && delayCauses.length === 0) {
      fetch("/api/delay-cause")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.all)) setDelayCauses(data.all);
        })
        .catch(() => {});
    }
  }, [isDelayedState, delayCauses.length]);

  // Reset cascade when leaving delayed state
  useEffect(() => {
    if (!isDelayedState) {
      setSelectedMainCat("");
      setSelectedSubCat("");
      setSelectedCauseId("");
    }
  }, [isDelayedState]);

  // Derived options
  const mainCategories = Array.from(new Set(delayCauses.map((c) => c.mainCategory)));
  const subCategories = delayCauses
    .filter((c) => c.mainCategory === selectedMainCat)
    .map((c) => c.subCategory);
  const uniqueSubCats = Array.from(new Set(subCategories));
  const rootCauses = delayCauses.filter(
    (c) => c.mainCategory === selectedMainCat && c.subCategory === selectedSubCat
  );

  const selectedCause = delayCauses.find((c) => c.id === selectedCauseId);

  const submit = async () => {
    setLoading(true);
    try {
      const body: any = {
        newStatus: status,
        progressPct: Number(progressPct),
        notes,
      };
      if (isDelayedState && selectedCauseId) {
        body.delayCauseIds = [selectedCauseId];
      }

      const res = await fetch(`/api/wbs/${wbsId}/status-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در ثبت");
      }
      const json = await res.json();
      const created = Array.isArray(json?.correctiveActivities)
        ? json.correctiveActivities.length
        : 0;
      notifySuccess(
        created > 0
          ? `وضعیت بروزرسانی شد و ${created.toLocaleString("fa-IR")} فعالیت اصلاحی ایجاد شد`
          : "وضعیت فعالیت بروزرسانی شد"
      );
      setNotes("");
      setSelectedMainCat("");
      setSelectedSubCat("");
      setSelectedCauseId("");
      router.refresh();
    } catch (e: any) {
      notifyError(e.message || "خطا در ثبت");
    }
    setLoading(false);
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>وضعیت جدید</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">در انتظار</SelectItem>
              <SelectItem value="in_progress">در حال انجام</SelectItem>
              <SelectItem value="completed">تکمیل شده</SelectItem>
              <SelectItem value="on_hold">متوقف</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>درصد پیشرفت (0-100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={progressPct}
            onChange={(e) => setProgressPct(e.target.value)}
          />
        </div>
      </div>

      {/* Delay cause cascading single-select — only when delayed */}
      {isDelayedState && (
        <div className="space-y-2">
          <Label>علت تأخیر</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {/* Step 1: Main category */}
            <Select
              value={selectedMainCat}
              onValueChange={(v) => {
                setSelectedMainCat(v);
                setSelectedSubCat("");
                setSelectedCauseId("");
              }}
            >
              <SelectTrigger><SelectValue placeholder="دسته اصلی" /></SelectTrigger>
              <SelectContent>
                {mainCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Step 2: Sub category */}
            <Select
              value={selectedSubCat}
              onValueChange={(v) => {
                setSelectedSubCat(v);
                setSelectedCauseId("");
              }}
              disabled={!selectedMainCat}
            >
              <SelectTrigger><SelectValue placeholder="دسته فرعی" /></SelectTrigger>
              <SelectContent>
                {uniqueSubCats.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Step 3: Root cause */}
            <Select
              value={selectedCauseId}
              onValueChange={(v) => setSelectedCauseId(v)}
              disabled={!selectedSubCat}
            >
              <SelectTrigger><SelectValue placeholder="ریشه مسئله" /></SelectTrigger>
              <SelectContent>
                {rootCauses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.rootCause} ({Math.round(c.impactPercent * 100)}٪)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedCause && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 rounded-md p-3 text-xs space-y-1">
              <p><span className="font-medium text-rose-700">راهکار:</span> {selectedCause.solution}</p>
              <p><span className="font-medium text-rose-700">تاثیر:</span> {Math.round(selectedCause.impactPercent * 100).toLocaleString("fa-IR")}٪</p>
              <p><span className="font-medium text-rose-700">مدت:</span> {selectedCause.durationDays.toLocaleString("fa-IR")} {selectedCause.unit}</p>
              {selectedCause.warning && (
                <p className="text-rose-800 font-medium">⚠️ هشدار: {selectedCause.warning}</p>
              )}
              <p className="text-muted-foreground pt-1">با ثبت، یک «فعالیت اصلاحی» خودکار ایجاد می‌شود.</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>یادداشت</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="توضیحات اختیاری..."
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 ml-1" />
          )}
          ثبت بروزرسانی
        </Button>
      </div>
    </div>
  );
}
