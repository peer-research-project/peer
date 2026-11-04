#!/usr/bin/env node
/**
 * Start `next dev -p 3000` against the ISOLATED Supabase test project
 * `peer-test` (ref cbsbtkvbmvyznerbpmxg), never against production.
 *
 * Why this exists
 * ---------------
 * `npm run dev` reads web/.env.local, which points at the production Supabase
 * project (one project serves local and peer.homes, so local writes are
 * production writes). Rehearsing the upload / Seed Pool rollout needs the same
 * app talking to the empty test project instead, without editing .env.local.
 *
 * How the override works (verified, not assumed)
 * ----------------------------------------------
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md,
 * "Environment Variable Load Order": `process.env` is consulted FIRST, then
 * .env.$(NODE_ENV).local, .env.local, .env.$(NODE_ENV), .env. The loader
 * (@next/env processEnv) only fills a key from a file when the key is
 * `undefined` in the original process.env snapshot, and an empty string is not
 * undefined. So every value this script puts in the child's environment --
 * including "" for a blanked variable -- wins over web/.env.local, also on
 * Next's own env reloads (they restore the same initial snapshot).
 *
 * What it does
 * ------------
 *  1. Reads web/.env.peer-test.local (or --env-file <path>), parsed with
 *     node:util parseEnv (no dependency). Refuses if the default file is not
 *     git-ignored.
 *  2. Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *     and SUPABASE_SERVICE_ROLE_KEY there, non-empty.
 *  3. REFUSES unless the URL is https and its host starts with
 *     `cbsbtkvbmvyznerbpmxg.`, and refuses if ANY value in the file mentions
 *     the production ref `gdakokshfjqljddlrkrh`, if a JWT-shaped key names a
 *     different project ref, or if the browser key is a secret/service key.
 *  4. Forces PEER_UPLOADS_ENABLED=true and PEER_UPLOAD_BUCKET=private-uploads.
 *  5. Blanks every email-sending / operator-secret variable unless the test
 *     file sets it, so a test run can never mail real readers with production
 *     configuration. Always blanks every operator-funded model / search key
 *     (Tier 0 or the reader's own key only), even if the test file sets one.
 *  6. Unless --dry-run: runs the same orphan cleanup as `predev`, then spawns
 *     `node node_modules/next/dist/bin/next dev -p 3000` directly (no shell).
 *
 * It never prints a value: only the Supabase host and variable NAMES.
 *
 * Usage:  node scripts/dev-test-target.mjs [--dry-run] [--env-file <path>]
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { FORBIDDEN_ON_VERCEL } from "./assert-byok-production-env.mjs";

const TEST_REF = "cbsbtkvbmvyznerbpmxg";
const PRODUCTION_REF = "gdakokshfjqljddlrkrh";
const PORT = "3000";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

/** Always these values, whatever the test file or the shell says. */
const FORCED = {
  PEER_UPLOADS_ENABLED: "true",
  PEER_UPLOAD_BUCKET: "private-uploads",
};

/**
 * Defaulted unless the test file sets them. NEXT_PUBLIC_SITE_URL is given a
 * value rather than blanked: src/lib/site.ts uses `?? fallback`, so "" would
 * produce empty links, and a production URL would send auth/email links to
 * production.
 */
const DEFAULTED_UNLESS_IN_FILE = {
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
};

/**
 * Blanked ("") unless the test file sets them explicitly: email sending and
 * operator secrets that must never come from production configuration.
 * Names taken from src/ (process.env.*) and web/.env.example.
 */
const BLANK_UNLESS_IN_FILE = [
  // Email: src/lib/email/send-digest.ts, profile test/confirm routes.
  "RESEND_API_KEY",
  "DIGEST_FROM_EMAIL",
  "DIGEST_EMAIL_CONFIRM_SECRET",
  // Operator bearer secrets for job / admin routes.
  "CRON_SECRET",
  "ADMIN_TOKEN",
  // Older browser-key spelling; the publishable key above wins anyway.
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  // Self-hosted upload directory would compete with the bucket.
  "PEER_PRIVATE_UPLOAD_DIR",
  // Digest / dashboard rollout switches: off unless the rehearsal opts in.
  "PEER_DIGEST_DEDUPE",
  "PEER_DIGEST_EMAIL_RETRY",
  "PEER_DASHBOARD_LEDGER",
  "PEER_DASHBOARD_PREPARE",
];

/**
 * Always blanked: operator-funded model / search / Jev credentials. Peer runs
 * Tier 0 or on the reader's own key (BYOK). Mirrors FORBIDDEN_ON_VERCEL in
 * scripts/assert-byok-production-env.mjs plus the smoke-test Jev key.
 */
// The build guard's own ban list is spread in, so the company-credential names it bans are named in one place only
// (src/lib/security/spend-scans.test.ts allows them nowhere else).
const ALWAYS_BLANK = [...new Set([...FORBIDDEN_ON_VERCEL,
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "PEER_DIGEST_PROVIDER",
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  "GOOGLE_VERTEX_SEARCH_PROJECT",
  "GOOGLE_VERTEX_SEARCH_ENGINE_ID",
  "GOOGLE_VERTEX_SEARCH_DATA_STORE_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "TAVILY_API_KEY",
  "JEV_SMOKE_API_KEY",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JSEARCH_API_KEY",
  "USAJOBS_API_KEY",
])];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const defaultEnvFile = path.join(webDir, ".env.peer-test.local");

function refuse(message) {
  console.error(`[dev-test-target] REFUSED: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { dryRun: false, envFile: defaultEnvFile, envFileGiven: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--env-file") {
      const next = argv[i + 1];
      if (!next) refuse("--env-file needs a path");
      out.envFile = path.resolve(next);
      out.envFileGiven = true;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/dev-test-target.mjs [--dry-run] [--env-file <path>]");
      process.exit(0);
    } else refuse(`unknown argument ${JSON.stringify(arg)}`);
  }
  return out;
}

/** true / false, or null when git cannot answer (e.g. a file outside the repo). */
function isGitIgnored(file) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", file], { cwd: webDir, stdio: "ignore" });
    return true;
  } catch (error) {
    if (error && typeof error.status === "number" && error.status === 1) return false;
    return null;
  }
}

/** Decoded JWT payload for JWT-shaped strings, otherwise null. Never printed. */
function jwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));

// ── 1. Read the test env file ────────────────────────────────────────────
if (!existsSync(args.envFile)) {
  refuse(
    `${args.envFileGiven ? args.envFile : "web/.env.peer-test.local"} does not exist. ` +
      "Copy web/.env.peer-test.local.example to web/.env.peer-test.local and fill in the peer-test project's values.",
  );
}
const ignored = isGitIgnored(args.envFile);
if (ignored === false) refuse(`${args.envFile} is NOT git-ignored; refusing to read secrets from a file git would commit.`);
if (ignored === null && !args.envFileGiven) refuse("could not confirm with git that web/.env.peer-test.local is ignored.");
if (ignored === null) console.warn("[dev-test-target] note: --env-file is outside the repository; git-ignore check skipped.");

let fileEnv;
try {
  fileEnv = parseEnv(readFileSync(args.envFile, "utf8"));
} catch {
  refuse("the test env file could not be parsed (dotenv syntax).");
}

// ── 2. Required names ────────────────────────────────────────────────────
const missing = REQUIRED.filter((name) => !fileEnv[name]?.trim());
if (missing.length) refuse(`missing or empty in the test env file: ${missing.join(", ")}`);

// ── 3. Target identity ───────────────────────────────────────────────────
for (const [name, value] of Object.entries(fileEnv)) {
  if (String(value).toLowerCase().includes(PRODUCTION_REF)) {
    refuse(`${name} mentions the PRODUCTION project ref ${PRODUCTION_REF}.`);
  }
  const claims = jwtPayload(String(value).trim());
  if (claims && typeof claims.ref === "string" && claims.ref !== TEST_REF) {
    refuse(`${name} is a JWT for project ref ${claims.ref === PRODUCTION_REF ? "PRODUCTION" : "another project"}, not ${TEST_REF}.`);
  }
}
let url;
try {
  url = new URL(fileEnv.NEXT_PUBLIC_SUPABASE_URL.trim());
} catch {
  refuse("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
}
if (url.protocol !== "https:") refuse(`NEXT_PUBLIC_SUPABASE_URL must use https (got ${url.protocol}).`);
if (!url.hostname.toLowerCase().startsWith(`${TEST_REF}.`)) {
  refuse(`NEXT_PUBLIC_SUPABASE_URL host ${url.hostname} does not start with ${TEST_REF}. (the peer-test project).`);
}
const browserKey = fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
const browserClaims = jwtPayload(browserKey);
if (browserKey.startsWith("sb_secret_") || browserClaims?.role === "service_role") {
  refuse("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a SECRET/service key; it would be shipped to the browser.");
}
const serverKey = fileEnv.SUPABASE_SERVICE_ROLE_KEY.trim();
const serverClaims = jwtPayload(serverKey);
if (serverKey.startsWith("sb_publishable_") || (serverClaims && serverClaims.role !== "service_role")) {
  refuse("SUPABASE_SERVICE_ROLE_KEY is not a secret/service-role key.");
}
if (serverKey === browserKey) refuse("the publishable key and the service-role key are identical.");

// ── 4/5. Build the child environment ─────────────────────────────────────
const childEnv = { ...process.env };
delete childEnv.__NEXT_PROCESSED_ENV;

const report = { fromFile: [], ignoredFromFile: [], blanked: [], defaulted: [], forced: [] };

for (const name of BLANK_UNLESS_IN_FILE) {
  if (!Object.hasOwn(fileEnv, name)) {
    childEnv[name] = "";
    report.blanked.push(name);
  }
}
for (const [name, value] of Object.entries(DEFAULTED_UNLESS_IN_FILE)) {
  if (!Object.hasOwn(fileEnv, name)) {
    childEnv[name] = value;
    report.defaulted.push(name);
  }
}
for (const [name, value] of Object.entries(fileEnv)) {
  if (ALWAYS_BLANK.includes(name) || Object.hasOwn(FORCED, name)) {
    report.ignoredFromFile.push(name);
    continue;
  }
  childEnv[name] = value;
  report.fromFile.push(name);
}
for (const name of ALWAYS_BLANK) {
  childEnv[name] = "";
  report.blanked.push(name);
}
for (const [name, value] of Object.entries(FORCED)) {
  childEnv[name] = value;
  report.forced.push(`${name}=${value}`);
}

const list = (names) => (names.length ? names.join(", ") : "(none)");
console.log(`[dev-test-target] Supabase target host: ${url.hostname}  (test project ${TEST_REF}; production ${PRODUCTION_REF} refused)`);
console.log(`[dev-test-target] env file: ${args.envFileGiven ? args.envFile : "web/.env.peer-test.local"} (git-ignored: ${ignored === null ? "n/a, outside repo" : "yes"})`);
console.log(`[dev-test-target] set from env file: ${list(report.fromFile)}`);
console.log(`[dev-test-target] ignored from env file (forced or never allowed): ${list(report.ignoredFromFile)}`);
console.log(`[dev-test-target] forced: ${list(report.forced)}`);
console.log(`[dev-test-target] defaulted: ${list(report.defaulted.map((n) => `${n}=${DEFAULTED_UNLESS_IN_FILE[n]}`))}`);
console.log(`[dev-test-target] blanked (""): ${list(report.blanked)}`);
console.log("[dev-test-target] these override web/.env.local (process.env is consulted first by Next.js).");

// ── 6. Start (or not) ────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const command = [process.execPath, nextBin, "dev", "-p", PORT];

if (args.dryRun) {
  console.log(`[dev-test-target] DRY RUN: would run orphan cleanup, then: node ${path.relative(webDir, nextBin)} dev -p ${PORT} (cwd web/). Nothing started.`);
  process.exit(0);
}

try {
  execFileSync(process.execPath, [path.join(scriptDir, "kill-dev-orphans.mjs")], { cwd: webDir, stdio: "inherit" });
} catch {
  console.warn("[dev-test-target] orphan cleanup failed; continuing (next dev will report a busy port).");
}

const child = spawn(command[0], command.slice(1), { cwd: webDir, env: childEnv, stdio: "inherit" });
const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
