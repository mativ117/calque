import {Paragraph,TextRun,ImageRun} from 'docx';
const IDENTITY=[1,0,0,1,0,0];
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
const normal=text=>String(text).normalize('NFKC').replace(/[\s\u00ad\u200b]/gu,'');
function rgb(args){
 if(typeof args[0]==='string'&&/^#[0-9a-f]{6}$/i.test(args[0]))return args[0].slice(1).toUpperCase();
 const values=args.length===1&&args[0]?.length?Array.from(args[0]):args;
 return values.slice(0,3).map(v=>Math.round(Math.max(0,Math.min(255,v<=1?v*255:v))).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function analyseOperators(operators,ops){
 const stack=[],paints=[],images=[];let state={color:'000000',stroke:'000000',transform:IDENTITY,mode:0},text='',visible=0;
 for(let index=0;index<operators.fnArray.length;index++){
  const op=operators.fnArray[index],args=operators.argsArray[index]||[];
  if(op===ops.save)stack.push({...state,transform:[...state.transform]});
  else if(op===ops.restore)state=stack.pop()||state;
  else if(op===ops.transform)state.transform=multiply(state.transform,args);
  else if(op===ops.setFillRGBColor)state.color=rgb(args)||state.color;
  else if(op===ops.setStrokeRGBColor)state.stroke=rgb(args)||state.stroke;
  else if(op===ops.setFillCMYKColor){const [c,m,y,k]=args;state.color=rgb([255*(1-c)*(1-k),255*(1-m)*(1-k),255*(1-y)*(1-k)]);}
  else if(op===ops.setFillGray){const v=Math.round(Math.max(0,Math.min(1,args[0]))*255).toString(16).padStart(2,'0');state.color=(v+v+v).toUpperCase();}
  else if(op===ops.setTextRenderingMode)state.mode=args[0];
  else if(op===ops.showText||op===ops.showSpacedText||op===ops.nextLineShowText||op===ops.nextLineSetSpacingShowText){
   const glyphs=args.find(value=>Array.isArray(value))||[];
   const value=normal(glyphs.map(glyph=>typeof glyph==='object'?(glyph.unicode||''):'').join(''));
   if(value){const hidden=(state.mode&3)===3;paints.push({start:text.length,end:text.length+value.length,color:(state.mode&3)===1?state.stroke:state.color,hidden});text+=value;if(!hidden)visible+=value.length;}
  }
  if([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject].includes(op)){
   const m=state.transform;images.push({area:Math.abs(m[0]*m[3]-m[1]*m[2])});
  }
 }
 return {text,paints,visibleCharacters:visible,totalCharacters:text.length,images};
}
export function mapFont(info={},style={}){
 const original=String(info.name||style.fontFamily||'Arial').replace(/^[A-Z]{6}\+/,'');
 let font=original.replace(/[-,](Regular|Roman|Bold|Italic|Oblique|BoldItalic|BoldOblique)$/i,'');
 if(/NimbusSans|Helvetica|Arial|sans-serif/i.test(original))font='Arial';
 else if(/NimbusRoman|Times|^serif$/i.test(original))font='Times New Roman';
 else if(/NimbusMono|Courier|monospace/i.test(original))font='Courier New';
 return {font:font.replace(/["<>\r\n]/g,'')||'Arial',bold:!!info.bold||/bold|black|semibold/i.test(original),italics:!!info.italic||/italic|oblique/i.test(original)};
}
function colorAt(paints,position){
 let left=0,right=paints.length-1;
 while(left<=right){const mid=(left+right)>>1,p=paints[mid];if(position<p.start)right=mid-1;else if(position>=p.end)left=mid+1;else return p.color;}
 return '000000';
}
export function findColumnBreak(lines,width){
 const coverage=new Uint8Array(Math.ceil(width)+1),candidates=[];
 for(const line of lines){if(line.width>width*.72)continue;for(let x=Math.max(0,Math.floor(line.x));x<Math.min(coverage.length,Math.ceil(line.x+line.width));x++)coverage[x]=1;}
 let start;
 for(let x=Math.floor(width*.18);x<width*.88;x++){
  if(!coverage[x]&&start===undefined)start=x;
  if(coverage[x]&&start!==undefined){
   if(x-start>=12){const middle=(start+x)/2;const left=lines.filter(l=>l.x+l.width<=middle).reduce((n,l)=>n+l.text.length,0),right=lines.filter(l=>l.x>=middle).reduce((n,l)=>n+l.text.length,0),total=left+right;
    if(total&&left/total>=.12&&right/total>=.12)candidates.push({middle,width:x-start});}
   start=undefined;
  }
 }
 return candidates.sort((a,b)=>b.width-a.width)[0]?.middle??null;
}
export function orderLines(lines,viewport){
 const split=findColumnBreak(lines,viewport.width);
 const footer=line=>line.baseline>viewport.height*.94;
 const spanning=line=>split!==null&&line.x<split&&line.x+line.width>split;
 const header=lines.filter(line=>!footer(line)&&spanning(line));
 const rest=lines.filter(line=>!footer(line)&&!spanning(line));
 const sort=(a,b)=>Math.abs(a.baseline-b.baseline)<2?a.x-b.x:a.baseline-b.baseline;
 const ordered=split===null?[...rest].sort(sort):[...rest.filter(l=>l.x<split).sort(sort),...rest.filter(l=>l.x>=split).sort(sort)];
 return {lines:[...header.sort(sort),...ordered,...lines.filter(footer).sort(sort)],columns:split===null?1:2};
}
export function nativeLayout(content,viewport,fontInfo,operatorAnalysis){
 const lines=[];let cursor=0;
 for(const item of content.items){
  if(!item.str?.trim())continue;
  const m=multiply(viewport.transform||IDENTITY,item.transform),size=Math.hypot(m[0],m[1]);
  if(!Number.isFinite(size)||size<1)continue;
  const angle=Math.atan2(m[1],m[0])*180/Math.PI;
  const style=mapFont(fontInfo(item.fontName),content.styles[item.fontName]);
  const key=normal(item.str);let offset=operatorAnalysis.text.indexOf(key,cursor);
  if(offset<0)offset=operatorAnalysis.text.indexOf(key);
  if(offset>=0)cursor=offset+key.length;
  let character=0;const runs=[];
  for(const letter of item.str){
   const color=offset<0?'000000':colorAt(operatorAnalysis.paints,offset+character);
   if(runs.length&&runs.at(-1).color===color)runs.at(-1).text+=letter;else runs.push({text:letter,color});
   character+=normal(letter).length;
  }
  lines.push({x:m[4],baseline:m[5],width:Math.max(1,item.width),height:Math.max(1,item.height),fontSize:size,angle,text:item.str,runs,...style});
 }
 return orderLines(lines,viewport);
}
export function backgroundParagraph(data,viewport){
 return new Paragraph({run:{size:2},spacing:{before:0,after:0,line:20,lineRule:'exact'},children:[new ImageRun({type:'png',data,transformation:{width:viewport.width*96/72,height:viewport.height*96/72},floating:{horizontalPosition:{relative:'page',offset:0},verticalPosition:{relative:'page',offset:0},behindDocument:true,allowOverlap:true,layoutInCell:false}})]});
}
export function pageAnchor(){return new Paragraph({run:{size:2},spacing:{before:0,after:0,line:20,lineRule:'exact'},children:[new TextRun({text:'',size:2})]});}
export function scanLayout(data,width,height,viewport){
 const lines=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
  const words=(line.words||[]).filter(w=>w.text?.trim()&&w.bbox);if(!words.length)continue;
  const groups=[];let current=[];
  for(const word of words){
   const previous=current.at(-1),gap=previous?word.bbox.x0-previous.bbox.x1:0;
   if(previous&&gap>Math.max((word.bbox.y1-word.bbox.y0)*2.5,width*.025)){groups.push(current);current=[];}
   current.push(word);
  }
  if(current.length)groups.push(current);
  for(const group of groups){
   const x=Math.min(...group.map(w=>w.bbox.x0)),y=Math.min(...group.map(w=>w.bbox.y0)),right=Math.max(...group.map(w=>w.bbox.x1)),bottom=Math.max(...group.map(w=>w.bbox.y1));
   const sx=viewport.width/width,sy=viewport.height/height,text=group.map(w=>w.text).join(' '),caps=text.replace(/[^a-z]/gi,'').length>2&&text===text.toUpperCase();
   const fontSize=Math.max(5,(bottom-y)*sy*(caps?1.35:1.1));
   lines.push({x:x*sx,baseline:y*sy+fontSize*.75,width:(right-x)*sx,height:(bottom-y)*sy,fontSize,angle:0,text,font:'Arial',bold:false,italics:false,runs:group.map((w,i)=>({text:w.text+(i===group.length-1?'':' '),color:'000000',uncertain:!Number.isFinite(w.confidence)||w.confidence<85,confidence:w.confidence}))});
  }
 }
 return orderLines(lines,viewport);
}
