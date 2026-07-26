import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAdminAccess } from "@/lib/roles";

export const dynamic = "force-dynamic";

// POST: Bulk delete WBS items by ID list
// Body: { ids: string[] }
// Admin only — cascade delete will handle children automatically
export async function POST(req: NextRequest) {
  const { isAuthorized, error } = await checkAdminAccess();
  if (!isAuthorized) return NextResponse.json({ error: error || "Forbidden" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(data.ids) ? data.ids.filter((x: any) => typeof x === "string") : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "هیچ شناسه‌ای ارسال نشده است" }, { status: 400 });
    }

    // Fetch the wbsCodes of the items being deleted for logging
    const toDelete = await db.wBS.findMany({
      where: { id: { in: ids } },
      select: { id: true, wbsCode: true },
    });
    const validIds = toDelete.map((w) => w.id);
    const codesList = toDelete.map((w) => w.wbsCode);

    if (validIds.length === 0) {
      return NextResponse.json({ error: "هیچ مورد معتبری یافت نشد" }, { status: 404 });
    }

    // Sort IDs so we delete leaf nodes before their parents to minimize FK issues.
    // Cascade delete handles children too, but doing it in reverse-level order is safer.
    const itemsWithLevel = await db.wBS.findMany({
      where: { id: { in: validIds } },
      select: { id: true, level: true },
      orderBy: { level: "desc" },
    });
    const sortedIds = itemsWithLevel.map((w) => w.id);

    let deleted = 0;
    const errors: string[] = [];
    for (const id of sortedIds) {
      try {
        await db.wBS.delete({ where: { id } });
        deleted++;
      } catch (e: any) {
        errors.push(`حذف ${id}: ${e.message}`);
      }
    }

    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "wbs.bulk_delete",
        description: `حذف دسته‌ای ${deleted} مورد WBS: ${codesList.slice(0, 10).join(", ")}${codesList.length > 10 ? "..." : ""}`,
      },
    });

    return NextResponse.json({
      success: true,
      deleted,
      totalRequested: ids.length,
      notFound: ids.length - validIds.length,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("[wbs.bulk_delete] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
