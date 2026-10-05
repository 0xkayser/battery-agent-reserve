import test from 'node:test';import assert from 'node:assert/strict';
import {driveTransaction,verifyConfirmation} from './settlement.mjs';import {USDC} from './reserve.mjs';
const row=()=>({wire:'same-signed-bytes',signature:'one-signature',lastValidBlockHeight:100,feeLamports:5000,owner:'owner',worker:'worker',amountUsdc:10000});
const token=(owner,amount)=>({owner,mint:USDC,uiTokenAmount:{decimals:6,amount:String(amount)}});
const tx=()=>({transaction:['same-signed-bytes','base64'],slot:22,meta:{err:null,fee:5000,preTokenBalances:[token('owner',3000000),token('worker',0)],postTokenBalances:[token('owner',2990000),token('worker',10000)]}});
function fixture(){
 const store={};let saves=0,prepares=0,sendCount=0,landed=false,expired=false,timeout=false;
 return {store,save:()=>{saves++;},prepare:async()=>{prepares++;return row();},pause:async()=>{},
 rpc:async(method,params)=>{
  if(method==='getSignatureStatuses')return {value:[landed?{confirmationStatus:'finalized',err:null}:null]};
  if(method==='getTransaction')return tx();if(method==='getBlockHeight')return expired?101:80;
  if(method==='sendTransaction'){assert(saves>0,'write-before-send');assert.equal(params[0],'same-signed-bytes');sendCount++;landed=true;if(timeout)throw Error('socket closed after remote acceptance');return 'one-signature';}throw Error('unexpected method');},
 land:()=>{landed=true;},expire:()=>{expired=true;},timeout:()=>{timeout=true;},counts:()=>({saves,prepares,sendCount})};
}
test('crash after send resumes confirmed result without second signature or transfer',async()=>{
 const f=fixture();await assert.rejects(driveTransaction({id:'research-001',...f,afterSend:()=>{throw Error('process crash');}}),/crash/);
 assert.equal(f.store['research-001'].receipt,undefined);const proof=await driveTransaction({id:'research-001',...f});assert.equal(proof.amountUsdc,10000);
 await driveTransaction({id:'research-001',...f});assert.deepEqual(f.counts(),{saves:3,prepares:1,sendCount:1});
});
test('ambiguous transport error holds persisted bytes and reconciles accepted transaction',async()=>{
 const f=fixture();f.timeout();await assert.rejects(driveTransaction({id:'research-002',...f}),/socket/);assert(f.store['research-002']);await driveTransaction({id:'research-002',...f});assert.equal(f.counts().sendCount,1);
});
test('expired uncertain transaction never prepares or sends a replacement',async()=>{
 const f=fixture();f.store.a=row();f.expire();await assert.rejects(driveTransaction({id:'a',...f}),/Expired uncertain/);assert.deepEqual(f.counts(),{saves:0,prepares:0,sendCount:0});
});
test('chain receipt rejects altered bytes, fees, token identity and wrong financial deltas',()=>{
 for(const alter of [t=>t.transaction[0]='different',t=>t.meta.fee=5001,t=>t.meta.err={InstructionError:1},t=>t.meta.postTokenBalances[0].uiTokenAmount.amount='2980000',t=>t.meta.postTokenBalances[1].mint='other',t=>t.meta.preTokenBalances.push(token('owner',1))]){const t=tx();alter(t);assert.throws(()=>verifyConfirmation(row(),t));}assert.equal(verifyConfirmation(row(),tx()).amountUsdc,10000);
});
