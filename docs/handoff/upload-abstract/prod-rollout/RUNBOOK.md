# Production rollout runbook: canonical seed-closure bundle + new app build

Written 2026-11-04 by W14 (Group 1, B, files only) from branch `fixing-bugs-on-uploading-pdf-and-abstract-reading` at HEAD `0a156602d9602a24573f65c2336a89e7d25b410d`. Nothing in this folder has been executed against any database: the author had no database or Vercel access. Step D0 is the only rehearsal these new SQL files can get before production; do not skip it.

Targets:

- Supabase production project `gdakokshfjqljddlrkrh` (org Hermes, PostgreSQL 17.6 aarch64, Pro plan). Dashboard: <https://supabase.com/dashboard/project/gdakokshfjqljddlrkrh>.
- Vercel team `aspens-projects-0aa9a7d6`, project `peer`, production domain `peer.homes`. Production currently serves `902eb50` (2026-10-30, deployment `peer-6hmlagfsm-aspens-projects-0aa9a7d6.vercel.app`).
- Payload: `docs/handoff/upload-abstract/sql-runtime/seed-closure-canonical-lf.sql`, SHA-256 `A7878BF3A92587B653159604AED6DF0F959207A9C36958E686729EB215120A1B`, 63968 bytes, LF only, 930 lines, `BEGIN;` to `COMMIT;` (re-hashed by W14 at HEAD 0a156602: match).

## Files in this folder

| File | Writes? | Use |
|---|---|---|
| `00-production-guard.sql` | no | Proves the SQL Editor is on production; prints `stage` = `pre-bundle` / `bundle-applied` / `PARTIAL - STOP`. Inverse of `test-project/00-test-target-guard.sql`. |
| `01-preflight-readonly.sql` | no | Guard + "stage must be pre-bundle" + inline stop checks against the 2026-11-03 exports + lock/transaction check + deploy decisions + verbatim re-capture of verifiers 02/03/04/06/07 for offline comparison. |
| `02-rollback.sql` | **yes** (default dry run) | Guarded undo of the bundle. Refuses if the new code already wrote data a drop would destroy. Dry run by default; `execute` only after the user's explicit yes. Also has a peer-test rehearsal mode that is forced to dry run. |
| `03-post-apply-readonly.sql` | no | Guard + "stage must be bundle-applied" + the `08-post-bundle-checks.sql` CTEs byte-for-byte + production-only checks and counts. |

All four start with the same guard logic (in 00, 01 and 03 the `DO $guard$ … $guard$;` block is byte-identical; 02 inlines the same checks inside its single transaction). The guard checks: role `postgres`; schema `peer_test_guard` absent; migration ledger is exactly the 11 exported versions ending `20260915042812`; `auth.users` has an account older than 2026-11-03 UTC (aggregates only); the 9 production public tables exist; bucket `private-uploads` is private with limit 26214400. SQL cannot read the project ref: **the address bar showing `/project/gdakokshfjqljddlrkrh/` is the root of trust; the guard is the second line.**

## Approvals: who decides what

| # | Decision | Who | Basis |
|---|---|---|---|
| U1 | Commit anything still uncommitted (including this folder), push the branch, open a PR to `main` | **User's explicit word in chat** | `AGENTS.md` "Only push and open a PR when the user explicitly asks." Commit author `peter14531453`, `Co-Authored-By` trailer per session attribution. Never touch PR #40. |
| U2 | Merge the PR (and when: after step E passes) | **User clicks merge, or gives the explicit word** | `AGENTS.md`; brief W14 (a). Never the agent on its own. |
| U3 | Apply the bundle to production and deploy | Already authorized conditionally ("先在测试环境验证，通过后再应用到生产", handoff lines 17-21). **The manager must rule that the test conditions are met** (G2 PASS, G3 still RUNNING, G11 rounds open) and say so in chat before step E. If in doubt, ask. | handoff G4 row |
| U4 | Any non-zero `deploy_decisions` count from 01 (accounts that would get HTTP 503 on the feed) | **User** decides before step F | section C3 below |
| U5 | Backup older than 26 h or not listed | **User**: wait for the next daily backup, or proceed without a fresh one | step B |
| U6 | Production writes during smoke (upload + delete one fictional PDF on the user's own account; optional Seed Pool use) | **User**, and the user signs in themselves; the manager never types credentials | step G |
| U7 | `02-rollback.sql` in `execute` mode; `v_allow_drop_observed_day_markers := true` | **User's explicit yes**, each separately | step H3 |
| U8 | Restore a Supabase backup | **User only** (loses every write after the backup, all users, auth included) | step H4 |
| — | Vercel Instant Rollback to 902eb50 on a clear failure | Manager may do it at once and report: it restores the state the user already had, and 902eb50 works with the new schema (C1) | step H2 |
| — | Enabling Supabase PITR | Not recommended (paid add-on); only with the user's explicit yes | step B |

## Recommended order: DATABASE FIRST, then deploy

1. A1 push + PR (after U1). The PR can sit open; do not merge yet.
2. B confirm backup → D0 rehearse the new SQL files on peer-test → D preflight on production → E apply bundle → E-checks → E8 watch one hourly digest run on the OLD app.
3. A3 user merges (U2) → F deploy `main` merge commit to Production → confirm Ready + `peer.homes` shows the new commit.
4. G smoke. H only if needed.

Why database first (details and citations in section C):

- The deployed build 902eb50 never touches any object the bundle adds while the four rollout flags are unset (they are unset in Production), and its only write to an altered table (`briefing_deliveries`) is an insert that omits the new columns, which are nullable or defaulted. So the database change is invisible to the running site (C1).
- The new build was end-to-end tested on peer-test **with** the schema installed. Deploying it after the apply means production immediately runs the tested mode, instead of first running the legacy fallback path that was only unit-tested (C2).
- Between E and F the old app keeps writing ordinary digest rows with `local_date` NULL. The new code and the bundle were built and tested for exactly that history (bundle lines 787-789 claim guard; 593-597 served-day check; local harness `prodmeta-legacy-digest-fixed.sql`), and E8 observes it on real production.
- Rollback stays cheap in both directions: Vercel Instant Rollback to 902eb50 works with or without the schema (C1), and while only the old app has run, `02-rollback.sql`'s "nothing new written" precondition is true, so a DB undo is clean if the apply itself shows a problem.
- Deploy-first is also safe (C2), but it would expose users to the legacy fallback for an unknown time, the Seed Paper Pool editor would answer "Seed papers are unavailable." until the apply, and the schema would then switch under live traffic.

If Vercel auto-deploys `main` the moment the PR is merged, merging before E turns this into deploy-first. That is safe, but not the plan: ask the user to merge only after E passes.

## C. Compatibility analysis (code citations)

Citations: `902eb50:<path>:<line>` is the deployed build (`git show 902eb50:<path>`); `<path>:<line>` without prefix is this branch at 0a156602; `bundle:<line>` is the canonical bundle file.

### C1. Old build 902eb50 against the NEW schema: compatible

- Rollout flags are off in Production (`PEER_DASHBOARD_LEDGER`, `PEER_DASHBOARD_PREPARE`, `PEER_DIGEST_DEDUPE`, `PEER_DIGEST_EMAIL_RETRY` unset; handoff and brief). Each is `=== "on"` only: `902eb50:web/src/lib/dashboard/ledger-flag.ts:15-17`, `902eb50:web/src/app/api/jobs/dispatch-digests/route.ts:270-271`, `902eb50:web/src/app/api/jobs/prepare-dashboards/route.ts:82-83,87-88`.
- Feed: with the ledger flag off the route runs the pipeline only and never opens the ledger, rollover store or any RPC: `902eb50:web/src/app/api/feed/route.ts:281-290`. New tables and functions are therefore never read or written.
- Feed ack/archive: return `not_enabled` (404) before any DB call when the ledger flag is off: `902eb50:web/src/app/api/feed/ack/route.ts:59-60` (archive route has the same gate at `902eb50:web/src/app/api/feed/archive/route.ts:111`).
- `acknowledge_dashboard_batch` revoke: the bundle revokes EXECUTE only from `public, anon, authenticated` (`bundle:201-204`, `bundle:756`) and keeps the `service_role` grant (`bundle:203-204`). 902eb50 calls it only through the service-role admin client (`902eb50:web/src/lib/dashboard/delivery-ledger.ts:470`, call at `:650`) and only on the flag-on ack path. Not reachable today; still allowed if it were.
- `claim_briefing_delivery` replaced: 902eb50 calls it only when `PEER_DIGEST_DEDUPE=on` (`902eb50:web/src/app/api/jobs/dispatch-digests/route.ts:552,572-581`). The replacement keeps the exact signature `(uuid, text, text, text[], jsonb) returns table (id bigint)` and the `service_role` grant (`bundle:776-778,796-797`); it adds the owner lock, a profile check and the legacy NULL-date guard (`bundle:781-789`). Not reachable today; still callable if it were.
- Digest dispatch (the hourly cron, flag off): a 26-hour local-date read on `delivered_at` (`902eb50:…/dispatch-digests/route.ts:481-500`) and then the plain insert `{user_id, channel, item_ids, payload}` (`:621-634`). After the bundle `local_date` is nullable text with no default (`bundle:244-245`), `seed_pool_version` is nullable and `seed_revocation_generation` is `not null default 0` (`bundle:799-800`), so that insert still succeeds and writes `local_date` NULL. The new partial unique index ignores NULL `local_date` rows (`bundle:247-249`), so it can never reject that insert.
- `/api/briefings` selects named columns only (`902eb50:web/src/app/api/briefings/route.ts:26-27`); new columns are invisible to it.
- Prepare-dashboards cron: both phases are flag-off no-ops (`902eb50:…/prepare-dashboards/route.ts:396-398,420-422`).
- The remaining 902eb50 paths that touch `briefing_deliveries` or storage, re-checked by W18 with `git show 902eb50:<path>`; none can fail or lose data on the new schema:
  - Digest dispatch pre-checks (cron, flag off): the 6-hour "recent delivery" read selects only `id` by `user_id` and `delivered_at` (`902eb50:web/src/app/api/jobs/dispatch-digests/route.ts:439-445`), and the 30-day "already sent" read selects only `item_ids` (`:505-509`). Named-column reads; new columns are invisible to them.
  - Prepare-dashboards email-retry fetch selects `user_id, local_date, payload` (`902eb50:web/src/app/api/jobs/prepare-dashboards/route.ts:186-189`), but it runs only when both `PEER_DIGEST_EMAIL_RETRY` and `PEER_DIGEST_DEDUPE` are on (`:420-428`). Off in Production, so never reached.
  - `digest-retry.ts`: the payload `UPDATE … WHERE id` (`902eb50:web/src/lib/email/digest-retry.ts:52-54`) and the `eq("local_date", …)` read (`:99-102`) are used only on the dedupe path (`PEER_DIGEST_DEDUPE=on`). Never reached today; both would still work, since they name existing columns only.
  - Warm-pool workflow: an anonymous `POST /api/feed` with starter topics (`902eb50:.github/workflows/warm-pool.yml:27-30`). Anonymous requests have no owner scope, so they never reach any seed or ledger code.
  - Vercel cron purge-uploads (`902eb50:web/src/lib/papers/upload-store.ts:463-481`): lists only the top level of the private bucket (plus `incoming/<owner>` folders for staged uploads) and deletes only names matching its own upload patterns. It never lists the `seed-pool/` prefix, so after an H2 rollback to 902eb50, seed PDFs written by the new code are left alone.
- Existing rows: the bundle has no top-level INSERT/UPDATE/DELETE (all DML is inside function bodies) and only adds columns, an index, tables, policies, functions and grants. `ADD COLUMN … NOT NULL DEFAULT 0` on PostgreSQL 11+ is a catalog-only change; no row is rewritten.
- Schema cache: PostgREST reloads after DDL through the `pgrst_ddl_watch` / `pgrst_drop_watch` event triggers, present and enabled in production (`%TEMP%/peer-rollout-evidence/test-project/production-default-privileges.json`); 01 and 03 check them.

### C2. New build against the OLD schema: compatible (legacy fallback)

- Detection: `SeedPoolRepository.installed()` selects from `seed_pool_state`; PostgREST code `PGRST205` or Postgres `42P01` means "missing" (`web/src/lib/seed-pool/repository.ts:7-9,13-18`). `resolveSeedPool` turns "missing" into `{status:"none", schemaInstalled:false}` (`web/src/lib/seed-pool/server.ts:11-12`), and `seedOutputContext` maps exactly that to `{kind:"legacy"}` (`web/src/lib/seed-pool/output.ts:9-11`). Any other error is "unavailable", never legacy.
- Feed: legacy plus ledger flag off means no freeze, plain pipeline, no seed RPC (`web/src/app/api/feed/route.ts:288-303`, freeze rule at `:296`).
- Digest dispatch: legacy context runs the unchanged flag-off plain insert without `local_date` (`web/src/app/api/jobs/dispatch-digests/route.ts:517-519,651-665`).
- Seed Paper Pool editor: `GET/PUT /api/seed-pool` answer 503 "Seed papers are unavailable." when the schema is not installed (`web/src/app/api/seed-pool/route.ts:7-13`). That is the visible cost of deploy-first.
- Feed ack: `schemaInstalled === false` with the ledger flag off gives 404 `not_enabled`, as before (`web/src/app/api/feed/ack/route.ts:85-87`).
- Seed cleanup cron: returns early when the schema is missing (`web/src/lib/seed-pool/lifecycle.ts:9-10`).
- Caveat: the legacy path depends on PostgREST answering `PGRST205` for the missing table. That path is unit-tested only. In the recommended order it is never exercised in production.

### C3. New build against the NEW schema: works, with one account-level condition

- For every signed-in feed request the new code resolves the seed pool (`web/src/app/api/feed/route.ts:288-289`) and, with no seed pool, records a served-day marker (`:297-302`); the digest job does the same (`web/src/app/api/jobs/dispatch-digests/route.ts:517-518,554-557`). Seed reads/writes use the service-role client only.
- `seed_pool_resolve` returns `unavailable` when the owner has **no `profiles` row** (`bundle:554-555`) or a **timezone PostgreSQL rejects** (`bundle:556,565-566`). The feed then answers 503 `ledger_unavailable` (`web/src/app/api/feed/route.ts:289,85-90`), and the digest job skips that owner as `seed_pool_unavailable` (`dispatch-digests/route.ts:518`). 01 counts both cases (`deploy_decisions`). The timezone count is an **upper bound**: it accepts zone names and abbreviations (case-insensitive), but PostgreSQL's `AT TIME ZONE` also accepts POSIX-style specs such as `UTC+5`, which 01 still counts. So a non-zero timezone count can include accounts that would actually work; it never misses one that would fail. Any non-zero count is a user decision (U4) **before the deploy**; it does not block the database apply, because the old build does not call these functions.
- Signed-in sessions: `privatePaperScope` gives every signed-in reader an owner scope (`web/src/app/api/feed/route.ts:545-551`), so the condition applies to all signed-in users, not only seed users. Anonymous readers never reach the seed code.
- No new environment variable is read by the new build (all `process.env.*` names in `web/src` at 0a156602 also exist at 902eb50). The Vercel prebuild guard list is unchanged apart from an `export` keyword (`web/scripts/assert-byok-production-env.mjs:81`), so the same Production env that built 902eb50 passes it.

### C4. Preview deployments use production Supabase

The existing Preview environment inherits the All-Environments production Supabase URL and keys (handoff line 66). A Preview build of this PR is therefore the new code against production data. Do not sign in on a Preview URL or use it to write anything. Read-only page loads are harmless in either schema state (C2/C3).

## A. Git (manager executes only after U1; merge only by the user, U2)

A0. State the current branch in chat (`AGENTS.md`). Run `git status` and `git log --oneline -3`. Expected HEAD `0a156602` or a newer docs-only commit.

A1. Release gates. W13 passed at `0a156602`: vitest 633 files / 11519 tests, `tsc --noEmit --incremental false` 0 errors, eslint 0 errors, `next build` exit 0 with 58 routes (handoff G1 row). If the commit to be pushed differs from `0a156602` in anything under `web/` (`git diff --stat 0a156602 <tip> -- web/` must be empty), re-run from `web/`: `npm run build` (typed-routes gate) plus the full vitest suite, and record the results first.

A2. Payload identity at the tip (must all match `sql-runtime/seed-closure-manifest.json`):

```bash
for f in 20260924000000_dashboard_delivery_ledger 20260924000300_briefing_deliveries_dedupe 20260924000500_dashboard_rollover 20261102000000_seed_pool; do
  git show <tip>:web/supabase/migrations/$f.sql | sha256sum; done
# expect 72b08be0… 66b9746a… 611db4b4… 1e2afdd9…  (W14 verified at 0a156602)
```

Note: `main` (9ce33c16) still holds the pre-fix seed migration (LF SHA-256 starts `bc503a95…`, the NO-GO version). The manifest's `"commit": "a1f2e615"` is the W7 worktree commit; on this branch the same blob arrived as cherry-pick `a2ac560e`. The production payload is only ever the canonical bundle file, never a migration file applied on its own.

A3. Push and PR (after U1): `git push origin fixing-bugs-on-uploading-pdf-and-abstract-reading` (`origin` is `Aspen-Lab/peer.git`, which GitHub redirects to `peer-research-project/peer`). `gh pr create --base main --head fixing-bugs-on-uploading-pdf-and-abstract-reading` with a body that lists the gates, the bundle SHA and this runbook, ending with the attribution line from the session reminder.

A4. CI. The repository has no PR test workflow (`.github/workflows/` holds only `digest-cron.yml` and `warm-pool.yml`). The only automatic check is Vercel's Preview build, if the Git integration triggers (auto-deploy has not been triggering; handoff line 64). Wait for it to show Ready or record that it did not run. Do not use the Preview URL (C4). The local W13 gates are the test evidence.

A5. Merge (U2, after step E8). Ask the user to merge with "Create a merge commit" (PR #40 kept per-commit history the same way). Then `git fetch origin` and record `M = git rev-parse origin/main`. Check `git diff --stat <pushed tip> M` is empty (main had not moved since 9ce33c16; if it is not empty, review what else is in `M` before deploying) and repeat A2 against `M`.

## B. Backup confirmation (before any DDL)

B1. Supabase dashboard → project `gdakokshfjqljddlrkrh` → **Database** → **Backups**. On the Pro plan Supabase keeps **daily scheduled backups for 7 days**; **Point-in-Time Recovery is a separate paid add-on**. This is general Supabase knowledge, not verified by W14: read the page and record what it actually says.

B2. Record in the evidence folder: the newest scheduled backup's date/time (UTC) and status, how many are listed, and whether the PITR tab says "not enabled". A screenshot of the list is enough. It shows dates only, no data.

B3. STOP and ask the user (U5) if no completed backup is listed within the last 26 hours, or the page shows a failure. Do not enable PITR (cost) without the user's explicit yes. Do not download a backup: it is a full copy of user data and is not needed.

B4. What the backup is for: last resort only. The bundle changes no existing row, and the primary undo is `02-rollback.sql`. Restoring a backup replaces the whole database (auth included) with that day's copy, loses every later write, and takes the project offline while it runs (H4).

## D. Preflight

D0. **Rehearse the new files on peer-test first** (peer-test `cbsbtkvbmvyznerbpmxg` still exists; the bundle is applied there). This is the only execution these files get before production. All of these are read-only or forced-rollback:

- `00-production-guard.sql` as is → must **ERROR** `REFUSED (G2): schema peer_test_guard exists…` (proves the inverse guard).
- `01-preflight-readonly.sql` pasted **from the first line after `$stage$;`** (skip both DO blocks) → must return one `production_preflight` cell. On peer-test `stop_checks.no_*` are false (the bundle is applied there) and `deploy_decisions` reflects test users. The point is that the query parses and runs. Then expand `export_copies` → `sequence_metadata` → `maximum` in the result and record the exact digits shown. Expected: `9223372036854776000` (the editor's JSON display rounds this 19-digit number), not `9223372036854775807`. That confirms why D3 compares `maximum` through `int(float(x))` (explained below the D3 commands). Optional rehearsal of D3: save this peer-test cell in the D3 save format to `%TEMP%\peer-rollout-evidence\d0-rehearsal\01-preflight.json`, then run only the D3 split command and the D3 sequence command with `$P` set to that folder; both must exit 0 (peer-test's sequence equals the production export). Do not run the other D3 comparisons on peer-test: its schema has the bundle and is expected to differ.
- `03-post-apply-readonly.sql` pasted **from the first line after `$guard$;`** (keep its `$stage$` block) → `all_required_pass` expected true; `production_required.*` expected true (peer-test has the same 9 + 7 tables, 19 + 6 policies, 3 + 19 functions), unless a W12 test step added objects to `public`, in which case the false key must be explained by that object and nothing else. `before_new_code` is false there (test data), as expected.
- `02-rollback.sql` with `v_target := 'peer-test-rehearsal'` (mode is forced to dry run) → must **ERROR** `PEER_ROLLBACK_DRY_RUN_OK (intentional error; everything rolled back…)` with `r3_blockers` listing the peer-test test rows. That proves every DROP statement runs on real Supabase and that the block rolls back. Because the text contains `DROP`, the SQL Editor first shows a confirmation dialog warning about a destructive query; that is expected for this file. Confirm it for this file in this mode only: the dry run still ends in the intentional error and rolls everything back. Then run `test-project/00-test-target-guard.sql`: stage must still be `canonical bundle ALREADY applied`. If the rehearsal ERRORs with anything else (for example a DROP blocked by a W12 test table), record it; it means the production file needs a fix before it can be trusted.
- Any syntax error in any file → stop and fix the file (a new commit), then repeat D0.
- What D0 does **not** exercise: 00 stops at G2 on peer-test, and 01/03 are pasted without their guard, so guard checks G3-G6, 00's stage query and 01's `$stage$` block first run on real Supabase in production at D2/D3. W18 ran them on a local throwaway PostgreSQL stub of the production shape (not Supabase, not real catalogs): they passed on that shape, reported `bundle-applied` / `pre-bundle` correctly, and each of G3, G4, G5, G6 refused when its fact was changed. That shows the code runs; it does not prove production's real values match.

D1. Open the production SQL Editor. The address bar must show `/project/gdakokshfjqljddlrkrh/`; the project name `peer`, org Hermes. The role selector must show `postgres`.

D2. Run `00-production-guard.sql` → `guard: PASS`, `stage: pre-bundle`, `bundle_object_counts` all 0. Save the cell as `00-pre.json`.

- If 00 (or later 01 or 03) ERRORs with `REFUSED (G1)` … `REFUSED (G6)` here: **STOP and report the exact message to the user.** Never edit the guard, never comment a check out, never run the files without their guard in production. A refusal means either this tab is not production or production differs from the 2026-11-03 exports; both need a human decision. The guard only reads, so a refusal has changed nothing.
- This is the first run of G3-G6 and of the stage query on real Supabase (D0 does not reach them), so a refusal here can also be a fault in the guard itself. That is still a stop-and-report, never something to fix on the spot.

D3. Within 10 minutes of step E, run `01-preflight-readonly.sql` and save the cell verbatim as `01-preflight.json` in `%TEMP%\peer-rollout-evidence\production-apply\`.

Save format: preferably the cell's value only, one JSON object that contains the keys `go_for_apply`, `stop_checks` and `export_copies` (open the cell, copy its value, paste it into the file, save as UTF-8). The editor's row export (`[{"production_preflight": {…}}]`, or the same with the value as a quoted JSON string) is also accepted: the split command below unwraps all three shapes and prints the five names it wrote (`default_privileges_metadata`, `inventory`, `schema_metadata`, `security_metadata`, `sequence_metadata`). If it ERRORs, the file is in none of these shapes: save it again; do not hand-edit the JSON. Then compare offline (PowerShell, repo root):

```powershell
$E = "$env:TEMP\peer-rollout-evidence"; $P = "$E\production-apply"
python -I -c "import json,sys,os;d=json.load(open(sys.argv[1],encoding='utf-8-sig'));d=d[0] if isinstance(d,list) else d;d=d.get('production_preflight',d);d=json.loads(d) if isinstance(d,str) else d;[open(os.path.join(sys.argv[2],k+'.json'),'w',encoding='utf-8').write(json.dumps(v)) for k,v in d['export_copies'].items()];print('split into:',sorted(d['export_copies']))" "$P\01-preflight.json" "$P"
python -I docs/handoff/upload-abstract/sql-runtime/compare-metadata.py --production-schema "$E\production-schema-metadata.json" --local-schema "$P\schema_metadata.json" --production-security "$E\production-security-metadata.json" --local-security "$P\security_metadata.json"
python -I -c "import json,sys;r=lambda p:json.load(open(p,encoding='utf-8-sig'));a,b=r(sys.argv[1]),r(sys.argv[2]);n=lambda x:int(float(x));d=sorted(k for k in a.keys()|b.keys() if ((n(a[k])!=n(b[k])) if k=='maximum' and k in a and k in b else a.get(k)!=b.get(k)));print('sequence differing keys:',d or 'none');sys.exit(1 if d else 0)" "$E\production-sequence-metadata.json" "$P\sequence_metadata.json"
python -I -c "import json,sys;r=lambda p:json.load(open(p,encoding='utf-8-sig'));a=r(sys.argv[1])['inventory'];b=r(sys.argv[2]);d={k:(sorted(set(a[k])-set(b[k])),sorted(set(b[k])-set(a[k]))) for k in ('tables','buckets','policies','triggers','functions')};print('(export-only, now-only):',d);sys.exit(any(x or y for x,y in d.values()))" "$E\production-inventory-readonly.json" "$P\inventory.json"
python -I -c "import json,sys;r=lambda p:json.load(open(p,encoding='utf-8-sig'));a,b=r(sys.argv[1]),r(sys.argv[2]);d=[k for k in ('default_acls','event_triggers','public_schema_acl','postgres_can_set_role','auth_users_triggers_owner_privilege','storage_buckets_privileges') if a.get(k)!=b.get(k)];print('default-privilege differing keys:',d or 'none');sys.exit(1 if d else 0)" "$E\test-project\production-default-privileges.json" "$P\default_privileges_metadata.json"
```

Each command exits 0 on a match. The sequence comparison includes `current_user`, which must be `postgres` on both.

Why `maximum` is compared through `int(float(x))`: the export file holds the exact value `9223372036854775807`, but the SQL Editor's JSON output rounds 19-digit numbers to `9223372036854776000` (seen on peer-test, `test-baseline-verification.json`, and checked again in D0). An exact comparison would always report `maximum` as different and block D4 for a display artefact. Converting both sides through a float maps both spellings to the same number, while a real change (for example to `2147483647`) still shows as a difference. The exact check is not lost: 01 itself tests `seqmax = 9223372036854775807` inside PostgreSQL, before any rounding, as part of `stop_checks.sequence_equal_export`, and `go_for_apply` requires it. Every other sequence key is still compared exactly. E7 uses the same command; save its cell in the same format.

D4. GO / STOP for the apply:

- GO only if `go_for_apply` is true and every D3 command exits 0.
- STOP (do not apply; report the exact key) if any `stop_checks.*` is false or a D3 command exits 1. That means production drifted from the exports the bundle was rehearsed against.
- WAIT if `apply_wait.long_running_client_transactions` > 0: wait 2-3 minutes, re-run 01. `other_sessions_holding_locks_on_briefing_deliveries` and `other_sessions_holding_locks_on_auth_users` > 0 are normal under traffic. The bundle's `ALTER TABLE` on `briefing_deliveries` and its 7 new foreign keys to `auth.users` (`bundle:42,79,364,493,500,509,526`; each takes SHARE ROW EXCLUSIVE on `auth.users` until COMMIT) wait for those short locks, and everything behind them waits too: while the apply runs, sign-up and sign-in writes to `auth.users` queue. Pick a quiet minute and use the lock timeout in E2a.
- `deploy_decisions` non-zero does **not** stop the apply. It stops step F until the user decides (U4). Tell the user the counts (numbers only) and the consequence: those accounts' signed-in feed would answer 503 after the deploy. Say that `profiles_with_timezone_unknown_to_postgres` is an upper bound (C3).
- Record `counts.briefing_deliveries_rows` and `briefing_deliveries_total_size`. The non-concurrent unique index is built while the transaction holds briefing_deliveries; at this table's size that should take well under a second, but the number lets you judge.

## E. Apply the bundle (U3 ruled in chat first)

E0. Timing: not within :00-:12 of any hour (the GitHub "Hourly digest dispatch" and prepare jobs run at :05, `.github/workflows/digest-cron.yml:9`; warm-pool runs 00:07, 06:07 and 13:07 UTC, `.github/workflows/warm-pool.yml:16`; the Vercel cron purge-uploads runs 03:17 UTC, `web/vercel.json`). D3 must be less than 10 minutes old.

E1. Local hash: `Get-FileHash -Algorithm SHA256 docs\handoff\upload-abstract\sql-runtime\seed-closure-canonical-lf.sql` → `A7878BF3A92587B653159604AED6DF0F959207A9C36958E686729EB215120A1B`; length 63968.

E2. Production SQL Editor, **new empty query tab**, role `postgres`. Put the exact bytes into the editor with the same method used on peer-test (2026-11-03 20:58 UTC: the pane refused clipboard and localhost fetch, so the text was written into the editor by in-page JavaScript, in segments). Segment boundaries and hashes, if segmenting (each includes its trailing LF):

| Segment | Lines | Bytes | SHA-256 |
|---|---|---|---|
| 1 `BEGIN;` + dashboard ledger | 1-205 | 10722 | `a3953254bf9cd4003696b4b3944606db425a8d085fbc9163d0c205914910ec22` |
| 2 briefing dedupe | 206-333 | 7261 | `01283fb2c6684f156e5ef7db4d6633d7fa206085cb0ee6883a67b5ae78cb4083` |
| 3 dashboard rollover | 334-488 | 8463 | `a896df21b3142f39bfcc5351c10d3385dfc3d41aad5397c76fb56ba52a7f05f0` |
| 4 seed pool + `COMMIT;` | 489-930 | 37522 | `e71798892fa62fbbb401333b08931bebf876cb6bd435aa958af988bf0b904ab0` |

E2a. **Lock timeout (recommended).** Put exactly one line before the bundle text in the same tab: `SET lock_timeout = '5s';` followed by one LF (25 bytes), then the four segments unchanged. Never edit the bundle file itself: its SHA-256 `A7878BF3…` must not change. Why: the bundle waits for every lock it needs with no limit, and while it waits, every later request for `briefing_deliveries` or `auth.users` (sign-up, sign-in, digest writes) queues behind it. With the timeout the apply gives up after 5 s of waiting, rolls back completely, and the site keeps working. It must be in the same text: the editor may use a different pooled connection for a separate run, so a `SET` run on its own is not reliably in force. The setting can stay on that pooled connection afterwards; that is harmless (a later editor query there gives up after 5 s of waiting for a lock). If the in-page check cannot be adapted (E3), run the bundle text alone and rely on the quiet minute.

E3. **In-page verification before Run** (inspection only, read the editor's full text in the page): SHA-256 over the UTF-8 bytes of the editor text = `a7878bf3a92587b653159604aed6df0f959207a9c36958e686729eb215120a1b`; UTF-8 byte length 63968; zero `\r`; 930 `\n`; first line `BEGIN;`; last line `COMMIT;`. With the E2a line: the first line must be exactly `SET lock_timeout = '5s';`, and everything after the first `\n` must pass every check just listed (hash, 63968 bytes, 930 `\n`, `BEGIN;` … `COMMIT;`); the whole text is then 63993 bytes with 931 `\n`. Any mismatch → clear the tab and inject again. Never "repair" text by hand, and never run text whose hash was not shown to match.

E4. Click **Run once.** Expected: success, no rows, plus exactly three NOTICEs `policy "seed_pool_owner_read" for relation "public.seed_pool_state|seed_pool_assets|seed_pool_snapshots" does not exist, skipping` (`bundle:538/540/542`). The SQL Editor may not display NOTICEs at all. If none are shown, that is **not** a failure: success is judged by the editor reporting success with no ERROR, then E5 (00 says `bundle-applied`) and E6 (03 passes). Record whether the NOTICEs were visible. If a NOTICE other than these three is shown, record it and report it.

- Any ERROR: the whole transaction rolled back. Run 00 → must say `pre-bundle`. Record the exact error text. Do not edit the bundle or run pieces of it.
- A lock or statement timeout (with E2a: `canceling statement due to lock timeout`) is not a payload fault. After 00 says `pre-bundle`, you may run 01 again and then repeat E2-E4 unchanged, once. A second failure → STOP and report.
- Do not click Run a second time after success. The bundle is not re-runnable (its dashboard policies have no `IF NOT EXISTS`). A rerun would ERROR and roll back harmlessly, but record it if it happens.

E5. Run `00` → `stage: bundle-applied`, counts 7/19/3/1. Save as `00-post.json`.

E6. Run `03-post-apply-readonly.sql` (run E) → `all_required_pass: true` and `before_new_code.all_true: true`. Save as `03-run-E.json`. `production_counts.briefing_deliveries_rows` must equal 01's count, or be larger only by digest rows from a :05 run in between; never smaller. `informational.briefing_deliveries_null_local_date_count` must equal the row count (every existing row stays NULL; no backfill).

E7. Optional post-bundle record: run `test-project/04-verify-sequence.sql` (read-only) and diff it against `production-sequence-metadata.json` with the D3 sequence command. It must be unchanged. 03's `required.sequence_acl_unchanged` already checks owner and ACL.

E8. **Old app on the new schema, real proof.** Wait for the next :05 digest run. GitHub → Actions → "Hourly digest dispatch" → the run after E4 must be green (the step reports the HTTP status). Its endpoint is `hermes-flax-six.vercel.app` (`.github/workflows/digest-cron.yml:24`). In Vercel → peer → Settings → Domains, confirm that hostname belongs to this project's Production; if it does not, the cron is not exercising production, so record that. Vercel → peer → Logs (production deployment 902eb50) for the window since E4: no 5xx on `/api/feed`, `/api/jobs/dispatch-digests` or `/api/briefings`. Then run 03 again: `before_new_code.all_true` must still be true (the old app wrote at most NULL-date digest rows). Only after this, ask the user to merge (A5).

## F. Deploy on Vercel

F0. Preconditions: E passed; `deploy_decisions` all 0, or the user decided (U4); the user merged (A5) and `M` is recorded.

F1. Environment, names only, never values (Vercel → peer → Settings → Environment Variables, Production):

- Present: `PEER_UPLOADS_ENABLED`, `PEER_UPLOAD_BUCKET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and one of `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required by `web/scripts/assert-byok-production-env.mjs:29-46`).
- Absent: `PEER_DASHBOARD_LEDGER`, `PEER_DASHBOARD_PREPARE`, `PEER_DIGEST_DEDUPE`, `PEER_DIGEST_EMAIL_RETRY`. The whole analysis in C assumes these four are off; turning any on is out of scope.
- Absent: every name in `FORBIDDEN_ON_VERCEL` (`assert-byok-production-env.mjs:81-121`). Otherwise the build fails by design.

F2. Vercel → peer → **Deployments**. If a Production deployment for commit `M` (short SHA) appeared on its own, wait for it. If none appears within about 5 minutes, use **Create Deployment**, pick `main`, confirm the form resolves to `M` (the form resolved main correctly before; handoff line 64), then **Deploy to Production**.

F3. Build log: the `prebuild` guard passes; `next build` succeeds; about 58 routes; no "whole project was traced" warning (fixed by W8 R-H3). A build failure leaves 902eb50 serving; nothing to roll back. Record it and STOP.

F4. Ready: the deployment page shows Status **Ready**, Environment **Production**, branch `main`, commit `M`, and the production domains (`peer.homes`) assigned to it ("Current").

F5. The domain serves the new build. Open a **new** tab (old tabs can be stale clients) at `https://peer.homes/profile`. The version line must read `Peer <version> · <first 7 of M> · What's new`. It renders `PEER_BUILD_REF` (`web/src/components/shell/version-line.tsx:30-31`), which `next.config.ts` fixes at build from Vercel's `VERCEL_GIT_COMMIT_SHA` (`web/src/lib/build-ref.ts:22-31,39-44`). Before the deploy it reads `902eb50`. If `hermes-flax-six.vercel.app` is a domain of this project, its `/profile` must show the same commit.

## G. Production smoke

Anonymous (manager; read-only, or refused before any write). Base `https://peer.homes`. Expected values are the W6 production-build measurements (`checkpoints/A-w6-prod-build.md`) after W8's header fixes:

| Call | Expect |
|---|---|
| `GET /api/papers/openalex%3AW7222962933?sourceVersion=2` | 200, `no-store`; abstract empty; abstract retrieval status transient/missing (Semantic Scholar 429 is transient and may vary) |
| `GET /api/papers/openalex%3AW7222962933/reading?v=19` | 200, `no-store`; `fullText: blocked`, `blockedHost: sciencedirect.com`; no invented text |
| `GET /api/papers/arxiv%3A1706.03762?sourceVersion=2` and `/reading?v=19` | 200/200, public cache headers; abstract 7 sentences; `fullText: html` (arXiv HTML), readability `readable` |
| `GET /api/papers/openalex%3AW7204479535?sourceVersion=2` and `/reading?v=19` | 200/200; abstract 11 sentences; `fullText: none`, readability `abstract` |
| `GET /papers/arxiv:1706.03762` | 200 HTML |
| `GET /api/papers/upload-availability` | 200 `{"enabled":true}` |
| `POST /api/papers/upload` with `Origin: https://peer.homes`, no cookie | 401 `{"error":"Sign in to upload a private PDF."}`, `Cache-Control: private, no-store`. Production refuses anonymous uploads: `web/src/lib/papers/upload-access.ts:42` |
| `POST /api/papers/upload/ticket`, same origin, no cookie | 401, same message |
| `POST /api/papers/upload` with `Origin: https://evil.test` | 403 `Cross-site upload refused.` |
| `GET /api/papers/upload/0000000000000000` | 404 with private no-store headers (W8 R-H1) |
| `GET /api/seed-pool` | **401** `Sign in to manage seed papers.` (W8 R-H2). 902eb50 has no such route, so this also proves the new build is live |
| `GET /api/profile` | 401 `{"profile":null}` with `private, no-store` (W8 R-H1) |

Signed-in owner checks. The **user** signs in on `peer.homes` with their own account; the manager never types credentials.

1. Home feed loads; in the network panel `/api/feed` returns 200, not 503 `ledger_unavailable`.
2. Profile shows the `Seed Paper Pool` section without "Seed papers are unavailable.", and the version line shows `M`.
3. Run `03` (run G) → `all_required_pass: true`; `production_counts.seed_pool_observed_days` ≥ 1. That is the new code writing its served-day marker through the new RPC for this owner: proof of the full new-code ↔ new-schema path. Save as `03-run-G.json`.
4. Header `notes` opens the Notes collection (read only).
5. U6 write, only with the user's yes: header `upload pdf paper to deep read` → `docs/handoff/upload-abstract/checkpoints/hosted-fixtures/fictional-canopy.pdf` → tick the rights checkbox → `Upload PDF` → private page shows "Read from PDF" and "Private PDF · retained for 30 days after upload · keywords inform your recommendations." → `Delete PDF` → its file route returns 404.
6. Seed Pool on production is optional (U6). Know the cost first: once any seed row exists (even after Forget, a revoked tombstone row stays), `02-rollback.sql` will refuse for good (R3), and the only undo left is the app-only rollback. That is acceptable, but decide it knowingly.
7. Vercel Logs for 30 minutes after F4: no new 5xx pattern on `/api/feed`, `/api/seed-pool`, `/api/papers/*`. The next :05 digest run is green (GitHub Actions).

## H. Rollback

H1. Triggers: a smoke row fails because of the new build; a 5xx pattern in Vercel Logs after F4; or a data-integrity concern. Record the evidence first.

H2. **App (first, and usually all that is needed).** Vercel → peer → Deployments → the previous production deployment (902eb50, `peer-6hmlagfsm-aspens-projects-0aa9a7d6.vercel.app`) → `…` → **Instant Rollback** → confirm. Check `https://peer.homes/profile` in a new tab shows `902eb50`. 902eb50 runs unchanged on the new schema (C1), so **leave the database as it is.** Note: after an Instant Rollback Vercel stops auto-assigning production domains to new deployments until one is promoted again. Record that state for the next deploy.

H3. **Database** only if the schema itself is the problem, and only with the app already on 902eb50 (R4):

- Run `02-rollback.sql` unchanged (dry run) → must ERROR `PEER_ROLLBACK_DRY_RUN_OK …` listing empty `r3_blockers`. The editor shows its destructive-query confirmation dialog first (the file contains `DROP`), as in D0; confirming it for the dry run changes nothing. If it says `REFUSED (R3)`, the new code already wrote data a drop would destroy. Do not force it. Keep the schema (H2 is enough), or put forward-fix / backup restore (H4) to the user.
- With the user's explicit yes (U7): set `v_mode := 'execute'` and run. No extra `SET` is needed: 02 sets `lock_timeout` to 5 s for its own transaction as its first statement, so if `briefing_deliveries` or `auth.users` (dropping the new tables removes their 7 foreign keys to `auth.users`) is busy longer than that, it fails with a lock timeout and changes nothing; pick a quiet minute and run it again. `v_allow_drop_observed_day_markers := true` needs its own yes; it drops only (owner, date) markers. Expect `production_rollback.stage_now = pre-bundle`.
- Then run `00` (stage `pre-bundle`) and `01` (every `stop_checks.*` true again, D3 comparisons exit 0).

H4. **Backup restore**: the user's decision only (U8). Dashboard → Database → Backups → Restore on the chosen backup. Every write after that backup is lost (all users, auth included), and the project is unavailable during the restore. Afterwards run 00 and 01.

## I. Evidence and records

- Folder: `%TEMP%\peer-rollout-evidence\production-apply\`. Files: `backups.png`, `00-pre.json`, `01-preflight.json` plus the five split files, `bundle-editor-sha.txt` (the in-page hash, length, CR count), `bundle-result.txt` (success + NOTICE text), `00-post.json`, `03-run-E.json`, `03-run-E8.json`, the Vercel deployment id and `M`, `profile-version.png`, `smoke.json`, `03-run-G.json`. No secret, cookie, token, signed URL or user row in any of them. The JSON cells hold only metadata and counts.
- Append one completion row per step to `HANDOFF-CLAUDE-PEER-ROLLOUT.md` (Chicago time + UTC, target ID G4, SHA / deployment id, actor, result, evidence path, what remains), and update the G4 row status. Failures are recorded too, never deleted.

## Open risks and notes

1. These SQL files were written without database access. D0 on peer-test is their only run before production.
2. The `pg_stat_activity` / `pg_locks` counts in 01 are best effort: if `postgres` cannot see other roles' sessions, 0 is not proof.
3. Accounts without a `profiles` row, or with a timezone PostgreSQL rejects, get a 503 feed under the new build once the schema exists (C3). 01 counts them; the user decides before the deploy (U4). There is no code fix in this rollout.
4. Self-only writes to the new columns. Production grants `authenticated` table-level UPDATE on `briefing_deliveries`, with the policy "users update own briefings" (`auth.uid() = user_id`) (`production-schema-metadata.json` grants/policies). New columns inherit that, so a signed-in user could, through the Data API, set `local_date` / `seed_pool_version` / `seed_revocation_generation` on **their own** rows. That could delay their own seed activation (R-C11 takes the latest served label, `bundle:601-607`) or block their own digest. No cross-user effect (RLS). Not a rollout blocker. A follow-up migration with column-level `REVOKE UPDATE (local_date, seed_pool_version, seed_revocation_generation) … FROM authenticated` is worth an owner decision.
5. Migration ledger drift: production's `supabase_migrations.schema_migrations` stays at 11 rows (the bundle writes none, and objects after 20260915 were applied by hand). Do not run `supabase db push` against production without reconciling the ledger first. The guards rely on the 11 rows; if ledger rows are added later, the guards will refuse by design and must be updated.
6. The bundle's `ALTER TABLE` on `briefing_deliveries` holds an ACCESS EXCLUSIVE lock until COMMIT, and the unique index is built non-concurrently. Its 7 new foreign keys to `auth.users` also hold SHARE ROW EXCLUSIVE on `auth.users` until COMMIT, which briefly blocks sign-up and sign-in writes; 02 execute takes the same lock when it drops those keys. That is fine at the measured size if the apply does not wait on someone else's lock: check 01's `apply_wait` counts for both tables, pick a quiet minute, and use the 5 s lock timeout (E2a; 02 sets its own).
7. The Supabase backup facts in B are general knowledge; the Backups page is authoritative.
8. Rollout flags must stay unset (F1). Turning on `PEER_DIGEST_DEDUPE` or `PEER_DASHBOARD_LEDGER` changes which paths run and is a separate decision, outside this analysis.
9. The peer-test project (`cbsbtkvbmvyznerbpmxg`) still bills about $10/month; it should be deleted when acceptance ends (a separate, user-approved step). D0 needs it, so do not delete it before D0.
