\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.profiles(user_id) VALUES ('33333333-3333-4333-8333-333333333333');
UPDATE public.profiles SET digest_timezone='America/Chicago' WHERE user_id='33333333-3333-4333-8333-333333333333';
INSERT INTO public.seed_pool_state(owner_id,revision) VALUES ('33333333-3333-4333-8333-333333333333',2);
INSERT INTO public.seed_pool_snapshots(version,owner_id,effective_date,created_revision,seeds) VALUES
 ('33333333-3333-4333-8333-333333333331','33333333-3333-4333-8333-333333333333','2026-03-07',1,'[{"id":"one"}]'),
 ('33333333-3333-4333-8333-333333333332','33333333-3333-4333-8333-333333333333','2026-03-08',2,'[{"id":"two"}]');
DO $$ DECLARE u uuid:='33333333-3333-4333-8333-333333333333'; r jsonb; BEGIN
 r:=public.seed_pool_resolve(u,null,'2026-03-08 05:59:00+00'); IF r->>'ownerLocalDate'<>'2026-03-07' OR r->'snapshot'->>'version'<>'33333333-3333-4333-8333-333333333331' THEN RAISE EXCEPTION 'spring before midnight %',r; END IF;
 r:=public.seed_pool_resolve(u,null,'2026-03-08 06:00:00+00'); IF r->>'ownerLocalDate'<>'2026-03-08' OR r->'snapshot'->>'version'<>'33333333-3333-4333-8333-333333333332' THEN RAISE EXCEPTION 'spring midnight %',r; END IF;
 r:=public.seed_pool_resolve(u,'2026-03-08','2026-03-08 05:59:00+00'); IF r->>'ownerLocalDate'<>'2026-03-07' OR r->'snapshot'->>'version'<>'33333333-3333-4333-8333-333333333332' THEN RAISE EXCEPTION 'future target %',r; END IF;
 r:=public.seed_pool_resolve(u,null,'2026-11-01 04:59:00+00'); IF r->>'ownerLocalDate'<>'2026-10-31' THEN RAISE EXCEPTION 'fall before midnight %',r; END IF;
 r:=public.seed_pool_resolve(u,null,'2026-11-01 05:00:00+00'); IF r->>'ownerLocalDate'<>'2026-11-01' THEN RAISE EXCEPTION 'fall midnight %',r; END IF;
 RAISE NOTICE 'spring/fall local dates and future target passed';
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 BEGIN PERFORM public.seed_pool_apply('33333333-3333-4333-8333-333333333333',2,ARRAY[]::uuid[],false); RAISE EXCEPTION 'authenticated unexpectedly executed service RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.seed_pool_snapshots(version,owner_id,effective_date,created_revision,seeds) VALUES(gen_random_uuid(),'33333333-3333-4333-8333-333333333333',current_date,3,'[]'); RAISE EXCEPTION 'authenticated unexpectedly wrote table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'authenticated RPC/table writes denied';
END $$;
ROLLBACK;
