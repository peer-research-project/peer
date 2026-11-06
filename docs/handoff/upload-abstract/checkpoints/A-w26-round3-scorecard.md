# W26 — Independent A scorecard, Round 3 (2026-11-06)

Reviewer: W26 A-role, brief `briefs/W26-ROUND3.md`. Independent: wrote none of the code and none of Rounds 1–2. Measure only: no product code edited, no commit/push/branch, no browser, no server started, no env file read, no secret printed. Branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, **HEAD scored `efcd536fb1b3c2f712fea414603d544c115524b2`** (working tree: only untracked `HANDOFF-CLAUDE-PEER-ROLLOUT.md` and the W26 brief). Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w26/`.

Production check: `git diff --quiet b2903d5 5efdce84` → trees identical, so production peer.homes (b2903d5) = 5efdce84 code. HEAD adds exactly 8 commits over it: `8c987c69 fd79aac2 b9297570 f490e38c 224d8695 f66282e1 0dd0d9c6 efcd536f` (the HANDOFF 21:41 UTC row says "9 local commits"; the git count is 8).

## Own checks run at HEAD efcd536f

| Check | Result | Log |
|---|---|---|
| Full `npx vitest run` (main checkout `web/`) | EXIT 0: 635 files passed / 2 skipped; 11,571 tests passed / 2 skipped; 0 failures (manager's 0dd0d9c6 gate: 11,569 — +2 = the two new callback tests) | `peer-claude-w26/full-vitest.log` |
| `npx tsc --noEmit -p .` | EXIT 0, no output | `peer-claude-w26/tsc.log` |
| Seed probe (W19 copy, `candidates.ts` sha256 `4c7f23c6…` unchanged), pointed at HEAD `web/` | 2/2 pass; fetch 0, model 0. canopy topic `water retention, forest canopy water, denser foliage, leaf canopy density, canopy moisture, fictional trees, leaf area`, method `field sensors, optical imaging`; battery topic `cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity`, object `battery electrolyte stability, electrolyte concentration`, method `impedance spectroscopy`; blank seed null. 71 seed reasons: verb-fragment 0, ungrounded 0, non-admitting 0, "the terms" form 7 (was 13). No-seed identity head-vs-merge-base true, unusable-vs-none true. Run c top-10 after diversify: battery 4 / canopy 4 / none 2; `c-topic` canopy 0.321 ≥ 0.3 admitted; duplicates `fRowsEqualC` true, nearest ≤ 2 distinct canonical; exclusion absent in every run; weight recompute maxAbsErr 0; f-neg penalised (0.677) | `peer-claude-w26/probe/{probe.log,summary-head.txt,out/}` |
| Public GETs to localhost:3000 (no cookie, 1 per endpoint per paper) | W7222962933 meta 200 no-store, retrieval transient [S2 429 transient, Crossref 200 missing, publisher 403 blocked]; reading abstract none / fullText blocked / blockedHost sciencedirect.com / body 0 / readability unknown. arXiv 1706.03762 200/200 public, summary 1136 chars, abstract full 7 sentences, html, body 22, `y4obqh`, readable. W7204479535 200/200 public, summary 2024 chars, abstract full 11 sentences, fullText none, body 0, `lge7vj`, readability abstract. Identical to W2/W6/W10/W19 | `peer-claude-w26/public-head.json` |
| Bundle file check | `sql-runtime/seed-closure-canonical-lf.sql` sha256 `a7878bf3…120a1b` (= manifest = in-page E3 hash), 0 CR, 0 occurrences of `handle_new_user` | — |
| Code reads | W24 `deepReportRequested` (`use-model-report.ts` ~:270) counts `upload:` ids, still requires `aiMode !== "none"`; W24 `modelAsked` (`lib/reader/report-outcome.ts`) = provider && (abstract non-empty ‖ stream `reading` stage), `requestAbstract` mirrors route `fullAbstract` (`route.ts:101`, empty abstract → `emptyReport` at `:237` before any call); W25 `verifyReportEvidence` (`lib/papers/evidence.ts`) drops+counts every `newHere` line and `keyResults[].novelty` unless its quote is in the corpus AND matches `NOVELTY_CUES`; client cache `peer-paper-report-v9`, v3–v8 removed only by key (`use-model-report.ts:33,397`); server-side Pass-1 caches are intermediate (verifier runs after Pass 2). Auth callback (`auth/callback/route.ts:41-51`). W20 `holdsVerb` / W21 `SEED_CONDITION_PHRASES` / W23 `SEED_EDGE_POINTER_WORDS` checkpoints match the probe output. `seed_pool_apply` first-pool rule (migration `20261102000000_seed_pool.sql` ~:103–118: no active snapshot, nothing served today → effective today) | — |
| Evidence files read | `peer-rollout-evidence/production-apply/{backups,00-pre,01-preflight-summary,bundle-result,00-post,03-run-E,03-run-E-ruling,03-run-E8}`; `byok/a3-b14-evidence.md`, `byok/c10-b7-c17-evidence.md`, `byok/a-ids.json` (keys only); `test-project/13-cross-owner-probes.md`; checkpoints C-w20/21/23/24/25; HANDOFF rows 2026-11-04 08:30 → 2026-11-06 21:45 UTC | — |

I could not independently query peer-test or production (no secrets by brief). A3, B14, C10, B7, C17 and the G4 rollout rest on the manager's recorded observations; I checked each against the committed procedure, the code paths it names, and the test suite.

## Theme A — source and report truth (16 units) — HEAD efcd536f

| Unit | Verdict | Evidence |
|---|---|---|
| A1 | PASS | Empty-source JSON → 0 model calls (`api/papers/report/route.test.ts`, green); live no-key W2; B14 run at 5efdce84 confirmed no call on empty abstract (server log) |
| A2 | PASS | NDJSON incl. failed deep fallback → 0 calls (green) |
| A3 | PASS (was UNRUN) | Own-key deep report on `openalex:W7223556294` (no abstract) with attached invented PDF: gemini read full text, every claim with verbatim quote + section (`a3-b14-evidence.md`). D-BYOK-2 (inferred "What is new here" lines) seen at 5efdce84, fixed by `224d8695`; live re-check at 0dd0d9c6: 0 novelty lines, quotes intact. HEAD differs from 0dd0d9c6 only in the auth callback |
| A4 | PASS | `evidence.test.ts` green incl. new R-BYOK-2 cases (novelty without a cue-bearing corpus quote dropped and counted); live W7222962933 no prose |
| A5 | PASS | Provenance matches source on 3 papers (my GETs); legacy-cache fixtures green |
| A6 | PASS | Report cache v8 → v9 (`0dd0d9c6`), legacy keys removed by name only; fingerprint invalidation + unrelated-notes fixtures green |
| A7 | PASS | Live `abstractRetrieval` with 3 real attempts (my GET) |
| A8 | PASS | Live transient(429) / missing(200) / blocked(403) distinct, transient no-store (my GET) |
| A9 | PASS | `enrich.test.ts` green (fixture by nature) |
| A10 | PASS | Fixture bounds green; live meta 698 ms, 3 attempts |
| A11 | PASS | Live 403 → blocked, no paywallHost, readability unknown |
| A12 | PASS | Live blockedHost `sciencedirect.com` |
| A13 | PASS (real item) | `openalex:W7222962933` as above, identical W2→W26 |
| A14 | PASS (real item) | `arxiv:1706.03762` full 7 sentences, html, body 22, `y4obqh` |
| A15 | PASS (real item) | `openalex:W7204479535` full 11 sentences, fullText none, `lge7vj` |
| A16 | PASS | No abstract-required gate; seed admission only widens; unchanged |

Arithmetic: PASS 16, costs 0, UNRUN 0 → 100×(16−0)/16 = **100.00**. Fixture/code units 13/13; real items A13/A14/A15 3/3.

Residual (not costed): A3 observations from the 5efdce84 run — "What they found" listing a course page's exercises, and the proposal summary falling back to a method sentence (deliberate verbatim fallback, `evidence.ts`) — are model categorisation on a 1-page invented PDF, not untruthful. The novelty cue list is closed by design: a paper stating novelty in other words loses the line (omission, not invention).

## Theme B — upload and Notes usability (14 units) — HEAD efcd536f

| Unit | Verdict | Evidence |
|---|---|---|
| B1 | PASS | Exact label (Round 1 render; code untouched since) |
| B2 | PASS | Masthead entry on chrome pages; `/welcome` excluded by recorded ruling R-B2 (HANDOFF 07:57 UTC 11-04) |
| B3 | PASS | No duplicate home upload (unchanged) |
| B4 | PASS | `Upload full article PDF` visible (B13 and A3 runs re-used it) |
| B5 | PASS | Persistent entry through availability failure (unchanged) |
| B6 | PASS | Keyword clause only for readable text with ≥1 signal (`f30a1767`, tests green) |
| B7 | PASS (was UNRUN) | Second account B on peer-test: 9 upload probes × A's standalone + attached PDFs all 404 private no-store (record, bytes, reading, figure, report, plain, explain, paragraph guide, DELETE); own list / attachment lookup 200 with no A data; positive control A U1–U3 = 200 before and after; A's uploads intact after B's DELETE attempts (`c10-b7-c17-evidence.md`). Matches procedure 13's expected codes and the owner-filter code it cites. Not run: U12 staged-name claim (covered by `upload-store.bucket.test.ts` "reads a staged PDF back only for its own owner"), optional direct RLS/storage block, before/after `13-cross-owner-verify.sql` (replaced by A-side 200 checks) |
| B8 | PASS | `notes` → existing collection (unchanged) |
| B9 | PASS | Notes actions incl. rename; archive excluded per ruling 24 |
| B10 | PASS | `+ New note` reachable |
| B11 | PASS | Desktop walk (unchanged) |
| B12 | PASS | 320 px walk (unchanged) |
| B13 | PASS | Signed-in attachment success (Round 2 evidence); "hosted" = production build + isolated peer-test per recorded ruling R-H4 |
| B14 | PASS (was UNRUN) | Standalone invented canopy PDF → own-key deep report from full text, verbatim quotes (`a3-b14-evidence.md`). D-BYOK-1 (switch off → empty report + false "Your model could not finish") at 5efdce84 fixed by `8c987c69`/`fd79aac2`; live re-check at 0dd0d9c6 with the switch OFF: deep report requested and written, no "could not finish", only v9 cache; D-BYOK-2 also fixed there (0 novelty lines). Hook tests (`use-model-report.asked.test.ts` (a)–(e)) green in my run |

Arithmetic: PASS 14, costs 0, UNRUN 0 → 100×(14−0)/14 = **100.00**. Rendered units (B1–B6, B8–B12) 11/11; hosted-workflow units (B7, B13, B14) 3/3.

## Theme C — Seed Paper Pool (18 units) — HEAD efcd536f

| Unit | Verdict | Evidence |
|---|---|---|
| C1 | PASS | Max-5 live refusals, copy, server cap (Round 1; `seed_pool_apply` `too_many`) |
| C2 | PASS | Profile active/pending/effective date/add-remove-replace-undo (Round 1; re-used in C10/C16 runs) |
| C3 | PASS (was FAIL 0.25) | W20 `holdsVerb` filter + version 15, W21 condition phrases, W23 edge pointer words. My HEAD probe: no facet holds an inner verb or edge pointer word (list above); manager's hosted Profile at 7659fed9 shows the same labels (HANDOFF 08:43 UTC 11-04). `maintained capacity` kept on purpose as adjective + noun (W20) — reads as a phrase, not costed. Blank PDF → no seed |
| C4 | PASS | Per-seed scoring, nearest ≤ 2, `x-both` canopy 0.523 / battery 0.505 (my probe) |
| C5 | PASS | Duplicate copies equal both, distinct canonical (my probe); live exact-byte dedupe (Round 1) |
| C6 | PASS | Run c top-10 after diversify battery 4 / canopy 4 / none 2 (my probe). Thin margin: `c-topic` 0.321 vs the 0.3 bar |
| C7 | PASS | 40/35/15/10, recompute maxAbsErr 0; exclusion and negative feedback still win (my probe) |
| C8 | PASS | No feedback → intent reallocation, no penalty (run d, `feedbackNullCount` all rows) |
| C9 | PASS | No-seed and unusable-seed identical to merge-base (my probe) |
| C10 | PASS (was UNRUN) | Fresh account B, never served (no batch, `/api/briefings` empty): first pool → `effectiveLocalDate 2026-11-06` = owner-local today, pending null, UI "Active today" (`c10-b7-c17-evidence.md`). Matches `seed_pool_apply` first-pool branch. Residual: B's first rendered briefing was not opened; that the briefing uses the in-force pool rests on C13 parity |
| C11 | PASS | Next-date activation, R-C11 real-PG cases (Round 1); unchanged |
| C12 | PASS | Latest-pending + undo (Round 1); unchanged |
| C13 | PASS | peer-test web/email/batch parity (`c13-parity-evidence.md`); residuals as Round 2 (no real email transport, order 2 fixture-only) |
| C14 | PASS | Ledger unchanged across edits, 0 feedback events (Round 1) |
| C15 | PASS | Aged-fixture retention with real purge job (`c15-retention-evidence.md`) |
| C16 | PASS | In-app forget → asset/features/object/snapshots/derived caches cleared (`c16-forget-evidence.md`) |
| C17 | PASS (was UNRUN) | Cross-owner: forget A's seeds 404 ×2, put A's seed into B's pool 400 `invalid_seed`, own editor lists only B, ack a non-B batch 404, leak checks false; same bytes → distinct assets per owner, and after B forgot its copy A's canopy seed stayed ready/active (procedure 13 step 6). Uploads/read/delete as B7. Jobs are operator-secret routes (401 covered earlier). Not run: S3 staged-name claim (unit-tested), optional RLS block; F1 used "a non-B batch id" — the record does not say it was A's own batch id, so batch cross-owner rests on the owner-filtered `getBatchById` and its tests |
| C18 | PASS | 0/71 seed reasons with a verb fragment, 0 ungrounded, 0 non-admitting (my probe). Residual: 7 reasons keep the clunky "the terms …" form — truthful, not costed |

Arithmetic: PASS 18, costs 0, UNRUN 0 → 100×(18−0)/18 = **100.00**.

## Summary (HEAD efcd536f)

| Theme | Units | PASS | Costs | UNRUN | Score | Target |
|---|---|---|---|---|---|---|
| A | 16 | 16 | 0 | 0 | 100×16/16 = **100.00** | 97.9 |
| B | 14 | 14 | 0 | 0 | 100×14/14 = **100.00** | 97.9 |
| C | 18 | 18 | 0 | 0 | 100×18/18 = **100.00** | 97.9 |

Round 1 → Round 2 → Round 3: A 93.75 → 93.75 → 100; B 69.64 → 85.71 → 100; C 58.33 → 81.94 → 100. This is the **first** round at target in every theme. A second consecutive independent round at ≥ 97.9 is still needed.

## Production (b2903d5 = 5efdce84 code) — where it differs

The 8 HEAD commits are not deployed (user approved the push at 21:45 UTC; not yet deployed when I scored). Scored against production code:

| Unit | Production verdict | Mechanism |
|---|---|---|
| A3 | FAIL (0.5, misleading) | D-BYOK-2: `verifyReportEvidence` at 5efdce84 never checks `keyResults[].novelty`, and `newHere` only needs its own text in the corpus, so the model's inferred "What is new here" lines show on full-text deep reports (seen live in the A3 run) |
| B14 | FAIL (0.5, misleading) | D-BYOK-1: `deepReportRequested` at 5efdce84 ignores `upload:` ids, so with Deep report off a standalone upload gets the abstract tier → `emptyReport` with no call, and the hook reads `tier1` as a model failure → "Your model could not finish" (false). With the switch on the report works, but carries D-BYOK-2 |
| others | same as HEAD | callback fix: no production effect (see below); `/privacy` sentence is accuracy copy for R-BYOK-1, only needed once R-BYOK-1 ships |

Production arithmetic: A 100×(15−0.5)/16 = **90.63**; B 100×(13−0.5)/14 = **89.29**; C **100.00**. Production also lacks a signed-in upload/attachment/forget run on peer.homes itself (all hosted runs are on peer-test per R-H4); the G-stage smoke was anonymous plus the owner's own sign-in to Today/Profile.

## Sign-in callback defect (`efcd536f`) — judgement

- Mechanism: before the fix, in any non-development build with an `x-forwarded-host` header the callback redirected to `https://<forwardedHost>`. A local `next start` forwards `localhost:3000` with proto `http`, so sign-in landed on `https://localhost:3000` (ERR_SSL_PROTOCOL_ERROR); the session cookie was already set.
- Production: **not affected.** peer.homes is https on Vercel, whose proxy forwards `https`; the old hard-coded https was correct there. It only broke the http production-mode test target (and cost the B session its first page load in the C10 run, which did not affect the C10 result).
- Fix complete for its purpose: uses the first `x-forwarded-proto` value only when it is exactly `http` or `https`, else keeps https; dev path unchanged; the other forwarded-host users (`dispatch-digests`, `confirm-email`, `send-test-email`, `test-digest`) already honour proto. Tests: http → `http://localhost:3000/profile`, https proxy → https, unknown scheme → https (green in my run). Manager's live re-check: A landed on `http://localhost:3000/welcome?step=account`.
- Note: that landing (an existing account sent to `/welcome?step=account`) is the returning-account walkthrough issue the user reported at 21:45 UTC (W27, R-ONB-1). It is not caused by `efcd536f` and no rubric unit covers it; I did not cost it.

## Ruling R-E6a — judgement: sound

- The failing key `no_carriage_return_in_any_public_function_body` (`prod-rollout/03-post-apply-readonly.sql:149-150`) scans every `public` function, wider than its purpose (catching a CRLF-pasted bundle).
- Bundle innocence holds: the canonical bundle file is sha `a7878bf3…` (= manifest = in-page E3 hash), 0 CR, 0 mentions of `handle_new_user` (my check); E3 in-page count 0 CR; the diagnostic names `handle_new_user/0` (7 CR) as the only CR function, pre-existing and untouched; peer-test's LF baseline explains why D0 could not see it. A CR inside a plpgsql body is harmless. Leaving the auth trigger untouched is the right call.
- Every other required key (20/21), all 9 production-required keys and `before_new_code.all_true` are true in `03-run-E.json`; E8 repeats only that key.
- Caveats: (1) the narrowing of the 03 check is still not committed — at HEAD it still scans all public functions, so every future run shows the same false key; (2) there is no stored per-function CR list for the 19 bundle functions, only the diagnostic sentence; (3) RUNBOOK §evidence lists `03-run-G.json`, `smoke.json`, `profile-version.png` and `03-run-E8.json`, none of which are in `production-apply/` (E8 is a .txt; G evidence is HANDOFF prose only).

## Hard-requirement gates

| Gate | HEAD efcd536f | Production b2903d5 |
|---|---|---|
| Source honesty | PASS — B6 fixed, seed reasons grounded, "could not finish" only after a real model call | **OPEN** — D-BYOK-1 false failure line for own-key standalone uploads |
| Authentication | PASS — production-mode refusals (Round 1), callback fix keeps the scheme only for http/https, production smoke 401s | PASS |
| Ownership | PASS — 26/26 cross-owner probes, A unchanged after B's attempts, same-bytes seeds separate; residual: optional RLS block and U12/S3 not run in app (unit-tested) | PASS (same code; run on peer-test, not peer.homes) |
| No private shared state | PASS — private no-store on every probe; report cache per browser; derived caches cleared on forget | PASS |
| No unsupported model generation | PASS — novelty lines need a corpus quote that states novelty; live re-check 0 such lines | **FAIL** — D-BYOK-2 inferred novelty lines on own-key deep reports |

## What would close each remaining cost

1. **Production A3 (0.5) and B14 (0.5), and the two production gates** — push and deploy the 8 commits (`8c987c69 … efcd536f`), then on peer.homes confirm the profile version line shows the new sha and re-run one own-key standalone deep report with Deep report off: no "could not finish", no "What is new here" line without a stated-novelty quote.
2. **Round 4 (second consecutive independent round)** — score again after the deploy, ideally with one signed-in production check of B13/B14 on peer.homes, so the two-round target closes on the shipped build.
3. **Not costed, worth closing** — commit the narrowed 03 CR check (R-E6a follow-up); save the missing G-stage evidence files the RUNBOOK lists; record the batch id used in F1 (or re-run F1 with A's real batch id); optionally run procedure 13's RLS block and U12/S3; open B's first briefing once to observe C10 end-to-end.
