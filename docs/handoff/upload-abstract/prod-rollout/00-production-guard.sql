-- 00-production-guard.sql
-- PURPOSE: prove that the SQL Editor session is attached to the Peer PRODUCTION
--          database (Supabase project ref gdakokshfjqljddlrkrh) before any
--          production step, and report which rollout stage it is in.
--          It is the inverse of docs/handoff/upload-abstract/test-project/
--          00-test-target-guard.sql: that file refuses production, this file
--          refuses peer-test (cbsbtkvbmvyznerbpmxg) and anything else.
-- READ ONLY. No DDL, no DML. Reads catalogs, the migration-ledger VERSION
--          strings, storage.buckets metadata, and two AGGREGATES of auth.users
--          (count(*), min(created_at)); no user row is returned or copied.
-- No psql meta-commands: paste-safe for the Supabase SQL Editor (role postgres).
--
-- ROOT OF TRUST: the browser address bar must show /project/gdakokshfjqljddlrkrh/.
-- SQL cannot read the Supabase project ref; the checks below are the second line.
--
-- The DO block RAISEs (editor shows an ERROR, nothing else runs) unless ALL hold:
--   G1. current_user = postgres (the role the peer-test rehearsal used).
--   G2. schema peer_test_guard does NOT exist (only peer-test's baseline 01 creates it).
--   G3. supabase_migrations.schema_migrations exists and holds EXACTLY these 11
--       versions (production-inventory-readonly.json, captured 2026-11-03 20:15 UTC):
--       20260424083636 20260428073641 20260429044039 20260505063457 20260915042700
--       20260915042730 20260915042732 20260915042735 20260915042738 20260915042741
--       20260915042812   (peer-test has no ledger rows; the bundle writes none).
--   G4. auth.users has at least one account AND its oldest created_at is before
--       2026-11-03 00:00 UTC (peer-test did not exist before that day).
--   G5. all 9 production public tables exist (briefing_deliveries, feedback_events,
--       opportunity_pools, private_decisions, private_paper_pools, profiles,
--       read_items, saved_items, usage_counters).
--   G6. storage bucket private-uploads exists, private, file_size_limit 26214400.
--
-- Output (only when the guard passes): one JSON cell `production_guard` with
--   "guard": "PASS" and "stage":
--     "pre-bundle"     - none of the bundle's objects exist (expected before apply)
--     "bundle-applied" - all 7 tables, 19 functions, 3 columns and the index exist
--     "PARTIAL - STOP" - anything in between (must never happen: the bundle is one
--                        transaction). Stop and escalate; do not apply or roll back.
-- The same DO block is copied verbatim at the top of 01 and 03 and inlined in 02.

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

WITH
new_tables(name) AS (VALUES
  ('dashboard_batches'), ('dashboard_deliveries'), ('dashboard_rollover_candidates'),
  ('seed_pool_state'), ('seed_pool_observed_days'), ('seed_pool_assets'), ('seed_pool_snapshots')),
new_functions(name) AS (VALUES
  ('acknowledge_dashboard_batch'), ('claim_briefing_delivery'), ('upsert_rollover_candidates'),
  ('seed_pool_resolve'), ('seed_pool_apply'), ('seed_pool_forget'), ('seed_pool_fence_matches'),
  ('seed_pool_mark_batch_served'), ('seed_pool_put_prepared_batch'), ('seed_pool_ack_batch'),
  ('seed_pool_editor'), ('seed_pool_stage_asset'), ('seed_pool_claim_digest'),
  ('seed_pool_validate_digest_send'), ('seed_pool_claim_cleanup'), ('seed_pool_record_feed_served'),
  ('seed_pool_persist_digest_email'), ('seed_pool_put_private_pool'), ('seed_pool_finish_asset')),
counts AS (
  SELECT
    (SELECT count(*) FROM new_tables WHERE to_regclass('public.' || name) IS NOT NULL) AS n_tables,
    (SELECT count(*) FROM pg_proc p JOIN new_functions f ON f.name = p.proname
      WHERE p.pronamespace = 'public'::regnamespace) AS n_functions,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'briefing_deliveries'
        AND column_name IN ('local_date', 'seed_pool_version', 'seed_revocation_generation')) AS n_columns,
    (SELECT count(*) FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = 'briefing_deliveries_user_local_date_idx') AS n_index)
SELECT jsonb_build_object(
  'guard', 'PASS',
  'expected_project_ref', 'gdakokshfjqljddlrkrh (confirm in the address bar)',
  'migration_ledger_rows', 11,
  'stage', CASE
             WHEN n_tables = 0 AND n_functions = 0 AND n_columns = 0 AND n_index = 0 THEN 'pre-bundle'
             WHEN n_tables = 7 AND n_functions = 19 AND n_columns = 3 AND n_index = 1 THEN 'bundle-applied'
             ELSE 'PARTIAL - STOP' END,
  'bundle_object_counts', jsonb_build_object('tables_of_7', n_tables, 'functions_of_19', n_functions,
                                              'briefing_deliveries_columns_of_3', n_columns, 'local_date_index_of_1', n_index),
  'postgres_version', version()
) AS production_guard
FROM counts;
