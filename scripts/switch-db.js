#!/usr/bin/env node
/**
 * Switch Prisma schema between SQLite (local dev) and PostgreSQL (Vercel production)
 *
 * Usage:
 *   node scripts/switch-db.js sqlite      # for local development
 *   node scripts/switch-db.js postgres    # for Vercel deployment
 *
 * Or via npm:
 *   npm run db:use-sqlite
 *   npm run db:use-postgres
 *
 * When switching to postgres, also copies schema.postgres.prisma to schema.prisma
 * so that `prisma generate` and `prisma db push` use the correct provider.
 */

const fs = require("fs");
const path = require("path");

const SCHEMA_PATH = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const POSTGRES_SCHEMA = path.resolve(__dirname, "..", "prisma", "schema.postgres.prisma");
const SQLITE_HEADER = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

`;

const target = process.argv[2];
if (!target || !["sqlite", "postgres"].includes(target)) {
  console.error("Usage: node scripts/switch-db.js <sqlite|postgres>");
  process.exit(1);
}

// Read the body of the schema (everything after the datasource block)
function getSchemaBody() {
  const content = fs.readFileSync(SCHEMA_PATH, "utf8");
  // Find the first model declaration
  const match = content.match(/(\/\/ ===.*?MODULE.*?===\n[\s\S]*)/);
  return match ? match[1] : "";
}

if (target === "postgres") {
  if (!fs.existsSync(POSTGRES_SCHEMA)) {
    console.error("schema.postgres.prisma not found!");
    process.exit(1);
  }
  // Use the postgres schema directly
  fs.copyFileSync(POSTGRES_SCHEMA, SCHEMA_PATH);
  console.log("✓ Switched to PostgreSQL schema (prisma/schema.prisma)");
  console.log("  Make sure DATABASE_URL and DIRECT_URL are set in .env");
} else {
  // Switch to SQLite — keep the body but replace the header
  const body = getSchemaBody();
  const newContent = SQLITE_HEADER + body;
  fs.writeFileSync(SCHEMA_PATH, newContent);
  console.log("✓ Switched to SQLite schema (prisma/schema.prisma)");
  console.log("  Make sure DATABASE_URL is set in .env (file:./db/custom.db)");
}
