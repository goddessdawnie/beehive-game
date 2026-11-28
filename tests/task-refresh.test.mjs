import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTaskRefresh,readTaskSnapshot,TASK_SNAPSHOT_FIELDS} from '../js/task-refresh.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('task refresh controller is the sole owner of snapshot and queue lifecycle',()=>{
 for(const phrase of [
  "import {createTaskRefresh,readTaskSnapshot} from './js/task-refresh.js';",
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
 assert.ok(html.includes("readTaskSnapshot(db)"));
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

test('queued scoped task mutations coalesce, but full estate refresh wins over a task-only refresh',async()=>{
 const seen=[];
 let releaseFirst,secondDone;
 const hold=new Promise(resolve=>{releaseFirst=resolve});
 const finished=new Promise(resolve=>{secondDone=resolve});
 const manager=createTaskRefresh({onDiscard:()=>{},run:async scope=>{
  seen.push(scope);
  if(seen.length===1)await hold;
  else secondDone();
 }});
 const first=manager.load('tasks');
 await manager.load('tasks');
 await manager.load('full');
 await manager.load('tasks');
 releaseFirst();
 await first;
 await finished;
 assert.deepEqual(seen,['tasks','full'],'Full refresh is never downgraded by later task edits');
});
test('task-only scope remains task-only when no full reload is waiting',async()=>{
 const seen=[];
 let releaseFirst,secondDone;
 const hold=new Promise(resolve=>{releaseFirst=resolve});
 const finished=new Promise(resolve=>{secondDone=resolve});
 const manager=createTaskRefresh({onDiscard:()=>{},run:async scope=>{
  seen.push(scope);
  if(seen.length===1)await hold;
  else secondDone();
 }});
 const first=manager.load('tasks');
 await manager.load('tasks');
 await manager.load('tasks');
 releaseFirst();
 await first;
 await finished;
 assert.deepEqual(seen,['tasks','tasks']);
 await assert.rejects(()=>manager.load('impossible'),/Unsupported refresh scope/);
});
test('non-reward task mutations use scoped refresh, while reward/status and explicit refresh remain full',()=>{
 for(const assertion of [
  "run:scope=>scope==='tasks'?loadTaskSnapshot():loadInner()",
  "const refreshTasks=()=>load('tasks')",
  "if(!user||taskRefresh.owner!==user.id||taskRefresh.snapshot===null)",
  "if(generation!==taskRefresh.generation)return",
  "notice(error?.message||'Today selection updated');if(!error)await refreshTasks()",
  "notice(r.error?.message||'Task updated');if(!r.error)await refreshTasks()",
  "notice(r.error?.message||'Added to Anytime');if(!r.error)",
  "await refreshTasks()",
  "el('refresh').onclick=load",
  "db.rpc('roll_forward_daily_tasks')",
  "db.rpc('kae_refresh_comfort')",
  "await load()"
 ])assert.ok(html.includes(assertion),assertion);
 assert.match(html,/async function loadTaskSnapshot\(\)[\s\S]*?db\.rpc\('roll_forward_daily_tasks'\)[\s\S]*?const tasks=await readTaskSnapshot\(db\)/);
 assert.match(html,/async function loadInner\(\)[\s\S]*?db\.rpc\('reward_ledger_totals'\)/);
 assert.doesNotMatch(html,/db\.from\('reward_ledger'\)/,'Full estate refresh must not download ledger history');
});

test('DOM refresh click arguments safely perform a full refresh',async()=>{
 const seen=[];
 const manager=createTaskRefresh({run:async scope=>{seen.push(scope)},onDiscard:()=>{}});
 await manager.load({type:'click'});
 assert.deepEqual(seen,['full']);
});

test('session loss is routed to the existing full auth-clear path before an error can strand stale tasks',()=>{
 const scoped=html.slice(html.indexOf('async function loadTaskSnapshot()'),html.indexOf('async function loadInner()'));
 assert.ok(scoped.indexOf('if(!user||')>=0);
 assert.ok(scoped.indexOf('if(!user||')<scoped.indexOf('if(authError)'));
 assert.match(scoped,/await loadInner\(\)/);
});


// Fake Data API supports the exact query chain, owner-visible count and
// descending timestamp+UUID keyset. It does not write any production records.
function fakeDb(records,{cap=1000,failPage=0,omitCount=false}={}){
 const calls=[];
 const ordered=[...records].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
 return {calls,from(table){
  assert.equal(table,'tasks');
  const q={
   fields:null,options:{},sort:[],max:null,cursor:null,
   select(fields,options={}){this.fields=fields;this.options=options;return this},
   order(field,options){this.sort.push([field,options.ascending]);return this},
   limit(n){this.max=n;return this},
   or(filter){this.cursor=filter;return this},
   then(resolve,reject){
    calls.push({fields:this.fields,options:this.options,sort:this.sort,limit:this.max,filter:this.cursor});
    if(calls.length===failPage)return Promise.resolve({data:null,error:new Error('offline')}).then(resolve,reject);
    assert.deepEqual(this.sort,[['created_at',false],['id',false]]);
    let subset=ordered;
    if(this.cursor){
     const match=/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([^)]+)\)$/.exec(this.cursor);
     assert.ok(match,'invalid cursor: '+this.cursor);
     assert.equal(match[1],match[2]);
     subset=subset.filter(row=>Date.parse(row.created_at)<Date.parse(match[1])||(row.created_at===match[1]&&row.id<match[3]));
    }
    const data=subset.slice(0,Math.min(this.max,cap)).map(row=>Object.fromEntries(this.fields.split(',').map(field=>[field,row[field]??null])));
    const count=this.options.count==='exact'&&!omitCount?ordered.length:null;
    return Promise.resolve({data,error:null,count}).then(resolve,reject);
   }
  };
  return q;
 }};
}

test('one 18-field task reader replaces BOTH browser queries, retaining historical search and recurrence fields',()=>{
 const fields=TASK_SNAPSHOT_FIELDS.split(',');
 assert.equal(fields.length,18);
 assert.ok(!fields.includes('owner_id'));
 assert.ok(!fields.includes('updated_at'));
 for(const name of ['title','status','created_at','completed_at','due_at','planned_on','recurrence_series_id','restarted_at','instructions','completion_notes','task_origin','activity_id','task_location','task_category'])assert.ok(fields.includes(name),name);
 assert.equal(html.split('readTaskSnapshot(db)').length-1,2);
 assert.doesNotMatch(html,/db\.from\('tasks'\)\.select\('\*'\)/);
});

test('current 256-sized history needs one request, returns full text but not unused fields',async()=>{
 const row={id:'00000000-0000-0000-0000-000000000001',created_at:'2026-11-25T11:15:02.123456+00:00',
  title:'Searchable history',status:'completed',instructions:'all instructions',completion_notes:'full notes',
  recurrence_series_id:'series',owner_id:'not-projected',updated_at:'not-projected'};
 const db=fakeDb([row]);
 const res=await readTaskSnapshot(db);
 assert.equal(res.error,null);
 assert.equal(res.data.length,1);
 assert.equal(res.data[0].completion_notes,'full notes');
 assert.equal(res.data[0].instructions,'all instructions');
 assert.equal(res.data[0].recurrence_series_id,'series');
 assert.ok(!('owner_id' in res.data[0]));
 assert.ok(!('updated_at' in res.data[0]));
 assert.equal(db.calls.length,1);
 assert.equal(db.calls[0].options.count,'exact');
 assert.equal(db.calls[0].limit,500);
});

test('keyset paging returns all 1,205 task IDs and tied microsecond timestamp records',async()=>{
 const stamp='2026-11-25T11:15:02.123456+00:00';
 const rows=Array.from({length:1205},(_,i)=>({
  id:'00000000-0000-0000-0000-'+String(i).padStart(12,'0'),
  created_at:i%3===0?stamp:'2026-11-'+(26+i%2)+'T11:15:02.123456+00:00',
  status:i<900?'completed':'open',title:'Task '+i,
  instructions:'Instructions '+i,completion_notes:'Note '+i
 }));
 const db=fakeDb(rows);
 const result=await readTaskSnapshot(db);
 assert.equal(result.error,null);
 assert.equal(result.data.length,1205);
 assert.deepEqual(new Set(result.data.map(t=>t.id)),new Set(rows.map(t=>t.id)));
 assert.equal(result.data.filter(x=>x.status==='completed').length,900);
 assert.equal(result.data.find(x=>x.id===rows[1204].id).completion_notes,'Note 1204');
 assert.equal(db.calls.length,3);
 assert.deepEqual(db.calls.map(x=>x.options.count),['exact',undefined,undefined]);
 assert.ok(db.calls.slice(1).some(x=>x.filter.includes(stamp)),'exact timestamp preserved, no millisecond rounding');
});

test('failed pages, lower server caps and missing exact counts fail closed without partial history',async()=>{
 const rows=Array.from({length:601},(_,i)=>({id:'00000000-0000-0000-0000-'+String(i).padStart(12,'0'),created_at:'2026-11-27T00:00:00.123456+00:00',status:'completed',title:'Task '+i}));
 const partial=await readTaskSnapshot(fakeDb(rows,{failPage:2}));
 assert.equal(partial.data,null);
 assert.match(partial.error.message,/offline/);
 const capped=await readTaskSnapshot(fakeDb(rows,{cap:250}));
 assert.equal(capped.data,null);
 assert.match(capped.error.message,/incomplete/);
 const missing=await readTaskSnapshot(fakeDb(rows,{omitCount:true}));
 assert.equal(missing.data,null);
 assert.match(missing.error.message,/incomplete/);
 await assert.rejects(()=>readTaskSnapshot(fakeDb([]),{pageSize:501}),/Invalid task snapshot page size/);
 assert.deepEqual((await readTaskSnapshot(fakeDb([]))).data,[]);
});
