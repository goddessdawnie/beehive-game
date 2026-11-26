import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
test('private task writes preserve receipts, dates, context and reward/recurrence behavior',async()=>{
 const db=new PGlite(),other=randomUUID();
 const command=async(operation,payload={},request=randomUUID(),user=owner)=>
  (await db.query('select bee.command($1,$2,$3,$4::jsonb) as result',
   [user,request,operation,JSON.stringify(payload)])).rows[0].result;
 const get=async id=>(await db.query('select bee.read($1,$2,$3,$4) as result',
   [owner,'tasks','',id])).rows[0].result[0];
 try {
  await initializeFixture(db,owner,other);
  const firstReq=randomUUID();
  const due='2030-04-12T11:00:00-04:00';
  const initial={title:'Metadata and planning',due_at:due,task_location:'Florence',task_category:'Maintenance',planned_on:'2030-04-11',difficulty:'tiny'};
  const created=await command('task.create',initial,firstReq);
  const replay=await command('task.create',initial,firstReq);
  assert.equal(replay.replayed,true);
  assert.equal(replay.result.id,created.result.id);
  assert.equal(created.result.task_location,'Florence');
  assert.equal(created.result.task_category,'Maintenance');
  assert.equal(created.result.planned_on,'2030-04-11');
  assert.equal(created.result.task_origin,'bee');
  assert.equal(created.result.reward_coins,2);
  assert.equal(new Date(created.result.due_at).toISOString(),'2030-04-12T15:00:00.000Z');
  await assert.rejects(()=>command('task.create',{...initial,task_location:'Williamsburg'},firstReq),/reused/);
  const requestRecords=(await db.query('select count(*)::integer as n from bee.requests where owner_id=$1 and request_id=$2',[owner,firstReq])).rows;
  assert.equal(requestRecords[0].n,1);

  const planReq=randomUUID(),before=await get(created.result.id);
  const planPayload={id:before.id,expected_updated_at:before.updated_at,planned_on:'2030-04-12'};
  const planned=await command('task.plan',planPayload,planReq);
  assert.equal(planned.result.planned_on,'2030-04-12');
  assert.equal(planned.result.due_at,created.result.due_at,'Choosing for a day never changes real deadline');
  const retry=await command('task.plan',planPayload,planReq);
  assert.equal(retry.replayed,true);
  assert.equal(retry.result.updated_at,planned.result.updated_at);
  await assert.rejects(()=>command('task.plan',planPayload),/Task changed/);
  await assert.rejects(()=>command('task.plan',{id:before.id,expected_updated_at:planned.result.updated_at}),/planned_on must be supplied/);
  await assert.rejects(()=>command('task.plan',{id:before.id,expected_updated_at:planned.result.updated_at,planned_on:'tomorrow'}),/planned_on must be YYYY-MM-DD/);
  await assert.rejects(()=>command('task.plan',{id:before.id,expected_updated_at:planned.result.updated_at,planned_on:22}),/planned_on must be YYYY-MM-DD/);
  await assert.rejects(()=>command('task.plan',{id:before.id,expected_updated_at:planned.result.updated_at,planned_on:null,extra:true}),/Unknown payload/);
  const cleared=await command('task.plan',{id:before.id,expected_updated_at:planned.result.updated_at,planned_on:null});
  assert.equal(cleared.result.planned_on,null);
  assert.equal(cleared.result.due_at,created.result.due_at);

  const edited=await command('task.edit',{id:before.id,expected_updated_at:cleared.result.updated_at,patch:{task_location:'Williamsburg',task_category:'Chores',difficulty:'large'}});
  assert.equal(edited.result.task_location,'Williamsburg');
  assert.equal(edited.result.task_category,'Chores');
  assert.equal(edited.result.reward_coins,9);
  const clearedContext=await command('task.edit',{id:before.id,expected_updated_at:edited.result.updated_at,patch:{task_location:null,task_category:null}});
  assert.equal(clearedContext.result.task_location,null);
  assert.equal(clearedContext.result.task_category,null);
  assert.equal(clearedContext.result.due_at,created.result.due_at);
  await assert.rejects(()=>command('task.edit',{id:before.id,expected_updated_at:clearedContext.result.updated_at,patch:{planned_on:'2030-04-13'}}),/Unknown payload/);
  await assert.rejects(()=>command('task.create',{title:'No blank context',task_location:'   '}),/constraint/);
  await assert.rejects(()=>command('task.create',{title:'Bad planned timestamp',planned_on:'2030-04-13T12:00:00Z'}),/planned_on must be YYYY-MM-DD/);

  const source=(await command('possibility.create',{title:'Shared activity',category:'cleaning',locations:['Kitchen','Porch'],suggested_difficulty:'tiny'})).result;
  const activated=(await command('possibility.activate',{activity_id:source.id})).result;
  assert.equal(activated.task_location,'Kitchen, Porch');
  assert.equal(activated.task_category,'cleaning');
  const overridden=(await command('possibility.activate',{activity_id:source.id,task_location:'Anywhere',task_category:null})).result;
  assert.equal(overridden.task_location,'Anywhere');
  assert.equal(overridden.task_category,null);
  assert.equal((await db.query('select category from public.activity_catalog where id=$1',[source.id])).rows[0].category,'cleaning','Possibility defaults stay unchanged');

  const repeating=(await command('task.create',{title:'Repeat safely',recurrence_rule:'daily',due_at:'2030-05-04T09:00:00-04:00',task_location:'Home',task_category:'Routine'})).result;
  const completed=await command('task.complete',{id:repeating.id,expected_updated_at:repeating.updated_at,notes:'Done'});
  await assert.rejects(()=>command('task.complete',{id:repeating.id,expected_updated_at:repeating.updated_at,notes:'Done'}),/Task changed/);
  const rewardRows=await db.query('select * from public.reward_ledger where task_id=$1',[repeating.id]);
  assert.equal(rewardRows.rows.length,1);
  const children=await db.query('select id from public.tasks where recurrence_series_id=$1',[repeating.recurrence_series_id]);
  assert.equal(children.rows.length,2,'Exactly one successor created');
  await assert.rejects(()=>command('task.plan',{id:repeating.id,expected_updated_at:completed.result.updated_at,planned_on:'2030-05-05'}),/Only open tasks can be planned/);
  const foreign=(await command('task.create',{title:'Someone else'},randomUUID(),other)).result;
  await assert.rejects(()=>command('task.plan',{id:foreign.id,expected_updated_at:foreign.updated_at,planned_on:null}),/Task not found/);
  const privileges=await db.query(`select has_function_privilege('anon','bee.command_core_20261126(uuid,uuid,text,jsonb)','EXECUTE') anon,has_function_privilege('authenticated','bee.command_core_20261126(uuid,uuid,text,jsonb)','EXECUTE') authenticated,has_function_privilege('service_role','bee.command_core_20261126(uuid,uuid,text,jsonb)','EXECUTE') service_role`);
  assert.deepEqual(privileges.rows[0],{anon:false,authenticated:false,service_role:true});
 } finally {await db.close()}
});
