import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.notificationTemplate.findMany({
    include: { _count: { select: { notifications: true } } },
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
  if (!data.code || !data.title || !data.bodyTemplate) {
    return NextResponse.json({ error: "کد، عنوان و قالب پیام الزامی است" }, { status: 400 });
  }

  const dup = await db.notificationTemplate.findUnique({ where: { code: data.code } });
  if (dup) return NextResponse.json({ error: "کد قالب تکراری است" }, { status: 400 });

  try {
    const p = await db.notificationTemplate.create({
      data: {
        code: data.code,
        title: data.title,
        subjectTemplate: data.subjectTemplate || null,
        bodyTemplate: data.bodyTemplate,
        category: data.category || null,
        variables: data.variables || null,
        isActive: data.isActive === "true" || data.isActive === true,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "notification-template.create",
        description: `ایجاد قالب اعلان ${p.code}: ${p.title}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
