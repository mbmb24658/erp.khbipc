"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTable, PageHeader, type Column } from "@/components/data-table";
import { EditDialog, ConfirmDialog, type FormField } from "@/components/edit-dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { formatJalali, formatJalaliDateTime } from "@/lib/jalali";
import {
  Plus,
  Users as UsersIcon,
  ShieldCheck,
  Settings as SettingsIcon,
  ScrollText,
  Lock,
  Database,
  LockKeyhole,
  Loader2,
} from "lucide-react";

// All modules available for granular access control
const ALL_MODULES: { path: string; label: string }[] = [
  { path: "/", label: "داشبورد" },
  { path: "/financial-dashboard", label: "داشبورد مالی" },
  { path: "/wbs", label: "PMS جامع سازمان" },
  { path: "/progress-update", label: "به‌روزرسانی پیشرفت" },
  { path: "/hr", label: "منابع انسانی" },
  { path: "/financial", label: "مدیریت مالی" },
  { path: "/assets", label: "دارایی‌ها" },
  { path: "/executors", label: "مجریان" },
  { path: "/activities", label: "فعالیت‌های جاری" },
  { path: "/kpi", label: "ارزیابی عملکرد (KPI)" },
  { path: "/personnel-evaluation", label: "ارزیابی پرسنل" },
  { path: "/risks", label: "مدیریت ریسک" },
  { path: "/issues", label: "نظام مسائل" },
  { path: "/notifications", label: "اعلان‌ها" },
  { path: "/reports", label: "گزارشات" },
];

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string | null;
  isSystem: boolean;
  _count?: { users: number };
}

interface User {
  id: string;
  username: string;
  email: string | null;
  personelId: string | null;
  roleId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role?: { id: string; name: string } | null;
  personel?: { id: string; personelId: string; name: string } | null;
}

interface SystemConfig {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  category: string | null;
  isEditable: boolean;
}

interface UserLog {
  id: string;
  userId: string | null;
  action: string;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: {
    username: string;
    personel?: { name: string } | null;
  } | null;
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="تنظیمات و کاربران"
        description="مدیریت کاربران، نقش‌ها، تنظیمات سیستم و لاگ‌ها"
      >
        <a href="/settings/excel-import">
          <Button variant="outline" size="sm">
            <Database className="w-4 h-4 ml-1" />
            بازنشانی از Excel
          </Button>
        </a>
      </PageHeader>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="users">
            <UsersIcon className="w-4 h-4 ml-1" />
            کاربران
          </TabsTrigger>
          <TabsTrigger value="roles">
            <ShieldCheck className="w-4 h-4 ml-1" />
            نقش‌ها
          </TabsTrigger>
          <TabsTrigger value="configs">
            <SettingsIcon className="w-4 h-4 ml-1" />
            تنظیمات سیستم
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="w-4 h-4 ml-1" />
            لاگ‌ها
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
        <TabsContent value="configs" className="mt-4">
          <ConfigsTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Users Tab
// ============================================================
function UsersTab() {
  const [data, setData] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [personels, setPersonels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  // Module access dialog state
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [accessModules, setAccessModules] = useState<string[]>([]);
  const [accessUseCustom, setAccessUseCustom] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/user"),
        fetch("/api/role"),
        fetch("/api/personel"),
      ]);
      if (r1.ok) setData(await r1.json());
      if (r2.ok) setRoles(await r2.json());
      if (r3.ok) setPersonels(await r3.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  const personelOptions = personels.map((p) => ({
    value: p.id,
    label: `${p.personelId} - ${p.name}`,
  }));

  const fields: FormField[] = [
    { key: "username", label: "نام کاربری", required: true, placeholder: "مثال: admin" },
    { key: "email", label: "ایمیل", placeholder: "user@example.com" },
    {
      key: "password",
      label: "رمز عبور",
      type: "password",
      required: !editing,
      placeholder: editing ? "خالی = بدون تغییر" : "رمز عبور",
      helpText: editing ? "در صورت خالی گذاشتن، رمز قبلی حفظ می‌شود" : undefined,
    },
    {
      key: "roleId",
      label: "نقش",
      type: "select",
      options: roleOptions,
      helpText: "نقش کاربر در سیستم",
    },
    {
      key: "personelId",
      label: "پرسنل مرتبط",
      type: "select",
      options: personelOptions,
      helpText: "در صورت اتصال حساب کاربری به پرسنل، از لیست انتخاب کنید",
    },
    {
      key: "isActive",
      label: "وضعیت",
      type: "select",
      options: [
        { value: "true", label: "فعال" },
        { value: "false", label: "غیرفعال" },
      ],
    },
  ];

  const columns: Column<User>[] = [
    { key: "username", label: "نام کاربری", render: (r) => <span className="font-mono">{r.username}</span> },
    { key: "email", label: "ایمیل", render: (r) => r.email || "-" },
    {
      key: "personel",
      label: "پرسنل",
      render: (r) => r.personel?.name || "-",
    },
    {
      key: "role",
      label: "نقش",
      render: (r) =>
        r.role ? <Badge variant="secondary">{r.role.name}</Badge> : "-",
    },
    {
      key: "isActive",
      label: "وضعیت",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "destructive"}>
          {r.isActive ? "فعال" : "غیرفعال"}
        </Badge>
      ),
    },
    {
      key: "lastLoginAt",
      label: "آخرین ورود",
      render: (r) => formatJalaliDateTime(r.lastLoginAt),
    },
    {
      key: "moduleAccess",
      label: "دسترسی ماژول‌ها",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => openAccessDialog(r)}
        >
          <LockKeyhole className="w-3 h-3 ml-1" />
          تنظیم دسترسی
        </Button>
      ),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/user/${editing.id}` : "/api/user";
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
    notifySuccess(editing ? "کاربر ویرایش شد" : "کاربر جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/user/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در حذف");
      }
      notifySuccess("کاربر حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در حذف");
      setDeleteOpen(false);
    }
  };

  // Open the module access dialog and load the user's current moduleAccess
  const openAccessDialog = async (user: User) => {
    setAccessUser(user);
    setAccessModules([]);
    setAccessUseCustom(false);
    setAccessOpen(true);
    try {
      const res = await fetch(`/api/user/${user.id}/module-access`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.modules)) {
          setAccessModules(data.modules);
          setAccessUseCustom(true);
        } else {
          setAccessUseCustom(false);
        }
      }
    } catch {
      // ignore
    }
  };

  const initialForForm = editing
    ? {
        ...editing,
        isActive: String(editing.isActive),
        password: "",
      }
    : { isActive: "true" };

  const activeCount = data.filter((u) => u.isActive).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{data.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کل کاربران</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{activeCount.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کاربران فعال</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{roles.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">نقش‌ها</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4 ml-1" />
          افزودن کاربر
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["username", "email"]}
          onEdit={(row) => { setEditing(row); setEditOpen(true); }}
          onDelete={(row) => { setDeleting(row); setDeleteOpen(true); }}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.username}` : "افزودن کاربر جدید"}
        description="اطلاعات کاربر را تکمیل کنید"
        fields={fields}
        initialData={initialForForm}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف کاربر"
        message={`آیا از حذف کاربر «${deleting?.username}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />

      {/* Module Access Dialog */}
      <ModuleAccessDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        user={accessUser}
        modules={accessModules}
        setModules={setAccessModules}
        useCustom={accessUseCustom}
        setUseCustom={setAccessUseCustom}
        loading={accessLoading}
        onSave={async () => {
          if (!accessUser) return;
          setAccessLoading(true);
          try {
            const body = accessUseCustom ? { modules: accessModules } : { modules: null };
            const res = await fetch(`/api/user/${accessUser.id}/module-access`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              const e = await res.json();
              throw new Error(e.error || "خطا در ذخیره‌سازی");
            }
            notifySuccess("دسترسی ماژول‌ها به‌روزرسانی شد");
            setAccessOpen(false);
          } catch (e: any) {
            notifyError(e.message || "خطا در ذخیره‌سازی");
          } finally {
            setAccessLoading(false);
          }
        }}
      />
    </>
  );
}

// ============================================================
// Module Access Dialog — opens the per-user module access editor
// ============================================================
function ModuleAccessDialog({
  open,
  onOpenChange,
  user,
  modules,
  setModules,
  useCustom,
  setUseCustom,
  loading,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User | null;
  modules: string[];
  setModules: (v: string[]) => void;
  useCustom: boolean;
  setUseCustom: (v: boolean) => void;
  loading: boolean;
  onSave: () => void;
}) {
  const toggleModule = (path: string) => {
    if (modules.includes(path)) {
      setModules(modules.filter((m) => m !== path));
    } else {
      setModules([...modules, path]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>دسترسی به ماژول‌ها — {user?.username}</DialogTitle>
          <DialogDescription>
            دسترسی کاربر به بخش‌های مختلف سامانه را تنظیم کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-2 p-3 rounded-md border bg-muted/30 cursor-pointer">
            <Checkbox
              checked={useCustom}
              onCheckedChange={(v) => setUseCustom(v === true)}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">استفاده از دسترسی سفارشی</p>
              <p className="text-xs text-muted-foreground">
                اگر فعال باشد، فقط ماژول‌های انتخاب‌شده نمایش داده می‌شوند. در غیر این صورت، از دسترسی پیش‌فرض نقش استفاده می‌شود.
              </p>
            </div>
          </label>

          {useCustom ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">ماژول‌های قابل دسترس:</p>
              <ScrollArea className="h-[300px] rounded-md border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_MODULES.map((m) => {
                    const checked = modules.includes(m.path);
                    return (
                      <label
                        key={m.path}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm border"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleModule(m.path)}
                        />
                        <span className="flex-1">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{m.path}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{modules.length.toLocaleString("fa-IR")} ماژول انتخاب شده</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setModules(ALL_MODULES.map((m) => m.path))}
                  >
                    انتخاب همه
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setModules([])}
                  >
                    پاک کردن
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
              این کاربر از دسترسی پیش‌فرض نقش خود استفاده می‌کند. برای تنظیم دسترسی سفارشی، گزینه بالا را فعال کنید.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            انصراف
          </Button>
          <Button type="button" onClick={onSave} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Roles Tab
// ============================================================
function RolesTab() {
  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/role");
      if (res.ok) setData(await res.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fields: FormField[] = [
    { key: "name", label: "نام نقش", required: true, placeholder: "مثال: editor" },
    { key: "description", label: "توضیحات", type: "textarea" },
    {
      key: "isSystem",
      label: "نقش سیستمی",
      type: "select",
      options: [
        { value: "false", label: "خیر" },
        { value: "true", label: "بله" },
      ],
      helpText: "نقش‌های سیستمی قابل حذف نیستند",
    },
  ];

  const columns: Column<Role>[] = [
    { key: "name", label: "نام", render: (r) => <Badge variant="outline" className="font-mono">{r.name}</Badge> },
    { key: "description", label: "توضیحات", render: (r) => r.description || "-" },
    {
      key: "isSystem",
      label: "سیستمی",
      render: (r) => (
        <Badge variant={r.isSystem ? "default" : "secondary"}>
          {r.isSystem ? "سیستمی" : "عادی"}
        </Badge>
      ),
    },
    {
      key: "_count",
      label: "کاربران",
      render: (r) => (r._count?.users ?? 0).toLocaleString("fa-IR"),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/role/${editing.id}` : "/api/role";
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
    notifySuccess(editing ? "نقش ویرایش شد" : "نقش جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/role/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در حذف");
      }
      notifySuccess("نقش حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در حذف");
      setDeleteOpen(false);
    }
  };

  const initialForForm = editing
    ? { ...editing, isSystem: String(editing.isSystem) }
    : { isSystem: "false" };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4 ml-1" />
          افزودن نقش
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["name", "description"]}
          onEdit={(row) => { setEditing(row); setEditOpen(true); }}
          onDelete={(row) => { setDeleting(row); setDeleteOpen(true); }}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.name}` : "افزودن نقش جدید"}
        fields={fields}
        initialData={initialForForm}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف نقش"
        message={`آیا از حذف نقش «${deleting?.name}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </>
  );
}

// ============================================================
// System Configs Tab
// ============================================================
function ConfigsTab() {
  const [data, setData] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SystemConfig | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<SystemConfig | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system-config");
      if (res.ok) setData(await res.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fields: FormField[] = [
    { key: "key", label: "کلید", required: true, placeholder: "مثال: site.title" },
    { key: "value", label: "مقدار", type: "textarea" },
    { key: "description", label: "توضیحات", type: "textarea" },
    { key: "category", label: "دسته", placeholder: "مثال: general" },
    {
      key: "isEditable",
      label: "قابل ویرایش",
      type: "select",
      options: [
        { value: "true", label: "بله" },
        { value: "false", label: "خیر" },
      ],
      helpText: "تنظیمات غیرقابل ویرایش از طریق پنل قابل تغییر نیستند",
    },
  ];

  const columns: Column<SystemConfig>[] = [
    { key: "key", label: "کلید", render: (r) => <Badge variant="outline" className="font-mono">{r.key}</Badge> },
    {
      key: "value",
      label: "مقدار",
      render: (r) => {
        const v = r.value || "-";
        return (
          <span className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
            {v.length > 60 ? `${v.slice(0, 60)}...` : v}
          </span>
        );
      },
    },
    { key: "description", label: "توضیحات", render: (r) => r.description || "-" },
    { key: "category", label: "دسته", render: (r) => r.category || "-" },
    {
      key: "isEditable",
      label: "قابل ویرایش",
      render: (r) => (
        <Badge variant={r.isEditable ? "default" : "secondary"}>
          {r.isEditable ? "بله" : "خیر"}
        </Badge>
      ),
    },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const url = editing ? `/api/system-config/${editing.id}` : "/api/system-config";
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
    notifySuccess(editing ? "تنظیمات ویرایش شد" : "تنظیمات جدید ایجاد شد");
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/system-config/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در حذف");
      }
      notifySuccess("تنظیمات حذف شد");
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    } catch (e: any) {
      notifyError(e.message || "خطا در حذف");
      setDeleteOpen(false);
    }
  };

  const initialForForm = editing
    ? { ...editing, isEditable: String(editing.isEditable) }
    : { isEditable: "true" };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4 ml-1" />
          افزودن تنظیمات
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["key", "category", "value"]}
          onEdit={(row) => { setEditing(row); setEditOpen(true); }}
          onDelete={(row) => { setDeleting(row); setDeleteOpen(true); }}
          pageSize={15}
        />
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={editing ? `ویرایش: ${editing.key}` : "افزودن تنظیمات جدید"}
        fields={fields}
        initialData={initialForForm}
        onSubmit={handleSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف تنظیمات"
        message={`آیا از حذف تنظیمات «${deleting?.key}» مطمئن هستید؟`}
        onConfirm={handleDelete}
      />
    </>
  );
}

// ============================================================
// User Logs Tab (read-only)
// ============================================================
function LogsTab() {
  const [data, setData] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user-log");
      if (res.ok) setData(await res.json());
    } catch {
      notifyError("خطا در بارگذاری اطلاعات");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const columns: Column<UserLog>[] = [
    {
      key: "action",
      label: "عملیات",
      render: (r) => <Badge variant="outline" className="font-mono">{r.action}</Badge>,
    },
    { key: "description", label: "توضیحات", render: (r) => r.description || "-" },
    {
      key: "user",
      label: "کاربر",
      render: (r) => {
        if (!r.user) return <span className="text-muted-foreground">-</span>;
        return (
          <span>
            {r.user.personel?.name || r.user.username}
          </span>
        );
      },
    },
    {
      key: "ipAddress",
      label: "IP",
      render: (r) => r.ipAddress ? <span className="font-mono text-xs">{r.ipAddress}</span> : "-",
    },
    {
      key: "createdAt",
      label: "تاریخ",
      render: (r) => formatJalaliDateTime(r.createdAt),
    },
  ];

  return (
    <>
      <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
        <Lock className="w-4 h-4" />
        <span>نمایش ۱۰۰ رکورد آخر به ترتیب زمان نزولی (فقط خواندنی)</span>
      </div>
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          title=""
          searchKeys={["action", "description"]}
          pageSize={20}
        />
      )}
    </>
  );
}
