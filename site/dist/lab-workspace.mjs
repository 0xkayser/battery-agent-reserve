import {currentScenario,applyScenario} from './app.mjs';
import {browserStore} from './store.mjs';
const $=id=>document.getElementById(id),store=browserStore();let id=new URLSearchParams(location.search).get('policy');
function message(s){$('workspace-status').textContent=s;window.dispatchEvent(new Event('battery-render'));}
if(id)try{const p=store.read().policies.find(p=>p.id===id);if(!p)throw Error('Saved policy not found in this browser.');applyScenario(p.scenario);$('policy-name').value=p.name;message('Editing a saved policy. Changes are saved only when you press SAVE POLICY.');}catch(e){id=null;message(e.message+' Showing the default or shared test.');}
$('save-policy').addEventListener('click',()=>{try{const p=store.savePolicy($('policy-name').value,currentScenario(),id);id=p.id;history.replaceState(null,'','/lab?policy='+id);message('Policy saved in this browser. Open Policies to return to it.');}catch(e){message(e.message);}});
$('new-policy').addEventListener('click',()=>{id=null;history.replaceState(null,'','/lab');message('Next save creates a new policy. The previous one is retained.');});
$('record-test').addEventListener('click',()=>{try{const r=store.saveRun($('policy-name').value,currentScenario());message('Test recorded in this browser.');const a=document.createElement('a');a.textContent='[ OPEN RECEIPT ]';a.href='/runs?id='+r.id;$('workspace-status').append(document.createTextNode(' '),a);}catch(e){message(e.message);}});
