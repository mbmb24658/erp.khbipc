import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.executor.findUnique({
    where: { id },
    include: { assets: true, _count: { select: { assets: true } } },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  const existing = await db.executor.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.code && data.code !== existing.code) {
    const dup = await db.executor.findUnique({ where: { code: data.code } });
    if (dup) return NextResponse.json({ error: "کد مجری تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.executor.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        name: data.name ?? existing.name,
        type: data.type === undefined ? existing.type : data.type || null,
        nationalId: data.nationalId === undefined ? existing.nationalId : data.nationalId || null,
        phone: data.phone === undefined ? existing.phone : data.phone || null,
        email: data.email === undefined ? existing.email : data.email || null,
        address: data.address === undefined ? existing.address : data.address || null,
        contactPerson: data.contactPerson === undefined ? existing.contactPerson : data.contactPerson || null,
        description: data.description === undefined ? existing.description : data.description || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "executor.update",
        description: `ویرایش مجری ${p.code}: ${p.name}`,
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
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.executor.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.executor.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "executor.delete",
        description: `حذف مجری ${existing.code}: ${existing.name}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
