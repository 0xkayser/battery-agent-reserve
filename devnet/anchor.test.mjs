import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync,sign,verify} from 'node:crypto';
import {encode58,decode58,shortvec,guard,memoMessage,GENESIS,MEMO} from './anchor.mjs';
test('base58 preserves every byte including leading zeros',()=>{
 for(const n of [1,32,64])for(let i=0;i<10;i++){const b=randomBytes(n);assert.deepEqual(decode58(encode58(b)),b);}
 assert.deepEqual(decode58('111'),Buffer.alloc(3));assert.throws(()=>decode58('0'));
});
test('policy refuses mainnet, overspend, floor breach and invalid amounts',()=>{
 const p={genesis:GENESIS,balance:1000000000,fee:5000};assert.equal(guard(p),true);
 for(const x of [{genesis:'mainnet'},{fee:10001},{spent:29999},{balance:500004999},{fee:-1},{balance:NaN},{fee:1.1}])assert.throws(()=>guard({...p,...x}));
});
test('bounded single signed memo message has canonical legacy transaction layout',()=>{
 const payer=randomBytes(32),hash=randomBytes(32),memo='BATTERY:checkpoint:v1:'+'a'.repeat(64);
 const msg=memoMessage(encode58(payer),encode58(hash),memo);
 assert.deepEqual([...msg.subarray(0,4)],[1,0,1,2]);
 assert.deepEqual(msg.subarray(4,36),payer);assert.deepEqual(msg.subarray(36,68),decode58(MEMO));
 assert.deepEqual(msg.subarray(68,100),hash);assert.deepEqual([...msg.subarray(100,105)],[1,1,1,0,86]);
 assert.equal(msg.subarray(105).toString(),memo);
 const key=generateKeyPairSync('ed25519');assert.ok(verify(null,msg,key.publicKey,sign(null,msg,key.privateKey)));
 assert.throws(()=>memoMessage(encode58(payer),encode58(hash),'x'.repeat(129)));
 assert.deepEqual([...shortvec(128)],[128,1]);assert.throws(()=>shortvec(65536));
});
