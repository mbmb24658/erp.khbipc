import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.kPIAssignment.findMany({
    include: {
      kpi: true,
      personel: true,
      _count: { select: { records: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.kpiId || !data.personelId) {
    return NextResponse.json({ error: "شاخص و پرسنل الزامی است" }, { status: 400 });
  }

  try {
    const p = await db.kPIAssignment.create({
      data: {
        kpiId: data.kpiId,
        personelId: data.personelId,
        status: data.status || "active",
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-assignment.create",
        description: `تخصیص شاخص به پرسنل`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
