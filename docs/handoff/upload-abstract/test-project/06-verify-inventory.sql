-- 06-verify-inventory.sql
-- READ ONLY. Names-only inventory of the peer-test project, in the same shape
-- as the "inventory" object of
-- %TEMP%/peer-rollout-evidence/production-inventory-readonly.json, so the two
-- can be compared key by key (README.md has the command). It covers the six
-- tables 02/03 do not: saved_items, read_items, feedback_events,
-- opportunity_pools, usage_counters, private_decisions (names only).
-- Writes nothing; reads no application or auth user rows.
--
-- Strings follow the production inventory format:
--   tables    "<table>"                         (public, ordinary tables)
--   buckets   "<id>:<public>:<file_size_limit>"
--   policies  "<table>:<policy>"                (public schema)
--   triggers  "<table>:<trigger>"               (public tables and auth.users, non-internal)
--   functions "<name>(<identity arguments>)"    (public schema)
SELECT jsonb_build_object(
  'tables', (SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
             FROM pg_class c
             WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')),
  'buckets', (SELECT coalesce(jsonb_agg(b.id || ':' || b.public::text || ':' || coalesce(b.file_size_limit::text, 'null') ORDER BY b.id), '[]'::jsonb)
              FROM storage.buckets b),
  'policies', (SELECT coalesce(jsonb_agg(p.tablename || ':' || p.policyname ORDER BY p.tablename, p.policyname), '[]'::jsonb)
               FROM pg_policies p WHERE p.schemaname = 'public'),
  'triggers', (SELECT coalesce(jsonb_agg(c.relname || ':' || t.tgname ORDER BY c.relname, t.tgname), '[]'::jsonb)
               FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
               WHERE NOT t.tgisinternal
                 AND (c.relnamespace = 'public'::regnamespace OR t.tgrelid = 'auth.users'::regclass)),
  'functions', (SELECT coalesce(jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
                FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
  'migrations_table', CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
                           THEN NULL ELSE 'supabase_migrations.schema_migrations' END,
  'absent_on_production_check', jsonb_build_object(
    'briefing_deliveries_local_date', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'briefing_deliveries' AND column_name = 'local_date'),
    'dashboard_tables', (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'dashboard%' AND relkind = 'r'),
    'seed_pool_tables', (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'seed_pool%' AND relkind = 'r')),
  'storage_objects_policies', (SELECT coalesce(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb)
                               FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects')
) AS inventory;
