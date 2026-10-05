// Persistence and reconciliation shared by the canary and offline failure tests.
import {writeFileSync,openSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {USDC,POLICY} from './reserve.mjs';
export function durableJson(path,value){
 const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
 let fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);
 fd=openSync(dirname(path),'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}
export function verifyConfirmation(row,tx){
 if(!tx?.meta||tx.meta.err)throw Error('Transaction failed or metadata missing; hold for inspection');
 if(tx.transaction?.[0]!==row.wire||tx.transaction[1]!=='base64')throw Error('Confirmed bytes mismatch');
 if(!Number.isSafeInteger(tx.meta.fee)||tx.meta.fee>row.feeLamports||tx.meta.fee>POLICY.maxFeeLamports)throw Error('Confirmed fee exceeds bound');
 if(row.amountUsdc){
  const balances=(rows,owner)=>rows.filter(x=>x.owner===owner&&x.mint===USDC&&x.uiTokenAmount?.decimals===6);
  const beforeOwner=balances(tx.meta.preTokenBalances,row.owner),afterOwner=balances(tx.meta.postTokenBalances,row.owner);
  const beforeWorker=balances(tx.meta.preTokenBalances,row.worker),afterWorker=balances(tx.meta.postTokenBalances,row.worker);
  if([beforeOwner,afterOwner,beforeWorker,afterWorker].some(x=>x.length!==1))throw Error('Missing/ambiguous USDC balance proof');
  const n=x=>BigInt(x[0].uiTokenAmount.amount);
  if(n(beforeOwner)-n(afterOwner)!==BigInt(row.amountUsdc)||n(afterWorker)-n(beforeWorker)!==BigInt(row.amountUsdc))throw Error('USDC delta mismatch');
 }
 return {signature:row.signature,slot:tx.slot,feeLamports:tx.meta.fee,amountUsdc:row.amountUsdc??0};
}
export async function driveTransaction({id,store,save,rpc,prepare,afterSend=()=>{},pause=()=>new Promise(r=>setTimeout(r,1500))}){
 let row=store[id];
 if(row?.receipt)return row.receipt;
 if(!row){row=await prepare();store[id]=row;save();} // Must be durable before first dispatch.
 const lookup=async()=>{
  const statuses=await rpc('getSignatureStatuses',[[row.signature],{searchTransactionHistory:true}]);
  const status=statuses.value[0];
  if(status?.err)throw Error('Failed chain transaction; hold for inspection, no replacement');
  if(status?.confirmationStatus==='finalized'){
   const tx=await rpc('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
   if(!tx)return null;
   row.receipt=verifyConfirmation(row,tx);save();return row.receipt;
  }
  return null;
 };
 let receipt=await lookup();if(receipt)return receipt;
 const height=await rpc('getBlockHeight',[{commitment:'confirmed'}]);
 if(height>row.lastValidBlockHeight)throw Error('Expired uncertain transaction; inspection required, never re-sign');
 row.dispatchAttempts=(row.dispatchAttempts??0)+1;save();
 // Network errors leave the persisted signed transaction held. Same bytes only on a subsequent invocation.
 const signature=await rpc('sendTransaction',[row.wire,{encoding:'base64',skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'}]);
 if(signature!==row.signature)throw Error('RPC signature mismatch');afterSend();
 for(let i=0;i<8;i++){receipt=await lookup();if(receipt)return receipt;await pause();}
 throw Error('Awaiting finality; persisted transaction held. Resume the same command; no replacement.');
}
