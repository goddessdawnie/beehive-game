import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('planned-today selection is independent of due dates',()=>{
 assert.match(source,/const plannedDay=easternCalendarDay\(new Date\(\)\)/);
 assert.match(source,/const chosen=t\.planned_on===plannedDay/);
 assert.match(source,/if\(tab==='today'\)return chosen\|\|/);
 assert.match(source,/if\(tab==='anytime'\)return !chosen&&!t\.due_at/);
 assert.match(source,/return !chosen&&!!t\.due_at/);
 assert.match(source,/\.update\(\{planned_on:t\.planned_on===plannedDay\?null:plannedDay,updated_at:/);
 assert.doesNotMatch(source,/\.update\(\{planned_on:[^}]*due_at:/);
});

test('Eastern planned-day ISO format handles midnight, DST and host locale independently',()=>{
 const match=source.match(/const easternCalendarDay=\(instant\)=>\{[^\n]+\};/);
 assert.ok(match,'date helper must be present');
 const easternCalendarDay=runInNewContext(`${match[0]};easternCalendarDay`,{Intl});
 for(const [utc,expected] of [
  ['2026-11-17T02:00:00Z','2026-11-16'],
  ['2026-03-08T04:30:00Z','2026-03-07'],
  ['2026-03-08T07:30:00Z','2026-03-08'],
  ['2026-11-01T05:30:00Z','2026-11-01'],
  ['2026-11-01T06:30:00Z','2026-11-01']
 ])assert.equal(easternCalendarDay(new Date(utc)),expected);
});
