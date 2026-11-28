import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {initializeFixture} from './database-fixture.mjs';

const owner='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('browser consumes one reward totals RPC, not a historical ledger scan or duplicate coin reducers',()=>{
 assert.match(html,/db\.rpc\('reward_ledger_totals'\)/);
 assert.doesNotMatch(html,/db\.from\('reward_ledger'\)/);
 assert.doesNotMatch(html,/const shopSpent=\(rewards\.data\|\|\[\]\)\.reduce/);
 assert.match(html,/const earned=Number\(rewardTotals\.data\?\.earned\),ledgerSpent=Number\(rewardTotals\.data\?\.spent\)/);
 assert.match(html,/const spent=ledgerSpent\+\(pet\.care_points\|\|0\)\*5/);
 assert.match(html,/for\(const r of \[tasks,rewardTotals,pets,catalog\]\)/);
 assert.match(html,/!Number\.isSafeInteger\(earned\)/);
 assert.match(html,/!Number\.isSafeInteger\(ledgerSpent\)/);
});

test('authenticated aggregate exactly matches signed ledger arithmetic and isolates owners without writes',async()=>{
 const db=new PGlite(),other=randomUUID();
 try{
  await initializeFixture(db,owner,other);
  const values=[
   [owner,10,'test:credit'],[owner,8,'test:credit'],
   [owner,-4,'test:purchase'],[owner,-2,'test:debit'],
   [owner,0,'test:zero'],
   [other,99,'test:other-credit'],[other,-7,'test:other-debit']
  ];
  for(const [who,delta,reason] of values)
   await db.query('insert into public.reward_ledger(owner_id,coins_delta,reason) values($1,$2,$3)',[who,delta,reason]);
  const before=(await db.query('select owner_id,coins_delta,reason from public.reward_ledger order by owner_id,coins_delta,reason')).rows;
  const grant=(await db.query("select has_function_privilege('anon','public.reward_ledger_totals()','EXECUTE') anon,has_function_privilege('authenticated','public.reward_ledger_totals()','EXECUTE') signed,has_function_privilege('service_role','public.reward_ledger_totals()','EXECUTE') service")).rows[0];
  assert.deepEqual(grant,{anon:false,signed:true,service:true});
  await assert.rejects(()=>db.query('select public.reward_ledger_totals()'),/Authentication required/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  const ownerResult=(await db.query('select public.reward_ledger_totals() as totals')).rows[0].totals;
  assert.deepEqual(ownerResult,{earned:18,spent:6});
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await db.exec('set role authenticated');
  const foreign=(await db.query('select public.reward_ledger_totals() as totals')).rows[0].totals;
  assert.deepEqual(foreign,{earned:99,spent:7});
  await db.exec('reset role');
  const after=(await db.query('select owner_id,coins_delta,reason from public.reward_ledger order by owner_id,coins_delta,reason')).rows;
  assert.deepEqual(after,before,'Read-only totals query may never change ledger history');
 }finally{await db.close()}
});

test('empty ledger is zero and aggregate covers more rows than default PostgREST result caps',async()=>{
 const db=new PGlite(),other=randomUUID();
 try{
  await initializeFixture(db,owner,other);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select public.reward_ledger_totals() as totals')).rows[0].totals,{earned:0,spent:0});
  await db.exec('reset role');
  await db.query(
   "insert into public.reward_ledger(owner_id,coins_delta,reason) select $1,case when i%5=0 then -2 else 3 end,'synthetic:'||i from generate_series(1,1105) as i",[owner]);
  await db.exec('set role authenticated');
  const totals=(await db.query('select public.reward_ledger_totals() as totals')).rows[0].totals;
  assert.deepEqual(totals,{earned:2652,spent:442});
  assert.equal(totals.earned-totals.spent,2210,'Net conservation across over one thousand historical rows');
  await db.exec('reset role');
 }finally{await db.close()}
});
