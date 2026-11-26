// Pure, intentionally conservative duplicate guard for Three Things suggestions.
// The language model supplies the ideas; this rejects high-confidence repeats of
// open tasks, recently suggested work, and duplicates within one generated batch.
// Distinct intentions, targets and clearly smaller scopes remain eligible.
const aliases=new Map(Object.entries({
 stairs:'stair',staircase:'stair',stairway:'stair',steps:'stair',step:'stair',
 fluff:'fur',fuzz:'fur',hair:'fur',hairs:'fur',fuzzy:'fur',
 squashed:'flatten',flattened:'flatten',crushed:'flatten',squished:'flatten',
 lumps:'clump',lump:'clump',clumps:'clump',wad:'clump',wads:'clump',
 shelves:'shelf',shelving:'shelf',countertops:'counter',counters:'counter',
 leaking:'leak',leaky:'leak',dripping:'leak',drips:'leak',
 tiles:'tile',patches:'patch',entryway:'entrance',doorway:'entrance',
 cupboards:'cabinet',cupboard:'cabinet',cabinets:'cabinet',
 boxes:'box',windows:'window',floors:'floor',sinks:'sink',
 fixing:'fix',repairs:'repair',cleaning:'clean',scrubbing:'scrub'
}));
const ignored=new Set([
 'a','an','the','and','or','of','to','for','from','at','by','with','about','on',
 'in','into','around','near','behind','under','beneath','above','below','beside',
 'my','our','your','this','that','these','those','there','here','it','its','is',
 'be','been','being','do','does','doing','get','got','give','make','some','few',
 'little','thing','stuff','something','today','tonight','tomorrow','again',
 'another','next','quick','brief','just','please','one','two','three','minute',
 'minutes','declare','defeat','tackle','deal','try','time','have','has','had'
]);
const actionGroups={
 inspect:['inspect','investigate','check','diagnose','troubleshoot','assess','examine','trace','test','review'],
 repair:['repair','fix','replace','patch','mend','tighten','install','unclog','restore'],
 clean:['clean','sweep','vacuum','scrub','wash','wipe','dust','mop','tidy','dispose','discard','remove','collect'],
 create:['draw','paint','craft','build','sew','write','fold','design','knit','sketch'],
 plan:['plan','research','list','schedule','budget'],
 buy:['buy','purchase','order','shop'],
 contact:['call','email','message','ask']
};
const actionWords=new Map(Object.entries(actionGroups).flatMap(([group,words])=>words.map(w=>[w,group])));
const surfaces=new Set(['stair','floor','counter','sink','faucet','drain','mirror','shelf','desk','window','door','carpet','rug','toilet','wall','ceiling','pipe','fridge','cabinet','roof','table','bed','chair']);
const smallScope=/\b(patch|section|corner|square[ -]foot|small area|tiny area|two[ -]minute|few minutes)\b/i;
const wholeScope=/\b(entire|whole|all|every|deep[ -]clean|full room)\b/i;

function words(value){
 return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .match(/[a-z0-9]+/g)||[];
}
function canonical(token){
 if(aliases.has(token))return aliases.get(token);
 if(token.endsWith('ies')&&token.length>5)return token.slice(0,-3)+'y';
 if(token.endsWith('s')&&!token.endsWith('ss')&&token.length>4)return token.slice(0,-1);
 return token;
}
function signature(title){
 const tokens=words(title).map(canonical);
 const actions=new Set(tokens.map(x=>actionWords.get(x)).filter(Boolean));
 const content=new Set(tokens.filter(x=>!ignored.has(x)&&!actionWords.has(x)&&x.length>1));
 const targets=new Set([...content].filter(x=>surfaces.has(x)));
 const scope=smallScope.test(title)?'small':wholeScope.test(title)?'whole':'normal';
 return {actions,content,targets,scope};
}
function sharedCount(first,second){
 let n=0;for(const x of first)if(second.has(x))n++;return n;
}
export function isNearDuplicate(first,second){
 const titleA=typeof first==='string'?first:first?.title;
 const titleB=typeof second==='string'?second:second?.title;
 if(!titleA||!titleB)return false;
 const a=signature(titleA),b=signature(titleB);
 const simpleA=words(titleA).map(canonical).filter(x=>!ignored.has(x)).join(' ');
 const simpleB=words(titleB).map(canonical).filter(x=>!ignored.has(x)).join(' ');
 if(simpleA===simpleB)return true;
 if(a.scope!==b.scope&&(a.scope!=='normal'||b.scope!=='normal'))return false;
 // Distinct actions with the same location are not the same task:
 // diagnosing a sink leak and repairing that leak can be separate steps.
 if(a.actions.size&&b.actions.size&&!sharedCount(a.actions,b.actions)){
  // Inspecting and fixing a leak are different stages. But "investigate this
  // particular clump of fur" and "clean that same clump of fur" can be two
  // theatrical titles for one tiny disposal chore.
  const inspectAndClean=(a.actions.has('inspect')&&b.actions.has('clean'))||
    (a.actions.has('clean')&&b.actions.has('inspect'));
  const waste=new Set(['fur','clump','dirt','grime','crumb','trash','litter','dust']);
  const sameWaste=[...waste].some(x=>a.content.has(x)&&b.content.has(x));
  if(!inspectAndClean||!sameWaste||sharedCount(a.content,b.content)<3)return false;
 }
 // Two explicitly different surfaces are distinct jobs even in one room.
 if(a.targets.size&&b.targets.size&&(a.targets.size!==b.targets.size||
    sharedCount(a.targets,b.targets)!==a.targets.size))return false;
 const overlap=sharedCount(a.content,b.content);
 if(overlap<2)return false;
 const small=Math.min(a.content.size,b.content.size);
 const union=a.content.size+b.content.size-overlap;
 return overlap/small>=0.8&&overlap/union>=0.55;
}
export function findSuggestionCollision(candidate,openTasks=[],recentSuggestions=[],accepted=[]){
 const lists=[
  ['open task',openTasks],
  ['recent suggestion',recentSuggestions],
  ['same batch',accepted]
 ];
 for(const [kind,records] of lists){
  for(const record of records||[]){
   if(isNearDuplicate(candidate,record))return {kind,title:record.title||String(record)};
  }
 }
 return null;
}
