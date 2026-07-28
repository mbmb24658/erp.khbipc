import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ---- Mapping tables ----
const urgencyWeight: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

const urgencyLabel: Record<string, string> = {
  low: "کم",
  normal: "عادی",
  high: "زیاد",
  urgent: "فوری",
};

// Thresholds (consistent with the recommendation engine below)
const HIGH_IMPORTANCE_THRESHOLD = 12; // 60% of max importance (20)
const LOW_FEASIBILITY_THRESHOLD = 0.3;
const MED_FEASIBILITY_THRESHOLD = 0.7;

function getRecommendation(importance: number, feasibility: number): string {
  const isHighImportance = importance >= HIGH_IMPORTANCE_THRESHOLD;
  const isLowFeasibility = feasibility < LOW_FEASIBILITY_THRESHOLD;
  const isMedFeasibility =
    feasibility >= LOW_FEASIBILITY_THRESHOLD && feasibility < MED_FEASIBILITY_THRESHOLD;

  if (isHighImportance && isLowFeasibility) {
    return "استخدام فوری منابع انسانی متخصص یا انتقال پرسنل از سایر واحدها. این فعالیت بحرانی است و بدون تخصیص منابع مناسب، پیشرفت آن متوقف خواهد شد.";
  }
  if (isHighImportance && isMedFeasibility) {
    return "آموزش و توانمندسازی پرسنل موجود. همچنین بررسی امکان برون‌سپاری بخش‌هایی از این فعالیت به پیمانکاران تخصصی.";
  }
  if (!isHighImportance && isLowFeasibility) {
    return "بازنگری در اولویت این فعالیت. در صورت عدم امکان تخصیص منابع، به تعویق یا حذف این فعالیت از برنامه اقدام شود.";
  }
  if (isHighImportance && feasibility >= MED_FEASIBILITY_THRESHOLD) {
    return "این فعالیت در مسیر صحیح قرار دارد. بر تسریع اجرا و رفع موانع احتمالی تمرکز کنید.";
  }
  return "پایش مستمر و بازنگری دوره‌ای. در صورت تغییر شرایط، اولویت و منابع را مجدداً ارزیابی کنید.";
}

function getCriticality(importance: number, feasibility: number): "critical" | "moderate" | "low" {
  const isHighImportance = importance >= HIGH_IMPORTANCE_THRESHOLD;
  const isLowFeasibility = feasibility < LOW_FEASIBILITY_THRESHOLD;
  const isMedFeasibility =
    feasibility >= LOW_FEASIBILITY_THRESHOLD && feasibility < MED_FEASIBILITY_THRESHOLD;

  if (isHighImportance && isLowFeasibility) return "critical";
  if ((isHighImportance && isMedFeasibility) || (!isHighImportance && isLowFeasibility)) {
    return "moderate";
  }
  return "low";
}

interface IssueRow {
  id: string;
  type: "PMS" | "جاری";
  title: string;
  code: string;
  urgency: string;
  urgencyLabel: string;
  priority: number;
  importance: number;
  feasibility: number;
  issueScore: number;
  weightPct: number;
  recommendation: string;
  criticality: "critical" | "moderate" | "low";
  progressActual: number;
  personnelInPositions: number;
  usersFound: number;
  hrPlanCount: number;
  strategicTopic: string | null;
}

// ---- Day-key helper (YYYY-MM-DD Gregorian) ----
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

// Build chart data: for each currently-an-issue entity, attribute it to its
// assigned personnel (by hrActual for WBS, by personAssignments for Activity)
// and count, per day, how many issues each user has (cumulative from createdAt).
function buildDailyIssueCountByUser(
  issuesWithUsers: {
    id: string;
    type: "PMS" | "جاری";
    createdAt: Date;
    personelIds: string[];
  }[],
  from: Date,
  to: Date,
  userLabels: Map<string, string>
): { date: string; [user: string]: number | string }[] {
  const days = enumerateDays(from, to);
  // Pre-group entities by user (cumulative)
  // For each user, list issue createdAt timestamps
  const byUser = new Map<string, Date[]>();
  for (const issue of issuesWithUsers) {
    for (const pid of issue.personelIds) {
      if (!byUser.has(pid)) byUser.set(pid, []);
      byUser.get(pid)!.push(issue.createdAt);
    }
  }

  return days.map((d) => {
    const dkey = dayKey(d);
    const row: { date: string; [user: string]: number | string } = { date: dkey };
    // dayEnd = end of this day
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    for (const [pid, dates] of byUser.entries()) {
      const count = dates.filter((dt) => dt.getTime() <= dayEnd.getTime()).length;
      const label = userLabels.get(pid) || pid;
      row[label] = count;
    }
    return row;
  });
}

// Build chart data for "average delay impact" by group (strategic topic or main category)
function buildAvgDelayImpactByGroup(
  correctiveWithCauses: {
    strategicTopic: string | null;
    delayCause: {
      mainCategory: string;
      subCategory: string;
      impactPercent: number;
    } | null;
  }[],
  groupBy: "topic" | "mainCategory"
): { label: string; value: number; count: number }[] {
  const groups = new Map<string, { sum: number; count: number }>();
  for (const c of correctiveWithCauses) {
    if (!c.delayCause) continue;
    const key =
      groupBy === "topic"
        ? c.strategicTopic || "سایر"
        : c.delayCause.mainCategory || "سایر";
    const entry = groups.get(key) || { sum: 0, count: 0 };
    entry.sum += c.delayCause.impactPercent;
    entry.count += 1;
    groups.set(key, entry);
  }
  return Array.from(groups.entries())
    .map(([label, e]) => ({
      label,
      value: e.count > 0 ? Math.round((e.sum / e.count) * 1000) / 10 : 0, // 0-100 (1 decimal)
      count: e.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Build chart data for "solution implementation progress" trend:
// For each day, compute the average progressPct of corrective activities
// (per strategic topic), using status updates for historical progress and
// falling back to current progressPct for the baseline.
function buildSolutionProgressTrend(
  correctiveActivities: {
    id: string;
    strategicTopic: string | null;
    createdAt: Date;
    progressPct: number;
    statusUpdates: { createdAt: Date; progressPct: number | null }[];
  }[],
  from: Date,
  to: Date
): { date: string; [topic: string]: number | string }[] {
  const days = enumerateDays(from, to);
  const topicLabels = ["1.1", "1.2", "1.3", "1.4", "1.5"];

  return days.map((d) => {
    const dkey = dayKey(d);
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const row: { date: string; [topic: string]: number | string } = { date: dkey };
    for (const topic of topicLabels) {
      const acts = correctiveActivities.filter(
        (a) => (a.strategicTopic || "سایر") === topic && a.createdAt.getTime() <= dayEnd.getTime()
      );
      if (acts.length === 0) {
        row[topic] = 0;
        continue;
      }
      // For each activity, find the latest known progressPct at or before dayEnd
      const progresses = acts.map((a) => {
        const updates = a.statusUpdates
          .filter((u) => u.createdAt.getTime() <= dayEnd.getTime() && u.progressPct != null)
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
        if (updates.length > 0) {
          return updates[updates.length - 1].progressPct!;
        }
        // Fall back: 0 if day < createdAt, else current progressPct (linear baseline)
        // We know createdAt <= dayEnd, so use current progressPct
        return a.progressPct || 0;
      });
      const avg = progresses.reduce((s, v) => s + v, 0) / progresses.length;
      row[topic] = Math.round(avg * 10) / 10;
    }
    return row;
  });
}

// GET: Compute issues from all activities (WBS + Activities)
// Available to all authenticated users — non-admins only see activities they're assigned to.
// Add ?charts=true to also return chart data.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeCharts = url.searchParams.get("charts") === "true";

  const role = (session.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  // ----- 1. Fetch WBS items (only level >= 4 — processes and below) -----
  const wbsItems = await db.wBS.findMany({
    where: { level: { gte: 4 } },
    select: {
      id: true,
      wbsCode: true,
      title: true,
      level: true,
      urgency: true,
      priority: true,
      progressActual: true,
      hrPlan: true,
      hrActual: true,
      strategicTopic: true,
      createdAt: true,
    },
  });

  // ----- 2. Fetch Activities -----
  // Non-admins: only see activities they're assigned to (mirrors /api/activity behavior)
  let activityWhere: any = {};
  if (role !== "admin") {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { personelId: true },
    });
    if (user?.personelId) {
      activityWhere.personAssignments = { some: { personelId: user.personelId } };
    }
  }

  const activities = await db.activity.findMany({
    where: activityWhere,
    select: {
      id: true,
      code: true,
      title: true,
      urgency: true,
      priority: true,
      progressPct: true,
      hrPlan: true,
      strategicTopic: true,
      createdAt: true,
    },
  });

  // ----- 3. Build a single list of "candidate activities" -----
  type Candidate = {
    id: string;
    type: "PMS" | "جاری";
    title: string;
    code: string;
    urgency: string;
    priority: number;
    progressActual: number; // 0..1
    hrPlan: string | null;
    strategicTopic: string | null;
    createdAt: Date;
  };

  const candidates: Candidate[] = [
    ...wbsItems.map((w) => ({
      id: w.id,
      type: "PMS" as const,
      title: w.title,
      code: w.wbsCode,
      urgency: w.urgency || "normal",
      priority: w.priority ?? 3,
      progressActual: w.progressActual ?? 0,
      hrPlan: w.hrPlan,
      strategicTopic: w.strategicTopic || null,
      createdAt: w.createdAt,
    })),
    ...activities.map((a) => ({
      id: a.id,
      type: "جاری" as const,
      title: a.title,
      code: a.code,
      urgency: a.urgency || "normal",
      priority: a.priority ?? 3,
      progressActual: (a.progressPct ?? 0) / 100, // convert 0-100 → 0-1
      hrPlan: a.hrPlan,
      strategicTopic: a.strategicTopic || null,
      createdAt: a.createdAt,
    })),
  ];

  // ----- 4. Collect all unique org position IDs from hrPlan fields -----
  const allOrgIds = new Set<string>();
  for (const c of candidates) {
    if (!c.hrPlan) continue;
    try {
      const ids: unknown = JSON.parse(c.hrPlan);
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") allOrgIds.add(id);
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  // ----- 5. Fetch personnel in those org positions + their User accounts -----
  // Personnel.orgChartId → matches the org IDs in hrPlan
  const personnel = await db.personel.findMany({
    where: { orgChartId: { in: Array.from(allOrgIds) } },
    select: {
      id: true,
      orgChartId: true,
      user: { select: { id: true } }, // null if no linked user
    },
  });

  // Group by orgChartId → list of { id, hasUser }
  const personnelByOrg = new Map<string, { total: number; withUser: number }>();
  for (const p of personnel) {
    if (!p.orgChartId) continue;
    const entry = personnelByOrg.get(p.orgChartId) || { total: 0, withUser: 0 };
    entry.total += 1;
    if (p.user) entry.withUser += 1;
    personnelByOrg.set(p.orgChartId, entry);
  }

  // ----- 6. Compute issues -----
  const issues: IssueRow[] = [];
  // For chart data: track issues with their createdAt + assigned personelIds
  const issuesWithUsers: {
    id: string;
    type: "PMS" | "جاری";
    createdAt: Date;
    personelIds: string[];
  }[] = [];

  for (const c of candidates) {
    // a) importance = urgencyWeight × priority
    const uWeight = urgencyWeight[c.urgency] ?? urgencyWeight.normal;
    const importance = uWeight * c.priority;

    // b) feasibility = check if hrPlan personnel are system users
    let feasibility: number;
    let personnelInPositions = 0;
    let usersFound = 0;
    let hrPlanCount = 0;

    if (!c.hrPlan) {
      // No HR requirement → fully feasible
      feasibility = 1.0;
    } else {
      let orgIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(c.hrPlan);
        if (Array.isArray(parsed)) {
          orgIds = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        // ignore
      }
      hrPlanCount = orgIds.length;

      if (orgIds.length === 0) {
        // No positions specified → no requirement → feasible
        feasibility = 1.0;
      } else {
        // Sum totals across all linked org positions
        for (const oid of orgIds) {
          const entry = personnelByOrg.get(oid);
          if (entry) {
            personnelInPositions += entry.total;
            usersFound += entry.withUser;
          }
        }

        if (personnelInPositions === 0) {
          // No personnel at all assigned to those org positions
          if (c.progressActual > 0) {
            feasibility = 0.5; // work has started somehow but no users
          } else {
            feasibility = 0;
          }
        } else {
          feasibility = usersFound / personnelInPositions;
        }
      }
    }

    // c) issue_score = importance × (1 - feasibility)
    const issueScore = importance * (1 - feasibility);

    // Only items with issue_score > 0 are issues
    if (issueScore <= 0) continue;

    const criticality = getCriticality(importance, feasibility);
    const recommendation = getRecommendation(importance, feasibility);

    issues.push({
      id: c.id,
      type: c.type,
      title: c.title,
      code: c.code,
      urgency: c.urgency,
      urgencyLabel: urgencyLabel[c.urgency] || c.urgency,
      priority: c.priority,
      importance,
      feasibility: Math.round(feasibility * 1000) / 1000,
      issueScore: Math.round(issueScore * 1000) / 1000,
      weightPct: 0, // computed below
      recommendation,
      criticality,
      progressActual: c.progressActual,
      personnelInPositions,
      usersFound,
      hrPlanCount,
      strategicTopic: c.strategicTopic,
    });

    // For chart data: also collect assigned personnel for this issue
    let personelIds: string[] = [];
    if (c.type === "PMS") {
      // WBS: pull personnel from hrActual of the wbsItems list
      const w = wbsItems.find((x) => x.id === c.id);
      if (w?.hrActual) {
        try {
          const parsed = JSON.parse(w.hrActual);
          if (Array.isArray(parsed)) {
            personelIds = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          // ignore
        }
      }
    } else {
      // Activity: use personAssignments
      const fullActivity = await db.activity.findUnique({
        where: { id: c.id },
        select: {
          personAssignments: { select: { personelId: true } },
        },
      });
      if (fullActivity) {
        personelIds = fullActivity.personAssignments.map((p) => p.personelId);
      }
    }
    issuesWithUsers.push({
      id: c.id,
      type: c.type,
      createdAt: c.createdAt,
      personelIds,
    });
  }

  // ----- 7. Sort by issue_score descending -----
  issues.sort((a, b) => b.issueScore - a.issueScore);

  // ----- 8. Calculate weight percentage: issue_score / sum(all_issue_scores) × 100 -----
  const totalScore = issues.reduce((sum, i) => sum + i.issueScore, 0);
  if (totalScore > 0) {
    for (const i of issues) {
      i.weightPct = Math.round((i.issueScore / totalScore) * 1000) / 10; // 1 decimal
    }
  }

  // ----- 9. Chart data (optional) -----
  let charts: any = null;
  if (includeCharts) {
    // Build user label map (personelId → person name)
    const allPersonelIds = new Set<string>();
    for (const iwu of issuesWithUsers) {
      for (const pid of iwu.personelIds) allPersonelIds.add(pid);
    }
    const personelRecords = allPersonelIds.size
      ? await db.personel.findMany({
          where: { id: { in: Array.from(allPersonelIds) } },
          select: { id: true, name: true },
        })
      : [];
    const userLabels = new Map<string, string>();
    for (const p of personelRecords) userLabels.set(p.id, p.name);

    const now = new Date();
    // Last 30 days
    const last30From = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const last30To = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // All-time: from the earliest issue createdAt to now
    let allTimeFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 365);
    if (issuesWithUsers.length > 0) {
      const earliest = issuesWithUsers.reduce(
        (min, i) => (i.createdAt.getTime() < min.getTime() ? i.createdAt : min),
        issuesWithUsers[0].createdAt
      );
      allTimeFrom = new Date(
        earliest.getFullYear(),
        earliest.getMonth(),
        earliest.getDate()
      );
    }

    const daily30 = buildDailyIssueCountByUser(
      issuesWithUsers,
      last30From,
      last30To,
      userLabels
    );
    const dailyAll = buildDailyIssueCountByUser(
      issuesWithUsers,
      allTimeFrom,
      last30To,
      userLabels
    );

    // Fetch corrective activities with their linked DelayCause + status updates
    const correctiveActivities = await db.activity.findMany({
      where: { isCorrective: true, delayCauseId: { not: null } },
      select: {
        id: true,
        strategicTopic: true,
        createdAt: true,
        progressPct: true,
        delayCauseId: true,
        statusUpdates: {
          select: { createdAt: true, progressPct: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const delayCauseIds = Array.from(
      new Set(
        correctiveActivities
          .map((a) => a.delayCauseId)
          .filter((x): x is string => !!x)
      )
    );
    const causes = delayCauseIds.length
      ? await db.delayCause.findMany({
          where: { id: { in: delayCauseIds } },
          select: { id: true, mainCategory: true, subCategory: true, impactPercent: true },
        })
      : [];
    const causeMap = new Map(causes.map((c) => [c.id, c]));

    const correctiveWithCauses = correctiveActivities.map((a) => ({
      strategicTopic: a.strategicTopic,
      delayCause: a.delayCauseId ? causeMap.get(a.delayCauseId) || null : null,
    }));

    const impactByTopic = buildAvgDelayImpactByGroup(correctiveWithCauses, "topic");
    const impactByMainCategory = buildAvgDelayImpactByGroup(
      correctiveWithCauses,
      "mainCategory"
    );

    // Solution progress trend (last 90 days for performance)
    const trendFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
    const solutionTrend = buildSolutionProgressTrend(
      correctiveActivities.map((a) => ({
        id: a.id,
        strategicTopic: a.strategicTopic,
        createdAt: a.createdAt,
        progressPct: a.progressPct,
        statusUpdates: a.statusUpdates.map((u) => ({
          createdAt: u.createdAt,
          progressPct: u.progressPct,
        })),
      })),
      trendFrom,
      last30To
    );

    charts = {
      daily30,
      dailyAll,
      impactByTopic,
      impactByMainCategory,
      solutionTrend,
    };
  }

  if (includeCharts) {
    return NextResponse.json({ issues, charts });
  }
  return NextResponse.json(issues);
}
