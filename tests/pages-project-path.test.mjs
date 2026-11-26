import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

test('project-subpath assets are relative and exist in the Pages tree', () => {
  for (const asset of ['css/beehive.css', 'js/game-registry.js', 'js/sleep-ui.js', 'manifest.webmanifest']) {
    assert.ok(existsSync(resolve(root, asset)), `Missing project asset: ${asset}`);
    assert.ok(html.includes(asset), `HTML does not reference ${asset}`);
    assert.ok(!html.includes(`"/${asset}"`), `Root-absolute reference breaks /beehive-game/: ${asset}`);
  }
});

test('service worker and manifest are present for project Pages hosting', () => {
  assert.ok(existsSync(resolve(root, 'sw.js')));
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.start_url, 'Manifest must declare start_url');
});
