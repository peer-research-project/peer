# W2-G6 — Theme A real-item source truth on the isolated test target

2026-11-04 05:39–05:42 UTC. Group 2 A-role measurement, brief `briefs/W2-G6-ABSTRACT.md`. Repo HEAD `71d0c3f806f4bab765ec3da1af74f2f37da46b8c`, branch `fixing-bugs-on-uploading-pdf-and-abstract-reading`. No product code, env file, git state or dev-server state touched. No cookies, no model key, no `llmOverride` sent. Logs: `C:/Users/wbc13/AppData/Local/Temp/peer-claude-w2/`.

## Run 1 (05:39 UTC, historical, superseded by Run 2 below): BLOCKED — the test target did not serve any `/api/papers/*` route

Every Theme A unit in scope is **BLOCKED-ENV** (per manager notice 2026-11-04: environment fault, not a product result). Nothing below is a product PASS or FAIL.

### Target identity (verified)

- Listener `localhost:3000` = pid 23296 `next/dist/server/lib/start-server.js`, parent pid 12424 `next dev -p 3000`, grandparent pid 62496 `node scripts/dev-test-target.mjs` (preview serverId `49466147-…`, started 2026-11-04T05:35:13Z).
- Startup banner (preview log): Supabase host `cbsbtkvbmvyznerbpmxg.supabase.co`; blanked include every model key and `PEER_DIGEST_PROVIDER`, plus Resend/digest/cron/admin secrets. Next.js 16.2.3 (Turbopack).
- So `resolveProvider(null)` on this process is structurally `null` (`web/src/lib/llm/providers/registry.ts:122-127`, `resolveLocalOptInProvider` reads only `PEER_DIGEST_PROVIDER`). This is a configuration fact, not an observation of a report request.

### What was executed

`node C:/Users/wbc13/AppData/Local/Temp/peer-claude-w2/probe-w2.mjs` (origin `http://localhost:3000`): per paper, metadata `GET /api/papers/<id>?sourceVersion=2` ×2 and reading `GET /api/papers/<id>/reading?v=19` ×2 (same routes and query versions as `verify-real-controls.mjs` / `A-current-public-controls.md`); then three `POST /api/papers/report` for `openalex:W7222962933` (NDJSON shallow, NDJSON `deepReport:true`, JSON `deepReport:true`). Raw bodies `*.metadata.N.json`, `*.reading.N.json`, `report.*.txt`; summary `probe-w2.log`, `summary.json`. Budget used: 2 of 3 per GET endpoint per paper; 3 report POSTs. Remaining: 1 call per GET endpoint per paper.

| Call | HTTP | Content-Type / Cache-Control | Time |
|---|---|---|---|
| metadata ×2, each of 3 papers | 404 ×6 | `text/html` Next not-found page / `no-cache, must-revalidate` | 69–134 ms |
| reading ×2, each of 3 papers | 404 ×6 | same | 73–106 ms |
| report NDJSON shallow / NDJSON deep / JSON deep | 404 ×3 | same | 536 / 87 / 83 ms |

Diagnostics (no extra paper-route calls): `GET /api/papers/upload-availability` 404 HTML (that handler can only return JSON `{enabled}`), `OPTIONS /api/papers/report` 404 HTML; on the same process `/api/seed-pool` 503 JSON and `/api/briefings` 401 JSON answer from their handlers. Details: `diag-dev-server-route-table.txt`.

### Why this is environment, not product

- The preview log of this process shows **every** `/api/papers/*` request 404 from its first request, including the manager's own browser feed (`/api/papers/<id>/reading?…availability=1` cards and `upload-availability`), while `/api/figure`, `/api/feed`, `/api/profile`, `/api/saved`, `/api/read` return 200.
- The previous `peer-web-test-target` process (serverId `041bf9f0-…`, stopped 2026-11-03T23:14:04Z) served `/api/papers/upload-availability` 200 ×4 and `/api/papers/<id>/reading` 200 ×10 with the same launch config and the same source tree (no `web/src` change since 2026-11-03 11:53 local; git shows none).
- All four route files exist unchanged; no `web/app` or `web/pages` shadows `src/app`; `src/proxy.ts` → `updateSession` only returns `NextResponse.next()`. An HTML 404 means the dev router never dispatched to the route module. `.next/dev/server/app/api/papers/*` artifacts date from 2026-11-02 and were not recompiled by this process.
- Root cause inside Turbopack's dev route table is not determined; isolating it needs a restart, which this worker may not do.

## Per-unit status

| Unit | Status | Evidence this round | 27b local record (`A-current-public-controls.md`, port 4314, `next start`) |
|---|---|---|---|
| A1 JSON zero model calls, empty abstract | BLOCKED-ENV | JSON report POST 404 before handler. Only config evidence: no provider resolvable on this process. | Not measured live (fixture PASS in `A-report-source-final.md`). |
| A2 NDJSON zero model calls incl. failed deep fallback | BLOCKED-ENV | NDJSON shallow/deep POST 404 before handler; no `mode`/`stage` events observed. | Not measured live (fixture PASS). |
| A5 availability/provenance reflects evidence | BLOCKED-ENV | reading 404 | Provenance per paper recorded (see A13–A15). |
| A8 absence vs transient vs blocked | BLOCKED-ENV | metadata 404 | S2 429 `transient`, Crossref `missing`, publisher 403 `blocked` for W7222962933. |
| A10 bounded enrichment, accurate provenance | BLOCKED-ENV | metadata 404 | 2,676 ms metadata+reading for W7222962933. |
| A11 403 = blocked/unknown, not paywall | BLOCKED-ENV | reading 404 | `fullText:blocked`, `blockedHost: sciencedirect.com`, no paywall host. |
| A12 final redirect host preserved | BLOCKED-ENV | reading 404 | blocked host `sciencedirect.com`. |
| A13 screenshot DOI honest (W7222962933) | BLOCKED-ENV | 404 ×4 | 200/200, abstract 0 chars / 0 sentences, both `no-store`. |
| A14 arxiv:1706.03762 control | BLOCKED-ENV | 404 ×4 | abstract 1,135 chars / 7 sentences, full text `html`, fingerprint `y4obqh`, public cache headers. |
| A15 openalex:W7204479535 control | BLOCKED-ENV | 404 ×4 | abstract 2,023 chars / 11 sentences, full text `none`, fingerprint `lge7vj`, public cache headers. |
| A16 feed eligibility explained by code | UNRUN (not in this probe's routes) | — | Fixture PASS only. |

Stability/caching repeat: both rounds identical 404, so no caching conclusion can be drawn. No product FAIL is recorded, so no file:line product cause applies.

## Manager notice (2026-11-04)

Manager confirmed the `/api/papers/*` HTML 404 is a dev-server route-registration fault under diagnosis, not a product FAIL. Calls to `/api/papers/*` are paused until the manager reports the server fixed. No further calls were made after the notice.

## Candidate fixes for the blocker (environment; manager decides, not done here)

1. **Restart the `peer-web-test-target` preview server** (stop, start the same launch entry). Cost: ~10 s plus first-request compile; ends the manager's browser session state on port 3000 only. Cheapest; the previous process with identical config served these routes.
2. **If still 404 after restart: stop the server, move `web/.next/dev` aside (Turbopack persistent cache, ~477 MB), restart.** Cost: full cold compile (~1–2 min per first route), cache rebuild; reversible if moved rather than deleted.
3. **Measure via `next start` on a separate loopback port (as 27b did on 4314) with the test-target env.** Cost: a production build (several minutes) and a second process; avoids the dev router entirely but is a different runtime from the rehearsal target, and `requireAiRequest` then takes the deployed/auth branch (report route would answer 401 to an unauthenticated caller, so A1/A2 would show the sign-in gate, not tier-0 behavior).

**Recommendation: 1, then 2 only if 1 fails.** After the fix, the stability check needs two calls per endpoint per paper but only one remains in this brief's budget; the manager should either authorize a fresh budget for the rerun (then run `probe-w2.mjs` as is) or accept a single-round rerun (change `[1, 2]` to `[1]` in the script) with no repeat-stability evidence.

## Run 2 (2026-11-04 05:45:06–05:45:12 UTC) — after manager fix; CURRENT RESULT

Manager stopped the Run 1 process, moved `web/.next/dev` aside (stale Turbopack cache: `/api/papers/[id]/*` missing from app-paths-manifest), restarted the same `peer-web-test-target` launch entry (preview serverId `8719976b-…`, started 05:44:14Z), and granted a fresh budget. This worker did not start or stop anything.

Command: `node C:/Users/wbc13/AppData/Local/Temp/peer-claude-w2/run2/probe-w2-run2.mjs`. It is the Run 1 script with the per-call timeouts raised to 120 s and the output folder set to `run2/`. Raw bodies: `run2/*.metadata.N.json`, `run2/*.reading.N.json`, `run2/report.*.txt`. Summary: `run2/probe-w2-run2.log`, `run2/summary.json`. Calls used: 2 per GET endpoint per paper (third call unused) plus 3 report POSTs. No cookies, no key, no `llmOverride`. The server log (preview_logs) confirms all 15 requests: 12 GET 200 and 3 POST 200.

### Observations (rounds 1 / 2 identical in every field except timing)

| Paper | Metadata | Reading | Cache-Control (meta / reading) | Elapsed ms (meta+reading, r1 / r2) |
|---|---|---|---|---|
| `openalex:W7222962933` (DOI `10.1016/j.psep.2026.109758`) | 200. Abstract 0 chars / 0 sentences. `abstractRetrieval.status: transient`; attempts: semantic_scholar `transient` HTTP 429, crossref `missing` HTTP 200, publisher `blocked` HTTP 403. `linkPaper https://doi.org/10.1016/j.psep.2026.109758` | 200. provenance `abstract:none`, `abstractSentences:0`, `fullText:blocked`, `blockedHost: sciencedirect.com`, no `paywallHost`, `body:[]`, `sourceFingerprint:null`, `X-Peer-Readability: unknown` | `no-store` / `no-store` | 1695+760 (first call includes ~1.0 s route compile) / 345+832 |
| `arxiv:1706.03762` | 200. Abstract 1,135 chars / 7 sentences. No `abstractRetrieval` (abstract came from the source record). `linkPaper https://arxiv.org/abs/1706.03762v7` | 200. `abstract:full`, 7 sentences, `fullText:html`, `sourceLabel: arXiv HTML`, buckets abstract/introduction/methods/body/results/conclusion, body 22 blocks, fingerprint `y4obqh`, readability `readable` | `public, s-maxage=3600, stale-while-revalidate=86400` / `public, s-maxage=86400, stale-while-revalidate=604800` | 35+57 / 28+49 |
| `openalex:W7204479535` (DOI `10.1038/s41598-026-64923-9`) | 200. Abstract 2,023 chars / 11 sentences. No `abstractRetrieval` | 200. `abstract:full`, 11 sentences, `fullText:none`, no blocked or paywall host, `body:[]`, fingerprint `lge7vj`, readability `abstract` | same public headers as arXiv | 150+940 / 42+41 |

Report route for `openalex:W7222962933`: no key, no cookie; the paper object is the metadata response.

| Call | HTTP | Cache-Control | Body | Server application time |
|---|---|---|---|---|
| NDJSON shallow (`Accept: application/x-ndjson`) | 200 | `private, no-store, no-transform` | `{"type":"mode","aiMode":"tier0"}` then `{"type":"stage","stage":"done","label":"Basic report ready","pct":100}`; no `report` event | 9 ms (route compile 514 ms) |
| NDJSON `deepReport:true` | 200 | same | identical two events; no `source`/`reading`/`writing` stage, no full-text fetch | 5 ms |
| JSON `deepReport:true` | 200 | `private, no-store` | `skim:[]`, empty `whatItProposes`/`resultsAndSignificance`, `noLlm:true`, `depth:"fallback"`, `provenance.basis:"model-abstract"`, `droppedClaims:0` | 4 ms |

Evidence that no model was called: the process environment blanks every model key and `PEER_DIGEST_PROVIDER` (startup banner), so `resolveProvider(null)` returns null (`web/src/lib/llm/providers/registry.ts:122-127`). The responses carry the tier-0 / `noLlm` markers. The handlers spent 4–9 ms of application time, too short for any provider round trip. The server log has no `[papers/report]` line. No proposal, findings, novelty or summary prose was produced.

### Per-unit status (Run 2, actual input, this test target only)

| Unit | Status | Basis | vs 27b local record |
|---|---|---|---|
| A1 JSON zero model calls, empty abstract | **PASS** | JSON deep request without a key returns the empty `noLlm` fallback in 4 ms with no provider. Side note, no cost assigned: the empty report's wire `basis` is `"model-abstract"`. This is documented as intentional (`web/src/lib/papers/report.ts:256-271`, "`noLlm` is the truth the page reads… neither cached nor rendered"), and `reportForReading` (`web/src/components/reader/use-model-report.ts:273-275`) drops a model-abstract report when the reading's abstract is `none`. | First live measurement (27b did not exercise the report route) |
| A2 NDJSON zero model calls incl. failed deep fallback | **PASS (no-key path)** | Shallow and deep NDJSON both answer tier0 with no report and no model. Limit: with no provider the stream stops before `getFullText` (`web/src/app/api/papers/report/route.ts:387-397`), so the "failed deep fallback with a key" clause is not reachable without a key. It stays fixture-only (`A-report-source-final.md` unit 2). | First live measurement |
| A5 availability/provenance reflects actual evidence | **PASS (live path); legacy-cache clause UNRUN** | The provenance of all three readings matches what the sources returned: blocked→`blocked`+host, html→`html`+label+buckets, no full text→`none`. Readability headers match: unknown / readable / abstract. No legacy cached result was exercised here. | Identical |
| A8 absence vs transient vs blocked | **PASS** | Three distinct per-source labels (429 `transient`, 200-empty `missing`, 403 `blocked`). The overall `transient` status keeps the metadata and reading `no-store`, so a transient miss is not cached as absence. | Identical |
| A10 bounded enrichment, accurate provenance | **PASS (observed bound)** | W7222962933 metadata took 583 ms of application time with exactly three attempts, each recorded with its HTTP status. Second call 316 ms. Total metadata+reading ≤ 2.5 s including compile. The 27b run took 2,676 ms. Universal coverage and the retry bound under slow upstreams are not tested here. | Comparable or faster |
| A11 HTTP 403 = blocked/unknown, not paywall | **PASS** | Publisher 403 → `blocked`. Reading `fullText:blocked`, no `paywallHost`, readability `unknown`. | Identical |
| A12 final redirect host preserved | **PASS** | The link is `doi.org`, and the recorded blocked host is the final host `sciencedirect.com`, not `doi.org`. | Identical |
| A13 screenshot DOI honest (W7222962933) | **PASS** | 200/200. Abstract 0 / 0. Transient, missing and blocked are named. `no-store` on both. No report prose without a key. | Identical; adds the report-route evidence |
| A14 arxiv:1706.03762 control | **PASS** | 1,135 chars / 7 sentences, `html`, `y4obqh`, public cache headers, stable over 2 rounds | Identical |
| A15 openalex:W7204479535 control | **PASS** | 2,023 chars / 11 sentences, full text `none` (honest, not called paywall), `lge7vj`, public cache headers, stable | Identical |
| A16 feed eligibility explained by code | **UNRUN** | Not in this brief's routes | — |

No FAIL, so no file:line cause or candidate fix applies. Scope limits:
- These are single-time observations of variable public upstreams on the isolated test target.
- Out of scope here:
  - UI rendering
  - signed-in or hosted behavior
  - a with-key report
  - publisher-abstract acceptance (A9)
  - the legacy cache (A5 clause)
  - A16
- No whole-theme score is assigned.
