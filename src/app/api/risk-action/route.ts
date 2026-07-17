import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.riskAction.findMany({
    include: {
      risk: true,
      assignedTo: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.riskId || !data.title) {
    return NextResponse.json({ error: "ریسک و عنوان اقدام الزامی است" }, { status: 400 });
  }

  try {
    const p = await db.riskAction.create({
      data: {
        riskId: data.riskId,
        title: data.title,
        description: data.description || null,
        status: data.status || "pending",
        assignedToId: data.assignedToId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedDate: data.completedDate ? new Date(data.completedDate) : null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk-action.create",
        description: `ایجاد اقدام برای ریسک: ${data.riskId}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
