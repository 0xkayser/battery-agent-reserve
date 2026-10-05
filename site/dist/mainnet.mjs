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
import './financial-integrity.mjs';
