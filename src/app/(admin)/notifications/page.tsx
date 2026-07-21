"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Plus, Bell, FileText, Settings as SettingsIcon, MailCheck } from "lucide-react";
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
        <TabsList className={isAdmin ? "grid w-full max-w-md grid-cols-3" : "grid w-full max-w-md grid-cols-1"}>
          <TabsTrigger value="notifications">اعلان‌ها</TabsTrigger>
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
