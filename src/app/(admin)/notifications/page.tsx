"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  Plus,
  Bell,
  FileText,
  Settings as SettingsIcon,
  MailCheck,
  Mail,
  Send,
  Trash2,
  Circle,
  Loader2,
} from "lucide-react";
import { formatJalaliDateTime } from "@/lib/jalali";

interface Notification {
  id: string;
  templateId: string | null;
  userId: string | null;
  title: string;
  message: string;
  category: string | null;
  priority: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  template?: { code: string; title: string } | null;
}

interface NotificationTemplate {
  id: string;
  code: string;
  title: string;
  subjectTemplate: string | null;
  bodyTemplate: string;
  category: string | null;
  variables: string | null;
  isActive: boolean;
  _count?: { notifications: number };
}

interface NotificationConfig {
  id: string;
  userId: string | null;
  category: string;
  channel: string;
  isEnabled: boolean;
  minPriority: string;
}

interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  fromUser: { id: string; username: string; name: string };
  toUser: { id: string; username: string; name: string };
}

interface OnlineUser {
  id: string;
  username: string;
  name: string;
  lastActivityAt: string | null;
}

const priorityMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "کم", variant: "secondary" },
  normal: { label: "عادی", variant: "outline" },
  high: { label: "زیاد", variant: "default" },
  urgent: { label: "فوری", variant: "destructive" },
};

export default function NotificationsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "user";
  const isAdmin = userRole === "admin";

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [tplEditOpen, setTplEditOpen] = useState(false);
  const [tplEditing, setTplEditing] = useState<NotificationTemplate | null>(null);
  const [tplDeleteOpen, setTplDeleteOpen] = useState(false);
  const [tplDeleting, setTplDeleting] = useState<NotificationTemplate | null>(null);

  const [cfgEditOpen, setCfgEditOpen] = useState(false);
  const [cfgEditing, setCfgEditing] = useState<NotificationConfig | null>(null);
  const [cfgDeleteOpen, setCfgDeleteOpen] = useState(false);
  const [cfgDeleting, setCfgDeleting] = useState<NotificationConfig | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/notification"),
        fetch("/api/notification-template"),
        fetch("/api/notification-config"),
      ]);
      setNotifs(await r1.json());
      setTemplates(await r2.json());
      setConfigs(await r3.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveTpl = async (formData: Record<string, any>) => {
    const url = tplEditing ? `/api/notification-template/${tplEditing.id}` : "/api/notification-template";
    const method = tplEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(tplEditing ? "قالب ویرایش شد" : "قالب جدید ایجاد شد");
    fetchData();
  };
  const deleteTpl = async () => {
    if (!tplDeleting) return;
    try {
      const res = await fetch(`/api/notification-template/${tplDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("قالب حذف شد");
      setTplDeleteOpen(false);
      setTplDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const saveCfg = async (formData: Record<string, any>) => {
    const url = cfgEditing ? `/api/notification-config/${cfgEditing.id}` : "/api/notification-config";
    const method = cfgEditing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess(cfgEditing ? "تنظیمات ویرایش شد" : "تنظیمات جدید ایجاد شد");
    fetchData();
  };
  const deleteCfg = async () => {
    if (!cfgDeleting) return;
    try {
      const res = await fetch(`/api/notification-config/${cfgDeleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      notifySuccess("تنظیمات حذف شد");
      setCfgDeleteOpen(false);
      setCfgDeleting(null);
      fetchData();
    } catch {
      notifyError("خطا در حذف");
    }
  };

  const markAsRead = async (id: string, isRead: boolean) => {
    try {
      const res = await fetch(`/api/notification/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead }),
      });
      if (res.ok) {
        setNotifs((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead } : n))
        );
      }
    } catch (e) {
      notifyError("خطا در به‌روزرسانی");
    }
  };

  const notifColumns: Column<Notification>[] = [
    { key: "title", label: "عنوان" },
    {
      key: "message",
      label: "پیام",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-md">
          {r.message?.length > 80 ? `${r.message.slice(0, 80)}...` : r.message}
        </span>
      ),
    },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    {
      key: "priority",
      label: "اولویت",
      render: (r) => {
        const p = priorityMap[r.priority];
        return p ? <Badge variant={p.variant}>{p.label}</Badge> : r.priority;
      },
    },
    {
      key: "isRead",
      label: "وضعیت مطالعه",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Badge variant={r.isRead ? "secondary" : "default"}>
            {r.isRead ? "خوانده شده" : "جدید"}
          </Badge>
          {!r.isRead && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => markAsRead(r.id, true)}
            >
              <MailCheck className="w-3 h-3 ml-1" />
              خواندن
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "تاریخ",
      render: (r) => formatJalaliDateTime(r.createdAt),
    },
  ];

  const tplColumns: Column<NotificationTemplate>[] = [
    { key: "code", label: "کد", render: (r) => <Badge variant="outline" className="font-mono">{r.code}</Badge> },
    { key: "title", label: "عنوان" },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    {
      key: "isActive",
      label: "فعال",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "secondary"}>
          {r.isActive ? "فعال" : "غیرفعال"}
        </Badge>
      ),
    },
    {
      key: "_count",
      label: "تعداد اعلان",
      render: (r) => (r._count?.notifications ?? 0).toLocaleString("fa-IR"),
    },
  ];

  const cfgColumns: Column<NotificationConfig>[] = [
    { key: "userId", label: "شناسه کاربر", render: (r) => r.userId || "همه" },
    { key: "category", label: "دسته" },
    {
      key: "channel",
      label: "کانال",
      render: (r) => {
        const ch: Record<string, string> = { email: "ایمیل", sms: "پیامک", in_app: "درون برنامه" };
        return <Badge variant="secondary">{ch[r.channel] || r.channel}</Badge>;
      },
    },
    {
      key: "isEnabled",
      label: "فعال",
      render: (r) => (
        <Badge variant={r.isEnabled ? "default" : "secondary"}>
          {r.isEnabled ? "فعال" : "غیرفعال"}
        </Badge>
      ),
    },
    {
      key: "minPriority",
      label: "حداقل اولویت",
      render: (r) => {
        const p = priorityMap[r.minPriority];
        return p ? <Badge variant={p.variant}>{p.label}</Badge> : r.minPriority;
      },
    },
  ];

  const tplFields: FormField[] = [
    { key: "code", label: "کد قالب", required: true, placeholder: "مثال: TPL-001" },
    { key: "title", label: "عنوان", required: true },
    { key: "category", label: "دسته", type: "select", options: [
      { value: "system", label: "سیستمی" },
      { value: "risk", label: "ریسک" },
      { value: "kpi", label: "شاخص عملکرد" },
      { value: "wbs", label: "WBS" },
      { value: "financial", label: "مالی" },
    ] },
    { key: "subjectTemplate", label: "قالب موضوع" },
    { key: "bodyTemplate", label: "قالب پیام", type: "textarea", required: true, helpText: "از متغیرها مانند {{name}} استفاده کنید" },
    { key: "variables", label: "متغیرها", placeholder: "مثال: name,date,value" },
    { key: "isActive", label: "فعال", type: "select", options: [
      { value: "true", label: "فعال" },
      { value: "false", label: "غیرفعال" },
    ] },
  ];

  const cfgFields: FormField[] = [
    { key: "userId", label: "شناسه کاربر", placeholder: "خالی = همه کاربران" },
    { key: "category", label: "دسته", type: "select", required: true, options: [
      { value: "system", label: "سیستمی" },
      { value: "risk", label: "ریسک" },
      { value: "kpi", label: "شاخص عملکرد" },
      { value: "wbs", label: "WBS" },
      { value: "financial", label: "مالی" },
    ] },
    { key: "channel", label: "کانال", type: "select", required: true, options: [
      { value: "email", label: "ایمیل" },
      { value: "sms", label: "پیامک" },
      { value: "in_app", label: "درون برنامه" },
    ] },
    { key: "isEnabled", label: "فعال", type: "select", options: [
      { value: "true", label: "فعال" },
      { value: "false", label: "غیرفعال" },
    ] },
    { key: "minPriority", label: "حداقل اولویت", type: "select", options: [
      { value: "low", label: "کم" },
      { value: "normal", label: "عادی" },
      { value: "high", label: "زیاد" },
      { value: "urgent", label: "فوری" },
    ] },
  ];

  const unreadCount = notifs.filter((n) => !n.isRead).length;
  const activeTemplates = templates.filter((t) => t.isActive).length;

  return (
    <div>
      <PageHeader
        title="اعلان‌ها و پیام‌ها"
        description="مدیریت اعلان‌ها، قالب‌ها و تنظیمات اطلاع‌رسانی"
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{notifs.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کل اعلان‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center">
              <MailCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{unreadCount.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">اعلان‌های خوانده نشده</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{activeTemplates.toLocaleString("fa-IR")} / {templates.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">قالب‌های فعال</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="notifications">
        <TabsList className={isAdmin ? "grid w-full max-w-2xl grid-cols-4" : "grid w-full max-w-2xl grid-cols-2"}>
          <TabsTrigger value="notifications">اعلان‌ها</TabsTrigger>
          <TabsTrigger value="messages">
            <Mail className="w-4 h-4 ml-1" />
            پیام‌ها
          </TabsTrigger>
          {isAdmin && <TabsTrigger value="templates">قالب‌ها</TabsTrigger>}
          {isAdmin && <TabsTrigger value="configs">تنظیمات</TabsTrigger>}
        </TabsList>

        <TabsContent value="notifications" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={notifs}
              columns={notifColumns}
              title=""
              searchKeys={["title", "message", "category"]}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <MessagesTab />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={templates}
              columns={tplColumns}
              title=""
              searchKeys={["code", "title", "category"]}
              onAdd={() => { setTplEditing(null); setTplEditOpen(true); }}
              onEdit={(row) => { setTplEditing(row); setTplEditOpen(true); }}
              onDelete={(row) => { setTplDeleting(row); setTplDeleteOpen(true); }}
              pageSize={15}
            />
          )}
        </TabsContent>

        <TabsContent value="configs" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
          ) : (
            <DataTable
              data={configs}
              columns={cfgColumns}
              title=""
              searchKeys={["category", "channel", "userId"]}
              onAdd={() => { setCfgEditing(null); setCfgEditOpen(true); }}
              onEdit={(row) => { setCfgEditing(row); setCfgEditOpen(true); }}
              onDelete={(row) => { setCfgDeleting(row); setCfgDeleteOpen(true); }}
              pageSize={15}
            />
          )}
        </TabsContent>
      </Tabs>

      <EditDialog
        open={tplEditOpen}
        onOpenChange={setTplEditOpen}
        title={tplEditing ? `ویرایش: ${tplEditing.code}` : "افزودن قالب جدید"}
        fields={tplFields}
        initialData={tplEditing ?? { isActive: "true", category: "system" }}
        onSubmit={saveTpl}
      />
      <ConfirmDialog
        open={tplDeleteOpen}
        onOpenChange={setTplDeleteOpen}
        title="حذف قالب"
        message={`آیا از حذف «${tplDeleting?.title}» مطمئن هستید؟`}
        onConfirm={deleteTpl}
      />

      <EditDialog
        open={cfgEditOpen}
        onOpenChange={setCfgEditOpen}
        title={cfgEditing ? "ویرایش تنظیمات" : "افزودن تنظیمات جدید"}
        fields={cfgFields}
        initialData={cfgEditing
          ? { ...cfgEditing, isEnabled: String(cfgEditing.isEnabled) }
          : { isEnabled: "true", channel: "in_app", minPriority: "normal", category: "system" }}
        onSubmit={saveCfg}
      />
      <ConfirmDialog
        open={cfgDeleteOpen}
        onOpenChange={setCfgDeleteOpen}
        title="حذف تنظیمات"
        message="آیا از حذف این تنظیمات مطمئن هستید؟"
        onConfirm={deleteCfg}
      />

      <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
        <SettingsIcon className="w-4 h-4" />
        <span>اعلان‌ها به صورت خودکار توسط سیستم تولید می‌شوند. می‌توانید قالب‌ها و تنظیمات اطلاع‌رسانی را مدیریت کنید.</span>
      </div>
    </div>
  );
}

// ============================================================
// Messages Tab — list online users, send/read/delete messages
// ============================================================
function MessagesTab() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState<"all" | "inbox" | "sent">("all");

  // Send message dialog
  const [sendOpen, setSendOpen] = useState(false);
  const [sendToUserId, setSendToUserId] = useState("");
  const [sendContent, setSendContent] = useState("");
  const [sending, setSending] = useState(false);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [msgRes, onlineRes, usersRes] = await Promise.all([
        fetch(`/api/message?box=${box}`),
        fetch("/api/users/online"),
        fetch("/api/user"),
      ]);
      if (msgRes.ok) setMessages(await msgRes.json());
      if (onlineRes.ok) setOnlineUsers(await onlineRes.json());
      if (usersRes.ok) {
        const all = await usersRes.json();
        // Map to {id, username, name} — exclude current user
        setAllUsers(
          (all as any[])
            .filter((u) => u.id !== currentUserId && u.isActive)
            .map((u) => ({
              id: u.id,
              username: u.username,
              name: u.personel?.name || u.username,
            }))
        );
      }
    } catch {
      notifyError("خطا در بارگذاری پیام‌ها");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // Poll online users every 30s to keep the list fresh
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/users/online");
        if (r.ok) setOnlineUsers(await r.json());
      } catch {
        // ignore
      }
    }, 30_000);
    return () => clearInterval(poll);
  }, [box, currentUserId]);

  const handleSend = async () => {
    if (!sendToUserId) {
      notifyError("گیرنده را انتخاب کنید");
      return;
    }
    if (!sendContent.trim()) {
      notifyError("متن پیام را وارد کنید");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: sendToUserId, content: sendContent }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در ارسال پیام");
      }
      notifySuccess("پیام ارسال شد");
      setSendOpen(false);
      setSendToUserId("");
      setSendContent("");
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در ارسال پیام");
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async (id: string, isRead: boolean) => {
    try {
      const res = await fetch(`/api/message/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead }),
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead } : m))
        );
      }
    } catch {
      notifyError("خطا در به‌روزرسانی");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`/api/message/${deletingId}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در حذف");
      }
      notifySuccess("پیام حذف شد");
      setDeleteOpen(false);
      setDeletingId(null);
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در حذف");
    }
  };

  const msgColumns: Column<Message>[] = [
    {
      key: "fromUser",
      label: "فرستنده",
      render: (r) => (
        <span className="text-sm">{r.fromUser.name}</span>
      ),
    },
    {
      key: "toUser",
      label: "گیرنده",
      render: (r) => (
        <span className="text-sm">{r.toUser.name}</span>
      ),
    },
    {
      key: "content",
      label: "متن",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-md">
          {r.content?.length > 80 ? `${r.content.slice(0, 80)}...` : r.content}
        </span>
      ),
    },
    {
      key: "isRead",
      label: "وضعیت",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Badge variant={r.isRead ? "secondary" : "default"}>
            {r.isRead ? "خوانده شده" : "جدید"}
          </Badge>
          {r.toUserId === currentUserId && !r.isRead && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => markAsRead(r.id, true)}
            >
              <MailCheck className="w-3 h-3 ml-1" />
              خواندن
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "تاریخ",
      render: (r) => formatJalaliDateTime(r.createdAt),
    },
    {
      key: "actions",
      label: "عملیات",
      render: (r) => (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => {
            setDeletingId(r.id);
            setDeleteOpen(true);
          }}
          title="حذف پیام"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Online users card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-emerald-500 fill-emerald-500" />
              <h3 className="text-sm font-medium">
                کاربران آنلاین ({onlineUsers.length.toLocaleString("fa-IR")})
              </h3>
            </div>
            <Button size="sm" onClick={() => setSendOpen(true)}>
              <Send className="w-4 h-4 ml-1" />
              ارسال پیام
            </Button>
          </div>
          {onlineUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              کاربر آنلاینی وجود ندارد
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {onlineUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium">{u.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Box filter */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={box === "all" ? "default" : "outline"}
          onClick={() => setBox("all")}
        >
          همه
        </Button>
        <Button
          size="sm"
          variant={box === "inbox" ? "default" : "outline"}
          onClick={() => setBox("inbox")}
        >
          دریافتی
        </Button>
        <Button
          size="sm"
          variant={box === "sent" ? "default" : "outline"}
          onClick={() => setBox("sent")}
        >
          ارسالی
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : (
        <DataTable
          data={messages}
          columns={msgColumns}
          title=""
          searchKeys={["content", "fromUser.username", "toUser.username"]}
          pageSize={15}
        />
      )}

      {/* Send message dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ارسال پیام جدید</DialogTitle>
            <DialogDescription>
              پیام خود را برای یکی از کاربران ارسال کنید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">گیرنده</label>
              <Select value={sendToUserId} onValueChange={setSendToUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب گیرنده" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {onlineUsers.some((o) => o.id === u.id) ? "🟢 " : ""}
                      {u.name} ({u.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">متن پیام</label>
              <Textarea
                value={sendContent}
                onChange={(e) => setSendContent(e.target.value)}
                placeholder="متن پیام خود را وارد کنید..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendOpen(false)}
              disabled={sending}
            >
              انصراف
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال ارسال...</>
              ) : (
                <><Send className="w-4 h-4 ml-1" /> ارسال</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف پیام"
        message="آیا از حذف این پیام مطمئن هستید؟"
        onConfirm={handleDelete}
      />
    </div>
  );
}
