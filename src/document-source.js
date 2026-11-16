import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { translator, UserError } from './i18n.js';
import {checkAbort} from './abort.js';
import {readFileBytes} from './file-read.js';
export {checkAbort} from './abort.js';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const ROOT = new URL(import.meta.env.BASE_URL, window.location.href);
const resource = (path) => new URL(path, ROOT).href;
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 150;
const MAX_PIXELS = 40_000_000;

export async function openPdf(file, signal, t = translator('fr'), onReadProgress = () => {}) {
  if (!file.size || file.size > MAX_BYTES) throw new UserError(t('errorSize'));
  checkAbort(signal);
  const data = await readFileBytes(file,{signal,onProgress:onReadProgress});
  checkAbort(signal);
  onReadProgress({phase:'analyse'});
  const task = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false,
    cMapUrl: resource('pdfjs/cmaps/'), cMapPacked: true,
    standardFontDataUrl: resource('pdfjs/standard_fonts/'),
    wasmUrl: resource('pdfjs/wasm/'), maxImageSize: MAX_PIXELS, canvasMaxAreaInBytes: 48_000_000, useSystemFonts: false });
  let accepted=false;
  const abort = () => { void task.destroy().catch(()=>{}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    checkAbort(signal);
    if (pdf.numPages > MAX_PAGES) { await pdf.destroy(); throw new UserError(t('errorPages')); }
    accepted=true;return pdf;
  } catch (error) {
    checkAbort(signal);
    if (error.name === 'PasswordException') throw new UserError(t('errorPassword'));
    if (error instanceof UserError) throw error;
    throw new UserError(t('errorRead'));
  } finally { signal?.removeEventListener('abort', abort);if(!accepted)try{await task.destroy();}catch{} }
}

// Décodage limité aux formats de document explicitement acceptés.
function rasterDimensions(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=24 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71)
  return {width:view.getUint32(16),height:view.getUint32(20),type:'png'};
 if(bytes[0]===255 && bytes[1]===216) {
  let offset=2;
  while(offset+4<=bytes.length) {
   if(bytes[offset]!==255){offset++;continue;}
   const marker=bytes[offset+1];offset+=2;
   if(marker===217 || marker===218)break;
   if(marker===0 || marker===255 || (marker>=208&&marker<=215))continue;
   const length=view.getUint16(offset);if(length<2 || offset+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)
    return {width:view.getUint16(offset+5),height:view.getUint16(offset+3),type:'jpeg'};
   offset+=length;
  }
 }
 return null;
}
function wrapPdf(pdf) {
 const rotations=new Map();
 return { kind:'pdf',numPages:pdf.numPages,rotation:n=>rotations.get(n)||0,
  rotate(n,angle){rotations.set(n,((rotations.get(n)||0)+angle+360)%360);},
  async getPage(n){
   const page=await pdf.getPage(n);
   return { getViewport:options=>page.getViewport({...options,rotation:(page.rotate+(rotations.get(n)||0))%360}),
    render:options=>page.render(options),getTextContent:()=>page.getTextContent(),getOperatorList:()=>page.getOperatorList(),getAnnotations:()=>page.getAnnotations(),
    getFontInfo(name){if(!page.commonObjs.has(name))return {};const font=page.commonObjs.get(name);return {name:font.name,bold:font.bold,italic:font.italic};},
    cleanup:()=>page.cleanup(), originalPixels:null };
  },async releaseWorkingData(){try{await pdf.cleanup();return true;}catch{return false;}},destroy:()=>pdf.destroy(),
 };
}
export async function openDocument(file, signal, t=translator('fr'),onReadProgress=()=>{}) {
 if(!file.size||file.size>MAX_BYTES)throw new UserError(t('errorSize'));
 const header=await readFileBytes(file.slice(0,1024),{signal});checkAbort(signal);
 if(new TextDecoder().decode(header).includes('%PDF-'))return wrapPdf(await openPdf(file,signal,t,onReadProgress));
 const bytes=await readFileBytes(file,{signal,onProgress:onReadProgress});checkAbort(signal);
 const info=rasterDimensions(bytes);
 if(!info)throw new UserError(t('errorType'));
 if(!info.width||!info.height||info.width*info.height>40_000_000)throw new UserError(t('errorPixels'));
 onReadProgress({phase:'analyse'});
 let bitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw new UserError(t('errorImageRead'));}
 if(signal?.aborted){bitmap.close();checkAbort(signal);}
 if(bitmap.width*bitmap.height>40_000_000){bitmap.close();throw new UserError(t('errorPixels'));}
 let rotation=0;
 return {kind:'image',numPages:1,rotation:()=>rotation,rotate(n,angle){rotation=(rotation+angle+360)%360;},
  async getPage(){
   const rotated=rotation%180!==0;const w=rotated?bitmap.height:bitmap.width,h=rotated?bitmap.width:bitmap.height;
   const fit=Math.min((w>h?842:595)/w,(w>h?595:842)/h);
   return {originalPixels:{width:bitmap.width,height:bitmap.height},
    getViewport:({scale})=>({width:w*fit*scale,height:h*fit*scale}),
    render({canvasContext,viewport}){
     const ctx=canvasContext;ctx.save();ctx.fillStyle='white';ctx.fillRect(0,0,viewport.width,viewport.height);
     ctx.translate(viewport.width/2,viewport.height/2);ctx.rotate(rotation*Math.PI/180);
     const scale=viewport.width/w;ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);ctx.restore();
     return {promise:Promise.resolve(),cancel(){}};
    },getTextContent:async()=>({items:[],styles:{}}),getOperatorList:async()=>({fnArray:[],argsArray:[]}),cleanup(){},
   };
  },destroy:async()=>bitmap.close(),
 };
}
