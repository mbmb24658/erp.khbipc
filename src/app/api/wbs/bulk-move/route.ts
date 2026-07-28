import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// POST: Bulk move multiple WBS items to a new parent
// Body: { ids: string[], targetParentId: string | null }
// - Validates no cycles (can't move an item under itself or its descendants)
// - Updates parentId, level, hierarchyPath for each item
// - Recursively updates descendants' levels and paths
export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const { ids, targetParentId } = data;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "حداقل یک فعالیت باید انتخاب شود" }, { status: 400 });
  }

  // If targetParentId is not null, validate it exists
  let targetParent: any = null;
  if (targetParentId) {
    targetParent = await db.wBS.findUnique({
      where: { id: targetParentId },
      select: { id: true, level: true, hierarchyPath: true, wbsCode: true },
    });
    if (!targetParent) {
      return NextResponse.json({ error: "والد هدف یافت نشد" }, { status: 400 });
    }

    // Check for cycles: none of the ids should be the target parent or its descendant
    for (const id of ids) {
      if (id === targetParentId) {
        return NextResponse.json({ error: "نمی‌توان یک فعالیت را به زیرمجموعه خودش منتقل کرد" }, { status: 400 });
      }
    }

    // Collect all descendants of each id being moved
    for (const id of ids) {
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
      if (descendantIds.has(targetParentId)) {
        return NextResponse.json({ error: "انتقال به زیرمجموعه فرزندان مجاز نیست" }, { status: 400 });
      }
    }
  }

  const newLevel = targetParent ? targetParent.level + 1 : 1;
  let movedCount = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const item = await db.wBS.findUnique({
        where: { id },
        select: { id: true, wbsCode: true, level: true, hierarchyPath: true, parentId: true },
      });
      if (!item) {
        errors.push(`فعالیت ${id} یافت نشد`);
        continue;
      }

      // Compute new hierarchyPath
      const newPath = targetParent
        ? `${targetParent.hierarchyPath}/${item.wbsCode}`
        : item.wbsCode.split(".").join("/");

      // Update the item
      await db.wBS.update({
        where: { id },
        data: {
          parentId: targetParentId || null,
          level: newLevel,
          hierarchyPath: newPath,
        },
      });

      // Recursively update descendants
      const levelDelta = newLevel - item.level;
      if (levelDelta !== 0) {
        const queue = [{ id: item.id, level: newLevel, path: newPath }];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = await db.wBS.findMany({
            where: { parentId: current.id },
            select: { id: true, wbsCode: true, level: true, hierarchyPath: true },
          });
          for (const child of children) {
            const childNewLevel = current.level + 1;
            const childNewPath = `${current.path}/${child.wbsCode}`;
            await db.wBS.update({
              where: { id: child.id },
              data: { level: childNewLevel, hierarchyPath: childNewPath },
            });
            queue.push({ id: child.id, level: childNewLevel, path: childNewPath });
          }
        }
      }

      movedCount++;
    } catch (e: any) {
      errors.push(`${id}: ${e.message}`);
    }
  }

  // Log
  try {
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.bulk_move",
        description: `انتقال ${movedCount} فعالیت به والد ${targetParentId || "ریشه"}`,
      },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({
    success: true,
    message: `${movedCount.toLocaleString("fa-IR")} فعالیت منتقل شد`,
    moved: movedCount,
    errors: errors.slice(0, 10),
  });
}
