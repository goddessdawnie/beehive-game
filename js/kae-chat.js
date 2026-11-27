// Kae chat presentation and transport controller. Browser-only, no extra storage.
// DOM-safe Markdown, chat history and copy buttons remain identical to the
// previously accepted behavior; the caller supplies the authenticated client.
export function createKaeChatUI({db,el,notice,endpoint,apiKey}){
let chatBusy=false;
async function copyChatMessage(content,button){try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(content);button.textContent='Copied ✓'}catch{button.textContent='Copy failed';notice('Unable to copy this message. Check browser clipboard permissions.')}setTimeout(()=>{if(button.isConnected)button.textContent='⧉ Copy'},1800)}
// Render a deliberately small Markdown subset using DOM nodes, never HTML injection.
function renderChatMarkdown(raw){
 const out=document.createDocumentFragment(), source=String(raw??'');
 const markers=[['***','strong','em'],['**','strong'],['~~','s'],['*','em'],['`','code']];
 function append(parent,text){if(text)parent.append(document.createTextNode(text))}
 function parse(text,parent){
  let i=0,plain='';
  while(i<text.length){
   if(text[i]==='\\' && i+1<text.length && '*~`\\'.includes(text[i+1])){plain+=text[i+1];i+=2;continue}
   const entry=markers.find(([mark])=>text.startsWith(mark,i));
   if(!entry){plain+=text[i++];continue}
   const [mark,...tags]=entry;let end=-1;
   for(let j=i+mark.length;j<=text.length-mark.length;j++){
    if(text.startsWith(mark,j) && (j===0 || text[j-1]!=='\\')){end=j;break}
   }
   if(end<0){plain+=mark;i+=mark.length;continue}
   append(parent,plain);plain='';
   const outer=document.createElement(tags[0]);
   const inner=tags.length>1?outer.appendChild(document.createElement(tags[1])):outer;
   if(mark==='`')append(inner,text.slice(i+mark.length,end));
   else parse(text.slice(i+mark.length,end),inner);
   parent.append(outer);i=end+mark.length;
  }
  append(parent,plain);
 }
 parse(source,out);return out;
}
async function loadChat(){const r=await db.from('mochi_messages').select('role,content,created_at').order('created_at',{ascending:false}).limit(30);if(r.error){notice(r.error.message);return}const log=el('chatlog');log.replaceChildren();for(const m of (r.data||[]).sort((a,b)=>{const time=new Date(a.created_at)-new Date(b.created_at);return time||((a.role==='user'?0:1)-(b.role==='user'?0:1))})){const line=document.createElement('p');line.className='chat-line';const who=document.createElement('strong');who.textContent=m.role==='mochi'?'Kae: ':'You: ';line.append(who);const copy=document.createElement('button');copy.type='button';copy.className='chat-copy';copy.textContent='⧉ Copy';copy.setAttribute('aria-label',m.role==='mochi'?'Copy Kae message':'Copy your message');copy.onclick=()=>void copyChatMessage(m.content,copy);line.append(copy);line.append(renderChatMarkdown(m.content));log.append(line)}if(!r.data?.length){const p=document.createElement('p');p.className='muted';p.textContent='Kae is awaiting an audience. He insists he is not waiting.';log.append(p)}log.scrollTop=log.scrollHeight}
function placeholderReply(input){const s=input.toLowerCase();if(/hello|hi|hey|morning/.test(s))return 'There you are, peasant. The lamp has been conspiring in your absence.';if(/litter|clean|trash|chore/.test(s))return 'At last, an attempt to restore order to my estate. I shall supervise from the hoard.';if(/sorry|busy|tired/.test(s))return 'I shall file that excuse under barely plausible. Sit down, tiny human.';return 'I have opinions, naturally. Continue, servant. The dragon is listening.'}
const chatText=el('chattext');function sizeChatComposer(){chatText.style.height='auto';chatText.style.height=Math.min(chatText.scrollHeight,240)+'px'}chatText.addEventListener('input',sizeChatComposer);chatText.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();el('chat').requestSubmit()}});
el('chat').onsubmit=async e=>{e.preventDefault();if(chatBusy)return;const value=el('chattext').value.trim();if(!value)return;chatBusy=true;const submit=el('chat').querySelector('button');submit.disabled=true;submit.textContent='Kae is considering…';const feedback=el('chatfeedback');feedback.textContent='';try{const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError||!session)throw Error('Please sign in again');const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':apiKey},body:JSON.stringify({message:value})});const result=await response.json();if(!response.ok)throw Error(result.error||'Kae is unavailable');el('chattext').value='';sizeChatComposer();await loadChat()}catch(error){feedback.textContent=error.message||'Conversation failed. Please retry.'}finally{chatBusy=false;submit.disabled=false;submit.textContent='Send'}};
async function kaeInitiate(mode,itemId){if(chatBusy)return;chatBusy=true;const tap=el('kaetap'),feedback=el('chatfeedback');tap.disabled=true;feedback.textContent=mode==='gift'?'Kae is inspecting his new possession…':mode==='tap'?'Kae is considering his next proclamation…':'';try{const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Please sign in again');const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':apiKey},body:JSON.stringify({mode,item_id:itemId})});const result=await response.json();if(!response.ok)throw Error(result.error||'Kae is unavailable');if(!result.skipped)await loadChat();feedback.textContent=''}catch(error){if(mode==='tap'||mode==='gift')feedback.textContent=error.message||'Kae is unavailable'}finally{chatBusy=false;tap.disabled=false}}
el('kaetap').onclick=()=>kaeInitiate('tap');
return {loadChat,kaeInitiate,isBusy:()=>chatBusy};
}
