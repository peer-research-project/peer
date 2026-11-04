\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
-- R-C11: seed_pool_apply activates strictly after every date label this owner was already
-- served under, whatever timezone served it. D = today in America/Chicago. A UTC serve of
-- label D+1 followed by a switch to Chicago must push the save to D+2, not D+1 (or D).
-- Invented owners only; everything below is rolled back.
BEGIN;
CREATE FUNCTION pg_temp.c11_owner(p_owner uuid, p_zone text, p_asset uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 INSERT INTO auth.users(id) VALUES (p_owner);
 INSERT INTO public.profiles(user_id) VALUES (p_owner);
 UPDATE public.profiles SET digest_timezone=p_zone WHERE user_id=p_owner;
 IF public.seed_pool_stage_asset(p_owner,0,p_asset,'seed:'||p_asset,'doi:'||p_asset,md5(p_asset::text)||md5(p_owner::text),'Invented C11','{"topic":["forest"],"object":[],"method":[]}'::jsonb,'{}','seed-pool/c11/'||p_asset||'.pdf')->>'status'<>'staging' THEN RAISE EXCEPTION 'stage %',p_owner; END IF;
 IF public.seed_pool_finish_asset(p_owner,p_asset)->>'status'<>'ready' THEN RAISE EXCEPTION 'finish %',p_owner; END IF;
END $f$;
CREATE FUNCTION pg_temp.c11_expect(p_label text, p_result jsonb, p_date date) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 IF p_result->>'status' IS DISTINCT FROM 'ok' OR p_result->>'effectiveLocalDate' IS DISTINCT FROM p_date::text THEN
   RAISE EXCEPTION 'R-C11 % expected effective % got %',p_label,p_date,p_result;
 END IF;
END $f$;
DO $$
DECLARE d date:=(now() AT TIME ZONE 'America/Chicago')::date; r jsonb; v text; st public.seed_pool_state%rowtype;
 o1 uuid:='c1100001-0000-4000-8000-000000000001'; a1 uuid:='c11000a1-0000-4000-8000-000000000001';
 o2 uuid:='c1100002-0000-4000-8000-000000000002'; a2 uuid:='c11000a2-0000-4000-8000-000000000002';
 o3 uuid:='c1100003-0000-4000-8000-000000000003'; a3 uuid:='c11000a3-0000-4000-8000-000000000003';
 o4 uuid:='c1100004-0000-4000-8000-000000000004'; a4 uuid:='c11000a4-0000-4000-8000-000000000004';
 o5 uuid:='c1100005-0000-4000-8000-000000000005'; a5 uuid:='c11000a5-0000-4000-8000-000000000005';
 o6 uuid:='c1100006-0000-4000-8000-000000000006'; a6 uuid:='c11000a6-0000-4000-8000-000000000006';
 o7 uuid:='c1100007-0000-4000-8000-000000000007'; a7 uuid:='c11000a7-0000-4000-8000-000000000007';
 o8 uuid:='c1100008-0000-4000-8000-000000000008'; a8 uuid:='c11000a8-0000-4000-8000-000000000008';
 o9 uuid:='c1100009-0000-4000-8000-000000000009'; a9 uuid:='c11000a9-0000-4000-8000-000000000009';
BEGIN
 -- 1. Observed variant (the test-project incident): UTC records feed label D+1, the owner
 --    switches to Chicago and Chicago today D is recorded too; first save -> D+2.
 PERFORM pg_temp.c11_owner(o1,'UTC',a1);
 IF public.seed_pool_record_feed_served(o1,d+1,'none',0)->>'status'<>'recorded' THEN RAISE EXCEPTION 'C11 observe D+1'; END IF;
 UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id=o1;
 IF public.seed_pool_record_feed_served(o1,d,'none',0)->>'status'<>'recorded' THEN RAISE EXCEPTION 'C11 observe D'; END IF;
 r:=public.seed_pool_apply(o1,0,ARRAY[a1],false); PERFORM pg_temp.c11_expect('observed D+1 under UTC',r,d+2);
 v:=r->>'version';
 SELECT * INTO st FROM public.seed_pool_state WHERE owner_id=o1;
 IF st.pending_version::text IS DISTINCT FROM v OR st.pending_effective IS DISTINCT FROM d+2 THEN RAISE EXCEPTION 'C11 pending % %',st.pending_version,st.pending_effective; END IF;
 IF public.seed_pool_resolve(o1,d+1,null)->'snapshot' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'C11 served label D+1 re-ranked'; END IF;
 IF public.seed_pool_resolve(o1,d+2,null)->'snapshot'->>'version' IS DISTINCT FROM v THEN RAISE EXCEPTION 'C11 D+2 not the new pool'; END IF;
 --    A second save while that pool is pending keeps the floor and supersedes the pending one.
 r:=public.seed_pool_apply(o1,1,ARRAY[a1],false); PERFORM pg_temp.c11_expect('second save while pending',r,d+2);
 IF NOT EXISTS(SELECT 1 FROM public.seed_pool_snapshots WHERE version=v::uuid AND superseded) THEN RAISE EXCEPTION 'C11 earlier pending not superseded'; END IF;
 RAISE NOTICE 'R-C11 observed-day variant: UTC label D+1 then Chicago save activates D+2';

 -- 2. Batch variant: UTC served batch D+1 (no seed version), Chicago acknowledged batch D -> D+2.
 PERFORM pg_temp.c11_owner(o2,'UTC',a2);
 INSERT INTO public.dashboard_batches(owner_id,local_date,status,served_at) VALUES(o2,(d+1)::text,'served',now());
 UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id=o2;
 INSERT INTO public.dashboard_batches(owner_id,local_date,status,served_at,acknowledged_at) VALUES(o2,d::text,'acknowledged',now(),now());
 r:=public.seed_pool_apply(o2,0,ARRAY[a2],false); PERFORM pg_temp.c11_expect('served batch D+1 under UTC',r,d+2);
 RAISE NOTICE 'R-C11 batch variant: served UTC batch D+1 then Chicago save activates D+2';

 -- 3. Digest variant: UTC digest claim for label D+1, Chicago feed observed D -> D+2.
 PERFORM pg_temp.c11_owner(o3,'UTC',a3);
 IF (SELECT count(*) FROM public.claim_briefing_delivery(o3,(d+1)::text,'email',ARRAY['c11-digest'],'{"fixture":"c11"}'::jsonb))<>1 THEN RAISE EXCEPTION 'C11 digest claim D+1'; END IF;
 UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id=o3;
 INSERT INTO public.seed_pool_observed_days(owner_id,local_date) VALUES(o3,d);
 r:=public.seed_pool_apply(o3,0,ARRAY[a3],false); PERFORM pg_temp.c11_expect('digest label D+1 under UTC',r,d+2);
 RAISE NOTICE 'R-C11 digest variant: UTC digest label D+1 then Chicago save activates D+2';

 -- 4. First-pool-immediate must not be taken when a later label is already served:
 --    UTC observed D+1 only, Chicago D not yet served, no active pool -> D+2 (not D).
 PERFORM pg_temp.c11_owner(o4,'UTC',a4);
 IF public.seed_pool_record_feed_served(o4,d+1,'none',0)->>'status'<>'recorded' THEN RAISE EXCEPTION 'C11 observe D+1 (4)'; END IF;
 UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id=o4;
 r:=public.seed_pool_apply(o4,0,ARRAY[a4],false); PERFORM pg_temp.c11_expect('immediate blocked by later served label',r,d+2);
 IF public.seed_pool_resolve(o4,d+1,null)->'snapshot' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'C11 served label D+1 re-ranked (4)'; END IF;
 RAISE NOTICE 'R-C11 first-pool-immediate never activates under a later served label';

 -- 5. Prepared (unserved) batches do not count: prepared D+1 + observed D -> D+1.
 PERFORM pg_temp.c11_owner(o5,'America/Chicago',a5);
 INSERT INTO public.dashboard_batches(owner_id,local_date,status) VALUES(o5,(d+1)::text,'prepared');
 INSERT INTO public.seed_pool_observed_days(owner_id,local_date) VALUES(o5,d);
 r:=public.seed_pool_apply(o5,0,ARRAY[a5],false); PERFORM pg_temp.c11_expect('prepared D+1 ignored',r,d+1);
 RAISE NOTICE 'R-C11 prepared batch ahead of today is ignored';

 -- 6. Unchanged normal next day: Chicago today served -> D+1; a later save while pending stays D+1.
 PERFORM pg_temp.c11_owner(o6,'America/Chicago',a6);
 IF public.seed_pool_record_feed_served(o6,d,'none',0)->>'status'<>'recorded' THEN RAISE EXCEPTION 'C11 observe D (6)'; END IF;
 r:=public.seed_pool_apply(o6,0,ARRAY[a6],false); PERFORM pg_temp.c11_expect('normal next day',r,d+1);
 r:=public.seed_pool_apply(o6,1,ARRAY[]::uuid[],false); PERFORM pg_temp.c11_expect('normal next day, second save',r,d+1);
 RAISE NOTICE 'R-C11 unchanged: today served -> next owner day';

 -- 7. Unchanged first-pool-immediate when nothing was ever served -> D, nothing pending.
 PERFORM pg_temp.c11_owner(o7,'America/Chicago',a7);
 r:=public.seed_pool_apply(o7,0,ARRAY[a7],false); PERFORM pg_temp.c11_expect('first pool immediate',r,d);
 SELECT * INTO st FROM public.seed_pool_state WHERE owner_id=o7;
 IF st.pending_version IS NOT NULL OR st.pending_effective IS NOT NULL THEN RAISE EXCEPTION 'C11 immediate left pending'; END IF;
 --    With that pool now active, the next save is next-day as before.
 r:=public.seed_pool_apply(o7,1,ARRAY[]::uuid[],false); PERFORM pg_temp.c11_expect('active pool next day',r,d+1);
 RAISE NOTICE 'R-C11 unchanged: first pool with nothing served is immediate, then next day';

 -- 8. Unchanged: only past labels served (observed D-3, acknowledged batch D-2, digest D-1) -> immediate D.
 PERFORM pg_temp.c11_owner(o8,'America/Chicago',a8);
 INSERT INTO public.seed_pool_observed_days(owner_id,local_date) VALUES(o8,d-3);
 INSERT INTO public.dashboard_batches(owner_id,local_date,status,served_at,acknowledged_at) VALUES(o8,(d-2)::text,'acknowledged',now()-interval '2 days',now()-interval '2 days');
 IF (SELECT count(*) FROM public.claim_briefing_delivery(o8,(d-1)::text,'email',ARRAY['c11-past'],'{"fixture":"c11-past"}'::jsonb))<>1 THEN RAISE EXCEPTION 'C11 past digest claim'; END IF;
 r:=public.seed_pool_apply(o8,0,ARRAY[a8],false); PERFORM pg_temp.c11_expect('past labels only',r,d);
 RAISE NOTICE 'R-C11 unchanged: past served labels never delay an immediate first pool';

 -- 9. Non-date labels in the opaque text ledgers are ignored instead of failing the save.
 PERFORM pg_temp.c11_owner(o9,'America/Chicago',a9);
 INSERT INTO public.dashboard_batches(owner_id,local_date,status,served_at) VALUES(o9,'not-a-date','served',now()-interval '3 days');
 INSERT INTO public.briefing_deliveries(user_id,local_date,channel,item_ids,payload,delivered_at) VALUES(o9,'2026-02-30','email',ARRAY['c11-bad'],'{}'::jsonb,now()-interval '3 days');
 INSERT INTO public.seed_pool_observed_days(owner_id,local_date) VALUES(o9,d);
 r:=public.seed_pool_apply(o9,0,ARRAY[a9],false); PERFORM pg_temp.c11_expect('malformed labels ignored',r,d+1);
 RAISE NOTICE 'R-C11 malformed ledger labels ignored';
 RAISE NOTICE 'R-C11 served-label floor passed';
END $$;
ROLLBACK;
