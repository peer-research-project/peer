\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
ALTER TABLE public.profiles OWNER TO postgres;
ALTER TABLE public.briefing_deliveries OWNER TO postgres;
ALTER TABLE public.private_paper_pools OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION auth.uid() FROM anon,authenticated,service_role;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
SET ROLE supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO dashboard_user;
RESET ROLE;
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION public.touch_updated_at() OWNER TO postgres;
SET ROLE postgres;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO anon,authenticated,service_role;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
RESET ROLE;
