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
  const p = await db.personel.findUnique({
    where: { id },
    include: {
      orgChart: true,
      wbsAssignments: { include: { wbs: true } },
      kpiAssignments: { include: { kpi: true } },
      user: true,
    },
  });
  if (!p) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(p);
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
  const existing = await db.personel.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.personelId && data.personelId !== existing.personelId) {
    const dup = await db.personel.findUnique({ where: { personelId: data.personelId } });
    if (dup) return NextResponse.json({ error: "کد پرسنلی تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.personel.update({
      where: { id },
      data: {
        personelId: data.personelId ?? existing.personelId,
        name: data.name ?? existing.name,
        orgChartId: data.orgChartId === undefined ? existing.orgChartId : data.orgChartId || null,
        costBreakdownId: data.costBreakdownId === undefined ? existing.costBreakdownId : data.costBreakdownId || null,
        phone: data.phone ?? existing.phone,
        email: data.email ?? existing.email,
        role: data.role ?? existing.role,
        gender: data.gender ?? existing.gender,
        monthlySalary: data.monthlySalary ?? existing.monthlySalary,
        annualSalary: data.annualSalary ?? existing.annualSalary,
        monthlySalaryActual: data.monthlySalaryActual ?? existing.monthlySalaryActual,
        annualSalaryActual: data.annualSalaryActual ?? existing.annualSalaryActual,
        dailyRate: data.dailyRate ?? existing.dailyRate,
        notes: data.notes ?? existing.notes,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "personel.update",
        description: `ویرایش پرسنل ${p.personelId}: ${p.name}`,
      },
    });

    return NextResponse.json(p);
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
  const existing = await db.personel.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.personel.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "personel.delete",
        description: `حذف پرسنل ${existing.personelId}: ${existing.name}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
