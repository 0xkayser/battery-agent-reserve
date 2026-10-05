export function micro(s){
 if(typeof s!=='string'||!/^\d{1,7}(\.\d{1,6})?$/.test(s)||Number(s)>1000000)throw Error('Use 0–1,000,000 USDC with up to six decimals.');
 const [a,b='']=s.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));
}
export function estimate(units,rate,floor){
 const daily=micro(rate),protectedUnits=micro(floor);if(daily===0n)throw Error('Enter a daily spend above zero.');
 const balance=BigInt(units),available=balance>protectedUnits?balance-protectedUnits:0n;
 const tenths=available*10n/daily;
 return {dailyUnits:String(daily),floorUnits:String(protectedUnits),availableUnits:String(available),days:tenths>3650n?'>365':String(Number(tenths)/10),label:tenths>3650n?'More than 365 days':`${Number(tenths)/10} days`,belowFloor:balance<protectedUnits};
}
export function amount(units,decimals=6){const n=BigInt(units);return `${n/(10n**BigInt(decimals))}.${String(n%(10n**BigInt(decimals))).padStart(decimals,'0')}`.replace(/\.?0+$/,'');}
