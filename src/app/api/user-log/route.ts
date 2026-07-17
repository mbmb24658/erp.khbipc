import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.userLog.findMany({
    include: {
      user: { include: { personel: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(items);
}
