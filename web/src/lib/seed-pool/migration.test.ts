import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261102000000_seed_pool.sql", "utf8");
function body(name: string): string {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\bas \\$\\$([\\s\\S]*?)end \\$\\$;`, "i"));
  if (!match) throw new Error(`Missing function ${name}`);
  return match[1];
}
describe("seed migration source invariants (not a PostgreSQL runtime test)", () => {
  it("checks the shared owner lock and seed fence before serving, acknowledging, and persisting email", () => {
    for (const fn of ["seed_pool_mark_batch_served", "seed_pool_ack_batch", "seed_pool_persist_digest_email"]) {
      const fnBody = body(fn);
      expect(fnBody).toContain("pg_advisory_xact_lock");
      expect(fnBody).toContain("seed_pool_fence_matches");
      expect(fnBody.indexOf("seed_pool_fence_matches")).toBeLessThan(fnBody.indexOf("for update"));
    }
  });
  it("cannot acknowledge a prepared-only batch through the legacy function", () => {
    const fnBody = body("seed_pool_ack_batch");
    expect(fnBody).toContain("v_row.status='prepared'");
    expect(fnBody.indexOf("'not_served'")).toBeLessThan(fnBody.indexOf("acknowledge_dashboard_batch"));
  });
  it("forgets affected seed versions without deleting notes or saved library rows", () => {
    const fnBody = body("seed_pool_forget");
    expect(fnBody).toContain("owner_id=p_owner_id and seed_pool_version=any(v_versions)");
    expect(fnBody).toContain("user_id=p_owner_id and seed_pool_version=any(v_versions)");
    expect(fnBody).toContain("payload='{}'::jsonb,item_ids='{}'::text[]");
    expect(fnBody).not.toMatch(/delete\s+from\s+public\.(notes|saved_papers)/i);
  });
  it("fences seeded private cache writes against revoked versions", () => {
    const fnBody = body("seed_pool_put_private_pool");
    expect(fnBody).toContain("seed_pool_fence_matches");
    expect(fnBody.indexOf("seed_pool_fence_matches")).toBeLessThan(fnBody.indexOf("insert into public.private_paper_pools"));
    expect(fnBody).toContain("pg_advisory_xact_lock");
    expect(fnBody).toContain("p_expected_revocation_generation");
  });

  it("grants owner-scoped reads without granting browser mutation", () => {
    for (const table of ["seed_pool_state", "seed_pool_assets", "seed_pool_snapshots"]) {
      expect(sql).toContain(`create policy seed_pool_owner_read on public.${table} for select to authenticated using (auth.uid()=owner_id)`);
    }
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*\bto\s+authenticated/i);
  });

});


it("protects an earlier legacy digest on the owner's local day before first seed activation", () => {
  const fn = body("seed_pool_apply");
  expect(fn).toMatch(/user_id=p_owner_id\s+and\s*\(local_date=v_today::text or \(local_date is null and \(delivered_at at time zone v_zone\)::date=v_today\)\)/i);
  expect(fn.indexOf("briefing_deliveries")).toBeLessThan(fn.indexOf("v_target :="));
});


it("exposes only owner-scoped opaque incomplete tombstones and retries at current revision", () => {
  const editor = body("seed_pool_editor");
  expect(editor).toMatch(/jsonb_build_object\('cleanupPending'[\s\S]*?jsonb_build_object\('id',a\.id::text\)[\s\S]*?a\.owner_id=p_owner_id and a\.status='revoked' and not a\.cleanup_complete/i);
  const forget = body("seed_pool_forget");
  expect(forget.indexOf("v_state.revision is distinct from p_expected_revision")).toBeLessThan(forget.indexOf("v_status='revoked'"));
  expect(forget).toMatch(/where owner_id=p_owner_id and status='revoked' and canonical_key=v_key/i);
});


it("recognizes a served legacy batch on the owner day without counting prepared batches", () => {
  const fn = body("seed_pool_apply");
  expect(fn).toMatch(/from public\.dashboard_batches where owner_id=p_owner_id and status in \('served','acknowledged'\) and\s*\(local_date=v_today::text or \(seed_pool_version is null and \(coalesce\(served_at,acknowledged_at\) at time zone v_zone\)::date=v_today\)\)/i);
  expect(fn.indexOf("from public.dashboard_batches")).toBeLessThan(fn.indexOf("v_target :="));
  expect(fn).not.toMatch(/created_at\s+at time zone v_zone/i);
});

it("illustrates the legacy UTC-key versus Tokyo served-day boundary", () => {
  const instant = new Date("2026-09-24T23:30:00Z");
  const day = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  expect(day("UTC")).toBe("2026-09-24");
  expect(day("Asia/Tokyo")).toBe("2026-09-25");
});


it("serializes digest claims and protects legacy same-owner local-day deliveries", () => {
  const fn = body("claim_briefing_delivery");
  expect(fn).toContain("pg_advisory_xact_lock");
  expect(fn).toContain("if not found then raise exception");
  expect(fn).toContain("perform now() at time zone v_zone");
  expect(fn).toMatch(/user_id=p_user_id and local_date is null and \(delivered_at at time zone v_zone\)::date=v_day/i);
  expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("insert into public.briefing_deliveries"));
  expect(fn.indexOf("local_date is null")).toBeLessThan(fn.indexOf("insert into public.briefing_deliveries"));
});

it("activates a saved pool strictly after every served date label, whatever zone served it (R-C11)", () => {
  const fn = body("seed_pool_apply");
  const floor = fn.slice(fn.indexOf("select max(d) into v_last"), fn.indexOf("v_target :="));
  expect(floor).toMatch(/from public\.dashboard_batches where owner_id=p_owner_id and status in \('served','acknowledged'\)/i);
  expect(floor).not.toMatch(/'prepared'/);
  expect(floor).toMatch(/from public\.briefing_deliveries where user_id=p_owner_id and local_date is not null/i);
  expect(floor).toMatch(/from public\.seed_pool_observed_days where owner_id=p_owner_id/i);
  expect(fn).toMatch(/v_target := case when not v_active and not v_served and v_count>0 and \(v_last is null or v_last<v_today\) then v_today else greatest\(v_today\+1, v_last\+1\) end;/i);
});
