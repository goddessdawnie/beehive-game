import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isNearDuplicate,findSuggestionCollision} from '../supabase/functions/three-things/suggestion-guard.js';

test('paraphrased stair-fur cleanup is a duplicate of the older open task',()=>{
 const open={title:'Investigate the lump of squashed fur behind a stair'};
 for(const suggestion of [
  'Declare defeat to the squashed fur behind the stair',
  'Sweep squashed fluff by the stairs',
  'Investigate flattened hair behind the staircase'
 ]){
  assert.equal(isNearDuplicate(suggestion,open),true,suggestion);
 }
 assert.equal(isNearDuplicate('Inspect the lump of squashed fur behind a stair',open),true);
});

test('high-confidence repeats of cleaning or repair targets are blocked',()=>{
 assert.equal(isNearDuplicate('Wipe dust from the kitchen shelves','Dust the kitchen shelves'),true);
 assert.equal(isNearDuplicate('Repair the leaking sink faucet','Fix the sink faucet leak'),true);
 assert.equal(isNearDuplicate('Clean the bathroom floor','Mop the bathroom floor'),true);
 assert.equal(isNearDuplicate('Sweep squashed fur behind the stairs','Dust the kitchen shelves'),false);
});

test('intent, different physical targets, and independently scoped tasks remain distinct',()=>{
 const distinct=[
  ['Diagnose the sink leak','Repair the sink leak'],
  ['Investigate the faucet dripping','Replace the faucet dripping'],
  ['Clean kitchen counter near entrance','Clean kitchen floor near entrance'],
  ['Clean a patch of kitchen floor','Clean the entire kitchen floor'],
  ['Wash bathroom mirror','Wash bathroom floor'],
  ['Write a grocery list','Buy the groceries'],
  ['Check the kitchen drain','Check the kitchen faucet']
 ];
 for(const [a,b] of distinct)assert.equal(isNearDuplicate(a,b),false,`${a} versus ${b}`);
});

test('guard checks full owner-scoped open tasks, recent suggestions, and current batch',()=>{
 const open=[{title:'Dust the kitchen shelves'},{title:'Investigate the lump of squashed fur behind a stair'}];
 const history=[{title:'Paint an autumn leaf on a bookmark'}];
 const accepted=[{title:'Wipe the bathroom mirror'}];
 assert.deepEqual(findSuggestionCollision({title:'Wipe dust from the kitchen shelves'},open,history,accepted),
  {kind:'open task',title:'Dust the kitchen shelves'});
 assert.deepEqual(findSuggestionCollision({title:'Paint an autumn leaf on a bookmark'},open,history,accepted),
  {kind:'recent suggestion',title:'Paint an autumn leaf on a bookmark'});
 assert.deepEqual(findSuggestionCollision({title:'Wash the bathroom mirror'},open,history,accepted),
  {kind:'same batch',title:'Wipe the bathroom mirror'});
 assert.equal(findSuggestionCollision({title:'Repair the sink leak'},open,history,accepted),null);
});

test('no duplicate or auth bypass is inserted by the Edge Function when collisions persist',()=>{
 const source=readFileSync(new URL('../supabase/functions/three-things/index.ts',import.meta.url),'utf8');
 assert.match(source,/import \{findSuggestionCollision\} from "\.\/suggestion-guard\.js";/);
 assert.match(source,/\.eq\("owner_id",user\.id\)\.eq\("status","open"\)/);
 assert.match(source,/\.eq\("owner_id",user\.id\)\.order\("created_at"/);
 assert.match(source,/\.select\("title,task_location,task_category,due_at",\{count:"exact"\}\)/);
 assert.match(source,/if\(openTasks\.count===null\|\|openTasks\.count>150\)/);
 assert.match(source,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
 assert.match(source,/collision=findSuggestionCollision\(item,openTasks\.data\|\|\[\],recentTitlesToAvoid,accepted\)/);
 assert.match(source,/if\(attempt===1\)return reply\(\{error:"Could not generate distinct suggestions; please try again"\},409\)/);
 assert.ok(source.indexOf('if(attempt===1)return reply(')<source.indexOf('db.from("three_things").insert('),
  'must block unsafe output before saving suggestions');
 assert.match(source,/db\.auth\.getUser\(token\)/);
 assert.match(source,/\.\.\.x,owner_id:user\.id/);
});
