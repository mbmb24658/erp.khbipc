#!/usr/bin/env node
/**
 * Cleanup script — run AFTER extracting khbipc-modern-fix-v2.zip
 *
 * Removes files that conflict with Next.js 16 Turbopack's stricter
 * route/page resolution rules. The zip extractor cannot delete files
 * from your existing repo, so we use this script instead.
 *
 * Specifically removes:
 *   - src/app/api/route.ts     (conflicts with /api sub-routes in Turbopack)
 *   - src/app/api/page.tsx     (if it exists — also conflicts)
 *   - src/app/api/page.ts      (if it exists)
 *   - .next/                   (stale build cache that references deleted files)
 *
 * Usage:
 *   node scripts/cleanup-conflicts.js
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

const filesToRemove = [
  "src/app/api/route.ts",
  "src/app/api/route.tsx",
  "src/app/api/route.js",
  "src/app/api/page.tsx",
  "src/app/api/page.ts",
  "src/app/api/page.js",
];

const dirsToRemove = [".next", ".vercel/output"];

let removed = 0;
let skipped = 0;

console.log("=== Khbipc Conflict Cleanup ===\n");

// Remove files
for (const rel of filesToRemove) {
  const abs = path.join(projectRoot, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { force: true });
    console.log(`✓ Removed: ${rel}`);
    removed++;
  } else {
    console.log(`- Skipped (not present): ${rel}`);
    skipped++;
  }
}

// Remove cache directories
for (const rel of dirsToRemove) {
  const abs = path.join(projectRoot, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`✓ Cleaned cache: ${rel}/`);
    removed++;
  } else {
    console.log(`- Skipped (not present): ${rel}/`);
    skipped++;
  }
}

console.log(`\nDone: ${removed} removed, ${skipped} skipped.`);
console.log("\nNext steps:");
console.log("  1. Commit the deletion:  git add -A && git commit -m 'remove conflicting api/route.ts'");
console.log("  2. Push to git:          git push");
console.log("  3. Vercel will rebuild automatically.");
