import './financial-integrity.mjs';
const result=document.getElementById('integrity-result'),button=document.getElementById('verify-checkpoint');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
button.addEventListener('click',async()=>{
 button.disabled=true;result.textContent='[ READING PUBLISHED CHECKPOINT ]';
 try{const r=await fetch('/evidence/live-agent.json');if(!r.ok)throw Error('Evidence unavailable');const data=await r.json();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(data.checkpoint.body))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==data.checkpoint.sha256)throw Error('Checkpoint hash mismatch');
  result.textContent=`[ HASH MATCH / ${data.checkpoint.body.results.length} COMPLETED RESULTS ]\n${hash}\nIntegrity verified locally. This does not authenticate the model or prove an onchain transaction.`;
 }catch(e){result.textContent='[ VERIFICATION FAILED ] '+e.message;}finally{button.disabled=false;window.dispatchEvent(new Event('battery-render'));}
});
