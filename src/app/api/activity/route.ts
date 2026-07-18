import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.activity.findMany({
    include: {
      asset: true,
      personAssignments: { include: { personel: true } },
      orgAssignments: { include: { orgChart: true } },
      _count: { select: { statusUpdates: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.code || !data.title) {
    return NextResponse.json({ error: "کد و عنوان الزامی است" }, { status: 400 });
  }

  const dup = await db.activity.findUnique({ where: { code: data.code } });
  if (dup) return NextResponse.json({ error: "کد فعالیت تکراری است" }, { status: 400 });

  try {
    const a = await db.activity.create({
      data: {
        code: data.code,
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
