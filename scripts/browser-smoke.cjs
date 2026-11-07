const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const root=process.cwd();const server=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEE_BROWSER_EXECUTABLE?{executablePath:process.env.BEE_BROWSER_EXECUTABLE}:{})});
const mock=`window.registryRows=[{game_key:'sudoku',enabled:false}];window.registryError=false;window.timerRow=null;window.cancelDuringSend=false;
window.taskRows=[
{id:'earlier',title:'Earlier finished, edited later',status:'completed',created_at:'2026-10-01T10:00:00Z',completed_at:'2026-11-05T09:00:00Z',updated_at:'2026-11-07T20:00:00Z',reward_coins:5,completion_notes:'Edited after completion'},
{id:'recent',title:'Recently finished',status:'completed',created_at:'2026-09-01T10:00:00Z',completed_at:'2026-11-06T18:00:00Z',updated_at:'2026-11-06T18:00:00Z',due_at:'2026-12-25T12:00:00Z',reward_coins:5},
{id:'legacy',title:'Legacy completion',status:'completed',created_at:'2026-10-30T10:00:00Z',completed_at:null,updated_at:'2026-11-07T21:00:00Z',reward_coins:5},
{id:'cancelled',title:'Cancelled item',status:'cancelled',created_at:'2026-11-04T10:00:00Z',updated_at:'2026-11-07T22:00:00Z',reward_coins:5},
{id:'deferred',title:'Deferred item',status:'deferred',created_at:'2026-11-03T10:00:00Z',updated_at:'2026-11-07T23:00:00Z',reward_coins:5},
{id:'open',title:'Open task',status:'open',created_at:'2026-11-07T10:00:00Z',updated_at:'2026-11-07T10:00:00Z',reward_coins:5}
];
const user={id:'2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'};
window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{if(name==='set_task_status'){const task=window.taskRows.find(t=>t.id===args.p_task_id);task.status=args.p_status;task.completed_at=args.p_status==='completed'?new Date().toISOString():null;return {data:true,error:null};}if(name==='beehive_cancel_timer'&&window.cancelDuringSend){window.timerRow.status='sending';window.timerRow.attempts=1;return {data:false,error:null};}return {data:null,error:null};},from(table){let single=false;const chain=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>resolve({data:table==='beehive_timers'?window.timerRow:table==='beehive_games'?window.registryRows:table==='tasks'?window.taskRows:table==='pet_state'?{name:'Kae',comfort_value:100}:single?null:[],error:table==='beehive_games'&&window.registryError?{message:'offline'}:null});return (...args)=>{if(key==='maybeSingle'||key==='single')single=true;return chain;}}});return chain;}})};`;
for(const viewport of [{width:393,height:851},{width:1280,height:900}]){
const ctx=await browser.newContext({viewport,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url().includes('supabase.min.js')?route.fulfill({contentType:'application/javascript',body:mock}):route.abort());
await page.goto(origin);
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
console.log('PASS mocked browser viewport '+viewport.width+'x'+viewport.height+': disable/enable, active panel, refresh error, timer cancellation race, completed ordering/undo/recompletion, no JS errors');await ctx.close();
}
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
