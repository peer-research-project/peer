BEGIN;
-- BEGIN web/supabase/migrations/20260924000000_dashboard_delivery_ledger.sql
-- P4-S1: owner-level, PERMANENT dashboard delivery ledger + per-day batch
-- tracking + atomic acknowledgment (acceptance 16, ABC-JEV-INTEGRATION.md
-- §1p.C). This migration is authored only; it is not applied by this
-- campaign, following the same convention as
-- 20260922000000_private_paper_pools.sql and 20260904000000_usage_counters.sql.
--
-- DB/RLS PROOF: BLOCKED. No isolated Supabase instance is available to this
-- agent (foundation slice P4-S1, no DB/network access permitted). Everything
-- below has been statically self-reviewed only (table/FK order, column
-- types, constraints, RLS policy shape, grant/revoke symmetry, function
-- control flow) -- never executed against a real Postgres instance.
--
-- Table creation order matters: dashboard_batches is created FIRST because
-- dashboard_deliveries.batch_id references it (FK order).
--
-- Batch status values are exactly 'prepared' | 'served' | 'acknowledged'
-- (binding ruling ABC-JEV-INTEGRATION.md §1p.C.5 -- NOT the earlier B guide
-- draft's 'presented_pending_ack'):
--   prepared     - selected, never sent to a client.
--   served       - returned to an authenticated client (possibly presented
--                  -- the server cannot observe that a card actually
--                  rendered in a browser, only that a response carrying it
--                  was sent).
--   acknowledged - the client confirmed the batch rendered. This is the
--                  ONLY transition that copies papers into
--                  dashboard_deliveries (see the function below).

-- ── dashboard_batches ────────────────────────────────────────────────────
-- One row per (owner, local date) -- the unit acknowledgment operates on.
-- `papers` freezes the ordered per-paper identity (canonical key + aliases)
-- selected at prepare time, as a jsonb array of {key, aliases} objects
-- rather than two parallel arrays: aliases is itself variable-length per
-- paper, so a parallel-array shape would need an array-of-arrays column and
-- index-alignment discipline between it and a separate keys array, for no
-- real benefit. A jsonb array keeps each paper's key and its aliases
-- atomically paired and round-trips directly to/from the application's
-- PaperIdentity[] shape (web/src/lib/dashboard/delivery-ledger.ts).
create table if not exists public.dashboard_batches (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  local_date      text not null,              -- YYYY-MM-DD, owner's resolved local day; opaque to this migration
  papers          jsonb not null default '[]',
  status          text not null default 'prepared'
                    check (status in ('prepared', 'served', 'acknowledged')),
  intent_version  text,                        -- from NormalizedFeedIntent, for future staleness checks
  created_at      timestamptz not null default now(),
  served_at       timestamptz,
  acknowledged_at timestamptz,
  -- P4-S3 addition -- the exact served item payloads (ScoredItem[], the same
  -- shape POST/GET /api/feed's own `items` response field carries), frozen
  -- at prepare/mint time so a same-day replay never depends on the day's
  -- pool cache (the pool cache key changes when intent changes mid-day, but
  -- this column does not). Nullable: a row written before this column
  -- existed has no stored items, and the application
  -- (web/src/app/api/feed/route.ts's resolveServedItems) falls back to
  -- reconstructing them from today's pool by canonical identity rather than
  -- treating a null here as an error.
  served_items    jsonb,
  constraint dashboard_batches_papers_is_array check (jsonb_typeof(papers) = 'array'),
  constraint dashboard_batches_served_items_is_array_or_null
    check (served_items is null or jsonb_typeof(served_items) = 'array'),
  unique (owner_id, local_date)
);

-- listServedUnacknowledged's query shape: owner_id + status = 'served'.
create index if not exists dashboard_batches_owner_status_idx
  on public.dashboard_batches (owner_id, status);

-- ── dashboard_deliveries ─────────────────────────────────────────────────
-- Owner-level, PERMANENT (no TTL/expiry column, ever -- ABC-JEV-INTEGRATION.md
-- §7.2: "正常账号使用期间不对推送记录设置每日/30 天失效"), keyed by canonical
-- paper identity, independent of project/source/device/daily cache.
-- primary key (owner_id, canonical_key) makes the acknowledgment function's
-- insert naturally idempotent via ON CONFLICT DO NOTHING below -- a
-- retried/duplicate ack call is safe to replay.
create table if not exists public.dashboard_deliveries (
  owner_id      uuid not null references auth.users(id) on delete cascade,
  canonical_key text not null,
  key_version   smallint not null default 1,   -- P4-S1 ships v1 of canonicalPaperKey only; see module comment
  aliases       text[] not null default '{}',
  batch_id      uuid not null references public.dashboard_batches(id) on delete cascade,
  delivered_at  timestamptz not null default now(),
  primary key (owner_id, canonical_key)
);

create index if not exists dashboard_deliveries_owner_idx
  on public.dashboard_deliveries (owner_id);

-- Alias lookups: "was this paper (under ANY of its known aliases) ever
-- delivered" (§1p.A's asymmetric-exclusion rule -- a candidate is excluded
-- if its own key OR any of its own aliases intersects this table's
-- keys-union-aliases) needs to be answerable without an N-row-per-candidate
-- scan.
create index if not exists dashboard_deliveries_aliases_idx
  on public.dashboard_deliveries using gin (aliases);

alter table public.dashboard_batches enable row level security;
alter table public.dashboard_deliveries enable row level security;

-- Owner-only SELECT, no INSERT/UPDATE policies on either table: both are
-- server-side/service-role writes only (mirrors briefing_deliveries'
-- "writes are done by ... service role" convention, schema.sql:262-263),
-- reached only through the ledger's prepareBatch/markServed (service-role
-- writes) and the acknowledge_dashboard_batch function below -- never a
-- direct PostgREST write from an authenticated client. This closes the
-- "unforgeable from body/query values" requirement for the ack surface.
create policy "owners read their dashboard batches"
  on public.dashboard_batches for select using (auth.uid() = owner_id);
create policy "owners read their dashboard deliveries"
  on public.dashboard_deliveries for select using (auth.uid() = owner_id);

-- Belt-and-suspenders, matching usage_counters.sql's explicit revoke: RLS
-- with no insert/update policy already blocks writes regardless of table
-- privilege, but an explicit revoke-then-grant-select-only removes any
-- doubt and matches "revoke all ... from anon, authenticated where
-- appropriate". anon never gets SELECT back -- there is no anonymous
-- owner_id for auth.uid() to match, so an anon grant would be dead
-- privilege at best.
revoke all on table public.dashboard_batches from anon, authenticated;
revoke all on table public.dashboard_deliveries from anon, authenticated;
grant select on table public.dashboard_batches to authenticated;
grant select on table public.dashboard_deliveries to authenticated;

-- ── Atomic, idempotent acknowledgment ────────────────────────────────────
-- Same shape as increment_usage_counter (20260904000000_usage_counters.sql):
-- one round trip, `for update` row lock so two concurrent acks (two devices
-- posting at once, or a retried request) collapse to one winner
-- deterministically instead of racing. Deliberately NOT security definer:
-- the only caller holds the service role key, which already bypasses RLS,
-- so there is nothing to elevate and nothing to review.
create or replace function public.acknowledge_dashboard_batch(
  p_owner_id uuid,
  p_batch_id uuid
) returns text  -- 'acknowledged' | 'already_acknowledged' | 'not_found' | 'owner_mismatch'
language plpgsql
as $$
declare
  v_status text;
  v_owner  uuid;
  v_papers jsonb;
begin
  select status, owner_id, papers into v_status, v_owner, v_papers
    from public.dashboard_batches
    where id = p_batch_id
    for update;

  if not found then
    return 'not_found';
  end if;
  if v_owner <> p_owner_id then
    -- Never reveal whether p_batch_id exists for a different owner beyond
    -- this generic status string (ABC-JEV-INTEGRATION.md §1p.C.5, B guide
    -- DESIGN §4).
    return 'owner_mismatch';
  end if;
  if v_status = 'acknowledged' then
    return 'already_acknowledged';
  end if;

  -- Acknowledging a 'prepared' OR 'served' batch both succeed (§1p.C.5):
  -- this function only inspects the batch's own stored state, never
  -- "today", so a cross-day late ack still succeeds and still correctly
  -- records that day's papers as delivered.
  -- The inner `case` guards against a per-paper `aliases` field that is
  -- anything other than a genuine JSON array (a JSON null, a missing key
  -- read back as SQL NULL, or a malformed scalar): jsonb_array_elements_text
  -- raises "cannot extract elements from a scalar" on a JSON null, which SQL
  -- NULL and an empty JSON array do not trigger, so this is not a redundant
  -- guard -- jsonb_typeof(x) = 'array' is false (not merely NULL-propagated)
  -- for every one of those cases and routes them to the empty-array literal
  -- instead.
  insert into public.dashboard_deliveries
    (owner_id, canonical_key, key_version, aliases, batch_id)
  select
    p_owner_id,
    paper ->> 'key',
    1,
    coalesce(
      (
        select array_agg(alias)
        from jsonb_array_elements_text(
          case when jsonb_typeof(paper -> 'aliases') = 'array' then paper -> 'aliases' else '[]'::jsonb end
        ) as alias
      ),
      '{}'
    ),
    p_batch_id
  from jsonb_array_elements(coalesce(v_papers, '[]'::jsonb)) as paper
  on conflict (owner_id, canonical_key) do nothing;

  update public.dashboard_batches
    set status = 'acknowledged', acknowledged_at = now()
    where id = p_batch_id;

  return 'acknowledged';
end;
$$;

revoke all on function public.acknowledge_dashboard_batch(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.acknowledge_dashboard_batch(uuid, uuid)
  to service_role;
-- END web/supabase/migrations/20260924000000_dashboard_delivery_ledger.sql
-- BEGIN web/supabase/migrations/20260924000300_briefing_deliveries_dedupe.sql
-- P4-S7 (Round 3) -- F-A-P4-07 (scheduled-digest double-send race) and
-- F-A-P4-04 (digest ledger must stay independent of the dashboard ledger),
-- ABC-JEV-INTEGRATION.md §1p.C.10.
--
-- AUTHORED ONLY. NOT APPLIED by this campaign. Unlike
-- 20260924000000_dashboard_delivery_ledger.sql (brand-new tables), **this
-- migration ALTERs an EXISTING, already-APPLIED table**
-- (public.briefing_deliveries -- see web/supabase/schema.sql:243-252). It
-- needs review with that in mind before any future apply authorization: a
-- mistake here touches real production history, not an empty table.
--
-- DB/RLS PROOF: BLOCKED. No isolated Supabase/Postgres instance is available
-- to this agent (offline authoring only, no DB/network access permitted).
-- Everything below is statically self-reviewed only (column nullability,
-- partial-index predicate correctness, ON CONFLICT arbiter inference,
-- grant/revoke symmetry) -- never executed against a real Postgres instance.
-- The exact same limitation applies to every other migration authored in
-- this campaign (20260924000000_dashboard_delivery_ledger.sql's own header
-- says the same).
--
-- ── Why `local_date` is nullable, and why the unique index is PARTIAL ──
-- Every row written before this migration ships has no `local_date` (the
-- column did not exist yet). Postgres already treats NULL as distinct from
-- every other NULL under a plain unique index/constraint, so a full
-- (non-partial) unique index on (user_id, local_date) would technically
-- never be blocked by that old history either -- but a PARTIAL index
-- (`where local_date is not null`) is the more explicit, self-documenting
-- choice (it also never indexes the old rows at all, rather than relying on
-- a reader knowing NULL-distinctness semantics), and is what
-- ABC-JEV-INTEGRATION.md §1p.C.10 binds this migration to.
--
-- `channel` is deliberately NOT part of the unique key: dispatch-digests/
-- route.ts's loop processes exactly one `profiles` row per user per
-- invocation, and `digest_channel` is a single value on that one row --
-- there is structurally never more than one claim attempt per
-- (user_id, local_date) regardless of channel, so adding channel to the key
-- would be dead weight, not a real narrowing of what "duplicate" means.
alter table public.briefing_deliveries
  add column if not exists local_date text;

create unique index if not exists briefing_deliveries_user_local_date_idx
  on public.briefing_deliveries (user_id, local_date)
  where local_date is not null;

-- ── Why an RPC function, not a PostgREST/supabase-js `.upsert()` ──
-- The F-A-P4-07 guide entry (docs/jev-abc/P4-B-20260924T0338Z.md) describes
-- this fix in raw-SQL terms: "on conflict (user_id, local_date) do nothing
-- returning id". That is exactly what this function does. A tempting
-- alternative -- and the one the manager's own brief suggested as a starting
-- point -- is a bare supabase-js call from the route:
--   admin.from("briefing_deliveries")
--     .upsert(row, { onConflict: "user_id,local_date", ignoreDuplicates: true })
--     .select("id")
-- This was deliberately NOT used, for a VERIFIED (not guessed) reason:
-- Postgres only infers a PARTIAL unique index as an ON CONFLICT arbiter when
-- the ON CONFLICT clause itself repeats a matching WHERE predicate (e.g.
-- `ON CONFLICT (user_id, local_date) WHERE local_date IS NOT NULL DO
-- NOTHING`) -- without it, Postgres raises "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" for a partial index,
-- even though a human reading the schema would expect it to just work.
-- PostgREST's `on_conflict` query parameter -- what supabase-js's
-- `onConflict` option sends, verified directly in
-- web/node_modules/@supabase/postgrest-js/src/PostgrestQueryBuilder.ts
-- (`url.searchParams.set('on_conflict', onConflict)`) -- only carries a bare
-- comma-separated column list, with no way to attach that predicate. This
-- codebase has already hit and documented an analogous mistake once:
-- 20260904000000_usage_counters.sql's own header records that an earlier B
-- guide "recommended the upsert form believing it was reachable from
-- supabase-js. It is not," and moved to a plpgsql RPC function instead --
-- same fix shape, applied here. Because this exact risk cannot be settled
-- without a live Postgres+PostgREST instance (DB proof is BLOCKED, as
-- above), routing around it entirely via a hand-written ON CONFLICT clause
-- inside a function -- where the predicate CAN be written explicitly -- is
-- the safer offline-authored choice, not a stylistic preference.
--
-- Deliberately NOT `security definer`: the only caller
-- (web/src/app/api/jobs/dispatch-digests/route.ts) holds the service-role
-- key already, which already bypasses RLS -- there is nothing to elevate and
-- nothing to review. Mirrors increment_usage_counter's exact reasoning.
--
-- `returning briefing_deliveries.id` (table-qualified, not bare `id`) is
-- deliberate, not decorative: `returns table (id bigint)` makes plpgsql
-- declare an implicit OUT variable literally named `id` in this function's
-- own scope, so an UNQUALIFIED `returning id` would be ambiguous between
-- that variable and the table column (plpgsql's default
-- `variable_conflict = error` makes that a hard failure at call time, not a
-- silent bug). increment_usage_counter hits the same shape of collision and
-- resolves it the same way (its INSERT is aliased `as c` and returns
-- `c.value`, not bare `value`) -- same fix, applied here since this INSERT
-- has no alias to borrow.
create or replace function public.claim_briefing_delivery(
  p_user_id    uuid,
  p_local_date text,
  p_channel    text,
  p_item_ids   text[],
  p_payload    jsonb
) returns table (id bigint)
language plpgsql
as $$
begin
  if p_local_date is null then
    raise exception 'claim_briefing_delivery requires a non-null p_local_date';
  end if;

  return query
    insert into public.briefing_deliveries (user_id, local_date, channel, item_ids, payload)
    values (p_user_id, p_local_date, p_channel, p_item_ids, p_payload)
    on conflict (user_id, local_date) where local_date is not null do nothing
    returning briefing_deliveries.id;
end;
$$;

revoke all on function public.claim_briefing_delivery(uuid, text, text, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_briefing_delivery(uuid, text, text, text[], jsonb)
  to service_role;

-- ── F-A-P4-04: this migration touches ONLY briefing_deliveries ──
-- No column, index, or function above references dashboard_deliveries or
-- dashboard_batches (web/supabase/migrations/
-- 20260924000000_dashboard_delivery_ledger.sql). ABC-JEV-INTEGRATION.md
-- §1p.C.2 binds email and dashboard delivery state to stay fully independent
-- "for now" -- this migration does not merge or cross-reference them,
-- matching dispatch-digests/route.ts's own independence (see that file's
-- dashboard-ledger protective test in route.test.ts, which statically scans
-- the route's source for any such reference).
-- END web/supabase/migrations/20260924000300_briefing_deliveries_dedupe.sql
-- BEGIN web/supabase/migrations/20260924000500_dashboard_rollover.sql
-- P4-S6: never-delivered-only rollover candidate storage (acceptance 16
-- rollover subcases, acceptance 17 "final pool up to 30", F-A-P4-08
-- remainder, ABC-JEV-INTEGRATION.md §1g/§1p.C.4). This migration is
-- authored only; it is not applied by this campaign, following the same
-- convention as 20260924000000_dashboard_delivery_ledger.sql and every
-- other 2026-09-2x migration in this directory.
--
-- DB/RLS PROOF: BLOCKED. No isolated Supabase instance is available to this
-- agent. Everything below has been statically self-reviewed only (column
-- types, constraints, RLS policy shape, grant/revoke symmetry, function
-- control flow) -- never executed against a real Postgres instance.
--
-- DEDICATED TABLE, not a jsonb column on dashboard_batches (binding ruling
-- ABC-JEV-INTEGRATION.md §1p.C.4, overriding the earlier B guide draft's
-- DESIGN §6 "rollover_candidates jsonb column on dashboard_batches"
-- proposal in docs/jev-abc/P4-B-20260924T0338Z.md): a day with no visit has
-- NO dashboard_batches row at all -- that table's rows are created only
-- when a batch is actually minted (web/src/app/api/feed/route.ts's
-- runLedgerAwareFeed) -- yet up to 30 never-delivered candidates from the
-- LAST computed final pool must still survive to compete on a later day the
-- owner does visit, and there may be several no-visit days in between with
-- nowhere on dashboard_batches to hang that state.
--
-- Retention (30 days from first_seen_at) is enforced entirely at READ time
-- (see web/src/lib/dashboard/rollover-store.ts's `list`) -- there is no
-- purge/delete job in this migration or anywhere else in this campaign (not
-- authorized). A row older than 30 days simply stops being returned by
-- `list`; it is never physically deleted by this migration or its function.
create table if not exists public.dashboard_rollover_candidates (
  owner_id       uuid not null references auth.users(id) on delete cascade,
  canonical_key  text not null,
  aliases        text[] not null default '{}',
  -- Opaque to this migration and to rollover-store.ts (same "never assume a
  -- feed-specific shape" discipline dashboard_batches.served_items already
  -- documents in 20260924000000_dashboard_delivery_ledger.sql): the minimal
  -- item payload the pipeline needs to re-score this candidate on a later
  -- day (the same cached-item shape the day's pool already carries,
  -- including admissionChannels/identity-relevant metadata). No personal
  -- intent/AI-reason text is required here -- this row is already
  -- owner-scoped by owner_id/RLS, so anything it carries is already
  -- private to this owner, same as every other row on this table.
  payload        jsonb not null,
  first_seen_at  timestamptz not null default now(),
  -- YYYY-MM-DD, the local date of the mint that most recently saw this
  -- candidate in its final pool. Opaque string, same convention as
  -- dashboard_batches.local_date -- this migration never parses it.
  last_pool_date text not null,
  -- P4-S6-FIX (F-A-P4S6-01, ABC-JEV-INTEGRATION.md §1g "...may compete
  -- tomorrow, subject to current eligibility" / round-3 ruling in §4):
  -- the canonical intent snapshot (web/src/lib/feed/intent.ts's
  -- serializeFeedIntent) in effect on the day this row's payload was last
  -- (re-)written. Nullable: absent on every row written before this
  -- column existed, and on a row upserted from a request that carried no
  -- structured intent at all (route.ts's GET path) -- both cases are
  -- treated identically by the reader (route.ts's
  -- reconcileRolloverCandidateIntent): a null/mismatched intent_version
  -- means the candidate's admissionChannels tag is stripped before it can
  -- compete again, so it must re-qualify through today's literal keyword
  -- gate. Opaque to this migration, same "never assume a feed-specific
  -- shape" discipline as `payload` above.
  intent_version text,
  constraint dashboard_rollover_candidates_payload_is_object
    check (jsonb_typeof(payload) = 'object'),
  primary key (owner_id, canonical_key)
);

alter table public.dashboard_rollover_candidates enable row level security;

-- Owner-only SELECT, no INSERT/UPDATE policy: writes are server-side/
-- service-role only, through upsert_rollover_candidates below -- mirrors
-- dashboard_batches/dashboard_deliveries' own convention exactly (see
-- 20260924000000_dashboard_delivery_ledger.sql). Defense in depth only
-- (the F-A-P4S1-03 precedent, ABC-JEV-INTEGRATION.md §4 "P4-S1 fresh A"):
-- no client code reads this table today -- web/src/lib/dashboard/rollover-store.ts
-- always reads through the service-role admin client, never the owner's
-- own session client.
create policy "owners read their dashboard rollover candidates"
  on public.dashboard_rollover_candidates for select using (auth.uid() = owner_id);

revoke all on table public.dashboard_rollover_candidates from anon, authenticated;
grant select on table public.dashboard_rollover_candidates to authenticated;

-- ── Atomic upsert, one round trip for a whole day's remainder ────────────
-- Same jsonb_array_elements idiom as acknowledge_dashboard_batch
-- (20260924000000_dashboard_delivery_ledger.sql): p_candidates is a jsonb
-- array of {key, aliases, payload} objects, so one call handles up to
-- FINAL_POOL_SIZE (30, web/src/lib/feed/pipeline.ts) rows.
--
-- first_seen_at is DELIBERATELY ABSENT from the "do update set" clause: on
-- a fresh insert it takes its column default (now()); on a conflict (a
-- candidate already stored from an earlier day) it is left untouched, so a
-- candidate's first_seen_at always reflects the FIRST day it was ever
-- stored, no matter how many later days re-upsert it -- this is the exact
-- "keeps first_seen, updates last_pool_date and payload" contract the
-- rollover design requires (web/src/lib/dashboard/rollover-store.ts's
-- RolloverCandidateStore.upsert doc comment). A generic client-side
-- .upsert() call was considered and rejected: this codebase consistently
-- uses a dedicated plpgsql function whenever a write needs precise,
-- partial-column-preserving semantics rather than relying on a library's
-- implicit merge behaviour (see increment_usage_counter,
-- acknowledge_dashboard_batch).
--
-- Not security definer: the only caller holds the service role key, which
-- already bypasses RLS, so there is nothing to elevate and nothing to
-- review.
create or replace function public.upsert_rollover_candidates(
  p_owner_id uuid,
  p_local_date text,
  p_candidates jsonb
) returns void
language plpgsql
as $$
begin
  insert into public.dashboard_rollover_candidates
    (owner_id, canonical_key, aliases, payload, first_seen_at, last_pool_date, intent_version)
  select
    p_owner_id,
    candidate ->> 'key',
    coalesce(
      (
        select array_agg(alias)
        from jsonb_array_elements_text(
          case when jsonb_typeof(candidate -> 'aliases') = 'array' then candidate -> 'aliases' else '[]'::jsonb end
        ) as alias
      ),
      '{}'
    ),
    coalesce(candidate -> 'payload', '{}'::jsonb),
    now(),
    p_local_date,
    -- P4-S6-FIX (F-A-P4S6-01): camelCase JSON key, matching how the JS
    -- caller (rollover-store.ts's upsert) already sends `key`/`aliases`/
    -- `payload` -- nullable column, so a missing key simply inserts NULL,
    -- no coalesce needed (unlike payload/aliases, which are NOT NULL).
    candidate ->> 'intentVersion'
  from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) as candidate
  where candidate ->> 'key' is not null
  on conflict (owner_id, canonical_key) do update
    -- first_seen_at stays deliberately absent here (see the comment above
    -- this function). intent_version IS refreshed on every conflict, same
    -- as payload/aliases/last_pool_date -- it must always reflect the most
    -- recent day this candidate was actually re-selected (P4-S6-FIX).
    set aliases        = excluded.aliases,
        payload         = excluded.payload,
        last_pool_date  = excluded.last_pool_date,
        intent_version  = excluded.intent_version;
end;
$$;

revoke all on function public.upsert_rollover_candidates(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_rollover_candidates(uuid, text, jsonb)
  to service_role;
-- END web/supabase/migrations/20260924000500_dashboard_rollover.sql
-- BEGIN web/supabase/migrations/20261102000000_seed_pool.sql
-- Owner-scoped seed snapshots. Reviewable migration; never applied by this change.
-- All mutations and delivery fences take the same per-owner transaction lock.
create table if not exists public.seed_pool_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  revocation_generation bigint not null default 0,
  pending_version uuid,
  pending_effective date
);
create table if not exists public.seed_pool_observed_days (
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  primary key(owner_id, local_date)
);
alter table public.seed_pool_observed_days enable row level security;
revoke all on public.seed_pool_observed_days from public, anon, authenticated;
grant select,insert,update,delete on public.seed_pool_observed_days to service_role;
create table if not exists public.seed_pool_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  upload_id text not null,
  canonical_key text not null,
  content_hash text not null,
  title text not null,
  features jsonb not null,
  public_ids jsonb not null default '{}'::jsonb,
  object_name text not null,
  status text not null check (status in ('staging','ready','revoked')),
  created_at timestamptz not null default now(),
  cleanup_after timestamptz,
  cleanup_complete boolean not null default false,
  writer_settled boolean not null default false,
  unique(owner_id, id)
);
create table if not exists public.seed_pool_snapshots (
  version uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  created_revision bigint not null,
  seeds jsonb not null check (jsonb_typeof(seeds) = 'array'),
  superseded boolean not null default false
);
create index if not exists seed_pool_snapshot_lookup on public.seed_pool_snapshots(owner_id, effective_date desc, created_revision desc);
alter table public.seed_pool_state enable row level security;
alter table public.seed_pool_assets enable row level security;
alter table public.seed_pool_snapshots enable row level security;
revoke all on public.seed_pool_state, public.seed_pool_assets, public.seed_pool_snapshots from public, anon, authenticated;
-- Owners may read only their own records; writes and feature creation remain service-only.
drop policy if exists seed_pool_owner_read on public.seed_pool_state;
create policy seed_pool_owner_read on public.seed_pool_state for select to authenticated using (auth.uid()=owner_id);
drop policy if exists seed_pool_owner_read on public.seed_pool_assets;
create policy seed_pool_owner_read on public.seed_pool_assets for select to authenticated using (auth.uid()=owner_id);
drop policy if exists seed_pool_owner_read on public.seed_pool_snapshots;
create policy seed_pool_owner_read on public.seed_pool_snapshots for select to authenticated using (auth.uid()=owner_id);
grant select on public.seed_pool_state, public.seed_pool_assets, public.seed_pool_snapshots to authenticated;
grant select, insert, update, delete on public.seed_pool_state, public.seed_pool_assets, public.seed_pool_snapshots to service_role;
alter table public.dashboard_batches add column if not exists seed_pool_version text;
alter table public.dashboard_batches add column if not exists seed_revocation_generation bigint not null default 0;

create or replace function public.seed_pool_resolve(p_owner_id uuid, p_target_date date default null, p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_zone text; v_today date; v_target date; v_state public.seed_pool_state%rowtype; v_snap public.seed_pool_snapshots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 725113));
  select coalesce(nullif(digest_timezone, ''), 'UTC') into v_zone from public.profiles where user_id = p_owner_id;
  if not found then return jsonb_build_object('status','unavailable','ownerLocalDate',null,'timezone',null,'snapshot',null,'revision',null,'revocationGeneration',0); end if;
  v_today := (coalesce(p_now, now()) at time zone v_zone)::date;
  v_target := coalesce(p_target_date, v_today);
  select * into v_state from public.seed_pool_state where owner_id = p_owner_id;
  if not found then return jsonb_build_object('status','none','ownerLocalDate',v_today::text,'timezone',v_zone,'snapshot',null,'revision',0,'revocationGeneration',0); end if;
  select * into v_snap from public.seed_pool_snapshots where owner_id=p_owner_id and not superseded and effective_date <= v_target order by effective_date desc, created_revision desc limit 1;
  if not found then return jsonb_build_object('status','none','ownerLocalDate',v_today::text,'timezone',v_zone,'snapshot',null,'revision',v_state.revision,'revocationGeneration',v_state.revocation_generation); end if;
  return jsonb_build_object('status', case when jsonb_array_length(v_snap.seeds)>0 then 'ready' else 'none' end,
    'ownerLocalDate',v_today::text,'timezone',v_zone,'revision',v_state.revision,'revocationGeneration',v_state.revocation_generation,
    'snapshot', jsonb_build_object('version',v_snap.version::text,'effectiveLocalDate',v_snap.effective_date::text,'seeds',v_snap.seeds,'revocationGeneration',v_state.revocation_generation));
exception when invalid_parameter_value then
  return jsonb_build_object('status','unavailable','ownerLocalDate',null,'timezone',null,'snapshot',null,'revision',null,'revocationGeneration',0);
end $$;

create or replace function public.seed_pool_apply(p_owner_id uuid, p_expected_revision bigint, p_seed_ids uuid[], p_undo boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_zone text; v_today date; v_state public.seed_pool_state%rowtype; v_target date; v_version uuid; v_seeds jsonb; v_count integer; v_distinct integer; v_hashes integer; v_active boolean; v_served boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 725113));
  select coalesce(nullif(digest_timezone,''),'UTC') into v_zone from public.profiles where user_id=p_owner_id;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  v_today := (now() at time zone v_zone)::date;
  insert into public.seed_pool_state(owner_id) values(p_owner_id) on conflict do nothing;
  select * into v_state from public.seed_pool_state where owner_id=p_owner_id for update;
  if v_state.revision is distinct from p_expected_revision then return jsonb_build_object('status','stale_revision','revision',v_state.revision); end if;
  if p_undo then
    if v_state.pending_version is null or v_state.pending_effective <= v_today then return jsonb_build_object('status','no_pending'); end if;
    update public.seed_pool_snapshots set superseded=true where owner_id=p_owner_id and version=v_state.pending_version;
    update public.seed_pool_state set pending_version=null,pending_effective=null,revision=revision+1 where owner_id=p_owner_id;
    return jsonb_build_object('status','ok','revision',v_state.revision+1);
  end if;
  if coalesce(array_length(p_seed_ids,1),0)>5 then return jsonb_build_object('status','too_many'); end if;
  if coalesce(array_length(p_seed_ids,1),0) <> (select count(distinct x) from unnest(coalesce(p_seed_ids,'{}'::uuid[])) as x) then return jsonb_build_object('status','duplicate'); end if;
  select count(*), count(distinct canonical_key), count(distinct content_hash), coalesce(jsonb_agg(jsonb_build_object('id',id::text,'uploadId',upload_id,'canonicalKey',canonical_key,'contentHash',content_hash,'title',title,'features',features,'publicIds',public_ids) order by array_position(p_seed_ids,id)),'[]'::jsonb)
    into v_count, v_distinct, v_hashes, v_seeds from public.seed_pool_assets where owner_id=p_owner_id and status='ready' and id=any(coalesce(p_seed_ids,'{}'::uuid[]));
  if v_count <> coalesce(array_length(p_seed_ids,1),0) then return jsonb_build_object('status','invalid_seed'); end if;
  if v_count <> v_distinct or v_count <> v_hashes then return jsonb_build_object('status','duplicate'); end if;
  select exists(select 1 from public.seed_pool_snapshots where owner_id=p_owner_id and not superseded and effective_date<=v_today) into v_active;
  select exists(select 1 from public.dashboard_batches where owner_id=p_owner_id and status in ('served','acknowledged') and
      (local_date=v_today::text or (seed_pool_version is null and (coalesce(served_at,acknowledged_at) at time zone v_zone)::date=v_today)))
    or exists(select 1 from public.briefing_deliveries where user_id=p_owner_id and
      (local_date=v_today::text or (local_date is null and (delivered_at at time zone v_zone)::date=v_today)))
    or exists(select 1 from public.seed_pool_observed_days where owner_id=p_owner_id and local_date=v_today) into v_served;
  v_target := case when not v_active and not v_served and v_count>0 then v_today else v_today+1 end;
  if v_state.pending_version is not null and v_state.pending_effective>v_today then
    update public.seed_pool_snapshots set superseded=true where owner_id=p_owner_id and version=v_state.pending_version;
  end if;
  v_version := gen_random_uuid();
  insert into public.seed_pool_snapshots(version,owner_id,effective_date,created_revision,seeds) values(v_version,p_owner_id,v_target,v_state.revision+1,v_seeds);
  update public.seed_pool_state set revision=revision+1, pending_version=case when v_target>v_today then v_version else null end, pending_effective=case when v_target>v_today then v_target else null end where owner_id=p_owner_id;
  return jsonb_build_object('status','ok','revision',v_state.revision+1,'version',v_version::text,'effectiveLocalDate',v_target::text);
exception when invalid_parameter_value then return jsonb_build_object('status','unavailable');
end $$;

create or replace function public.seed_pool_forget(p_owner_id uuid,p_expected_revision bigint,p_seed_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_state public.seed_pool_state%rowtype; v_key text; v_hash text; v_status text; v_ids uuid[]; v_versions text[]; v_objects jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 725113));
  insert into public.seed_pool_state(owner_id) values(p_owner_id) on conflict do nothing;
  select * into v_state from public.seed_pool_state where owner_id=p_owner_id for update;
  if v_state.revision is distinct from p_expected_revision then return jsonb_build_object('status','stale_revision'); end if;
  select canonical_key,content_hash,status into v_key,v_hash,v_status from public.seed_pool_assets where owner_id=p_owner_id and id=p_seed_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  -- A retried cleanup references the canonical tombstone already stored with
  -- each revoked asset; no feature data is revived or new generation minted.
  if v_status='revoked' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'objectName',object_name,'cleanupAfter',cleanup_after,'writerSettled',writer_settled)),'[]'::jsonb) into v_objects
      from public.seed_pool_assets where owner_id=p_owner_id and status='revoked' and canonical_key=v_key;
    return jsonb_build_object('status','revoked','objects',v_objects,'revision',v_state.revision,'revocationGeneration',v_state.revocation_generation);
  end if;
  with recursive related(id,canonical_key,content_hash) as (
    select id,canonical_key,content_hash from public.seed_pool_assets where owner_id=p_owner_id and id=p_seed_id
    union
    select a.id,a.canonical_key,a.content_hash from public.seed_pool_assets a join related r on a.canonical_key=r.canonical_key or a.content_hash=r.content_hash where a.owner_id=p_owner_id and a.status<>'revoked'
  ) select array_agg(a.id),coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'objectName',a.object_name,'writerSettled',a.writer_settled,'cleanupAfter',case when a.status='staging' then greatest(now()+interval '2 minutes', a.created_at+interval '3 minutes') else now() end)),'[]'::jsonb) into v_ids,v_objects
    from public.seed_pool_assets a where a.owner_id=p_owner_id and a.id in (select id from related);
  select coalesce(array_agg(s.version::text),'{}'::text[]) into v_versions
    from public.seed_pool_snapshots s where s.owner_id=p_owner_id and exists
      (select 1 from jsonb_array_elements(s.seeds) e where (e->>'id')::uuid=any(v_ids));
  update public.seed_pool_assets set cleanup_after=case when status='staging' then greatest(now()+interval '2 minutes',created_at+interval '3 minutes') else now() end,status='revoked',features='{}'::jsonb,public_ids='{}'::jsonb,title='',canonical_key='revoked:'||p_seed_id::text,content_hash='',upload_id=''
    where owner_id=p_owner_id and id=any(v_ids);
  update public.seed_pool_snapshots s set seeds=coalesce((select jsonb_agg(e) from jsonb_array_elements(s.seeds) e where not ((e->>'id')::uuid=any(v_ids))),'[]'::jsonb) where s.owner_id=p_owner_id;
  update public.seed_pool_state set revision=revision+1,revocation_generation=revocation_generation+1 where owner_id=p_owner_id;
  -- Pool membership and order are derived too. Invalidate affected batches
  -- (the FK cascades delivery identities), and keep only the digest's minimal
  -- delivery/idempotency row; already-sent messages cannot be recalled.
  delete from public.private_paper_pools where owner_id=p_owner_id;
  delete from public.dashboard_rollover_candidates where owner_id=p_owner_id;
  delete from public.dashboard_batches where owner_id=p_owner_id and seed_pool_version=any(v_versions);
  update public.briefing_deliveries set payload='{}'::jsonb,item_ids='{}'::text[]
    where user_id=p_owner_id and seed_pool_version=any(v_versions);
  return jsonb_build_object('status','revoked','objects',v_objects,'revision',v_state.revision+1,'revocationGeneration',v_state.revocation_generation+1);
end $$;

revoke all on function public.seed_pool_resolve(uuid,date,timestamptz) from public,anon,authenticated;
revoke all on function public.seed_pool_apply(uuid,bigint,uuid[],boolean) from public,anon,authenticated;
revoke all on function public.seed_pool_forget(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.seed_pool_resolve(uuid,date,timestamptz), public.seed_pool_apply(uuid,bigint,uuid[],boolean), public.seed_pool_forget(uuid,bigint,uuid) to service_role;

-- Output fencing: mutation, preparation, serving, and acknowledgment use the
-- identical owner lock, so a first seed cannot race publication of a batch.
create or replace function public.seed_pool_fence_matches(p_owner_id uuid,p_local_date date,p_expected_version text,p_expected_revocation_generation bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_res jsonb;
begin
  v_res := public.seed_pool_resolve(p_owner_id,p_local_date,null);
  return coalesce(v_res->>'status' in ('ready','none')
    and coalesce(v_res->'snapshot'->>'version','none')=p_expected_version
    and (v_res->>'revocationGeneration')::bigint=p_expected_revocation_generation, false);
end $$;

create or replace function public.seed_pool_mark_batch_served(p_owner_id uuid,p_local_date date,p_batch_id uuid,p_expected_version text,p_expected_revocation_generation bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.dashboard_batches%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  select * into v_row from public.dashboard_batches where id=p_batch_id and owner_id=p_owner_id and local_date=p_local_date::text for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(v_row.seed_pool_version,'none')<>p_expected_version or v_row.seed_revocation_generation<>p_expected_revocation_generation then return jsonb_build_object('status','stale_pool'); end if;
  if v_row.status in ('served','acknowledged') then return jsonb_build_object('status','already_served'); end if;
  update public.dashboard_batches set status='served',served_at=now() where id=p_batch_id;
  return jsonb_build_object('status','served');
end $$;

create or replace function public.seed_pool_put_prepared_batch(p_owner_id uuid,p_local_date date,p_expected_version text,p_expected_revocation_generation bigint,p_intent_version text,p_papers jsonb,p_served_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.dashboard_batches%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  if jsonb_typeof(p_papers)<>'array' or jsonb_typeof(p_served_items)<>'array' then return jsonb_build_object('status','invalid'); end if;
  insert into public.dashboard_batches(owner_id,local_date,status,intent_version,papers,served_items,seed_pool_version,seed_revocation_generation)
  values(p_owner_id,p_local_date::text,'prepared',p_intent_version,p_papers,p_served_items,p_expected_version,p_expected_revocation_generation)
  on conflict(owner_id,local_date) do update set intent_version=excluded.intent_version,papers=excluded.papers,served_items=excluded.served_items,
    seed_pool_version=excluded.seed_pool_version,seed_revocation_generation=excluded.seed_revocation_generation
    where public.dashboard_batches.status='prepared'
  returning * into v_row;
  if not found then return jsonb_build_object('status','already_served'); end if;
  return jsonb_build_object('status','prepared','batchId',v_row.id::text);
end $$;

create or replace function public.seed_pool_ack_batch(p_owner_id uuid,p_local_date date,p_batch_id uuid,p_expected_version text,p_expected_revocation_generation bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.dashboard_batches%rowtype; v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  select * into v_row from public.dashboard_batches where id=p_batch_id and owner_id=p_owner_id and local_date=p_local_date::text for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(v_row.seed_pool_version,'none')<>p_expected_version or v_row.seed_revocation_generation<>p_expected_revocation_generation then return jsonb_build_object('status','stale_pool'); end if;
  if v_row.status='prepared' then return jsonb_build_object('status','not_served'); end if;
  v_status := public.acknowledge_dashboard_batch(p_owner_id,p_batch_id);
  return jsonb_build_object('status',v_status);
end $$;

revoke all on function public.seed_pool_fence_matches(uuid,date,text,bigint),public.seed_pool_mark_batch_served(uuid,date,uuid,text,bigint),public.seed_pool_put_prepared_batch(uuid,date,text,bigint,text,jsonb,jsonb),public.seed_pool_ack_batch(uuid,date,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.seed_pool_mark_batch_served(uuid,date,uuid,text,bigint),public.seed_pool_put_prepared_batch(uuid,date,text,bigint,text,jsonb,jsonb),public.seed_pool_ack_batch(uuid,date,uuid,text,bigint) to service_role;

create or replace function public.seed_pool_editor(p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_current jsonb; v_state public.seed_pool_state%rowtype; v_pending public.seed_pool_snapshots%rowtype; v_today date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  v_current := public.seed_pool_resolve(p_owner_id,null,null);
  if v_current->>'status'='unavailable' then return v_current; end if;
  v_today := (v_current->>'ownerLocalDate')::date;
  select * into v_state from public.seed_pool_state where owner_id=p_owner_id;
  if found and v_state.pending_version is not null and v_state.pending_effective>v_today then
    select * into v_pending from public.seed_pool_snapshots where owner_id=p_owner_id and version=v_state.pending_version and not superseded;
    if found then
      v_current := v_current || jsonb_build_object('pending',jsonb_build_object('version',v_pending.version::text,'effectiveLocalDate',v_pending.effective_date::text,'seeds',v_pending.seeds,'revocationGeneration',v_state.revocation_generation));
    end if;
  end if;
  -- Ready drafts are private and expire if never attached to a pool.
  v_current := v_current || jsonb_build_object('availableAssets',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id::text,'uploadId',a.upload_id,'canonicalKey',a.canonical_key,'contentHash',a.content_hash,'title',a.title,'features',a.features,'publicIds',a.public_ids) order by a.created_at)
    from public.seed_pool_assets a where a.owner_id=p_owner_id and a.status='ready'
  ),'[]'::jsonb));
  -- Only opaque IDs are returned for retry; revoked text and features remain erased.
  v_current := v_current || jsonb_build_object('cleanupPending',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id::text) order by a.created_at)
    from public.seed_pool_assets a where a.owner_id=p_owner_id and a.status='revoked' and not a.cleanup_complete
  ),'[]'::jsonb));
  return v_current;
end $$;
revoke all on function public.seed_pool_editor(uuid) from public,anon,authenticated;
grant execute on function public.seed_pool_editor(uuid) to service_role;

-- The old acknowledgment function is not directly callable by browser roles.
-- Service callers must use seed_pool_ack_batch when the migration is installed.
revoke execute on function public.acknowledge_dashboard_batch(uuid,uuid) from public,anon,authenticated;

create or replace function public.seed_pool_stage_asset(p_owner_id uuid,p_expected_revocation_generation bigint,p_id uuid,p_upload_id text,p_canonical_key text,p_content_hash text,p_title text,p_features jsonb,p_public_ids jsonb,p_object_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_generation bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  insert into public.seed_pool_state(owner_id) values(p_owner_id) on conflict do nothing;
  select revocation_generation into v_generation from public.seed_pool_state where owner_id=p_owner_id;
  if v_generation is distinct from p_expected_revocation_generation then return jsonb_build_object('status','stale_pool'); end if;
  insert into public.seed_pool_assets(id,owner_id,upload_id,canonical_key,content_hash,title,features,public_ids,object_name,status)
    values(p_id,p_owner_id,p_upload_id,p_canonical_key,p_content_hash,p_title,p_features,p_public_ids,p_object_name,'staging');
  return jsonb_build_object('status','staging');
end $$;
revoke all on function public.seed_pool_stage_asset(uuid,bigint,uuid,text,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.seed_pool_stage_asset(uuid,bigint,uuid,text,text,text,text,jsonb,jsonb,text) to service_role;

-- Preserve historical deliveries written before local_date existed. The
-- owner lock is shared with seed mutations and fenced digest publication.
-- Missing profiles, invalid timezones and invalid dates fail closed.
create or replace function public.claim_briefing_delivery(
  p_user_id uuid, p_local_date text, p_channel text, p_item_ids text[], p_payload jsonb
) returns table (id bigint) language plpgsql as $$
declare v_zone text; v_day date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,725113));
  select coalesce(nullif(digest_timezone,''),'UTC') into v_zone from public.profiles where user_id=p_user_id;
  if not found then raise exception 'claim_briefing_delivery owner profile unavailable'; end if;
  v_day := p_local_date::date;
  if v_day is null then raise exception 'claim_briefing_delivery requires a non-null p_local_date'; end if;
  perform now() at time zone v_zone;
  if exists(select 1 from public.briefing_deliveries where user_id=p_user_id and local_date is null and (delivered_at at time zone v_zone)::date=v_day) then
    return;
  end if;
  return query
    insert into public.briefing_deliveries (user_id, local_date, channel, item_ids, payload)
    values (p_user_id, p_local_date, p_channel, p_item_ids, p_payload)
    on conflict (user_id, local_date) where local_date is not null do nothing
    returning briefing_deliveries.id;
end $$;
revoke all on function public.claim_briefing_delivery(uuid,text,text,text[],jsonb) from public,anon,authenticated;
grant execute on function public.claim_briefing_delivery(uuid,text,text,text[],jsonb) to service_role;

alter table public.briefing_deliveries add column if not exists seed_pool_version text;
alter table public.briefing_deliveries add column if not exists seed_revocation_generation bigint not null default 0;
create or replace function public.seed_pool_claim_digest(p_owner_id uuid,p_local_date date,p_expected_version text,p_expected_revocation_generation bigint,p_channel text,p_item_ids text[],p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  select id into v_id from public.claim_briefing_delivery(p_owner_id,p_local_date::text,p_channel,p_item_ids,p_payload);
  if v_id is null then return jsonb_build_object('status','conflict'); end if;
  update public.briefing_deliveries set seed_pool_version=p_expected_version,seed_revocation_generation=p_expected_revocation_generation where id=v_id and user_id=p_owner_id;
  return jsonb_build_object('status','claimed','deliveryId',v_id);
end $$;
create or replace function public.seed_pool_validate_digest_send(p_owner_id uuid,p_local_date date,p_delivery_id bigint,p_expected_version text,p_expected_revocation_generation bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.briefing_deliveries%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  select * into v_row from public.briefing_deliveries where id=p_delivery_id and user_id=p_owner_id and local_date=p_local_date::text for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(v_row.seed_pool_version,'none')<>p_expected_version or v_row.seed_revocation_generation<>p_expected_revocation_generation then return jsonb_build_object('status','stale_pool'); end if;
  return jsonb_build_object('status','allowed');
end $$;
revoke all on function public.seed_pool_claim_digest(uuid,date,text,bigint,text,text[],jsonb),public.seed_pool_validate_digest_send(uuid,date,bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.seed_pool_claim_digest(uuid,date,text,bigint,text,text[],jsonb),public.seed_pool_validate_digest_send(uuid,date,bigint,text,bigint) to service_role;

-- Claim only abandoned staging/ready uploads and due tombstones. The owner
-- lock makes the reference check atomic with a concurrent pool edit.
create or replace function public.seed_pool_claim_cleanup(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_candidate record; v_asset public.seed_pool_assets%rowtype; v_zone text; v_today date; v_in_use boolean; v_result jsonb := '[]'::jsonb;
begin
  for v_candidate in select a.id,a.owner_id from public.seed_pool_assets a where
    (a.status='revoked' and a.writer_settled and not a.cleanup_complete and coalesce(a.cleanup_after,now())<=now()) or
    (a.status='ready' and a.created_at<now()-interval '24 hours' and not exists (select 1 from public.seed_pool_snapshots s where s.owner_id=a.owner_id and not s.superseded and exists(select 1 from jsonb_array_elements(s.seeds) e where e->>'id'=a.id::text)))
    order by a.created_at limit greatest(1,least(coalesce(p_limit,25),100))
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(v_candidate.owner_id::text,725113)) then continue; end if;
    select * into v_asset from public.seed_pool_assets where owner_id=v_candidate.owner_id and id=v_candidate.id for update;
    if not found then continue; end if;
    if v_asset.status='revoked' then
      if v_asset.cleanup_complete or not v_asset.writer_settled then continue; end if;
      if coalesce(v_asset.cleanup_after,now())>now() then continue; end if;
    else
      if v_asset.status='staging' and v_asset.created_at>=now()-interval '10 minutes' then continue; end if;
      if v_asset.status='ready' and v_asset.created_at>=now()-interval '24 hours' then continue; end if;
      select coalesce(nullif(digest_timezone,''),'UTC') into v_zone from public.profiles where user_id=v_asset.owner_id;
      if not found then continue; end if;
      begin v_today := (now() at time zone v_zone)::date; exception when invalid_parameter_value then continue; end;
      select exists(
        select 1 from public.seed_pool_snapshots s where s.owner_id=v_asset.owner_id and not s.superseded and
          (s.effective_date>=v_today or s.version=(select s2.version from public.seed_pool_snapshots s2 where s2.owner_id=v_asset.owner_id and not s2.superseded and s2.effective_date<=v_today order by s2.effective_date desc,s2.created_revision desc limit 1))
          and exists(select 1 from jsonb_array_elements(s.seeds) e where e->>'id'=v_asset.id::text)
      ) into v_in_use;
      if v_in_use then continue; end if;
      update public.seed_pool_assets set status='revoked',features='{}'::jsonb,public_ids='{}'::jsonb,title='',canonical_key='orphan:'||id::text,content_hash='',upload_id='',cleanup_after=now() where id=v_asset.id and owner_id=v_asset.owner_id;
      update public.seed_pool_snapshots s set seeds=coalesce((select jsonb_agg(e) from jsonb_array_elements(s.seeds) e where e->>'id'<>v_asset.id::text),'[]'::jsonb) where s.owner_id=v_asset.owner_id;
    end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_asset.id::text,'ownerId',v_asset.owner_id::text,'objectName',v_asset.object_name));
  end loop;
  return v_result;
end $$;
revoke all on function public.seed_pool_claim_cleanup(integer) from public,anon,authenticated;
grant execute on function public.seed_pool_claim_cleanup(integer) to service_role;

create or replace function public.seed_pool_record_feed_served(p_owner_id uuid,p_local_date date,p_expected_version text,p_expected_revocation_generation bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  insert into public.seed_pool_observed_days(owner_id,local_date) values(p_owner_id,p_local_date) on conflict do nothing;
  return jsonb_build_object('status','recorded');
end $$;
revoke all on function public.seed_pool_record_feed_served(uuid,date,text,bigint) from public,anon,authenticated;
grant execute on function public.seed_pool_record_feed_served(uuid,date,text,bigint) to service_role;

-- Do not restore a stale captured payload after forget: mutate only its email
-- member under the same owner/version/revocation lock used by pool changes.
create or replace function public.seed_pool_persist_digest_email(p_owner_id uuid,p_local_date date,p_delivery_id bigint,p_expected_version text,p_expected_revocation_generation bigint,p_email jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.briefing_deliveries%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  select * into v_row from public.briefing_deliveries where id=p_delivery_id and user_id=p_owner_id and local_date=p_local_date::text for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(v_row.seed_pool_version,'none')<>p_expected_version or v_row.seed_revocation_generation<>p_expected_revocation_generation then return jsonb_build_object('status','stale_pool'); end if;
  if jsonb_typeof(p_email) <> 'object' then return jsonb_build_object('status','invalid'); end if;
  update public.briefing_deliveries set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{email}',p_email,true) where id=p_delivery_id and user_id=p_owner_id;
  return jsonb_build_object('status','persisted');
end $$;
revoke all on function public.seed_pool_persist_digest_email(uuid,date,bigint,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.seed_pool_persist_digest_email(uuid,date,bigint,text,bigint,jsonb) to service_role;

-- A stale in-flight build must not recreate private derived cache after forget.
create or replace function public.seed_pool_put_private_pool(p_owner_id uuid,p_local_date date,p_expected_version text,p_expected_revocation_generation bigint,p_scope_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  if public.seed_pool_fence_matches(p_owner_id,p_local_date,p_expected_version,p_expected_revocation_generation) is not true then return jsonb_build_object('status','stale_pool'); end if;
  if p_scope_key is null or length(p_scope_key)=0 or length(p_scope_key)>1024 or p_payload is null then return jsonb_build_object('status','invalid'); end if;
  insert into public.private_paper_pools(owner_id,scope_key,payload,created_at) values(p_owner_id,p_scope_key,p_payload,now())
  on conflict(owner_id,scope_key) do update set payload=excluded.payload,created_at=excluded.created_at;
  return jsonb_build_object('status','stored');
end $$;
revoke all on function public.seed_pool_put_private_pool(uuid,date,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.seed_pool_put_private_pool(uuid,date,text,bigint,text,jsonb) to service_role;

-- Called only after storage confirms its write completed. A revoked writer may
-- not publish; it only releases its tombstone for retryable cleanup.
create or replace function public.seed_pool_finish_asset(p_owner_id uuid,p_seed_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,725113));
  select status into v_status from public.seed_pool_assets where owner_id=p_owner_id and id=p_seed_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_status='staging' then
    update public.seed_pool_assets set status='ready',writer_settled=true where owner_id=p_owner_id and id=p_seed_id;
    return jsonb_build_object('status','ready');
  end if;
  if v_status='revoked' then
    update public.seed_pool_assets set writer_settled=true where owner_id=p_owner_id and id=p_seed_id;
    return jsonb_build_object('status','revoked');
  end if;
  return jsonb_build_object('status',v_status);
end $$;
revoke all on function public.seed_pool_finish_asset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.seed_pool_finish_asset(uuid,uuid) to service_role;
-- END web/supabase/migrations/20261102000000_seed_pool.sql
COMMIT;
