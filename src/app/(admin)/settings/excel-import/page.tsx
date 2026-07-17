"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/data-table";
import { notifySuccess, notifyError } from "@/lib/notify";
import { ArrowRight, Upload, FileSpreadsheet, Database, AlertTriangle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Stats {
  counts: Record<string, number>;
  lastImport: string | null;
}

export default function ExcelImportPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = async () => {
    const res = await fetch("/api/excel-import");
    const json = await res.json();
    setStats(json);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleImport = async () => {
    if (!file) {
      notifyError("ابتدا فایل را انتخاب کنید");
      return;
    }
    if (!file.name.endsWith(".xlsx")) {
      notifyError("فقط فایل‌های .xlsx پشتیبانی می‌شوند");
      return;
    }

    setLoading(true);
    setProgress(10);
    setImportLog([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress(30);

      const res = await fetch("/api/excel-import", {
        method: "POST",
        body: formData,
      });

      setProgress(80);

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "خطا در بازنشانی");
      }

      setProgress(100);
      setImportLog(json.log || []);
      notifySuccess("اطلاعات با موفقیت بازنشانی شد");
      fetchStats();
    } catch (e: any) {
      notifyError(e.message || "خطا در بازنشانی");
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به تنظیمات
        </Link>
      </div>

      <PageHeader
        title="بازنشانی اطلاعات از Excel"
        description="بارگذاری مجدد فایل MASTER_R05.xlsx برای تصحیح بغایت‌ها"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" />
              بارگذاری فایل Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024).toLocaleString("fa-IR")} کیلوبایت
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">برای انتخاب فایل کلیک کنید</p>
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

            {progress > 0 && (
              <div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {loading ? "در حال پردازش..." : "تکمیل شد"}
                </p>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!file || loading}
              className="w-full"
            >
              <Database className="w-4 h-4 ml-1" />
              {loading ? "در حال بازنشانی..." : "شروع بازنشانی اطلاعات"}
            </Button>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium mb-1">توجه:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>این عملیات تمام داده‌های فعلی را حذف و از نو بارگذاری می‌کند</li>
                    <li>فایل باید با ساختار MASTER_R05.xlsx مطابقت داشته باشد</li>
                    <li>کاربر ادمین و تنظیمات سیستم حفظ می‌شوند</li>
                    <li>این عملیات ممکن است چند دقیقه طول بکشد</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" />
              وضعیت فعلی پایگاه داده
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.lastImport && (
              <div className="mb-4 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">آخرین بازنشانی:</p>
                <p className="text-sm font-medium">
                  {new Date(stats.lastImport).toLocaleDateString("fa-IR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {stats?.counts &&
                Object.entries(stats.counts).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2 rounded-md border"
                  >
                    <span className="text-sm">{key}</span>
                    <Badge variant="secondary" className="font-num">
                      {value.toLocaleString("fa-IR")}
                    </Badge>
                  </div>
                ))}
            </div>

            {importLog.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium mb-2">گزارش آخرین عملیات:</p>
                <div className="bg-muted/50 rounded-md p-2 max-h-48 overflow-y-auto scrollbar-thin">
                  {importLog.map((line, i) => (
                    <p key={i} className="text-xs font-mono py-0.5">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Help card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            راهنمای ساختار فایل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <p className="font-medium mb-1">شیت‌های مورد نیاز:</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>WBS — ساختار شکست کار</li>
                <li>Org_Chart — چارت سازمانی و پرسنل</li>
                <li>Cost_Breakdown — شکست هزینه</li>
                <li>Revenue_Breakdown — شکست درآمد</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">ستون‌های اصلی WBS:</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>WBS — کد یکتا (1.2.1.1)</li>
                <li>Task Name — عنوان فعالیت</li>
                <li>Duration, Start, Finish</li>
                <li>% Complete, %Plan</li>
                <li>HR (Plan), HR (Actual)</li>
                <li>ستون‌های ماهانه برای منحنی S</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">نکات مهم:</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>کدهای WBS باید یکتا باشند</li>
                <li>ساختار سلسله‌مراتبی با نقطه مشخص می‌شود</li>
                <li>تاریخ‌ها می‌توانند میلادی یا شمسی باشند</li>
                <li>ستون‌های خالی به صورت null ذخیره می‌شوند</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
