import {lettering,track} from './ascii.mjs';
import {mark} from './brand.mjs';
import {animatePortrait} from './portrait-motion.mjs';
const $=id=>document.getElementById(id);let portrait=null;
const motion=$('agent-face')?animatePortrait($('agent-face'),$('portrait-motion')):null;
const frames=[];
export function refreshTracks(){for(const id of ['reserve','rate']){const input=$(id),out=$(id+'-track');if(!input||!out)continue;out.textContent=track(Number(input.value),Number(input.min),Number(input.max),out.parentElement.clientWidth,parseFloat(getComputedStyle(out).fontSize)*.6);}}
function drawSurface(){
 for(const {el,edges:[top,bottom,left,right]} of frames){
  const w=el.clientWidth,h=el.clientHeight;if(!w||!h)continue;
  const char=parseFloat(getComputedStyle(top).fontSize)*.6,rowHeight=parseFloat(getComputedStyle(top).lineHeight),columns=Math.floor(w/char),rows=Math.max(0,Math.floor((h-rowHeight)/rowHeight));
  top.textContent=bottom.textContent='+'+'-'.repeat(Math.max(0,columns-2))+'+';
  left.textContent=right.textContent=Array(rows).fill('|').join('\n');el.style.setProperty('--edge-gap',`${Math.max(0,w-columns*char)}px`);
 }
 for(const p of document.querySelectorAll('.ascii-rule'))p.textContent='-'.repeat(Math.max(0,Math.floor(p.parentElement.clientWidth/(parseFloat(getComputedStyle(p).fontSize)*.6))));
 if(portrait&&motion){const data=innerWidth<=760?portrait.mobile:portrait.desktop,face=$('agent-face'),box=face.parentElement;motion.set(data);face.style.fontSize=Math.min(box.clientWidth*(innerWidth<=760?.98:.79)/(data.columns*.6),(box.clientHeight-36)/(data.rows*1.05))+'px';}
 refreshTracks();
}
let frame;function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(drawSurface);}
const resize=new ResizeObserver(schedule);for(const item of frames)resize.observe(item.el);window.addEventListener('resize',schedule);window.addEventListener('battery-render',schedule);
if(motion)fetch('/assets/agent-ascii.json').then(r=>{if(!r.ok)throw Error('Portrait unavailable');return r.json();}).then(data=>{portrait=data;drawSurface();}).catch(()=>{$('agent-face').textContent='[ AGENT 01 ]\n[ PORTRAIT UNAVAILABLE ]';});
schedule();
export function portraitData(){return portrait?.mobile??null;}
