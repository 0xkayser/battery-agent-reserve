import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {verifyCanary} from './verify-canary.mjs';import {hash} from './reserve.mjs';
const proof=JSON.parse(readFileSync(new URL('../evidence/mainnet-canary.json',import.meta.url),'utf8'));
const research=JSON.parse(readFileSync(new URL('../evidence/mainnet-agent.json',import.meta.url),'utf8'));
test('published financial record conserves token principal and binds all three actual research results',()=>{
 const r=verifyCanary(proof,research);assert.equal(r.returnedUsdc,5);assert.equal(r.settlementPayments,3);assert.equal(r.confirmedTransactions,8);
});
test('rehashed semantic tampering cannot claim duplicate-free settlement, wrong token or full return',()=>{
 for(const change of [b=>b.mint='another-mint',b=>b.returnedUsdc=4_990_000,
  b=>b.receipts['research-002'].signature=b.receipts['research-001'].signature,
  b=>b.receipts['research-003'].resultHash='0'.repeat(64),b=>b.final.delegationClosed=false,
  b=>b.receipts['return-owner'].worker=b.worker,b=>b.replay.newTransfers=1,
  b=>b.negativeSimulations[0].checks[0].broadcast=true]){
  const altered=structuredClone(proof);change(altered.body);altered.sha256=hash(Buffer.from(JSON.stringify(altered.body)));
  assert.throws(()=>verifyCanary(altered,research));
 }
});
