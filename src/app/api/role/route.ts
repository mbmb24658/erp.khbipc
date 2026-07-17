import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.name) {
    return NextResponse.json({ error: "نام نقش الزامی است" }, { status: 400 });
  }

  const dup = await db.role.findUnique({ where: { name: data.name } });
  if (dup) return NextResponse.json({ error: "نام نقش تکراری است" }, { status: 400 });

  try {
    const role = await db.role.create({
      data: {
        name: data.name,
        description: data.description || null,
        permissions: data.permissions || null,
        isSystem: data.isSystem === "true" || data.isSystem === true,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "role.create",
        description: `ایجاد نقش ${role.name}`,
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
