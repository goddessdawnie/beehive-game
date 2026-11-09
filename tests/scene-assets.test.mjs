import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const html=await read('index.html');
const manifest=JSON.parse(await read('assets/scene-catalog.json'));
const svg=await read('assets/room/right/wood-glass-display-case.svg');

test('generated scene catalog includes a stretchable transparent glass case and known slot assets',()=>{
 assert.equal(manifest.schemaVersion,1);
 assert.equal(new Set(manifest.assets.map(a=>a.id)).size,manifest.assets.length);
 const display=manifest.assets.find(a=>a.id==='case_svg');
 assert.ok(display);
 assert.deepEqual(display.slots,['right']);
 assert.equal(display.source,'assets/room/right/wood-glass-display-case.svg');
 assert.equal(display.fit,'fill');
 assert.equal(manifest.assets.find(a=>a.id==='case_css').renderer,'legacy_case');
 assert.match(html,/fetch\('\.\/assets\/scene-catalog\.json'/);
 assert.doesNotMatch(html,/const layoutArtwork=\{/);
});

test('glass display case is scalable, has clear central region and opaque wooden base',()=>{
 assert.match(svg,/viewBox="0 0 320 480"/);
 assert.match(svg,/preserveAspectRatio="none"/);
 assert.match(svg,/fill="url\(#shine\)"/);
 assert.match(svg,/stop-opacity="\.015"/);
 assert.match(svg,/rect x="7" y="358" width="306" height="112"/);
 assert.doesNotMatch(svg,/<script\b|<image\b|href="https?:/i);
});

test('imperial throne uses layered SVG art behind Kae and keeps CSS only for optional comparison',async()=>{
 const throne=manifest.assets.find(a=>a.id==='throne_svg');
 assert.ok(throne);
 assert.deepEqual(throne.slots,['behind']);
 assert.equal(throne.fit,'fill');
 assert.equal(throne.renderer,'existing');
 assert.equal(throne.source,'assets/room/behind/ornate-throne-back.svg');
 assert.doesNotMatch(html,/assets\/room\/behind\/imperial-throne\.svg/,'Revised throne must use a distinct URL from the cached old chair');
 assert.equal(manifest.assets.find(a=>a.id==='throne_css').renderer,'legacy_throne');
 const art=await read('assets/room/behind/ornate-throne-back.svg');
 assert.match(art,/viewBox="0 0 800 340"/);
 assert.match(art,/preserveAspectRatio="none"/);
 assert.match(art,/no chair seat or legs/);
 assert.match(art,/id="plum"/);
 assert.match(art,/id="gold"/);
 assert.doesNotMatch(art,/<script\b|<image\b|href="https?:/i);
 assert.match(html,/\.chamber-throne\{[^}]*ornate-throne-back\.svg[^}]*z-index:1/);
 assert.match(html,/\.chamber-kae\{[^}]*z-index:2/);
 assert.match(html,/\.chamber-throne\.preview-legacy\{/);
});

test('violet repeatable Jewel has transparent SVG and a preview-only shelf slot, not a purchase',async()=>{
 const jewel=manifest.assets.find(a=>a.id==='jewel_svg');
 assert.ok(jewel);
 assert.deepEqual(jewel.slots,['shelf_jewel']);
 assert.equal(jewel.renderer,'preview_image');
 assert.equal(jewel.fit,'contain');
 assert.equal(jewel.source,'assets/room/shelf/violet-jewel.svg');
 assert.equal(jewel.treasure,undefined);
 const art=await read(jewel.source);
 assert.match(art,/viewBox="0 0 128 144"/);
 assert.match(art,/id="gem"/);
 assert.match(art,/Transparent silhouette/);
 assert.doesNotMatch(art,/<script\b|<image\b|href="https?:/i);
 assert.match(html,/id="chamber-jewel-preview" class="chamber-jewel-preview" aria-hidden="true"/);
 assert.match(html,/id:'shelf_jewel'/);
 assert.match(html,/preview\?\.renderer==='preview_image'/);
 assert.match(html,/jewelPreview\.classList\.toggle\('visible',showJewel\)/);
});

test('future display contents render below the SVG foreground without changing ownership flow',()=>{
 assert.match(html,/class="chamber-case-contents" id="chamber-case-contents"/);
 assert.match(html,/\.chamber-case::after\{[^}]*z-index:2[^}]*wood-glass-display-case\.svg/);
 assert.match(html,/\.chamber-case-contents\{[^}]*z-index:1/);
 assert.match(html,/node\.classList\.toggle\('visible',sceneOwnedSlugs\.has\(node\.dataset\.treasure\)/);
});
