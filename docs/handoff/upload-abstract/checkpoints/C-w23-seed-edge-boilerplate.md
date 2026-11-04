# C-w23-seed-edge-boilerplate — boilerplate words trimmed from seed facet label edges (W23, Group 2 C), 2026-11-04

Brief: `briefs/W23-SEED-EDGE-BOILERPLATE.md`, manager ruling R-C3c. Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w23`
(detached, base `8c430e7a`). Not pushed, no branch. Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w23/`.
Commits: `5cd2d88b` (R-C3c), plus this checkpoint.
Files touched: `web/src/lib/seed-pool/features.ts`, `web/src/lib/seed-pool/features.test.ts` only.
`web/src/lib/preferences/upload-concepts.ts` and `seed-pool/scoring.ts` are untouched.

## Change (`5cd2d88b`)

- New exported `trimSeedEdgeBoilerplate(label)`: strips whole words in `SEED_BOILERPLATE_WORDS` from the start and the
  end of a seed facet label (repeatedly, so "this example denser foliage results" -> "denser foliage"). Inner words are
  never touched; no word is added.
- A label with no edge boilerplate word is returned unchanged. A trimmed label is kept only if it still has >= 2 words,
  is not `isSeedBoilerplate`, and does not `holdsVerb` (imported from `upload-concepts`, not forked); otherwise the
  label is dropped.
- `seedFromExtractedDocument` runs the trim after the existing `isSeedBoilerplate` check; the existing per-facet
  `includes` check keeps one copy when a trimmed label repeats one already in the same facet.
- Seed facets only: `extractUploadConcepts` still returns "example denser foliage" as an ordinary upload concept.
- No change to scoring, facet weights, the 0.3 admission bar, `SEED_BOILERPLATE_WORDS`, `SEED_BOILERPLATE_PHRASES` or
  `SEED_CONDITION_PHRASES`.

Tests (`features.test.ts`, describe "R-C3c boilerplate words trimmed from seed facet label edges (W23)", 3 cases,
invented foliage text shaped like the canopy fixture sentence): the upload concepts still contain
"example denser foliage" while the seed holds "denser foliage" and no label starts or ends with a boilerplate word;
a table of trim cases (start, end, both edges, inner word kept, one-word remainder dropped, all-boilerplate remainder
dropped, verb-holding remainder dropped); a duplicate case ("denser foliage" + "example denser foliage" +
"denser foliage data" -> one "denser foliage"), using a call-through `vi.mock` of `extractUploadConcepts` with one
`mockReturnValueOnce`.
Mutation: the "no edge word -> return label" guard replaced by `if (start >= 0) return label;` (trim disabled) ->
3 failed / 10; restored from a byte copy; sha256 (first 16) before = after = `476a0946885bb7cb`; 10/10 again.

## Measurement — invented fixtures only

Probe: W21's probe copied to `peer-claude-w23/probe/` (`candidates.ts` sha256 `4c7f23c6…`, unchanged), config
`vitest.w23.config.ts` pointed at this worktree. Before = `8c430e7a` (reproduces W21's "after" exactly), after =
`5cd2d88b`. Summaries: `probe/summary-before.txt`, `probe/summary-after.txt`; raw: `probe/out-before|out-after/`.

| Check | Before (`8c430e7a`) | After (`5cd2d88b`) |
|---|---|---|
| fictional-canopy.pdf topic | water retention, forest canopy water, **example denser foliage**, leaf canopy density, canopy moisture, fictional trees, leaf area | same with **denser foliage** in that place (7 labels) |
| fictional-canopy.pdf method | field sensors, optical imaging | unchanged |
| fictional-battery.pdf topic / object / method | cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity / battery electrolyte stability, electrolyte concentration / impedance spectroscopy | unchanged |
| Invented facet texts (`facets.json`) | — | no diff; upload concept lists identical for all inputs |
| Seed labels starting/ending with a boilerplate word (all probe inputs) | 1 ("example denser foliage") | **0** |
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
  unchanged). Run c top-10 is back to the pre-W20 4/4/2; g and h each swap
  one battery row for a canopy row. Admissions are unchanged (5 vs 7). c-topic's margin over 0.3 grows from 0.006 to
  0.021 and now matches W20's attribution figure (0.321).
- Risk for the manager, not exercised by the fixtures: `SEED_BOILERPLATE_WORDS` holds words that also open or close
  real domain terms. Under R-C3c as ruled, seed facets would turn "synthetic aperture radar" into "aperture radar" and
  drop two-word terms such as "test bench", "case study", "climate data", "sensor data" (one word left). The existing
  `isSeedBoilerplate` assertions for "synthetic aperture radar" / "test bench" still hold (that function is
  unchanged); only the seed facet label is affected. Not tested as desired behaviour; a protected-term list or a
  narrower edge-word set would need a new ruling.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (web/) | exit 0 |
| eslint on the 2 touched files | exit 0 |
| `features.test.ts` x3 | 10/10, 10/10, 10/10 |
| `src/lib/seed-pool` tests | 12 files, 76/76 |
| `src/lib/security/spend-scans.test.ts` | 50/50 |
| Seed probe (rank + extract + facets + attrib + bump), before and after | 5/5 pass each, fetch 0, model 0 |
| Mutation (disable the edge trim) | red 3/10; sha256 restored equal `476a0946885bb7cb` |
