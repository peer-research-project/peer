# C W7 — ruling R-C11 in the seed SQL + isolated harness (2026-11-04)

Worker: Group 2 C (implementer), brief `briefs/W7-C11-SQL.md`. Detached worktree
`C:/Users/wbc13/AppData/Local/Temp/peer-wt-w7` from `99cb9a3a`. No push, no branch, no Supabase or production
access, no ports 3000/3100. Logs: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w7/` (`00-` .. `18-*.log`).

Commits:
- `a1f2e615` Activate a saved seed pool after every served date label (R-C11) — migration + vitest source invariant.
- `51a12acf` Regenerate the seed closure bundle and add the R-C11 harness — bundle, manifest, README, wrapper, new SQL test.
- this checkpoint.

## Change (`web/supabase/migrations/20261102000000_seed_pool.sql`, `seed_pool_apply` only)

- New local `v_last date` = max over this owner's `dashboard_batches.local_date` with status `served`/`acknowledged`,
  non-null `briefing_deliveries.local_date`, and `seed_pool_observed_days.local_date`. Text labels count only when they
  match `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` and `pg_input_is_valid(local_date,'date')` (the ledger columns are opaque text with
  no format check; a malformed label is ignored instead of failing every save). Prepared batches and null legacy labels
  do not count.
- `v_target := case when not v_active and not v_served and v_count>0 and (v_last is null or v_last<v_today) then v_today
  else greatest(v_today+1, v_last+1) end;`
- Interpretation recorded for the manager: the ruling's "first-pool-immediate must not pick a label already served" is
  implemented as "immediate is skipped when any label at or after today is served". Reason: a snapshot effective on
  today D also governs every later label, so activating on D after a UTC serve of D+1 would re-rank the served D+1
  label (and, with the ledger flag on, 503 that day) — the exact C11 failure. In that case the save goes to
  `greatest(D+1, D+1+1)` = D+2. Mutation M2 below proves the harness guards this clause.
- Everything else in the function is byte-identical; no other function, no schema change, no backfill, no older
  migration touched. Seed migration LF SHA-256 `B7AC3E00…5FBB4C` → `1E2AFDD98B0BE86FD930122A77BF80817FCA5E1634B926B4DA90C4F17C3C07C3`
  (git blob `abd61b54f5b0f83e839d9dd6ab27910caa28c2eb`).

## Bundle

Rebuilt exactly as the old one was made (reconstruction of the old bundle from `99cb9a3a` reproduced `F1D16D…5745A`
byte-for-byte first): `BEGIN;\n`, then for each of the four manifest paths in order `-- BEGIN <path>\n` + Git blob (LF)
+ `-- END <path>\n`, then `COMMIT;\n`. Diff against the old bundle = only the `seed_pool_apply` hunk.

| | old | new |
|---|---|---|
| bundle SHA-256 | `F1D16D710C9B451CE90F5F3254B80DFE9D0A566779EC2485C51207BAEAC5745A` | `A7878BF3A92587B653159604AED6DF0F959207A9C36958E686729EB215120A1B` |
| bundle bytes | 63045 | 63968 |
| manifest commit | `93673ab4…` | `a1f2e615ed2256979167f94b6fce83654ce15b1b` |
| seed windows (CRLF) SHA-256 | `1DF1C5C6…E20F30D` | `B4B8B892F99665961747A643A23D24F103B99EF47ADBADFD3CC6EF806505DAF7` |

Pinned in `sql-runtime/README.md`, `seed-closure-manifest.json` and `invoke-local.ps1` (all updated). Other three
source entries unchanged. Wrapper SHA-256 now `CB7DA35DC5217C6AB42E1DCE235F26BF3BA2935A540EB868F2CCD7285AB38889`.
Not updated (outside this worktree's tracked files): any rollout/handoff doc in the main checkout that quotes `F1D16D…`.

## Harness (`sql-runtime/served-label-floor-prodmeta.sql`, wired as the 7th SQL file of `-Action tests`)

Guarded, single transaction, `ROLLBACK`. D = today in America/Chicago (2026-11-04 during the run).
1. Observed: UTC `seed_pool_record_feed_served(D+1)`, switch to Chicago, record D, first save → D+2; pending = D+2;
   `resolve(D+1)` still has no snapshot; `resolve(D+2)` = the new version; a second save while pending → D+2 and supersedes.
2. Batch: UTC served batch D+1 (no seed version), Chicago acknowledged batch D → D+2.
3. Digest: UTC `claim_briefing_delivery(D+1)`, Chicago observed D → D+2.
4. Immediate blocked: UTC observed D+1 only, nothing on D, no active pool → D+2 (not D); D+1 still unseeded.
5. Prepared batch D+1 + observed D → D+1 (prepared ignored).
6. Unchanged normal next day: observed D → D+1; second save → D+1.
7. Unchanged first-pool-immediate with nothing served → D, nothing pending; next save → D+1.
8. Unchanged: only past labels (observed D-3, acknowledged batch D-2, digest D-1) → immediate D.
9. Non-date labels (`'not-a-date'` batch, `'2026-02-30'` digest) ignored, no error → D+1.

## Steps

| Step | Result | Evidence |
|---|---|---|
| 1 Migration (one commit `a1f2e615`) | PASS | diff = `v_last` declare + 9-line floor block |
| 2 Harness file + wrapper wiring | PASS | `served-label-floor-prodmeta.sql` SHA-256 `81E80AA3…A07A0C5` |
| 3 Bundle/manifest/README/wrapper regenerated | PASS | new SHA above; committed blob re-hashed equal |
| 4a Preflight (no 55479 listener, no postgres, status 3) | PASS | `00-preflight.log` |
| 4b Old data retained (moved, not deleted) | PASS | `data` → `peer-seed-pg-runtime/data-retained-w7-20261104-0025`, 1326 files / 50442951 bytes before = after (`01-`) |
| 4c initdb fresh at same path, detached start, identity `127.0.0.1|55479|…/peer-seed-pg-runtime/data`, PG 17.11 | PASS | `02-`, `03a-` |
| 4d createdb + four baseline files (hashes equal the prior run) | PASS | `04-createdb-baseline.log` |
| 4e Metadata compare: all categories production-only=0 local-only=0 | PASS | `05-metadata-compare.log` (local JSON hashes identical to the 2026-11-03 run) |
| 4f Guarded sequence alignment (`peer-claude-g2/align-sequence-postgres.sql`, SHA-256 `7BBE9CB7…5BD98C`); 17 sequence fields + 6 role attrs = export; legacy rows 2|2|3|1|3, seed state absent; re-compare zero diff | PASS | `06-align-legacy-recompare.log` |
| 4g `-Action check` | PASS | `07-check-bundle.log` |
| 4h `-Action bundle -SequenceMetadata …/production-sequence-metadata.json` (SHA-256 `249B3F9B…24F0`); only the three expected DROP POLICY NOTICEs | PASS | `07-check-bundle.log` |
| 4i Owner simulation (`simulate-migration-owner.sql`, precedent from 2026-11-03): `seed_pool_apply` owner `postgres`, SECURITY DEFINER | PASS | `08-owner-simulation.log` |
| 4j `-Action tests`: 6 old SQL groups + R-C11 group (all 10 notices) + 5 two-connection races | PASS | `09-tests.log` (exit 0, 00:28:36–00:28:54 CST) |
| 4k Stop: exit 0, status 3, no pid file, 0 listeners, 0 processes; only ERROR lines in `postgres.log` are the three intended red runs below | PASS | `14-stop.log` |
| 5a `migration.test.ts` (11 tests incl. new R-C11 source invariant) | PASS | `13-restore.log` |
| 5b Full `npx vitest run` | PASS* | 11466 passed, 3 failed = 5 s timeouts in reader source-scan tests (`explain-box.nosearch`, `pane-layout.retired`, `spread`) under full parallel load; rerun alone 21/21 pass (`15-`, `16-`). No reader file touched. |
| 5c `npx tsc --noEmit --incremental false` | PASS | exit 0 (`17-tsc.log`) |
| 5d `npx eslint src/lib/seed-pool/migration.test.ts` | PASS | exit 0, no output (`18-eslint.log`) |
| 6 Mutation red → restore byte-identical | PASS | below |

## Red-on-old and mutations (same replayed DB; function swapped in place with `create or replace`, owner/ACL kept)

- **Old function (`99cb9a3a`)**: strict harness exit 3 at case 1 — `expected effective 2026-11-06 got … 2026-11-05`.
  A scratch soft-mode copy (warnings instead of exceptions, not committed) lists every old-function miss: case 1
  (effective 11-05, pending 11-05, served label D+1 re-ranked, second save 11-05), case 2 (11-05), case 3 (11-05),
  case 4 (11-04 and D+1 re-ranked); cases 5–9 pass on the old function, confirming they are unchanged behaviour (`10-`).
- **M1** `greatest(v_today+1, v_last+1)` → `v_today+1` (file SHA-256 `8A717C13…F7F2A2`): strict harness exit 3 at case 1
  (got 2026-11-05); vitest R-C11 invariant red (`11-mutation.log`).
- **M2** drop `and (v_last is null or v_last<v_today)` (file SHA-256 `776E9134…A26E7A`): strict harness exit 3 at case 4
  (`immediate blocked by later served label expected 2026-11-06 got 2026-11-04`) (`12-mutation-m2.log`).
- **Restore**: file copied back from backup; SHA-256 `1E2AFDD9…C07C3` = committed blob, git status clean; extracted
  function chunk hash equal to the pre-mutation chunk; reinstalled `pg_get_functiondef` md5 `8002fe102b290f723840e0bf1db069b6`
  = the bundle-installed value; strict harness exit 0; migration test 11/11 (`13-restore.log`).

## State and limits

- Task cluster stopped. `peer-seed-pg-runtime/data` now holds this replay (new bundle + invented rows, function restored
  to the committed definition); it is not a fresh baseline. Prior data retained at `data-retained-w7-20261104-0025`,
  plus the older `data-retained-20261103-1358` and `data-aborted-20261103-1401`.
- Local PostgreSQL 17.11 Windows x64, not production 17.6 aarch64; bundle DDL ran as local superuser with ownership
  simulated afterwards (same limit as the 2026-11-03 run). `pg_input_is_valid` needs PostgreSQL 16+ (production reports 17.6).
- Not done here: hosted/test-project replay of the new bundle, and any app-side change (the ruling needs none: the
  Profile already shows the server's `effectiveLocalDate`).
