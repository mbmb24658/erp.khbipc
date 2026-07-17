"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/data-table";
import { notifySuccess, notifyError } from "@/lib/notify";
import { ArrowRight, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function ProgressUpdatePage() {
  const [uploading, setUploading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    setDownloadLoading(true);
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
      setDownloadLoading(false);
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
            <Button onClick={handleDownload} disabled={downloadLoading} className="w-full">
              {downloadLoading ? (
                <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال تولید...</>
              ) : (
                <><Download className="w-4 h-4 ml-1" /> دانلود فایل اکسل</>
              )}
            </Button>
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
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>

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
