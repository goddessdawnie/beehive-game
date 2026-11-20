import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('task search includes nullable task location and category alongside existing fields', () => {
  const match = source.match(/const matches=t=>!search\|\|\[([^\]]+)\]\.some\(v=>\(v\|\|''\)\.toLowerCase\(\)\.includes\(search\)\)/);
  assert.ok(match, 'task search should retain case-insensitive nullable-safe matching');
  const fields = match[1].split(',').map(s => s.trim());
  for (const field of ['t.title', 't.instructions', 't.completion_notes', 't.task_location', 't.task_category']) {
    assert.ok(fields.includes(field), 'missing search field: ' + field);
  }
});
