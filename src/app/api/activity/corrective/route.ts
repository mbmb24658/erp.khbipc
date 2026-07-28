import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST: Create a corrective activity from a delay cause
// Body: {
//   delayCauseId: string,
//   parentActivityId?: string,    // (for WBS, this is the WBS id stored as string)
//   parentActivityTitle?: string,
//   strategicTopic?: string,
//   hrPlan?: string,              // JSON string of org position IDs
//   hrActual?: string,            // JSON string of personel IDs
//   responsibleUserId?: string,   // single user to notify (optional)
// }
//
// Logic:
// 1. Fetch the DelayCause to get solution, impactPercent, durationDays, unit, warning
// 2. Auto-generate activity code (ACT-NNN)
// 3. Create Activity (corrective) with computed urgency/priority/dates
// 4. Sync ActivityPerson from hrActual
// 5. If warning exists, send notification to all responsible users
// 6. Return the created activity
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.delayCauseId) {
    return NextResponse.json({ error: "شناسه علت تاخیر الزامی است" }, { status: 400 });
  }

  try {
    // 1. Fetch the delay cause
    const cause = await db.delayCause.findUnique({
      where: { id: data.delayCauseId },
    });
    if (!cause) {
      return NextResponse.json({ error: "علت تاخیر یافت نشد" }, { status: 404 });
    }

    // Resolve parent activity (Activity) if parentActivityId refers to an Activity
    let parentActivity: any = null;
    if (data.parentActivityId) {
      parentActivity = await db.activity.findUnique({
        where: { id: data.parentActivityId },
        select: {
          id: true,
          code: true,
          title: true,
          strategicTopic: true,
          hrPlan: true,
          hrActual: true,
          wbsId: true,
        },
      });
    }

    // Resolve strategic topic: prefer body, then parent activity, then parent WBS
    let strategicTopic = data.strategicTopic || parentActivity?.strategicTopic || null;
    if (!strategicTopic && parentActivity?.wbsId) {
      const parentWbs = await db.wBS.findUnique({
        where: { id: parentActivity.wbsId },
        select: { strategicTopic: true },
      });
      strategicTopic = parentWbs?.strategicTopic || null;
    }

    // Resolve hrPlan / hrActual: prefer body, then parent activity
    const hrPlan = data.hrPlan || parentActivity?.hrPlan || null;
    let hrActual = data.hrActual || parentActivity?.hrActual || null;
    let hrActualIds: string[] = [];
    try {
      const parsed = hrActual ? JSON.parse(hrActual) : [];
      if (Array.isArray(parsed)) hrActualIds = parsed;
    } catch {
      // ignore
    }

    // 2. Auto-generate code: ACT-001, ACT-002, ...
    const lastActivity = await db.activity.findFirst({
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let newCode = "ACT-001";
    if (lastActivity?.code) {
      const match = lastActivity.code.match(/ACT-(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1]) + 1;
        newCode = `ACT-${String(nextNum).padStart(3, "0")}`;
      }
    }

    // 3a. Compute urgency from impactPercent
    const impact = cause.impactPercent ?? 0;
    let urgency = "normal";
    if (impact > 0.8) urgency = "urgent";
    else if (impact > 0.5) urgency = "high";

    // 3b. Compute priority (1-5)
    const priority = Math.max(1, Math.min(5, Math.round(impact * 5)));

    // 3c. Compute end date from durationDays + unit
    const startDate = new Date();
    const endDate = new Date(startDate);
    const unit = (cause.unit || "روز").trim();
    const dur = cause.durationDays ?? 0;
    switch (unit) {
      case "فوری":
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "مستمر":
        endDate.setDate(endDate.getDate() + 365);
        break;
      case "هفته":
        endDate.setDate(endDate.getDate() + dur * 7);
        break;
      case "ماه":
        endDate.setDate(endDate.getDate() + dur * 30);
        break;
      case "روز":
      default:
        endDate.setDate(endDate.getDate() + (dur || 1));
        break;
    }

    const title = `فعالیت اصلاحی: ${cause.solution}`;
    const parentTitle = data.parentActivityTitle || parentActivity?.title || "—";
    const description = `راهکار برای «${cause.rootCause}» - ${cause.solution}\nفعالیت مرجع: ${parentTitle}`;

    // 3d. Create the corrective activity
    const activity = await db.activity.create({
      data: {
        code: newCode,
        title,
        description,
        assetId: null,
        wbsId: parentActivity?.wbsId || null,
        startDate,
        endDate,
        durationDays: Math.max(
          1,
          Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        ),
        urgency,
        priority,
        status: "pending",
        progressPct: 0,
        hrPlan,
        hrActual,
        isCorrective: true,
        parentActivityId: data.parentActivityId || null,
        delayCauseId: cause.id,
        strategicTopic,
        notes: cause.warning || null,
        createdById: (session.user as any).id,
      },
    });

    // 4. Sync ActivityPerson from hrActual
    if (hrActualIds.length > 0) {
      for (const personelId of hrActualIds) {
        try {
          await db.activityPerson.create({
            data: { activityId: activity.id, personelId, role: "مسئول اصلاحی" },
          });
        } catch {
          // Skip duplicates / invalid personelId
        }
      }
    }

    // 5. If warning exists, send notification to all responsible users
    if (cause.warning) {
      // Determine recipients: from responsibleUserId (if provided) or all linked personnel
      const recipientPersonelIds = new Set<string>();
      if (data.responsibleUserId) {
        // Resolve personel from user
        const u = await db.user.findUnique({
          where: { id: data.responsibleUserId },
          select: { personelId: true },
        });
        if (u?.personelId) recipientPersonelIds.add(u.personelId);
      }
      for (const pid of hrActualIds) recipientPersonelIds.add(pid);

      // Resolve users for each personel
      const personelIds = Array.from(recipientPersonelIds);
      const users = personelIds.length
        ? await db.user.findMany({
            where: { personelId: { in: personelIds } },
            select: { id: true },
          })
        : [];

      // Create notifications (one per user)
      const notifTitle = `هشدار تأخیر: ${cause.mainCategory} - ${cause.subCategory}`;
      const notifMessage = `${cause.warning}\nراهکار: ${cause.solution}\nفعالیت اصلاحی: ${activity.code}`;
      for (const u of users) {
        await db.notification.create({
          data: {
            userId: u.id,
            title: notifTitle,
            message: notifMessage,
            category: "delay_cause",
            priority: urgency,
            actionUrl: `/activities/${activity.id}`,
          },
        });
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity.corrective.create",
        description: `ایجاد فعالیت اصلاحی ${activity.code} برای علت تأخیر ${cause.mainCategory}/${cause.subCategory}`,
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
