import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

// Debug endpoint to inspect database connection & contents.
// Helpful when login fails after migration.
// NOT for production - returns internal state.
export async function GET() {
  const cwd = process.cwd();
  const dbUrl = process.env.DATABASE_URL || "(not set)";
  const resolvedDbPath = dbUrl.startsWith("file:")
    ? path.resolve(cwd, dbUrl.slice("file:".length).replace(/^\.\//, ""))
    : dbUrl;
  const dbExists = fs.existsSync(resolvedDbPath);
  const dbSize = dbExists ? fs.statSync(resolvedDbPath).size : 0;

  let userCount = 0;
  let wbsCount = 0;
  let adminUser: any = null;
  let dbError: string | null = null;

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

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || "(unset)",
      cwd,
      DATABASE_URL: dbUrl,
      resolvedDbPath,
      dbExists,
      dbSizeBytes: dbSize,
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
      dbError,
    },
    nextAuth: {
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(unset)",
      NEXTAUTH_SECRET_set: !!process.env.NEXTAUTH_SECRET,
    },
  }, { status: 200 });
}
