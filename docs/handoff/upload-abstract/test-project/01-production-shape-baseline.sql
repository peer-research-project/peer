-- 01-production-shape-baseline.sql
-- One-shot baseline for the EMPTY isolated Supabase test project `peer-test`
-- (project ref cbsbtkvbmvyznerbpmxg). Run ONCE in that project's SQL Editor as
-- role `postgres`. Everything runs in one transaction: any error rolls the
-- whole file back and leaves the project empty again.
--
-- Goal: reproduce PRODUCTION's (ref gdakokshfjqljddlrkrh) current public schema
-- as of the read-only exports captured 2026-11-03, so the canonical four-file
-- rollout bundle can be rehearsed on real Supabase exactly as it will run on
-- production.
--
-- Evidence precedence (see README.md for the full list):
--   [EXPORT]      exact catalog metadata from production-schema-metadata.json,
--                 production-security-metadata.json and
--                 production-sequence-metadata.json (profiles,
--                 private_paper_pools, briefing_deliveries, the
--                 briefing_deliveries id sequence, touch_updated_at and its
--                 trigger). Metadata-verified by 02/03/04 + compare-metadata.py.
--   [INVENTORY]   names only, from production-inventory-readonly.json (9
--                 tables, 19 policies, 2 triggers, 3 functions, 1 bucket).
--   [BEST-EFFORT] columns, constraints, indexes, grants and function bodies
--                 taken from the repo source that created them
--                 (web/supabase/schema.sql and web/supabase/migrations/*.sql).
--                 NOT metadata-verified.
--
-- Deliberately NOT created (absent on production per the inventory):
--   dashboard_* tables, briefing_deliveries.local_date, any seed_pool_* object,
--   usage_events, company_spend_* tables, dashboard_prepare_jobs, the
--   supabase_migrations ledger. No storage.objects policies (the inventory
--   lists none, and the bucket migration says "no storage.objects policies on
--   purpose"). No user rows, no auth rows, no application rows.
--
-- Privileges are written explicitly (GRANT ALL ... TO anon, authenticated,
-- service_role, then the revokes each migration made) so the result does not
-- depend on whether this new project carries Supabase's legacy default
-- privileges. 07-verify-default-privileges.sql shows whether it does.
--
-- No psql meta-commands: paste-safe for the Supabase SQL Editor.

BEGIN;

-- -- 0. Refuse to run anywhere but an empty test project ------------------
DO $pre$
DECLARE
  v_count  bigint;
  v_names  text;
  v_oldest timestamptz;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'REFUSED: run as role postgres (current_user=%). Production objects are owned by postgres.', current_user;
  END IF;

  IF to_regnamespace('peer_test_guard') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSED: sentinel schema peer_test_guard already exists; this baseline is single-shot and has already run here.';
  END IF;

  SELECT count(*), string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_count, v_names
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'REFUSED: public schema is not empty and the sentinel is absent (% relations: %). Production has public.private_paper_pools, public.briefing_deliveries, ... This must only run on the EMPTY peer-test project.', v_count, v_names;
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'REFUSED: public schema already has % functions; expected an empty project.', v_count;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'private-uploads') THEN
    RAISE EXCEPTION 'REFUSED: storage bucket private-uploads already exists (production has it); expected an empty project.';
  END IF;

  SELECT min(created_at) INTO v_oldest FROM auth.users;
  IF v_oldest IS NOT NULL AND v_oldest < timestamptz '2026-11-03 00:00:00+00' THEN
    RAISE EXCEPTION 'REFUSED: auth.users holds an account created before 2026-11-03 UTC; the peer-test project did not exist then.';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'REFUSED: supabase_migrations.schema_migrations has % rows (production has 11).', v_count;
    END IF;
  END IF;
END
$pre$;

-- -- 1. Sentinel (outside public, so public stays identical to production) -
-- Not in an exposed Data API schema, RLS on, no privileges for API roles.
CREATE SCHEMA peer_test_guard;
REVOKE ALL ON SCHEMA peer_test_guard FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE peer_test_guard.target (
  project_ref text PRIMARY KEY CHECK (project_ref = 'cbsbtkvbmvyznerbpmxg'),
  purpose     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE peer_test_guard.deviations (
  note       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE peer_test_guard.target ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_test_guard.deviations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON peer_test_guard.target, peer_test_guard.deviations
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO peer_test_guard.target (project_ref, purpose)
VALUES ('cbsbtkvbmvyznerbpmxg',
        'Isolated Peer rollout rehearsal target. Created by 01-production-shape-baseline.sql. Never production.');

-- -- 2. public.profiles  [EXPORT] -----------------------------------------
-- Exact exported columns, types, nullability, defaults and ordinals. Ordinals
-- 36..39 are dropped columns on production (the plan/trial columns added by
-- 20260904000200 and dropped by 20261007000000); compare-metadata.py compares
-- ordinal_position, so feed_intent must land on ordinal 40. Placeholders are
-- added and dropped to reproduce that.
CREATE TABLE public.profiles (
  user_id                  uuid NOT NULL,
  display_name             text,
  research_topics          text[] NOT NULL DEFAULT '{}'::text[],
  preferred_methods        text[] NOT NULL DEFAULT '{}'::text[],
  preferred_venues         text[] NOT NULL DEFAULT '{}'::text[],
  location_preferences     text[] NOT NULL DEFAULT '{}'::text[],
  career_stage             text,
  industry_vs_academia     text,
  phd_year                 integer,
  created_at               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at               timestamp with time zone NOT NULL DEFAULT now(),
  digest_enabled           boolean NOT NULL DEFAULT true,
  digest_hour_local        smallint NOT NULL DEFAULT 8,
  digest_timezone          text NOT NULL DEFAULT 'UTC'::text,
  digest_channel           text NOT NULL DEFAULT 'inapp'::text,
  digest_frequency         text NOT NULL DEFAULT 'daily'::text,
  school                   text,
  lab                      text,
  current_project          text,
  current_challenges       text,
  disliked_topics          text[] NOT NULL DEFAULT '{}'::text[],
  preference_ledger        jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_focus               text NOT NULL DEFAULT 'balanced'::text,
  feed_freshness           text NOT NULL DEFAULT 'week'::text,
  paper_count              smallint NOT NULL DEFAULT 10,
  feed_source_mix          text NOT NULL DEFAULT 'balanced'::text,
  feed_importance          text NOT NULL DEFAULT 'new'::text,
  feed_method_mode         text NOT NULL DEFAULT 'relatedOk'::text,
  feed_discovery_mode      text NOT NULL DEFAULT 'core'::text,
  feed_avoid_reviews       boolean NOT NULL DEFAULT true,
  feed_avoid_old_papers    boolean NOT NULL DEFAULT false,
  feed_avoid_broad_surveys boolean NOT NULL DEFAULT true,
  digest_email             text,
  color_theme              text NOT NULL DEFAULT 'system'::text,
  authorised_countries     text[] NOT NULL DEFAULT '{}'::text[],
  plan                     text,
  trial_started_at         timestamp with time zone,
  trial_ends_at            timestamp with time zone,
  plan_updated_at          timestamp with time zone,
  feed_intent              jsonb
);
ALTER TABLE public.profiles
  DROP COLUMN plan,
  DROP COLUMN trial_started_at,
  DROP COLUMN trial_ends_at,
  DROP COLUMN plan_updated_at;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_digest_channel_check CHECK (digest_channel = ANY (ARRAY['inapp'::text, 'email'::text, 'both'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_digest_frequency_check CHECK (digest_frequency = ANY (ARRAY['daily'::text, 'weekdays'::text, 'weekly'::text, 'off'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_digest_hour_local_check CHECK (digest_hour_local >= 0 AND digest_hour_local <= 23);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_discovery_mode_check CHECK (feed_discovery_mode = ANY (ARRAY['core'::text, 'adjacent'::text, 'surprise'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_focus_check CHECK (feed_focus = ANY (ARRAY['tight'::text, 'balanced'::text, 'exploratory'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_freshness_check CHECK (feed_freshness = ANY (ARRAY['today'::text, 'week'::text, 'month'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_importance_check CHECK (feed_importance = ANY (ARRAY['new'::text, 'highlyCited'::text, 'rising'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_method_mode_check CHECK (feed_method_mode = ANY (ARRAY['mustMatch'::text, 'relatedOk'::text, 'any'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_feed_source_mix_check CHECK (feed_source_mix = ANY (ARRAY['balanced'::text, 'preprints'::text, 'published'::text, 'code'::text, 'web'::text]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_paper_count_check CHECK (paper_count = ANY (ARRAY[5, 10]));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [BEST-EFFORT] column comment from 20260922010000_profile_feed_intent.sql.
COMMENT ON COLUMN public.profiles.feed_intent IS
  'Versioned user-declared feed intent; null means legacy omitted, never explicit-empty.';

-- -- 3. public.private_paper_pools  [EXPORT] ------------------------------
CREATE TABLE public.private_paper_pools (
  owner_id   uuid NOT NULL,
  scope_key  text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.private_paper_pools ADD CONSTRAINT private_paper_pools_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.private_paper_pools ADD CONSTRAINT private_paper_pools_pkey PRIMARY KEY (owner_id, scope_key);

-- -- 4. public.briefing_deliveries  [EXPORT] ------------------------------
-- bigserial (as schema.sql created it) yields exactly the exported default
-- nextval('briefing_deliveries_id_seq'::regclass), a bigint sequence 1..2^63-1
-- with cache 1 and no cycle, OWNED BY the column, owner postgres, so
-- pg_get_serial_sequence() resolves it as in the sequence export.
CREATE TABLE public.briefing_deliveries (
  id           bigserial NOT NULL,
  user_id      uuid NOT NULL,
  delivered_at timestamp with time zone NOT NULL DEFAULT now(),
  channel      text NOT NULL,
  item_ids     text[] NOT NULL DEFAULT '{}'::text[],
  payload      jsonb NOT NULL,
  opened_at    timestamp with time zone,
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.briefing_deliveries ADD CONSTRAINT briefing_deliveries_channel_check CHECK (channel = ANY (ARRAY['inapp'::text, 'email'::text, 'both'::text]));
ALTER TABLE public.briefing_deliveries ADD CONSTRAINT briefing_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.briefing_deliveries ADD CONSTRAINT briefing_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX briefing_deliveries_user_time_idx ON public.briefing_deliveries USING btree (user_id, delivered_at DESC);

-- -- 5. public.saved_items  [BEST-EFFORT: web/supabase/schema.sql] --------
CREATE TABLE public.saved_items (
  user_id   uuid not null references auth.users(id) on delete cascade,
  item_id   text not null,
  item_kind text not null check (item_kind in ('paper','event','job')),
  payload   jsonb not null,
  saved_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);
CREATE INDEX saved_items_user_kind_idx
  ON public.saved_items (user_id, item_kind, saved_at desc);

-- -- 6. public.read_items  [BEST-EFFORT: web/supabase/schema.sql] ---------
CREATE TABLE public.read_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
CREATE INDEX read_items_user_day_idx
  ON public.read_items (user_id, read_at desc);

-- -- 7. public.feedback_events  [BEST-EFFORT: web/supabase/schema.sql] ----
CREATE TABLE public.feedback_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  item_kind  text not null check (item_kind in ('paper','event','job')),
  feedback   text not null check (feedback in ('liked','saved','notInterested','moreLikeThis')),
  payload    jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX feedback_events_user_time_idx
  ON public.feedback_events (user_id, created_at desc);

-- -- 8. public.opportunity_pools  [BEST-EFFORT: 20260727000000] -----------
-- Still PRESENT on production (20261012063749_drop_opportunity_pools.sql was
-- never applied there), so it is reproduced here.
CREATE TABLE public.opportunity_pools (
  key        text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
CREATE INDEX opportunity_pools_created_at_idx
  ON public.opportunity_pools (created_at desc);

-- -- 9. public.usage_counters  [BEST-EFFORT: 20260904000000] --------------
CREATE TABLE public.usage_counters (
  key            text primary key,
  value          bigint not null default 0,
  window_ends_at timestamptz,
  updated_at     timestamptz not null default now()
);
CREATE INDEX usage_counters_window_ends_at_idx
  ON public.usage_counters (window_ends_at);

-- -- 10. public.private_decisions  [BEST-EFFORT: 20260924000400] ----------
CREATE TABLE public.private_decisions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, scope_key)
);

-- -- 11. Row level security: all 9 tables have RLS on, none forced --------
-- [EXPORT] for profiles / private_paper_pools / briefing_deliveries
-- (relrowsecurity=true, relforcerowsecurity=false); [BEST-EFFORT] for the rest
-- (each creating source enables RLS).
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_paper_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefing_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.read_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_pools   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_decisions   ENABLE ROW LEVEL SECURITY;

-- -- 12. Policies: the 19 inventory names ---------------------------------
-- [EXPORT] exact cmd/roles/qual/with_check for profiles, private_paper_pools,
-- briefing_deliveries.
CREATE POLICY "users read own briefings" ON public.briefing_deliveries FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "users update own briefings" ON public.briefing_deliveries FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "owners read their private paper pools" ON public.private_paper_pools FOR SELECT TO public USING ((auth.uid() = owner_id));
CREATE POLICY "owners update their private paper pools" ON public.private_paper_pools FOR UPDATE TO public USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "owners write their private paper pools" ON public.private_paper_pools FOR INSERT TO public WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
-- [INVENTORY names, BEST-EFFORT bodies from schema.sql / 20260924000400].
CREATE POLICY "users read own saved" ON public.saved_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own saved" ON public.saved_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own saved" ON public.saved_items FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "users update own saved" ON public.saved_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own reads" ON public.read_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own reads" ON public.read_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own reads" ON public.read_items FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "users update own reads" ON public.read_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own feedback" ON public.feedback_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own feedback" ON public.feedback_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners read their private decisions" ON public.private_decisions FOR SELECT USING (auth.uid() = owner_id);
-- opportunity_pools and usage_counters: no policies (service role only).

-- -- 13. Table privileges -------------------------------------------------
-- Supabase's legacy default privileges give anon, authenticated and
-- service_role ALL on every table postgres creates in public; production's
-- exported grants show exactly that (7 information_schema privilege types per
-- role) except where a migration revoked. Written explicitly here.
GRANT ALL ON TABLE
  public.profiles, public.private_paper_pools, public.briefing_deliveries,
  public.saved_items, public.read_items, public.feedback_events,
  public.opportunity_pools, public.usage_counters, public.private_decisions
  TO anon, authenticated, service_role;

-- [EXPORT] profiles: anon and authenticated hold no table-level INSERT/UPDATE
-- (20260904000200 as corrected by profile_plan_column_grants).
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
-- [BEST-EFFORT, not in any export] authenticated's column-level INSERT/UPDATE:
-- the corrected 20260904000200 granted every then-existing non-plan column,
-- 20260922010000 added feed_intent, and dropping the plan columns removed
-- theirs. Net effect: every current column.
GRANT INSERT (user_id, display_name, research_topics, preferred_methods,
  preferred_venues, location_preferences, career_stage, industry_vs_academia,
  phd_year, created_at, updated_at, digest_enabled, digest_hour_local,
  digest_timezone, digest_channel, digest_frequency, school, lab,
  current_project, current_challenges, disliked_topics, preference_ledger,
  feed_focus, feed_freshness, paper_count, feed_source_mix, feed_importance,
  feed_method_mode, feed_discovery_mode, feed_avoid_reviews,
  feed_avoid_old_papers, feed_avoid_broad_surveys, digest_email, color_theme,
  authorised_countries, feed_intent)
  ON public.profiles TO authenticated;
GRANT UPDATE (user_id, display_name, research_topics, preferred_methods,
  preferred_venues, location_preferences, career_stage, industry_vs_academia,
  phd_year, created_at, updated_at, digest_enabled, digest_hour_local,
  digest_timezone, digest_channel, digest_frequency, school, lab,
  current_project, current_challenges, disliked_topics, preference_ledger,
  feed_focus, feed_freshness, paper_count, feed_source_mix, feed_importance,
  feed_method_mode, feed_discovery_mode, feed_avoid_reviews,
  feed_avoid_old_papers, feed_avoid_broad_surveys, digest_email, color_theme,
  authorised_countries, feed_intent)
  ON public.profiles TO authenticated;

-- [BEST-EFFORT] the revokes their creating migrations made.
REVOKE ALL ON TABLE public.opportunity_pools FROM anon, authenticated;
REVOKE ALL ON TABLE public.usage_counters FROM anon, authenticated;

-- -- 14. Sequences --------------------------------------------------------
-- [EXPORT] briefing_deliveries_id_seq: owner postgres, ACL exactly
-- postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres
-- Revoke first so any default-privilege entries are removed, then grant in
-- the exported order (aclitems are appended in grant order).
REVOKE ALL ON SEQUENCE public.briefing_deliveries_id_seq FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.briefing_deliveries_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.briefing_deliveries_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.briefing_deliveries_id_seq TO service_role;
-- [BEST-EFFORT] feedback_events_id_seq: legacy default privileges.
REVOKE ALL ON SEQUENCE public.feedback_events_id_seq FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.feedback_events_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.feedback_events_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.feedback_events_id_seq TO service_role;

-- -- 15. Functions (the 3 inventory functions) ----------------------------
-- [EXPORT] touch_updated_at: exact pg_get_functiondef body, owner postgres,
-- ACL exactly =X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres
CREATE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;

-- [BEST-EFFORT] handle_new_user: body from 20261007000000 (= schema.sql), the
-- version production restored when the plan columns were dropped. ACL mirrors
-- legacy default privileges (not exported).
CREATE FUNCTION public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- [BEST-EFFORT] increment_usage_counter: body and privileges from
-- 20260904000000_usage_counters.sql. Identity arguments match the inventory.
CREATE FUNCTION public.increment_usage_counter(
  p_key            text,
  p_window_ends_at timestamptz default null,
  p_by             bigint default 1
) returns bigint
language plpgsql
as $$
declare
  v_value bigint;
begin
  insert into public.usage_counters as c (key, value, window_ends_at, updated_at)
  values (p_key, p_by, p_window_ends_at, now())
  on conflict (key) do update
    set value          = c.value + excluded.value,
        window_ends_at = coalesce(excluded.window_ends_at, c.window_ends_at),
        updated_at     = now()
  returning c.value into v_value;
  return v_value;
end;
$$;
REVOKE ALL ON FUNCTION public.increment_usage_counter(text, timestamptz, bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_counter(text, timestamptz, bigint)
  TO service_role;

-- -- 16. Triggers (the 2 inventory triggers) ------------------------------
-- [EXPORT] definition: CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE
-- ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at()
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- [INVENTORY name, BEST-EFFORT definition from schema.sql] on auth.users.
-- If this Supabase project refuses triggers on auth.users, the failure is
-- caught (savepoint), recorded in peer_test_guard.deviations and reported by
-- 00 and the final summary row, instead of discarding the whole baseline.
DO $trg$
BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO peer_test_guard.deviations (note)
  VALUES ('on_auth_user_created NOT created: ' || SQLSTATE || ' ' || SQLERRM
          || '. Signing up a test user will not create a profiles row automatically.');
  RAISE WARNING 'on_auth_user_created could not be created: %', SQLERRM;
END
$trg$;

-- -- 17. Storage bucket  [INVENTORY: private-uploads:false:26214400] ------
-- allowed_mime_types is BEST-EFFORT from 20261001000000_private_uploads_bucket.sql
-- (not in the inventory). No storage.objects policies: production has none.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-uploads', 'private-uploads', false, 26214400,
        array['application/pdf', 'application/json', 'text/plain']);

-- -- 18. Final in-transaction self-check ----------------------------------
DO $post$
DECLARE
  v_tables text;
BEGIN
  SELECT string_agg(relname, ',' ORDER BY relname) INTO v_tables
  FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
  IF v_tables IS DISTINCT FROM 'briefing_deliveries,feedback_events,opportunity_pools,private_decisions,private_paper_pools,profiles,read_items,saved_items,usage_counters' THEN
    RAISE EXCEPTION 'Self-check failed: public tables are %', v_tables;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> 19 THEN
    RAISE EXCEPTION 'Self-check failed: expected 19 public policies';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
             AND c.relkind IN ('r','S','i') AND pg_get_userbyid(c.relowner) <> 'postgres') THEN
    RAISE EXCEPTION 'Self-check failed: a public relation is not owned by postgres';
  END IF;
  IF (SELECT array_to_string(relacl, ',') FROM pg_class
      WHERE oid = 'public.briefing_deliveries_id_seq'::regclass)
     IS DISTINCT FROM 'postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres' THEN
    RAISE EXCEPTION 'Self-check failed: briefing_deliveries_id_seq ACL differs from the production export';
  END IF;
  -- Recorded, not fatal: if this project's default privileges dropped the
  -- PUBLIC entry, GRANT ... TO PUBLIC appends it after postgres and the ACL
  -- string order differs from production even though the rights are equal.
  -- 03 + compare-metadata.py will then report "security triggers: DIFFERENT".
  IF (SELECT array_to_string(proacl, ',') FROM pg_proc
      WHERE oid = 'public.touch_updated_at()'::regprocedure)
     IS DISTINCT FROM '=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres' THEN
    INSERT INTO peer_test_guard.deviations (note)
    SELECT 'touch_updated_at ACL is ' || coalesce(array_to_string(proacl, ','), 'DEFAULT')
           || ' (production: =X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres)'
    FROM pg_proc WHERE oid = 'public.touch_updated_at()'::regprocedure;
  END IF;
  IF to_regclass('public.local_test_before') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
                AND (relname LIKE 'dashboard%' OR relname LIKE 'seed_pool%'))
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                AND table_name = 'briefing_deliveries' AND column_name = 'local_date') THEN
    RAISE EXCEPTION 'Self-check failed: an object absent on production was created';
  END IF;
END
$post$;

COMMIT;

SELECT jsonb_build_object(
  'baseline', 'committed',
  'project_ref', (SELECT project_ref FROM peer_test_guard.target),
  'public_tables', (SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class
                    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'),
  'public_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'public_functions', (SELECT jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ORDER BY p.proname)
                       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
  'auth_users_trigger', (SELECT count(*) FROM pg_trigger
                         WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'),
  'bucket', (SELECT jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit)
             FROM storage.buckets WHERE id = 'private-uploads'),
  'deviations', (SELECT coalesce(jsonb_agg(note ORDER BY created_at), '[]'::jsonb)
                 FROM peer_test_guard.deviations)
) AS peer_test_baseline_summary;
