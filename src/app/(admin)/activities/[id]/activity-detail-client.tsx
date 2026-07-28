"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess, notifyError, notifyInfo } from "@/lib/notify";
import { Loader2, RefreshCw, Trash2, Bell } from "lucide-react";

interface ActivityDetailClientProps {
  activity: any;
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

export function ActivityDetailClient({ activity }: ActivityDetailClientProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "user";
  const canEdit = userRole !== "user";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(activity.status);
  const [progressPct, setProgressPct] = useState<string>(String(activity.progressPct ?? 0));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Delay cause state — cascading single-select
  const [delayCauses, setDelayCauses] = useState<DelayCause[]>([]);
  const [selectedMainCat, setSelectedMainCat] = useState<string>("");
  const [selectedSubCat, setSelectedSubCat] = useState<string>("");
  const [selectedCauseId, setSelectedCauseId] = useState<string>("");

  // Hide delay cause field for corrective activities themselves
  const isCorrective = !!activity.isCorrective;
  const isDelayedState = !isCorrective && (status === "on_hold" || status === "pending");

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

  useEffect(() => {
    if (!isDelayedState) {
      setSelectedMainCat("");
      setSelectedSubCat("");
      setSelectedCauseId("");
    }
  }, [isDelayedState]);

  const mainCategories = Array.from(new Set(delayCauses.map((c) => c.mainCategory)));
  const uniqueSubCats = Array.from(new Set(delayCauses.filter((c) => c.mainCategory === selectedMainCat).map((c) => c.subCategory)));
  const rootCauses = delayCauses.filter((c) => c.mainCategory === selectedMainCat && c.subCategory === selectedSubCat);
  const selectedCause = delayCauses.find((c) => c.id === selectedCauseId);

  const sendReminder = async () => {
    setReminderLoading(true);
    try {
      const res = await fetch("/api/notification/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: activity.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ارسال اعلان");
      }
      if (data.success === false) {
        notifyInfo("امروز قبلاً برای این فعالیت اعلان ارسال شده است");
      } else {
        notifySuccess("اعلان پیگیری ارسال شد");
      }
    } catch (e: any) {
      notifyError(e.message || "خطا در ارسال اعلان");
    }
    setReminderLoading(false);
  };

  const submit = async () => {
    setLoading(true);
    try {
      const body: any = {
        activityId: activity.id,
        newStatus: status,
        progressPct: Number(progressPct),
        notes,
      };
      if (isDelayedState && selectedCauseId) {
        body.delayCauseIds = [selectedCauseId];
      }

      const res = await fetch("/api/activity-status-update", {
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
      setOpen(false);
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
    <>
      <Button onClick={() => setOpen(true)} variant="default">
        <RefreshCw className="w-4 h-4 ml-1" />
        بروزرسانی وضعیت
      </Button>
      {canEdit && (
        <Button onClick={sendReminder} variant="outline" disabled={reminderLoading}>
          {reminderLoading ? (
            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
          ) : (
            <Bell className="w-4 h-4 ml-1" />
          )}
          ارسال اعلان پیگیری
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>بروزرسانی وضعیت فعالیت</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>وضعیت جدید</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">در انتظار</SelectItem>
                  <SelectItem value="in_progress">در حال انجام</SelectItem>
                  <SelectItem value="completed">تکمیل شده</SelectItem>
                  <SelectItem value="cancelled">لغو شده</SelectItem>
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

            {/* Delay cause cascading single-select */}
            {isDelayedState && (
              <div className="space-y-2">
                <Label>علت تأخیر</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    value={selectedMainCat}
                    onValueChange={(v) => { setSelectedMainCat(v); setSelectedSubCat(""); setSelectedCauseId(""); }}
                  >
                    <SelectTrigger><SelectValue placeholder="دسته اصلی" /></SelectTrigger>
                    <SelectContent>
                      {mainCategories.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedSubCat}
                    onValueChange={(v) => { setSelectedSubCat(v); setSelectedCauseId(""); }}
                    disabled={!selectedMainCat}
                  >
                    <SelectTrigger><SelectValue placeholder="دسته فرعی" /></SelectTrigger>
                    <SelectContent>
                      {uniqueSubCats.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                    </SelectContent>
                  </Select>
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
                rows={3}
                placeholder="توضیحات اختیاری..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              انصراف
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface RemoveAssignmentClientProps {
  id: string;
  name: string;
  code: string;
  role: string | null;
  type: "person" | "org";
}

export function RemoveAssignmentClient({ id, name, code, role, type }: RemoveAssignmentClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const remove = async () => {
    setLoading(true);
    try {
      const url = type === "person" ? "/api/activity-person" : "/api/activity-org-chart";
      const res = await fetch(`${url}?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("تخصیص حذف شد");
      router.refresh();
    } catch {
      notifyError("خطا در حذف تخصیص");
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border">
      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
        {name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {code}{role ? ` - ${role}` : ""}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={remove}
        disabled={loading}
        title="حذف تخصیص"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
