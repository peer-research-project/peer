-- 10-c15-rollback.sql  (W12, rubric unit C15)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY. Undo 10-c15-age-seed-fixture.sql.
--
-- * Restores the original created_at of every aged asset that still exists and is
--   still status 'ready' (the active seed should be). An orphan control that the
--   purge job revoked stays revoked: that tombstone is the expected result and
--   is not "restored" into a live asset.
-- * Drops the private bookkeeping table (and the schema if it is then empty).
-- * The ordinary upload aged by 10-c15-age-upload-meta.mjs is either purged
--   (expected; nothing to restore) or restored with `--restore` (see that script).

BEGIN;

-- [1] Target guard: verbatim copy of the DO block in 00-test-target-guard.sql.
DO $guard$
DECLARE
  v_rows   integer;
  v_ref    text;
  v_oldest timestamptz;
  v_ledger bigint;
BEGIN
  IF to_regclass('peer_test_guard.target') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: sentinel peer_test_guard.target is absent. This is NOT the baselined peer-test project (production has no sentinel). Stop.';
  END IF;

  SELECT count(*), min(project_ref) INTO v_rows, v_ref FROM peer_test_guard.target;
  IF v_rows <> 1 OR v_ref IS DISTINCT FROM 'cbsbtkvbmvyznerbpmxg' THEN
    RAISE EXCEPTION 'REFUSED: sentinel must hold exactly one row for cbsbtkvbmvyznerbpmxg (rows=%, ref=%).', v_rows, v_ref;
  END IF;

  SELECT min(created_at) INTO v_oldest FROM auth.users;
  IF v_oldest IS NOT NULL AND v_oldest < timestamptz '2026-11-03 00:00:00+00' THEN
    RAISE EXCEPTION 'REFUSED: auth.users holds an account created before 2026-11-03 UTC; the peer-test project did not exist then. This looks like production. Stop.';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO v_ledger;
    IF v_ledger > 0 THEN
      RAISE EXCEPTION 'REFUSED: supabase_migrations.schema_migrations has % rows; the test baseline never writes a ledger (production has 11). Stop.', v_ledger;
    END IF;
  END IF;

  IF to_regclass('public.private_paper_pools') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: public.private_paper_pools is absent; run 01-production-shape-baseline.sql first.';
  END IF;
END
$guard$;

DO $rollback$
BEGIN
  IF to_regclass('peer_test_w12.c15_aged_assets') IS NULL THEN
    RAISE NOTICE 'nothing to roll back: peer_test_w12.c15_aged_assets does not exist';
    RETURN;
  END IF;
  UPDATE public.seed_pool_assets a
     SET created_at = f.original_created_at
    FROM peer_test_w12.c15_aged_assets f
   WHERE a.id = f.asset_id AND a.owner_id = f.owner_id AND a.status = 'ready';
  DROP TABLE peer_test_w12.c15_aged_assets;
END
$rollback$;

DO $schema$
BEGIN
  IF to_regnamespace('peer_test_w12') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'peer_test_w12') THEN
    DROP SCHEMA peer_test_w12;
  END IF;
END
$schema$;

SELECT jsonb_build_object(
  'rollback', 'done',
  'w12_schema_present', to_regnamespace('peer_test_w12') IS NOT NULL
) AS peer_test_c15_rollback;

COMMIT;
