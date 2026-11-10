\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(__deleted_1 text,id uuid PRIMARY KEY);
ALTER TABLE auth.users DROP COLUMN __deleted_1;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE SEQUENCE public.briefing_deliveries_id_seq;
CREATE TABLE public."profiles" (
  "user_id" uuid NOT NULL,
  "display_name" text,
  "research_topics" text[] NOT NULL DEFAULT '{}'::text[],
  "preferred_methods" text[] NOT NULL DEFAULT '{}'::text[],
  "preferred_venues" text[] NOT NULL DEFAULT '{}'::text[],
  "location_preferences" text[] NOT NULL DEFAULT '{}'::text[],
  "career_stage" text,
  "industry_vs_academia" text,
  "phd_year" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "digest_enabled" boolean NOT NULL DEFAULT true,
  "digest_hour_local" smallint NOT NULL DEFAULT 8,
  "digest_timezone" text NOT NULL DEFAULT 'UTC'::text,
  "digest_channel" text NOT NULL DEFAULT 'inapp'::text,
  "digest_frequency" text NOT NULL DEFAULT 'daily'::text,
  "school" text,
  "lab" text,
  "current_project" text,
  "current_challenges" text,
  "disliked_topics" text[] NOT NULL DEFAULT '{}'::text[],
  "preference_ledger" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "feed_focus" text NOT NULL DEFAULT 'balanced'::text,
  "feed_freshness" text NOT NULL DEFAULT 'week'::text,
  "paper_count" smallint NOT NULL DEFAULT 10,
  "feed_source_mix" text NOT NULL DEFAULT 'balanced'::text,
  "feed_importance" text NOT NULL DEFAULT 'new'::text,
  "feed_method_mode" text NOT NULL DEFAULT 'relatedOk'::text,
  "feed_discovery_mode" text NOT NULL DEFAULT 'core'::text,
  "feed_avoid_reviews" boolean NOT NULL DEFAULT true,
  "feed_avoid_old_papers" boolean NOT NULL DEFAULT false,
  "feed_avoid_broad_surveys" boolean NOT NULL DEFAULT true,
  "digest_email" text,
  "color_theme" text NOT NULL DEFAULT 'system'::text,
  "authorised_countries" text[] NOT NULL DEFAULT '{}'::text[],
  "__deleted_36" text,
  "__deleted_37" text,
  "__deleted_38" text,
  "__deleted_39" text,
  "feed_intent" jsonb
);
ALTER TABLE public."profiles" DROP COLUMN "__deleted_36";
ALTER TABLE public."profiles" DROP COLUMN "__deleted_37";
ALTER TABLE public."profiles" DROP COLUMN "__deleted_38";
ALTER TABLE public."profiles" DROP COLUMN "__deleted_39";
CREATE TABLE public."private_paper_pools" (
  "owner_id" uuid NOT NULL,
  "scope_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public."briefing_deliveries" (
  "id" bigint NOT NULL DEFAULT nextval('briefing_deliveries_id_seq'::regclass),
  "user_id" uuid NOT NULL,
  "delivered_at" timestamp with time zone NOT NULL DEFAULT now(),
  "channel" text NOT NULL,
  "item_ids" text[] NOT NULL DEFAULT '{}'::text[],
  "payload" jsonb NOT NULL,
  "opened_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."briefing_deliveries" ADD CONSTRAINT "briefing_deliveries_channel_check" CHECK (channel = ANY (ARRAY['inapp'::text, 'email'::text, 'both'::text]));
ALTER TABLE public."briefing_deliveries" ADD CONSTRAINT "briefing_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE public."briefing_deliveries" ADD CONSTRAINT "briefing_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."private_paper_pools" ADD CONSTRAINT "private_paper_pools_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."private_paper_pools" ADD CONSTRAINT "private_paper_pools_pkey" PRIMARY KEY (owner_id, scope_key);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_digest_channel_check" CHECK (digest_channel = ANY (ARRAY['inapp'::text, 'email'::text, 'both'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_digest_frequency_check" CHECK (digest_frequency = ANY (ARRAY['daily'::text, 'weekdays'::text, 'weekly'::text, 'off'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_digest_hour_local_check" CHECK (digest_hour_local >= 0 AND digest_hour_local <= 23);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_discovery_mode_check" CHECK (feed_discovery_mode = ANY (ARRAY['core'::text, 'adjacent'::text, 'surprise'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_focus_check" CHECK (feed_focus = ANY (ARRAY['tight'::text, 'balanced'::text, 'exploratory'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_freshness_check" CHECK (feed_freshness = ANY (ARRAY['today'::text, 'week'::text, 'month'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_importance_check" CHECK (feed_importance = ANY (ARRAY['new'::text, 'highlyCited'::text, 'rising'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_method_mode_check" CHECK (feed_method_mode = ANY (ARRAY['mustMatch'::text, 'relatedOk'::text, 'any'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_feed_source_mix_check" CHECK (feed_source_mix = ANY (ARRAY['balanced'::text, 'preprints'::text, 'published'::text, 'code'::text, 'web'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_paper_count_check" CHECK (paper_count = ANY (ARRAY[5, 10]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX briefing_deliveries_user_time_idx ON public.briefing_deliveries USING btree (user_id, delivered_at DESC);
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."private_paper_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."briefing_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own briefings" ON public."briefing_deliveries" FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "users update own briefings" ON public."briefing_deliveries" FOR UPDATE TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "owners read their private paper pools" ON public."private_paper_pools" FOR SELECT TO "public" USING ((auth.uid() = owner_id));
CREATE POLICY "owners update their private paper pools" ON public."private_paper_pools" FOR UPDATE TO "public" USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "owners write their private paper pools" ON public."private_paper_pools" FOR INSERT TO "public" WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "users insert own profile" ON public."profiles" FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users read own profile" ON public."profiles" FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "users update own profile" ON public."profiles" FOR UPDATE TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
GRANT DELETE ON public."briefing_deliveries" TO "anon";
GRANT INSERT ON public."briefing_deliveries" TO "anon";
GRANT REFERENCES ON public."briefing_deliveries" TO "anon";
GRANT SELECT ON public."briefing_deliveries" TO "anon";
GRANT TRIGGER ON public."briefing_deliveries" TO "anon";
GRANT TRUNCATE ON public."briefing_deliveries" TO "anon";
GRANT UPDATE ON public."briefing_deliveries" TO "anon";
GRANT DELETE ON public."briefing_deliveries" TO "authenticated";
GRANT INSERT ON public."briefing_deliveries" TO "authenticated";
GRANT REFERENCES ON public."briefing_deliveries" TO "authenticated";
GRANT SELECT ON public."briefing_deliveries" TO "authenticated";
GRANT TRIGGER ON public."briefing_deliveries" TO "authenticated";
GRANT TRUNCATE ON public."briefing_deliveries" TO "authenticated";
GRANT UPDATE ON public."briefing_deliveries" TO "authenticated";
GRANT DELETE ON public."briefing_deliveries" TO "service_role";
GRANT INSERT ON public."briefing_deliveries" TO "service_role";
GRANT REFERENCES ON public."briefing_deliveries" TO "service_role";
GRANT SELECT ON public."briefing_deliveries" TO "service_role";
GRANT TRIGGER ON public."briefing_deliveries" TO "service_role";
GRANT TRUNCATE ON public."briefing_deliveries" TO "service_role";
GRANT UPDATE ON public."briefing_deliveries" TO "service_role";
GRANT DELETE ON public."private_paper_pools" TO "anon";
GRANT INSERT ON public."private_paper_pools" TO "anon";
GRANT REFERENCES ON public."private_paper_pools" TO "anon";
GRANT SELECT ON public."private_paper_pools" TO "anon";
GRANT TRIGGER ON public."private_paper_pools" TO "anon";
GRANT TRUNCATE ON public."private_paper_pools" TO "anon";
GRANT UPDATE ON public."private_paper_pools" TO "anon";
GRANT DELETE ON public."private_paper_pools" TO "authenticated";
GRANT INSERT ON public."private_paper_pools" TO "authenticated";
GRANT REFERENCES ON public."private_paper_pools" TO "authenticated";
GRANT SELECT ON public."private_paper_pools" TO "authenticated";
GRANT TRIGGER ON public."private_paper_pools" TO "authenticated";
GRANT TRUNCATE ON public."private_paper_pools" TO "authenticated";
GRANT UPDATE ON public."private_paper_pools" TO "authenticated";
GRANT DELETE ON public."private_paper_pools" TO "service_role";
GRANT INSERT ON public."private_paper_pools" TO "service_role";
GRANT REFERENCES ON public."private_paper_pools" TO "service_role";
GRANT SELECT ON public."private_paper_pools" TO "service_role";
GRANT TRIGGER ON public."private_paper_pools" TO "service_role";
GRANT TRUNCATE ON public."private_paper_pools" TO "service_role";
GRANT UPDATE ON public."private_paper_pools" TO "service_role";
GRANT DELETE ON public."profiles" TO "anon";
GRANT REFERENCES ON public."profiles" TO "anon";
GRANT SELECT ON public."profiles" TO "anon";
GRANT TRIGGER ON public."profiles" TO "anon";
GRANT TRUNCATE ON public."profiles" TO "anon";
GRANT DELETE ON public."profiles" TO "authenticated";
GRANT REFERENCES ON public."profiles" TO "authenticated";
GRANT SELECT ON public."profiles" TO "authenticated";
GRANT TRIGGER ON public."profiles" TO "authenticated";
GRANT TRUNCATE ON public."profiles" TO "authenticated";
GRANT DELETE ON public."profiles" TO "service_role";
GRANT INSERT ON public."profiles" TO "service_role";
GRANT REFERENCES ON public."profiles" TO "service_role";
GRANT SELECT ON public."profiles" TO "service_role";
GRANT TRIGGER ON public."profiles" TO "service_role";
GRANT TRUNCATE ON public."profiles" TO "service_role";
GRANT UPDATE ON public."profiles" TO "service_role";
GRANT USAGE,SELECT ON SEQUENCE public.briefing_deliveries_id_seq TO service_role;
