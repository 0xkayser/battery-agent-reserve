import test from 'node:test';import assert from 'node:assert/strict';import {parseBudgetPrice,budgetPrice,PRICE_URL} from './budget.mjs';
const good=()=>({error:[],result:{SOLUSDC:{a:['120'],c:['121']}}});
test('USDC budget cannot use another pair, nonfinite values, excessive price or stale response',async()=>{
 assert.equal(parseBudgetPrice(good()),121);
 for(const d of [{error:[]},{error:['bad'],result:good().result},{error:[],result:{SOLUSD:good().result.SOLUSDC}},
  {error:[],result:{SOLUSDC:{a:['Infinity'],c:['121']}}},{error:[],result:{SOLUSDC:{a:['201'],c:['121']}}}])assert.throws(()=>parseBudgetPrice(d));
 const fake=(date)=>async(url)=>{assert.equal(url,PRICE_URL);return {ok:true,headers:{get:n=>n==='date'?date:null},text:async()=>JSON.stringify(good())};};
 await assert.rejects(budgetPrice(fake('2020-01-01')),/stale/);assert.equal((await budgetPrice(fake(new Date().toUTCString()))).solUsdc,121);
});
