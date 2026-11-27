// Auth-scoped task snapshot and serialized refresh coordinator.
// Full estate refreshes outrank task-only reads when concurrent mutations queue
// another pass; both still share one generation and one detached owner snapshot.
export function createTaskRefresh({run,onDiscard}){
 let loading=false,pendingScope=null,snapshot=null,owner=null,generation=0;
 async function load(scope='full'){
  if(scope!=='full'&&scope!=='tasks')throw Error('Unsupported refresh scope');
  if(loading){
   pendingScope=scope==='full'||pendingScope==='full'?'full':'tasks';
   return;
  }
  loading=true;
  try{await run(scope);}
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
