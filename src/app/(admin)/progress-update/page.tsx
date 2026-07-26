"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/data-table";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  ArrowRight,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  PlusCircle,
  Trash2,
  Search,
} from "lucide-react";
import Link from "next/link";
import { formatJalali } from "@/lib/jalali";

interface WbsItem {
  id: string;
  wbsCode: string;
  title: string;
  level: number;
  progressActual: number;
  startDate: string | null;
  finishDate: string | null;
}

export default function ProgressUpdatePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "user";
  const isAdmin = userRole === "admin";

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به داشبورد
        </Link>
      </div>

      <PageHeader
        title="به‌روزرسانی درصد پیشرفت فعالیت‌ها"
        description="خروجی اکسل از فعالیت‌ها، ویرایش درصد پیشرفت و بارگذاری مجدد برای به‌روزرسانی گروهی"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Step 1: Download */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline">۱</Badge>
              <Download className="w-4 h-4" />
              دانلود فایل اکسل فعالییت‌ها
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              این فایل شامل همه فعالیت‌های WBS با ستون‌های زیر است:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li><strong>ID</strong> — شناسه یکتای فعالیت (برای تطبیق هنگام آپلود)</li>
              <li><strong>نام فعالیت</strong> — عنوان فعالیت</li>
              <li><strong>کد WBS</strong> — کد یکتای فعالیت</li>
              <li><strong>سطح</strong> — سطح در درخت</li>
              <li><strong>درصد پیشرفت برنامه (%)</strong> — مقدار فعلی</li>
              <li><strong>درصد پیشرفت واقعی (%)</strong> — مقدار فعلی</li>
            </ul>
            <DownloadProgressButton />
          </CardContent>
        </Card>

        {/* Step 2: Edit instruction */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline">۲</Badge>
              <FileSpreadsheet className="w-4 h-4" />
              ویرایش فایل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              فایل دانلود شده را در Excel یا LibreOffice باز کنید:
            </p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>ستون‌های <strong>ID</strong>، <strong>نام فعالیت</strong>، <strong>کد WBS</strong> و <strong>سطح</strong> را <strong className="text-destructive">تغییر ندهید</strong></li>
              <li>فقط ستون‌های <strong>درصد پیشرفت برنامه (%)</strong> و <strong>درصد پیشرفت واقعی (%)</strong> را ویرایش کنید</li>
              <li>مقادیر باید بین <strong>۰ تا ۱۰۰</strong> باشند</li>
              <li>فایل را با همان فرمت ذخیره کنید (<code>.xlsx</code>)</li>
              <li>نام فایل و ترتیب ستون‌ها را تغییر ندهید</li>
            </ol>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>توجه:</strong> اگر ردیفی را حذف کنید یا ID آن را تغییر دهید، آن فعالیت به‌روزرسانی نخواهد شد.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Upload */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline">۳</Badge>
              <Upload className="w-4 h-4" />
              بارگذاری فایل ویرایش‌شده
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UploadProgress />
          </CardContent>
        </Card>
      </div>

      {/* Add new activities section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            افزودن فعالیت‌های جدید
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            با استفاده از یک فایل اکسل قالب، می‌توانید چندین فعالیت WBS جدید را به‌صورت گروهی ایجاد کنید.
          </p>
        </CardHeader>
        <CardContent>
          <BulkCreateSection />
        </CardContent>
      </Card>

      {/* Bulk delete section — admin only */}
      {isAdmin && (
        <Card className="mt-6 border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
              <Trash2 className="w-4 h-4" />
              حذف دسته‌ای فعالیت‌ها
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              فعالیت‌های WBS را برای حذف انتخاب کنید. این عملیات قابل بازگشت نیست.
            </p>
          </CardHeader>
          <CardContent>
            <BulkDeleteSection />
          </CardContent>
        </Card>
      )}

      {/* Help card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">راهنمای سریع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <p className="font-medium mb-2 text-emerald-600">✓ کارهایی که باید بکنید</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>فقط ستون‌های درصد را ویرایش کنید</li>
                <li>مقادیر بین ۰ تا ۱۰۰ باشند</li>
                <li>فایل را با فرمت xlsx ذخیره کنید</li>
                <li>ردیف‌ها را حذف نکنید</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2 text-red-600">✗ کارهایی که نباید بکنید</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>ستون ID را تغییر ندهید</li>
                <li>ستون‌ها را جابجا نکنید</li>
                <li>ردیف جدید اضافه نکنید</li>
                <li>نام ستون‌ها را تغییر ندهید</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2 text-blue-600">ℹ️ نکات</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>این عملیات برای همه کاربران (حتی user) قابل اجراست</li>
                <li>تمام تغییرات در لاگ سیستم ثبت می‌شود</li>
                <li>می‌توانید فایل را چند بار ویرایش و آپلود کنید</li>
                <li>پس از آپلود، داشبورد به‌روزرسانی می‌شود</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Download Progress Button — original progress-export endpoint
// ============================================================
function DownloadProgressButton() {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wbs/progress-export");
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در تولید فایل");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wbs-progress-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notifySuccess("فایل اکسل دانلود شد");
    } catch (e: any) {
      notifyError(e.message || "خطا در دانلود");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={loading} className="w-full">
      {loading ? (
        <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال تولید...</>
      ) : (
        <><Download className="w-4 h-4 ml-1" /> دانلود فایل اکسل</>
      )}
    </Button>
  );
}

// ============================================================
// Upload Progress — original progress-import endpoint
// ============================================================
function UploadProgress() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) {
      notifyError("ابتدا فایل را انتخاب کنید");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/wbs/progress-import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "خطا در بازنشانی");
      }
      setResult(json);
      if (json.updated > 0) {
        notifySuccess(`${json.updated} فعالیت به‌روزرسانی شد`);
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      notifyError(e.message || "خطا در آپلود");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        {file ? (
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(file.size / 1024).toLocaleString("fa-IR")} کیلوبایت
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium">برای انتخاب فایل اکسل کلیک کنید</p>
            <p className="text-xs text-muted-foreground mt-1">فقط فایل‌های .xlsx</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full"
        size="lg"
      >
        {uploading ? (
          <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال به‌روزرسانی...</>
        ) : (
          <><Upload className="w-4 h-4 ml-1" /> بارگذاری و به‌روزرسانی درصد پیشرفت</>
        )}
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {result.message}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-emerald-100 dark:bg-emerald-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-emerald-700 dark:text-emerald-300">
                      {(result.updated || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">به‌روزرسانی شد</p>
                  </div>
                  <div className="bg-amber-100 dark:bg-amber-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-amber-700 dark:text-amber-300">
                      {(result.skipped || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">رد شد</p>
                  </div>
                  <div className="bg-blue-100 dark:bg-blue-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-blue-700 dark:text-blue-300">
                      {(result.totalRows || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">کل ردیف‌ها</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    خطاها ({(result.errors.length).toLocaleString("fa-IR")} مورد)
                  </p>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                    {result.errors.map((err: string, i: number) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Bulk Create Section — download template + upload new activities
// ============================================================
function BulkCreateSection() {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/wbs/bulk-create");
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "خطا در تولید قالب");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wbs-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notifySuccess("قالب اکسل دانلود شد");
    } catch (e: any) {
      notifyError(e.message || "خطا در دانلود قالب");
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      notifyError("ابتدا فایل را انتخاب کنید");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/wbs/bulk-create", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "خطا در افزودن فعالیت‌ها");
      }
      setResult(json);
      if (json.created > 0) {
        notifySuccess(`${json.created} فعالیت جدید ایجاد شد`);
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      notifyError(e.message || "خطا در آپلود");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-medium">۱. دانلود قالب اکسل</p>
          <p className="text-xs text-muted-foreground">
            قالب خالی اکسل با هدرهای استاندارد و راهنمای کدها (سمت‌های سازمانی و پرسنل) را دانلود کنید.
          </p>
          <Button onClick={handleDownloadTemplate} disabled={downloading} variant="outline" className="w-full">
            {downloading ? (
              <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال تولید...</>
            ) : (
              <><Download className="w-4 h-4 ml-1" /> دانلود قالب اکسل</>
            )}
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">۲. آپلود فایل تکمیل‌شده</p>
          <p className="text-xs text-muted-foreground">
            فایل را با کدهای WBS جدید تکمیل و آپلود کنید. کدهای تکراری رد خواهند شد.
          </p>
          <div
            className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <div>
                <p className="text-xs font-medium">{file.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(file.size / 1024).toLocaleString("fa-IR")} کیلوبایت
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">برای انتخاب فایل کلیک کنید (.xlsx)</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
            {uploading ? (
              <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال افزودن...</>
            ) : (
              <><Upload className="w-4 h-4 ml-1" /> افزودن فعالیت‌های جدید</>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {result.message}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-emerald-100 dark:bg-emerald-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-emerald-700 dark:text-emerald-300">
                      {(result.created || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">ایجاد شد</p>
                  </div>
                  <div className="bg-amber-100 dark:bg-amber-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-amber-700 dark:text-amber-300">
                      {(result.skipped || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">رد شد</p>
                  </div>
                  <div className="bg-blue-100 dark:bg-blue-900/40 rounded p-2">
                    <p className="text-lg font-bold font-num text-blue-700 dark:text-blue-300">
                      {(result.totalRows || 0).toLocaleString("fa-IR")}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">کل ردیف‌ها</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    خطاها ({(result.errors.length).toLocaleString("fa-IR")} مورد)
                  </p>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                    {result.errors.map((err: string, i: number) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Bulk Delete Section — multi-select list + delete confirmation
// Admin only
// ============================================================
function BulkDeleteSection() {
  const [items, setItems] = useState<WbsItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wbs?limit=2000");
      if (res.ok) {
        const data = await res.json();
        setItems(
          (data as any[]).map((w) => ({
            id: w.id,
            wbsCode: w.wbsCode,
            title: w.title,
            level: w.level,
            progressActual: w.progressActual,
            startDate: w.startDate ? (typeof w.startDate === "string" ? w.startDate : w.startDate.toISOString()) : null,
            finishDate: w.finishDate ? (typeof w.finishDate === "string" ? w.finishDate : w.finishDate.toISOString()) : null,
          }))
        );
      }
    } catch {
      notifyError("خطا در بارگذاری فعالیت‌ها");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (w) =>
        w.wbsCode.toLowerCase().includes(q) ||
        w.title.toLowerCase().includes(q)
    );
  }, [items, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.every((w) => next.has(w.id));
      if (allSelected) {
        // Deselect all filtered
        filtered.forEach((w) => next.delete(w.id));
      } else {
        // Select all filtered
        filtered.forEach((w) => next.add(w.id));
      }
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/wbs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "خطا در حذف");
      }
      notifySuccess(`${json.deleted.toLocaleString("fa-IR")} فعالیت حذف شد`);
      setSelectedIds(new Set());
      setConfirmOpen(false);
      fetchItems();
    } catch (e: any) {
      notifyError(e.message || "خطا در حذف");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        در حال بارگذاری...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        هیچ فعالیت WBS وجود ندارد
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="جستجو بر اساس کد یا عنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Badge variant="secondary" className="font-num">
          {selectedIds.size.toLocaleString("fa-IR")} انتخاب شده
        </Badge>
        <Badge variant="outline" className="font-num">
          {filtered.length.toLocaleString("fa-IR")} مورد
        </Badge>
      </div>

      <div className="flex items-center justify-between border-b pb-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={filtered.length > 0 && filtered.every((w) => selectedIds.has(w.id))}
            onCheckedChange={toggleAllFiltered}
          />
          <span>انتخاب همه ({filtered.length.toLocaleString("fa-IR")})</span>
        </label>
        <Button
          size="sm"
          variant="destructive"
          disabled={selectedIds.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="w-4 h-4 ml-1" />
          حذف انتخاب‌شده‌ها ({selectedIds.size.toLocaleString("fa-IR")})
        </Button>
      </div>

      <ScrollArea className="h-[400px] border rounded-md">
        <div className="divide-y">
          {filtered.map((w) => {
            const checked = selectedIds.has(w.id);
            const pct = Math.round((w.progressActual || 0) * 100);
            return (
              <label
                key={w.id}
                className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer ${
                  checked ? "bg-red-50 dark:bg-red-950/20" : ""
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(w.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      {w.wbsCode}
                    </Badge>
                    <span className="text-sm font-medium truncate">{w.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>سطح: <span className="font-num">{w.level.toLocaleString("fa-IR")}</span></span>
                    <span>پایان: {formatJalali(w.finishDate)}</span>
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-[10px] text-center mt-1 font-num text-muted-foreground">
                    {pct.toLocaleString("fa-IR")}%
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </ScrollArea>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تایید حذف دسته‌ای</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف {selectedIds.size.toLocaleString("fa-IR")} فعالیت WBS مطمئن هستید؟
              این عملیات قابل بازگشت نیست و زیرفعالیت‌های مرتبط نیز حذف خواهند شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال حذف...</>
              ) : (
                <><Trash2 className="w-4 h-4 ml-1" /> تایید و حذف</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
