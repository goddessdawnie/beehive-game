import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const migrationUrl = new URL('../supabase/migrations/20261116170000_task_context_planned_day.sql', import.meta.url);

test('task context migration preserves real due dates, recurrence and legacy origin', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create table public.tasks (
   id integer primary key, task_origin text not null default 'user',
   due_at timestamptz, recurrence_rule text, reward_coins integer,
   constraint task_origin_valid check (task_origin = any (array['user','bee','synthesis','import']::text[]))
  );`);
  await db.exec(`insert into public.tasks(id,task_origin,due_at,recurrence_rule,reward_coins)
   values (1,'user','2026-12-03T15:00:00Z','weekly',7),
          (2,'bee',null,null,2),
          (3,'synthesis',null,null,3),
          (4,'import',null,null,4);`);
  const before = (await db.query('select id,task_origin,due_at,recurrence_rule,reward_coins from public.tasks order by id')).rows;
  const migration = await readFile(migrationUrl,'utf8');
  await db.exec(migration);
  await db.exec(migration); // additive migration must tolerate a retry
  const after = (await db.query('select id,task_origin,due_at,recurrence_rule,reward_coins,task_location,task_category,planned_on from public.tasks order by id')).rows;
  assert.deepEqual(after.map(({task_location,task_category,planned_on,...original})=>original),before);
  assert.ok(after.every(row=>row.task_location===null && row.task_category===null && row.planned_on===null));
  await db.exec("update public.tasks set planned_on='2026-11-16',task_location='Williamsburg',task_category='House' where id=1");
  const chosen=(await db.query('select due_at,planned_on,recurrence_rule,task_origin from public.tasks where id=1')).rows[0];
  assert.equal(chosen.planned_on,'2026-11-16');
  assert.equal(chosen.due_at.toISOString(),'2026-12-03T15:00:00.000Z');
  assert.equal(chosen.recurrence_rule,'weekly');
  assert.equal(chosen.task_origin,'user');
  await db.exec("insert into public.tasks(id,task_origin,task_location) values (5,'kae','Williamsburg')");
  assert.equal((await db.query('select task_origin from public.tasks where id=5')).rows[0].task_origin,'kae');
  await assert.rejects(db.exec("insert into public.tasks(id,task_origin) values (6,'unknown')"),/task_origin_valid/);
  await assert.rejects(db.exec("update public.tasks set task_location='   ' where id=2"),/task_location_nonblank/);
  await assert.rejects(db.exec("update public.tasks set task_category='' where id=2"),/task_category_nonblank/);
 } finally { await db.close(); }
});
