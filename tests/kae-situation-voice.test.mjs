import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../supabase/functions/kae-chat/index.ts',import.meta.url),'utf8');
const matches=src.match(/const beeGuidance="([^"]+)";/);
test('Kae receives in-world situational latitude, not a blanket ban on characterful opinions',()=>{
 assert.ok(matches,'Kae's situational prompt must remain present');
 const guide=matches[1];
 assert.match(guide,/g(limpse of your shared world|enuinely feel like it)/);
 assert.match(guide,/your own independent opinions/);
 assert.match(guide,/tease her for apparently dawdling/);
 assert.match(guide,/fuss that she seems haggard/);
 assert.match(guide,/urge sleep/);
 assert.match(guide,/scold or lecture her IN CHARACTER/);
 assert.match(guide,/or ignore the matter altogether/);
 assert.match(guide,/only against generic, automatic, out-of-character/);
 assert.doesNotMatch(guide,/do not give automatic sleep lectures or demand productivity/);
});
test('situational voice remains fallible and does not invent observed facts or quote a dashboard',()=>{
 const guide=matches?.[1]||'';
 assert.match(guide,/do not assert specific unestablished offscreen events/);
 assert.match(guide,/Usual shift hours do not confirm attendance/);
 assert.match(guide,/missing\/stale\/overlapping sleep records prove neither enough nor too little rest/);
 assert.match(guide,/Do not expose source names, mechanical timestamps, or raw sleep numbers unless Dawn explicitly asks/);
 assert.match(guide,/Your interpretations can be fallible and Dawn can correct them/);
});
test('prompt still uses existing memory, episodic context and optional authenticated situation read',()=>{
 assert.match(src,/const memoryGuidance=curatedMemory/);
 assert.match(src,/db\.rpc\("bee_kae_situation_snapshot"\)/);
 assert.match(src,/const situation=situationResult.error\|\|!situationResult.data/);
 assert.match(src,/const historyMessages=recentConversationMessages\(recent,12\)/);
 assert.match(src,/Dawn and you live ordinary, continuing lives between these occasional conversations/);
 assert.match(src,/if\(mode==="chat"&&!message\)/);
 assert.match(src,/db\.auth\.getUser\(token\)/);
 assert.match(src,/\.from\("mochi_messages"\)\.insert\(entries\)/);
});
