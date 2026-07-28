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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

  // Delay cause state
  const [delayCauses, setDelayCauses] = useState<DelayCause[]>([]);
  const [selectedDelayCauseIds, setSelectedDelayCauseIds] = useState<string[]>([]);
  const [delayCauseOpen, setDelayCauseOpen] = useState(false);

  // Whether to show the delay cause field
  const isDelayedState = status === "on_hold" || status === "pending";

  useEffect(() => {
    // Fetch delay causes once (only when a delayed state is selected)
    if (isDelayedState && delayCauses.length === 0) {
      fetch("/api/delay-cause")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.all)) setDelayCauses(data.all);
        })
        .catch(() => {});
    }
  }, [isDelayedState, delayCauses.length]);

  // Reset delay cause selection when leaving delayed state
  useEffect(() => {
    if (!isDelayedState) setSelectedDelayCauseIds([]);
  }, [isDelayedState]);

  const toggleDelayCause = (id: string) => {
    setSelectedDelayCauseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    setLoading(true);
    try {
      const body: any = {
        newStatus: status,
        progressPct: Number(progressPct),
        notes,
      };
      if (isDelayedState && selectedDelayCauseIds.length > 0) {
        body.delayCauseIds = selectedDelayCauseIds;
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
      setSelectedDelayCauseIds([]);
      router.refresh();
    } catch (e: any) {
      notifyError(e.message || "خطا در ثبت");
    }
    setLoading(false);
  };

  const selectedLabels = delayCauses
    .filter((c) => selectedDelayCauseIds.includes(c.id))
    .map((c) => `${c.mainCategory} › ${c.subCategory} — ${c.rootCause}`);

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

      {/* Delay cause multi-select — only when delayed */}
      {isDelayedState && (
        <div className="space-y-1.5">
          <Label>علت تأخیر (اختیاری)</Label>
          <Popover open={delayCauseOpen} onOpenChange={setDelayCauseOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-right font-normal h-auto min-h-[40px] py-2"
              >
                {selectedLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1 w-full">
                    {selectedLabels.map((label, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-xs rounded px-1.5 py-0.5 border border-rose-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    انتخاب علت‌های تأخیر مرتبط...
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[480px] max-h-[360px] overflow-y-auto p-2"
              align="start"
            >
              <div className="space-y-1">
                {delayCauses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    در حال بارگذاری...
                  </p>
                ) : (
                  delayCauses.map((c) => {
                    const checked = selectedDelayCauseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDelayCause(c.id)}
                          className="w-4 h-4 rounded mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="font-medium">
                            {c.mainCategory} › {c.subCategory}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.rootCause}
                          </div>
                          <div className="text-xs text-emerald-700 mt-0.5">
                            راهکار: {c.solution}
                          </div>
                          {c.warning && (
                            <div className="text-xs text-rose-700 mt-0.5">
                              هشدار: {c.warning}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="font-num text-[10px] shrink-0">
                          {Math.round(c.impactPercent * 100).toLocaleString("fa-IR")}٪
                        </Badge>
                      </label>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            در صورت انتخاب، برای هر علت یک «فعالیت اصلاحی» به‌صورت خودکار ایجاد می‌شود.
          </p>
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
