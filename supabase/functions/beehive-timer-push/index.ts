import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';

const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false}
});
function secureMatch(a:string,b:string):boolean{
 const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
 let diff=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
 return diff===0;
}
async function retryOrFinish(t:any,status:'sent'|'failed'|'pending',error:string|null){
 const retryAfter=status==='pending'?new Date(Date.now()+30000*Math.min(t.attempts,5)).toISOString():null;
 const {error:e}=await admin.from('beehive_timers').update({
  status,last_error:error,retry_after:retryAfter,
  lease_until:null,updated_at:new Date().toISOString(),
  sent_at:status==='sent'?new Date().toISOString():null
 }).eq('id',t.id).eq('status','sending').eq('attempts',t.attempts);
 if(e)console.error('timer status write failed',e.message);
}

async function finishBell(b:any,status:'sent'|'failed'|'pending',reason:string|null){
 const retryAfter=status==='pending'?new Date(Date.now()+30000*Math.min(b.attempts,5)).toISOString():null;
 const {error}=await admin.from('beehive_bell_outbox').update({
   status,last_error:reason,retry_after:retryAfter,lease_until:null,
   updated_at:new Date().toISOString(),
   sent_at:status==='sent'?new Date().toISOString():null
 }).eq('id',b.id).eq('status','sending').eq('attempts',b.attempts);
 if(error)console.error('Bell status write failed',error.message);
}

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const {data:config,error:configError}=await admin.rpc('beehive_worker_config');
 if(configError||!config?.worker_token||!config?.vapid_private||!config?.vapid_public){
  console.error('Timer worker configuration unavailable',configError?.message);
  return new Response('Service unavailable',{status:503});
 }
 if(!secureMatch(req.headers.get('x-beehive-worker')||'',config.worker_token))
  return new Response('Forbidden',{status:403});
 webpush.setVapidDetails('https://goddessdawnie.github.io',config.vapid_public,config.vapid_private);
 const {data:timers,error:claimError}=await admin.rpc('beehive_claim_due_timers',{p_limit:20});
 if(claimError){console.error('Claim failed',claimError.message);return new Response('Claim failed',{status:503});}
 let sent=0,failed=0,retrying=0;
 for(const timer of timers||[]){
  try{
   const {data:subs,error:subError}=await admin.from('beehive_push_subscriptions')
    .select('id,endpoint,p256dh,auth_key').eq('owner_id',timer.owner_id);
   if(subError)throw new Error('Subscription lookup failed: '+subError.message);
   if(!subs?.length){await retryOrFinish(timer,'failed','No notification-enabled device found');failed++;continue;}
   let success=0;
   let lastReason='Push service did not accept the notification';
   for(const sub of subs){
    try{
     await webpush.sendNotification(
      {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},
      JSON.stringify({title:'Beehive timer',body:timer.label+' finished.',tag:'beehive-timer-'+timer.id}),
      {TTL:86400,urgency:'high'}
     );
     success++;
    }catch(e){
     const status=(e as any)?.statusCode;
     if(status===404||status===410){
      await admin.from('beehive_push_subscriptions').delete().eq('id',sub.id);
      lastReason='Push subscription expired; enable notifications again';
     }else{
      lastReason='Push delivery failed'+(status?' ('+status+')':'');
      console.warn('Push send failure',timer.id,status||'network');
     }
    }
   }
   if(success){await retryOrFinish(timer,'sent',null);sent++;}
   else if(timer.attempts>=5){await retryOrFinish(timer,'failed',lastReason);failed++;}
   else {await retryOrFinish(timer,'pending',lastReason);retrying++;}
  }catch(e){
   console.error('Timer worker error',timer.id,String(e).slice(0,200));
   if(timer.attempts>=5){await retryOrFinish(timer,'failed','Timer delivery encountered an error');failed++;}
   else {await retryOrFinish(timer,'pending','Temporary delivery error');retrying++;}
  }
 }

 const {data:bells,error:bellClaimError}=await admin.rpc('beehive_claim_due_bells',{p_limit:20});
 if(bellClaimError){console.error('Bell claim failed',bellClaimError.message);return new Response('Bell queue unavailable',{status:503});}
 let bellsSent=0,bellsFailed=0,bellsRetrying=0;
 for(const bell of bells||[]){
  try{
   const {data:subs,error:subError}=await admin.from('beehive_push_subscriptions')
    .select('id,endpoint,p256dh,auth_key').eq('owner_id',bell.owner_id);
   if(subError)throw new Error('Bell subscription lookup failed');
   if(!subs?.length){await finishBell(bell,'failed','No connected device');bellsFailed++;continue;}
   let accepted=0,lastReason='Push service did not accept bell';
   for(const sub of subs){
    try{
     await webpush.sendNotification(
      {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},
      JSON.stringify({title:bell.title,body:bell.body,tag:'beehive-bell-'+bell.id,gentle:!!bell.schedule_id}),
      {TTL:bell.schedule_id?300:3600,urgency:'high'}
     );
     accepted++;
    }catch(e){
     const status=(e as any)?.statusCode;
     if(status===404||status===410){
      await admin.from('beehive_push_subscriptions').delete().eq('id',sub.id);
      lastReason='Device subscription expired';
     }else{
      lastReason='Push service returned an error'+(status?' ('+status+')':'');
      console.warn('Bell push rejected',bell.id,status||'network');
     }
    }
   }
   if(accepted){await finishBell(bell,'sent',null);bellsSent++;}
   else if(bell.attempts>=5){await finishBell(bell,'failed',lastReason);bellsFailed++;}
   else{await finishBell(bell,'pending',lastReason);bellsRetrying++;}
  }catch(e){
   console.error('Bell processing error',bell.id,String(e).slice(0,180));
   if(bell.attempts>=5){await finishBell(bell,'failed','Bell delivery failed');bellsFailed++;}
   else{await finishBell(bell,'pending','Temporary delivery issue');bellsRetrying++;}
  }
 }
 return Response.json({ok:true,claimed:(timers||[]).length,sent,failed,retrying,bellsClaimed:(bells||[]).length,bellsSent,bellsFailed,bellsRetrying});
});
