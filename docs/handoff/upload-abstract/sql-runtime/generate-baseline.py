import json,os,re
from pathlib import Path
base=Path(os.environ['TEMP'])/'peer-seed-pg-runtime'; metadata=Path(os.environ['TEMP'])/'peer-rollout-evidence'/'production-schema-metadata.json'
x=json.loads(metadata.read_text(encoding='utf-8-sig')); tables=['profiles','private_paper_pools','briefing_deliveries']
def qi(v): return '"'+v.replace('"','""')+'"'
lines=['CREATE SCHEMA auth;','CREATE TABLE auth.users(__deleted_1 text,id uuid PRIMARY KEY);','ALTER TABLE auth.users DROP COLUMN __deleted_1;',"CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid $$;",'GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;','GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;','GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;','CREATE SEQUENCE public.briefing_deliveries_id_seq;']
allowed={'uuid','text','bigint','boolean','smallint','integer','jsonb','timestamp with time zone','ARRAY'}
for table in tables:
 cols=[]; dropped=[]; position=0
 for c in x['columns']:
  if c['table_schema']!='public' or c['table_name']!=table: continue
  while position+1<c['ordinal_position']:
   position+=1; name='__deleted_'+str(position); cols.append(qi(name)+' text'); dropped.append(name)
  position+=1
  assert c['data_type'] in allowed
  typ='text[]' if c['data_type']=='ARRAY' and c['udt_name']=='_text' else c['data_type']
  assert typ!='ARRAY'
  col=qi(c['column_name'])+' '+typ+(' NOT NULL' if c['is_nullable']=='NO' else '')
  if c['column_default'] is not None: col+=' DEFAULT '+c['column_default']
  cols.append(col)
 lines.append('CREATE TABLE public.'+qi(table)+' (\n  '+',\n  '.join(cols)+'\n);')
 for name in dropped: lines.append('ALTER TABLE public.'+qi(table)+' DROP COLUMN '+qi(name)+';')
for k in x['constraints']:
 if k['table_name'] in tables: lines.append('ALTER TABLE public.'+qi(k['table_name'])+' ADD CONSTRAINT '+qi(k['conname'])+' '+k['definition']+';')
for index in x['indexes']:
 if index['tablename'] in tables and not index['indexname'].endswith('_pkey'): lines.append(index['indexdef']+';')
for table in tables: lines.append('ALTER TABLE public.'+qi(table)+' ENABLE ROW LEVEL SECURITY;')
for p in x['policies']:
 if p['tablename'] not in tables: continue
 cmd=p['cmd']; assert cmd in ('SELECT','INSERT','UPDATE','DELETE','ALL')
 q='CREATE POLICY '+qi(p['policyname'])+' ON public.'+qi(p['tablename'])+' FOR '+cmd+' TO '+','.join(qi(r) for r in p['roles'])
 if p['qual']: q+=' USING ('+p['qual']+')'
 if p['with_check']: q+=' WITH CHECK ('+p['with_check']+')'
 lines.append(q+';')
for g in x['grants']:
 if g['table_name'] in tables:
  assert g['grantee'] in ('anon','authenticated','service_role','PUBLIC') and g['privilege_type'] in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  lines.append('GRANT '+g['privilege_type']+' ON public.'+qi(g['table_name'])+' TO '+('PUBLIC' if g['grantee']=='PUBLIC' else qi(g['grantee']))+';')
lines += ['GRANT USAGE,SELECT ON SEQUENCE public.briefing_deliveries_id_seq TO service_role;']
(base/'prodmeta-baseline.sql').write_text('\n'.join(lines)+'\n',encoding='utf8')
print('Generated local baseline from metadata: 3 tables,',len(x['columns']),'catalog columns including auth.users id; production data is absent')
