import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../js/three-things-ui.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261119214000_three_things_kae_keep.sql',import.meta.url),'utf8');
test('Three Things offers a distinct Keep for later action',()=>{
 assert.match(ui,/\['Keep for later','keep'\]/);
 assert.match(ui,/p_action:action/);
 assert.match(migration,/p_action not in \('complete','add','keep','clear'\)/);
});
test('Kae quests are attributed correctly without invented deadlines',()=>{
 assert.match(migration,/'kae',nullif\(btrim\(v.category\),''\)/);
 assert.match(migration,/case when p_action='add' then \(now\(\) at time zone 'America\/New_York'\)::date else null end/);
 assert.match(migration,/\(v.title,case when p_action='complete' then 'completed' else 'open' end,\s*null,/);
});
test('existing owner lock and reward-only-on-completion semantics persist',()=>{
 assert.match(migration,/owner_id=auth.uid\(\) for update/);
 assert.match(migration,/v.status<>'suggested'/);
 assert.match(migration,/if p_action='complete' and t.reward_coins>0 then/);
});
