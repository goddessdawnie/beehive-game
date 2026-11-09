const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const root=process.cwd();const server=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEE_BROWSER_EXECUTABLE?{executablePath:process.env.BEE_BROWSER_EXECUTABLE}:{})});
const mock=`window.registryRows=[{game_key:'sudoku',enabled:false}];window.registryError=false;window.timerRow=null;window.cancelDuringSend=false;
window.chatRows=[{role:'user',content:'Can you read this?',created_at:'2026-11-07T08:00:00Z'},{role:'mochi',content:'Dragon decree:\\nNo more paperwork. 🐉 *I insist.*',created_at:'2026-11-07T08:01:00Z'}];
window.taskRows=[
{id:'earlier',title:'Earlier finished, edited later',status:'completed',created_at:'2026-10-01T10:00:00Z',completed_at:'2026-11-05T09:00:00Z',updated_at:'2026-11-07T20:00:00Z',reward_coins:5,completion_notes:'Edited after completion'},
{id:'recent',title:'Recently finished',status:'completed',created_at:'2026-09-01T10:00:00Z',completed_at:'2026-11-06T18:00:00Z',updated_at:'2026-11-06T18:00:00Z',due_at:'2026-12-25T12:00:00Z',reward_coins:5},
{id:'legacy',title:'Legacy completion',status:'completed',created_at:'2026-10-30T10:00:00Z',completed_at:null,updated_at:'2026-11-07T21:00:00Z',reward_coins:5},
{id:'cancelled',title:'Cancelled item',status:'cancelled',created_at:'2026-11-04T10:00:00Z',updated_at:'2026-11-07T22:00:00Z',reward_coins:5},
{id:'deferred',title:'Deferred item',status:'deferred',created_at:'2026-11-03T10:00:00Z',updated_at:'2026-11-07T23:00:00Z',reward_coins:5},
{id:'open',title:'Open task',status:'open',created_at:'2026-11-07T10:00:00Z',updated_at:'2026-11-07T10:00:00Z',reward_coins:5}
];
window.catalogRows=[
{id:'both',title:'Shared dishes',property:'Both',category:'cleaning',active:true,locations:[]},
{id:'florence',title:'Florence stairs',property:'Florence',category:'cleaning',active:true,locations:[]},
{id:'williamsburg',title:'Williamsburg porch',property:'Williamsburg',category:'cleaning',active:true,locations:[]},
{id:'unassigned',title:'Undecided chore',property:null,category:'cleaning',active:true,locations:[]}
];
const user={id:'2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'};
window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{access_token:'test-browser-token'}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{if(name==='set_task_status'){const task=window.taskRows.find(t=>t.id===args.p_task_id);task.status=args.p_status;task.completed_at=args.p_status==='completed'?new Date().toISOString():null;return {data:true,error:null};}if(name==='beehive_cancel_timer'&&window.cancelDuringSend){window.timerRow.status='sending';window.timerRow.attempts=1;return {data:false,error:null};}return {data:null,error:null};},from(table){let single=false;const chain=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>resolve({data:table==='beehive_timers'?window.timerRow:table==='beehive_games'?window.registryRows:table==='tasks'?window.taskRows:table==='activity_catalog'?window.catalogRows:table==='mochi_messages'?window.chatRows:table==='pet_state'?{name:'Kae',comfort_value:100}:single?null:[],error:table==='beehive_games'&&window.registryError?{message:'offline'}:null});return (...args)=>{if(key==='maybeSingle'||key==='single')single=true;return chain;}}});return chain;}})};`;
for(const viewport of [{width:393,height:851},{width:1280,height:900}]){
const ctx=await browser.newContext({viewport,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Pre-existing one-slot Android calibration must migrate without touching actual inventory.
await page.addInitScript(()=>localStorage.setItem('beehive:cushion-layout:v1:2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b',JSON.stringify({left:29,bottom:11,width:47,height:15})));
await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url().includes('supabase.min.js')?route.fulfill({contentType:'application/javascript',body:mock}):route.abort());
await page.goto(origin);
await page.locator('#game:not(.hidden)').waitFor();
assert.equal(await page.locator('#maintenance-menu').isVisible(),false);
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'47%','Legacy cushion calibration carries forward');
await page.locator('#hive-settings').click();
assert.equal(await page.locator('#hive-settings').getAttribute('aria-expanded'),'true');
await page.locator('#open-layout').click();
assert.equal(await page.locator('#layout-tools').isVisible(),true);
assert.equal(await page.locator('#layout-guide').isVisible(),true);
assert.equal(await page.locator('#kaetap').evaluate(el=>el.classList.contains('layout-preview-sticky')),true);
assert.deepEqual(await page.locator('#layout-slot option').allTextContents(),[
 'Cushion · Under Kae','Kae · Dragon','Behind · Throne','Left Lower · Table','Right · Display Case'
]);
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
await page.locator('#layout-slot').selectOption('right');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'','Default right-anchored case remains unchanged until edited');
await page.locator('#layout-left').evaluate(el=>{el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}));});
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'75%');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.right),'auto');
await page.locator('#layout-slot').selectOption('cushion');
assert.equal(await page.locator('#layout-width').inputValue(),'48','Switching slots preserves other geometry');
await page.reload();
await page.locator('#game:not(.hidden)').waitFor();
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'48%');
assert.equal(await page.locator('.chamber-kae').evaluate(el=>el.style.left),'35%');
assert.equal(await page.locator('.chamber-case').evaluate(el=>el.style.left),'75%');
await page.locator('#hive-settings').click();
await page.locator('#open-layout').click();
await page.locator('#layout-reset').click();
assert.equal(await page.locator('.chamber-pillow').evaluate(el=>el.style.width),'','Restoring removes the override and uses CSS defaults');
assert.equal(await page.locator('#layout-width-value').textContent(),'36%');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('beehive:room-layout:v1:2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b')).cushion),null,'Explicit reset blocks old legacy calibration');
await page.locator('#layout-close').click();
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
assert.deepEqual(errors,[]);
console.log('PASS mocked browser viewport '+viewport.width+'x'+viewport.height+': disable/enable, active panel, refresh error, timer cancellation race, completed ordering/undo/recompletion, Kae reply copy and multiline composer, no JS errors');await ctx.close();
}
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
