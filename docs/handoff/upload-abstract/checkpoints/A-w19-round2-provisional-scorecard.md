# W19 — Independent A scorecard, Round 2 PROVISIONAL (2026-11-04)

Reviewer: W19 Group 2 A-role, brief `briefs/W19-ROUND2-PARTIAL.md`. Independent: wrote none of the code and not Round 1. Measure only: no product code edited, no commit/push/branch, no browser, no server started, no secret or env file read. Branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, **HEAD `178682da2d5f2977685667ff050ca3e680e0edd2`** (main checkout, working tree clean apart from untracked docs). W11 commits `f30a1767 3f42e760 358b4516 0a156602`, W15 `960bfd0e 2c0437c3`, `34ed34c3`, `178682da` all verified ancestors of HEAD. Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w19/`.

## Own checks run at HEAD 178682da

| Check | Result | Log |
|---|---|---|
| Full `npx vitest run` (main checkout `web/`) | EXIT 0: 634 files passed / 2 skipped; 11,524 tests passed / 2 skipped; no failures, no reruns | `peer-claude-w19/full-vitest.log` |
| Seed probe (W11 copy of the W1 rank+extract probe; fixture `candidates.ts` sha256 `4c7f23c6…` = W1 = W10), re-pointed at main checkout `web/` (`probe/vitest.w19.config.ts`) | 2/2 pass; fetch 0, model 0. `summarize.cjs` output **identical** to W11 `after`: 71 seed reasons, **verb-fragment 0**, ungrounded 0, non-admitting 0, "the terms" form 13; canopy method `field sensors` recognized, object none; battery object+method recognized; blank PDF seed null; noSeedIdentity head-vs-merge-base true, unusable-vs-none true | `peer-claude-w19/probe/probe.log`, `probe/summary-head.txt`, `probe/out/` |
| My own stricter reason count (boundary list + participles retained/maintained + common causal verbs) | 0 / 71 seed reasons | inline node script over `probe/out/rank-probe-report.json` |
| Probe diversity/weights (run c, both seeds) | top-10 after diversify: battery 4, canopy 4, none 2; weight recompute maxAbsErr 0; duplicate copies = both (`fRowsEqualC` true, nearest ≤2 distinct canonical); exclusion absent in every run; f-neg penalised | `probe/out/rank-probe-report.json` |
| Public GETs to localhost:3000 (manager's production-mode test server, no cookie, 1 per endpoint per paper) | W7222962933 200/200 no-store, retrieval transient [S2 429 transient, Crossref 200 missing, publisher 403 blocked], reading abstract none / fullText blocked / blockedHost sciencedirect.com / body 0 / readability unknown. arXiv 1706.03762 200/200 public, abstract full 7 sentences, html, body 22, `y4obqh`, readable. W7204479535 200/200 public, abstract full 11 sentences, fullText none, body 0, `lge7vj`, readability abstract. Identical to W10 / W2 / W6 | `peer-claude-w19/public-head.json` |
| R-W17 runtime check | `react-dom-server.node.production.js` (19.2.4) inline reveal: `$RT` set only inside `requestAnimationFrame(function(){$RT=performance.now()})`; `$RC` calls `requestAnimationFrame($RV.bind(null,$RB))` when `$RT` is not a number, else `setTimeout`; `$RV` ends with `requestAnimationFrame(g._reactRetry)`. `main` has the same next 16.2.3 / react 19.2.4 / react-dom 19.2.4 and an identical `web/src/app/loading.tsx` (`git diff main` empty) | — |
| Code reads | B6 `private-pdf-status.tsx` `hasKeywords = textStatus !== "empty" && preferenceSignals.length > 0`; C3 cues `upload-concepts.ts:128-143`; R-P1 comment "A verb inside a phrase … is outside this rule" (`upload-concepts.ts` ~:115); C18 `seed-pool/scoring.ts` clean/unclean ranking; Profile facets rendered verbatim `seed-pool/seed-pool.tsx:175`; seed reason sentence `scoring/combine.ts:444` (shown on paper page title block and digest email "Why:", not on Today `FeedTile`, same as main); forget route `api/seed-pool/assets/[id]/route.ts` (owner 401, CSRF 403, cleanup_pending 503, forgotten 200); "Read it here" only where Peer has read the text (`papers/[id]/page.tsx:984`) | — |
| Evidence files read and cross-checked against procedures 10/11/12 (verify-SQL check names and fields match the evidence) | `peer-rollout-evidence/test-project/c13-parity-evidence.md`, `c15-retention-evidence.md`, `c16-forget-evidence.md`, `b13/b13-attach-success-evidence.md`; HANDOFF rows 07:21–07:49 UTC | — |

I could not independently query peer-test (no secrets by brief); C13/C15/C16/B13 rest on the manager's recorded observations, which are internally consistent with the committed procedures, verify SQL, and code.

## Theme A — source and report truth (16 units)

| Unit | Verdict | Evidence |
|---|---|---|
| A1 | PASS | Provider-present empty-source JSON → 0 model calls (`api/papers/report/route.test.ts` "missing source text", green in my full run); live no-key W2 |
| A2 | PASS | Same test NDJSON incl. failed deep fallback → 0 calls (green); live no-key W2 |
| A3 | UNRUN | Fixture only; real full-text-only own-key deep report not run (needs owner) |
| A4 | PASS | `evidence.test.ts` green; live W7222962933 no prose |
| A5 | PASS | Provenance matches source on 3 papers (my GETs = W10/W2/W6); legacy-cache fixtures green |
| A6 | PASS | Version/fingerprint invalidation + unrelated-notes fixtures green |
| A7 | PASS | Live `abstractRetrieval` with 3 real attempts (my GET) |
| A8 | PASS | Live transient(429)/missing(200)/blocked(403) distinct, transient no-store (my GET) |
| A9 | PASS | Fixture by nature (`enrich.test.ts` green); no live publisher abstract available |
| A10 | PASS | Fixture bounds green; live metadata 813 ms, 3 attempts |
| A11 | PASS | Live 403 → blocked, no paywallHost, readability unknown (my GET) |
| A12 | PASS | Live blockedHost `sciencedirect.com`, not doi.org (my GET) |
| A13 | PASS (real item) | `openalex:W7222962933` as above, identical across W2/W6/W10/W19 |
| A14 | PASS (real item) | `arxiv:1706.03762` full 7 sentences, html, body 22, `y4obqh` |
| A15 | PASS (real item) | `openalex:W7204479535` full 11 sentences, fullText none, `lge7vj` |
| A16 | PASS | No abstract-required gate; seed admission only widens (`combine.ts`), unchanged since Round 1 |

Arithmetic: PASS 15, costs 0, UNRUN 1 → 100×15/16 = **93.75**. Fixture/code units 12/13 = 92.31; real items A13/A14/A15 3/3. **If A3 passes: 16/16 = 100.00.**

## Theme B — upload and Notes usability (14 units)

| Unit | Verdict | Evidence |
|---|---|---|
| B1 | PASS | Exact label, rendered desktop + 320 px (Round 1 evidence; code unchanged since) |
| B2 | PASS | Masthead entry on every chrome page. `/welcome` chrome-free by layout; **still no written ruling** (see open questions) |
| B3 | PASS | No duplicate home upload (unchanged) |
| B4 | PASS | `Upload full article PDF` visible (Round 1; B13 run re-observed it on `/papers/openalex:W7223556294`) |
| B5 | PASS | Persistent entry through availability failure (unchanged) |
| B6 | PASS (was FAIL 0.25) | `f30a1767`: keyword clause only when `textStatus !== "empty"` and ≥1 preference signal; 12/12 render tests green in my full run; manager live re-check 07:11 UTC: blank upload shows "Private PDF · retained for 30 days after upload." only, canopy upload keeps the keyword clause; B13 matching PDF also keeps it |
| B7 | UNRUN | Anonymous/cross-site/size/type/rights/anon-404/owner-200/delete all observed (Round 1). Cross-owner with a second account not run |
| B8 | PASS | `notes` → existing collection (unchanged) |
| B9 | PASS | Notes actions incl. rename fix (tests green); archive excluded per ruling 24 |
| B10 | PASS | `+ New note` reachable; collection not a blank editor |
| B11 | PASS | Desktop walk (unchanged) |
| B12 | PASS | 320 px walk (unchanged) |
| B13 | PASS (provisional) | Signed-in attachment success: invented 1-page PDF carrying the target's DOI → `/papers/openalex:W7223556294` "Upload full article PDF" → rights tick → ticket 200, upload 200 (DOI band binds), "Attached to: course/machine-learning", "Read it here" (rendered only where Peer has the text), honest report line; persists on fresh navigation (GET private, no-store); Delete PDF → 200, GET null, file 404 (`b13-attach-success-evidence.md`, HANDOFF 07:49 UTC). Standalone signed-in upload passed in Round 1. Ran on the **localhost production build against hosted peer-test storage**, not a deployed host; no "hosted" ruling exists. The run injected a setTimeout rAF into the hidden pane instead of fronting the tab as the R-W17 README step says (timing only; low risk) |
| B14 | UNRUN | Own-key standalone deep report not run (needs owner) |

Arithmetic: PASS 12, costs 0, UNRUN 2 (B7, B14) → 100×12/14 = **85.71**. Rendered units (B1–B6, B8–B12) 11/11 = 100; hosted-workflow units (B7, B13, B14) 1/3. **If B7 and B14 pass: 14/14 = 100.00.** (If the manager rules that "hosted" means a deployed host, B13 reverts to UNRUN: 11/14 = 78.57.)

## Theme C — Seed Paper Pool (18 units)

| Unit | Verdict | Evidence |
|---|---|---|
| C1 | PASS | Max-5 live refusals, copy, server cap (Round 1); unchanged. Signed-in onboarding walk still not observed (residual) |
| C2 | PASS | Profile active/pending/status/effective date/add-remove-replace-undo (Round 1; C16 run re-used the card UI) |
| C3 | **FAIL (0.25, cosmetic)** | Object/method half fixed (`3f42e760`: canopy now `method: field sensors`; R-C3 tests green). **Mechanism:** `extractUploadConcepts` (R-P1) trims boundary words only at phrase edges and by its own comment leaves an internal verb "outside this rule", so internal-verb n-grams stay Topic facets — at HEAD the canopy seed's topics include "density affects water", "denser foliage retained", "foliage retained water", "example denser foliage" and battery's "concentration affects cycling", "concentration maintained capacity" (my probe) — and `seed-pool.tsx:175` prints them verbatim on the Profile card. R-C18 (`358b4516`) hides them from reasons only. Truthful (present in the PDF) but ungrammatical, so cosmetic |
| C4 | PASS | Separate per-seed scoring, nearest ≤2, `x-both` two seeds (my probe `separation`) |
| C5 | PASS | Duplicate copies = both (`fRowsEqualC` true, distinct canonical); live exact-byte dedupe (Round 1) |
| C6 | PASS | Run c top-10 after diversify: battery 4 / canopy 4 / other 2. Observation (manager ruling R-C6c, not costed): canopy's new method facet renormalises topic weight 1.0 → 0.714, so topic-only `c-pos` ("Canopy moisture mapping with remote sensing") falls 0.303 → 0.231 below the 0.3 bar; canopy recall 6 → 5 |
| C7 | PASS | 40/35/15/10, recompute maxAbsErr 0, `seedBlend` on seeded rows; exclusion and negative feedback still win (my probe) |
| C8 | PASS | No feedback → intent 0.5, no penalty (probe run d) |
| C9 | PASS | No-seed and unusable-seed identical to merge-base (my probe, both true) |
| C10 | UNRUN | Needs a fresh account before its first briefing |
| C11 | PASS | Live next-date activation, R-C11 real-PG cases, function md5 on peer-test (Round 1); unchanged |
| C12 | PASS | Live latest-pending + undo (Round 1); unchanged |
| C13 | PASS (was UNRUN) | peer-test order 1, same owner/date: pool in force `3c62d6e1…`; web replay returns batch `f77650f3…` same 10 ids same order; digest dispatched (send_failed only for missing email key); 11 verify checks true: batch version = pool in force, delivery version/generation = batch, delivery item ids and payload items = batch in order, email text names every item in batch order with matching count line; personalised cache covers all served ids (`c13-parity-evidence.md`; check names present in `11-c13-verify.sql`). Residuals not costed: real email transport, order 2 (same fenced replay code, fixture-covered), cache version only inside hashed scope key, prepare-ahead job path not shipped (`dashboard_prepare_jobs` absent by design, `08` asserts it) so the "prepared batch" is the fenced `dashboard_batches` row |
| C14 | PASS | Ledger md5 unchanged across edits, no dislike, 0 feedback events (Round 1); unchanged |
| C15 | PASS (was UNRUN) | peer-test aged fixture (31 days) + real `purge-uploads` job (200, private no-store; wrong secret 401): active seed kept ready, features md5 unchanged, object present, still in today's snapshot; orphan seed revoked/erased/object gone; ordinary 31-day upload fully purged; unaged upload untouched; rollback done (`c15-retention-evidence.md`). Aged fixture, not real elapsed time or production cron |
| C16 | PASS (was UNRUN) | In-app Profile "Forget this PDF and its recommendations" → confirm text → DELETE 200 → asset revoked, title/hash/features erased, object gone, cleanup_complete; removed from all 4 snapshot versions; revision/generation +1; derived batch and cached pools deleted; reading library marker kept; next feed builds a new generation-1 batch (`c16-forget-evidence.md`; route code matches). Removal ≠ dislike passed in Round 1. cleanup_pending retry path fixture-only (not costed) |
| C17 | UNRUN | Cross-owner in app needs a second account |
| C18 | PASS (was FAIL 0.25) | `358b4516`: at HEAD 0/71 seed reasons quote a verb-holding phrase (W11 counter and my stricter counter), 0 ungrounded, 0 non-admitting; R-C18 scoring tests green. Residual (not costed): 13 reasons use the clunky "the terms forest, canopy and water and the terms leaf, canopy and density" form; rendered paper-page/email seed reason not observed |

Arithmetic: PASS 15, costs 0.25 (C3), UNRUN 2 (C10, C17) → 100×(15−0.25)/18 = **81.94**. **If C10 and C17 pass with no new defects: 100×(17−0.25)/18 = 93.06 — still below 97.9 because of C3.** With C3 fixed as well: 100.

## Summary

| Theme | PASS | FAIL (cost) | UNRUN | Actual | If every UNRUN passes | Target |
|---|---|---|---|---|---|---|
| A | 15 | — | A3 | **93.75** | **100.00** | 97.9 |
| B | 12 | — | B7, B14 | **85.71** | **100.00** | 97.9 |
| C | 15 | C3 (0.25) | C10, C17 | **81.94** | **93.06** | 97.9 |

Round 1 → Round 2: A 93.75 → 93.75; B 69.64 → 85.71; C 58.33 → 81.94. Consecutive rounds at target: **0**.

## R-W17 judgement — sound

The ruling (stuck reload = tab with no animation frames, not a product defect) holds up: (1) the stuck text "Brewing your daily briefing" is the default label used only by the root `loading.tsx` fallback, so the page never mounted; (2) React 19.2.4's inline reveal runtime, which I read in `node_modules`, waits on `requestAnimationFrame` until the first frame sets `$RT`, then also retries hydration via rAF — with no frames it can never swap the fallback; (3) the manager's direct test (rAF not firing in the hidden pane; a setTimeout rAF made the same tab render "30 papers… synced just now") isolates the cause; (4) `main` ships the same next/react versions and identical `loading.tsx`, so it is not a regression of this branch. Real browsers resume frames when a background tab is shown, so users at most see the reveal deferred. Caveats: the README precondition says to front the tab and re-test, but the B13 run injected a rAF shim instead — acceptable for a timing-only difference but should be recorded as a deviation; and the README check must stay a precondition, never a reason to discard a stuck result observed in a fronted, frame-producing tab.

## Hard-gate concerns (independent of score)

1. **Ownership — OPEN.** Cross-owner isolation in the app (B7, C17) still unproven; no demonstrated failure.
2. **No unsupported model generation — OPEN on the with-key path** (A3, B14 unrun); zero-call behaviour proven live without a key and in provider-present fixtures.
3. **Source honesty — PASS.** B6 keyword claim fixed; seed reasons grounded (0 ungrounded).
4. **Authentication — PASS** in production mode (Round 1 evidence; forget route 401/403 in code and tests).
5. **No private shared state — PASS so far.** Private no-store on upload/meta/profile and B13 GET; C13 personalised cache owner-scoped; C16 forget clears derived caches. Pre-existing: Notes in browser localStorage (per device).
6. **Release state (not a unit):** all hosted evidence is localhost (dev or production build) against peer-test; production still not updated. Final acceptance needs re-observation on the shipped build.

## Open questions for the manager

- **"Hosted" ruling** (raised in Round 1, still unrecorded): does localhost production build + hosted peer-test Supabase count for B13 (and the hosted runs of C13/C15/C16)? If a deployed host is required, B13 reverts to UNRUN and C13/C15/C16 need re-runs.
- **B2 `/welcome`** chrome-free ruling still unrecorded.
- **C3 scope:** R-C3 covered object/method only; Round 1's C3 mechanism also named the Topic fragments. Record whether the fix should filter internal-verb n-grams from facets (and whether that needs `UPLOAD_CONCEPT_EXTRACTION_VERSION` 14 → 15 so existing seeds are re-read).
- Observation (pre-existing, not costed): a seeded owner with no declared topics gets a seeded web briefing but no digest (`intent_required`); decide whether that is intended for seed-only users.

## What blocks 97.9 (ranked by units unlocked per action)

1. **Second test account (user action).** Use it **first** for C10 (save a first pool before its first briefing), then cross-owner probes per `test-project/13-cross-owner-probes.md` (B7, C17). Unlocks 3 units: B +7.14, C +11.11.
2. **C3 Topic-facet fragments (worker code fix + manager ruling on the version bump).** Drop or re-cut n-grams holding an internal boundary verb/participle ("density affects water", "concentration maintained capacity", "denser foliage retained") from upload concepts / seed facets; re-run the probe and the Profile render. Without it Theme C cannot exceed 93.06 even if every UNRUN passes.
3. **Owner BYOK (user authorization).** Full-text-only no-abstract paper deep report (A3) and standalone upload → deep report (B14). Unlocks A to 100 and B to 100.
4. **Hosted ruling (manager).** Fixes whether B13/C13/C15/C16 stand as PASS.
5. **Round 3 by a fresh independent reviewer** after 1–3: target needs two consecutive rounds at ≥97.9 in every theme; currently 0.
