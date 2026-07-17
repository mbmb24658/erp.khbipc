/**
 * COMPLETE FIX SCRIPT for Windows
 * 
 * This script:
 * 1. Sets DATABASE_URL with forward slashes (fixes Windows path issue)
 * 2. Checks if tables exist
 * 3. If not, creates them using raw SQL
 * 4. Seeds admin user
 * 5. Imports all data (Excel + HR + Risk)
 *
 * Run with: node scripts/fix-all.js
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Use DATABASE_URL from .env (don't override — works for both PostgreSQL and SQLite)
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

console.log("============================================================");
console.log("  FIX ALL SCRIPT - Kharazmi Management System");
console.log("============================================================");
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL.substring(0, 40)}...`);
console.log("");

// ============================================================
// Step 1: Check if tables exist (works for both PostgreSQL and SQLite)
// ============================================================
async function checkTables() {
  console.log("[1/6] Checking database tables...");

  const testDb = new PrismaClient({ log: ["error"] });

  try {
    // Try PostgreSQL first
    const result = await testDb.$queryRawUnsafe(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const count = Array.isArray(result) ? Number(result[0].count) : 0;
    console.log(`  Found ${count} tables in PostgreSQL database.`);

    if (count > 0) {
      const tables = await testDb.$queryRawUnsafe(
        "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );
      console.log("  Tables:", tables.map(t => t.name).join(", "));
    }

    await testDb.$disconnect();
    return count;
  } catch (e) {
    // Fall back to SQLite
    try {
      const result = await testDb.$queryRawUnsafe(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      );
      const count = Array.isArray(result) ? Number(result[0].count) : 0;
      console.log(`  Found ${count} tables in SQLite database.`);

      if (count > 0) {
        const tables = await testDb.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        console.log("  Tables:", tables.map(t => t.name).join(", "));
      }

      await testDb.$disconnect();
      return count;
    } catch (e2) {
      console.log("  Cannot check tables:", e2.message.substring(0, 100));
      await testDb.$disconnect();
      return 0;
    }
  }
}

// ============================================================
// Step 2: Create tables if they don't exist
// ============================================================
async function createTablesIfNeeded() {
  const tableCount = await checkTables();
  
  if (tableCount > 0) {
    console.log("  ✓ Tables already exist, skipping creation.");
    console.log("");
    return;
  }
  
  console.log("[2/6] Creating database tables...");
  console.log("  Running: npx prisma db push --force-reset");
  
  try {
    execSync("npx prisma db push --force-reset --accept-data-loss", {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
      env: process.env,
    });
    console.log("  ✓ Tables created.");
  } catch (e) {
    console.log("  prisma db push failed, trying alternative method...");
    
    // Alternative: generate SQL and execute manually
    try {
      console.log("  Generating SQL from schema...");
      const sql = execSync(
        'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
        { cwd: path.resolve(__dirname, ".."), env: process.env }
      ).toString();
      
      // Execute SQL statements one by one
      const testDb = new PrismaClient({ log: ["error"] });
      const statements = sql.split(";").filter(s => s.trim());
      console.log(`  Executing ${statements.length} SQL statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt || stmt.startsWith("--")) continue;
        try {
          await testDb.$executeRawUnsafe(stmt);
        } catch (e) {
          // Skip "already exists" errors
          if (!e.message.includes("already exists")) {
            console.log(`  ⚠️  Statement ${i + 1} error: ${e.message.substring(0, 80)}`);
          }
        }
      }
      
      await testDb.$disconnect();
      console.log("  ✓ Tables created via SQL.");
    } catch (e2) {
      console.error("  ❌ Failed to create tables:", e2.message);
      process.exit(1);
    }
  }
  
  console.log("");
}

// ============================================================
// Step 3: Seed admin user
// ============================================================
async function seedAdmin() {
  console.log("[3/6] Seeding admin user...");
  const seedDb = new PrismaClient({ log: ["error"] });
  
  try {
    // Create roles
    const adminRole = await seedDb.role.upsert({
      where: { name: "admin" },
      update: {},
      create: {
        name: "admin",
        description: "مدیر سیستم با دسترسی کامل",
        permissions: JSON.stringify(["*"]),
        isSystem: true,
      },
    });
    console.log("  ✓ Admin role ready");

    await seedDb.role.upsert({
      where: { name: "user" },
      update: {},
      create: {
        name: "user",
        description: "کاربر عادی",
        permissions: JSON.stringify(["read:*"]),
        isSystem: true,
      },
    });
    console.log("  ✓ User role ready");

    await seedDb.role.upsert({
      where: { name: "moderator" },
      update: {},
      create: {
        name: "moderator",
        description: "ناظر",
        permissions: JSON.stringify(["read:*", "write:*"]),
        isSystem: true,
      },
    });
    console.log("  ✓ Moderator role ready");

    // Create admin user
    const passwordHash = bcrypt.hashSync("admin123", 10);
    await seedDb.user.upsert({
      where: { username: "admin" },
      update: {
        passwordHash,
        isActive: true,
        roleId: adminRole.id,
        email: "admin@kharazmi.ir",
      },
      create: {
        username: "admin",
        email: "admin@kharazmi.ir",
        passwordHash,
        isActive: true,
        roleId: adminRole.id,
      },
    });
    console.log("  ✓ Admin user ready (admin / admin123)");
  } finally {
    await seedDb.$disconnect();
  }
  console.log("");
}

// ============================================================
// Step 4: Import Excel data
// ============================================================
async function importExcel() {
  console.log("[4/6] Importing Excel data...");
  try {
    execSync("npx tsx scripts/import-excel.ts", {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
      env: process.env,
    });
    console.log("  ✓ Excel data imported.");
  } catch (e) {
    console.log("  ⚠️  Excel import failed (may already be imported).");
  }
  console.log("");
}

// ============================================================
// Step 5: Import HR and Risk data
// ============================================================
async function importHrRisk() {
  console.log("[5/6] Importing HR templates and Risk data...");
  try {
    execSync("node scripts/import-hr-risk.js", {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
      env: process.env,
    });
    console.log("  ✓ HR and Risk data imported.");
  } catch (e) {
    console.log("  ⚠️  HR/Risk import failed.");
  }
  console.log("");
}

// ============================================================
// Step 6: Verify
// ============================================================
async function verify() {
  console.log("[6/6] Verifying setup...");
  const verifyDb = new PrismaClient({ log: ["error"] });
  
  try {
    const counts = {
      Roles: await verifyDb.role.count(),
      Users: await verifyDb.user.count(),
      WBS: await verifyDb.wBS.count(),
      Personnel: await verifyDb.personel.count(),
      KPITemplates: await verifyDb.kPITemplate.count(),
      Risks: await verifyDb.risk.count(),
    };
    
    console.log("\n============================================================");
    console.log("  Setup Summary:");
    console.log("============================================================");
    console.table(counts);
    
    if (counts.Users === 0) {
      console.log("❌ WARNING: No users found! Login will fail.");
    } else {
      console.log("✅ Admin user exists. Login: admin / admin123");
    }
    
    console.log("\n  Now run: npm run dev");
    console.log("  Open:    http://localhost:3000");
    console.log("============================================================");
  } finally {
    await verifyDb.$disconnect();
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  try {
    await createTablesIfNeeded();
    await seedAdmin();
    await importExcel();
    await importHrRisk();
    await verify();
  } catch (e) {
    console.error("\n❌ Failed:", e.message);
    process.exit(1);
  }
}

main();
