/**
 * Seed admin user into the database.
 * Run with: npm run seed:admin
 *
 * Works with both PostgreSQL (production/Vercel) and SQLite (local dev).
 * Uses DATABASE_URL from .env — does NOT override it.
 *
 * This script is idempotent: if the admin already exists, it just updates
 * the password and re-activates the account.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

// Use DATABASE_URL from .env (don't override)
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const db = new PrismaClient({ log: ["error", "warn"] });

async function main() {
  console.log("🔑 Seeding admin user...");
  console.log(`   DATABASE_URL = ${process.env.DATABASE_URL.substring(0, 30)}...`);

  // Test database connectivity
  try {
    const tableCheck = await db.$queryRawUnsafe(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const tableCount = Array.isArray(tableCheck) ? tableCheck[0].count : 0;
    console.log(`   ✓ Database connected. ${tableCount} tables in public schema.`);
    if (tableCount === 0) {
      console.error("   ❌ Database has NO tables! Run 'npx prisma db push' first.");
      process.exit(1);
    }
  } catch (e) {
    // Might be SQLite — try a different check
    try {
      const userCount = await db.user.count();
      console.log(`   ✓ Database connected. ${userCount} users found.`);
    } catch (e2) {
      console.error("   ❌ Cannot connect to database:", e2.message);
      console.error("   Run 'npx prisma db push' first to create tables.");
      process.exit(1);
    }
  }

  // Ensure the admin role exists
  let adminRole = await db.role.findUnique({ where: { name: "admin" } });
  if (!adminRole) {
    adminRole = await db.role.create({
      data: {
        name: "admin",
        description: "مدیر سیستم با دسترسی کامل",
        permissions: JSON.stringify(["*"]),
        isSystem: true,
      },
    });
    console.log("   ✓ Created 'admin' role");
  } else {
    console.log("   ✓ 'admin' role already exists");
  }

  // Ensure the 'user' role exists too
  let userRole = await db.role.findUnique({ where: { name: "user" } });
  if (!userRole) {
    userRole = await db.role.create({
      data: {
        name: "user",
        description: "کاربر عادی",
        permissions: JSON.stringify(["read:*"]),
        isSystem: true,
      },
    });
    console.log("   ✓ Created 'user' role");
  }

  // Ensure the 'moderator' role exists too
  let modRole = await db.role.findUnique({ where: { name: "moderator" } });
  if (!modRole) {
    modRole = await db.role.create({
      data: {
        name: "moderator",
        description: "ناظر با دسترسی ویرایش",
        permissions: JSON.stringify(["read:*", "write:*"]),
        isSystem: true,
      },
    });
    console.log("   ✓ Created 'moderator' role");
  }

  // Upsert the admin user
  const passwordHash = bcrypt.hashSync("admin123", 10);
  const admin = await db.user.upsert({
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

  console.log("   ✓ Admin user ready:");
  console.log(`     username: ${admin.username}`);
  console.log(`     email:    ${admin.email}`);
  console.log(`     password: admin123`);
  console.log(`     active:   ${admin.isActive}`);
  console.log("");
  console.log("✅ Done. You can now log in.");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
