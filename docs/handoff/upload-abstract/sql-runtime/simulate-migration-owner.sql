\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT oid::regclass AS obj FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND (relname LIKE 'seed_pool_%' OR relname IN ('dashboard_batches','dashboard_deliveries','dashboard_rollover_candidates')) LOOP EXECUTE format('ALTER TABLE %s OWNER TO postgres',item.obj); END LOOP;
 FOR item IN SELECT oid::regprocedure AS obj FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'seed_pool_%' OR proname IN ('claim_briefing_delivery','acknowledge_dashboard_batch','upsert_rollover_candidates')) LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',item.obj); END LOOP;
END $$;
