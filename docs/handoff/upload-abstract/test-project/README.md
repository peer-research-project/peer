# peer-test: a production-shaped Supabase rehearsal target

Supabase project `peer-test`, ref **`cbsbtkvbmvyznerbpmxg`** (ca-central-1), created empty on 2026-11-03 as an isolated target. Production is ref **`gdakokshfjqljddlrkrh`**. These files make the test project's database match production's current state as closely as the read-only exports allow, so the canonical four-file bundle can be rehearsed on real Supabase exactly as it will run on production.

Every SQL file is pasted into the **peer-test** SQL Editor (role `postgres`). None of them contains a psql meta-command, a 127.0.0.1 guard or a synthetic `auth` schema. `07` is the only file that is also run on production, and it is a read-only catalog SELECT.

## Exact order

| # | Where | File | Writes? | Pass looks like |
|---|-------|------|---------|-----------------|
| 1 | browser | Confirm the address bar shows `/project/cbsbtkvbmvyznerbpmxg/`. This is the human root of trust; the SQL checks below are the second line. | no | — |
| 2 | peer-test | `07-verify-default-privileges.sql` | no | one JSON cell; save as `test-default-privileges.json`. `auth_users_triggers_owner_privilege.postgres_trigger_on_auth_users` predicts whether step 3 can create `on_auth_user_created`. |
| 3 | peer-test | `01-production-shape-baseline.sql` | **yes, once** | one JSON row `peer_test_baseline_summary` with `"baseline": "committed"`, 9 tables, 19 policies, 3 functions, `auth_users_trigger: 1`, `deviations: []`. |
| 4 | peer-test | `00-test-target-guard.sql` | no | `guard: PASS`, stage `baseline only`. |
| 5 | peer-test | `02-verify-schema.sql`, `03-verify-security.sql`, `04-verify-sequence.sql`, `06-verify-inventory.sql` | no | save each JSON cell (below). |
| 6 | local | the compare commands below | no | all categories match except the documented platform items. |
| 7 | production | `07-verify-default-privileges.sql` (read-only) | no | save as `production-default-privileges.json`; compare `default_acls`, `event_triggers`, `public_schema_acl` with step 2. |
| 8 | peer-test | `00-test-target-guard.sql` again, then the canonical bundle (see `05-rollout-bundle-note.md`) | **yes, once** | bundle success + 3 NOTICEs. |
| 9 | peer-test | `00`, `08-post-bundle-checks.sql`, optional `09-post-bundle-role-smoke.sql`, then `02`/`03`/`04`/`06` again | no (09 rolls back) | `all_required_pass: true`; 09's intentional `PEER_SMOKE_RESULT` error with the expected values. |

Saving a JSON cell: click the single result cell, copy its value, and save it as UTF-8 under `%TEMP%\peer-rollout-evidence\test-project\` (names below). Do not edit it.

Compare commands (run from the repo root, after saving the files):

```powershell
$E = "$env:TEMP\peer-rollout-evidence"; $T = "$E\test-project"
python -I docs/handoff/upload-abstract/sql-runtime/compare-metadata.py --production-schema "$E\production-schema-metadata.json" --local-schema "$T\test-schema-metadata.json" --production-security "$E\production-security-metadata.json" --local-security "$T\test-security-metadata.json"
python -I -c "import json,sys;r=lambda p:json.load(open(p,encoding='utf-8-sig'));a,b=r(sys.argv[1]),r(sys.argv[2]);d=sorted(k for k in a.keys()|b.keys() if a.get(k)!=b.get(k));print('sequence differing keys:',d or 'none');sys.exit(1 if d else 0)" "$E\production-sequence-metadata.json" "$T\test-sequence-metadata.json"
python -I -c "import json,sys;r=lambda p:json.load(open(p,encoding='utf-8-sig'));a=r(sys.argv[1])['inventory'];b=r(sys.argv[2]);d={k:(sorted(set(a[k])-set(b[k])),sorted(set(b[k])-set(a[k]))) for k in ('tables','buckets','policies','triggers','functions')};print('(production-only, test-only):',d);sys.exit(any(x or y for x,y in d.values()))" "$E\production-inventory-readonly.json" "$T\test-inventory.json"
```

Each command exits 0 on a match and 1 on any difference.

## What each file proves — and does not

- **`00-test-target-guard.sql`** — read-only. RAISEs unless all hold: sentinel table `peer_test_guard.target` exists with exactly one row naming `cbsbtkvbmvyznerbpmxg`; no `auth.users` row was created before 2026-11-03 UTC (only `min(created_at)` is read); `supabase_migrations.schema_migrations` is absent or empty; `public.private_paper_pools` exists. Reports whether the bundle is already applied and lists recorded baseline deviations.
  - Proves the editor session is attached to a database that went through `01`, has no pre-test-era users, and no production ledger.
  - Does **not** prove the project ref cryptographically: SQL cannot read the Supabase project ref. The sentinel is the proxy, and step 1 (address bar) is the root of trust.
- **Guard design.** The sentinel is created only by `01`, and `01` refuses unless the database is empty: no relation and no function in `public`, no `private-uploads` bucket, no ledger rows, no auth user older than 2026-11-03, sentinel schema absent, and `current_user = postgres`. Production fails `01` on the first check (it has 9 public tables) and fails `00` on the first check (no sentinel), plus independently on the auth-user age and ledger checks. The sentinel lives in its own schema `peer_test_guard` (not `public`, not exposed by the Data API, RLS on, no grants to `anon`/`authenticated`/`service_role`), so `public` stays identical to production and the inventory comparison stays clean. It deviates from the suggested `public.__peer_test_target` for exactly that reason.
- **`01-production-shape-baseline.sql`** — one transaction, single-shot. Reproduces production's 9 public tables, constraints, indexes, RLS flags, 19 policies by exact name, 3 functions, 2 triggers, table/sequence/function privileges and the private `private-uploads` bucket (26214400 bytes). Writes no user, auth or application rows. Ends with an in-transaction self-check (table set, 19 policies, owners `postgres`, sequence ACL, nothing that production lacks) that aborts on mismatch.
  - Does **not** create `dashboard_*` tables, `briefing_deliveries.local_date`, any `seed_pool_*` object, `usage_events`, `company_spend_*`, `dashboard_prepare_jobs`, or a `supabase_migrations` ledger (production's ledger is bookkeeping only; leaving it out also keeps the guard's ledger check meaningful).
  - Adds **no** `storage.objects` policies: the inventory lists none in the storage schema, and the bucket migration says private-by-design with no policies.
  - If Supabase refuses the trigger on `auth.users`, that one statement is caught, recorded in `peer_test_guard.deviations`, and reported by `01`'s summary and by `00`; everything else still commits. Consequence: signing up a test user would not auto-create a `profiles` row.
  - If this project's default privileges lack PUBLIC EXECUTE on new functions, `touch_updated_at`'s ACL string order differs from production; that is recorded as a deviation (not fatal) and `compare-metadata.py` will say `security triggers: DIFFERENT`.
- **`02` / `03` / `04`** — read-only. The SELECTs are byte-identical to `sql-runtime/schema-metadata-local.sql`, `security-metadata-local.sql`, `sequence-metadata-local.sql`; only the `\set` line and the 127.0.0.1 guard are removed. Save as `test-schema-metadata.json`, `test-security-metadata.json`, `test-sequence-metadata.json`.
  - `compare-metadata.py` compares columns **including `ordinal_position`** (so `profiles.feed_intent` must be ordinal 40; `01` adds and drops the four plan/trial placeholder columns at 36–39 to reproduce that), constraints, indexes, policies, table grants (`information_schema.role_table_grants`: table-level only, 7 standard privilege types), roles and the `auth.uid` function, then security tables/triggers/auth function/seed-object absence. It does not compare `postgres_version`.
  - Covers only `profiles`, `private_paper_pools`, `briefing_deliveries` (+ auth.users id and `auth.uid`). The other six tables are only checked by name via `06`.
- **`06-verify-inventory.sql`** — read-only, same shape as production's names-only inventory. Save as `test-inventory.json`. Expected difference: `migrations_table` is null on peer-test.
- **`07-verify-default-privileges.sql`** — read-only, run on both projects. The bundle relies on the creating role's default privileges for service_role access to the three dashboard tables and for EXECUTE on `seed_pool_fence_matches`. If the two outputs differ, rehearsal results for those items are not evidence for production.
- **`08-post-bundle-checks.sql`**, **`09-post-bundle-role-smoke.sql`**, **`05-rollout-bundle-note.md`** — see 05.

## Best-effort assumptions (not metadata-verified)

- **Tables outside the exported scope** — `saved_items`, `read_items`, `feedback_events` (from `web/supabase/schema.sql`), `opportunity_pools` (`20260727000000`), `usage_counters` (`20260904000000`), `private_decisions` (`20260924000400`): columns, defaults, constraint/index names, column order and policy bodies come from the repo source. Production created some of them through ledger migrations not in this repo (`add_persistence_layer`, `add_read_items_update_policy`); their exact text is unknown. Only their names (tables, policies) are verified, by `06`.
- **Their privileges** — written as Supabase's legacy defaults (`GRANT ALL` to anon/authenticated/service_role) plus each migration's revokes (`opportunity_pools`, `usage_counters`: nothing for anon/authenticated). `feedback_events_id_seq`: rwU for the three roles.
- **`profiles` column-level grants** — not in any export. Written as the net effect of `20260904000200` (corrected, `profile_plan_column_grants`), `20260922010000` and `20261007000000`: authenticated has INSERT and UPDATE on every current column. The table-level part (no INSERT/UPDATE for anon/authenticated) **is** export-verified.
- **`handle_new_user()`** — body from `20261007000000` (= `schema.sql`), SECURITY DEFINER, `search_path=public`; ACL as legacy defaults. **`increment_usage_counter()`** — body and privileges from `20260904000000`; identity arguments match the inventory.
- **`on_auth_user_created`** — name from the inventory, definition (`AFTER INSERT … FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`) from `schema.sql`.
- **`private-uploads.allowed_mime_types`** — `application/pdf`, `application/json`, `text/plain` from `20261001000000`; the inventory has only id/public/limit.
- **`profiles.feed_intent` comment** — from `20260922010000`.
- **Platform-owned objects** (`auth.uid()`, `auth.users`, roles, the `postgres` role attributes, schema ACLs) are Supabase's and are not touched. If peer-test runs a newer platform build, `02`/`03`/`04` may show differences there that cannot be fixed from SQL; record them, do not work around them.

## Local evidence for these files (2026-11-03)

A throwaway PostgreSQL 17.11 cluster on 127.0.0.1:55491 (separate data directory, deleted afterwards; the retained harness cluster was not touched) with an approximated Supabase platform (non-superuser `postgres` with BYPASSRLS/CREATEROLE/CREATEDB, `anon`/`authenticated`/`service_role` granted to it, owner-separated `auth.users`/`auth.uid()`/`storage.buckets`, legacy default privileges):
- `00` before `01` refused (no sentinel); `01` committed with the expected summary and no deviations; `01` re-run refused; `00` passed.
- `compare-metadata.py` against the production exports: columns, constraints, indexes, policies, grants, roles 0/0; security tables, triggers, seed objects match. The only differences were the synthetic `auth.uid()` definition/ACL of the local stand-in (platform-owned on Supabase). Sequence: no differing keys. Inventory: tables, buckets, policies, triggers, functions identical.
- The exact canonical bundle (hash re-checked before and after) applied **as the non-superuser `postgres`** with exit 0 and the 3 expected NOTICEs; `00` reported the bundle applied; `08` `all_required_pass: true`; `09` produced the expected denied/allowed values and rolled back (sequence untouched).
- `01` refused a populated database without sentinel and a database with an auth user dated 2026-05-01; `00` refused both, and also a sentinel database with an old auth user or a non-empty ledger.
- This is local evidence about the files, not about Supabase. The hosted run is the real test.

## Local app against peer-test

- Launch configuration `peer-web-test-target` (`.claude/launch.json`, port 3000, `autoPort: false`, cwd `web`) runs `node scripts/dev-test-target.mjs`.
- It reads `web/.env.peer-test.local` (git-ignored; template `web/.env.peer-test.local.example`, which is un-ignored so it can be committed), requires the three Supabase names, refuses any host not starting with `cbsbtkvbmvyznerbpmxg.` and any value mentioning `gdakokshfjqljddlrkrh`, forces `PEER_UPLOADS_ENABLED=true` and `PEER_UPLOAD_BUCKET=private-uploads`, blanks email/operator secrets unless set in the test file, and always blanks operator model keys. It prints only the host and variable names.
- `node scripts/dev-test-target.mjs --dry-run` (from `web/`) validates and prints the plan without starting anything.
- Precedence: Next.js consults `process.env` before `.env.local` (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, "Environment Variable Load Order"); `@next/env` only fills a key that is `undefined`, so `""` blanks also win. Verified locally with the real `@next/env` loader and a fake `.env.local`.
- Only one server can hold port 3000: stop `peer-web-followup` before starting `peer-web-test-target`. After starting, confirm in the browser's network panel that Supabase calls go to `cbsbtkvbmvyznerbpmxg.supabase.co`.
- Supabase Auth emails (sign-up confirmation, magic links) for test accounts are sent by the peer-test project's own Auth settings, not by this app's variables.
