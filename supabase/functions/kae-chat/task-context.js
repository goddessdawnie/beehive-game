// Kae's bounded, read-only, rolling activity context. No task mutations.
export function mergeRecentTaskActivity(updatedRows,completedRows,cutoffMs,{limit=24,sourceLimit=41}={}){
  const toMs=value=>value?Date.parse(value)||0:0;
  const candidates=new Map();
  for(const task of [...(updatedRows||[]),...(completedRows||[])]){
    if(!task?.id)continue;
    const updatedAt=toMs(task.updated_at);
    const completedAt=task.status==="completed"?toMs(task.completed_at):0;
    const lastActivity=Math.max(updatedAt,completedAt);
    if(lastActivity<cutoffMs)continue;
    // Both queries return the current task row; prefer a completed snapshot only
    // when otherwise tied, although normally both are identical.
    if(!candidates.has(task.id)||toMs(candidates.get(task.id).updated_at)<updatedAt)candidates.set(task.id,task);
  }
  const sorted=[...candidates.values()].sort((a,b)=>{
    const ta=Math.max(toMs(a.updated_at),a.status==="completed"?toMs(a.completed_at):0);
    const tb=Math.max(toMs(b.updated_at),b.status==="completed"?toMs(b.completed_at):0);
    return tb-ta||String(a.id).localeCompare(String(b.id));
  });
  const partial=sorted.length>limit||(updatedRows||[]).length>=sourceLimit||(completedRows||[]).length>=sourceLimit;
  const tasks=sorted.slice(0,limit).map(t=>({
    title:String(t.title||"").slice(0,140),
    status:t.status,
    updated_at:t.updated_at,
    completed_at:t.status==="completed"?t.completed_at:null,
    completion_notes:t.status==="completed"?String(t.completion_notes||"").slice(0,350):null,
    task_origin:t.task_origin,
    last_activity_at:new Date(Math.max(toMs(t.updated_at),t.status==="completed"?toMs(t.completed_at):0)).toISOString()
  }));
  return {tasks,partial,window_hours:48};
}
