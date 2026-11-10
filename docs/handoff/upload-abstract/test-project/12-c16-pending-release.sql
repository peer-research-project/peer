-- 12-c16-pending-release.sql  (W12, rubric unit C16, OPTIONAL cleanup_pending fixture)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY.
--
-- Releases the asset armed by 12-c16-pending-arm.sql through the app's own
-- function public.seed_pool_finish_asset(owner, id) — the call the seed upload
-- route makes once storage confirms a write (bundle lines 910-926). For a
-- revoked asset it only sets writer_settled = true and answers
-- {"status":"revoked"}; it never revives the asset. For an asset that was
-- never forgotten (you armed it but did not click forget) it answers
-- {"status":"ready"} and simply restores writer_settled = true.
-- After this, "Retry file cleanup 1" on the Profile page can complete.

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

DO $release$
DECLARE
  r     record;
  v_out jsonb;
BEGIN
  IF to_regclass('peer_test_w12.c16_pending_fixture') IS NULL THEN
    RAISE NOTICE 'nothing armed: peer_test_w12.c16_pending_fixture does not exist';
    RETURN;
  END IF;
  FOR r IN EXECUTE 'SELECT asset_id, owner_id FROM peer_test_w12.c16_pending_fixture' LOOP
    v_out := public.seed_pool_finish_asset(r.owner_id, r.asset_id);
    RAISE NOTICE 'seed_pool_finish_asset(%) -> %', r.asset_id, v_out;
    -- A ready asset that was armed but never forgotten: finish_asset answers
    -- {"status":"ready"} without touching it, so restore the flag directly.
    UPDATE public.seed_pool_assets SET writer_settled = true
     WHERE id = r.asset_id AND owner_id = r.owner_id AND status = 'ready' AND NOT writer_settled;
  END LOOP;
  EXECUTE 'DROP TABLE peer_test_w12.c16_pending_fixture';
END
$release$;

DO $schema$
BEGIN
  IF to_regnamespace('peer_test_w12') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'peer_test_w12') THEN
    DROP SCHEMA peer_test_w12;
  END IF;
END
$schema$;

SELECT jsonb_build_object('released', true) AS peer_test_c16_pending_release;

COMMIT;
