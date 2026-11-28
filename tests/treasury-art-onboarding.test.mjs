import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'beehive-treasury-art-'));
 await mkdir(join(dir,'scripts'),{recursive:true});
 await mkdir(join(dir,'assets','room'),{recursive:true});
 await copyFile(new URL('../scripts/build-scene-catalog.mjs',import.meta.url),join(dir,'scripts','build-scene-catalog.mjs'));
 await writeFile(join(dir,'assets','room','approved.svg'),svg);
 const asset={id:'approved_art',label:'Approved fixture art',slots:['inventory_item'],
  renderer:'inventory_image',treasure:'approved_fixture',source:'assets/room/approved.svg',fit:'contain'};
 const save=assets=>writeFile(join(dir,'assets','room','scene-assets.json'),JSON.stringify({schemaVersion:1,assets}));
 const run=()=>spawnSync(process.execPath,[join(dir,'scripts','build-scene-catalog.mjs')],{encoding:'utf8'});
 return {dir,asset,save,run};
}

test('approved inventory art registration compiles without a bespoke room slot or shop mutation',async()=>{
 const {dir,asset,save,run}=await fixture();
 try{
  await save([asset]);
  const ok=run();
  assert.equal(ok.status,0,ok.stderr);
  const generated=JSON.parse(await readFile(join(dir,'assets','scene-catalog.json'),'utf8'));
  assert.deepEqual(generated.assets,[asset]);
  assert.ok(!('price' in asset)&&!('owned' in asset),'Catalog metadata never authorizes a gift or purchase');
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('inventory art registration rejects duplicate slugs, invalid slots, unsafe paths and missing images',async()=>{
 const {dir,asset,save,run}=await fixture();
 try{
  const invalid=[
   [[asset,{...asset,id:'approved_other'}],/Duplicate inventory artwork slug/],
   [[{...asset,slots:['right']}],/Inventory image must use only inventory_item/],
   [[{...asset,treasure:'not-a-slug'}],/valid shop slug/],
   [[{...asset,source:'assets/room/..\/unsafe.svg'}],/Unsafe source path/],
   [[{...asset,source:'assets/room/missing.svg'}],/Missing asset/],
   [[{...asset,fit:'fill'}],/must fit contain/],
   [[{...asset,renderer:'existing'}],/reserved for inventory_image/]
  ];
  for(const [assets,expected] of invalid){
   await save(assets);
   const result=run();
   assert.notEqual(result.status,0,'Invalid registration should not build: '+expected);
   assert.match(result.stderr,expected);
  }
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('existing scene catalog remains a separate layout-preview registry, not an ownership grant',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../assets/room/scene-assets.json',import.meta.url),'utf8'));
 const tier=JSON.parse(await readFile(new URL('../assets/treasure-quantity/manifest.json',import.meta.url),'utf8'));
 assert.ok(catalog.assets.some(a=>a.id==='scale_oil_vial'&&a.renderer==='existing'));
 assert.ok(catalog.assets.some(a=>a.id==='jewel_svg'&&a.renderer==='preview_image'));
 assert.deepEqual(tier.tiers.map(t=>t.min),[1,5,13,26]);
 assert.equal(catalog.assets.some(a=>a.renderer==='inventory_image'),false,'No new shop gift is registered in this rollout');
});
