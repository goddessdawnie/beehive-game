import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {easternCalendarDay} from '../js/task-selection.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const selector=readFileSync(new URL('../js/task-selection.js',import.meta.url),'utf8');

test('planned-today selection is independent of due dates',()=>{
 assert.match(selector,/const plannedDay=easternCalendarDay\(now\)/);
 assert.match(selector,/const chosen=t\.planned_on===plannedDay/);
 assert.match(selector,/if\(tab==='today'\)return chosen\|\|/);
 assert.match(selector,/if\(tab==='anytime'\)return !chosen&&!t\.due_at/);
 assert.match(selector,/return !chosen&&!!t\.due_at/);
 assert.match(html,/\.update\(\{planned_on:t\.planned_on===plannedDay\?null:plannedDay,updated_at:/);
 assert.doesNotMatch(html,/\.update\(\{planned_on:[^}]*due_at:/);
 assert.ok(html.includes("import {selectTaskView} from './js/task-selection.js';"));
});

test('Eastern planned-day ISO format handles midnight, DST and host locale independently',()=>{
 for(const [utc,expected] of [
  ['2026-11-17T02:00:00Z','2026-11-16'],
  ['2026-03-08T04:30:00Z','2026-03-07'],
  ['2026-03-08T07:30:00Z','2026-03-08'],
  ['2026-11-01T05:30:00Z','2026-11-01'],
  ['2026-11-01T06:30:00Z','2026-11-01']
 ])assert.equal(easternCalendarDay(new Date(utc)),expected);
});
