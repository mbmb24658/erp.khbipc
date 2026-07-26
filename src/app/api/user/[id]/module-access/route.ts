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
  const user = await db.user.findUnique({
    where: { id },
    select: { moduleAccess: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let modules: string[] | null = null;
  if (user.moduleAccess) {
    try {
      const parsed = JSON.parse(user.moduleAccess);
      if (Array.isArray(parsed)) modules = parsed;
    } catch {
      modules = null;
    }
  }
  return NextResponse.json({ modules });
}

// PUT: Update the user's moduleAccess (admin only)
// Body: { modules: ["/wbs", "/hr", ...] } or { modules: null } for default role-based access
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
  if (data.modules === null || data.modules === undefined) {
    moduleAccess = null;
  } else if (Array.isArray(data.modules)) {
    // Sanitize: keep only strings
    const clean = data.modules
      .filter((m: unknown) => typeof m === "string")
      .map((m: string) => m.trim())
      .filter(Boolean);
    moduleAccess = clean.length > 0 ? JSON.stringify(clean) : null;
  } else {
    return NextResponse.json({ error: "modules باید آرایه یا null باشد" }, { status: 400 });
  }

  try {
    await db.user.update({
      where: { id },
      data: { moduleAccess },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "user.module_access.update",
        description: `به‌روزرسانی دسترسی ماژول‌ها برای کاربر ${id}: ${
          moduleAccess === null ? "پیش‌فرض نقش" : moduleAccess
        }`,
      },
    });

    return NextResponse.json({
      success: true,
      modules: data.modules === null || data.modules === undefined ? null : JSON.parse(moduleAccess || "[]"),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
