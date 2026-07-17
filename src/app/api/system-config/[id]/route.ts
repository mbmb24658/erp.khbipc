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
  const item = await db.systemConfig.findUnique({ where: { id } });
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
  const existing = await db.systemConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Prevent editing non-editable config
  if (existing.isEditable === false) {
    return NextResponse.json(
      { error: "این تنظیم قابل ویرایش نیست" },
      { status: 400 }
    );
  }

  if (data.key && data.key !== existing.key) {
    const dup = await db.systemConfig.findUnique({ where: { key: data.key } });
    if (dup) return NextResponse.json({ error: "کلید تکراری است" }, { status: 400 });
  }

  try {
    const cfg = await db.systemConfig.update({
      where: { id },
      data: {
        key: data.key ?? existing.key,
        value: data.value === undefined ? existing.value : data.value,
        description: data.description === undefined ? existing.description : data.description || null,
        category: data.category === undefined ? existing.category : data.category || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "system-config.update",
        description: `ویرایش تنظیمات ${cfg.key}`,
      },
    });

    return NextResponse.json(cfg);
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
  const existing = await db.systemConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (existing.isEditable === false) {
    return NextResponse.json(
      { error: "این تنظیم قابل حذف نیست" },
      { status: 400 }
    );
  }

  try {
    await db.systemConfig.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "system-config.delete",
        description: `حذف تنظیمات ${existing.key}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
