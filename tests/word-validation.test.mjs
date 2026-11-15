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
