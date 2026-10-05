const glyphs={
'0':[' ### ','#   #','#  ##','# # #','##  #','#   #',' ### '],
'1':['  #  ',' ##  ','  #  ','  #  ','  #  ','  #  ',' ### '],
'2':[' ### ','#   #','    #','   # ','  #  ',' #   ','#####'],
'3':['#### ','    #','    #',' ### ','    #','    #','#### '],
'4':['   # ','  ## ',' # # ','#  # ','#####','   # ','   # '],
'5':['#####','#    ','#    ','#### ','    #','    #','#### '],
'6':[' ### ','#    ','#    ','#### ','#   #','#   #',' ### '],
'7':['#####','    #','   # ','  #  ',' #   ',' #   ',' #   '],
'8':[' ### ','#   #','#   #',' ### ','#   #','#   #',' ### '],
'9':[' ### ','#   #','#   #',' ####','    #','    #',' ### '],
'B':['#### ','#   #','#   #','#### ','#   #','#   #','#### '],
'A':[' ### ','#   #','#   #','#####','#   #','#   #','#   #'],
'T':['#####','  #  ','  #  ','  #  ','  #  ','  #  ','  #  '],
'E':['#####','#    ','#    ','#### ','#    ','#    ','#####'],
'R':['#### ','#   #','#   #','#### ','# #  ','#  # ','#   #'],
'Y':['#   #','#   #',' # # ','  #  ','  #  ','  #  ','  #  '],
' ':Array(7).fill('     ')};
export function lettering(text){return Array.from({length:7},(_,row)=>[...text].map(c=>(glyphs[c]??glyphs[' '])[row]).join('  ')).join('\n');}
export function graph(result,width,char=14*.6){
 const columns=Math.max(4,Math.min(48,Math.floor(width/char)-8)),rows=6,max=Math.max(result.scenario.reserve,...result.points),lines=[];
 for(let row=0;row<rows;row++){
  const fraction=(rows-row)/rows,value=max*fraction,label=('$'+(max<10?value.toFixed(1):Math.round(value))).padStart(5)+' |';
  const cells=Array.from({length:columns},(_,i)=>{const hour=Math.floor(i*72/columns);if(hour>=result.hours)return '.';const amount=result.points[Math.min(hour,result.points.length-1)];return amount>=value?'#':' ';}).join('');
  lines.push(label+cells);
 }
 lines.push('      +'+ '-'.repeat(columns));return lines.join('\n');
}
export function track(value,min,max,width,char=14*.6){const length=Math.max(4,Math.floor(width/char)-4),position=Math.round((value-min)/(max-min)*(length-1));return '['+'='.repeat(position)+'|'+ '-'.repeat(length-position-1)+']';}
