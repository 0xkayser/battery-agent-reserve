import test from 'node:test';
import assert from 'node:assert/strict';
import {guardPolicy,requireMainnet,GENESIS,POLICY,decodeToken,USDC,kit,token,excessRefundAmount} from './reserve.mjs';
test('excess funding returns only excess to bound owner before any delegation',()=>{
 const state={reserveUsdc:5_000_000,receiverUsdc:0,gasLamports:0,delegation:null,authority:null};
 assert.equal(excessRefundAmount(state),2_000_000);
 for(const changed of [{reserveUsdc:3_000_000},{reserveUsdc:5_000_001},{reserveUsdc:NaN},{reserveUsdc:4_000_000.1},
  {receiverUsdc:1},{gasLamports:1},{delegation:{}},{authority:{}}])assert.throws(()=>excessRefundAmount({...state,...changed}));
});
test('mainnet guard does not permit devnet or ambiguous cluster',()=>{
 assert.doesNotThrow(()=>requireMainnet(GENESIS));
 assert.throws(()=>requireMainnet('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'));
});
test('runtime independently rejects floor, oversized job, allowance and gas breaches',()=>{
 const p={balanceUsdc:3_000_000,remainingUsdc:1_000_000,amountUsdc:10_000,gasLamports:200_000,feeLamports:5_000};
 assert.doesNotThrow(()=>guardPolicy(p));
 for(const c of [{balanceUsdc:2_000_000},{amountUsdc:10_001},{remainingUsdc:9_999},{feeLamports:20_001},{gasLamports:100_000},{amountUsdc:0},{amountUsdc:-1},{amountUsdc:NaN},{amountUsdc:1.5}])
  assert.throws(()=>guardPolicy({...p,...c}));
 assert.equal(POLICY.reserveUsdc-POLICY.allowanceUsdc,POLICY.floorUsdc);
 assert(POLICY.reserveUsdc+POLICY.gasFundingLamports/1e9*POLICY.maxSolPriceUsdc*1e6<=POLICY.budgetUsdc);
});
test('readback requires canonical USDC, matching owner and initialized SPL account',()=>{
 const owner=kit.address('11111111111111111111111111111111'),e=kit.getAddressEncoder();
 const b=Buffer.alloc(165);b.set(e.encode(USDC),0);b.set(e.encode(owner),32);b.writeBigUInt64LE(3_000_000n,64);b[108]=1;
 const a={owner:token.TOKEN_PROGRAM_ADDRESS,data:[b.toString('base64'),'base64']};
 assert.equal(decodeToken(a,owner),3_000_000);
 assert.throws(()=>decodeToken({...a,owner:owner},owner));
 assert.throws(()=>decodeToken(a,USDC));b[108]=2;assert.throws(()=>decodeToken({...a,data:[b.toString('base64'),'base64']},owner));
});
