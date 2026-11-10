# C-w9-seed-extract — seed extraction residuals (W9, Group 2 B+C), 2026-11-04

Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w9` (detached, base 1b005c69). Not pushed.
Commits: `ef0e15fe` (R-T1), `ac65cfb0` (R-P1), plus this checkpoint.

## R-T1 — seed title from the PDF Info /Title (D-C3-title)

B note:
- Cause: `web/src/lib/seed-pool/features.ts:73` (base) set `title: doc.title?.trim() || "Untitled PDF"`.
  `doc.title` is the layout title from `web/src/lib/papers/pdf-outline.ts:1705-1715` (`titleOf`: only lines
  larger than 1.25x the body size on page 1). A title line set in the body's size gives `null`.
  `web/src/lib/papers/pdf-text.ts:128-158` (`readPages`) never read the Info dictionary, so /Title was
  never available to any caller.
- The ordinary upload route (`api/papers/upload/route.ts:62-65`, `titleFromFileName`) has its own
  file-name fallback; out of bounds, not edited, not affected.
- Candidates: (1) parse `/Title (...)` out of the raw bytes inside `features.ts` (sync, but breaks on
  object streams and hex/UTF-16 strings); (2) make `seedFromExtractedDocument` async and reopen the PDF
  with unpdf `getMeta` (second full parse, signature change for all callers/tests); (3) read
  `getMetadata().info.Title` from the pdf.js document `extractPdfTextFromBytes` already opens, return it
  as `infoTitle` on `PdfTextResult`, and let the seed builder judge it. **Chosen: (3)**: one open
  (P0-05 open-count tests unchanged), pdf.js decodes the string, ordinary uploads ignore the field.
- Implementation: `usableInfoTitle` (features.ts) refuses empty/whitespace, > 300 chars, `untitled…`,
  `unspecified`, `unknown`, `Microsoft Word|PowerPoint|Excel - …`, and file-name-like titles
  (`.pdf/.doc(x)/.odt/.rtf/.tex/.dvi/.ps/.ppt(x)`); control chars and whitespace runs collapse. Used only
  when the layout title is missing; otherwise "Untitled PDF". `seed-pool/assets/route.ts` passes
  `extracted.infoTitle`. Test helper `minimalPdf` gained an optional `{ infoTitle }`.
- Not changed: `verifiedPublicDoi` still compares Crossref against the layout title only (a seed whose
  title comes from Info /Title gets no DOI verification). Seeds already stored as "Untitled PDF" are not
  backfilled.

Tests: `web/src/lib/seed-pool/features.info-title.test.ts` (invented glacier-meltwater PDF built and read
by real pdf.js: same-size title + Info /Title gives that title; no/generic Info gives "Untitled PDF"; a
layout title wins; `usableInfoTitle` table) and a route test (the builder receives `infoTitle`).
Before (source files at base, tests kept): 3 failed (`expected 'Untitled PDF' to be 'Fictional study:
glacier meltwater se…'`, `usableInfoTitle is not a function`, route call args). After: pass.
Mutation: features.ts title line reverted to `doc.title?.trim() || "Untitled PDF"`: 1 failed / 3 passed;
restored; sha256 before = after = `ad5b5817ea7af2cb73fb4a7db2f71616b697d1ae4f5b0625152f6205e12c0d21`.

## R-P1 — no boundary verbs/function words in phrases (D-C18-phrase)

B note:
- Cause: `web/src/lib/preferences/upload-concepts.ts:43-50` (base) STOP has using/used/show/shows/is/are/
  was/were/of/for/with/and/the/to/in/on/under/than/how but not affects/affect/affected/after; line 147
  breaks an n-gram only on STOP or < 3-letter tokens, so "electrolyte concentration affects" and
  "retention after rain" are candidates; lines 156-158 filter only by length/count/acceptability.
- Callers of `extractUploadConcepts`: `seed-pool/features.ts` (seed facets, hence seed reasons) and
  `app/api/papers/upload/route.ts:281` (ordinary upload `preferenceSignals`). Both change.
- Candidates: (1) add the words to STOP (also breaks mid-phrase use, and changes `matchUploadedPaper`
  title-token overlap, which reads STOP); (2) trim each ranked label in place and keep the longer
  phrase's rank (promotes the trimmed phrase above its own score: a scoring change); (3) drop a
  candidate whose first/last token is in the ruled list. **Chosen: (3)**: the trimmed phrase is always
  its own candidate from the same occurrences (same section, count >= and same title flag), so this is
  trim-then-dedupe with no double counting; it still passes every existing gate (a single word must be
  a known domain term, the existing minimum). No score/weight/facet change.
- `UPLOAD_CONCEPT_EXTRACTION_VERSION` stays 14 deliberately: its comment asks for a bump on filter
  changes, but the same number keys the cached upload reading (`full-text.ts` `uploadDocKey`), so a bump
  re-reads every cached upload. **Manager decision.**
- Residual (outside the ruled list, not changed): a verb inside a phrase ("density affects water",
  "concentration affects cycling", "retention after rain") and edge verbs not on the list ("denser
  foliage retained", "concentration maintained capacity").

Tests: `upload-concepts.test.ts` "R-P1 …" (invented battery/canopy-shaped text: no label starts/ends on a
list word; "electrolyte concentration", "cycling stability", "suspended load", "canopy density", "water
retention" kept; "density"/"retention" alone dropped; "glacier meltwater" listed once).
Before (base extractor): 2 failed. After: 21/21.
Mutation: removed `&& !endsOnFunctionWord(label)`: 2 failed; restored; sha256 before = after =
`63e1fff06013b9189ba9e973b6b051a69f96be3f64320e8b875a64dd7083fe5f`.

## W1 probe re-run (`C:/Users/wbc13/AppData/Local/Temp/peer-w9-probe`)

Copy of peer-claude-w1 (rank + extract probes), WEB/OUT from env. Before = main checkout `web/` (base
source, read only), after = this worktree. One probe edit: the facet weighted-sum `expect` (line 117)
failed on the base too (scoring renormalizes over present facets since W1), so it is recorded as
`weightedRecomputeMatches` instead of asserted. Fixture SHAs and every other assertion unchanged.

| | before | after |
|---|---|---|
| canopy topic | water retention, forest canopy water, **canopy density affects**, denser foliage retained, density affects water, example denser foliage, foliage retained water, leaf canopy density, retention after rain, canopy moisture, fictional trees | same minus **canopy density affects**, plus field sensors |
| battery topic | **affects cycling stability**, concentration affects cycling, concentration maintained capacity, cell capacity, electrochemical cycling, fictional cells | concentration affects cycling, concentration maintained capacity, cell capacity, **cycling stability**, electrochemical cycling, fictional cells |
| battery object | battery electrolyte stability, **electrolyte concentration affects** | battery electrolyte stability, **electrolyte concentration** |
| battery method | impedance spectroscopy | impedance spectroscopy |
| distinct reasons naming an edge-verb phrase | 3 ("canopy density affects" x2, "electrolyte concentration affects" x2 phrasing) | 0 |
| seed reasons ungrounded | 0 / 78 | 0 / 78 |
| noSeedIdentity | headVsMergeBase true, unusableSeedVsNoSeed true | same |
| network / model calls | 0 / 0 | 0 / 0 |
| interestRecall (run c) | all canopy + battery relevant items passed and seed-admitted | identical |

Fixture titles come from the layout (larger bold line) on both sides, so R-T1 does not move the probe.

## Gates

- `npx tsc --noEmit --incremental false`: 0 errors.
- `npx eslint` on every touched file: clean.
- Touched dirs + upload callers (`lib/preferences`, `lib/seed-pool`, `api/papers/upload`, `api/seed-pool`,
  `lib/papers/full-text`): 30 files / 377 tests pass; `lib/papers`: 73 files pass.
- Full `npx vitest run`: 631 files passed, 2 skipped; 11476 tests passed, 2 skipped. No flakes.
