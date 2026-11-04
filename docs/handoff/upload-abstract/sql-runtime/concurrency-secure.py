import os, subprocess, time, uuid, json
from pathlib import Path
base = Path(os.environ['TEMP']) / 'peer-seed-pg-runtime'
psql = str(base / 'pgsql' / 'bin' / 'psql.exe')
os.environ['PGOPTIONS']='-c TimeZone=UTC'
args = [psql, '-X', '-qAt', '-h', '127.0.0.1', '-p', '55479', '-U', 'peer_test_admin', '-d', 'peer_prodmeta_secure', '-v', 'ON_ERROR_STOP=1']
def sql(query):
    p = subprocess.run(args + ['-c', query], text=True, capture_output=True, timeout=10)
    if p.returncode: raise RuntimeError(p.stderr)
    return p.stdout.strip()
target=sql("select host(inet_server_addr()) || '|' || inet_server_port()::text || '|' || current_database() || '|' || current_setting('data_directory')")
expected='127.0.0.1|55479|peer_prodmeta_secure|' + str(base / 'data').replace('\\','/')
if target.lower()!=expected.lower(): raise RuntimeError('Refusing non-task PostgreSQL target: '+target)
def start(query, app):
    env=os.environ.copy(); env['PGAPPNAME']=app
    return subprocess.Popen(args + ['-c', query], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
def await_wait(app, event, seconds=5):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if sql("select exists(select 1 from pg_stat_activity where application_name='"+app+"' and wait_event='"+event+"')") == 't': return
        time.sleep(.08)
    raise RuntimeError(f'{app} did not enter {event} wait')
def finish(proc):
    out,err=proc.communicate(timeout=10)
    if proc.returncode: raise RuntimeError(err)
    return out.strip().splitlines()
def setup():
    owner=str(uuid.uuid4()); asset=str(uuid.uuid4())
    sql(f"insert into auth.users(id) values('{owner}'); insert into public.profiles(user_id) values('{owner}'); select public.seed_pool_stage_asset('{owner}',0,'{asset}','seed','doi:{asset}',repeat('a',64),'Invented','{{\"topic\":[\"forest\"]}}','{{}}','local-test'); select public.seed_pool_finish_asset('{owner}','{asset}');")
    return owner,asset
# Compare-and-swap: A holds owner transaction lock until B is visibly blocked.
a,x=setup()
p1=start(f"begin; select public.seed_pool_apply('{a}',0,array['{x}'::uuid],false); select pg_sleep(3); commit",'seed_cas_a')
await_wait('seed_cas_a','PgSleep')
p2=start(f"select public.seed_pool_apply('{a}',0,array['{x}'::uuid],false)",'seed_cas_b')
await_wait('seed_cas_b','advisory')
r1=finish(p1); r2=finish(p2)
assert json.loads(r1[0])['status']=='ok' and json.loads(r2[0])['status']=='stale_revision', (r1,r2)
print('PASS two concurrent same-revision edits serialize: one ok, one stale_revision')
# A records served (same owner lock) before first seed applies.
a,x=setup()
p1=start(f"begin; select public.seed_pool_record_feed_served('{a}',current_date,'none',0); select pg_sleep(3); commit",'seed_serve_a')
await_wait('seed_serve_a','PgSleep')
p2=start(f"select public.seed_pool_apply('{a}',0,array['{x}'::uuid],false)",'seed_serve_b')
await_wait('seed_serve_b','advisory')
r1=finish(p1); r2=finish(p2)
assert json.loads(r1[0])['status']=='recorded' and json.loads(r2[0])['effectiveLocalDate']==sql('select (current_date+1)::text'), (r1,r2)
print('PASS concurrent first seed after observed serve activates next owner day')
# Forget staging while its remote writer is still unsettled; finish waits and cannot republish.
owner=str(uuid.uuid4()); asset=str(uuid.uuid4())
sql(f"insert into auth.users(id) values('{owner}'); insert into public.profiles(user_id) values('{owner}'); select public.seed_pool_stage_asset('{owner}',0,'{asset}','seed','doi:{asset}',repeat('c',64),'Invented','{{\"topic\":[\"forest\"]}}','{{}}','local-test');")
p1=start(f"begin; select public.seed_pool_forget('{owner}',0,'{asset}'); select pg_sleep(3); commit",'seed_forget_a')
await_wait('seed_forget_a','PgSleep')
p2=start(f"select public.seed_pool_finish_asset('{owner}','{asset}')",'seed_forget_b')
await_wait('seed_forget_b','advisory')
r1=finish(p1); r2=finish(p2)
assert json.loads(r1[0])['status']=='revoked' and json.loads(r1[0])['objects'][0]['writerSettled'] is False and json.loads(r2[0])['status']=='revoked', (r1,r2)
assert sql(f"select status||':'||writer_settled::text from public.seed_pool_assets where id='{asset}'")=='revoked:true'
print('PASS concurrent forget prevents late writer republish and retains cleanup tombstone')
# A installs first seed first; a concurrently captured no-seed response must be fenced.
a,x=setup()
p1=start(f"begin; select public.seed_pool_apply('{a}',0,array['{x}'::uuid],false); select pg_sleep(3); commit",'seed_first_a')
await_wait('seed_first_a','PgSleep')
p2=start(f"select public.seed_pool_record_feed_served('{a}',current_date,'none',0)",'seed_first_b')
await_wait('seed_first_b','advisory')
r1=finish(p1); r2=finish(p2)
assert json.loads(r1[0])['status']=='ok' and json.loads(r2[0])['status']=='stale_pool', (r1,r2)
print('PASS concurrent no-seed response is fenced after first seed activates')

# Concurrent ordinary claims use the same owner lock and unique-index conflict.
owner=str(uuid.uuid4())
sql(f"insert into auth.users(id) values('{owner}'); insert into public.profiles(user_id) values('{owner}');")
claim=f"select * from public.claim_briefing_delivery('{owner}',current_date::text,'email',array['a'],'{{}}')"
p1=start(f"begin; {claim}; select pg_sleep(3); commit",'seed_claim_a')
await_wait('seed_claim_a','PgSleep')
p2=start(claim,'seed_claim_b')
await_wait('seed_claim_b','advisory')
r1=finish(p1); r2=finish(p2)
assert r1 and r1[0].isdigit() and not r2, (r1,r2)
print('PASS concurrent ordinary digest claims serialize: one row, one conflict')
