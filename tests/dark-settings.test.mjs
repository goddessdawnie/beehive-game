import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Settings exposes accessible persistent Light/Dark control',()=>{
 assert.match(html,/<h2>Settings<\/h2>/);
 assert.match(html,/<select id="theme-choice" aria-label="Appearance">/);
 assert.match(html,/<option value="light">Light<\/option>/);
 assert.match(html,/<option value="dark">Dark<\/option>/);
 assert.match(html,/localStorage\.getItem\('beehive-theme'\)/);
 assert.match(html,/localStorage\.setItem\('beehive-theme'/);
 assert.match(html,/el\('theme-choice'\)\.addEventListener\('change'/);
 assert.match(html,/id="open-layout"/);
});
test('Dark overrides app chrome without changing the estate scene',()=>{
 assert.match(html,/:root\[data-theme="dark"\] body/);
 assert.match(html,/:root\[data-theme="dark"\] section/);
 assert.match(html,/:root\[data-theme="dark"\] \.chat-log/);
 assert.match(html,/:root\[data-theme="dark"\] \.layout-tools/);
 assert.doesNotMatch(html,/:root\[data-theme="dark"\] \.chamber(?:\s|\{|,)/);
 assert.match(html,/meta\.content=dark\?'#181522':'#fff8eb'/);
});
