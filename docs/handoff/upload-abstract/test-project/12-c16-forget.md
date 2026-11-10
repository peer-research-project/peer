# 12 — C16: in-app "Forget this PDF and its recommendations"

Rubric Theme C unit 16: "Reversible removal is not negative feedback; explicit owner forget immediately removes asset/features under clear semantics." Scorecard row C16: UNRUN for the forget half ("explicit forget never exercised in the app/storage"). The removal half already passed (row 214). Target: peer-test (ref `cbsbtkvbmvyznerbpmxg`), local app on http://localhost:3000.

Files:

| File | Writes? | Purpose |
|---|---|---|
| `12-c16-verify.sql` | no | one JSON cell: the asset's state and erasure flags, its storage object, snapshots holding it, seed state, batches/deliveries stamped with the affected versions, owner cache/rollover/delivery counts, reading-upload count |
| `12-c16-pending-arm.sql` | yes (guarded, optional) | makes one spare ready asset "write not yet confirmed" so its forget shows the `cleanup_pending` retry UI |
| `12-c16-pending-release.sql` | yes (guarded, optional) | confirms that write through the app's own `seed_pool_finish_asset`, so the retry can finish |

## What forget does (code)

- UI: Profile (`You`) → **Seed Paper Pool** → each card under **Next pool** has **Forget this PDF and its recommendations** → an alert "Permanently forget this seed PDF and its derived recommendations? Notes and your reading library will not be deleted." → **Confirm forget** / **Cancel** (`web/src/components/seed-pool/seed-pool.tsx` line 160). It calls `DELETE /api/seed-pool/assets/<id>` with body `{"expectedRevision": <editor revision>}` (`web/src/lib/seed-pool/client-api.ts` `forgetSeedPaper`).
- Route `web/src/app/api/seed-pool/assets/[id]/route.ts`: same-origin check (403), session owner (401), UUID check (400), body check (400), then `seed_pool_forget(owner, expectedRevision, id)`; `stale_revision` → 409, `not_found` → 404; then, only if every returned object has `writerSettled === true` and `cleanupAfter <= now` (line 25), removes each `seed-pool/<ownerKey>/<id>.pdf` and marks the tombstones `cleanup_complete` (lines 28–33); any refusal or storage error → **503 `{"status":"cleanup_pending","revision":n}`** (lines 25, 34); success → **200 `{"status":"forgotten","revision":n,"revocationGeneration":g}`** (line 35).
- `seed_pool_forget` (bundle `sql-runtime/seed-closure-canonical-lf.sql` lines 618–657), one owner-locked transaction:
  - the asset **and every live asset of the same owner sharing its canonical key or content hash** become `status 'revoked'` with `features '{}'`, `public_ids '{}'`, `title ''`, `canonical_key 'revoked:<id>'`, `content_hash ''`, `upload_id ''`, `cleanup_after now()` (or a short delay for a still-staging write);
  - the seed is removed from **every** snapshot of the owner (past, current, pending): the "frozen dates" rule yields to privacy;
  - `seed_pool_state.revision` and `revocation_generation` each +1 (every fence keyed on the old generation now refuses);
  - **all** of the owner's `private_paper_pools` and `dashboard_rollover_candidates` rows are deleted;
  - `dashboard_batches` stamped with any affected snapshot version are deleted (their `dashboard_deliveries` go with them by `ON DELETE CASCADE`);
  - `briefing_deliveries` stamped with those versions keep their row (idempotency) but get `payload '{}'` and `item_ids '{}'`. An email already sent cannot be recalled.
- A retry on an already revoked asset returns the stored tombstone objects without a new generation and without reviving any text (bundle 630–634).
- The editor (`seed_pool_editor`, bundle 724–750) lists only `ready` assets as available and returns revoked-but-uncleaned ones as opaque ids in `cleanupPending`; the Profile shows them as "Recommendation use has been revoked for N paper(s). File cleanup is pending." with **Retry file cleanup N** buttons (`seed-pool.tsx` 166–169).

## Preconditions

1. `00` PASS, bundle applied; A signed in on localhost:3000 (`peer-web-test-target`).
2. Run **after** C13 (`11-c13-parity.md`) and save its JSON first: forget deletes the C13 batch and empties the C13 delivery payload, which is exactly what this unit checks, but it destroys the C13 evidence.
3. Run **after** the cross-owner probes that use A's live seed id (`13-cross-owner-probes.md` section B), or repeat probe S1 afterwards (it must still answer 404).
4. The C15 rollback (`10-c15-rollback.sql`) is done or the canopy asset is the one you forget (both are fine; the rollback only restores a `ready` asset).

## Steps — main path (expected "forgotten")

1. Note the canopy asset id (`10-c15-verify.sql` → `seed_assets`, or in A's console `(await (await fetch('/api/seed-pool',{cache:'no-store'})).json()).availableAssets.map(a => ({id: a.id, title: a.title}))`).
2. **Before.** `12-c16-verify.sql` with A's email, `seed_id` = canopy id, `versions '{}'`; save `c16-0-before.json`. Expected: `asset.status: ready`, `title_present: true`, `features_empty: false`, `storage_object_present: true`, `snapshots_containing_seed >= 1`, `snapshot_versions_containing_seed` lists the C13 version, `batches_with_those_versions` holds today's C13 batch, `deliveries_with_those_versions` holds the C13 delivery with `payload_empty: false`, `owner_counts.private_paper_pools >= 1`. Copy `snapshot_versions_containing_seed` and `seed_state`.
3. **Forget in the app.** Profile → **Seed Paper Pool** → on the canopy card under **Next pool** click **Forget this PDF and its recommendations** → read the alert → **Confirm forget**. In DevTools → Network: `DELETE /api/seed-pool/assets/<id>` → **200** `{"status":"forgotten","revision":<before+1>,"revocationGeneration":<before+1>}` with `Cache-Control: private, no-store`. Notice: "The seed PDF and its derived recommendation data were forgotten." The card leaves **Next pool**; **Active today** no longer lists it (shows "No seed papers." if it was the only one).
4. **After, before any Today visit.** `12-c16-verify.sql` with the same `seed_id` and `versions` = the copied list (`'{<v1>,<v2>}'::text[]`); save `c16-1-after.json`. Expected:
   - `asset`: `status: revoked`, `title_present: false`, `canonical_key_kind: revoked`, `content_hash_present: false`, `upload_id_present: false`, `features_empty: true`, `public_ids_empty: true`, `cleanup_complete: true`, `storage_object_present: false`;
   - `related_live_assets: []` (any listed in step 2 are now revoked too);
   - `snapshots_containing_seed: 0`; `seed_state.revision` and `.revocation_generation` each exactly +1;
   - `batches_with_those_versions: []`; every entry in `deliveries_with_those_versions` has `payload_empty: true`, `item_ids_count: 0`;
   - `owner_counts`: `private_paper_pools: 0`, `dashboard_rollover_candidates: 0`, `dashboard_batches` and `dashboard_deliveries` lower by the deleted batch and its rows, `briefing_deliveries` unchanged, `reading_upload_markers` **unchanged** (reading library kept), `seed_namespace_objects` −1;
   - `editor_lists_as_available: false`, `editor_lists_as_cleanup_pending: false`.
5. **No resurrection.** Reload the Profile page: the canopy card does not return in **Next pool** or **Active today**; no "Pending file cleanup" section. In the console, `GET /api/seed-pool` → `availableAssets` and `cleanupPending` do not contain the id. Run the purge job once (`10-c15-retention.md` step 6) and re-run step 4's SQL: unchanged.
6. **Feed after forget.** Open Today: it loads (no "unavailable"). Then `11-c13-verify.sql` for today: a new `batch` exists with `seed_revocation_generation` = the new generation, `checks.generation_batch_eq_state: true`, and any `personalized_cache.rows_for_date` rows have `created_at` after the forget time.

## Optional — the `cleanup_pending` retry path (artificial trigger)

1. Profile → **Seed Paper Pool** → **Add PDFs** → `fictional-battery.pdf` (a new asset id even if C15 used the same bytes) → **untick it, do not Save pool**. Get its id (console line in step 1 above).
2. `00`, then `12-c16-pending-arm.sql` with A's email and that id. Expected `armed: [{status: ready, writer_settled: false}]`.
3. Forget it in the app. Expected: `DELETE` → **503** `{"status":"cleanup_pending","revision":n}`; notice "Recommendation use has been revoked. File cleanup is pending; retry to complete it."; a red section "Recommendation use has been revoked for 1 paper. File cleanup is pending." with **Retry file cleanup 1**. `12-c16-verify.sql` (that id): `status: revoked`, `features_empty: true`, `title_present: false`, `cleanup_complete: false`, `writer_settled: false`, `storage_object_present: true`, `editor_lists_as_cleanup_pending: true`; `seed_state.revocation_generation` +1 (recommendation use is revoked even though the file is not yet deleted).
4. Click **Retry file cleanup 1**: still 503 `cleanup_pending`; `seed_state.revision` unchanged (a retry mints nothing). Reload: the section persists and shows no title or facets (opaque id only).
5. `00`, then `12-c16-pending-release.sql`: NOTICE `seed_pool_finish_asset(<id>) -> {"status": "revoked"}`.
6. Click **Retry file cleanup 1**: **200** `{"status":"forgotten",…}`; notice "The seed PDF and its derived recommendation data were forgotten."; the section disappears. SQL: `cleanup_complete: true`, `storage_object_present: false`. (Alternatively the purge job alone would finish it: `seed_pool_claim_cleanup` claims revoked, writer-settled, incomplete tombstones.)

## What this does NOT prove

- The natural `cleanup_pending` causes — a storage delete failure, or a forget racing an in-flight seed upload (a `staging` asset gets `cleanup_after` 2–3 minutes ahead) — are not reproduced; the optional path uses an artificial "write not confirmed" flag on a ready asset that shares the same route check.
- Notes: they live in browser `localStorage` per device (scorecard observation), so "Notes will not be deleted" is true by construction and is not checked by SQL here.
- Already-sent digest emails are not recalled (by design); only their stored payload is emptied.
- Side effect to record, not a defect: deleting the affected `dashboard_batches` cascades their `dashboard_deliveries` rows, so papers served under the forgotten version are no longer excluded as "already delivered" and may be recommended again.
- Cross-owner forget (B on A's id) is in `13-cross-owner-probes.md`.
