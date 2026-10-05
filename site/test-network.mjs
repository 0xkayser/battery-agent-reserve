import test from 'node:test';import assert from 'node:assert/strict';
import {parseNetwork,fetchNetwork,GENESIS,RPC} from './lib/network.mjs';
import handler from './api/network.js';
const sample=()=>[{jsonrpc:'2.0',id:3,result:[{slot:99,numTransactions:120,samplePeriodSecs:60}]},{jsonrpc:'2.0',id:1,result:GENESIS},{jsonrpc:'2.0',id:2,result:{absoluteSlot:100,blockHeight:90,epoch:2}}];
test('RPC order is irrelevant; cluster, slot and sample remain explicit',()=>{const r=parseNetwork(sample(),1,12);assert.equal(r.slot,100);assert.equal(r.performance.slot,99);assert.equal(r.performance.transactionsPerSecond,2);});
test('wrong cluster, missing, duplicated, failed and invalid sample denied',()=>{
 const wrong=sample();wrong[1].result='mainnet';const dup=sample();dup[2].id=1;const bad=sample();bad[0].result[0].samplePeriodSecs=0;const error=sample();error[1].error={code:429};
 for(const s of [wrong,dup,bad,error,[],null])assert.throws(()=>parseNetwork(s,1,12));
});
test('fetch only reaches fixed RPC and uses exactly read-only methods',async()=>{
 const r=await fetchNetwork(async(url,options)=>{assert.equal(url,RPC);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body).map(x=>x.method),['getGenesisHash','getEpochInfo','getRecentPerformanceSamples']);return {ok:true,text:async()=>JSON.stringify(sample())};});assert.equal(r.cluster,'devnet');
});
test('upstream failures return no synthetic observation',async()=>{await assert.rejects(()=>fetchNetwork(async()=>({ok:false})));await assert.rejects(()=>fetchNetwork(async()=>({ok:true,text:async()=>'{'})));});
test('public endpoint refuses writes and arbitrary RPC parameters before network access',async()=>{
 for(const [method,url,status] of [['POST','/api/network',405],['GET','/api/network?rpc=evil',400]]){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(d){this.body=d;return this;}};
 await handler({method,url},res);assert.equal(res.code,status);assert.ok(res.body.error);assert.equal(res.headers['Cache-Control'],'no-store');
 }
});
import mainnetHandler from './api/mainnet.js';
import {CLUSTERS} from './lib/network.mjs';
test('mainnet read is pinned separately and cannot accept a devnet response',async()=>{
 const s=sample();s[1].result=CLUSTERS.mainnet.genesis;
 assert.throws(()=>parseNetwork(sample(),1,12,'mainnet'));assert.throws(()=>parseNetwork(s,1,12,'devnet'));
 const r=await fetchNetwork(async(url,o)=>{assert.equal(url,CLUSTERS.mainnet.rpc);assert(!JSON.parse(o.body).some(x=>/send|airdrop/i.test(x.method)));return {ok:true,text:async()=>JSON.stringify(s)};},'mainnet');
 assert.equal(r.cluster,'mainnet');assert.equal(r.genesisHash,CLUSTERS.mainnet.genesis);
 await assert.rejects(()=>fetchNetwork(()=>{throw Error('must not request');},'custom'));
});
test('mainnet endpoint refuses writes and arbitrary parameters before access',async()=>{
 for(const [method,url,status] of [['POST','/api/mainnet',405],['GET','/api/mainnet?wallet=evil',400]]){
  const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.body=d;return this;}};
  await mainnetHandler({method,url},res);assert.equal(res.code,status);assert(res.body.error);
 }
});
