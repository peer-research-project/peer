\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55479 OR current_database()<>'peer_prodmeta_secure' OR lower(replace(current_setting('data_directory'),'\\','/'))<>lower('C:/Users/wbc13/AppData/Local/Temp/peer-seed-pg-runtime/data') THEN
   RAISE EXCEPTION 'Refusing non-task PostgreSQL target';
 END IF;
END $$;
\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('77777777-7777-4777-8777-777777777777'),('88888888-8888-4888-8888-888888888888');
INSERT INTO public.profiles(user_id,digest_timezone) VALUES('77777777-7777-4777-8777-777777777777','Asia/Tokyo'),('88888888-8888-4888-8888-888888888888','UTC');
INSERT INTO public.briefing_deliveries(user_id,delivered_at,channel,item_ids,payload,opened_at,created_at) VALUES
('77777777-7777-4777-8777-777777777777',now(),'email',ARRAY['legacy-a'],'{"fixture":"legacy-a"}',now(),now()),
('77777777-7777-4777-8777-777777777777',now(),'email',ARRAY['legacy-b'],'{"fixture":"legacy-b"}',null,now()),
('88888888-8888-4888-8888-888888888888',now()-interval '60 days','inapp',ARRAY['legacy-c'],'{"fixture":"legacy-c"}',null,now()-interval '60 days');
INSERT INTO public.private_paper_pools(owner_id,scope_key,payload) VALUES('88888888-8888-4888-8888-888888888888','unrelated','{"fixture":"private"}');
CREATE TABLE public.local_test_before AS SELECT id,user_id,delivered_at,channel,item_ids,payload,opened_at,created_at FROM public.briefing_deliveries;
