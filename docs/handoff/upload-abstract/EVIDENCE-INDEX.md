# Local verification evidence

Branch: `fixing-bugs-on-uploading-pdf-and-abstract-reading`. No push, PR, merge, production migration or deployment. The three-theme97.9/two-round gate is OPEN. Tests, source inspection, rendered UI and hosted behavior are separate evidence.

## Preserved raw files

The27 original baseline, source/control, mutation and integrated logs were moved intact from this directory to `C:/Users/wbc13/AppData/Local/Temp/peer-upload-raw-evidence/` to keep generated logs outside the repository. Earlier checkpoints using bare log filenames refer to that archive. Failed runs remain there.

Current seed manager logs and screenshots are in `C:/Users/wbc13/AppData/Local/Temp/peer-seed-manager-evidence/`.

Twelve independent scratch probe/config files were preserved intact under `C:/Users/wbc13/AppData/Local/Temp/peer-upload-review-probes/`. Earlier checkpoints' bare `A-*.test.ts`/configuration names refer to that archive; historical probes may intentionally assert the pre-fix failure and must be run against their recorded commit. Their original configuration paths describe the local workspace. Generated root Vitest scratch is kept outside the repository as well.

## Rendered evidence

Original Upload/Notes: `C:/Users/wbc13/AppData/Local/Temp/peer-upload-ui-qa/`.

- `desktop-notes.jpg`, `mobile320-notes.jpg`, `mobile320-two-notes.jpg`: actual local collection interactions, two invented notes, search match/no-match, rename and reload persistence. Mobile exact upload label wraps visibly.
- `mobile320-paper.jpg`, `mobile320-paper-actions.jpg`: persistent attachment entry and honest blocked-source status.
- `desktop-paper.jpg`: failed stale Next-generated CSS render, retained.
- `desktop-paper-fresh-cache.jpg`: recovered after stopping only the owned server and archiving its generated cache; no CSS source edit. Archived cache: `C:/Users/wbc13/AppData/Local/Temp/peer-next-cache-saved-20261102T1040Z`.

Seed setup: `desktop-onboarding-signedout.jpg`, `mobile320-onboarding-signedout.jpg`, `mobile320-onboarding-signedout-full.jpg`, `onboarding-skipped-to-radar.jpg` in the seed manager folder. Actual1280x720/320x740 signed-out render and optional Skip navigation were observed. These do not prove signed-in active/pending/processing states or storage/API success.

## Current failure and mutation record

- Integrated e5c5f807 targeted run:33 suites,473 passed/1 failed test out of474. The failure was the archive legacy integration fixture lacking an explicit absent-seed-schema resolver; independent scratch setup restored25/25 legacy assertions. Keep this initial failure; a corrected combined run is still required.
- Independent A reviews found lost negative feedback, missing TF-IDF matching, private-request type errors, archive owner-date mismatch, unsaved onboarding selection loss, and swallowed staged-source deletion. Follow-up manager source inspection also found server-date enqueue keys despite owner-date web/email. These are repair findings, not exclusions.
- Manager's own staged-consumption mutation at4cff71ec removed the strict source deletion. Two assertions failed (503/no asset creation and deletion-before-staging). Original bytes restored with SHA256 `6BF28A2A3D6FC4F7DF303D7B2F8B99598DC705D788E6463E4104B04384F325D5`; restored route suite6/6 passed.
- The four new failing files in the first broad run were closed explicitly: three safety/privacy contract fixtures were re-aimed, and Saved-card minutes had a real old-namespace/unfingerprinted-cache consumer regression. Independent A then exposed empty-body false Notes loss, fixed6e88bdeb and independently rechecked. Source identity repairs additionally cover availability prefetch and paragraph guides, with Deep/BYOK gates preserved.
- At6e88bdeb, manager affected14suites241tests passed3times, build recordedexit0, and fullsuite recordedexit1:33failed/594passed/2skipped suites;55failed/11361passed/2skipped tests. That broad run precedes the final two consumer fixes. Its remaining new exact-import assertion in the previously failing paragraph-guide suite was subsequently re-aimed; do not relabel these results as proof at a later commit.
- Manager's direct-empty-body Notes mutation removed only the loss predicate's blank-body guard. The intended test failed, bytes restored with SHA256 `81E79BB1A155AF496B8B3721FC1B7A5BAEF8D6F1CC380BC2F3411E9C075F0BAB`, and restored Notes suite25/25 passed.
- The recorded full lint at19d8a88a had1error/138warnings; the error is the same untouched `components/reader/abstract-toggle.test.ts` children-prop baseline failure. Subsequent affected-source lint passed with only3 existing card spacing warnings. Production build reports an NFT tracing warning through the existing upload-backend root discovery; successful compilation does not resolve that warning.

## External boundaries

No existing local PostgreSQL, psql, Docker runtime or configured WSL was found. SQL-text and mocked RPC tests do not prove migration syntax, RLS, advisory locks or real concurrent writes. Migration source is reviewable only.

Production upload configuration and private matching-project bucket were checked by root. No deployment was made, so saved variables do not prove the currently deployed upload path. Signed-in hosted PDF upload, two-owner access, actual seed lifecycle, email delivery and user-key Deep Report remain UNRUN. No private PDFs or paid models were used for these checks.

## Final pinned local results

Final source commit: `558f7a60033657c0a41432215c012249a7ad158d`. Subsequent handoff commits change documentation only.

| Check | Actual result | Local evidence filename in seed manager folder |
|---|---|---|
| Production build | EXIT0, existing NFT tracing warning retained | `final-verified-build.log`, `final-verified-build-status.json` |
| Nonincremental TypeScript | EXIT0 | `final-verified-typecheck.log`, same status JSON |
| Final route/guide focused tests |5suites94tests passed in each of3runs | `final-verified-targeted-1.log` through `-3.log` |
| Full suite | EXIT1;32failed/596passed/2skipped suites;51failed/11376passed/2skipped tests | `final-verified-full-suite.log`, `final-verified-full-suite-status.json` |
| Saved baseline comparison |0new exactFAILheaders; inherited failures remain, no full-green claim | `final-verified-baseline-comparison.json` |
| Final changed route lint | EXIT0 | `final-verified-targeted-lint.log` |

Earlier source57737d91 had build/typecheckEXIT0 and10suites93tests3x, plus32failed/596passed/2skipped suites and51failed/11372passed/2skipped tests. It predates the final private-upload race repair; its `release-candidate-*` logs are retained separately. Earlier9aa58f6a seed/output34suites491tests3x and6e88bdeb reading/report14suites241tests3x are also retained, not relabeled as final-head runs.

Root's last bounded race probe reproduced cached paragraph-guide200after private-upload replacement/deletion during text retrieval. Fix558f7a60 checks ownership/revision before cached response/model call, retains post-model check, and returns410 in invented replacement/deletion cases. See `C-paragraph-guide-upload-race.md`; the previously unverified observation is now reproduced and fixed. No actual provider was used.

The local source package is reviewable. Formal97.9-per-theme/two-independent-round acceptance remains OPEN. Follow `ROLLOUT.md` for an authorized matching-schema test database/preview and real hosted checks; current scope still forbids push/PR/merge/production SQL/deployment.
