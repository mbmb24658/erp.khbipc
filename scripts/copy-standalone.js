// Cross-platform script to copy .next/static and public into .next/standalone
// Used after `next build` for standalone output mode.
// Works on Windows, macOS, and Linux without needing bash/cp.

const fs = require("fs");
const path = require("path");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const root = path.resolve(__dirname, "..");
  const standaloneDir = path.join(root, ".next", "standalone");
  if (!fs.existsSync(standaloneDir)) {
    console.warn(
      "[copy-standalone] .next/standalone not found. Did `next build` run with output: 'standalone'?"
    );
    return;
  }

  // 1) Copy .next/static -> .next/standalone/.next/static
  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  console.log("[copy-standalone] Copying .next/static ->", path.relative(root, staticDest));
  copyRecursive(staticSrc, staticDest);

  // 2) Copy public -> .next/standalone/public
  const publicSrc = path.join(root, "public");
  const publicDest = path.join(standaloneDir, "public");
  console.log("[copy-standalone] Copying public ->", path.relative(root, publicDest));
  copyRecursive(publicSrc, publicDest);

  // 3) Copy the SQLite database into standalone/db/
  // This is critical because DATABASE_URL="file:./db/custom.db" is relative
  // to the process cwd, and `npm start` runs from .next/standalone/.
  // Without this, Prisma creates an EMPTY new database in standalone/db/
  // and login will fail with "user not found".
  const dbSrc = path.join(root, "db");
  const dbDest = path.join(standaloneDir, "db");
  if (fs.existsSync(path.join(dbSrc, "custom.db"))) {
    if (!fs.existsSync(dbDest)) fs.mkdirSync(dbDest, { recursive: true });
    console.log("[copy-standalone] Copying db/custom.db ->", path.relative(root, dbDest));
    copyRecursive(path.join(dbSrc, "custom.db"), path.join(dbDest, "custom.db"));
  } else {
    console.warn(
      "[copy-standalone] WARNING: db/custom.db not found. The app will start with an empty database."
    );
    console.warn(
      "[copy-standalone] Run `npm run import:excel` to populate the database, then rebuild."
    );
  }

  // 4) Copy prisma/schema.prisma so prisma client can be regenerated if needed
  const prismaSrc = path.join(root, "prisma");
  const prismaDest = path.join(standaloneDir, "prisma");
  if (fs.existsSync(prismaSrc)) {
    if (!fs.existsSync(prismaDest)) fs.mkdirSync(prismaDest, { recursive: true });
    copyRecursive(path.join(prismaSrc, "schema.prisma"), path.join(prismaDest, "schema.prisma"));
  }

  console.log("[copy-standalone] Done.");
}

main();
