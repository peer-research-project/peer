\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('44444444-4444-4444-8444-444444444444'),('55555555-5555-4555-8555-555555555555');
INSERT INTO public.profiles(user_id) VALUES ('44444444-4444-4444-8444-444444444444'),('55555555-5555-4555-8555-555555555555');
UPDATE public.profiles SET digest_timezone='Asia/Tokyo' WHERE user_id IN ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555');
DO $$ DECLARE a uuid:='44444444-4444-4444-8444-444444444444'; b uuid:='55555555-5555-4555-8555-555555555555'; x uuid:='44444444-4444-4444-8444-444444444441'; y uuid:='55555555-5555-4555-8555-555555555551'; today date:=(now() AT TIME ZONE 'Asia/Tokyo')::date; result jsonb; claimed jsonb; BEGIN
 PERFORM public.seed_pool_stage_asset(a,0,x,'seed:a','doi:a',repeat('a',64),'Invented','{"topic":["forest"]}','{}','local'); PERFORM public.seed_pool_finish_asset(a,x);
 INSERT INTO public.dashboard_batches(owner_id,local_date,status,served_at) VALUES(a,(today-1)::text,'served',now());
 result:=public.seed_pool_apply(a,0,ARRAY[x],false); IF (result->>'effectiveLocalDate')::date<>today+1 THEN RAISE EXCEPTION 'legacy served batch did not protect today %',result; END IF;
 PERFORM public.seed_pool_stage_asset(b,0,y,'seed:b','doi:b',repeat('b',64),'Invented','{"topic":["forest"]}','{}','local'); PERFORM public.seed_pool_finish_asset(b,y);
 result:=public.seed_pool_apply(b,0,ARRAY[y],false); IF (result->>'effectiveLocalDate')::date<>today THEN RAISE EXCEPTION 'active setup %',result; END IF;
 UPDATE public.seed_pool_assets SET created_at=now()-interval '31 days' WHERE id=y;
 claimed:=public.seed_pool_claim_cleanup(100); IF claimed @> jsonb_build_array(jsonb_build_object('id',y::text)) THEN RAISE EXCEPTION 'active 31-day seed incorrectly claimed for deletion'; END IF;
 IF (SELECT status FROM public.seed_pool_assets WHERE id=y)<>'ready' THEN RAISE EXCEPTION 'active 31-day seed revoked'; END IF;
 RAISE NOTICE 'legacy served boundary and active 31-day retention passed';
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN r:=public.seed_pool_resolve('55555555-5555-4555-8555-555555555555',null,null); IF r->>'status'<>'ready' THEN RAISE EXCEPTION 'service RPC denied or wrong status %',r; END IF; RAISE NOTICE 'service role resolve RPC passed'; END $$;
ROLLBACK;
