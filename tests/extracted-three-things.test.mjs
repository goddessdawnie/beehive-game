import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createThreeThingsUI} from '../js/three-things-ui.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../js/three-things-ui.js',import.meta.url),'utf8');

test('Three Things is one native module wired into authenticated lifecycle',()=>{
 for(const phrase of [
  "import {createThreeThingsUI} from './js/three-things-ui.js';",
  'const threeUI=createThreeThingsUI({db,el,difficultyNames,load});',
  "threeUI.clearLocal();return;",
  "void threeUI.restoreThree();"
 ])assert.ok(html.includes(phrase),phrase);
 for(const phrase of ['let threeItems=[],threeBusy=false;','function renderThree(){','async function generateThree(','async function restoreThree(){']){
  assert.ok(!html.includes(phrase),'Controller still inline: '+phrase);
 }
 assert.ok(source.includes('export function createThreeThingsUI'));
 assert.ok(source.includes('return {restoreThree,clearLocal(){threeItems=[];renderThree();}};'));
});
test('Three Things feedback, actions and generation remain source-equivalent',()=>{
 for(const phrase of [
  ".from('three_things').update({feedback:value})",
  ".from('three_things').update({feedback_note:note||null})",
  ".eq('status','suggested').select('id,feedback').maybeSingle()",
  "p_action:action,p_notes:action==='complete'?savedNotes:''",
  "p_action:'clear'",
  "threeItems.map(x=>x.title)",
  "feedbackNoteInput.maxLength=500",
  "notes.maxLength=3000",
  "if(threeBusy||threeFeedbackSaving.has(item.id))return",
  "await load()",
  ".order('created_at',{ascending:false}).limit(3)"
 ])assert.ok(source.includes(phrase),'Missing accepted behavior: '+phrase);
 assert.ok(!source.includes('localStorage'));
 assert.ok(!source.includes('innerHTML'));
});
test('local reset and empty restore make no task or suggestion writes',async()=>{
 let clears=0,hidden=null,reads=0,writes=0;
 const elements={
  'three-list':{replaceChildren(){clears++},append(){}},
  'three-clear':{classList:{toggle(key,value){assert.equal(key,'hidden');hidden=value}}},
  'three-generate':{onclick:null},
  'three-feedback':{textContent:''}
 };
 const chain={select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})}};
 const db={from(name){assert.equal(name,'three_things');reads++;return chain},rpc(){writes++;throw Error('No write permitted')}};
 const controller=createThreeThingsUI({db,el:id=>elements[id],difficultyNames:{tiny:'Tiny'},load:async()=>{}});
 assert.equal(typeof elements['three-generate'].onclick,'function');
 assert.equal(typeof elements['three-clear'].onclick,'function');
 controller.clearLocal();await controller.restoreThree();
 assert.equal(clears,2);assert.equal(hidden,true);assert.equal(reads,1);assert.equal(writes,0);
});
