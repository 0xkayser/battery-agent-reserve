// Bounded mainnet canary. Default imports/tests never sign or broadcast.
import * as kit from '@solana/kit';
import * as token from '@solana-program/token';
import * as subscriptions from '@solana/subscriptions';
import {createHash} from 'node:crypto';
export {kit, token, subscriptions};
export const RPC='https://api.mainnet-beta.solana.com';
export const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const PROGRAM=kit.address('De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44');
export const USDC=kit.address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const MEMO=kit.address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const LOADER=kit.address('BPFLoaderUpgradeab1e11111111111111111111111');
export const POLICY=Object.freeze({budgetUsdc:5_000_000,reserveUsdc:3_000_000,
  allowanceUsdc:1_000_000,floorUsdc:2_000_000,jobUsdc:10_000,jobs:3,
  gasFundingLamports:8_000_000,gasFloorLamports:100_000,maxFeeLamports:20_000,
  maxSolPriceUsdc:200,validSeconds:86400});
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function excessRefundAmount({reserveUsdc,receiverUsdc,gasLamports,delegation,authority}){
 if(!Number.isSafeInteger(reserveUsdc)||reserveUsdc<=POLICY.reserveUsdc||reserveUsdc>POLICY.budgetUsdc||
    receiverUsdc!==0||gasLamports!==0||delegation||authority)throw Error('Excess refund requires fresh dedicated accounts and bounded excess');
 return reserveUsdc-POLICY.reserveUsdc;
}
let lastRpcAt=0;
export async function rpc(method,params=[]){
 // Public RPC rate limits are not evidence of transaction failure. Pace calls;
 // retry only read requests after an explicit429. Signed sends stay in the outbox.
 const readOnly=/^get/.test(method);
 let r;
 for(let attempt=0;attempt<4;attempt++){
  const delay=Math.max(0,1000-(Date.now()-lastRpcAt));
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  lastRpcAt=Date.now();
  r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
  if(r.status!==429||!readOnly||attempt===3)break;
  await r.text();await new Promise(resolve=>setTimeout(resolve,2000*2**attempt));
 }
 if(!r.ok)throw Error(`Mainnet RPC HTTP ${r.status}`);
 const text=await r.text();if(text.length>4_000_000)throw Error('RPC response too large');
 const d=JSON.parse(text);if(d.error)throw Error(`${method}: RPC ${d.error.code}`);return d.result;
}
export async function account(address){
 return (await rpc('getAccountInfo',[kit.address(address),{encoding:'base64',commitment:'confirmed'}])).value;
}
export function bytes(a){return a?Buffer.from(a.data[0],'base64'):null;}
export function requireMainnet(genesis){if(genesis!==GENESIS)throw Error('Mainnet genesis mismatch');}
export function guardPolicy({balanceUsdc,remainingUsdc,amountUsdc,gasLamports,feeLamports}){
 for(const n of [balanceUsdc,remainingUsdc,amountUsdc,gasLamports,feeLamports])
  if(!Number.isSafeInteger(n)||n<0)throw Error('Integer base units required');
 if(amountUsdc<1||amountUsdc>POLICY.jobUsdc||remainingUsdc<amountUsdc||balanceUsdc-amountUsdc<POLICY.floorUsdc)
  throw Error('USDC floor/job/allowance denied');
 if(feeLamports>POLICY.maxFeeLamports||gasLamports-feeLamports<POLICY.gasFloorLamports)
  throw Error('Gas fee/floor denied');
}
export async function addresses(owner,worker,nonce=1n){
 const [sourceAta]=await token.findAssociatedTokenPda({owner:owner.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const [receiverAta]=await token.findAssociatedTokenPda({owner:worker.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const [authority]=await subscriptions.findSubscriptionAuthorityPda({user:owner.address,tokenMint:USDC});
 const [delegation]=await subscriptions.findFixedDelegationPda({subscriptionAuthority:authority,
  delegator:owner.address,delegatee:worker.address,nonce});
 return {owner:owner.address,worker:worker.address,sourceAta,receiverAta,authority,delegation,nonce:nonce.toString()};
}
export async function setupInstructions(owner,worker,a,expiryTs,existingAuthority=null){
 const createReceiver=await token.getCreateAssociatedTokenIdempotentInstructionAsync({payer:owner,
  owner:worker.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const ixs=[createReceiver];
 if(!existingAuthority)ixs.push(await subscriptions.getInitSubscriptionAuthorityOverlayInstructionAsync({owner,
  tokenMint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS,userAta:a.sourceAta}));
 const expectedSubscriptionAuthorityInitId=existingAuthority?.initId??subscriptions.UNKNOWN_INIT_ID;
 ixs.push(await subscriptions.getCreateFixedDelegationOverlayInstructionAsync({delegator:owner,
  delegatee:worker.address,tokenMint:USDC,nonce:BigInt(a.nonce),amount:BigInt(POLICY.allowanceUsdc),
  expiryTs:BigInt(expiryTs),expectedSubscriptionAuthorityInitId}));
 return ixs;
}
export async function paymentInstructions(worker,a,amount,checkpointHash,job){
 if(!/^[a-f0-9]{64}$/.test(checkpointHash)||!/^research-00[123]$/.test(job))throw Error('Bounded result/job required');
 const transfer=await subscriptions.getTransferFixedOverlayInstructionAsync({delegatee:worker,
  delegationPda:a.delegation,delegator:a.owner,delegatorAta:a.sourceAta,receiverAta:a.receiverAta,
  tokenMint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS,amount:BigInt(amount)});
 const data=Buffer.from(`BATTERY:v1:${job}:${checkpointHash}`);
 const memo={programAddress:MEMO,accounts:[{address:worker.address,role:2,signer:worker}],data};
 return [transfer,memo];
}
export const revokeInstruction=(owner,a)=>subscriptions.getRevokeDelegationOverlayInstruction({
 authority:owner,delegationAccount:a.delegation,receiver:owner.address});
export async function signedTransaction(ixs,payer,lifetime){
 let message=kit.createTransactionMessage({version:0});
 message=kit.setTransactionMessageFeePayerSigner(payer,message);
 message=kit.setTransactionMessageLifetimeUsingBlockhash(lifetime,message);
 message=kit.appendTransactionMessageInstructions(ixs,message);
 return kit.signTransactionMessageWithSigners(message);
}
export function decodeToken(a,owner){
 if(!a||a.owner!==token.TOKEN_PROGRAM_ADDRESS)throw Error('SPL account missing/wrong program');
 const b=bytes(a);if(b.length!==165)throw Error('Legacy SPL token account required');
 const d=kit.getAddressDecoder();
 if(d.decode(b.subarray(0,32))!==USDC||d.decode(b.subarray(32,64))!==owner||b[108]!==1)
  throw Error('USDC account owner/mint/state mismatch');
 const amount=b.readBigUInt64LE(64);if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsafe token balance');
 return Number(amount);
}
export function decodeDelegation(a,expected){
 if(!a||a.owner!==PROGRAM)throw Error('Delegation missing/wrong program');
 const d=subscriptions.getFixedDelegationDecoder().decode(bytes(a));
 if(d.mint!==USDC||d.subscriptionAuthority!==expected.authority||d.header.delegator!==expected.owner||d.header.delegatee!==expected.worker)
  throw Error('Delegation identity mismatch');
 if(d.amount>BigInt(POLICY.allowanceUsdc))throw Error('Unexpected allowance increase');
 return d;
}
export async function chainState(a){
 const rows=await rpc('getMultipleAccounts',[[a.sourceAta,a.receiverAta,a.delegation,a.worker],{encoding:'base64',commitment:'confirmed'}]);
 const [source,receiver,delegation,worker]=rows.value;
 return {reserveUsdc:decodeToken(source,a.owner),receiverUsdc:receiver?decodeToken(receiver,a.worker):0,
  remainingUsdc:delegation?Number(decodeDelegation(delegation,a).amount):null,
  gasLamports:worker?.lamports??0,delegation};
}
export async function programArtifact(){
 requireMainnet(await rpc('getGenesisHash'));
 const p=await account(PROGRAM);if(!p?.executable||p.owner!==LOADER)throw Error('Program not executable');
 const raw=bytes(p);if(raw.length!==36||raw.readUInt32LE(0)!==2)throw Error('Unknown program loader layout');
 const programData=kit.getAddressDecoder().decode(raw.subarray(4,36));
 const d=await account(programData),rawData=bytes(d);
 if(!d||d.owner!==p.owner||rawData.readUInt32LE(0)!==3||rawData.subarray(45,49).toString('hex')!=='7f454c46')throw Error('Invalid ProgramData ELF');
 const elf=rawData.subarray(45);
 const mint=await account(USDC),mintBytes=bytes(mint);
 if(!mint||mint.owner!==token.TOKEN_PROGRAM_ADDRESS||mintBytes.length!==82||mintBytes[44]!==6||mintBytes[45]!==1)
  throw Error('Canonical USDC mint validation failed');
 return {elf,programData,sha256:hash(elf),deploymentSlot:rawData.readBigUInt64LE(4).toString(),
  upgradeAuthority:rawData[12]===1?kit.getAddressDecoder().decode(rawData.subarray(13,45)):null};
}
export async function withdrawalInstructions(signer,sourceAta,returnOwner,amount){
 kit.address(returnOwner);
 if(returnOwner===signer.address||!Number.isSafeInteger(amount)||amount<1||amount>POLICY.reserveUsdc)throw Error('Bounded withdrawal to distinct owner required');
 const [destination]=await token.findAssociatedTokenPda({owner:returnOwner,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 return [await token.getCreateAssociatedTokenIdempotentInstructionAsync({payer:signer,owner:returnOwner,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS}),
  token.getRevokeInstruction({source:sourceAta,owner:signer}),
  token.getTransferCheckedInstruction({source:sourceAta,mint:USDC,destination,authority:signer,amount:BigInt(amount),decimals:6})];
}
