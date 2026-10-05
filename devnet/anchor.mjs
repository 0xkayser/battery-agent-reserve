// Test SOL only. Built-in Node crypto; no wallet SDK, token mint or transfer.
import {generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const RPC='https://api.devnet.solana.com';
export const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MEMO='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function encode58(bytes){let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s;}
export function decode58(s){if(typeof s!=='string'||!s.length)throw Error('base58 string required');let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)throw Error('invalid base58');n=n*58n+BigInt(i);}const a=[];while(n){a.unshift(Number(n%256n));n/=256n;}for(const c of s){if(c!=='1')break;a.unshift(0);}return Buffer.from(a);}
export function shortvec(n){if(!Number.isSafeInteger(n)||n<0||n>65535)throw Error('shortvec limit');const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return Buffer.from(a);}
export function guard({genesis,balance,fee,floor=500000000,spent=0,cap=30000,maxFee=10000}){
 if(genesis!==GENESIS)throw Error('devnet genesis required; mainnet refused');
 for(const n of [balance,fee,floor,spent,cap,maxFee])if(!Number.isSafeInteger(n)||n<0)throw Error('non-negative integer lamports required');
 if(fee>maxFee||spent+fee>cap||balance-fee<floor)throw Error('fee/floor/daily policy denied');
 return true;
}
export function memoMessage(payer,blockhash,text){
 const keys=[decode58(payer),decode58(MEMO)],recent=decode58(blockhash),data=Buffer.from(text,'utf8');
 if(keys.some(b=>b.length!==32)||recent.length!==32||data.length>128)throw Error('invalid bounded memo');
 // Header: 1 signer (fee payer), 0 readonly signed, 1 readonly unsigned (Memo).
 // Instruction requires the fee payer as its only signer; no transfer instruction.
 return Buffer.concat([Buffer.from([1,0,1]),shortvec(2),...keys,recent,shortvec(1),
                       Buffer.from([1]),shortvec(1),Buffer.from([0]),shortvec(data.length),data]);
}
export async function rpc(method,params=[]){
 const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(`RPC HTTP ${r.status}`);const d=await r.json();
 if(d.error)throw Error(`${method}: RPC ${d.error.code}: ${d.error.message}`);return d.result;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function atomic(file,data){const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(tmp,file);}
async function transaction(signature){return rpc('getTransaction',[signature,{commitment:'confirmed',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]);}
async function confirmed(signature){for(let n=0;n<30;n++){const tx=await transaction(signature);if(tx){if(tx.meta?.err)throw Error('Confirmed transaction failed');return tx;}await wait(2000);}throw Error('Confirmation timed out; do not sign a new transaction for this checkpoint');}
export async function anchor(hash,stateDir,{airdrop=false}={}){
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('SHA256 checkpoint required');
 const genesis=await rpc('getGenesisHash');if(genesis!==GENESIS)throw Error('Wrong cluster');
 mkdirSync(stateDir,{recursive:true,mode:0o700});chmodSync(stateDir,0o700);
 const keyFile=join(stateDir,'devnet-key.json'),proofFile=join(stateDir,'anchor.json'),pendingFile=join(stateDir,'pending.json'),policyFile=join(stateDir,'fees.json');
 let key;
 if(existsSync(keyFile))key=JSON.parse(readFileSync(keyFile,'utf8'));
 else {const pair=generateKeyPairSync('ed25519');key={scope:'solana-devnet-only',genesis,
  privatePkcs8:pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64')};atomic(keyFile,key);}
 if(key.scope!=='solana-devnet-only'||key.genesis!==GENESIS)throw Error('Not a generated test-only key');
 const privateKey=createPrivateKey({key:Buffer.from(key.privatePkcs8,'base64'),type:'pkcs8',format:'der'});
 const publicKey=createPublicKey(privateKey),payer=encode58(publicKey.export({type:'spki',format:'der'}).subarray(-32));
 const text='BATTERY:checkpoint:v1:'+hash;
 if(existsSync(proofFile)){const old=JSON.parse(readFileSync(proofFile,'utf8'));if(old.checkpointSha256!==hash)throw Error('Use separate state for a different checkpoint');await verifyAnchor(old);return old;}
 let pending;
 if(existsSync(pendingFile)){pending=JSON.parse(readFileSync(pendingFile,'utf8'));if(pending.checkpointSha256!==hash||pending.payer!==payer)throw Error('Pending transaction mismatch');}
 else {
  let balance=(await rpc('getBalance',[payer,{commitment:'confirmed'}])).value;
  if(balance<500010000){
   if(!airdrop)throw Error(`Test-only payer ${payer} needs faucet SOL; use --airdrop explicitly`);
   const airdropSignature=await rpc('requestAirdrop',[payer,1000000000,{commitment:'confirmed'}]);
   await confirmed(airdropSignature);balance=(await rpc('getBalance',[payer,{commitment:'confirmed'}])).value;
  }
  const block=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
  const message=memoMessage(payer,block.blockhash,text);
  const fee=(await rpc('getFeeForMessage',[message.toString('base64'),{commitment:'confirmed'}])).value;
  if(fee===null)throw Error('No fee quote');
  const day=Math.floor(Date.now()/86400000),prior=existsSync(policyFile)?JSON.parse(readFileSync(policyFile,'utf8')):{day,spent:0};
  const spent=prior.day===day?prior.spent:0;
  guard({genesis,balance,fee,spent});
  const signatureBytes=sign(null,message,privateKey);if(!verify(null,message,publicKey,signatureBytes))throw Error('Local signature verification failed');
  const raw=Buffer.concat([shortvec(1),signatureBytes,message]);
  pending={schema:'battery.pending-devnet/1',checkpointSha256:hash,payer,signature:encode58(signatureBytes),raw:raw.toString('base64'),
   feeQuoteLamports:fee,floorLamports:500000000,dailyCapLamports:30000,spentBefore:spent,day,lastValidBlockHeight:block.lastValidBlockHeight};
  atomic(pendingFile,pending);
 }
 let tx=await transaction(pending.signature);
 if(!tx){
  const height=await rpc('getBlockHeight',[{commitment:'confirmed'}]);
  if(height>pending.lastValidBlockHeight)throw Error('Pending blockhash expired; inspect signature manually, no automatic repayment');
  const sig=await rpc('sendTransaction',[pending.raw,{encoding:'base64',skipPreflight:false,maxRetries:3}]);
  if(sig!==pending.signature)throw Error('Signature mismatch');tx=await confirmed(sig);
 }
 const result={schema:'battery.devnet-anchor/1',cluster:'devnet',genesisHash:genesis,rpc:RPC,
  signature:pending.signature,payer,checkpointSha256:hash,memo:text,slot:tx.slot,blockTime:tx.blockTime,
  actualFeeLamports:tx.meta.fee,feeQuoteLamports:pending.feeQuoteLamports,
  balanceBeforeLamports:tx.meta.preBalances[0],balanceAfterLamports:tx.meta.postBalances[0],
  protectedFloorLamports:pending.floorLamports,dailyCapLamports:pending.dailyCapLamports,
  observedAt:new Date().toISOString(),explorerUrl:`https://explorer.solana.com/tx/${pending.signature}?cluster=devnet`,
  meaning:'Signed checkpoint hash and test transaction fee policy; not a deployed custody vault, USD reserve, model receipt or token'};
 await verifyAnchor(result,tx);
 atomic(policyFile,{day:pending.day,spent:pending.spentBefore+tx.meta.fee});atomic(proofFile,result);
 return result;
}
export async function verifyAnchor(proof,knownTx){
 if(proof.cluster!=='devnet'||proof.genesisHash!==GENESIS||await rpc('getGenesisHash')!==GENESIS)throw Error('Wrong proof cluster');
 const tx=knownTx??await transaction(proof.signature);if(!tx||tx.meta?.err)throw Error('Missing or failed chain transaction');
 const instructions=tx.transaction.message.instructions;
 if(instructions.length!==1||instructions[0].programId!==MEMO||instructions[0].parsed!==proof.memo||proof.memo!=='BATTERY:checkpoint:v1:'+proof.checkpointSha256)throw Error('Memo mismatch');
 const first=tx.transaction.message.accountKeys[0];if(first.pubkey!==proof.payer||!first.signer)throw Error('Fee payer mismatch');
 if(tx.slot!==proof.slot||tx.blockTime!==proof.blockTime||tx.meta.preBalances[0]!==proof.balanceBeforeLamports||tx.meta.postBalances[0]!==proof.balanceAfterLamports||tx.meta.fee!==proof.actualFeeLamports||tx.meta.preBalances[0]-tx.meta.postBalances[0]!==tx.meta.fee||tx.meta.postBalances[0]<proof.protectedFloorLamports)throw Error('Fee/balance mismatch');
 guard({genesis:GENESIS,balance:tx.meta.preBalances[0],fee:tx.meta.fee,floor:proof.protectedFloorLamports});
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,file,stateDir,...flags]=process.argv.slice(2);
 try {
  if(command==='anchor'){const report=JSON.parse(readFileSync(file,'utf8'));const hash=report.checkpoint.sha256;const result=await anchor(hash,stateDir??'devnet-state',{airdrop:flags.includes('--airdrop')});console.log(JSON.stringify(result,null,2));}
  else if(command==='verify'){const proof=JSON.parse(readFileSync(file,'utf8'));await verifyAnchor(proof);console.log('Confirmed devnet memo, fee, payer and protected floor PASS');}
  else throw Error('Usage: node devnet/anchor.mjs anchor live-agent.json state-dir --airdrop | verify anchor.json');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
