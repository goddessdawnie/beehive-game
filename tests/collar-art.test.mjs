import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/beehive.css', import.meta.url), 'utf8');
const svg = readFileSync(new URL('../assets/room/shelf/jeweled-collar.svg', import.meta.url), 'utf8');
test('collar is real artwork, not the diamond emoji', () => {
  assert.match(html, /data-treasure="jeweled_collar" role="img" aria-label="Jeweled collar"/);
  assert.doesNotMatch(html, /data-treasure="jeweled_collar"[^>]*>💎/);
  assert.match(css, /\.chamber-collar\{[^}]*jeweled-collar\.svg/);
  assert.match(svg, /<svg[^>]*viewBox="0 0 240 160"/);
});
test('collar keeps inventory ownership and independent placement', () => {
  assert.match(html, /id:'collar',label:'Jeweled collar',selector:'\.chamber-collar'/);
  assert.match(html, /data-treasure="jeweled_collar"/);
  assert.match(html, /sceneOwnedSlugs/);
});
