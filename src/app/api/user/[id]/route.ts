import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.user.findUnique({
    where: { id },
    include: { role: true, personel: true },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  const { passwordHash, ...safe } = item;
  return NextResponse.json(safe);
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
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.username && data.username !== existing.username) {
    const dup = await db.user.findUnique({ where: { username: data.username } });
    if (dup) return NextResponse.json({ error: "نام کاربری تکراری است" }, { status: 400 });
  }

  // Clean email
  const email = data.email === undefined ? existing.email : (data.email && String(data.email).trim() !== "" ? String(data.email).trim() : null);
  if (email && email !== existing.email) {
    const dupEmail = await db.user.findUnique({ where: { email } });
    if (dupEmail) return NextResponse.json({ error: "ایمیل تکراری است" }, { status: 400 });
  }

  // Clean FK fields
  const personelId = data.personelId === undefined
    ? existing.personelId
    : (data.personelId && String(data.personelId).trim() !== "" ? String(data.personelId).trim() : null);
  const roleId = data.roleId === undefined
    ? existing.roleId
    : (data.roleId && String(data.roleId).trim() !== "" ? String(data.roleId).trim() : null);

  // Validate FK references if provided
  if (personelId && personelId !== existing.personelId) {
    const personel = await db.personel.findUnique({ where: { id: personelId } });
    if (!personel) {
      return NextResponse.json({ error: "پرسنل انتخاب شده معتبر نیست" }, { status: 400 });
    }
  }
  if (roleId && roleId !== existing.roleId) {
    const role = await db.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: "نقش انتخاب شده معتبر نیست" }, { status: 400 });
    }
  }

  // Handle password: if empty/undefined, keep existing hash
  let passwordHash = existing.passwordHash;
  if (data.password && String(data.password).trim() !== "") {
    passwordHash = bcrypt.hashSync(String(data.password), 10);
  }

  try {
    const user = await db.user.update({
      where: { id },
      data: {
        username: data.username ?? existing.username,
        email,
        passwordHash,
        personelId,
        roleId,
        isActive:
          data.isActive === undefined
            ? existing.isActive
            : data.isActive === "true" || data.isActive === true,
      },
      include: { role: true, personel: true },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "user.update",
        description: `ویرایش کاربر ${user.username}`,
      },
    });

    const { passwordHash: _ph, ...safe } = user;
    return NextResponse.json(safe);
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
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  // Prevent self-deletion
  if ((session.user as any).id === id) {
    return NextResponse.json(
      { error: "امکان حذف حساب کاربری فعلی وجود ندارد" },
      { status: 400 }
    );
  }

  try {
    await db.user.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "user.delete",
        description: `حذف کاربر ${existing.username}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
