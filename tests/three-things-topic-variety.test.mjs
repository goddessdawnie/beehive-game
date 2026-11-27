import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestionTopics,saturatedSuggestionTopics,findTopicFatigue,findSuggestionCollision} from '../supabase/functions/three-things/suggestion-guard.js';
const edge=readFileSync(new URL('../supabase/functions/three-things/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../js/three-things-ui.js',import.meta.url),'utf8');

const now=new Date('2026-11-27T22:00:00Z');
const recent=[
 {title:'Sweep the stair-bottom fur pile',created_at:'2026-11-21T08:00:00Z',status:'cleared'},
 {title:'Investigate a squashed fur clump behind a stair',created_at:'2026-11-21T07:00:00Z',status:'completed'},
 {title:'Make a felt dragon',created_at:'2026-11-21T06:00:00Z',status:'added'}
];
test('two recent stair themes cause temporary topic cooldown, even when wording/action changes',()=>{
 assert.deepEqual([...saturatedSuggestionTopics(recent,now)],['stair']);
 assert.deepEqual(findTopicFatigue({title:"Anoint one stair's worth of fur with the rubber brush"},recent,'',[],now),
  {kind:'recently overused topic',topic:'stair'});
 assert.equal(findTopicFatigue({title:'Try a paper-pocket craft'},recent,'',[],now),null);
 assert.equal(findSuggestionCollision({title:"Anoint one stair's worth of fur with the rubber brush"},[],recent,[]),null,
  'Ordinary duplicate scoring alone misses topical fixation');
});
test('a Replace excludes the replaced subject for the next suggestion, but not forever',()=>{
 assert.deepEqual(findTopicFatigue({title:'Wipe the other stair'},[],'Sweep the stair-bottom fur pile',[],now),
  {kind:'replaced topic',topic:'stair'});
 assert.equal(findTopicFatigue({title:'Polish one stair'},[],'',[],now),null);
 assert.deepEqual(findTopicFatigue({title:'Wipe the sink'},[],'', [{title:'Check a sink leak'}],now),
  {kind:'same batch topic',topic:'sink'});
});
test('cooldown ends when a topic ages out or sufficient different work is suggested',()=>{
 const stale=recent.map(r=>({...r,created_at:'2026-11-01T10:00:00Z'}));
 assert.equal(saturatedSuggestionTopics(stale,now).size,0);
 const diverse=Array.from({length:12},(_,i)=>({title:'Write a tiny story '+i,created_at:'2026-11-27T21:00:00Z'}));
 assert.equal(saturatedSuggestionTopics([...diverse,...recent],now).has('stair'),false);
 assert.equal(findTopicFatigue({title:'Sweep some stairs'},stale,'',[],now),null);
});
test('topic key uses physical area, not blanket cleaning ban or generic movement steps',()=>{
 assert.deepEqual([...suggestionTopics('Staircase feline fur')],['stair']);
 assert.deepEqual([...suggestionTopics('Take three steps to make a paper envelope')],[]);
 assert.equal(findTopicFatigue({title:'Clean the bathroom sink'},recent,'',[],now),null);
 assert.equal(findTopicFatigue({title:'Draw an original dragon'},recent,'',[],now),null);
});
test('client forwards replaced title and Edge Function blocks overused catalog and generated outputs',()=>{
 assert.ok(ui.includes('await generateThree(1,item.title);return;'));
 assert.ok(ui.includes('replaced_title:replacedTitle.slice(0,250)'));
 assert.ok(edge.includes('const cooledTopics=saturatedSuggestionTopics(history.data||[],now);'));
 assert.ok(edge.includes('const freshCatalog=available.filter('));
 assert.ok(edge.includes('catalogPoolForSituation(freshCatalog,situation,preferWorkPool)'));
 assert.ok(edge.includes('||findTopicFatigue(item,history.data||[],replacedTitle,accepted,now)'));
 assert.ok(edge.includes('const varietyNote=excludedTopics.size?'));
 assert.ok(edge.includes('db.from("three_things").insert('));
});
