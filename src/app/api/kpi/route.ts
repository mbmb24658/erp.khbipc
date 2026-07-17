import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.kPI.findMany({
    include: {
      wbs: true,
      orgChart: true,
      _count: { select: { assignments: true } },
    },
    orderBy: [{ code: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.code || !data.title) {
    return NextResponse.json({ error: "کد و عنوان شاخص الزامی است" }, { status: 400 });
  }

  const dup = await db.kPI.findUnique({ where: { code: data.code } });
  if (dup) return NextResponse.json({ error: "کد شاخص تکراری است" }, { status: 400 });

  try {
    const p = await db.kPI.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        weight: data.weight ?? 1.0,
        targetValue: data.targetValue ?? null,
        unit: data.unit || null,
        frequency: data.frequency || null,
        orgChartId: data.orgChartId || null,
        wbsId: data.wbsId || null,
        status: data.status || "active",
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi.create",
        description: `ایجاد شاخص ${p.code}: ${p.title}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
