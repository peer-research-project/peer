# Source enrichment and feed eligibility investigation

Manager B evidence, 2026-11-02 UTC (2026-11-01 America/Chicago). Baseline87f92259. No source/model request made for this code review.

## Source mechanism and ruling

- `papers/fetch-by-id.ts` only tries SemanticScholar when OpenAlex lacks abstract. Existing `fetchAbstract` has no non-test caller and can accept any description longer than60 characters. That does not establish author abstract text.
- A minimal wiring-only fix would be cheap but preserve provenance and generic-description defects. A bounded typed retrieval outcome is approved: source API abstract, then explicit publisher abstract metadata / ScholarlyArticle JSON-LD / abstract section; source/failure outcomes separate. Broad search/crawling/access bypass is rejected as unnecessary and unreliable.
- Existing `paywall-status.ts` treats401/402/403/451 as subscription on every non-aggregator. HTTP403 establishes request refusal, not subscription. `full-text.ts` drops final URL on failed fetch and therefore can blame doi.org. `appearsPaywalled` also treats CAPTCHA as subscription; `tryPdfLink` broadly matches the word access. These mechanisms need one coherent honest-status repair.
- Approved access rule:403/401/451 are blocked/unknown without explicit subscription evidence,402 payment may establish payment restriction, and successful page text may establish explicit subscription. CAPTCHA is blocked. Preserve final URL/host on failed HTML/PDF fetches; do not promise abstract fallback when none exists.

## Why a title-only record can be admitted

The code has no general abstract-required eligibility rule. This proves what is allowed, not which exact historical route admitted the user's screenshot paper; the original scored pool/profile/logs were not retrieved.

1. `scoring/keyword.ts:36-47` builds matching text from title, abstract-or-empty, and tags. `groundingWeight` at66 gives a title match weight1; tags weight0.85; abstract mentions are additional evidence.
2. `scoring/tfidf.ts:52-56` likewise builds vectors from title, optional abstract and tags.
3. `scoring/combine.ts:219-220` removes explicit exclusions/old dates, then scores the candidate. Required-topic gate at346 checks keyword qualification/nonliteral admission, not abstract presence. Semantic/citation and other declared retrieval channels can admit relevant candidates with no literal keyword hit.
4. `feed/pipeline.ts:826-901` filters source type, deduplicates, removes stale papers, scores/reranks and cuts the pool. It does not filter missing abstracts. Optional Jev receives `abstract: item.abstract ?? null` in `decisions/apply.ts:158-161`, and `jev-contract.test.ts:102-104` explicitly covers a null abstract.
5. `feed/mapper.ts:76-87` maps missing abstract to two empty summary fields. This is accurate source absence in the record, but downstream report generation previously ignored it.

Recommended behavior: keep inspectable relevance eligibility at Tier0; label title/metadata-only evidence and abstract retrieval status precisely, try bounded deterministic enrichment when opening the record, and require actual abstract or full text before model analysis. Silently adding an abstract-only gate would hide relevant records and change the product contract without user intent.

## Boundaries

The screenshot DOI has no OpenAlex/Crossref abstract according to prior live investigation; ordinary publisher requests returned403 while search indexed an Abstract section. A proper repair may still leave this paper's abstract unavailable while correctly explaining that it was blocked. No claim of fetched publisher abstract is allowed from a search snippet or403 response.
