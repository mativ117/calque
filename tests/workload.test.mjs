import test from 'node:test';import assert from 'node:assert/strict';
import {pageSelection,textBudget} from '../src/workload.js';
import {translator} from '../src/i18n.js';
import {readFileBytes} from '../src/file-read.js';
test('un intervalle ne peut pas exclure silencieusement ou dépasser des pages',()=>{
 assert.deepEqual(pageSelection(150,50,52),{first:50,last:52,count:3});
 for(const range of [[0,1],[2,1],[1,151],[1.5,3],[NaN,3]])assert.equal(pageSelection(150,...range),null);
});
test('un document trop dense est arrêté avant d’ajouter du contenu au Word',()=>{
 const budget=textBudget(translator('fr'),10);budget.reserve(7);budget.reserve(3);
 assert.throws(()=>budget.reserve(1),/trop de texte/);assert.equal(budget.used,10);
});
test('une lecture annulée arrête FileReader et retire ses callbacks',async()=>{
 const previous=globalThis.FileReader;let instance;
 class Reader{constructor(){instance=this;}readAsArrayBuffer(){}abort(){this.stopped=true;this.onabort?.();}}
 globalThis.FileReader=Reader;
 try{
  const controller=new AbortController();const reading=readFileBytes({}, {signal:controller.signal});controller.abort();
  await assert.rejects(reading,error=>error.name==='AbortError');assert(instance.stopped);assert.equal(instance.onload,null);assert.equal(instance.onprogress,null);
 }finally{globalThis.FileReader=previous;}
});
test('une lecture déjà annulée ne démarre pas',()=>{
 const controller=new AbortController();controller.abort();assert.throws(()=>readFileBytes({}, {signal:controller.signal}),error=>error.name==='AbortError');
});
