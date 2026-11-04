# C checkpoint — W18 production rollout kit fixes (2026-11-04)

Brief: `docs/handoff/upload-abstract/briefs/W18-RUNBOOK-FIXES.md`. Review fixed: W16 (`%TEMP%/peer-claude-w16/W16-report.md`, findings F1-F8). Base HEAD `178682da`, detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w18`. No database, Supabase or Vercel contact; no secret env file read; nothing pushed; no branch.

## Commits

| Commit | Findings | Files |
|---|---|---|
| `d309b3dc` | F3 | `02-rollback.sql` |
| `d4063582` | F5, F7 | `01-preflight-readonly.sql`, `RUNBOOK.md` |
| `fd470166` | F1, F2, F6, F8 | `RUNBOOK.md` |
| `3cdd6b60` | F4 | `RUNBOOK.md` |

## What changed

- **F1** (RUNBOOK D3/D0). The D3 sequence one-liner compares `maximum` through `int(float(x))` on both sides; every other key stays exact. Chosen over skipping `maximum` because it still catches a real change (e.g. 2147483647) while mapping 9223372036854775807 and the editor's display-rounded 9223372036854776000 to the same value. The exact check stays in SQL: 01 `stop_checks.sequence_equal_export` (`seqmax = 9223372036854775807`), required by `go_for_apply`. D0 now records `export_copies.sequence_metadata.maximum` from the peer-test 01 cell (expected `9223372036854776000`) and may rehearse the D3 split + sequence commands on that cell (both must exit 0).
- **F2** (RUNBOOK D3). Save format stated (the cell value: one object with `go_for_apply`, `stop_checks`, `export_copies`). The split one-liner unwraps the bare object, the row export `[{"production_preflight": {...}}]`, and a string-encoded value, and prints the five names written.
- **F3** (`02-rollback.sql`). New step [0] before anything else: NULL or unknown `v_mode` and `v_target` are REFUSED; `v_allow_drop_observed_day_markers` and `v_storage_checked_in_ui` are coalesced to false (the second had the same fail-open on NULL: `ELSIF NOT NULL` skipped its blocker). The later mode check is NULL-safe. The dry-run RAISE fires on `v_mode IS DISTINCT FROM 'execute' OR v_target IS DISTINCT FROM 'production'`. The rehearsal line `v_mode := 'dry-run'` is kept. Header comment documents fail-closed.
- **F4** (RUNBOOK C1). One bullet with five sub-bullets: dispatch-digests 439-445 and 505-509; prepare-dashboards 186-189 gated at 420-428; digest-retry.ts 52-54 and 99-102 (dedupe path only); warm-pool.yml 27-30 (anonymous POST); purge-uploads `upload-store.ts:463-481` (never lists `seed-pool/`). Each line range re-read with `git show 902eb50:<path>` before writing.
- **F5**. 01 `apply_wait` gains `other_sessions_holding_locks_on_auth_users` (informational, not part of `go_for_apply`) and a header note. RUNBOOK: D4 WAIT bullet and open risk 6 name the SHARE ROW EXCLUSIVE lock on `auth.users` from the 7 new FKs (bundle 42, 79, 364, 493, 500, 509, 526). New E2a: put `SET lock_timeout = '5s';` + LF (25 bytes) as one line before the unchanged bundle text in the same editor tab; E3 checks that first line exactly and runs every existing check on the remainder (whole text 63993 bytes, 931 LF). The bundle file is not edited (SHA `A7878BF3…` re-verified). H3: 02 already sets `lock_timeout` 5 s itself as its first statement, so no extra step.
- **F6** (RUNBOOK D2/D0). D2: a G1-G6 refusal in production = STOP and report the exact message, never edit/comment out the guard; it may also be a guard fault since D0 never reaches G3-G6. D0: states what it does not exercise, plus the W18 local stub run below.
- **F7**. 01's timezone count now accepts zone names and abbreviations case-insensitively (`pg_timezone_names`, `pg_timezone_abbrevs`) and carries `timezone_count_is_upper_bound` (POSIX specs like `UTC+5` are still counted). RUNBOOK C3 and D4 call it an upper bound.
- **F8**. D0 and H3: the SQL Editor's destructive-query confirmation for 02 is expected. E4: NOTICEs may not be displayed; absence is not failure (judge by success + E5 + E6); record visibility; report any other NOTICE text.
- The RUNBOOK has no SHA table for the kit files (only the bundle and its segments), so none was updated.

## Operator note for the manager

01 and 02 changed. If D0 was already run on peer-test with the old files, repeat the 01 and 02 bullets of D0 with these versions. 00 and 03 are byte-identical to `178682da`.

## Gates

Static gate script: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w18/h/gates.py <root>` (python, scans outside comments and string literals). Runtime harness: a **new throwaway** PostgreSQL 17.11 cluster that W18 created with the existing EDB binaries in its own scratch (`C:/Users/wbc13/AppData/Local/Temp/peer-claude-w18/pgdata`, 127.0.0.1:55491). The retained harness cluster (`peer-seed-pg-runtime/data`, port 55479) was not started or touched; the README does not call it throwaway. The cluster holds a stub of the post-bundle production shape (`h/stub.sql`: 11-row ledger, old `auth.users` row, bucket, 9 + 7 tables, 19 functions with the exact signatures 02 drops, 19 pre-bundle policies, sequence ACL equal to the export, FKs to `auth.users`). It is a shape stub, not Supabase and not production catalogs. Scripts: `h/run02.py`, `h/run00.py`.

| Gate | Result |
|---|---|
| LF only, no CR (5 files); SQL ASCII only | PASS |
| Balanced parentheses 00/01/02/03 (outside comments/literals) | PASS (depth 0, never negative) |
| No psql meta-commands | PASS |
| Guard DO block byte-identical 00/01/03 | PASS, sha256 `2f2dab0dea82942c…` (same as W16) |
| Read-only scan 00/01/03 (no DML/DDL/GRANT/COMMIT/BEGIN;/nextval/setval/set_config/advisory/terminate …) | PASS; only `EXECUTE` of a literal `SELECT` (1 each) |
| Verifier bodies verbatim: 01 ⊇ test-project 02/03/04/06/07; 03 ⊇ 08 CTEs | PASS (6/6) |
| Canonical bundle SHA-256 | PASS `A7878BF3…` |
| 02 runtime, default (dry-run, production) | ERROR `PEER_ROLLBACK_DRY_RUN_OK`, nothing changed |
| 02 runtime, `v_mode := NULL` / `'Execute'` / `v_target := NULL` | REFUSED before anything ran, nothing changed |
| 02 runtime, `v_allow_drop_observed_day_markers := NULL` + 1 observed-day row | REFUSED (R3) `{seed_pool_observed_days}` |
| 02 runtime, rehearsal stub with `v_mode := 'execute'` | forced dry run, `PEER_ROLLBACK_DRY_RUN_OK` |
| 02 runtime, `v_mode := 'execute'` on the production stub | COMMITTED, `stage_now: pre-bundle` |
| 00 + 01 `$stage$` on the stub (F6 extra) | 00 PASS `bundle-applied` → after 02 execute `pre-bundle`; 01 stage block refuses post-bundle, passes pre-bundle; G3, G4, G5, G6 each REFUSED when its fact was drifted |
| 01 `apply_wait` + `deploy_decisions` CTEs parsed and run on the stub | ok; timezone count 2 of {America/Chicago, est, america/new_york, UTC+5, Mars/Olympus, ''} (UTC+5 = expected over-count) |
| D3 one-liners, copied from the RUNBOOK text (bash + PowerShell `Invoke-Expression`) | split: bare / row export / string-encoded all exit 0; sequence: display-rounded `maximum` exit 0, `maximum` 2147483647 exit 1, `acl` change exit 1; old command on the rounded value exit 1, old split on a row export TypeError (both defects reproduced) |
| **Mutation**: 02 restored to its pre-F3 bytes (`154a752c…`) | runtime: `v_mode := NULL` → exit 0, `"rollback": "COMMITTED"`, bundle tables dropped; `allow := NULL` with an observed-day row → reached `DRY_RUN_OK` (blocker silently dropped). Static gates: 3 F3 checks FAIL. Restored: sha256 `67dfc94afe1b7469f4bf3b5b8c2fddd0a13663bc8a8adfc0a4ad157cbf819cf4` before = after; NULL mode REFUSED again |

## File SHA-256 (LF, at `3cdd6b60`)

| File | SHA-256 |
|---|---|
| `00-production-guard.sql` | `7187369e3ba64886ad9e774bc11eb8c3dc136289e0e11bac5a9a42f6da53a4d4` (unchanged) |
| `01-preflight-readonly.sql` | `1270eda186206b4166bb31fa50837d5b65162ce4251035bca494bc43c631b347` |
| `02-rollback.sql` | `67dfc94afe1b7469f4bf3b5b8c2fddd0a13663bc8a8adfc0a4ad157cbf819cf4` |
| `03-post-apply-readonly.sql` | `95dc17fa33779a7bbf45216871f60236219fbde695f2cb193ad2cba4f09a6722` (unchanged) |
| `RUNBOOK.md` | `f6c1d5fd516cf9acb28bde9d8cfdaf65c0d2060a1819f87fea39f6a254d107de` |
