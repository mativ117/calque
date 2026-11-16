import {checkAbort} from './abort.js';
export function readFileBytes(file,{signal,onProgress=()=>{}}={}) {
 checkAbort(signal);
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();let settled=false;
  const finish=(callback,value)=>{
   if(settled)return;settled=true;signal?.removeEventListener('abort',abort);
   reader.onload=reader.onerror=reader.onabort=reader.onprogress=null;callback(value);
  };
  const abort=()=>{reader.abort();finish(reject,new DOMException('Aborted','AbortError'));};
  reader.onload=()=>finish(resolve,new Uint8Array(reader.result));
  reader.onerror=()=>finish(reject,reader.error||new Error('File read failed'));
  reader.onabort=()=>finish(reject,new DOMException('Aborted','AbortError'));
  reader.onprogress=event=>{if(event.lengthComputable)onProgress({loaded:event.loaded,total:event.total,phase:'read'});};
  signal?.addEventListener('abort',abort,{once:true});
  try{reader.readAsArrayBuffer(file);}catch(error){finish(reject,error);}
 });
}
