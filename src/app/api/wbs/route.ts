import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");
  const parentId = searchParams.get("parentId");
  const search = searchParams.get("search");
  const limit = Number(searchParams.get("limit") || 1000);

  const where: any = {};
  if (level) where.level = Number(level);
  if (parentId) where.parentId = parentId;
  if (search) {
    where.OR = [
      { wbsCode: { contains: search } },
      { title: { contains: search } },
    ];
  }

  const items = await db.wBS.findMany({
    where,
    include: {
      _count: { select: { children: true, personels: true } },
    },
    orderBy: [{ level: "asc" }, { wbsCode: "asc" }],
    take: limit,
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();

  // Validate required
  if (!data.wbsCode || !data.title) {
    return NextResponse.json({ error: "کد و عنوان الزامی است" }, { status: 400 });
  }

  // Check for duplicate wbsCode (must be unique across all WBS)
  const existing = await db.wBS.findUnique({ where: { wbsCode: data.wbsCode } });
  if (existing) {
    return NextResponse.json({ error: "این کد WBS قبلاً ثبت شده است" }, { status: 400 });
  }

  // Validate parent exists
  let parentLevel = 0;
  let parentHierarchyPath = "";
  if (data.parentId) {
    const parent = await db.wBS.findUnique({
      where: { id: data.parentId },
      select: { id: true, level: true, hierarchyPath: true, wbsCode: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "والد مورد نظر یافت نشد" }, { status: 400 });
    }
    parentLevel = parent.level;
    parentHierarchyPath = parent.hierarchyPath;

    // Check for duplicate title under the same parent (warn, don't block)
    const siblingWithSameTitle = await db.wBS.findFirst({
      where: { parentId: data.parentId, title: data.title },
    });
    if (siblingWithSameTitle) {
      return NextResponse.json(
        { error: `فعالیتی با عنوان «${data.title}» در همین والد وجود دارد` },
        { status: 400 }
      );
    }
  } else {
    // Root-level: check for duplicate title among root items
    const rootWithSameTitle = await db.wBS.findFirst({
      where: { parentId: null, title: data.title },
    });
    if (rootWithSameTitle) {
      return NextResponse.json(
        { error: `فعالیتی با عنوان «${data.title}» در سطح ریشه وجود دارد` },
        { status: 400 }
      );
    }
  }

  // Compute level: if parent specified, level = parent.level + 1; else from wbsCode depth
  const codeDepth = data.wbsCode.split(".").filter(Boolean).length;
  const level = data.parentId ? parentLevel + 1 : (data.level || codeDepth);

  // Build hierarchy path
  const hierarchyPath = data.parentId
    ? `${parentHierarchyPath}/${data.wbsCode}`
    : data.wbsCode.split(".").join("/");

  try {
    const wbs = await db.wBS.create({
      data: {
        wbsCode: data.wbsCode,
        title: data.title,
        parentId: data.parentId || null,
        level,
        hierarchyPath,
        durationDays: data.durationDays ?? 0,
        progressPlan: data.progressPlan ?? 0,
        progressActual: data.progressActual ?? 0,
        startDate: data.startDate ? new Date(data.startDate) : null,
        finishDate: data.finishDate ? new Date(data.finishDate) : null,
        startDateJalali: data.startDateJalali || null,
        finishDateJalali: data.finishDateJalali || null,
        hrPlan: data.hrPlan || null,
        hrActual: data.hrActual || null,
        actualCost: data.actualCost ?? null,
        costVariance: data.costVariance ?? null,
        scheduleVariance: data.scheduleVariance ?? null,
        dayComplete: data.dayComplete ?? null,
        requiredOrgPositionId: data.requiredOrgPositionId || null,
        description: data.description || null,
      },
    });

    // Log action
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.create",
        description: `ایجاد فعالیت ${wbs.wbsCode}: ${wbs.title}`,
      },
    });

    return NextResponse.json(wbs, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
