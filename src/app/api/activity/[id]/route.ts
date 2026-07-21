import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.activity.findUnique({
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
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const existing = await db.activity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.activity.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد فعالیت تکراری است" }, { status: 400 });
  }

  // ----- Auto-link hrPlan → hrActual -----
  // If hrPlan is explicitly provided in the PUT, find personnel assigned to
  // those org positions and merge them into hrActual (preserving existing).
  let finalHrActual = data.hrActual === undefined ? existing.hrActual : (data.hrActual || null);
  let hrActualIds: string[] = [];
  if (data.hrPlan !== undefined && data.hrPlan) {
    try {
      const orgPositionIds: string[] = JSON.parse(data.hrPlan);
      if (Array.isArray(orgPositionIds) && orgPositionIds.length > 0) {
        const personnelInPositions = await db.personel.findMany({
          where: { orgChartId: { in: orgPositionIds } },
          select: { id: true },
        });
        let existingActual: string[] = [];
        try {
          const baseHrActual = data.hrActual !== undefined ? data.hrActual : existing.hrActual;
          const parsed = baseHrActual ? JSON.parse(baseHrActual) : [];
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
  } else if (data.hrActual !== undefined && data.hrActual) {
    try {
      const parsed = JSON.parse(data.hrActual);
      if (Array.isArray(parsed)) hrActualIds = parsed;
    } catch {
      // ignore
    }
  } else if (data.hrActual === undefined && existing.hrActual) {
    // No change to hrActual in this PUT — sync from existing.hrActual
    try {
      const parsed = JSON.parse(existing.hrActual);
      if (Array.isArray(parsed)) hrActualIds = parsed;
    } catch {
      // ignore
    }
  }

  try {
    const a = await db.activity.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        description: data.description === undefined ? existing.description : data.description || null,
        assetId: data.assetId === undefined ? existing.assetId : data.assetId || null,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
        durationDays: data.durationDays ?? existing.durationDays,
        urgency: data.urgency ?? existing.urgency,
        priority: data.priority ?? existing.priority,
        status: data.status ?? existing.status,
        progressPct: data.progressPct ?? existing.progressPct,
        hrPlan: data.hrPlan === undefined ? existing.hrPlan : (data.hrPlan || null),
        hrActual: finalHrActual,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
      },
    });

    // Sync ActivityPerson records from the final hrActual (so they appear in personAssignments)
    // Only sync when hrPlan was provided OR hrActual was explicitly changed.
    if (data.hrPlan !== undefined || data.hrActual !== undefined) {
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
        action: "activity.update",
        description: `ویرایش فعالیت ${a.code}: ${a.title}`,
      },
    });

    return NextResponse.json(a);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.activity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.activity.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "activity.delete",
        description: `حذف فعالیت ${existing.code}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
