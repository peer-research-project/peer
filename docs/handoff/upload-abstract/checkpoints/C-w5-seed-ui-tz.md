# C-w5 — Seed pool UI styling (D-C2-1) + timezone edge investigation (C11) — 2026-11-04

Worker: Group 2 (W5-SEED-UI-TZ). Worktree `C:/Users/wbc13/AppData/Local/Temp/peer-wt-w5`, detached from `ad6594d6`.
Part 1 commit: `297792bf` "Style the seed pool with the app's primitives (D-C2-1)". Part 2 is investigation only (no code).

## Part 1 — D-C2-1 (RUBRIC Theme C unit 2)

### Change (web/src/components/seed-pool/seed-pool.tsx only, plus its test)

| Control | Before | After (existing primitive it reuses) |
|---|---|---|
| Save pool | bare `<button>` | `buttonVariants({tone:"primary",size:"md"})` — the only primary pill in the section |
| Undo pending changes, Retry, Retry file cleanup [n] | bare | `buttonVariants({tone:"soft",size:"sm"})` |
| Sign in with Google / GitHub | bare | `buttonVariants({tone:"surface",size:"md"})`, `flex-wrap` row |
| Forget this PDF and its recommendations | bare | the "Delete PDF" text action of `reader/private-pdf-status.tsx` (`underline underline-offset-4 hover:text-red`, caption, muted) |
| Confirm forget / Cancel | bare | the Profile's two-step "Confirm reset" / "Cancel" classes (P9-54), inside the same `bg-red/[0.05]` confirmation panel |
| Add PDFs file picker | native "Choose Files / No file chosen" | the `<label>` wears `buttonVariants({tone:"accentSoft"})`; the native input stays inside it as `sr-only` (still tabbable, named "Add PDFs" by its label); `has-[:focus-visible]:outline-2 outline-offset-3 outline-accent` draws the global keyboard ring on the pill; `has-[:disabled]:opacity-55` while busy |
| Per-file status lines | plain `<li>` | mono caption; `ready` = `text-[color:var(--color-positive)]`, `failed` = `text-red` (the upload button's error style), `processing` = faint; `data-status` attribute per line |
| Active today / Pending / Next pool | unstyled `<h3>`/`<legend>` | Profile card surface (`rounded-2xl bg-surface shadow-card`) + `eyebrow` heading (on the Profile page `.profile-page .eyebrow` renders it as the page's 600/13px sub-heading, same as "What Peer has learned") |
| Checkboxes | bare | `size-4 accent-[color:var(--color-accent)]`, row is `flex items-start gap-3` |
| 320 px | — | `min-w-0` on the fieldset/cards (a fieldset's default `min-width:min-content` would overflow), `wrap-anywhere` on titles, facets, dates and file names |

Every action carries `[@media(hover:none)]:min-h-11` (P9-23 / P9-52 rule). Text actions have no height class outside
`hover:none`. Native `<button>` elements are kept (pill classes via `buttonVariants`, as `briefing/upload-button.tsx`
does) so the existing hook-runtime tests that find `type === "button"` elements still drive the editor.

No user-facing string, ARIA role/attribute, handler or state logic changed. The only text-node change is that a paper
title / rights sentence is now wrapped in a `<span>` after the checkbox (same words).

Choice versus the brief: the brief pointed at the header upload button (input hidden + triggered by a ref click,
`tabIndex={-1}`). I used the label-wrapping variant instead, because the brief also requires the hidden input to stay
keyboard-accessible with an accessible name; a `tabIndex={-1}` input fails that, and the label pattern needs no ref.

### Tests (web/src/components/seed-pool/seed-pool.test.tsx)

Seven new tests in `describe("the seed pool wears the app's primitives (D-C2-1)")`, rendering the hook-runtime tree with
`renderToStaticMarkup` in a full state (pending pool, two uploads — one ready, one failed — forget confirmation open,
server-reported pending cleanup):
1. Save pool = primary pill (`bg-accent text-bg rounded-full` + touch floor); Undo / Retry file cleanup = soft pills, not primary.
2. Forget = underlined `hover:text-red` text action; Confirm forget / Cancel = Profile two-step classes; no height class outside hover:none.
3. Add PDFs = accentSoft pill label containing an `sr-only` `type="file"` input with no `tabindex` and no `hidden`.
4. Failed line `text-red`; ready line positive colour, not red.
5. h3 + legend use `eyebrow`; fieldset `min-w-0`; three checkboxes accent-coloured; `wrap-anywhere` present.
6. All 24 pre-existing strings present verbatim (intro copy, dates, facets, confirmation copy, rights text, status lines, cleanup copy).
7. Signed-out sign-in buttons are surface pills; unavailable state still says "Seed papers are unavailable. Try again." with a pill Retry.

The only harness change: `run()` stores the mounted tree in `lastTree` (one line) so a test can render it.

### Evidence

- `npx vitest run src/app/profile src/app/welcome src/components/seed-pool` → 11 files, 240 tests passed (seed-pool: 20/20, 13 old + 7 new).
- `npx tsc --noEmit --incremental false` → exit 0 (after deleting the worktree's `.next/` created by the browser probe; with it present, tsc reports a pre-existing generated-type error in `.next/dev/types/app/profile/page.ts` about page.tsx's `DataSourcesLink` export — not touched here).
- `npx eslint` on both files → 0 errors, 1 warning, pre-existing (test line 22, `run()`'s useEffect dependency, was line 20 before). An off-scale `mt-1.5`/`space-y-0.5`/`mt-0.5` from my first draft was corrected to the 8-based scale.
- Mutations (each: mutate → red → restore from backup; restored sha256 `896ea6e9…c77f` equals pre-mutation sha256 both times; 20/20 green after):
  - M1 remove `className={PRIMARY_ACTION}` from Save pool → sha `6ec6f1df…e441` → test 1 red.
  - M2 failed status `text-red` → `text-text-faint` → sha `fa14bf7b…dcdf` → test 4 red.
  - M3 file input `sr-only` → `hidden` → sha `338354c1…de64e` → test 3 red.
- Final hashes at commit: seed-pool.tsx `896ea6e91d3a3f9545659c759a5d7cc902cf8c99b91cda7a149c67ddde04c77f`, seed-pool.test.tsx `a53e54ffeaa006e3548bb7bac32171b1f9047a0a0fbace8ebb87aa1091c2e6ed`.
- Browser probe (worktree dev server `next dev --webpack -p 3105`, no env file = no Supabase; Turbopack refuses the node_modules junction): `/profile` signed-out, the rendered full-state markup injected in place of the SeedPool output inside `#seed-pool`, with a 90-character unbroken title and a 70-character unbroken file name. At 320×900 (mobile emulation, `hover:none`): `scrollWidth` 320 = `clientWidth`, zero elements outside the viewport; Save pool / Undo / Forget / Add PDFs all 44 px tall; Save pool background accent `rgb(255,82,13)` with light text; Undo soft background; failed line `rgb(255,82,13)`, ready line `rgb(4,120,87)`; checkbox `accent-color` accent. Tab from the rights checkbox lands on the file input (`:focus-visible` true), its label "Add PDFs" draws a solid accent outline; `input.labels[0]` = "Add PDFs". Desktop width (hover): Save pool / Add PDFs 36 px, Forget 20 px, Confirm forget 21 px — mouse boxes unchanged. Pills render square because the product's `[class~="rounded-full"] { border-radius: 0 }` rule — intended. Dev server stopped; no node process for the worktree left; `.next/` deleted.
- Not verified: the live signed-in editor in a real account (needs auth and the shared Supabase); visual review by a human.

## Part 2 — C11 timezone edge (investigation only)

Observed on the test project: feed served while `digest_timezone = 'UTC'` → `seed_pool_observed_days` row `2026-11-04`;
then `digest_timezone` became `America/Chicago` (Chicago date 2026-11-03) and another row `2026-11-03` was recorded;
the first pool save produced `pending_effective = 2026-11-04`.

### (a) Where and why digest_timezone changes automatically

- `web/supabase/schema.sql:129` — `digest_timezone text not null default 'UTC'`: every new account row starts in UTC.
- `web/src/store/profile.ts:709` — on profile pull, `remote.digestTimezone` (UTC) overwrites the browser default from `web/src/types/index.ts:434-437`.
- `web/src/app/profile/page.tsx:1673-1682` (inside `function EmailSettings`, line 1650, rendered at line 275 in the Briefings section of Profile): a `useEffect` on `[signedIn]` reads `Intl.DateTimeFormat().resolvedOptions().timeZone` and calls `updateDigestTimezone(detected)` when it differs ("detected, shown, and saved automatically (spec point 2.i); no picker"). The store setter is `web/src/store/profile.ts:618-619`; profile sync PUTs it and `web/src/app/api/profile/route.ts:135` writes `row.digest_timezone`.
- So the switch happens the first time a signed-in owner opens **Profile** — which is also where the Seed Paper Pool lives. Any feed served before that first Profile visit is dated in UTC.

### (b) Does Chicago 2026-11-04 rerank an already-delivered day?

All three "served" ledgers store a bare date label with no zone: `seed_pool_observed_days.local_date date`, `dashboard_batches.local_date text`, `briefing_deliveries.local_date text`. Every reader compares the label only.

- `seed_pool_apply` (migration `20261102000000_seed_pool.sql:80-118`): `v_today` = now in Chicago = 2026-11-03; `v_active` false; `v_served` true from the observed `2026-11-03` row (line 108) → `v_target = v_today + 1 = 2026-11-04` (line 109). It never looks at labels **after** `v_today`, so the UTC-written `2026-11-04` row is ignored.
- On Chicago 2026-11-04, `seed_pool_resolve` returns the new snapshot (effective ≤ target) → feed route `runLedgerAwareFeed` (`web/src/app/api/feed/route.ts:288-306`): `freeze` is true because a real seed version exists, `localDate = '2026-11-04'`, `ledger.getBatch(owner,'2026-11-04')` (line 324):
  - **Ledger flag off** (`PEER_DASHBOARD_LEDGER` ≠ `on`, which is how the observed rows were written — through `recordSeedFeedServed`, line 300): no batch row exists for `2026-11-04`, so a fresh **seeded** selection is minted and served for a label that was already served unseeded. By label, the "frozen" day is re-ranked.
  - **Ledger flag on**: the UTC serve would have left a `served` batch for `'2026-11-04'` with `seed_pool_version` null. Line 325 `existingSeedMatches` is false (`"none"` ≠ new version) and line 326 returns `{ unavailable: true }` → the owner's feed is **503 for the entire Chicago day 2026-11-04**. Digest: `claim_briefing_delivery` hits the existing `'2026-11-04'` delivery row (`on conflict … do nothing`, line 295) so no email that day either.
- Semantically, in wall-clock terms the UTC-labelled `2026-11-04` serve happened during the owner's **Chicago 2026-11-03 evening** (UTC 11-04 00:00Z–06:00Z = Chicago 11-03 18:00–24:00 CST). The owner's real Chicago 2026-11-04 has not been delivered. But the system's own identity for a day is the label: the ledger's `unique(owner_id, local_date)` and the freeze lookup both treat `'2026-11-04'` as one day regardless of the zone that produced it. Without a seed pool, Chicago 11-04 would re-serve that frozen UTC batch (ledger on) — the code already treats it as the same day.

### (c) Verdict

A real violation of RUBRIC C11 "later edits activate next owner-local calendar date (including DST/timezone cases), current day frozen" by the system's own day identity, and a hard failure (all-day 503) when the dashboard ledger flag is on. It is not exotic: a new owner in the Americas who sees a feed between UTC midnight and local midnight, then opens Profile (auto-switch) and saves a first pool, hits it. Eastward switches (UTC → Asia/Tokyo) only skip labels and do not collide.

### Three candidate rules

1. **Floor the target above every served label (apply-side).** In `seed_pool_apply`, compute `v_last := greatest(max served/acknowledged dashboard_batches.local_date, max briefing_deliveries.local_date, max seed_pool_observed_days.local_date)` for the owner; `v_target := greatest(<current rule>, v_last + 1)` whenever `v_last >= v_today`. Count only `served`/`acknowledged` batches, never `prepared`. Scenario result: `pending_effective = 2026-11-05`, Profile shows "Effective 2026-11-05 · America/Chicago" (honest), Chicago 11-04 keeps its frozen/unseeded behaviour.
   Cost: low — one SQL function (≈6 lines), plus cases in the isolated seed-SQL harness (UTC→Chicago backward switch; eastward switch; prepared-ahead row ignored). Delays the pool one extra day only in the backward-switch case. No schema change, no route change.
2. **Zone-aware served days.** Store the zone (or the UTC instant range) with every served label in the three ledgers and treat a target day as delivered when its UTC interval overlaps any served interval. Cost: high — schema change on three tables with backfill, every freeze lookup in the feed route / digest / prepare jobs changes; gives the same answer as rule 1 for this scenario (UTC 11-04 overlaps Chicago 11-04), so the extra precision buys little.
3. **Stop the date label from moving under a served day (timezone-side).** Either set `digest_timezone` from the browser at the first profile sync/sign-up so UTC never serves (fixes the common onboarding cause, low–medium cost in profile sync), or record timezone changes as pending until after the last served label (medium–high cost: every reader of `digest_timezone` — dispatch, prepare, resolve, apply — must honour an effective date). The first variant does not cover a legitimate later move (travel west), so it is a complement, not a full rule.

**Recommendation: rule 1**, now; optionally add the first variant of rule 3 later to remove the UTC-default trigger at onboarding. Rule 1 is the smallest change that makes "a served label is never re-ranked" hold for every direction of timezone change, removes the ledger-on all-day 503, and keeps the label as the single day identity the ledgers already use. It belongs to the seed SQL owner (migration + harness), not to this UI worker; no code was changed for Part 2.
