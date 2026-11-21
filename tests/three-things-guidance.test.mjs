import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/three-things/index.ts',import.meta.url),'utf8');
test('rejected suggestion guidance addresses semantic repetition and no coercion',()=>{
 assert.match(source,/do not repeat a rejected suggestion or a near-paraphrase/);
 assert.match(source,/sweep a stair versus sweep the base of the stairs/);
 assert.match(source,/Treat written feedback as direction/);
 assert.match(source,/genuinely smaller, independently useful first steps/);
 assert.match(source,/do not disguise the same full task/);
});
test('creative catalog picks allow concrete varied titles without altering catalog',()=>{
 assert.match(source,/turn broad reusable Possibilities into one concrete/);
 assert.match(source,/make the generated title and detail specific and fresh/);
 assert.doesNotMatch(source,/Include exactly one suggestion with the EXACT title/);
 assert.match(source,/db\.from\("activity_catalog"\)\.select/);
 assert.doesNotMatch(source,/db\.from\("activity_catalog"\)\.update/);
});
test('existing feedback and owner-scoped suggestion write paths remain',()=>{
 assert.match(source,/feedback_note/);
 assert.match(source,/recent_suggestions/);
 assert.match(source,/owner_id:user\.id/);
 assert.match(source,/db\.auth\.getUser\(token\)/);
});
