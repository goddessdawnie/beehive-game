// Use only a disposable local PostgreSQL 17 cluster (for example Docker).
// No production credentials, network workers, cron, or user data are loaded.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {testRest} from './test-rest.mjs';
import {initializeFixture} from '../tests/database-fixture.mjs';

const raw=process.env.BEE_TEST_CLUSTER_URL;
if(!raw || process.env.BEE_ALLOW_DISPOSABLE_CLUSTER!=='yes')
 throw new Error('Set BEE_TEST_CLUSTER_URL and BEE_ALLOW_DISPOSABLE_CLUSTER=yes for a disposable local PostgreSQL cluster.');
let url;
try{url=new URL(raw);}catch{throw new Error('Invalid test cluster URL');}
if(!['postgres:','postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.search)
 throw new Error('Only a local PostgreSQL URL without query options is accepted; never use a production tunnel.');
const name='bee_test_'+randomUUID().replaceAll('-','');
const clients=[],roles=[];
let created=false;
async function connect(connectionString){
 const c=new Client({connectionString,connectionTimeoutMillis:5000,statement_timeout:10000,idle_in_transaction_session_timeout:15000});
 await c.connect();return c;
}
const admin=await connect(raw);
const owner=randomUUID(),other=randomUUID();
const command=(c,op,p={},id=randomUUID())=>c.query('select bee.command($1,$2,$3,$4) value',[owner,id,op,p]).then(r=>r.rows[0].value);
// Observe actual blocking, rather than relying on a sleep to guess execution order.
async function blocked(observer,waiter,holder){
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){
  const r=await observer.query('select $1::integer=any(pg_blocking_pids($2)) blocked',[holder.processID,waiter.processID]);
  if(r.rows[0].blocked)return;
  await delay(20);
 }
 throw new Error('Expected database lock wait was not observed');
}
try{
 const info=(await admin.query('select current_user, current_setting(\'server_version_num\')::integer version')).rows[0];
 assert.equal(info.current_user,'postgres','Use the disposable cluster postgres role');
 assert.ok(info.version>=170000 && info.version<180000,'Match production PostgreSQL major version 17');
 // Roles are cluster-wide. Preserve existing roles and remove only roles we create.
 for(const role of ['anon','authenticated','service_role']){
  if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){
   await admin.query(`create role ${role}${role==='service_role'?' bypassrls':''}`);roles.push(role);
  }
 }
 await admin.query(`create database ${name} template template0`);created=true;
 url.pathname='/'+name;
 for(let i=0;i<3;i++)clients.push(await connect(url.toString()));
 const [a,b,observer]=clients;
 await initializeFixture({exec:s=>a.query(s),query:(s,p)=>a.query(s,p)},owner,other,{createRoles:false});

 // A user message and Kae's reply share a transaction timestamp.
 // Insert the reply first to prove the snapshot supplies human-before-dragon order.
 await a.query('begin');
 await a.query("insert into public.mochi_messages(owner_id,role,content,created_at) values ($1,'mochi','Old reply','2026-11-06 08:00:00+00'),($1,'user','Old question','2026-11-06 08:00:00+00'),($1,'mochi','New reply','2026-11-07 11:00:00+00'),($1,'user','New question','2026-11-07 11:00:00+00'),($2,'user','Other owner','2026-11-07 11:01:00+00')",[owner,other]);
 await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 const snapshot=(await a.query('select public.mochi_context_snapshot() value')).rows[0].value;
 assert.deepEqual(snapshot.recent_messages.map(m=>[m.role,m.content]),[['user','Old question'],['mochi','Old reply'],['user','New question'],['mochi','New reply']]);
 assert.equal(snapshot.recent_messages[0].created_at,snapshot.recent_messages[1].created_at);
 assert.notEqual(snapshot.recent_messages[1].created_at,snapshot.recent_messages[2].created_at);
 await a.query('rollback');
 console.log('PASS ordered and time-stamped Kae history, including timestamp ties and owner separation');


 // Daily claims: server-controlled catalog, existing Wumpus key, once/day,
 // fixed two-coin ledger award, and future catalog-only registration.
 // The recorded fixture omits the claims PK; restore that invariant in
 // this disposable test database before exercising ON CONFLICT.
 await a.query('alter table public.daily_game_claims add primary key (owner_id,game_key,play_date)');
 assert.equal((await a.query("select count(*)::int n from public.daily_reward_games where game_key in ('wordle','sudoku','2048','wumpus')")).rows[0].n,4);
 assert.equal((await a.query("select has_table_privilege('authenticated','public.daily_reward_games','INSERT') allowed")).rows[0].allowed,false);
 assert.equal((await a.query("select has_table_privilege('authenticated','public.daily_reward_games','UPDATE') allowed")).rows[0].allowed,false);
 await a.query("insert into public.daily_reward_games(game_key) values('future_game')");
 await a.query('begin');
 await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 await a.query('set local role authenticated');
 assert.equal((await a.query("select public.claim_daily_game('wumpus') claimed")).rows[0].claimed,true);
 assert.equal((await a.query("select public.claim_daily_game('wumpus') claimed")).rows[0].claimed,false);
 assert.equal((await a.query("select public.claim_daily_game('future_game') claimed")).rows[0].claimed,true);
 // The fixture lacks production's authenticated claims read policy;
 // inspect side effects as the disposable cluster's postgres verifier.
 await a.query('set local role postgres');
 assert.equal((await a.query("select count(*)::int n from public.daily_game_claims where owner_id=$1 and game_key='wumpus'",[owner])).rows[0].n,1);
 assert.equal((await a.query("select count(*)::int n from public.reward_ledger where owner_id=$1 and reason like 'game_daily:%'",[owner])).rows[0].n,2);
 assert.equal((await a.query("select sum(coins_delta)::int total from public.reward_ledger where owner_id=$1 and reason like 'game_daily:%'",[owner])).rows[0].total,4);
 await a.query('set local role authenticated');
 await a.query('savepoint unknown_game');
 await assert.rejects(a.query("select public.claim_daily_game('not_registered')"),/Unknown game/);
 await a.query('rollback to savepoint unknown_game');
 await a.query('rollback');
 console.log('PASS Wumpus claim, duplicate protection, catalog extension and ledger rewards');


 // Exact retries must wait for the first transaction and return its original ID.
 const request=randomUUID(),payload={title:'Concurrent retry',difficulty:'tiny'};
 await a.query('begin');
 const first=await command(a,'task.create',payload,request);
 const retry=command(b,'task.create',payload,request);retry.catch(()=>{});
 await blocked(observer,b,a);await a.query('commit');
 const replay=await retry;
 assert.equal(replay.replayed,true);assert.equal(replay.result.id,first.result.id);
 assert.equal((await observer.query('select count(*)::int n from tasks where title=$1',[payload.title])).rows[0].n,1);
 console.log('PASS concurrent exact retry');

 // Both edits saw the same version: only the first may commit.
 const t=first.result;
 await a.query('begin');
 await command(a,'task.edit',{id:t.id,expected_updated_at:t.updated_at,patch:{title:'Winner'}});
 const stale=command(b,'task.edit',{id:t.id,expected_updated_at:t.updated_at,patch:{title:'Lost update'}});
 const rejected=assert.rejects(stale,/changed/);
 await blocked(observer,b,a);await a.query('commit');await rejected;
 console.log('PASS concurrent stale edit');

 // The actual browser wrapper holds the row while Bee waits; no double reward/successor.
 const recurring=(await command(a,'task.create',{title:'Concurrent completion',difficulty:'large',due_at:'2035-03-10T09:00:00-05:00',recurrence_rule:'daily'})).result;
 await a.query('begin');await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 await a.query('set local role authenticated');
 await a.query('select public.complete_task_with_notes($1,$2)',[recurring.id,'Browser']);
 const completion=command(b,'task.complete',{id:recurring.id,expected_updated_at:recurring.updated_at});
 const conflict=assert.rejects(completion,/changed/);
 await blocked(observer,b,a);await a.query('commit');await conflict;
 assert.equal((await observer.query('select count(*)::int n from reward_ledger where task_id=$1',[recurring.id])).rows[0].n,1);
 assert.equal((await observer.query('select count(*)::int n from tasks where recurrence_series_id=$1',[recurring.recurrence_series_id])).rows[0].n,2);
 console.log('PASS browser/Bee completion race');

 // A worker skips a cancellation's row lock and cannot claim after commit.
 const timer=(await command(a,'timer.create',{seconds:600,label:'Cancel race'})).result;
 await a.query("update beehive_timers set due_at=now()-interval '1 second' where id=$1",[timer.id]);
 await a.query('begin');await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 await a.query('set local role authenticated');
 assert.equal((await a.query('select public.beehive_cancel_timer($1) cancelled',[timer.id])).rows[0].cancelled,true);
 assert.equal((await b.query('select * from public.beehive_claim_due_timers(20)')).rowCount,0);
 await a.query('commit');
 assert.equal((await b.query('select * from public.beehive_claim_due_timers(20)')).rowCount,0);
 console.log('PASS cancellation/worker claim race');

 // Reverse ordering: a worker has attempted delivery, so browser cancellation fails.
 const sending=(await command(a,'timer.create',{seconds:600,label:'Claim race'})).result;
 await a.query("update beehive_timers set due_at=now()-interval '1 second' where id=$1",[sending.id]);
 await a.query('begin');
 assert.equal((await a.query('select * from public.beehive_claim_due_timers(20)')).rowCount,1);
 await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 await b.query('set local role authenticated');
 const cancel=b.query('select public.beehive_cancel_timer($1) cancelled',[sending.id]);cancel.catch(()=>{});
 await blocked(observer,b,a);await a.query('commit');
 assert.equal((await cancel).rows[0].cancelled,false);await b.query('commit');
 console.log('PASS worker claim/cancellation race');
 console.log('All 5 native concurrency checks passed.');
 if(process.env.BEE_TEST_REST==='yes')await testRest(observer,url.toString(),owner,other);
}finally{
 // Closing sessions rolls back any unfinished transaction before dropping our database.
 await Promise.allSettled(clients.map(c=>c.end()));
 try{if(created)await admin.query(`drop database ${name} with (force)`);}
 finally{
  for(const role of roles.reverse())await admin.query(`drop role ${role}`);
  await admin.end();
 }
}
