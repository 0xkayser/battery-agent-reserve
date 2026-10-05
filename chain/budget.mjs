import {POLICY} from './reserve.mjs';
export const PRICE_URL='https://api.kraken.com/0/public/Ticker?pair=SOLUSDC';
export function parseBudgetPrice(data){
 if(!Array.isArray(data?.error)||data.error.length||Object.keys(data.result??{}).join(',')!=='SOLUSDC')throw Error('SOL/USDC quote unavailable');
 const ask=Number(data.result.SOLUSDC.a?.[0]),last=Number(data.result.SOLUSDC.c?.[0]);
 if(![ask,last].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid SOL/USDC quote');
 const price=Math.max(ask,last);if(price>POLICY.maxSolPriceUsdc)throw Error('SOL/USDC exceeds reviewed budget price; no new operation');
 return price;
}
export async function budgetPrice(fetcher=fetch){
 const r=await fetcher(PRICE_URL,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('SOL/USDC quote HTTP failure');
 const date=Date.parse(r.headers.get('date'));
 if(!Number.isFinite(date)||Math.abs(Date.now()-date)>120000||Number(r.headers.get('age')??0)>30)throw Error('Price response stale');
 const body=await r.text();if(body.length>10000)throw Error('Price response oversized');
 return {solUsdc:parseBudgetPrice(JSON.parse(body)),source:PRICE_URL,observedAt:new Date().toISOString()};
}
