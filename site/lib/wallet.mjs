import {CLUSTERS} from './network.mjs';
export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM='11111111111111111111111111111111';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const uint=n=>Number.isSafeInteger(n)&&n>=0;
const u64=s=>typeof s==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(s)&&BigInt(s)<=18446744073709551615n;
export function validWallet(s){
 if(typeof s!=='string'||s.length<32||s.length>44)return false;
 let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)return false;n=n*58n+BigInt(i);}
 let bytes=0;for(let v=n;v;v>>=8n)bytes++;
 const zeros=s.match(/^1*/)[0].length;
 return bytes+zeros===32;
}
export function parseWallet(data,wallet,observedAt){
 if(!validWallet(wallet)||!Array.isArray(data)||data.length!==4)throw Error('Invalid batch');
 const m=new Map();for(const r of data){if(!r||r.jsonrpc!=='2.0'||r.error||![1,2,3,4].includes(r.id)||m.has(r.id)||!Object.hasOwn(r,'result'))throw Error('Invalid result');m.set(r.id,r.result);}
 if(m.get(1)!==CLUSTERS.mainnet.genesis)throw Error('Wrong network');
 const b=m.get(2),a=m.get(3),t=m.get(4);
 for(const v of [b,a,t])if(!v?.context||!uint(v.context.slot))throw Error('Missing slot');
 if(!uint(b.value)||!Array.isArray(t.value))throw Error('Invalid balance');
 if(a.value!==null&&(!validWallet(a.value?.owner)||typeof a.value.executable!=='boolean'||!uint(a.value.lamports)))throw Error('Invalid account');
 let spendable=0n,frozen=0n,delegated=0n;const seen=new Set();
 for(const item of t.value){
  if(!validWallet(item?.pubkey)||seen.has(item.pubkey)||item.account?.owner!==TOKEN)throw Error('Invalid token account');seen.add(item.pubkey);
  const p=item.account.data?.parsed,info=p?.info,v=info?.tokenAmount;
  if(p?.type!=='account'||info?.mint!==USDC||info?.owner!==wallet||v?.decimals!==6||!u64(v?.amount)||!['initialized','frozen'].includes(info?.state))throw Error('Invalid USDC');
  const units=BigInt(v.amount);
  if(info.state==='frozen')frozen+=units;else spendable+=units;
  if(info.delegate!==undefined){if(!validWallet(info.delegate)||info.delegatedAmount?.decimals!==6||!u64(info.delegatedAmount?.amount))throw Error('Invalid delegation');delegated+=BigInt(info.delegatedAmount.amount);}
 }
 return {schema:'battery.wallet/1',wallet,cluster:'mainnet',genesisHash:CLUSTERS.mainnet.genesis,rpc:CLUSTERS.mainnet.rpc,commitment:'finalized',observedAt,
  slots:{sol:b.context.slot,account:a.context.slot,usdc:t.context.slot},lamports:b.value,usdc:{mint:USDC,decimals:6,spendableUnits:String(spendable),frozenUnits:String(frozen),delegatedAllowanceUnits:String(delegated),accounts:t.value.length},
  account:{exists:a.value!==null,owner:a.value?.owner??null,kind:a.value===null?'absent':a.value.owner===SYSTEM&&!a.value.executable?'system':'program-owned'}};
}
export async function fetchWallet(wallet,fetcher=fetch){
 if(!validWallet(wallet))throw Error('Invalid wallet');
 const batch=[{id:1,method:'getGenesisHash'},{id:2,method:'getBalance',params:[wallet,{commitment:'finalized'}]},
 {id:3,method:'getAccountInfo',params:[wallet,{commitment:'finalized',encoding:'base64',dataSlice:{offset:0,length:0}}]},
 {id:4,method:'getTokenAccountsByOwner',params:[wallet,{mint:USDC},{commitment:'finalized',encoding:'jsonParsed'}]}].map(r=>({jsonrpc:'2.0',...r}));
 const response=await fetcher(CLUSTERS.mainnet.rpc,{method:'POST',body:JSON.stringify(batch),headers:{'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('RPC unavailable');
 const reader=response.body.getReader();let size=0,chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Oversized RPC');chunks.push(value);}}
 finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.byteLength;}
 return parseWallet(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),wallet,new Date().toISOString());
}
const cache=new Map(),flight=new Map();
export async function walletPower(wallet){
 const hit=cache.get(wallet);if(hit&&Date.now()-hit.time<15000)return hit.data;
 if(flight.has(wallet))return flight.get(wallet);
 if(flight.size>=32)throw Error('Busy');
 const p=fetchWallet(wallet).then(data=>{cache.delete(wallet);cache.set(wallet,{time:Date.now(),data});if(cache.size>128)cache.delete(cache.keys().next().value);return data;}).finally(()=>flight.delete(wallet));flight.set(wallet,p);return p;
}
