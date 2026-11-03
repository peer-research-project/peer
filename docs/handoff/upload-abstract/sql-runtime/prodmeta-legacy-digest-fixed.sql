\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('66666666-6666-4666-8666-666666666661'),('66666666-6666-4666-8666-666666666662'),('66666666-6666-4666-8666-666666666663');
INSERT INTO public.profiles(user_id,digest_timezone) VALUES('66666666-6666-4666-8666-666666666661','America/Chicago'),('66666666-6666-4666-8666-666666666662','UTC'),('66666666-6666-4666-8666-666666666663','Not/A_Zone');
INSERT INTO public.briefing_deliveries(user_id,delivered_at,channel,item_ids,payload) VALUES
('66666666-6666-4666-8666-666666666661',(((now() AT TIME ZONE 'America/Chicago')::date + time '00:15') AT TIME ZONE 'America/Chicago'),'email',ARRAY['legacy1'],'{"old":1}'),
('66666666-6666-4666-8666-666666666661',(((now() AT TIME ZONE 'America/Chicago')::date + time '00:30') AT TIME ZONE 'America/Chicago'),'inapp',ARRAY['legacy2'],'{"old":2}');
DO $$ DECLARE tokyo uuid:='77777777-7777-4777-8777-777777777777'; chicago uuid:='66666666-6666-4666-8666-666666666661'; other uuid:='66666666-6666-4666-8666-666666666662'; bad uuid:='66666666-6666-4666-8666-666666666663'; t date:=(now() AT TIME ZONE 'Asia/Tokyo')::date; c date:=(now() AT TIME ZONE 'America/Chicago')::date; invalid_failed boolean:=false; absent_failed boolean:=false; BEGIN
 IF EXISTS(SELECT 1 FROM public.claim_briefing_delivery(tokyo,t::text,'both',ARRAY['new'],'{}')) OR public.seed_pool_claim_digest(tokyo,t,'none',0,'email',ARRAY['new'],'{}')->>'status'<>'conflict' THEN RAISE EXCEPTION 'Tokyo legacy was not protected'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_briefing_delivery(chicago,c::text,'email',ARRAY['new'],'{}')) OR public.seed_pool_claim_digest(chicago,c,'none',0,'email',ARRAY['new'],'{}')->>'status'<>'conflict' THEN RAISE EXCEPTION 'Chicago legacy was not protected'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.claim_briefing_delivery(chicago,(c-1)::text,'email',ARRAY['new'],'{}')) THEN RAISE EXCEPTION 'different local day improperly blocked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.claim_briefing_delivery(other,c::text,'email',ARRAY['new'],'{}')) THEN RAISE EXCEPTION 'other owner improperly blocked'; END IF;
 BEGIN PERFORM public.claim_briefing_delivery(bad,c::text,'email',ARRAY['new'],'{}'); EXCEPTION WHEN invalid_parameter_value THEN invalid_failed:=true; END;
 BEGIN PERFORM public.claim_briefing_delivery('66666666-6666-4666-8666-666666666664',c::text,'email',ARRAY['new'],'{}'); EXCEPTION WHEN raise_exception THEN absent_failed:=true; END;
 IF NOT invalid_failed OR NOT absent_failed THEN RAISE EXCEPTION 'invalid or missing profile did not fail closed'; END IF;
 IF (SELECT count(*) FROM public.briefing_deliveries WHERE user_id=chicago AND local_date IS NULL)<>2 THEN RAISE EXCEPTION 'legacy rows modified'; END IF;
 RAISE NOTICE 'Tokyo Chicago direct/seed claims blocked; different day/owner allowed; invalid/missing timezone fails closed; legacy intact';
END $$;
ROLLBACK;
