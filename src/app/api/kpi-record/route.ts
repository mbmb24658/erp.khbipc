import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.kPIRecord.findMany({
    include: {
      assignment: { include: { kpi: true, personel: true } },
      confirmedBy: true,
    },
    orderBy: [{ recordDate: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.assignmentId || data.value === undefined || data.value === null) {
    return NextResponse.json({ error: "تخصیص و مقدار الزامی است" }, { status: 400 });
  }

  try {
    const p = await db.kPIRecord.create({
      data: {
        assignmentId: data.assignmentId,
        recordDate: data.recordDate ? new Date(data.recordDate) : new Date(),
        value: Number(data.value),
        notes: data.notes || null,
        confirmedById: data.confirmedById || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "kpi-record.create",
        description: `ثبت رکورد شاخص`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
