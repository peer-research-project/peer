-- READ ONLY: schema/catalog metadata, no application or auth user rows.
-- Export the single JSON cell for comparison with the isolated test database.
with wanted_tables(table_schema,table_name) as (
  values ('public','profiles'),('public','dashboard_batches'),
    ('public','dashboard_deliveries'),('public','briefing_deliveries'),
    ('public','private_paper_pools'),('public','dashboard_rollover_candidates')
), columns_metadata as (
  select c.table_schema,c.table_name,c.column_name,c.data_type,c.udt_name,
    c.is_nullable,c.column_default,c.ordinal_position
  from information_schema.columns c
  where (c.table_schema,c.table_name) in (select * from wanted_tables)
    or (c.table_schema='auth' and c.table_name='users' and c.column_name='id')
), constraints_metadata as (
  select n.nspname as table_schema,c.relname as table_name,k.conname,k.contype,
    pg_get_constraintdef(k.oid,true) as definition
  from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace
  where (n.nspname,c.relname) in (select * from wanted_tables)
), functions_metadata as (
  select n.nspname as schema_name,p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,p.prosecdef,
    coalesce(array_to_string(p.proacl,','),'DEFAULT') as acl,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='auth' and p.proname='uid')
    or (n.nspname='public' and p.proname in
      ('acknowledge_dashboard_batch','claim_briefing_delivery'))
), policies_metadata as (
  select schemaname,tablename,policyname,roles,cmd,qual,with_check
  from pg_policies where (schemaname,tablename) in (select * from wanted_tables)
), grants_metadata as (
  select table_schema,table_name,grantee,privilege_type
  from information_schema.role_table_grants
  where (table_schema,table_name) in (select * from wanted_tables)
    and grantee in ('anon','authenticated','service_role','PUBLIC')
), indexes_metadata as (
  select schemaname,tablename,indexname,indexdef
  from pg_indexes where (schemaname,tablename) in (select * from wanted_tables)
), roles_metadata as (
  select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
  from pg_roles where rolname in ('anon','authenticated','service_role')
)
select jsonb_build_object(
  'postgres_version',version(),
  'columns',(select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema,x.table_name,x.ordinal_position),'[]'::jsonb) from columns_metadata x),
  'constraints',(select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema,x.table_name,x.conname),'[]'::jsonb) from constraints_metadata x),
  'functions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.schema_name,x.proname,x.arguments),'[]'::jsonb) from functions_metadata x),
  'policies',(select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.policyname),'[]'::jsonb) from policies_metadata x),
  'grants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema,x.table_name,x.grantee,x.privilege_type),'[]'::jsonb) from grants_metadata x),
  'indexes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.indexname),'[]'::jsonb) from indexes_metadata x),
  'roles',(select coalesce(jsonb_agg(to_jsonb(x) order by x.rolname),'[]'::jsonb) from roles_metadata x)
) as schema_metadata;
