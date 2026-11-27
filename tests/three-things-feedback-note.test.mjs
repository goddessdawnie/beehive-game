import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../js/three-things-ui.js',import.meta.url),'utf8');
const generator=readFileSync(new URL('../supabase/functions/three-things/index.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261116140100_three_things_feedback_note.sql',import.meta.url),'utf8');

test('icon feedback remains a standalone one-tap database write',()=>{
 assert.match(ui,/update\(\{feedback:value\}\)/);
 assert.match(ui,/feedbackNotePanel\.hidden=false/);
});
test('written feedback is optional, bounded, owner-session scoped and saved separately',()=>{
 assert.match(ui,/feedbackNoteInput\.maxLength=500/);
 assert.match(ui,/feedback_note:note\|\|null/);
 assert.match(ui,/\.eq\('id',item\.id\)\.eq\('status','suggested'\)/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS feedback_note text/);
 assert.match(migration,/feedback_note IS NULL OR char_length\(feedback_note\) <= 500/);
});
test('generation receives recent bounded feedback text',()=>{
 assert.match(generator,/feedback,feedback_note,created_at/);
 assert.match(generator,/feedback_note\.slice\(0,500\)/);
 assert.match(generator,/recent_suggestions:/);
});
