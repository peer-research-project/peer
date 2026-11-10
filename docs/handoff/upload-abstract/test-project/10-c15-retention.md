# 10 — C15: an active seed PDF outlives the ordinary 30-day upload expiry

Rubric Theme C unit 15: "Active seed PDF/features persist beyond ordinary 30 day expiry." Scorecard `checkpoints/A-w10-round1-scorecard.md` row C15: UNRUN ("needs controlled time or aged fixture"). This file is the aged-fixture procedure on peer-test (ref `cbsbtkvbmvyznerbpmxg`) and the local app on http://localhost:3000 (`peer-web-test-target`).

Files:

| File | Writes? | Purpose |
|---|---|---|
| `10-c15-verify.sql` | no | one JSON cell: A's seed assets, today's snapshot, A's ordinary uploads and which bucket objects exist |
| `10-c15-age-seed-fixture.sql` | yes (guarded) | ages one active seed asset (and optionally one orphan control) to 31 days; records originals in `peer_test_w12.c15_aged_assets` |
| `10-c15-age-upload-meta.mjs` | yes (bucket object, guarded) | ages one ordinary upload record `<hash16>.json` to 31 days; dry run by default |
| `10-c15-rollback.sql` | yes (guarded) | restores the active seed's `created_at`, drops the bookkeeping |

## What the code actually does (why the fixture looks like this)

- **Ordinary uploads expire by a field inside a bucket object, not a DB row.** The upload route writes `expiresAt = now + 30 days` into `private-uploads/<hash16>.json` (`web/src/app/api/papers/upload/route.ts`, `expiresAt: new Date(Date.now() + 30 * 86400_000)`). `purgeExpiredUploads` lists the bucket's top-level files and, for each `<16 hex>.json`, calls `deleteUpload` when `Date.parse(meta.expiresAt) <= Date.now()` (`web/src/lib/papers/upload-store.ts`, `purgeExpiredUploads`). `deleteUpload` removes `<hash16>.json`, `<hash16>.pdf`, the sidecar `<hash16>.doc.json`, any attachment record and the owner marker `owners/<ownerKey>/<hash16>` (same file, `deleteUpload`). SQL cannot change an object's body, so the expiry is aged by `10-c15-age-upload-meta.mjs`.
- **Seed PDFs live in a separate namespace the ordinary purge never lists.** The seed route stores bytes at `seed-pool/<ownerKey>/<assetId>.pdf` ("Separate namespace: ordinary reading deletion/30-day purge cannot remove this copy", `web/src/app/api/seed-pool/assets/route.ts`). The bucket backend's `list("")` keeps only entries with an `id`, i.e. top-level files; folders such as `seed-pool/` are skipped (`web/src/lib/papers/upload-backend.ts`, `list`: "A folder comes back as an entry with no id"). Only `incoming/` is swept by age (`purgeAbandonedStagedUploads`, 24 h, reads `createdAt`).
- **Seed assets are removed only by the seed sweep, and only when unused.** The purge route runs `purgeExpiredUploads()` then `purgeSeedOrphans()` (`web/src/app/api/jobs/purge-uploads/route.ts`). `purgeSeedOrphans` calls `seed_pool_claim_cleanup(25)` (`web/src/lib/seed-pool/lifecycle.ts`, `repository.ts claimCleanup`). In the bundle (`sql-runtime/seed-closure-canonical-lf.sql` lines 828–861 = migration `20261102000000_seed_pool.sql` lines 339–372) a `ready` asset is claimed only if `created_at < now() - 24 hours` AND no live snapshot references it; inside the loop it is skipped if it is in the owner's current snapshot (latest non-superseded `effective_date <= owner today`) or any snapshot effective today or later. A claimed asset is revoked (features/title/keys erased, `canonical_key = 'orphan:<id>'`), scrubbed from snapshots, its object removed and `cleanup_complete` set (`lifecycle.ts`, `markRevokedCleanupComplete`).
- **Nothing reads a seed object's or a snapshot's age.** No code path compares `storage.objects.created_at` for `seed-pool/…` or `seed_pool_snapshots` dates against a 30-day limit. That is why the fixture changes only `seed_pool_assets.created_at` (the one age the sweep reads) and does not edit `storage.objects` (Supabase owns that schema; editing it would prove nothing extra).
- There is **no time-based purge of seed features at all**: `seed_pool_assets.features` and `seed_pool_snapshots.seeds` change only through forget (`seed_pool_forget`) or the orphan sweep above.

## Preconditions

1. Browser address bar on `/project/cbsbtkvbmvyznerbpmxg/`; `00-test-target-guard.sql` returns `guard: PASS` and stage `canonical bundle ALREADY applied`.
2. Account A exists on peer-test, is signed in on http://localhost:3000 (launch configuration `peer-web-test-target`, never `peer-web-followup`), and has a `profiles` row (check: `10-c15-verify.sql` → `owner_found: true`, `owner_timezone` not null). If the baseline recorded the `on_auth_user_created` deviation, a new sign-up has no profile row and seed features answer "Seed papers are unavailable."; then this unit needs the user.
3. A local test cron secret exists in the git-ignored `web/.env.peer-test.local` (it is blank otherwise, and the purge route then always answers 401). From the repository root in PowerShell — the value is generated and appended without being printed:
   ```powershell
   $envFile = (Resolve-Path "web\.env.peer-test.local").Path
   if (Select-String -Path $envFile -Pattern '^CRON_SECRET=' -Quiet) { "CRON_SECRET already present" } else {
     $hex = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
     [IO.File]::AppendAllText($envFile, "`r`nCRON_SECRET=$hex`r`n"); Remove-Variable hex; "CRON_SECRET appended" }
   ```
   Then `node scripts/dev-test-target.mjs --dry-run` from `web/` must list `CRON_SECRET` under "set from env file", and the dev server must be restarted (the script reads the file only at launch).
4. Nothing else uploads an ordinary PDF between step 5 and step 8 below: `POST /api/papers/upload` itself calls `purgeExpiredUploads()` at the end of every upload (`upload/route.ts`, `await purgeExpiredUploads()`), which would remove the aged record before the job runs and blur which path removed it.

## Steps

1. **Create the fixtures in the app (account A).**
   - Profile page (`You`) → section **Seed Paper Pool** → tick "I have the right to upload these PDFs for private processing." → **Add PDFs** → choose `checkpoints/hosted-fixtures/fictional-canopy.pdf` → wait for the line `fictional-canopy.pdf: ready` → **Save pool** → notice "Pool saved." The **Active today** card must list the canopy paper. If instead a **Pending** card shows "Effective <tomorrow>", A was already served a briefing today; the active-today precondition then needs the next owner-local day (real time) — stop and resume tomorrow.
   - Orphan control (recommended): still in **Seed Paper Pool**, **Add PDFs** → `fictional-battery.pdf`. It appears in **Next pool** already ticked. **Untick it and do NOT press Save pool.** It is now a ready asset referenced by no snapshot.
   - Ordinary upload: the header's upload button (accessible name `upload pdf paper to deep read`) → consent dialog → **Upload PDF** → choose `fictional-battery.pdf` → the reading page opens at `/papers/upload:<hash16>`. Copy `<hash16>` from the address bar. Profile → **Your private PDFs** shows it with "Access expires <date 30 days ahead>".
2. **Baseline (read-only).** Edit `owner_email` in `10-c15-verify.sql`, run it, save as `c15-0-baseline.json`. Expected: `current_snapshot.seed_ids` contains the canopy asset id; that asset `status: ready`, `in_current_snapshot: true`, `storage_object_present: true`, facet counts > 0; the battery seed asset `status: ready`, `in_any_live_snapshot: false`; `ordinary_uploads` lists `<hash16>` with all four objects present (the sidecar `doc_sidecar_present` is true only if the reading page was opened). Copy the canopy asset id, the battery asset id and the ordinary `<hash16>`.
3. **Age the seed assets (guarded).** Run `00-test-target-guard.sql` (PASS), then `10-c15-age-seed-fixture.sql` with `v_owner_email` = A's email and `v_orphan_seed_id` = the battery asset id. Expected: one JSON row `peer_test_c15_fixture` listing two rows (`active` = canopy, `orphan` = battery) with `now_created_at` 31 days ago and `status: ready`. Any `REFUSED:` message means nothing changed (the transaction aborts).
4. **Age the ordinary upload (guarded, bucket object).** From the repository root:
   ```powershell
   node docs/handoff/upload-abstract/test-project/10-c15-age-upload-meta.mjs --hash <hash16>
   node docs/handoff/upload-abstract/test-project/10-c15-age-upload-meta.mjs --hash <hash16> --apply
   ```
   The dry run prints the current and planned `uploadedAt`/`expiresAt`; `--apply` prints "applied. Read-back expiresAt … (in the past: true)". The original record is backed up under `%TEMP%\peer-claude-w12\`.
5. **Pre-purge state (read-only).** Put the ordinary `<hash16>` into `extra_hashes` (`'{<hash16>}'::text[]`) and run `10-c15-verify.sql`; save as `c15-1-aged.json`. Expected: both seed assets `age_days` ≈ 31; the ordinary upload's four objects still present. Side observation: Profile → **Your private PDFs** no longer lists it and `/papers/upload:<hash16>` answers "not found", because `listUploadMeta` and `ownedUpload` already treat an expired record as absent (`upload-store.ts listUploadMeta`, `upload-access.ts ownedUpload`). That is the access cut-off, not the deletion.
6. **Run the purge job locally.**
   ```powershell
   $secret = ((Select-String -Path web\.env.peer-test.local -Pattern '^CRON_SECRET=(.+)$').Matches[0].Groups[1].Value).Trim()
   try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/jobs/purge-uploads' -Headers @{ Authorization = "Bearer $secret" }; $r.StatusCode; $r.Content }
   catch { "HTTP " + [int]$_.Exception.Response.StatusCode }
   Remove-Variable secret
   ```
   Route contract (`purge-uploads/route.ts`): method **GET**, header `Authorization: Bearer <CRON_SECRET>` compared in constant time; wrong/missing secret → **401** `{"error":"Unauthorized"}` with no side effect; success → **200** `{"purged":true}` with `Cache-Control: private, no-store`. A thrown `seed cleanup unavailable` / `seed cleanup incomplete` (`lifecycle.ts`) surfaces as **500**; the ordinary sweep has already run by then, so check step 7 anyway and read the dev-server log.
7. **After-purge state (read-only).** Run `10-c15-verify.sql` again (same `extra_hashes`); save as `c15-2-after-purge.json`. Expected:
   - **Active canopy seed:** `status: ready`, `created_at` still 31 days ago, `features_md5` identical to the fixture's `features_md5_before`, `title_present: true`, `in_current_snapshot: true`, `storage_object_present: true`, `cleanup_complete: false`.
   - **Orphan battery seed (control):** `status: revoked`, `canonical_key_kind: orphan`, `title_present: false`, `content_hash_present: false`, `facet_counts` all null (features `{}`), `cleanup_complete: true`, `storage_object_present: false`. This proves the seed sweep ran in this invocation.
   - **Ordinary upload:** `meta_json_present`, `pdf_present`, `doc_sidecar_present` and `owner_marker_present` all **false**.
   - Profile → **Seed Paper Pool**: **Active today** still lists the canopy paper with its Topic / Research object / Methods facets after a reload; the battery card is gone from **Next pool** and no "Pending file cleanup" section appears.
8. **Idempotence (optional).** Run step 6 again: still 200; step 7 output unchanged.
9. **Rollback.** Run `00`, then `10-c15-rollback.sql` (restores the canopy asset's original `created_at`, drops the bookkeeping). The ordinary upload is purged, so `--restore` correctly writes nothing. If you stop before step 6, run `10-c15-age-upload-meta.mjs --hash <hash16> --restore` to put the original record back.

## Pass / fail reading

- PASS for C15 needs all three in step 7 at once: active seed intact (row, features digest, object, snapshot membership), orphan control revoked and its object gone, ordinary 31-day upload's objects gone.
- If the orphan is still `ready`: the seed sweep did not run (500, or `seed_pool_state` missing → `installed()` answered "missing"); the active-seed result then proves nothing. If the active seed is revoked: a real C15 failure (or the canopy asset was not in today's snapshot — check `in_current_snapshot` in `c15-1-aged.json`).

## What this does NOT prove

- Real elapsed time or the production schedule: the job is invoked by hand on localhost; production relies on Vercel Cron `17 3 * * *` (`web/vercel.json`), which this does not exercise.
- That `expiresAt` is written correctly at upload time on production (only observed on peer-test in step 2: "Access expires" 30 days ahead).
- The seed object's own age is never aged (no code reads it); a future change that starts reading `storage.objects.created_at` would not be covered.
- Behaviour with more than 25 claimable seed assets, concurrent pool edits during the sweep (`pg_try_advisory_xact_lock` skip path), or a storage delete failure (tombstone retry) — not exercised.
- Production storage policies or bucket configuration: peer-test is production-shaped by metadata, not identical.
