-- 03-post-apply-readonly.sql
-- PURPOSE: read-only checks on PRODUCTION (gdakokshfjqljddlrkrh) after the canonical
--          bundle (SHA-256 A7878BF3A92587B653159604AED6DF0F959207A9C36958E686729EB215120A1B,
--          63968 bytes, LF) committed. Production twin of
--          docs/handoff/upload-abstract/test-project/08-post-bundle-checks.sql: the 08
--          CTEs (new_tables ... informational) are copied byte-for-byte by script, and
--          production-only checks are added. Production holds real rows, so every row
--          figure here is a COUNT; no application or auth row is returned.
-- READ ONLY. No DDL, no DML, no temp objects.
-- GUARD FIRST: verbatim copy of 00-production-guard.sql, then a stage check that
--          refuses unless the stage is "bundle-applied".
--
-- WHEN TO RUN AND WHAT MUST BE TRUE (cell `production_post_apply`):
--   Run E (immediately after the bundle, the OLD app 902eb50 still serving):
--     all_required_pass                = true   (08 required + production_required)
--     before_new_code.all_true         = true   (the old code never writes the new
--                                                objects, so every new table is empty
--                                                and no briefing row carries a new value)
--   Run G (after the new deployment is Ready and the smoke has run):
--     all_required_pass                = true   (unchanged)
--     before_new_code.*                may now be false: that is the new code working,
--                                       not drift. Read production_counts instead:
--                                       seed_pool_observed_days grows by one row per
--                                       signed-in owner per local day that saw a feed
--                                       (web/src/app/api/feed/route.ts:297-302,
--                                       web/src/app/api/jobs/dispatch-digests/route.ts:554-557).
--   Compare production_counts.briefing_deliveries_rows with 01's
--   counts.briefing_deliveries_rows: equal, or larger only by digest rows written by
--   the hourly cron (:05) in between. Never smaller.
-- informational.* (from 08) is recorded, not judged. Its text
--   "legacy_null_local_date_behaviour: NOT TESTABLE here" is 08's peer-test wording;
--   on production the NULL-date rows are real history (all pre-bundle rows), counted in
--   informational.briefing_deliveries_null_local_date_count. The bundle never rewrites
--   them (no UPDATE of existing rows anywhere in the bundle).
-- No psql meta-commands: paste-safe for the Supabase SQL Editor (role postgres).

DO $guard$
DECLARE
  v_expected_versions CONSTANT text[] := ARRAY[
    '20260424083636','20260428073641','20260429044039','20260505063457','20260915042700',
    '20260915042730','20260915042732','20260915042735','20260915042738','20260915042741',
    '20260915042812'];
  v_versions text[];
  v_users    bigint;
  v_oldest   timestamptz;
  v_missing  text[];
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'REFUSED (G1): run as role postgres; current_user=%.', current_user;
  END IF;

  IF to_regnamespace('peer_test_guard') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSED (G2): schema peer_test_guard exists. This is the peer-test project (cbsbtkvbmvyznerbpmxg), NOT production. Stop.';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'REFUSED (G3): supabase_migrations.schema_migrations is absent; production has an 11-row ledger. Stop.';
  END IF;
  EXECUTE 'SELECT coalesce(array_agg(version::text ORDER BY version::text), ''{}''::text[]) FROM supabase_migrations.schema_migrations'
    INTO v_versions;
  IF v_versions IS DISTINCT FROM v_expected_versions THEN
    RAISE EXCEPTION 'REFUSED (G3): migration ledger differs from the production export (rows=%, last=%). Expected exactly 11 rows ending 20260915042812. Stop and re-check the project.',
      coalesce(array_length(v_versions, 1), 0), v_versions[array_length(v_versions, 1)];
  END IF;

  SELECT count(*), min(created_at) INTO v_users, v_oldest FROM auth.users;
  IF v_users = 0 OR v_oldest IS NULL OR v_oldest >= timestamptz '2026-11-03 00:00:00+00' THEN
    RAISE EXCEPTION 'REFUSED (G4): auth.users has no account created before 2026-11-03 UTC; production has older accounts. Stop.';
  END IF;

  SELECT coalesce(array_agg(t ORDER BY t), '{}'::text[]) INTO v_missing
    FROM unnest(ARRAY['briefing_deliveries','feedback_events','opportunity_pools','private_decisions',
                      'private_paper_pools','profiles','read_items','saved_items','usage_counters']) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'REFUSED (G5): production public tables missing: %. Stop.', v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets
                  WHERE id = 'private-uploads' AND public = false AND file_size_limit = 26214400) THEN
    RAISE EXCEPTION 'REFUSED (G6): private bucket private-uploads (26214400 bytes) not found as exported. Stop.';
  END IF;
END
$guard$;

DO $stage$
DECLARE
  v_tables integer;
  v_cols   integer;
BEGIN
  SELECT count(*) INTO v_tables FROM unnest(ARRAY['dashboard_batches','dashboard_deliveries','dashboard_rollover_candidates',
      'seed_pool_state','seed_pool_observed_days','seed_pool_assets','seed_pool_snapshots']) AS t
   WHERE to_regclass('public.' || t) IS NOT NULL;
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'briefing_deliveries'
     AND column_name IN ('local_date', 'seed_pool_version', 'seed_revocation_generation');
  IF v_tables <> 7 OR v_cols <> 3 OR to_regclass('public.briefing_deliveries_user_local_date_idx') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: production is not at stage bundle-applied (tables %/7, columns %/3). Run 00 and read its stage.', v_tables, v_cols;
  END IF;
END
$stage$;

WITH
new_tables(name) AS (VALUES
  ('dashboard_batches'), ('dashboard_deliveries'), ('dashboard_rollover_candidates'),
  ('seed_pool_state'), ('seed_pool_observed_days'), ('seed_pool_assets'), ('seed_pool_snapshots')),
auth_select_tables(name) AS (VALUES
  ('dashboard_batches'), ('dashboard_deliveries'), ('dashboard_rollover_candidates'),
  ('seed_pool_state'), ('seed_pool_assets'), ('seed_pool_snapshots')),
new_functions(name) AS (VALUES
  ('acknowledge_dashboard_batch'), ('claim_briefing_delivery'), ('upsert_rollover_candidates'),
  ('seed_pool_resolve'), ('seed_pool_apply'), ('seed_pool_forget'), ('seed_pool_fence_matches'),
  ('seed_pool_mark_batch_served'), ('seed_pool_put_prepared_batch'), ('seed_pool_ack_batch'),
  ('seed_pool_editor'), ('seed_pool_stage_asset'), ('seed_pool_claim_digest'),
  ('seed_pool_validate_digest_send'), ('seed_pool_claim_cleanup'), ('seed_pool_record_feed_served'),
  ('seed_pool_persist_digest_email'), ('seed_pool_put_private_pool'), ('seed_pool_finish_asset')),
t AS (
  SELECT nt.name, c.oid, c.relrowsecurity, c.relforcerowsecurity,
         pg_get_userbyid(c.relowner) AS owner
  FROM new_tables nt LEFT JOIN pg_class c
    ON c.relname = nt.name AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'),
f AS (
  SELECT nf.name, p.oid, p.prosecdef, p.proconfig, p.prosrc,
         pg_get_userbyid(p.proowner) AS owner
  FROM new_functions nf LEFT JOIN pg_proc p
    ON p.proname = nf.name AND p.pronamespace = 'public'::regnamespace),
col AS (
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'briefing_deliveries' AND column_name IN ('local_date', 'seed_pool_version', 'seed_revocation_generation'))
      OR (table_name = 'dashboard_batches' AND column_name IN ('seed_pool_version', 'seed_revocation_generation')))),
idx AS (
  SELECT i.indisunique, pg_get_indexdef(i.indexrelid) AS def,
         pg_get_expr(i.indpred, i.indrelid) AS pred,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'briefing_deliveries_user_local_date_idx'
    AND c.relnamespace = 'public'::regnamespace),
required AS (
  SELECT jsonb_build_object(
    'all_7_new_tables_exist', (SELECT bool_and(oid IS NOT NULL) FROM t),
    'new_tables_owner_postgres', (SELECT bool_and(owner = 'postgres') FROM t),
    'new_tables_rls_enabled_not_forced', (SELECT bool_and(relrowsecurity AND NOT relforcerowsecurity) FROM t),
    'all_19_new_functions_exist_once', (SELECT bool_and(n = 1) FROM (SELECT name, count(oid) AS n FROM f GROUP BY name) x),
    'new_functions_owner_postgres', (SELECT bool_and(owner = 'postgres') FROM f),
    'security_definer_functions_pin_search_path', (SELECT bool_and(NOT prosecdef OR EXISTS (SELECT 1 FROM unnest(proconfig) AS cfg(v) WHERE cfg.v LIKE 'search_path=public%pg_temp')) FROM f),
    'security_definer_count_is_16', (SELECT count(*) = 16 FROM f WHERE prosecdef),
    'no_carriage_return_in_any_public_function_body', NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%' || chr(13) || '%'),
    'briefing_deliveries_local_date_text_nullable', EXISTS (
        SELECT 1 FROM col WHERE table_name = 'briefing_deliveries' AND column_name = 'local_date'
          AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL),
    'briefing_deliveries_seed_columns', (SELECT count(*) = 2 FROM col WHERE table_name = 'briefing_deliveries'
          AND ((column_name = 'seed_pool_version' AND data_type = 'text')
            OR (column_name = 'seed_revocation_generation' AND data_type = 'bigint' AND is_nullable = 'NO' AND column_default = '0'))),
    'dashboard_batches_seed_columns', (SELECT count(*) = 2 FROM col WHERE table_name = 'dashboard_batches'
          AND ((column_name = 'seed_pool_version' AND data_type = 'text')
            OR (column_name = 'seed_revocation_generation' AND data_type = 'bigint' AND is_nullable = 'NO' AND column_default = '0'))),
    'local_date_unique_partial_index', EXISTS (
        SELECT 1 FROM idx WHERE indisunique AND pred = '(local_date IS NOT NULL)' AND owner = 'postgres'),
    'policies_present', (SELECT count(*) = 6 FROM pg_policies WHERE schemaname = 'public' AND
        ((tablename, policyname) IN (
          ('dashboard_batches', 'owners read their dashboard batches'),
          ('dashboard_deliveries', 'owners read their dashboard deliveries'),
          ('dashboard_rollover_candidates', 'owners read their dashboard rollover candidates'),
          ('seed_pool_state', 'seed_pool_owner_read'),
          ('seed_pool_assets', 'seed_pool_owner_read'),
          ('seed_pool_snapshots', 'seed_pool_owner_read')))),
    'anon_has_no_privilege_on_new_tables', (SELECT bool_and(NOT has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) FROM t),
    'authenticated_select_only_where_granted', (SELECT bool_and(
        has_table_privilege('authenticated', t.oid, 'SELECT') = EXISTS (SELECT 1 FROM auth_select_tables a WHERE a.name = t.name)
        AND NOT has_table_privilege('authenticated', t.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')) FROM t),
    'service_role_rw_on_seed_tables', (SELECT bool_and(has_table_privilege('service_role', oid, 'SELECT')
        AND has_table_privilege('service_role', oid, 'INSERT') AND has_table_privilege('service_role', oid, 'UPDATE')
        AND has_table_privilege('service_role', oid, 'DELETE')) FROM t WHERE name LIKE 'seed_pool%'),
    'anon_authenticated_cannot_execute_any_new_function', (SELECT bool_and(
        NOT has_function_privilege('anon', oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) FROM f),
    'service_role_executes_granted_functions', (SELECT bool_and(has_function_privilege('service_role', oid, 'EXECUTE'))
        FROM f WHERE name <> 'seed_pool_fence_matches'),
    'sequence_acl_unchanged', (SELECT array_to_string(relacl, ',') = 'postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres'
        AND pg_get_userbyid(relowner) = 'postgres'
        FROM pg_class WHERE oid = 'public.briefing_deliveries_id_seq'::regclass),
    'baseline_objects_untouched', (SELECT count(*) = 9 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
        AND relname IN ('briefing_deliveries', 'feedback_events', 'opportunity_pools', 'private_decisions',
                        'private_paper_pools', 'profiles', 'read_items', 'saved_items', 'usage_counters'))
        AND EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'private-uploads' AND NOT public AND file_size_limit = 26214400),
    'no_unrelated_objects_created', NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('dashboard_prepare_jobs', 'usage_events', 'company_spend_caps', 'company_model_prices', 'local_test_before'))
  ) AS j),
informational AS (
  SELECT jsonb_build_object(
    'service_role_rw_on_dashboard_tables_via_default_privileges', (SELECT jsonb_object_agg(name,
        has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT')
        AND has_table_privilege('service_role', oid, 'UPDATE') AND has_table_privilege('service_role', oid, 'DELETE'))
        FROM t WHERE name LIKE 'dashboard%'),
    'service_role_execute_seed_pool_fence_matches', (SELECT has_function_privilege('service_role', oid, 'EXECUTE') FROM f WHERE name = 'seed_pool_fence_matches'),
    'new_table_acls', (SELECT jsonb_object_agg(t.name, coalesce(array_to_string(c.relacl, ','), 'DEFAULT'))
        FROM t JOIN pg_class c ON c.oid = t.oid),
    'new_function_acls', (SELECT jsonb_object_agg(f.name, coalesce(array_to_string(p.proacl, ','), 'DEFAULT'))
        FROM f JOIN pg_proc p ON p.oid = f.oid),
    'security_definer_search_paths', (SELECT jsonb_object_agg(name, array_to_string(proconfig, ';')) FROM f WHERE prosecdef),
    'briefing_deliveries_row_count', (SELECT count(*) FROM public.briefing_deliveries),
    'briefing_deliveries_null_local_date_count', (SELECT count(*) FROM public.briefing_deliveries WHERE local_date IS NULL),
    'legacy_null_local_date_behaviour', 'NOT TESTABLE here without invented legacy delivery rows; covered only by the local harness (prodmeta-legacy-check.sql / prodmeta-legacy-digest-fixed.sql)',
    'seed_table_row_counts', jsonb_build_object(
        'seed_pool_state', (SELECT count(*) FROM public.seed_pool_state),
        'seed_pool_assets', (SELECT count(*) FROM public.seed_pool_assets),
        'seed_pool_snapshots', (SELECT count(*) FROM public.seed_pool_snapshots),
        'seed_pool_observed_days', (SELECT count(*) FROM public.seed_pool_observed_days),
        'dashboard_batches', (SELECT count(*) FROM public.dashboard_batches))
  ) AS j),
exp_tables_after(x) AS (VALUES
  ('briefing_deliveries'), ('dashboard_batches'), ('dashboard_deliveries'), ('dashboard_rollover_candidates'),
  ('feedback_events'), ('opportunity_pools'), ('private_decisions'), ('private_paper_pools'), ('profiles'),
  ('read_items'), ('saved_items'), ('seed_pool_assets'), ('seed_pool_observed_days'), ('seed_pool_snapshots'),
  ('seed_pool_state'), ('usage_counters')),
act_tables_after(x) AS (
  SELECT c.relname::text FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')),
exp_policies_after(x) AS (VALUES
  ('briefing_deliveries:users read own briefings'), ('briefing_deliveries:users update own briefings'),
  ('dashboard_batches:owners read their dashboard batches'), ('dashboard_deliveries:owners read their dashboard deliveries'),
  ('dashboard_rollover_candidates:owners read their dashboard rollover candidates'),
  ('feedback_events:users insert own feedback'), ('feedback_events:users read own feedback'),
  ('private_decisions:owners read their private decisions'),
  ('private_paper_pools:owners read their private paper pools'),
  ('private_paper_pools:owners update their private paper pools'),
  ('private_paper_pools:owners write their private paper pools'),
  ('profiles:users insert own profile'), ('profiles:users read own profile'), ('profiles:users update own profile'),
  ('read_items:users delete own reads'), ('read_items:users insert own reads'), ('read_items:users read own reads'),
  ('read_items:users update own reads'),
  ('saved_items:users delete own saved'), ('saved_items:users insert own saved'), ('saved_items:users read own saved'),
  ('saved_items:users update own saved'),
  ('seed_pool_assets:seed_pool_owner_read'), ('seed_pool_snapshots:seed_pool_owner_read'), ('seed_pool_state:seed_pool_owner_read')),
act_policies_after(x) AS (
  SELECT p.tablename::text || ':' || p.policyname::text FROM pg_policies p WHERE p.schemaname = 'public'),
exp_functions_after(x) AS (VALUES
  ('handle_new_user/0'), ('increment_usage_counter/3'), ('touch_updated_at/0'),
  ('acknowledge_dashboard_batch/2'), ('claim_briefing_delivery/5'), ('upsert_rollover_candidates/3'),
  ('seed_pool_resolve/3'), ('seed_pool_apply/4'), ('seed_pool_forget/3'), ('seed_pool_fence_matches/4'),
  ('seed_pool_mark_batch_served/5'), ('seed_pool_put_prepared_batch/7'), ('seed_pool_ack_batch/5'),
  ('seed_pool_editor/1'), ('seed_pool_stage_asset/10'), ('seed_pool_claim_digest/7'),
  ('seed_pool_validate_digest_send/5'), ('seed_pool_claim_cleanup/1'), ('seed_pool_record_feed_served/4'),
  ('seed_pool_persist_digest_email/6'), ('seed_pool_put_private_pool/6'), ('seed_pool_finish_asset/2')),
act_functions_after(x) AS (
  SELECT p.proname::text || '/' || p.pronargs::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
exp_triggers_after(x) AS (VALUES ('profiles:profiles_touch_updated_at'), ('users:on_auth_user_created')),
act_triggers_after(x) AS (
  SELECT c.relname::text || ':' || t.tgname::text
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND (c.relnamespace = 'public'::regnamespace OR t.tgrelid = 'auth.users'::regclass)),
exp_bd_old_columns(column_name, data_type, is_nullable, column_default, ordinal_position) AS (VALUES
  ('id'::text, 'bigint'::text, 'NO'::text, 'nextval(''briefing_deliveries_id_seq''::regclass)'::text, 1),
  ('user_id', 'uuid', 'NO', NULL, 2),
  ('delivered_at', 'timestamp with time zone', 'NO', 'now()', 3),
  ('channel', 'text', 'NO', NULL, 4),
  ('item_ids', 'ARRAY', 'NO', '''{}''::text[]', 5),
  ('payload', 'jsonb', 'NO', NULL, 6),
  ('opened_at', 'timestamp with time zone', 'YES', NULL, 7),
  ('created_at', 'timestamp with time zone', 'NO', 'now()', 8)),
act_bd_old_columns AS (
  SELECT column_name::text, data_type::text, is_nullable::text, column_default::text, ordinal_position::int
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'briefing_deliveries'
     AND column_name NOT IN ('local_date', 'seed_pool_version', 'seed_revocation_generation')),
production_required AS (
  SELECT jsonb_build_object(
    'inventory_tables_are_baseline_plus_7', NOT EXISTS ((SELECT x FROM exp_tables_after EXCEPT SELECT x FROM act_tables_after)
                                                       UNION ALL (SELECT x FROM act_tables_after EXCEPT SELECT x FROM exp_tables_after)),
    'inventory_policies_are_baseline_plus_6', NOT EXISTS ((SELECT x FROM exp_policies_after EXCEPT SELECT x FROM act_policies_after)
                                                         UNION ALL (SELECT x FROM act_policies_after EXCEPT SELECT x FROM exp_policies_after)),
    'inventory_functions_are_baseline_plus_19', NOT EXISTS ((SELECT x FROM exp_functions_after EXCEPT SELECT x FROM act_functions_after)
                                                           UNION ALL (SELECT x FROM act_functions_after EXCEPT SELECT x FROM exp_functions_after)),
    'inventory_triggers_unchanged', NOT EXISTS ((SELECT x FROM exp_triggers_after EXCEPT SELECT x FROM act_triggers_after)
                                               UNION ALL (SELECT x FROM act_triggers_after EXCEPT SELECT x FROM exp_triggers_after)),
    'briefing_deliveries_original_8_columns_unchanged', NOT EXISTS ((SELECT * FROM exp_bd_old_columns EXCEPT SELECT * FROM act_bd_old_columns)
                                                                   UNION ALL (SELECT * FROM act_bd_old_columns EXCEPT SELECT * FROM exp_bd_old_columns)),
    'briefing_deliveries_original_indexes_unchanged', (SELECT count(*) = 2 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'briefing_deliveries'
          AND ((indexname = 'briefing_deliveries_pkey' AND indexdef = 'CREATE UNIQUE INDEX briefing_deliveries_pkey ON public.briefing_deliveries USING btree (id)')
            OR (indexname = 'briefing_deliveries_user_time_idx' AND indexdef = 'CREATE INDEX briefing_deliveries_user_time_idx ON public.briefing_deliveries USING btree (user_id, delivered_at DESC)'))),
    'acknowledge_dashboard_batch_browser_roles_revoked', (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'acknowledge_dashboard_batch'),
    'bucket_unchanged', (SELECT coalesce(array_agg(b.id || ':' || b.public::text || ':' || coalesce(b.file_size_limit::text, 'null') ORDER BY b.id), '{}')
                           FROM storage.buckets b) = ARRAY['private-uploads:false:26214400'],
    'postgrest_schema_reload_event_triggers_enabled', (SELECT count(*) = 2 FROM pg_event_trigger
        WHERE evtname IN ('pgrst_ddl_watch', 'pgrst_drop_watch') AND evtenabled = 'O')
  ) AS j),
before_new_code AS (
  SELECT jsonb_build_object(
    'no_briefing_row_has_local_date', NOT EXISTS (SELECT 1 FROM public.briefing_deliveries WHERE local_date IS NOT NULL),
    'no_briefing_row_has_seed_version', NOT EXISTS (SELECT 1 FROM public.briefing_deliveries WHERE seed_pool_version IS NOT NULL),
    'no_briefing_row_has_nonzero_generation', NOT EXISTS (SELECT 1 FROM public.briefing_deliveries WHERE seed_revocation_generation <> 0),
    'all_7_new_tables_empty', NOT EXISTS (SELECT 1 FROM public.dashboard_batches) AND NOT EXISTS (SELECT 1 FROM public.dashboard_deliveries)
        AND NOT EXISTS (SELECT 1 FROM public.dashboard_rollover_candidates) AND NOT EXISTS (SELECT 1 FROM public.seed_pool_state)
        AND NOT EXISTS (SELECT 1 FROM public.seed_pool_observed_days) AND NOT EXISTS (SELECT 1 FROM public.seed_pool_assets)
        AND NOT EXISTS (SELECT 1 FROM public.seed_pool_snapshots)
  ) AS j),
production_counts AS (
  SELECT jsonb_build_object(
    'captured_at_utc', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'auth_users', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'briefing_deliveries_rows', (SELECT count(*) FROM public.briefing_deliveries),
    'briefing_deliveries_local_date_null', (SELECT count(*) FROM public.briefing_deliveries WHERE local_date IS NULL),
    'briefing_deliveries_local_date_set', (SELECT count(*) FROM public.briefing_deliveries WHERE local_date IS NOT NULL),
    'briefing_deliveries_seed_version_set', (SELECT count(*) FROM public.briefing_deliveries WHERE seed_pool_version IS NOT NULL),
    'dashboard_batches', (SELECT count(*) FROM public.dashboard_batches),
    'dashboard_deliveries', (SELECT count(*) FROM public.dashboard_deliveries),
    'dashboard_rollover_candidates', (SELECT count(*) FROM public.dashboard_rollover_candidates),
    'seed_pool_state', (SELECT count(*) FROM public.seed_pool_state),
    'seed_pool_assets', (SELECT count(*) FROM public.seed_pool_assets),
    'seed_pool_snapshots', (SELECT count(*) FROM public.seed_pool_snapshots),
    'seed_pool_observed_days', (SELECT count(*) FROM public.seed_pool_observed_days),
    'seed_pool_observed_days_owners', (SELECT count(DISTINCT owner_id) FROM public.seed_pool_observed_days),
    'private_paper_pools_rows', (SELECT count(*) FROM public.private_paper_pools),
    'briefing_deliveries_total_size', pg_size_pretty(pg_total_relation_size('public.briefing_deliveries'))
  ) AS j)
SELECT jsonb_build_object(
  'all_required_pass', (SELECT bool_and(coalesce(e.value::boolean, false))
                          FROM jsonb_each_text((SELECT j FROM required) || (SELECT j FROM production_required)) AS e),
  'required', (SELECT j FROM required),
  'production_required', (SELECT j FROM production_required),
  'before_new_code', (SELECT j FROM before_new_code)
      || jsonb_build_object('all_true', (SELECT bool_and(coalesce(e.value::boolean, false)) FROM jsonb_each_text((SELECT j FROM before_new_code)) AS e)),
  'production_counts', (SELECT j FROM production_counts),
  'informational', (SELECT j FROM informational)
) AS production_post_apply;
