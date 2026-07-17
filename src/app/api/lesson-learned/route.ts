import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.lessonLearned.findMany({
    include: {
      capturedBy: true,
      risk: true,
    },
    orderBy: [{ capturedAt: "desc" }],
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
  if (!data.title || !data.description) {
    return NextResponse.json({ error: "عنوان و توضیحات الزامی است" }, { status: 400 });
  }

  // Find capturedBy from session user
  let capturedById: string | null = null;
  const userId = (session.user as any).id;
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user?.personelId) capturedById = user.personelId;
  }

  try {
    const l = await db.lessonLearned.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category || null,
        impact: data.impact || null,
        riskId: data.riskId || null,
        recommendations: data.recommendations || null,
        capturedById,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "lesson_learned.create",
        description: `ثبت درس آموخته: ${l.title}`,
      },
    });

    return NextResponse.json(l, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
