import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('manual task creation offers independent optional location and category',()=>{
 assert.match(source,/<input id="task-location"[^>]*aria-label="Task location"/);
 assert.match(source,/<input id="task-category"[^>]*aria-label="Task category"/);
 assert.match(source,/task_location:el\('task-location'\)\.value\.trim\(\)\|\|null/);
 assert.match(source,/task_category:el\('task-category'\)\.value\.trim\(\)\|\|null/);
 assert.match(source,/task_origin:'user'/);
 assert.match(source,/due_at:due\?new Date\(due\)\.toISOString\(\):null/);
 assert.doesNotMatch(source,/task_location:[^,}]*due_at/);
});
