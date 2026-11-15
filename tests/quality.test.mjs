import test from 'node:test';
import assert from 'node:assert/strict';
import {analysePixels,recognitionScore} from '../src/scan-quality.js';
const image=(width,height,value)=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?255:value)});
test('une page blanche uniforme n’est pas déclarée floue',()=>{const q=analysePixels(image(30,30,255));assert.deepEqual(q.warnings,[]);assert.equal(q.deviation,0);});
test('une image sombre est signalée',()=>assert(analysePixels(image(30,30,40)).warnings.includes('dark')));
test('un faible contraste et une variation lisse sont détectés',()=>{const data=image(60,60,220);for(let y=0;y<60;y++)for(let x=0;x<60;x++)for(let c=0;c<3;c++)data.data[(y*60+x)*4+c]=210+x/3;assert(analysePixels(data).warnings.includes('contrast'));});
test('le choix d’orientation n’accorde pas une confiance élevée à un résultat vide',()=>{assert.equal(recognitionScore({text:'',blocks:[]}).score,0);assert.equal(recognitionScore({text:'garbage',blocks:[{paragraphs:[{lines:[{words:[{text:'garbage',confidence:NaN}]}]}]}]}).score,0);});
