import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List status updates for a WBS item (or all)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const items = await db.wBSStatusUpdate.findMany({
    where: { wbsId: id },
    include: { personel: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items);
}

// POST: Create a status update for a WBS item
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await req.json();
  if (!data.newStatus) {
    return NextResponse.json({ error: "وضعیت جدید الزامی است" }, { status: 400 });
  }

  try {
    const wbs = await db.wBS.findUnique({ where: { id } });
    if (!wbs) return NextResponse.json({ error: "فعالیت یافت نشد" }, { status: 404 });

    // Find personel from session user
    let personelId: string | null = null;
    const userId = (session.user as any).id;
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user?.personelId) personelId = user.personelId;
    }

    const update = await db.wBSStatusUpdate.create({
      data: {
        wbsId: id,
        personelId,
        previousStatus: wbs.status,
        newStatus: data.newStatus,
        progressPct: data.progressPct !== undefined ? Number(data.progressPct) : null,
        notes: data.notes || null,
      },
    });

    // Update the parent WBS status + progressActual
    // progressPct comes in as 0-100, store as decimal 0-1
    const newProgressActual =
      data.progressPct !== undefined
        ? Number(data.progressPct) / 100
        : wbs.progressActual;

    await db.wBS.update({
      where: { id },
      data: {
        status: data.newStatus,
        progressActual: newProgressActual,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs_status.update",
        description: `بروزرسانی وضعیت فعالیت ${wbs.wbsCode} به ${data.newStatus}`,
      },
    });

    return NextResponse.json(update, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
