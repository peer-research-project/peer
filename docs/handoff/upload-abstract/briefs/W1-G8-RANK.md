# Brief W1-G8-RANK (Group 1, A/B role: measure, no product code changes) — 2026-11-04

Repo: C:/I/Personal/Github - start up project/Peer, branch fixing-bugs-on-uploading-pdf-and-abstract-reading, HEAD 71d0c3f8. Do NOT git commit/branch/push/reset/clean/stage. Do NOT edit anything under web/src or web/supabase. Do not touch .env files or print secrets. No network, no model calls, no Supabase.

Goal: produce reproducible, instrumented evidence for RUBRIC.md Theme C units C3-C9 and C18 (seed recommendation behaviour) using the REAL ranking/seed code paths with INVENTED inputs only.

Read first: docs/handoff/upload-abstract/SEED-POOL-APPROVED-SPEC.md, RUBRIC.md (Theme C), checkpoints/A-hosted-acceptance-plan.md rows C1-C9, C-seed-ranking-output.md, C-peer-pdf-fixtures.md, and the seed/ranking modules under web/src (find them; e.g. grep seed, blend, tfidf, nearest).

Build (in C:/Users/wbc13/AppData/Local/Temp/peer-claude-w1/ only; you may put a runnable probe script there and run it with the repo's installed tooling, e.g. `npx tsx` or vitest with a config pointing at a temp test file outside web/src — do not add dependencies):
- A fixed invented candidate set (>=20 items) with: matched topic, matched object, method-only, unrelated negative controls, plural/word-order variants, a cross-source canonical duplicate pair, an explicitly excluded item, an item with negative feedback.
- Two distinct invented seed interests (use the fixtures docs/handoff/upload-abstract/checkpoints/hosted-fixtures/fictional-canopy.pdf and fictional-battery.pdf through the real extraction -> seed path, as C-peer-pdf-fixtures.md did).
- Runs: (a) no seed, (b) one seed, (c) both seeds, (d) both seeds + no feedback, (e) both + positive feedback, (f) duplicate seed copies.
Measure and report with numbers: whether 40/35/15/10 weights and 50/30/20 facet weights are applied as specified (instrument the actual component values, do not infer from ordering); missing-feedback weight reallocated to intent; nearest 1-2 seed per candidate; canonical duplicates do not multiply; diversity across both interests in top-N; hard exclusion and negative feedback still win; no-seed path identical to existing ranking; reasons name actually matched facets; blank PDF creates no seed; no model/network call (assert via spies/mocks).

Output: write checkpoint docs/handoff/upload-abstract/checkpoints/A-w1-seed-ranking-evidence.md (append-only new file): per unit C3-C9,C18 → PASS / FAIL(defect cost unusable 1.0 / misleading 0.5 / cosmetic 0.25) / UNRUN with exact evidence (command, output path, numbers). Any FAIL: give file:line cause and 3 candidate fixes with cost, recommend one (B role) — do NOT fix. Keep logs in the Temp folder.
Final reply: one paragraph + the per-unit table.
