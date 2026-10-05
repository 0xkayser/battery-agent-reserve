import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {canonical,sha,TASKS,POLICY,ENDPOINT,NETWORK,selectOffer,sources,verifyPayment} from './resource.mjs';
import {verifyConfirmation} from './settlement.mjs';
import {rpc,requireMainnet} from './reserve.mjs';
export async function verify(proof,live=false){
 const b=proof.body;
 if(!b||proof.sha256!==sha(b)||b.schema!=='battery.resource-proof/1'||canonical(b.policy)!==canonical(POLICY)||b.tasks?.length!==3)throw Error('Paid proof/immutable policy mismatch');
 if(b.runtime?.spentUsdcUnits!==21000||!b.runtime?.closed||b.runtime.refund?.receipt?.amountUsdc!==979000||b.runtime.owner!==b.owner)throw Error('Paid expenses/refund mismatch');
 if(live)requireMainnet(await rpc('getGenesisHash'));
 const signatures=new Set();
 for(let i=0;i<3;i++){
  const r=b.tasks[i],task=TASKS[i];
  if(r.job!==task.id||canonical(r.request)!==canonical(task.request)||r.requestHash!==sha(r.request)||r.responseHash!==sha(r.response)||r.resultHash!==sha(r.result)||r.paymentHash!==sha(r.payment)||r.owner!==b.owner||
     r.payment.resource?.url!==ENDPOINT||canonical(r.payment.accepted)!==canonical(r.offer)||canonical(r.result)!==canonical(sources(JSON.parse(r.response.body))))throw Error('Paid task input/response/result binding mismatch');
  selectOffer({x402Version:2,resource:{url:ENDPOINT},accepts:[r.offer]});
  const tx=live?await rpc('getTransaction',[r.confirmation.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]):r.chain;
  const confirmation=verifyPayment(r,tx);
  if(canonical(confirmation)!==canonical(r.confirmation)||signatures.has(confirmation.signature)||confirmation.beforeUsdc!==1000000-i*7000||confirmation.afterUsdc!==1000000-(i+1)*7000)throw Error('Payment order/balance/replay mismatch');
  signatures.add(confirmation.signature);
  const jr=b.runtime.jobs[i];if(jr?.job!==r.job||jr.state!=='complete'||jr.chargeUsdcUnits!==7000||canonical(jr.result)!==canonical(r.result))throw Error('Runtime/task ledger mismatch');
 }
 const refund=b.refundProof;
 if(!refund?.row||canonical(refund.receipt)!==canonical(b.runtime.refund.receipt))throw Error('Refund proof missing');
 const tx=live?await rpc('getTransaction',[refund.receipt.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]):refund.chain;
 if(canonical(verifyConfirmation(refund.row,tx))!==canonical(refund.receipt)||refund.row.owner!==b.owner||refund.row.worker!==POLICY.returnOwner||refund.row.amountUsdc!==979000)throw Error('Refund identity/chain mismatch');
 const events=b.runtime.events;
 if(events.filter(e=>e.kind==='paid_dispatch_intent').length!==3||events.filter(e=>e.kind==='paid_task_completed').length!==3||!events.some(e=>e.kind==='saved_response_recovered_no_purchase'&&e.job==='source-002')||!events.some(e=>e.kind==='closed_run_replayed_no_purchase'))throw Error('Missing finite crash/replay journal');
 if(canonical(b.supervisor?.exitCodes)!==canonical([76,0])||b.supervisor.closedReplayPassed!==true)throw Error('Actual supervisor crash/restart proof absent');
 return {checkedTasks:3,actualVendorUsdcUnits:21000,principalReturnedUsdcUnits:979000,liveRpcReRead:live,scope:'paid primary-source searches; trusted local operator'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))verify(JSON.parse(readFileSync(process.argv[2]??new URL('../evidence/paid-resource.json',import.meta.url))),process.argv.includes('--live')).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
