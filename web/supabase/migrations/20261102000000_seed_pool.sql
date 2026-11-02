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
  select exists(select 1 from public.dashboard_batches where owner_id=p_owner_id and local_date=v_today::text and status in ('served','acknowledged'))
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
