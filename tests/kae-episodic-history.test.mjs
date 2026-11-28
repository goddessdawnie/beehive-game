import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {easternHistoryStamp,recentConversationMessages} from '../supabase/functions/kae-chat/history-context.js';

const item=(role,content,created_at)=>({role,content,created_at});

test('compact Eastern markers convert UTC into local calendar dates without changing roles',()=>{
 assert.equal(easternHistoryStamp('2026-11-19T02:14:00Z'),'[11/18 21:14]');
 assert.equal(easternHistoryStamp('2026-11-26T16:34:00Z'),'[11/26 11:34]');
 assert.equal(easternHistoryStamp('2026-07-06T01:03:00Z'),'[07/05 21:03]');
 assert.equal(easternHistoryStamp('2026-03-08T06:59:00Z'),'[03/08 01:59]');
 assert.equal(easternHistoryStamp('2026-03-08T07:01:00Z'),'[03/08 03:01]');
 assert.equal(easternHistoryStamp('2026-11-01T05:45:00Z'),'[11/01 01:45]');
 assert.equal(easternHistoryStamp('2026-11-01T06:45:00Z'),'[11/01 01:45]');
});

test('same-visit followups retain original content, authors and ordering',()=>{
 const source=[
  item('user','I brought oil for your scales','2026-11-26T16:11:00Z'),
  item('mochi','You may proceed. Carefully.','2026-11-26T16:13:00Z'),
  item('user','How much should I use?','2026-11-26T16:14:00Z')
 ];
 const result=recentConversationMessages(source);
 assert.deepEqual(result,[
  {role:'user',content:'[11/26 11:11] I brought oil for your scales'},
  {role:'assistant',content:'[11/26 11:13] You may proceed. Carefully.'},
  {role:'user',content:'[11/26 11:14] How much should I use?'}
 ]);
 assert.equal(source[0].content,'I brought oil for your scales','Never alter stored messages');
});

test('multi-day unrelated return is dated history, never an implied ongoing action',()=>{
 const source=[
  item('mochi','I shall wait here for my scales to be oiled.','2026-11-18T22:14:00Z'),
  item('user','I just found a lovely little acorn today.','2026-11-21T22:14:00Z')
 ];
 const result=recentConversationMessages(source);
 assert.deepEqual(result.map(x=>x.content),[
  '[11/18 17:14] I shall wait here for my scales to be oiled.',
  '[11/21 17:14] I just found a lovely little acorn today.'
 ]);
 assert.equal(result[1].role,'user');
});

test('explicit resumption remains possible without falsely carrying conversation state',()=>{
 const source=[
  item('user','We talked about oiling your scales on Wednesday. Could we do that now?','2026-11-21T22:14:00Z')
 ];
 assert.deepEqual(recentConversationMessages(source),[
  {role:'user',content:'[11/21 17:14] We talked about oiling your scales on Wednesday. Could we do that now?'}
 ]);
});

test('undated or invalid legacy records keep their text with no fabricated timestamps',()=>{
 const source=[
  item('user','Old handwritten entry',undefined),
  item('mochi','Older reply without a date',null),
  item('user','Invalid recorded date','date unknown'),
  item('mochi','[11/18 21:14] Already tagged','2026-11-19T02:14:00Z')
 ];
 assert.deepEqual(recentConversationMessages(source),[
  {role:'user',content:'Old handwritten entry'},
  {role:'assistant',content:'Older reply without a date'},
  {role:'user',content:'Invalid recorded date'},
  {role:'assistant',content:'[11/18 21:14] Already tagged'}
 ]);
 for(const unknown of [null,undefined,'','not-a-date'])assert.equal(easternHistoryStamp(unknown),null);
});

test('history is bounded to the last 12 entries without reordering roles',()=>{
 const rows=Array.from({length:20},(_,i)=>item(i%2?'mochi':'user','item-'+i,'2026-11-26T16:00:00Z'));
 const result=recentConversationMessages(rows);
 assert.equal(result.length,12);
 assert.equal(result[0].content,'[11/26 11:00] item-8');
 assert.equal(result[11].content,'[11/26 11:00] item-19');
 assert.equal(result[0].role,'user');
 assert.equal(result[11].role,'assistant');
 assert.equal(recentConversationMessages([]).length,0);
});

test('deployed episodic policy remains distinct from persistent memory and current user message',()=>{
 const source=readFileSync(new URL('../supabase/functions/kae-chat/index.ts',import.meta.url),'utf8');
 assert.match(source,/import \{ recentConversationMessages \} from "\.\/history-context\.js";/);
 assert.match(source,/const historyMessages=recentConversationMessages\(recent,12,\{/);
 assert.match(source,/maxAgeHours:48,maxChars:6500/);
 assert.match(source,/explicitlyResumesOlderTopic\(message\)/);
 assert.match(source,/\.\.\.historyMessages,/);
 assert.doesNotMatch(source,/historyTiming|historicalTime\(/);
 assert.match(source,/Dawn and you live ordinary, continuing lives between these occasional conversations/);
 assert.match(source,/neither of you is frozen in the last scene/);
 assert.match(source,/If Dawn explicitly resumes an older topic, follow her lead/);
 assert.match(source,/otherwise engage this visit on its own terms/);
 assert.match(source,/Do not guilt her for gaps/);
 assert.match(source,/A wish or unfinished conversation does not become Dawn's obligation/);
 assert.match(source,/const memoryGuidance=curatedMemory/);
 assert.match(source,/Dawn's current words and explicit corrections take precedence/);
 assert.match(source,/role:"user",content:mode==="chat"\?message/);
 assert.match(source,/\.from\("mochi_messages"\)\.insert\(entries\)/);
 assert.match(source,/db\.auth\.getUser\(token\)/);
});
