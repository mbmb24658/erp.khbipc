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
  const item = await db.notificationTemplate.findUnique({
    where: { id },
    include: { notifications: { take: 10, orderBy: [{ createdAt: "desc" }] } },
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
  const existing = await db.notificationTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.notificationTemplate.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد قالب تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.notificationTemplate.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        title: data.title ?? existing.title,
        subjectTemplate: data.subjectTemplate === undefined ? existing.subjectTemplate : data.subjectTemplate || null,
        bodyTemplate: data.bodyTemplate ?? existing.bodyTemplate,
        category: data.category === undefined ? existing.category : data.category || null,
        variables: data.variables === undefined ? existing.variables : data.variables || null,
        isActive: data.isActive === undefined ? existing.isActive : (data.isActive === "true" || data.isActive === true),
      },
    });
    return NextResponse.json(p);
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
  const existing = await db.notificationTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.notificationTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
