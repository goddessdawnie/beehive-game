const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const root=process.cwd();const server=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEE_BROWSER_EXECUTABLE?{executablePath:process.env.BEE_BROWSER_EXECUTABLE}:{})});
const mock=`window.registryRows=[{game_key:'sudoku',enabled:false}];window.registryError=false;
const user={id:'2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'};
window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}},rpc:async()=>({data:null,error:null}),from(table){let single=false;const chain=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>resolve({data:table==='beehive_games'?window.registryRows:table==='pet_state'?{name:'Kae',comfort_value:100}:single?null:[],error:table==='beehive_games'&&window.registryError?{message:'offline'}:null});return (...args)=>{if(key==='maybeSingle'||key==='single')single=true;return chain;}}});return chain;}})};`;
for(const viewport of [{width:393,height:851},{width:1280,height:900}]){
const ctx=await browser.newContext({viewport,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url().includes('supabase.min.js')?route.fulfill({contentType:'application/javascript',body:mock}):route.abort());
await page.goto(origin);await page.locator('#tab-play').click();await page.waitForFunction(()=>document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#open-sudoku').isVisible(),false);assert.equal(await page.locator('#open-wordle').isVisible(),true);
await page.evaluate(()=>window.registryRows=[]);await page.locator('#tab-tasks').click();await page.locator('#tab-play').click();await page.waitForFunction(()=>!document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#open-sudoku').isVisible(),true);await page.locator('#open-sudoku').click();assert.equal(await page.locator('#play-sudoku').isVisible(),true);
await page.evaluate(()=>{window.registryRows=[{game_key:'sudoku',enabled:false}];document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('#open-sudoku').disabled);
assert.equal(await page.locator('#play-library').isVisible(),true);assert.equal(await page.locator('#play-sudoku').isVisible(),false);
await page.evaluate(()=>{window.registryError=true;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('#game-registry-status').textContent.includes('could not refresh'));
assert.equal(await page.locator('#open-sudoku').isVisible(),false);assert.deepEqual(errors,[]);
console.log('PASS mocked browser viewport '+viewport.width+'x'+viewport.height+': disable/enable, active panel, refresh error, no JS errors');await ctx.close();
}
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
