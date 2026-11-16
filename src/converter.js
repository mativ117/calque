import {flowingContent} from './flow-layout.js';
import { OPS } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { translator, UserError } from './i18n.js';
import { Document, Packer, Paragraph, TextRun, SectionType, PageOrientation,Header,CommentRangeStart,CommentRangeEnd,CommentReference } from 'docx';
import { checkAbort } from './abort.js';
import {pageSelection,textBudget} from './workload.js';
import { ocrParagraphs } from './ocr-format.js';
import { prepareScan, recognitionScore } from './scan-quality.js';
import { validateWord } from './word-validation.js';
import {analyseOperators,nativeLayout,scanLayout,backgroundParagraph,pageAnchor} from './pdf-layout.js';
const MAX_PIXELS=12_000_000;
const IMAGE_OPS=new Set(Object.entries(OPS).filter(([name])=>/paint.*Image/.test(name)).map(([,value])=>value));
const GRAPHIC_OPS=new Set(Object.entries(OPS).filter(([name])=>/constructPath|shadingFill|paint.*Image/.test(name)).map(([,value])=>value));
function dimensions(page,t) {
 const view=page.getViewport({scale:1});
 if(Math.min(view.width,view.height)<72||Math.max(view.width,view.height)>1584)throw new UserError(t('errorDimensions'));
 return view;
}
function properties(view,positioned=false) {
 const landscape=view.width>view.height;
 return {type:SectionType.NEXT_PAGE,page:{size:{width:Math.round((landscape?view.height:view.width)*20),height:Math.round((landscape?view.width:view.height)*20),orientation:landscape?PageOrientation.LANDSCAPE:PageOrientation.PORTRAIT},margin:{top:positioned?0:480,bottom:positioned?0:480,left:positioned?0:480,right:positioned?0:480,header:0,footer:0}}};
}
export async function renderPageCanvas(page,{signal,dpi=96,maxPixels=MAX_PIXELS,operationsFilter}={}) {
 const view=page.getViewport({scale:1});const scale=Math.min(dpi/72,Math.sqrt(maxPixels/(view.width*view.height)));
 const canvas=document.createElement('canvas'),viewport=page.getViewport({scale});
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const task=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)',operationsFilter});
 const abort=()=>task.cancel();signal?.addEventListener('abort',abort,{once:true});
 try{await task.promise;checkAbort(signal);return canvas;}
 catch(error){canvas.width=canvas.height=0;checkAbort(signal);throw error;}
 finally{signal?.removeEventListener('abort',abort);}
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
 return {data,adjustments,width:rotation%180?canvas.height:canvas.width,height:rotation%180?canvas.width:canvas.height};
}
export async function convertDocument(source,{signal,onProgress=()=>{},t=translator('fr'),firstPage=1,lastPage=source.numPages}={}) {
 const selection=pageSelection(source.numPages,firstPage,lastPage);if(!selection)throw new UserError(t('errorRange'));
 const budget=textBudget(t);
 const sections=[],reports=[],alerts=[],comments=[];let worker,currentPage=firstPage,ocrPages=0,workerPages=0;
 const notify=(phase,fraction=0,percent=null)=>onProgress({page:currentPage,total:source.numPages,completed:reports.length,selectedTotal:selection.count,scanPages:ocrPages,progress:percent??Math.min(92,((currentPage-firstPage+fraction)/selection.count)*92),phase});
 const stop=()=>{if(worker)void worker.terminate();};signal?.addEventListener('abort',stop,{once:true});
 try {
  for(let number=firstPage;number<=lastPage;number++) {
   currentPage=number;checkAbort(signal);
   notify(t('phaseConvert'));
   const page=await source.getPage(number);
   try {
    const view=dimensions(page,t),content=await page.getTextContent(),operators=await page.getOperatorList();
    const images=operators.fnArray.some(op=>IMAGE_OPS.has(op));
    const warnings=[],adjustments=[];
    const analysis=analyseOperators(operators,OPS);
    const imageCoverage=Math.max(0,...analysis.images.map(image=>image.area/(view.width*view.height)));
    const hasGraphics=operators.fnArray.some(op=>GRAPHIC_OPS.has(op));
    if(page.getAnnotations && (await page.getAnnotations()).length)warnings.push('annotations');
    const visibleText=analysis.totalCharacters===0||analysis.visibleCharacters/analysis.totalCharacters>.8;
    const native=content.items.some(item=>'str'in item&&item.str.trim())&&visibleText&&(!images||imageCoverage<.6||analysis.visibleCharacters>=400)&&!content.items.some(item=>'str'in item&&/[\u0000-\u0008\uFFFD]/.test(item.str));
    let pageBackground=null;
    let children,lines,quality=null,note='',positioned=true,layoutStats={columns:1},outputView=view;
    if(native){
     budget.reserve(content.items.reduce((length,item)=>length+('str'in item?item.str.length:0),0));
     const paintTextOps=new Set([OPS.showText,OPS.showSpacedText,OPS.nextLineShowText,OPS.nextLineSetSpacingShowText]);
     const result=nativeLayout(content,view,name=>page.getFontInfo?.(name)||{},analysis);layoutStats={columns:result.columns};
     if(result.lines.some(line=>Math.abs(line.angle)>1)){
      // Recover rotated text and its colours in reading order; warn about changed layout.
      children=result.lines.map(line=>new Paragraph({children:line.runs.map(run=>new TextRun({text:run.text,font:line.font,size:Math.round(line.fontSize*2),bold:line.bold,italics:line.italics,color:run.color}))}));lines=result.lines.map(line=>({words:[{text:line.text}]}));positioned=false;warnings.push('rotatedLayout');
     }else{
      let background;
      if(hasGraphics){
       const canvas=await renderPageCanvas(page,{signal,dpi:216,operationsFilter:index=>!paintTextOps.has(operators.fnArray[index])});
       try{const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new UserError(t('errorImage'));background=new Uint8Array(await png.arrayBuffer());checkAbort(signal);}finally{canvas.width=canvas.height=0;}
       warnings.push('visualLayer');
      }
      pageBackground=background?backgroundParagraph(background,view):null;
      children=[pageAnchor(),...flowingContent(result.lines,view)];
      lines=result.lines.map(line=>({words:[{text:line.text}]}));adjustments.push('positionedLayout');
     }
    }
    else {
     if(!worker){
      notify(t('phaseLoad'));
      worker=await createWorker('fra+eng+nld',1,{workerPath:resource('ocr/worker.min.js'),corePath:resource('ocr/'),langPath:resource('ocr/'),workerBlobURL:false,gzip:false,cacheMethod:'none',errorHandler:()=>{},logger:message=>{
       if(message.status==='recognizing text')notify(t('phaseRead'),message.progress*.75);
      }});
      checkAbort(signal);await worker.setParameters({classify_enable_learning:'0',user_defined_dpi:'300'});
     }
     const original=await renderPageCanvas(page,{signal,dpi:300});let prepared;
     try {
      const preparation=await prepareScan(original,signal);prepared=preparation.canvas;quality=preparation.quality;
      warnings.push(...quality.warnings,'scanLayout');adjustments.push(...preparation.adjustments);
      if(page.originalPixels&&Math.min(page.originalPixels.width,page.originalPixels.height)<800)warnings.push('resolution');
      const recognition=await recognizeScan(worker,prepared,signal,quality);adjustments.push(...recognition.adjustments);
      budget.reserve((recognition.data.text||'').length);
      const result=ocrParagraphs(recognition.data,number,t);note=t('wordPrefix',{page:number})+result.note;
      if(recognition.width!==prepared.width)outputView={width:view.height,height:view.width};
      const layout=scanLayout(recognition.data,recognition.width,recognition.height,outputView);layoutStats={columns:layout.columns};
      children=[pageAnchor(),...flowingContent(layout.lines,outputView)];
      if(!layout.lines.length)children.push(new Paragraph({children:[new TextRun({text:t('wordEmpty'),size:22})]}));
      lines=(recognition.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[])).map(line=>({words:(line.words||[]).filter(word=>word.text?.trim()).map(word=>({text:word.text,confidence:word.confidence}))}));
      if(result.alert)alerts.push(result.alert);
      ocrPages++;workerPages++;
     } finally{if(prepared&&prepared!==original)prepared.width=prepared.height=0;original.width=original.height=0;}
    }
    const unique=[...new Set(warnings)];
    const notes=[note,...unique.map(warning=>t('wordWarning',{page:number,message:t('warning_'+warning)}))].filter(Boolean);
    if(notes.length){
     const id=comments.length;comments.push({id,author:'Calque',initials:'C',children:notes.map(text=>new Paragraph({children:[new TextRun(text)]}))});
     // Anchor to an existing line; keep diagnostics out of the document's visible flow.
     const target=children[0];
     target.addChildElement(new CommentRangeStart(id));target.addChildElement(new CommentRangeEnd(id));target.addChildElement(new TextRun({children:[new CommentReference(id)],size:2,vanish:true}));
    }
    reports.push({page:number,kind:native?'text':'scan',layout:layoutStats,lines,warnings:unique,adjustments:[...new Set(adjustments)],quality:quality?{mean:quality.mean,sharpness:quality.sharpness}:null});
    sections.push({properties:properties(outputView,positioned),headers:{default:new Header({children:[pageBackground||pageAnchor()]})},children});
   } finally{page.cleanup();}
   notify(t('phaseConvert'),1);
   // Periodically release OCR working memory; keep source and review text in the tab.
   if(worker&&workerPages>=12&&number<lastPage){await worker.terminate();worker=null;workerPages=0;}
   if((number-firstPage+1)%8===0)await source.releaseWorkingData?.();
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  checkAbort(signal);notify(t('phaseWord'),0,95);
  let doc=new Document({creator:'',lastModifiedBy:'',title:'',description:'',comments:{children:comments},styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{after:0}}}}},sections});
  const blob=await Packer.toBlob(doc);doc=null;sections.length=0;checkAbort(signal);
  notify(t('phaseValidate'),0,98);
  const validation=await validateWord(blob,reports,selection.count,t,{signal,firstPage});checkAbort(signal);
  return {blob,reports,alerts,ocrPages,pages:selection.count,firstPage,lastPage,totalSourcePages:source.numPages,validation};
 } catch(error){checkAbort(signal);throw new UserError(t('errorAtPage',{page:currentPage||1,message:error instanceof UserError?error.message:t('errorGeneric')}));}
 finally{signal?.removeEventListener('abort',stop);if(worker)await worker.terminate();await source.releaseWorkingData?.();}
}
const ROOT=new URL(import.meta.env.BASE_URL,window.location.href);
const resource=path=>new URL(path,ROOT).href;
