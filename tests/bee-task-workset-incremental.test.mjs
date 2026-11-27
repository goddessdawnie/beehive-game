import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const ago=days=>new Date(Date.now()-days*86400000).toISOString();
const read=async(db,opts={})=>(await db.query(
 'select bee.read_task_workset_20261127($1,$2,$3,$4,$5,$6,$7,$8) AS value',
 [opts.owner??owner,opts.since??null,opts.through??null,opts.afterAt??null,opts.afterId??null,
  opts.offset??0,opts.openLimit??100,opts.changeLimit??100])).rows[0].value;
async function fixture(db){
 const other=randomUUID();
 await initializeFixture(db,owner,other);
 async function insert(who,title,status='open',updated=ago(1),extra={}){
  const id=randomUUID();
  await db.query('insert into public.tasks(id,owner_id,title,status,updated_at,due_at,planned_on,task_origin,instructions,completion_notes,completed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
   [id,who,title,status,updated,extra.due??null,extra.planned??null,extra.origin??'user',
    extra.instructions??null,extra.notes??null,extra.completed??null]);
  return id;
 }
 return {other,insert};
}
test('old unchanged due and planned open tasks are retained, no open/closed overlap, source scope and preview indicators',async()=>{
 const db=new PGlite();
 try{
  const {other,insert}=await fixture(db);
  const due=await insert(owner,'Old due','open',ago(90),{due:ago(2),instructions:'i'.repeat(160)});
  const plan=await insert(owner,'Old planned','open',ago(70),{planned:ago(3).slice(0,10)});
  const opened=await insert(owner,'New open','open',ago(0.1));
  const completed=await insert(owner,'Recently completed old task','completed',ago(0.2),{notes:'x'.repeat(250),completed:ago(0.2)});
  await insert(owner,'Very old finished task','completed',ago(200));
  await insert(other,'Foreign open','open',ago(0.1));
  await insert(other,'Foreign closed','completed',ago(0.1));
  const p=await read(db,{since:ago(2)});
  assert.equal(p.api_version,1);
  assert.equal(p.open.total,3);
  assert.deepEqual(p.open.items.map(t=>t.id),[due,plan,opened]);
  assert.equal(p.open.items[0].instructions_truncated,true);
  assert.equal(p.open.items[0].instructions_preview.length,120);
  assert.deepEqual(p.closed_changes.items.map(t=>t.id),[completed]);
  assert.equal(p.closed_changes.items[0].completion_preview.length,120);
  assert.equal(p.closed_changes.items[0].completion_truncated,true);
  assert.equal(p.closed_changes.has_more,false);
  assert.equal(p.closed_changes.next_cursor,null);
  assert.equal(p.open.truncated,false);
  assert.equal((await read(db,{since:ago(365)})).closed_changes.items.length,2);
  const first=await read(db,{since:ago(2),openLimit:2});
  assert.equal(first.open.truncated,true);
  assert.equal(first.open.next_offset,2);
  const second=await read(db,{since:ago(2),openLimit:2,offset:first.open.next_offset});
  assert.deepEqual(second.open.items.map(t=>t.id),[opened]);
  assert.equal(second.open.truncated,false);
  const detail=(await db.query("select bee.read($1,'tasks','',$2) AS value",[owner,due])).rows[0].value;
  assert.equal(detail[0].instructions.length,160);
  const foreign=await read(db,{owner:other,since:ago(2)});
  assert.equal(foreign.open.total,1);
  assert.equal(foreign.closed_changes.items.length,1);
 }finally{await db.close()}
});
test('closed changes have a fixed watermark and complete keyset traversal through tied timestamps',async()=>{
 const db=new PGlite();
 try{
  const {insert}=await fixture(db),at=ago(0.5),cutoff=ago(4),ids=[];
  for(let i=0;i<7;i++)ids.push(await insert(owner,'Changed '+i,i%2?'cancelled':'completed',at));
  await insert(owner,'Open updated','open',at);
  const first=await read(db,{since:cutoff,changeLimit:3});
  assert.equal(first.closed_changes.items.length,3);
  assert.equal(first.closed_changes.has_more,true);
  assert.ok(first.closed_changes.next_cursor.updated_at);
  let cur=first.closed_changes.next_cursor;
  const second=await read(db,{since:cutoff,through:first.through,afterAt:cur.updated_at,afterId:cur.id,changeLimit:3});
  assert.equal(second.closed_changes.items.length,3);
  assert.equal(second.closed_changes.has_more,true);
  cur=second.closed_changes.next_cursor;
  const third=await read(db,{since:cutoff,through:first.through,afterAt:cur.updated_at,afterId:cur.id,changeLimit:3});
  assert.equal(third.closed_changes.items.length,1);
  assert.equal(third.closed_changes.has_more,false);
  assert.equal(third.closed_changes.next_cursor,null);
  const all=[...first.closed_changes.items,...second.closed_changes.items,...third.closed_changes.items];
  assert.deepEqual(new Set(all.map(x=>x.id)),new Set(ids));
  assert.deepEqual(all.map(x=>x.id),[...ids].sort());
  assert.ok(all.every(x=>x.status!=='open'));
  await db.query('update public.tasks set updated_at=$1 where id=$2',[ago(-0.5),ids[0]]);
  const frozen=await read(db,{since:cutoff,through:first.through});
  assert.equal(frozen.closed_changes.items.some(x=>x.id===ids[0]),false);
 }finally{await db.close()}
});
test('owner check, service-only grants, empty history and invalid cursor inputs',async()=>{
 const db=new PGlite();
 try{
  await fixture(db);
  const signature='bee.read_task_workset_20261127(uuid,timestamptz,timestamptz,timestamptz,uuid,integer,integer,integer)';
  const grants=(await db.query("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service_role",[signature])).rows[0];
  assert.deepEqual(grants,{anon:false,authenticated:false,service_role:true});
  await assert.rejects(()=>read(db,{afterAt:ago(2)}),/cursor needs timestamp and ID together/i);
  await assert.rejects(()=>read(db,{openLimit:0}),/Invalid workset page/i);
  await assert.rejects(()=>read(db,{through:ago(-1)}),/Invalid since\/through/i);
  await assert.rejects(()=>db.query('select bee.read_task_workset_20261127($1)',[null]),/Owner required/);
  const empty=await read(db,{since:ago(2)});
  assert.equal(empty.open.total,0);
  assert.equal(empty.closed_changes.items.length,0);
  assert.equal(empty.closed_changes.has_more,false);
 }finally{await db.close()}
});
