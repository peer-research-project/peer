# C-w20-c3-topic-fragments — Round-2 C3 topic fragments (W20, Group 2 C), 2026-11-04

Brief: `briefs/W20-C3-TOPIC-FRAGMENTS.md`, manager ruling R-C3b. Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w20`
(detached, base `178682da`). Not pushed, no branch. Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w20/`.
Commits: `09b64c8e` (R-C3b rule 1, inner-verb filter), `ba50809b` (R-C3b rule 2, version 14 -> 15), plus this checkpoint.
Files touched: `web/src/lib/preferences/upload-concepts.ts`, `web/src/lib/preferences/upload-concepts.test.ts` only.
The seed path (`seed-pool/features.ts`, `seed-pool/scoring.ts`) was not changed: it consumes `extractUploadConcepts`.

## Rule 1 — no facet label holds a verb (`09b64c8e`)

- Cause: R-P1's `endsOnFunctionWord` (upload-concepts.ts) judged only a phrase's first and last word, and its own
  comment put "a verb inside a phrase" outside the rule; `seed-pool.tsx` `Facets` prints `features.topic` verbatim.
- Change: `extractUploadConcepts` also drops a candidate for which the new exported `holdsVerb(label)` is true:
  - any word in `PHRASE_BOUNDARY_WORDS` (the R-P1/R-C18 list, reused, not forked). The list gained verb-only finite
    forms common in abstracts (reduces/reduce, enhances, determines, promotes, inhibits, suppresses, regulates,
    mediates, governs, retains, maintains, contains, depends, differs, occurs, exceeds, outperforms, explains,
    reveals, indicates, suggests, provides, requires, and base forms). Noun spellings (reaches, remains, yields,
    leads, drives, controls, increases) are deliberately left out. The added words also widen R-P1 edge trimming and
    R-C18's "clean" test, which share the list;
  - an "-ed" word (length >= 5, not "-eed", not hyphenated, not in a 12-word not-a-participle list such as
    "infrared", "hundred") after the first word, unless the word pair is in `KNOWN_PARTICIPLE_TERMS`.
- Split, not edit: every shorter n-gram of the same occurrences is already a candidate with at least the same count
  and title flag, so dropping "density affects water" leaves "leaf canopy density" / "water retention" to compete;
  no word is invented. "retention after rain" has no valid piece ("retention", "rain" are single non-terms) and
  leaves nothing, as the ruling allows.
- Kept on purpose: first-word participles ("doped cathode", "maintained capacity", "reduced plant cover": they read
  as adjective + noun), hyphenated compounds ("nitrogen-doped"), and `KNOWN_PARTICIPLE_TERMS` (explicit list, no
  existing multi-word vocabulary covers these; `ABBREVIATION_GROUPS` has none): machine learning, deep learning,
  remote sensing, boundary layer, surface enhanced raman, plasma/laser/light/drug/stress induced or enhanced, time
  resolved, angle resolved, self assembled, self/semi/weakly supervised, fully connected, computer aided, physics
  informed, fiber reinforced, highly ordered, nitrogen/fluorine/boron doped, carbon coated, glucose stimulated.
- "-ing" is not judged by shape: after a noun it is almost always a term ("machine learning", "electrochemical
  cycling"), so only a listed "-ing" verb ("using") counts.
- Known limit (not fixed, no lexicon): a finite verb that is also a noun ("map", "read", "probe", "anchors") is not
  detected. Seen only in my adversarial invented text, not in either fixture.

Tests (`upload-concepts.test.ts`, describe "R-C3b no facet label holds a verb (W20)", 4 cases): fixture-shaped
canopy/battery text yields no inner-verb label (independent counter) and keeps the noun phrases; every label is a
run of words from the text; known terms and adjective participles are kept; `holdsVerb` agrees on fixed examples,
every `KNOWN_PARTICIPLE_TERMS` entry is false, every `PHRASE_BOUNDARY_WORDS` word inside "canopy _ water" is true.
Mutation: `&& !holdsVerb(label)` removed from the filter -> 1 failed / 31 ("drops every phrase with a verb inside");
restored; sha256 (first 16) before = after = `e0e1ddb9c03ffca2`.

## Rule 2 — `UPLOAD_CONCEPT_EXTRACTION_VERSION` 14 -> 15 (`ba50809b`)

What the number keys (read in code): only `full-text.ts` `uploadFullText` -> `uploadDocKey(owner, hash16, revision,
UPLOAD_CONCEPT_EXTRACTION_VERSION)`; the upload route stamps it on new records; `ledger.ts` copies the per-concept
number through. No code compares a stored `extractionVersion` with the current one.

Evidence (scratch probe `peer-claude-w20/probe/bump.probe.test.ts`, output `probe/out-bump/bump-evidence.json`;
real `upload-store` in a private temp dir, real pdf.js on `fictional-canopy.pdf`, fetch stubbed to throw):
a record + PDF + a sidecar written under the v14 key (a marked stale document), then a cold module start and two
`getFullText` calls:

| Check | Result |
|---|---|
| First open status / served the stale v14 text | `ok` / no |
| PDF re-reads across two opens | 1 (second open hits the new sidecar, equal doc) |
| Sidecar now readable under the v15 key / under v14 | yes / null (overwritten in place, same file name) |
| PDF bytes, record bytes | unchanged (sha256 equal) |
| Files in the upload dir before / after | the same three (`.doc.json`, `.json`, `.pdf`) — nothing deleted |
| Record status / its stored `extractionVersion` | `ready` / 14 (not rewritten) |
| `buildReading` on the result | body 1 section, `provenance.fullText` = `pdf` |

Conclusion: the bump only costs one re-read of each upload's stored PDF on its next open; it deletes nothing and does
not break a reading page. The PDF reading code is untouched by both commits, so the re-read document is the same
document (saved notes keep their quotes). Two things it does NOT do, recorded for the manager:
- Concepts already stored on an upload record (`preferenceSignals`) and in the ledger are not recomputed (only a
  re-upload recomputes them).
- **Seed facets already saved are not recomputed.** A seed's `features` are computed once in
  `api/seed-pool/assets/route.ts` and stored; nothing re-derives them from the PDF. An existing canopy/battery seed on
  peer-test or production keeps "density affects water" on its Profile card until the PDF is removed and added again.
  New seeds get clean facets. A backfill or a display-side `holdsVerb` filter would be a separate ruling.

Tests: "is 15", "stamps 15 on every concept"; R-C3's "left at 14" case now asserts > 14 with a note that R-C3b took it
past 14. Mutation: version set back to 14 -> 3 failed / 34; restored; sha256 (first 16) before = after =
`08b0694782ad4b4d`.

## Measurement — invented input only

Probe: the W19 copy of the W11/W1 rank+extract probe (W4 and W11 scratch dirs no longer exist), re-pointed at this
worktree (`probe/vitest.w20.config.ts`; `candidates.ts` sha256 `4c7f23c6…` = W1/W10/W19), plus
`probe/facets.probe.test.ts` (fixtures + two invented texts). Before = base `178682da`, after = `ba50809b`.
Summaries: `probe/summary-before.txt`, `probe/summary-after.txt`; labels: `probe/out-before|out-after/facets.json`.

Seed facet labels (what the Profile card prints):

| Input | Before | After |
|---|---|---|
| fictional-canopy.pdf topic | water retention, forest canopy water, **denser foliage retained**, **density affects water**, example denser foliage, **foliage retained water**, leaf canopy density, **retention after rain**, canopy moisture, fictional trees | water retention, forest canopy water, example denser foliage, leaf canopy density, canopy moisture, fictional trees, identical conditions, leaf area |
| fictional-canopy.pdf method | field sensors | field sensors, optical imaging |
| fictional-battery.pdf topic | **concentration affects cycling**, **concentration maintained capacity**, cell capacity, cycling stability, electrochemical cycling, fictional cells | cell capacity, cycling stability, electrochemical cycling, fictional cells, maintained capacity |
| fictional-battery.pdf object / method | battery electrolyte stability, electrolyte concentration / impedance spectroscopy | unchanged |
| invented-inner-verbs topic | **grazing pressure reduced**, **growth after drought**, **moisture affects root**, **pressure reduced plant**, reduced plant cover, fictional valley, root growth, channel width downstream, controlled channel width, lake ice duration, plant cover again | reduced plant cover, fictional valley, grazing pressure, root growth, channel width downstream, controlled channel width, lake ice duration, plant cover again, shortened lake ice, warmer winters (+ object sediment supply) |
| invented-known-terms | boundary layer, remote sensing, machine learning, deep learning, enhanced raman scattering, highly ordered pyrolytic, nitrogen doped graphene, ordered pyrolytic graphite + homograph-verb labels learning models map, learning read remote, probe nitrogen doped, pyrolytic graphite anchors | identical |

| Count | Before | After |
|---|---|---|
| Labels with a listed verb or inner "-ed" verb (fixtures 6 + invented 4) | 10 | **0** |
| Known-term labels kept (invented-known-terms, 7 checked) | 7 | **7** |
| Labels with a noun/verb homograph used as a verb (my adversarial text) | 4 | 4 (known limit) |

## Must-not-regress checks

| Check | Before | After |
|---|---|---|
| R-C3 canopy method / battery object+method | field sensors / yes | field sensors, optical imaging / yes |
| R-C18 seed reasons: verb fragments, ungrounded, non-admitting | 0 / 0 / 0 of 71 | 0 / 0 / 0 of 64 ("the terms" form 13 -> 7) |
| No-seed identity (HEAD vs merge-base; unusable vs none), fetch/model calls | true, true; 0/0 | true, true; 0/0 |
| Blank PDF seed | null | null |
| Seed-admitted canopy vs battery (runs c, g, h) | 5 vs 7 | **4 vs 7** (`c-topic` lost) |
| Run c top-10 after diversify, battery / canopy / none | 4 / 4 / 2 | **5 / 2 / 3** |
| Facet weight code (50/30/20 renormalised, `scoring.ts`) | — | untouched |

**C6 movement, flagged for a ruling.** `c-topic` ("Forest canopy water retention after rain…") canopy seed score
0.345 -> 0.282, below the 0.3 admission bar; `x-both`'s nearest seed flips to battery (canopy 0.614 -> 0.467, still
admitted by both). Attribution (`probe/attrib.probe.test.ts`, `out-attrib/attrib.json`, real `matchSeed`):
- before facets minus only the verb-holding phrases: c-topic 0.321, admitted. Removing the fragments alone (losing
  the shared word "rain" and the bogus "affects" match) does not cost the admission;
- after facets: 0.282, not admitted. The four freed topic slots are taken by clean phrases from the PDF
  ("identical conditions", "leaf area"), which dilute canopy's pooled topic vector (W1's C6 cause 2);
- after minus "identical conditions" only: 0.306, admitted; minus both new phrases: 0.321.
Options for the manager (none done here, out of R-C3b and this brief's files): accept as-is; add "identical
conditions" (methods boilerplate) to `SEED_BOILERPLATE_PHRASES` in `seed-pool/features.ts` (restores c-topic in
the attribution run; probe-fitted risk); or a scoring change to the pooled vector (W1 C6 fix 2).

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (web/) | exit 0 (after each commit) |
| eslint on the 2 touched files | exit 0 |
| `upload-concepts.test.ts` x3 | 34/34, 34/34, 34/34 |
| `src/lib/security/spend-scans.test.ts` | 50/50 |
| Seed probe (rank + extract + facets + attrib + bump) | 5/5 pass, fetch 0, model 0 |
| Full `npx vitest run` (worktree, after) | exit 0: 634 files / 2 skipped; 11,530 tests / 2 skipped |
| Mutation rule 1 / rule 2 | red 1 / red 3; sha256 restored equal |
