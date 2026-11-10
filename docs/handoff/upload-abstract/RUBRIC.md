# Upload / source truth / Notes product rubric

Target: user-confirmed97.9% in EACH theme for TWO consecutive independently scored rounds. Ruling changes only in repair state. No exclusions presently authorized.

Each unit is1. PASS count is number fully satisfied. Defect cost: unusable1.0; misleading0.5; cosmetic0.25. Score=max(0,100*(PASS-costs)/units). Unrun units are not PASS. Hard requirements (source honesty, authentication, ownership, no private shared state, no unsupported model generation) hold regardless of percentage. Show fixture and actual-input scores separately; show each actual paper individually.

## Theme A: source and report truth (16 units)

1. Empty abstract/no readable full text makes zero model calls in JSON.
2. Same in NDJSON, including failed deep fallback.
3. Real readable full text still allows deep reports without abstract.
4. Unsupported proposal/findings/novelty prose cannot survive empty evidence corpus.
5. Availability/provenance reflects actual evidence, including legacy cached results.
6. Relevant report/reading caches invalidate on repaired version/source changes without erasing unrelated user data.
7. Deterministic enrichment is connected to real lookup flow.
8. Source API failures distinguish absence from transient or blocked retrieval.
9. Publisher meta/JSON-LD/section enrichment accepts actual abstract, rejects TLDR/generic description.
10. Enrichment has bounded requests/time/retries and accurate provenance.
11. HTTP403 is blocked/unknown unless actual subscription evidence is present.
12. Final redirect host is preserved accurately.
13. Screenshot DOI result is honest through metadata and reading path, even if abstract remains blocked.
14. arxiv:1706.03762 control retains legitimate abstract/full text.
15. openalex:W7204479535 control retains legitimate abstract and honest full-text status.
16. Feed eligibility/ranking and missing-source status are explained by actual code without silently imposing new gate.

## Theme B: upload and Notes usability (14 units)

1. Global Write replaced with exact `upload pdf paper to deep read` label.
2. Standalone upload accessible throughout app.
3. Homepage duplicate standalone upload removed after move.
4. Paper attachment `Upload full article PDF` remains visible.
5. Readiness checking keeps persistent entries and communicates state.
6. Unavailable/error state explains and allows retry.
7. Storage auth/private ownership/size/signed access remain enforced.
8. Adjacent global `notes` opens existing notes collection.
9. Collection includes all prior notes and preserves persistence, search, edit and the existing note actions (rename, duplicate, export and delete). Archive is conditional on an existing implementation; none was found in the original Notes model/UI (manager ruling24).
10. Existing note creation remains reachable; collection is not a blank new-note editor.
11. Desktop rendered path is clear and usable.
12. Mobile rendered path is clear and usable.
13. Actual signed-in hosted PDF upload and attachment reading succeeds.
14. Actual standalone upload to user-key deep report succeeds.

## Scores

## Theme C: Seed Paper Pool (18 units, authorized2026-11-02 UTC)

1. Optional onboarding accepts1-5PDFs, recommends3-5, max5 enforced.
2. Profile clearly shows active/pending seeds, parse status, effective owner-local date, add/remove/replace/undo.
3. Actual PDF text/terms/object/method features work without paidmodels; parsefail cannotcreatebogusseed.
4. Separate nearest1-2seed representation preserves distinctinterests.
5. Canonical duplicate/crosssource copies cannotmultiply boost.
6. Retrieval/output diversity represents multiple seed interests.
7. Initial40/35/15/10 normalizedhypothesis appliedinspectably; hard exclusions override.
8. Missing feedback weight reallocates to declaredintent; nozero penalty.
9. No-seed user follows existingranking path gracefully.
10. Firsteverpool affects firstbriefing immediately.
11. Lateredits activate nextOWNERLOCALCALENDARDATE (including DST/timezone cases), currentday frozen.
12. Multipleedits retainlatestpending, undo restorespriorpending/active semantics.
13. Web/email/preparedjobs/cache use sameactivepoolversion.
14. Seedpurpose neverrecordsordinaryuploadpreference/doublecount; removedseedstrongsignal absent.
15. Active seedPDF/features persist beyondordinary30dayexpiry.
16. Reversible removal is notnegativefeedback; explicitownerforget immediatelyremovesasset/features underclearsemantics.
17. Authentication/privateownership enforced throughout upload/read/edit/delete/jobs/cache.
18. Explanations name actualsupportedmatch; UI/content claims truthful andportable.

## Scores (all three themes must meet target)

| Round | Commit | A fixture | A real items | B rendered | B hosted workflow | C seed | Consecutive at target | Readers / evidence |
|---|---|---|---|---|---|---|---|---|
| 0 investigation |87f92259|not scored|defects reproduced|entries hidden live|unrun|not scoped then|0|investigation only|
