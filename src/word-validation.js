import JSZip from 'jszip';
import sax from 'sax';
import {UserError} from './i18n.js';
import {checkAbort} from './abort.js';
const WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Stream XML without creating a DOM tree for the entire Word document.
async function checkDocumentXml(entry,expectedPages,{signal,onProgress}) {
 let body=0,sections=0,root=false,characters=0;
 const parser=sax.parser(true,{xmlns:true,strictEntities:true});
 parser.onerror=error=>{throw error;};
 parser.ondoctype=()=>{throw new Error('Unexpected doctype');};
 parser.ontext=()=>{};
 parser.onopentag=node=>{
  if(!root){if(node.uri!==WORD_NS||node.local!=='document')throw new Error('Invalid root');root=true;}
  if(node.uri===WORD_NS&&node.local==='body')body++;
  if(node.uri===WORD_NS&&node.local==='sectPr')sections++;
 };
 const stream=entry.internalStream('string');
 await new Promise((resolve,reject)=>{
  let settled=false,timer;
  const finish=(callback,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);stream.pause();signal?.removeEventListener('abort',abort);callback(value);
  };
  const abort=()=>finish(reject,new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  stream.on('data',chunk=>{
   stream.pause();
   try{checkAbort(signal);parser.write(chunk);characters+=chunk.length;onProgress(characters);if(settled)return;timer=setTimeout(()=>{if(!settled)stream.resume();},0);}
   catch(error){finish(reject,error);}
  });
  stream.on('error',error=>finish(reject,error));
  stream.on('end',()=>{
   try{checkAbort(signal);parser.close();if(!root||body!==1||sections!==expectedPages)throw new Error('Invalid sections');finish(resolve);}
   catch(error){finish(reject,error);}
  });
  if(signal?.aborted)abort();else stream.resume();
 });
 return {sections,characters};
}
export async function validateWord(blob,reports,expectedPages,t,{signal,firstPage=1,onProgress=()=>{}}={}) {
 checkAbort(signal);
 if(reports.length!==expectedPages||reports.some((page,index)=>page.page!==firstPage+index))throw new UserError(t('errorValidation'));
 try{
  const data=await blob.arrayBuffer();checkAbort(signal);
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});checkAbort(signal);
  for(const path of ['[Content_Types].xml','_rels/.rels','word/document.xml'])if(!zip.file(path))throw new Error('Missing Word part');
  const result=await checkDocumentXml(zip.file('word/document.xml'),expectedPages,{signal,onProgress});
  return {sourcePages:expectedPages,firstSourcePage:firstPage,lastSourcePage:firstPage+expectedPages-1,sections:result.sections,structureChecked:true};
 }catch(error){checkAbort(signal);throw new UserError(t('errorValidation'));}
}
