import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await req.json();
  const existing = await db.lessonLearned.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    const l = await db.lessonLearned.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        category: data.category === undefined ? existing.category : data.category || null,
        impact: data.impact === undefined ? existing.impact : data.impact || null,
        riskId: data.riskId === undefined ? existing.riskId : data.riskId || null,
        recommendations: data.recommendations === undefined ? existing.recommendations : data.recommendations || null,
        isArchived: data.isArchived ?? existing.isArchived,
      },
    });
    return NextResponse.json(l);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
    await db.lessonLearned.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
