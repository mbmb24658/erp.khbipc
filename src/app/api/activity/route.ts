import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role || "user";
  const userId = (session.user as any)?.id;

  let where: any = {};
  if (role !== "admin") {
    // Find the user's personelId
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { personelId: true },
    });
    if (user?.personelId) {
      where.personAssignments = { some: { personelId: user.personelId } };
    } else {
      // No personel linked — return empty
      return NextResponse.json([]);
    }
  }

  const items = await db.activity.findMany({
    where,
    include: {
      asset: true,
      wbs: true,
      personAssignments: { include: { personel: true } },
      orgAssignments: { include: { orgChart: true } },
      _count: { select: { statusUpdates: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.title) {
    return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
  }

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

  // ----- Auto-link hrPlan → hrActual -----
  // If hrPlan (org position IDs) is provided, find personnel assigned to those
  // org positions and merge them into hrActual (no duplicates).
  let finalHrActual = data.hrActual || null;
  let hrActualIds: string[] = [];
  if (data.hrPlan) {
    try {
      const orgPositionIds: string[] = JSON.parse(data.hrPlan);
      if (Array.isArray(orgPositionIds) && orgPositionIds.length > 0) {
        const personnelInPositions = await db.personel.findMany({
          where: { orgChartId: { in: orgPositionIds } },
          select: { id: true },
        });
        let existingActual: string[] = [];
        try {
          const parsed = data.hrActual ? JSON.parse(data.hrActual) : [];
          if (Array.isArray(parsed)) existingActual = parsed;
        } catch {
          // ignore invalid JSON in hrActual
        }
        const merged = [...new Set([...existingActual, ...personnelInPositions.map((p) => p.id)])];
        hrActualIds = merged;
        if (merged.length > 0) {
          finalHrActual = JSON.stringify(merged);
        }
      }
    } catch {
      // If hrPlan is not valid JSON, ignore the auto-link
    }
  } else if (data.hrActual) {
    try {
      const parsed = JSON.parse(data.hrActual);
      if (Array.isArray(parsed)) hrActualIds = parsed;
    } catch {
      // ignore
    }
  }

  try {
    const a = await db.activity.create({
      data: {
        code: newCode,
        title: data.title,
        description: data.description || null,
        assetId: data.assetId || null,
        wbsId: data.wbsId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        durationDays: data.durationDays ?? null,
        urgency: data.urgency || "normal",
        priority: data.priority ?? 3,
        status: data.status || "pending",
        progressPct: data.progressPct ?? 0,
        hrPlan: data.hrPlan || null,
        hrActual: finalHrActual,
        notes: data.notes || null,
        createdById: (session.user as any).id,
      },
    });

    // Sync ActivityPerson records from hrActual (so they appear in personAssignments)
    if (hrActualIds.length > 0) {
      // Delete existing assignments (none for a new activity, but defensive)
      await db.activityPerson.deleteMany({ where: { activityId: a.id } });
      for (const personelId of hrActualIds) {
        try {
          await db.activityPerson.create({
            data: { activityId: a.id, personelId, role: "مسئول" },
          });
        } catch {
          // Skip duplicates / invalid personelId
        }
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity.create",
        description: `ایجاد فعالیت ${a.code}: ${a.title}`,
      },
    });

    return NextResponse.json(a, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
