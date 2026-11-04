-- 11-c13-digest-setup.sql  (W12, rubric unit C13)
-- MUTATES peer-test (ref cbsbtkvbmvyznerbpmxg) ONLY. Paste into the peer-test SQL
-- Editor after 00-test-target-guard.sql passed in the same project.
--
-- Prepares ONE owner (account A) for a single local run of
-- GET /api/jobs/dispatch-digests, and keeps every other test account out of it:
--   * backs up digest_enabled / digest_hour_local / digest_frequency /
--     digest_channel of EVERY profile into peer_test_w12.c13_profile_backup;
--   * sets digest_enabled = false for every profile except A (dispatch-digests
--     selects every profile with digest_enabled = true; a run would otherwise
--     write a briefing / observed day for account B and spoil B's C10 first-pool
--     test, see 11-c13-parity.md);
--   * sets A to digest_enabled = true, digest_frequency = 'daily',
--     digest_hour_local = 0 (always "due" once A's local day has started) and
--     digest_channel = v_channel ('both' exercises the email leg WITHOUT sending
--     while RESEND_API_KEY is blank; 'inapp' skips the email leg).
-- Undo with 11-c13-digest-restore.sql.
--
-- Edit ONLY the two lines marked EDIT.

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
CREATE TABLE IF NOT EXISTS peer_test_w12.c13_profile_backup (
  user_id           uuid PRIMARY KEY,
  digest_enabled    boolean NOT NULL,
  digest_hour_local smallint NOT NULL,
  digest_frequency  text NOT NULL,
  digest_channel    text NOT NULL,
  is_target_owner   boolean NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE peer_test_w12.c13_profile_backup FROM PUBLIC, anon, authenticated, service_role;

DO $setup$
DECLARE
  v_owner_email text := 'REPLACE_WITH_ACCOUNT_A_EMAIL';  -- EDIT: account A's sign-in email on peer-test
  v_channel     text := 'both';                          -- EDIT: 'both' (email leg captured, not sent while RESEND_API_KEY is blank) or 'inapp'
  v_n           integer;
  v_owner       uuid;
BEGIN
  IF v_owner_email LIKE 'REPLACE%' THEN
    RAISE EXCEPTION 'REFUSED: set v_owner_email to account A''s email first.';
  END IF;
  IF v_channel NOT IN ('both', 'inapp') THEN
    RAISE EXCEPTION 'REFUSED: v_channel must be both or inapp.';
  END IF;
  SELECT count(*) INTO v_n FROM auth.users WHERE lower(email) = lower(v_owner_email);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'REFUSED: expected exactly one auth user with that email, found %.', v_n;
  END IF;
  SELECT id INTO v_owner FROM auth.users WHERE lower(email) = lower(v_owner_email);
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_owner) THEN
    RAISE EXCEPTION 'REFUSED: account A has no profiles row.';
  END IF;
  IF EXISTS (SELECT 1 FROM peer_test_w12.c13_profile_backup) THEN
    RAISE EXCEPTION 'REFUSED: a C13 backup already exists; run 11-c13-digest-restore.sql first.';
  END IF;

  INSERT INTO peer_test_w12.c13_profile_backup (user_id, digest_enabled, digest_hour_local, digest_frequency, digest_channel, is_target_owner)
  SELECT user_id, digest_enabled, digest_hour_local, digest_frequency, digest_channel, user_id = v_owner
    FROM public.profiles;

  UPDATE public.profiles SET digest_enabled = false WHERE user_id <> v_owner AND digest_enabled;
  UPDATE public.profiles
     SET digest_enabled = true, digest_frequency = 'daily', digest_hour_local = 0, digest_channel = v_channel
   WHERE user_id = v_owner;
END
$setup$;

SELECT jsonb_build_object(
  'setup', 'done',
  'profiles_backed_up', (SELECT count(*) FROM peer_test_w12.c13_profile_backup),
  'profiles_digest_enabled_now', (SELECT count(*) FROM public.profiles WHERE digest_enabled),
  'target_owner_settings', (SELECT jsonb_build_object('digest_enabled', p.digest_enabled, 'digest_frequency', p.digest_frequency,
                                    'digest_hour_local', p.digest_hour_local, 'digest_channel', p.digest_channel,
                                    'digest_timezone', p.digest_timezone, 'digest_email_set', p.digest_email IS NOT NULL)
                              FROM public.profiles p JOIN peer_test_w12.c13_profile_backup b ON b.user_id = p.user_id AND b.is_target_owner)
) AS peer_test_c13_setup;

COMMIT;
