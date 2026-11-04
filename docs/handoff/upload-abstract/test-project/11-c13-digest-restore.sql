-- 11-c13-digest-restore.sql  (W12, rubric unit C13)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY. Undo 11-c13-digest-setup.sql:
-- puts every backed-up profile's four digest settings back and drops the backup.
-- It does not delete the briefing_deliveries / dashboard_batches rows the run
-- created (they are the C13 evidence and what a real owner would have).

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

-- [1b] The canonical bundle must already be applied.
DO $bundle$
BEGIN
  IF to_regclass('public.seed_pool_assets') IS NULL OR to_regclass('public.seed_pool_snapshots') IS NULL
     OR to_regclass('public.seed_pool_state') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: the canonical bundle is not applied (seed_pool_* tables absent).';
  END IF;
END
$bundle$;

DO $restore$
BEGIN
  IF to_regclass('peer_test_w12.c13_profile_backup') IS NULL THEN
    RAISE NOTICE 'nothing to restore: peer_test_w12.c13_profile_backup does not exist';
    RETURN;
  END IF;
  UPDATE public.profiles p
     SET digest_enabled = b.digest_enabled, digest_hour_local = b.digest_hour_local,
         digest_frequency = b.digest_frequency, digest_channel = b.digest_channel
    FROM peer_test_w12.c13_profile_backup b
   WHERE p.user_id = b.user_id;
  DROP TABLE peer_test_w12.c13_profile_backup;
END
$restore$;

DO $schema$
BEGIN
  IF to_regnamespace('peer_test_w12') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'peer_test_w12') THEN
    DROP SCHEMA peer_test_w12;
  END IF;
END
$schema$;

SELECT jsonb_build_object('restore', 'done', 'profiles_digest_enabled_now', (SELECT count(*) FROM public.profiles WHERE digest_enabled)) AS peer_test_c13_restore;

COMMIT;
