import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.systemConfig.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.key) {
    return NextResponse.json({ error: "کلید تنظیمات الزامی است" }, { status: 400 });
  }

  const dup = await db.systemConfig.findUnique({ where: { key: data.key } });
  if (dup) return NextResponse.json({ error: "کلید تکراری است" }, { status: 400 });

  try {
    const cfg = await db.systemConfig.create({
      data: {
        key: data.key,
        value: data.value ?? null,
        description: data.description || null,
        category: data.category || null,
        isEditable: data.isEditable === "true" || data.isEditable === true,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "system-config.create",
        description: `ایجاد تنظیمات ${cfg.key}`,
      },
    });

    return NextResponse.json(cfg, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
