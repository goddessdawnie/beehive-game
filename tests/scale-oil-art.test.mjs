import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Scale Oil is a single owned bottle with its own adjustable room slot',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../css/beehive.css',import.meta.url),'utf8');
 const source=JSON.parse(await readFile(new URL('../assets/room/scene-assets.json',import.meta.url),'utf8'));
 const generated=JSON.parse(await readFile(new URL('../assets/scene-catalog.json',import.meta.url),'utf8'));
 const asset=source.assets.find(a=>a.id==='scale_oil_vial');
 assert.ok(asset);
 assert.equal(asset.treasure,'scale_oil');
 assert.equal(asset.renderer,'existing');
 assert.deepEqual(asset.slots,['scale_oil']);
 assert.equal(asset.source,'assets/room/shelf/scale-oil-vial.svg');
 assert.deepEqual(generated.assets.find(a=>a.id==='scale_oil_vial'),asset);
 assert.equal((html.match(/data-treasure="scale_oil"/g)||[]).length,1);
 assert.match(html,/id:'scale_oil',label:'Scale Oil/);
 assert.match(html,/selector:'.chamber-scale-oil'/);
 assert.match(css,/\.chamber-scale-oil\{[^}]*scale-oil-vial\.svg/);
 const svg=await readFile(new URL('../assets/room/shelf/scale-oil-vial.svg',import.meta.url),'utf8');
 assert.match(svg,/<svg\b/);
 assert.doesNotMatch(svg,/<script\b|<image\b[^>]*href=["']https?:/i);
});
