"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DebugDbPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDebug = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debug-db");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setData({ error: e.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDebug();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">دیباگ پایگاه داده</h1>
            <p className="text-sm text-muted-foreground mt-1">
              این صفحه برای عیب‌یابی مشکلات ورود استفاده می‌شود
            </p>
          </div>
          <Button onClick={fetchDebug} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? "animate-spin" : ""}`} />
            بروزرسانی
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">در حال بارگذاری...</p>}

        {data?.error && (
          <Alert variant="destructive">
            <XCircle className="w-4 h-4" />
            <AlertTitle>خطا</AlertTitle>
            <AlertDescription>{data.error}</AlertDescription>
          </Alert>
        )}

        {data && !data.error && (
          <>
            {/* Environment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">محیط اجرا</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm font-mono">
                <Row label="NODE_ENV" value={data.environment.NODE_ENV} />
                <Row label="cwd (process working dir)" value={data.environment.cwd} />
                <Row label="DATABASE_URL" value={data.environment.DATABASE_URL} />
                <Row
                  label="مسیر واقعی دیتابیس"
                  value={data.environment.resolvedDbPath}
                />
                <Row
                  label="فایل دیتابیس وجود دارد؟"
                  value={
                    data.environment.dbExists ? (
                      <Badge className="bg-emerald-500">
                        <CheckCircle className="w-3 h-3 ml-1" />
                        بله ({data.environment.dbSizeBytes.toLocaleString("fa-IR")} بایت)
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="w-3 h-3 ml-1" />
                        خیر
                      </Badge>
                    )
                  }
                />
              </CardContent>
            </Card>

            {/* Database contents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">محتویات دیتابیس</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="تعداد کاربران" value={data.database.userCount} />
                <Row label="تعداد فعالیت‌های WBS" value={data.database.wbsCount} />

                {data.database.adminUser ? (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <p className="font-semibold">کاربر ادمین:</p>
                    <Row label="username" value={data.database.adminUser.username} />
                    <Row label="email" value={data.database.adminUser.email} />
                    <Row
                      label="isActive"
                      value={
                        data.database.adminUser.isActive ? (
                          <Badge className="bg-emerald-500">بله</Badge>
                        ) : (
                          <Badge variant="destructive">خیر</Badge>
                        )
                      }
                    />
                    <Row
                      label="passwordHash"
                      value={
                        data.database.adminUser.hasPasswordHash ? (
                          <Badge variant="secondary">
                            موجود ({data.database.adminUser.passwordHashPrefix}...)
                          </Badge>
                        ) : (
                          <Badge variant="destructive">missing</Badge>
                        )
                      }
                    />
                    <Row label="role" value={data.database.adminUser.role} />
                    <Row
                      label="lastLoginAt"
                      value={
                        data.database.adminUser.lastLoginAt
                          ? new Date(data.database.adminUser.lastLoginAt).toLocaleString("fa-IR")
                          : "هرگز"
                      }
                    />
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertTitle>کاربر ادمین وجود ندارد!</AlertTitle>
                    <AlertDescription>
                      برای ایجاد کاربر ادمین، در خط فرمان اجرا کنید:
                      <pre className="mt-2 p-2 bg-muted rounded text-xs">
                        npm run seed:admin
                      </pre>
                    </AlertDescription>
                  </Alert>
                )}

                {data.database.dbError && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertTitle>خطای دیتابیس</AlertTitle>
                    <AlertDescription className="font-mono text-xs">
                      {data.database.dbError}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* NextAuth */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">NextAuth</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm font-mono">
                <Row label="NEXTAUTH_URL" value={data.nextAuth.NEXTAUTH_URL} />
                <Row
                  label="NEXTAUTH_SECRET"
                  value={
                    data.nextAuth.NEXTAUTH_SECRET_set ? (
                      <Badge className="bg-emerald-500">set</Badge>
                    ) : (
                      <Badge variant="destructive">missing</Badge>
                    )
                  }
                />
              </CardContent>
            </Card>

            {/* Diagnosis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">تشخیص خودکار</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!data.environment.dbExists && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertTitle>دیتابیس یافت نشد</AlertTitle>
                    <AlertDescription>
                      فایل دیتابیس در مسیر مورد نظر وجود ندارد. اجرا کنید:
                      <pre className="mt-2 p-2 bg-muted rounded text-xs">
                        npm run seed:admin{"\n"}npm run import:excel
                      </pre>
                    </AlertDescription>
                  </Alert>
                )}

                {data.environment.dbExists && data.database.adminUser === null && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertTitle>کاربر ادمین در دیتابیس نیست</AlertTitle>
                    <AlertDescription>
                      دیتابیس موجود است اما کاربری با username=admin پیدا نشد. اجرا کنید:
                      <pre className="mt-2 p-2 bg-muted rounded text-xs">npm run seed:admin</pre>
                    </AlertDescription>
                  </Alert>
                )}

                {data.environment.dbExists &&
                  data.database.adminUser &&
                  !data.database.adminUser.isActive && (
                    <Alert variant="destructive">
                      <XCircle className="w-4 h-4" />
                      <AlertTitle>کاربر ادمین غیرفعال است</AlertTitle>
                      <AlertDescription>
                        حساب کاربری ادمین موجود است اما isActive=false است.
                      </AlertDescription>
                    </Alert>
                  )}

                {data.environment.dbExists &&
                  data.database.adminUser &&
                  data.database.adminUser.isActive &&
                  !data.database.adminUser.hasPasswordHash && (
                    <Alert variant="destructive">
                      <XCircle className="w-4 h-4" />
                      <AlertTitle>رمز عبور تنظیم نشده</AlertTitle>
                      <AlertDescription>
                        کاربر ادمین passwordHash ندارد. اجرا کنید:
                        <pre className="mt-2 p-2 bg-muted rounded text-xs">npm run seed:admin</pre>
                      </AlertDescription>
                    </Alert>
                  )}

                {data.environment.dbExists &&
                  data.database.adminUser &&
                  data.database.adminUser.isActive &&
                  data.database.adminUser.hasPasswordHash && (
                    <Alert>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <AlertTitle>همه چیز درست به نظر می‌رسد</AlertTitle>
                      <AlertDescription>
                        کاربر ادمین موجود، فعال و دارای رمز عبور است. اگر هنوز نمی‌توانید وارد
                        شوید، ممکن است مشکل از CSRF یا NEXTAUTH_SECRET باشد. مطمئن شوید که
                        NEXTAUTH_URL با آدرس واقعی سرور (مثلاً{" "}
                        <code>http://localhost:3000</code>) مطابقت دارد.
                      </AlertDescription>
                    </Alert>
                  )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-left break-all">{value}</span>
    </div>
  );
}
