-- 00-test-target-guard.sql
-- Target guard for the isolated Supabase test project `peer-test`
-- (project ref cbsbtkvbmvyznerbpmxg). READ ONLY: it never writes.
--
-- Run this, on its own, in the SQL Editor of the project whose browser URL
-- shows /project/cbsbtkvbmvyznerbpmxg, immediately before every mutating step
-- after 01 (in particular before the canonical rollout bundle). It RAISEs, and
-- the editor shows an error, unless ALL of these hold:
--
--   1. The sentinel table peer_test_guard.target exists. Only
--      01-production-shape-baseline.sql creates it, and 01 refuses to run on a
--      database that already has any public table, public function, the
--      private-uploads bucket, migration-ledger rows or a pre-2026-11-03 auth
--      user. Production (ref gdakokshfjqljddlrkrh) has none of the sentinel
--      objects, so on production this check alone fails.
--   2. The sentinel holds exactly one row, naming cbsbtkvbmvyznerbpmxg.
--   3. No auth.users row was created before 2026-11-03 00:00 UTC (the test
--      project did not exist before that day; production has older users).
--      Only min(created_at) is read; no user row is returned.
--   4. supabase_migrations.schema_migrations is absent or empty (production
--      has 11 ledger rows; 01 never creates a ledger).
--   5. The baseline is present (public.private_paper_pools exists), so the
--      bundle has the production-shaped tables it expects.
--
-- On success it returns one JSON row whose "stage" says whether the canonical
-- bundle has already been applied (seed_pool_state present) or not.
-- No psql meta-commands: paste-safe for the Supabase SQL Editor.

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

SELECT jsonb_build_object(
  'guard', 'PASS',
  'project_ref', (SELECT project_ref FROM peer_test_guard.target),
  'sentinel_created_at', (SELECT created_at FROM peer_test_guard.target),
  'stage', CASE WHEN to_regclass('public.seed_pool_state') IS NULL
                THEN 'baseline only: canonical bundle NOT yet applied'
                ELSE 'canonical bundle ALREADY applied (do not rerun it)' END,
  'baseline_deviations', (SELECT coalesce(jsonb_agg(note ORDER BY created_at), '[]'::jsonb)
                          FROM peer_test_guard.deviations)
) AS peer_test_target_guard;
