import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lastExecutor = await db.executor.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextCode = "EX-001";
  if (lastExecutor?.code) {
    const match = lastExecutor.code.match(/EX-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      nextCode = `EX-${String(nextNum).padStart(3, "0")}`;
    }
  }

  return NextResponse.json({ code: nextCode });
}
