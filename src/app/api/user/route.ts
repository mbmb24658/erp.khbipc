import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.user.findMany({
    include: {
      role: true,
      personel: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
  // Strip passwordHash from response
  const safe = items.map(({ passwordHash, ...rest }) => rest);
  return NextResponse.json(safe);
}

function clean(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.username || !data.password) {
    return NextResponse.json(
      { error: "نام کاربری و رمز عبور الزامی است" },
      { status: 400 }
    );
  }

  const dupUsername = await db.user.findUnique({ where: { username: data.username } });
  if (dupUsername) {
    return NextResponse.json({ error: "نام کاربری تکراری است" }, { status: 400 });
  }

  const email = clean(data.email);
  if (email) {
    const dupEmail = await db.user.findUnique({ where: { email } });
    if (dupEmail) {
      return NextResponse.json({ error: "ایمیل تکراری است" }, { status: 400 });
    }
  }

  // Clean FK fields - convert empty strings to null
  const personelId = clean(data.personelId);
  const roleId = clean(data.roleId);

  // Validate FK references if provided
  if (personelId) {
    const personel = await db.personel.findUnique({ where: { id: personelId } });
    if (!personel) {
      return NextResponse.json(
        { error: "پرسنل انتخاب شده معتبر نیست" },
        { status: 400 }
      );
    }
  }
  if (roleId) {
    const role = await db.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json(
        { error: "نقش انتخاب شده معتبر نیست" },
        { status: 400 }
      );
    }
  }

  try {
    const passwordHash = bcrypt.hashSync(String(data.password), 10);
    const user = await db.user.create({
      data: {
        username: data.username,
        email,
        passwordHash,
        personelId,
        roleId,
        isActive: data.isActive === "true" || data.isActive === true,
      },
      include: { role: true, personel: true },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "user.create",
        description: `ایجاد کاربر ${user.username}`,
      },
    });

    // Strip passwordHash
    const { passwordHash: _ph, ...safe } = user;
    return NextResponse.json(safe, { status: 201 });
  } catch (e: any) {
    console.error("[user.create] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
