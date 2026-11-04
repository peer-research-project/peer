# C W4 — seed ranking rulings R-C6, R-C6b, R-C7, R-C18 (Group 1 implementer)

2026-11-04 local (brief W4-C-SEED-RANK). Detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w4`, base `71d0c3f806f4bab765ec3da1af74f2f37da46b8c`. One commit per rule, author `peter14531453`. No push, no branch, no dependency, no network, no model call, no Supabase, no `.env` read, port 3000 unused, nothing under `web/src/components/notes/**` touched. All test and probe inputs are invented. Local evidence only: not hosted, not UI, not an independent-round score.

## Commits

| Rule | Commit | Files |
|---|---|---|
| R-C6 | `79618675` | `web/src/lib/seed-pool/scoring.ts`, `scoring.test.ts` |
| R-C6b | `53044991` | `web/src/lib/feed/pipeline.ts`, `web/src/lib/feed/rerank.ts`, new `web/src/lib/feed/pipeline.seed-constraints.test.ts` |
| R-C7 | `b440bb3c` | `web/src/lib/scoring/combine.ts`, `web/src/lib/scoring/types.ts`, `web/src/lib/seed-pool/scoring.ts`, `web/src/lib/scoring/seed-pool.test.ts`, `pipeline.seed-constraints.test.ts` (re-aim, see below) |
| R-C18 | `d6a8b24b` | `web/src/lib/scoring/combine.ts`, `web/src/lib/seed-pool/scoring.ts`, `web/src/lib/seed-pool/features.ts`, `features.test.ts`, `scoring.test.ts`, `web/src/lib/scoring/seed-pool.test.ts` |
| R-C6b test fix | `dfd063d5` | `pipeline.seed-constraints.test.ts` (author-cap fixture strengthened, see below) |
| checkpoint | this commit | this file |

## What changed

- **R-C6** — `matchSeed` divides each facet's 0.5/0.3/0.2 weight by the summed weight of the facets the seed actually has (a facet "has" terms after trim + folded tokenization). Topic-only → topic 1.0; topic+method → 0.5/0.7 and 0.2/0.7; a full seed is unchanged; a facetless seed still scores 0 (no division: the loop skips empty facets and `hits` is empty). The 0.3 admission bar is unchanged.
- **R-C6b** — the read path (`runFeedPipeline`) now applies `applyJournalBoost(aiRanked, req.venues)` on both paths, and the seeded path applies the per-author (2) / per-topic (3 or 4) cap through a new `applyDiversityCap` export (the existing `diversify`, without Tier 1's `localScore` boosts, so the seed blend stays the only score and no second seed weight is added). The cap runs last, after `diversifySeedRanking`, so the seed-interest swap cannot undo it. Hard exclusions and negative feedback are applied inside `scoreItems` and still win. The pool-build paths (`pipeline.ts:856/1286`) were not changed: their order only decides pool membership and every read rescores.
- **R-C7** — the seed blend's intent input is `((kw.score + tp) / 2) * senseContextPenalty`, where `tp` is the existing pool percentile (`topicality`) used by the no-seed ranking, replacing the raw cosine `tf`. `ScoreBreakdown.seedBlend?` (new, optional, only when a usable seed scored) carries `seed`, `intent`, `feedback|null`, `recencySource`, `weights`, `blended`, `preferencePenalty` and `seedFacets` (facet labels only). A test asserts no seed phrase appears in it. `seedBlendWeights()` is now the single source of the 40/35/15/10 (50 to intent without feedback) weights used by `mixSeedScore`. Note: a later journal boost multiplies `combined` but not `seedBlend.blended`, so `combined / blended / preferencePenalty` equals the journal factor (4/3) for a boosted item.
- **R-C18** —
  - `combine.ts` emits "Shares … with a seed paper." only when `admitsBySeed(seedMatches[0])` holds; otherwise the ordinary `generateReason`.
  - `SeedMatch.reasonPhrases` (new; `hits` unchanged) picks up to two phrases ordered by facet contribution (an object/method beats a weaker topic), then a phrase found as written before scattered words, then the longer phrase, skipping a phrase whose words are already covered. Scattered words render as "the terms a, b and c", never with slashes.
  - `features.ts` `isSeedBoilerplate` drops, at seed creation only, a label that contains one of `test data, real experiment, synthetic example, this paper, this study, our results, real data, toy example, example data` or is made only of `test, data, real, experiment(s), synthetic, example(s), this, paper, study, result(s)`. Ordinary upload concepts are unchanged. Existing stored seeds keep their phrases until re-created.

## Tests on invented input (fail before, pass after) and mutations

Before = the new tests run against the base sources (`git show HEAD:<file>` swapped in, then restored). Each mutation reverts the rule line. SHA-256 prefixes: pre-mutation → mutated → restored.

| Rule | Test | Before | Mutation (revert) | Result | Hashes |
|---|---|---|---|---|---|
| R-C6 | `seed-pool/scoring.test.ts` "R-C6 facet weights renormalized…" (3 cases: topic-only 1.0 and admits; topic+method 0.5/0.7, 0.2/0.7, 1.0; full seed 0.5 and facetless 0) | 2 red | `const weight = absoluteWeight;` | 2 red | `4c33bf9dee58d21f` → `d9236f17c15ffdc7` → `4c33bf9dee58d21f` |
| R-C6b | `feed/pipeline.seed-constraints.test.ts` "caps one first author at two…", "keeps the preferred-journal boost…" | 2 red (base `pipeline.ts` + `rerank.ts` swapped in at the final state) | (a) journal line back to `seedPapers.length ? aiRanked : applyJournalBoost(…)`; (b) cap call removed | at the final state: (a) journal test red; (b) author test red | `e589fc93c99eeb1f` → (a) `96c3d43ac2d241df` / (b) `55ac21b2771374b3` → `e589fc93c99eeb1f` (both re-run at `dfd063d5`) |
| R-C7 | `scoring/seed-pool.test.ts` "R-C7 …" (intent = (keyword+topicality)/2, weights, recompute, combined = blended×penalty, top topicality 1; no phrases in `seedBlend` and absent without seed; 40/35/15/10 with feedback) | 2 red (the "absent without seed" guard passes before) | `seedIntent` back to `tf` | 1 red | `ff040e3ef6aa85e3` → `57bb270f388f0cb9` → `ff040e3ef6aa85e3` |
| R-C18 | `seed-pool/scoring.test.ts` "R-C18 grounded…" (strongest facet first, no slashes; contiguous first, covered skipped); `seed-pool/features.test.ts` "R-C18 seed boilerplate stoplist"; `scoring/seed-pool.test.ts` "R-C18 seed reason only when the seed admits" | 5 red (the "names the strongest facet when it admits" guard passes before) | M1 `admitsBySeed(...) &&` removed from the reason condition; M2 `isSeedBoilerplate` skip line deleted; M3 facet-score key removed from the sort | M1: sub-bar reason test red; M2: stoplist creation test red; M3: strongest-facet test red | combine `87937c71c189ae95` → M1 `e4fba70e1e5264f7` → `87937c71c189ae95`; features `c72b6db24e891e1e` → M2 `5ea03628db2a181a` → `c72b6db24e891e1e`; scoring `6ce6d4a972b54288` → M3 `0df87185a0cbfcd9` → `6ce6d4a972b54288` |

Re-aimed tests (named, not weakened). Both are this branch's own R-C6b tests, written in `53044991`:

- The journal-boost fixture was re-aimed in `b440bb3c`. The first pair differed in raw-cosine intent. Once R-C7 put intent on the percentile scale (0 or 1 in a two-item pool), the non-journal item lost by more than the 4/3 boost could restore. The new pair ties on intent, so only the seed facets and the venue boost decide the order.
- The author-cap fixture was strengthened in `dfd063d5`. My own pre-commit re-check found that after R-C7 the old "other" paper already ranked second with no cap at all, so the test no longer depended on the cap. The new fixture asserts that all three same-author papers outscore "other", and it still requires the cap to defer the third one.
- Both mutations are red at the final state.

No pre-existing test was edited, skipped or deleted.

## W1 probe re-run against this worktree

Probe copy: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w4-probe/` (`candidates.ts` 4c7f23c6…, `legacy-combine.mergebase.ts` ab97c2d0…, `legacy-pipeline.mergebase.ts` cd50d7d5…: identical to W1; `vitest.w1.config.ts` e545c5e5… points at the worktree; `rank.probe.test.ts` aecfe1c2…, `pipeline.probe.test.ts` 58c45d94…, `summarize.mjs` 839dcfcd…). Probe edits:
- `OUT` is read from `W4_OUT`.
- W1's hard facet assertion `score == 0.5·t+0.3·o+0.2·m` became a recorded count of matches against the absolute and the renormalized formula, because R-C6 deliberately changes it.
- The rows record intent against `topicality` and the `seedBlend` breakdown.

It was run at each commit (`before`/`c6`/`c6b`/`c7`/`c18` subfolders), 2/2 passing every time, fetch 0, model 0.

| Measure | before (71d0c3f8) | R-C6 | R-C6b | R-C7 | R-C18 (final) |
|---|---|---|---|---|---|
| Facet formula, pairs with hits | absolute 19/19 | renormalized 19/19 | same | same | renormalized 18/18 |
| Canopy best seed score (`d-oa`) | 0.301 | 0.602 | 0.602 | 0.602 | 0.628 |
| `c-topic` canopy seed score / admits | 0.233 / no | 0.465 / yes | same | same | 0.483 / yes |
| Seed admits canopy vs battery (runs c, g, h) | 3 vs 7 | 6 vs 7 | 6 vs 7 | 6 vs 7 | 6 vs 7 |
| Pipeline top-10, both seeds (battery/canopy/other) | 7/1/2 | 5/5/0 | 5/5/0 | 5/5/0 | 5/5/0 |
| Pipeline top-10, battery-only intent | 7/1/1 + 1 other | 5/4/1 | 5/4/1 | 5/4/1 | 5/4/1 |
| Unrelated `n-generic` rank, no Required topics (h, 22 rows) | 10 | 13 | 13 | 13 | 19 (battery seed score 0.251 → 0) |
| `c-topic` rank in h / in c | 11 / 8 | 8 / 8 | 8 / 8 | 8 / 5 | 9 / 5 |
| Intent argument equals | raw cosine | raw cosine | raw cosine | topicality (14/14 rows; `seedBlend` on 14/14) | topicality |
| Seed reasons audited (runs b–h) | 75 | 83 | 83 | 83 | 78 |
| …for non-admitting matches | 18 | 5 | 5 | 5 | 0 |
| …with slash-joined words | 32 | 33 | 33 | 33 | 0 |
| …naming boilerplate (`n-generic` included) | 1 (1) | 1 (1) | 1 (1) | 1 (1) | 0 (0) |
| …naming a battery object/method phrase | 7 | 7 | 7 | 7 | 24 |
| No-seed identity (score level: HEAD = merge-base, unusable = none; pipeline: no-seed = merge-base, unusable = no-seed, duplicates = both, excluded absent) | all true | all true | all true | all true | all true |

R-C6b shows no probe change. Every W1 candidate has the same invented first author, so the cap keeps the first two and defers the rest in their existing order. Its effect is shown by the unit test. The probe has no venue.

## Gates (from `web/` in the worktree, at `dfd063d5`)

- `npx tsc --noEmit --incremental false`: 0 errors.
- `npx eslint` on all 10 touched files: clean.
- Touched directories (`src/lib/seed-pool`, `src/lib/scoring`, `src/lib/feed`, `src/app/api/feed`, `src/lib/dashboard`, `src/lib/email`, `src/app/api/jobs`, `src/app/api/seed-pool`, `src/components/seed-pool`, `src/lib/preferences`): 96 files, 1596 tests passed.
- Full `npx vitest run`: 629 files passed and 2 skipped (pre-existing skips); 11456 tests passed and 2 skipped.
- `npm run build` was not run (no route or Link change).

## Residuals for the manager (not fixed; outside these rulings)

- Extractor phrase quality is still weak: verb-ending n-grams such as `electrolyte concentration affects`, `density affects water`, `canopy density affects`. These now surface in reasons more often, because reasons lead with the stronger facet. The fix belongs in `upload-concepts.ts`, which is shared with ordinary uploads.
- The canopy seed still has no object/method facet ("optical imaging and field sensors" lost the shared 12-phrase cap).
- Reasons built only from scattered words read clumsily but honestly: "the terms forest, canopy and water and the terms leaf, canopy and density" (`c-variant`).
- Seeds stored before R-C18 keep their boilerplate phrases until re-created.
- `n-generic`'s remaining rank 19 in run h is intent/recency only (seed 0).
