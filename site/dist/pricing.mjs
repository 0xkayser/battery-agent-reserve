// Scenario arithmetic only. No deposits, API/model calls or payment action.
const form=document.querySelector('#economics-form');
const output=document.querySelector('#economics-result');
form?.addEventListener('input',()=>{
 const a=form.elements.agents.value.trim(), c=form.elements.cost.value.trim();
 if(!a||!c){output.textContent='[ ENTER AGENTS + MONTHLY OPERATING COST ]';return;}
 const agents=Number(a),cost=Number(c);
 if(!Number.isSafeInteger(agents)||agents<1||agents>10000||!Number.isFinite(cost)||cost<0||cost>10000000){output.textContent='[ INVALID SCENARIO / CHECK INPUTS ]';return;}
 const revenue=9*agents,contribution=revenue-cost,margin=contribution/revenue*100;
 output.textContent=`HYPOTHETICAL MONTHLY REVENUE  $${revenue.toFixed(2)}\nENTERED OPERATING COST        $${cost.toFixed(2)}\nCONTRIBUTION BEFORE OVERHEAD  $${contribution.toFixed(2)}\nCONTRIBUTION / REVENUE        ${margin.toFixed(1)}%\n\n[ SCENARIO / NOT MEASURED MARGIN ]`;
});
form?.addEventListener('submit',e=>e.preventDefault());
