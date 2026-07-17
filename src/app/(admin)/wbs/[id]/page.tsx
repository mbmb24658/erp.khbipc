import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Users,
  DollarSign,
  AlertTriangle,
  Target,
  Package,
  TrendingUp,
} from "lucide-react";
import { WBSDetailClient } from "./wbs-detail-client";

export const dynamic = "force-dynamic";

export default async function WBSDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wbs = await db.wBS.findUnique({
    where: { id },
    include: {
      parent: true,
      children: { orderBy: { wbsCode: "asc" } },
      personels: { include: { personel: true } },
      orgPositions: { include: { orgChart: true } },
      monthlyProgress: { orderBy: { monthDate: "asc" } },
      costs: true,
      revenues: true,
      assets: true,
      kpis: true,
      risks: true,
    },
  });

  if (!wbs) notFound();

  const progressPlanPct = Math.round(wbs.progressPlan * 100);
  const progressActualPct = Math.round(wbs.progressActual * 100);
  const variance = progressActualPct - progressPlanPct;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/wbs" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />
          بازگشت به لیست WBS
        </Link>
      </div>

      <WBSDetailClient wbs={JSON.parse(JSON.stringify(wbs))} />

      <div className="grid gap-6 mt-6">
        {/* Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono">{wbs.wbsCode}</Badge>
                  <Badge variant="secondary">سطح {wbs.level.toLocaleString("fa-IR")}</Badge>
                  {wbs.parent && (
                    <Link href={`/wbs/${wbs.parent.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                      والد: {wbs.parent.wbsCode} - {wbs.parent.title}
                    </Link>
                  )}
                </div>
                <h1 className="text-2xl font-bold">{wbs.title}</h1>
                {wbs.description && (
                  <p className="text-sm text-muted-foreground mt-2">{wbs.description}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress section */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">پیشرفت برنامه‌ریزی شده</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{progressPlanPct.toLocaleString("fa-IR")}%</p>
              <Progress value={progressPlanPct} className="mt-2 h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">پیشرفت واقعی</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {progressActualPct.toLocaleString("fa-IR")}%
              </p>
              <Progress value={progressActualPct} className="mt-2 h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">انحراف از برنامه</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {variance >= 0 ? "+" : ""}{variance.toLocaleString("fa-IR")}%
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {variance >= 0 ? "جلوتر از برنامه" : "عقب‌تر از برنامه"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Schedule & Resources */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">مدت زمان</p>
                <p className="text-lg font-bold">{wbs.durationDays.toLocaleString("fa-IR")} روز</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">شروع</p>
                <p className="text-sm font-bold">
                  {wbs.startDate ? new Date(wbs.startDate).toLocaleDateString("fa-IR") : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">پایان</p>
                <p className="text-sm font-bold">
                  {wbs.finishDate ? new Date(wbs.finishDate).toLocaleDateString("fa-IR") : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-violet-500" />
              <div>
                <p className="text-sm text-muted-foreground">منابع انسانی</p>
                <p className="text-lg font-bold">{wbs.personels.length.toLocaleString("fa-IR")} نفر</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* EVM */}
        {(wbs.actualCost !== null || wbs.costVariance !== null || wbs.scheduleVariance !== null) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">مدیریت ارزش کسب‌شده (EVM)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">هزینه واقعی (AC)</p>
                  <p className="text-lg font-bold font-num">
                    {wbs.actualCost !== null ? wbs.actualCost.toLocaleString("fa-IR") : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">انحراف هزینه (CV)</p>
                  <p className={`text-lg font-bold font-num ${(wbs.costVariance ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {wbs.costVariance !== null ? wbs.costVariance.toLocaleString("fa-IR") : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">انحراف زمانی (SV)</p>
                  <p className={`text-lg font-bold font-num ${(wbs.scheduleVariance ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {wbs.scheduleVariance !== null ? wbs.scheduleVariance.toLocaleString("fa-IR") : "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Children */}
        {wbs.children.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                زیرفعالیت‌ها ({wbs.children.length.toLocaleString("fa-IR")})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {wbs.children.map((c) => (
                  <Link
                    key={c.id}
                    href={`/wbs/${c.id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 border-b last:border-0"
                  >
                    <Badge variant="outline" className="font-mono">{c.wbsCode}</Badge>
                    <span className="text-sm flex-1 truncate">{c.title}</span>
                    <Badge variant="secondary" className="font-num text-xs">
                      {Math.round(c.progressActual * 100).toLocaleString("fa-IR")}%
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personnel */}
        {wbs.personels.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                منابع انسانی تخصیص‌یافته
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {wbs.personels.map((p) => (
                  <Link
                    key={p.id}
                    href={`/hr?personel=${p.personel.id}`}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 border"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">
                      {p.personel.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.personel.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.role || p.personel.personelId}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Related modules */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <DollarSign className="w-6 h-6 text-amber-500 mb-2" />
              <p className="text-2xl font-bold">{wbs.costs.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سرفصل‌های هزینه</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <TrendingUp className="w-6 h-6 text-emerald-500 mb-2" />
              <p className="text-2xl font-bold">{wbs.revenues.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سرفصل‌های درآمد</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Package className="w-6 h-6 text-purple-500 mb-2" />
              <p className="text-2xl font-bold">{wbs.assets.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">دارایی‌ها</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mb-2" />
              <p className="text-2xl font-bold">{wbs.risks.length.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">ریسک‌ها</p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly progress (S-Curve data) */}
        {wbs.monthlyProgress.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">پیشرفت ماهانه (منحنی S)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right py-2 px-2">ماه</th>
                      <th className="text-left py-2 px-2">پیشرفت برنامه‌ریزی شده</th>
                      <th className="text-left py-2 px-2">پیشرفت واقعی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wbs.monthlyProgress.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 px-2">
                          {new Date(m.monthDate).toLocaleDateString("fa-IR", { year: "numeric", month: "long" })}
                        </td>
                        <td className="py-2 px-2 text-left font-num">
                          {Math.round(m.plannedPct * 100).toLocaleString("fa-IR")}%
                        </td>
                        <td className="py-2 px-2 text-left font-num">
                          {m.actualPct !== null ? Math.round(m.actualPct * 100).toLocaleString("fa-IR") + "%" : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
