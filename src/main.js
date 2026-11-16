import './style.css';
import { openDocument } from './document-source.js';
import {checkAbort} from './abort.js';
import {pageSelection} from './workload.js';
import { convertDocument, renderPageCanvas } from './converter.js';
import { resolveLanguage, translator, UserError } from './i18n.js';
import { CONFIDENCE } from './ocr-format.js';
const $=id=>document.getElementById(id);
let file,pdf,controller,busy=false,resultUrl,selection=0,reports=null,currentPage=1,previewController,reviewVersion=0,elapsedTimer;
let language=resolveLanguage(window.location.search,navigator.languages),t=translator(language);
function selectedRange(){return pdf?pageSelection(pdf.numPages,Number($('first-page').value),Number($('last-page').value)):null;}
function updateFile(){
 $('file-title').textContent=file?file.name:t('dropTitle');
 $('file-meta').textContent=file?t('fileInfo',{size:new Intl.NumberFormat(language,{minimumFractionDigits:1,maximumFractionDigits:1}).format(file.size/1024/1024),count:pdf.numPages}):t('dropHint');
 $('selected-actions').hidden=!file;$('page-range').hidden=!pdf||pdf.numPages<2;
 const large=!!file&&(pdf.numPages>=25||file.size>=10*1024*1024);$('workload-note').hidden=!large;
 if(large)$('workload-note').textContent=t(pdf.numPages>=25?'longDocument':'largeFileNote');
}
function updateRange(){
 const valid=selectedRange();$('range-error').hidden=!pdf||!!valid;$('convert').disabled=busy||!valid;
 return valid;
}
function startElapsed(){
 clearInterval(elapsedTimer);const start=performance.now();$('elapsed-status').hidden=false;
 const update=()=>{const seconds=Math.floor((performance.now()-start)/1000);$('elapsed-status').textContent=t('elapsedTime',{minutes:Math.floor(seconds/60),seconds:String(seconds%60).padStart(2,'0')});};
 update();elapsedTimer=setInterval(update,1000);
}
function applyLanguage(){
 document.documentElement.lang=language;document.title=t('title');document.querySelector('meta[name="description"]').content=t('meta');
 for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n);
 for(const element of document.querySelectorAll('[data-i18n-aria-label]'))element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel));
 $('language').value=language;$('convert-label').textContent=t('create');
 for(const anchor of document.querySelectorAll('a.brand'))anchor.href=`./?lang=${language}`;
 updateFile();
}
function previewButtons(){
 $('review-counter').textContent=pdf?t('reviewCounter',{page:currentPage,total:pdf.numPages}):'';
 $('previous-page').disabled=busy||!pdf||currentPage<=1;$('next-page').disabled=busy||!pdf||currentPage>=pdf.numPages;
 for(const id of ['review-page','rotate-left','rotate-right'])$(id).disabled=busy||!pdf;
 if(pdf)$('review-page').value=String(currentPage);
}
function recoveredText(){
 const text=$('text-preview'),warnings=$('review-warnings');text.replaceChildren();warnings.replaceChildren();
 const report=reports?.find(report=>report.page===currentPage);
 if(!report){text.textContent=t(reports?'sourceNotConverted':'reviewPending');return;}
 if(!report.lines.some(line=>line.words.length))text.textContent=t('reviewEmpty');
 for(const line of report.lines){
  const paragraph=document.createElement('p');
  for(const word of line.words){
   const uncertain=report.kind==='scan'&&(!Number.isFinite(word.confidence)||word.confidence<CONFIDENCE);
   const span=document.createElement(uncertain?'mark':'span');span.textContent=word.text+' ';
   if(uncertain)span.title=t('uncertainWord');paragraph.append(span);
  }
  text.append(paragraph);
 }
 for(const warning of report.warnings){const paragraph=document.createElement('p');paragraph.textContent=t('warning_'+warning);warnings.append(paragraph);}
 for(const adjustment of report.adjustments){const paragraph=document.createElement('p');paragraph.textContent=t(adjustment);warnings.append(paragraph);}
}
function clearCanvas(){for(const canvas of $('original-preview').querySelectorAll('canvas'))canvas.width=canvas.height=0;$('original-preview').replaceChildren();}
async function showPage(number){
 if(!pdf)return;currentPage=Math.max(1,Math.min(pdf.numPages,number));previewButtons();recoveredText();
 const version=++reviewVersion,document=pdf;previewController?.abort();previewController=new AbortController();const previewSignal=previewController.signal;clearCanvas();
 let page;
 try{
  page=await document.getPage(currentPage);
  const canvas=await renderPageCanvas(page,{signal:previewSignal,dpi:85,maxPixels:1_500_000});
  if(version!==reviewVersion||document!==pdf){canvas.width=canvas.height=0;return;}
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',t('reviewCounter',{page:currentPage,total:pdf.numPages}));$('original-preview').append(canvas);
 }catch(error){if(version===reviewVersion&&error.name!=='AbortError')$('original-preview').textContent=t('previewError');}
 finally{page?.cleanup();}
}
function resetResult(){
 clearInterval(elapsedTimer);$('work-status').hidden=true;$('elapsed-status').hidden=true;$('selection-summary').hidden=true;
 if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;reports=null;
 $('result').hidden=true;$('download').removeAttribute('href');$('alert-list').replaceChildren();$('error').hidden=true;recoveredText();
}
function setBusy(value){
 busy=value;for(const id of ['file','dropzone','replace','clear','language','first-page','last-page'])$(id).disabled=value;
 $('convert').disabled=value||!selectedRange();$('convert-label').textContent=t(value?'waiting':'create');$('cancel').hidden=!value;previewButtons();
}
async function choose(selected){
 if(!selected||busy)return;const version=++selection;resetResult();controller?.abort();controller=new AbortController();
 previewController?.abort();++reviewVersion;clearCanvas();$('review').hidden=true;setBusy(true);$('cancel').disabled=false;
 $('progress').hidden=false;$('progress').removeAttribute('value');$('status').textContent=t('checking');
 const previous=pdf;pdf=null;file=null;updateFile();
 try{
  if(previous)await previous.destroy();checkAbort(controller.signal);
  const loaded=await openDocument(selected,controller.signal,t,update=>{
   if(version!==selection||controller.signal.aborted)return;
   if(update.phase==='read'&&update.total){const percent=Math.round(update.loaded/update.total*100);$('progress').value=percent;$('status').textContent=t('loadingFile',{percent});}
   else{$('progress').removeAttribute('value');$('status').textContent=t('parsingFile');}
  });
  if(version!==selection){await loaded.destroy();return;}
  pdf=loaded;file=selected;currentPage=1;
  $('first-page').value='1';$('last-page').value=String(pdf.numPages);for(const id of ['first-page','last-page'])$(id).max=String(pdf.numPages);
  $('range-error').hidden=true;updateFile();$('review-page').replaceChildren();
  for(let page=1;page<=pdf.numPages;page++){const option=document.createElement('option');option.value=String(page);option.textContent=String(page);$('review-page').append(option);}
  $('review').hidden=false;$('status').textContent=t('preparingPreview');await showPage(1);checkAbort(controller.signal);$('status').textContent=t('ready');
 }catch(error){
  if(version!==selection)return;
  if(error.name==='AbortError'){
   const canceled=pdf;pdf=null;file=null;previewController?.abort();++reviewVersion;clearCanvas();$('review').hidden=true;if(canceled)await canceled.destroy();
   $('status').textContent=t('openingCancelled');
  }else{$('error').textContent=error instanceof UserError?error.message:t('errorRead');$('error').hidden=false;$('status').textContent=t('chooseOther');}
  updateFile();
 }finally{if(version===selection){$('progress').hidden=true;setBusy(false);}}
}
$('dropzone').addEventListener('click',()=>$('file').click());$('replace').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',event=>{void choose(event.target.files[0]);event.target.value='';});
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,event=>{event.preventDefault();if(!busy)$('dropzone').classList.add('drag');});
for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,event=>{event.preventDefault();$('dropzone').classList.remove('drag');});
$('dropzone').addEventListener('drop',event=>{if(busy)return;if(event.dataTransfer.files.length>1){$('error').textContent=t('oneFile');$('error').hidden=false;return;}void choose(event.dataTransfer.files[0]);});
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());
$('clear').addEventListener('click',async()=>{
 if(busy)return;++selection;++reviewVersion;controller?.abort();previewController?.abort();resetResult();clearCanvas();$('review').hidden=true;
 const previous=pdf;pdf=null;file=null;updateFile();$('status').textContent=t('initialStatus');$('progress').hidden=true;setBusy(false);if(previous)await previous.destroy();
});
$('language').addEventListener('change',()=>{
 if(busy)return;language=$('language').value;t=translator(language);const url=new URL(window.location.href);url.searchParams.set('lang',language);window.history.replaceState(null,'',url);
 applyLanguage();resetResult();$('progress').hidden=true;updateRange();$('status').textContent=t(pdf?'ready':'initialStatus');if(pdf)void showPage(currentPage);
});
$('previous-page').addEventListener('click',()=>{if(!busy)void showPage(currentPage-1);});$('next-page').addEventListener('click',()=>{if(!busy)void showPage(currentPage+1);});$('review-page').addEventListener('change',()=>{if(!busy)void showPage(Number($('review-page').value));});
for(const [id,angle]of[['rotate-left',270],['rotate-right',90]])$(id).addEventListener('click',()=>{
 if(busy||!pdf)return;pdf.rotate(currentPage,angle);resetResult();$('progress').hidden=true;$('status').textContent=t('rotated');void showPage(currentPage);
});
for(const id of ['first-page','last-page'])$(id).addEventListener('input',()=>{
 if(busy)return;resetResult();$('progress').hidden=true;const valid=updateRange();$('status').textContent=t(valid?'ready':'errorRange');
});
$('cancel').addEventListener('click',()=>{controller?.abort();previewController?.abort();$('cancel').disabled=true;$('status').textContent=t('cancelling');});
$('convert').addEventListener('click',async()=>{
 if(busy||!pdf)return;const chosen=updateRange();if(!chosen)return;resetResult();previewController?.abort();++reviewVersion;controller=new AbortController();setBusy(true);startElapsed();$('convert-label').textContent=t('converting');$('progress').hidden=false;$('progress').value=0;$('cancel').disabled=false;
 try{
  const result=await convertDocument(pdf,{signal:controller.signal,t,firstPage:chosen.first,lastPage:chosen.last,onProgress:update=>{
   $('progress').value=Math.max($('progress').value,update.progress);const status=t('progress',update);if($('status').textContent!==status)$('status').textContent=status;
   $('work-status').hidden=false;$('work-status').textContent=t('workProgress',{done:update.completed,total:update.selectedTotal,scans:update.scanPages});
  }});
  reports=result.reports;resultUrl=URL.createObjectURL(result.blob);$('download').href=resultUrl;$('download').download=file.name.replace(/\.[^.]+$/,'')+'-calque'+(chosen.count<pdf.numPages?'-'+chosen.first+'-'+chosen.last:'')+'.docx';
  $('result-summary').textContent=t('resultSummary',{count:result.pages});$('selection-summary').hidden=chosen.count===pdf.numPages;$('selection-summary').textContent=t('selectionResult',{first:chosen.first,last:chosen.last,total:pdf.numPages});$('validation-status').textContent=t('validationOK',{count:result.validation.sourcePages});
  const flagged=new Set(result.alerts.map(alert=>alert.page));for(const report of reports)if(report.warnings.length)flagged.add(report.page);
  $('alerts').hidden=!flagged.size;
  for(const number of [...flagged].sort((a,b)=>a-b)){
   const report=reports.find(report=>report.page===number),alert=result.alerts.find(item=>item.page===number),line=document.createElement('li'),link=document.createElement('a');
   const descriptions=report.warnings.map(warning=>t('warning_'+warning));
   if(alert)descriptions.unshift(t(alert.kind==='empty'?'alertEmpty':'alertUncertain',{page:number,count:alert.uncertain}));
   link.href='#review';link.textContent=t('reviewCounter',{page:number,total:pdf.numPages});link.addEventListener('click',()=>{void showPage(number);});line.append(link,document.createTextNode(' — '+descriptions.join(' ')));$('alert-list').append(line);
  }
  $('result').hidden=false;$('progress').value=100;$('status').textContent=t(flagged.size?'completedAlerts':'completed',{count:flagged.size});
  void showPage(currentPage>=chosen.first&&currentPage<=chosen.last?currentPage:chosen.first);$('download').focus({preventScroll:true});$('result').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
 }catch(error){
  if(error.name==='AbortError')$('status').textContent=t('cancelled');else{$('error').textContent=error instanceof UserError?error.message:t('errorGeneric');$('error').hidden=false;$('status').textContent=t('failed');}$('progress').hidden=true;
 }finally{clearInterval(elapsedTimer);setBusy(false);}
});
window.addEventListener('pagehide',()=>{++selection;clearInterval(elapsedTimer);controller?.abort();previewController?.abort();++reviewVersion;resetResult();clearCanvas();if(pdf)void pdf.destroy();});
applyLanguage();$('status').textContent=t('initialStatus');previewButtons();
