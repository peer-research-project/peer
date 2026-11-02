# Independent A source review, round 2

Reviewed integrated source at f8af156c on branch fixing-bugs-on-uploading-pdf-and-abstract-reading. No app edits, external/internal network calls, private input, paid model, browser acceptance or hosted upload. Executed seven targeted suites against main: 69/69 passed (enrich, OpenAlex/arXiv failure and challenge, Semantic Scholar, and metadata and reading route suites). Executed seven independently authored invented-input tests in A-source-invented.test.ts with mocked transport: 7/7 passed. Scratch config: A-source-vitest.config.ts.

Prior findings:

1. **Redirect SSRF: GONE for approved bounded policy and tested cases.** `enrich.ts:104-139` checks trusted HTTPS host, no credentials/port and validates each manually followed hop; at most five requests (four redirects). Own tests rejected IP, lookalike suffix, userinfo, scheme-relative explicit :443 and HTTP downgrade without fetching the target; loop was bounded; source S2 request explicitly specifies manual redirect mode. Unknown publishers are blocked; approved allowlist policy does not assert general DNS pinning/rebinding protection.
2. **Lookup outages mapped to 404: GONE for tested source paths.** Independently reran OpenAlex and arXiv route tests with 404, 429, 500, timeout and invalid record through metadata and reading endpoints: 404 stays 404; other cases return 503/no-store.
3. **First unrelated JSON-LD article accepted: GONE for tested inputs.** Own graph with an unrelated article first and target DOI second returns target abstract. Existing tests also exercise ambiguous/conflicting identity. This does not prove every publisher metadata format can be retrieved.
4. **200 CAPTCHA cached as missing: GONE for tested challenges.** Three mocked challenge strings drive metadata blocked and metadata/reading no-store in targeted tests. Actual publisher challenge variants remain unverified.

No new actionable source finding in this scoped review. Source worker tests and mutation notes are separate evidence. The actual DOI, arXiv and OpenAlex controls must be rerun on this integrated code; full browser rendering, authenticated hosted upload and user-key deep workflow remain unrun here. No overall product score or 97.9% gate asserted.
