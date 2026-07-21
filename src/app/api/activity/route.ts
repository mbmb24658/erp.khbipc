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
        hrActual: data.hrActual || null,
        notes: data.notes || null,
        createdById: (session.user as any).id,
      },
    });

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
