# W10 — Independent A scorecard, Round 1 (2026-11-04)

Reviewer: W10 Group 1 A-role, brief `briefs/W10-ROUND1-SCORE.md`. Measure only: no product code edited, no commit/push/branch, no browser, no secret read. Branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, HEAD `e73f4d37` (all cited cherry-picks `9081c484 ad6594d6 1fc9ddd0..2b8393a8 ace50f99 99cb9a3a a2ac560e 8c7ec610 cfdd94ef ba05c510 4eabb958 e5aa1acd` verified ancestors of HEAD). Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w10/`.

## Own checks run at HEAD e73f4d37

| Check | Result | Log |
|---|---|---|
| W4 probe copy (`candidates.ts`, merge-base legacy files, rank/pipeline probes) re-pointed at main checkout `web/` (`probe/vitest.w10.config.ts`) | 2/2 pass, fetch 0, model 0; `summarize.mjs` output **byte-identical** to W4 `c18` summary (canopy best 0.628; top-10 5/5; n-generic rank 19; 0 non-admitting / 0 slash / 0 boilerplate seed reasons; intent = topicality maxErr 0; seedBlend on every seeded row; no-seed = merge-base, duplicates = both, excluded absent) | `peer-claude-w10/probe/probe.log`, `summary-head.txt` |
| Targeted Vitest: seed-pool lib/component/API, scoring seed, pipeline seed-constraints, notes rename, upload routes, profile route, report route (5 files), upload-backend trace, welcome, profile | 39 files / 505 tests pass | `peer-claude-w10/targeted.log` |
| Targeted Vitest: enrich, evidence, fetch-by-id (3), full-text, reading (identity/blocked/main), report-cache-key, report, use-model-report*, use-reading*, `/api/papers/[id]` + reading, note-tags*, scoring, feed pipeline, briefing | 59 files / 857 tests pass | `peer-claude-w10/targeted-A-B.log` |
| Public GETs, localhost:3000 (dev, HEAD source, no cookie), 1 per endpoint per paper | W7222962933 200/200 no-store, retrieval transient [S2 429 transient, Crossref 200 missing, publisher 403 blocked], reading abstract none / fullText blocked / blockedHost sciencedirect.com / body 0 / readability unknown. arXiv 1706.03762 200/200 public, abstract full 7 sentences, html, body 22, `y4obqh`, readable. W7204479535 200/200 public, abstract full 11 sentences, fullText none, body 0, `lge7vj`, readability abstract. Identical to W2 Run 2 and W6 | `peer-claude-w10/public-head.json` |
| Code reads | report-route tests with a provider present assert zero model calls for empty source incl. deep failure (`route.test.ts` "missing source text"); onboarding dirty/busy guard `welcome/page.tsx:136,159,414-416` + `welcome/seed-navigation.test.ts`; server max-5 `seed-pool/state.ts:49`; staged-copy consumption `api/seed-pool/assets/route.ts:34-43`; seed admission widens, not gates (`combine.ts:357`); static upload line `reader/private-pdf-status.tsx:21` | — |
| Screenshots viewed (manager session tool-results) | `…-dy4ykt.jpg` (signed-in standalone upload page, global label + `notes` adjacent); `…-u7lns4.jpg` (320 px home, both entries); `…-437t5n.jpg` (Profile seed cards: "Untitled PDF", verb-fragment topics, object/method "Not recognized") | `C:/Users/wbc13/.claude/projects/C--I-Personal-Github---start-up-project-Peer/80acfc05-fe57-4f98-9572-9dab43af2a80/tool-results/` |

Not run by me: full suite at HEAD (last full PASS was `99cb9a3a`; W7's full run had 3 load timeouts, W8 ran targeted 2,509 only), build/tsc/lint at HEAD, any browser walk.

## Theme A — source and report truth (16 units)

| Unit | Verdict | Evidence (level) |
|---|---|---|
| A1 | PASS | Fixture: provider-present empty-source JSON makes 0 `generateJsonText`/`generateDeepReport` calls (`api/papers/report/route.test.ts` "missing source text", passed in my run). Live no-key: W2 Run 2 JSON deep → `noLlm`, 4 ms (`A-w2-test-target-source-truth.md`) |
| A2 | PASS | Fixture: same test, NDJSON, `deepReport` true with `getFullText` not_found (failed deep fallback) → 0 calls. Live no-key NDJSON shallow+deep → tier0 events only (W2 Run 2) |
| A3 | UNRUN | Fixture only ("allows a real deep read without an abstract"). Real full-text-only deep report with the owner's own key not run (known UNRUN) |
| A4 | PASS | Fixture: unsupported proposal/findings/novelty cleared (`A-report-source-final.md` unit 4, `A-corrections-round1.md`); `evidence.test.ts` passes at HEAD. Live: W7222962933 no prose |
| A5 | PASS | Live provenance matches source on 3 papers (W2, W6, my GETs). Legacy-cache clause: fixture (`reportForReading`, v8 report / v4 reading keys, post-fix Notes empty-body probe, `A-report-source-final.md` post-fix section) |
| A6 | PASS | Fixture: version/fingerprint invalidation + Notes unreadable-body fix keep unrelated notes (`A-report-source-final.md` post-fix, `C-notes-unreadable-body.md`); suites pass at HEAD |
| A7 | PASS | Live: W7222962933 metadata shows `abstractRetrieval` with 3 real attempts (my GET, W2, W6); fixture fetch-by-id suites pass |
| A8 | PASS | Live: transient(429) / missing(200) / blocked(403) distinct; transient keeps no-store (my GET, W2, W6); fixture 404 vs 429/500/timeout (`A-source-round2.md`) |
| A9 | PASS | Fixture only by nature: explicit meta/JSON-LD/section accepted, TLDR/generic/unrelated-graph rejected (`A-source-round2.md`, `A-report-source-final.md` unit 9; `enrich.test.ts` passes). No live publisher abstract observed |
| A10 | PASS | Fixture: 5-hop manual redirect bound, zero retries, deadlines (`A-source-round2.md`). Live: 3 attempts, ≤1.7 s metadata |
| A11 | PASS | Live: 403 → `blocked`, no `paywallHost`, readability unknown (my GET, W2, W6) |
| A12 | PASS | Live: blocked host `sciencedirect.com`, not `doi.org` (my GET, W2, W6); fixture redirect attribution |
| A13 | PASS (real item) | `openalex:W7222962933`: abstract 0/0, transient+missing+blocked named, no-store both, no prose without key — dev (W2 ×2, mine ×1) and production build (W6 ×2) identical |
| A14 | PASS (real item) | `arxiv:1706.03762`: abstract full 7 sentences (1,135 chars per W2), html, body 22, `y4obqh`, public cache — 5 observations identical |
| A15 | PASS (real item) | `openalex:W7204479535`: abstract full 11 sentences (2,023 chars per W2), fullText none (not called paywall), `lge7vj` — 5 observations identical |
| A16 | PASS | Code/fixture: no abstract-required gate (`SOURCE-AND-ELIGIBILITY-B.md`, title-only probe `A-report-source-final.md` unit 16); seed admission only widens the Required gate (`combine.ts:357`). Live feed eligibility not separately probed |

Arithmetic: PASS 15, costs 0, UNRUN 1 → 100×15/16 = **93.75**. Breakdown: fixture/code units (A1–A12, A16) 12/13 = 92.31; real items A13/A14/A15 3/3 = 100 each.

## Theme B — upload and Notes usability (14 units)

| Unit | Verdict | Evidence |
|---|---|---|
| B1 | PASS | Exact `upload pdf paper to deep read` (`upload-button.tsx:235,279`); rendered desktop 1280 + 320 (HANDOFF rows 197/198; screenshots dy4ykt, u7lns4) |
| B2 | PASS | Masthead entry on home, paper, upload reader, saved, profile (rows 197/198/206; W6 pages). `/welcome` is chrome-free by layout design (`layout.tsx:116`); no written ruling yet — see open questions |
| B3 | PASS | Home has no other upload button (row 197/198) |
| B4 | PASS | `Upload full article PDF` visible on `/papers/openalex:W7223556294`, mismatch guard honest (row 206) |
| B5 | PASS | Entry stayed rendered through an availability failure (row 199); availability-flow fixtures pass |
| B6 | FAIL (0.25, cosmetic) | Availability error shows explanation + Retry (row 199). **Mechanism:** the unreadable-PDF reader page (`upload:6b841c6f…`, row 205) also prints the static line "…keywords inform your recommendations." from `reader/private-pdf-status.tsx:21` regardless of whether any text/keywords were extracted, contradicting the correct "no readable text" message above it |
| B7 | UNRUN | Anonymous 401 / cross-site 403 / size 413 / type 415 / rights 400 / anon 404 on private ids / owner 200 private no-store / physical delete all observed (rows 205, 208; `A-w6-prod-build.md`). Cross-owner (second account, real JWT/RLS in app) not run — ownership clause open (known UNRUN) |
| B8 | PASS | `notes` → `/saved#shelf-notes` existing collection (row 198) |
| B9 | PASS | Create/search/rename/duplicate/export/delete/reload observed (row 198); D-B9-1 fixed (`9081c484`, `ad6594d6`), manager mutation caught, browser re-check (row 209); rename test passes in my run. Archive excluded per ruling 24 |
| B10 | PASS | `+ New note` creates and opens editor; collection is not a blank editor (row 198) |
| B11 | PASS | Desktop 1280 walk (rows 197/198/202/206; dy4ykt) |
| B12 | PASS | 320 px: both entries 44 px, scrollWidth 320, Notes usable (row 198; u7lns4) |
| B13 | UNRUN | Signed-in standalone upload to peer-test storage succeeded (row 202, dy4ykt). Attachment **success** path (matching paper) not run — only the mismatch refusal (row 206). Also runs on localhost dev, not a hosted deployment |
| B14 | UNRUN | Real standalone upload → own-key deep report not run (known UNRUN) |

Arithmetic: PASS 10, costs 0.25, UNRUN 3 → 100×(10−0.25)/14 = **69.64**. Breakdown: rendered units (B1–B6, B8–B12) (10−0.25)/11 = 88.64; hosted-workflow units (B7, B13, B14) 0/3.

## Theme C — Seed Paper Pool (18 units)

| Unit | Verdict | Evidence |
|---|---|---|
| C1 | PASS | Live (shared editor, Profile): batch 2+4 refused "Choose at most five…", 6th refused, 5/5 (row 214); copy "choose 3–5 … One to five works" (`seed-pool.tsx:154`); server max 5 (`state.ts:49`); onboarding dirty/busy guard + test. Signed-in onboarding walk itself not observed (residual) |
| C2 | PASS | Live Profile: active/pending, ready/failed status, "Effective … · America/Chicago", add/remove/replace/undo (rows 210, 213, 214); D-C2-1 styling verified live (row 222). "Untitled PDF" for generated PDFs not costed: no evidence they carried an Info /Title |
| C3 | FAIL (0.25, cosmetic) | No-model extraction works and blank PDF is refused live (row 210; `C-peer-pdf-fixtures.md`). **Mechanism:** `preferences/upload-concepts.ts` n-grams keep verb-boundary fragments ("discharge affects suspended", "canopy density affects") as Topic facets shown in Profile, and the materials-centric object/method cues leave Object/Method "Not recognized" for 4 of 6 invented seeds, incl. canopy whose body names its method (screenshot 437t5n; W1/W4 residuals). Honest ("Not recognized"), so cosmetic. W9 R-P1 (in flight, not at HEAD) addresses the fragments only |
| C4 | PASS | Separate per-seed scoring, nearest ≤2, `x-both` two seeds (`A-w1-seed-ranking-evidence.md`); unchanged at HEAD (my probe) |
| C5 | PASS | Duplicate seed copies = both seeds; canonical key never repeated; candidate cross-source dedupe (W1; my probe `duplicateSeedsEqualBoth` true); live exact-byte dedupe (`C-peer-pdf-fixtures.md`) |
| C6 | PASS | After R-C6/R-C6b: top-10 battery/canopy 5/5, canopy admits 6 vs 7, author cap + journal boost kept (my probe = W4 c18; `pipeline.seed-constraints.test.ts` passes). Invented candidate set only |
| C7 | PASS | 40/35/15/10 exact (maxErr 0), intent on topicality scale, `seedBlend` breakdown on every seeded row, exclusion and negative feedback still win (my probe; W1). Nit: journal factor not named in `seedBlend` (derivable) |
| C8 | PASS | No feedback → intent 0.5, no penalty (W1 run d; my probe d) |
| C9 | PASS | No-seed / unusable-seed output identical to merge-base pipeline (my probe `noSeedEqualsMergeBasePipeline` true) |
| C10 | UNRUN | First-pool-immediate needs a fresh account before its first briefing (known UNRUN); SQL case 7 only (`C-w7-c11-sql.md`) |
| C11 | PASS | Live next-calendar-date activation across Chicago midnight (row 213); R-C11 served-label floor with 9 real-PostgreSQL cases incl. UTC→Chicago and red-on-old/mutations (`C-w7-c11-sql.md`), function installed on peer-test md5 `8002fe10…` (row 227); DST cases on real local PG harness (`C-seed-sql-runtime.md`). App-level re-observation after R-C11 not done |
| C12 | PASS | Live: rev1 active frozen, rev2/rev4 superseded, latest pending rev5, Undo restores active (row 214); real-PG harness |
| C13 | UNRUN | Web/email/prepared/cache parity with real jobs not run (known UNRUN) |
| C14 | PASS | Live: `preference_ledger` md5 identical across 5 seed edits, `disliked_topics` [], `feedback_events` 0 (row 214); purpose-separation fixtures pass |
| C15 | UNRUN | 30-day active-seed retention needs controlled time or aged fixture (known UNRUN) |
| C16 | UNRUN | Removal ≠ dislike live (row 214, PASS part). Explicit **forget** never exercised in the app/storage; only real-PG cross-owner forget matrix (row 165) and staged-copy fixtures (`mutation-staged-consumption.log`) |
| C17 | UNRUN | Anonymous refusals in production mode (W6; R-H2 401 test passes); peer-test role smoke (row 194). Cross-owner in app not run (known UNRUN) |
| C18 | FAIL (0.25, cosmetic) | R-C18 holds at HEAD: 78 seed reasons, 0 non-admitting, 0 slash, 0 boilerplate (my probe). **Mechanism:** 45/78 reasons quote verb-boundary fragments, e.g. "Shares canopy density affects and density affects water with a seed paper." (same `upload-concepts.ts` n-gram cause as C3; reasons lead with these after R-C18's facet ordering). Truthful (phrases are in the candidate) but ungrammatical. Rendered card/email reasons not observed |

Arithmetic: PASS 11, costs 0.5, UNRUN 5 → 100×(11−0.5)/18 = **58.33**.

## Summary

| Theme | PASS | FAIL (cost) | UNRUN | Score | Target |
|---|---|---|---|---|---|
| A | 15 | 0 | 1 (A3) | 93.75 | 97.9 |
| B | 10 | B6 (0.25) | 3 (B7, B13, B14) | 69.64 | 97.9 |
| C | 11 | C3 (0.25), C18 (0.25) | 5 (C10, C13, C15, C16, C17) | 58.33 | 97.9 |

At 97.9 every unit in every theme must PASS with zero cost (A needs 16/16, B 14/14, C 18/18). Consecutive rounds at target: **0**.

## Hard-gate concerns (independent of score)

1. **Ownership — OPEN.** Cross-owner isolation (second account, real Supabase JWT/RLS, storage object and seed asset ids) is unproven in the app (B7, C17). Route-level owner checks pass in fixtures; SQL RLS passes locally and in peer-test role smoke. Not a demonstrated failure.
2. **Source honesty — minor.** No-text upload page claims "keywords inform your recommendations" (B6). Report wire `basis:"model-abstract"` on the empty no-key report is documented as never rendered (W2) — no cost.
3. **No unsupported model generation — OPEN on the with-key path.** Zero calls proven live without a key and in provider-present fixtures; the real with-key deep path (A3, B14) is unrun, so the "deep report only from real full text" behavior has no live evidence.
4. **Authentication — PASS in production mode** (W6 401/403/404 + R-H2 seed 401). Dev mode intentionally issues an anonymous capability cookie (`upload-access.ts`); production returns 401.
5. **No private shared state — mostly closed.** R-H1 private no-store on every upload-meta/profile answer (tests pass at HEAD); R-H3 tracing. C13 personalized cache parity unrun. Observation (pre-existing, not costed): Notes live in browser localStorage, so they are per device, not per account.
6. Release state (not a rubric unit): production still `902eb50`, seed bundle `A7878BF3…120A1B` not applied to production; all evidence above is localhost against `peer-test`. Theme scores must be re-observed on the shipped build before final acceptance.

## Open questions for the manager

- B2: record a ruling that chrome-free `/welcome` onboarding is outside "throughout app" (A-cross-round2 raised it; none exists).
- B13: does "hosted" require a deployed preview against peer-test, or does localhost against hosted peer-test storage count? Either way the attachment success path is still unrun.
- Evidence durability: today's G7/G8 rendered observations exist only as HANDOFF narrative plus session tool-result screenshots; copy the key screenshots into an evidence folder so Round 2 can re-inspect them.

## What blocks 97.9 (ranked by units unlocked per action)

1. **Second test account B (user action: sign in B on localhost:3000 in a separate browser profile).** Use B **first** for C10 (save a first pool before B's first briefing, confirm it applies immediately; once B sees a feed C10 is lost), then cross-owner probes on A's upload ids, file/meta/reading, seed asset ids, snapshot and `DELETE` (B7, C17). Manager runs. Unlocks C10, B7, C17 (3 units).
2. **Owner BYOK on the test target (user action: authorize own key + the specific live request).** Then standalone upload → deep report (B14) and a full-text-only, no-abstract paper deep report (A3). Manager runs. Unlocks A3, B14 (2 units).
3. **Extraction phrase quality (worker code fix).** Land W9 R-P1 (verb/function-word trimming) and add object/method recognition beyond materials cues (e.g. the canopy "optical imaging and field sensors" case) in the seed path; re-run this probe and the Profile render; re-create test seeds. Unlocks C3, C18 (2 units, 0.5 cost).
4. **Seed forget in app (manager action, no user needed).** Profile "Forget this PDF and its recommendations" → confirm, then peer-test read-only checks: asset row/snapshot features gone, storage object gone or `cleanup_pending` shown with retry, no resurrection on reload. Unlocks C16.
5. **Real job parity (root action + user approval for any email).** On peer-test with isolated cron secret and an approved test inbox: prepare-dashboards for tomorrow, dispatch-digests, web feed, compare owner/date/version/generation. Unlocks C13.
6. **Attachment success path (manager/worker setup).** Find or create a paper whose identity matches an invented PDF (or record the product's legitimate confirmation flow), attach, read. Plus the hosted ruling above. Unlocks B13.
7. **B6 line (worker code fix, ~1 line + test).** Show "keywords inform your recommendations" only when the upload has readable text/extracted concepts. Unlocks B6.
8. **C15 30-day retention (real-time wait or controlled fixture).** Either an aged seed fixture on peer-test (backdated asset row/object via guarded SQL, then run `purge-uploads` and confirm the active seed survives while an ordinary 31-day upload is purged) or wait 30 days. Unlocks C15.
9. **Round hygiene (manager).** Full `npx vitest run`, `tsc`, lint and `npm run build` at the final HEAD (last full suite was `99cb9a3a`); signed-in onboarding walk for C1; app-level re-observation of R-C11; rendered seed reasons on a card; then Round 2 by a fresh independent reviewer.
