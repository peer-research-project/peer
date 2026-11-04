# C-w23-seed-edge-boilerplate — pointer words trimmed from seed facet label edges (W23, Group 2 C), 2026-11-04

Brief: `briefs/W23-SEED-EDGE-BOILERPLATE.md`, manager ruling R-C3c, narrowed by R-C3d (manager, 2026-11-04).
Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w23` (detached, base `8c430e7a`). Not pushed, no branch.
Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w23/`.
Commits: `5cd2d88b` (R-C3c), `75824f4d` (first checkpoint), `487b3353` (R-C3d narrowing), plus this checkpoint update.
Files touched: `web/src/lib/seed-pool/features.ts`, `web/src/lib/seed-pool/features.test.ts` only.
`web/src/lib/preferences/upload-concepts.ts` and `seed-pool/scoring.ts` are untouched.

## Change

`5cd2d88b` (R-C3c) added `trimSeedEdgeBoilerplate(label)`, trimming every `SEED_BOILERPLATE_WORDS` word at a label
edge. Its risk (recorded in `75824f4d`): "synthetic aperture radar" -> "aperture radar"; "case study", "climate data",
"sensor data", "test bench" dropped. `487b3353` (R-C3d) narrows it. State now:

- New exported closed set `SEED_EDGE_POINTER_WORDS = ["example", "examples", "this"]`. Only these whole words are
  stripped from the start and end of a seed facet label (repeatedly: "this example denser foliage examples" ->
  "denser foliage"). The other `SEED_BOILERPLATE_WORDS` ("synthetic", "test", "data", "study", "real", "paper",
  "result(s)", "experiment(s)") are not trimmed at edges. Inner words are never touched; no word is added.
- A label with no edge pointer word is returned unchanged. A trimmed label is kept only if it still has >= 2 words,
  is not `isSeedBoilerplate`, and does not `holdsVerb` (imported from `upload-concepts`, not forked); otherwise the
  label is dropped.
- `seedFromExtractedDocument` runs the trim after the existing `isSeedBoilerplate` check; the existing per-facet
  `includes` check keeps one copy when a trimmed label repeats one already in the same facet.
- Seed facets only: `extractUploadConcepts` still returns "example denser foliage" as an ordinary upload concept.
- No change to scoring, facet weights, the 0.3 admission bar, `SEED_BOILERPLATE_WORDS`, `SEED_BOILERPLATE_PHRASES` or
  `SEED_CONDITION_PHRASES`.

Tests (`features.test.ts`, describe "R-C3c/R-C3d pointer words trimmed from seed facet label edges (W23)", 4 cases,
invented foliage text shaped like the canopy fixture sentence):
- the upload concepts still contain "example denser foliage" while the seed holds "denser foliage" and no seed label
  starts or ends with "example(s)"/"this";
- trim table: the pointer set is exactly the three words; "example denser foliage" -> "denser foliage",
  "this canopy model" -> "canopy model", end and both-edge trims, inner "example" kept, one-word remainder dropped,
  all-boilerplate remainder ("example test data") dropped, verb-holding remainders dropped;
- protected terms: "synthetic aperture radar", "case study", "climate data", "sensor data", "test bench" come back
  unchanged from the trim, are not `isSeedBoilerplate`, and pass through seed creation as-is (call-through `vi.mock`
  of `extractUploadConcepts`, one `mockReturnValueOnce`); "example climate data" -> "climate data";
- duplicate: "denser foliage" + "example denser foliage" + "this denser foliage" -> one "denser foliage".

`isSeedBoilerplate` on the five protected terms today: false for all five, so none is dropped by it (unchanged).

Test fix in `487b3353`: the R-C3c edge-word regex in the test held literal backspace bytes (0x08) instead of `\b`,
so in `5cd2d88b` that "no label starts/ends with a boilerplate word" assertion could never fail. Now `\b`; checked
that the regex matches "example denser foliage" and not "denser foliage".

Mutations:
- R-C3c (`5cd2d88b`): trim disabled -> 3 failed / 10; restored, sha256 (first 16) `476a0946885bb7cb` before = after.
- R-C3d (`487b3353`): `"data"` added to `SEED_EDGE_POINTER_WORDS` -> 2 failed / 11 (protected-term case and trim
  table); restored from a byte copy; sha256 (first 16) before = after = `391499e86168c313`; 11/11 again.

## Measurement — invented fixtures only

Probe: W21's probe copied to `peer-claude-w23/probe/` (`candidates.ts` sha256 `4c7f23c6…`, unchanged), config
`vitest.w23.config.ts` pointed at this worktree. Before = `8c430e7a` (reproduces W21's "after" exactly), after =
`487b3353`. The R-C3c run (`5cd2d88b`) gave byte-identical summaries. Summaries: `probe/summary-before.txt`,
`probe/summary-after.txt` (R-C3c), `probe/summary-after-r3d.txt`; raw: `probe/out-before|out-after|out-after-r3d/`.

| Check | Before (`8c430e7a`) | After (`487b3353`) |
|---|---|---|
| fictional-canopy.pdf topic | water retention, forest canopy water, **example denser foliage**, leaf canopy density, canopy moisture, fictional trees, leaf area | same with **denser foliage** in that place (7 labels) |
| fictional-canopy.pdf method | field sensors, optical imaging | unchanged |
| fictional-battery.pdf topic / object / method | cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity / battery electrolyte stability, electrolyte concentration / impedance spectroscopy | unchanged |
| Invented facet texts (`facets.json`) | — | no diff; upload concept lists identical for all inputs |
| Seed labels starting/ending with a boilerplate word (all probe inputs) | 1 ("example denser foliage") | **0** |
| Five protected terms (synthetic aperture radar, case study, climate data, sensor data, test bench) | not trimmed (no trim existed); `isSeedBoilerplate` false for all | kept unchanged by the trim and by seed creation (unit tests; not present in the fixtures) |
| Seed-admitted canopy vs battery, runs c / g / h | 5 vs 7 each | 5 vs 7 each (same ids) |
| Run c top-10 after diversify, battery / canopy / none | 5 / 3 / 2 | **4 / 4 / 2** |
| Run g / h top-10 | 7/2/1 / 7/3/0 | **6/3/1 / 6/4/0** |
| `c-topic` canopy seed score (bar 0.3) | 0.306, admitted | **0.321, admitted** |
| `x-both` canopy / battery nearest | 0.501 / 0.505 | 0.523 / 0.505 |
| R-C18 seed reasons: verb fragments / ungrounded / non-admitting | 0 / 0 / 0 of 71 | 0 / 0 / 0 of 71 (same 8 distinct reasons) |
| No-seed identity (HEAD vs merge-base; unusable vs none), mix calls | true, true; 0/0 | true, true; 0/0 |
| Blank PDF seed | null | null |
| fetch / model calls | 0 / 0 | 0 / 0 |

Honest read:
- Ranking numbers moved, all from the one label change and nothing else tuned: "denser foliage" sits closer to the
  canopy candidates than "example denser foliage" did, so canopy seed scores rise (c-topic canopy-only +0.015; in
  c-both-seeds the canopy rows c-topic / x-both / d-oa / d-arxiv / c-variant rise +0.006 to +0.0085, battery rows
  unchanged). Run c top-10 is back to the pre-W20 4/4/2; g and h each swap one battery row for a canopy row.
  Admissions are unchanged (5 vs 7). c-topic's margin over 0.3 grows from 0.006 to 0.021 and now matches W20's
  attribution figure (0.321).
- R-C3d changes no probe number against R-C3c: the fixtures' only edge word was "example".
- The protected-term row rests on unit tests; neither fixture holds those terms.

## Gates (at `487b3353`)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (web/) | exit 0 |
| eslint on the 2 touched files | exit 0 |
| `features.test.ts` x3 | 11/11, 11/11, 11/11 |
| `src/lib/seed-pool` tests | 12 files, 77/77 |
| `src/lib/security/spend-scans.test.ts` | 50/50 |
| Seed probe (rank + extract + facets + attrib + bump), before and after | 5/5 pass each, fetch 0, model 0 |
| Mutation R-C3d (`"data"` into `SEED_EDGE_POINTER_WORDS`) | red 2/11; sha256 restored equal `391499e86168c313` |
| Mutation R-C3c (trim disabled, at `5cd2d88b`) | red 3/10; sha256 restored equal `476a0946885bb7cb` |
