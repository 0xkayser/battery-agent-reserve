// Executes the downloaded mainnet ELF locally with explicitly fabricated token balances.
import {LiteSVM,FailedTransactionMetadata} from 'litesvm';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {kit,token,subscriptions,USDC,PROGRAM,POLICY,addresses,setupInstructions,paymentInstructions,
 revokeInstruction,signedTransaction,programArtifact,hash,withdrawalInstructions} from './reserve.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),rows=[];
const svm=new LiteSVM();
const artifact=await programArtifact();
mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('artifacts/subscriptions-mainnet.so',import.meta.url),artifact.elf);
svm.addProgram(PROGRAM,artifact.elf);
const owner=await kit.generateKeyPairSigner(),worker=await kit.generateKeyPairSigner(),stranger=await kit.generateKeyPairSigner();
for(const s of [owner,worker,stranger])svm.airdrop(s.address,1_000_000_000n);
const a=await addresses(owner,worker),encoder=kit.getAddressEncoder();
function tokenData(own,amount){
 const b=new Uint8Array(165);b.set(encoder.encode(USDC),0);b.set(encoder.encode(own),32);
 new DataView(b.buffer).setBigUint64(64,BigInt(amount),true);b[108]=1;return b;
}
function fixture(address,data){svm.setAccount({address,programAddress:token.TOKEN_PROGRAM_ADDRESS,
 lamports:svm.minimumBalanceForRentExemption(BigInt(data.length)),data,executable:false});}
const mint=new Uint8Array(82);mint[44]=6;mint[45]=1;fixture(USDC,mint);
fixture(a.sourceAta,tokenData(owner.address,POLICY.reserveUsdc));
const raw=x=>new Uint8Array(svm.getAccount(x).data);
const balance=x=>new DataView(raw(x).buffer).getBigUint64(64,true);
const allowance=()=>subscriptions.getFixedDelegationDecoder().decode(raw(a.delegation)).amount;
function balances(){return {source:balance(a.sourceAta),receiver:balance(a.receiverAta),remaining:allowance()};}
async function send(ixs,payer,expected,label){
 const tx=await signedTransaction(ixs,payer,{blockhash:svm.latestBlockhash(),lastValidBlockHeight:1_000_000_000n});
 const r=svm.sendTransaction(tx);svm.expireBlockhash();const ok=!(r instanceof FailedTransactionMetadata);
 if(ok!==expected)throw Error(label+' '+JSON.stringify(ok?r.logs():{error:String(r.err()),logs:r.meta().logs()}));
 rows.push({name:label,expectedSuccess:expected,actualSuccess:ok,passed:true,
  computeUnits:Number((ok?r:r.meta()).computeUnitsConsumed())});return tx;
}
const before=svm.getClock();before.unixTimestamp=2_000_000_000n;svm.setClock(before);
await send(await setupInstructions(owner,worker,a,Number(before.unixTimestamp)+86400),owner,true,'Owner creates fixed1USDC delegated cap and receiver ATA');
assert.equal(allowance(),1_000_000n);
const zeroHash='a'.repeat(64);
const first=await send(await paymentInstructions(worker,a,10_000,zeroHash,'research-001'),worker,true,'Worker transfers0.01fixtureUSDC with result hash memo');
assert.deepEqual(balances(),{source:2_990_000n,receiver:10_000n,remaining:990_000n});
const same=svm.sendTransaction(first);assert(same instanceof FailedTransactionMetadata,'duplicate same signed transaction must not execute');
assert.deepEqual(balances(),{source:2_990_000n,receiver:10_000n,remaining:990_000n});
rows.push({name:'Replay of identical signed transaction does not debit twice',passed:true,expectedSuccess:false,actualSuccess:false});
const snapshot=balances();
await send(await paymentInstructions(stranger,a,10_000,zeroHash,'research-002'),stranger,false,'Unapproved signer cannot pull from delegation');
assert.deepEqual(balances(),snapshot);
await send(await paymentInstructions(worker,a,1_000_000,zeroHash,'research-002'),worker,false,'One unit above remaining cap rejects transfer atomically');
assert.deepEqual(balances(),snapshot);
await send(await paymentInstructions(worker,a,990_000,zeroHash,'research-002'),worker,true,'Maximum original allowance exhausted leaves2fixtureUSDC protected from worker');
assert.deepEqual(balances(),{source:2_000_000n,receiver:1_000_000n,remaining:0n});
await send(await paymentInstructions(worker,a,1,zeroHash,'research-003'),worker,false,'Exhausted allowance rejects even one base unit');
assert.deepEqual(balances(),{source:2_000_000n,receiver:1_000_000n,remaining:0n});
await send([revokeInstruction(stranger,a)],stranger,false,'Other signer cannot revoke owner delegation');
await send([revokeInstruction(owner,a)],owner,true,'Owner revokes allowance and recovers delegation rent');
assert.equal(svm.getAccount(a.delegation).exists,false);
await send(await paymentInstructions(worker,a,1,zeroHash,'research-003'),worker,false,'Revoked allowance no longer permits transfer');
// Recreate same fixed PDA on the preserved authority, binding to the exact init generation.
const sa=subscriptions.getSubscriptionAuthorityDecoder().decode(raw(a.authority));
await send((await setupInstructions(owner,worker,a,Number(before.unixTimestamp)+10,sa)),owner,true,'Owner authorizes a short-lived replacement after revocation');
const clock=svm.getClock();clock.unixTimestamp=before.unixTimestamp+11n;svm.setClock(clock);
const expired=balances();
await send(await paymentInstructions(worker,a,1,zeroHash,'research-003'),worker,false,'Expired allowance rejects a transfer');
assert.deepEqual(balances(),expired);
await send([revokeInstruction(owner,a)],owner,true,'Owner revokes expired replacement before returning funds');
await send(await withdrawalInstructions(owner,a.sourceAta,stranger.address,2_000_000),owner,true,'Owner returns protected fixtureUSDC to configured original operator');
await send(await withdrawalInstructions(worker,a.receiverAta,stranger.address,1_000_000),worker,true,'Worker returns test settlements to configured original operator');
const [returnAta]=await token.findAssociatedTokenPda({owner:stranger.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
assert.equal(balance(returnAta),3_000_000n);assert.equal(balance(a.sourceAta),0n);assert.equal(balance(a.receiverAta),0n);
const result={schema:'battery.reserve-svm/1',observedAt:new Date().toISOString(),
 scope:'Actual downloaded mainnet program executed in local LiteSVM. FixtureUSDC, fixtureSOL; zero mainnet broadcasts.',
 program:PROGRAM,programData:artifact.programData,programSha256:artifact.sha256,
 deploymentSlot:artifact.deploymentSlot,upgradeAuthority:artifact.upgradeAuthority,
 passed:rows.length,failed:0,mainnetTransactions:0,fixtureBalances:true,
 boundary:'Chain enforces delegate identity, cumulative allowance, expiry and revoke. Job/day/floor checks outside this allowance remain trusted-runtime checks; owner can change authorization or withdraw funds.',rows};
writeFileSync(root+'/evidence/reserve-svm.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:rows.length,mainnetTransactions:0,programSha256:hash(artifact.elf)}));
