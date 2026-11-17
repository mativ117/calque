import {Paragraph,TextRun,Table,TableRow,TableCell,WidthType,TableLayoutType,BorderStyle} from 'docx';
import {findColumnBreak} from './pdf-layout.js';
import {visualRun} from './visual-objects.js';
const edge={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const sort=(a,b)=>Math.abs(a.baseline-b.baseline)<2?a.x-b.x:a.baseline-b.baseline;
const styleKey=l=>[l.font,Math.round(l.fontSize*2),l.bold,l.italics].join('|');
// PDF text items are fragments, not paragraphs. First assemble physical lines,
// then join wrapped lines while retaining the style and colour of every run.
export function flowBlocks(input,{columnWidth=Infinity}={}){
 const physical=[];
 for(const line of [...input].sort(sort)){
  const prev=physical.at(-1);
  const runs=line.runs.map(r=>({...r,font:line.font,fontSize:line.fontSize,bold:line.bold,italics:line.italics}));
  if(prev&&Math.abs(prev.baseline-line.baseline)<Math.min(prev.fontSize,line.fontSize)*.2&&line.x>=prev.x+prev.width-2&&line.x-(prev.x+prev.width)<=Math.max(prev.fontSize,line.fontSize)*2){
   if(line.x-(prev.x+prev.width)>line.fontSize*.15)prev.runs.push({...runs[0],text:' '});
   prev.runs.push(...runs);prev.width=line.x+line.width-prev.x;prev.text+=line.text;
  }else physical.push({...line,runs});
 }
 const blocks=[];
 for(const line of physical){
  const previous=blocks.at(-1),gap=previous?line.baseline-previous.lastBaseline:Infinity;
  const continuation=columnWidth>=200||/^[a-zà-ÿ@/]/u.test(line.text)||/[/@]$/.test(previous?.text||'');
  const join=continuation&&previous&&styleKey(previous)===styleKey(line)&&Math.abs(previous.x-line.x)<3&&gap>line.fontSize*.7&&gap<line.fontSize*1.55&&!/^\s*[•▪●]/u.test(line.text);
  if(join){
   const last=previous.runs.at(-1);if(!/[\s/@]$/.test(last.text)&&!/^[@/\s]/.test(line.runs[0].text))previous.runs.push({...line.runs[0],text:' '});
   previous.runs.push(...line.runs);previous.lastBaseline=line.baseline;previous.text+=' '+line.text;
  }else blocks.push({...line,lastBaseline:line.baseline});
 }
 return blocks;
}
function paragraphs(lines,start,width,{objects=[],t}={}){
 // Account for the leading Word anchor paragraph and the table text inset.
 let bottom=15;
 const right=Math.max(0,width-Math.max(...lines.map(l=>l.x-start+l.width+l.fontSize*.5),0));
 const blocks=flowBlocks(lines,{columnWidth:width-(lines.length?Math.min(...lines.map(l=>l.x-start)):0)});
 const events=[...blocks.map(block=>({top:Math.max(0,block.baseline-block.fontSize*.975),bottom:block.lastBaseline+block.fontSize*.225,block})),...objects.map(object=>({top:object.box.y,bottom:object.box.y+object.box.height,object}))].sort((a,b)=>a.top-b.top);
 return events.map(event=>{
  const before=Math.max(0,event.top-bottom);bottom=Math.max(bottom,event.bottom);
  if(event.object){
   const object=event.object,available=Math.max(1,width-Math.max(0,object.box.x-start)-2),scale=Math.min(1,available/object.box.width);
   return new Paragraph({indent:{left:Math.round(Math.max(0,object.box.x-start)*20)},spacing:{before:Math.round(before*20),after:40},run:{size:2},children:[visualRun({...object,box:{...object.box,width:object.box.width*scale,height:object.box.height*scale}},t,object.index,{inline:true})]});
  }
  const block=event.block,maxSize=Math.max(...block.runs.map(run=>run.fontSize));
  return new Paragraph({indent:{left:Math.round(Math.max(0,block.x-start)*20),right:Math.round(right*20)},spacing:{before:Math.round(before*20),after:0,line:Math.round(maxSize*1.2*20),lineRule:'atLeast'},snapToGrid:false,children:block.runs.map(run=>new TextRun({text:run.text,font:run.font,size:Math.max(2,Math.round(run.fontSize*2)),bold:run.bold,italics:run.italics,color:run.color||'000000',...(run.uncertain?{highlight:'yellow'}:{})}))});
 });
}
// Only independent visuals become inline objects. Intentional overlays (table
// grids, labels on shapes) and visuals spanning columns need manual review.
export function partitionVisuals(lines,objects,viewport){
 const split=findColumnBreak(lines,viewport.width),inline=[],floating=[];
 for(const [i,source] of objects.entries()){
  const object={...source,index:i+1},b=object.box;
  const crosses=split!==null&&b.x<split&&b.x+b.width>split;
  const overlays=lines.some(l=>l.x<b.x+b.width-2&&l.x+l.width>b.x+2&&l.baseline-l.fontSize*.8<b.y+b.height-2&&l.baseline+l.fontSize*.2>b.y+2);
  (crosses||overlays||object.kind==='composite'?floating:inline).push(object);
 }
 return {inline,floating};
}
export function flowingContent(lines,viewport,{objects=[],t}={}){
 const split=findColumnBreak(lines,viewport.width);
 if(split===null)return paragraphs(lines,0,viewport.width,{objects,t});
 const columns=[lines.filter(l=>l.x<split),lines.filter(l=>l.x>=split)],widths=[split,viewport.width-split];
 return [new Table({width:{size:Math.round(viewport.width*20),type:WidthType.DXA},columnWidths:widths.map(w=>Math.round(w*20)),layout:TableLayoutType.FIXED,borders:{top:edge,bottom:edge,left:edge,right:edge,insideHorizontal:edge,insideVertical:edge},margins:{top:0,bottom:0,left:0,right:0},rows:[new TableRow({children:columns.map((column,i)=>new TableCell({width:{size:Math.round(widths[i]*20),type:WidthType.DXA},margins:{top:0,bottom:0,left:0,right:0},children:paragraphs(column,i?split:0,widths[i],{objects:objects.filter(o=>i?o.box.x>=split:o.box.x<split),t})}))})]})];
}
