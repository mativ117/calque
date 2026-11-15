import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer } from 'docx';
import JSZip from 'jszip';
import { ocrParagraphs } from '../src/ocr-format.js';

test('seul le mot incertain est surligné et la page exacte est signalée', async () => {
 const result = ocrParagraphs({text:'Certain Incertain',blocks:[{paragraphs:[{lines:[{words:[
  {text:'Certain',confidence:96},{text:'Incertain',confidence:42},
 ]}]}]}]},7);
 assert.deepEqual(result.alert,{page:7,kind:'uncertain',uncertain:1,total:2});
 const zip=await JSZip.loadAsync(await Packer.toBuffer(new Document({sections:[{children:result.children}]})));
 const xml=await zip.file('word/document.xml').async('string');
 const runs=[...xml.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map(match=>match[0]);
 assert(!runs.find(run=>run.includes('>Certain ')).includes('w:highlight'));
 assert(runs.find(run=>run.includes('>Incertain ')).includes('w:highlight'));
});
test('une confiance non numérique est traitée comme incertaine',()=>{
 const result=ocrParagraphs({text:'Doute',blocks:[{paragraphs:[{lines:[{words:[{text:'Doute',confidence:NaN}]}]}]}]},2);
 assert.equal(result.alert.uncertain,1);
});
test('du texte sans score de confiance déclenche une erreur explicite',()=>{
 assert.throws(()=>ocrParagraphs({text:'Texte reconnu',blocks:[]},1),/scores de confiance/);
});
