# C-w24-byok-standalone-deep — a standalone upload gets the deep report; "could not finish" only after a real ask (W24, Group 1 C), 2026-11-05

Brief: `briefs/W24-BYOK-STANDALONE-DEEP.md`, manager ruling R-BYOK-1 (2026-11-05), defect D-BYOK-1.
Evidence: `C:/Users/wbc13/AppData/Local/Temp/peer-rollout-evidence/byok/a3-b14-evidence.md` (B14).
Worktree: `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w24` (detached, base `5efdce84`). Not pushed, no branch.
Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w24/` (before run `before-asked.txt`, mutation backups and sha256s).
Commits: `12fb4d87` (rule 1), `d7680f15` (rule 2), plus this checkpoint.

Files touched: `web/src/components/reader/use-model-report.ts`, `web/src/lib/reader/report-outcome.ts`,
`web/src/app/papers/[id]/page.tsx` (one comment line only, naming the standalone upload in the gist-gate comment),
tests `use-model-report.test.ts`, `use-model-report.asked.test.ts` (new), `report-outcome.test.ts`.
Untouched: `web/src/app/api/papers/report/route.ts`, `web/src/lib/papers/report.ts` (W25), `web/src/lib/papers/reading.ts`
(the MODEL_FAILED line and its selector `modelFailed` needed no change: the fix is in what feeds `modelFailed`).

## Rule 1 (`12fb4d87`)

`deepReportRequested(profile, paper, aiMode)` is now true when `paper.id` starts with `upload:` (a standalone upload),
as it already was for `paper.fullTextUploadId` (an attached PDF), still only with `aiMode !== "none"`. The paper
parameter widened to `Pick<Paper, "fullTextUploadId"> & Partial<Pick<Paper, "id">>`. The page's gist pass reads the
same predicate, so on a standalone upload with a key it now runs too (one switch, as P3-05 requires).

## Rule 2 (`d7680f15`)

`report-outcome.ts` gains `requestAbstract(paper)` (the route's `fullAbstract` join, mirrored) and
`modelAsked(providerAsked, { abstract, fullTextRead })` = `providerAsked && (abstract.trim() !== "" || fullTextRead)`.
The hook settles the stream's report with `modelAsked(asked, { abstract, fullTextRead })`, where `fullTextRead` is set
by the stream's `reading` stage (the route emits it only once it holds the full text, right before the deep model call),
and the JSON fallback with `modelAsked(userProviderConfigured, { abstract, fullTextRead: deep })` (no stages on that
path; a deep request is assumed to have reached the full text, the previous behaviour). `fail()` for stream/JSON errors
and the 200 s deadline is unchanged.

## Before / after (invented inputs, `use-model-report.asked.test.ts`; before = run on `5efdce84`, saved in scratch)

| Case | Before | After |
|---|---|---|
| (a) standalone upload + key + Deep report off | abstract request (`deepReport: false`), no report | deep request, deep report shown, not failed |
| (b) public paper with abstract + key + switch off | abstract tier | unchanged: abstract tier |
| (c) no key (standalone / abstract / no abstract) | no `llmOverride`, not deep, no failure | unchanged |
| (d) abstract-tier empty report, no abstract (stream) | `failed: true` -> "Your model could not finish..." | `failed: false`; Decision block shows only "Peer could not retrieve an abstract — only the record..." |
| (d) same via JSON fallback | `failed: true` | `failed: false` |
| deep, no full text found, no abstract (no `reading` stage) | `failed: true` | `failed: false` |
| (e) abstract asked, empty model output | failed, line shown | unchanged: failed, line shown |
| (e) deep read reached full text, empty (standalone) | not reached (request was not deep) | failed, line shown |
| (e) stream error on a deep request | failed | unchanged: failed |

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (web/) | exit 0 |
| eslint on the 6 touched files | exit 0 |
| touched tests x3 (use-model-report*, report-outcome, reading*, page.paragraph-guide; 21 files) | 637/637 passed, 3 of 3 runs |
| spend-scans test | 50/50 passed |
| wider run (components/reader, app/papers, app/privacy, lib/reader, lib/papers, api/papers/report) | 259 files, 5220 tests passed |

## Mutations

| Rule | Mutation | Red | sha256 before = after |
|---|---|---|---|
| 1 | drop the `standaloneUpload` term from `deepReportRequested` | 3 tests (standalone case, cache read-back, hook (a)) | `2121d960aac6e1f4b18cc6753edde9ffc6ac88c6c49adef4cb0ced99f20feb40` both |
| 2 | `modelAsked` returns `providerAsked` (the pre-fix rule) | 4 tests (unit absence case, hook (d) stream, (d) JSON, deep-no-full-text) | `d8abe7dbb868139301e4c85bf38b9a9bae6e219556039312bfa47d094c468ee7` both |

## Re-aimed tests (none deleted, skipped or weakened)

- `use-model-report.test.ts` "is false with the switch off and no attached PDF": comment said a standalone upload is
  "the abstract report"; assertion (`paper` undefined -> false) kept, a public-id case added. Reason: R-BYOK-1 (1).
- `use-model-report.test.ts` "reads a standalone upload's report back on the second mount": cached depth `abstract`
  -> `deep`. Reason: R-BYOK-1 (1); the guarded behaviour (cache read-back) is unchanged.

## For the manager (not changed: outside this brief's files)

- `/privacy` "Who else sees a request" says a paper's text is sent "when you turn on Deep report in your profile or
  attach a PDF to the paper" (pinned by `app/privacy/page.test.tsx` SEES_TEXT). After rule 1 a standalone uploaded PDF's
  text is also sent to the reader's own model on open (and once more for the map gists). Whether "attach a PDF" covers
  "upload a PDF" is a copy ruling; the `page.paragraph-guide.test.ts` header comment also still describes the
  standalone-upload gist send with the switch off as the P3-05 bug.
- `page.tsx` passes `deepRequested = Boolean(profile.deepReportEnabled)` to the Decision block's `fullTextClause`; for an
  attached PDF whose deep step fell back to an abstract report it still says "turn on deep reports in Profile".
  Pre-existing, cannot arise for a standalone upload (no abstract, so no abstract-basis report renders); left alone.
- The JSON-fallback path cannot see the `reading` stage, so a deep request with no full text and no abstract that ends
  on the JSON path still reads as failed (previous behaviour). Only the route can say exactly whether it called a model.
