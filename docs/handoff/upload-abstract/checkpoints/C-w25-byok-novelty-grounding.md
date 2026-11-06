# C-w25-byok-novelty-grounding — a novelty line only on a sentence that states it (W25, Group 2 B then C), 2026-11-05

Brief: `briefs/W25-BYOK-NOVELTY-GROUNDING.md`, defect D-BYOK-2, manager ruling R-BYOK-2 (2026-11-05).
Evidence: `C:/Users/wbc13/AppData/Local/Temp/peer-rollout-evidence/byok/a3-b14-evidence.md`.
Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w25` (detached, base `5efdce84`). Not pushed, no branch.
Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w25/` (B investigation `B-investigation.md`, measure script
`measure.test.ts`, `measure-before.json`, `measure-after.json`).
Commits: `2bda41e4` (R-BYOK-2), plus this checkpoint.

## B finding (cause)

- The two evidence lines were per-result `keyResults[].novelty` lines, shown after "What is new here:". The field had
  no evidence by design (`report.ts` type docs), both prompts said "`newHere` ... and `novelty` ... carry no evidence
  sentence", and `verifyReportEvidence` verified only the result's own evidence, so the novelty rode along.
- `whatItProposes.newHere` was kept only when the line's own text was verbatim in the source (8a6fe511): prose lines
  were dropped but not counted, and a verbatim line was kept with no check that it states a novelty.
- Candidates: (a) evidence sentence required, verified verbatim — insufficient: a method sentence passes; (b) (a) plus
  the quote must itself state the novelty or the prior-work comparison — chosen (= R-BYOK-2); (c) prompt-only — no guard.

## Change (`2bda41e4`)

- `web/src/lib/papers/report.ts`: `PaperReportKeyResult.noveltyEvidence` / `noveltyEvidenceWhere`;
  `whatItProposes.newHereClaims: Claim[]` (each `newHere` line with its sentence; after verification `newHere` is
  exactly these claims' text). Sanitizer reads `newHere` items as strings or `{ text, evidence }`, `novelty` flat
  (`noveltyEvidence`) or nested (`{ text, evidence }`), and an already-shaped `newHereClaims` by text. Caps unchanged;
  the new evidence fields reuse `REPORT_CAPS.evidenceChars` (400). `noveltyEvidence` is never kept without `novelty`.
- `web/src/lib/papers/evidence.ts`: exported `statesNoveltyOrComparison(sentence)` (fixed cue list on the normalised
  quote: novel/novelty, for the first time, is the first, to our knowledge, unlike, in contrast to/with, contrary to,
  as opposed to, compared/comparison/relative to/with, outperform, surpass, improve on/over/upon, better than,
  prior/previous/existing/earlier/conventional/traditional/classical ... work/methods/studies/..., state of the art,
  than/over/against ... baseline(s), has/have/had not/never been, no prior/previous/existing, a new
  method/approach/framework/..., and a few Chinese equivalents). `verifyReportEvidence`: a result's novelty stays
  only if `noveltyEvidence` states novelty/comparison AND is in the corpus (same whole-quote match as every claim);
  then `noveltyEvidence` is the shown quote and `noveltyEvidenceWhere` its place. Otherwise `novelty` and its
  evidence are removed and 1 is counted; the result stays (a result dropped for its own evidence is counted once).
  Each `newHere` line needs its `newHereClaims` entry to pass the same test; every removed line is counted. The old
  "line itself verbatim" rule for `newHere` is replaced. All other claim rules unchanged.
- Prompts — `web/src/app/api/papers/report/route.ts` (shallow) and `web/src/lib/papers/deep-report.ts` (Pass 2;
  outside the brief's file list, but it holds the deep prompt the brief asks to change): schema asks for
  `newHere: [{ text, evidence }]` and `keyResults[].noveltyEvidence`, each "one sentence copied
  character-for-character ... that itself states this novelty or the comparison with prior work"; the "carry no
  evidence sentence" rule is replaced by the matching sentence ending "Never infer a novelty the abstract/paper does
  not state."; the task and system sentences say novelty is written only where the text states it.
- Not touched: `use-model-report.ts`, `page.tsx`, `reading.ts`, `report-outcome.ts` (W24), the renderers
  (`report-sections.tsx`, `reading-markdown.ts`) — they read the verified report and show the line as before; the
  quote travels on the wire but is not rendered (follow-up if the page should show it).

## Measure (stub provider, invented text, sanitize then verify on the deep corpus; scratch `measure.test.ts`)

| Case | newHere shown before -> after | result novelty shown before -> after | other claims (skim/methods/results) | droppedClaims | other bytes identical |
|---|---|---|---|---|---|
| (a) canopy-shaped text, invented novelty | 0 -> 0 | 1 -> 0 | 1/1/1 -> 1/1/1 | 0 -> 2 | yes |
| (a) course-shaped text, invented novelty | 0 -> 0 | 2 -> 0 | 0/1/2 -> 0/1/2 | 0 -> 3 | yes |
| (b) "Unlike prior work, we ..." + matching line and sentence | 0 -> 1 | 0 -> 0 | 0/0/1 -> 0/0/1 | 0 -> 0 | yes |

"Before" for (b) is 0 because the old sanitizer dropped `{ text, evidence }` items (it read strings only) and the
old rule needed the line itself verbatim. (c) "other bytes identical" compares the whole verified report with the
novelty fields and provenance removed.

## Cache key

- Client: `STORAGE_KEY = "peer-paper-report-v8"` in `web/src/components/reader/use-model-report.ts` must bump
  (v8 -> v9, v8 added to `LEGACY_STORAGE_KEYS`): cached reports replay without re-sanitizing for up to 7 days (deep)
  and still hold ungrounded novelty lines. NOT bumped here — the file is W24's this round. Manager to apply or route.
- `PAPER_REPORT_CACHE_STORAGE_KEY` (`report-cache-key.ts`) is read by no non-test code; bumping it changes nothing.
- Server Pass-1 caches hold the Pass-1 signal, not reports; route responses are no-store. No bump needed.

## Gates (worktree, node_modules junction for tests only)

- `npx tsc --noEmit` (web/): exit 0.
- eslint on the 9 touched files: exit 0.
- Touched tests (report, evidence, deep-report, report.questions, route) x3: 190/190 each run.
- `src/lib/security/spend-scans.test.ts`: 50/50.
- Wider run (lib/papers, api/papers, components/reader, app/papers, lib/security): 258 files, 5103 tests passed.

## Mutation (`web/src/lib/papers/evidence.ts`)

- sha256 before: `1af74c00891bb96f7fa3ea7b8a3d3d22e23307123d03281f12b10b3b24c43d3b`.
- M1 (rule falls back to candidate (a)): delete `if (!statesNoveltyOrComparison(evidence)) return null;` -> 5 red
  (canopy (a), course (a), "a verbatim sentence that only describes the method ...", "a 'new here' line is shown only
  with a grounded comparison sentence ...", route "R-BYOK-2: keeps a novelty line only ..."). Restored.
- M2 (key-result guard off): `if (!result.novelty) return result;` -> `if (result) return result;` -> 10 red.
  Restored.
- sha256 after both: `1af74c00891bb96f7fa3ea7b8a3d3d22e23307123d03281f12b10b3b24c43d3b` (identical).

## Re-aimed tests (none deleted, skipped or weakened)

- `report.questions.test.ts` "preserves all other verified bytes while grounding unsupported free prose": expected now
  also removes RAW's ungrounded result novelty and counts 2 more drops (1 -> 3); asserts the novelty is absent.
- `report.questions.test.ts` "never carries a droppedClaims number the model wrote ...": `dropped` 1 -> 3 (same reason);
  still asserts it is never the model's 7.

## Costs / residual

- Fixed lexicon: a paper that states its novelty in other words (or another language than English/Chinese) shows no
  novelty line — an omission, never a wrong line. A cue in a non-novelty sense ("compared with the control plot") lets
  a line through on a real comparison sentence of the paper.
- The check proves the quote is the paper's and states a novelty/comparison; it does not prove the line paraphrases
  that quote faithfully.
- Fewer "What is new here" lines overall; deep reports from older prompts in the client cache until the key bumps.
