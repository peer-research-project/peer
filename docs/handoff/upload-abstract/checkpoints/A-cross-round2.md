# A cross-review round 2: global upload, Notes and source truth

Source and targeted tests examined at main `4cff71ec5834dc2637c9d21a3dfc7dc4bc7f3d5d`, branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`. Read-only product review. No own rendered browser walk, real signed-in upload, private paper, model call, SQL execution or hosted delivery. My earlier current-reading identity, report-truth and seed ranking/output implementation and the two later seed fixes cannot receive independent PASS from me. Other-worker output corrections will be added after integration; this is not an aggregate independent score for Theme C.

## Findings and boundaries

No new hard failure demonstrated in the scoped paths. The Notes model has no existing archive action, so archive preservation cannot be asserted; an earlier manager ruling recorded that no archive feature existed. The masthead intentionally does not render on `/welcome`; any interpretation of “throughout app” that includes onboarding requires a product ruling or a rendered check, rather than silently assuming it is available there. Source inspection and mock tests cannot prove cross-account storage isolation or user-perceived flow.

On this HEAD, eight existing suites passed **113/113 tests**: masthead, upload availability UI and flow, Saved page, paper page, two note-tag suites, and enrichment. The independently authored source probe already present in the checkpoint directory passed **7/7** invented/mocked cases. These are fixture evidence, not device, live-source or hosted acceptance. The note-tag tests include code I wrote for current-reading identity and cannot serve as an independent PASS for that logic.

## Theme B units

1. PARTIAL/UNRUN: exact global label is in shared button and masthead markup; no own rendered walk.
2. PARTIAL/UNRUN: desktop and phone masthead markup has the action; chrome-free welcome is an explicit exception and accessibility on all actual screens is not proven.
3. PASS, source-level: standalone upload removed from home page; only shared masthead action is present in reviewed paths.
4. PARTIAL/UNRUN: paper page includes target action and tests cover its condition; actual reader visibility unverified here.
5. PARTIAL/UNRUN: visible entry and checking state in code, availability flow test passed; no own device retry walk.
6. PARTIAL/UNRUN: unavailable/error copy and Retry exist and mocked flow passed; real network failure/retry unrun.
7. UNRUN: endpoint storage auth/ownership/limits need a real or controlled multi-account integration gate.
8. PASS, source-level: global Notes points to `/saved#shelf-notes`, whose Notes section uses the existing notes store.
9. PARTIAL/UNRUN: collection and text search use existing notes; no claim of archive behavior or complete persisted edit workflow; identity safeguards are my own work.
10. PARTIAL/UNRUN: New note control and existing editor route are present; full user interaction unrun.
11–12. UNRUN by this reviewer: desktop/mobile rendered acceptance. Manager evidence is separate and must be referenced at its actual path and scope, not relabeled as my own walk.
13–14. UNRUN: hosted signed-in attachment and user-key deep-report workflow. These two alone cap any eventual 14-unit score at 12/14 = 85.71% until completed; thus the required 97.9% cannot be met from this evidence. With B9 and B11–14 unrun in this review, the theoretical ceiling for the remaining nine units is 9/14 = 64.29% before costs; the two fully source-verified units above yield a current provisional 2/14 = 14.29% before any assessed defect costs. This is an evidence score, not a claim the other behavior is broken.

## Theme A source boundary

Publisher enrichment source path and bounded mock probes executed, including unrelated JSON-LD identity and redirect checks from the existing independent source probe; seven passed. Source A7–12 remain PARTIAL unless the complete product path and required failure/redirect cases are independently covered. The prior round-2 source checkpoint provides narrower detailed assertions. No real DOI/arXiv/OpenAlex control was rerun here. My report/reading-truth corrections are excluded from independent grading. No full Theme A score or acceptance is asserted.

## Manager-supplied rendered evidence (separate observer)

Manager reports actual invented-note interactions: create two notes, search match/no-match, rename and persisted reload; Notes opens the collection; at 320 px the global label wraps in full and the paper attachment action is visible. Evidence paths: `C:/Users/wbc13/AppData/Local/Temp/peer-upload-ui-qa/desktop-notes.jpg`, `mobile320-notes.jpg`, `mobile320-two-notes.jpg`, `mobile320-paper.jpg`, `mobile320-paper-actions.jpg`. Desktop paper `desktop-paper.jpg` first showed stale compiled CSS failure; `desktop-paper-fresh-cache.jpg` records a later fresh-compiler recovery. These observations are manager-provided, not my independently repeated rendered walk; preserve both failure and recovery. Manager also supplied signed-out seed setup render and skip evidence under `C:/Users/wbc13/AppData/Local/Temp/peer-seed-manager-evidence/`; signed-in seed states, SQL and hosted workflows remain unrun.

## Later output corrections — bounded cross-review

The other-worker fixes were inspected at integrated HEAD `19d8a88a9ea4e721d652b60e70ff1d99a7f78c7c` (the Theme B and source gate above ran at `4cff71ec`, not this later HEAD). Reviewed type option placement (`a7a9f5a6`), seeded negative-feedback penalty (`9efb8dc2`), per-facet folded TF-IDF (`09c04ae9`, `19d8a88a`), owner-date archive boundary (`4b6f576b`), and owner-date prepare enqueue (`7e0984f3`). Five targeted suites, 69/69 tests passed: seeded scoring, matching, archive route, prepare job and discovery privacy. Tests use mocks or pure functions; the expected sanitized provider-error log appeared in the prepare-job test. No new hard defect demonstrated in this bounded cross-check.

The fixed paths now apply the existing negative penalty in seeded scoring, match folded facet terms locally, use owner-local archive date on installed schema, and select the owner's check-in date for installed-schema prepared jobs while retaining the explicit-absent-schema legacy path. Existing tests include Tokyo date, unavailable resolution, absent schema, and reordered terms. These are source/mock observations only; no Postgres transaction, DST matrix, multi-account run, live provider, real private PDF, ranking-quality benchmark, or hosted email was exercised. The underlying seed ranking/output architecture and initial implementation are my own, so neither these narrow corrections nor their tests constitute independent approval of the whole output system.
