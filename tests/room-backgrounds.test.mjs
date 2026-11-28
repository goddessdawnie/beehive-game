import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const html=await read('index.html');
const css=await read('css/beehive.css');
const manifest=JSON.parse(await read('assets/room/backgrounds/manifest.json'));

test('the two high-contrast concept backgrounds are complete, local and never shop entitlements',async()=>{
 assert.equal(manifest.schemaVersion,1);
 assert.equal(manifest.backgrounds.length,2);
 assert.deepEqual(manifest.backgrounds.map(x=>x.id),['moonlit_observatory','mosslight_grotto']);
 for(const art of manifest.backgrounds){
  assert.equal(art.shopSlug,null,'No approved shop items or prices were supplied');
  assert.match(art.source,/^assets\/room\/backgrounds\/[a-z0-9-]+\.svg$/);
  assert.match(art.label,/preview/i);
  const body=await read(art.source);
  assert.match(body,/viewBox="0 0 700 420"/);
  assert.match(body,/<defs>/);
  assert.match(body,/<\/svg>/);
  assert.doesNotMatch(body,/<script\b|<foreignObject\b|<image\b|href="https?:/i);
 }
 assert.notEqual(await read(manifest.backgrounds[0].source),await read(manifest.backgrounds[1].source));
});

test('background preview and active choice remain separate from inventory ownership and existing room positioning',()=>{
 assert.match(html,/id="room-background" aria-label="Room background"/);
 assert.match(html,/fetch\('\.\/assets\/room\/backgrounds\/manifest\.json'/);
 assert.match(html,/const roomBackgroundStorageKey=owner=>'beehive:room-background:v1:'\+owner/);
 assert.match(html,/function backgroundOwned\(art\)\{return Boolean\(art\?\.shopSlug&&roomBackgroundOwnedSlugs\.has\(art\.shopSlug\)\);\}/);
 assert.match(html,/roomBackgroundOwnedSlugs=ownedSlugs/);
 assert.match(html,/previewRoomBackgroundId=id; \/\/ Preview never persists or creates a shop entitlement/);
 assert.match(html,/if\(art&&!backgroundOwned\(art\)\)/);
 assert.match(html,/selectedRoomBackgroundId=art\?\.id\|\|''/);
 assert.match(html,/localStorage\.setItem\(roomBackgroundStorageKey\(layoutOwner\),selectedRoomBackgroundId\)/);
 assert.match(html,/previewRoomBackgroundId='';[\s\S]*refreshRoomBackgroundChoices\(\);[\s\S]*applyArtworkPreview\(\)/);
 assert.match(html,/chamber\.style\.removeProperty\('background-image'\)/);
 assert.match(html,/chamber\.style\.backgroundImage='url\('\+JSON\.stringify\(art\.source\)\+'\),url\("assets\/chamber\.svg"\)'/);
 assert.match(css,/\.chamber\{[^}]*chamber-room\.jpg/);
 assert.match(html,/for\(const slot of layoutSlots\)applySlotGeometry\(slot\)/);
 assert.doesNotMatch(html,/db\.from\('room_background'/);
});
