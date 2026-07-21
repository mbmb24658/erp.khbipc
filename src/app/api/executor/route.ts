import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkWriteAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.executor.findMany({
    include: {
      _count: { select: { assets: true } },
    },
    orderBy: [{ code: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkWriteAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.name) {
    return NextResponse.json({ error: "نام مجری الزامی است" }, { status: 400 });
  }

  // Auto-generate code: EX-001, EX-002, ...
  const lastExecutor = await db.executor.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let newCode = "EX-001";
  if (lastExecutor?.code) {
    const match = lastExecutor.code.match(/EX-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      newCode = `EX-${String(nextNum).padStart(3, "0")}`;
    }
  }

  // Safety: ensure the generated code is unique
  const dup = await db.executor.findUnique({ where: { code: newCode } });
  if (dup) return NextResponse.json({ error: "کد مجری تکراری است" }, { status: 400 });

  try {
    const p = await db.executor.create({
      data: {
        code: newCode,
        name: data.name,
        type: data.type || null,
        nationalId: data.nationalId || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        contactPerson: data.contactPerson || null,
        description: data.description || null,
      },
    });

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "executor.create",
        description: `ایجاد مجری ${p.code}: ${p.name}`,
      },
    });

    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
