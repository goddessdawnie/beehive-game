import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const episode=(start,end,minutes,id)=>({
 id,source:'google_health',source_id:'synthetic-source-id-'+id+'-'.repeat(30),
 start_time:start,end_time:end,minutes_asleep:minutes,
 minutes_in_period:minutes+10,elapsed_minutes:minutes+10,overlaps:[]
});
const day=(date,count,minutes,missing,overlap,episodes)=>({
 local_date:date,session_count:count,actual_minutes_asleep:minutes,
 missing_asleep_count:missing,overlapping_session_count:overlap,
 possible_double_count:overlap>0,episodes
});
const base=()=>({
 kind:'sleep',timezone:'America/New_York',
 start_date:'2026-11-19',end_date:'2026-11-21',days_requested:3,
 import:{status:'failure',stale:true,error_code:'synthetic_failure',age_minutes:780,started_at:'2026-11-21T07:00:00Z',coverage_complete:false},
 latest_successful_import:{finished_at:'2026-11-20T08:00:00Z'},
 latest_session_imported_at:'2026-11-21T06:00:00Z',
 daily:[
  day('2026-11-19',2,340,0,0,[
   // The same Eastern start day owns both episodes, even if one crosses midnight.
   episode('2026-11-20T04:50:00Z','2026-11-20T10:00:00Z',290,1),
   episode('2026-11-19T18:00:00Z','2026-11-19T18:50:00Z',50,2)
  ]),
  day('2026-11-20',2,null,1,2,[
   episode('2026-11-20T16:00:00Z','2026-11-20T17:10:00Z',null,3),
   episode('2026-11-20T16:25:00Z','2026-11-20T17:25:00Z',55,4)
  ]),
  day('2026-11-21',0,null,0,0,[])
 ]
});

test('compact read projects detailed private sleep semantics without inventing coverage or discarding flags',async()=>{
 const db=new PGlite();
 try{
  await initializeFixture(db,owner,randomUUID());
  // Fake the already deployed 2026-11-20 detailed read in an isolated PGlite fixture.
  // The production routine remains authoritative; this stub supplies synthetic JSON.
  await db.exec(`
   create table bee.sleep_compact_fixture (payload jsonb);
   create or replace function bee.read_sleep_20261120(
    p_owner uuid,p_query text default '',p_limit integer default 7,p_offset integer default 0
   ) returns jsonb language plpgsql as $$
   begin
    perform bee.check_owner(p_owner);
    if p_owner<>'${owner}'::uuid then raise exception 'Sleep data not assigned to this owner' using errcode='42501'; end if;
    return (select payload from bee.sleep_compact_fixture limit 1);
   end; $$;
  `);
  const sample=base();
  await db.query('insert into bee.sleep_compact_fixture(payload) values($1::jsonb)',[JSON.stringify(sample)]);
  const compact=async id=>(await db.query('select bee.read_sleep_compact_20261126($1,$2,$3,$4) as summary',[id,'2026-11-21',3,0])).rows[0].summary;
  const result=await compact(owner);
  assert.equal(result.kind,'sleep_compact');
  assert.equal(result.timezone,'America/New_York');
  assert.equal(result.days_requested,3);
  assert.equal(result.observed_session_count,4);
  assert.equal(result.days_with_sessions,2);
  assert.equal(result.days_without_sessions,1);
  assert.equal(result.observed_minutes_asleep,null,'Unknown minutes in a recorded episode invalidate the window total');
  assert.equal(result.daily[0].actual_minutes_asleep,340,'Use recorded asleep minutes, not elapsed time');
  assert.equal(result.daily[0].session_count,2,'Naps stay separate and overnight episodes are attributed upstream');
  assert.equal(result.daily[0].latest_wake_at,'2026-11-20T10:00:00+00:00');
  assert.equal(result.latest_wake_at,'2026-11-20T17:25:00+00:00');
  assert.deepEqual(result.data_flags,{
   no_observed_sessions:false,days_without_sessions:true,
   missing_asleep_minutes:true,possible_double_count:true,coverage_complete:false
  });
  assert.equal(result.daily[1].overlapping_session_count,2);
  assert.equal(result.daily[1].possible_double_count,true);
  assert.equal(result.daily[2].actual_minutes_asleep,null,'No rows means unknown, not 0');
  assert.equal(result.import.status,'failure','A later failed import must not look successful');
  assert.equal(result.import.stale,true);
  assert.equal(result.import.error_code,'synthetic_failure');
  assert.equal(result.import.latest_successful_import_at,'2026-11-20T08:00:00Z');
  assert.ok(!JSON.stringify(result).includes('synthetic-source-id'),'No source identifiers or full episodes in compact output');
  assert.ok(JSON.stringify(result).length<JSON.stringify(sample).length,'A genuinely smaller payload');
  await assert.rejects(()=>compact(randomUUID()),/owner|Sleep data not assigned|Invalid/);
  const rights=(await db.query(`
   select has_function_privilege('anon','bee.read_sleep_compact_20261126(uuid,text,integer,integer)','EXECUTE') anon,
          has_function_privilege('authenticated','bee.read_sleep_compact_20261126(uuid,text,integer,integer)','EXECUTE') authenticated,
          has_function_privilege('service_role','bee.read_sleep_compact_20261126(uuid,text,integer,integer)','EXECUTE') service_role
  `)).rows[0];
  assert.equal(rights.anon,false);
  assert.equal(rights.authenticated,false);
  assert.equal(rights.service_role,true);

  const noObservations=base();
  noObservations.daily=noObservations.daily.map(x=>day(x.local_date,0,null,0,0,[]));
  noObservations.import={status:'success',stale:false,coverage_complete:false};
  await db.query('update bee.sleep_compact_fixture set payload=$1::jsonb',[JSON.stringify(noObservations)]);
  const empty=await compact(owner);
  assert.equal(empty.observed_session_count,0);
  assert.equal(empty.observed_minutes_asleep,null);
  assert.equal(empty.latest_wake_at,null);
  assert.equal(empty.data_flags.no_observed_sessions,true);
  assert.equal(empty.data_flags.coverage_complete,false,'Success never proves coverage');

  const overlapsWithCompleteTotals=base();
  overlapsWithCompleteTotals.daily[1].actual_minutes_asleep=145;
  overlapsWithCompleteTotals.daily[1].missing_asleep_count=0;
  await db.query('update bee.sleep_compact_fixture set payload=$1::jsonb',[JSON.stringify(overlapsWithCompleteTotals)]);
  const ambiguous=await compact(owner);
  assert.equal(ambiguous.observed_minutes_asleep,485,'Overlapping recorded minutes stay visible without deduplication');
  assert.equal(ambiguous.data_flags.missing_asleep_minutes,false);
  assert.equal(ambiguous.data_flags.possible_double_count,true,'Warn against double counting even with complete numeric values');
 }finally{await db.close()}
});
