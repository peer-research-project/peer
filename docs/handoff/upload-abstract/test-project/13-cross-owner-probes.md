# 13 — B7 / C17: account B probing account A's private objects

Rubric Theme B unit 7 ("Storage auth/private ownership/size/signed access remain enforced") and Theme C unit 17 ("Authentication/private ownership enforced throughout upload/read/edit/delete/jobs/cache"). Scorecard: both UNRUN for the cross-owner part ("second account, real JWT/RLS in app"). Anonymous, cross-site, size, type and rights refusals already passed (scorecard B7 note, `A-w6-prod-build.md`). Target: peer-test (ref `cbsbtkvbmvyznerbpmxg`) through http://localhost:3000.

Files: `13-cross-owner-verify.sql` (read-only, before/after) and the console probes below.

## Needs the user

Account B must be **signed in by the user** on http://localhost:3000 in a **separate browser profile** (no shared cookies or storage with A). Per the scorecard, use B **first** for C10 (save B's first seed pool before B is ever served a briefing), and keep B out of any `dispatch-digests` run (`11-c13-digest-setup.sql` disables it). B needs a `profiles` row; without one, every seed probe answers 503 "Seed papers are unavailable." instead of the ownership answer (`seed_pool_resolve` / `seed_pool_apply` return `unavailable` without a profile).

## Where ownership is decided (code)

- **Ordinary uploads**: every route resolves the caller's owner key from the session (`uploadOwner`, `web/src/lib/papers/upload-access.ts` 32–52: `sha256("account:" + user.id)`) and admits a record only through `ownedUpload` (54–69): the record's `ownerKey` must equal the caller's, unexpired, status `ready`. Upload ids are owner-salted (`privateUploadHash(ownerKey, bytes)`, `upload-store.ts` 315–317; used by `upload/route.ts` 196), so the same PDF uploaded by B gets a different id. Staged objects are accepted only from the caller's own `incoming/<ownerKey>/` (`isOwnStagedUpload`, `upload-store.ts` 257–260).
- **Seed pool**: the owner id comes only from the session (`seedRequestContext`, `web/src/lib/seed-pool/auth.ts`); every RPC filters by `owner_id = p_owner_id`: `seed_pool_forget` looks up `where owner_id=p_owner_id and id=p_seed_id` → `not_found` (bundle 626–627); `seed_pool_apply` counts only the caller's `ready` assets → `invalid_seed` (bundle 588–590). There is **no route that accepts a snapshot or version id**: snapshots are read only through the caller's own `seed_pool_resolve` / `seed_pool_editor`.
- **Seed PDFs** are never served by any route (only `POST /api/seed-pool/assets` writes and `DELETE /api/seed-pool/assets/[id]` removes them). The bucket is private with no `storage.objects` policies (`README.md`), so a signed-in browser cannot read another owner's object directly.
- **Batches**: `POST /api/feed/ack` reads `getBatchById(user.id, batchId)` (owner-filtered, `web/src/lib/dashboard/delivery-ledger.ts` 564–570) → 404 `batch_not_found` (`web/src/app/api/feed/ack/route.ts` 89–91). `GET /api/feed/archive?date=` and `GET /api/briefings` read only the session owner's rows.

## Steps

1. **A's ids (A's browser / SQL).** After C15/C13 (before C16's forget): A's ordinary upload `<hash16>` (address bar `/papers/upload:<hash16>`), A's seed asset id, A's `meta.batchId` (C13 step 3), and, if A attached a PDF to a public paper, that paper id. Run `13-cross-owner-verify.sql` with both emails and these ids; save `x-0-before.json`. Copy `a_owner_key`.
2. **Positive control (A's browser).** Paste the probe block below with A's own ids into **A's** console: U1, U2, U3 must answer **200** (otherwise a 404 from B would prove nothing). Skip U9 and S1 in A's console (they would delete A's data) — the block skips them automatically when `RUN_AS_OWNER_CONTROL = true`.
3. **B's probes (B's browser).** Paste the block with `RUN_AS_OWNER_CONTROL = false` into **B's** DevTools console on http://localhost:3000. Save the printed table (status codes and the first 100 characters of each body; no cookie or token is printed).
4. Run `13-cross-owner-verify.sql` again; save `x-1-after.json`. Expected: every `a_*` value identical to step 1 (objects present, seed `status: ready` with the same `features_md5`, same `a_seed_state`, same `a_batch.status`); `b_snapshots_referencing_a_seed`, `b_assets_with_a_seed_id`, `b_markers_referencing_a_upload`, `b_batches_with_a_batch_id`, `b_deliveries_naming_a_batch` all **0**. `b_seed_state` may now exist with `revision` unchanged at its prior value (or 0 if new): S1/S2 insert B's empty state row if absent but never bump it on a refusal.
5. **After C16** (A has forgotten the seed): re-run probe S1 in B's console → still **404**, and `13-cross-owner-verify.sql` → `a_seed_asset.status: revoked`, B counts still 0.
6. **Same bytes, different owners (C17, optional).** In B's Profile → **Seed Paper Pool**, add `fictional-canopy.pdf` (the same bytes A used). `13-cross-owner-verify.sql` → `same_bytes_seed_copies.b_any: 1` and `a_live` unchanged. B forgets its own copy (**Forget this PDF and its recommendations** → **Confirm forget** → 200 "forgotten"): `a_live` unchanged and A's `a_seed_asset` still `ready` with the same `features_md5` (`seed_pool_forget`'s related-asset walk is owner-filtered, bundle 635–640). Do this after B's C10 evidence is saved.

## Probe block (DevTools console, http://localhost:3000)

```js
const RUN_AS_OWNER_CONTROL = false;        // true only in A's own browser (step 2)
const A = {
  hash16: 'REPLACE_16_HEX',               // A's upload:<hash16>
  ownerKey: 'REPLACE_64_HEX',             // a_owner_key from 13-cross-owner-verify.sql
  seedId: 'REPLACE_UUID',                 // A's seed asset id
  batchId: 'REPLACE_UUID',                // A's meta.batchId
  attachedPaperId: '',                    // optional: public paper id A attached a PDF to
};
const results = [];
const run = async (id, label, url, init, expect) => {
  let status = 'ERR', cacheControl = '', bodyHead = '';
  try {
    const r = await fetch(url, { cache: 'no-store', ...init });
    status = r.status; cacheControl = r.headers.get('cache-control') ?? '';
    bodyHead = (await r.text()).slice(0, 100);
  } catch (e) { bodyHead = String(e).slice(0, 100); }
  results.push({ id, label, status, expect: expect.join('|'), pass: expect.includes(status), cacheControl, bodyHead });
};
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return { method: 'POST', body: f }; };
const U = `upload:${A.hash16}`, UE = encodeURIComponent(U), paper = { id: U, title: 'cross-owner probe' };
const staged = `incoming/${A.ownerKey}/00000000-0000-4000-8000-000000000000.pdf`;
const own = RUN_AS_OWNER_CONTROL ? [200] : [404];

await run('U1', 'upload record', `/api/papers/upload/${A.hash16}`, {}, own);
await run('U2', 'upload PDF bytes', `/api/papers/upload/${A.hash16}/file`, {}, own);
await run('U3', 'reading data', `/api/papers/${UE}/reading`, {}, own);
if (!RUN_AS_OWNER_CONTROL) {
  await run('U4', 'figure image', `/api/papers/${UE}/figure-image?page=1&fig=1`, {}, [404]);
  await run('U5', 'deep report', '/api/papers/report', json('POST', { paper }), [404]);
  await run('U6', 'plain explanation', `/api/papers/${UE}/plain`, json('POST', { paper, text: 'probe', level: 'highschool' }), [404]);
  await run('U7', 'explain passage', `/api/papers/${UE}/explain`, json('POST', { paper, passage: 'probe' }), [404]);
  await run('U8', 'paragraph guide', `/api/papers/${UE}/paragraph-guide`, json('POST', { paper }), [404]);
  await run('U9', 'delete A upload', `/api/papers/upload/${A.hash16}`, { method: 'DELETE' }, [404]);
  await run('U10', 'own upload list', '/api/papers/upload', {}, [200]);
  if (A.attachedPaperId) await run('U11', 'attachment lookup', `/api/papers/upload?paperId=${encodeURIComponent(A.attachedPaperId)}`, {}, [200]);
  await run('U12', 'claim A staged name (reading upload)', '/api/papers/upload', form({ staged, rightsVersion: '2026-09-19' }), [400]);
  const editor = await (await fetch('/api/seed-pool', { cache: 'no-store' })).json();
  await run('S1', 'forget A seed', `/api/seed-pool/assets/${A.seedId}`, json('DELETE', { expectedRevision: editor.revision }), [404]);
  await run('S2', 'put A seed into B pool', '/api/seed-pool', json('PUT', { expectedRevision: editor.revision, seedIds: [A.seedId] }), [400]);
  await run('S3', 'claim A staged name (seed)', '/api/seed-pool/assets', form({ staged, rightsVersion: '2026-09-19' }), [400]);
  await run('S4', 'own seed editor', '/api/seed-pool', {}, [200]);
  await run('F1', 'acknowledge A batch', '/api/feed/ack', json('POST', { batchId: A.batchId }), [404]);
  await run('F2', 'own briefings', '/api/briefings', {}, [200]);
  const leaks = {
    U10_lists_A: (await (await fetch('/api/papers/upload', { cache: 'no-store' })).text()).includes(A.hash16),
    S4_lists_A: JSON.stringify(await (await fetch('/api/seed-pool', { cache: 'no-store' })).json()).includes(A.seedId),
    F2_lists_A_batch: (await (await fetch('/api/briefings', { cache: 'no-store' })).text()).includes(A.batchId),
  };
  console.log('leak checks (all must be false):', leaks);
}
console.table(results);
```

## Expected answers (B's console) and their source

| Probe | Expected | Code |
|---|---|---|
| U1 `GET /api/papers/upload/<A hash16>` | 404 `{"error":"Upload not found."}`, `Cache-Control: private, no-store` | `upload/[id]/route.ts` 27–30 (`ownedUpload` → null) |
| U2 `GET …/<A hash16>/file` | 404 `{"error":"Upload not found."}`, private no-store | `upload/[id]/file/route.ts` 17–20 |
| U3 `GET /api/papers/upload%3A<hash16>/reading` | 404 `{"error":"Paper not found"}` | `papers/[id]/reading/route.ts` 81–88 |
| U4 figure image | 404 `Upload not found.` | `papers/[id]/figure-image/route.ts` 72–75 |
| U5 `POST /api/papers/report` `{paper:{id:"upload:<A>"}}` | 404 `{"error":"Upload not found."}` before the sign-in/rate gate | `papers/report/route.ts` 585–590 |
| U6 plain / U7 explain / U8 paragraph-guide | 404 `{"error":"Upload not found."}` before the gate | `plain/route.ts` 148–153, `explain/route.ts` 235–240, `paragraph-guide/route.ts` 151–156 |
| U9 `DELETE /api/papers/upload/<A hash16>` | 404 `{"error":"Upload not found."}`; A's objects unchanged in step 4 | `upload/[id]/route.ts` 43–47 |
| U10 own list | 200; body does not contain A's hash16 (`leaks.U10_lists_A: false`) | `upload/route.ts` GET → `listUploadMeta(B)` (owner markers + owner check, `upload-store.ts` 506–527) |
| U11 attachment lookup | 200 `{"paper":null}` (attachment records are keyed by owner + paper) | `upload/route.ts` GET, `upload-store.ts attachmentName` 319–322 |
| U12 staged name in A's folder | 400 `{"error":"No PDF file was attached."}`; A's staged objects untouched (the `finally` removal is owner-checked) | `upload/route.ts` 154–161, `upload-store.ts` 262–273 |
| S1 `DELETE /api/seed-pool/assets/<A seed>` | 404 `{"error":"Seed paper not found."}` (409 only if B's revision changed between the two calls — rerun) | `seed-pool/assets/[id]/route.ts` 18–21; bundle 626–627 |
| S2 `PUT /api/seed-pool` with A's seed | 400 `{"status":"invalid_seed"}`; no B snapshot created | `seed-pool/route.ts` 26–29; bundle 588–590 |
| S3 seed upload claiming A's staged name | 400 `{"error":"No PDF file was attached."}` | `seed-pool/assets/route.ts` 34–44 |
| S4 own editor | 200; no A seed id anywhere (`leaks.S4_lists_A: false`) | `seed_pool_editor` (owner-filtered) |
| F1 `POST /api/feed/ack` with A's batch | 404 `{"error":"batch_not_found"}`; A's batch status unchanged | `feed/ack/route.ts` 89–91 |
| F2 own briefings | 200; no A row (`leaks.F2_lists_A_batch: false`) | `briefings/route.ts` (`.eq("user_id", user.id)`) |

Any `pass: false`, any `true` leak flag, or any change to an `a_*` value in step 4 is a hard ownership failure (rubric "Hard requirements … ownership").

## Optional — direct database and storage probes with B's real token (RLS layer)

The app routes above use the server's service-role client plus an explicit owner filter; this optional block checks the database's own row-level security and the private bucket with B's real browser session. It needs the peer-test **publishable** key (public by design; copy it from the peer-test dashboard, Project Settings → API Keys). The session token is read from B's own cookie in memory and never printed.

```js
const REF = 'cbsbtkvbmvyznerbpmxg', PUBLISHABLE = 'PASTE_PEER_TEST_PUBLISHABLE_KEY';
const A_ID = 'REPLACE_A_USER_UUID', A_KEY = 'REPLACE_64_HEX', A_SEED = 'REPLACE_UUID', A_HASH = 'REPLACE_16_HEX';
const jar = Object.fromEntries(document.cookie.split('; ').filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const base = `sb-${REF}-auth-token`;
let raw = jar[base] ?? Object.keys(jar).filter((k) => k.startsWith(base + '.')).sort((x, y) => Number(x.split('.').pop()) - Number(y.split('.').pop())).map((k) => jar[k]).join('');
if (raw.startsWith('base64-')) { const b = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/'); raw = new TextDecoder().decode(Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), (ch) => ch.charCodeAt(0))); }
const token = JSON.parse(raw).access_token;
const h = { apikey: PUBLISHABLE, Authorization: `Bearer ${token}` };
const rest = async (path) => { const r = await fetch(`https://${REF}.supabase.co/rest/v1/${path}`, { headers: h }); const t = await r.text(); let rows = null; try { const j = JSON.parse(t); rows = Array.isArray(j) ? j.length : null; } catch {} return { path: path.split('?')[0], status: r.status, rows }; };
const obj = async (name) => { const r = await fetch(`https://${REF}.supabase.co/storage/v1/object/authenticated/private-uploads/${name}`, { headers: h }); return { object: name.replace(A_KEY, '<A key>'), status: r.status, bytes: r.ok ? (await r.arrayBuffer()).byteLength : 0 }; };
console.table([
  await rest(`seed_pool_assets?select=id&id=eq.${A_SEED}`),
  await rest(`seed_pool_snapshots?select=version&owner_id=eq.${A_ID}`),
  await rest(`seed_pool_state?select=owner_id&owner_id=eq.${A_ID}`),
  await rest(`dashboard_batches?select=id&owner_id=eq.${A_ID}`),
  await rest(`briefing_deliveries?select=id&user_id=eq.${A_ID}`),
  await rest(`private_paper_pools?select=scope_key&owner_id=eq.${A_ID}`),
  await rest(`seed_pool_observed_days?select=local_date&owner_id=eq.${A_ID}`),
]);
console.table([await obj(`seed-pool/${A_KEY}/${A_SEED}.pdf`), await obj(`${A_HASH}.pdf`), await obj(`${A_HASH}.json`)]);
```

Expected: every table answers **200 with `rows: 0`** (owner-read policies `auth.uid() = owner_id`), except `seed_pool_observed_days`, which answers **401 or 403** (no grant to `authenticated`; bundle line 505 `revoke all … from public, anon, authenticated`; also seen in `09-post-bundle-role-smoke.sql`). Every storage object answers **400 or 404** ("Object not found") with `bytes: 0`. Any row count > 0 or any `bytes > 0` is a hard failure.

## What this does NOT prove

- Two accounts on one local dev server, not production; the deployed site's cookies, headers and caching layers are not exercised (B7's production-mode anonymous refusals were covered in W6).
- Concurrency (B racing A's own edits), expired-session and token-refresh behaviour.
- Job routes (`purge-uploads`, `dispatch-digests`, `prepare-dashboards`) are protected by the operator secret, not by user ownership; B cannot call them without that secret (401), which is already covered and not re-tested here.
- The optional RLS block checks reads only; write attempts through PostgREST are covered by `09-post-bundle-role-smoke.sql` at the SQL level.
