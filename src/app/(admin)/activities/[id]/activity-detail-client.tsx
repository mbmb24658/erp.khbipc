"use client";
import { useState } from "react";
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
import { notifySuccess, notifyError, notifyInfo } from "@/lib/notify";
import { Loader2, RefreshCw, Trash2, Bell } from "lucide-react";

interface ActivityDetailClientProps {
  activity: any;
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
      const res = await fetch("/api/activity-status-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          newStatus: status,
          progressPct: Number(progressPct),
          notes,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در ثبت");
      }
      notifySuccess("وضعیت فعالیت بروزرسانی شد");
      setOpen(false);
      setNotes("");
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
