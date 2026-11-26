import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const selector=readFileSync(new URL('../js/task-selection.js',import.meta.url),'utf8');

test('task context filters remain optional and separate from search after extraction',()=>{
 assert.match(html,/id="task-filter-location"/);
 assert.match(html,/id="task-filter-category"/);
 assert.ok(html.includes("import {selectTaskView} from './js/task-selection.js';"));
 assert.ok(html.includes("locationFilter:el('task-filter-location').value"));
 assert.ok(html.includes("categoryFilter:el('task-filter-category').value"));
 assert.ok(html.includes("search:el('task-search').value"));
 assert.ok(selector.includes("(!location||(t.task_location||'').toLowerCase().includes(location))"));
 assert.ok(selector.includes("(!category||(t.task_category||'').toLowerCase().includes(category))"));
 assert.match(html,/\['task-filter-location','task-filter-category'\]/);
});

test('sender filter stays independent, composable and keeps unknown provenance',()=>{
 assert.match(html,/id="task-filter-origin"/);
 for(const origin of ['user','bee','kae','unknown'])
  assert.ok(html.includes('value="'+origin+'"'));
 assert.ok(html.includes("originFilter:el('task-filter-origin').value"));
 assert.ok(selector.includes("originFilter==='unknown'?!['user','bee','kae'].includes(t.task_origin)"));
 assert.ok(selector.includes("t.task_origin===originFilter"));
 assert.ok(html.includes("el('task-filter-origin').addEventListener('change'"));
});
