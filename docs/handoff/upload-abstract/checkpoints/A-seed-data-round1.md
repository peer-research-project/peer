# Independent A review: Seed Pool data and UI, round 1

Reviewed and tested main HEAD `e5c5f80773039ee046e35bfed7a96c8ab2b12684` on branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`. This is a bounded review, not product acceptance. Ranking/output was implemented by this reviewer and is not independently graded here. SQL was inspected but not executed against Postgres; RLS, locking, owner-local date transitions, real concurrent writers and storage behavior remain unverified.

## Findings

1. **Onboarding can silently advance with an unsaved or unfinished pool (C1/C10, FAIL).** `web/src/app/welcome/page.tsx:158,409,585` allows Next regardless of the seed editor's busy/dirty state. `web/src/components/seed-pool/seed-pool.tsx:73-77,81-84,90-95,125` marks processed files ready and selects them locally; only the separate Save pool action commits the pool. Advancing after ready without saving discards the selection on unmount; advancing during processing can stop subsequent files and leave the completed asset outside the pool. The first briefing can therefore run without the papers the user just chose. This is source-path evidence, not a rendered interaction test.

2. **Staged PDF cleanup failure can be hidden from explicit forget (C16, FAIL).** For direct storage uploads, `web/src/lib/seed-pool/client-api.ts:23-31` first writes an incoming staged PDF, then passes its path to the seed endpoint. `web/src/lib/papers/upload-store.ts:268-272` swallows a failed staged deletion, and `web/src/app/api/seed-pool/assets/route.ts:66` does not retain a cleanup obligation. The seed forget route `web/src/app/api/seed-pool/assets/[id]/route.ts:22-34` only removes tracked `seed-pool/<owner>/<id>.pdf` objects. Consequently, if the earlier incoming deletion failed, forget can report completion while the staged copy persists until a later successful age-based sweep; that sweep itself is not verified here. No hosted failure injection was run. The current upload-route test mocks staged ownership as false, so it does not cover this case.

## Evidence and unit disposition

- Focused fixture gate on this HEAD: eight Vitest files, **49/49 tests passed**: seed features, state, server, lifecycle, migration, seed API, asset API, and seed component. These are unit/mock and SQL-text tests, not live Postgres or browser evidence.
- Independent invented input: a locally generated fictional forest-canopy PDF was processed through the real `extractPdfTextFromBytes` and `seedFromExtractedDocument` path; one probe passed. This verifies one readable PDF fixture only, without endpoint, account, storage or actual-user-paper evidence.
- C1 FAIL: onboarding dirty/processing transition above; PDF count enforcement inspected but no live device.
- C2 UNRUN: source/component fixtures do not establish complete rendered profile workflows, pending dates or async failure behavior.
- C3 PARTIAL/UNRUN: one real extractor fixture and mock parse-failure tests passed; actual user PDF and full hosted path unrun.
- C4–C9 UNRUN: ranking/output belongs to this reviewer; independent review required.
- C10 FAIL: onboarding can lose the selected first pool; DB immediate-first-pool behavior not executed.
- C11–C12 UNRUN: SQL and pure fixtures inspected; no executed DB date, DST, concurrent-update or undo gate.
- C13 UNRUN: own output code; independent web/email/job/cache parity needed.
- C14–C15 UNRUN: source paths reviewed, but live preference side effects and elapsed-storage expiry untested.
- C16 FAIL: untracked incoming copy on cleanup failure as above; explicit forget concurrency and physical storage untested.
- C17 UNRUN: owner-derived request context and owner checks inspected; no live two-account, RLS, or concurrent tests.
- C18 UNRUN: own output claims and rendered UX need independent verification.

No full Theme C percentage or acceptance is claimed: unrun units cannot be counted as passes, and independent output review, hosted storage, live SQL/concurrency, and rendered desktop/mobile flows remain necessary.
