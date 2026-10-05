export const RPC='https://api.devnet.solana.com';
export const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function parseNetwork(data,observedAt,latencyMs){
 if(!Array.isArray(data)||data.length!==3)throw Error('Malformed RPC batch');
 const map=new Map();for(const r of data){if(r.jsonrpc!=='2.0'||r.error||map.has(r.id))throw Error('Invalid RPC result');map.set(r.id,r.result);}
 if(map.get(1)!==GENESIS)throw Error('Wrong cluster');
 const e=map.get(2),p=map.get(3)?.[0];
 if(!e||![e.absoluteSlot,e.blockHeight,e.epoch].every(integer)||!p||![p.slot,p.numTransactions,p.samplePeriodSecs].every(integer)||!p.samplePeriodSecs)throw Error('Incomplete RPC sample');
 return {schema:'battery.network/1',cluster:'devnet',rpc:RPC,genesisHash:GENESIS,observedAt,slot:e.absoluteSlot,epoch:e.epoch,blockHeight:e.blockHeight,
  performance:{slot:p.slot,numTransactions:p.numTransactions,samplePeriodSecs:p.samplePeriodSecs,transactionsPerSecond:Math.round(p.numTransactions/p.samplePeriodSecs*100)/100},latencyMs};
}
export async function fetchNetwork(fetcher=fetch){
 const start=Date.now();
 const batch=[{jsonrpc:'2.0',id:1,method:'getGenesisHash'},{jsonrpc:'2.0',id:2,method:'getEpochInfo',params:[{commitment:'finalized'}]},{jsonrpc:'2.0',id:3,method:'getRecentPerformanceSamples',params:[1]}];
 const r=await fetcher(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('RPC unavailable');
 const body=await r.text();if(body.length>262144)throw Error('RPC response too large');
 return parseNetwork(JSON.parse(body),Math.floor(Date.now()/1000),Date.now()-start);
}
let cached=null,pending=null;
export async function network(){
 if(cached&&Date.now()/1000-cached.observedAt<30)return cached;
 if(!pending)pending=fetchNetwork().then(r=>(cached=r)).finally(()=>{pending=null;});
 return pending;
}
