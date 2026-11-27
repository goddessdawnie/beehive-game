import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261127221100_legacy_three_things_task_origin.sql',import.meta.url),'utf8');
const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const other='11111111-1111-4111-8111-111111111111';
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');

async function fixture(db){
 await db.exec(
  'create table public.tasks(id uuid primary key,owner_id uuid not null,task_origin text not null,created_at timestamptz not null,status text not null,reward_coins integer not null,completed_at timestamptz,updated_at timestamptz not null);'+
  'create table public.three_things(id uuid primary key,task_id uuid,owner_id uuid not null,status text not null);'
 );
}
async function add(db,n,who,origin,date,linked=true,suggestionStatus='added'){
 const id=uuid(n);
 await db.query(
  'insert into public.tasks(id,owner_id,task_origin,created_at,status,reward_coins,completed_at,updated_at) values($1,$2,$3,$4,\'open\',2,null,\'2026-11-06T00:00:00Z\')',
  [id,who,origin,date]
 );
 if(linked)await db.query('insert into public.three_things(id,task_id,owner_id,status) values($1,$2,$3,$4)',
  [uuid(n+1000),id,who,suggestionStatus]);
 return id;
}

test('linked legacy tasks repair origin only while preserving task and suggestion records',async()=>{
 const db=new PGlite();
 try{
  await fixture(db);
  for(let n=1;n<=16;n++)await add(db,n,owner,'user','2026-11-08T12:00:00Z',true,n%2?'added':'completed');
  for(let n=17;n<=31;n++)await add(db,n,owner,'kae','2026-11-15T12:00:00Z');
  const unlinked=await add(db,32,owner,'user','2026-11-08T12:00:00Z',false);
  const newer=await add(db,33,owner,'user','2026-11-20T12:00:00Z');
  const foreign=await add(db,34,other,'user','2026-11-08T12:00:00Z');
  const original=(await db.query('select id,owner_id,created_at,status,reward_coins,completed_at,updated_at from public.tasks order by id')).rows;
  const suggestions=(await db.query('select * from public.three_things order by id')).rows;
  await db.exec(migration);
  const rows=(await db.query('select id,task_origin from public.tasks order by id')).rows;
  assert.equal(rows.slice(0,31).filter(r=>r.task_origin==='kae').length,31,'16 repaired and 15 already correct');
  for(const id of [unlinked,newer,foreign])assert.equal(rows.find(r=>r.id===id).task_origin,'user');
  assert.deepEqual((await db.query('select id,owner_id,created_at,status,reward_coins,completed_at,updated_at from public.tasks order by id')).rows,original,
   'No task attributes other than origin change');
  assert.deepEqual((await db.query('select * from public.three_things order by id')).rows,suggestions,'Source suggestion rows remain untouched');
  await db.exec(migration);
  assert.deepEqual((await db.query('select id,task_origin from public.tasks order by id')).rows,rows,'Idempotent on rerun');
 }finally{await db.close()}
});

test('unexpected partial candidate set aborts before any write',async()=>{
 const db=new PGlite();
 try{
  await fixture(db);
  const id=await add(db,1,owner,'user','2026-11-08T12:00:00Z');
  await assert.rejects(()=>db.exec(migration),/Unexpected legacy Three Things origin candidate count: 1/);
  assert.equal((await db.query('select task_origin from public.tasks where id=$1',[id])).rows[0].task_origin,'user');
 }finally{await db.close()}
});
