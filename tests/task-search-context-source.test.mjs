import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const selector=readFileSync(new URL('../js/task-selection.js',import.meta.url),'utf8');

test('task search includes nullable task location and category alongside existing fields',()=>{
 assert.ok(html.includes("search:el('task-search').value"),'Browser must supply search to task selector');
 const match=selector.match(/const matches=t=>!needle\|\|\[([^\]]+)\]/);
 assert.ok(match,'task search should retain the five source fields');
 const fields=match[1].split(',').map(s=>s.trim());
 for(const field of ['t.title','t.instructions','t.completion_notes','t.task_location','t.task_category']){
  assert.ok(fields.includes(field),'missing search field: '+field);
 }
 assert.match(selector,/\.some\(v=>\(v\|\|''\)\.toLowerCase\(\)\.includes\(needle\)\)/,'Search must retain case-insensitive nullable-safe matching');
});
