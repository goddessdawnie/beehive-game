// Pure task tab selection for the Beehive browser.
// No Supabase calls, DOM manipulation, persisted state, or task mutations.
// The caller still fetches tasks and handles display/refresh; this is deliberately a separate refactor.
const taskTabs=['today','anytime','completed','future'];

export function easternCalendarDay(instant){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const get=type=>parts.find(part=>part.type===type)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}

export function compareCompletedTasks(a,b){
 const completedTime=t=>t.status==='completed'&&t.completed_at&&Number.isFinite(Date.parse(t.completed_at))?Date.parse(t.completed_at):null;
 const aTime=completedTime(a),bTime=completedTime(b);
 if(aTime!==null&&bTime!==null&&aTime!==bTime)return bTime-aTime;
 if(aTime!==null)return -1;
 if(bTime!==null)return 1;
 const aCreated=Date.parse(a.created_at||'')||0,bCreated=Date.parse(b.created_at||'')||0;
 return bCreated-aCreated||String(a.id||'').localeCompare(String(b.id||''));
}

export function selectTaskView({
 tasks, possibilityCount=0, taskFilter='today', search='',
 locationFilter='', categoryFilter='', originFilter='', now=new Date()
}){
 // Preserve the existing due-date boundary in the device's local timezone,
 // and separately use the Eastern calendar day for planned_on.
 const todayStart=new Date(now);
 todayStart.setHours(0,0,0,0);
 const tomorrow=new Date(todayStart);
 tomorrow.setDate(tomorrow.getDate()+1);
 const plannedDay=easternCalendarDay(now);
 const belongs=(t,tab)=>{
  if(tab==='completed')return ['completed','cancelled','deferred'].includes(t.status);
  if(t.status!=='open')return false;
  const chosen=t.planned_on===plannedDay;
  if(tab==='today')return chosen||(!!t.due_at&&new Date(t.due_at)<tomorrow);
  if(tab==='anytime')return !chosen&&!t.due_at;
  return !chosen&&!!t.due_at&&new Date(t.due_at)>=tomorrow;
 };
 const counts={today:0,anytime:0,completed:0,future:0,possibilities:possibilityCount};
 for(const t of tasks)for(const tab of taskTabs)if(belongs(t,tab))counts[tab]++;
 const needle=search.trim().toLowerCase(),searching=!!needle;
 const location=locationFilter.trim().toLowerCase(),category=categoryFilter.trim().toLowerCase();
 const matches=t=>!needle||[t.title,t.instructions,t.completion_notes,t.task_location,t.task_category]
  .some(v=>(v||'').toLowerCase().includes(needle));
 const contextMatches=t=>(!location||(t.task_location||'').toLowerCase().includes(location))
  &&(!category||(t.task_category||'').toLowerCase().includes(category))
  &&(!originFilter||(originFilter==='unknown'?!['user','bee','kae'].includes(t.task_origin):t.task_origin===originFilter));
 const visible=tasks.filter(t=>(searching||belongs(t,taskFilter))&&matches(t)&&contextMatches(t))
  .sort((a,b)=>{
   if(!searching&&taskFilter==='completed')return compareCompletedTasks(a,b);
   if(a.due_at&&b.due_at)return new Date(a.due_at)-new Date(b.due_at);
   return new Date(b.created_at)-new Date(a.created_at);
  });
 return {counts,visible,searching,plannedDay,todayStart};
}
