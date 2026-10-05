// Public selected artifacts only. Optional mainnet readback never signs or sends.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {verifyCanary,verifyMainnet} from './verify-canary.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const report=JSON.parse(readFileSync(root+'/evidence/integrated-runtime/integrated.json','utf8'));
const proof=JSON.parse(readFileSync(root+'/evidence/integrated-financial.json','utf8'));
const offline=JSON.parse(execFileSync('python3',[root+'/verify_integrated.py',root+'/evidence/integrated-runtime/integrated.json'],{cwd:root,encoding:'utf8'}));
for(const [job,receipt] of Object.entries(report.payments)){
 for(const key of ['signature','slot','feeLamports','amountUsdc'])assert.equal(receipt[key],proof.body.receipts[job][key]);
}
const result=process.argv.includes('--live')?await verifyMainnet(proof,report):verifyCanary(proof,report);
console.log(JSON.stringify({...offline,...result,scope:'Interleaved local inference/mainnet test settlement; not paid provider billing'},null,2));
