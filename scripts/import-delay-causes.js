/**
 * Parse Causes of delay.txt and import into database
 * Run with: node scripts/import-delay-causes.js
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient({ log: ["error", "warn"] });

function parseRow(line) {
  // Remove leading/trailing braces
  let s = line.trim();
  if (s.startsWith("{")) s = s.slice(1);
  if (s.endsWith("}")) s = s.slice(0, -1);
  if (s.endsWith(",")) s = s.slice(0, -1);
  // Split by comma, but handle quoted strings
  const parts = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

async function main() {
  console.log("📋 Importing delay causes...");
  const file = path.resolve(__dirname, "..", "upload", "Causes of delay.txt");
  if (!fs.existsSync(file)) {
    console.error("File not found:", file);
    process.exit(1);
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  // Skip header row (line 1)
  const dataLines = lines.slice(1);

  // Clear existing
  try {
    await db.$executeRawUnsafe(`DELETE FROM "DelayCause"`);
  } catch {
    // Table might not exist yet
  }

  let count = 0;
  for (const line of dataLines) {
    const parts = parseRow(line);
    if (parts.length < 7) continue;

    const mainCategory = parts[0];
    const subCategory = parts[1];
    const rootCause = parts[2];
    const solution = parts[3];
    const impactPercent = parseFloat(parts[4]) || 0;
    const durationDays = parseInt(parts[5]) || 0;
    const unit = parts[6];
    const warning = parts[7] || "";

    if (!rootCause) continue;

    try {
      const now = new Date();
      await db.$executeRawUnsafe(
        `INSERT INTO "DelayCause" ("id", "mainCategory", "subCategory", "rootCause", "solution", "impactPercent", "durationDays", "unit", "warning", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        `dc_${Date.now()}_${count}`,
        mainCategory,
        subCategory,
        rootCause,
        solution,
        impactPercent,
        durationDays,
        unit,
        warning || null,
        now
      );
      count++;
    } catch (e) {
      console.error(`  ⚠️  Failed: ${rootCause.substring(0, 40)}... - ${e.message.substring(0, 80)}`);
    }
  }

  console.log(`  ✓ Imported ${count} delay causes`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Failed:", e.message);
  process.exit(1);
});
