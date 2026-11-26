import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../plugins/bee');
const load=path=>readFileSync(resolve(root,path),'utf8');

test('Bee plugin source matches installed v0.2.5 manifests and retains connected app',()=>{
 const manifest=JSON.parse(load('plugin.json'));
 const legacy=JSON.parse(load('.codex-plugin/plugin.json'));
 const app=JSON.parse(load('.app.json'));
 assert.equal(manifest.name,'bee');
 assert.equal(manifest.version,'0.2.5');
 assert.equal(legacy.version,manifest.version);
 assert.equal(manifest.skills,'./skills');
 assert.equal(legacy.apps,'./.app.json');
 assert.equal(manifest.extensions['com.openai'].apps,'./.app.json');
 assert.deepEqual(manifest.extensions['com.openai'].interface,legacy.interface);
 assert.equal(app.apps.supabase.id,'asdk_app_69d3e5ee6a708191baa733f7b8931995');
 assert.ok(existsSync(resolve(root,'skills/beehive/references/database-contract.md')));

 const skillPath='skills/beehive/SKILL.md',skill=load(skillPath);
 const references=[...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map(match=>match[1]);
 assert.deepEqual(references.sort(),[
  'references/conversations.md','references/deployed-parity.md','references/operations.md','references/sleep.md'
 ]);
 for(const relative of references){
  const target=resolve(root,dirname(skillPath),relative);
  assert.ok(existsSync(target),`Missing Bee reference: ${relative}`);
  assert.ok(readFileSync(target,'utf8').trim().length>100);
 }
 assert.match(skill,/bee\.read_task_context_20261126/);
 assert.match(skill,/bee\.read_sleep_compact_20261126/);
 assert.match(skill,/bee\.command_core_20261126/);
 assert.match(skill,/Do not change the Work Synthesis/);
});

test('v0.2.5 parity guide exposes new contracts while retaining legacy fallback and safety',()=>{
 const guide=load('skills/beehive/references/deployed-parity.md');
 const old=load('skills/beehive/references/operations.md');
 const sleep=load('skills/beehive/references/sleep.md');
 for(const api of ['bee.read_task_context_20261126','bee.read_sleep_compact_20261126','task.plan','task_location','task_category']){
  assert.ok(guide.includes(api),`Missing documented deployed contract: ${api}`);
 }
 for(const operation of ['schedule.create','schedule.edit','schedule.cancel']){
  assert.ok(guide.includes(operation)||old.includes(operation),`Missing schedule operation ${operation}`);
 }
 assert.match(guide,/not automatic use by scheduled workers/);
 assert.match(guide,/never changes the real due date/);
 assert.match(guide,/new request UUID is a new action/);
 assert.match(guide,/unknown/);
 assert.match(guide,/Work Synthesis's existing targeted SQL/);
 assert.match(sleep,/America\/New_York/);
 assert.match(old,/bee\.command/);
});
