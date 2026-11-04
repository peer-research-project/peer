-- 09-post-bundle-role-smoke.sql
-- Optional, after 08 passed. Exercises the REAL Supabase roles anon,
-- authenticated and service_role against the bundle's objects in the peer-test
-- project (cbsbtkvbmvyznerbpmxg) -- the part the local harness could only
-- simulate. It uses a random UUID that matches no user, touches no
-- sequence, and ENDS BY RAISING AN ERROR ON PURPOSE so the whole block rolls
-- back and nothing it did can persist.
--
-- Expected editor result: an ERROR whose message starts with
--   PEER_SMOKE_RESULT (intentional error; everything rolled back):
-- followed by a JSON object. That error is the output. Any OTHER error (for
-- example "REFUSED: ...") means the smoke did not run.
--
-- Expected JSON values:
--   anon_*                          denied
--   authenticated_execute_*         denied
--   authenticated_select_seed_pool_state       allowed rows=0
--   authenticated_select_dashboard_batches     allowed rows=0
--   authenticated_insert_seed_pool_state       denied
--   authenticated_select_seed_pool_observed_days denied
--   service_role_seed_pool_resolve  {"status": "unavailable", ...}  (no profile for the random id)
--   service_role_select_*           allowed rows=0 (rows=N if test data exists)
--   service_role_claim_briefing_delivery_unknown_owner  error ... (fails closed: no profile)
DO $smoke$
DECLARE
  r    jsonb := '{}'::jsonb;
  v    jsonb;
  n    bigint;
  tbl  text;
  fake uuid := gen_random_uuid();
BEGIN
  IF to_regclass('peer_test_guard.target') IS NULL
     OR NOT EXISTS (SELECT 1 FROM peer_test_guard.target WHERE project_ref = 'cbsbtkvbmvyznerbpmxg') THEN
    RAISE EXCEPTION 'REFUSED: sentinel absent; this is not the peer-test project.';
  END IF;
  IF to_regclass('public.seed_pool_state') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: canonical bundle not applied yet.';
  END IF;

  -- -- anon --
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.seed_pool_resolve(fake, NULL, NULL);
    r := r || jsonb_build_object('anon_execute_seed_pool_resolve', 'ALLOWED (unexpected)');
  EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('anon_execute_seed_pool_resolve', 'denied');
            WHEN OTHERS THEN r := r || jsonb_build_object('anon_execute_seed_pool_resolve', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;
  FOREACH tbl IN ARRAY ARRAY['dashboard_batches', 'seed_pool_state', 'seed_pool_observed_days'] LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
      r := r || jsonb_build_object('anon_select_' || tbl, 'ALLOWED (unexpected) rows=' || n);
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('anon_select_' || tbl, 'denied');
              WHEN OTHERS THEN r := r || jsonb_build_object('anon_select_' || tbl, 'error ' || SQLSTATE || ': ' || SQLERRM);
    END;
    RESET ROLE;
  END LOOP;

  -- -- authenticated --
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.seed_pool_resolve(fake, NULL, NULL);
    r := r || jsonb_build_object('authenticated_execute_seed_pool_resolve', 'ALLOWED (unexpected)');
  EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('authenticated_execute_seed_pool_resolve', 'denied');
            WHEN OTHERS THEN r := r || jsonb_build_object('authenticated_execute_seed_pool_resolve', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.claim_briefing_delivery(fake, '2026-11-03', 'inapp', ARRAY[]::text[], '{}'::jsonb);
    r := r || jsonb_build_object('authenticated_execute_claim_briefing_delivery', 'ALLOWED (unexpected)');
  EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('authenticated_execute_claim_briefing_delivery', 'denied');
            WHEN OTHERS THEN r := r || jsonb_build_object('authenticated_execute_claim_briefing_delivery', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;
  FOREACH tbl IN ARRAY ARRAY['seed_pool_state', 'dashboard_batches', 'seed_pool_observed_days'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
      r := r || jsonb_build_object('authenticated_select_' || tbl, 'allowed rows=' || n);
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('authenticated_select_' || tbl, 'denied');
              WHEN OTHERS THEN r := r || jsonb_build_object('authenticated_select_' || tbl, 'error ' || SQLSTATE || ': ' || SQLERRM);
    END;
    RESET ROLE;
  END LOOP;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.seed_pool_state (owner_id) VALUES (fake);
    r := r || jsonb_build_object('authenticated_insert_seed_pool_state', 'ALLOWED (unexpected)');
  EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('authenticated_insert_seed_pool_state', 'denied');
            WHEN OTHERS THEN r := r || jsonb_build_object('authenticated_insert_seed_pool_state', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;

  -- -- service_role --
  BEGIN
    SET LOCAL ROLE service_role;
    v := public.seed_pool_resolve(fake, NULL, NULL);
    r := r || jsonb_build_object('service_role_seed_pool_resolve', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('service_role_seed_pool_resolve', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;
  FOREACH tbl IN ARRAY ARRAY['dashboard_batches', 'dashboard_deliveries', 'dashboard_rollover_candidates',
                             'seed_pool_state', 'seed_pool_observed_days', 'seed_pool_assets', 'seed_pool_snapshots'] LOOP
    BEGIN
      SET LOCAL ROLE service_role;
      EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
      r := r || jsonb_build_object('service_role_select_' || tbl, 'allowed rows=' || n);
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('service_role_select_' || tbl, 'denied');
              WHEN OTHERS THEN r := r || jsonb_build_object('service_role_select_' || tbl, 'error ' || SQLSTATE || ': ' || SQLERRM);
    END;
    RESET ROLE;
  END LOOP;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM * FROM public.claim_briefing_delivery(fake, '2026-11-03', 'inapp', ARRAY[]::text[], '{}'::jsonb);
    r := r || jsonb_build_object('service_role_claim_briefing_delivery_unknown_owner', 'returned without error (unexpected: no profile exists)');
  EXCEPTION WHEN OTHERS THEN
    r := r || jsonb_build_object('service_role_claim_briefing_delivery_unknown_owner', 'error ' || SQLSTATE || ': ' || SQLERRM);
  END;
  RESET ROLE;

  RAISE EXCEPTION 'PEER_SMOKE_RESULT (intentional error; everything rolled back): %', r::text;
END
$smoke$;
