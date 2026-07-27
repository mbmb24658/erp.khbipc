import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ============================================================
// Types (returned to client)
// ============================================================

interface ReportActivity {
  id: string;
  code: string;
  title: string;
  type: "pms" | "activity";
  priority: number;
  status: string;
  progressPct: number;
  statusChangeCount: number;
  strategicTopic: string | null;
}

interface ReportTopic {
  topic: string;
  label: string;
  progress: number;
  sCurveData: { date: string; planned: number; actual: number }[];
  level3Activities: { name: string; progress: number }[];
  topActivities: ReportActivity[];
}

interface UserActivityRow {
  personelId: string | null;
  name: string;
  statusChangeCount: number;
  lastUpdate: string | null;
}

interface ReportResponse {
  from: string;
  to: string;
  topActivities: ReportActivity[];
  topics: ReportTopic[];
  userActivities: UserActivityRow[];
  progressTrend: { date: string; [user: string]: number | string }[];
  trackingTrend: { date: string; [user: string]: number | string }[];
  creationTrend: { date: string; count: number }[];
  onlineTrend: { date: string; count: number }[];
}

// ============================================================
// Helpers
// ============================================================

const STRATEGIC_TOPICS: { code: string; label: string }[] = [
  { code: "1.1", label: "حکمرانی دارایی‌محور" },
  { code: "1.2", label: "دارایی‌های داخلی" },
  { code: "1.3", label: "دارایی‌های بیرونی" },
  { code: "1.4", label: "دارایی‌های دانشی" },
  { code: "1.5", label: "پایداری مالی" },
];

// Returns YYYY-MM-DD in Gregorian (used as chart x-axis key)
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build a list of dates between two dates (inclusive) at daily granularity
function enumerateDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ============================================================
// Main GET handler
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Defaults: current month (first day → today)
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : defaultTo;
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 1) Status updates in period (both WBS and Activity)
  // ------------------------------------------------------------------
  const [wbsStatusUpdates, activityStatusUpdates] = await Promise.all([
    db.wBSStatusUpdate.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { personel: true, wbs: true },
      orderBy: { createdAt: "asc" },
    }),
    db.activityStatusUpdate.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { personel: true, activity: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // ------------------------------------------------------------------
  // 2) Top 10 activities by priority (had status updates in period)
  // ------------------------------------------------------------------
  // Build a map of entity id → status change count + last entity snapshot
  const entityChangeCount = new Map<string, number>();
  const entityMap = new Map<
    string,
    {
      id: string;
      code: string;
      title: string;
      type: "pms" | "activity";
      priority: number;
      status: string;
      progressPct: number;
      strategicTopic: string | null;
    }
  >();

  for (const su of wbsStatusUpdates) {
    if (!su.wbs) continue;
    const id = `pms:${su.wbs.id}`;
    entityChangeCount.set(id, (entityChangeCount.get(id) ?? 0) + 1);
    entityMap.set(id, {
      id: su.wbs.id,
      code: su.wbs.wbsCode,
      title: su.wbs.title,
      type: "pms",
      priority: su.wbs.priority ?? 3,
      status: su.wbs.status,
      progressPct: Math.round((su.wbs.progressActual ?? 0) * 1000) / 10,
      strategicTopic: su.wbs.strategicTopic ?? null,
    });
  }
  for (const su of activityStatusUpdates) {
    if (!su.activity) continue;
    const id = `activity:${su.activity.id}`;
    entityChangeCount.set(id, (entityChangeCount.get(id) ?? 0) + 1);
    entityMap.set(id, {
      id: su.activity.id,
      code: su.activity.code,
      title: su.activity.title,
      type: "activity",
      priority: su.activity.priority ?? 3,
      status: su.activity.status,
      progressPct: Math.round((su.activity.progressPct ?? 0) * 10) / 10,
      strategicTopic: su.activity.strategicTopic ?? null,
    });
  }

  const topActivities: ReportActivity[] = Array.from(entityMap.entries())
    .map(([key, info]) => ({
      ...info,
      statusChangeCount: entityChangeCount.get(key) ?? 0,
    }))
    .sort((a, b) => {
      // Priority desc, then status change count desc
      const dp = (b.priority ?? 3) - (a.priority ?? 3);
      if (dp !== 0) return dp;
      return b.statusChangeCount - a.statusChangeCount;
    })
    .slice(0, 10);

  // ------------------------------------------------------------------
  // 3) Per-topic aggregation (1.1 to 1.5)
  // ------------------------------------------------------------------
  // Fetch all WBS + Activities with a strategicTopic (we need their snapshot
  // and their status updates for s-curve computation)
  const [allWbs, allActivities] = await Promise.all([
    db.wBS.findMany({
      where: { strategicTopic: { not: null } },
      include: {
        statusUpdates: {
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.activity.findMany({
      where: { strategicTopic: { not: null } },
      include: {
        statusUpdates: {
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  // Group entities by strategic topic
  const topicEntities = new Map<
    string,
    {
      id: string;
      code: string;
      title: string;
      type: "pms" | "activity";
      priority: number;
      status: string;
      progressPct: number;
      level: number;
      startDate: Date | null;
      finishDate: Date | null;
      statusUpdates: { createdAt: Date; progressPct: number | null }[];
    }[]
  >();
  for (const t of STRATEGIC_TOPICS) topicEntities.set(t.code, []);

  for (const w of allWbs) {
    if (!w.strategicTopic) continue;
    const bucket = topicEntities.get(w.strategicTopic);
    if (!bucket) continue;
    bucket.push({
      id: w.id,
      code: w.wbsCode,
      title: w.title,
      type: "pms",
      priority: w.priority ?? 3,
      status: w.status,
      progressPct: Math.round((w.progressActual ?? 0) * 1000) / 10,
      level: w.level,
      startDate: w.startDate,
      finishDate: w.finishDate,
      statusUpdates: w.statusUpdates.map((su) => ({
        createdAt: su.createdAt,
        progressPct: su.progressPct,
      })),
    });
  }
  for (const a of allActivities) {
    if (!a.strategicTopic) continue;
    const bucket = topicEntities.get(a.strategicTopic);
    if (!bucket) continue;
    bucket.push({
      id: a.id,
      code: a.code,
      title: a.title,
      type: "activity",
      priority: a.priority ?? 3,
      status: a.status,
      progressPct: Math.round((a.progressPct ?? 0) * 10) / 10,
      level: 0, // Activity model has no level
      startDate: a.startDate,
      finishDate: a.endDate,
      statusUpdates: a.statusUpdates.map((su) => ({
        createdAt: su.createdAt,
        progressPct: su.progressPct,
      })),
    });
  }

  const days = enumerateDays(from, to);

  const topics: ReportTopic[] = STRATEGIC_TOPICS.map((t) => {
    const entities = topicEntities.get(t.code) ?? [];

    // Overall progress = weighted avg of current progress
    const overallProgress =
      entities.length === 0
        ? 0
        : Math.round(
            (entities.reduce((s, e) => s + (e.progressPct || 0), 0) / entities.length) * 10
          ) / 10;

    // S-curve data: for each day in range, compute planned (linear extrapolation)
    // and actual (avg of last known progress per entity up to that day)
    const sCurveData = days.map((d) => {
      let plannedSum = 0;
      let plannedCount = 0;
      let actualSum = 0;
      let actualCount = 0;
      const dayEndTs = d.getTime() + 24 * 60 * 60 * 1000 - 1;
      for (const e of entities) {
        // Planned: linear based on start/finish dates
        if (e.startDate && e.finishDate) {
          const startTs = e.startDate.getTime();
          const endTs = e.finishDate.getTime();
          const total = endTs - startTs;
          if (total > 0) {
            const elapsed = dayEndTs - startTs;
            const planned = Math.min(100, Math.max(0, (elapsed / total) * 100));
            plannedSum += planned;
            plannedCount++;
          }
        }
        // Actual: last known progress snapshot at or before this day
        const updatesBefore = e.statusUpdates.filter(
          (u) => u.createdAt.getTime() <= dayEndTs && u.progressPct != null
        );
        if (updatesBefore.length > 0) {
          const last = updatesBefore[updatesBefore.length - 1];
          if (last.progressPct != null) {
            actualSum += last.progressPct;
            actualCount++;
          }
        } else {
          // Fall back to current progressPct as a baseline
          actualSum += e.progressPct || 0;
          actualCount++;
        }
      }
      return {
        date: dayKey(d),
        planned: plannedCount > 0 ? Math.round((plannedSum / plannedCount) * 10) / 10 : 0,
        actual: actualCount > 0 ? Math.round((actualSum / actualCount) * 10) / 10 : 0,
      };
    });

    // Level-3 activities (only WBS items at level 3 in this topic)
    const level3Activities = entities
      .filter((e) => e.type === "pms" && e.level === 3)
      .map((e) => ({ name: e.title, progress: e.progressPct || 0 }))
      .slice(0, 20);

    // Top 6 activities (priority desc, then status change count desc)
    const topActivitiesInTopic: ReportActivity[] = entities
      .map((e) => ({
        id: e.id,
        code: e.code,
        title: e.title,
        type: e.type,
        priority: e.priority,
        status: e.status,
        progressPct: e.progressPct,
        statusChangeCount: e.statusUpdates.length,
        strategicTopic: t.code,
      }))
      .sort((a, b) => {
        const dp = (b.priority ?? 3) - (a.priority ?? 3);
        if (dp !== 0) return dp;
        return b.statusChangeCount - a.statusChangeCount;
      })
      .slice(0, 6);

    return {
      topic: t.code,
      label: `${t.code} - ${t.label}`,
      progress: overallProgress,
      sCurveData,
      level3Activities,
      topActivities: topActivitiesInTopic,
    };
  });

  // ------------------------------------------------------------------
  // 4) Per-user activity counts in the period
  // ------------------------------------------------------------------
  const userStatsMap = new Map<
    string,
    { personelId: string; name: string; count: number; lastUpdate: Date | null }
  >();

  for (const su of [...wbsStatusUpdates, ...activityStatusUpdates]) {
    const pid = su.personel?.id ?? "unknown";
    const name = su.personel?.name ?? "سیستم";
    const existing = userStatsMap.get(pid);
    if (existing) {
      existing.count += 1;
      if (!existing.lastUpdate || su.createdAt > existing.lastUpdate) {
        existing.lastUpdate = su.createdAt;
      }
    } else {
      userStatsMap.set(pid, {
        personelId: pid,
        name,
        count: 1,
        lastUpdate: su.createdAt,
      });
    }
  }

  const userActivities: UserActivityRow[] = Array.from(userStatsMap.values())
    .sort((a, b) => b.count - a.count)
    .map((u) => ({
      personelId: u.personelId === "unknown" ? null : u.personelId,
      name: u.name,
      statusChangeCount: u.count,
      lastUpdate: u.lastUpdate ? u.lastUpdate.toISOString() : null,
    }));

  // ------------------------------------------------------------------
  // 5) Progress trend (avg progress per user per day)
  // ------------------------------------------------------------------
  // For each day, for each user, average the progressPct of their status updates on that day
  const progressByDayUser = new Map<string, Map<string, number[]>>();
  for (const su of [...wbsStatusUpdates, ...activityStatusUpdates]) {
    if (su.progressPct == null) continue;
    const dkey = dayKey(su.createdAt);
    const uname = su.personel?.name ?? "سیستم";
    if (!progressByDayUser.has(dkey)) progressByDayUser.set(dkey, new Map());
    const inner = progressByDayUser.get(dkey)!;
    if (!inner.has(uname)) inner.set(uname, []);
    inner.get(uname)!.push(su.progressPct);
  }

  const progressTrend = days.map((d) => {
    const dkey = dayKey(d);
    const row: { date: string; [user: string]: number | string } = { date: dkey };
    const inner = progressByDayUser.get(dkey);
    if (inner) {
      for (const [user, arr] of inner.entries()) {
        const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
        row[user] = Math.round(avg * 10) / 10;
      }
    }
    return row;
  });

  // ------------------------------------------------------------------
  // 6) Tracking trend (count of status updates per user per day)
  // ------------------------------------------------------------------
  const trackingByDayUser = new Map<string, Map<string, number>>();
  for (const su of [...wbsStatusUpdates, ...activityStatusUpdates]) {
    const dkey = dayKey(su.createdAt);
    const uname = su.personel?.name ?? "سیستم";
    if (!trackingByDayUser.has(dkey)) trackingByDayUser.set(dkey, new Map());
    const inner = trackingByDayUser.get(dkey)!;
    inner.set(uname, (inner.get(uname) ?? 0) + 1);
  }

  const trackingTrend = days.map((d) => {
    const dkey = dayKey(d);
    const row: { date: string; [user: string]: number | string } = { date: dkey };
    const inner = trackingByDayUser.get(dkey);
    if (inner) {
      for (const [user, count] of inner.entries()) {
        row[user] = count;
      }
    }
    return row;
  });

  // ------------------------------------------------------------------
  // 7) Creation trend (count of newly created activities per day)
  // ------------------------------------------------------------------
  const [wbsCreatedInPeriod, activitiesCreatedInPeriod] = await Promise.all([
    db.wBS.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    db.activity.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
  ]);
  const creationCount = new Map<string, number>();
  for (const w of [...wbsCreatedInPeriod, ...activitiesCreatedInPeriod]) {
    const dkey = dayKey(w.createdAt);
    creationCount.set(dkey, (creationCount.get(dkey) ?? 0) + 1);
  }
  const creationTrend = days.map((d) => ({
    date: dayKey(d),
    count: creationCount.get(dayKey(d)) ?? 0,
  }));

  // ------------------------------------------------------------------
  // 8) Online trend (count of user log entries per day, as proxy for online activity)
  // ------------------------------------------------------------------
  const userLogs = await db.userLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { createdAt: true, userId: true },
  });
  const onlineCount = new Map<string, Set<string>>();
  for (const log of userLogs) {
    const dkey = dayKey(log.createdAt);
    if (!onlineCount.has(dkey)) onlineCount.set(dkey, new Set());
    if (log.userId) onlineCount.get(dkey)!.add(log.userId);
  }
  const onlineTrend = days.map((d) => ({
    date: dayKey(d),
    count: onlineCount.get(dayKey(d))?.size ?? 0,
  }));

  // ------------------------------------------------------------------
  // Assemble final response
  // ------------------------------------------------------------------
  const response: ReportResponse = {
    from: from.toISOString(),
    to: to.toISOString(),
    topActivities,
    topics,
    userActivities,
    progressTrend,
    trackingTrend,
    creationTrend,
    onlineTrend,
  };

  return NextResponse.json(response);
}
