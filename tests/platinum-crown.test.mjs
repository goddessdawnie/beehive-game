import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const svg=await readFile(new URL('../assets/platinum-crown.svg',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../assets/scene-catalog.json',import.meta.url),'utf8'));
test('crown asset is self-contained and its catalog binding is distinct from collar',()=>{
 assert.match(svg,/<svg[^>]+viewBox="0 0 480 300"/);
 assert.doesNotMatch(svg,/<script\b|<foreignObject\b|<image\b|(?:href|onload)=/i);
 const crown=catalog.assets.filter(a=>a.treasure==='platinum_crown');
 assert.equal(crown.length,1);
 assert.equal(crown[0].source,'assets/platinum-crown.svg');
 assert.deepEqual(crown[0].slots,['crown']);
 assert.equal(crown[0].renderer,'existing');
});
