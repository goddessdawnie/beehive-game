import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaskRefresh} from '../js/task-refresh.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('task refresh controller is the sole owner of snapshot and queue lifecycle',()=>{
 for(const phrase of [
  "import {createTaskRefresh} from './js/task-refresh.js';",
  'const taskRefresh=createTaskRefresh({',
  'const load=taskRefresh.load;',
  'taskRefresh.commit(user.id,tasks.data||[]);',
  'const taskSnapshot=taskRefresh.snapshot;if(taskSnapshot===null)return;',
  "if(taskRefresh.owner!==null&&taskRefresh.owner!==user.id)taskRefresh.discard();",
  "if(event==='SIGNED_OUT'||event==='SIGNED_IN')taskRefresh.discard();",
  "if(!user){taskRefresh.discard();"
 ])assert.ok(html.includes(phrase),phrase);
 for(const stale of ['taskSnapshotGeneration','taskSnapshotOwner','discardTaskSnapshot','let loading=false','reloadRequested']){
  assert.ok(!html.includes(stale),'Old inline lifecycle remains: '+stale);
 }
 assert.ok(html.includes("db.rpc('roll_forward_daily_tasks')"));
 assert.ok(html.includes("db.rpc('kae_refresh_comfort')"));
 assert.ok(html.includes("db.from('tasks').select('*').order('created_at',{ascending:false})"));
 assert.ok(html.includes("el('refresh').onclick=load"));
});

test('refresh coalesces concurrent triggers into one trailing run without overlapping',async()=>{
 let count=0,active=0,maxActive=0,finishFirst,secondFinished;
 const firstHold=new Promise(resolve=>{finishFirst=resolve});
 const secondDone=new Promise(resolve=>{secondFinished=resolve});
 const manager=createTaskRefresh({run:async()=>{
  count++;active++;maxActive=Math.max(maxActive,active);
  if(count===1)await firstHold;
  if(count===2)secondFinished();
  active--;
 },onDiscard:()=>{}});
 const first=manager.load();
 await manager.load();await manager.load();await manager.load();
 assert.equal(count,1);
 finishFirst();await first;await secondDone;
 assert.equal(count,2);
 assert.equal(maxActive,1);
 await manager.load();
 assert.equal(count,3,'later explicit refresh still executes');
});

test('invalidation clears detached data and generation guards stale user reads',async()=>{
 const clears=[];
 let finish,observed;
 const hold=new Promise(resolve=>{finish=resolve});
 const manager=createTaskRefresh({
  onDiscard:()=>clears.push('cleared'),
  run:async()=>{
   const generation=manager.generation;
   await hold;
   if(generation===manager.generation)manager.commit('old-owner',[{id:'stale'}]);
   observed=manager.snapshot;
  }
 });
 const original=[{id:'task-1',title:'Initial'}];
 manager.commit('owner-a',original);
 original[0].title='Updated without refresh';
 assert.equal(manager.snapshot[0].title,'Initial','Authenticated rows are copied for local filtering');
 assert.equal(manager.owner,'owner-a');
 const pending=manager.load();
 manager.discard();
 assert.equal(manager.generation,1);
 assert.equal(manager.owner,null);
 assert.equal(manager.snapshot,null);
 finish();await pending;
 assert.equal(observed,null,'Stale read cannot repopulate signed-out snapshot');
 manager.commit('owner-b',[{id:'task-b'}]);
 assert.equal(manager.owner,'owner-b');
 manager.discard();
 assert.equal(manager.generation,2);
 assert.equal(manager.snapshot,null);
 assert.deepEqual(clears,['cleared','cleared']);
});
