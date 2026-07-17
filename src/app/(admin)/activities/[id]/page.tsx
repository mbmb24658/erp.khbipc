import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  Calendar,
  Clock,
  CheckCircle2,
  Users,
  Building,
  Activity as ActivityIcon,
} from "lucide-react";
import { ActivityDetailClient, RemoveAssignmentClient } from "./activity-detail-client";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activity = await db.activity.findUnique({
    where: { id },
    include: {
      asset: true,
      wbs: true,
      personAssignments: { include: { personel: true } },
      orgAssignments: { include: { orgChart: true } },
      statusUpdates: {
        include: { personel: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!activity) notFound();

  const data = JSON.parse(JSON.stringify(activity));

  const urgencyMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    low: { label: "کم", variant: "secondary" },
    normal: { label: "عادی", variant: "outline" },
    high: { label: "زیاد", variant: "default" },
    urgent: { label: "فوری", variant: "destructive" },
  };
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "در انتظار", variant: "secondary" },
    in_progress: { label: "در حال انجام", variant: "default" },
    completed: { label: "تکمیل شده", variant: "outline" },
    cancelled: { label: "لغو شده", variant: "destructive" },
    on_hold: { label: "متوقف", variant: "secondary" },
  };
  const us = urgencyMap[data.urgency] || { label: data.urgency, variant: "secondary" as const };
  const ss = statusMap[data.status] || { label: data.status, variant: "secondary" as const };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/activities" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />
          بازگشت به لیست فعالیت‌ها
        </Link>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className="font-mono">{data.code}</Badge>
                <Badge variant={us.variant}>{us.label}</Badge>
                <Badge variant={ss.variant}>{ss.label}</Badge>
                <Badge variant="secondary">اولویت: {data.priority.toLocaleString("fa-IR")}</Badge>
              </div>
              <h1 className="text-2xl font-bold">{data.title}</h1>
              {data.description && (
                <p className="text-sm text-muted-foreground mt-2">{data.description}</p>
              )}
            </div>
            <ActivityDetailClient activity={data} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">درصد پیشرفت</span>
              <span className="font-num font-medium">{Math.round(data.progressPct).toLocaleString("fa-IR")}%</span>
            </div>
            <Progress value={data.progressPct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">شروع</p>
              <p className="text-sm font-bold">
                {data.startDate ? new Date(data.startDate).toLocaleDateString("fa-IR") : "-"}
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
                {data.endDate ? new Date(data.endDate).toLocaleDateString("fa-IR") : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-sm text-muted-foreground">مدت زمان</p>
              <p className="text-lg font-bold">
                {data.durationDays != null ? `${data.durationDays.toLocaleString("fa-IR")} روز` : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ActivityIcon className="w-8 h-8 text-violet-500" />
            <div>
              <p className="text-sm text-muted-foreground">دارایی</p>
              <p className="text-sm font-bold truncate">
                {data.asset ? `${data.asset.assetId} - ${data.asset.title}` : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              اشخاص تخصیص‌یافته ({data.personAssignments.length.toLocaleString("fa-IR")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.personAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">شخصی تخصیص نیافته است</p>
            ) : (
              <div className="space-y-2">
                {data.personAssignments.map((pa: any) => (
                  <RemoveAssignmentClient
                    key={pa.id}
                    id={pa.id}
                    name={pa.personel.name}
                    code={pa.personel.personelId}
                    role={pa.role}
                    type="person"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4" />
              سمت‌های سازمانی ({data.orgAssignments.length.toLocaleString("fa-IR")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.orgAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">سمتی تخصیص نیافته است</p>
            ) : (
              <div className="space-y-2">
                {data.orgAssignments.map((oa: any) => (
                  <RemoveAssignmentClient
                    key={oa.id}
                    id={oa.id}
                    name={oa.orgChart.position}
                    code={oa.orgChart.orgId}
                    role={oa.role}
                    type="org"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">یادداشت</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            تاریخچه بروزرسانی وضعیت ({data.statusUpdates.length.toLocaleString("fa-IR")})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.statusUpdates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">هنوز بروزرسانی ثبت نشده است</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {data.statusUpdates.map((su: any) => (
                <div key={su.id} className="border-r-2 border-muted pr-3 pb-3">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge variant="outline">{su.previousStatus || "-"}</Badge>
                    <ArrowRight className="w-3 h-3" />
                    <Badge variant="default">{su.newStatus}</Badge>
                    {su.progressPct != null && (
                      <Badge variant="secondary" className="font-num">
                        پیشرفت: {Math.round(su.progressPct).toLocaleString("fa-IR")}%
                      </Badge>
                    )}
                    <span className="text-muted-foreground mr-auto">
                      {new Date(su.createdAt).toLocaleString("fa-IR")}
                    </span>
                  </div>
                  {su.personel && (
                    <p className="text-xs text-muted-foreground mt-1">
                      توسط: {su.personel.name}
                    </p>
                  )}
                  {su.notes && (
                    <p className="text-sm mt-1">{su.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
