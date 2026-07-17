import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.notificationConfig.findMany({
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  if (!data.category || !data.channel) {
    return NextResponse.json({ error: "دسته‌بندی و کانال الزامی است" }, { status: 400 });
  }

  try {
    const p = await db.notificationConfig.create({
      data: {
        userId: data.userId || null,
        category: data.category,
        channel: data.channel,
        isEnabled: data.isEnabled === "true" || data.isEnabled === true,
        minPriority: data.minPriority || "normal",
      },
    });
    return NextResponse.json(p, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
