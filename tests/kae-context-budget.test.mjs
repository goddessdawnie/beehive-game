import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';
import {recentConversationMessages,compactRecentTaskActivity,explicitlyResumesOlderTopic} from '../supabase/functions/kae-chat/history-context.js';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const at=Date.parse('2026-11-28T03:00:00Z');
const msg=(role,content,ageHours)=>({role,content,created_at:new Date(at-ageHours*3600000).toISOString()});
test('48h AND 6500-character budget reduce recurring history while retaining the last exchange and roles',()=>{
 const rows=Array.from({length:12},(_,i)=>msg(i%2?'mochi':'user','Detailed continuity '+String(i).repeat(1400),1+i/4));
 const unbounded=recentConversationMessages(rows);
 const bounded=recentConversationMessages(rows,12,{now:at,maxAgeHours:48,maxChars:6500});
 assert.ok(unbounded.reduce((n,m)=>n+m.content.length,0)>16000);
 assert.ok(bounded.length>0&&bounded.length<12);
 assert.ok(bounded.reduce((n,m)=>n+m.content.length,0)<=6500);
 assert.match(bounded.at(-1).content,/11/,'Newest entry is never lost');
 assert.equal(bounded.at(-1).role,'assistant');
 assert.deepEqual(rows.map(x=>x.content),Array.from({length:12},(_,i)=>'Detailed continuity '+String(i).repeat(1400)));
});
test('ordinary return after a week drops old chat; explicit resumption includes only bounded older context',()=>{
 const rows=[msg('user','The old oiling plan',180),msg('mochi','Be careful with the scales',180),
  msg('user','A more recent unrelated exchange',2),msg('mochi','The weather is dull',2)];
 const fresh=recentConversationMessages(rows,12,{now:at,maxAgeHours:48,maxChars:6500,resumeOlder:false});
 assert.deepEqual(fresh.map(x=>x.role),['user','assistant']);
 assert.ok(fresh.every(x=>!x.content.includes('oiling')));
 const resumed=recentConversationMessages(rows,12,{now:at,maxAgeHours:48,maxChars:6500,resumeOlder:true});
 assert.deepEqual(resumed.map(x=>x.role),['user','assistant','user','assistant']);
 assert.match(resumed[0].content,/oiling plan/);
 assert.equal(explicitlyResumesOlderTopic('Remember when we discussed the oiling?'),true);
 assert.equal(explicitlyResumesOlderTopic('Back to our conversation about scales'),true);
 assert.equal(explicitlyResumesOlderTopic('A regular greeting today'),false);
});
test('old chat alone is omitted on unprompted tap, preserved selectively on explicit continuation',()=>{
 const rows=[msg('user','The thing on Monday',200),msg('mochi','A dragon opinion',200)];
 assert.deepEqual(recentConversationMessages(rows,12,{now:at,maxAgeHours:48,maxChars:6500}),[]);
 assert.equal(recentConversationMessages(rows,12,{now:at,maxAgeHours:48,maxChars:6500,resumeOlder:true}).length,2);
});
test('duplicate routine completions compact by exact note and title; exceptions and reopened tasks survive',()=>{
 const original=[
  {title:'Fed Minnie',status:'completed',completion_notes:'All fine',task_origin:'user',last_activity_at:'2026-11-28T03:00:00Z'},
  {title:'Fed Minnie',status:'completed',completion_notes:'All fine',task_origin:'user',last_activity_at:'2026-11-27T03:00:00Z'},
  {title:'Fed Minnie',status:'completed',completion_notes:'Refused wet food',task_origin:'user'},
  {title:'Fed Minnie',status:'open',completion_notes:'Old completion note',task_origin:'user'},
  {title:'Checked medication',status:'completed',completion_notes:'All fine',task_origin:'user'}
 ];
 const prior=structuredClone(original),result=compactRecentTaskActivity(original);
 assert.equal(result.length,4);
 assert.equal(result[0].repeat_count,2);
 assert.equal(result[0].last_activity_at,'2026-11-28T03:00:00Z');
 assert.equal(result[1].completion_notes,'Refused wet food','Exception is not collapsed into the routine');
 assert.equal(result[2].status,'open','Reopened tasks keep their actual state');
 assert.deepEqual(original,prior,'Never mutate the database packet');
});
test('Edge source preserves curated memory, auth, saved messages, 48h task window and independent personality',()=>{
 const chat=readFileSync(new URL('../supabase/functions/kae-chat/index.ts',import.meta.url),'utf8');
 const ambient=readFileSync(new URL('../supabase/functions/kae-ambient/index.ts',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/migrations/20261128034000_kae_context_budget.sql',import.meta.url),'utf8');
 assert.match(chat,/maxAgeHours:48,maxChars:6500/);
 assert.match(chat,/compactRecentTaskActivity\(taskContext\.tasks\)/);
 assert.match(chat,/db\.rpc\("kae_recent_task_activity"\)/);
 assert.match(chat,/const memoryGuidance=curatedMemory/);
 assert.match(chat,/Dawn's current words and explicit corrections take precedence/);
 assert.match(chat,/You may scold or lecture her IN CHARACTER/);
 assert.match(chat,/\.from\("mochi_messages"\)\.insert\(entries\)/);
 assert.match(chat,/db\.auth\.getUser\(token\)/);
 assert.doesNotMatch(chat,/recentlyFinished|activityNotice/);
 assert.match(ambient,/db\.rpc\("kae_ambient_task_summary"\)/);
 assert.doesNotMatch(ambient,/\.from\("tasks"\)/);
 assert.match(sql,/create or replace function public\.kae_ambient_task_summary/i);
 assert.doesNotMatch(sql,/update public\.tasks|delete from public\.tasks|insert into public\.mochi_messages/i);
});
test('DB compact snapshot omits unused 15-task block, sends 12 owned messages and leaves curated memory untouched',async()=>{
 const db=new PGlite(),other=randomUUID();
 try{
  await initializeFixture(db,owner,other);
  // The synthetic fixture's extra chat tables predate the live grants; mirror
  // authenticated SELECT permissions in this isolated test database only.
  await db.exec('grant select on public.character_profiles,public.mochi_messages,public.mochi_memories,public.pet_state to authenticated');
  await db.query("insert into public.mochi_memories(owner_id,kind,memory_text) values($1,'kae_curated',$2)",[owner,'A valuable long-term friendship']);
  await db.query("insert into public.character_profiles(owner_id,character_name,character_card) values($1,$2,$3)",[owner,'Kae','Cat-sized dragon landlord']);
  for(let i=0;i<19;i++)await db.query("insert into public.mochi_messages(owner_id,role,content,created_at) values($1,$2,$3,$4)",[owner,i%2?'mochi':'user','Message '+i,new Date(at-(19-i)*60000)]);
  await db.query("insert into public.mochi_messages(owner_id,role,content) values($1,'user','Other owner secret')",[other]);
  const before=(await db.query('select count(*)::integer n from public.mochi_messages')).rows[0].n;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const context=(await db.query('select public.mochi_context_snapshot() v')).rows[0].v;
  assert.equal(context.recent_messages.length,12);
  assert.equal(context.recent_messages.at(-1).content,'Message 18');
  assert.equal(context.recent_messages[0].content,'Message 7');
  assert.ok(!('recent_tasks' in context));
  assert.equal(context.remembered_context.text,'A valuable long-term friendship');
  assert.equal(context.character.card,'Cat-sized dragon landlord');
  assert.ok(!JSON.stringify(context).includes('Other owner secret'));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::integer n from public.mochi_messages')).rows[0].n,before);
 }finally{await db.close()}
});
test('ambient RPC preserves exact completed/due counts beyond 100 rows without leaking owner data',async()=>{
 const db=new PGlite(),other=randomUUID();
 try{
  await initializeFixture(db,owner,other);
  const completed=async(who,title,at)=>db.query("insert into public.tasks(owner_id,title,status,completed_at,updated_at) values($1,$2,'completed',$3,$3)",[who,title,at]);
  const open=async(who,title,due)=>db.query("insert into public.tasks(owner_id,title,status,due_at) values($1,$2,'open',$3)",[who,title,due]);
  for(let i=0;i<105;i++)await completed(owner,'Routine '+i,new Date(Date.now()-3600000));
  await completed(owner,'Older done',new Date(Date.now()-6*86400000));
  await completed(other,'Private completion',new Date());
  await open(owner,'Overdue',new Date(Date.now()-3600000));
  await open(owner,'Later today or tomorrow',new Date(Date.now()+72*3600000));
  await open(other,'Other owner overdue',new Date(Date.now()-3600000));
  const before=(await db.query('select count(*)::integer n from public.tasks')).rows[0].n;
  const grants=(await db.query("select has_function_privilege('anon','public.kae_ambient_task_summary()','EXECUTE') anon,has_function_privilege('authenticated','public.kae_ambient_task_summary()','EXECUTE') signed")).rows[0];
  assert.deepEqual(grants,{anon:false,signed:true});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const summary=(await db.query('select public.kae_ambient_task_summary() v')).rows[0].v;
  assert.equal(Number(summary.completed_last_3_hours),105);
  assert.equal(Number(summary.completed_last_6_hours),105);
  assert.equal(Number(summary.completed_last_24_hours),105);
  assert.equal(Number(summary.overdue_tasks),1);
  assert.equal(Number(summary.open_due_today_or_overdue),1);
  assert.equal(summary.recent_completed.length,3);
  assert.ok(!JSON.stringify(summary).includes('Private completion'));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await db.exec('set role authenticated');
  const foreign=(await db.query('select public.kae_ambient_task_summary() v')).rows[0].v;
  assert.equal(Number(foreign.completed_last_24_hours),1);
  assert.equal(Number(foreign.overdue_tasks),1);
  assert.ok(!JSON.stringify(foreign).includes('Routine'));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::integer n from public.tasks')).rows[0].n,before);
 }finally{await db.close()}
});
