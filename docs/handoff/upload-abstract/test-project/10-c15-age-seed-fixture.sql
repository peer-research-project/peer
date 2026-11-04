-- 10-c15-age-seed-fixture.sql  (W12, rubric unit C15)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY. Paste into the peer-test
-- SQL Editor after 00-test-target-guard.sql passed in the same project and the
-- browser address bar shows /project/cbsbtkvbmvyznerbpmxg/.
--
-- What it does, in one transaction:
--   1. Re-runs the 00 target guard (verbatim copy) and refuses unless the
--      canonical bundle is applied (seed_pool_* tables present).
--   2. Creates the private bookkeeping schema peer_test_w12 (no Data API
--      exposure, no grants) and records the ORIGINAL created_at and a features
--      digest of every asset it ages, so 10-c15-rollback.sql can undo it.
--   3. Ages ONE ACTIVE seed asset of account A (an asset referenced by A's
--      current owner-local-date snapshot) to created_at = now() - 31 days.
--   4. Optionally ages ONE ORPHAN control asset of A (status ready, referenced
--      by no live snapshot) the same way. The orphan proves the seed sweep of
--      the purge job actually ran; the active asset proves "in use" protects it.
--
-- What it deliberately does NOT touch:
--   * storage.objects (no purge code reads a seed object's age; see 10-c15-retention.md)
--   * seed_pool_snapshots (no purge code reads a snapshot's age either)
--   * any ordinary reading upload (its 30-day expiry lives inside the bucket
--     object <hash16>.json; SQL cannot edit it -> 10-c15-age-upload-meta.mjs)
--
-- Edit ONLY the two lines marked EDIT inside the $fixture$ block.

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

-- [2] Private bookkeeping (never exposed: not in the Data API schema list, no grants).
CREATE SCHEMA IF NOT EXISTS peer_test_w12;
REVOKE ALL ON SCHEMA peer_test_w12 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS peer_test_w12.c15_aged_assets (
  asset_id            uuid PRIMARY KEY,
  owner_id            uuid NOT NULL,
  fixture_role        text NOT NULL CHECK (fixture_role IN ('active', 'orphan')),
  original_created_at timestamptz NOT NULL,
  features_md5_before text NOT NULL,
  aged_to             timestamptz NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE peer_test_w12.c15_aged_assets FROM PUBLIC, anon, authenticated, service_role;

-- [3] Age the assets.
DO $fixture$
DECLARE
  v_owner_email    text := 'REPLACE_WITH_ACCOUNT_A_EMAIL';   -- EDIT: account A's sign-in email on peer-test
  v_orphan_seed_id uuid := NULL;                             -- EDIT (optional): id of A's ready seed asset that was uploaded but never saved into a pool
  v_age            interval := interval '31 days';
  v_n              integer;
  v_owner          uuid;
  v_zone           text;
  v_today          date;
  v_version        uuid;
  v_active         uuid;
BEGIN
  IF v_owner_email LIKE 'REPLACE%' THEN
    RAISE EXCEPTION 'REFUSED: set v_owner_email to account A''s email first.';
  END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE lower(email) = lower(v_owner_email);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'REFUSED: expected exactly one auth user with that email, found %.', v_n;
  END IF;
  SELECT id INTO v_owner FROM auth.users WHERE lower(email) = lower(v_owner_email);

  IF EXISTS (SELECT 1 FROM peer_test_w12.c15_aged_assets) THEN
    RAISE EXCEPTION 'REFUSED: a C15 fixture is already recorded in peer_test_w12.c15_aged_assets; run 10-c15-rollback.sql first.';
  END IF;

  -- Owner-local today, computed exactly as seed_pool_resolve does.
  SELECT coalesce(nullif(digest_timezone, ''), 'UTC') INTO v_zone FROM public.profiles WHERE user_id = v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUSED: account A has no profiles row (seed pools cannot resolve without one).';
  END IF;
  v_today := (now() AT TIME ZONE v_zone)::date;

  -- The snapshot in force today (same ORDER BY as seed_pool_resolve).
  SELECT version INTO v_version FROM public.seed_pool_snapshots
   WHERE owner_id = v_owner AND NOT superseded AND effective_date <= v_today
   ORDER BY effective_date DESC, created_revision DESC LIMIT 1;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'REFUSED: account A has no snapshot in force on % (%). Save a pool first; a pool saved after A was already served today only takes effect tomorrow.', v_today, v_zone;
  END IF;

  -- One active asset: ready, writer settled, inside today's snapshot.
  SELECT a.id INTO v_active FROM public.seed_pool_assets a
   WHERE a.owner_id = v_owner AND a.status = 'ready' AND a.writer_settled
     AND EXISTS (SELECT 1 FROM public.seed_pool_snapshots s, jsonb_array_elements(s.seeds) e
                  WHERE s.version = v_version AND e->>'id' = a.id::text)
   ORDER BY a.created_at LIMIT 1;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'REFUSED: today''s snapshot % holds no ready seed asset of account A.', v_version;
  END IF;

  INSERT INTO peer_test_w12.c15_aged_assets (asset_id, owner_id, fixture_role, original_created_at, features_md5_before, aged_to)
  SELECT a.id, a.owner_id, 'active', a.created_at, md5(a.features::text), now() - v_age
    FROM public.seed_pool_assets a WHERE a.id = v_active AND a.owner_id = v_owner;
  UPDATE public.seed_pool_assets SET created_at = now() - v_age
   WHERE id = v_active AND owner_id = v_owner AND status = 'ready';

  IF v_orphan_seed_id IS NOT NULL THEN
    IF v_orphan_seed_id = v_active THEN
      RAISE EXCEPTION 'REFUSED: the orphan control must be a different asset from the active one.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.seed_pool_assets
                    WHERE id = v_orphan_seed_id AND owner_id = v_owner AND status = 'ready' AND writer_settled) THEN
      RAISE EXCEPTION 'REFUSED: % is not a ready, writer-settled seed asset of account A.', v_orphan_seed_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.seed_pool_snapshots s, jsonb_array_elements(s.seeds) e
                WHERE s.owner_id = v_owner AND NOT s.superseded AND e->>'id' = v_orphan_seed_id::text) THEN
      RAISE EXCEPTION 'REFUSED: % is referenced by a live (non-superseded) snapshot, so it is not an orphan. Upload a different PDF and do not save it into the pool.', v_orphan_seed_id;
    END IF;
    INSERT INTO peer_test_w12.c15_aged_assets (asset_id, owner_id, fixture_role, original_created_at, features_md5_before, aged_to)
    SELECT a.id, a.owner_id, 'orphan', a.created_at, md5(a.features::text), now() - v_age
      FROM public.seed_pool_assets a WHERE a.id = v_orphan_seed_id AND a.owner_id = v_owner;
    UPDATE public.seed_pool_assets SET created_at = now() - v_age
     WHERE id = v_orphan_seed_id AND owner_id = v_owner AND status = 'ready';
  END IF;
END
$fixture$;

SELECT jsonb_build_object(
  'fixture', 'c15_aged_assets recorded',
  'rows', (SELECT jsonb_agg(jsonb_build_object(
             'asset_id', f.asset_id, 'role', f.fixture_role,
             'original_created_at', f.original_created_at, 'aged_to', f.aged_to,
             'now_created_at', a.created_at, 'status', a.status,
             'features_md5_before', f.features_md5_before)
           ORDER BY f.fixture_role)
           FROM peer_test_w12.c15_aged_assets f
           JOIN public.seed_pool_assets a ON a.id = f.asset_id AND a.owner_id = f.owner_id)
) AS peer_test_c15_fixture;

COMMIT;
