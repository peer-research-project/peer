# C checkpoint — W27 returning account walkthrough (R-ONB-1), 2026-11-06

Brief: `docs/handoff/upload-abstract/briefs/W27-RETURNING-ACCOUNT-WALKTHROUGH.md`. Base efcd536f, detached worktree
`C:/Users/wbc13/AppData/Local/Temp/peer-wt-w27`. Not pushed. B notes: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w27/B-mechanism.md`.

## Mechanism (B, confirmed with one correction)
- `app/auth/signout/route.ts:22-33` 303 → `/` + `peer_signed_out` cookie; `components/profile-sync.tsx:883-892` (base
  numbering) runs `processConfirmedSignOutCookie` → `store/profile.ts:774-778` `logOut()` = `profile: defaultProfile`,
  wiping `onboardedAt` AND `welcomeSkipped` (and lastSynced, syncedAccountId) before `markSyncSettled()`.
- Correction to the manager's reading: the bounce happens on the sign-out's own `/` load, before any sign-in —
  `lib/profile/first-visit.ts:59-61` + `components/first-run.tsx:100-109` redirect the wiped profile to /welcome.
- Sign-in from the Account step returns via `peer_after_sign_in` (`app/welcome/account-step.tsx:26`,
  `components/account/use-auth-user.ts:81-98`, `app/auth/callback/route.ts:143-146`) to `/welcome?step=account`.
- On /welcome nothing checks the account: `walkthroughAction` returns null once topics land, the backfill skips
  /welcome (`first-run.tsx:88-92`), and the wizard opens at the URL's step (`app/welcome/page.tsx:139-143`).
- Same trap from the AI step (`/welcome?step=ai`) and Seed step (`/welcome?step=seed`), on a fresh device, and on `/`
  when the pull is slower than the 4 s settle timeout. No server-side onboarding record exists.

## What changed
| Rule | Change | Commit |
|---|---|---|
| 3 | `logOut()` keeps `welcomeSkipped: true` when it was set; the reset statement /privacy pins is unchanged, the flag is re-set in a second synchronous `set` | e0ad4fba, fa1db548 |
| 1 | `remoteShowsSetUp` / `isReturningAccountSignIn` / `RETURNING_ACCOUNT_DESTINATION` (first-visit.ts); ProfileSync raises `useSyncGate.returningAccount` after the sign-in merge patch, before push and settle; sign-out lowers it; FirstRunGate on /welcome → `completeOnboarding()` + `router.replace("/")` once, elsewhere stamps and clears; wizard paints no step while it is up | 4d2baf88 |
| 2 | `isReturningAccountSignIn` returns false when `previousOwner === userId` (syncedAccountId read before this sign-in records it) | aca3dfe4 |
| 4 | Test only: first visit from `/` still redirects once with the W27 path in place | 3f0b4f46 |

## Before / after
| Scenario | Before | After |
|---|---|---|
| Set-up account: sign out, stay signed out, `/` | sent to /welcome | stays on `/` (flag survives) |
| Set-up account signs in on /welcome?step=account (or ai / seed) | stuck in the wizard at that step | onboardedAt stamped, replaced to `/`, no step painted |
| Set-up account, fresh device, first `/` | /welcome (first visit on device) | unchanged; after sign-in on /welcome it leaves for `/` |
| Pull slower than 4 s on `/` after sign-in | could land in /welcome and stay | leaves /welcome when the pull lands |
| Brand-new account signs in on /welcome | stays | stays |
| New reader adds first topic on /welcome, then reloads signed in | stays | stays (same owner ⇒ not a sign-in) |
| First-time visitor at `/` | /welcome once | /welcome once |

## Gates
- tsc (`npx tsc --noEmit`): 0 errors.
- eslint on the 10 touched files: 0 errors, 7 warnings, all in `app/welcome/page.tsx` and all present at efcd536f.
- Touched tests + first-run* + lib/profile + app/welcome + app/privacy + spend-scans, ×3: 18 files, 567 tests, all pass each run.
- Full suite once: 635 files passed, 2 skipped; 11598 tests passed, 2 skipped. (Before fa1db548 it caught three
  /privacy source pins on `logOut()`'s reset; fixed in code, no test edited.)
- No test deleted, skipped, weakened or re-aimed. `first-run.test.ts`'s profile-sync mock gained the new
  `returningAccount` field and `clearReturningAccount` export (needed for the module to load).

## Mutations (each restored with `git checkout --`, sha256 before = after)
| Rule | Mutation | Red | sha256 |
|---|---|---|---|
| 1 | drop `router.replace(RETURNING_ACCOUNT_DESTINATION)` in first-run.tsx | (a) + "before settled" | ec7eb8e75441af1fd938d3be873c6fd3e524ecff64e2b90b493b77acfb41abe0 |
| 2 | drop `if (previousOwner === userId) return false;` | (c) | b25e926281dfb351839acb08d0aa447a8d1d4b6f3cb31da92b2ca4f2f48da456 |
| 3 | `if (false && walkthroughShown)` in logOut | (d) + reset-shape test | ce72f48e46358b36cc2abf6ae32ed163d370ea65bc2036a7077c764be907f4b2 |
| 4 | `/` returns null in walkthroughAction | (e) + 3 P7-16 tests | b25e926281dfb351839acb08d0aa447a8d1d4b6f3cb31da92b2ca4f2f48da456 |

## Notes for the manager
- Return path: no page before the walkthrough is ever recorded — the gate only redirects from `/`, and the callback
  consumes the after-sign-in cookie — so the destination is always `/`.
- Rule 3 privacy: no rule names `welcomeSkipped`; /privacy's "Signing out clears this browser's copy" is about what the
  reader saved and opened. Kept the flag; no conflict found. It also survives Profile "Reset profile to defaults" and an
  account switch (both call `logOut()`), consistent with `resetOnboarding` never re-arming the redirect.
- A failed sign-in pull reads as "no row", so no eject; the device still records the owner, so a later reload will not
  retry the check (conservative: wizard stays rather than ejecting a possibly-new account).
- Not verified in a browser (no servers allowed in this worker).
