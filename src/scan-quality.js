// Heuristiques de qualité : elles guident la relecture, elles ne certifient pas un scan.
export function analysePixels({ data, width, height }) {
 const histogram = new Uint32Array(256); let sum=0, squares=0, dark=0;
 const gray=new Uint8Array(width*height);
 for(let index=0;index<gray.length;index++) {
  const p=index*4; const value=Math.round(data[p]*.299+data[p+1]*.587+data[p+2]*.114);
  gray[index]=value; histogram[value]++; sum+=value; squares+=value*value; if(value<160)dark++;
 }
 const n=gray.length || 1, mean=sum/n, deviation=Math.sqrt(Math.max(0,squares/n-mean*mean));
 const percentile=fraction=>{let total=0;for(let i=0;i<256;i++){total+=histogram[i];if(total>=n*fraction)return i;}return 255;};
 const low=percentile(.01), high=percentile(.99); let lapSum=0,lapSquares=0,lapCount=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
  const i=y*width+x; const v=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width];
  lapSum+=v;lapSquares+=v*v;lapCount++;
 }
 const sharpness=lapCount?lapSquares/lapCount-(lapSum/lapCount)**2:0;
 const warnings=[];
 if(mean<95)warnings.push('dark');
 if(deviation>2 && high-low<45)warnings.push('contrast');
 if(deviation>5 && sharpness<35 && dark/n>.005)warnings.push('blur');
 return { mean,deviation,low,high,sharpness,darkRatio:dark/n,warnings };
}
export async function prepareScan(canvas, signal) {
 const sample=document.createElement('canvas');
 const scale=Math.min(1,1000/Math.max(canvas.width,canvas.height));
 sample.width=Math.max(1,Math.round(canvas.width*scale));sample.height=Math.max(1,Math.round(canvas.height*scale));
 const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,sample.width,sample.height);
 const quality=analysePixels(ctx.getImageData(0,0,sample.width,sample.height));sample.width=sample.height=0;
 const range=quality.high-quality.low;
 if(range<20 || range>=180)return {canvas,quality,adjustments:[]};
 const prepared=document.createElement('canvas');prepared.width=canvas.width;prepared.height=canvas.height;
 const context=prepared.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0);
 const pixels=context.getImageData(0,0,prepared.width,prepared.height);
 try {
  for(let i=0;i<pixels.data.length;i+=4) {
   for(let c=0;c<3;c++)pixels.data[i+c]=Math.max(0,Math.min(255,(pixels.data[i+c]-quality.low)*255/range));
   if(i>0 && i%8_000_000===0){await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new DOMException('Aborted','AbortError');}
  }
  context.putImageData(pixels,0,0);
  return {canvas:prepared,quality,adjustments:['contrastAdjusted']};
 } catch(error){prepared.width=prepared.height=0;throw error;}
}
export function recognitionScore(data) {
 const words=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
 const letters=(data.text||'').replace(/\s/g,'').length;
 const total=words.reduce((n,w)=>n+(w.text||'').length,0);
 const confidence=total?words.reduce((n,w)=>n+(Number.isFinite(w.confidence)?w.confidence:0)*(w.text||'').length,0)/total:0;
 return {confidence,letters,score:confidence*Math.min(1,letters/20)};
}
