import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.asset.findMany({
    include: { wbs: true, executor: true, _count: { select: { evaluations: true, risks: true, activities: true } } },
    orderBy: [{ assetId: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.assetId || !data.title) {
    return NextResponse.json({ error: "کد دارایی و عنوان الزامی است" }, { status: 400 });
  }

  const dup = await db.asset.findUnique({ where: { assetId: data.assetId } });
  if (dup) return NextResponse.json({ error: "کد دارایی تکراری است" }, { status: 400 });

  try {
    const p = await db.asset.create({
      data: {
        assetId: data.assetId,
        title: data.title,
        category: data.category || null,
        description: data.description || null,
        status: data.status || null,
        assetType: data.assetType || null,
        wbsId: data.wbsId || null,
        executorId: data.executorId || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        initialValue: data.initialValue ?? null,
        actualValue: data.actualValue ?? null,
        currentValue: data.currentValue ?? null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "asset.create",
        description: `ایجاد دارایی ${p.assetId}: ${p.title}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
