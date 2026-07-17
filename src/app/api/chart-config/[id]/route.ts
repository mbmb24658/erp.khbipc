import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.chartConfig.findUnique({
    where: { id },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const existing = await db.chartConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.chartConfig.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد چارت تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.chartConfig.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        chartType: data.chartType === undefined ? existing.chartType : data.chartType || null,
        dataSource: data.dataSource === undefined ? existing.dataSource : data.dataSource || null,
        config: data.config === undefined ? existing.config : data.config || null,
        description: data.description === undefined ? existing.description : data.description || null,
        isActive: data.isActive === undefined ? existing.isActive : (data.isActive === "true" || data.isActive === true),
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "chart-config.update",
        description: `ویرایش چارت ${p.code}: ${p.title}`,
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
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.chartConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.chartConfig.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "chart-config.delete",
        description: `حذف چارت ${existing.code}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
