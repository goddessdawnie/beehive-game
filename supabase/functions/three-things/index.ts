import {createClient} from "https://esm.sh/@supabase/supabase-js@2.49.4";
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
 const [catalog,tasks,history]=await Promise.all([
 db.from("activity_catalog").select("title,category,property,locations,work_compatible,suggested_difficulty,notes").eq("active",true).limit(120),
 db.from("tasks").select("title,status,due_at,completed_at").order("updated_at",{ascending:false}).limit(45),
 db.from("three_things").select("title,status,feedback,created_at").order("created_at",{ascending:false}).limit(30)
 ]);
 if(catalog.error||tasks.error||history.error)return reply({error:"Could not load suggestions context"},503);
 const now=new Date();
 const context={local_time:new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",dateStyle:"full",timeStyle:"short"}).format(now),possibilities:(catalog.data||[]).map(x=>({title:x.title,category:x.category,property:x.property,locations:x.locations,work_compatible:x.work_compatible,difficulty:x.suggested_difficulty,notes:(x.notes||"").slice(0,120)})),tasks:(tasks.data||[]).map(x=>({title:x.title,status:x.status,due_at:x.due_at,completed_at:x.completed_at})),recent_suggestions:history.data||[],avoid:Array.isArray(payload?.avoid)?payload.avoid.filter((x:unknown)=>typeof x==="string").slice(0,15):[]};
 const activeTitles=new Set((tasks.data||[]).filter(x=>x.status==="open").map(x=>x.title.toLowerCase().trim()));
 const recentTitles=new Set((history.data||[]).map(x=>x.title.toLowerCase().trim()));
 const available=(catalog.data||[]).filter(x=>!activeTitles.has(x.title.toLowerCase().trim())&&!recentTitles.has(x.title.toLowerCase().trim())&&!(context.avoid||[]).some((a:string)=>a.toLowerCase().trim()===x.title.toLowerCase().trim()));
 const includeCatalog=available.length>0&&crypto.getRandomValues(new Uint32Array(1))[0]/4294967296<0.65;
 const catalogPick=includeCatalog?available[crypto.getRandomValues(new Uint32Array(1))[0]%available.length]:null;
 const kaeVoice="You are Kaelthar \"Kae\" Vexmoor, a cat-sized plum-black dragon with golden eyes, immense dignity, dry theatrical wit, and concealed affection. You occupied the house before Dawn and Minnie arrived and regard yourself as its landlord. You may preen, sulk, accuse Dawn, tease her, or be affectionate as you please. The Bees organize things and arrange treasures; form your own opinions of them.";
 const kaeAssignment="Kae assigns these Three Things to Dawn. Use his personality and voice in the suggestion titles and details while keeping the ideas useful and genuinely optional.";
 const system="Generate exactly "+count+" varied optional Three Things ideas for a private task-and-play game. Return JSON with a suggestions array; each item has title (short invitation), detail (one useful sentence), category (cleaning, household, curiosity, creative, movement, play, life_admin, other), and difficulty (tiny, medium, large, ugh). Include practical, curious, creative or playful ideas rather than only chores, with at most one large/ugh. Use current time, location clues, open tasks, activity catalog and recent suggestions to choose realistic, fresh ideas. Do not assume which property Dawn is at or present a completed task as still pending. Keep invitations specific, playful and genuinely optional.";
 const catalogInstruction=catalogPick?"Include exactly one suggestion with the EXACT title "+JSON.stringify(catalogPick.title)+" from the activity catalog. Adapt its detail to be inviting, but do not change the title. This is a deliberate catalog pick, not an extra suggestion.":"No mandatory catalog selection this round; freely use catalog options or original ideas.";
 const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"deepseek-chat",temperature:1.05,response_format:{type:"json_object"},messages:[{role:"system",content:system+" "+catalogInstruction+" "+kaeVoice+" "+kaeAssignment},{role:"user",content:JSON.stringify(context)}],max_tokens:800})});
 if(!response.ok)return reply({error:"Suggestion generation unavailable"},502);
 const raw=await response.json();let parsed;
 try{parsed=JSON.parse(raw.choices[0].message.content)}catch{return reply({error:"Suggestions could not be parsed"},502)}
 const allowed=["cleaning","household","curiosity","creative","movement","play","life_admin","other"];
 const difficulty=["tiny","medium","large","ugh"];
 const items=(Array.isArray(parsed.suggestions)?parsed.suggestions:[]).slice(0,count).map((x:any)=>({title:String(x.title||"").trim().slice(0,250),detail:String(x.detail||"").slice(0,800),category:allowed.includes(x.category)?x.category:"curiosity",difficulty:difficulty.includes(x.difficulty)?x.difficulty:"tiny"})).filter((x:any)=>x.title.length>=2);
 if(items.length!==count)return reply({error:"Incomplete suggestions; try again"},502);
 const {data,error}=await db.from("three_things").insert(items.map((x:any)=>({...x,owner_id:user.id}))).select("id,title,detail,category,difficulty,status");
 if(error)return reply({error:"Could not save suggestions"},503);
 return reply({suggestions:data});
});