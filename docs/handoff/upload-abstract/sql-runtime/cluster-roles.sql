\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
END $$;
