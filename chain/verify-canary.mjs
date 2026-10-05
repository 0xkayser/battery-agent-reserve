// Offline integrity is separate from actual finalized mainnet readback. Never signs.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {hash,GENESIS,PROGRAM,USDC,POLICY,rpc,account,decodeToken,requireMainnet} from './reserve.mjs';
import {verifyConfirmation} from './settlement.mjs';
export function verifyCanary(proof,research){
 assert.equal(proof.schema,'battery.mainnet-financial-proof/1');
 const b=proof.body;assert.equal(hash(Buffer.from(JSON.stringify(b))),proof.sha256,'Artifact integrity');
 assert.equal(b.cluster,'mainnet');assert.equal(b.genesisHash,GENESIS);assert.equal(b.program,PROGRAM);assert.equal(b.mint,USDC);
 assert.equal(b.checkpointSha256,research.checkpoint.sha256);
 assert.deepEqual(b.policy,POLICY);
 const expected={'refund-extra':2_000_000,setup:0,'research-001':10_000,'research-002':10_000,'research-003':10_000,revoke:0,'return-owner':2_970_000,'return-worker':30_000};
 assert.deepEqual(Object.keys(b.receipts).sort(),Object.keys(expected).sort());
 const signatures=new Set();let fees=0;
 for(const [id,row] of Object.entries(b.receipts)){
  assert.match(row.signature,/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);assert(!signatures.has(row.signature));signatures.add(row.signature);
  assert.equal(row.amountUsdc,expected[id]);assert.equal(row.dispatchAttempts,1);
  assert(Number.isSafeInteger(row.slot)&&row.slot>0);assert(Number.isSafeInteger(row.feeLamports)&&row.feeLamports>=0&&row.feeLamports<=POLICY.maxFeeLamports);fees+=row.feeLamports;
  assert.match(row.wireSha256,/^[a-f0-9]{64}$/);
  if(id.startsWith('research-')){
   const result=research.checkpoint.body.results.find(r=>r.id===id);
   assert(result);assert.equal(row.resultHash,hash(Buffer.from(JSON.stringify(result))));
   assert.equal(row.owner,b.owner);assert.equal(row.worker,b.worker);
  }else if(row.amountUsdc){assert.equal(row.worker,b.returnAddress);assert.equal(row.owner,id==='return-worker'?b.worker:b.owner);}
 }
 assert.equal(b.transactionFeesLamports,fees);
 assert.equal(b.settlementPayments,3);assert.equal(b.mainnetTransactions,8);
 assert.deepEqual(b.afterSettlement,{reserveUsdc:2_970_000,workerUsdc:30_000,remainingUsdc:970_000});
 assert.equal(b.final.reserveUsdc,0);assert.equal(b.final.workerUsdc,0);assert.equal(b.final.delegationClosed,true);
 assert.equal(b.returnedUsdc,5_000_000);
 assert.equal(b.recovery.exitCode,74);assert.equal(b.recovery.receiptPersistedAtExit,false);
 assert.equal(b.recovery.signature,b.receipts['research-002'].signature);
 assert.equal(b.replay.outboxUnchanged,true);assert.equal(b.replay.newSignatures,0);assert.equal(b.replay.newTransfers,0);
 const checks=b.negativeSimulations.flatMap(x=>x.checks);
 assert.deepEqual(checks.map(x=>x.id).sort(),['over-remaining-cap','revoked-worker','wrong-delegate']);
 for(const c of checks){assert(c.error);assert.equal(c.broadcast,false);}
 return {confirmedTransactions:8,settlementPayments:3,returnedUsdc:5,feesLamports:fees,integrity:true};
}
export async function verifyMainnet(proof,research){
 const result=verifyCanary(proof,research),b=proof.body;
 requireMainnet(await rpc('getGenesisHash'));
 const rows=Object.entries(b.receipts),statuses=(await rpc('getSignatureStatuses',[rows.map(([,r])=>r.signature),{searchTransactionHistory:true}])).value;
 assert.equal(statuses.length,rows.length);
 for(let i=0;i<rows.length;i++){
  const [id,row]=rows[i];assert.equal(statuses[i]?.confirmationStatus,'finalized');assert.equal(statuses[i]?.err,null);
  const tx=await rpc('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  const wire=tx?.transaction?.[0];assert.equal(hash(Buffer.from(wire,'base64')),row.wireSha256,'Finalized bytes');
  const receipt=verifyConfirmation({...row,wire},tx);
  for(const key of ['signature','slot','feeLamports','amountUsdc'])assert.equal(receipt[key],row[key]);
  if(id.startsWith('research-'))assert(Buffer.from(wire,'base64').includes(Buffer.from(`BATTERY:v1:${id}:${row.resultHash}`)),'Mainnet result memo');
 }
 assert.equal(decodeToken(await account(b.sourceAta),b.owner),0);
 assert.equal(decodeToken(await account(b.receiverAta),b.worker),0);
 assert.equal(await account(b.delegation),null);
 return {...result,finalizedReadback:true,genesisHash:GENESIS};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('..',import.meta.url));
 const proof=JSON.parse(readFileSync(root+'/evidence/mainnet-canary.json','utf8'));
 const research=JSON.parse(readFileSync(root+'/evidence/mainnet-agent.json','utf8'));
 const result=process.argv.includes('--live')?await verifyMainnet(proof,research):verifyCanary(proof,research);
 console.log(JSON.stringify(result,null,2));
}
