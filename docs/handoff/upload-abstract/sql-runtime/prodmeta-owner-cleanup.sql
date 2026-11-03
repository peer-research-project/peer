\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('99999999-9999-4999-8999-999999999991'),('99999999-9999-4999-8999-999999999992');
INSERT INTO public.profiles(user_id,digest_timezone) VALUES('99999999-9999-4999-8999-999999999991','UTC'),('99999999-9999-4999-8999-999999999992','UTC');
DO $$ DECLARE a uuid:='99999999-9999-4999-8999-999999999991'; b uuid:='99999999-9999-4999-8999-999999999992'; x uuid:='99999999-9999-4999-8999-999999999993'; y uuid:='99999999-9999-4999-8999-999999999994'; va text; vb text; ba uuid; bb uuid; da bigint; db bigint; r jsonb; today date:=(now() AT TIME ZONE 'UTC')::date; BEGIN
 PERFORM public.seed_pool_stage_asset(a,0,x,'seed:a','doi:same',repeat('a',64),'Private A','{"topic":["forest"]}','{}','owner-a'); PERFORM public.seed_pool_finish_asset(a,x);
 PERFORM public.seed_pool_stage_asset(b,0,y,'seed:b','doi:same',repeat('a',64),'Private B','{"topic":["forest"]}','{}','owner-b'); PERFORM public.seed_pool_finish_asset(b,y);
 va:=public.seed_pool_apply(a,0,ARRAY[x],false)->>'version'; vb:=public.seed_pool_apply(b,0,ARRAY[y],false)->>'version';
 ba:=(public.seed_pool_put_prepared_batch(a,today,va,0,'i','[]','[{"reason":"A private"}]')->>'batchId')::uuid;
 bb:=(public.seed_pool_put_prepared_batch(b,today,vb,0,'i','[]','[{"reason":"B private"}]')->>'batchId')::uuid;
 PERFORM public.seed_pool_mark_batch_served(a,today,ba,va,0); PERFORM public.seed_pool_mark_batch_served(b,today,bb,vb,0);
 da:=(public.seed_pool_claim_digest(a,today,va,0,'email',ARRAY['a'],'{"items":["A private"],"email":{"html":"A"}}')->>'deliveryId')::bigint;
 db:=(public.seed_pool_claim_digest(b,today,vb,0,'email',ARRAY['b'],'{"items":["B private"],"email":{"html":"B"}}')->>'deliveryId')::bigint;
 PERFORM public.seed_pool_put_private_pool(a,today,va,0,'a','{"secret":"A"}'); PERFORM public.seed_pool_put_private_pool(b,today,vb,0,'b','{"secret":"B"}');
 INSERT INTO public.dashboard_rollover_candidates(owner_id,canonical_key,payload,last_pool_date) VALUES(a,'a','{"secret":"A"}',today::text),(b,'b','{"secret":"B"}',today::text);
 r:=public.seed_pool_forget(a,1,x); IF r->>'status'<>'revoked' THEN RAISE EXCEPTION 'forget %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.private_paper_pools WHERE owner_id=a) OR EXISTS(SELECT 1 FROM public.dashboard_rollover_candidates WHERE owner_id=a) OR EXISTS(SELECT 1 FROM public.dashboard_batches WHERE id=ba) OR EXISTS(SELECT 1 FROM public.briefing_deliveries WHERE id=da AND (payload<>'{}' OR item_ids<>'{}')) THEN RAISE EXCEPTION 'A derived data survived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.seed_pool_assets WHERE id=y AND owner_id=b AND status='ready' AND title='Private B') OR NOT EXISTS(SELECT 1 FROM public.private_paper_pools WHERE owner_id=b AND payload='{"secret":"B"}') OR NOT EXISTS(SELECT 1 FROM public.dashboard_rollover_candidates WHERE owner_id=b AND payload='{"secret":"B"}') OR NOT EXISTS(SELECT 1 FROM public.dashboard_batches WHERE id=bb AND served_items='[{"reason":"B private"}]') OR NOT EXISTS(SELECT 1 FROM public.briefing_deliveries WHERE id=db AND payload->'email'->>'html'='B') THEN RAISE EXCEPTION 'B changed by A forget'; END IF;
 IF public.seed_pool_persist_digest_email(a,today,da,va,0,'{"html":"stale"}')->>'status'<>'stale_pool' OR public.seed_pool_validate_digest_send(a,today,da,va,0)->>'status'<>'stale_pool' OR public.seed_pool_stage_asset(a,0,gen_random_uuid(),'late','doi:late',repeat('c',64),'late','{}','{}','late')->>'status'<>'stale_pool' THEN RAISE EXCEPTION 'A old writer/digest fence failed'; END IF;
 IF public.seed_pool_validate_digest_send(b,today,db,vb,0)->>'status'<>'allowed' THEN RAISE EXCEPTION 'B send invalidated'; END IF;
 IF (public.seed_pool_editor(b)->'cleanupPending') @> jsonb_build_array(jsonb_build_object('id',x::text)) THEN RAISE EXCEPTION 'B sees A tombstone'; END IF;
 IF public.seed_pool_forget(a,2,x)->>'status'<>'revoked' THEN RAISE EXCEPTION 'A tombstone retry failed'; END IF;
 RAISE NOTICE 'owner-scoped deletion, digest/cache fences, writer generation, cleanup retry and cross-owner isolation passed';
END $$;
ROLLBACK;
