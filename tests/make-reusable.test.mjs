import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function makeTaskReusable('),source.indexOf('function renderPossibilities()'));
test('Make reusable is offered only for open, unlinked Anytime tasks',()=>{
 assert.match(source,/if\(t\.status==='open'\)\{if\(!t\.due_at&&!t\.activity_id\)button\('Make reusable'/);
});
test('user explicitly chooses an existing catalog record or creates new',()=>{
 assert.match(handler,/Create a new Possibility/);
 assert.match(handler,/for\(const a of activities\)choice\.add/);
 assert.match(handler,/choice\.value/);
 assert.match(handler,/db\.from\('activity_catalog'\)\.insert/);
});
test('conversion leaves task fields and rewards untouched',()=>{
 assert.match(handler,/db\.from\('tasks'\)\.update\(\{activity_id:id\}\)/);
 assert.match(handler,/\.eq\('status','open'\)\.is\('activity_id',null\)/);
 assert.doesNotMatch(handler,/reward_coins|set_task_status|complete_task_with_notes|\.delete\(/);
});
test('catalog failure and task-link failure do not report success',()=>{
 assert.match(handler,/if\(created\.error\|\|!created\.data\?\.id\)/);
 assert.match(handler,/if\(linked\.error\|\|!linked\.data\)/);
 assert.match(handler,/Possibility may have been created/);
});
