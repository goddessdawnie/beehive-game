import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const chatPath=new URL('../supabase/functions/kae-chat/index.ts',import.meta.url);
const ambientPath=new URL('../supabase/functions/kae-ambient/index.ts',import.meta.url);

test('mutable life orientation comes from curated memory',async()=>{
  const [chat,ambient]=await Promise.all([
    readFile(chatPath,'utf8'),
    readFile(ambientPath,'utf8')
  ]);
  for(const source of [chat,ambient]){
    assert.doesNotMatch(source,/Dawn works third shift/i);
    assert.match(source,/remembered context/i);
  }
  assert.match(chat,/remembered_context/);
  assert.match(chat,/memoryGuidance/);
  assert.match(chat,/recurrence_series_id/);
  assert.match(chat,/last_completed_at/);
  assert.match(ambient,/from\("mochi_memories"\)/);
  assert.match(ambient,/eq\("kind","kae_curated"\)/);
});
