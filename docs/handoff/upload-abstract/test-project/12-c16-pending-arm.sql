-- 12-c16-pending-arm.sql  (W12, rubric unit C16, OPTIONAL cleanup_pending fixture)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY.
--
-- Puts ONE ready seed asset of account A into the state "the storage write of
-- this PDF has not been confirmed yet" (writer_settled = false), so that the
-- next in-app forget of that asset answers 503 {"status":"cleanup_pending"}
-- (web/src/app/api/seed-pool/assets/[id]/route.ts: any returned object with
-- writerSettled !== true -> cleanup_pending) and the Profile page shows its
-- "Pending file cleanup" retry UI.
--
-- ARTIFICIAL STATE: the app itself never leaves a READY asset unsettled
-- (seed_pool_finish_asset sets status 'ready' and writer_settled together).
-- It stands in for the real case it shares a code path with: an asset revoked
-- while its storage write was still uncertain. Release it with
-- 12-c16-pending-release.sql, which calls the app's own seed_pool_finish_asset.
--
-- The chosen asset must NOT be the C15 active seed and should not be in a pool:
-- upload fictional-battery.pdf in Profile -> Seed Paper Pool -> Add PDFs, untick
-- it, do not press Save pool, and use its id here.

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

CREATE SCHEMA IF NOT EXISTS peer_test_w12;
REVOKE ALL ON SCHEMA peer_test_w12 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS peer_test_w12.c16_pending_fixture (
  asset_id    uuid PRIMARY KEY,
  owner_id    uuid NOT NULL,
  armed_at    timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE peer_test_w12.c16_pending_fixture FROM PUBLIC, anon, authenticated, service_role;

DO $arm$
DECLARE
  v_owner_email text := 'REPLACE_WITH_ACCOUNT_A_EMAIL';                   -- EDIT
  v_seed_id     uuid := '00000000-0000-0000-0000-000000000000';           -- EDIT: the battery seed asset id
  v_n           integer;
  v_owner       uuid;
BEGIN
  IF v_owner_email LIKE 'REPLACE%' OR v_seed_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'REFUSED: set v_owner_email and v_seed_id first.';
  END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE lower(email) = lower(v_owner_email);
  IF v_n <> 1 THEN RAISE EXCEPTION 'REFUSED: expected exactly one auth user with that email, found %.', v_n; END IF;
  SELECT id INTO v_owner FROM auth.users WHERE lower(email) = lower(v_owner_email);
  IF EXISTS (SELECT 1 FROM peer_test_w12.c16_pending_fixture) THEN
    RAISE EXCEPTION 'REFUSED: a pending fixture is already armed; run 12-c16-pending-release.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seed_pool_assets
                  WHERE id = v_seed_id AND owner_id = v_owner AND status = 'ready' AND writer_settled) THEN
    RAISE EXCEPTION 'REFUSED: % is not a ready, writer-settled seed asset of account A.', v_seed_id;
  END IF;
  IF to_regclass('peer_test_w12.c15_aged_assets') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM peer_test_w12.c15_aged_assets WHERE asset_id = $1 AND fixture_role = ''active''' INTO v_n USING v_seed_id;
    IF v_n > 0 THEN RAISE EXCEPTION 'REFUSED: % is the C15 active seed; use a different asset.', v_seed_id; END IF;
  END IF;
  INSERT INTO peer_test_w12.c16_pending_fixture (asset_id, owner_id) VALUES (v_seed_id, v_owner);
  UPDATE public.seed_pool_assets SET writer_settled = false
   WHERE id = v_seed_id AND owner_id = v_owner AND status = 'ready';
END
$arm$;

SELECT jsonb_build_object(
  'armed', (SELECT jsonb_agg(jsonb_build_object('asset_id', f.asset_id, 'status', a.status, 'writer_settled', a.writer_settled))
              FROM peer_test_w12.c16_pending_fixture f JOIN public.seed_pool_assets a ON a.id = f.asset_id AND a.owner_id = f.owner_id)
) AS peer_test_c16_pending_arm;

COMMIT;
