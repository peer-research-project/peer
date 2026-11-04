# C-W8-PRIVATE-HEADERS — three small fixes from W6 (R-H1, R-H2, R-H3)

2026-11-04, Group 1 C-role, brief `briefs/W8-PRIVATE-HEADERS.md`. Base HEAD `ccfce6df` (branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`), worked in detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w8`. One commit per rule, author `peter14531453 <274981268+peter14531453@users.noreply.github.com>`. Nothing pushed, no branch created, main checkout untouched, no server started, no env file loaded (the worktree `web/` holds only `.env.example`; no Supabase/Peer/Vercel variable was set in the build shell), no dependency added, `web/supabase/**` and `sql-runtime/**` untouched. Evidence of origin: `checkpoints/A-w6-prod-build.md` (O1, O2, O3). Scratch logs: `C:/Users/wbc13/AppData/Local/Temp/claude/5022a5e0b10deb05/80acfc05-fe57-4f98-9572-9dab43af2a80/scratchpad/w8/` (`build-before.log`, `build-after.log`, `build-mut-a.log`, `build-mut-b.log`, `nft-before.jsonl`, `nft-after.jsonl`, `nft-before-full/`, `nft-count.mjs`).

## Summary

| Rule | Commit | Files | Test (fails before / passes after) | Mutation (revert → red → restore, sha256 after restore) |
|---|---|---|---|---|
| R-H1 private headers (check 7, O2) | `e2674d89` | `web/src/app/api/papers/upload/[id]/route.ts`, `web/src/app/api/profile/route.ts` (+ their `route.test.ts`) | 15 new tests, one per return path. 12 fail on the pre-fix routes (the 3 that already carried headers pass), 15/15 pass after | Both helpers' `headers:` option removed → 15 failed / 39 passed. Restored byte-identical: `[id]/route.ts` `35ae4ce18ac41f5894ec4d5887624b2917797c0d3719a988a0437ca0d3141b96`, `profile/route.ts` `5db9af0671b7c16fed005522d41f1ad91e077daa9c1d20dd152626df72b459b3` |
| R-H2 anonymous seed pool = signed-out (O3) | `160dfd1e` | `web/src/lib/seed-pool/auth.ts` (+ new `auth.test.ts`) | 8 tests. 2 fail on the pre-fix file (no-session → unauthenticated; GET `/api/seed-pool` 401), 8/8 pass after | `isAuthSessionMissingError(...) ? … : …` reverted to `return { status: "unavailable" }` → the same 2 fail. Restored `682f8b37ad80e380cbd8c90d7d4f74c4b397461b590eeb4fd1219558aea4ca2c` |
| R-H3 stop whole-project tracing (O1) | `bb2dcb15` | `web/src/lib/papers/upload-backend.ts`, `web/src/lib/papers/upload-store.ts` (+ new `upload-backend.trace.test.ts`) | 6 tests. Both guard tests fail on the pre-fix files (6 and 4 unannotated calls), 6/6 pass after; 4 behaviour tests pass both before and after | (a) metaPath comment removed → guard red; compile build: seed-pool 98→118, 16 `src/**/*.json` traced again. (b) existsSync line's comments removed → guard red; compile build: warning returns, `next.config.ts` traced again. Restored `upload-backend.ts` `3b87130c08541dcd06038d5017af5e51872bd9e58d1223b0fc7cc0d434c70609`, `upload-store.ts` `c2a82a15ff38817763bf57228fe92ae22ba2ed5ff28fda1e8e4e9fd0490303f9` |

## R-H1 — every private answer carries no-store headers

- `upload/[id]/route.ts`: one local `privateJson(body, status = 200)` helper that always passes `PRIVATE_UPLOAD_HEADERS`. Every return in GET and DELETE goes through it: GET 400 (malformed id, previously bare), GET 404 (previously bare), GET 200, DELETE 403 cross-site (previously bare, not named in W6 but in scope of "every response"), DELETE 404, DELETE 200.
- `profile/route.ts`: one local `privateJson` helper with `Cache-Control: private, no-store`. Every return in GET and PUT uses it: GET 401/500 (read error)/500 (`invalid_feed_intent`)/200, PUT 401/400/500 (upsert error)/500 (`invalid_feed_intent`)/200. Bodies and status codes unchanged. Not covered: a request body that is not JSON makes `request.json()` throw before any return, so Next answers its own 500 (pre-existing, no data in it).
- Tests: `[id]/route.test.ts` "W8 R-H1" block asserts all four private headers on each of the 6 return paths (invented id `4e6f6e2d72656131`, invented file `invented-fern-survey.pdf`). `profile/route.test.ts` "W8 R-H1" block asserts `private, no-store` on each of the 9 return paths.

## R-H2 — anonymous seed pool request resolves as signed-out

- `seedRequestContext()` now maps a `getUser()` error to `unauthenticated` only when `isAuthSessionMissingError(error)` is true; any other error still maps to `unavailable`. `isAuthSessionMissingError` is imported from `@supabase/supabase-js`, which re-exports `@supabase/auth-js` (`export * from "@supabase/auth-js"`); it checks `__isAuthError` and `name === "AuthSessionMissingError"`, the error `GoTrueClient` returns with no session.
- No route change was needed: all three seed-pool routes already answer `unauthenticated` with 401 and private headers ("Sign in to manage seed papers." for `/api/seed-pool` and `/assets/[id]`, "Sign in to upload seed papers." for `/assets`).
- Tests (`web/src/lib/seed-pool/auth.test.ts`): `AuthSessionMissingError` → unauthenticated; `{ user: null, error: null }` → unauthenticated; `AuthApiError` 500 → unavailable; `AuthRetryableFetchError` → unavailable; a plain `Error("Auth session missing!")` → unavailable (so it is not a message match); a thrown `createClient` → unavailable; a user → ready with that owner id; and GET `/api/seed-pool` through the real `auth.ts` → 401 `{"error":"Sign in to manage seed papers."}` with `private, no-store`.

## R-H3 — the upload backend no longer traces the whole web/ tree

Choice: `/*turbopackIgnore: true*/` comments (the form named by Next 16.2.3's own warning text, `path.join(/*turbopackIgnore: true*/ process.cwd(), bar)`, and used by Next's own runtime, e.g. `load-manifest.external.js`). Lazy computation was not used because it would not change static analysis and would change the exported `UPLOAD_DIR` constant.

Finding while measuring: annotating only `resolveWebRoot` (the brief's named lines) was **not enough**. In a full build with only those comments the warning and the ~1,300-file traces stayed. The whole-tree glob came from `diskPath`'s `path.resolve(UPLOAD_DIR, name)` (with `UPLOAD_DIR` partly unknown via `process.env.PEER_PRIVATE_UPLOAD_DIR`, the tracer treated the result as anything under the cwd), and `upload-store.ts`'s `path.join(UPLOAD_DIR, …)` calls added every `src/**/*.json`. Annotated calls (10, all first arguments that are runtime directories):

- `upload-backend.ts`: `path.join(cwd, "web")`, `existsSync(path.join(candidate, "next.config.ts"))` (both levels), `path.join(resolveWebRoot(), ".local-data", "uploads")`, `path.resolve(UPLOAD_DIR, name)`, `path.resolve(UPLOAD_DIR)`.
- `upload-store.ts`: `pdfPath`, `metaPath`, `docPath`, and the sidecar `rename(path.join(UPLOAD_DIR, temporary), …)`.

Behaviour: comments only; the runtime code is unchanged. Behaviour tests on invented temp directories pin `resolveWebRoot` (dir with `next.config.ts` → itself; only `web/` child has it → child; neither → itself) and the object paths (`pdfPath`/`metaPath`/`docPath` = `path.join(UPLOAD_DIR, …)`, `../../.env` refused). The existing upload-store `resolveWebRoot / UPLOAD_DIR (P0-03)` tests still pass.

### Production build measurement

Both builds: `node node_modules/next/dist/bin/next build` (Next.js 16.2.3, Turbopack), cwd worktree `web/`, `NODE_ENV` unset, no env file, `node_modules` a robocopy copy (the junction is refused by the Turbopack build, as W6 recorded).

| | Before (`160dfd1e`, R-H3 not applied) | After (R-H3 applied, = `bb2dcb15`) |
|---|---|---|
| Exit | 0 | **0** |
| Warnings | 1: "Encountered unexpected file in NFT list … whole project was traced", trace `next.config.ts` ← `upload-backend.ts` ← `api/seed-pool/assets/route.ts` | **0** |
| Routes in the table | 58 | 58 |
| Functions with ~1,300 traced files | 17 | **0** |

Traced file count per `.nft.json` (`nft-count.mjs`):

| Function | Before | After |
|---|---|---|
| `api/papers/[id]/explain`, `paragraph-guide`, `plain` | 1,324 each | 123 each |
| `api/papers/report` | 1,323 | 122 |
| `api/papers/[id]/reading` | 1,315 | 114 |
| `api/papers/[id]/figure-image`, `api/papers/upload`, `api/seed-pool/assets` | 1,314 each | 113 each |
| `api/figure` | 1,310 | 109 |
| `api/seed-pool`, `api/seed-pool/assets/[id]`, `api/papers/upload/[id]`, `upload/[id]/file`, `upload/ticket`, `upload-availability`, `api/jobs/purge-uploads` | 1,299 each | 98 each |
| `api/admin/uploads/block` | 1,297 | 96 |
| Reference plain routes `api/feed` / `api/profile` | 111 / 99 | 111 / 99 (unchanged) |

- Every one of the 17 functions lost exactly the same 1,201 project files: `src/` 1,131, `supabase/` 28, `public/` 16, `scripts/` 9, `AGENTS.md`, `CLAUDE.md`, `README.md`, `next.config.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `eslint.config.mjs`, `postcss.config.mjs`, and 7 vitest config/setup files. Set diff (compile-mode builds, full `.nft.json` lists kept in `nft-before-full/`) on 5 representative functions (`figure`, `papers/report`, `seed-pool/assets`, `papers/[id]/reading`, `seed-pool`): **0 `node_modules` files removed, 0 files added** — `mupdf` and every other package stay traced.
- The other 42 functions' counts are identical before and after.

## Gates

- `npx vitest run src/lib/papers src/lib/seed-pool src/app/api/papers src/app/api/profile src/app/api/seed-pool src/app/api/admin/uploads src/app/api/jobs/purge-uploads`: **103 files, 2,509 tests, all pass**.
- `npx tsc --noEmit --incremental false` (after the fresh build regenerated `.next/types`): **0 errors**.
- `npx eslint` on all 9 touched files: **clean**.
- Production `next build`: **exit 0, 0 warnings** (above).

## Cleanup

- The worktree's robocopy `node_modules` copy was deleted (a real directory, not a link; the main checkout's `web/node_modules` was verified present afterwards). No server was started; ports 3000/3100/3110 untouched. The worktree stays for the manager to fetch the three commits.
