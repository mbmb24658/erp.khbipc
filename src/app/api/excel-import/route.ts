import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@/lib/db";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

// POST: Re-import Excel file uploaded by admin
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can re-import
  if ((session.user as any).role !== "admin") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند اطلاعات را بازنشانی کند" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
    }

    // Save the uploaded file to upload directory (project root / upload)
    const projectRoot = process.cwd();
    const uploadDir = path.join(projectRoot, "upload");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, "MASTER_R05.xlsx");
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Run the import script (use bun if available, fallback to npx tsx)
    const scriptPath = path.join(projectRoot, "scripts", "import-excel.ts");
    // Pick a runtime that exists on this machine (bun first, then npx tsx)
    let cmd: string;
    try {
      await execAsync("bun --version", { timeout: 5000 });
      cmd = `bun run "${scriptPath}"`;
    } catch {
      cmd = `npx --yes tsx "${scriptPath}"`;
    }
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: projectRoot,
      timeout: 300000, // 5 minutes
    });

    if (stderr && !stderr.includes("prisma:query")) {
      console.error("Import stderr:", stderr);
    }

    // Log the action
    await db.userLog.create({
      data: {
        userId: (session.user as any).id,
        action: "excel.reimport",
        description: `بازنشانی اطلاعات از فایل: ${file.name}`,
      },
    });

    // Get counts
    const counts = {
      WBS: await db.wBS.count(),
      Personel: await db.personel.count(),
      CostBreakdown: await db.costBreakdown.count(),
      RevenueBreakdown: await db.revenueBreakdown.count(),
      Asset: await db.asset.count(),
    };

    return NextResponse.json({
      success: true,
      message: "اطلاعات با موفقیت بازنشانی شد",
      counts,
      log: stdout.split("\n").filter((l) => l.trim()).slice(-20),
    });
  } catch (e: any) {
    console.error("Excel import error:", e);
    return NextResponse.json(
      { error: e.message || "خطا در بازنشانی اطلاعات" },
      { status: 500 }
    );
  }
}

// GET: Get current data statistics
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const counts = {
    WBS: await db.wBS.count(),
    WBSMonthlyProgress: await db.wBSMonthlyProgress.count(),
    Personel: await db.personel.count(),
    OrgChart: await db.orgChart.count(),
    CostBreakdown: await db.costBreakdown.count(),
    RevenueBreakdown: await db.revenueBreakdown.count(),
    Asset: await db.asset.count(),
    KPI: await db.kPI.count(),
    Risk: await db.risk.count(),
    Notification: await db.notification.count(),
    User: await db.user.count(),
  };

  // Check last import time
  const lastLog = await db.userLog.findFirst({
    where: { action: "excel.reimport" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    counts,
    lastImport: lastLog?.createdAt || null,
  });
}
