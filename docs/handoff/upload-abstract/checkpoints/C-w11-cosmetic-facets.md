# C-w11-cosmetic-facets — Round-1 cosmetic defects B6 / C3 / C18 (W11, Group 1 B+C), 2026-11-04

Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w11` (detached, base `9fdfd334`). Not pushed.
Commits: `6917066b` (R-B6), `1bbd8d17` (R-C3), `92ca680d` (R-C18), plus this checkpoint.
Evidence read: `A-w10-round1-scorecard.md` (B6, C3, C18 rows), `C-w9-seed-extract.md`, `C-w4-seed-rank.md`.

## R-B6 — no keyword claim for a PDF without keywords

B note:
- Cause: `web/src/components/reader/private-pdf-status.tsx:21` (base) printed the static line
  "Private PDF · retained for 30 days after upload · keywords inform your recommendations." for every
  upload, including a blank / no-text-layer PDF whose reader page already says it has no readable text.
- What the component can know: its `upload: Paper` comes from `uploadMetaToPaper`
  (`web/src/lib/papers/upload-store.ts:299,309`), which carries `preferenceSignals` and `textStatus`.
  The upload route sets `textStatus` to `"empty"` when the PDF has no sections and `preferenceSignals`
  to `extractUploadConcepts(doc)` or `[]` (`web/src/app/api/papers/upload/route.ts:281,306`). Both mount
  points (`app/papers/[id]/page.tsx:1328,1517`, `components/profile-uploads.tsx:47`) pass that paper.
- Change: `hasKeywords = upload.textStatus !== "empty" && (upload.preferenceSignals?.length ?? 0) > 0`;
  with it the line is unchanged, without it the line is "Private PDF · retained for 30 days after
  upload." (retention kept, no keyword words). No prop added; no other caller changed. A legacy record
  with no `preferenceSignals` field now shows the retention line only (no claim we cannot back).

Tests: `private-pdf-status.test.tsx` "keyword clause only when keywords were extracted (W11 R-B6)":
ok + signals keeps the clause; empty + []; ok + []; empty + signals all drop it and keep the retention line.
Before (base component, tests kept): 3 failed / 9 passed. After: 12/12.
Mutation: `const hasKeywords = true;` -> 3 failed; restored; sha256 (first 16) before = after = `bd7fe6b8f591d644`.

## R-C3 — object/method recognition beyond materials science

B note:
- Cause: `web/src/lib/preferences/upload-concepts.ts:126-135` (base) `METHOD_CUES` / `MATERIAL_CUES` are
  materials/CS words; `classifyFacet` (`:144-153`) falls to "topic" for anything else, and the seed builder
  maps facet -> seed facet at `web/src/lib/seed-pool/features.ts:81`. So "field sensors", "loop
  detectors", "temperature loggers", "isotope tracing", "acoustic doppler profilers" were all topics, and
  the canopy seed showed Object/Method "Not recognized". ("imaging", "chromatography", "regression" were
  already cues; "optical imaging" in the canopy fixture appears once, below the count >= 2 bar, so it is
  not a candidate at all.)
- Change: a small closed addition, no model, no taxonomy service.
  - Method cues: photogrammetry, sensor(s), survey(s), interview(s), tracing, profiler(s),
    microsimulation, detector(s), logger(s), measurement(s).
  - Object/material cues: sediment(s), soil(s), groundwater, biomass, tissue.
- `UPLOAD_CONCEPT_EXTRACTION_VERSION` stays 14 (manager ruling); a test pins it.
- Reach: both callers of `extractUploadConcepts` (seed facets, and ordinary upload `preferenceSignals`
  facet labels) see the new classification. Candidate filtering, scores and confidences are unchanged.

Tests: `upload-concepts.test.ts` "R-C3 method recognition beyond materials science": the five ruled
sentences (each body repeated twice so the phrases pass the count >= 2 bar) each yield their named
method(s) (acoustic doppler profilers; underwater photogrammetry + temperature loggers; loop detectors;
isotope tracing + gas chromatography; optical imaging + field sensors); "queue length", "leaf area",
"canopy moisture" stay topic; "sediment traps", "nitrate flux" are material; version is 14.
Before (base cues): 6 failed / 22 passed (sentences 4 and 5 already had one method each but not both).
After: 28/28; all pre-existing upload-concepts tests unchanged and passing.
Mutation: deleted the three added METHOD_CUES lines -> 5 failed; restored; sha256 before = after =
`07eaef39976bd886c5ebb69ce3c447a6829055fe6400d46f5e0654319ba2c920`.
(`microsimulation` alone is a single token and so never a candidate: single words must be known domain
terms. It is in the list for the phrase case, e.g. "traffic microsimulation".)

## R-C18 — seed reasons never quote a verb-holding phrase

B note:
- Cause: `web/src/lib/seed-pool/scoring.ts:55` (base) pushed every contiguous matched phrase as written
  into the reason ranking; `reasonPhrases` (`:66-78`) ordered by facet score, contiguity, length; the
  sentence is built at `web/src/lib/scoring/combine.ts:444`. R-P1 (W9) removed edge verbs, but a verb
  inside a 3-gram ("density affects water", "concentration affects cycling", "retention after rain") is
  still a seed phrase and was quoted.
- Change: the R-P1 list is exported from `upload-concepts.ts` as `PHRASE_BOUNDARY_WORDS` (the private
  `BOUNDARY_WORDS` now aliases it; trimming unchanged). In `matchSeed`, a hit whose phrase or folded parts
  hold any of those words is "not clean": it sorts after every clean phrase of equal facet score, and if
  still chosen it is named by its remaining words in the existing form ("the terms density and water";
  "the term x" if one word is left). Clean phrases are untouched (same text, same order as before).
  `hits`, `score` and `admitsBySeed` are not touched, so R-C18's admission gating is unchanged; every
  named word is a part of a matched phrase and so is in the candidate.

Tests: `seed-pool/scoring.test.ts` "R-C18 seed reasons read grammatically (W11)": clean phrases lead
over verb-holding ones and hits/admission are unchanged; a seed with only verb-holding phrases gives
["the terms density and water", "the terms retention and rain"], every named word in the candidate; an
object-facet verb phrase is never quoted. Before: 3 failed / 13 passed. After: 16/16 (and
`scoring/seed-pool.test.ts` reason text unchanged).
Mutation: `const clean = true;` -> 3 failed; restored; sha256 before = after =
`5dc67f29e1a7b4d45f03e0f82dcf887ae46aca04f32cdc4d40d006c542faf312`.

## W1 probe re-run (`C:/Users/wbc13/AppData/Local/Temp/peer-w11-probe`)

Copy of `peer-claude-w1` (rank + extract probes, `candidates.ts`, merge-base legacy files) with W9's two
edits only: `OUT`/`WEB` from env (`W11_OUT`, `W11_WEB`) and the facet weighted-sum `expect` recorded as
`weightedRecomputeMatches` instead of asserted (fails on base since R-C6 renormalized). Fixture SHAs and
every other assertion unchanged. Before = this worktree at base source (after the B6 commit, which no
probe path reads); after = `92ca680d`. `summarize.cjs` counts a seed reason as a verb fragment when a
quoted phrase (after removing "the terms") holds an R-P1 boundary word. Output: `summary.txt`.

| | before | after |
|---|---|---|
| canopy object / method recognized | no / no | no / **yes** (`field sensors`) |
| battery object / method recognized | yes / yes | yes / yes (unchanged) |
| canopy topic list | ... retention after rain, canopy moisture, fictional trees, field sensors | same minus `field sensors` (moved to method) |
| blank PDF seed | null | null |
| seed reasons | 78 | 71 |
| reasons quoting a verb fragment | **28** | **0** |
| reasons ungrounded / non-admitting | 0 / 0 | 0 / 0 |
| "the terms" reasons | 13 | 13 |
| noSeedIdentity (head vs merge-base; unusable seed vs none) | true / true | true / true |
| network / model calls | 0 / 0 | 0 / 0 |
| top-10 after diversify, run c (membership) | b-intent b-variant x-both i-batt b-full c-topic i-hydro d-oa f-twin d-arxiv | same 10 items, reordered |

Distinct seed reasons after: "forest canopy water and leaf canopy density", "forest canopy water and
water retention", "leaf canopy density and water retention", "the terms forest, canopy and water and the
terms leaf, canopy and density", "cell capacity and electrolyte concentration", "the terms battery,
electrolyte and stability and electrochemical cycling", "battery electrolyte stability and electrolyte
concentration", "cycling stability and electrochemical cycling" (each "Shares ... with a seed paper.").

**Side effect for the manager (R-C3 x R-C6), not changed here:** the canopy seed now has a method facet,
so R-C6's renormalization (`seed-pool/scoring.ts:40-43`) shares 50/30/20 over topic+method: topic weight
1.0 -> 0.714. Topic-only canopy matches fall: c-topic seed 0.449 -> 0.345, d-oa/d-arxiv 0.580 -> 0.449,
c-variant 0.494 -> 0.380, and **c-pos ("Canopy moisture mapping with remote sensing", topic "canopy
moisture" only) 0.303 -> 0.231, below the 0.3 admission bar**: it leaves runs b/c/d/e/f/g (filtered by the
Required gate without seed admission) and loses seed admission in h. The 7 lost seed reasons are c-pos's.
interestRecall c: canopy passed 6 -> 5 (c-pos), battery unchanged 7/7. Battery seed scores identical.
m-method2 ("Optical imaging with field sensors for traffic monitoring") now hits canopy's method facet
(0.286, still not admitted: one facet, below 0.3). This is the existing facet-weight design meeting a
newly recognized method; options are a manager ruling (accept; or have a method facet not dilute topic,
which is a scoring change outside W11).

## Gates

- `npx tsc --noEmit --incremental false`: 0 errors.
- `npx eslint` on all six touched files: clean.
- Touched dirs + callers (`components/reader`, `lib/preferences`, `lib/seed-pool`, `lib/scoring`,
  `api/papers/upload`, `api/seed-pool`, `profile-uploads`, `upload-legal-wording`): 195 files / 3137 tests pass.
- Full `npx vitest run`: 633 files passed, 2 skipped; 11519 tests passed, 2 skipped. No flakes, no reruns
  (log `C:/Users/wbc13/AppData/Local/Temp/peer-w11-probe/full-vitest.log`).
