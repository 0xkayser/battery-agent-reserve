import {estimate,amount} from './power-math.mjs';
const $=id=>document.getElementById(id);let observation=null,projection=null,request=null;
const sample='J2n93YFxdJfKFX61TixU2QLfjQnfp5tWg3JJjp3ubaij';
function clear(){$('report-link-box').hidden=true;observation=null;projection=null;$('power-result').hidden=true;$('share-card').hidden=true;$('save-card').hidden=true;$('estimate-error').textContent='';}
function estimateRunway(){
 projection=null;$('share-card').hidden=true;$('save-card').hidden=true;
 if(!observation)return;
 try{projection=estimate(observation.usdc.spendableUnits,$('daily-spend').value.trim(),$('protected-floor').value.trim());
  $('runway-value').textContent=projection.label;
  const dayCount=projection.days==='>365'?365:Number(projection.days);for(const [i,cell] of [...document.querySelectorAll('.card-meter i')].entries())cell.style.setProperty('--fill',`${Math.max(0,Math.min(100,(dayCount/7*5-i)*100))}%`);
  $('card-assumptions').textContent=`${amount(projection.dailyUnits)} USDC/day · ${amount(projection.floorUnits)} USDC floor assumed${projection.belowFloor?' · balance is below your floor':''}`;
  $('card-observed').textContent=`${short(observation.wallet)} · observed ${new Date(observation.observedAt).toLocaleString()} · usebattery.xyz`;
  $('share-card').hidden=false;$('save-card').hidden=false;$('estimate-error').textContent='';
 }catch(e){$('estimate-error').textContent=e.message;}
}
function short(s){return `${s.slice(0,6)}…${s.slice(-6)}`;}
async function check(){
 request?.abort();const own=new AbortController();request=own;clear();$('check-button').disabled=true;$('check-button').textContent='Reading mainnet…';$('check-status').textContent='Reading finalized SOL and USDC from Solana mainnet…';
 try{const r=await fetch(`/api/wallet?wallet=${encodeURIComponent($('wallet').value.trim())}`,{signal:own.signal,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message||'Observation unavailable.');
  if(request!==own)return;
  if(d.schema!=='battery.wallet/1'||d.wallet!==$('wallet').value.trim()||d.cluster!=='mainnet'||!Number.isFinite(Date.parse(d.observedAt))||Date.now()-Date.parse(d.observedAt)>60000||Date.parse(d.observedAt)>Date.now()+5000)throw Error('Observation is invalid or stale. Please retry.');
  observation=d;$('wallet-label').textContent=short(d.wallet);$('wallet-explorer').href=`https://solscan.io/account/${d.wallet}`;
  $('sol-balance').textContent=amount(String(d.lamports),9);$('usdc-balance').textContent=amount(d.usdc.spendableUnits);
  $('account-kind').textContent=d.account.kind==='absent'?'SOL account unfunded':d.account.kind==='program-owned'?'Program-owned account':'System-owned account';
  $('gas-note').textContent=d.account.kind==='program-owned'?'This account cannot pay ordinary wallet gas by itself. Check the agent’s fee payer.':d.lamports===0?'No self-paid SOL gas. Sponsored transactions may still work.':'SOL is separate from USDC runway. Fees and token rent depend on the task.';
  $('observation-note').textContent=`Observed ${new Date(d.observedAt).toLocaleString()} · finalized slots ${d.slots.sol} / ${d.slots.usdc} · ${d.usdc.accounts} USDC account(s).${BigInt(d.usdc.frozenUnits)>0n?' Frozen USDC excluded: '+amount(d.usdc.frozenUnits)+'.':''}${BigInt(d.usdc.delegatedAllowanceUnits)>0n?' An existing delegate has allowance; inspect it before relying on the balance.':''}`;
  $('power-result').hidden=false;$('check-status').textContent='Observation ready. Add your daily spend for a runway estimate.';
  if($('daily-spend').value.trim())estimateRunway();
 }catch(e){if(request===own&&e.name!=='AbortError')$('check-status').textContent=e.message;}
 finally{if(request===own){$('check-button').disabled=false;$('check-button').innerHTML='Check wallet <img class="ui-icon" src="/assets/second-life/icons/arrow-right.svg" alt="" width="18" height="18">';}}
}
$('wallet-form').addEventListener('submit',e=>{e.preventDefault();check();});
$('wallet').addEventListener('input',()=>{request?.abort();request=null;clear();$('check-button').disabled=false;$('check-button').textContent='Check wallet';$('check-status').textContent='Wallet changed. Run a new check.';});
$('example-wallet').addEventListener('click',()=>{$('wallet').value=sample;check();});
$('estimate-form').addEventListener('submit',e=>{e.preventDefault();estimateRunway();});
for(const id of ['daily-spend','protected-floor'])$(id).addEventListener('input',()=>{projection=null;$('report-link-box').hidden=true;$('share-card').hidden=true;$('save-card').hidden=true;$('estimate-error').textContent='Estimate inputs changed. Calculate again before sharing.';});
function blobDownload(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
$('save-json').addEventListener('click',()=>{if(observation)blobDownload(new Blob([JSON.stringify({observation,estimate:projection,limits:'Wallet balances, not provider credit or proof of agent liveness. Daily spend and floor are operator estimates.'},null,2)],{type:'application/json'}),'unhalt-runway-report.json');});
$('share-report').addEventListener('click',async()=>{if(!observation)return;const p=new URLSearchParams({wallet:observation.wallet});if(projection){p.set('rate',$('daily-spend').value.trim());p.set('floor',$('protected-floor').value.trim());}const url=`${location.origin}/check#${p}`;
 $('report-link').value=url;$('report-link-box').hidden=false;$('check-status').textContent='Report link ready below. Opening it checks balances again.';
 try{await Promise.race([navigator.clipboard.writeText(url),new Promise((_,reject)=>setTimeout(()=>reject(Error('Copy timeout')),1000))]);$('check-status').textContent='Report link copied. Includes the wallet and any calculated assumptions. Opening it checks balances again.';}
 catch{$('check-status').textContent='Automatic copy is unavailable. Select and copy the report link below.';}
});
$('save-card').addEventListener('click',()=>{
 if(!projection||!observation)return;
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;const c=canvas.getContext('2d');
 c.fillStyle='#120d13';c.fillRect(0,0,1200,675);c.fillStyle='#f2ede8';c.font='bold 36px Arial';c.fillText('UNHALT',64,82);c.font='18px Arial';c.fillText('AGENT RUNWAY CARD / SOLANA',736,82);
 c.fillStyle='#ff826f';c.font='112px Continuity, Georgia';c.fillText(projection.label,62,262);c.font='24px Arial';c.fillText('USDC runway / operator spend estimate',66,312);
 const days=projection.days==='>365'?365:Number(projection.days);for(let i=0;i<5;i++){c.fillStyle='#51332f';c.fillRect(66+i*218,366,194,52);c.fillStyle='#f2ede8';c.fillStyle='#ff826f';c.fillRect(66+i*218,366,194*Math.max(0,Math.min(1,days/7*5-i)),52);}c.font='16px Arial';c.fillText('0–7 days / USDC runway scale',66,443);
 c.fillStyle='#f2ede8';c.font='24px Arial';c.fillText(`${amount(observation.usdc.spendableUnits)} USDC observed · ${amount(projection.dailyUnits)} USDC/day assumed`,66,472);
 c.font='21px Arial';c.fillText(`${amount(projection.floorUnits)} USDC floor assumed · ${short(observation.wallet)}${projection.belowFloor?' · BELOW FLOOR':''}`,66,512);
 c.font='17px Arial';c.fillText(`Observed ${observation.observedAt} · finalized · usebattery.xyz`,66,579);c.fillText('USDC only. Gas/fees separate. Not provider credit or agent-health attestation.',66,618);
 canvas.toBlob(blob=>{if(blob)blobDownload(blob,'unhalt-runway-card.png');},'image/png');
});
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('wallet')){$('wallet').value=fragment.get('wallet').slice(0,44);$('daily-spend').value=(fragment.get('rate')||'').slice(0,15);$('protected-floor').value=(fragment.get('floor')||'0').slice(0,15);check();}
