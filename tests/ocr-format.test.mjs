import { messages, translator, resolveLanguage } from '../src/i18n.js';
import { readFile } from 'node:fs/promises';
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
 assert.throws(()=>ocrParagraphs({text:'Texte reconnu',blocks:[]},1),/mots à vérifier/);
});

test('chaque langue contient toutes les traductions et les mêmes paramètres',()=>{
 const keys=Object.keys(messages.fr).sort();
 for(const locale of ['en','nl']) {
  assert.deepEqual(Object.keys(messages[locale]).sort(),keys);
  for(const key of keys) {
   const placeholders=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
   assert.deepEqual(placeholders(messages[locale][key]),placeholders(messages.fr[key]),locale+':'+key);
  }
 }
});
test('chaque texte HTML traduit possède une entrée connue',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)) assert(match[1] in messages.fr,match[1]);
});
test('la langue explicite prime, le navigateur est reconnu et le repli est sûr',()=>{
 assert.equal(resolveLanguage('?lang=nl',['en-US']),'nl');
 assert.equal(resolveLanguage('?lang=xx',['de-DE','en-GB']),'en');
 assert.equal(resolveLanguage('',['nl-BE']),'nl');
 assert.equal(resolveLanguage('',['de-DE']),'fr');
});
for(const locale of ['fr','en','nl']) test('les notes Word sont traduites en '+locale+' sans traduire le document',async()=>{
 const t=translator(locale);
 const result=ocrParagraphs({text:'Vertrouwelijk',blocks:[{paragraphs:[{lines:[{words:[{text:'Vertrouwelijk',confidence:60}]}]}]}]},3,t);
 const zip=await JSZip.loadAsync(await Packer.toBuffer(new Document({sections:[{children:result.children}]})));
 const xml=await zip.file('word/document.xml').async('string');
 assert(xml.includes(t('wordPrefix',{page:3})));
 assert(xml.includes(t('wordUncertain',{count:1})));
 assert(xml.includes('Vertrouwelijk'));
});
