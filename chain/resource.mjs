// Direct vendor payment. CLI is gated by paid_resource.py's kernel lock.
import {readFileSync,existsSync,mkdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash,createPublicKey,verify as cryptoVerify} from 'node:crypto';
import {ExactSvmScheme} from '@x402/svm/exact/client';
import {kit,token,RPC,GENESIS,USDC,MEMO,rpc,decodeToken,requireMainnet,signedTransaction} from './reserve.mjs';
import {durableJson,driveTransaction,verifyConfirmation} from './settlement.mjs';
export const ENDPOINT='https://api.exa.ai/search';
export const NETWORK='solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const SELLER='12Ec2cJmfR1C9uwejzxcuMhUgEC7wDrLgm1wBvvR5w9E';
export const SPONSOR='BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP';
export const RETURN='JPqh2zfYGtixYKsz9TddcLXjZq5L7wcDtRQTQg7MuPY';
export const POLICY=Object.freeze({schema:'battery.resource-policy/1',fundingUsdc:1000000,
 floorUsdc:970000,capUsdc:30000,jobUsdc:7000,jobs:3,maxRefundFeeLamports:10000,
 dispatchBefore:'2026-10-12',returnOwner:RETURN,endpoint:ENDPOINT,network:NETWORK,
 mint:USDC,seller:SELLER,sponsor:'provider-advertised-distinct-fee-payer'});
export const TASKS=Object.freeze([
 {id:'source-001',query:'Solana official documentation x402 agent payments exact USDC fee sponsorship'},
 {id:'source-002',query:'x402 official documentation payment settlement verification Solana replay safety'},
 {id:'source-003',query:'Exa official documentation x402 Solana search pricing payment response'}
].map(x=>({...x,request:{query:x.query,type:'auto',numResults:3,
 includeDomains:['solana.com','docs.x402.org','exa.ai']}})));
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const sha=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const root=fileURLToPath(new URL('..',import.meta.url));
const state=join(root,'resource-state','x402-mainnet-v1');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const safeTask=id=>{const t=TASKS.find(x=>x.id===id);if(!t)throw Error('Unknown fixed resource task');return t;};
export function selectOffer(challenge){
 if(challenge?.x402Version!==2||challenge.resource?.url!==ENDPOINT||!Array.isArray(challenge.accepts))throw Error('Invalid resource challenge');
 const choices=challenge.accepts.filter(x=>x.network===NETWORK&&x.scheme==='exact'&&x.asset===USDC);
 if(choices.length!==1)throw Error('Missing/ambiguous exact mainnet USDC offer');
 const o=choices[0];
 let sponsor;try{sponsor=kit.address(o.extra?.feePayer);}catch{throw Error('Invalid sponsor address');}
 if(o.amount!==String(POLICY.jobUsdc)||o.payTo!==SELLER||sponsor===SELLER||sponsor===USDC||
    !Number.isSafeInteger(o.maxTimeoutSeconds)||o.maxTimeoutSeconds<30||o.maxTimeoutSeconds>120||
    o.extra?.memo||o.extra?.blockhash||o.extra?.assetTransferMethod)throw Error('Unreviewed seller, sponsor, price or transaction option');
 return o;
}
export function budgetGuard(balance,spent,held=0){
 if([balance,spent,held].some(x=>!Number.isSafeInteger(x)||x<0)||balance>POLICY.fundingUsdc||
    balance-POLICY.jobUsdc<POLICY.floorUsdc||spent+held+POLICY.jobUsdc>POLICY.capUsdc)
  throw Error('Reserve floor/funding/cumulative cap denied');
}
export function sources(data){
 if(!data||typeof data.requestId!=='string'||data.requestId.length>200||!Array.isArray(data.results)||data.results.length>3)throw Error('Invalid purchased result');
 const seen=new Set(),out=[];
 for(const r of data.results){
  if(typeof r.url!=='string'||r.url.length>2048||typeof r.title!=='string'||!r.title.trim()||r.title.length>500)throw Error('Source fields invalid');
  const u=new URL(r.url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['solana.com','docs.x402.org','exa.ai'].includes(u.hostname)||seen.has(u.href))throw Error('Unapproved or duplicate source');
  seen.add(u.href);out.push({url:u.href,title:r.title.trim()});
 }
 if(out.length<2)throw Error('Insufficient primary sources; paid result rejected');
 return {requestId:data.requestId,sources:out,gate:'primary-links-only; page claims not adjudicated'};
}
export function decodeHeader(text){
 if(typeof text!=='string'||text.length>50000||!text.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(text))throw Error('Invalid bounded payment header');
 return JSON.parse(Buffer.from(text,'base64').toString('utf8'));
}
async function http(request,payment){
 const res=await fetch(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
  headers:{'content-type':'application/json',...(payment?{'PAYMENT-SIGNATURE':Buffer.from(canonical(payment)).toString('base64')}: {})},body:canonical(request)});
 const reader=res.body.getReader();let size=0;const chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('Provider body exceeds bound');}chunks.push(value);}
 return {status:res.status,observedAt:new Date().toISOString(),
  paymentRequired:res.headers.get('PAYMENT-REQUIRED'),paymentResponse:res.headers.get('PAYMENT-RESPONSE'),
  body:Buffer.concat(chunks).toString('utf8')};
}
export function guardMessage(tx,owner,source,destination,offer){
 const m=kit.getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
 if(m.version!==0||m.addressTableLookups?.length||m.header.numSignerAccounts!==2||m.staticAccounts[0]!==offer.extra.feePayer||offer.extra.feePayer===owner||m.staticAccounts[1]!==owner||
    m.instructions.length!==4)throw Error('Unreviewed transaction layout');
 const programs=m.instructions.map(i=>m.staticAccounts[i.programAddressIndex]);
 if(canonical(programs)!==canonical(['ComputeBudget111111111111111111111111111111','ComputeBudget111111111111111111111111111111',token.TOKEN_PROGRAM_ADDRESS,MEMO]))throw Error('Unexpected payment instructions');
 const [limit,price,transfer,memo]=m.instructions.map(i=>Buffer.from(i.data));
 if(limit.length!==5||limit[0]!==2||limit.readUInt32LE(1)!==20000||price.length!==9||price[0]!==3||price.readBigUInt64LE(1)!==1n||
    transfer.length!==10||transfer[0]!==12||transfer.readBigUInt64LE(1)!==BigInt(offer.amount)||transfer[9]!==6||
    !/^[a-f0-9]{32}$/.test(memo.toString()))throw Error('Unexpected transfer/compute/memo data');
 const keys=Array.from(m.instructions[2].accountIndices,i=>m.staticAccounts[i]);
 if(canonical(keys)!==canonical([source,USDC,destination,owner])||m.instructions[0].accountIndices?.length||
    m.instructions[1].accountIndices?.length||m.instructions[3].accountIndices?.length)throw Error('Transfer account mismatch');
 return m;
}
export function verifyPayment(row,tx){
 if(!tx?.meta||tx.meta.err||!Number.isSafeInteger(tx.slot)||!Number.isSafeInteger(tx.meta.fee)||tx.meta.fee<0||tx.meta.fee>20000||tx.meta.innerInstructions?.some(x=>x.instructions.length))throw Error('Invalid finalized settlement');
 const original=kit.getTransactionDecoder().decode(Buffer.from(row.payment.payload.transaction,'base64'));
 const full=kit.getTransactionDecoder().decode(Buffer.from(tx.transaction?.[0]??'','base64'));
 guardMessage(full,row.owner,row.sourceAta,row.destinationAta,row.offer);
 if(tx.transaction[1]!=='base64'||!Buffer.from(original.messageBytes).equals(Buffer.from(full.messageBytes))||
    !Buffer.from(original.signatures[row.owner]??[]).equals(Buffer.from(full.signatures[row.owner]??[]))||
    !kit.isFullySignedTransaction(full))throw Error('Finalized message/signature mismatch');
 for(const signer of [row.owner,row.offer.extra.feePayer]){
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(kit.getAddressEncoder().encode(signer))]),format:'der',type:'spki'});
  if(!cryptoVerify(null,Buffer.from(full.messageBytes),publicKey,Buffer.from(full.signatures[signer])))throw Error('Wallet/sponsor signature invalid');
 }
 const balances=(list,ata)=>list?.filter(x=>x.accountIndex===kit.getCompiledTransactionMessageDecoder().decode(full.messageBytes).staticAccounts.indexOf(ata)&&x.mint===USDC&&x.uiTokenAmount?.decimals===6);
 const [a,b,c,d]=[balances(tx.meta.preTokenBalances,row.sourceAta),balances(tx.meta.postTokenBalances,row.sourceAta),balances(tx.meta.preTokenBalances,row.destinationAta),balances(tx.meta.postTokenBalances,row.destinationAta)];
 if([a,b,c,d].some(x=>x?.length!==1)||a[0].owner!==row.owner||b[0].owner!==row.owner||c[0].owner!==SELLER||d[0].owner!==SELLER||
    BigInt(a[0].uiTokenAmount.amount)-BigInt(b[0].uiTokenAmount.amount)!==BigInt(row.offer.amount)||
    BigInt(d[0].uiTokenAmount.amount)-BigInt(c[0].uiTokenAmount.amount)!==BigInt(row.offer.amount)||
    tx.meta.postBalances[1]!==tx.meta.preBalances[1])throw Error('Exact USDC/gas-sponsor delta mismatch');
 return {signature:kit.getSignatureFromTransaction(full),slot:tx.slot,amountUsdc:Number(row.offer.amount),
  networkFeeLamports:tx.meta.fee,operatorPurchaseFeeLamports:0,payer:row.offer.extra.feePayer,
  beforeUsdc:Number(a[0].uiTokenAmount.amount),afterUsdc:Number(b[0].uiTokenAmount.amount),wireSha256:createHash('sha256').update(Buffer.from(tx.transaction[0],'base64')).digest('hex')};
}
async function context(){
 requireMainnet(await rpc('getGenesisHash'));
 const path=join(state,'wallet-key.json');
 if(statSync(path).mode&0o077)throw Error('Private wallet must be mode0600');
 const owner=await kit.createKeyPairSignerFromBytes(Uint8Array.from(read(path)));
 const plan=read(join(state,'plan.json'));
 if(plan.owner!==owner.address||canonical(plan.policy)!==canonical(POLICY)||canonical(plan.tasks)!==canonical(TASKS))throw Error('Immutable plan/key/policy mismatch');
 const [sourceAta]=await token.findAssociatedTokenPda({owner:owner.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const [destinationAta]=await token.findAssociatedTokenPda({owner:kit.address(SELLER),mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const accounts=(await rpc('getMultipleAccounts',[[sourceAta,destinationAta,owner.address],{encoding:'base64',commitment:'finalized'}])).value;
 const balance=accounts[0]?decodeToken(accounts[0],owner.address):0;
 decodeToken(accounts[1],SELLER);
 if(accounts[0]&&Buffer.from(accounts[0].data[0],'base64').readUInt32LE(72)!==0)throw Error('Unexpected reserve delegation');
 return {owner,plan,sourceAta,destinationAta,balance,solLamports:accounts[2]?.lamports??0};
}
function rowPath(id){safeTask(id);return join(state,id+'.json');}
function loadRow(id){const p=rowPath(id);if(!existsSync(p))return null;const r=read(p);
 if(r.requestHash!==sha(safeTask(id).request)||canonical(r.request)!==canonical(safeTask(id).request)||r.offer&&canonical(r.offer)!==canonical(selectOffer(r.challenge))||
    r.payment&&sha(r.payment)!==r.paymentHash||r.response&&sha(r.response)!==r.responseHash)throw Error('Payment journal integrity mismatch');return r;}
export async function main(args=process.argv.slice(2)){
 if(process.env.BATTERY_RESOURCE_LOCK!=='1')throw Error('Use paid_resource.py for single-operator exclusion');
 const [command,id,...flags]=args;
 if(['authorize','dispatch','refund'].includes(command)&&!flags.includes('--approve-max-0.03-usdc'))throw Error('New resource spending requires explicit approval');
 mkdirSync(state,{recursive:true,mode:0o700});
 if(statSync(state).mode&0o077)throw Error('Resource state must be private0700');
 if(command==='init'){
  const p=join(state,'wallet-key.json');if(!existsSync(p))await kit.writeKeyPairSigner(await kit.generateKeyPairSigner(true),p);
  const owner=await kit.createKeyPairSignerFromBytes(Uint8Array.from(read(p)));
  if(!existsSync(join(state,'plan.json')))durableJson(join(state,'plan.json'),{schema:'battery.resource-plan/1',owner:owner.address,policy:POLICY,tasks:TASKS,createdAt:new Date().toISOString()});
  const plan=read(join(state,'plan.json'));if(plan.owner!==owner.address||canonical(plan.policy)!==canonical(POLICY)||canonical(plan.tasks)!==canonical(TASKS))throw Error('Retained immutable plan mismatch');
  return {owner:owner.address,returnOwner:RETURN,policy:POLICY,signing:false};
 }
 if(command==='status'){const c=await context();return {owner:c.owner.address,balanceUsdc:c.balance,solLamports:c.solLamports,policy:POLICY,signing:false};}
 if(command==='probe'){
  const task=safeTask(id),r=await http(task.request);
  if(r.status!==402)throw Error('Expected unpaid402 discovery');
  const challenge=decodeHeader(r.paymentRequired),offer=selectOffer(challenge);
  const result={schema:'battery.resource-quote/1',observedAt:r.observedAt,job:id,requestHash:sha(task.request),challenge,offer,signing:false};
  durableJson(join(state,id+'-quote.json'),result);return result;
 }
 if(command==='authorize'){
  const existing=loadRow(id);if(existing)return {state:existing.status,paymentHash:existing.paymentHash,existing:true};
  if(new Date().toISOString().slice(0,10)>=POLICY.dispatchBefore)throw Error('Price review expired');
  const c=await context(),task=safeTask(id);
  const previous=TASKS.slice(0,TASKS.indexOf(task)).map(t=>loadRow(t.id));
  if(previous.some(r=>r?.status!=='complete'||r?.result?.sources.length<2))throw Error('Previous purchase must finalize and pass result gate');
  budgetGuard(c.balance,previous.reduce((n,r)=>n+r.confirmation.amountUsdc,0));
  const quoted=await http(task.request);if(quoted.status!==402)throw Error('Expected fresh unpaid402');
  durableJson(join(state,id+'-quote-candidate.json'),quoted);
  const challenge=decodeHeader(quoted.paymentRequired),offer=selectOffer(challenge);
  const sponsorAccount=(await rpc('getAccountInfo',[offer.extra.feePayer,{encoding:'base64',commitment:'finalized'}])).value;
  if(offer.extra.feePayer===c.owner.address||[c.sourceAta,c.destinationAta].includes(offer.extra.feePayer)||!sponsorAccount||sponsorAccount.executable||sponsorAccount.owner!=='11111111111111111111111111111111'||sponsorAccount.lamports<20000)throw Error('Unfunded/invalid/non-isolated sponsor');
  const guardedSigner={address:c.owner.address,signTransactions:async(txs)=>{
   for(const tx of txs)guardMessage(tx,c.owner.address,c.sourceAta,c.destinationAta,offer);
   return c.owner.signTransactions(txs);
  }};
  const partial=await new ExactSvmScheme(guardedSigner,{rpcUrl:RPC}).createPaymentPayload(2,offer);
  const payment={...partial,resource:challenge.resource,accepted:offer};
  const row={schema:'battery.resource-outbox/1',job:id,request:task.request,requestHash:sha(task.request),
   owner:c.owner.address,sourceAta:c.sourceAta,destinationAta:c.destinationAta,challenge,offer,
   payment,paymentHash:sha(payment),authorizedAt:new Date().toISOString(),status:'authorized'};
  durableJson(rowPath(id),row);return {state:row.status,paymentHash:row.paymentHash};
 }
 if(command==='dispatch'){
  const row=loadRow(id);if(!row)throw Error('No durable authorization');
  if(row.status!=='authorized')return {state:row.status,receiptSaved:!!row.response,repeatPurchase:false};
  if(Date.now()-Date.parse(row.authorizedAt)>30000||new Date().toISOString().slice(0,10)>=POLICY.dispatchBefore)throw Error('Authorization expired; retain state without signing replacement');
  const c=await context(),previous=TASKS.slice(0,TASKS.findIndex(t=>t.id===id)).map(t=>loadRow(t.id));
  if(row.owner!==c.owner.address||row.sourceAta!==c.sourceAta||row.destinationAta!==c.destinationAta||canonical(row.payment.accepted)!==canonical(row.offer)||row.payment.resource?.url!==ENDPOINT||previous.some(r=>r?.status!=='complete'))throw Error('Owner/previous result mismatch');
  budgetGuard(c.balance,previous.reduce((n,r)=>n+r.confirmation.amountUsdc,0));
  guardMessage(kit.getTransactionDecoder().decode(Buffer.from(row.payment.payload.transaction,'base64')),row.owner,row.sourceAta,row.destinationAta,row.offer);
  row.status='dispatching';row.dispatchedAt=new Date().toISOString();durableJson(rowPath(id),row);
  const response=await http(row.request,row.payment);
  row.response=response;row.responseHash=sha(response);row.status='response_saved';durableJson(rowPath(id),row);
  if(flags.includes('--crash-after-receipt'))process.exit(76);
  return {state:row.status,receiptSaved:true,repeatPurchase:false};
 }
 if(command==='job-status'){const r=loadRow(id);return {state:r?.status??'absent',receiptSaved:!!r?.response,paymentHash:r?.paymentHash};}
 if(command==='verify'){
  const row=loadRow(id);if(!row?.response)throw Error('Paid response absent; unknown outcome held, no retry');
  if(['complete','paid_result_rejected'].includes(row.status))return {state:row.status,confirmation:row.confirmation,result:row.result,responseHash:row.responseHash};
  const settlement=decodeHeader(row.response.paymentResponse);
  if(settlement.success!==true||settlement.network!==NETWORK||!/^([1-9A-HJ-NP-Za-km-z]{64,88})$/.test(settlement.transaction)||
     settlement.payer&&settlement.payer!==row.owner)throw Error('Provider settlement absent/failed; retain paid hold');
  requireMainnet(await rpc('getGenesisHash'));
  let tx;for(let attempt=0;attempt<8;attempt++){tx=await rpc('getTransaction',[settlement.transaction,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(tx)break;await new Promise(resolve=>setTimeout(resolve,2000));}
  if(!tx)throw Error('Awaiting mainnet finality; retain receipt without another purchase');
  row.confirmation=verifyPayment(row,tx);
  if(row.confirmation.signature!==settlement.transaction)throw Error('Settlement signature mismatch');
  row.chain=tx;row.status='paid';durableJson(rowPath(id),row);
  try{if(row.response.status!==200)throw Error('HTTP resource failed');row.result=sources(JSON.parse(row.response.body));row.resultHash=sha(row.result);row.status='complete';}
  catch{row.status='paid_result_rejected';row.result=null;}
  row.completedAt=new Date().toISOString();durableJson(rowPath(id),row);
  return {state:row.status,confirmation:row.confirmation,result:row.result,responseHash:row.responseHash};
 }
 if(command==='refund'){
  const rows=TASKS.map(t=>loadRow(t.id));
  if(rows.some(r=>r&&!['complete','paid_result_rejected'].includes(r.status)))throw Error('Unknown/unfinished payment prevents refund; inspect retained state');
  const c=await context(),path=join(state,'refund.json'),outbox=existsSync(path)?read(path):{};
  const receipt=await driveTransaction({id:'return-principal',store:outbox,save:()=>durableJson(path,outbox),rpc,
   prepare:async()=>{
    const amount=POLICY.fundingUsdc-rows.reduce((n,r)=>n+(r?.confirmation?.amountUsdc??0),0);
    if(c.balance!==amount||amount<1||c.solLamports<15000)throw Error('Refund requires exact remaining principal and funded fee');
    const [destination]=await token.findAssociatedTokenPda({owner:kit.address(RETURN),mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
    const info=(await rpc('getAccountInfo',[destination,{encoding:'base64',commitment:'finalized'}])).value;
    decodeToken(info,RETURN); // No rent-spending surprise: destination ATA must already exist.
    const ix=token.getTransferCheckedInstruction({source:c.sourceAta,mint:USDC,destination,authority:c.owner,amount:BigInt(amount),decimals:6});
    const lifetime=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
    const tx=await signedTransaction([ix],c.owner,{...lifetime,lastValidBlockHeight:BigInt(lifetime.lastValidBlockHeight)});
    const fee=(await rpc('getFeeForMessage',[Buffer.from(tx.messageBytes).toString('base64'),{commitment:'confirmed'}])).value;
    if(!Number.isSafeInteger(fee)||fee<0||fee>POLICY.maxRefundFeeLamports||c.solLamports<fee)throw Error('Refund fee exceeds approved bound');
    return {wire:kit.getBase64EncodedWireTransaction(tx),signature:kit.getSignatureFromTransaction(tx),
     lastValidBlockHeight:lifetime.lastValidBlockHeight,feeLamports:fee,amountUsdc:amount,owner:c.owner.address,worker:RETURN};
   }});
  return {state:'refunded',receipt,retainedSolLamports:(await rpc('getBalance',[c.owner.address,{commitment:'finalized'}])).value,
   boundary:'Remaining SOL and source ATA rent remain operator-owned; no automatic sweep/closure'};
 }
 if(command==='verify-refund'){
  const row=read(join(state,'refund.json'))['return-principal'];
  if(!row?.receipt)throw Error('Refund not finalized');
  const tx=await rpc('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  const receipt=verifyConfirmation(row,tx);if(canonical(receipt)!==canonical(row.receipt))throw Error('Refund receipt differs');
  return {receipt,chain:tx,row};
 }
 if(command==='export'){
  const rows=TASKS.map(t=>loadRow(t.id));
  if(rows.some(r=>r?.status!=='complete'))throw Error('Incomplete paid run cannot be exported as completed');
  return {schema:'battery.resource-proof/1',policy:POLICY,owner:rows[0].owner,tasks:rows.map(r=>({job:r.job,request:r.request,requestHash:r.requestHash,
   offer:r.offer,owner:r.owner,sourceAta:r.sourceAta,destinationAta:r.destinationAta,payment:r.payment,paymentHash:r.paymentHash,
   response:r.response,responseHash:r.responseHash,confirmation:r.confirmation,result:r.result,resultHash:r.resultHash,chain:r.chain,
   authorizedAt:r.authorizedAt,dispatchedAt:r.dispatchedAt,completedAt:r.completedAt})),scope:'direct paid primary-source search; trusted local operator; no hosted multiuser service'};
 }
 throw Error('Unsupported resource command');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Resource operation held; retained journal; inspect policy, funding and receipt. No automatic purchase retry.');process.exitCode=2;});
