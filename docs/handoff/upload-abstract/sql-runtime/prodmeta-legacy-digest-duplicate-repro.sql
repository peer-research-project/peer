\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
SELECT 'legacy_same_day='||count(*) FROM public.briefing_deliveries WHERE user_id='77777777-7777-4777-8777-777777777777' AND local_date IS NULL AND (delivered_at AT TIME ZONE 'Asia/Tokyo')::date=(now() AT TIME ZONE 'Asia/Tokyo')::date;
SELECT public.seed_pool_claim_digest('77777777-7777-4777-8777-777777777777',(now() AT TIME ZONE 'Asia/Tokyo')::date,'none',0,'email',ARRAY['new'],'{"fixture":"new"}')->>'status' AS unexpected_claim_status;
ROLLBACK;
