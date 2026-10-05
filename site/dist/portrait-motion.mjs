const ramp=' .,:;itLCO08@';
const levels=Object.fromEntries([...ramp].map((c,i)=>[c,i]));

export function preparePortrait(data){
 return {...data,lines:data.text.split('\n').map(line=>line.padEnd(data.columns).slice(0,data.columns))};
}

// A stable grid, with the face retained and only its data trail drifting left.
export function portraitFrame(data,seconds){
 const {columns,rows,lines}=data;
 const breath=Math.sin(seconds*.9)*.35;
 return lines.map((line,y)=>{
  const row=y/rows,wave=Math.sin(row*12-seconds*1.6);
  let output='';
  for(let x=0;x<columns;x++){
   const column=x/columns,trail=Math.max(0,1-column/.48);
   const shift=Math.round(trail*(1.5+wave*1.5));
   let c=line[Math.min(columns-1,x+shift)],level=levels[c]??0;
   if(level){
    const shimmer=Math.sin(x*.23+y*.39-seconds*2.1);
    const signal=Math.sin(column*11-row*4-seconds*1.15);
    // Modulate neighbouring character densities rather than flash the image.
    level=Math.max(1,Math.min(ramp.length-1,level+Math.round(signal*.65+shimmer*.25+breath)));
    c=ramp[level];
    if(trail>.1&&Math.sin(x*1.7+y*2.1+seconds*1.4)>.96)c=' ';
   }
   output+=c;
  }
  return output;
 }).join('\n');
}

export function animatePortrait(element,button){
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let data=null,paused=false,visible=false,raf=0,last=0,elapsed=0;
 const active=()=>data&&!paused&&!preference.matches&&visible&&!document.hidden;
 function tick(now){
  raf=0;if(!active())return;
  if(now-last>=100){elapsed+=Math.min(now-last,150)/1000;last=now;element.textContent=portraitFrame(data,elapsed);}
  raf=requestAnimationFrame(tick);
 }
 function sync(){
  cancelAnimationFrame(raf);raf=0;
  button.hidden=!data||preference.matches;
  button.textContent=paused?'[ PLAY ]':'[ PAUSE ]';
  button.setAttribute('aria-pressed',String(paused));
  button.setAttribute('aria-label',paused?'Play portrait animation':'Pause portrait animation');
  if(preference.matches&&data)element.textContent=data.lines.join('\n');
  if(active()){last=performance.now();raf=requestAnimationFrame(tick);}
 }
 button.addEventListener('click',()=>{paused=!paused;sync();});
 preference.addEventListener('change',sync);
 document.addEventListener('visibilitychange',sync);
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:0});
 observer.observe(element.parentElement);
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);observer.disconnect();},{once:true});
 window.addEventListener('pageshow',()=>{observer.observe(element.parentElement);sync();});
 return {set(source){if(data?.source===source)return;data={...preparePortrait(source),source};element.textContent=data.lines.join('\n');sync();}};
}
