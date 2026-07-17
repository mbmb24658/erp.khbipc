import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.kPITemplate.findMany({
    include: {
      _count: { select: { categories: true, evaluations: true } },
      categories: { include: { _count: { select: { indicators: true } } } },
    },
    orderBy: [{ positionCode: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  if (!data.positionCode || !data.positionName) {
    return NextResponse.json({ error: "کد و نام سمت الزامی است" }, { status: 400 });
  }

  const dup = await db.kPITemplate.findUnique({ where: { positionCode: data.positionCode } });
  if (dup) return NextResponse.json({ error: "کد سمت تکراری است" }, { status: 400 });

  try {
    const t = await db.kPITemplate.create({
      data: {
        positionCode: data.positionCode,
        positionName: data.positionName,
        description: data.description || null,
      },
    });
    return NextResponse.json(t, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
