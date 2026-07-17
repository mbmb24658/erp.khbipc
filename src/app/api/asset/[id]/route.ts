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
  const item = await db.asset.findUnique({
    where: { id },
    include: { wbs: true, executor: true, evaluations: true, risks: true },
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
  const existing = await db.asset.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  if (data.assetId && data.assetId !== existing.assetId) {
    const dup = await db.asset.findUnique({ where: { assetId: data.assetId } });
    if (dup) return NextResponse.json({ error: "کد دارایی تکراری است" }, { status: 400 });
  }

  try {
    const p = await db.asset.update({
      where: { id },
      data: {
        assetId: data.assetId ?? existing.assetId,
        title: data.title ?? existing.title,
        category: data.category === undefined ? existing.category : data.category || null,
        description: data.description === undefined ? existing.description : data.description || null,
        status: data.status === undefined ? existing.status : data.status || null,
        assetType: data.assetType === undefined ? existing.assetType : data.assetType || null,
        wbsId: data.wbsId === undefined ? existing.wbsId : data.wbsId || null,
        executorId: data.executorId === undefined ? existing.executorId : data.executorId || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : existing.purchaseDate,
        initialValue: data.initialValue ?? existing.initialValue,
        actualValue: data.actualValue === undefined ? existing.actualValue : data.actualValue,
        currentValue: data.currentValue ?? existing.currentValue,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "asset.update",
        description: `ویرایش دارایی ${p.assetId}: ${p.title}`,
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
  const existing = await db.asset.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    await db.asset.delete({ where: { id } });
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "asset.delete",
        description: `حذف دارایی ${existing.assetId}: ${existing.title}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
