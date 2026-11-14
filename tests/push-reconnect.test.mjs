import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf("el('timer-enable-push').onclick=async()=>{");
const end=html.indexOf("el('timer-disable-push').onclick=",start);
assert.ok(start>0&&end>start,'notification registration handler exists');
const enable=html.slice(start,end);

test('valid saved push endpoint is reused without rotation',()=>{
 assert.match(enable,/if\(subscription\)\{/);
 assert.match(enable,/if\(!saved\)\{/);
 assert.match(enable,/\.eq\('owner_id',user\.id\)\.eq\('endpoint',subscription\.endpoint\)/);
 assert.match(enable,/if\(!subscription\)subscription=await registration\.pushManager\.subscribe/);
});
test('missing saved endpoint rotates only after explicit Enable',()=>{
 assert.match(enable,/const removed=await subscription\.unsubscribe\(\)/);
 assert.match(enable,/if\(!removed\)throw Error/);
 assert.match(enable,/subscription=null/);
 assert.ok(enable.indexOf('if(!saved)')<enable.indexOf('subscription=null'));
});
test('failed lookup or missing sign-in does not mutate subscription',()=>{
 assert.ok(enable.indexOf("if(authError||!user)throw")<enable.indexOf('subscription.unsubscribe()'));
 assert.ok(enable.indexOf('if(lookupError)throw')<enable.indexOf('subscription.unsubscribe()'));
});
test('failed registration or upsert cannot claim success',()=>{
 assert.match(enable,/if\(error\)throw error/);
 assert.ok(enable.indexOf('if(error)throw error')<enable.indexOf("timerPushStatus('Phone notifications connected."));
 assert.match(enable,/catch\(err\)\{timerPushStatus\('Could not enable phone alerts:/);
});
