// Cross-platform production start script.
// Replaces `NODE_ENV=production bun .next/standalone/server.js`
// which only works on Unix shells.
//
// Works on Windows PowerShell, macOS, and Linux.
//
// Before starting the server, this script:
//  1) Verifies the standalone build exists
//  2) Copies the SQLite database into .next/standalone/db/ if missing
//     (otherwise Prisma creates an EMPTY database and login fails)
//  3) Picks the best runtime (bun if available, otherwise node)

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const serverFile = path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverFile)) {
  console.error("[start-prod] standalone server.js not found at:", serverFile);
  console.error("[start-prod] Run `npm run build` first.");
  process.exit(1);
}

// === Step 1: Make sure the SQLite database exists in the standalone dir ===
// The .env file has DATABASE_URL="file:./db/custom.db" which is relative to cwd.
// When running from .next/standalone/, that resolves to .next/standalone/db/custom.db.
// If the file doesn't exist there, Prisma silently creates an EMPTY database and
// login fails with 401. So we copy the source-of-truth database over before starting.
const srcDb = path.join(root, "db", "custom.db");
const destDbDir = path.join(standaloneDir, "db");
const destDb = path.join(destDbDir, "custom.db");

if (fs.existsSync(srcDb)) {
  if (!fs.existsSync(destDbDir)) fs.mkdirSync(destDbDir, { recursive: true });
  // Always copy — guarantees the latest database is used
  fs.copyFileSync(srcDb, destDb);
  console.log("[start-prod] Database copied to standalone/db/custom.db");
} else {
  console.warn("[start-prod] WARNING: db/custom.db not found in project root.");
  console.warn("[start-prod] The app will start, but login will fail until you run:");
  console.warn("[start-prod]   npm run seed:admin   (and optionally npm run import:excel)");
}

// Also make sure .env is present in standalone (it usually is, but just in case)
const envSrc = path.join(root, ".env");
const envDest = path.join(standaloneDir, ".env");
if (fs.existsSync(envSrc) && !fs.existsSync(envDest)) {
  fs.copyFileSync(envSrc, envDest);
  console.log("[start-prod] .env copied to standalone/");
}

// === Step 2: Pick a runtime — prefer bun if installed, otherwise fall back to node ===
function pickRuntime() {
  try {
    require("child_process").execSync("bun --version", { stdio: "ignore" });
    return "bun";
  } catch {
    return "node";
  }
}

const runtime = pickRuntime();
console.log(`[start-prod] Starting with ${runtime}: ${path.relative(root, serverFile)}`);
console.log(`[start-prod] cwd: ${standaloneDir}`);
console.log(`[start-prod] PORT: ${process.env.PORT || 3000}`);

const env = { ...process.env, NODE_ENV: "production", PORT: process.env.PORT || "3000" };

const child = spawn(runtime, [serverFile], {
  cwd: standaloneDir,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[start-prod] Process exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
