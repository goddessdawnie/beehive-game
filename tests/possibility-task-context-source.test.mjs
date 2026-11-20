import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("add.textContent='Add to Anytime'");
const end = html.indexOf("const edit=document.createElement('button')", start);
const handler = html.slice(start, end);

test('Possibility Add to Anytime preserves category and all locations', () => {
  assert.ok(start > 0 && end > start, 'Add to Anytime handler found');
  assert.match(handler, /task_category:a\.category\|\|null/);
  assert.match(handler, /task_location:\(a\.locations\|\|\[\]\)\.map\(x=>String\(x\)\.trim\(\)\)\.filter\(Boolean\)\.join\(', '\)\|\|null/);
  assert.match(handler, /task_origin:'user'/);
  assert.doesNotMatch(handler, /task_location:\s*a\.locations\[0\]/);
});

test('Possibility source metadata is not mutated by task creation', () => {
  assert.doesNotMatch(handler, /a\.locations\s*=/);
  assert.doesNotMatch(handler, /a\.category\s*=/);
});
