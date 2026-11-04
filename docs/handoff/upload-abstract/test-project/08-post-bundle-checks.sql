-- 08-post-bundle-checks.sql
-- READ ONLY catalog checks, to run in the peer-test project (cbsbtkvbmvyznerbpmxg)
-- AFTER 00 passed and the canonical bundle
-- docs/handoff/upload-abstract/sql-runtime/seed-closure-canonical-lf.sql
-- (SHA-256 F1D16D710C9B451CE90F5F3254B80DFE9D0A566779EC2485C51207BAEAC5745A)
-- committed. Reads catalogs only, plus row COUNTS (not rows) of
-- briefing_deliveries and the new tables. Writes nothing.
--
-- Output: one JSON cell. "all_required_pass" is true only when every entry of
-- "required" is true. "informational" entries are recorded, not judged: they
-- depend on default privileges (compare 07 between the two projects) or on
-- data the test project does not have.
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
  ) AS j)
SELECT jsonb_build_object(
  'all_required_pass', (SELECT bool_and(coalesce(e.value::boolean, false)) FROM required, jsonb_each_text(required.j) AS e),
  'required', (SELECT j FROM required),
  'informational', (SELECT j FROM informational)
) AS post_bundle_checks;
