import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {validateWord} from '../src/word-validation.js';
import {translator} from '../src/i18n.js';
const t=translator('fr');
test('un Word tronqué est refusé avant tout téléchargement',async()=>{
 await assert.rejects(validateWord(new Blob(['PK truncated']),[{page:1}],1,t),/vérification de structure/);
});
test('des pages sources omises ou désordonnées sont refusées',async()=>{
 await assert.rejects(validateWord(new Blob(),[{page:2}],2,t),/vérification de structure/);
 await assert.rejects(validateWord(new Blob(),[{page:2},{page:1}],2,t),/vérification de structure/);
});
test('une archive sans document Word est refusée',async()=>{
 const zip=new JSZip();zip.file('unrelated.txt','Hello');
 await assert.rejects(validateWord(new Blob([await zip.generateAsync({type:'uint8array'})]),[{page:1}],1,t),/vérification de structure/);
});

import {Document,Packer,Paragraph} from 'docx';
test('un intervalle conserve ses numéros source dans une validation réussie',async()=>{
 const blob=await Packer.toBlob(new Document({sections:[{children:[new Paragraph('Page 5')]},{children:[new Paragraph('Page 6')]}]}));
 const result=await validateWord(blob,[{page:5},{page:6}],2,t,{firstPage:5});
 assert.equal(result.firstSourcePage,5);assert.equal(result.lastSourcePage,6);assert.equal(result.sections,2);
});
test('une vérification XML progressive peut être annulée entre les blocs',async()=>{
 const xml='<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+'<w:p><w:r><w:t>Example text</w:t></w:r></w:p>'.repeat(5000)+'<w:sectPr/></w:body></w:document>';
 const zip=new JSZip();for(const path of ['[Content_Types].xml','_rels/.rels'])zip.file(path,'<root/>');zip.file('word/document.xml',xml);
 const blob=new Blob([await zip.generateAsync({type:'uint8array'})]);const controller=new AbortController();let processed=0;
 await assert.rejects(validateWord(blob,[{page:1}],1,t,{signal:controller.signal,onProgress:count=>{processed=count;controller.abort();}}),error=>error.name==='AbortError');
 assert(processed>0&&processed<xml.length);
});
test('un XML mal formé ou une section manquante reste refusé',async()=>{
 for(const xml of ['<w:document>', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>']){
  const zip=new JSZip();zip.file('[Content_Types].xml','<root/>');zip.file('_rels/.rels','<root/>');zip.file('word/document.xml',xml);
  const blob=new Blob([await zip.generateAsync({type:'uint8array'})]);await assert.rejects(validateWord(blob,[{page:1}],1,t),/vérification de structure/);
 }
});
