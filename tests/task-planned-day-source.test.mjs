import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('planned-today selection is independent of due dates',()=>{
 assert.match(source,/const plannedDay=new Intl\.DateTimeFormat\('en-CA',\{timeZone:'America\/New_York'/);
 assert.match(source,/const chosen=t\.planned_on===plannedDay/);
 assert.match(source,/if\(tab==='today'\)return chosen\|\|/);
 assert.match(source,/if\(tab==='anytime'\)return !chosen&&!t\.due_at/);
 assert.match(source,/return !chosen&&!!t\.due_at/);
 assert.match(source,/\.update\(\{planned_on:t\.planned_on===plannedDay\?null:plannedDay,updated_at:/);
 assert.doesNotMatch(source,/\.update\(\{planned_on:[^}]*due_at:/);
});
