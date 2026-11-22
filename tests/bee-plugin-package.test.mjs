import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../plugins/bee');
const load=path=>readFileSync(resolve(root,path),'utf8');

test('Bee plugin source matches the installed 0.2.4 contract and has complete local references',()=>{
 const manifest=JSON.parse(load('plugin.json'));
 assert.equal(manifest.name,'bee');
 assert.equal(manifest.version,'0.2.4');
 assert.equal(manifest.skills,'./skills');
 assert.ok(existsSync(resolve(root,'.app.json')));
 assert.ok(existsSync(resolve(root,'.codex-plugin/plugin.json')));
 const skillPath='skills/beehive/SKILL.md';
 const skill=load(skillPath);
 const references=[...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map(match=>match[1]);
 assert.deepEqual(references.sort(),['references/conversations.md','references/operations.md','references/sleep.md']);
 for(const relative of references){
  const target=resolve(root,dirname(skillPath),relative);
  assert.ok(existsSync(target),`Missing Bee reference: ${relative}`);
  assert.ok(readFileSync(target,'utf8').trim().length>100);
 }
 assert.match(skill,/bee\.read_sleep_20261120/);
 assert.match(load('skills/beehive/references/sleep.md'),/America\/New_York/);
 assert.match(load('skills/beehive/references/operations.md'),/bee\.command/);
});
