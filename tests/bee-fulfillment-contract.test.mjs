import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../plugins/bee');
const load=path=>readFileSync(resolve(root,path),'utf8');

test('Bee fulfillment contract requires stable receipt ID, exact state, and distinct delivery proof',()=>{
 const skill=load('skills/beehive/SKILL.md');
 const ops=load('skills/beehive/references/operations.md');
 assert.match(skill,/fulfillment verification matrix/);
 assert.match(skill,/A queued bell is not a handset receipt/);
 assert.match(ops,/Request fulfillment: receipt, state, delivery/);
 assert.match(ops,/reuse the identical UUID, operation and complete payload/);
 assert.match(ops,/does not echo the payload/);
 assert.match(ops,/read\('.*'request'/);
 for(const operation of ['task.create','task.delete','task.complete','possibility.activate',
 'timer.cancel','reminder.create','schedule.create','game.set','notification.send','memory.replace']){
  assert.ok(ops.includes('`'+operation+'`'),'Missing proof rule for '+operation);
 }
 assert.match(ops,/absence alone does not establish which action happened/);
 assert.match(ops,/accepted but final state unverified/);
 assert.match(ops,/not proof.*phone alerted/);
 assert.match(ops,/not push service acceptance or handset receipt/);
 assert.match(ops,/do not run a full database sweep/);
});
