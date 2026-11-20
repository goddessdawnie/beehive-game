import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('task context filters are optional and separate from search', () => {
  assert.match(html, /id="task-filter-location"/);
  assert.match(html, /id="task-filter-category"/);
  assert.match(html, /const locationFilter=el\('task-filter-location'\)\.value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(html, /!locationFilter\|\|\(t\.task_location\|\|''\)\.toLowerCase\(\)\.includes\(locationFilter\)/);
  assert.match(html, /!categoryFilter\|\|\(t\.task_category\|\|''\)\.toLowerCase\(\)\.includes\(categoryFilter\)/);
  assert.match(html, /&&matches\(t\)&&contextMatches\(t\)/);
  assert.match(html, /\['task-filter-location','task-filter-category'\]/);
});

test('sender filter is independent, composable and preserves unknown provenance', () => {
  assert.match(html, /id="task-filter-origin"/);
  for (const origin of ['user','bee','kae','unknown']) assert.match(html, new RegExp('value="'+origin+'"'));
  assert.match(html, /const originFilter=el\('task-filter-origin'\)\.value/);
  assert.match(html, /originFilter==='unknown'\?!\['user','bee','kae'\]\.includes\(t\.task_origin\)/);
  assert.match(html, /t\.task_origin===originFilter/);
  assert.match(html, /&&matches\(t\)&&contextMatches\(t\)/);
  assert.match(html, /el\('task-filter-origin'\)\.addEventListener\('change'/);
});
