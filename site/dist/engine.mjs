// Deterministic illustrative scenario, not a billing adapter or live agent.
export function validate(input) {
  if (input===null || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid policy.');
  const limits = {reserve:[5,500],rate:[0.1,5],floor:[0,100],provider:[0,500]};
  for (const [key,[min,max]] of Object.entries(limits)) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key]<min || input[key]>max)
      throw new Error(`Invalid ${key}.`);
  }
  for(const [key,step] of Object.entries({reserve:5,rate:0.1,floor:1,provider:1}))
    if(Math.abs(input[key]/step-Math.round(input[key]/step))>1e-7) throw new Error(`Use ${step} increments for ${key}.`);
  if (input.floor>input.reserve) throw new Error('Protected balance cannot exceed the reserve.');
  for (const key of ['fallback','crash','fees']) if(typeof input[key]!=='boolean') throw new Error(`Invalid ${key}.`);
  return Object.fromEntries(['reserve','rate','floor','provider','fallback','crash','fees'].map(key=>[key,input[key]]));
}
export function simulate(raw) {
  const s=validate(raw), micro=x=>Math.round(x*1e6);
  let balance=micro(s.reserve), allowance=micro(s.provider), alternate=micro(500), completed=0, route='primary', stopped=null;
  const floor=micro(s.floor), primary=micro(s.rate), economy=Math.round(primary*0.4), points=[balance], events=[];
  let daySpend=0;
  events.push({hour:0,text:s.fees?'Assumed fee income: $2 per hour.':'Creator-fee income stops. Reserve takes over.'});
  for(let h=0;h<72;h++) {
    if(h%24===0) daySpend=0;
    if(s.fees) balance+=micro(2);
    if(h===24 && s.crash) events.push({hour:h,text:'Worker lost. Confirmed result restored on the new worker.'});
    const room=Math.min(balance-floor,micro(30)-daySpend);
    let cost;
    if(primary<=Math.min(room,allowance)) {cost=primary;allowance-=cost;}
    else if(s.fallback && economy<=Math.min(room,alternate)) {
      cost=economy;alternate-=cost;
      if(route!=='economy') events.push({hour:h,text:'Primary route cannot fit. Pre-approved lower-cost route starts.'});
      route='economy';
    } else {stopped=h;events.push({hour:h,text:balance-floor<Math.min(primary,s.fallback?economy:primary)?'Protected balance reached. Progress saved; new work pauses.':'Provider or daily allowance exhausted. New work pauses.'});break;}
    balance-=cost;daySpend+=cost;completed++;points.push(balance);
  }
  if(stopped===null) events.push({hour:72,text:'Full test complete. Protected balance stays intact.'});
  return {scenario:s,hours:completed,completed,balance:balance/1e6,protected:s.floor,duplicates:0,stopped,events,points:points.map(x=>x/1e6),horizon:72};
}
