import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: List all delay causes, grouped by mainCategory
// Returns an object: { grouped: Record<mainCategory, DelayCause[]>, all: DelayCause[] }
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const causes = await db.delayCause.findMany({
    orderBy: [{ mainCategory: "asc" }, { subCategory: "asc" }, { rootCause: "asc" }],
  });

  // Group by mainCategory
  const grouped: Record<string, typeof causes> = {};
  for (const c of causes) {
    const key = c.mainCategory || "سایر";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }

  return NextResponse.json({ grouped, all: causes });
}
