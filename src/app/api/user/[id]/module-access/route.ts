import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// GET: Return the user's moduleAccess (parsed JSON or null)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Use raw SQL to avoid Prisma issues if moduleAccess column doesn't exist
  try {
    const result = await db.$queryRawUnsafe(
      `SELECT "moduleAccess" FROM "User" WHERE "id" = $1`,
      id
    );
    if (!Array.isArray(result) || result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const raw = (result[0] as any).moduleAccess;
    let modules: string[] | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) modules = parsed;
      } catch {
        modules = null;
      }
    }
    return NextResponse.json({ modules });
  } catch {
    // Column doesn't exist — return null (default access)
    return NextResponse.json({ modules: null });
  }
}

// PUT: Update the user's moduleAccess (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json().catch(() => ({}));

  let moduleAccess: string | null;
  let modulesToReturn: string[] | null = null;
  if (data.modules === null || data.modules === undefined) {
    moduleAccess = null;
  } else if (Array.isArray(data.modules)) {
    const clean = data.modules
      .filter((m: unknown) => typeof m === "string")
      .map((m: string) => m.trim())
      .filter(Boolean);
    moduleAccess = clean.length > 0 ? JSON.stringify(clean) : null;
    modulesToReturn = clean.length > 0 ? clean : null;
  } else {
    return NextResponse.json({ error: "modules باید آرایه یا null باشد" }, { status: 400 });
  }

  // Use raw SQL to avoid Prisma issues
  try {
    await db.$executeRawUnsafe(
      `UPDATE "User" SET "moduleAccess" = $1 WHERE "id" = $2`,
      moduleAccess, id
    );
  } catch {
    // Column doesn't exist — try to add it first
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "moduleAccess" TEXT`);
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "moduleAccess" = $1 WHERE "id" = $2`,
        moduleAccess, id
      );
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Log
  try {
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "user.module_access.update",
        description: `به‌روزرسانی دسترسی ماژول‌ها برای کاربر ${id}: ${
          moduleAccess === null ? "پیش‌فرض نقش" : moduleAccess
        }`,
      },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true, modules: modulesToReturn });
}
