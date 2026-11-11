import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const base=new URL('../assets/treasure-quantity/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
test('treasure artwork thresholds cover positive integer quantities without gaps or overlaps',()=>{
 assert.equal(manifest.schemaVersion,1);
 assert.deepEqual(manifest.tiers.map(t=>[t.min,t.max]),[[1,4],[5,12],[13,25],[26,null]]);
 for(let qty=1;qty<=100;qty++){
  assert.equal(manifest.tiers.filter(t=>qty>=t.min&&(t.max===null||qty<=t.max)).length,1,'Quantity '+qty+' has exactly one tier');
 }
});
test('coin and whisker owned slugs map to four existing transparent SVG assets',async()=>{
 for(const [type,slug] of [['coin','gold_coin'],['whisker','minnie_whisker'],['jewel','loose_jewel']]){
  const item=manifest.items[type];assert.equal(item.shopSlug,slug);
  for(const tier of manifest.tiers){
   const source=item.variants[tier.id].source;
   assert.match(source,/^assets\/treasure-quantity\/[a-z-]+\.svg$/);
   const file=new URL(source.replace('assets/treasure-quantity/',''),base);
   assert.ok((await stat(file)).isFile());
   const svg=await readFile(file,'utf8');
   assert.match(svg,/<svg\b/);
   assert.match(svg,/<\/svg>/);
  }
 }
});
test('quantity art binds only approved inventory slugs, not collar or similarly named items',()=>{
 assert.equal(manifest.status,'quantity_art_active');
 const slugs=Object.values(manifest.items).map(item=>item.shopSlug);
 assert.deepEqual(slugs.sort(),['gold_coin','loose_jewel','minnie_whisker'].sort());
 assert.ok(!slugs.includes('jeweled_collar'));
 assert.ok(!slugs.includes('mystery_jewel'));
});

test('shared artwork source resolver preserves tier boundaries and safe fallbacks',async()=>{
 const {runInNewContext}=await import('node:vm');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function quantityArtworkSource(');
 const end=html.indexOf('function renderQuantityArtwork()',start);
 assert.ok(start>=0&&end>start,'shared resolver exists');
 const code=html.slice(start,end);
 const bySlug=Object.fromEntries(Object.values(manifest.items).map(item=>[item.shopSlug,item]));
 const ctx={quantityArtwork:{tiers:manifest.tiers,items:bySlug,rawJewel:manifest.items.jewel},quantityTier:(tiers,qty)=>tiers.find(t=>qty>=t.min&&(t.max===null||qty<=t.max))};
 const resolve=(slug,qty,prefix)=>runInNewContext(code+';quantityArtworkSource(slug,qty,prefix)',{...ctx,slug,qty,prefix:prefix||'assets/treasure-quantity/'});
 assert.equal(resolve('gold_coin',0),null);
 for(const qty of [1,4,5,12,13,25,26,100]){
  const tier=ctx.quantityTier(manifest.tiers,qty);
  assert.equal(resolve('gold_coin',qty),manifest.items.coin.variants[tier.id].source);
  assert.equal(resolve('loose_jewel',qty,'assets/treasure-quantity/jewel-'),manifest.items.jewel.variants[tier.id].source);
 }
 assert.equal(resolve('jeweled_collar',1),null);
 assert.equal(resolve('mystery_jewel',1),null);
 const missing={...ctx,quantityArtwork:{...ctx.quantityArtwork,items:{}}};
 assert.equal(runInNewContext(code+';quantityArtworkSource("gold_coin",1)',missing),null);
 assert.equal(runInNewContext(code+';quantityArtworkSource("loose_jewel",1,"assets/treasure-quantity/jewel-")',missing),manifest.items.jewel.variants[manifest.tiers[0].id].source);
 const unsafe={...ctx,quantityArtwork:{...ctx.quantityArtwork,items:{gold_coin:{variants:{[manifest.tiers[0].id]:{source:'assets/treasure-quantity/../bad.svg'}}}}}};
 assert.equal(runInNewContext(code+';quantityArtworkSource("gold_coin",1)',unsafe),null);
});
