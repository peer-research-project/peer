-- READ ONLY: configuration/privileges of the existing digest ID sequence.
-- Deliberately excludes last_value and all application/user rows.
with target as (
  select pg_get_serial_sequence('public.briefing_deliveries','id')::regclass as oid
)
select jsonb_build_object(
  'current_user',current_user,
  'postgres_role',(select jsonb_build_object('rolsuper',r.rolsuper,'rolinherit',r.rolinherit,'rolcreaterole',r.rolcreaterole,'rolcreatedb',r.rolcreatedb,'rolcanlogin',r.rolcanlogin,'rolbypassrls',r.rolbypassrls) from pg_roles r where r.rolname='postgres'),
  'postgres_auth_usage',has_schema_privilege('postgres','auth','USAGE'),
  'postgres_auth_users_references',has_table_privilege('postgres','auth.users','REFERENCES'),
  'postgres_public_create',has_schema_privilege('postgres','public','CREATE'),
  'sequence_name',t.oid::text,
  'owner',pg_get_userbyid(c.relowner),
  'acl',coalesce(array_to_string(c.relacl,','),'DEFAULT'),
  'type',format_type(s.seqtypid,null),
  'start',s.seqstart,'increment',s.seqincrement,'minimum',s.seqmin,
  'maximum',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle,
  'service_usage',has_sequence_privilege('service_role',t.oid,'USAGE'),
  'service_select',has_sequence_privilege('service_role',t.oid,'SELECT'),
  'authenticated_usage',has_sequence_privilege('authenticated',t.oid,'USAGE'),
  'anon_usage',has_sequence_privilege('anon',t.oid,'USAGE')
) as sequence_metadata
from target t left join pg_class c on c.oid=t.oid
  left join pg_sequence s on s.seqrelid=t.oid;
