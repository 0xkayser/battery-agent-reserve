import {simulate,validate} from './engine.mjs';
import {lettering,graph} from './ascii.mjs';
import {mark} from './brand.mjs';
import {refreshTracks,portraitData} from './surface.mjs';
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
let fees=false,last,frame;
const form=$('scenario'),keys=['reserve','rate','floor','provider'];
function read(){return validate({reserve:Number($('reserve').value),rate:Number($('rate').value),floor:Number($('floor').value),provider:Number($('provider').value),fallback:$('fallback').checked,crash:$('crash').checked,fees});}
function paint(result,animate=false){
  cancelAnimationFrame(frame);last=result;
  $('reserve-label').textContent=money(result.scenario.reserve);$('rate-label').textContent=money(result.scenario.rate);
  $('runway-hours').textContent=lettering(String(result.hours).padStart(2,'0'));$('runway-hours').dataset.value=String(result.hours);$('runway-hours').setAttribute('aria-label',`${result.hours} hours of permitted work`);$('reserve-left').textContent=money(result.balance);$('protected').textContent=money(result.protected);$('duplicates').textContent='0';$('tasks-count').textContent=`${result.completed} completed tasks`;
  $('result-state').textContent=result.stopped===null?'TEST SURVIVED':'PAUSED SAFELY';
  $('result-description').textContent=result.stopped===null?'Your reserve covers the full test. Each permitted task stays within the configured limits.':`New work pauses at hour ${result.hours}. Confirmed progress is preserved. The protected balance remains available.`;
  $('events').replaceChildren(...result.events.map(event=>{const li=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');time.textContent=`${String(event.hour).padStart(2,'0')}H`;text.textContent=event.text;li.append(time,text);return li;}));
  $('charge-chart').textContent=graph(result,$('charge-chart').clientWidth,parseFloat(getComputedStyle($('charge-chart')).fontSize)*.6);$('charge-chart').setAttribute('aria-label',`Reserve over 72 hours. ${result.hours} permitted tasks; ${money(result.balance)} remains.`);window.dispatchEvent(new Event('battery-render'));
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const start=performance.now(),total=result.hours;const tick=now=>{const progress=Math.min(1,(now-start)/900);$('runway-hours').textContent=lettering(String(Math.round(total*progress)).padStart(2,'0'));if(progress<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
}
function update(animate=false){refreshTracks();$('reserve-label').textContent=money(Number($('reserve').value));$('rate-label').textContent=money(Number($('rate').value));try{const s=read();$('input-error').hidden=true;paint(simulate(s),animate);}catch(error){$('input-error').textContent=error.message;$('input-error').hidden=false;}}
function apply(s){validate(s);for(const key of keys)$(key).value=String(s[key]);$('fallback').checked=s.fallback;$('crash').checked=s.crash;fees=s.fees;$('fees-toggle').setAttribute('aria-checked',String(fees));$('fees-label').textContent=fees?'ON':'OFF';update();}
try {const encoded=new URLSearchParams(location.hash.slice(1)).get('test');if(encoded)apply(JSON.parse(encoded));else update();}catch{update();$('share-status').textContent='That shared test was invalid. Showing the default scenario.';}
for(const id of keys)$(id).addEventListener('input',()=>update());
for(const id of ['fallback','crash'])$(id).addEventListener('change',()=>update());
form.addEventListener('submit',event=>{event.preventDefault();update(true);});
$('fees-toggle').addEventListener('click',()=>{fees=!fees;$('fees-toggle').setAttribute('aria-checked',String(fees));$('fees-label').textContent=fees?'ON':'OFF';update();});
$('pull-plug')?.addEventListener('click',()=>{fees=false;$('fees-toggle').setAttribute('aria-checked','false');$('fees-label').textContent='OFF';update(true);});
$('share-scenario').addEventListener('click',async()=>{
  if(!$('input-error').hidden){$('share-status').textContent='Correct the limits before sharing a test.';return;}
  try {const s=read(),url=new URL(location.href);url.search='';url.hash=new URLSearchParams({test:JSON.stringify(s)}).toString();await navigator.clipboard.writeText(url.href);$('share-status').textContent='Test link copied. The same reserve and limits open for the next visitor.';}
  catch { $('share-status').textContent='Clipboard unavailable. Your test link is selected below.';const input=document.createElement('input');input.type='text';input.value=`${location.origin}${location.pathname}#${new URLSearchParams({test:JSON.stringify(last.scenario)})}`;input.setAttribute('aria-label','Scenario link');$('share-status').append(input);input.style.width='100%';input.style.marginTop='12px';input.select(); }
});
$('download-card').addEventListener('click',()=>{
  if(!$('input-error').hidden){$('share-status').textContent='Correct the limits before saving a result.';return;}
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#fff';ctx.textBaseline='top';
  function lines(text,x,y,size,leading=size*1.15){ctx.font=`${size}px monospace`;text.split('\n').forEach((line,i)=>ctx.fillText(line,x,y+i*leading));}
  lines('+'+'-'.repeat(57)+'+',57,27,27);lines('+'+'-'.repeat(57)+'+',57,1285,27);
  for(let y=58;y<1285;y+=27){lines('|',57,y,27);lines('|',997,y,27);}
  lines(mark,91,90,12,12);lines(lettering('BATTERY'),238,101,21,23);lines('[ BLACKOUT TEST / SIMULATION ]',95,288,23);
  const art=portraitData();if(art)lines(art.text,449,371,8,8.4);
  lines(lettering(String(last.hours).padStart(2,'0')),95,390,35,41);
  lines('HOURS OF PERMITTED WORK',95,725,27);
  lines(`Reserve ${money(last.scenario.reserve)} / cost ${money(last.scenario.rate)}`,95,820,26);
  lines(`Protected ${money(last.protected)} / left ${money(last.balance)}`,95,873,26);
  lines('-'.repeat(51),95,957,27);
  lines(last.stopped===null?'[ TEST SURVIVED ]':'[ PAUSED SAFELY ]',95,1006,31);
  lines('Illustrative scenario. No live funds\nor measured agent performance.',95,1091,23,32);
  lines('[ BATTERY / THE BLACKOUT BENCH ]',95,1226,23);
  canvas.toBlob(blob=>{if(!blob){$('share-status').textContent='Could not create the card. Copy the test link instead.';return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`battery-blackout-${last.hours}h.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('share-status').textContent='Result card saved with its simulation label.';},'image/png');
});
let graphFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(graphFrame);graphFrame=requestAnimationFrame(()=>{if(last)$('charge-chart').textContent=graph(last,$('charge-chart').clientWidth,parseFloat(getComputedStyle($('charge-chart')).fontSize)*.6);});});
const graphResize=new ResizeObserver(()=>{if(last)$('charge-chart').textContent=graph(last,$('charge-chart').clientWidth,parseFloat(getComputedStyle($('charge-chart')).fontSize)*.6);});graphResize.observe($('charge-chart'));
const guide=$('guide');$('open-guide').addEventListener('click',()=>{guide.showModal();document.body.classList.add('modal-open');});$('close-guide').addEventListener('click',()=>guide.close());guide.addEventListener('close',()=>document.body.classList.remove('modal-open'));guide.addEventListener('click',event=>{if(event.target===guide){const box=guide.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)guide.close();}});
// Same public scenario as UI. Optional browser-standard WebMCP, no hidden writes.
const lifecycle=new AbortController();if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'configure_battery_simulation',description:'Configure and run the visible illustrative BATTERY blackout scenario. No live agent or money action.',inputSchema:{type:'object',properties:{reserve:{type:'number',minimum:5,maximum:500},rate:{type:'number',minimum:.1,maximum:5},floor:{type:'number',minimum:0,maximum:100},provider:{type:'number',minimum:0,maximum:500},fallback:{type:'boolean'},crash:{type:'boolean'},fees:{type:'boolean'}},required:['reserve','rate','floor','provider','fallback','crash','fees'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{apply(validate(input));return {hours:last.hours,reserveLeft:last.balance,status:last.stopped===null?'survived':'paused',simulation:true};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});

export function currentScenario(){return read();}
export function applyScenario(s){apply(s);}
