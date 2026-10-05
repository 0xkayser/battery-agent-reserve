export const RPC='https://api.devnet.solana.com';
export const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const CLUSTERS=Object.freeze({devnet:{rpc:RPC,genesis:GENESIS},mainnet:{rpc:'https://api.mainnet-beta.solana.com',genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'}});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function parseNetwork(data,observedAt,latencyMs,cluster='devnet'){
 const config=CLUSTERS[cluster];if(!config)throw Error('Unsupported cluster');
 if(!Array.isArray(data)||data.length!==3)throw Error('Malformed RPC batch');
 const map=new Map();for(const r of data){if(r.jsonrpc!=='2.0'||r.error||map.has(r.id))throw Error('Invalid RPC result');map.set(r.id,r.result);}
 if(map.get(1)!==config.genesis)throw Error('Wrong cluster');
 const e=map.get(2),p=map.get(3)?.[0];
 if(!e||![e.absoluteSlot,e.blockHeight,e.epoch].every(integer)||!p||![p.slot,p.numTransactions,p.samplePeriodSecs].every(integer)||!p.samplePeriodSecs)throw Error('Incomplete RPC sample');
 return {schema:'battery.network/1',cluster,rpc:config.rpc,genesisHash:config.genesis,observedAt,slot:e.absoluteSlot,epoch:e.epoch,blockHeight:e.blockHeight,
  performance:{slot:p.slot,numTransactions:p.numTransactions,samplePeriodSecs:p.samplePeriodSecs,transactionsPerSecond:Math.round(p.numTransactions/p.samplePeriodSecs*100)/100},latencyMs};
}
export async function fetchNetwork(fetcher=fetch,cluster='devnet'){
 const config=CLUSTERS[cluster];if(!config)throw Error('Unsupported cluster');
 const start=Date.now();
 const batch=[{jsonrpc:'2.0',id:1,method:'getGenesisHash'},{jsonrpc:'2.0',id:2,method:'getEpochInfo',params:[{commitment:'finalized'}]},{jsonrpc:'2.0',id:3,method:'getRecentPerformanceSamples',params:[1]}];
 const r=await fetcher(config.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('RPC unavailable');
 const body=await r.text();if(body.length>262144)throw Error('RPC response too large');
 return parseNetwork(JSON.parse(body),Math.floor(Date.now()/1000),Date.now()-start,cluster);
}
const cache=new Map(),inflight=new Map();
export async function network(cluster='devnet'){
 if(!CLUSTERS[cluster])throw Error('Unsupported cluster');
 const cached=cache.get(cluster);
 if(cached&&Date.now()/1000-cached.observedAt<30)return cached;
 if(!inflight.has(cluster))inflight.set(cluster,fetchNetwork(fetch,cluster).then(r=>(cache.set(cluster,r),r)).finally(()=>inflight.delete(cluster)));
 return inflight.get(cluster);
}
