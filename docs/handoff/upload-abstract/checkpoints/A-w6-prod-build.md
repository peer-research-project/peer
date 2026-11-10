# W6-PROD-BUILD — production build measured against the isolated test project

2026-11-04 06:14–06:23 UTC. Group 1 A-role measurement, brief `briefs/W6-PROD-BUILD.md`. Source HEAD `2b8393a8` (branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`), measured in detached worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w6`. No product code changed, nothing pushed, main checkout and port 3000 untouched. No cookies, no sign-in, no model key. No secret value was printed, logged or written; the env file was read in place from the main checkout and never copied. Scratch logs and raw bodies: `C:/Users/wbc13/AppData/Local/Temp/claude/5022a5e0b10deb05/80acfc05-fe57-4f98-9572-9dab43af2a80/scratchpad/w6/` (`build.log`, `start.log`, `out/*.body`, `out/summary-*.json`).

## Environment

- Launcher `scratchpad/w6/launch.mjs`: the logic of `web/scripts/dev-test-target.mjs` with `PORT=3100`, run as `node launch.mjs build|start`.
  - Reads `web/.env.peer-test.local` from the main checkout. Confirms it is git-ignored. Applies the same refusals: https; host starts with `cbsbtkvbmvyznerbpmxg.`; no value mentions `gdakokshfjqljddlrkrh`; JWT ref check; browser key not secret; server key is service-role; keys differ.
  - Banner: Supabase host `cbsbtkvbmvyznerbpmxg.supabase.co`. From file: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Forced: `PEER_UPLOADS_ENABLED=true`, `PEER_UPLOAD_BUCKET=private-uploads`. `NEXT_PUBLIC_SITE_URL=http://localhost:3100`. Blanked: the same 11 email/cron/admin/rollout names and the 23 operator AI/search/Jev names as the dev script.
  - `NODE_ENV` was removed from the child env, so Next set `production` itself. The worktree `web/` has no `.env*` besides `.env.example`.
  - Spawns `node node_modules/next/dist/bin/next build` and `... next start -p 3100` directly (no `npm run`, so no `prebuild` hook).
- **Deviation from the brief (environment, recorded):** the prescribed `node_modules` junction makes the Turbopack production build panic. Attempt 1 (`build-attempt1-junction.log`, exit 1, 6.4 s) failed with `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. The cause is that `next.config.ts` pins `turbopack.root` to `web/` and the junction target lies outside it. The junction was removed with `cmd /c rmdir` (link only, target untouched; main `web/node_modules/next/package.json` verified present afterwards). `web/node_modules` was then replaced by a plain copy: `robocopy /E /SL /MT:32`, 2,519 directories, 25,875 files, 508 MB, 12.7 s, 0 failed. It holds the same packages and adds no dependency. A `--webpack` build was not used because it would not be the bundler Vercel runs.

## Build

| Item | Value |
|---|---|
| Command | `next build` (Next.js 16.2.3, Turbopack), cwd worktree `web/` |
| Exit | **0**, 64.2 s wall. Compiled in 15.1 s, TypeScript in 34.5 s, 31 static pages in 1.7 s |
| BUILD_ID | `wWG1XwEWAF1gtcF-dnG8I` |
| `PEER_BUILD_REF` (`required-server-files.json`) | `2b8393a` |
| Routes | **58** total: 14 static (○), 44 dynamic (ƒ), of which 40 are `/api/*`. Proxy (middleware) present. All `/api/papers/*` routes, `/api/papers/upload*` (4), `/api/seed-pool*` (3) and `/api/profile` are present. |
| Warnings | 1: "Encountered unexpected file in NFT list … whole project was traced", import trace `next.config.ts` ← `src/lib/papers/upload-backend.ts` ← `src/app/api/seed-pool/assets/route.ts` (see Observation O1) |
| Client bundle refs | `grep -rl` over `.next/static`: test ref `cbsbtkvbmvyznerbpmxg` in 1 file (`chunks/0l8mkzbj-grjc.js`, the only file naming `supabase.co`). Production ref `gdakokshfjqljddlrkrh`: **0** files in `.next/static`, **0** in `.next/server` |

## Server

`next start -p 3100` started 06:19 UTC, `✓ Ready in 660ms`. Listener pid 75192 (`…peer-wt-w6\web\node_modules\next\dist\bin\next start -p 3100`), parent was the launcher (pid 90920). Stopped with `taskkill /T /F /PID 90920`, which ended both. After stopping, port 3100 had 0 listeners and 0 node processes had `peer-wt-w6` in their command line. The 17 node processes that were new compared with the pre-build snapshot are another worker's `vitest run` in the main checkout. They were not started here and were not touched.

## Measurements (probe `scratchpad/w6/probe.mjs`, Node `fetch`, `redirect: manual`, no cookies)

### 1. Pages (06:19:38 UTC)

| Path | HTTP | ms | Cache-Control | Notes |
|---|---|---|---|---|
| `/` | 200 HTML | 138 | `s-maxage=31536000` | prerendered static |
| `/profile` | 200 HTML | 15 | `s-maxage=31536000` | prerendered client shell |
| `/saved` | 200 HTML | 14 | `s-maxage=31536000` | prerendered client shell |
| `/papers/arxiv:1706.03762` | 200 HTML | 221 | `private, no-cache, no-store, max-age=0, must-revalidate` | dynamic |

None of the served HTML bodies mention either Supabase ref. The client bundle check is in the Build table above.

### 2–5. Upload, private upload, Seed Pool, profile (anonymous)

| Call | HTTP | ms | Body | Cache-Control / other headers |
|---|---|---|---|---|
| GET `/api/papers/upload-availability` | 200 | 75 | `{"enabled":true}` | none (public flag) |
| POST `/api/papers/upload`, same-origin (`Origin`/`Referer` `http://localhost:3100`), multipart `file`=`fictional-canopy.pdf` + `rightsVersion=2026-09-19` | **401** | 19 | `{"error":"Sign in to upload a private PDF."}` | `private, no-store`; `Vary: …, Cookie`; `nosniff`; `X-Robots-Tag: noindex, noarchive` |
| POST `/api/papers/upload/ticket`, same-origin, JSON `{size}` | **401** | 10 | same message | same private headers |
| POST `/api/papers/upload`, `Origin: http://evil.test` | **403** | 6 | `{"error":"Cross-site upload refused."}` | no Cache-Control |
| POST `/api/papers/upload/ticket`, `Origin: http://evil.test` | **403** | 8 | same | no Cache-Control |
| GET `/api/papers/upload/9c753bd17c2b82f3` | **404** | 9 | `{"error":"Upload not found."}` | **no Cache-Control, no private headers** (O2) |
| GET `/api/papers/upload/9c753bd17c2b82f3/file` | **404** | 9 | `{"error":"Upload not found."}` | `private, no-store` + private headers |
| GET `/api/papers/upload%3A9c753bd17c2b82f3/reading?v=19` | **404** | 8 | `{"error":"Paper not found"}` | `no-store` |
| GET `/papers/upload%3A9c753bd17c2b82f3` (extra) | 200 HTML | 23 | shell, `<title>Peer</title>`; the only upload-specific text is the id from the URL (3×); no title, file name or "canopy" text | `private, no-cache, no-store, …` |
| GET `/api/seed-pool` | **503** | 61 | `{"error":"Seed papers are unavailable."}` | private headers (O3) |
| PUT `/api/seed-pool`, same-origin | **503** | 10 | same | private headers |
| PUT `/api/seed-pool`, `Origin: http://evil.test` | **403** | 5 | `{"error":"Cross-site request refused."}` | private headers |
| POST `/api/seed-pool/assets`, same-origin, multipart PDF | **503** | 9 | `{"error":"Seed papers are unavailable."}` | private headers |
| GET `/api/profile` | **401** | 7 | `{"profile":null}` | **no Cache-Control** (O2) |

### 6. The three real papers (06:20:08 UTC; 2 calls per endpoint per paper, budget met)

Routes are the same as W2: `GET /api/papers/<encodeURIComponent(id)>?sourceVersion=2` and `GET /api/papers/<id>/reading?v=19`.

| Paper | Metadata (r1/r2) | Reading (r1/r2) | Cache-Control meta / reading | Content |
|---|---|---|---|---|
| `openalex:W7222962933` | 200/200, 966/420 ms | 200/200, 1,619/804 ms | `no-store` / `no-store` | abstract 0 chars / 0 sentences. `abstractRetrieval.status: transient`; attempts semantic_scholar transient 429, crossref missing 200, publisher blocked 403. Reading: `abstract:none`, `fullText:blocked`, `blockedHost: sciencedirect.com`, no paywall host, body 0, fingerprint `""`, readability `unknown` |
| `arxiv:1706.03762` | 200/200, 115/7 ms | 200/200, 214/18 ms | `public, s-maxage=3600, stale-while-revalidate=86400` / `public, s-maxage=86400, stale-while-revalidate=604800` | abstract 7 sentences, `fullText:html`, `sourceLabel: arXiv HTML`, 6 buckets, body 22, fingerprint `y4obqh`, readability `readable` |
| `openalex:W7204479535` | 200/200, 85/5 ms | 200/200, 909/6 ms | same public headers | abstract 11 sentences, `fullText:none`, body 0, fingerprint `lge7vj`, readability `abstract` |

**Comparison with W2 Run 2 (dev, port 3000):** a structural deep-diff of every round-1 body against W2's raw `run2/*.json`, ignoring only `builtAt`, is **identical for all 6 bodies** (3 metadata, 3 reading). The status codes, Cache-Control values and readability headers also equal W2. The abstract character counts W2 recorded (1,135 / 2,023) come from the same unchanged bodies. Production is faster on repeat calls (5–18 ms against W2's 28–57 ms), and cold W7222962933 timing is within upstream variance.

### 7. Headers summary

- Private routes with `private, no-store` and the full private set: upload 401, ticket 401, upload file 404, all Seed Pool answers.
- Private routes with `no-store` only: the upload reading 404. This is acceptable.
- Private routes with **no Cache-Control**: upload meta 404 (`/api/papers/upload/[id]`) and `/api/profile` 401. Neither body carries data.
- Public paper routes match W2 exactly.

## Per-check result

| # | Check | Result |
|---|---|---|
| 1 | Pages 200 HTML; bundle has the test ref only | **PASS** |
| 2 | upload-availability 200 `{"enabled":true}` in production mode | **PASS** |
| 3 | Anonymous upload 401 + private no-store; ticket 401; cross-origin 403 | **PASS** |
| 4 | Private upload id: 404/401, no content leak | **PASS** (all 404, no data; page shell echoes only the URL id) |
| 5 | Seed Pool anonymous 401/503 JSON, no data; `/api/profile` 401 | **PASS** (Seed Pool answers 503, not 401; see O3) |
| 6 | Three real papers match W2 | **PASS** (bodies identical except `builtAt`) |
| 7 | Private routes `Cache-Control` private/no-store; public as W2 | **FAIL (low severity)**: two private refusals carry no Cache-Control (O2). Public routes PASS |
| B | Build exit 0, routes present | **PASS** after the node_modules deviation; the junction build FAILS (environment) |

## Observations and candidate fixes (not applied)

**O2 — check 7 FAIL cause.**
- `web/src/app/api/papers/upload/[id]/route.ts:21` returns the 404 without headers. Line 16 (the 400 answer) has the same gap. The sibling routes `[id]/file/route.ts` and the DELETE at line 42 pass `PRIVATE_UPLOAD_HEADERS`.
- `web/src/app/api/profile/route.ts:159` returns the 401 without headers.
- No data leaks, because both bodies are fixed strings. But a shared cache gets no explicit instruction for these private paths. Vercel adds its own default, but `next start` does not.

Candidate fixes:
1. Pass `{ status: 404, headers: PRIVATE_UPLOAD_HEADERS }` at `upload/[id]/route.ts:21`, and do the same at :16. Pass `Cache-Control: private, no-store` at `profile/route.ts:159`.
2. Add a route-group helper, for example `privateJson(data, status)`, and use it for every return in `upload/[id]`, `profile` and the cross-origin 403s. This guarantees by construction that no early return can drop the headers.
3. Set `Cache-Control: private, no-store` for `/api/papers/upload/:path*` and `/api/profile` in `next.config.ts` `headers()` or in `src/proxy.ts`. This covers every response, including future early returns. The cost is that the headers then live in config, not next to the handler.

**O3 — the anonymous Seed Pool answer is 503 "unavailable", not 401 "Sign in".** The brief allows this.
- Cause: `web/src/lib/seed-pool/auth.ts:10` maps any `auth.getUser()` error to `unavailable`. With no session, supabase-js returns an `AuthSessionMissingError`, so the `!user` branch at :11 is never reached.
- A signed-out reader therefore sees "Seed papers are unavailable." rather than a sign-in prompt.

Candidate fixes:
1. Check `!user` first, or treat `error.name === "AuthSessionMissingError"` as unauthenticated.
2. Use `isAuthSessionMissingError`. It is exported by the installed `@supabase/auth-js` (`dist/main/lib/errors.d.ts`). `GoTrueClient.js:2485` returns exactly this error for a missing session.
3. Return early when no `sb-*` auth cookie is present.

**O1 — whole-project file tracing (pre-existing since `e59d3f04`, 2026-10-01).**
- `resolveWebRoot()` at `upload-backend.ts:50-58` (`existsSync(path.join(cwd,"next.config.ts"))`) makes the tracer include the whole `web/` tree in every function that imports the upload backend.
- Measured in each such `.nft.json`: about 1,300 files, including all 1,130 `web/src` files, 28 `web/supabase`, 8 `web/scripts` (including `extract_pdf_figures.py`), and `AGENTS.md`. Affected functions include `seed-pool`, `seed-pool/assets`, `papers/upload`, `upload/ticket`, `papers/report` and `papers/[id]/reading`. A plain route such as `feed` or `profile` traces 97–111 files.
- No `.env` file was traced in this build, but that is only because the worktree had none.

Candidate fixes:
1. Add `/*turbopackIgnore: true*/` to the `process.cwd()` and `path.join` calls in `resolveWebRoot`.
2. Compute the upload directory lazily, and only when `PEER_PRIVATE_UPLOAD_DIR` is unset and the bucket is off.
3. Add `outputFileTracingExcludes` for `src/**`, `scripts/**`, `supabase/**` and `*.md` under `/api/**`.

**Environment — the junction is incompatible with a Turbopack production build** when `turbopack.root` is pinned. Future production-build briefs should prescribe a real copy of `node_modules` (robocopy, about 13 s) instead of `mklink /J`.
