# Upload, source truth and Notes repair loop

Event dates in this file use UTC; 2026-11-02 UTC is2026-11-01 in the user's America/Chicago timezone.

## 1. Resume / current state

- HELD BY: Sol execution manager (gpt-6.1-sol/high); root coordinates user communication and production access.
- ROUND: 1 implementation; no scored product round yet.
- BRANCH: fixing-bugs-on-uploading-pdf-and-abstract-reading, baseline 87f92259.
- CURRENT ITEM: report/UI initial implementation landed locally (905fda6e,97db758d); retained source and review-correction worktrees inspected after usage interruption. Existing Terra source and Terra corrections groups resumed; no new group or nested worker.
- NEXT TURN: verify and land source/correction commits; root continues desktop/mobile browser QA at4314. Complete real-source checks, build/full-suite checks and independent scored rounds within cap2.
- STOPPED BECAUSE: not stopped; authorized hourly resume succeeded after account capacity recheck. Product gate OPEN; initial implementation/partial work is not completion.
- TARGET: user confirmed 97.9 per theme, two consecutive independent rounds.
- GATE BASELINE: investigation7suites/235tests passed. Pre-app fullsuite60failed/540passed/2skipped suites,87failed/10727passed/9skipped tests (Windows newline/path/mode assumptions and absent lockedmupdf among causes). Restored exact existing mupdf1.28.1 locally without manifest/lock changes; baseline and initial integrated tsc then passed. Initial full lint1error/133warnings; error in untouched abstract-toggle.test.ts childrenprop. Build pending.
- CLOCK: root created/read back heartbeat peer-pdf, ACTIVE hourly minute 23 second 0, target root thread 01a19a4f-84c8-7131-84e3-3fe85871c97c. Do not duplicate; unrelated peer-p12 remains PAUSED.
- MODEL / CAP: Sol manager / Terra workers. USER HARD CAP: at most TWO active worker groups across the whole agent tree, including nested delegations. Queue all other groups; do not dispatch a third. The platform cap of four total live agents also remains binding.
- PERMISSIONS: local repairs, detached worktrees and local commits authorized. No branch creation, push, PR, merge, rebase or production deployment.

## 2. Binding rulings

1. 2026-11-02: Latest user authorization supersedes investigation-only scope. Preserve investigation findings; repair state lives here. Existing signed agreement, privacy, BYOK, Tier 0, no dependency addition and branch rules remain binding.
2. 2026-11-02: Use workaholic-mode and ABC workflows with user-selected Sol manager/Terra workers; root alone owns hourly clock and external configuration access. Skill push instructions are overridden by explicit no-push scope. Never revive stopped P12.
3. 2026-11-02: Final truth/privacy requirements override numerical score. No abstract/no full text means no shallow model call and no asserted abstract grounding; genuine full text permits deep analysis without abstract. HTTP403 is blocked/unknown unless subscription evidence exists. Keep backend private upload checks.
4. 2026-11-02: Do not impose an abstract-only feed eligibility gate without evidence of existing intended contract. Investigate and report actual title-only ranking behavior; make source status honest.
5. 2026-11-02: Both themes use actual product paths, three public source inputs, invented deterministic fixtures, fresh rendered UI where possible and independent readers. Never infer product acceptance from tests/config presence. Any unrun signed-in hosted upload/model path remains PARTIAL.
6. 2026-11-02: Manager is sole state/rubric/ledger writer. Worker checkpoints are committed separately. Local commit attribution: peter14531453 <274981268+peter14531453@users.noreply.github.com>.
7. 2026-11-02 UI-1: Reuse existing all-notes Saved collection at /saved#shelf-notes with existing note search helper; retain separate creation/editor/delete/rename/duplicate/export. No archive capability found, so preserve existing behavior without claiming archive exists. Add mobile global controls because masthead currently hides on phones. This is the smallest change preserving prior notes.
8. 2026-11-02: User confirmed97.9 per theme/two consecutive rounds. Root's latest-user-authorized setup added only two nonsecret Production variables, PEER_UPLOADS_ENABLED=true and PEER_UPLOAD_BUCKET=private-uploads, to Vercel. Reloaded environment list confirmed both Production; save said new deployment required. Earlier no-production-write scope superseded only for these two config fields. No deployment occurred. Root read-only Supabase check confirmed private-uploads exists/private with26214400-byte cap, and Vercel config names URL/publishable/service-role/CRON_SECRET apply All Environments. Presence is not upload validation; live old deployment stays unchanged until deployment authorized.
9. 2026-11-02 UTC (2026-11-01 Central): User instructed "only 2 agent groups work at the same time, do not exceed that". This is a hard global dispatch cap, covering implementation, investigation, review and blind-reader groups, including nested workers. Preserve parallelism within this cap; queue all other groups. No worker may create extra nested groups beyond the shared cap.
10. 2026-11-02 UTC: Latest human Seed Paper Pool request is DESIGN ONLY and explicitly not implementation. Keep it entirely outside repair code and dispatch. The already delivered design does not authorize code.
11. 2026-11-02 UTC: Independent A found nonempty-corpus/all-dropped prose, source-fingerprint response race and mismatched report-render gaps. Correct before scoring. Preserve useful verified content with deterministic summaries from surviving supported claims/excerpts when unsupported free prose is removed; never assert unsupported novelty. UI server-disabled status must differ from network/check failure, preserve visible entry and retry. Manager attachment visibility mutation survived tests, so improve behavioral coverage rather than calling it a passed gate.

## 3. Dispatch ledger

| Item | Role / worker | Status | Scope / worktree | Evidence / brief |
|---|---|---|---|---|
| R1-report | C terra_report | INITIAL LANDED905fda6e; corrections required | report route, evidence, reading availability, relevant cache guards; upload-report-trust/Peer; port4311 | briefs/C-report-trust.md; checkpoint report-trust/checkpoint.md; manager12suites346tests x3 |
| R1-ui | B then C terra_ui | INITIAL LANDED97db758d; corrections required | global header/upload/Notes, attachment entry, availability hook; upload-global-notes/Peer; port4312 | briefs/BC-global-ui.md; checkpoint global-ui/checkpoint.md; manager7suites94tests x3 |
| R1-source | C terra_report | RESUMED RUNNING group1 | enrich/fetch-by-id/full-text/paywall status; upload-source-enrichment/Peer; port4313 | SOURCE-AND-ELIGIBILITY-B.md; briefs/C-source-enrichment.md |
| R1-corrections | C terra_corrections | RESUMED RUNNING group2 | evidence/cache/renderer/readiness corrections; upload-review-corrections/Peer; port4315 | briefs/C-review-corrections.md; independent A-report-ui.md |
| R1-access | root | RUNNING | read-only production/storage configuration access | local config presence confirmed by root; no values logged |
| R1-independent-review | A + blind Terra | QUEUED | product paths/read-only score | requires integrated implementation/render |

## 4. Verification / score record

No product score recorded. Initial investigation reproduced source/status/report defects despite 235 passing tests. Verification will include touched tests three times, manager mutation with identical restoration per mechanism, full tests, typecheck/lint/build, fresh UI render, three real metadata/reading controls, independent review. Test results and production limits are separate facts.

## 5. Event log (append only)

- 2026-11-02: Read manager brief, AGENTS/product direction, full investigation, workaholic skill/hourly clock and ABC skill. Confirmed branch and only existing untracked handoff/investigation files. Managed artifacts initially empty.
- 2026-11-02: Created two detached managed worktrees at87f92259. Wrote worker briefs using file tool; dispatched two Terra/high workers concurrently. Root received milestone.
- 2026-11-02: Root confirmed peer-pdf clock ACTIVE via readback; local Supabase config presence (not health), Vercel credentials unavailable via CLI so far. Provisional97.9 target retained.
- 2026-11-02: UI B findings ruled UI-1 and worker advanced to C. Root confirmed target97.9 and bounded production config setup above. Evidence screenshot remains private temporary file C:/Users/wbc13/AppData/Local/Temp/peer-upload-production-config.png; no secrets logged.
- 2026-11-02: Source B completed and C brief written; third detached worktree prepared for first free Terra slot. Baseline full-suite and typecheck run concurrently on main before application landing; results pending. Live product-direction URL could not be opened via web tool, so supplied repository direction remains read source.
- 2026-11-02 UTC: Initial report/UI changes landed as905fda6e and97db758d. Sol reported manager report-targeted tests passed three times (12suites/346tests per run), original locked mupdf restored locally, baseline tsc passed after restore. Earlier full-suite baseline failed (87failed/10727passed/9skipped tests); no full-green claim. Manager mutations found an attachment-visibility coverage gap; independent review found further report/caching issues, assigned to correction worktree. Local server4314 started; root opened the actual updated home page and saw Upload and notes, but interactive/mobile QA remains unfinished.
- 2026-11-02 UTC: Sol and both active Terra workers errored on model usage limits. Root checked the live agent tree and persisted the user's two-group cap. No third worker group is active; preserve all partial worktrees and do not push/deploy or claim97.9 acceptance.
- 2026-11-02 UTC: Authorized hourly resume after account ordinaryUsageAllowed recheck. Sol inspected retained source22modifiedfiles+1newtest and correction evidence partial, then resumed only the two existing Terra groups. Server4314 remains reachable; root browser QA pending. Applied newly available React-best-practices and full-story verification skills within existing scope.
- 2026-11-02 UTC: Manager initial report targeted suite346tests passed three times; UI targeted suite94tests passed three times. Own9mutations:8killed/assertion+exactSHArestore, attachmentfalse&&mutation survived; recorded coverage gap for C rather than claiming all9passed. Independent A review documents3hard truth/cache gaps and removed readiness-test coverage. No product score accepted.
