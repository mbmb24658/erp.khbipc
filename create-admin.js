/**
 * Emergency admin creator — run if seed:admin fails
 * Usage: node create-admin.js
 * Works with both PostgreSQL (production) and SQLite (local dev).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

// Use DATABASE_URL from .env
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  console.log("Database:", process.env.DATABASE_URL.substring(0, 40) + "...");

  // Test connection
  try {
    const userCount = await db.user.count();
    console.log("Current users:", userCount);
  } catch (e) {
    console.error("Cannot connect to database:", e.message);
    console.error("Run 'npx prisma db push' first to create tables.");
    process.exit(1);
  }

  // Create roles
  const adminRole = await db.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
      description: "admin",
      permissions: JSON.stringify(["*"]),
      isSystem: true,
    },
  });

  await db.role.upsert({
    where: { name: "user" },
    update: {},
    create: {
      name: "user",
      description: "user",
      permissions: JSON.stringify(["read:*"]),
      isSystem: true,
    },
  });

  // Create admin user
  const hash = bcrypt.hashSync("admin123", 10);
  await db.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: hash,
      isActive: true,
      roleId: adminRole.id,
      email: "admin@kharazmi.ir",
    },
    create: {
      username: "admin",
      email: "admin@kharazmi.ir",
      passwordHash: hash,
      isActive: true,
      roleId: adminRole.id,
    },
  });

  const userCount = await db.user.count();
  console.log("Total users:", userCount);
  console.log("SUCCESS: admin / admin123");

  await db.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
