-- 03-verify-security.sql
-- Hosted, READ-ONLY copy of docs/handoff/upload-abstract/sql-runtime/security-metadata-local.sql
-- for the Supabase SQL Editor of the peer-test project (cbsbtkvbmvyznerbpmxg).
-- The SELECT below is byte-identical to that file's SELECT; only its psql
-- `\set ON_ERROR_STOP` line and its 127.0.0.1 task-cluster guard are removed
-- (the hosted target has no loopback address and no data_directory access).
-- It writes nothing and reads no application or auth user rows.
-- Output: one row, one JSON cell `security_metadata`. Save the cell text verbatim as
-- UTF-8 and compare with %TEMP%/peer-rollout-evidence/production-security-metadata.json
-- (see README.md for the exact command).
-- READ ONLY follow-up: existing-table RLS/owner/trigger/function metadata.
-- No application/auth user rows and no writes.
with wanted as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) as owner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
    ('profiles','briefing_deliveries','private_paper_pools')
), triggers_metadata as (
  select w.relname as table_name,t.tgname,t.tgenabled,
    pg_get_triggerdef(t.oid,true) as definition,
    n.nspname as function_schema,p.proname,
    pg_get_userbyid(p.proowner) as function_owner,
    coalesce(array_to_string(p.proacl,','),'DEFAULT') as function_acl,
    pg_get_functiondef(p.oid) as function_definition
  from wanted w join pg_trigger t on t.tgrelid=w.oid and not t.tgisinternal
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
), functions_metadata as (
  select n.nspname,p.proname,pg_get_userbyid(p.proowner) as owner,
    coalesce(array_to_string(p.proacl,','),'DEFAULT') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='auth' and p.proname='uid'
)
select jsonb_build_object(
  'tables',(select coalesce(jsonb_agg(to_jsonb(w)-'oid' order by w.relname),'[]'::jsonb) from wanted w),
  'triggers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_name,t.tgname),'[]'::jsonb) from triggers_metadata t),
  'auth_functions',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from functions_metadata f),
  'seed_objects',jsonb_build_object(
    'state',to_regclass('public.seed_pool_state')::text,
    'assets',to_regclass('public.seed_pool_assets')::text,
    'snapshots',to_regclass('public.seed_pool_snapshots')::text,
    'observed_days',to_regclass('public.seed_pool_observed_days')::text)
) as security_metadata;
