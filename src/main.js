import './style.css';
import { openDocument } from './document-source.js';
import { convertDocument, renderPageCanvas } from './converter.js';
import { resolveLanguage, translator, UserError } from './i18n.js';
import { CONFIDENCE } from './ocr-format.js';
const $=id=>document.getElementById(id);
let file,pdf,controller,busy=false,resultUrl,selection=0,reports=null,currentPage=1,previewController,reviewVersion=0;
let language=resolveLanguage(window.location.search,navigator.languages),t=translator(language);
function updateFile(){
 $('file-title').textContent=file?file.name:t('dropTitle');
 $('file-meta').textContent=file?t('fileInfo',{size:new Intl.NumberFormat(language,{minimumFractionDigits:1,maximumFractionDigits:1}).format(file.size/1024/1024),count:pdf.numPages}):t('dropHint');
 $('selected-actions').hidden=!file;
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
 const report=reports?.[currentPage-1];
 if(!report){text.textContent=t('reviewPending');return;}
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
 if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;reports=null;
 $('result').hidden=true;$('download').removeAttribute('href');$('alert-list').replaceChildren();$('error').hidden=true;recoveredText();
}
function setBusy(value){
 busy=value;for(const id of ['file','dropzone','replace','clear','language'])$(id).disabled=value;
 $('convert').disabled=value||!pdf;$('convert-label').textContent=t(value?'waiting':'create');$('cancel').hidden=!value;previewButtons();
}
async function choose(selected){
 if(!selected||busy)return;const version=++selection;resetResult();$('progress').hidden=true;controller?.abort();controller=new AbortController();
 previewController?.abort();++reviewVersion;clearCanvas();$('review').hidden=true;setBusy(true);$('cancel').hidden=true;
 const previous=pdf;pdf=null;file=null;if(previous)await previous.destroy();$('status').textContent=t('checking');
 try{
  const loaded=await openDocument(selected,controller.signal,t);if(version!==selection){await loaded.destroy();return;}
  pdf=loaded;file=selected;currentPage=1;updateFile();$('review-page').replaceChildren();
  for(let page=1;page<=pdf.numPages;page++){const option=document.createElement('option');option.value=String(page);option.textContent=String(page);$('review-page').append(option);}
  $('review').hidden=false;await showPage(1);$('status').textContent=t('ready');
 }catch(error){if(version!==selection)return;updateFile();$('error').textContent=error instanceof UserError?error.message:t('errorRead');$('error').hidden=false;$('status').textContent=t('chooseOther');}
 finally{if(version===selection)setBusy(false);}
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
 applyLanguage();resetResult();$('progress').hidden=true;$('status').textContent=t(pdf?'ready':'initialStatus');if(pdf)void showPage(currentPage);
});
$('previous-page').addEventListener('click',()=>{if(!busy)void showPage(currentPage-1);});$('next-page').addEventListener('click',()=>{if(!busy)void showPage(currentPage+1);});$('review-page').addEventListener('change',()=>{if(!busy)void showPage(Number($('review-page').value));});
for(const [id,angle]of[['rotate-left',270],['rotate-right',90]])$(id).addEventListener('click',()=>{
 if(busy||!pdf)return;pdf.rotate(currentPage,angle);resetResult();$('progress').hidden=true;$('status').textContent=t('rotated');void showPage(currentPage);
});
$('cancel').addEventListener('click',()=>{controller?.abort();$('cancel').disabled=true;$('status').textContent=t('cancelling');});
$('convert').addEventListener('click',async()=>{
 if(busy||!pdf)return;resetResult();controller=new AbortController();setBusy(true);$('convert-label').textContent=t('converting');$('progress').hidden=false;$('progress').value=0;$('cancel').disabled=false;
 try{
  const result=await convertDocument(pdf,{signal:controller.signal,t,onProgress:update=>{$('progress').value=Math.max($('progress').value,update.progress);$('status').textContent=t('progress',update);}});
  reports=result.reports;resultUrl=URL.createObjectURL(result.blob);$('download').href=resultUrl;$('download').download=file.name.replace(/\.[^.]+$/,'')+'-calque.docx';
  $('result-summary').textContent=t('resultSummary',{count:result.pages});$('validation-status').textContent=t('validationOK',{count:result.validation.sourcePages});
  const flagged=new Set(result.alerts.map(alert=>alert.page));for(const report of reports)if(report.warnings.length)flagged.add(report.page);
  $('alerts').hidden=!flagged.size;
  for(const number of [...flagged].sort((a,b)=>a-b)){
   const report=reports[number-1],alert=result.alerts.find(item=>item.page===number),line=document.createElement('li'),link=document.createElement('a');
   const descriptions=report.warnings.map(warning=>t('warning_'+warning));
   if(alert)descriptions.unshift(t(alert.kind==='empty'?'alertEmpty':'alertUncertain',{page:number,count:alert.uncertain}));
   link.href='#review';link.textContent=t('reviewCounter',{page:number,total:pdf.numPages});link.addEventListener('click',()=>{void showPage(number);});line.append(link,document.createTextNode(' — '+descriptions.join(' ')));$('alert-list').append(line);
  }
  $('result').hidden=false;$('progress').value=100;$('status').textContent=t(flagged.size?'completedAlerts':'completed',{count:flagged.size});
  void showPage(currentPage);$('download').focus({preventScroll:true});$('result').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
 }catch(error){
  if(error.name==='AbortError')$('status').textContent=t('cancelled');else{$('error').textContent=error instanceof UserError?error.message:t('errorGeneric');$('error').hidden=false;$('status').textContent=t('failed');}$('progress').hidden=true;
 }finally{setBusy(false);}
});
window.addEventListener('pagehide',()=>{controller?.abort();previewController?.abort();++reviewVersion;resetResult();clearCanvas();if(pdf)void pdf.destroy();});
applyLanguage();$('status').textContent=t('initialStatus');previewButtons();
