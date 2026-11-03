\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
DO $$ DECLARE u uuid:='77777777-7777-4777-8777-777777777777'; y uuid:='88888888-8888-4888-8888-888888888888'; asset uuid:='77777777-7777-4777-8777-777777777771'; r jsonb; today date:=(now() AT TIME ZONE 'Asia/Tokyo')::date; BEGIN
 IF EXISTS((SELECT * FROM public.local_test_before EXCEPT ALL SELECT id,user_id,delivered_at,channel,item_ids,payload,opened_at,created_at FROM public.briefing_deliveries) UNION ALL (SELECT id,user_id,delivered_at,channel,item_ids,payload,opened_at,created_at FROM public.briefing_deliveries EXCEPT ALL SELECT * FROM public.local_test_before)) THEN RAISE EXCEPTION 'legacy delivery fields changed'; END IF;
 IF (SELECT count(*) FROM public.briefing_deliveries)<>3 OR EXISTS(SELECT 1 FROM public.briefing_deliveries WHERE local_date IS NOT NULL) THEN RAISE EXCEPTION 'legacy rows lost or backfilled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.private_paper_pools WHERE owner_id=y AND scope_key='unrelated' AND payload='{"fixture":"private"}') THEN RAISE EXCEPTION 'unrelated private data lost'; END IF;
 PERFORM public.seed_pool_stage_asset(u,0,asset,'seed','doi:seed',repeat('c',64),'Invented','{"topic":["forest"]}','{}','local'); PERFORM public.seed_pool_finish_asset(u,asset);
 r:=public.seed_pool_apply(u,0,ARRAY[asset],false); IF (r->>'effectiveLocalDate')::date<>today+1 THEN RAISE EXCEPTION 'legacy digest failed to protect owner day %',r; END IF;
 BEGIN INSERT INTO public.briefing_deliveries(user_id,local_date,channel,payload) VALUES(y,'2040-02-03','email','{}'),(y,'2040-02-03','inapp','{}'); RAISE EXCEPTION 'duplicate non-null claims accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 IF public.claim_briefing_delivery(y,'2040-02-04','email',ARRAY['first'],'{"fixture":"first"}') IS NULL THEN RAISE EXCEPTION 'claim unexpectedly empty'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_briefing_delivery(y,'2040-02-04','email',ARRAY['second'],'{"fixture":"second"}')) THEN RAISE EXCEPTION 'duplicate claim unexpectedly returned'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.briefing_deliveries WHERE user_id=y AND local_date='2040-02-04' AND payload='{"fixture":"first"}') THEN RAISE EXCEPTION 'duplicate claim replaced original'; END IF;
 RAISE NOTICE 'legacy duplicates byte-values preserved; no backfill; owner day protected; partial index and claim dedupe passed';
END $$;
