import {ImageRun} from 'docx';
import {checkAbort} from './abort.js';
const LIMIT=16;
const touches=(a,b,pad=3)=>a.x<=b.x+b.width+pad&&a.x+a.width+pad>=b.x&&a.y<=b.y+b.height+pad&&a.y+a.height+pad>=b.y;
const union=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x),height:Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y)});
export function visualGroups(operators,ops,bounds,view){
 if(!bounds)return {groups:[],limited:true};
 const groups=[];let limited=false;
 for(let i=0;i<operators.fnArray.length;i++){
  const op=operators.fnArray[i],image=/^paint.*Image/.test(Object.keys(ops).find(name=>ops[name]===op)||'');
  const path=op===ops.constructPath,shade=op===ops.shadingFill;
  if(!image&&!path&&!shade||bounds.isEmpty(i))continue;
  if(path&&[ops.endPath,ops.clip,ops.eoClip].includes(operators.argsArray[i]?.[0]))continue;
  const x=Math.max(0,bounds.minX(i)*view.width),y=Math.max(0,bounds.minY(i)*view.height);
  const box={x,y,width:Math.min(view.width,bounds.maxX(i)*view.width)-x,height:Math.min(view.height,bounds.maxY(i)*view.height)-y};
  // Full-page decorations and fine rules remain in the background.
  if(image&&(box.width<2||box.height<2||box.width*box.height>view.width*view.height*.45))limited=true;
  if(box.width<2||box.height<2||box.width*box.height>view.width*view.height*.45||(!image&&((box.height>view.height*.75&&box.width>view.width*.2)||(box.width>view.width*.8&&box.height>view.height*.2)))||(!image&&(box.height<4||box.width<4)))continue;
  if(!image&&((box.width>view.width*.5&&box.height<view.height*.025)||(box.height>view.height*.7&&box.width<view.width*.05)))continue;
  let group={...box,indices:[i],image,vector:!image};
  for(let j=groups.length-1;j>=0;j--)if(touches(group,groups[j])){const prev=groups.splice(j,1)[0];group={...union(group,prev),indices:[...group.indices,...prev.indices],image:group.image||prev.image,vector:group.vector||prev.vector};j=groups.length;}
  groups.push(group);
  if(groups.length>256){limited=true;break;}
 }
 const safe=groups.filter(g=>g.width*g.height<view.width*view.height*.5).sort((a,b)=>Math.min(...a.indices)-Math.min(...b.indices));
 return {groups:safe.slice(0,LIMIT),limited:limited||safe.length>LIMIT};
}
async function png(canvas){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG encoding failed');return new Uint8Array(await blob.arrayBuffer());}
function crop(canvas,box,view,pad=3){
 const sx=canvas.width/view.width,sy=canvas.height/view.height;
 const x=Math.max(0,Math.floor((box.x-pad)*sx)),y=Math.max(0,Math.floor((box.y-pad)*sy));
 const right=Math.min(canvas.width,Math.ceil((box.x+box.width+pad)*sx)),bottom=Math.min(canvas.height,Math.ceil((box.y+box.height+pad)*sy));
 const out=document.createElement('canvas');out.width=Math.max(1,right-x);out.height=Math.max(1,bottom-y);out.getContext('2d').drawImage(canvas,x,y,out.width,out.height,0,0,out.width,out.height);
 return {canvas:out,box:{x:x/sx,y:y/sy,width:out.width/sx,height:out.height/sy}};
}
// Compare the complete reconstructed graphic layer, including alpha. Effects that
// cannot be separated safely keep their original composited appearance instead.
export function visualDifference(a,b){
 let bad=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255));delta=Math.max(delta,Math.abs(a[i+3]-b[i+3]));if(delta>12)bad++;}
 return bad/(a.length/4||1);
}
export async function extractVisuals(page,operators,ops,view,render,{signal,lines=[]}={}){
 const textOps=new Set([ops.showText,ops.showSpacedText,ops.nextLineShowText,ops.nextLineSetSpacingShowText]);
 const graphicOps=new Set(Object.entries(ops).filter(([name])=>/^paint.*Image|^constructPath$|^shadingFill$|^(?:eo)?fill$|^stroke$|^fillStroke$|^eoFillStroke$|^closeStroke$/.test(name)).map(([,value])=>value));
 const clipPath=index=>operators.fnArray[index]===ops.constructPath&&[ops.endPath,ops.clip,ops.eoClip].includes(operators.argsArray[index]?.[0]);
 const keep=index=>!textOps.has(operators.fnArray[index]);
 page.clearRecordedBounds?.();
 let reference=await render(page,{signal,dpi:300,transparent:true,recordOperations:true,operationsFilter:keep});
 let residual,composite,labelsInReference=false;const temporary=[],excludedLines=new Set();
 try{
  const selection=visualGroups(operators,ops,page.getRecordedBounds?.(),view),groups=selection.groups;
  if(!groups.length)return {background:await png(reference),objects:[],limited:selection.limited,flattened:false};
  const capturedText=new Set();
  for(const group of groups){
   group.textIndices=new Set();
   if(group.image)continue;
   const inside=line=>line.x>=group.x&&line.x+line.width<=group.x+group.width&&line.baseline>=group.y&&line.baseline<=group.y+group.height;
   const labels=lines.filter(inside);
   const rows=new Set(labels.map(l=>Math.round(l.baseline/4))),columns=new Set(labels.map(l=>Math.round(l.x/8)));
   // A grid with several rows and columns keeps its text editable. Do not
   // mistake a table for a diagram and bake all cell contents into an image.
   if(labels.length>=4&&rows.size>=2&&columns.size>=2)continue;
   for(const line of labels){
    if(!line.paintIndices?.length||line.paintIndices.some(index=>lines.some(other=>!inside(other)&&other.paintIndices?.includes(index))))continue;
    excludedLines.add(line);for(const index of line.paintIndices){group.textIndices.add(index);capturedText.add(index);}
   }
  }
  if(capturedText.size){const labeled=await render(page,{signal,dpi:300,transparent:true,operationsFilter:index=>keep(index)||capturedText.has(index)});reference.width=reference.height=0;reference=labeled;labelsInReference=true;}
  const removed=new Set(groups.flatMap(g=>g.indices));
  residual=await render(page,{signal,dpi:300,transparent:true,operationsFilter:index=>keep(index)&&(!removed.has(index)||clipPath(index))});
  const objects=[];
  for(const group of groups){
   checkAbort(signal);const selected=new Set(group.indices);
   const isolated=await render(page,{signal,dpi:300,transparent:true,operationsFilter:index=>(keep(index)||group.textIndices.has(index))&&(!graphicOps.has(operators.fnArray[index])||selected.has(index)||clipPath(index))});
   try{const cut=crop(isolated,group,view);temporary.push(cut.canvas);objects.push({box:cut.box,canvas:cut.canvas,kind:group.image?'picture':'diagram',vector:group.vector});}finally{isolated.width=isolated.height=0;}
  }
  composite=document.createElement('canvas');composite.width=reference.width;composite.height=reference.height;
  const ctx=composite.getContext('2d');ctx.drawImage(residual,0,0);
  for(const object of objects)ctx.drawImage(object.canvas,Math.round(object.box.x*reference.width/view.width),Math.round(object.box.y*reference.height/view.height));
  const difference=visualDifference(reference.getContext('2d').getImageData(0,0,reference.width,reference.height).data,ctx.getImageData(0,0,composite.width,composite.height).data);
  const flattened=difference>.0001;
  if(flattened){
   // Rectangular snapshots preserve stacking and blend effects. Merge intersecting
   // boxes first so each pixel belongs to just one object or the background.
   const merged=[];
   for(const object of objects){let box={...object.box};for(let j=merged.length-1;j>=0;j--)if(touches(box,merged[j],6)){box=union(box,merged.splice(j,1)[0]);j=merged.length;}merged.push(box);}
   residual.width=residual.width;residual.getContext('2d').drawImage(reference,0,0);objects.length=0;
   for(const box of merged){const cut=crop(reference,box,view,0);temporary.push(cut.canvas);objects.push({box:cut.box,canvas:cut.canvas,kind:'composite',vector:true});const sx=reference.width/view.width,sy=reference.height/view.height;residual.getContext('2d').clearRect(Math.round(cut.box.x*sx),Math.round(cut.box.y*sy),cut.canvas.width,cut.canvas.height);}
  }
  const hasBackground=operators.fnArray.some((op,index)=>graphicOps.has(op)&&!removed.has(index)&&!clipPath(index));
  return {background:hasBackground||flattened?await png(residual):null,objects:await Promise.all(objects.map(async o=>({box:o.box,data:await png(o.canvas),kind:o.kind,vector:o.vector}))),limited:selection.limited,flattened,excludedLines};
 }catch(error){checkAbort(signal);if(!reference.width)throw error;return {background:await png(reference),objects:[],limited:true,flattened:false,excludedLines:labelsInReference?excludedLines:new Set()};
 }finally{reference.width=reference.height=0;if(residual)residual.width=residual.height=0;if(composite)composite.width=composite.height=0;for(const canvas of temporary)canvas.width=canvas.height=0;}
}
export function visualRun(object,t,index,{inline=false}={}){
 const box=object.box;
 return new ImageRun({type:'png',data:object.data,altText:{name:t('visualName',{index}),description:t(object.kind==='picture'?'visualPictureDescription':object.kind==='scan'?'visualScanDescription':'visualDiagramDescription'),title:t('visualName',{index})},transformation:{width:box.width*96/72,height:box.height*96/72},...(inline?{}:{floating:{horizontalPosition:{relative:'page',offset:Math.round(box.x*12700)},verticalPosition:{relative:'page',offset:Math.round(box.y*12700)},allowOverlap:true,behindDocument:true,layoutInCell:false,zIndex:100+index,wrap:{type:'none'}}})});
}
// Conservative scan segmentation: remove recognised word rectangles from a small
// working image, then retain sizeable connected graphic regions. This is a
// heuristic, never a claim that all illustrations have been found.
export function scanRegions(pixels,data,sourceWidth,sourceHeight){
 const {width,height}=pixels,ink=new Uint8Array(width*height),queue=new Uint32Array(width*height);
 for(let i=0;i<ink.length;i++){const p=i*4;ink[i]=pixels.data[p]*.299+pixels.data[p+1]*.587+pixels.data[p+2]*.114<210?1:0;}
 const sx=width/sourceWidth,sy=height/sourceHeight;
 for(const b of data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const word of l.words||[]){
  const box=word.bbox;if(!box)continue;
  const x0=Math.max(0,Math.floor(box.x0*sx)-2),x1=Math.min(width,Math.ceil(box.x1*sx)+2),y0=Math.max(0,Math.floor(box.y0*sy)-2),y1=Math.min(height,Math.ceil(box.y1*sy)+2);
  for(let y=y0;y<y1;y++)ink.fill(0,y*width+x0,y*width+x1);
 }
 const regions=[];
 for(let seed=0;seed<ink.length;seed++){
  if(!ink[seed])continue;ink[seed]=0;let head=0,tail=1;queue[0]=seed;let minX=width,minY=height,maxX=0,maxY=0;
  while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const j of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1])if(j>=0&&ink[j]){ink[j]=0;queue[tail++]=j;}
  }
  const w=maxX-minX+1,h=maxY-minY+1,area=w*h;
  if(w<width*.06||h<height*.035||area<width*height*.004||area>width*height*.35||tail/area<.08||w/h>15||h/w>15)continue;
  regions.push({x:Math.max(0,minX-2)/sx,y:Math.max(0,minY-2)/sy,width:(Math.min(width,maxX+3)-Math.max(0,minX-2))/sx,height:(Math.min(height,maxY+3)-Math.max(0,minY-2))/sy});
 }
 const merged=[];
 for(const region of regions){let box=region;for(let j=merged.length-1;j>=0;j--)if(touches(box,merged[j],4/sx)){box=union(box,merged.splice(j,1)[0]);j=merged.length;}merged.push(box);}
 return merged.filter(b=>b.width*b.height<sourceWidth*sourceHeight*.4).slice(0,8);
}
export async function extractScanVisuals(original,recognition,view,{signal}={}){
 if(Math.abs(recognition.data.rotateRadians||0)>.005)return {objects:[],skipped:true};
 let aligned=original;const temporary=[];
 try{
  if(recognition.rotation){aligned=document.createElement('canvas');aligned.width=recognition.width;aligned.height=recognition.height;temporary.push(aligned);const ctx=aligned.getContext('2d');ctx.translate(aligned.width/2,aligned.height/2);ctx.rotate(recognition.rotation*Math.PI/180);ctx.drawImage(original,-original.width/2,-original.height/2);}
  const sample=document.createElement('canvas');temporary.push(sample);const scale=Math.min(1,900/Math.max(aligned.width,aligned.height));sample.width=Math.max(1,Math.round(aligned.width*scale));sample.height=Math.max(1,Math.round(aligned.height*scale));const ctx=sample.getContext('2d');ctx.drawImage(aligned,0,0,sample.width,sample.height);
  const regions=scanRegions(ctx.getImageData(0,0,sample.width,sample.height),recognition.data,aligned.width,aligned.height),objects=[];
  for(const region of regions){checkAbort(signal);const box={x:region.x/aligned.width*view.width,y:region.y/aligned.height*view.height,width:region.width/aligned.width*view.width,height:region.height/aligned.height*view.height};const cut=crop(aligned,box,view,0);temporary.push(cut.canvas);objects.push({box:cut.box,data:await png(cut.canvas),kind:'scan',vector:true});}
  return {objects,skipped:false};
 }finally{for(const canvas of temporary)canvas.width=canvas.height=0;}
}
export function outsideVisuals(lines,objects){
 return lines.filter(line=>!objects.some(({box})=>line.x>=box.x-1&&line.x+line.width<=box.x+box.width+1&&line.baseline>=box.y&&line.baseline<=box.y+box.height));
}
