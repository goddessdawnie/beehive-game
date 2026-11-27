// Auth-scoped task snapshot and serialized application refresh coordinator.
// UI, RPCs and reward mutations remain with the caller; this module does not
// fetch or persist records. A generation invalidates in-flight load results.
export function createTaskRefresh({run,onDiscard}){
 let loading=false,reloadRequested=false,snapshot=null,owner=null,generation=0;
 async function load(){
  if(loading){reloadRequested=true;return;}
  loading=true;
  try{await run();}
  finally{
   loading=false;
   if(reloadRequested){reloadRequested=false;void load();}
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
