# Independent A: report/source truth and Notes identity

Reviewed source/report behavior at main `9aa58f6ab37755bb89e9d5679459182e31b6e182`; privacy test-only commit `50d4ae54` then landed. Saved-card correction reviewed separately at `56902366` (includes `fe34f4b5`). No source/report/Notes product code authored by this reviewer. This is a bounded independent fixture/code review, not a scored product acceptance round; no 97.9% or two-round pass is claimed.

## New finding — Notes empty/unavailable body incorrectly declares a passage lost

`storedBodyOf` accepts an identity-matching fresh reading whose `body` is `[]` without checking that usable full text exists, and `passageIsLost` treats `[]` as authoritative. Independently invented `A-notes-empty-body.test.ts` produced `body:[]`, `declaredLost:true` for an old anchor when current provenance is `paywalled`, failing the expected unknown/not-lost result. `buildReading` emits `body:[]` without a document; a settled paywalled result can have readability `abstract` and be cached when metadata status permits. `PaperBody` already avoids writing lost anchors for `body.length===0`. This is separate from the prior source-fingerprint mismatch fix. Do not treat lack of readable body as proof a passage was removed; preserve real nonempty-body change detection. Manager assigned a separate correction worker. This fixture failed by design to expose the issue; no actual user note or browser manifestation was tested.

## Source/report rubric units — independent local fixture status

1. PASS fixture: empty source in JSON made zero shallow or deep model calls in tested mock route cases.
2. PASS fixture: equivalent NDJSON and failed deep fallback in tested route cases; no real provider called.
3. PASS fixture: full-text-only deep path reaches the mocked deep generator; no live model or real upload.
4. PASS fixture: independent invented nonempty unrelated abstract plus unsupported prose/evidence clears unsupported summary/novelty; source verifier tests pass.
5. PARTIAL: reportForReading suppresses model-abstract report without abstract and availability tests pass; full Reader/browser verification not performed. Notes cached-body failure above remains open.
6. PARTIAL: v8 report key and v4 fingerprinted reading invalidate old source identities in tests; current unreadable empty-body Notes gap remains. Saved-card consumer independently reviewed below. No browser persistence test in this review.
7. PASS fixture/code: fetch-by-id calls retrieveAbstract for missing OpenAlex abstract; source tests pass.
8. PASS fixture: missing versus 429/500/blocked/error cases checked by source/enrichment/route tests; real external availability remains variable.
9. PASS fixture: accepted explicit metadata/JSON-LD/section and rejected generic/TLDR/unrelated/truncation cases; unrelated graph article identity tested independently.
10. PASS bounded fixture/code: manual redirect host restrictions and 5-hop maximum tested independently; no claim of universal source coverage.
11. PASS fixture/code: 403 is blocked/unknown in tested paths, not subscription proof.
12. PASS fixture/code: redirect final host attribution tested; no live publisher inference.
13. UNRUN fresh actual: prior manager reported screenshot OpenAlex W7222962933 metadata+reading 200, abstract zero, transient/blocked sources and ScienceDirect blocked host, no-store. This reviewer did not rerun and local server 4314 was unavailable. Treat as historical evidence, not current verification.
14. UNRUN fresh actual: prior manager reported arXiv 1706.03762 abstract 1135 characters, 7 sentences, full HTML. Historical only.
15. UNRUN fresh actual: prior manager reported OpenAlex W7204479535 abstract 2023 characters, 11 sentences, no full text. Historical only.
16. PASS fixture/code: independent invented title-only candidate matching a declared topic was admitted; no abstract-only feed gate imposed. This is not a quality or ranking benchmark.

## Executed checks and limitations

- 8 targeted report/evidence/reading/enrichment/Notes suites: 264 tests passed. Existing report-route tests explicitly exercise JSON and NDJSON empty-source and full-text-only conditions. Independent unsupported-prose probe: 1 passed (older unrelated stale-marker probe intentionally not selected). Independent source graph/redirect probes: 7 passed. Invented title-only scoring probe: 1 passed; an older seed feedback probe was deliberately not selected because it asserted a previously fixed regression.
- Additional six source/full-text suites: 5 suites passed, one failed; 58 tests passed / one failed. The failed assertion is `full-text.test.ts:304` expecting POSIX mode 0600 while Windows reported 0666, consistent with the recorded baseline platform-mode failure. Do not infer a Unix permissions or security pass from it.
- Saved-card correction at `56902366`: card/reading suites 3 / 14 passed. Independent invented cache probe passed current source+revision (48 minutes) and rejected changed source and attachment revision. This establishes those tested cache behaviors only, not a rendered card or hosted workflow.
- No paid model, private input, production write, SQL migration, deployment, or fresh actual control request. Browser and hosted end-to-end checks remain UNRUN. Product score and independent multi-round gate remain open.

## Post-fix Notes review — exact HEAD 6e88bdeb52b556e2746c3a971e50b0a5534672f3

The identical independent invented empty-body probe that failed above now passes: `storedBodyOf` returns null and `passageIsLost` returns false for an identity-matching paywalled reading with empty body. The fix also gates `PaperBody`'s live lost-anchor publication using the shared readable-body predicate. Independent targeted Notes/lost, live unreadable-body and reading-identity suites passed 3 / 28; they retain positive assertions that genuinely readable changed body and explicit in-memory lost signals can mark an anchor lost. The source and test review is limited to the tested shapes; no browser note interaction or live source outage was reproduced. Earlier failure is preserved above. The other actual-public, hosted, SQL and overall acceptance limits remain unchanged.
