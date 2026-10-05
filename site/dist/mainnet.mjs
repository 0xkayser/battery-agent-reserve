const status=document.getElementById('live-status'),readout=document.getElementById('live-readout'),button=document.getElementById('refresh-network');let current=null;
function age(){if(!current)return;const seconds=Math.max(0,Math.floor(Date.now()/1000-current.observedAt));document.getElementById('sample-age').textContent=`[ ${seconds>90?'STALE / ':''}${seconds}s SINCE OBSERVATION ]`;}
async function refresh(){
 button.disabled=true;status.textContent='[ CONNECTING / PUBLIC SOLANA MAINNET ]';
 try{const r=await fetch('/api/mainnet',{signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw Error(data.message??'Network unavailable');
  if(data.schema!=='battery.network/1'||data.cluster!=='mainnet'||!Number.isSafeInteger(data.observedAt))throw Error('Invalid observation');current=data;
  status.textContent='[ OBSERVATION RECEIVED / READ-ONLY ]';
  readout.textContent=`CLUSTER       mainnet\nFINALIZED SLOT ${data.slot}\nBLOCK HEIGHT  ${data.blockHeight}\nEPOCH         ${data.epoch}\nRPC LATENCY   ${data.latencyMs}ms (server -> RPC)\nRECENT RATE   ${data.performance.transactionsPerSecond} tx/s\nSAMPLE WINDOW ${data.performance.samplePeriodSecs}s\nSAMPLE SLOT   ${data.performance.slot}\nOBSERVED UTC  ${new Date(data.observedAt*1000).toISOString()}\n\nGENESIS\n${data.genesisHash}`;age();
 }catch(e){status.textContent='[ NO NEW OBSERVATION ] '+e.message;if(!current)readout.textContent='[ RPC UNAVAILABLE / NO SYNTHETIC VALUES ]';age();}
 finally{button.disabled=false;window.dispatchEvent(new Event('battery-render'));}
}
button.addEventListener('click',refresh);setInterval(age,1000);refresh();
const verifyButton=document.getElementById('verify-financial-proof'),integrity=document.getElementById('financial-integrity');
verifyButton?.addEventListener('click',async()=>{
 verifyButton.disabled=true;integrity.textContent='[ CHECKING PUBLISHED ARTIFACT ]';
 try{
  const response=await fetch('/evidence/mainnet-canary.json',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Artifact unavailable');const proof=await response.json();
  if(proof.schema!=='battery.mainnet-financial-proof/1')throw Error('Wrong artifact schema');
  const bytes=new TextEncoder().encode(JSON.stringify(proof.body));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==proof.sha256)throw Error('Hash mismatch');
  integrity.textContent=`[ HASH MATCH / ${Object.keys(proof.body.receipts).length} RECEIPTS ]\n${digest}\nIntegrity only. Follow transaction links or run --live for chain verification.`;
 }catch(e){integrity.textContent='[ VERIFICATION FAILED ] '+e.message;}
 finally{verifyButton.disabled=false;window.dispatchEvent(new Event('battery-render'));}
});
