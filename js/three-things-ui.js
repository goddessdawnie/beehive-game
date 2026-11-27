// Three Things UI controller: existing authenticated suggestions, reactions and actions.
// No separate persistence; injected load() refreshes the existing app snapshot.
export function createThreeThingsUI({db,el,difficultyNames,load}){
let threeItems=[],threeBusy=false;
const threeFeedbackSaving=new Set();
const threeFeedback=msg=>el('three-feedback').textContent=msg;
function renderThree(){
 const host=el('three-list');host.replaceChildren();el('three-clear').classList.toggle('hidden',threeItems.length===0);
 for(const item of threeItems){
  const card=document.createElement('section');card.className='three-card';
  const heading=document.createElement('h3');heading.textContent=item.title;
  const detail=document.createElement('p');detail.textContent=item.detail||'';
  const meta=document.createElement('p');meta.className='muted';meta.textContent=item.category.replace('_',' ')+' · '+(difficultyNames[item.difficulty]||'Tiny');
  const reactions=document.createElement('div');reactions.className='three-reactions';
  reactions.setAttribute('role','group');reactions.setAttribute('aria-label','Your reaction to '+item.title);
  const reactionButtons=[];
  for(const [emoji,value,label] of [['👍','positive','Positive'],['😐','neutral','Neutral'],['👎','negative','Negative']]){
   const button=document.createElement('button');button.type='button';button.textContent=emoji;button.title=label;
   button.setAttribute('aria-label',label+' reaction for '+item.title);
   button.setAttribute('aria-pressed',String(item.feedback===value));button.disabled=threeBusy;
   button.onclick=async()=>{
    if(threeBusy||threeFeedbackSaving.has(item.id))return;
    threeFeedbackSaving.add(item.id);
    for(const b of [...reactionButtons,...actions.querySelectorAll('button')])b.disabled=true;
    try{
     const {data,error}=await db.from('three_things').update({feedback:value})
      .eq('id',item.id).eq('status','suggested').select('id,feedback').maybeSingle();
     if(error)throw error;
     if(!data||data.id!==item.id)throw Error('Suggestion is no longer active; refresh Three Things.');
     item.feedback=data.feedback;
     feedbackNotePanel.hidden=false;
     reactionButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(item.feedback===['positive','neutral','negative'][i])));
     threeFeedback('Reaction saved.');
    }catch(err){threeFeedback('Could not save reaction: '+(err.message||err))}
    finally{
     threeFeedbackSaving.delete(item.id);
     for(const b of [...reactionButtons,...actions.querySelectorAll('button')])b.disabled=threeBusy;
    }
   };
   reactionButtons.push(button);reactions.append(button);
  }
  const feedbackNotePanel=document.createElement('div');feedbackNotePanel.hidden=!item.feedback;
  const feedbackNoteInput=document.createElement('textarea');feedbackNoteInput.placeholder='Why this reaction? (optional)';feedbackNoteInput.maxLength=500;
  feedbackNoteInput.value=item.feedback_note||'';feedbackNoteInput.setAttribute('aria-label','Optional feedback for '+item.title);
  const saveFeedbackNote=document.createElement('button');saveFeedbackNote.type='button';saveFeedbackNote.textContent='Save feedback note';
  saveFeedbackNote.onclick=async()=>{
   if(threeBusy||threeFeedbackSaving.has(item.id))return;
   threeFeedbackSaving.add(item.id);saveFeedbackNote.disabled=true;
   try{
    const note=feedbackNoteInput.value.trim();
    const {data,error}=await db.from('three_things').update({feedback_note:note||null})
     .eq('id',item.id).eq('status','suggested').select('id,feedback_note').maybeSingle();
    if(error)throw error;
    if(!data)throw Error('Suggestion is no longer active; refresh Three Things.');
    item.feedback_note=data.feedback_note;threeFeedback('Feedback note saved for future suggestions.');
   }catch(err){threeFeedback('Could not save feedback note: '+(err.message||err))}
   finally{threeFeedbackSaving.delete(item.id);saveFeedbackNote.disabled=threeBusy;}
  };
  feedbackNotePanel.append(feedbackNoteInput,saveFeedbackNote);
  const notes=document.createElement('textarea');notes.placeholder='Completion notes (optional, for the Bees to notice)';notes.maxLength=3000;notes.setAttribute('aria-label','Completion notes for '+item.title);
  const actions=document.createElement('div');actions.style.display='flex';actions.style.flexWrap='wrap';actions.style.gap='8px';
  for(const [label,action] of [['Complete','complete'],['Add to today','add'],['Keep for later','keep'],['Replace','replace']]){
   const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=threeBusy;
   button.onclick=async()=>{if(threeBusy||threeFeedbackSaving.has(item.id))return;const savedNotes=notes.value;threeBusy=true;threeFeedback('Working…');
    try{
     if(action==='replace'){
      const cleared=await db.rpc('three_things_act',{p_id:item.id,p_action:'clear'});if(cleared.error)throw cleared.error;
      threeItems=threeItems.filter(x=>x.id!==item.id);renderThree();await generateThree(1);return;
     }
     const result=await db.rpc('three_things_act',{p_id:item.id,p_action:action,p_notes:action==='complete'?savedNotes:''});
     if(result.error)throw result.error;
     threeItems=threeItems.filter(x=>x.id!==item.id);
     threeFeedback(action==='complete'?'Completed and recorded for the Bees.':action==='keep'?'Kept as an undated Kae task. Find it with the Kae origin filter.':'Added to today’s working list without a deadline.');
     await load();
    }catch(err){threeFeedback(err.message||'Something went wrong.')}
    finally{threeBusy=false;renderThree();}
   };actions.append(button);
  }
  card.append(heading,detail,meta,reactions,feedbackNotePanel,notes,actions);host.append(card);
 }
}
async function generateThree(count=3){
 if(threeBusy&&count===3)return;
 threeBusy=true;threeFeedback('Finding possibilities…');renderThree();
 try{
  const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Sign in first');
  const response=await fetch('https://kyfyzrtsksybnrrlnhmj.supabase.co/functions/v1/three-things',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_ER9TbRzYW05miP8TkHcdaQ_zjr6NuGk'},body:JSON.stringify({count,avoid:threeItems.map(x=>x.title)})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not generate suggestions');
  threeItems.push(...result.suggestions);threeFeedback('Choose whatever appeals to you.');
 }catch(err){threeFeedback(err.message||'Generation failed. Please retry.')}
 finally{threeBusy=false;renderThree();}
}
el('three-generate').onclick=()=>{if(!threeBusy&&threeItems.length===0)void generateThree(3);else if(threeItems.length)threeFeedback('Clear and regenerate to start a new set.');};
el('three-clear').onclick=async()=>{if(threeBusy)return;threeBusy=true;threeFeedback('Clearing suggestions…');try{for(const item of threeItems){const r=await db.rpc('three_things_act',{p_id:item.id,p_action:'clear'});if(r.error)throw r.error;}threeItems=[];threeBusy=false;renderThree();await generateThree(3);}catch(e){threeFeedback(e.message||'Could not clear all');threeBusy=false;renderThree();}};
async function restoreThree(){const r=await db.from('three_things').select('id,title,detail,category,difficulty,status,feedback,feedback_note').eq('status','suggested').order('created_at',{ascending:false}).limit(3);if(!r.error){threeItems=(r.data||[]).reverse();renderThree();}}
return {restoreThree,clearLocal(){threeItems=[];renderThree();}};
}
