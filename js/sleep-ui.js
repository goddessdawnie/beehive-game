// Browser-only Sleep tab; the caller supplies its authenticated Supabase client and DOM lookup.
// No additional private route, imports or persisted state.
export function createSleepUI({db,el}){
// Read-only sleep view. Group by local start date, never collapse individual naps.
const sleepDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const sleepClockFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const sleepMinutes=n=>{const m=Math.max(0,Math.round(Number(n)||0));return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
const sleepLocalDay=iso=>{const parts=sleepDateFormatter.formatToParts(new Date(iso));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
let sleepLoading=false;
async function loadSleep(){
 if(sleepLoading)return;
 const days=Number(el('sleep-range').value);
 if(![7,14,30].includes(days))return;
 sleepLoading=true;
 const status=el('sleep-status'),chart=el('sleep-chart'),list=el('sleep-days');
 status.textContent='Loading sleep…';chart.replaceChildren();list.replaceChildren();el('sleep-legend')?.remove();
 try{
  const {data,error}=await db.rpc('bee_sleep_recent',{p_days:days});
  if(error)throw error;
  const byDay=new Map();
  for(const session of data||[]){
   if(!session.start_time||!Number.isFinite(Date.parse(session.start_time)))continue;
   const day=sleepLocalDay(session.start_time);
   if(!byDay.has(day))byDay.set(day,{day,total:0,deep:0,sessions:[]});
   const group=byDay.get(day);
   const total=Math.max(0,Number(session.minutes_asleep)||0);
   const deep=Math.max(0,Math.min(total,Number(session.minutes_deep)||0));
   group.total+=total;group.deep+=deep;group.sessions.push(session);
  }
  const groups=[...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day));
  if(!groups.length){status.textContent='No imported sleep sessions in this range.';return}
  const sum=groups.reduce((a,g)=>a+g.total,0);
  status.textContent=groups.length+' day(s) · '+(data||[]).length+' session(s) · '+sleepMinutes(sum)+' asleep';
  const legend=document.createElement('p');legend.className='sleep-legend';legend.id='sleep-legend';legend.textContent='Purple: total asleep · dark purple: deep sleep';chart.before(legend);
  const max=Math.max(...groups.map(g=>g.total),1);
  for(const g of groups){
   const wrap=document.createElement('div');wrap.className='sleep-bar-wrap';
   const bar=document.createElement('div');bar.className='sleep-bar';
   const total=document.createElement('div');total.className='sleep-bar-total';total.style.height=Math.max(2,Math.round(g.total/max*105))+'px';
   const deep=document.createElement('div');deep.className='sleep-bar-deep';deep.style.height=(g.total?Math.round(g.deep/g.total*100):0)+'%';
   total.append(deep);bar.append(total);wrap.append(bar);
   const date=document.createElement('span');date.textContent=g.day.slice(5);wrap.append(date);
   wrap.title=g.day+': '+sleepMinutes(g.total)+' asleep, '+sleepMinutes(g.deep)+' deep';
   chart.append(wrap);
  }
  for(const g of groups.reverse()){
   const details=document.createElement('details');details.className='sleep-day';
   const summary=document.createElement('summary');summary.textContent=g.day+' · '+sleepMinutes(g.total)+' asleep · '+sleepMinutes(g.deep)+' deep · '+g.sessions.length+' session(s)';
   details.append(summary);
   for(const session of g.sessions){
    const p=document.createElement('p');p.className='sleep-session';
    p.textContent=sleepClockFormatter.format(new Date(session.start_time))+' – '+sleepClockFormatter.format(new Date(session.end_time))+' · '+sleepMinutes(session.minutes_asleep)+' asleep · '+sleepMinutes(session.minutes_deep)+' deep';
    details.append(p);
   }
   list.append(details);
  }
 }catch(error){status.textContent='Could not load sleep history: '+(error.message||error)}
 finally{sleepLoading=false}
}
el('sleep-range').addEventListener('change',()=>void loadSleep());
 return {loadSleep};
}
