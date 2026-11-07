import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const asset=await readFile(new URL('../assets/silk-pillow.svg',import.meta.url),'utf8');
const page=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('silk pillow has independent transparent SVG asset with no external image dependency',()=>{
 assert.match(asset,/<svg\b[^>]*viewBox="0 0 640 220"/);
 assert.match(asset,/silk/);
 assert.doesNotMatch(asset,/<image\b|<script\b|href="https?:/i);
 assert.doesNotMatch(asset,/<rect[^>]+width="640"[^>]+height="220"/);
});
test('pillow remains inventory-backed and beneath dragon without changing purchase rules',()=>{
 assert.match(page,/chamber-pillow" data-treasure="silk_pillow"/);
 assert.match(page, /\.chamber-pillow\{[^}]*silk-pillow\.svg[^}]*z-index:1/);
 assert.match(page, /\.chamber-kae\{[^}]*z-index:2/);
 assert.match(page,/node\.classList\.toggle\('visible',Boolean\(owned\)\)/);
});
