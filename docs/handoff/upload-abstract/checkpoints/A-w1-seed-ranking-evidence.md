# A W1 — seed ranking instrumented evidence (Theme C units C3–C9, C18)

2026-11-03 local (brief W1-G8-RANK). Branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`, HEAD `71d0c3f806f4bab765ec3da1af74f2f37da46b8c`. Measure-only: no edit under `web/src` or `web/supabase`, no commit/branch/push, no network, no model call, no Supabase, no `.env` read. All candidates and both seed PDFs are invented. Independent of the C author of the seed scorer. Local evidence only: not hosted, not UI, not an independent-round score.

## Method and reproduction

- Probe folder `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w1/` (SHA-256): `vitest.w1.config.ts` 9743fb3d…, `candidates.ts` 4c7f23c6…, `extract.probe.test.ts` 4e412034…, `rank.probe.test.ts` 47a964c6…, `pipeline.probe.test.ts` be7b4314…, `legacy-combine.mergebase.ts` ab97c2d0… and `legacy-pipeline.mergebase.ts` cd50d7d5… (merge-base `a2575ddb` files from `git show`, relative imports rewritten to `@/` aliases only).
- Command (from `web/`): `npx vitest run --config "C:/Users/wbc13/AppData/Local/Temp/peer-claude-w1/vitest.w1.config.ts"` → 3 files / 3 tests passed (`all-probes.log`). Outputs: `extract-dump.json`, `rank-probe-report.json` (4036873a…), `rank-probe-summary.txt`, `pipeline-probe-report.json` (47a63c4b…). `rank-probe-report.run1.json` is the first run, before `x-both` and the positive-feedback tags were added; it is kept as is.
- The real code paths: `extractPdfTextFromBytes` → `seedFromExtractedDocument` (fixtures `fictional-canopy.pdf` 7debdfb4…, `fictional-battery.pdf` 0b98ec96…, `blank-no-text.pdf` 0d812aa5…); `scoreItems` (combine.ts); `runFeedPipeline` with `bySourceId.openalex/arxiv.fetch` replaced by in-memory invented items.
- Instrumentation used passthrough `vi.mock` wrappers that record each call and return the real result. They cover `mixSeedScore` (the actual 4 arguments and the return value per item), `strongestSeedMatches` (the nearest list per candidate) and `scoreTfidf` (the per-facet raw TF-IDF inside `matchSeed`). `scorePreferenceMatch` is wrapped only to tag the current item. Tripwires: global `fetch` stub that throws; `resolveProvider`, `applyTier2Rerank` and `callJevDirect` replaced by counters that throw. Result in every run: fetch calls 0 and model calls 0, including a seeded `aiTier: 2` pipeline request.
- Candidate set: 24 items. They cover matched topic (`c-topic`, `c-variant` with plural/word-order variants, `c-moisture`, `c-pos`), battery matches (`b-full`, `b-variant`, `b-intent`, `b-cycling`, `b-pos`) and method-only items (`m-method`, `m-method2`). Unrelated negatives: `n-galaxy`, `n-llm`, `n-housing`, plus `n-generic`, a labour-economics paper written in research boilerplate. Also: a cross-source canonical duplicate `d-oa`/`d-arxiv` (same DOI 10.5555/fict.0001), the excluded `e-excluded` (exclusion term `plantation`), negative-feedback `f-neg` (ledger −2 on `ionic liquid`) with its twin `f-twin`, intent-only `i-batt` and `i-hydro`, `x-both` (matches both seeds) and `c-soil`. Base intent: Required `lithium battery`, `forest hydrology`.
- Runs: (a) no seed; (a2) a seed with no usable features; (b) canopy only; (b2) battery only; (c) both seeds with a negative-only ledger; (d) both seeds with no ledger; (e) both seeds with a positive ledger (`canopy hydrology` ×2, `impedance spectroscopy`, `remote sensing`, `zinc anode` ×2); (f) five seed copies (canopy, byte copy, canonical alias with a different hash, battery, battery id-copy); (g) both seeds with battery-only intent; (h) both seeds with no Required topics. Pipeline: merge-base legacy, no seed, unusable seed, both, duplicates, battery-only intent, and both with Tier 2 requested.

## Extracted seeds (actual)

- Canopy: topic-only, 12 phrases. They include `water retention`, `forest canopy water`, `canopy moisture`, `synthetic example denser`, `fictional trees`. Object and method are empty, although the body says "optical imaging and field sensors". The shared 12-phrase cap (`upload-concepts.ts:160-166`) was used up by topic n-grams.
- Battery: 9 topic phrases, including the generic `real experiment`, `synthetic example`, `test data`; 2 object phrases (`battery electrolyte stability`, `electrolyte concentration affects`); 1 method phrase (`impedance spectroscopy`).
- Blank: `no-text-layer`, seed `null`.

## Key numbers

- Facet weights, real `matchSeed` calibration: topic-only full match 0.5, object-only 0.3, method-only 0.2, all three 1.0. Topic diluted by 11 unmatched phrases: 0.105. For every candidate×seed pair with hits, `score == 0.5·topicRaw + 0.3·objectRaw + 0.2·methodRaw` to within 1e-9 (assertion in the probe).
- Blend: `mixSeedScore` unit calibration gives 0.4/0.35/0.15/0.1, and 0.5 for intent when feedback is null. Recomputing every instrumented call independently gives max abs error 0 in all seeded runs (b, c, d, e, f, g, h; 12–22 rows each). The intent argument always equals `(breakdown.keyword + breakdown.tfidf)/2`; the recency/source argument equals `(recency+source)/2`.
- Observed argument ranges in run c: seed [0, 0.697], intent [0, 0.541] (max 0.630 in g), recency/source [0.537, 0.918]. Std of the weighted contributions in c: seed 0.076, intent 0.105, recency/source 0.010.
- Strongest single-facet seed score per interest: battery `b-full` 0.697 (object 1.0, method 1.0). Canopy's best real match, `c-topic` ("Forest canopy water retention after rain…"), scores 0.233 (topic raw 0.465 × 0.5). This is below the 0.3 admission bar in `scoring.ts:68`.
- Negative control `n-generic` gets battery seed score 0.251 from topic hits `real experiment`, `synthetic example` and `test data`. That is higher than `c-topic`'s 0.233.

## Per-unit verdicts

| Unit | Verdict | Evidence |
|---|---|---|
| C3 | PASS (narrow) | Real extractor: canopy and battery readable and seeded; blank gives `no-text-layer` and `seed null`; fetch 0, model 0. Quality caveat, counted under C6/C18 rather than here: generic boilerplate phrases are kept as topic facets, and the 12-phrase cap crowds out object/method (canopy has none, despite "optical imaging"). |
| C4 | PASS | Each seed is scored separately; there is no averaged vector. The seed argument in run c equals the max single-seed run for 13/13 items (`separation`). `x-both` gets nearest = [battery 0.497, canopy 0.301] (2 distinct seeds), and the blend uses the top one only. Nearest length ≤ 2 in every run. |
| C5 | PASS | Five seed copies form 2 groups. Run f equals run c on 13/13 rows (seed arg and score identical), and in the pipeline duplicates == both (byte-identical ids/scores/reasons). Nearest lists never repeat a canonical key. Candidate cross-source duplicate: pipeline dedup 24→23, only `d-arxiv` survives. |
| C6 | FAIL — misleading 0.5 | The interests are represented very unevenly. Topic-only canopy is capped at 0.5 and diluted to 0.23–0.30. Run g (battery intent only): canopy seed-admitted = `d-oa`/`d-arxiv` only, which are one paper; `c-topic`, `c-variant`, `c-moisture` and `c-pos` are gated out. Battery admits 7 items. Pipeline top-10 for both seeds: battery 7, canopy 1 (`d-arxiv`), intent-only 2. Run h (no Required topics): the unrelated `n-generic` ranks #10, above `c-topic` (#11). `diversifySeedRanking` swaps only within a 0.03 band (1 swap in c), so it cannot compensate. Seeded output also skips the existing Tier-1 author/topic diversify (`pipeline.ts:2036`); all invented items share one author, and the seeded top-10 holds 8 of them. |
| C7 | FAIL — misleading 0.5 | Arithmetic is correct: 40/35/15/10 is applied exactly (error 0). Hard exclusion wins: `e-excluded` (canopy hits 0.209) is absent from all scoring runs and all 7 pipeline runs. Negative feedback wins: `f-neg` penalty ×0.677, 0.202 vs twin 0.302 in c; with no ledger in d, 0.299 vs 0.302. The defects are normalization and inspectability. The intent input uses raw TF-IDF cosine `tf` (`combine.ts:409`), not the pool-relative `topicality` that the legacy path uses for this exact reason (`types.ts:35-46`). So intent's ceiling is ~0.63 while seed's is 1.0. The seed component is not normalized over the facets a seed actually has (see C6). `ScoreBreakdown` (`combine.ts:412-419`) exposes no seed/intent/feedback components and still reports `topicality`, which the seeded score does not use. The weights cannot be inspected from output; it took instrumentation to verify them. |
| C8 | PASS | Run d: feedback null on 13/13 rows; intent weight 0.5; recompute error 0. Run c (negative-only history) is also null, so there is no zero-feedback penalty. Run e: any positive history switches every item to 0.35/0.15. Matched items rise (`c-topic` f=0.538, #8→#4; `b-full` f=0.334); unmatched items drop (`i-batt` 0.348→0.267). This is spec-consistent; flagged for a ruling only. |
| C9 | PASS | Scoring level: `scoreItems(…, [])` is deep-equal to merge-base `a2575ddb` `scoreItems`, and an unusable seed equals no seed, with 0 blend calls. Pipeline level: the no-seed output is byte-identical to the merge-base `runFeedPipeline` (ids, scores, reasons), and the unusable-seed snapshot equals no seed. |
| C18 | FAIL — misleading 0.5 | 75/75 seed reasons name phrases that are present in the candidate, so none is fabricated. But: (1) the unrelated `n-generic` gets "Shares real experiment and synthetic example with a seed paper." — a relationship drawn from boilerplate, against the spec's "never invent a scientific relationship". (2) 18/75 seed reasons are for matches that do not admit (e.g. `c-soil` 0.126), and they read like full matches. (3) 32/75 render non-contiguous words as `forest / canopy / water`. (4) 58/75 name two topic n-grams and skip stronger hits; `b-full`'s full object and method matches are not named (`combine.ts:425-427` takes `hits.slice(0,2)` in topic→object→method order). UI/portable surfaces were not exercised here (UNRUN part). |

Not scored here: C1, C2, C10–C17. C3/C18 UI states are UNRUN.

## B causes and candidate fixes (no fix made)

### C6 — seed similarity scale

**Causes:**
- `web/src/lib/seed-pool/scoring.ts:12-14`: absolute facet weights with no renormalization when a facet is empty.
- `scoring.ts:29-36`: all phrases of a facet are pooled into one TF-IDF vector, so 12 phrases dilute a single matched phrase to ~0.1–0.3.
- `scoring.ts:68`: absolute 0.3 admission bar.
- Contributing: `web/src/lib/preferences/upload-concepts.ts:104-131,160-166` (closed cue lists that are materials-centric; one shared 12-phrase cap).

**Candidate fixes:**
1. Renormalize the 50/30/20 weights over the facets the seed actually has. This mirrors the spec's own rule for missing feedback. About 5 lines in `matchSeed`, plus tests. Low cost; needs a manager ruling on how to read 50/30/20 when a facet is absent. Projected from the measured raw values (not run): `c-topic` 0.233→0.465, `c-variant` 0.256→0.512, `c-pos` 0.156→0.313 (all admitted); `c-moisture`/`c-soil` 0.251 (not admitted); `n-generic` unchanged (battery has all three facets).
2. Score each facet by its best-matching phrase, or by an IDF-weighted fraction of phrases matched, instead of one pooled vector. Medium cost: recalibrate the threshold and the tests.
3. Per-interest quota in `diversifySeedRanking`: at least one admitted item per active seed in top-N, plus restore the Tier-1 author cap on the seeded path. Medium cost; does not fix admission gating.

**Recommend 1, then re-run this probe; add 2 if canopy recall still trails.**

### C7 — normalization and inspectability

**Cause:** `web/src/lib/scoring/combine.ts:409` (raw `tf` in intent) and `:412-419` (no seed components in the breakdown).

**Candidate fixes:**
1. Use `tp` (topicality percentile) in place of `tf` in the intent argument. One line, low cost; seeded order changes, so re-run.
2. Add an optional seeded breakdown (`seed`, `intent`, `feedback|null`, `recencySource`, weights used) to `ScoreBreakdown`, and stop showing `topicality` as if it were used. Low–medium cost (types plus serializers/cache payload).
3. Min-max each component over the day's passed pool. Medium cost; scores become pool-dependent.

**Recommend 1 + 2.**

### C18 — reason grounding

**Cause:** `web/src/lib/scoring/combine.ts:425-427`, `web/src/lib/seed-pool/scoring.ts:37-42`; plus boilerplate kept by `upload-concepts.ts:97-102` (it rejects a phrase only when every token is generic).

**Candidate fixes:**
1. Emit a seed reason only when `admitsBySeed(match)` holds. Choose the most informative hits (contiguous first, object/method before topic n-grams, longer first), and render non-contiguous words as words, not slashes. Low cost.
2. Add a research-boilerplate phrase filter at seed creation in `seed-pool/features.ts` (e.g. phrases built only from real/experiment/synthetic/example/test/data/results/affects…), leaving ordinary-upload concepts unchanged. Low–medium cost.
3. Require an IDF/specificity floor for a phrase to appear in a reason. Medium cost.

**Recommend 1 + 2.** Fix 1 alone removes the `n-generic` reason (it does not admit: 0.251 < 0.3), but `n-generic` would still gain 0.4×0.251 in the blend until fix 2 or the C6 fix lands.

## Other observations for the manager (not scored)

- The seeded path disables Tier-1 author/topic diversify, the AI order replay, the preferred-journal boost, RRF, Jev and Tier 2 (`pipeline.ts:856,864,882,892,1286,2036-2043`). A seeded user's declared preferred journals then act only through the intent TF-IDF text. Rule whether this is acceptable under "preserve existing user constraints".
- In the no-seed pipeline run, the legacy pipeline returned 5 items, against 10 for seeded. This is legacy behaviour, identical to the merge base, and was not investigated further.
