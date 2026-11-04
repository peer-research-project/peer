-- 07-verify-default-privileges.sql
-- READ ONLY catalog SELECT. Run it in BOTH projects' SQL Editor (production
-- gdakokshfjqljddlrkrh and peer-test cbsbtkvbmvyznerbpmxg), save each JSON
-- cell, and compare (README.md has the command). It reads no rows of any
-- application, auth or storage table.
--
-- Why it matters: the canonical bundle creates seven new tables and nineteen
-- functions and only REVOKEs from anon/authenticated; service_role's table
-- privileges on dashboard_batches, dashboard_deliveries and
-- dashboard_rollover_candidates, and service_role EXECUTE on
-- seed_pool_fence_matches, come from the creating role's DEFAULT PRIVILEGES.
-- If the two projects' default privileges differ, the rehearsal can pass (or
-- fail) for a reason production will not share. Event triggers are listed for
-- the same reason (a newer project can carry automatic-RLS or similar hooks).
SELECT jsonb_build_object(
  'postgres_version', version(),
  'current_user', current_user,
  'default_acls', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'role', pg_get_userbyid(d.defaclrole),
             'schema', coalesce(n.nspname, '<all schemas>'),
             'objtype', CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences'
                          WHEN 'f' THEN 'functions' WHEN 'T' THEN 'types' WHEN 'n' THEN 'schemas'
                          ELSE d.defaclobjtype::text END,
             'acl', array_to_string(d.defaclacl, ','))
           ORDER BY pg_get_userbyid(d.defaclrole), coalesce(n.nspname, ''), d.defaclobjtype), '[]'::jsonb)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE pg_get_userbyid(d.defaclrole) IN ('postgres', 'supabase_admin')
      AND (n.nspname IS NULL OR n.nspname = 'public')),
  'event_triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', e.evtname, 'event', e.evtevent, 'enabled', e.evtenabled,
             'function', e.evtfoid::regproc::text, 'tags', e.evttags)
           ORDER BY e.evtname), '[]'::jsonb)
    FROM pg_event_trigger e),
  'public_schema_acl', (SELECT array_to_string(nspacl, ',') FROM pg_namespace WHERE nspname = 'public'),
  'postgres_can_set_role', jsonb_build_object(
    'anon', pg_has_role('postgres', 'anon', 'MEMBER'),
    'authenticated', pg_has_role('postgres', 'authenticated', 'MEMBER'),
    'service_role', pg_has_role('postgres', 'service_role', 'MEMBER')),
  'auth_users_triggers_owner_privilege', jsonb_build_object(
    'auth_users_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'auth.users'::regclass),
    'postgres_trigger_on_auth_users', has_table_privilege('postgres', 'auth.users', 'TRIGGER'),
    'postgres_references_auth_users', has_table_privilege('postgres', 'auth.users', 'REFERENCES')),
  'storage_buckets_privileges', jsonb_build_object(
    'insert', has_table_privilege('postgres', 'storage.buckets', 'INSERT'),
    'select', has_table_privilege('postgres', 'storage.buckets', 'SELECT'))
) AS default_privileges_metadata;
