// Artifact integrity only; finalized chain verification is a separate CLI/readback.
const button=document.getElementById('verify-financial-proof'),result=document.getElementById('financial-integrity');
button?.addEventListener('click',async()=>{
 button.disabled=true;result.textContent='[ CHECKING PUBLISHED MAINNET ARTIFACT ]';
 try{
  const response=await fetch('/evidence/mainnet-canary.json',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Artifact unavailable');const proof=await response.json();
  if(proof.schema!=='battery.mainnet-financial-proof/1'||proof.body?.cluster!=='mainnet')throw Error('Wrong artifact schema/cluster');
  const bytes=new TextEncoder().encode(JSON.stringify(proof.body));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==proof.sha256)throw Error('Hash mismatch');
  result.textContent=`[ HASH MATCH / ${Object.keys(proof.body.receipts).length} MAINNET RECEIPTS ]\n${digest}\nIntegrity only. Follow Explorer links or run --live for finalized chain verification.`;
 }catch(e){result.textContent='[ VERIFICATION FAILED ] '+e.message;}
 finally{button.disabled=false;window.dispatchEvent(new Event('battery-render'));}
});
