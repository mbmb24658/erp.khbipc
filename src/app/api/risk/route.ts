import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.risk.findMany({
    include: {
      wbs: true,
      asset: true,
      identifiedBy: true,
      _count: { select: { actions: true, history: true } },
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
  if (!data.code || !data.title) {
    return NextResponse.json({ error: "کد و عنوان ریسک الزامی است" }, { status: 400 });
  }

  const dup = await db.risk.findUnique({ where: { code: data.code } });
  if (dup) return NextResponse.json({ error: "کد ریسک تکراری است" }, { status: 400 });

  // Compute severity = probability * impact
  const probability = data.probability != null ? Number(data.probability) : null;
  const impact = data.impact != null ? Number(data.impact) : null;
  const severity = probability != null && impact != null ? probability * impact : null;

  try {
    const p = await db.risk.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        status: data.status || "open",
        probability,
        impact,
        severity,
        riskType: data.riskType || null,
        wbsId: data.wbsId || null,
        assetId: data.assetId || null,
        identifiedById: data.identifiedById || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        resolutionDate: data.resolutionDate ? new Date(data.resolutionDate) : null,
      },
    });

    // Get the user's personel id for the history entry
    const user = await db.user.findUnique({
      where: { id: (session.user as any).id },
      select: { personelId: true },
    });

    // Create a history entry for creation
    await db.riskHistory.create({
      data: {
        riskId: p.id,
        changeType: "created",
        newValue: p.status,
        changedById: user?.personelId || null,
        notes: "ریسک ایجاد شد",
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "risk.create",
        description: `ایجاد ریسک ${p.code}: ${p.title}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
