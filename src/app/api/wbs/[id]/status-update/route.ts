import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List status updates for a WBS item (or all)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const items = await db.wBSStatusUpdate.findMany({
    where: { wbsId: id },
    include: { personel: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items);
}

// POST: Create a status update for a WBS item
// Body: {
//   newStatus: string,
//   progressPct?: number,         // 0-100
//   notes?: string,
//   delayCauseIds?: string[],     // array of DelayCause IDs (when delayed)
// }
//
// Side effects:
// - Saves the status update with delayCauseIds as a JSON string
// - Updates the WBS status + progressActual
// - For each delayCauseId, creates a corrective activity (isCorrective=true)
//   linked to a new Activity; if the delay cause has a warning, sends a notification.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  if (!data.newStatus) {
    return NextResponse.json({ error: "وضعیت جدید الزامی است" }, { status: 400 });
  }

  try {
    const wbs = await db.wBS.findUnique({ where: { id } });
    if (!wbs) return NextResponse.json({ error: "فعالیت یافت نشد" }, { status: 404 });

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

    const update = await db.wBSStatusUpdate.create({
      data: {
        wbsId: id,
        personelId,
        previousStatus: wbs.status,
        newStatus: data.newStatus,
        progressPct: data.progressPct !== undefined ? Number(data.progressPct) : null,
        delayCauseIds: delayCauseIdsJson,
        notes: data.notes || null,
      },
    });

    // Update the parent WBS status + progressActual
    // progressPct comes in as 0-100, store as decimal 0-1
    const newProgressActual =
      data.progressPct !== undefined
        ? Number(data.progressPct) / 100
        : wbs.progressActual;

    await db.wBS.update({
      where: { id },
      data: {
        status: data.newStatus,
        progressActual: newProgressActual,
      },
    });

    // ----- Auto-create corrective activities for each delay cause -----
    const createdActivities: any[] = [];
    if (delayCauseIds.length > 0) {
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
        const description = `راهکار برای «${cause.rootCause}» - ${cause.solution}\nفعالیت مرجع (WBS): ${wbs.wbsCode} - ${wbs.title}`;

        const activity = await db.activity.create({
          data: {
            code: newCode,
            title,
            description,
            assetId: null,
            wbsId: wbs.id,
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
            hrPlan: wbs.hrPlan || null,
            hrActual: wbs.hrActual || null,
            isCorrective: true,
            parentActivityId: wbs.id, // WBS id as parent reference
            delayCauseId: cause.id,
            strategicTopic: wbs.strategicTopic || null,
            notes: cause.warning || null,
            createdById: userId,
          },
        });

        // Sync ActivityPerson from hrActual
        let hrActualIds: string[] = [];
        try {
          const parsed = wbs.hrActual ? JSON.parse(wbs.hrActual) : [];
          if (Array.isArray(parsed)) hrActualIds = parsed;
        } catch {
          // ignore
        }
        for (const pid of hrActualIds) {
          try {
            await db.activityPerson.create({
              data: { activityId: activity.id, personelId: pid, role: "مسئول اصلاحی" },
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

        createdActivities.push(activity);
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs_status.update",
        description:
          `بروزرسانی وضعیت فعالیت ${wbs.wbsCode} به ${data.newStatus}` +
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
