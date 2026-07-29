import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserDashboard as UserDashboardClient } from "../user-dashboard";

export const dynamic = "force-dynamic";

// =====================================================================
// کارپوشه (Personal Workspace) — server component
// Shows activities assigned to the current user (both PMS and جاری),
// grouped by strategic topic, with filters and recent status updates.
// Works for ALL users including admin (admin also has a position).
// =====================================================================
export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        لطفاً وارد شوید
      </div>
    );
  }

  const userId = (session.user as any).id;
  const role = (session.user as any)?.role || "user";

  // Resolve the user's linked personel record
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          personelId: true,
          personel: { select: { name: true, orgChartId: true } },
        },
      })
    : null;

  const personelId = user?.personelId || null;
  const personName = user?.personel?.name || session.user?.name || "کاربر";

  if (!personelId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>حساب کاربری شما به پرسنل متصل نیست.</p>
        <p className="text-xs mt-2">برای مشاهده کارپوشه، ادمین باید حساب شما را به یک پرسنل متصل کند.</p>
      </div>
    );
  }

  // Fetch activities assigned to this person
  const assignedActivities = await db.activity.findMany({
    where: {
      personAssignments: { some: { personelId } },
    },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      durationDays: true,
      urgency: true,
      status: true,
      progressPct: true,
      priority: true,
      strategicTopic: true,
      isCorrective: true,
      wbsId: true,
      updatedAt: true,
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  // Build a lookup map of WBS strategic topics (id → strategicTopic derived from wbsCode)
  // This is used as a fallback when Activity.strategicTopic is null but the activity
  // is linked to a WBS via wbsId.
  const activityWbsIds = assignedActivities
    .map((a) => a.wbsId)
    .filter((id): id is string => !!id);
  let wbsTopicLookup: Record<string, string | null> = {};
  if (activityWbsIds.length > 0) {
    try {
      const wbsRows = await db.$queryRawUnsafe<
        { id: string; wbsCode: string; strategicTopic: string | null }[]
      >(
        `SELECT "id", "wbsCode", "strategicTopic" FROM "WBS" WHERE "id" IN (${activityWbsIds
          .map((_, i) => `$${i + 1}`)
          .join(",")})`,
        ...activityWbsIds
      );
      for (const w of Array.isArray(wbsRows) ? wbsRows : []) {
        // Prefer explicit strategicTopic; fall back to derived from wbsCode
        if (w.strategicTopic) {
          wbsTopicLookup[w.id] = w.strategicTopic;
        } else if (w.wbsCode) {
          const parts = String(w.wbsCode).split(".");
          wbsTopicLookup[w.id] = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
        }
      }
    } catch {
      // ignore — fall back to null
    }
  }

  // Fetch WBS activities assigned to this user (via hrActual JSON array)
  // Include strategicTopic in the select; if Prisma client doesn't have the field
  // (e.g. on a stale deployment), the raw fallback below computes it from wbsCode.
  const allWbs = await db.wBS.findMany({
    where: {
      level: { gte: 4 },
      OR: [{ startDate: { not: null } }, { finishDate: { not: null } }],
    },
    select: {
      id: true,
      wbsCode: true,
      title: true,
      startDate: true,
      finishDate: true,
      progressPlan: true,
      progressActual: true,
      urgency: true,
      priority: true,
      hrActual: true,
      hrPlan: true,
      strategicTopic: true,
      updatedAt: true,
    },
  });

  // Get the user's orgChartId
  const personelRec = await db.personel.findUnique({
    where: { id: personelId },
    select: { orgChartId: true },
  });
  const userOrgChartId = personelRec?.orgChartId || null;

  // Filter WBS where user's personelId is in hrActual
  const userWbsActivities = allWbs
    .filter((w) => {
      if (!w.hrActual) return false;
      try {
        const ids: string[] = JSON.parse(w.hrActual);
        return Array.isArray(ids) && ids.includes(personelId);
      } catch {
        return false;
      }
    })
    .map((w) => {
      const derivedStatus =
        w.progressActual >= 1 ? "completed" :
        w.progressActual > 0 ? "in_progress" : "pending";
      // Check if user's org position is in hrPlan
      let needsMe = false;
      if (w.hrPlan && userOrgChartId) {
        try {
          const planIds: string[] = JSON.parse(w.hrPlan);
          needsMe = Array.isArray(planIds) && planIds.includes(userOrgChartId);
        } catch {
          // ignore
        }
      }
      return {
        id: w.id,
        code: w.wbsCode,
        title: w.title,
        description: null as string | null,
        startDate: w.startDate ? w.startDate.toISOString() : null,
        endDate: w.finishDate ? w.finishDate.toISOString() : null,
        durationDays: null as number | null,
        urgency: w.urgency || "normal",
        priority: w.priority ?? 3,
        status: derivedStatus,
        progressPct: (w.progressActual || 0) * 100,
        updatedAt: w.updatedAt.toISOString(),
        type: "pms" as const,
        // Prefer explicit strategicTopic from DB; fall back to derived from wbsCode
        strategicTopic:
          (w as any).strategicTopic ||
          (w.wbsCode
            ? (() => {
                const parts = String(w.wbsCode).split(".");
                return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
              })()
            : null),
        isCorrective: false,
        needsMe,
      };
    });

  // Fetch unread notifications for this user
  const unreadNotifs = await db.notification.findMany({
    where: {
      userId,
      isRead: false,
      actionUrl: { startsWith: "/activities/" },
    },
    select: { actionUrl: true },
  });
  const notifActivityIds = unreadNotifs
    .map((n) => n.actionUrl?.split("/activities/")[1])
    .filter((x): x is string => !!x);

  // Merge activities (filter out completed)
  const serialized = [
    ...assignedActivities
      .filter((a) => a.status !== "completed" && (a.progressPct || 0) < 100)
      .map((a) => ({
        id: a.id,
        code: a.code,
        title: a.title,
        description: a.description,
        startDate: a.startDate ? a.startDate.toISOString() : null,
        endDate: a.endDate ? a.endDate.toISOString() : null,
        durationDays: a.durationDays,
        urgency: a.urgency,
        priority: a.priority,
        status: a.status,
        progressPct: a.progressPct,
        updatedAt: a.updatedAt.toISOString(),
        type: "activity" as const,
        // Use Activity.strategicTopic if set; otherwise derive from linked WBS
        strategicTopic:
          a.strategicTopic ||
          (a.wbsId ? wbsTopicLookup[a.wbsId] || null : null) ||
          null,
        isCorrective: a.isCorrective || false,
        needsMe: false,
      })),
    ...userWbsActivities.filter((w) => w.status !== "completed" && (w.progressPct || 0) < 100),
  ];

  // Fetch recent status updates
  const myActivityIds = assignedActivities.map((a) => a.id);
  const myWbsIds = userWbsActivities.map((w) => w.id);

  let wbsStatusUpdates: any[] = [];
  let activityStatusUpdates: any[] = [];

  try {
    wbsStatusUpdates = await (db as any).wBSStatusUpdate?.findMany({
      where: { wbsId: { in: myWbsIds } },
      include: {
        personel: { select: { name: true } },
        wbs: { select: { wbsCode: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }) ?? [];
  } catch {
    // Table might not exist
  }

  try {
    activityStatusUpdates = await db.activityStatusUpdate.findMany({
      where: { activityId: { in: myActivityIds } },
      include: {
        personel: { select: { name: true } },
        activity: { select: { code: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch {
    // Skip
  }

  const recentStatusUpdates = [
    ...wbsStatusUpdates.map((su: any) => ({
      id: su.id,
      entityType: "wbs" as const,
      entityId: su.wbsId,
      entityCode: su.wbs?.wbsCode || "",
      entityTitle: su.wbs?.title || "",
      previousStatus: su.previousStatus,
      newStatus: su.newStatus,
      progressPct: su.progressPct,
      notes: su.notes,
      createdAt: su.createdAt.toISOString(),
      personelName: su.personel?.name || null,
    })),
    ...activityStatusUpdates.map((su: any) => ({
      id: su.id,
      entityType: "activity" as const,
      entityId: su.activityId,
      entityCode: su.activity?.code || "",
      entityTitle: su.activity?.title || "",
      previousStatus: su.previousStatus,
      newStatus: su.newStatus,
      progressPct: su.progressPct,
      notes: su.notes,
      createdAt: su.createdAt.toISOString(),
      personelName: su.personel?.name || null,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <UserDashboardClient
      activities={serialized}
      personName={personName}
      notifActivityIds={notifActivityIds}
      statusUpdates={recentStatusUpdates}
    />
  );
}
