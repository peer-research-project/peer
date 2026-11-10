# Brief W2-G6-ABSTRACT (Group 2, A role: measure on isolated test target, no product code changes) — 2026-11-04

Repo: C:/I/Personal/Github - start up project/Peer, HEAD 71d0c3f8. Do NOT git commit/branch/push/reset/clean/stage; do NOT edit web/src, web/supabase, .env files; never print secrets. No browser.

A local dev server is running at http://localhost:3000 connected ONLY to the isolated Supabase test project peer-test (ref cbsbtkvbmvyznerbpmxg); email and all site AI keys are blanked. Do not start/stop it. If it is down, report that and stop.

Goal: RUBRIC.md Theme A real-item units A5, A8, A10-A16 re-measured through the running test target's public (unauthenticated) metadata/reading API paths, plus A1/A2 zero-model-call evidence where observable without a key.
Read first: docs/handoff/upload-abstract/RUBRIC.md Theme A, checkpoints/A-current-public-controls.md (the 27b local-API measurement and its exact routes/commands — reuse them), A-report-source-final.md, A-source-round2.md.
Inputs (exactly these three): openalex:W7222962933 (DOI 10.1016/j.psep.2026.109758), arxiv:1706.03762, openalex:W7204479535.
For each: call the same metadata and reading endpoints A-current-public-controls.md used, against http://localhost:3000. Record status, timing, abstract presence/length/sentence count, full-text availability label, provenance fields, Cache-Control headers (no-store where private), honest blocked/transient/absent distinctions (403 must not be called a paywall without evidence; 429 transient), final redirect host. Repeat each call twice to check stability/caching. Also try the NDJSON/report route WITHOUT any key for the abstract-less paper and confirm zero model calls / honest unavailable message (no fabricated proposal/findings).
Do not send cookies or any key. Bounded: at most 3 calls per endpoint per paper.

Output: new checkpoint docs/handoff/upload-abstract/checkpoints/A-w2-test-target-source-truth.md: per unit PASS / FAIL(cost) / UNRUN with exact commands, outputs (logs in C:/Users/wbc13/AppData/Local/Temp/peer-claude-w2/), and comparison to the 27b local record. Any FAIL: file:line cause + 3 candidate fixes with cost, recommend one — do NOT fix.
Final reply: one paragraph + per-unit table.
