import test from 'node:test';
import assert from 'node:assert/strict';
import {kit,token,USDC,MEMO} from './reserve.mjs';
import {POLICY,SPONSOR,SELLER,NETWORK,ENDPOINT,selectOffer,budgetGuard,sources,guardMessage,verifyPayment,decodeHeader} from './resource.mjs';
const offer={scheme:'exact',network:NETWORK,amount:'7000',asset:USDC,payTo:SELLER,maxTimeoutSeconds:60,extra:{feePayer:SPONSOR}};
const challenge={x402Version:2,resource:{url:ENDPOINT},accepts:[offer]};
const b58=i=>kit.getAddressEncoder().encode(kit.address(i));
async function fixture(){
 const owner=await kit.generateKeyPairSigner(true),sponsor=await kit.generateKeyPairSigner(true);
 const offered={...offer,extra:{feePayer:sponsor.address}};
 const [source]=await token.findAssociatedTokenPda({owner:owner.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const [dest]=await token.findAssociatedTokenPda({owner:kit.address(SELLER),mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(20000,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(1n,1);
 const compute=kit.address('ComputeBudget111111111111111111111111111111');
 let m=kit.createTransactionMessage({version:0});m=kit.setTransactionMessageFeePayerSigner(sponsor,m);
 m=kit.setTransactionMessageLifetimeUsingBlockhash({blockhash:kit.blockhash(SPONSOR),lastValidBlockHeight:100n},m);
 m=kit.appendTransactionMessageInstructions([{programAddress:compute,data:limit,accounts:[]},{programAddress:compute,data:price,accounts:[]},
 token.getTransferCheckedInstruction({source,mint:USDC,destination:dest,authority:owner,amount:7000n,decimals:6}),
 {programAddress:MEMO,data:Buffer.from('a'.repeat(32)),accounts:[]}],m);
 const full=await kit.signTransactionMessageWithSigners(m);
 const original={...full,signatures:{...full.signatures,[sponsor.address]:null}};
 // Real Ed25519 signatures on a synthetic chain fixture, not a mainnet payment.
 const compiled=kit.getCompiledTransactionMessageDecoder().decode(full.messageBytes);
 const balances=(address,who,amount)=>({accountIndex:compiled.staticAccounts.indexOf(address),mint:USDC,owner:who,uiTokenAmount:{decimals:6,amount:String(amount)}});
 const row={owner:owner.address,sourceAta:source,destinationAta:dest,offer:offered,payment:{payload:{transaction:kit.getBase64EncodedWireTransaction(original)}}};
 const tx={slot:100,transaction:[kit.getBase64EncodedWireTransaction(full),'base64'],meta:{err:null,fee:10001,
  preBalances:[100000000,0],postBalances:[99989999,0],innerInstructions:[],
  preTokenBalances:[balances(source,owner.address,1000000),balances(dest,SELLER,10000000)],
  postTokenBalances:[balances(source,owner.address,993000),balances(dest,SELLER,10007000)]}};
 return {row,tx,original};
}
test('offer pins exact mint/network/vendor/sponsor/price; ambiguity rejected',()=>{
 assert.equal(selectOffer(challenge).amount,'7000');
 for(const change of [{amount:'7001'},{network:'solana:devnet'},{asset:SPONSOR},{payTo:SPONSOR},{extra:{feePayer:SELLER}},{maxTimeoutSeconds:3600},{extra:{feePayer:SPONSOR,memo:'evil'}}])assert.throws(()=>selectOffer({...challenge,accepts:[{...offer,...change}]}));
 assert.throws(()=>selectOffer({...challenge,accepts:[offer,offer]}));
});
test('floor and cumulative cap are integer money boundaries',()=>{
 budgetGuard(1000000,0);budgetGuard(986000,14000);
 for(const vals of [[976999,0],[1000001,0],[1000000,24000],[1000000,0,30000],[NaN,0],[1.2,0],[-1,0]])assert.throws(()=>budgetGuard(...vals));
});
test('bounded primary source gate rejects external, duplicate, empty and injected URLs',()=>{
 const valid={requestId:'test-id',results:[{url:'https://solana.com/docs',title:'Solana'},{url:'https://exa.ai/docs',title:'Exa'}]};
 assert.equal(sources(valid).sources.length,2);
 for(const bad of [{...valid,results:valid.results.slice(0,1)},{...valid,results:[valid.results[0],valid.results[0]]},{...valid,results:[valid.results[0],{url:'https://evil.example/',title:'x'}]},{...valid,results:[valid.results[0],{url:'https://u:p@exa.ai/',title:'x'}]},{...valid,requestId:1}])assert.throws(()=>sources(bad));
});
test('actual cryptographic wallet signature and exact transfer metadata validated',async()=>{
 const {row,tx,original}=await fixture();guardMessage(original,row.owner,row.sourceAta,row.destinationAta,row.offer);
 const result=verifyPayment(row,tx);assert.equal(result.amountUsdc,7000);assert.equal(result.operatorPurchaseFeeLamports,0);
 const bad=structuredClone(tx);bad.meta.postTokenBalances[0].uiTokenAmount.amount='992999';assert.throws(()=>verifyPayment(row,bad));
 const gas=structuredClone(tx);gas.meta.postBalances[1]=1;assert.throws(()=>verifyPayment(row,gas));
 const failed=structuredClone(tx);failed.meta.err={InstructionError:[2,'fail']};assert.throws(()=>verifyPayment(row,failed));
});
test('signature/message mutation cannot reuse original authorization',async()=>{
 const {row,tx}=await fixture();const decoded=kit.getTransactionDecoder().decode(Buffer.from(tx.transaction[0],'base64'));
 const ownerSig=new Uint8Array(decoded.signatures[row.owner]);ownerSig[0]^=1;
 const changed={...decoded,signatures:{...decoded.signatures,[row.owner]:ownerSig}};
 tx.transaction[0]=kit.getBase64EncodedWireTransaction(changed);assert.throws(()=>verifyPayment(row,tx));
});
test('header decode bounded and JSON only',()=>{
 assert.equal(decodeHeader(Buffer.from(JSON.stringify(challenge)).toString('base64')).x402Version,2);
 for(const s of ['',null,'<html>', 'a'.repeat(50001)])assert.throws(()=>decodeHeader(s));
});
test('pinned real x402 SDK invokes guard before signing its actual partial payment',async()=>{
 const {createServer}=await import('node:http');
 const {ExactSvmScheme}=await import('@x402/svm/exact/client');
 const owner=await kit.generateKeyPairSigner(true);
 const [source]=await token.findAssociatedTokenPda({owner:owner.address,mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 const [destination]=await token.findAssociatedTokenPda({owner:kit.address(SELLER),mint:USDC,tokenProgram:token.TOKEN_PROGRAM_ADDRESS});
 let guarded=0;const calls=[];
 const mint=Buffer.alloc(82);mint[44]=6;mint[45]=1;
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;const d=JSON.parse(body);calls.push(d.method);
  let result;
  if(d.method==='getAccountInfo'){assert.equal(d.params[0],USDC);result={context:{slot:1},value:{data:[mint.toString('base64'),'base64'],owner:token.TOKEN_PROGRAM_ADDRESS,executable:false,lamports:1461600,rentEpoch:0}};}
  else if(d.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:SPONSOR,lastValidBlockHeight:100}};
  else throw Error('Unexpected SDK RPC');
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:d.id,result}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const signer={address:owner.address,signTransactions:async(txs)=>{for(const tx of txs){guardMessage(tx,owner.address,source,destination,offer);guarded++;}return owner.signTransactions(txs);}};
  const payment=await new ExactSvmScheme(signer,{rpcUrl:'http://127.0.0.1:'+server.address().port}).createPaymentPayload(2,offer);
  const tx=kit.getTransactionDecoder().decode(Buffer.from(payment.payload.transaction,'base64'));
  assert.equal(guarded,1);assert.ok(tx.signatures[owner.address]);assert.equal(tx.signatures[SPONSOR],null);
  assert.deepEqual(calls,['getAccountInfo','getLatestBlockhash']);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
