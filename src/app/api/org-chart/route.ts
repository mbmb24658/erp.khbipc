import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.orgChart.findMany({
    include: {
      personResponsible: true,
      _count: { select: { personels: true, children: true } },
    },
    orderBy: [{ orgId: "asc" }],
  });
  // Attach HR template name if hrPositionId is set
  const templates = await db.kPITemplate.findMany();
  const templateMap = new Map(templates.map((t) => [t.positionCode, t]));
  const itemsWithTemplate = items.map((o) => ({
    ...o,
    hrTemplate: o.hrPositionId ? templateMap.get(o.hrPositionId) || null : null,
  }));
  return NextResponse.json(itemsWithTemplate);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.orgId || !data.position) {
    return NextResponse.json({ error: "کد و عنوان الزامی است" }, { status: 400 });
  }

  const dup = await db.orgChart.findUnique({ where: { orgId: data.orgId } });
  if (dup) return NextResponse.json({ error: "کد سازمانی تکراری است" }, { status: 400 });

  try {
    const o = await db.orgChart.create({
      data: {
        orgId: data.orgId,
        position: data.position,
        level: data.level || "عملیاتی",
        parentId: data.parentId || null,
        costBreakdownCode: data.costBreakdownCode || null,
        hrPositionId: data.hrPositionId || null,
      },
    });
    return NextResponse.json(o, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
