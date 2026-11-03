# Paragraph-guide cached-hit upload race

Base `57737d91`; local detached commit `8861c9c2`. No push, production write, private input, external provider call or SQL.

Invented warm-cache test suspended `getFullText` after an owner/revision 1 check, changed the mocked upload to revision 2 or deleted it, then released the same previously cached document. Before the fix both paths returned HTTP 200 instead of 410; the failing results were reported to the manager. The route now rechecks owner/revision immediately after text retrieval, before cache-hit return and before model work, while retaining its existing post-model check. Both race variants now return 410 with private no-store; a cold-cache deletion test confirms no model invocation, and an unchanged-owner warm hit still returns 200. Existing model-in-flight race fixtures were explicitly adjusted to keep the ownership change after model work.

Three route, partition and auth/gate suites: 63 tests passed with invented data and stubbed providers. A mutation removing the new post-retrieval check caused the two warm-hit assertions to fail; original SHA-256 `0b1344026d61e86e14a7cb36a364ac4fd8de1f0e62c20f9f08d6a8b48ccc39f3` restored byte-for-byte. Targeted ESLint and nonincremental TypeScript passed. This is not a real hosted upload, live auth, provider, concurrency or deployment acceptance.
