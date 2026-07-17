import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.personel.findMany({
    include: {
      orgChart: true,
      _count: { select: { wbsAssignments: true, kpiAssignments: true } },
    },
    orderBy: [{ personelId: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.personelId || !data.name) {
    return NextResponse.json({ error: "کد و نام الزامی است" }, { status: 400 });
  }

  const dup = await db.personel.findUnique({ where: { personelId: data.personelId } });
  if (dup) return NextResponse.json({ error: "کد پرسنلی تکراری است" }, { status: 400 });

  try {
    const p = await db.personel.create({
      data: {
        personelId: data.personelId,
        name: data.name,
        orgChartId: data.orgChartId || null,
        costBreakdownId: data.costBreakdownId || null,
        phone: data.phone || null,
        email: data.email || null,
        role: data.role || "user",
        gender: data.gender || null,
        monthlySalary: data.monthlySalary ?? null,
        annualSalary: data.annualSalary ?? null,
        monthlySalaryActual: data.monthlySalaryActual ?? null,
        annualSalaryActual: data.annualSalaryActual ?? null,
        dailyRate: data.dailyRate ?? null,
        notes: data.notes || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "personel.create",
        description: `ایجاد پرسنل ${p.personelId}: ${p.name}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
