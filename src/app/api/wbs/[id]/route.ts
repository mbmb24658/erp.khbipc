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
  const wbs = await db.wBS.findUnique({
    where: { id },
    include: {
      parent: true,
      children: { orderBy: { wbsCode: "asc" } },
      personels: { include: { personel: true } },
      orgPositions: { include: { orgChart: true } },
      monthlyProgress: { orderBy: { monthDate: "asc" } },
      costs: true,
      revenues: true,
      assets: true,
      kpis: true,
      risks: true,
      _count: { select: { children: true, personels: true, costs: true, revenues: true, risks: true } },
    },
  });

  if (!wbs) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(wbs);
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

  const existing = await db.wBS.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.wbsCode && data.wbsCode !== existing.wbsCode) {
    const dup = await db.wBS.findUnique({ where: { wbsCode: data.wbsCode } });
    if (dup) return NextResponse.json({ error: "کد WBS تکراری است" }, { status: 400 });
  }

  // Determine new parentId (treat "" as null)
  const newParentId =
    data.parentId === undefined ? existing.parentId : data.parentId || null;
  const parentChanged = newParentId !== existing.parentId;

  // Cycle prevention: don't allow moving a WBS under itself or any of its descendants
  if (parentChanged && newParentId) {
    if (newParentId === id) {
      return NextResponse.json(
        { error: "یک فعالیت نمی‌تواند والد خودش باشد" },
        { status: 400 }
      );
    }
    // Collect all descendant ids via BFS
    const descendantIds = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await db.wBS.findMany({
        where: { parentId: current },
        select: { id: true },
      });
      for (const c of children) {
        if (!descendantIds.has(c.id)) {
          descendantIds.add(c.id);
          queue.push(c.id);
        }
      }
    }
    if (descendantIds.has(newParentId)) {
      return NextResponse.json(
        { error: "یک فعالیت نمی‌تواند به زیرمجموعه فرزندان خودش منتقل شود (این باعث حلقه می‌شود)" },
        { status: 400 }
      );
    }
  }

  // If parent changed, fetch new parent and recompute level + hierarchyPath
  let newParent: { level: number; hierarchyPath: string } | null = null;
  if (parentChanged && newParentId) {
    newParent = await db.wBS.findUnique({
      where: { id: newParentId },
      select: { level: true, hierarchyPath: true },
    });
    if (!newParent) {
      return NextResponse.json({ error: "والد مورد نظر یافت نشد" }, { status: 400 });
    }
  }

  // Validate that the wbsCode matches its new level's format
  // (e.g. a level-3 item should have a code like "1.2.3")
  const newWbsCode = data.wbsCode ?? existing.wbsCode;
  const finalLevel = parentChanged
    ? (newParent ? newParent.level + 1 : 1)
    : (data.level ?? existing.level);
  const codeDepth = newWbsCode.split(".").filter(Boolean).length;
  if (codeDepth !== finalLevel) {
    // We allow this but warn in the response (don't block — let user fix code manually)
    console.warn(`[wbs.update] Code "${newWbsCode}" depth (${codeDepth}) != level (${finalLevel})`);
  }

  // Compute level: if parent changed, recompute; otherwise honor explicit data.level
  let newLevel: number;
  if (parentChanged) {
    newLevel = newParent ? newParent.level + 1 : 1;
  } else {
    newLevel = data.level ?? existing.level;
  }

  // Compute hierarchyPath:
  //  - If parent changed, base it on the new parent's hierarchyPath
  //  - Otherwise, derive from the wbsCode (replace "." with "/")
  let hierarchyPath: string;
  if (parentChanged && newParent) {
    hierarchyPath = `${newParent.hierarchyPath}/${newWbsCode}`;
  } else if (parentChanged && !newParent) {
    // Moved to root: use wbsCode as-is
    hierarchyPath = newWbsCode.split(".").join("/");
  } else {
    hierarchyPath = newWbsCode.split(".").join("/");
  }

  // ----- Auto-link hrPlan → hrActual -----
  // If hrPlan is explicitly provided in the PUT, find personnel assigned to
  // those org positions and merge them into hrActual (preserving existing).
  let finalHrActual = data.hrActual === undefined ? existing.hrActual : (data.hrActual || null);
  if (data.hrPlan !== undefined && data.hrPlan) {
    try {
      const orgPositionIds: string[] = JSON.parse(data.hrPlan);
      if (Array.isArray(orgPositionIds) && orgPositionIds.length > 0) {
        const personnelInPositions = await db.personel.findMany({
          where: { orgChartId: { in: orgPositionIds } },
          select: { id: true },
        });
        if (personnelInPositions.length > 0) {
          let existingActual: string[] = [];
          try {
            const baseHrActual = data.hrActual !== undefined ? data.hrActual : existing.hrActual;
            const parsed = baseHrActual ? JSON.parse(baseHrActual) : [];
            if (Array.isArray(parsed)) existingActual = parsed;
          } catch {
            // ignore invalid JSON in hrActual
          }
          const merged = [...new Set([...existingActual, ...personnelInPositions.map((p) => p.id)])];
          finalHrActual = JSON.stringify(merged);
        }
      }
    } catch {
      // If hrPlan is not valid JSON, ignore the auto-link
    }
  } else if (data.hrPlan === null || data.hrPlan === "") {
    // hrPlan explicitly cleared — leave hrActual as-is (don't auto-strip)
  }

  try {
    const wbs = await db.wBS.update({
      where: { id },
      data: {
        wbsCode: newWbsCode,
        title: data.title ?? existing.title,
        parentId: newParentId,
        level: newLevel,
        hierarchyPath,
        durationDays: data.durationDays ?? existing.durationDays,
        progressPlan: data.progressPlan ?? existing.progressPlan,
        progressActual: data.progressActual ?? existing.progressActual,
        startDate: data.startDate ? new Date(data.startDate) : data.startDate === null ? null : existing.startDate,
        finishDate: data.finishDate ? new Date(data.finishDate) : data.finishDate === null ? null : existing.finishDate,
        startDateJalali: data.startDateJalali ?? existing.startDateJalali,
        finishDateJalali: data.finishDateJalali ?? existing.finishDateJalali,
        hrPlan: data.hrPlan === undefined ? existing.hrPlan : (data.hrPlan || null),
        hrActual: finalHrActual,
        actualCost: data.actualCost ?? existing.actualCost,
        costVariance: data.costVariance ?? existing.costVariance,
        scheduleVariance: data.scheduleVariance ?? existing.scheduleVariance,
        dayComplete: data.dayComplete ?? existing.dayComplete,
        requiredOrgPositionId: data.requiredOrgPositionId === undefined ? existing.requiredOrgPositionId : (data.requiredOrgPositionId || null),
        urgency: data.urgency ?? existing.urgency,
        priority: data.priority ?? existing.priority,
        description: data.description ?? existing.description,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.update",
        description: `ویرایش فعالیت ${wbs.wbsCode}: ${wbs.title}`,
      },
    });

    // If parent (and therefore level) changed, recursively update descendants' levels
    if (parentChanged) {
      const levelDelta = wbs.level - existing.level;
      if (levelDelta !== 0) {
        // BFS through descendants, updating each one's level + hierarchyPath
        const queue = [{ id: wbs.id, level: wbs.level, hierarchyPath: wbs.hierarchyPath }];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = await db.wBS.findMany({
            where: { parentId: current.id },
            select: { id: true, wbsCode: true, level: true, hierarchyPath: true },
          });
          for (const child of children) {
            const childNewLevel = current.level + 1;
            const childNewPath = `${current.hierarchyPath}/${child.wbsCode}`;
            await db.wBS.update({
              where: { id: child.id },
              data: { level: childNewLevel, hierarchyPath: childNewPath },
            });
            queue.push({ id: child.id, level: childNewLevel, hierarchyPath: childNewPath });
          }
        }
      }
    }

    return NextResponse.json(wbs);
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
  const existing = await db.wBS.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.wBS.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.delete",
        description: `حذف فعالیت ${existing.wbsCode}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
