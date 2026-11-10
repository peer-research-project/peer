# 11 — C13: web feed, prepared batch, digest email and personalized cache use the same pool version

Rubric Theme C unit 13: "Web/email/prepared jobs/cache use same active pool version." Scorecard row C13: UNRUN. Target: peer-test (ref `cbsbtkvbmvyznerbpmxg`) through the local app on http://localhost:3000 (`peer-web-test-target`).

Files:

| File | Writes? | Purpose |
|---|---|---|
| `11-c13-digest-setup.sql` | yes (guarded) | backs up every profile's digest settings; turns digests off for everyone except A; makes A due now with `digest_channel` `both` (or `inapp`) |
| `11-c13-verify.sql` | no | one JSON cell: preflight, pool in force, batch, delivery, email record, personalized cache, and boolean parity checks for one owner/date |
| `11-c13-digest-restore.sql` | yes (guarded) | restores every profile's digest settings, drops the backup |

## Where each surface gets its version (code)

| Surface | Writer | Version / generation stored |
|---|---|---|
| Pool in force | `seed_pool_resolve` (bundle 549–567): latest non-superseded snapshot with `effective_date <= owner date` | `seed_pool_snapshots.version`, `seed_pool_state.revocation_generation` |
| Web feed (`POST /api/feed` from the Today page, `store/feed.ts`) | `runLedgerAwareFeed` (`web/src/app/api/feed/route.ts` 261–481). Freezes when `PEER_DASHBOARD_LEDGER=on` **or** the seed context is `ready` with a real version (line 296). Existing batch → replay (324–351, re-resolves the pool and refuses on any version/generation change, 345–348); else pipeline → `putSeedPreparedBatch` → `markSeedBatchServed` → read-back check → re-resolve (403–412) | response `meta.batchId`, `meta.batchStatus` (`frozenFeedResponse`, 123–153) |
| Prepared batch | `seed_pool_put_prepared_batch` (bundle 690–705): fenced by `seed_pool_fence_matches`; writes `dashboard_batches(status 'prepared', seed_pool_version, seed_revocation_generation)`; `seed_pool_mark_batch_served` (676–688) refuses a version/generation mismatch | `dashboard_batches.seed_pool_version`, `.seed_revocation_generation` |
| Digest (`GET /api/jobs/dispatch-digests`) | `web/src/app/api/jobs/dispatch-digests/route.ts`: resolve (517) → pipeline → `freezeSeedDigestItems` (551; `web/src/lib/seed-pool/digest-batch.ts`: reuses the owner/date batch if version+generation match, else puts one, then marks served and returns the batch's `servedItems`) → `claimSeedDigest` (572; bundle `seed_pool_claim_digest` 801–811 stamps the delivery) | `briefing_deliveries.local_date`, `.seed_pool_version`, `.seed_revocation_generation`, `.item_ids`, `.payload.items` |
| Digest email | `sendFirstDigestAttemptWithIdempotency` (143–184): renders, `persistSeedDigestEmailAttempt` (bundle 878–890, fenced) writes `payload.email = {idempotencyKey,to,subject,html,text,attemptedAt}` **before** sending, re-validates (`seed_pool_validate_digest_send`), then `sendDigestEmail` | `briefing_deliveries.payload.email` |
| Personalized cache | `runFeedPipeline` (`web/src/lib/feed/pipeline.ts` 1838–1871): pool key from `derivePoolCacheKey` (`web/src/lib/opportunities/pool-cache.ts` 454–483) hashes `seedVersion` and `seedRevocationGeneration` and puts the date in plain text (`peer-pool-v23-papers-<date>-<digest>`); with seeds, writes go through `SeedFencedPaperPoolCache` → `seed_pool_put_private_pool` (bundle 895–904, fenced) | `private_paper_pools(scope_key, payload.localDate)`; **the version itself is only inside the hash** |

## Flags and environment (local test env file `web/.env.peer-test.local`)

| Name | Needed for this run | Why |
|---|---|---|
| `CRON_SECRET` | **set** (locally generated, see `10-c15-retention.md` precondition 3) | both job routes compare `Authorization: Bearer <CRON_SECRET>` and answer 401 otherwise (`dispatch-digests/route.ts` 367–372) |
| `RESEND_API_KEY`, `DIGEST_FROM_EMAIL` | **leave unset** (the launcher blanks them) | `sendDigestEmail` returns `{sent:false, error:"RESEND_API_KEY not set"}` without any network call (`web/src/lib/email/send-digest.ts`, `getClient`) — the email is rendered and persisted but never sent |
| `PEER_DASHBOARD_LEDGER` | not needed | the seeded path freezes without it (feed route 296); it only switches the no-seed legacy ledger |
| `PEER_DIGEST_DEDUPE` | not needed | the seeded digest always claims through `seed_pool_claim_digest`; the flag only switches the no-seed path (route 583). Unset keeps the extra 26 h same-day pre-check (484–503), harmless on a first run |
| `PEER_DASHBOARD_PREPARE` | **keep unset** | `prepare-dashboards` needs table `dashboard_prepare_jobs` and its five RPCs (migration `20260924000600`, `web/src/lib/dashboard/prepare-job-repository.ts`). Neither production nor peer-test has it: `01` does not create it and `08-post-bundle-checks.sql` asserts it did NOT appear. With the flag on, every enqueue throws (`enqueue_failed_reasons: {enqueue_error: n}`) and the drain reports `drain_error` |
| `PEER_DIGEST_EMAIL_RETRY` | keep unset | would replay the persisted email (still unsendable without a key) |

Confirm with `node scripts/dev-test-target.mjs --dry-run` (from `web/`): `CRON_SECRET` under "set from env file"; `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `PEER_DASHBOARD_PREPARE` under "blanked". Restart the dev server after any env change.

## Preconditions

1. `00-test-target-guard.sql` → PASS, bundle ALREADY applied.
2. Account A signed in on localhost:3000 with a `profiles` row and research topics (an intent), so `digestFeedRequestFromProfile` succeeds (else `skipped_reasons: {intent_required: 1}`).
3. A's seed pool is **in force today**: `11-c13-verify.sql` → `pool_in_force.seed_count >= 1` and `effective_date <= owner_today`. If A's only snapshot is pending for tomorrow, the digest would take the no-seed branch (`recordSeedFeedServed`, route 554–557) and this unit needs the next owner-local day.
4. **Protect account B's C10 test.** `dispatch-digests` processes every profile with `digest_enabled = true` (route 380–386). A run that reaches B writes an observed day / briefing for B, after which B's first pool can no longer apply "immediately" (bundle `seed_pool_apply`, lines 592–607). `11-c13-digest-setup.sql` disables every other profile for the duration; `preflight.other_profiles_digest_enabled` must be `0` before you invoke the job.
5. No delivery for A in the last 6 hours (`preflight.deliveries_in_last_6h = 0`), else the route skips A as `recent_delivery` (443–452).
6. Do not change Profile settings in A's browser between setup and dispatch (the profile sync could write `digest_channel` back).

## Steps — order 1: web first, then digest (same owner, same date)

1. Run `00`, then `11-c13-digest-setup.sql` with A's email and `v_channel = 'both'`. Expected: `profiles_digest_enabled_now: 1`, `target_owner_settings.digest_hour_local: 0`, `digest_channel: "both"`.
2. Run `11-c13-verify.sql` (A's email, `local_date ''`); save `c13-0-preflight.json`. Expected: `batch: null`, `delivery: null`, preflight as above, `pool_in_force` present.
3. **Web feed.** In A's browser open the Today page (`/`). In DevTools → Network, select the `POST /api/feed` request → Response. Record `meta.batchId`, `meta.batchStatus` (`"served"`) and the ordered `items[].id`. Reload once: the same `batchId` and the same ids in the same order (replay path). Optional console re-check **only after this first visit** (a GET before any batch exists would mint the day from the probe topic):
   ```js
   const r = await fetch('/api/feed?topics=probe', { cache: 'no-store' }); const j = await r.json();
   ({ status: r.status, batchId: j.meta?.batchId, batchStatus: j.meta?.batchStatus, ids: j.items.map((i) => i.id) })
   ```
4. **Digest job** (PowerShell, repository root):
   ```powershell
   $secret = ((Select-String -Path web\.env.peer-test.local -Pattern '^CRON_SECRET=(.+)$').Matches[0].Groups[1].Value).Trim()
   try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 320 -Uri 'http://localhost:3000/api/jobs/dispatch-digests' -Headers @{ Authorization = "Bearer $secret" }; $r.StatusCode; $r.Content }
   catch { "HTTP " + [int]$_.Exception.Response.StatusCode }
   Remove-Variable secret
   ```
   Expected 200 JSON (counts only, route 731–746): `dispatched_count: 1`, `failed_count: 0`, `emails_sent_count: 0`, `emails_failed_count: 1`, `emails_failed_reasons: {"send_failed": 1}` (with `inapp`: no email counts). The dev-server log shows one `[jobs/dispatch-digests] user <id> send_failed: …RESEND_API_KEY not set` line. `failed_reasons: {"seed_pool_changed": 1}` means a fence refused (pool edited, forget, or version mismatch) — record as a finding. The job runs the Tier 0 feed pipeline, so it calls public academic sources over the network.
5. Run `11-c13-verify.sql` again; save `c13-1-after-dispatch.json`. **Expected (all must hold):**
   - `batch.id` = the `meta.batchId` from step 3; `batch.item_ids` = the step-3 ids in order; `batch.status` `served` or `acknowledged` (the browser acknowledges a rendered batch through `POST /api/feed/ack`).
   - `checks`: `batch_version_eq_pool_in_force`, `delivery_version_eq_batch`, `generation_batch_eq_state`, `generation_delivery_eq_batch`, `delivery_item_ids_eq_batch_in_order`, `delivery_payload_items_eq_batch_in_order`, `email_text_names_every_batch_item`, `email_text_item_order_eq_batch`, `email_text_item_count_line` — all `true`.
   - `delivery.email`: `sent: false`, `attempted_at` set, `to_present`, `subject_present`, `idempotency_key_present` true, `html_bytes`/`text_bytes` > 0.
   - `personalized_cache.rows_for_date`: at least one row whose `payload_local_date` = `local_date`; `served_ids_missing_from_pool_and_rollover: 0`.
   - `observed_day_marker: false` (that marker is only written on the no-seed branch).
6. In A's browser: Profile → **Past briefings** lists today's briefing with the same papers as Today.
7. Run `00`, then `11-c13-digest-restore.sql`. Expected `restore: done`.

## Order 2: digest first, then web (needs the next owner-local day, or a third account)

Same as order 1 but invoke the job **before** A opens Today on a new owner-local date. Expected: the job's `freezeSeedDigestItems` mints the batch (`putSeedPreparedBatch` → `markSeedBatchServed`), then Today's `POST /api/feed` replays it (`meta.batchId` = `batch.id`, same ids). Not runnable today for A because today's batch already exists.

## What truly needs a real email send (user approval + an inbox the user controls)

- That an email is actually delivered and rendered by a mail client, and that `payload.email` flips to `{sent: true, sentAt}` (route 178–182). Needs: the user's explicit approval; a Resend key the user controls in `web/.env.peer-test.local`; `DIGEST_FROM_EMAIL` on a verified domain, or the sandbox sender `onboarding@resend.dev`, which only delivers to the Resend account owner's own address; and A's recipient (its `digest_email` after the Profile confirmation flow, which itself needs `DIGEST_EMAIL_CONFIRM_SECRET` and sends a confirmation email, or A's sign-in address) being an inbox the user controls.
- Resend's idempotency-key behaviour on a retry.
- Everything else in this file (which items, which order, which version and generation, the exact rendered subject/text/html bytes) is proven from the persisted pre-send record without sending.

## What this does NOT prove

- **Prepare-ahead jobs.** The scheduled `prepare-dashboards` path (tomorrow's batch prepared before local midnight, DST cases) cannot run on peer-test or production as shipped: `dashboard_prepare_jobs` is absent by design. The "prepared batch" proven here is the `dashboard_batches` row minted by whichever of web/digest runs first, through the same fenced `seed_pool_put_prepared_batch`.
- **Version inside the personalized cache.** `private_paper_pools` keeps the version only inside the hashed `scope_key`; the payload has `localDate` but no version. The cache leg is shown by date and item coverage plus the code-level fence, not by a stored version string. (After a forget, `12-c16-forget.md` shows every cache row deleted and only new-generation rows coming back.)
- Delivered email (above), production cron cadence (GitHub Actions `digest-cron.yml`), mid-day pool edits racing the job (fence refusals), timezone/DST changes, and more than one owner per run.
