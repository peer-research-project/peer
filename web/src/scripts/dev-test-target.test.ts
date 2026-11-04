import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * W15 · the isolated test-target launcher (`scripts/dev-test-target.mjs`) and
 * its `--prod` mode (next build, then next start -p 3000).
 *
 * Spawned, not imported, for the same reason as the build guard's test next
 * door: the script's contract is its exit code and printed plan, and its
 * top-level body calls `process.exit`. Every run uses `--dry-run` with a FAKE
 * env file in a temp directory, so nothing is built, nothing binds a port and
 * no real env file is read.
 */

const SCRIPT = path.join(process.cwd(), "scripts", "dev-test-target.mjs");
const TEST_REF = "cbsbtkvbmvyznerbpmxg";
const PRODUCTION_REF = "gdakokshfjqljddlrkrh";

/** Recognisable values that must never be echoed back. */
const SENTINEL_PUB = "sb_publishable_SENTINEL-NOT-A-KEY-7c1e";
const SENTINEL_SECRET = "sb_secret_SENTINEL-NOT-A-KEY-2b9d";

const dir = mkdtempSync(path.join(tmpdir(), "peer-w15-launcher-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function envFile(name: string, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SENTINEL_PUB,
    SUPABASE_SERVICE_ROLE_KEY: SENTINEL_SECRET,
    ...extra,
  };
  const file = path.join(dir, name);
  writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf8");
  return file;
}

function run(args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
}

function plannedLine(out: string): string {
  return out.split(/\r?\n/).find((line) => line.includes("DRY RUN")) ?? "";
}

describe("dev-test-target launcher --prod", () => {
  it("--dry-run --prod plans next build, then next start -p 3000 only if the build exits 0", () => {
    const { status, out } = run(["--dry-run", "--prod", "--env-file", envFile("ok.env")]);
    expect(status).toBe(0);
    const plan = plannedLine(out);
    expect(plan).toMatch(/orphan cleanup/);
    const build = plan.indexOf(" build");
    const start = plan.indexOf(" start -p 3000");
    expect(build).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(build);
    expect(plan.slice(build, start)).toMatch(/if it exits 0/);
    expect(plan).not.toMatch(/ dev -p/);
    expect(out).toMatch(/mode: production/);
  });

  it("--dry-run without --prod still plans next dev -p 3000 and no build", () => {
    const { status, out } = run(["--dry-run", "--env-file", envFile("ok-dev.env")]);
    expect(status).toBe(0);
    const plan = plannedLine(out);
    expect(plan).toMatch(/ dev -p 3000/);
    expect(plan).not.toMatch(/ build| start -p/);
  });

  it("prints names and the host, never a value", () => {
    const { out } = run(["--dry-run", "--prod", "--env-file", envFile("ok-values.env")]);
    expect(out).toContain(`${TEST_REF}.supabase.co`);
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(out).not.toContain(SENTINEL_PUB);
    expect(out).not.toContain(SENTINEL_SECRET);
  });

  it("--prod refuses an env file that mentions the production ref anywhere, and plans nothing", () => {
    const file = envFile("prod-ref.env", { PEER_REHEARSAL_NOTE: `https://${PRODUCTION_REF}.supabase.co` });
    const { status, out } = run(["--dry-run", "--prod", "--env-file", file]);
    expect(status).toBe(1);
    expect(out).toMatch(/REFUSED: PEER_REHEARSAL_NOTE mentions the PRODUCTION project ref/);
    expect(out).not.toMatch(/DRY RUN/);
  });

  it("--prod refuses a Supabase URL that is not the peer-test project", () => {
    const file = envFile("other-host.env", { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
    const { status, out } = run(["--dry-run", "--prod", "--env-file", file]);
    expect(status).toBe(1);
    expect(out).toMatch(/REFUSED: NEXT_PUBLIC_SUPABASE_URL host example\.supabase\.co/);
    expect(out).not.toMatch(/DRY RUN/);
  });
});
