import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.chartConfig.findMany({
    orderBy: [{ code: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.code || !data.title) {
    return NextResponse.json({ error: "کد و عنوان چارت الزامی است" }, { status: 400 });
  }

  const dup = await db.chartConfig.findUnique({ where: { code: data.code } });
  if (dup) return NextResponse.json({ error: "کد چارت تکراری است" }, { status: 400 });

  try {
    const p = await db.chartConfig.create({
      data: {
        code: data.code,
        title: data.title,
        chartType: data.chartType || null,
        dataSource: data.dataSource || null,
        config: data.config || null,
        description: data.description || null,
        isActive: data.isActive === "true" || data.isActive === true,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "chart-config.create",
        description: `ایجاد چارت ${p.code}: ${p.title}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
