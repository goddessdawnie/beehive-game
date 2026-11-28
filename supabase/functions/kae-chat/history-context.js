// Kae's ephemeral context is not his archive or Sol-curated memory.
// Presentation-only: never write or prune saved messages and task records.
const easternStampFormat = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/New_York",month:"2-digit",day:"2-digit",
 hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
export function easternHistoryStamp(timestamp){
 if(typeof timestamp!=="string" || !timestamp.trim())return null;
 const date=new Date(timestamp);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=easternStampFormat.formatToParts(date);
 const part=type=>parts.find(x=>x.type===type)?.value;
 return '['+part('month')+'/'+part('day')+' '+part('hour')+':'+part('minute')+']';
}
export function explicitlyResumesOlderTopic(message){
 return typeof message==="string" && /\b(?:remember (?:when|that|our)|last time|we (?:talked|discussed)|back to (?:our|that)|continue (?:our|the) (?:conversation|discussion)|earlier we)\b/i.test(message);
}
export function recentConversationMessages(rows,limit=12,policy={}){
 // The context RPC returns chronological order. Never reorder speaker roles.
 const selected=(Array.isArray(rows)?rows:[]).slice(-limit);
 const now=Number(policy.now);
 const ageHours=Number(policy.maxAgeHours);
 const cutoff=Number.isFinite(now)&&Number.isFinite(ageHours)&&ageHours>0?now-ageHours*3600000:null;
 const fresh=[],older=[];
 for(const entry of selected){
  const at=Date.parse(entry.created_at);
  if(cutoff!==null&&(!Number.isFinite(at)||at<cutoff))older.push(entry);
  else fresh.push(entry);
 }
 // Explicit resumption permits at most the last two older entries. An older
 // exchange might be unrelated; Kae must not claim it is the referenced one.
 const candidates=[...(policy.resumeOlder?older.slice(-2):[]),...fresh].slice(-limit);
 const maxChars=Number.isFinite(policy.maxChars)&&policy.maxChars>0?Math.floor(policy.maxChars):Infinity;
 const chosen=[];
 let used=0;
 for(let i=candidates.length-1;i>=0;i--){
  const item=candidates[i],stamp=easternHistoryStamp(item.created_at);
  const role=item.role==="mochi"?"assistant":"user";
  const content=typeof item.content==="string"?item.content:"";
  let marked=stamp&&!content.startsWith(stamp+" ")?stamp+" "+content:content;
  if(used+marked.length>maxChars){
   if(chosen.length>0)continue;
   // Keep the newest exchange even if unusually long, marked as partial.
   marked=marked.slice(0,Math.max(0,maxChars-15))+" [truncated]";
  }
  chosen.push({role,content:marked});
  used+=marked.length;
 }
 return chosen.reverse();
}
export function compactRecentTaskActivity(rows){
 const compact=[],routineIndex=new Map();
 for(const task of Array.isArray(rows)?rows:[]){
  const current={...task};
  const identicalNote=String(task.completion_notes||'').trim().replace(/\s+/g,' ').toLowerCase();
  if(task.status!=="completed"){compact.push(current);continue}
  const key=JSON.stringify([String(task.title||'').trim().toLowerCase(),task.status,task.task_origin||'',identicalNote]);
  if(routineIndex.has(key)){
   const previous=compact[routineIndex.get(key)];
   previous.repeat_count=(previous.repeat_count||1)+1;
  }else{
   routineIndex.set(key,compact.length);
   compact.push(current);
  }
 }
 return compact;
}
