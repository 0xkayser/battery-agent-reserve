const button=document.querySelector('#verify-integrated-artifact');
const status=document.querySelector('#integrated-integrity');
button?.addEventListener('click',async()=>{
 button.disabled=true;
 try{
  const response=await fetch('/evidence/integrated-financial.json',{cache:'no-store'});
  if(!response.ok)throw Error('Artifact unavailable');
  const proof=await response.json();
  if(proof.schema!=='battery.mainnet-financial-proof/1')throw Error('Wrong schema');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(proof.body)));
  const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==proof.sha256)throw Error('Hash mismatch');
  status.textContent='[ HASH MATCH / INTEGRATED FINANCIAL ARTIFACT ]\n'+hash+'\nIntegrity only. Run --live verifier to re-read finalized chain transactions.';
 }catch(e){status.textContent='[ VERIFICATION FAILED ] '+e.message;}
 finally{button.disabled=false;}
});
