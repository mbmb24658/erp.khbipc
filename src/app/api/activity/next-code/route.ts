import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lastActivity = await db.activity.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextCode = "ACT-001";
  if (lastActivity?.code) {
    const match = lastActivity.code.match(/ACT-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      nextCode = `ACT-${String(nextNum).padStart(3, "0")}`;
    }
  }

  return NextResponse.json({ code: nextCode });
}
