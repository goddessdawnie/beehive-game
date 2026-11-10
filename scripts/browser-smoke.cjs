const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const root=process.cwd();const server=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEE_BROWSER_EXECUTABLE?{executablePath:process.env.BEE_BROWSER_EXECUTABLE}:{})});
const mock=`window.registryRows=[{game_key:'sudoku',enabled:false}];window.inventoryRows=[];window.registryError=false;window.timerRow=null;window.playClaimCount=0;window.playClaimCalls=0;window.cancelDuringSend=false;window.rewardPurchaseCalls=0;
window.chatRows=[{role:'user',content:'Can you read this?',created_at:'2026-11-07T08:00:00Z'},{role:'mochi',content:'Dragon decree:\\nNo more paperwork. 🐉 *I insist.*',created_at:'2026-11-07T08:01:00Z'}];
window.taskRows=[
{id:'earlier',title:'Earlier finished, edited later',status:'completed',created_at:'2026-10-01T10:00:00Z',completed_at:'2026-11-05T09:00:00Z',updated_at:'2026-11-07T20:00:00Z',reward_coins:5,completion_notes:'Edited after completion'},
{id:'recent',title:'Recently finished',status:'completed',created_at:'2026-09-01T10:00:00Z',completed_at:'2026-11-06T18:00:00Z',updated_at:'2026-11-06T18:00:00Z',due_at:'2026-12-25T12:00:00Z',reward_coins:5},
{id:'legacy',title:'Legacy completion',status:'completed',created_at:'2026-10-30T10:00:00Z',completed_at:null,updated_at:'2026-11-07T21:00:00Z',reward_coins:5},
{id:'cancelled',title:'Cancelled item',status:'cancelled',created_at:'2026-11-04T10:00:00Z',updated_at:'2026-11-07T22:00:00Z',reward_coins:5},
{id:'deferred',title:'Deferred item',status:'deferred',created_at:'2026-11-03T10:00:00Z',updated_at:'2026-11-07T23:00:00Z',reward_coins:5},
{id:'open',title:'Open task',status:'open',created_at:'2026-11-07T10:00:00Z',updated_at:'2026-11-07T10:00:00Z',reward_coins:5}
];
window.threeRows=[{id:'three-test-1',title:'Inspect an interesting fossil',detail:'A tiny optional exploration',category:'curiosity',difficulty:'tiny',status:'suggested',feedback:null,created_at:'2026-11-09T12:00:00Z'}];
window.catalogRows=[
{id:'both',title:'Shared dishes',property:'Both',category:'cleaning',active:true,locations:[]},
{id:'florence',title:'Florence stairs',property:'Florence',category:'cleaning',active:true,locations:[]},
{id:'williamsburg',title:'Williamsburg porch',property:'Williamsburg',category:'cleaning',active:true,locations:[]},
{id:'unassigned',title:'Undecided chore',property:null,category:'cleaning',active:true,locations:[]}
];
const user={id:'2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'};
window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{access_token:'test-browser-token'}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{if(name==='play_claims_today')return {data:window.playClaimCount,error:null};if(name==='claim_daily_game'){window.playClaimCalls++;if(window.playClaimCount>=5)return {data:false,error:null};window.playClaimCount++;return {data:true,error:null};}if(name==='purchase_kae_reward')window.rewardPurchaseCalls++;if(name==='set_task_status'){const task=window.taskRows.find(t=>t.id===args.p_task_id);task.status=args.p_status;task.completed_at=args.p_status==='completed'?new Date().toISOString():null;return {data:true,error:null};}if(name==='beehive_cancel_timer'&&window.cancelDuringSend){window.timerRow.status='sending';window.timerRow.attempts=1;return {data:false,error:null};}return {data:null,error:null};},from(table){
if(table==='three_things'){
 let one=false,patch=null,filters=[];
 const q=new Proxy({}, {get(_,key){
  if(key==='then')return resolve=>{
   const rows=window.threeRows.filter(x=>filters.every(([name,value])=>x[name]===value));
   if(patch)for(const row of rows)Object.assign(row,patch);
   resolve({data:one?(rows[0]||null):rows,error:null});
  };
  return (...args)=>{if(key==='update')patch=args[0];if(key==='eq')filters.push(args);if(key==='maybeSingle'||key==='single')one=true;return q;};
 }});
 return q;
}
let single=false;const chain=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>resolve({data:table==='beehive_timers'?window.timerRow:table==='beehive_games'?window.registryRows:table==='tasks'?window.taskRows:table==='activity_catalog'?window.catalogRows:table==='kae_inventory'?window.inventoryRows:table==='mochi_messages'?window.chatRows:table==='pet_state'?{name:'Kae',comfort_value:100}:single?null:[],error:table==='beehive_games'&&window.registryError?{message:'offline'}:null});return (...args)=>{if(key==='maybeSingle'||key==='single')single=true;return chain;}}});return chain;}})};`;
for(const viewport of [{width:393,height:851},{width:1280,height:900}]){
const ctx=await browser.newContext({viewport,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Pre-existing one-slot Android calibration must migrate without touching actual inventory.
await page.addInitScript(()=>localStorage.setItem('beehive:cushion-layout:v1:2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b',JSON.stringify({left:29,bottom:11,width:47,height:15})));
await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url().includes('supabase.min.js')?route.fulfill({contentType:'application/javascript',body:mock}):route.abort());
page.on('pageerror',err=>console.error('PAGE SCRIPT ERROR:',err.message));
await page.goto(origin);
await page.locator('#game:not(.hidden)').waitFor();

// A choice records reaction without removing the suggestion or completion notes.
await page.locator('#tab-play').click();
await page.locator('#open-three').click();
await page.locator('#three-list .three-card').first().waitFor();
const title='Inspect an interesting fossil';
const positive=page.getByRole('button',{name:'Positive reaction for '+title});
const neutral=page.getByRole('button',{name:'Neutral reaction for '+title});
const negative=page.getByRole('button',{name:'Negative reaction for '+title});
assert.equal(await positive.getAttribute('aria-pressed'),'false','No implicit positive');
assert.equal(await neutral.getAttribute('aria-pressed'),'false','Unset is not neutral');
await page.getByRole('textbox',{name:'Completion notes for '+title}).fill('Keep these notes while saving');
await positive.click();
await page.waitForFunction(()=>window.threeRows[0].feedback==='positive');
assert.equal(await positive.getAttribute('aria-pressed'),'true');
assert.equal(await page.getByRole('textbox',{name:'Completion notes for '+title}).inputValue(),'Keep these notes while saving');
await neutral.click();
await page.waitForFunction(()=>window.threeRows[0].feedback==='neutral');
assert.equal(await neutral.getAttribute('aria-pressed'),'true');
assert.equal(await positive.getAttribute('aria-pressed'),'false');
await negative.click();
await page.waitForFunction(()=>window.threeRows[0].feedback==='negative');
assert.equal(await negative.getAttribute('aria-pressed'),'true');
assert.equal(await page.evaluate(()=>window.threeRows[0].status),'suggested','Reaction does not complete or clear a suggestion');
await page.locator('#back-to-games').click();
assert.match(await page.locator('#play-claim-budget').textContent(),/0\/5 claims used today/);
await page.locator('#open-wordle').click();
for(let i=1;i<=4;i++){
 await page.locator('#wordle-claim').click();
 await page.waitForFunction(target=>window.playClaimCount===target,i);
 await page.locator('#wordle-claim').waitFor({state:'visible'});
 if(i<5)await page.waitForFunction(()=>!document.querySelector('#wordle-claim').disabled);
 assert.match(await page.locator('#play-claim-budget').textContent(),new RegExp(i+'/5 claims used today'));
}
await page.locator('#back-wordle').click();
await page.locator('#open-wumpus').click();
await page.locator('#wumpus-claim').click();
await page.waitForFunction(()=>window.playClaimCount===5);
await page.waitForFunction(()=>document.querySelector('#wumpus-claim').disabled===true);
assert.match(await page.locator('#play-claim-budget').textContent(),/5\/5 claims used today/);
await page.locator('#back-wumpus').click();
await page.locator('#open-2048').click();
assert.equal(await page.locator('#2048-claim').isDisabled(),true,'All game buttons obey shared five-claim budget');
assert.equal(await page.evaluate(()=>window.playClaimCalls),5,'Exactly five RPC claims, including four on Wordle');
await page.locator('#tab-tasks').click();

// The existing Timer tab now exposes scheduled one-shot and repeatable dings.
await page.locator('#tab-timer').click();
await page.locator('#bell-schedule-details summary').click();
await page.locator('#bell-kind').selectOption('weekly');
assert.equal(await page.locator('#bell-weekly-wrap').isVisible(),true);
assert.equal(await page.locator('#bell-once-wrap').isVisible(),false);
await page.locator('#bell-weekdays').click();
assert.equal(await page.locator('[data-bell-day]:checked').count(),5,'Workdays selection covers weekdays only');
await page.locator('#bell-local-time').fill('01:30');
await page.locator('#bell-kind').selectOption('monthly');
assert.equal(await page.locator('#bell-monthly-wrap').isVisible(),true);
await page.locator('#bell-month-day').fill('31');
await page.locator('#bell-kind').selectOption('once');
assert.equal(await page.locator('#bell-once-wrap').isVisible(),true);
await page.locator('#tab-tasks').click();

await page.locator('#add-task-details summary').click();
assert.deepEqual(await page.locator('#repeat option').evaluateAll(options=>options.map(o=>o.value)),['','daily','weekly','monthly','interval'],'Recurring options available');
await page.locator('#repeat').selectOption('interval');
assert.equal(await page.locator('#repeat-interval-label').isVisible(),true,'Interval controls appear');
await page.locator('#repeat-interval').fill('3');
await page.locator('#repeat-unit').selectOption('weeks');
assert.equal(await page.locator('#repeat-unit').inputValue(),'weeks');
await page.locator('#repeat').selectOption('monthly');
assert.equal(await page.locator('#repeat-interval-label').isVisible(),false,'Monthly uses due-date anchor');
await page.locator('#add-task-details summary').click();

assert.equal(await page.locator('#maintenance-menu').isVisible(),false);
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'47%','Legacy cushion calibration carries forward');
await page.locator('#hive-settings').click();
assert.equal(await page.locator('#hive-settings').getAttribute('aria-expanded'),'true');
await page.locator('#open-layout').click();
assert.equal(await page.locator('#layout-tools').isVisible(),true);
assert.equal(await page.locator('#layout-guide').isVisible(),true);
assert.equal(await page.locator('#kaetap').evaluate(el=>el.classList.contains('layout-preview-sticky')),true);
assert.deepEqual(await page.locator('#layout-slot option').allTextContents(),[
 'Cushion · Under Kae','Kae · Dragon','Behind · Throne','Left Lower · Table','Right · Display Case','Jewel · Owned treasure','Wall shelf','Display case · Interior shelf','Treasure chest','Gold coins','Minnie whiskers','Jeweled collar'
]);
// Coins and whiskers are direct children of the room, with independently editable geometry.
for(const [slot,selector] of [['gold','.chamber-gold'],['whisker','.chamber-whisker']]){
 assert.equal(await page.locator(selector).evaluate(el=>el.parentElement?.id),'kae-chamber');
 await page.locator('#layout-slot').selectOption(slot);
 await page.locator('#layout-width').evaluate(el=>{el.value='30';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.locator(selector).evaluate(el=>el.style.width),'30%');
 assert.equal(await page.locator('#chamber-generic-treasures').count(),0,'No shared treasure container');
 await page.locator('#layout-reset').click();
}
// Universal room controls target independent actual scene nodes, not inventory or purchases.
await page.locator('#layout-slot').selectOption('wall_shelf');
await page.locator('#layout-bottom').evaluate(el=>{el.value='55';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('#chamber-wall-shelf').evaluate(el=>el.style.bottom),'55%');
assert.equal(await page.locator('#chamber-generic-treasures').count(),0,'Wall shelf is independent of individual items');
await page.locator('#layout-visible').uncheck();
assert.equal(await page.locator('#chamber-wall-shelf').evaluate(el=>el.classList.contains('room-layout-hidden')),true);
await page.locator('#layout-reset').click();
assert.equal(await page.locator('#chamber-wall-shelf').evaluate(el=>el.classList.contains('room-layout-hidden')),false);
assert.equal(await page.locator('#chamber-wall-shelf').evaluate(el=>el.style.bottom),'');
await page.locator('#layout-slot').selectOption('case_shelf');
await page.locator('#layout-width').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('#chamber-case-shelf').evaluate(el=>el.style.width),'9%');
assert.equal(await page.locator('#chamber-wall-shelf').evaluate(el=>el.style.width),'','Case shelf has independent dimensions');
await page.locator('#layout-slot').selectOption('shelf_jewel');
await page.locator('#layout-left').evaluate(el=>{el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('#chamber-jewel-owned').evaluate(el=>el.style.left),'50%','Owned jewel follows actual layout slot');
await page.locator('#layout-slot').selectOption('cushion');
assert.equal(await page.locator('#layout-width-value').textContent(),'47%');
await page.locator('#layout-width').evaluate(el=>{el.value='48';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'48%');
assert.equal(await page.locator('#layout-width-value').textContent(),'48%');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('beehive:room-layout:v1:2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b')).cushion.width),48);
await page.locator('#layout-slot').selectOption('kae');
assert.equal(await page.locator('#layout-height').inputValue(),'72','Dragon slot has distinct slider limits');
assert.equal(await page.locator('#layout-height').getAttribute('max'),'95');
await page.locator('#layout-left').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('.chamber-kae').evaluate(el=>el.style.left),'35%');
await page.locator('#layout-slot').selectOption('behind');
assert.equal(await page.locator('.chamber-throne').isVisible(),false,'Unowned throne stays hidden');
assert.equal(await page.locator('#layout-guide').isVisible(),true,'Invisible slots have guide outlines');
assert.equal(await page.locator('#layout-guide').evaluate(el=>getComputedStyle(el,'::after').content),'none','Guide has no text label obscuring artwork');
assert.equal(await page.locator('#layout-slot').inputValue(),'behind','Selected slot remains named in controls');
await page.locator('#layout-artwork option[value="throne_svg"]').waitFor({state:'attached'});
assert.deepEqual(await page.locator('#layout-artwork option').evaluateAll(nodes=>nodes.map(node=>node.value)),['','throne_svg','throne_css']);
await page.locator('#layout-artwork').selectOption('throne_svg');
assert.equal(await page.locator('.chamber-throne').isVisible(),true,'Unowned imperial SVG throne previews safely');
assert.match(await page.locator('.chamber-throne').evaluate(el=>getComputedStyle(el).backgroundImage),/ornate-throne-back\.svg/);
assert.equal(await page.locator('.chamber-throne').evaluate(el=>getComputedStyle(el).backgroundSize),'100% 100%','Decorative backrest stretches to the slot boundaries');
assert.equal(await page.locator('.chamber-throne').evaluate(el=>getComputedStyle(el).boxSizing),'border-box');
await page.locator('#layout-artwork').selectOption('throne_css');
assert.equal(await page.locator('.chamber-throne').evaluate(el=>el.classList.contains('preview-legacy')),true);
assert.match(await page.locator('.chamber-throne').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
await page.locator('#layout-artwork').selectOption('throne_svg');
assert.equal(await page.locator('.chamber-throne').evaluate(el=>el.classList.contains('preview-legacy')),false,'SVG preview resets old CSS styling');
await page.locator('#layout-slot').selectOption('right');
assert.equal(await page.locator('.chamber-throne').isVisible(),false,'Changing slots restores unowned throne');
assert.equal(await page.locator('.chamber-throne').evaluate(el=>el.classList.contains('preview-legacy')),false);
assert.equal(await page.locator('#layout-artwork').inputValue(),'','Preview does not carry over to another slot');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'','Default right-anchored case remains unchanged until edited');
await page.locator('#layout-left').evaluate(el=>{el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'75%');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.right),'auto');
assert.equal(await page.locator('.chamber-case').isVisible(),false);
await page.locator('#layout-artwork option[value="case_svg"]').waitFor({state:'attached'});
assert.deepEqual(await page.locator('#layout-artwork option').evaluateAll(nodes=>nodes.map(node=>node.value)),['','case_svg','case_css']);
await page.locator('#layout-artwork').selectOption('case_svg');
assert.equal(await page.locator('.chamber-case').isVisible(),true,'Right side previews unowned glass case');
assert.match(await page.locator('.chamber-case').evaluate(el=>getComputedStyle(el,'::after').backgroundImage),/wood-glass-display-case\.svg/);
assert.equal(await page.locator('.chamber-case').evaluate(el=>getComputedStyle(el).boxSizing),'border-box','SVG artwork stays within slot geometry');
assert.equal(await page.locator('.chamber-case-contents').evaluate(el=>getComputedStyle(el).zIndex),'1','Future jewels sit beneath foreground glass');
await page.locator('#layout-artwork').selectOption('case_css');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.classList.contains('preview-legacy')),true,'Legacy placeholder can still be compared');
assert.equal(await page.locator('.chamber-case').evaluate(el=>getComputedStyle(el,'::after').display),'none');
await page.locator('#layout-artwork').selectOption('');
assert.equal(await page.locator('.chamber-case').isVisible(),false,'Normal room mode restores owned-only display');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.classList.contains('preview-legacy')),false,'Legacy preview styling is cleaned up');
await page.locator('#layout-slot').selectOption('shelf_jewel');
await page.locator('#layout-artwork option[value="jewel_svg"]').waitFor({state:'attached'});
assert.deepEqual(await page.locator('#layout-artwork option').evaluateAll(nodes=>nodes.map(n=>n.value)),['','jewel_svg']);
assert.equal(await page.locator('#chamber-jewel-preview').isVisible(),false,'No unowned jewel appears by default');
await page.locator('#layout-artwork').selectOption('jewel_svg');
assert.equal(await page.locator('#chamber-jewel-preview').isVisible(),true,'Jewel is visible only for temporary preview');
assert.equal(await page.locator('#chamber-jewel-preview').evaluate(node=>getComputedStyle(node).zIndex),'2','Jewel is below the glass case in the scene');
assert.equal(await page.locator('.chamber-case').evaluate(node=>getComputedStyle(node).zIndex),'3','Glass case overlays jewel');
assert.equal(await page.locator('.chamber-case').evaluate(node=>getComputedStyle(node,'::after').zIndex),'2','Case foreground renders above its clear interior');
await page.locator('.chamber-case').evaluate(node=>node.classList.add('visible'));
assert.equal(await page.locator('.chamber-case').isVisible(),true,'Glass case can appear in front of temporary jewel');
assert.match(await page.locator('.chamber-case').evaluate(node=>getComputedStyle(node,'::after').backgroundImage),/wood-glass-display-case\.svg/);
await page.locator('.chamber-case').evaluate(node=>node.classList.remove('visible'));
assert.match(await page.locator('#chamber-jewel-preview').evaluate(el=>getComputedStyle(el).backgroundImage),/violet-jewel\.svg/);
await page.locator('#layout-width').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('#chamber-jewel-preview').evaluate(el=>el.style.width),'12%','Jewel placement uses real slot geometry');
assert.equal(await page.evaluate(()=>window.rewardPurchaseCalls),0,'Jewel preview never purchases inventory');
await page.locator('#layout-slot').selectOption('kae');
assert.equal(await page.locator('#chamber-jewel-preview').isVisible(),false,'Changing slots removes temporary jewel');
await page.locator('#layout-artwork').selectOption('kae_svg');
assert.match(await page.locator('.chamber-kae').getAttribute('src'),/assets\/kae\.svg/);
await page.locator('#layout-slot').selectOption('cushion');
assert.match(await page.locator('.chamber-kae').getAttribute('src'),/assets\/kae_cutout\.webp/,'Slot switch restores Kae');
assert.equal(await page.locator('.chamber-pillow').isVisible(),false);
await page.locator('#layout-artwork').selectOption('plum_cushion');
assert.equal(await page.locator('.chamber-pillow').isVisible(),true,'Unowned pillow previews safely');
assert.equal(await page.evaluate(()=>window.rewardPurchaseCalls),0,'Preview does not buy inventory');
assert.equal(await page.locator('#layout-width').inputValue(),'48','Switching slots preserves other geometry');
await page.reload();
await page.locator('#game:not(.hidden)').waitFor();
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'48%');
assert.equal(await page.locator('.chamber-pillow').isVisible(),false,'Refresh removes temporary unowned art');
assert.equal(await page.locator('.chamber-kae').evaluate(el=>el.style.left),'35%');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'75%');
assert.equal(await page.locator('#chamber-jewel-preview').isVisible(),false,'Reload discards temporary jewel');
assert.equal(await page.locator('#chamber-jewel-preview').evaluate(el=>el.style.width),'12%','Jewel geometry persists independently');
await page.locator('#hive-settings').click();
await page.locator('#open-layout').click();
await page.locator('#layout-reset').click();
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'','Restoring removes the override and uses CSS defaults');
assert.equal(await page.locator('#layout-width-value').textContent(),'36%');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('beehive:room-layout:v1:2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b')).cushion),null,'Explicit reset blocks old legacy calibration');
await page.locator('#layout-artwork').selectOption('plum_cushion');
assert.equal(await page.locator('.chamber-pillow').isVisible(),true);
await page.locator('#layout-close').click();
assert.equal(await page.locator('.chamber-pillow').isVisible(),false,'Close discards unowned art');
assert.equal(await page.locator('#layout-artwork').inputValue(),'');
assert.equal(await page.locator('#layout-guide').isVisible(),false);
assert.equal(await page.locator('#kaetap').evaluate(el=>el.classList.contains('layout-preview-sticky')),false);
await page.reload();
await page.locator('#game:not(.hidden)').waitFor();
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'','Legacy value must not reappear after reset');
// Property: Both belongs to either location, while Unassigned remains a separate value.
await page.locator('[data-filter="possibilities"]').click();
assert.deepEqual(await page.locator('#poss-new-property option').evaluateAll(nodes=>nodes.map(x=>x.value)),['','Florence','Williamsburg','Both']);
assert.deepEqual(await page.locator('#poss-property option').evaluateAll(nodes=>nodes.map(x=>x.value)),['','Florence','Williamsburg','Both','Unassigned']);
const titles=()=>page.locator('#poss-list .task strong').allTextContents();
assert.equal((await titles()).length,4);
await page.locator('#poss-property').selectOption('Florence');
assert.deepEqual((await titles()).sort(),['Florence stairs','Shared dishes']);
await page.locator('#poss-property').selectOption('Williamsburg');
assert.deepEqual((await titles()).sort(),['Shared dishes','Williamsburg porch']);
await page.locator('#poss-property').selectOption('Both');
assert.deepEqual(await titles(),['Shared dishes']);
await page.locator('#poss-property').selectOption('Unassigned');
assert.deepEqual(await titles(),['Undecided chore']);
await page.locator('#poss-property').selectOption('');
const bothRow=page.locator('#poss-list .task').filter({hasText:'Shared dishes'});
await bothRow.getByRole('button',{name:'Edit'}).click();
assert.deepEqual(await bothRow.locator('form select').first().locator('option').evaluateAll(nodes=>nodes.map(x=>x.value)),['','Florence','Williamsburg','Both']);
assert.equal(await bothRow.locator('form select').first().inputValue(),'Both');
await bothRow.getByRole('button',{name:'Close'}).click();
await page.locator('#tab-estate').click();
await page.waitForFunction(()=>document.querySelectorAll('#chatlog .chat-line').length===2);
await page.evaluate(()=>{window.chatRequests=[];const oldFetch=window.fetch;window.fetch=async(url,opts)=>{if(String(url).includes('/functions/v1/kae-chat')){const request=JSON.parse(opts.body);window.chatRequests.push(request);window.chatRows.push({role:'user',content:request.message,created_at:'2026-11-07T08:02:00Z'});return {ok:true,json:async()=>({})}}return oldFetch(url,opts)}});
const composer=page.locator('#chattext');
assert.equal(await composer.evaluate(el=>el.tagName),'TEXTAREA');
assert.equal(await composer.getAttribute('maxlength'),'4000');
await composer.fill('x'.repeat(4000));
assert.equal((await composer.inputValue()).length,4000,'Composer accepts 4000 characters');
await composer.press('End');await composer.type('y');
assert.equal((await composer.inputValue()).length,4000,'Typing cannot exceed 4000 characters');
await composer.fill('');
await composer.fill('First paragraph');
const initialHeight=await composer.evaluate(el=>el.offsetHeight);
await composer.press('Enter');
await composer.type('Second paragraph');
assert.equal(await composer.inputValue(),'First paragraph\nSecond paragraph');
assert.equal(await page.evaluate(()=>window.chatRequests.length),0,'Enter must not submit chat');
const expandedHeight=await composer.evaluate(el=>el.offsetHeight);
assert.ok(expandedHeight>=initialHeight,'Composer must not shrink while adding lines');
await page.locator('#chat button[type="submit"]').click();
await page.waitForFunction(()=>window.chatRequests.length===1);
assert.equal(await page.evaluate(()=>window.chatRequests[0].message),'First paragraph\nSecond paragraph','Send preserves newline content');
await page.waitForFunction(()=>document.querySelector('#chattext').value==='');
await composer.fill('Keyboard shortcut works');
await composer.press('Control+Enter');
await page.waitForFunction(()=>window.chatRequests.length===2);
assert.equal(await page.evaluate(()=>window.chatRequests[1].message),'Keyboard shortcut works');
assert.equal(await composer.inputValue(),'');

assert.equal(await page.locator('#chatlog .chat-copy').count(),4,'All existing and newly sent messages have copy controls');
assert.equal(await page.getByRole('button',{name:'Copy your message'}).count(),3);
assert.equal(await page.getByRole('button',{name:'Copy Kae message'}).count(),1);
await page.evaluate(()=>{window.lastCopiedText=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.lastCopiedText=text}}});});
await page.getByRole('button',{name:'Copy your message'}).first().click();
assert.equal(await page.evaluate(()=>window.lastCopiedText),'Can you read this?','Copy preserves user message');
assert.match(await page.getByRole('button',{name:'Copy your message'}).first().innerText(),/Copied/);
await page.getByRole('button',{name:'Copy Kae message'}).click();
assert.equal(await page.evaluate(()=>window.lastCopiedText),'Dragon decree:\nNo more paperwork. 🐉 *I insist.*','Copy preserves entire raw response');
assert.match(await page.getByRole('button',{name:'Copy Kae message'}).innerText(),/Copied/);
assert.match(await page.locator('#chatlog .chat-line').filter({hasText:'No more paperwork'}).innerText(),/No more paperwork/);
await page.locator('#tab-tasks').click();
await page.locator('[data-filter="completed"]').click();
await page.waitForFunction(()=>document.querySelectorAll('#tasks .task').length===5);
const completedTitles=()=>page.locator('#tasks .task strong').allTextContents();
assert.deepEqual(await completedTitles(),['Recently finished','Earlier finished, edited later','Cancelled item','Deferred item','Legacy completion']);
const renderedDetails=await page.locator('#tasks .task small').allTextContents();
const expectedCompletedDate=await page.evaluate(()=>new Date('2026-11-06T18:00:00Z').toLocaleString());
const hiddenScheduledDate=await page.evaluate(()=>new Date('2026-12-25T12:00:00Z').toLocaleString());
assert.ok(renderedDetails[0].includes(expectedCompletedDate),'Completed view must show actual completion time');
assert.ok(!renderedDetails[0].includes(hiddenScheduledDate),'Completed view must hide scheduled due date');
assert.ok(renderedDetails[4].includes('Completion time unavailable'),'Legacy completion must not fabricate a date');
assert.ok(!renderedDetails[2].includes('Someday')&&!renderedDetails[3].includes('Someday'),'Other closed statuses must not show scheduled placeholders');

await page.locator('#tasks .task').first().getByRole('button',{name:'Undo'}).click();
await page.waitForFunction(()=>document.querySelectorAll('#tasks .task').length===4);
assert.deepEqual(await completedTitles(),['Earlier finished, edited later','Cancelled item','Deferred item','Legacy completion']);
await page.evaluate(()=>{const t=window.taskRows.find(x=>x.id==='recent');t.status='completed';t.completed_at='2026-11-07T23:30:00Z';t.updated_at=t.completed_at;});
await page.locator('[data-filter="completed"]').click();
await page.waitForFunction(()=>document.querySelectorAll('#tasks .task').length===5);
assert.deepEqual(await completedTitles(),['Recently finished','Earlier finished, edited later','Cancelled item','Deferred item','Legacy completion']);
await page.locator('#tab-play').click();await page.waitForFunction(()=>document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#open-sudoku').isVisible(),false);assert.equal(await page.locator('#open-wordle').isVisible(),true);
await page.evaluate(()=>window.registryRows=[]);await page.locator('#tab-tasks').click();await page.locator('#tab-play').click();await page.waitForFunction(()=>!document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#open-sudoku').isVisible(),true);await page.locator('#open-sudoku').click();assert.equal(await page.locator('#play-sudoku').isVisible(),true);
await page.evaluate(()=>{window.registryRows=[{game_key:'sudoku',enabled:false}];document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#play-library').isVisible(),true);assert.equal(await page.locator('#play-sudoku').isVisible(),false);
await page.evaluate(()=>{window.registryError=true;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('#game-registry-status').textContent.includes('could not refresh'));
assert.equal(await page.locator('#open-sudoku').isVisible(),false);
await page.locator('#tab-timer').click();
await page.evaluate(()=>{window.timerRow={id:'test-timer',status:'pending',attempts:0,label:'Tea',due_at:new Date(Date.now()+300000).toISOString()};document.dispatchEvent(new Event('visibilitychange'));});
await page.waitForFunction(()=>!document.querySelector('#timer-cancel').disabled&&document.querySelector('#timer-cancel').classList.contains('hidden')===false);
await page.evaluate(()=>window.cancelDuringSend=true);await page.locator('#timer-cancel').click();
await page.waitForFunction(()=>document.querySelector('#timer-status').textContent.includes('Delivery has started'));
assert.equal(await page.locator('#timer-cancel').isDisabled(),true);
await page.waitForTimeout(1100);assert.match(await page.locator('#timer-status').textContent(),/Delivery has started/);
// Quantity tier artwork is derived from actual returned inventory data only; no purchase path is invoked.
await page.locator('#tab-tasks').click();
const originalBalance=await page.locator('#coins').textContent();
const countsToCheck=[[1,'single'],[4,'single'],[5,'pile'],[12,'pile'],[13,'mound'],[25,'mound'],[26,'chest'],[44,'chest']];
for(const [qty,tier] of countsToCheck){
 await page.evaluate(q=>{
  window.inventoryRows=[
   {item_id:'coin-id',quantity:q,item:{name:'Gold coin',slug:'gold_coin'}},
   {item_id:'whisker-id',quantity:q,item:{name:'Minnie whisker',slug:'minnie_whisker'}}
  ];
 },qty);
 await page.locator('#refresh').click();
 await page.waitForFunction(q=>document.querySelector('.chamber-gold')?.dataset.quantity===String(q)&&document.querySelector('.chamber-whisker')?.dataset.quantity===String(q),qty);
 for(const [selector,stem] of [['.chamber-gold','coin'],['.chamber-whisker','whisker']]){
  assert.equal(await page.locator(selector).isVisible(),true,'Owned '+stem+' must be displayed');
  assert.equal(await page.locator(selector).evaluate(n=>n.classList.contains('tier-art')),true);
  assert.match(await page.locator(selector).evaluate(n=>getComputedStyle(n).backgroundImage),new RegExp(stem+'-'+tier+'\\.svg'));
 }
}
// Unillustrated inventory is represented by one independent room object per item.
await page.evaluate(()=>window.inventoryRows=[{item_id:'unique-ornament',quantity:2,item:{name:'Dragon ornament',slug:'dragon_ornament'}}]);
await page.locator('#refresh').click();
await page.waitForFunction(()=>document.querySelector('#treasure-item-unique-ornament')?.textContent==='Dragon ornament');
assert.equal(await page.locator('#treasure-item-unique-ornament').evaluate(el=>el.parentElement.id),'kae-chamber');
assert.equal(await page.locator('#treasure-item-unique-ornament').textContent(),'Dragon ornament','Quantity stays in inventory, not room label');
await page.locator('#hive-settings').click();
await page.locator('#open-layout').click();
await page.locator('#layout-slot').selectOption('item:unique-ornament');
await page.locator('#layout-width').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('#treasure-item-unique-ornament').evaluate(el=>el.style.width),'35%');
await page.locator('#layout-visible').uncheck();
assert.equal(await page.locator('#treasure-item-unique-ornament').evaluate(el=>el.classList.contains('room-layout-hidden')),true);
await page.locator('#layout-reset').click();
assert.equal(await page.locator('#treasure-item-unique-ornament').evaluate(el=>el.classList.contains('room-layout-hidden')),false);
await page.locator('#hive-settings').click();
await page.evaluate(()=>window.inventoryRows=[]);
await page.locator('#refresh').click();
await page.waitForFunction(()=>!document.querySelector('.chamber-gold')?.classList.contains('visible')&&!document.querySelector('.chamber-whisker')?.classList.contains('visible'));
assert.equal(await page.locator('.chamber-gold').evaluate(n=>n.classList.contains('tier-art')),false,'No stale art after quantity reaches zero');
assert.equal(await page.locator('.chamber-whisker').evaluate(n=>n.classList.contains('tier-art')),false);
assert.equal(await page.locator('#coins').textContent(),originalBalance,'Visual switching never alters coin balance');
assert.equal(await page.evaluate(()=>window.rewardPurchaseCalls),0,'Quantity display never makes purchases');
assert.deepEqual(errors,[]);
console.log('PASS mocked browser viewport '+viewport.width+'x'+viewport.height+': disable/enable, active panel, refresh error, timer cancellation race, completed ordering/undo/recompletion, Kae reply copy and multiline composer, no JS errors');await ctx.close();
}
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
