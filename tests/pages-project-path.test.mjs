import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(resolve(root,file),'utf8');
const html=read('index.html');
const css=read('css/beehive.css');
const manifest=JSON.parse(read('manifest.webmanifest'));
const sw=read('sw.js');
const workflow=read('.github/workflows/bee-verification.yml');
const pagesBase=new URL('https://example.invalid/beehive-game/');

// Resolve exactly as a browser would on GitHub Pages, not from a site-root URL.
// Throw for missing files or URLs escaping the project subpath.
function localAsset(owner,reference){
 assert.equal(typeof reference,'string');
 assert.ok(reference&&!reference.startsWith('/')&&!/^(?:https?:|data:|\/\/)/i.test(reference),
  'Expected project-relative asset, not root-absolute/external: '+reference);
 const url=new URL(reference,new URL(owner,pagesBase));
 assert.equal(url.origin,pagesBase.origin);
 assert.ok(url.pathname.startsWith(pagesBase.pathname),
  'Asset escaped /beehive-game/: '+reference+' from '+owner);
 const filename=decodeURIComponent(url.pathname.slice(pagesBase.pathname.length));
 assert.ok(filename,'Asset resolved to the project directory instead of a file: '+reference);
 assert.ok(existsSync(resolve(root,filename)),
  'Missing Pages asset: '+filename+' (referenced from '+owner+')');
 return filename;
}

test('the actual HTML styles, icon, image and native module imports resolve under Pages subpath',()=>{
 const tagRefs=[...html.matchAll(/<(?:link|img|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g)]
  .map(m=>m[1]).filter(ref=>!ref.startsWith('https://'));
 assert.ok(tagRefs.length>=4,'Expected real stylesheet, manifest, favicon and dragon image links');
 for(const ref of tagRefs)localAsset('index.html',ref);
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'Native entrypoint module is required');
 const imports=[...script.matchAll(/^\s*import\s+[^;\n]*?\s+from\s+['"]([^'"]+)['"]/gm)].map(m=>m[1]);
 assert.ok(imports.length>=6,'All current native UI modules must be resolved');
 for(const ref of imports){
  const path=localAsset('index.html',ref);
  assert.match(path,/^js\/.+\.js$/);
  const module=read(path);
  for(const imported of module.matchAll(/^\s*import\s+[^;\n]*?\s+from\s+['"]([^'"]+)['"]/gm))
   localAsset(path,imported[1]);
 }
});

test('CSS artwork URLs exist after resolving relative to css/, including versioned URLs',()=>{
 const urls=[...css.matchAll(/url\(\s*['"]?([^)'"]+)/g)].map(m=>m[1]);
 assert.ok(urls.length>=8,'Expected the room stylesheet artwork links');
 for(const ref of urls){
  if(/^(?:data:|https?:)/i.test(ref))continue;
  assert.match(ref,/^\.\.\/assets\//,'CSS references must be css-directory relative');
  localAsset('css/beehive.css',ref);
 }
});

test('PWA manifest, service worker, notification icons and install scope stay inside project',()=>{
 for(const field of ['id','scope','start_url']){
  assert.equal(manifest[field],'./','PWA '+field+' should stay inside /beehive-game/');
  assert.equal(new URL(manifest[field],pagesBase).pathname,pagesBase.pathname);
 }
 assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>=2);
 for(const icon of manifest.icons){
  assert.equal(icon.type,'image/png');
  localAsset('manifest.webmanifest',icon.src);
 }
 assert.match(html,/navigator\.serviceWorker\.register\("\.\/sw\.js",\{scope:"\.\/"\}\)/);
 localAsset('index.html','./sw.js');
 const notifications=[...sw.matchAll(/\b(?:icon|badge):'([^']+)'/g)].map(m=>m[1]);
 assert.ok(notifications.length>=2);
 for(const icon of notifications)localAsset('sw.js',icon);
 assert.match(sw,/new URL\('\.\/',self\.registration\.scope\)/,
  'Notification click should reopen the same Pages project scope');
});

test('asset-only and PWA changes trigger the existing full PR verification workflow',()=>{
 assert.match(workflow,/^\s*pull_request:\s*$/m);
 const paths=[...workflow.matchAll(/^\s*-\s*'([^']+)'\s*$/gm)].map(m=>m[1]);
 for(const expected of ['css/**','js/**','assets/**','icons/**','sw.js','manifest.webmanifest','index.html','tests/**']){
  assert.ok(paths.includes(expected),'Bee CI does not watch '+expected);
 }
 for(const step of ['npm test','npm run test:postgres','npm run test:browser'])
  assert.ok(workflow.includes(step),'Existing required verification missing: '+step);
});

test('the path verifier rejects root-absolute and escaping URLs, not just missing files',()=>{
 assert.equal(localAsset('css/beehive.css','../assets/chamber.svg'),'assets/chamber.svg');
 assert.throws(()=>localAsset('index.html','/assets/chamber.svg'),/project-relative/);
 assert.throws(()=>localAsset('css/beehive.css','../../outside.svg'),/escaped/);
});
