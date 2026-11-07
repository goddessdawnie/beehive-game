// Integration against a disposable local PostgREST instance only.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
const exec=promisify(execFile);
export async function testRest(db,url,owner,other){
 const container='bee-rest-'+randomUUID();
 const role='bee_auth_'+randomUUID().replaceAll('-','');
 const secret=randomUUID()+randomUUID(),password=randomUUID();
 const connection=new URL(url);connection.username=role;connection.password=password;
 const token=sub=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const data=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub,role:'authenticated',exp:Math.floor(Date.now()/1000)+300});
  return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
 };
 const request=async(path,sub,body,headers={})=>{
  const r=await fetch('http://127.0.0.1:3001/'+path,{method:body?'POST':'GET',headers:{...(sub?{Authorization:'Bearer '+token(sub)}:{}),'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  return {status:r.status,data:await r.json()};
 };
 await db.query(`create role ${role} login noinherit password '${password}'`);
 try{
  await db.query(`grant authenticated,anon to ${role}`);
  await exec('docker',['run','--rm','-d','--name',container,'--network','host',
   '-e','PGRST_DB_URI='+connection.toString(),'-e','PGRST_DB_SCHEMAS=public',
   '-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+secret,
   '-e','PGRST_SERVER_HOST=127.0.0.1','-e','PGRST_SERVER_PORT=3001','postgrest/postgrest:v12.2.3']);
  let ready=false;
  for(let i=0;i<60;i++){
   try{const r=await request('',null);if(r.status===200){ready=true;break;}}catch{}
   await delay(250);
  }
  assert.ok(ready,'Local REST server ready');
  const id=randomUUID();
  const task=(await db.query("select bee.command($1,$2,'task.create',$3) value",[owner,id,{title:'HTTP completion',difficulty:'tiny'}])).rows[0].value.result;
  assert.deepEqual((await request('tasks?id=eq.'+task.id,other)).data,[]);
  const anon=await request('tasks?id=eq.'+task.id,null);assert.ok([401,403].includes(anon.status));
  const denied=await request('rpc/complete_task_with_notes',other,{p_task_id:task.id,p_notes:'Wrong owner'});assert.ok(denied.status>=400);
  const completed=await request('rpc/complete_task_with_notes',owner,{p_task_id:task.id,p_notes:'HTTP verified'});
  assert.equal(completed.status,200,JSON.stringify(completed.data));
  assert.equal(completed.data.status,'completed');
  assert.equal((await db.query('select count(*)::int n from reward_ledger where task_id=$1',[task.id])).rows[0].n,1);
  const undo=await request('rpc/set_task_status',owner,{p_task_id:task.id,p_status:'open'});assert.equal(undo.status,200);
  assert.equal((await db.query('select count(*)::int n from reward_ledger where task_id=$1',[task.id])).rows[0].n,0);
  await db.query("select bee.command($1,$2,'game.set',$3)",[owner,randomUUID(),{game_key:'wordle',enabled:false}]);
  assert.equal((await request('beehive_games?game_key=eq.wordle',owner)).data[0].enabled,false);
  assert.deepEqual((await request('beehive_games',other)).data,[]);
  const hidden=await request('requests',owner,undefined,{'Accept-Profile':'bee'});assert.ok(hidden.status>=400);
  const worker=await request('rpc/beehive_claim_due_timers',owner,{p_limit:20});assert.ok(worker.status>=400);
  // Prior overlap test leaves its synthetic timer sending. Finish only that fixture row.
  await db.query("update beehive_timers set status='sent' where owner_id=$1 and status='sending'",[owner]);
  const started=await request('rpc/beehive_start_timer',owner,{p_seconds:600,p_label:'HTTP timer'});assert.equal(started.status,200,JSON.stringify(started.data));
  const timer=(await db.query("select id from beehive_timers where owner_id=$1 and status='pending'",[owner])).rows[0];
  assert.equal((await request('rpc/beehive_cancel_timer',owner,{p_id:timer.id})).data,true);
  console.log('PASS authenticated HTTP task completion/undo, rewards, timer start/cancel, game reads and access boundaries');
 }finally{
  await exec('docker',['rm','-f',container]).catch(()=>{});
  await db.query(`drop role ${role}`);
 }
}
