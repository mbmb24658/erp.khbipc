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
  const item = await db.role.findUnique({
    where: { id },
    include: { users: true },
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
  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Prevent modifying isSystem flag on existing system roles
  if (existing.isSystem && data.isSystem !== undefined && (data.isSystem === "false" || data.isSystem === false)) {
    return NextResponse.json({ error: "امکان تغییر نقش سیستمی وجود ندارد" }, { status: 400 });
  }

  if (data.name && data.name !== existing.name) {
    const dup = await db.role.findUnique({ where: { name: data.name } });
    if (dup) return NextResponse.json({ error: "نام نقش تکراری است" }, { status: 400 });
  }

  try {
    const role = await db.role.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        description: data.description === undefined ? existing.description : data.description || null,
        permissions: data.permissions === undefined ? existing.permissions : data.permissions || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "role.update",
        description: `ویرایش نقش ${role.name}`,
      },
    });

    return NextResponse.json(role);
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
  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Prevent deletion of system roles
  if (existing.isSystem) {
    return NextResponse.json(
      { error: "امکان حذف نقش‌های سیستمی وجود ندارد" },
      { status: 400 }
    );
  }

  // Prevent deletion if users are assigned
  const userCount = await db.user.count({ where: { roleId: id } });
  if (userCount > 0) {
    return NextResponse.json(
      { error: `این نقش به ${userCount.toLocaleString("fa-IR")} کاربر اختصاص دارد. ابتدا کاربران را بازتخصیص دهید.` },
      { status: 400 }
    );
  }

  try {
    await db.role.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "role.delete",
        description: `حذف نقش ${existing.name}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
