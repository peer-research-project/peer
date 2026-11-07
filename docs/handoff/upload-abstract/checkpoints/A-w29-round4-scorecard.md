# W29 — Independent A scorecard, Round 4 (2026-11-06)

Reviewer: W29 A-role, brief `briefs/W29-ROUND4.md`. Independent: wrote none of the code and none of Rounds 1–3; every verdict below re-judged from the evidence files, the code at HEAD, and my own runs. Measure only: no product code edited, no commit/push/branch, no browser, no server started, no env file read, no secret printed. Branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, **HEAD scored `0ec6224220bad582a9388155e7439995e6c7ffc7`** (working tree: only untracked `HANDOFF-CLAUDE-PEER-ROLLOUT.md`, briefs W28/W29). Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w29/`.

Production check: `git diff --quiet d2023e7b 0ec62242` → **trees identical** (merge commit of PR #42 present locally). HANDOFF 23:27 UTC row records Vercel production deployment of d2023e7 and the profile version line "Peer 0.45.0·d2023e7" (manager observation; I made no request to peer.homes). So production code = HEAD code; every verdict below holds for production unless marked.

Delta since Round 3 (efcd536f): 6 commits `598db011 14ec4789 aa23f596 91f43588 fc2944d1 0ec62242` (W27, R-ONB-1), touching only `store/profile.ts`, `lib/profile/first-visit.ts`, `components/profile-sync.tsx`, `components/first-run.tsx`, `app/welcome/page.tsx` and their tests, plus the checkpoint. No seed, report, source, upload, Notes, auth-route or API file changed.

## Own checks run at HEAD 0ec62242

| Check | Result | Log |
|---|---|---|
| Full `npx vitest run` (main checkout `web/`) | EXIT 0: 635 files passed / 2 skipped; **11,598 tests passed** / 2 skipped; 0 failures (= manager's 0ec62242 gate and the W27 checkpoint; +27 over Round 3's 11,571 = W27's new tests) | `peer-claude-w29/full-vitest.log` |
| `npx tsc --noEmit -p .` | EXIT 0, no output | `peer-claude-w29/tsc.log` |
| Seed probe (W26 copy, re-rooted, pointed at HEAD `web/`) | 2/2 pass; fetch 0, model 0. Summary **byte-identical** to Round 3 apart from the header: canopy topic `water retention, forest canopy water, denser foliage, leaf canopy density, canopy moisture, fictional trees, leaf area`, method `field sensors, optical imaging`; battery topic `cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity`, object `battery electrolyte stability, electrolyte concentration`, method `impedance spectroscopy`; blank → null. 71 seed reasons: verb-fragment 0, ungrounded 0, non-admitting 0, "the terms" form 7. No-seed identity head-vs-merge-base true, unusable-vs-none true. Run c top-10 after diversify: battery 4 (b-intent, b-variant, b-full, f-twin) / canopy 4 (x-both, c-topic, d-oa, d-arxiv) / none 2; `c-topic` canopy 0.321; duplicates `fRowsEqualC` true, nearest ≤ 2 distinct canonical; exclusion false in all 6 runs; weight maxAbsRecomputeErr 0; mix 0.40/0.35/0.15/0.10, no-feedback intent 0.50; f-neg penalty 0.677 | `peer-claude-w29/probe/{probe.log,summary-head.txt,out/rank-probe-report.json}` |
| Public GETs to localhost:3000 (no cookie, 1 per endpoint per paper) | W7222962933 meta 200 no-store, retrieval transient [S2 429 transient, Crossref 200 missing, publisher 403 blocked], 752 ms; reading abstract none / fullText blocked / blockedHost sciencedirect.com / body 0 / readability unknown. arXiv 1706.03762 200/200 public, summary 1136 chars, abstract full 7 sentences, html, body 22, `y4obqh`, readable. W7204479535 200/200 public, summary 2024 chars, abstract full 11 sentences, fullText none, body 0, `lge7vj`, readability abstract. Identical to W2/W6/W10/W19/W26 | `peer-claude-w29/public-head.json` |
| Bundle file | `sql-runtime/seed-closure-canonical-lf.sql` sha256 `a7878bf3…215120a1b` (= RUNBOOK E3 = bundle-result.txt in-page hash), 0 CR, 0 `handle_new_user` | — |
| `03-run-E.json` false keys (walked every key) | only `required.no_carriage_return_in_any_public_function_body` and the derived `all_required_pass` | — |
| Code reads (unchanged since efcd536f, re-read) | `route.ts:237` empty `fullAbstract` → `emptyReport` before provider; `evidence.ts:403-440` novelty / newHere kept only with a corpus entry that matches `NOVELTY_CUES`, else dropped+counted; `use-model-report.ts:31-33` v9 key, v3–v8 legacy by name; `:273-279` `deepReportRequested` counts `upload:` ids and still needs `aiMode !== "none"`; callback `route.ts:38-51` scheme = first `x-forwarded-proto` only if http/https else https; `dispatch-digests`/`confirm-email` already honour proto | — |
| W27 diff (`18308d0f..0ec62242`) | read in full; see W27 judgement below | — |
| Evidence files read | C-w27 checkpoint; `byok/c10-b7-c17-evidence.md` (incl. W27 section), `byok/a3-b14-evidence.md`; `production-apply/{00-pre,01-preflight-summary,bundle-result,00-post.json,03-run-E.json,03-run-E-ruling,03-run-E8}`; `test-project/{c13-parity,c15-retention,c16-forget}-evidence.md`; `b13/b13-attach-success-evidence.md`; HANDOFF rows 2026-11-04 07:57 (R-H4, R-B2) and 2026-11-06 21:33 → 2026-11-07 23:27 UTC; RUNBOOK E6 R-E6a note | — |

I could not query peer-test or production myself (no secrets, no browser). A3, B13, B14, B7, C10, C13, C15, C16, C17, the G4 rollout, the PR #42 deploy and the W27 live checks rest on the manager's/owner's recorded observations; I checked each against the code paths it names, the committed procedure where one exists, and the green test suite.

## W27 (R-ONB-1) judgement — no privacy or ownership regression

- **What it does.** (1) `logOut()` (`store/profile.ts:785-793`) still resets the profile, `lastSynced` and `syncedAccountId` exactly as before (the /privacy source pins still match), then puts back `welcomeSkipped: true` if it was set. (2) At the sign-in pull, `isReturningAccountSignIn(previousOwner, userId, remote)` (`lib/profile/first-visit.ts:111-118`) is true only when the device had not already confirmed this user AND the account's own fetched row (before this session's push) has a topic, project or challenge; ProfileSync then raises `returningAccount` (`profile-sync.tsx:994-995`); FirstRunGate on `/welcome` stamps `onboardedAt` and `router.replace("/")` once (`first-run.tsx:120-137`); sign-out clears the signal (`profile-sync.tsx:889`).
- **Privacy.** `welcomeSkipped` is one device boolean ("the walkthrough was shown in this browser"). It has no server column — `grep` finds it in no sync, merge, or `profilePatchToRow` path, and `reconcilePushPayload`'s comment lists column-less fields as never written. It carries none of the reader's saved or opened data, so /privacy's "Signing out clears this browser's copy" (`app/privacy/page.tsx:32`, about what the reader "saved and opened") stays true. Keys, topics, ledger, standing questions and owner id are still wiped on sign-out (pinned tests green). **No regression.**
- **Ownership.** The returning-account decision reads only the signed-in user's own row, fetched with their session; nothing about one account is shown to another. On an account switch `previousOwner` is the other id, so the arrival is treated as new, and the existing switch wipe still runs first. **No regression.**
- **Side effects (not costed, no rubric unit):** (a) on a shared browser, after A signs out, a brand-new person B arriving at `/` is no longer auto-sent to the walkthrough (the flag is per browser, not per person); B can still open it from the app. (b) A set-up account that signs in from the walkthrough's Seed step is taken to `/` and adds seeds from Profile instead; a brand-new account's onboarding seed step (C1) is unaffected. (c) Live evidence is the manager's sign-out observation (rule 3) and the owner's own words for rule 1; no recorded network trace.

## Theme A — source and report truth (16 units) — HEAD 0ec62242 (= production d2023e7)

| Unit | Verdict | Evidence |
|---|---|---|
| A1 | PASS | `route.ts:237` returns `emptyReport` on an empty abstract before any provider call; JSON route tests green; B14 run at 5efdce84 recorded no server-side model call on the empty-abstract tier |
| A2 | PASS | NDJSON incl. failed deep fallback → 0 calls (route/stream tests green in my full run) |
| A3 | PASS | Own-key deep report on `openalex:W7223556294` (no abstract) + attached invented PDF: full-text read, every claim with verbatim quote + section; D-BYOK-2 re-check at 0dd0d9c6: 0 novelty lines (`a3-b14-evidence.md`). Report code unchanged 0dd0d9c6 → HEAD |
| A4 | PASS | `evidence.ts:403-440` drops every `newHere` line and `keyResults[].novelty` without a cue-bearing corpus quote; summary falls back to a verbatim method sentence; tests green; live W7222962933 shows no prose |
| A5 | PASS | Provenance matches the source on all 3 papers (my GETs); legacy-cache fixtures green |
| A6 | PASS | Client cache key v9, v3–v8 removed by name only (`use-model-report.ts:31-33`); fingerprint invalidation and unrelated-notes fixtures green |
| A7 | PASS | Live `abstractRetrieval` with 3 real attempts (my GET) |
| A8 | PASS | Live transient (429) / missing (200) / blocked (403) distinct; transient no-store (my GET) |
| A9 | PASS | `enrich.test.ts` green (fixture by nature) |
| A10 | PASS | Bound tests green; live meta 752 ms, 3 attempts |
| A11 | PASS | Live 403 → blocked, no paywallHost, readability unknown |
| A12 | PASS | Live blockedHost `sciencedirect.com` |
| A13 | PASS (real item) | `openalex:W7222962933` as above, identical W2 → W29 |
| A14 | PASS (real item) | `arxiv:1706.03762` full 7 sentences, html, body 22, `y4obqh` |
| A15 | PASS (real item) | `openalex:W7204479535` full 11 sentences, fullText none, `lge7vj` |
| A16 | PASS | No abstract-required gate added; seed admission only widens; no-seed ranking identical to merge-base (probe) |

Arithmetic: PASS 16, costs 0, UNRUN 0 → 100×(16−0)/16 = **100.00**. Fixture/code units 13/13; real items A13 / A14 / A15 each PASS (3/3).

## Theme B — upload and Notes usability (14 units) — HEAD 0ec62242 (= production d2023e7)

| Unit | Verdict | Evidence |
|---|---|---|
| B1 | PASS | Exact label in `components/briefing/upload-button.tsx` (Round 1 render; file untouched since) |
| B2 | PASS | Masthead entry on chrome pages; `/welcome` excluded by ruling R-B2 (HANDOFF 07:57 UTC 11-04); W27 changes no masthead file |
| B3 | PASS | No duplicate home upload (unchanged) |
| B4 | PASS | `Upload full article PDF` in `components/reader/decision-block.tsx`; used in the B13 and A3 runs |
| B5 | PASS | Persistent entry through availability failure (unchanged) |
| B6 | PASS | Keyword clause only for readable text with ≥1 signal (`f30a1767`, tests green) |
| B7 | PASS | Second account B on peer-test: 9 probes × A's standalone and attached PDFs all 404 private no-store, own list/attachment lookup 200 with no A data, A's U1–U3 200 before and after (`c10-b7-c17-evidence.md`). Not run: U12 staged-name (unit-tested), optional RLS/storage block |
| B8 | PASS | `notes` opens the existing collection (unchanged) |
| B9 | PASS | Rename/duplicate/export/delete; archive excluded per ruling 24 |
| B10 | PASS | `+ New note` reachable (unchanged) |
| B11 | PASS | Desktop walk (Round 1/2; paper page touched only by W24's report-trigger logic, no layout change) |
| B12 | PASS | 320 px walk (same) |
| B13 | PASS | Signed-in attachment success on the production build + peer-test (`b13-attach-success-evidence.md`), "hosted" per ruling R-H4 |
| B14 | PASS | Standalone invented PDF → own-key deep report from full text with verbatim quotes; D-BYOK-1 re-check at 0dd0d9c6 with Deep report OFF: report requested and written, no "could not finish", only v9 cache (`a3-b14-evidence.md`); hook tests (a)–(e) green |

Arithmetic: PASS 14, costs 0, UNRUN 0 → 100×(14−0)/14 = **100.00**. Rendered units (B1–B6, B8–B12) 11/11; hosted-workflow units (B7, B13, B14) 3/3.

## Theme C — Seed Paper Pool (18 units) — HEAD 0ec62242 (= production d2023e7)

| Unit | Verdict | Evidence |
|---|---|---|
| C1 | PASS | Max-5 refusals, copy and server `too_many` (Round 1); W27 leaves a brand-new account's onboarding seed step unchanged |
| C2 | PASS | Profile active/pending/effective date/add-remove-replace-undo (Round 1; re-used in C10/C16 runs) |
| C3 | PASS | My HEAD probe: no facet holds an inner verb or edge pointer word (labels above); blank PDF → no seed; probe made 0 fetch / 0 model calls. `maintained capacity` (adjective + noun) reads as a phrase |
| C4 | PASS | Per-seed scoring, nearest ≤ 2; `x-both` canopy 0.523 / battery 0.505 (my probe) |
| C5 | PASS | Duplicate copies equal both, distinct canonical in nearest (my probe); exact-byte dedupe live (Round 1) |
| C6 | PASS | Run c top-10 after diversify battery 4 / canopy 4 / none 2 (my probe). Thin margin: `c-topic` 0.321 vs the 0.3 bar |
| C7 | PASS | 40/35/15/10 calibration, recompute maxAbsErr 0; exclusion and negative feedback still win (my probe) |
| C8 | PASS | No feedback → intent 0.50, no penalty (`feedbackNullCount` = rows) |
| C9 | PASS | No-seed and unusable-seed identical to merge-base, 0 mix calls (my probe) |
| C10 | PASS | Fresh account B, never served: first pool → `effectiveLocalDate 2026-11-06` = owner-local today, pending null, UI "Active today" (`c10-b7-c17-evidence.md`). Residual: B's first rendered briefing not opened |
| C11 | PASS | Next-date activation incl. DST/timezone real-PG cases (Round 1); seed code unchanged |
| C12 | PASS | Latest-pending + undo (Round 1); unchanged |
| C13 | PASS | peer-test order 1: web replay = batch f77650f3 same 10 ids/order; 11 verify checks true (`c13-parity-evidence.md`). Residuals: no real email transport, order 2 fixture-only |
| C14 | PASS | Ledger unchanged across edits, 0 feedback events (Round 1) |
| C15 | PASS | Aged-fixture 31 days + real purge job: active seed kept (md5 unchanged), orphan swept, ordinary upload purged (`c15-retention-evidence.md`) |
| C16 | PASS | In-app forget → asset/features/object/snapshots/batch/cache cleared, reading library kept, revision/generation +1 (`c16-forget-evidence.md`) |
| C17 | PASS | Cross-owner seed probes 404/400/own-only, leak checks false; same bytes → distinct assets; A's seed intact after B forgot its copy (`c10-b7-c17-evidence.md`). W27 reads only the signed-in user's own row. Residual: F1 used "a non-B batch id", not recorded as A's own |
| C18 | PASS | 0/71 seed reasons with a verb fragment, 0 ungrounded, 0 non-admitting (my probe). 7 clunky "the terms …" reasons — truthful, not costed |

Arithmetic: PASS 18, costs 0, UNRUN 0 → 100×(18−0)/18 = **100.00**.

## Summary (HEAD 0ec62242 = production d2023e7)

| Theme | Units | PASS | Costs | UNRUN | Score | Target |
|---|---|---|---|---|---|---|
| A | 16 | 16 | 0 | 0 | 100×(16−0)/16 = **100.00** | 97.9 |
| B | 14 | 14 | 0 | 0 | 100×(14−0)/14 = **100.00** | 97.9 |
| C | 18 | 18 | 0 | 0 | 100×(18−0)/18 = **100.00** | 97.9 |

History: Round 1 → 2 → 3 → 4: A 93.75 → 93.75 → 100 → **100**; B 69.64 → 85.71 → 100 → **100**; C 58.33 → 81.94 → 100 → **100**. Round 3 (efcd536f) and Round 4 (0ec62242) are **two consecutive independent rounds at or above 97.9 in every theme**. Production now carries the same code, so unlike Round 3 there is no production-only deficit (Round 3's production A 90.63 / B 89.29 closed by the d2023e7 deploy).

## Sign-in callback (`efcd536f`) — judgement (re-checked)

- Production was **not affected**: peer.homes is https behind Vercel, whose proxy forwards `https`; the old hard-coded https was correct there. Only the http production-mode test target broke (ERR_SSL_PROTOCOL_ERROR after the session cookie was set).
- Fix **complete** for its purpose: first `x-forwarded-proto` value used only when exactly http/https, else https; development path unchanged; the other forwarded-host users already honour proto; `next` still passes `safeReturnPath`. Callback tests green; live landing `http://localhost:3000/...` recorded.

## Ruling R-E6a — judgement: sound (re-checked)

- The only false required key in `03-run-E.json` is `no_carriage_return_in_any_public_function_body` (plus the derived `all_required_pass`); all production-required keys and `before_new_code.all_true` true.
- The bundle cannot be the cause: file sha `a7878bf3…` = in-page E3 hash, 0 CR, never names `handle_new_user`; the diagnostic names only the pre-existing `handle_new_user/0`. A CR inside a plpgsql body is harmless; not editing the auth trigger is right.
- Now recorded in RUNBOOK E6 with an exact read-only diagnostic and a STOP rule if any other function appears. Remaining caveat: the 03 check itself still scans every public function (by design, kept byte-equal to 08), and no per-function CR list for the 19 bundle functions is stored.

## Hard-requirement gates (HEAD 0ec62242 = production d2023e7)

| Gate | Verdict | Basis |
|---|---|---|
| Source honesty | PASS | "could not finish" only after a real model call; keyword clause only with signals; seed reasons grounded 71/71; provenance matches source on 3 live papers |
| Authentication | PASS | Production-mode refusals (Round 1); production anonymous smoke 401s at d2023e7 (manager record); callback keeps scheme only for http/https; W27 adds no route |
| Ownership | PASS | 26/26 cross-owner probes, A unchanged after B's attempts, same-bytes seeds separate; W27 reads only the signed-in user's own row. Residual: optional RLS block, U12/S3 in-app not run (unit-tested) |
| No private shared state | PASS | Private no-store on every probe; report cache per browser; derived caches cleared on forget; W27's surviving flag is one non-reader boolean with no server column |
| No unsupported model generation | PASS | Novelty lines require a cue-bearing corpus quote; live re-check 0 such lines; no model call on empty sources |

## FAIL / UNRUN units

None. 0 FAIL, 0 UNRUN in all three themes.

## What would close each remaining residual (none costed)

1. **Signed-in check on peer.homes itself at d2023e7** — every signed-in workflow (B13, B14, B7, C10, C13, C15, C16, C17) ran on the production build against peer-test (ruling R-H4); the d2023e7 smoke was anonymous. One owner sign-in on peer.homes opening an uploaded PDF and a Profile seed card would tie the rulings to the shipped host.
2. **W27 live evidence** — record a network/console trace for rule 1 (sign-in on `/welcome?step=account` → replace to `/`) rather than the owner's words alone; optionally decide whether the shared-browser case (new person after a sign-out skips the auto-walkthrough) is acceptable.
3. **C17 F1** — re-run the batch-ack probe with A's real batch id, or record which id was used.
4. **C10 end-to-end** — open B's first briefing once.
5. **R-E6a follow-up** — store a per-function CR count for the 19 bundle functions, and save the RUNBOOK's listed G-stage files (`03-run-G.json`, `smoke.json`, `profile-version.png`) that are not in `production-apply/`.
6. **Procedure 13 optional blocks** — RLS/storage direct block and U12/S3 staged-name claims in app.
