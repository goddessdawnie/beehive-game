import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const hoursAgo=h=>new Date(Date.now()-h*3600000).toISOString();
const source=readFileSync(new URL('../supabase/functions/kae-chat/index.ts',import.meta.url),'utf8');

test('Kae uses one owner-authenticated task RPC, not two overlapping reads or a deduplication module',()=>{
 assert.match(source,/db\.rpc\("kae_recent_task_activity"\)/);
 assert.doesNotMatch(source,/mergeRecentTaskActivity|taskUpdates|taskCompletions|\.from\("tasks"\)/);
 assert.equal(existsSync(new URL('../supabase/functions/kae-chat/task-context.js',import.meta.url)),false);
 assert.match(source,/if\(taskContextError\|\|!taskContext\|\|!Array\.isArray\(taskContext\.tasks\)\)/);
 assert.match(source,/const recentlyFinished=taskRows\.filter/);
 assert.match(source,/recent_task_activity_coverage:\{window_hours:48,partial:taskContext\.partial\}/);
});

test('one RPC preserves distinct update/completion events, owner isolation and unchanged task data',async()=>{
 const db=new PGlite(),other=randomUUID();
 try {
  await initializeFixture(db,owner,other);
  async function add(who,title,status,updated,completed=null,notes=null){
   const id=randomUUID();
   await db.query("insert into public.tasks(id,owner_id,title,status,updated_at,completed_at,completion_notes,task_origin) values($1,$2,$3,$4,$5,$6,$7,'user')",
    [id,who,title,status,updated,completed,notes]);
   return id;
  }
  await add(owner,'Old created but freshly updated','open',hoursAgo(1));
  await add(owner,'Completed with delayed completion timestamp','completed',hoursAgo(60),hoursAgo(2),'Packed six boxes');
  await add(owner,'Reopened old completion','open',hoursAgo(3),hoursAgo(1),'Old note should be hidden');
  await add(owner,'Stale beyond two days','completed',hoursAgo(70),hoursAgo(69),'Old story');
  await add(other,'Someone else recent','completed',hoursAgo(1),hoursAgo(1),'Private');
  const before=(await db.query('select id,status,updated_at,completed_at,completion_notes from public.tasks order by id')).rows;
  const grants=(await db.query("select has_function_privilege('anon','public.kae_recent_task_activity()','EXECUTE') anon,has_function_privilege('authenticated','public.kae_recent_task_activity()','EXECUTE') signed")).rows[0];
  assert.deepEqual(grants,{anon:false,signed:true});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const packet=(await db.query('select public.kae_recent_task_activity() as value')).rows[0].value;
  assert.equal(packet.window_hours,48);
  assert.equal(packet.partial,false);
  assert.deepEqual(packet.tasks.map(r=>r.title),[
    'Old created but freshly updated',
    'Completed with delayed completion timestamp',
    'Reopened old completion'
  ]);
  const delayed=packet.tasks.find(t=>t.title.startsWith('Completed with'));
  assert.equal(delayed.status,'completed');
  assert.equal(delayed.completion_notes,'Packed six boxes');
  assert.ok(Date.parse(delayed.last_activity_at)>=Date.now()-3*3600000);
  const reopened=packet.tasks.find(t=>t.title.startsWith('Reopened'));
  assert.equal(reopened.status,'open');
  assert.equal(reopened.completed_at,null);
  assert.equal(reopened.completion_notes,null);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await db.exec('set role authenticated');
  const foreign=(await db.query('select public.kae_recent_task_activity() as value')).rows[0].value;
  assert.deepEqual(foreign.tasks.map(x=>x.title),['Someone else recent']);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select id,status,updated_at,completed_at,completion_notes from public.tasks order by id')).rows,before,
   'The RPC changes no task fields');
 } finally {await db.close()}
});

test('server caps to 24 records, exposes reliable partial and crops notes',async()=>{
 const db=new PGlite(),other=randomUUID();
 try {
  await initializeFixture(db,owner,other);
  const at=hoursAgo(1),notes='n'.repeat(500);
  for(let i=0;i<28;i++)await db.query(
    "insert into public.tasks(owner_id,title,status,updated_at,completed_at,completion_notes,task_origin) values($1,$2,'completed',$3,$3,$4,'kae')",
    [owner,'Kae task '+String(i).padStart(2,'0'),at,notes]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const packet=(await db.query('select public.kae_recent_task_activity() as value')).rows[0].value;
  assert.equal(packet.tasks.length,24);
  assert.equal(packet.partial,true);
  assert.ok(packet.tasks.every(x=>x.completion_notes.length===350));
  assert.equal(new Set(packet.tasks.map(x=>x.title)).size,24);
  await db.exec('reset role');
 } finally {await db.close()}
});
