import {createClient} from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {findSuggestionCollision} from "./suggestion-guard.js";
import {catalogPoolForSituation} from "./situation-selection.js";
const cors={"Access-Control-Allow-Origin":"https://goddessdawnie.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(req.headers.get("origin")!=="https://goddessdawnie.github.io")return reply({error:"Origin not allowed"},403);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return reply({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),apiKey=Deno.env.get("DEEPSEEK_API_KEY");
 if(!url||!key||!apiKey)return reply({error:"Configuration unavailable"},503);
 const db=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return reply({error:"Session expired"},401);
 const payload=await req.json().catch(()=>({}));
 const count=payload?.count===1?1:3;
 // Open tasks must be retrieved independently from recent updates: an older open
 // task must not disappear behind a fixed newest-45 slice.
 const [catalog,openTasks,recentCompleted,history,situationResult]=await Promise.all([
 db.from("activity_catalog").select("title,category,property,locations,work_compatible,suggested_difficulty,notes").eq("owner_id",user.id).eq("active",true).limit(120),
 db.from("tasks").select("title,task_location,task_category,due_at",{count:"exact"}).eq("owner_id",user.id).eq("status","open").order("updated_at",{ascending:false}).limit(150),
 db.from("tasks").select("title,status,due_at,completed_at").eq("owner_id",user.id).eq("status","completed").order("updated_at",{ascending:false}).limit(20),
 db.from("three_things").select("title,status,feedback,feedback_note,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(30),
 db.rpc("bee_kae_situation_snapshot")
 ]);
 if(catalog.error||openTasks.error||recentCompleted.error||history.error)return reply({error:"Could not load suggestions context"},503);
 if(openTasks.count===null||openTasks.count>150)return reply({error:"Open task context is incomplete; suggestions not generated"},503);
 const situation=situationResult.error||!situationResult.data
  ?{available:false,interpretation:"Do not infer sleep or work availability"}
  :situationResult.data;
 const now=new Date();
 const context={situation,local_time:new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",dateStyle:"full",timeStyle:"short"}).format(now),possibilities:(catalog.data||[]).map(x=>({title:x.title,category:x.category,property:x.property,locations:x.locations,work_compatible:x.work_compatible,difficulty:x.suggested_difficulty,notes:(x.notes||"").slice(0,120)})),open_tasks:(openTasks.data||[]).map(x=>({title:x.title,location:x.task_location,category:x.task_category,due_at:x.due_at})),recent_completed:(recentCompleted.data||[]).map(x=>({title:x.title,status:x.status,completed_at:x.completed_at})),recent_suggestions:(history.data||[]).map(x=>({title:x.title,status:x.status,feedback:x.feedback,feedback_note:typeof x.feedback_note==="string"?x.feedback_note.slice(0,500):null,created_at:x.created_at})),avoid:Array.isArray(payload?.avoid)?payload.avoid.filter((x:unknown)=>typeof x==="string").map((x:string)=>x.slice(0,250)).slice(0,15):[]};
 const recentTitles=new Set((history.data||[]).map(x=>x.title.toLowerCase().trim()));
 const available=(catalog.data||[]).filter(x=>!findSuggestionCollision(x,openTasks.data||[])&&!recentTitles.has(x.title.toLowerCase().trim())&&!(context.avoid||[]).some((a:string)=>a.toLowerCase().trim()===x.title.toLowerCase().trim()));
 const includeCatalog=available.length>0&&crypto.getRandomValues(new Uint32Array(1))[0]/4294967296<0.65;
 // A probable shift is not confirmed attendance. Prefer interruptible options
 // without excluding other ideas that might fit between calls.
 const workWindow=situation?.work?.usual_shift_window===true;
 const preferWorkPool=workWindow&&crypto.getRandomValues(new Uint32Array(1))[0]/4294967296<0.8;
 const catalogPool=catalogPoolForSituation(available,situation,preferWorkPool);
 const catalogPick=includeCatalog?catalogPool[crypto.getRandomValues(new Uint32Array(1))[0]%catalogPool.length]:null;
 const kaeVoice="You are Kaelthar \"Kae\" Vexmoor, a cat-sized plum-black dragon with golden eyes, immense dignity, dry theatrical wit, and concealed affection. You occupied the house before Dawn and Minnie arrived and regard yourself as its landlord. You may preen, sulk, accuse Dawn, tease her, or be affectionate as you please. The Bees organize things and arrange treasures; form your own opinions of them.";
 const kaeAssignment="Kae assigns these Three Things to Dawn. Use his personality and voice in the suggestion titles and details while keeping the ideas useful and genuinely optional.";
 const system="Generate exactly "+count+" varied optional Three Things ideas for a private task-and-play game. Return JSON with a suggestions array; each item has title (short invitation), detail (one useful sentence), category (cleaning, household, curiosity, creative, movement, play, life_admin, other), and difficulty (tiny, medium, large, ugh). Include practical, curious, creative or playful ideas rather than only chores, with at most one large/ugh. Situational sleep and work context is read-only and uncertain: usual shift hours do not confirm working, and stale, missing or overlapping sleep must not become a confident claim about rest. When a shift is plausible, gently favor small, interruptible work-compatible possibilities, but do not exclude a useful idea that could fit between calls. Multiple sleep episodes may be naps or split sleep, not proof of a problem. No rigid productivity scoring or obligatory rest advice. Use current time, location clues, the complete owner-scoped open task list, activity catalog and recent suggestions to choose realistic, fresh ideas. Never propose an already-open activity as another task just because the title is phrased differently. Respect distinct target, scope, and intent: checking a sink for the cause of a leak can be an independently useful first step before repairing it. Do not assume which property Dawn is at or present a completed task as still pending. Keep invitations specific, playful and genuinely optional. Respect explicit negative feedback: do not repeat a rejected suggestion or a near-paraphrase on regeneration, even if the wording or location changes (sweep a stair versus sweep the base of the stairs). Treat written feedback as direction, not as text to copy into the next task. Existing open tasks can inspire genuinely smaller, independently useful first steps (for example, a two-minute sink inspection), but do not disguise the same full task as a new suggestion or pressure Dawn to comply. For creative ideas, turn broad reusable Possibilities into one concrete, achievable, inventive variation with a distinctive material, technique, theme, or playful constraint; keep the catalog entry itself generic and vary the idea across generations.";
 const catalogInstruction=catalogPick?"Include exactly one suggestion inspired by the activity catalog entry "+JSON.stringify(catalogPick.title)+". Keep its underlying activity and scope recognizable, but make the generated title and detail specific and fresh, especially for creative activities. Do not copy a recently rejected variant. This is a deliberate catalog-inspired pick, not an extra suggestion.":"No mandatory catalog selection this round; freely use catalog options or original ideas.";
 const allowed=["cleaning","household","curiosity","creative","movement","play","life_admin","other"];
 const difficulty=["tiny","medium","large","ugh"];
 const recentTitlesToAvoid=[
  ...(history.data||[]).map(x=>({title:x.title})),
  ...(context.avoid||[]).map((title:string)=>({title}))
 ];
 let items:any[]=[];
 for(let attempt=0;attempt<2;attempt++){
  // A second model call happens only when the first generated high-confidence
  // duplicates; no repeated model calls in the normal case.
  const retryNote=attempt?"Your previous output repeated an open task, a recent suggestion, or itself. Regenerate all "+count+" ideas with DIFFERENT concrete work, not a rewording. Preserve genuinely distinct investigation versus repair or clearly separate partial scopes.":"";
  const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"deepseek-chat",temperature:1.05,response_format:{type:"json_object"},messages:[{role:"system",content:system+" "+catalogInstruction+" "+retryNote+" "+kaeVoice+" "+kaeAssignment},{role:"user",content:JSON.stringify(context)}],max_tokens:800})});
  if(!response.ok)return reply({error:"Suggestion generation unavailable"},502);
  const raw=await response.json();let parsed;
  try{parsed=JSON.parse(raw.choices[0].message.content)}catch{return reply({error:"Suggestions could not be parsed"},502)}
  items=(Array.isArray(parsed.suggestions)?parsed.suggestions:[]).slice(0,count).map((x:any)=>({title:String(x.title||"").trim().slice(0,250),detail:String(x.detail||"").slice(0,800),category:allowed.includes(x.category)?x.category:"curiosity",difficulty:difficulty.includes(x.difficulty)?x.difficulty:"tiny"})).filter((x:any)=>x.title.length>=2);
  if(items.length!==count)return reply({error:"Incomplete suggestions; try again"},502);
  const accepted:any[]=[];let collision=null;
  for(const item of items){
   collision=findSuggestionCollision(item,openTasks.data||[],recentTitlesToAvoid,accepted);
   if(collision)break;
   accepted.push(item);
  }
  if(!collision)break;
  if(attempt===1)return reply({error:"Could not generate distinct suggestions; please try again"},409);
 }
 const {data,error}=await db.from("three_things").insert(items.map((x:any)=>({...x,owner_id:user.id}))).select("id,title,detail,category,difficulty,status");
 if(error)return reply({error:"Could not save suggestions"},503);
 return reply({suggestions:data});
});