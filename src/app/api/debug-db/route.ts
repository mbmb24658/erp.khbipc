import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Debug endpoint — works with both PostgreSQL and SQLite
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "(not set)";

  let userCount = 0;
  let wbsCount = 0;
  let adminUser: any = null;
  let dbError: string | null = null;
  let columnsInfo: any = null;

  try {
    userCount = await db.user.count();
    wbsCount = await db.wBS.count();
    adminUser = await db.user.findUnique({
      where: { username: "admin" },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        role: { select: { name: true } },
      },
    });
  } catch (e: any) {
    dbError = e.message;
  }

  // Check if new columns exist (PostgreSQL)
  try {
    const columns = await db.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY column_name"
    );
    columnsInfo = Array.isArray(columns) ? columns.map((c: any) => c.column_name) : [];
  } catch {
    // SQLite fallback
    try {
      const columns = await db.$queryRawUnsafe(
        "SELECT name FROM pragma_table_info('User')"
      );
      columnsInfo = Array.isArray(columns) ? columns.map((c: any) => c.name) : [];
    } catch {}
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || "(unset)",
      DATABASE_URL_prefix: dbUrl.substring(0, 30),
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(unset)",
      NEXTAUTH_SECRET_set: !!process.env.NEXTAUTH_SECRET,
    },
    database: {
      userCount,
      wbsCount,
      adminUser: adminUser
        ? {
            id: adminUser.id,
            username: adminUser.username,
            email: adminUser.email,
            isActive: adminUser.isActive,
            hasPasswordHash: !!adminUser.passwordHash,
            passwordHashPrefix: adminUser.passwordHash?.substring(0, 7),
            lastLoginAt: adminUser.lastLoginAt,
            role: adminUser.role?.name,
          }
        : null,
      userTableColumns: columnsInfo,
      dbError,
    },
  }, { status: 200 });
}
