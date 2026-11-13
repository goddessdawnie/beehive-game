import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('repeatable gift purchases retain RPC and reload but do not summon chat',()=>{
  const start=source.indexOf("btn.onclick=async()=>{if(treasuryBusy||chatBusy)");
  assert.ok(start>0,'Treasury purchase handler exists');
  const handler=source.slice(start,source.indexOf(';\n  row.append(info,btn)',start));
  assert.match(handler,/db\.rpc\('purchase_kae_reward',\{p_item_id:item\.id\}\)/);
  assert.match(handler,/if\(res\.error\).*?return/);
  assert.match(handler,/await load\(\);if\(!item\.repeatable\)await kaeInitiate\('gift',item\.id\)/);
  assert.doesNotMatch(handler,/if\(item\.repeatable\).*kaeInitiate/);
  assert.match(handler,/item\.repeatable\?'\.'/,'Repeatable gift confirmation is quiet');
});
