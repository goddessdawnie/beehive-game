import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/beehive.css',import.meta.url),'utf8');

test('stylesheet is external, linked once, and retains first-paint theme initialization',()=>{
 assert.equal((html.match(/<link rel="stylesheet" href="\.\/css\/beehive\.css">/g)||[]).length,1);
 assert.doesNotMatch(html,/<style\b/i);
 assert.ok(html.indexOf("localStorage.getItem('beehive-theme')")<html.indexOf('href="./css/beehive.css"'));
 assert.match(css,/:root\[data-theme="dark"\] body/);
});

test('moved stylesheet resolves all artwork URLs relative to css directory',()=>{
 const urls=[...css.matchAll(/url\(\s*['"]?([^)'"]+)/g)].map(x=>x[1]);
 assert.ok(urls.length>=8);
 for(const url of urls){
  if(url.startsWith('data:')||url.startsWith('https:'))continue;
  assert.match(url,/^\.\.\/assets\//);
  assert.doesNotMatch(url,/^assets\//);
 }
});
