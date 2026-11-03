\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.profiles(user_id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
UPDATE public.profiles SET digest_timezone='Asia/Tokyo' WHERE user_id='11111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id='22222222-2222-4222-8222-222222222222';
DO $$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222'; x uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; y uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; result jsonb; today date; ver text; batch uuid; delivery bigint;
BEGIN
 IF has_function_privilege('authenticated','public.seed_pool_apply(uuid,bigint,uuid[],boolean)','EXECUTE') OR has_function_privilege('anon','public.seed_pool_resolve(uuid,date,timestamptz)','EXECUTE') OR NOT has_function_privilege('service_role','public.seed_pool_apply(uuid,bigint,uuid[],boolean)','EXECUTE') THEN RAISE EXCEPTION 'RPC grant isolation failed'; END IF;
 today:=(now() AT TIME ZONE 'Asia/Tokyo')::date;
 result:=public.seed_pool_stage_asset(a,0,x,'seed:a','doi:a',repeat('a',64),'Invented A','{"topic":["forest"],"object":[],"method":[]}'::jsonb,'{}','seed-pool/a/a.pdf'); IF result->>'status'<>'staging' THEN RAISE EXCEPTION 'stage A %',result; END IF;
 IF public.seed_pool_finish_asset(a,x)->>'status'<>'ready' THEN RAISE EXCEPTION 'finish A'; END IF;
 IF public.seed_pool_stage_asset(b,0,y,'seed:b','doi:b',repeat('b',64),'Invented B','{"topic":["trees"],"object":[],"method":[]}'::jsonb,'{}','seed-pool/b/b.pdf')->>'status'<>'staging' THEN RAISE EXCEPTION 'stage B'; END IF;
 IF public.seed_pool_finish_asset(b,y)->>'status'<>'ready' THEN RAISE EXCEPTION 'finish B'; END IF;
 IF public.seed_pool_apply(a,0,ARRAY[y],false)->>'status'<>'invalid_seed' THEN RAISE EXCEPTION 'cross owner asset accepted'; END IF;
 result:=public.seed_pool_apply(a,0,ARRAY[x],false); IF result->>'status'<>'ok' OR (result->>'effectiveLocalDate')::date<>today THEN RAISE EXCEPTION 'first seed not immediate %',result; END IF; ver:=result->>'version';
 IF public.seed_pool_apply(a,0,ARRAY[x],false)->>'status'<>'stale_revision' THEN RAISE EXCEPTION 'CAS failed'; END IF;
 result:=public.seed_pool_apply(a,1,ARRAY[]::uuid[],false); IF result->>'status'<>'ok' OR (result->>'effectiveLocalDate')::date<>today+1 THEN RAISE EXCEPTION 'pending date %',result; END IF;
 IF (public.seed_pool_resolve(a,today,null)->'snapshot'->>'version')<>ver THEN RAISE EXCEPTION 'active changed today'; END IF;
 IF jsonb_array_length(public.seed_pool_resolve(a,today+1,null)->'snapshot'->'seeds')<>0 THEN RAISE EXCEPTION 'tomorrow removal not visible'; END IF;
 IF public.seed_pool_apply(a,2,ARRAY[x],false)->>'status'<>'ok' THEN RAISE EXCEPTION 'replace pending'; END IF;
 IF public.seed_pool_apply(a,3,ARRAY[x],true)->>'status'<>'ok' THEN RAISE EXCEPTION 'undo pending'; END IF;
 IF (public.seed_pool_resolve(a,today+1,null)->'snapshot'->>'version')<>ver THEN RAISE EXCEPTION 'undo did not restore active'; END IF;
 IF public.seed_pool_record_feed_served(b,(now() AT TIME ZONE 'America/Chicago')::date,'none',0)->>'status'<>'recorded' THEN RAISE EXCEPTION 'observe'; END IF;
 result:=public.seed_pool_apply(b,0,ARRAY[y],false); IF (result->>'effectiveLocalDate')::date<>(now() AT TIME ZONE 'America/Chicago')::date+1 THEN RAISE EXCEPTION 'observed first seed changed today %',result; END IF;
 result:=public.seed_pool_put_prepared_batch(a,today,ver,0,'v','[]','[]'); IF result->>'status'<>'prepared' THEN RAISE EXCEPTION 'prepare %',result; END IF; batch:=(result->>'batchId')::uuid;
 IF public.seed_pool_ack_batch(a,today,batch,ver,0)->>'status'<>'not_served' THEN RAISE EXCEPTION 'prepared ack'; END IF;
 IF public.seed_pool_mark_batch_served(a,today,batch,ver,0)->>'status'<>'served' THEN RAISE EXCEPTION 'serve'; END IF;
 result:=public.seed_pool_claim_digest(a,today,ver,0,'email',ARRAY['invented'],'{"items":["invented"]}'); IF result->>'status'<>'claimed' THEN RAISE EXCEPTION 'claim digest %',result; END IF; delivery:=(result->>'deliveryId')::bigint;
 IF public.seed_pool_put_private_pool(a,today,ver,0,'invented','{"derived":true}')->>'status'<>'stored' THEN RAISE EXCEPTION 'private pool'; END IF;
 result:=public.seed_pool_forget(a,4,x); IF result->>'status'<>'revoked' OR (result->>'revocationGeneration')::int<>1 THEN RAISE EXCEPTION 'forget %',result; END IF;
 IF EXISTS(SELECT 1 FROM public.private_paper_pools WHERE owner_id=a) OR EXISTS(SELECT 1 FROM public.dashboard_batches WHERE id=batch) THEN RAISE EXCEPTION 'forgotten cache/batch survived'; END IF;
 IF EXISTS(SELECT 1 FROM public.briefing_deliveries WHERE id=delivery AND (payload<>'{}'::jsonb OR item_ids<>'{}'::text[])) THEN RAISE EXCEPTION 'digest payload survived'; END IF;
 IF public.seed_pool_validate_digest_send(a,today,delivery,ver,0)->>'status'<>'stale_pool' OR public.seed_pool_put_private_pool(a,today,ver,0,'late','{}')->>'status'<>'stale_pool' OR public.seed_pool_ack_batch(a,today,batch,ver,0)->>'status'<>'stale_pool' THEN RAISE EXCEPTION 'forget fence failed'; END IF;
 IF public.seed_pool_finish_asset(a,x)->>'status'<>'revoked' THEN RAISE EXCEPTION 'revoked writer republished'; END IF;
 IF (public.seed_pool_editor(a)->'cleanupPending') @> jsonb_build_array(jsonb_build_object('id',x::text)) IS NOT TRUE THEN RAISE EXCEPTION 'missing cleanup tombstone'; END IF;
 RAISE NOTICE 'lifecycle and fence assertions passed';
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.seed_pool_assets)<>1 OR EXISTS(SELECT 1 FROM public.seed_pool_assets WHERE owner_id<>'22222222-2222-4222-8222-222222222222'::uuid) THEN RAISE EXCEPTION 'RLS owner isolation failed'; END IF; RAISE NOTICE 'authenticated owner RLS passed'; END $$;
ROLLBACK;
