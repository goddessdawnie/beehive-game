import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';
import {catalogPoolForSituation} from '../supabase/functions/three-things/situation-selection.js';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const now='2026-11-27T03:00:00Z'; // Thursday 22:00 in New York
const episode=(id,start,end,minutes,overlaps=[])=>({
 id,source_id:'synthetic-source-secret-'+id,start_time:start,end_time:end,
 minutes_asleep:minutes,overlaps
});
const sample=()=>({
 timezone:'America/New_York',
 import:{status:'success',stale:false,started_at:'2026-11-27T02:30:00Z',error_code:null},
 latest_successful_import:{finished_at:'2026-11-27T02:31:00Z'},
 daily:[
  {local_date:'2026-11-24',episodes:[]},
  {local_date:'2026-11-25',episodes:[
   episode('old','2026-11-25T07:00:00Z','2026-11-25T12:05:00Z',300)
  ]},
  {local_date:'2026-11-26',episodes:[
   episode('main','2026-11-26T09:00:00Z','2026-11-26T14:20:00Z',310),
   episode('nap','2026-11-26T19:00:00Z','2026-11-26T19:45:00Z',40)
  ]},
  {local_date:'2026-11-27',episodes:[]}
 ]
});
test('shared authenticated situational RPC is private by owner and derived from existing Sleep read',async()=>{
 const db=new PGlite();const other=randomUUID();
 const core=async(at=now,id=owner)=>(await db.query(
  'select bee.kae_situation_at_20261126($1::uuid,$2::timestamptz) as result',[id,at])).rows[0].result;
 try{
  await initializeFixture(db,owner,other);
  await db.exec(`
   create table bee.situation_fixture(payload jsonb);
   create or replace function bee.read_sleep_20261120(
    p_owner uuid,p_query text default '',p_limit integer default 7,p_offset integer default 0
   ) returns jsonb language plpgsql stable as $func$
   begin
    perform bee.check_owner(p_owner);
    if p_owner <> '${owner}'::uuid then raise exception 'Sleep data not assigned to this owner' using errcode='42501'; end if;
    return (select payload from bee.situation_fixture limit 1);
   end;
   $func$;`);
  await db.query('insert into bee.situation_fixture(payload) values($1::jsonb)',[JSON.stringify(sample())]);
  const result=await core();
  assert.equal(result.kind,'kae_situation');
  assert.equal(result.timezone,'America/New_York');
  assert.equal(result.sleep.observed_sessions_starting_24h,2);
  assert.equal(result.sleep.observed_sessions_starting_48h,3);
  assert.equal(result.sleep.observed_minutes_asleep_24h,350,'Recorded actual asleep minutes, not elapsed time');
  assert.equal(result.sleep.observed_minutes_asleep_48h,650);
  assert.equal(result.sleep.multiple_sessions_48h,true);
  assert.equal(result.sleep.longest_observed_episode_minutes_48h,310);
  assert.equal(result.sleep.main_episode_comparison,'longest_observed_episode_within_usual_main_sleep_range');
  assert.equal(result.sleep.latest_observed_wake_at,'2026-11-26T19:45:00+00:00');
  assert.equal(result.sleep.data_flags.incomplete_coverage,true);
  assert.equal(result.sleep.data_flags.possible_double_count,false);
  assert.equal(result.sleep.source_import.status,'success');
  assert.equal(result.work.usual_shift_window,true);
  assert.equal(result.work.actually_working,null);
  assert.equal(result.work.exceptions_checked,false);
  assert.ok(!JSON.stringify(result).includes('synthetic-source-secret'),'No source IDs or detailed episodes exposed');
  await assert.rejects(()=>core(now,other),/Sleep data not assigned|Owner access denied/);
  await assert.rejects(()=>db.query('select public.bee_kae_situation_snapshot()'),/Not authorized/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const signed=(await db.query('select public.bee_kae_situation_snapshot() as situation')).rows[0].situation;
  assert.equal(signed.kind,'kae_situation');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await assert.rejects(()=>db.query('select public.bee_kae_situation_snapshot()'),/Not authorized/);
  const grants=(await db.query(`
   select
    has_function_privilege('anon','public.bee_kae_situation_snapshot()','EXECUTE') anon,
    has_function_privilege('authenticated','public.bee_kae_situation_snapshot()','EXECUTE') authenticated,
    has_function_privilege('anon','bee.kae_situation_at_20261126(uuid,timestamptz)','EXECUTE') private_anon,
    has_function_privilege('authenticated','bee.kae_situation_at_20261126(uuid,timestamptz)','EXECUTE') private_authenticated,
    has_function_privilege('service_role','bee.kae_situation_at_20261126(uuid,timestamptz)','EXECUTE') private_service
  `)).rows[0];
  assert.deepEqual(grants,{
    anon:false,authenticated:true,private_anon:false,private_authenticated:false,private_service:true
  });
  // The helper is read-only. In particular, no task, reward, memory or sleep records change.
  const counts=await db.query('select count(*)::integer as n from bee.situation_fixture');
  assert.equal(counts.rows[0].n,1);
  const ambiguous=sample();
  ambiguous.daily[2].episodes[0].overlaps=[{id:999}];
  ambiguous.daily[2].episodes[1].minutes_asleep=null;
  ambiguous.import={status:'failure',stale:true,error_code:'source_unavailable'};
  await db.query('update bee.situation_fixture set payload=$1::jsonb',[JSON.stringify(ambiguous)]);
  const uncertain=await core();
  assert.equal(uncertain.sleep.observed_minutes_asleep_24h,null);
  assert.equal(uncertain.sleep.observed_minutes_asleep_48h,null);
  assert.equal(uncertain.sleep.data_flags.missing_minutes,true);
  assert.equal(uncertain.sleep.data_flags.possible_double_count,true);
  assert.equal(uncertain.sleep.data_flags.sync_stale_or_unknown,true);
  assert.equal(uncertain.sleep.source_import.status,'failure','Later failed import does not become earlier success');
  assert.equal(uncertain.sleep.source_import.error_code,'source_unavailable');
  const empty=sample();empty.daily=empty.daily.map(d=>({...d,episodes:[]}));
  await db.query('update bee.situation_fixture set payload=$1::jsonb',[JSON.stringify(empty)]);
  const noObserved=await core();
  assert.equal(noObserved.sleep.observed_sessions_starting_24h,0);
  assert.equal(noObserved.sleep.observed_minutes_asleep_24h,null);
  assert.equal(noObserved.sleep.observed_minutes_asleep_48h,null);
  assert.equal(noObserved.sleep.main_episode_comparison,'unknown');
  assert.equal(noObserved.sleep.data_flags.no_observed_sessions_48h,true);
 }finally{await db.close();}
});

test('usual overnight shift boundaries and off days are labeled unconfirmed in Eastern Time',async()=>{
 const db=new PGlite();
 try{
  await initializeFixture(db,owner,randomUUID());
  await db.exec(`
   create or replace function bee.read_sleep_20261120(
    p_owner uuid,p_query text default '',p_limit integer default 7,p_offset integer default 0
   ) returns jsonb language sql stable as $func$
    select '{"daily":[],"import":{"status":"success","stale":false}}'::jsonb;
   $func$;`);
  const status=async at=>(await db.query('select bee.kae_situation_at_20261126($1,$2) result',[owner,at])).rows[0].result.work;
  const cases=[
   ['2026-11-27T02:29:00Z',false,'Thursday before shift'],
   ['2026-11-27T02:30:00Z',true,'Thursday exact 21:30 start'],
   ['2026-11-27T12:59:00Z',true,'Friday before 08:00 end'],
   ['2026-11-27T13:00:00Z',false,'Friday 08:00 after shift'],
   ['2026-11-30T02:30:00Z',true,'Sunday 21:30 start'],
   ['2026-11-30T12:59:00Z',true,'Monday 07:59 end'],
   ['2026-11-30T13:00:00Z',false,'Monday 08:00 off'],
   ['2026-12-02T03:00:00Z',false,'Tuesday night off'],
   ['2026-03-08T06:59:00Z',true,'spring DST early Sunday morning'],
   ['2026-03-08T07:01:00Z',true,'spring DST after skipped hour']
  ];
  for(const [at,expected,label] of cases){
   const result=await status(at);
   assert.equal(result.usual_shift_window,expected,label);
   assert.equal(result.actually_working,null);
   assert.equal(result.exceptions_checked,false);
  }
 }finally{await db.close();}
});

test('work-compatible suggestions are a reversible preference rather than a ban',()=>{
 const all=[
  {title:'Write a short idea',work_compatible:true},
  {title:'Carry lumber outside',work_compatible:false},
  {title:'Fold a paper basket',work_compatible:true},
  {title:'Inspect roof framing',work_compatible:null}
 ];
 const work={work:{usual_shift_window:true}};
 assert.deepEqual(catalogPoolForSituation(all,work,true).map(x=>x.title),['Write a short idea','Fold a paper basket']);
 assert.equal(catalogPoolForSituation(all,work,false),all,'A deliberate non-work pick is still possible');
 assert.equal(catalogPoolForSituation(all,{work:{usual_shift_window:false}},true),all);
 assert.equal(catalogPoolForSituation(all,{available:false},true),all);
 assert.equal(catalogPoolForSituation(all.filter(x=>!x.work_compatible),work,true).length,2);
});

test('both Edge callers use the same snapshot without rerouting workers or editing Sol memory',()=>{
 const chat=readFileSync(new URL('../supabase/functions/kae-chat/index.ts',import.meta.url),'utf8');
 const three=readFileSync(new URL('../supabase/functions/three-things/index.ts',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/20261126171000_bee_kae_situation.sql',import.meta.url),'utf8');
 assert.match(chat,/db\.rpc\("bee_kae_situation_snapshot"\)/);
 assert.match(three,/db\.rpc\("bee_kae_situation_snapshot"\)/);
 assert.match(chat,/const situation=situationResult.error\|\|!situationResult.data/);
 assert.match(three,/const situation=situationResult.error\|\|!situationResult.data/);
 assert.match(chat,/const memoryGuidance=curatedMemory/);
 assert.match(chat,/Dawn and you live ordinary, continuing lives/);
 assert.match(chat,/const estateGlimpse=JSON.stringify\(\{\s*situation,/);
 assert.match(three,/const context=\{situation,/);
 assert.match(three,/catalogPoolForSituation\(available,situation,preferWorkPool\)/);
 assert.match(three,/findSuggestionCollision\(item,openTasks.data\|\|\[\],recentTitlesToAvoid,accepted\)/);
 assert.match(migration,/public\.bee_kae_situation_snapshot/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/grant execute on function public\.bee_kae_situation_snapshot\(\) to authenticated/);
 assert.doesNotMatch(migration,/create table public\.sleep_/i);
 assert.doesNotMatch(migration,/insert into public\.tasks/i);
});
