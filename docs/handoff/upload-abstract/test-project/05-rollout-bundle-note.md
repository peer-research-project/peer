# 05 — Rehearsing the canonical rollout bundle on peer-test

The rehearsal step is: run the **exact** canonical bundle, unmodified, in the SQL Editor of the peer-test project (ref `cbsbtkvbmvyznerbpmxg`), immediately after `00-test-target-guard.sql` passed in that same project.

- File: `docs/handoff/upload-abstract/sql-runtime/seed-closure-canonical-lf.sql`
- SHA-256: `A7878BF3A92587B653159604AED6DF0F959207A9C36958E686729EB215120A1B (R-C11 bundle, 2026-11-04; supersedes F1D16D…5745A)`, 63045 bytes, LF only, 604 non-ASCII bytes (UTF-8 box-drawing characters in comments).
- It carries its own `BEGIN;` … `COMMIT;`. Do not add, remove or reformat anything, and do not prepend the guard to it: the guard is a separate run.
- Contents, in order: `20260924000000_dashboard_delivery_ledger.sql`, `20260924000300_briefing_deliveries_dedupe.sql`, `20260924000500_dashboard_rollover.sql`, `20261102000000_seed_pool.sql` (corrected, commit `93673ab4`).

## How to get the exact bytes into the editor

1. Re-hash the file first (PowerShell): `Get-FileHash -Algorithm SHA256 "docs\handoff\upload-abstract\sql-runtime\seed-closure-canonical-lf.sql"` and confirm the value above.
2. Copy it as UTF-8, not the PowerShell 5.1 default code page: `Get-Content -Raw -Encoding UTF8 "docs\handoff\upload-abstract\sql-runtime\seed-closure-canonical-lf.sql" | Set-Clipboard`.
3. In the peer-test SQL Editor, open a new query, paste, and run. The editor cannot show a hash; check afterwards (item 7 below) that no function body picked up a carriage return.
4. Expected output: success, plus three NOTICEs of the form `policy "seed_pool_owner_read" for relation "public.seed_pool_…" does not exist, skipping` (bundle lines 538/540/542). Any ERROR means the whole transaction rolled back; record it and do not retry with edits.
5. Run the bundle **once**. It is not re-runnable (its dashboard policies are created without `IF NOT EXISTS`); 00 reports `canonical bundle ALREADY applied` afterwards.

## Post-bundle checks, in order

1. `00-test-target-guard.sql` again — still `PASS`, stage now `canonical bundle ALREADY applied`.
2. `08-post-bundle-checks.sql` — `all_required_pass` must be `true`. It checks:
   - all 7 new tables exist (`dashboard_batches`, `dashboard_deliveries`, `dashboard_rollover_candidates`, `seed_pool_state`, `seed_pool_observed_days`, `seed_pool_assets`, `seed_pool_snapshots`), owner `postgres`, RLS enabled and not forced;
   - all 19 new/replaced functions exist once, owner `postgres`; the 16 SECURITY DEFINER ones pin `search_path=public, pg_temp`;
   - `briefing_deliveries.local_date` is nullable text with no default; `seed_pool_version` / `seed_revocation_generation` on `briefing_deliveries` and `dashboard_batches`;
   - the unique partial index `briefing_deliveries_user_local_date_idx … WHERE (local_date IS NOT NULL)`, owner `postgres`;
   - the 6 owner-read policies;
   - anon: no table privilege on any new table and no EXECUTE on any new function; authenticated: SELECT only on the six owner-readable tables, no writes, no EXECUTE; service_role: read/write on the four seed tables and EXECUTE on every new function except `seed_pool_fence_matches`;
   - no carriage return in any public function body;
   - `briefing_deliveries_id_seq` owner and ACL unchanged from the production export;
   - the 9 baseline tables and the `private-uploads` bucket are untouched; no unrelated table (`dashboard_prepare_jobs`, `usage_events`, `company_spend_*`, `local_test_before`) appeared.
3. Read `informational` in the 08 output and compare with `07-verify-default-privileges.sql` from BOTH projects:
   - `service_role_rw_on_dashboard_tables_via_default_privileges` and `service_role_execute_seed_pool_fence_matches` come from the creating role's default privileges, not from the bundle. If peer-test and production default privileges differ, these values are not evidence for production.
4. `09-post-bundle-role-smoke.sql` (optional, recommended) — real anon / authenticated / service_role calls. It ends in an intentional ERROR beginning `PEER_SMOKE_RESULT` and rolls everything back. Expected values are listed in its header.
5. Re-run `02`, `03`, `04`, `06` and save them as the post-bundle record. `04` must still equal the production sequence export. `02`/`03`/`06` will now differ from production **by design** (new tables, `local_date`, seed objects); that is the intended change, not drift.

## What this rehearsal does NOT test

- **Legacy NULL `local_date` behaviour.** The test project has no historical `briefing_deliveries` rows, so duplicate-legacy-day protection, "no backfill" and byte preservation cannot be observed here. 08 reports the row count (expected 0). Those behaviours are covered only by the local harness (`prodmeta-legacy-check.sql`, `prodmeta-legacy-digest-fixed.sql`). Inserting invented legacy rows here would first need invented auth users and a separate, explicit decision.
- Lock duration and resource effects of adding the column and index on production's real `briefing_deliveries` size.
- Production's exact `auth.uid()` definition/ACL and other Supabase-owned internals, if peer-test runs a newer platform version (02/03 will show it).
- App behaviour, Auth, storage uploads, email and the deployed UI: separate hosted acceptance with the `peer-web-test-target` launch configuration.

## What it proves that the local harness could not

- The bundle's DDL executed by the real, **non-superuser** Supabase `postgres` role (the local replay ran as a superuser and reassigned owners afterwards), including FKs to the real `auth.users`, and real `anon` / `authenticated` / `service_role` privilege outcomes.
