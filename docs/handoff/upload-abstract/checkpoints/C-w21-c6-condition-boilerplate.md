# C-w21-c6-condition-boilerplate — generic condition phrases out of seed facets (W21, Group 2 C), 2026-11-04

Brief: `briefs/W21-C6-CONDITION-BOILERPLATE.md`, manager ruling R-C6d. Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w21`
(detached, base `671ff9b9`). Not pushed, no branch. Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w21/`.
Commits: `5446e057` (R-C6d), plus this checkpoint.
Files touched: `web/src/lib/seed-pool/features.ts`, `web/src/lib/seed-pool/features.test.ts` only.
`web/src/lib/preferences/upload-concepts.ts` and `seed-pool/scoring.ts` are untouched.

## Change (`5446e057`)

- New exported `SEED_CONDITION_PHRASES` (closed, 5 entries): "identical conditions", "same conditions",
  "similar conditions", "experimental conditions", "different conditions". Spread into `SEED_BOILERPLATE_PHRASES`, so
  `isSeedBoilerplate` (whole-phrase match on word boundaries, unchanged) drops any seed label containing one of them.
- Not listed, so kept as facets: "standard conditions", "boundary conditions", "initial conditions",
  "reaction conditions", bare "conditions" ("conditions" was not added to `SEED_BOILERPLATE_WORDS`).
- Seed facets only: `extractUploadConcepts` still returns "identical conditions" as an ordinary upload concept.
- No change to scoring, facet weights, the 0.3 admission bar or the pooled-vector formula.

Tests (`features.test.ts`, describe "R-C6d generic condition phrases are seed boilerplate (W21)", 2 cases, invented
canopy-shaped text): the upload concept list still contains "identical conditions" while the seed's facets hold no
"conditions" label and keep "leaf canopy density" / "canopy moisture"; the list is exactly the five, each is in
`SEED_BOILERPLATE_PHRASES`, each alone and "under <phrase>" is boilerplate, and the four domain terms, bare
"conditions", "identical twins", "canopy conditions" are not.
Mutation: `...SEED_CONDITION_PHRASES,` removed from `SEED_BOILERPLATE_PHRASES` -> 2 failed / 7; restored from a
byte copy; sha256 (first 16) before = after = `ef9fad2bf717b347`; 7/7 again.

## Measurement — invented fixtures only

Probe: W20's probe copied to `peer-claude-w21/probe/` (`candidates.ts` sha256 `4c7f23c6…`, unchanged), config
`vitest.w21.config.ts` pointed at this worktree; `extra.cjs` added to read admissions / top-10 / c-topic from the
same report. Before = `671ff9b9` (reproduces W20's "after" exactly), after = `5446e057`.
Summaries: `probe/summary-before.txt`, `probe/summary-after.txt`; raw: `probe/out-before|out-after/`.

| Check | Before (`671ff9b9`) | After (`5446e057`) |
|---|---|---|
| fictional-canopy.pdf topic | water retention, forest canopy water, example denser foliage, leaf canopy density, canopy moisture, fictional trees, identical conditions, leaf area | same minus **identical conditions** (7 labels) |
| fictional-canopy.pdf method | field sensors, optical imaging | unchanged |
| fictional-battery.pdf topic / object / method | cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity / battery electrolyte stability, electrolyte concentration / impedance spectroscopy | unchanged |
| Invented facet texts (W20 `facets.json`) | — | only diff vs before: "identical conditions" gone from canopy |
| Seed-admitted canopy vs battery, runs c / g / h | 4 vs 7 each | **5 vs 7** each (`c-topic` back) |
| Run c top-10 after diversify, battery / canopy / none | 5 / 2 / 3 | **5 / 3 / 2** |
| Runs g / h top-10 | 7/2/1 / 7/3/0 | 7/2/1 / 7/3/0 (h order shuffles within) |
| `c-topic` canopy seed score (bar 0.3) | 0.282, not admitted | **0.306, admitted** |
| `x-both` canopy / battery nearest | 0.467 / 0.505 | 0.501 / 0.505 |
| R-C18 seed reasons: verb fragments / ungrounded / non-admitting | 0 / 0 / 0 of 64 | 0 / 0 / 0 of 71 |
| No-seed identity (HEAD vs merge-base; unusable vs none), mix calls | true, true; 0/0 | true, true; 0/0 |
| Blank PDF seed | null | null |
| fetch / model calls | 0 / 0 | 0 / 0 |

Honest read:
- Admissions return to the pre-W20 5 vs 7. Run c top-10 returns only partly: 5/3/2, not the pre-W20 4/4/2.
  "leaf area" (the other W20 filler, a real topic phrase) still dilutes the pooled canopy topic vector; W20's
  attribution put c-topic at 0.321 without both fillers.
- `c-topic` clears the bar by 0.006. That margin is thin: any further clean-but-off-centre canopy phrase would push it
  under again. The structural cause (W1 C6 cause 2, pooled topic vector dilution) is unchanged by design; nothing
  else was tuned.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (web/) | exit 0 |
| eslint on the 2 touched files | exit 0 |
| `features.test.ts` x3 | 7/7, 7/7, 7/7 |
| `src/lib/seed-pool` tests | 12 files, 73/73 |
| `src/lib/security/spend-scans.test.ts` | 50/50 |
| Seed probe (rank + extract + facets + attrib + bump), before and after | 5/5 pass each, fetch 0, model 0 |
| Mutation (remove the new phrases) | red 2/7; sha256 restored equal `ef9fad2bf717b347` |
