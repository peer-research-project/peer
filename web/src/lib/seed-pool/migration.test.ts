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

});
