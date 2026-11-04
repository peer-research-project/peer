#!/usr/bin/env node
/**
 * 10-c15-age-upload-meta.mjs  (W12, rubric unit C15)
 *
 * Makes ONE ordinary reading upload on the peer-test project (ref
 * cbsbtkvbmvyznerbpmxg) look 31 days old, so the purge job's ordinary 30-day
 * rule can be observed without waiting a month.
 *
 * Why a script and not SQL: an ordinary upload's expiry is not a database
 * column. It is the `expiresAt` field inside the bucket object
 * `private-uploads/<hash16>.json` (web/src/lib/papers/upload-store.ts,
 * UploadMeta; written by web/src/app/api/papers/upload/route.ts as
 * now + 30 days). `purgeExpiredUploads` reads that field and nothing else
 * (upload-store.ts: `meta?.expiresAt && Date.parse(meta.expiresAt) <= Date.now()`).
 * Postgres only holds the object's row in storage.objects, not its bytes.
 *
 * Safety:
 *   * Reads web/.env.peer-test.local (git-ignored) and REFUSES unless the URL
 *     is https with a host starting `cbsbtkvbmvyznerbpmxg.`, no value mentions
 *     the production ref, and no JWT-shaped key names another project.
 *   * Never prints a key, a token, the owner key, or the file's title.
 *   * Touches exactly one object name, `<hash16>.json`, and only if its body
 *     is an ordinary upload record for that hash16 with status "ready".
 *   * Default mode is a dry run. `--apply` keeps a one-time backup of the
 *     original body in %TEMP%\peer-claude-w12\ before writing.
 *
 * Usage (from the repository root):
 *   node docs/handoff/upload-abstract/test-project/10-c15-age-upload-meta.mjs --hash <hash16>            (dry run)
 *   node docs/handoff/upload-abstract/test-project/10-c15-age-upload-meta.mjs --hash <hash16> --apply    (write)
 *   node docs/handoff/upload-abstract/test-project/10-c15-age-upload-meta.mjs --hash <hash16> --restore  (undo, only if not purged)
 *   optional: --days <n>  (default 31; must be > 30)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const TEST_REF = "cbsbtkvbmvyznerbpmxg";
const PRODUCTION_REF = "gdakokshfjqljddlrkrh";
const BUCKET = "private-uploads";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");
const webDir = path.join(repoRoot, "web");
const envFile = path.join(webDir, ".env.peer-test.local");
const backupDir = path.join(os.tmpdir(), "peer-claude-w12");

function refuse(message) {
  console.error(`[c15-age-upload-meta] REFUSED: ${message}`);
  process.exit(1);
}

// ── arguments ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let hash = null;
let mode = "dry-run";
let days = 31;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--hash") { hash = argv[i + 1] ?? null; i += 1; }
  else if (arg === "--apply") mode = mode === "dry-run" ? "apply" : refuse("choose one of --apply / --restore");
  else if (arg === "--restore") mode = mode === "dry-run" ? "restore" : refuse("choose one of --apply / --restore");
  else if (arg === "--days") { days = Number(argv[i + 1]); i += 1; }
  else refuse(`unknown argument ${JSON.stringify(arg)}`);
}
if (!hash || !/^[0-9a-f]{16}$/.test(hash)) refuse("--hash must be the 16 lowercase hex characters of the upload id (upload:<hash16>).");
if (!Number.isInteger(days) || days <= 30 || days > 365) refuse("--days must be an integer between 31 and 365.");

// ── target identity (same rules as web/scripts/dev-test-target.mjs) ─────────
if (!existsSync(envFile)) refuse("web/.env.peer-test.local does not exist.");
let env;
try { env = parseEnv(readFileSync(envFile, "utf8")); } catch { refuse("web/.env.peer-test.local could not be parsed."); }
for (const [name, value] of Object.entries(env)) {
  const text = String(value);
  if (text.toLowerCase().includes(PRODUCTION_REF)) refuse(`${name} mentions the production project ref.`);
  const parts = text.trim().split(".");
  if (parts.length === 3 && parts[0].startsWith("eyJ")) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (typeof claims.ref === "string" && claims.ref !== TEST_REF) refuse(`${name} is a JWT for another project.`);
    } catch { /* not a JWT */ }
  }
}
const urlText = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!urlText || !serviceKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the test env file.");
let url;
try { url = new URL(urlText); } catch { refuse("NEXT_PUBLIC_SUPABASE_URL is not a valid URL."); }
if (url.protocol !== "https:") refuse("NEXT_PUBLIC_SUPABASE_URL must use https.");
if (!url.hostname.toLowerCase().startsWith(`${TEST_REF}.`)) refuse(`the Supabase host does not start with ${TEST_REF}. (not the peer-test project).`);
if (serviceKey.startsWith("sb_publishable_")) refuse("SUPABASE_SERVICE_ROLE_KEY is a publishable key, not a secret key.");
console.log(`[c15-age-upload-meta] target host ${url.hostname} (peer-test), bucket ${BUCKET}, object ${hash}.json, mode ${mode}`);

// ── client: the app's own supabase-js, created the way web/src/lib/supabase/admin.ts does ──
const requireFromWeb = createRequire(path.join(webDir, "package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const storage = createClient(url.toString().replace(/\/$/, ""), serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET);

async function readObject(name) {
  const { data, error } = await storage.download(name);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer()).toString("utf8");
}
async function writeObject(name, text) {
  // Same call shape as the app's supabase backend `write` (upload-backend.ts).
  const { error } = await storage.upload(name, Buffer.from(text, "utf-8"), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) refuse(`the storage write failed (${error.message ?? "unknown error"}).`);
}

const metaName = `${hash}.json`;
const pdfName = `${hash}.pdf`;
const backupFile = path.join(backupDir, `c15-upload-meta-backup-${hash}.json`);

if (mode === "restore") {
  if (!existsSync(backupFile)) refuse(`no backup at ${backupFile}; nothing to restore.`);
  const { data: pdfExists } = await storage.exists(pdfName);
  if (pdfExists !== true) {
    console.log("[c15-age-upload-meta] the PDF object is gone (purged as expected). Restoring the record alone would create a dangling record, so nothing was written.");
    process.exit(0);
  }
  const original = readFileSync(backupFile, "utf8");
  const parsed = JSON.parse(original);
  if (parsed.hash16 !== hash) refuse("the backup does not belong to this hash16.");
  await writeObject(metaName, original);
  console.log(`[c15-age-upload-meta] restored the original record; expiresAt ${parsed.expiresAt}`);
  process.exit(0);
}

const raw = await readObject(metaName);
if (raw === null) refuse(`${metaName} was not found in ${BUCKET} (already purged, or wrong hash16).`);
let meta;
try { meta = JSON.parse(raw); } catch { refuse(`${metaName} is not JSON.`); }
if (meta.hash16 !== hash) refuse("the record's hash16 does not match --hash.");
if (typeof meta.ownerKey !== "string" || !/^[0-9a-f]{64}$/.test(meta.ownerKey)) refuse("the record has no owner key; it is not an owned upload.");
if (meta.status !== undefined && meta.status !== "ready") refuse(`the record's status is ${JSON.stringify(meta.status)}, not "ready".`);
if (!Number.isFinite(Date.parse(meta.expiresAt)) || !Number.isFinite(Date.parse(meta.uploadedAt))) refuse("the record has no parseable uploadedAt/expiresAt.");

const now = Date.now();
const uploadedAt = new Date(now - days * 86400_000).toISOString();
const expiresAt = new Date(now - days * 86400_000 + 30 * 86400_000).toISOString();
console.log(`[c15-age-upload-meta] current uploadedAt ${meta.uploadedAt}  expiresAt ${meta.expiresAt}  textStatus ${meta.textStatus}  revision ${meta.revision ?? "(none)"}`);
console.log(`[c15-age-upload-meta] planned uploadedAt ${uploadedAt}  expiresAt ${expiresAt}  (uploaded ${days} days ago; 30-day access ended ${days - 30} day(s) ago)`);

if (mode === "dry-run") {
  console.log("[c15-age-upload-meta] DRY RUN: nothing written. Re-run with --apply to write.");
  process.exit(0);
}

mkdirSync(backupDir, { recursive: true });
if (!existsSync(backupFile)) writeFileSync(backupFile, raw, { encoding: "utf8", mode: 0o600 });
else console.log("[c15-age-upload-meta] a backup already exists; it is kept as the original (not overwritten).");

const aged = { ...meta, uploadedAt, expiresAt };
await writeObject(metaName, JSON.stringify(aged, null, 2));

const check = JSON.parse((await readObject(metaName)) ?? "{}");
if (check.expiresAt !== expiresAt) refuse("read-back did not show the new expiresAt; inspect the object by hand.");
console.log(`[c15-age-upload-meta] applied. Read-back expiresAt ${check.expiresAt} (in the past: ${Date.parse(check.expiresAt) <= Date.now()}). Backup: ${backupFile}`);
