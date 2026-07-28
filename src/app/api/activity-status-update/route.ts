import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const activityId = searchParams.get("activityId");
  const items = await db.activityStatusUpdate.findMany({
    where: activityId ? { activityId } : undefined,
    include: { personel: true, activity: true },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

// POST: Create a status update for an Activity.
// Body: {
//   activityId: string,
//   newStatus: string,
//   progressPct?: number,        // 0-100
//   notes?: string,
//   delayCauseIds?: string[],    // array of DelayCause IDs (when delayed)
// }
//
// Side effects:
// - Saves the status update (with delayCauseIds JSON)
// - Updates the parent Activity status + progress
// - For each delayCauseId, creates a corrective activity (isCorrective=true)
//   and (if delay cause has warning) sends a notification to all responsible users.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.activityId || !data.newStatus) {
    return NextResponse.json(
      { error: "شناسه فعالیت و وضعیت جدید الزامی است" },
      { status: 400 }
    );
  }

  try {
    const activity = await db.activity.findUnique({
      where: { id: data.activityId },
    });
    if (!activity) return NextResponse.json({ error: "فعالیت یافت نشد" }, { status: 404 });

    // Find personel from session user
    let personelId: string | null = null;
    const userId = (session.user as any).id;
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user?.personelId) personelId = user.personelId;
    }

    // Normalize delayCauseIds (must be array of strings)
    let delayCauseIds: string[] = [];
    if (Array.isArray(data.delayCauseIds)) {
      delayCauseIds = data.delayCauseIds.filter(
        (x: any) => typeof x === "string" && x.length > 0
      );
    }
    const delayCauseIdsJson =
      delayCauseIds.length > 0 ? JSON.stringify(delayCauseIds) : null;

    const update = await db.activityStatusUpdate.create({
      data: {
        activityId: data.activityId,
        personelId,
        previousStatus: activity.status,
        newStatus: data.newStatus,
        progressPct: data.progressPct ?? null,
        delayCauseIds: delayCauseIdsJson,
        notes: data.notes || null,
      },
    });

    // Update the parent activity status + progress
    await db.activity.update({
      where: { id: data.activityId },
      data: {
        status: data.newStatus,
        progressPct:
          data.progressPct !== undefined ? data.progressPct : activity.progressPct,
      },
    });

    // ----- Auto-create corrective activities for each delay cause -----
    // Skip if the parent activity is itself a corrective activity.
    const createdActivities: any[] = [];
    if (delayCauseIds.length > 0 && !activity.isCorrective) {
      const causes = await db.delayCause.findMany({
        where: { id: { in: delayCauseIds } },
      });

      for (const cause of causes) {
        // Auto-generate code: ACT-001, ACT-002, ...
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

        // Compute urgency from impactPercent
        const impact = cause.impactPercent ?? 0;
        let urgency = "normal";
        if (impact > 0.8) urgency = "urgent";
        else if (impact > 0.5) urgency = "high";
        const priority = Math.max(1, Math.min(5, Math.round(impact * 5)));

        // Compute end date
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
        const description = `راهکار برای «${cause.rootCause}» - ${cause.solution}\nفعالیت مرجع: ${activity.code} - ${activity.title}`;

        const corrective = await db.activity.create({
          data: {
            code: newCode,
            title,
            description,
            assetId: activity.assetId || null,
            wbsId: activity.wbsId || null,
            startDate,
            endDate,
            durationDays: Math.max(
              1,
              Math.round(
                (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
              )
            ),
            urgency,
            priority,
            status: "pending",
            progressPct: 0,
            hrPlan: activity.hrPlan || null,
            hrActual: activity.hrActual || null,
            isCorrective: true,
            parentActivityId: activity.id,
            delayCauseId: cause.id,
            strategicTopic: activity.strategicTopic || null,
            notes: cause.warning || null,
            createdById: userId,
          },
        });

        // Sync ActivityPerson from hrActual
        let hrActualIds: string[] = [];
        try {
          const parsed = activity.hrActual ? JSON.parse(activity.hrActual) : [];
          if (Array.isArray(parsed)) hrActualIds = parsed;
        } catch {
          // ignore
        }
        for (const pid of hrActualIds) {
          try {
            await db.activityPerson.create({
              data: {
                activityId: corrective.id,
                personelId: pid,
                role: "مسئول اصلاحی",
              },
            });
          } catch {
            // Skip duplicates / invalid personelId
          }
        }

        // Send warning notification to all responsible users
        if (cause.warning) {
          const personelIds = Array.from(new Set(hrActualIds));
          const users = personelIds.length
            ? await db.user.findMany({
                where: { personelId: { in: personelIds } },
                select: { id: true },
              })
            : [];
          const notifTitle = `هشدار تأخیر: ${cause.mainCategory} - ${cause.subCategory}`;
          const notifMessage = `${cause.warning}\nراهکار: ${cause.solution}\nفعالیت اصلاحی: ${corrective.code}`;
          for (const u of users) {
            await db.notification.create({
              data: {
                userId: u.id,
                title: notifTitle,
                message: notifMessage,
                category: "delay_cause",
                priority: urgency,
                actionUrl: `/activities/${corrective.id}`,
              },
            });
          }
        }

        createdActivities.push(corrective);
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity_status.update",
        description:
          `بروزرسانی وضعیت فعالیت ${activity.code} به ${data.newStatus}` +
          (createdActivities.length > 0
            ? ` — ${createdActivities.length} فعالیت اصلاحی ایجاد شد`
            : ""),
      },
    });

    return NextResponse.json(
      { update, correctiveActivities: createdActivities },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
