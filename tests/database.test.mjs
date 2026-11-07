import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b', other=randomUUID();
const fixture=JSON.parse(await readFile(new URL('./fixtures/live-contract.json',import.meta.url)));
import {initializeFixture} from './database-fixture.mjs';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const command=async(op,p={},request=randomUUID(),user=owner)=>(await q('select bee.command($1,$2,$3,$4) value',[user,request,op,p]))[0].value;
const read=async(kind,id=null,user=owner)=>(await q('select bee.read($1,$2,\'\',$3) value',[user,kind,id]))[0].value;
const current=async(kind,id)=>(await read(kind,id))[0];
const mutate=async(op,kind,id,extra={})=>command(op,{id,expected_updated_at:(await current(kind,id)).updated_at,...extra});
before(()=>initializeFixture(db,owner,other));
after(()=>db.close());

test('creation retry returns one record; conflicting retry rolls back',async()=>{
 const id=randomUUID(), payload={title:'Retry test',difficulty:'tiny'};
 const a=await command('task.create',payload,id), b=await command('task.create',payload,id);
 assert.equal(b.replayed,true); assert.equal(a.result.id,b.result.id);
 assert.equal(a.result.reward_coins,2); assert.equal(a.result.task_origin,'bee');
 await assert.rejects(command('task.create',{title:'Different'},id),/reused/);
 assert.equal((await read('tasks')).filter(x=>x.title==='Retry test').length,1);
});

test('possibility defaults survive instance resize, complete, undo and cancel',async()=>{
 const a=(await command('possibility.create',{title:'Dishes',notes:'Default notes',suggested_difficulty:'tiny'})).result;
 const t=(await command('possibility.activate',{activity_id:a.id})).result;
 assert.equal(t.reward_coins,2);
 await mutate('task.edit','tasks',t.id,{patch:{difficulty:'large'}});
 assert.equal((await current('tasks',t.id)).reward_coins,9);
 const request=randomUUID(), payload={id:t.id,expected_updated_at:(await current('tasks',t.id)).updated_at,notes:'All done'};
 await command('task.complete',payload,request); await command('task.complete',payload,request);
 assert.equal((await q('select * from reward_ledger where task_id=$1',[t.id])).length,1);
 assert.equal((await current('possibilities',a.id)).times_done,1);
 assert.equal((await current('possibilities',a.id)).suggested_difficulty,'tiny');
 assert.equal((await q('select notes from activity_log where task_id=$1',[t.id]))[0].notes,'All done');
 await mutate('task.status','tasks',t.id,{status:'open'});
 assert.equal((await q('select * from reward_ledger where task_id=$1',[t.id])).length,0);
 assert.equal((await current('possibilities',a.id)).times_done,0);
 await mutate('task.status','tasks',t.id,{status:'cancelled'});
 assert.equal((await current('possibilities',a.id)).active,true);
});

test('daily recurrence creates one successor, maintains New York clock across DST',async()=>{
 const t=(await command('task.create',{title:'Daily',due_at:'2030-03-09T09:00:00-05:00',recurrence_rule:'daily'})).result;
 await mutate('task.complete','tasks',t.id);
 await mutate('task.complete','tasks',t.id);
 const series=await q('select *,to_char(due_at at time zone \'America/New_York\',\'HH24:MI\') local_time from tasks where recurrence_series_id=$1 order by due_at',[t.recurrence_series_id]);
 assert.equal(series.length,2);assert.equal(series[1].local_time,'09:00');
 assert.equal(new Date(series[1].due_at)-new Date(series[0].due_at),23*3600000);
});

test('stale edits, invalid states, foreign links, null status and unknown keys are rejected',async()=>{
 const t=(await command('task.create',{title:'Edit guard'})).result;
 await mutate('task.edit','tasks',t.id,{patch:{title:'Changed'}});
 await assert.rejects(command('task.edit',{id:t.id,expected_updated_at:t.updated_at,patch:{title:'Lost update'}}),/changed/);
 await assert.rejects(mutate('task.status','tasks',t.id,{status:null}),/Invalid status/);
 await assert.rejects(command('task.create',{title:'Bad',owner_id:other}),/Unknown payload/);
 const a=(await command('possibility.create',{title:'Other'},randomUUID(),other)).result;
 await assert.rejects(command('possibility.activate',{activity_id:a.id}),/not found/);
 await assert.rejects(command('task.create',{title:'Invalid recurrence',recurrence_rule:'daily'}),/recurrence_requires_date/);
});

test('timers retry once, adjust safely, and reject sending or previously attempted jobs',async()=>{
 const req=randomUUID(), t=(await command('timer.create',{seconds:600,label:'Tea'},req)).result;
 assert.equal((await command('timer.create',{seconds:600,label:'Tea'},req)).result.id,t.id);
 await mutate('timer.adjust','timers',t.id,{delta_seconds:60});
 assert.equal((await current('timers',t.id)).duration_seconds,660);
 await assert.rejects(mutate('timer.adjust','timers',t.id,{delta_seconds:-10000}),/future/);
 await q('update beehive_timers set status=\'sending\',attempts=1 where id=$1',[t.id]);
 await assert.rejects(mutate('timer.cancel','timers',t.id),/already attempted/);
 await q('update beehive_timers set status=\'pending\' where id=$1',[t.id]);
 await assert.rejects(mutate('timer.adjust','timers',t.id,{delta_seconds:60}),/already attempted/);
 await q('update beehive_timers set status=\'failed\' where id=$1',[t.id]);
 const clean=(await command('timer.create',{seconds:300})).result;
 await mutate('timer.cancel','timers',clean.id);
 assert.equal((await current('timers',clean.id)).status,'cancelled');
});

test('reminders schedule, reschedule, cancel; bell retry never queues twice',async()=>{
 const b=(await command('reminder.create',{title:'Reminder',body:'Do the thing',due_at:'2030-01-01T12:00:00Z'})).result;
 await mutate('reminder.edit','reminders',b.id,{due_at:'2030-01-02T12:00:00Z'});
 assert.match((await current('reminders',b.id)).due_at,/2030-01-02/);
 await mutate('reminder.cancel','reminders',b.id);
 assert.equal((await current('reminders',b.id)).status,'cancelled');
 const req=randomUUID(),p={title:'Bell',body:'Now'};
 const sent=await command('notification.send',p,req);
 assert.equal((await command('notification.send',p,req)).result.id,sent.result.id);
 await q('update beehive_bell_outbox set status=\'sending\',attempts=1 where id=$1',[sent.result.id]);
 await assert.rejects(mutate('reminder.cancel','reminders',sent.result.id),/already attempted/);
 await assert.rejects(command('reminder.create',{title:'Past',body:'Past',due_at:'2000-01-01Z'}),/future/);
});

test('game management only changes installed games; health is sanitized',async()=>{
 await command('game.set',{game_key:'sudoku',enabled:false});
 assert.equal((await read('games')).find(x=>x.game_key==='sudoku').enabled,false);
 await command('game.set',{game_key:'sudoku',enabled:true});
 await assert.rejects(command('game.set',{game_key:'arbitrary-code',enabled:true}),/check constraint/);
 const h=await read('health');assert.equal(h.api_version,1);
 assert.equal(h.worker_status,'not_probed');assert.equal(h.handset_receipt,'not_observable');
 assert.doesNotMatch(JSON.stringify(h),/endpoint|auth_key|vapid/);
});

test('explicit deletion preserves history by refusing unsafe deletes',async()=>{
 const t=(await command('task.create',{title:'Delete me'})).result;
 await assert.rejects(mutate('task.delete','tasks',t.id,{confirm_delete:true}),/history/);
 await mutate('task.status','tasks',t.id,{status:'cancelled'});
 await assert.rejects(mutate('task.delete','tasks',t.id),/confirmation/);
 await mutate('task.delete','tasks',t.id,{confirm_delete:true});assert.deepEqual(await read('tasks',t.id),[]);
});

test('public browser RPC retains rewards and enforces ownership; private commands inaccessible',async()=>{
 const t=(await command('task.create',{title:'Browser task'})).result;
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.exec('set role authenticated');
 try {
  await assert.rejects(command('task.create',{title:'Not admin'}),/permission denied/);
  await assert.rejects(q('select bee.set_task_status($1,$2,\'completed\')',[other,t.id]),/Owner access denied/);
  await q('select public.complete_task_with_notes($1,$2)',[t.id,'Browser complete']);
 } finally {await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");}
 assert.equal((await current('tasks',t.id)).status,'completed');
 assert.equal((await q('select * from reward_ledger where task_id=$1',[t.id])).length,1);
 await db.exec('set role anon');
 try {await assert.rejects(command('task.create',{title:'Anon'}),/permission denied/);}finally{await db.exec('reset role');}
});

test('worker recovers exhausted leases without retrying uncertain deliveries',async()=>{
 for(const [table,claim] of [['beehive_timers','beehive_claim_due_timers'],['beehive_bell_outbox','beehive_claim_due_bells']]){
  await db.exec(`update ${table} set status='failed' where status in ('pending','sending')`);
  const id=randomUUID();
  const extra=table==='beehive_timers'?",label,duration_seconds":",title,body";
  const values=table==='beehive_timers'?",'crashed',300":",'crashed','delivery uncertain'";
  await q(`insert into ${table}(id,owner_id,due_at,status,attempts,lease_until${extra}) values($1,$2,now()-interval '3 minutes','sending',5,now()-interval '1 minute'${values})`,[id,owner]);
  assert.equal((await q(`select * from ${claim}(20)`)).length,0);
  const [row]=await q(`select status,last_error from ${table} where id=$1`,[id]);
  assert.equal(row.status,'failed');assert.match(row.last_error,/unknown/);
 }
});

test('failed changes create no receipt and leave records unchanged',async()=>{
 const id=randomUUID();
 await assert.rejects(command('task.create',{title:'',difficulty:'tiny'},id),/check constraint/);
 assert.equal((await q('select * from bee.requests where request_id=$1',[id])).length,0);
 await assert.rejects(command('task.create',null),/Payload/);
 await assert.rejects(command('task.create',[]),/Payload/);
 const t=(await command('task.create',{title:'Guarded'})).result;
 await assert.rejects(mutate('task.edit','tasks',t.id,{patch:{owner_id:other}}),/Unknown payload/);
 assert.equal((await current('tasks',t.id)).title,'Guarded');
});

test('weekly defer and reopen do not duplicate recurrence or award coins',async()=>{
 const t=(await command('task.create',{title:'Weekly',due_at:'2030-11-02T09:00:00-04:00',recurrence_rule:'weekly'})).result;
 await mutate('task.status','tasks',t.id,{status:'deferred'});
 await mutate('task.status','tasks',t.id,{status:'open'});
 await mutate('task.complete','tasks',t.id);
 const series=await q('select * from tasks where recurrence_series_id=$1 order by due_at',[t.recurrence_series_id]);
 assert.equal(series.length,2);
 assert.equal(new Date(series[1].due_at)-new Date(series[0].due_at),169*3600000);
 assert.equal((await q('select * from reward_ledger where task_id=$1',[t.id])).length,1);
});

test('worker claims once before lease expiry and access is service-only',async()=>{
 for(const [table,claim] of [['beehive_timers','beehive_claim_due_timers'],['beehive_bell_outbox','beehive_claim_due_bells']]){
  const id=randomUUID(),extra=table==='beehive_timers'?',label,duration_seconds':',title,body',values=table==='beehive_timers'?",'due',300":",'due','body'";
  await q(`insert into ${table}(id,owner_id,due_at${extra}) values($1,$2,now()-interval '1 second'${values})`,[id,owner]);
  const rows=await q(`select * from ${claim}(20)`);assert.equal(rows.length,1);assert.equal(rows[0].attempts,1);
  assert.equal((await q(`select * from ${claim}(20)`)).length,0);
  await db.exec('set role authenticated');try{await assert.rejects(q(`select * from ${claim}(20)`),/permission denied/);}finally{await db.exec('reset role');}
 }
});

test('activation uses imported rating defaults when no explicit suggestion exists',async()=>{
 const a=(await command('possibility.create',{title:'Imported default'})).result;
 await q('update activity_catalog set rating_large=3,rating_tiny=1 where id=$1',[a.id]);
 const t=(await command('possibility.activate',{activity_id:a.id})).result;
 assert.equal(t.difficulty,'large');assert.equal(t.reward_coins,9);assert.equal(t.due_at,null);
});

test('browser cancellation respects the same delivery boundary and owner checks',async()=>{
 await db.exec("update beehive_timers set status='failed' where status in ('pending','sending')");
 const t=(await command('timer.create',{seconds:300})).result;
 const cancelAs=async(user)=>{
  await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  try{return (await q('select public.beehive_cancel_timer($1) cancelled',[t.id]))[0].cancelled;}
  finally{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");}
 };
 assert.equal(await cancelAs(other),false);
 await q("update beehive_timers set status='sending',attempts=1 where id=$1",[t.id]);
 assert.equal(await cancelAs(owner),false);
 assert.equal((await current('timers',t.id)).status,'sending');
 await q("update beehive_timers set status='pending' where id=$1",[t.id]);
 assert.equal(await cancelAs(owner),false);
 await q('update beehive_timers set attempts=0 where id=$1',[t.id]);
 assert.equal(await cancelAs(owner),true);
});

test('private receipts and game preferences do not leak through authenticated access',async()=>{
 await command('game.set',{game_key:'wordle',enabled:false},randomUUID(),other);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 try{
  await assert.rejects(q('select * from bee.requests'),/permission denied/);
  assert.equal((await q('select * from beehive_games where owner_id=$1',[other])).length,0);
  await assert.rejects(q('update beehive_games set enabled=false'),/permission denied/);
 }finally{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");}
});

test('public RPC rollback restores captured definitions without removing history or receipts',async()=>{
 const names=['set_task_status','complete_task_with_notes','beehive_claim_due_timers','beehive_claim_due_bells','beehive_cancel_timer'];
 const before=(await q('select count(*)::integer n from bee.requests'))[0].n;
 await db.exec('begin');
 try{
  for(const name of names){
   const original=fixture.functions.find(f=>f.proname===name).definition;
   await db.exec(original+';');
   const [row]=await q("select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name]);
   assert.equal(row.definition,original);
  }
  assert.equal((await q('select count(*)::integer n from bee.requests'))[0].n,before);
 }finally{await db.exec('rollback');}
});

test('request recovery can inspect a receipt without replaying or leaking another owner',async()=>{
 const request=randomUUID(),t=(await command('task.create',{title:'Receipt lookup'},request)).result;
 const receipt=(await q("select bee.read($1,'request','',$2) r",[owner,request]))[0].r;
 assert.equal(receipt.result.id,t.id);assert.equal(receipt.operation,'task.create');
 assert.equal((await q("select bee.read($1,'request','',$2) r",[other,request]))[0].r,null);
 assert.equal((await q("select bee.read($1,'request','',$2) r",[owner,randomUUID()]))[0].r,null);
 assert.equal((await q('select count(*)::integer n from tasks where id=$1',[t.id]))[0].n,1);
});
