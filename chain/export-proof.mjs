// Reads private experiment state, exports selected PUBLIC evidence only. No keys/signing.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {hash,rpc,chainState,POLICY,GENESIS,PROGRAM,USDC} from './reserve.mjs';
import {verifyMainnet} from './verify-canary.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),name=process.env.BATTERY_CANARY_NAME??'canary';
if(!/^[a-z][a-z0-9-]{0,47}$/.test(name))throw Error('Invalid isolated canary name');
const state=root+'/mainnet-state/'+name;
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const researchPath=process.argv[2]??root+'/evidence/mainnet-agent.json',outputPath=process.argv[3]??root+'/evidence/mainnet-canary.json';
const research=read(researchPath),integrated=research.schema==='battery.integrated-runtime/1';
const plan=read(state+'/plan.json'),outbox=read(state+'/outbox.json'),after=read(state+'/proof.json');
const current=await chainState(plan.addresses);
const receipts=Object.fromEntries(Object.entries(outbox).map(([id,row])=>{
 if(!row.receipt)throw Error('Uncertain transaction cannot become public confirmation');
 return [id,{...row.receipt,owner:row.owner,worker:row.worker,resultHash:row.resultHash,
  wireSha256:hash(Buffer.from(row.wire,'base64')),dispatchAttempts:row.dispatchAttempts}];
}));
const body={observedAt:new Date().toISOString(),cluster:'mainnet',genesisHash:GENESIS,program:PROGRAM,mint:USDC,
 programSha256:plan.programSha256,...plan.addresses,returnAddress:plan.returnAddress,policy:POLICY,
 checkpointSha256:after.checkpointSha256,receipts,mainnetTransactions:Object.keys(receipts).length,settlementPayments:3,
 transactionFeesLamports:Object.values(receipts).reduce((s,r)=>s+r.feeLamports,0),
 afterSettlement:{reserveUsdc:after.reserveUsdc,workerUsdc:after.workerUsdc,remainingUsdc:after.remainingUsdc},
 final:{reserveUsdc:current.reserveUsdc,workerUsdc:current.receiverUsdc,delegationClosed:!current.delegation,
  ownerSolLamports:(await rpc('getBalance',[plan.addresses.owner,{commitment:'finalized'}])).value,workerSolLamports:current.gasLamports},
 returnedUsdc:receipts['refund-extra'].amountUsdc+receipts['return-owner'].amountUsdc+receipts['return-worker'].amountUsdc,
 recovery:read(state+'/crash-observation.json'),replay:read(state+'/replay-observation.json'),
 negativeSimulations:[read(state+'/guards-active.json'),read(state+'/guards-revoked.json')],
 boundary:plan.boundary,
 limits:(integrated?'Dated interleaved owned-agent canary. Pre-task onchain checks, local inference and finalized result settlement execute in one loop. ':'Dated owned-agent canary. Research inference was local and separate; ')+
 'Settlements bind saved results, not paid provider bills. Negative checks are mainnet preflight simulations, not broadcast failures. Small SOL and account rents remain locally operator-owned. No hosted customer service, token, custody deployment or independent BATTERY audit.'};
const proof={schema:'battery.mainnet-financial-proof/1',body,sha256:hash(Buffer.from(JSON.stringify(body)))};
const check=await verifyMainnet(proof,research);
writeFileSync(outputPath,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({...check,sha256:proof.sha256,publicFile:outputPath},null,2));
