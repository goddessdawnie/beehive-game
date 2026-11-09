import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(await readFile(resolve(root,'assets/room/scene-assets.json'),'utf8'));
const slots=new Set(['cushion','kae','behind','left_lower','right','shelf_jewel']);
const renderers=new Set(['image','existing','legacy_case','legacy_throne','preview_image']);
const seen=new Set();
if(source.schemaVersion!==1||!Array.isArray(source.assets))throw Error('Invalid scene source catalog');
for(const asset of source.assets){
 if(!/^[a-z][a-z0-9_]*$/.test(asset.id)||seen.has(asset.id))throw Error('Duplicate/invalid asset id: '+asset.id);
 seen.add(asset.id);
 if(!asset.label||!Array.isArray(asset.slots)||!asset.slots.length||!asset.slots.every(s=>slots.has(s)))throw Error('Invalid asset slots: '+asset.id);
 if(!renderers.has(asset.renderer))throw Error('Unsupported renderer: '+asset.id);
 if(['image','preview_image'].includes(asset.renderer)&&!asset.source)throw Error('Image source required: '+asset.id);
 if(asset.source){
  if(!/^assets\/[a-z0-9_./-]+\.(svg|webp|jpg|jpeg|png)$/.test(asset.source)||asset.source.includes('..'))throw Error('Unsafe source path: '+asset.id);
  const assetFile=resolve(root,asset.source);
  if(!(await stat(assetFile)).isFile())throw Error('Missing asset: '+asset.source);
  if(extname(assetFile)==='.svg'){
   const xml=await readFile(assetFile,'utf8');
   if(!xml.includes('<svg')||/<script\b|<image\b[^>]*href=["']https?:/i.test(xml))throw Error('Unsafe SVG content: '+asset.source);
  }
 }
}
const output={schemaVersion:1,assets:source.assets};
const generated=JSON.stringify(output,null,2)+'\n';
const target=resolve(root,'assets/scene-catalog.json');
if(process.argv.includes('--check')){
 if((await readFile(target,'utf8'))!==generated)throw Error('Run npm run assets:build to update the generated catalog');
 console.log('Asset catalog current: '+seen.size+' assets');
}else{
 await writeFile(target,generated);
 console.log('Generated '+target+' ('+seen.size+' assets)');
}
