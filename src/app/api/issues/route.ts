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
}

// GET: Compute issues from all activities (WBS + Activities)
// Available to all authenticated users — non-admins only see activities they're assigned to.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json(issues);
}
