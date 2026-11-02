-- Owner-scoped seed snapshots. Reviewable migration; never applied by this change.
-- All mutations and delivery fences take the same per-owner transaction lock.
create table if not exists public.seed_pool_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  revocation_generation bigint not null default 0,
  pending_version uuid,
  pending_effective date
);
create table if not exists public.seed_pool_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  upload_id text not null,
  canonical_key text not null,
  title text not null,
  features jsonb not null,
  public_ids jsonb not null default '{}'::jsonb,
  object_name text not null,
  status text not null check (status in ('staging','ready','revoked')),
  created_at timestamptz not null default now(),
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
-- Clients use authenticated server routes; no client can inject feature JSON.
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
end $$;

create or replace function public.seed_pool_apply(p_owner_id uuid, p_expected_revision bigint, p_seed_ids uuid[], p_undo boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_zone text; v_today date; v_state public.seed_pool_state%rowtype; v_target date; v_version uuid; v_seeds jsonb; v_count integer; v_distinct integer; v_active boolean; v_served boolean;
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
  select count(*), count(distinct canonical_key), coalesce(jsonb_agg(jsonb_build_object('id',id::text,'uploadId',upload_id,'canonicalKey',canonical_key,'title',title,'features',features,'publicIds',public_ids) order by array_position(p_seed_ids,id)),'[]'::jsonb)
    into v_count, v_distinct, v_seeds from public.seed_pool_assets where owner_id=p_owner_id and status='ready' and id=any(coalesce(p_seed_ids,'{}'::uuid[]));
  if v_count <> coalesce(array_length(p_seed_ids,1),0) then return jsonb_build_object('status','invalid_seed'); end if;
  if v_count <> v_distinct then return jsonb_build_object('status','duplicate'); end if;
  select exists(select 1 from public.seed_pool_snapshots where owner_id=p_owner_id and not superseded and effective_date<=v_today) into v_active;
  select exists(select 1 from public.dashboard_batches where owner_id=p_owner_id and local_date=v_today::text and status in ('served','acknowledged')) into v_served;
  v_target := case when not v_active and not v_served and v_count>0 then v_today else v_today+1 end;
  if v_state.pending_version is not null and v_state.pending_effective>v_today then
    update public.seed_pool_snapshots set superseded=true where owner_id=p_owner_id and version=v_state.pending_version;
  end if;
  v_version := gen_random_uuid();
  insert into public.seed_pool_snapshots(version,owner_id,effective_date,created_revision,seeds) values(v_version,p_owner_id,v_target,v_state.revision+1,v_seeds);
  update public.seed_pool_state set revision=revision+1, pending_version=case when v_target>v_today then v_version else null end, pending_effective=case when v_target>v_today then v_target else null end where owner_id=p_owner_id;
  return jsonb_build_object('status','ok','revision',v_state.revision+1,'version',v_version::text,'effectiveLocalDate',v_target::text);
end $$;

create or replace function public.seed_pool_forget(p_owner_id uuid,p_expected_revision bigint,p_seed_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_state public.seed_pool_state%rowtype; v_object text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 725113));
  select * into v_state from public.seed_pool_state where owner_id=p_owner_id for update;
  if not found or v_state.revision is distinct from p_expected_revision then return jsonb_build_object('status','stale_revision'); end if;
  update public.seed_pool_assets set status='revoked',features='{}'::jsonb,public_ids='{}'::jsonb,title='',canonical_key='revoked:'||p_seed_id::text,upload_id='' where owner_id=p_owner_id and id=p_seed_id returning object_name into v_object;
  if not found then return jsonb_build_object('status','not_found'); end if;
  update public.seed_pool_snapshots s set seeds=coalesce((select jsonb_agg(e) from jsonb_array_elements(s.seeds) e where e->>'id'<>p_seed_id::text),'[]'::jsonb) where s.owner_id=p_owner_id;
  update public.seed_pool_state set revision=revision+1,revocation_generation=revocation_generation+1 where owner_id=p_owner_id;
  return jsonb_build_object('status','revoked','objectName',v_object,'revision',v_state.revision+1,'revocationGeneration',v_state.revocation_generation+1);
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
  v_status := public.acknowledge_dashboard_batch(p_owner_id,p_batch_id);
  return jsonb_build_object('status',v_status);
end $$;

revoke all on function public.seed_pool_fence_matches(uuid,date,text,bigint),public.seed_pool_mark_batch_served(uuid,date,uuid,text,bigint),public.seed_pool_put_prepared_batch(uuid,date,text,bigint,text,jsonb,jsonb),public.seed_pool_ack_batch(uuid,date,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.seed_pool_mark_batch_served(uuid,date,uuid,text,bigint),public.seed_pool_put_prepared_batch(uuid,date,text,bigint,text,jsonb,jsonb),public.seed_pool_ack_batch(uuid,date,uuid,text,bigint) to service_role;
