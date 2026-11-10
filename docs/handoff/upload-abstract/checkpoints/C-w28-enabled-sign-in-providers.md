# C checkpoint — W28 enabled sign-in providers (R-AUTH-PROV), 2026-11-06

Brief: `docs/handoff/upload-abstract/briefs/W28-ENABLED-SIGN-IN-PROVIDERS.md`. Base 0ec62242, detached worktree
`C:/Users/wbc13/AppData/Local/Temp/peer-wt-w28`. Not pushed. Scratch: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w28/`
(base/head markup captures, mutation logs).

## Mechanism
- Every OAuth button called `signInWithGoogle` / `signInWithGitHub` (`components/account/use-auth-user.ts`) with no
  knowledge of the project; GoTrue answers an unenabled provider with the raw 400 JSON the owner saw.
- Surfaces: `SignInButtons` in `components/account/account-section.tsx` (Account section; reused by
  `app/welcome/account-step.tsx` for the welcome Account step and the AI step's "Sign in to use your key"), and the
  signed-out seed pool's own two buttons in `components/seed-pool/seed-pool.tsx` (Google first).

## What changed
| Rule | Change | Commit |
|---|---|---|
| 1 | New `lib/supabase/sign-in-providers.ts`: `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings` with `apikey` = publishable (else anon) key, one request per page load shared by every surface (module-level promise + `useSyncExternalStore`, server snapshot null). A provider is hidden only when `external.<provider> === false`. `SignInButtons` → thin wrapper over new `SignInButtonsView`; seed pool buttons → `SeedPoolSignIn` / `SeedPoolSignInView` (same markup, same order) | 67f37d7b |
| 2 | `fetchSignInProviders` never throws: thrown fetch, non-2xx, non-settings body, unparsable JSON → null → both buttons. Loading → both | eb339327 |
| 3 | Both reported false → `"Sign-in is not set up on this copy of Peer."` in place of the buttons (shared view and seed pool); never otherwise | 0b1672b5 |
| 4 | Test only: with both enabled (and while loading) each surface's markup sha256 equals the markup rendered from 0ec62242 | 2f5f3a47 |

`use-auth-user.ts` and `account-step.tsx` were not edited: the welcome steps get the behaviour through `SignInButtons`.
The hook lives in `lib/` rather than `use-auth-user.ts` because `account-section.test.tsx` mocks `./use-auth-user`
with a fixed export list; a new export there would have needed a test edit.

## Before / after
| Project settings | Before | After |
|---|---|---|
| GitHub + Google on (production) | both buttons | both buttons, byte-identical markup, same order |
| GitHub on, Google off (peer-test) | both; Google → raw GoTrue 400 JSON | GitHub only |
| Google on, GitHub off | both; GitHub → raw 400 JSON | Google only |
| Neither on | both, both dead ends | "Sign-in is not set up on this copy of Peer.", no buttons |
| Settings loading | both | both (no jump, nothing waits) |
| Settings request fails / non-2xx / odd body | both | both (fail open) |
| Supabase not configured | no sign-in surface | unchanged, no request made |

## Gates
| Gate | Result |
|---|---|
| tsc (`npx tsc --noEmit` from web/) | 0 errors |
| eslint on the 5 touched files | 0 errors, 0 warnings |
| src/lib/supabase + src/components/account + src/app/welcome + src/components/seed-pool + spend-scans, ×3 | 13 files, 290/290 each run |
| `src/lib/security/spend-scans.test.ts` | 50/50 (the settings read is a public auth call, not a model or paid call) |
| Full suite once | 637 files passed, 2 skipped; 11625 tests passed, 2 skipped |

No test deleted, skipped, weakened or re-aimed; no existing test edited.

## Mutations (restored with `git checkout --`, sha256 before = after)
| Rule | Mutation | Red | File sha256 (before = after) |
|---|---|---|---|
| 1 | `parseSignInProviders` returns `{ github: true, google: true }` | 10 (google false / github false / none, every surface) | sign-in-providers.ts 59e11880341ecb739a863d068f7f116877d6c9ce1c4836d50f90fbc5004b39c6 |
| 2 | `signInProvidersToShow` maps unknown to `{ github: false, google: false }` | 17 (loading, thrown fetch, non-2xx, plus existing welcome/account/seed-pool tests) | sign-in-providers.ts 59e11880341ecb739a863d068f7f116877d6c9ce1c4836d50f90fbc5004b39c6 |
| 3 | drop the sentence line in `SignInButtonsView` | 1 (none enabled, every surface) | account-section.tsx ace63592ef107c63b93525c89d100155fba37bcb7b338dec498eb85d89723196 |
| 4 | swap GitHub/Google blocks in `SignInButtonsView` | 10 (order pins, markup hash pins, existing welcome order tests) | account-section.tsx ace63592ef107c63b93525c89d100155fba37bcb7b338dec498eb85d89723196 |

## Notes for the manager
- Rule 3 left the Account section's description "Sign in with GitHub or Google to sync saves and reads across your
  devices." as is (no new copy allowed). With one provider off it still names both; with none on it sits above the
  "not set up" sentence. If that should follow the providers, it needs a ruling on copy.
- The read is client-side only (no server path for auth config exists); the server render and hydration draw both
  buttons, then a hidden provider disappears when the answer arrives. On later client navigations the answer is
  already in memory, so the button never appears.
- No retry after a failed read within the same page load (once per page load, per rule 1); a reload asks again.
- Not verified in a browser or against a live project (no servers, no network in this worker).
