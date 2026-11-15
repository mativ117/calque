import { OPS } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { translator, UserError } from './i18n.js';
import { Document, Packer, Paragraph, TextRun, SectionType, PageOrientation } from 'docx';
import { checkAbort } from './document-source.js';
import { ocrParagraphs } from './ocr-format.js';
import { prepareScan, recognitionScore } from './scan-quality.js';
import { validateWord } from './word-validation.js';
const MAX_PIXELS=12_000_000;
const IMAGE_OPS=new Set(Object.entries(OPS).filter(([name])=>/paint.*Image/.test(name)).map(([,value])=>value));
const GRAPHIC_OPS=new Set(Object.entries(OPS).filter(([name])=>/constructPath|shadingFill|paint.*Image/.test(name)).map(([,value])=>value));
function dimensions(page,t) {
 const view=page.getViewport({scale:1});
 if(Math.min(view.width,view.height)<72||Math.max(view.width,view.height)>1584)throw new UserError(t('errorDimensions'));
 return view;
}
function properties(view) {
 const landscape=view.width>view.height;
 return {type:SectionType.NEXT_PAGE,page:{size:{width:Math.round((landscape?view.height:view.width)*20),height:Math.round((landscape?view.width:view.height)*20),orientation:landscape?PageOrientation.LANDSCAPE:PageOrientation.PORTRAIT},margin:{top:480,bottom:480,left:480,right:480,header:0,footer:0}}};
}
export async function renderPageCanvas(page,{signal,dpi=96,maxPixels=MAX_PIXELS}={}) {
 const view=page.getViewport({scale:1});const scale=Math.min(dpi/72,Math.sqrt(maxPixels/(view.width*view.height)));
 const canvas=document.createElement('canvas'),viewport=page.getViewport({scale});
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const task=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
 const abort=()=>task.cancel();signal?.addEventListener('abort',abort,{once:true});
 try{await task.promise;checkAbort(signal);return canvas;}
 catch(error){canvas.width=canvas.height=0;checkAbort(signal);throw error;}
 finally{signal?.removeEventListener('abort',abort);}
}
function nativeText(content) {
 const children=[],lines=[];let words=[],previousY;
 const flush=()=>{if(words.length){lines.push({words:words.map(word=>({text:word.text}))});children.push(new Paragraph({spacing:{before:0,after:0},children:words.map(word=>new TextRun(word))}));}words=[];};
 for(const item of content.items){
  if(!('str'in item)||!item.str.trim())continue;
  const y=item.transform[5];if(previousY!==undefined&&Math.abs(y-previousY)>3)flush();
  const style=content.styles[item.fontName]||{},font=(style.fontFamily||'Arial').replace(/["']/g,'');
  words.push({text:item.str+' ',font,size:Math.round(Math.max(5,Math.min(144,Math.hypot(item.transform[2],item.transform[3]))))*2,bold:/bold/i.test(item.fontName+font),italics:/italic|oblique/i.test(item.fontName+font)});
  previousY=y;if(item.hasEOL)flush();
 }
 flush();return {children,lines};
}
async function recognizeScan(worker,canvas,signal,quality) {
 const options={rotateAuto:true};
 let {data}=await worker.recognize(canvas,options,{text:true,blocks:true});checkAbort(signal);
 let best=recognitionScore(data),rotation=0;
 // Une page uniforme n’est pas tournée dans l’espoir d’y inventer du texte.
 if(quality.deviation>3 && (best.confidence<65 || best.letters<8)) {
  for(const angle of [90,180,270]) {
   const candidate=document.createElement('canvas');candidate.width=angle%180?canvas.height:canvas.width;candidate.height=angle%180?canvas.width:canvas.height;
   const ctx=candidate.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,candidate.width,candidate.height);
   ctx.translate(candidate.width/2,candidate.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);
   try {
    const result=await worker.recognize(candidate,options,{text:true,blocks:true});checkAbort(signal);
    const score=recognitionScore(result.data);
    if(score.letters>=8 && score.score>best.score+15){data=result.data;best=score;rotation=angle;}
   } finally{candidate.width=candidate.height=0;}
  }
 }
 const adjustments=[];
 if(rotation)adjustments.push('orientationAdjusted');
 if(Math.abs(data.rotateRadians||0)>=.005)adjustments.push('deskewAdjusted');
 return {data,adjustments};
}
export async function convertDocument(source,{signal,onProgress=()=>{},t=translator('fr')}={}) {
 const sections=[],reports=[],alerts=[];let worker,currentPage=0,ocrPages=0;
 const stop=()=>{if(worker)void worker.terminate();};signal?.addEventListener('abort',stop,{once:true});
 try {
  for(let number=1;number<=source.numPages;number++) {
   currentPage=number;checkAbort(signal);
   onProgress({page:number,total:source.numPages,progress:(number-1)/source.numPages*92,phase:t('phaseConvert')});
   const page=await source.getPage(number);
   try {
    const view=dimensions(page,t),content=await page.getTextContent(),operators=await page.getOperatorList();
    const images=operators.fnArray.some(op=>IMAGE_OPS.has(op));
    const warnings=[],adjustments=[];
    if(operators.fnArray.some(op=>GRAPHIC_OPS.has(op)))warnings.push('elements');
    if(page.getAnnotations && (await page.getAnnotations()).length)warnings.push('annotations');
    const native=content.items.some(item=>'str'in item&&item.str.trim())&&!images&&!content.items.some(item=>'str'in item&&/[\u0000-\u0008\uFFFD]/.test(item.str));
    let children,lines,quality=null;
    if(native){const result=nativeText(content);children=result.children;lines=result.lines;}
    else {
     if(!worker){
      onProgress({page:number,total:source.numPages,progress:(number-1)/source.numPages*92,phase:t('phaseLoad')});
      worker=await createWorker('fra+eng+nld',1,{workerPath:resource('ocr/worker.min.js'),corePath:resource('ocr/'),langPath:resource('ocr/'),workerBlobURL:false,gzip:false,cacheMethod:'none',errorHandler:()=>{},logger:message=>{
       if(message.status==='recognizing text')onProgress({page:number,total:source.numPages,progress:(number-1+message.progress*.75)/source.numPages*92,phase:t('phaseRead')});
      }});
      checkAbort(signal);await worker.setParameters({classify_enable_learning:'0',user_defined_dpi:'300'});
     }
     const original=await renderPageCanvas(page,{signal,dpi:300});let prepared;
     try {
      const preparation=await prepareScan(original,signal);prepared=preparation.canvas;quality=preparation.quality;
      warnings.push(...quality.warnings,'scanLayout');adjustments.push(...preparation.adjustments);
      if(page.originalPixels&&Math.min(page.originalPixels.width,page.originalPixels.height)<800)warnings.push('resolution');
      const recognition=await recognizeScan(worker,prepared,signal,quality);adjustments.push(...recognition.adjustments);
      const result=ocrParagraphs(recognition.data,number,t);children=result.children;
      lines=(recognition.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[])).map(line=>({words:(line.words||[]).filter(word=>word.text?.trim()).map(word=>({text:word.text,confidence:word.confidence}))}));
      if(result.alert)alerts.push(result.alert);
      ocrPages++;
     } finally{if(prepared&&prepared!==original)prepared.width=prepared.height=0;original.width=original.height=0;}
    }
    const unique=[...new Set(warnings)];
    for(const warning of unique)children.push(new Paragraph({spacing:{before:100,after:60},children:[new TextRun({text:t('wordWarning',{page:number,message:t('warning_'+warning)}),size:18,color:'7C5423',highlight:'yellow'})]}));
    reports.push({page:number,kind:native?'text':'scan',lines,warnings:unique,adjustments:[...new Set(adjustments)],quality:quality?{mean:quality.mean,sharpness:quality.sharpness}:null});
    sections.push({properties:properties(view),children});
   } finally{page.cleanup();}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  checkAbort(signal);onProgress({page:source.numPages,total:source.numPages,progress:95,phase:t('phaseWord')});
  const doc=new Document({creator:'',lastModifiedBy:'',title:'',description:'',styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{after:0}}}}},sections});
  const blob=await Packer.toBlob(doc);checkAbort(signal);
  onProgress({page:source.numPages,total:source.numPages,progress:98,phase:t('phaseValidate')});
  const validation=await validateWord(blob,reports,source.numPages,t);checkAbort(signal);
  return {blob,reports,alerts,ocrPages,pages:source.numPages,validation};
 } catch(error){checkAbort(signal);throw new UserError(t('errorAtPage',{page:currentPage||1,message:error instanceof UserError?error.message:t('errorGeneric')}));}
 finally{signal?.removeEventListener('abort',stop);if(worker)await worker.terminate();}
}
const ROOT=new URL(import.meta.env.BASE_URL,window.location.href);
const resource=path=>new URL(path,ROOT).href;
