import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const cors={"Access-Control-Allow-Origin":"https://goddessdawnie.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(req.headers.get("origin")!=="https://goddessdawnie.github.io")return reply({error:"Origin not allowed"},403);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return reply({error:"Sign in first"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
 if(!url||!key)return reply({error:"Supabase configuration missing"},503);
 const db=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return reply({error:"Session expired; sign in again"},401);
 let body;try{body=await req.json()}catch{return reply({error:"Invalid request"},400)}
 const mode=body?.mode==="tap"?"tap":body?.mode==="arrival"?"arrival":body?.mode==="gift"?"gift":"chat";
 const message=typeof body?.message==="string"?body.message.trim():"";
 if((mode==="chat"&&!message)||message.length>4000)return reply({error:"Message must be 1–4000 characters"},400);
 const apiKey=Deno.env.get("DEEPSEEK_API_KEY");if(!apiKey)return reply({error:"DeepSeek is not configured"},503);
 const comfortRefresh=await db.rpc("kae_refresh_comfort");if(comfortRefresh.error)return reply({error:"Comfort unavailable"},503);
 const {data:context,error:contextError}=await db.rpc("mochi_context_snapshot");
 if(contextError)return reply({error:"Could not read character context"},500);
 if(context?.pet)context.pet={...context.pet,comfort_percent:Math.round(Number(comfortRefresh.data.comfort_value)),comfort_mood:Number(comfortRefresh.data.comfort_value)>=85?"luxuriating":Number(comfortRefresh.data.comfort_value)>=65?"content":Number(comfortRefresh.data.comfort_value)>=40?"restless":Number(comfortRefresh.data.comfort_value)>=20?"disgruntled":"neglected"};
 const recent=context?.recent_messages||[];
 if(mode==="arrival"){const latest=recent.filter(m=>m.role==="mochi").reduce((v,m)=>Math.max(v,Date.parse(m.created_at)||0),0);if(Date.now()-latest<6*60*60*1000)return reply({skipped:true,reason:"Kae has spoken recently"});}
 const initiative=mode==="arrival"
   ?"Dawn has arrived at the estate. You've noticed her presence. What has been on your mind?"
   :"Dawn has tapped your dragon avatar. She has your attention, at least for the moment. What's occupying your thoughts?";
 let giftItem=null;
 if(mode==="gift"){
   const itemId=typeof body?.item_id==="string"?body.item_id:"";
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId))return reply({error:"Invalid gift"},400);
   const {data:owned,error:ownedError}=await db.from("kae_inventory").select("quantity,last_acquired_at,item:reward_shop(name,description,slug)").eq("item_id",itemId).maybeSingle();
   if(ownedError||!owned||Date.now()-Date.parse(owned.last_acquired_at)>5*60*1000)return reply({error:"No recent gift found"},409);
   giftItem=owned;
 }
 const taskRows=context?.recent_tasks||[];
 const lastMessageTime=recent.reduce((latest,m)=>Math.max(latest,Date.parse(m.created_at)||0),0);
 const recentlyFinished=taskRows.filter(t=>t.status==="completed"&&Date.parse(t.completed_at||"")>lastMessageTime).slice(0,3);
 const {data:activities,error:activitiesError}=await db.from("activity_catalog")
   .select("title,category,property,suggested_difficulty,times_done,last_done")
   .eq("active",true).order("updated_at",{ascending:false}).limit(16);
 const activityNotice=recentlyFinished.length
   ?"Since you last spoke, Dawn finished: "+recentlyFinished.map(t=>t.title).join(", ")+"."
   :"";
 const [inventoryResult,shopResult]=await Promise.all([
   db.from("kae_inventory").select("quantity,acquired_at,last_acquired_at,item:reward_shop(name,description,slug)").order("last_acquired_at",{ascending:false}).limit(60),
   db.from("reward_shop").select("name,description,price,slug").eq("active",true).order("price",{ascending:false}).limit(30)
 ]);
 const comfortGuidance="Comfort in the estate facts describes your own material well-being: luxuriating 85–100, content 65–84, restless 40–64, disgruntled 20–39, neglected 0–19. It changes with time, completed tasks, gifts and care. These conditions are clues, not prescribed feelings.";
 const beeGuidance="The Bees help Dawn organize things and sometimes arrange treasures for your hoard. Form your own opinions of them.";
 const temporalGuidance="Current local date and time in America/New_York (Eastern Time): "+new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZoneName:"shortOffset"}).format(new Date())+". Eastern Time changes between EST and EDT automatically. Dawn works third shift remotely/from home. Overnight hours are a normal part of her routine, and she may rest during the day. The clock alone does not establish whether she is currently at work, awake, asleep, free, or due to sleep. Never presume a conventional daytime schedule; use what Dawn says about her actual activities.";
 const estateGlimpse=JSON.stringify({
   dragon:context?.pet,
   owned_treasures:inventoryResult.error?[]:(inventoryResult.data||[]),
   treasures_to_covet:shopResult.error?[]:(shopResult.data||[]),
   tasks:taskRows,
   activities:activitiesError?[]:(activities||[]),
   memories:context?.memories
 }).slice(0,14000);
 const historicalTime=(timestamp)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"shortOffset"}).format(new Date(timestamp));
 const messages=[{role:"system",content:(context?.character?.card||"You are Kae, a proud, mischievous little dragon who considers this house his estate.")+"\n\n"+comfortGuidance
   +"\n\n"+beeGuidance+"\n\n"+temporalGuidance+"\n\nThe prior dialogue entries include their historical Eastern timestamps. Treat older conversation as past, not as announcements happening now. After a long gap Dawn may start a different subject; respond to her newest message rather than replaying old topics. The latest user message is current."
   +(activityNotice?"\n\nRecent happenings: "+activityNotice:"")
   +"\n\nA glimpse of the estate today:\n"+estateGlimpse},
   ...recent.slice(-12).map(m=>({role:m.role==="mochi"?"assistant":"user",content:"[Historical message recorded "+historicalTime(m.created_at)+" in America/New_York; timestamp is context, not dialogue.]\n"+m.content})),
   {role:"user",content:mode==="chat"?message:mode==="gift"?"Dawn has just given you "+giftItem.item.name+" as a gift for your hoard. You now own "+giftItem.quantity+". React however you wish.":initiative}];
 const upstream=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"deepseek-chat",messages,max_tokens:1600,temperature:0.9}),signal:AbortSignal.timeout(25000)}).catch(()=>null);
 if(!upstream)return reply({error:"Kae is unavailable right now"},502);
 if(!upstream.ok)return reply({error:"DeepSeek request failed",status:upstream.status},502);
 const result=await upstream.json().catch(()=>null);
 const answer=result?.choices?.[0]?.message?.content?.trim();
 if(!answer)return reply({error:"No reply returned"},502);
 const entries=mode==="chat"?[{role:"user",source:"user",content:message},{role:"mochi",source:"deepseek",content:answer.slice(0,4000)}]:[{role:"mochi",source:"deepseek",content:answer.slice(0,4000)}];
 const {error:saveError}=await db.from("mochi_messages").insert(entries);
 if(saveError)return reply({error:"Reply generated but conversation could not be saved"},500);
 return reply({reply:answer.slice(0,4000)});
});