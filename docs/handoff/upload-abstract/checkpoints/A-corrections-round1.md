# Independent A corrections review, round 1

Reviewed main at 989a7c4e (branch fixing-bugs-on-uploading-pdf-and-abstract-reading); source-worker follow-up corrections are concurrent and not assessed here. Nine targeted Vitest suites passed independently (200 tests): report route, evidence, reading source races, model-report compatibility, note cache, readiness predicate and retry, availability UI, and paper-page tests. Own scratch invented-input probes in A-invented.test.ts passed 2/2 using A-vitest.config.ts; no app code was edited. Tests are not rendered product or hosted acceptance.

## Prior findings

- **All claims rejected / free prose: GONE for tested case.** Own nonempty, unrelated abstract plus invented unsupported methods/proposal/findings/novelty probe returned empty summary fields, no novelty; code requires direct source match or retained evidence. Worker tests also cover partial survivors; report route suite passed.
- **Mismatched source and in-flight race: GONE for tested client hook paths.** `use-reading.ts` checks returned fingerprint before displaying or storing; independently reran synthetic stale-response and in-flight-change tests. The check does not guarantee source fetch succeeds or make a full browser acceptance.
- **Report content with no abstract: CHANGED, supported by targeted tests and code inspection.** `page.tsx:747` applies `reportForReading` to the one `report` used by page consumers; the direct raw `model.report` has no other executable reference in that file. Helper test verifies abstract report suppressed, truthful availability, full-text report preserved. Whole `Reader`/all sections were not rendered or interacted with here.
- **Readiness coverage deletion: CHANGED.** Predicate tests cover unknown/error/unavailable/available; hook test exercises failed fetch followed by successful retry. Code guards click, drop, selection and transfer while keeping entry rendered. Static tests and hook simulation do not establish real button interaction, focus, mobile visibility or an authenticated transfer.

## Remaining finding

**P2: Notes consumer does not establish current source identity.** `web/src/components/notes/note-tags.tsx:357-374` only checks each cached reading's fingerprint against its own key, then chooses the most recent entry for the paper without comparing to the current paper/source/upload revision. Own invented probe confirms a valid-looking older-source entry is returned. When the source or attached revision has changed and the current reading cannot be cached, this old body can be treated as authoritative by `passageIsLost`, causing an incorrect lost-passage indication. Preserve/use a current identity or return unknown when the identity cannot be established; test source change and failed new reading, plus stale private revision. Actual user-facing manifestation is not browser-verified.

## Actual controls and limits

Read root's `real-controls-initial.log`: screenshot record metadata/reading HTTP 200, abstract 0 chars and source transient (429) plus publisher blocked (403), reading full-text blocked with sciencedirect.com, no-store; arXiv 1706.03762 has 1135 abstract chars and HTML full text; OpenAlex W7204479535 has 2023 abstract chars and full-text none. These are earlier root measurements, not independent new requests or evidence that later source fixes pass. No paid models, private input, browser rendering or live upload used.

Rubric: do not issue a product acceptance score from these scoped tests. A1-6 have relevant unit evidence, but A5-6 retain the Notes cache issue and source worker changes remain pending. A7-16 remain pending fresh integrated/actual source review, with individual root observations above as partial evidence. B5-6 have simulated hook/predicate evidence; B1-4, B7-10 require integrated behavior review, B11-14 (desktop/mobile rendered and hosted workflows) UNRUN here. No two-round 97.9% gate can be closed by this review.
