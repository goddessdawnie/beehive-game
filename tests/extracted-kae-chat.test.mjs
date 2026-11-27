import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createKaeChatUI} from '../js/kae-chat.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../js/kae-chat.js',import.meta.url),'utf8');

test('Kae chat is one native module, integrated without duplicate inline controllers',()=>{
 assert.match(html,/import \{createKaeChatUI\} from '\.\/js\/kae-chat\.js';/);
 assert.match(html,/const \{loadChat,kaeInitiate,isBusy:isChatBusy\}=createKaeChatUI\(/);
 assert.match(html,/if\(treasuryBusy\|\|isChatBusy\(\)\)/,'Shared chat-busy guard survives Treasury refactor');
 assert.match(html,/await kaeInitiate\('gift',item\.id\)/);
 assert.match(html,/if\(!chatLoaded\)\{chatLoaded=true;void loadChat\(\)\}/);
 assert.doesNotMatch(html,/function renderChatMarkdown\(/);
 assert.doesNotMatch(html,/async function kaeInitiate\(/);
 assert.doesNotMatch(html,/async function copyChatMessage\(/);
 assert.doesNotMatch(html,/\blet chatBusy=false\b/);
 assert.match(source,/export function createKaeChatUI/);
 assert.match(source,/return \{loadChat,kaeInitiate,isBusy:\(\)=>chatBusy\}/);
});
test('safe Markdown and copy behavior remain text-node based, never HTML injection',()=>{
 assert.match(source,/document\.createTextNode\(text\)/);
 assert.match(source,/document\.createElement\(tags\[0\]\)/);
 assert.match(source,/\['\*\*\*','strong','em'\]/);
 assert.match(source,/\['\*\*','strong'\]/);
 assert.match(source,/\['~~','s'\]/);
 assert.match(source,/\['\*','em'\]/);
 assert.match(source,/\['`','code'\]/);
 assert.doesNotMatch(source,/\.innerHTML\s*=/);
 assert.doesNotMatch(source,/DOMParser|insertAdjacentHTML|eval\(/);
 assert.match(source,/navigator\.clipboard\.writeText\(content\)/);
 assert.match(source,/\.from\('mochi_messages'\)\.select\('role,content,created_at'\)/);
 assert.match(source,/\.order\('created_at',\{ascending:false\}\)\.limit\(30\)/);
});
test('controller preserves one pending request and does not double-submit tap or gift',async()=>{
 const elements={
  'chattext':{value:'',style:{},scrollHeight:20,addEventListener(){}},
  'chat':{onsubmit:null,querySelector(){return {disabled:false,textContent:'Send'}},requestSubmit(){}},
  'kaetap':{disabled:false,onclick:null},
  'chatfeedback':{textContent:''}
 };
 const el=id=>elements[id];
 const requests=[];
 let complete;
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  return new Promise(resolve=>{complete=resolve});
 };
 try{
  const controller=createKaeChatUI({
   db:{auth:{getSession:async()=>({data:{session:{access_token:'test-only'}}})}},
   el,notice:()=>{},endpoint:'https://invalid.example/functions/v1/kae-chat',apiKey:'test-publishable'
  });
  assert.equal(typeof elements.kaetap.onclick,'function','Tap remains wired');
  assert.equal(typeof elements.chat.onsubmit,'function','Send remains wired');
  assert.equal(controller.isBusy(),false);
  const pending=controller.kaeInitiate('tap');
  assert.equal(controller.isBusy(),true,'Busy is synchronous before authentication');
  await controller.kaeInitiate('gift','hypothetical-id');
  await Promise.resolve();
  assert.equal(requests.length,1,'No second call is made while Kae is responding');
  assert.equal(JSON.parse(requests[0].options.body).mode,'tap');
  assert.equal(requests[0].options.headers.Authorization,'Bearer test-only');
  assert.equal(elements.kaetap.disabled,true);
  complete({ok:true,json:async()=>({skipped:true})});
  await pending;
  assert.equal(controller.isBusy(),false);
  assert.equal(elements.kaetap.disabled,false);
  assert.equal(elements.chatfeedback.textContent,'');
 }finally{globalThis.fetch=previousFetch;}
});
