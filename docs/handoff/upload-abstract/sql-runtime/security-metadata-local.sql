\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
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
