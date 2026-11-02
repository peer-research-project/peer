# Upload / source truth / Notes product rubric

Target: provisional97.9% in EACH theme for TWO consecutive independently scored rounds; user choice pending. Ruling changes only in repair state. No exclusions presently authorized.

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
9. Collection includes all prior notes, preserves persistence/search/edit/archive.
10. Existing note creation remains reachable; collection is not a blank new-note editor.
11. Desktop rendered path is clear and usable.
12. Mobile rendered path is clear and usable.
13. Actual signed-in hosted PDF upload and attachment reading succeeds.
14. Actual standalone upload to user-key deep report succeeds.

## Scores

| Round | Commit | A fixture | A real items | B rendered | B hosted workflow | Consecutive at target | Readers / evidence |
|---|---|---|---|---|---|---|---|
| 0 investigation |87f92259|not scored|defects reproduced|entries hidden live|unrun|0|investigation only|
