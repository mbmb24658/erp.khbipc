import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.kPITemplate.findUnique({
    where: { id },
    include: {
      categories: {
        orderBy: [{ order: "asc" }],
        include: {
          indicators: { orderBy: [{ order: "asc" }] },
        },
      },
      evaluations: {
        orderBy: [{ evaluatedAt: "desc" }],
        take: 5,
        include: { personel: true, orgChart: true },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await db.kPITemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
