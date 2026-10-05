// Private single-operator canary. Financial commands require an explicit execution flag.
import {existsSync,readFileSync,mkdirSync,chmodSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {getTransferSolInstruction} from '@solana-program/system';
import {kit,token,subscriptions,RPC,GENESIS,PROGRAM,USDC,POLICY,hash,rpc,account,bytes,
 requireMainnet,addresses,setupInstructions,paymentInstructions,revokeInstruction,signedTransaction,
 chainState,programArtifact,guardPolicy,withdrawalInstructions,decodeToken} from './reserve.mjs';
import {budgetPrice} from './budget.mjs';
import {durableJson,driveTransaction} from './settlement.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),state=join(root,'mainnet-state/canary');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
async function signer(name){
 const path=join(state,name+'-key.json');
 if(!existsSync(path))await kit.writeKeyPairSigner(await kit.generateKeyPairSigner(true),path);
 if((statSync(path).mode&0o077)!==0)throw Error('Private key permissions must be0600');
 return kit.createKeyPairSignerFromBytes(Uint8Array.from(read(path)));
}
async function feeQuote(ixs,payer){
 const lifetime=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
 let m=kit.createTransactionMessage({version:0});m=kit.setTransactionMessageFeePayerSigner(payer,m);
 m=kit.setTransactionMessageLifetimeUsingBlockhash({...lifetime,lastValidBlockHeight:BigInt(lifetime.lastValidBlockHeight)},m);
 m=kit.appendTransactionMessageInstructions(ixs,m);
 const encoded=Buffer.from(kit.getCompiledTransactionMessageEncoder().encode(kit.compileTransactionMessage(m))).toString('base64');
 const fee=(await rpc('getFeeForMessage',[encoded,{commitment:'confirmed'}])).value;
 if(!Number.isSafeInteger(fee)||fee<0||fee>POLICY.maxFeeLamports)throw Error('Unavailable/excessive fee quote');
 return {fee,lifetime};
}
async function prepare(owner,worker){
 const artifact=await programArtifact(),svm=read(join(root,'evidence/reserve-svm.json'));
 if(svm.programSha256!==artifact.sha256||svm.passed!==15||svm.failed!==0)throw Error('Reviewed localSVM binary mismatch');
 const price=await budgetPrice();
 const a=await addresses(owner,worker);
 const rents={};for(const size of [106,187,165])rents[size]=await rpc('getMinimumBalanceForRentExemption',[size]);
 const expiry=Math.floor(Date.now()/1000)+POLICY.validSeconds;
 const setup=await setupInstructions(owner,worker,a,expiry);
 setup.push(getTransferSolInstruction({source:owner,destination:worker.address,amount:1_000_000n}));
 const fee=(await feeQuote(setup,owner)).fee;
 // Worker receives0.001SOL from the funded operator, included in the0.008SOL total.
 const setupCeiling=rents[106]+rents[187]+rents[165]+1_000_000+POLICY.maxFeeLamports*8+POLICY.gasFloorLamports;
 if(setupCeiling>POLICY.gasFundingLamports)throw Error('Rent/fee allocation no longer fits funded gas');
 // Sender may pay to create the owner USDC ATA plus two transfer fees. Bound these explicitly.
 const senderLamportAllowance=rents[165]+2*POLICY.maxFeeLamports;
 const costAtMaxPrice=POLICY.reserveUsdc/1e6+(POLICY.gasFundingLamports+senderLamportAllowance)/1e9*POLICY.maxSolPriceUsdc;
 if(costAtMaxPrice>POLICY.budgetUsdc/1e6)throw Error('Budget exceeded');
 const plan={schema:'battery.canary-plan/1',createdAt:new Date().toISOString(),cluster:'mainnet',genesisHash:GENESIS,
  rpc:RPC,program:PROGRAM,mint:USDC,programSha256:artifact.sha256,deploymentSlot:artifact.deploymentSlot,
  upgradeAuthority:artifact.upgradeAuthority,addresses:a,policy:POLICY,rentLamports:rents,setupFeeQuoteLamports:fee,
  senderLamportAllowance,costAtMaxSolPriceUsdc:costAtMaxPrice,price,
  costAtObservedPriceUsdc:POLICY.reserveUsdc/1e6+(POLICY.gasFundingLamports+senderLamportAllowance)/1e9*price.solUsdc,
  boundary:'Dedicated local operator wallet. Fixed1USDC cumulative worker allowance;2USDC floor on3USDC deposit only if no other delegations.0.01USDC per-result transfers are test settlements to our worker, not model-provider billing. Owner can revoke/change/withdraw. No vault/token launch.',
  status:'unfunded-no-mainnet-transactions'};
 const file=join(state,'plan.json');if(existsSync(file)){
  const old=read(file);if(old.addresses.owner!==a.owner||old.addresses.worker!==a.worker||old.programSha256!==plan.programSha256)throw Error('Existing reviewed plan differs; inspect, do not overwrite');
 }else durableJson(file,plan);
 console.log(JSON.stringify(plan,null,2));
}
async function main(){
 if(process.env.BATTERY_CANARY_LOCK!=='1')throw Error('Use python3 chain/canary.py for kernel single-operator lock');
 const [command,...flags]=process.argv.slice(2);
 if(!['prepare','status','setup','run','revoke','return-address','withdraw'].includes(command))throw Error('Commands: prepare | status | setup | run | revoke | return-address WALLET | withdraw');
 if(['setup','run','revoke','withdraw'].includes(command)&&!flags.includes('--execute-budget-5-usdc'))throw Error('Financial command disabled: explicit --execute-budget-5-usdc required after funding');
 mkdirSync(state,{recursive:true,mode:0o700});chmodSync(state,0o700);
 if(command!=='prepare'&&!existsSync(join(state,'plan.json')))throw Error('Prepare and review the canary plan first');
 const owner=await signer('owner'),worker=await signer('worker');
 requireMainnet(await rpc('getGenesisHash'));
 if(command==='prepare')return prepare(owner,worker);
 const plan=read(join(state,'plan.json')),a=await addresses(owner,worker);
 if(JSON.stringify(a)!==JSON.stringify(plan.addresses)||JSON.stringify(POLICY)!==JSON.stringify(plan.policy))throw Error('Plan/key/policy mismatch');
 const artifact=await programArtifact();if(artifact.sha256!==plan.programSha256)throw Error('Program upgraded since localSVM review; stop');
 if(command==='return-address'){
  const destination=kit.address(flags[0]);if([a.owner,a.worker].includes(destination))throw Error('Use original external funding wallet');
  if(plan.returnAddress&&plan.returnAddress!==destination)throw Error('Return address already bound; inspect rather than overwrite');
  plan.returnAddress=destination;durableJson(join(state,'plan.json'),plan);
  console.log(JSON.stringify({returnAddress:destination,mainnetSigning:false}));return;
 }
 if(command==='status'){
  console.log(JSON.stringify({owner:a.owner,worker:a.worker,ownerSolLamports:(await rpc('getBalance',[a.owner])).value,
   sourceExists:!!await account(a.sourceAta),delegationExists:!!await account(a.delegation),mainnetSigning:false},null,2));return;
 }
 if(!flags.includes('--execute-budget-5-usdc'))throw Error('Financial command disabled: explicit --execute-budget-5-usdc required after funding');
 if(['setup','run'].includes(command))await budgetPrice();
 const outboxFile=join(state,'outbox.json'),outbox=existsSync(outboxFile)?read(outboxFile):{};
 const save=()=>durableJson(outboxFile,outbox);
 const execute=async(id,ixs,payer,amountUsdc=0,resultHash=null,withdrawTo=null)=>{
  if(outbox[id]&&(outbox[id].amountUsdc!==amountUsdc||outbox[id].resultHash!==resultHash))throw Error('Existing settlement intent changed');
  if(outbox[id]?.receipt)return outbox[id].receipt;
  for(const [other,row] of Object.entries(outbox))if(other!==id&&!row.receipt)throw Error('Another transaction uncertain; reconcile it first');
  return driveTransaction({id,store:outbox,save,rpc,afterSend:()=>{
   if(id==='research-002'&&flags.includes('--crash-after-send'))process.exit(74);
  },prepare:async()=>{
   const {fee,lifetime}=await feeQuote(ixs,payer);
   const bal=(await rpc('getBalance',[payer.address,{commitment:'confirmed'}])).value;
   if(amountUsdc&&!withdrawTo){const s=await chainState(a);guardPolicy({balanceUsdc:s.reserveUsdc,remainingUsdc:s.remainingUsdc,
    amountUsdc,gasLamports:s.gasLamports,feeLamports:fee});}
   else if(bal-fee<POLICY.gasFloorLamports)throw Error('Owner gas floor denied');
   const tx=await signedTransaction(ixs,payer,{...lifetime,lastValidBlockHeight:BigInt(lifetime.lastValidBlockHeight)});
   const wire=kit.getBase64EncodedWireTransaction(tx);if(Buffer.from(wire,'base64').length>1232)throw Error('Transaction exceeds packet bound');
   const sim=await rpc('simulateTransaction',[wire,{encoding:'base64',sigVerify:true,commitment:'confirmed'}]);
   if(!sim.value||sim.value.err!==null)throw Error('Preflight simulation failed; no broadcast');
   return {signature:kit.getSignatureFromTransaction(tx),wire,lastValidBlockHeight:lifetime.lastValidBlockHeight,
    feeLamports:fee,amountUsdc,resultHash,owner:withdrawTo?payer.address:a.owner,worker:withdrawTo??a.worker,preparedAt:new Date().toISOString()};
  }});
 };
 if(command==='setup'){
  if(!plan.returnAddress)throw Error('Bind original funding wallet with return-address before financial setup');
  if(outbox.setup?.receipt){console.log(JSON.stringify(outbox.setup.receipt));return;}
  if(!outbox.setup){
   const s=await chainState(a),ownerSol=(await rpc('getBalance',[a.owner])).value;
   if(s.reserveUsdc!==POLICY.reserveUsdc||s.receiverUsdc!==0||s.delegation||await account(a.authority)||s.gasLamports!==0)
    throw Error('Only fresh dedicated accounts with exactly3USDC may initialize; unexpected prior authority/balances');
   if(ownerSol<POLICY.gasFundingLamports||ownerSol>POLICY.gasFundingLamports+POLICY.maxFeeLamports)throw Error('Fund exactly0.008SOL for the reviewed canary');
  }
  const expiry=Math.floor(Date.now()/1000)+POLICY.validSeconds;
  const ixs=await setupInstructions(owner,worker,a,expiry);
  ixs.push(getTransferSolInstruction({source:owner,destination:worker.address,amount:1_000_000n}));
  const receipt=await execute('setup',ixs,owner);
  const s=await chainState(a);if(s.remainingUsdc!==POLICY.allowanceUsdc||s.reserveUsdc!==POLICY.reserveUsdc)throw Error('Setup state mismatch');
  console.log(JSON.stringify({receipt,reserveUsdc:s.reserveUsdc,remainingUsdc:s.remainingUsdc}));
 }else if(command==='run'){
  if(!outbox.setup?.receipt)throw Error('Confirmed setup required');
  const reportPath=join(root,'evidence/mainnet-agent.json'),report=read(reportPath);
  if(report.cluster!=='mainnet'||report.experiment?.completedTasks!==3||report.experiment?.duplicateModelCalls!==0)throw Error('Verified owned mainnet researcher report required');
  const results=report.checkpoint.body.results;
  // Validate Python's canonical checkpoint serialization and all evidence relationships.
  execFileSync('python3',[join(root,'verify_evidence.py'),reportPath],{stdio:'pipe'});
  for(let i=0;i<3;i++){
   const job=`research-00${i+1}`,r=results[i];
   if(r?.id!==job||r.output?.input?.observation?.genesisHash!==GENESIS)throw Error('Mainnet research result mismatch');
   const resultHash=hash(Buffer.from(JSON.stringify(r)));
   await execute(job,await paymentInstructions(worker,a,POLICY.jobUsdc,resultHash,job),worker,POLICY.jobUsdc,resultHash);
  }
  const s=await chainState(a),paid=POLICY.jobs*POLICY.jobUsdc;
  if(s.reserveUsdc!==POLICY.reserveUsdc-paid||s.receiverUsdc!==paid||s.remainingUsdc!==POLICY.allowanceUsdc-paid)throw Error('Final exact balances mismatch');
  const proof={schema:'battery.mainnet-canary/1',observedAt:new Date().toISOString(),cluster:'mainnet',genesisHash:GENESIS,
   program:PROGRAM,mint:USDC,programSha256:artifact.sha256,owner:a.owner,worker:a.worker,
   checkpointSha256:report.checkpoint.sha256,receipts:Object.fromEntries(Object.entries(outbox).map(([id,row])=>[id,row.receipt])),
   reserveUsdc:s.reserveUsdc,remainingUsdc:s.remainingUsdc,workerUsdc:s.receiverUsdc,
   boundary:plan.boundary,mainnetTransactions:Object.values(outbox).filter(x=>x.receipt).length};
  durableJson(join(state,'proof.json'),proof);console.log(JSON.stringify(proof,null,2));
 }else if(command==='withdraw'){
  if(!plan.returnAddress)throw Error('Original funding wallet required: return-address WALLET');
  if(await account(a.delegation))throw Error('Revoke the worker allowance first');
  for(const [id,payer,source] of [['return-owner',owner,a.sourceAta],['return-worker',worker,a.receiverAta]]){
   const amount=outbox[id]?.amountUsdc??decodeToken(await account(source),payer.address);
   if(!amount)continue;
   const [destination]=await token.findAssociatedTokenPda({owner:plan.returnAddress,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
   // Keep receipt balance proof unambiguous; original funding wallet has a USDC ATA already.
   if(!await account(destination))throw Error('Return wallet must already have its canonical USDC ATA');
   await execute(id,await withdrawalInstructions(payer,source,plan.returnAddress,amount),payer,amount,hash(Buffer.from(plan.returnAddress)),plan.returnAddress);
  }
  console.log(JSON.stringify({returnedTo:plan.returnAddress,receipts:['return-owner','return-worker'].map(id=>outbox[id]?.receipt),
   note:'Token principal returned. Small SOL and account rent remain operator-owned; no automatic SOL sweep.'}));
 }else if(command==='revoke'){
  if(!outbox.setup?.receipt)throw Error('Confirmed setup required');
  const receipt=await execute('revoke',[revokeInstruction(owner,a)],owner);
  if(await account(a.delegation))throw Error('Delegation remains active');
  console.log(JSON.stringify({receipt,delegationClosed:true,
   remainingFunds:'Operator still owns remaining USDC/SOL; no withdrawal recipient has been authorized'}));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
