// Auth-scoped task snapshot and serialized refresh coordinator.
// Full estate refreshes outrank task-only reads when concurrent mutations queue
// another pass; both still share one generation and one detached owner snapshot.
export function createTaskRefresh({run,onDiscard}){
 let loading=false,pendingScope=null,snapshot=null,owner=null,generation=0;
 async function load(scope='full'){
  // DOM onclick=load supplies a click event, not a refresh scope.
  // Treat non-string call arguments as the normal full refresh.
  const requested=typeof scope==='string'?scope:'full';
  if(requested!=='full'&&requested!=='tasks')throw Error('Unsupported refresh scope');
  if(loading){
   pendingScope=requested==='full'||pendingScope==='full'?'full':'tasks';
   return;
  }
  loading=true;
  try{await run(requested);}
  finally{
   loading=false;
   if(pendingScope){
    const queued=pendingScope;
    pendingScope=null;
    void load(queued);
   }
  }
 }
 function discard(){
  snapshot=null;owner=null;generation++;
  onDiscard();
 }
 function commit(ownerId,rows){
  owner=ownerId;
  snapshot=rows.map(row=>({...row}));
 }
 return {load,discard,commit,get snapshot(){return snapshot},get owner(){return owner},get generation(){return generation}};
}


// Both full and task-only refreshes require the SAME owner-scoped, complete,
// searchable history. Fetch only the fields consumed by the browser. Use
// stable keyset pages (created_at DESC, id DESC) to bypass the 1,000-row cap.
export const TASK_SNAPSHOT_FIELDS='id,title,status,due_at,recurrence_rule,reward_coins,completed_at,created_at,recurrence_series_id,instructions,completion_notes,task_origin,restarted_at,activity_id,difficulty,task_location,task_category,planned_on';
const PAGE_SIZE=500;
export async function readTaskSnapshot(db,{pageSize=PAGE_SIZE}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>PAGE_SIZE)
  throw new Error('Invalid task snapshot page size');
 const rows=[],ids=new Set();
 let cursor=null,total=null;
 const incomplete=()=>({data:null,error:new Error('Task history was incomplete; refresh to retry')});
 while(true){
  const first=cursor===null;
  let q=db.from('tasks').select(TASK_SNAPSHOT_FIELDS,first?{count:'exact'}:{})
   .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(pageSize);
  if(cursor)q=q.or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')');
  const {data,error,count}=await q;
  if(error)return {data:null,error};
  if(!Array.isArray(data))return incomplete();
  if(first){
   if(!Number.isSafeInteger(count)||count<0)return incomplete();
   total=count;
  }
  for(const row of data){
   if(!row?.id||!row?.created_at||ids.has(row.id))return incomplete();
   ids.add(row.id);
  }
  rows.push(...data);
  if(rows.length>total)return incomplete();
  if(rows.length===total)return {data:rows,error:null};
  // A shorter page while more rows are expected signals an API cap or race.
  // Never replace a complete local snapshot with partial history.
  if(data.length<pageSize)return incomplete();
  const last=data[data.length-1];
  // Keep the exact server timestamp, including microseconds, for tied IDs.
  cursor={created_at:last.created_at,id:last.id};
 }
}
