import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const source=JSON.parse(await read('assets/room/scene-assets.json'));
const compiled=JSON.parse(await read('assets/scene-catalog.json'));
const html=await read('index.html');
const css=await read('css/beehive.css');

test('three different Kae expressions reuse the existing simple dragon shape without changing his portrait default',async()=>{
 const expected=['smug','skeptical','intrigued'];
 assert.match(html,/<img class="chamber-kae" src="assets\/kae_cutout\.webp\?v=2"/);
 assert.match(html,/onerror="this.onerror=null;this.src='assets\/kae\.svg'"/);
 const original=await read('assets/kae.svg');
 for(const name of expected){
  const id='kae_'+name,asset=source.assets.find(x=>x.id===id);
  assert.ok(asset,'Missing expression '+name);
  assert.deepEqual(asset.slots,['kae']);
  assert.equal(asset.renderer,'image');
  assert.equal(asset.source,'assets/kae-expressions/kae-'+name+'.svg');
  assert.deepEqual(compiled.assets.find(x=>x.id===id),asset);
  const image=await read(asset.source);
  assert.match(image,/<svg\s/);
  assert.match(image,/viewBox="0 0 320 280"/);
  assert.match(image,/id="expression-eyes"/);
  assert.match(image,/id="expression-brows"/);
  assert.match(image,/id="expression-mouth"/);
  assert.match(image,/<\/svg>/);
  assert.doesNotMatch(image,/<script\b|<foreignObject\b|<image\b|href="https?:/i);
  assert.ok(image!==original,'Expression must not simply duplicate the original');
 }
 assert.equal(new Set(expected.map(n=>source.assets.find(a=>a.id==='kae_'+n).source)).size,3);
});

test('ambient light is a non-interactive backdrop, not a new treasure or altered room geometry',async()=>{
 const art=await read('assets/room/ambient/amber-vault-glow.svg');
 assert.match(art,/viewBox="0 0 700 420"/);
 assert.match(art,/Decorative atmospheric light only/);
 assert.doesNotMatch(art,/<script\b|<image\b|<foreignObject\b|href="https?:/i);
 assert.match(css,/#kae-chamber::before\{[^}]*position:absolute;inset:0;z-index:0;pointer-events:none;[^}]*amber-vault-glow\.svg/);
 assert.match(css,/\.chamber-kae\{[^}]*z-index:2/);
 assert.match(css,/\.chamber-case\{[^}]*z-index:3/);
 assert.match(html,/id="kae-chamber" role="img"/);
 assert.doesNotMatch(art,/data-treasure|reward_shop|kae_inventory/);
});

test('portrait choices use owner-scoped local presentation settings; preview and authentication are isolated',()=>{
 assert.match(html,/const kaePortraitStorageKey=owner=>'beehive:kae-portrait:v1:'\+owner/);
 assert.match(html,/localStorage\.getItem\(kaePortraitStorageKey\(ownerId\)\)/);
 assert.match(html,/localStorage\.setItem\(kaePortraitStorageKey\(layoutOwner\),selectedKaePortraitId\)/);
 assert.match(html,/selectedKaePortraitId='';[\s\S]*refreshKaePortraitOptions\(\)/);
 assert.match(html,/const displayedSrc=preview\?\.src\|\|portraitSrc/);
 assert.match(html,/portraitAssets\.get\(selectedKaePortraitId\)\?\.source\|\|kaeOriginalSrc/);
 assert.match(html,/if\(activeArtworkPreview\?\.slotId==='kae'\)/);
 assert.match(html,/Original illustrated Kae/);
 assert.doesNotMatch(html,/db\.from\('kae_portrait'\)|db\.rpc\('set_kae_portrait'/);
});
