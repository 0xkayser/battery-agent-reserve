import test from 'node:test';import assert from 'node:assert/strict';
import {USDC,validWallet,parseWallet,fetchWallet} from './lib/wallet.mjs';
import {CLUSTERS} from './lib/network.mjs';import {estimate,amount,micro} from './dist/power-math.mjs';import handler from './api/wallet.js';
const W='J2n93YFxdJfKFX61TixU2QLfjQnfp5tWg3JJjp3ubaij',T='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYS='11111111111111111111111111111111';
function token(key,units,state='initialized'){return {pubkey:key,account:{owner:T,data:{parsed:{type:'account',info:{mint:USDC,owner:W,state,tokenAmount:{amount:units,decimals:6}}}}}};}
function batch(){return [{id:4,result:{context:{slot:100},value:[token(SYS,'4000000'),token(USDC,'1000000','frozen')]}},{id:2,result:{context:{slot:99},value:4302840}},{id:3,result:{context:{slot:99},value:{owner:SYS,executable:false,lamports:4302840}}},{id:1,result:CLUSTERS.mainnet.genesis}].map(r=>({jsonrpc:'2.0',...r}));}
test('wallet canonical decoding checks actual 32 bytes, including zero system key',()=>{for(const w of [W,SYS,USDC])assert(validWallet(w));for(const w of ['a'.repeat(32),'1'.repeat(33),'z'.repeat(44),W+'1','bad address'])assert(!validWallet(w));});
test('observed units are exact and frozen funds cannot extend runway',()=>{const d=parseWallet(batch(),W,'2026-10-06T00:00:00Z');assert.equal(d.usdc.spendableUnits,'4000000');assert.equal(d.usdc.frozenUnits,'1000000');assert.equal(d.lamports,4302840);assert.equal(estimate(d.usdc.spendableUnits,'2','1').days,'1.5');assert.deepEqual(d.slots,{sol:99,account:99,usdc:100});});
test('wrong network, RPC identity, asset, owner, precision, unsafe amounts and duplicates fail closed',()=>{
 const changes=[d=>d[3].result='devnet',d=>d[1].id=4,d=>d[0].error={code:429},d=>d[1].result.value=Number.MAX_SAFE_INTEGER+1,
 d=>d[0].result.value[0].account.owner=SYS,d=>d[0].result.value[0].account.data.parsed.info.mint=SYS,d=>d[0].result.value[0].account.data.parsed.info.owner=SYS,
 d=>d[0].result.value[0].account.data.parsed.info.tokenAmount.decimals=9,d=>d[0].result.value[0].account.data.parsed.info.tokenAmount.amount='18446744073709551616',
 d=>d[0].result.value.push(d[0].result.value[0]),d=>d[0].result.value[0].account.data.parsed.info.state='uninitialized'];
 for(const change of changes){const d=batch();change(d);assert.throws(()=>parseWallet(d,W,''));}
});
test('empty wallet is an honest observation; program owned is explicitly classified',()=>{const d=batch();d[0].result.value=[];d[1].result.value=0;d[2].result.value=null;const v=parseWallet(d,W,'');assert.equal(v.account.kind,'absent');assert.equal(v.usdc.spendableUnits,'0');d[2].result.value={owner:T,lamports:0,executable:false};assert.equal(parseWallet(d,W,'').account.kind,'program-owned');});
test('sum can exceed Number safe range without losing USDC; burn is bounded integer arithmetic',()=>{const d=batch();d[0].result.value=[token(SYS,'18446744073709551615'),token(USDC,'18446744073709551615')];assert.equal(parseWallet(d,W,'').usdc.spendableUnits,'36893488147419103230');assert.equal(estimate('36893488147419103230','0.000001','0').days,'>365');assert.equal(amount('0'),'0');assert.equal(amount('4302840',9),'0.00430284');assert.equal(estimate('999999','1','1').days,'0');for(const s of ['-1','NaN','1e6','1.0000001','1000001',''])assert.throws(()=>micro(s));assert.throws(()=>estimate('1','0','0'));});
test('fixed read-only methods, bounded response stream and failed upstream produce no synthetic data',async()=>{
 const data=await fetchWallet(W,async(url,o)=>{assert.equal(url,CLUSTERS.mainnet.rpc);assert.equal(o.redirect,'error');assert.deepEqual(JSON.parse(o.body).map(r=>r.method),['getGenesisHash','getBalance','getAccountInfo','getTokenAccountsByOwner']);return new Response(JSON.stringify(batch()));});assert.equal(data.wallet,W);
 await assert.rejects(()=>fetchWallet(W,async()=>new Response('bad',{status:429})));
 await assert.rejects(()=>fetchWallet(W,async()=>new Response(' '.repeat(262145))));
 await assert.rejects(()=>fetchWallet(W,async()=>new Response('{')));
});
test('endpoint accepts no write, override, duplicate or invalid query before any RPC',async()=>{for(const [method,url,status] of [['POST','/api/wallet',405],['GET','/api/wallet?wallet=bad',400],['GET',`/api/wallet?wallet=${W}&rpc=evil`,400],['GET',`/api/wallet?wallet=${W}&wallet=${W}`,400]]){const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method,url},res);assert.equal(res.code,status);assert(res.data.error);}});
