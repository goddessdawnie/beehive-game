import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { initializeFixture } from './database-fixture.mjs';

const owner = '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b';

test('private task context returns bounded owner-scoped open and recently edited tasks', async () => {
  const db = new PGlite();
  const other = randomUUID();
  const read = async (user,open=80,recent=40,days=7) =>
    (await db.query('select bee.read_task_context_20261126($1,$2,$3,$4) as value',
      [user,open,recent,days])).rows[0].value;
  const add = async (user,title,extra={}) => {
    const row = (await db.query(
      "select bee.command($1,$2,'task.create',$3::jsonb) as value",
      [user,randomUUID(),JSON.stringify({title,...extra})]
    )).rows[0].value;
    return row.result.id;
  };
  try {
    await initializeFixture(db,owner,other);
    const ids = {
      completed:await add(owner,'Completed but recently edited'),
      left:await add(owner,'Same timestamp A',{instructions:'x'.repeat(400)}),
      right:await add(owner,'Same timestamp B'),
      old:await add(owner,'Old unchanged open'),
      newest:await add(owner,'New open')
    };
    const foreign=await add(other,'Foreign owner task');
    const yesterday=new Date(Date.now()-24*60*60*1000).toISOString();
    const older=new Date(Date.now()-12*24*60*60*1000).toISOString();
    const newest=new Date(Date.now()-60*60*1000).toISOString();
    for (const id of [ids.completed,ids.left,ids.right]) {
      await db.query('update public.tasks set updated_at=$2 where id=$1',[id,yesterday]);
    }
    await db.query("update public.tasks set status='completed' where id=$1",[ids.completed]);
    await db.query('update public.tasks set updated_at=$2 where id=$1',[ids.old,older]);
    await db.query('update public.tasks set updated_at=$2 where id=$1',[ids.newest,newest]);
    const bounded=await read(owner,2,2,7);
    assert.equal(bounded.api_version,1);
    assert.equal(bounded.open.total,4);
    assert.equal(bounded.open.items.length,2);
    assert.equal(bounded.open.truncated,true);
    assert.equal(bounded.recent.total,4);
    assert.equal(bounded.recent.items.length,2);
    assert.equal(bounded.recent.truncated,true);
    assert.ok(bounded.recent.items.some(x=>x.id===ids.newest));
    const full=await read(owner,10,10,7);
    assert.equal(full.open.truncated,false);
    assert.equal(full.recent.truncated,false);
    assert.deepEqual(new Set(full.open.items.map(x=>x.id)),
      new Set([ids.left,ids.right,ids.old,ids.newest]));
    assert.ok(full.recent.items.some(x=>x.id===ids.completed&&x.status==='completed'));
    assert.ok(!full.recent.items.some(x=>x.id===ids.old));
    assert.ok(!full.open.items.some(x=>x.id===foreign));
    assert.ok(!full.recent.items.some(x=>x.id===foreign));
    const tied=full.recent.items.filter(x=>[ids.left,ids.right].includes(x.id));
    assert.deepEqual(tied.map(x=>x.id),[ids.left,ids.right].sort());
    assert.equal(full.open.items.find(x=>x.id===ids.left).instructions_preview.length,200);
    assert.ok(full.open.items.every(x=>'planned_on' in x && 'activity_id' in x && 'task_origin' in x));
    const different=await read(other,10,10,7);
    assert.equal(different.open.total,1);
    assert.equal(different.open.items[0].id,foreign);
    const detail=(await db.query(
      "select bee.read($1,'tasks','',$2) as value",[owner,ids.left]
    )).rows[0].value;
    assert.equal(detail.length,1);
    assert.equal(detail[0].instructions.length,400);
    const rights=(await db.query(`
      select has_function_privilege('anon','bee.read_task_context_20261126(uuid,integer,integer,integer)','EXECUTE') anon,
             has_function_privilege('authenticated','bee.read_task_context_20261126(uuid,integer,integer,integer)','EXECUTE') authenticated,
             has_function_privilege('service_role','bee.read_task_context_20261126(uuid,integer,integer,integer)','EXECUTE') service_role
    `)).rows[0];
    assert.equal(rights.anon,false);
    assert.equal(rights.authenticated,false);
    assert.equal(rights.service_role,true);
  } finally {
    await db.close();
  }
});
