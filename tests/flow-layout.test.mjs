import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,Packer} from 'docx';
import JSZip from 'jszip';
import {flowBlocks,flowingContent} from '../src/flow-layout.js';
const line=(text,x,y,color='242424',extra={})=>({text,x,baseline:y,width:140,fontSize:10,font:'Arial',bold:false,italics:false,runs:[{text,color}],...extra});
test('paragraphes continus : conserve les couleurs au-delà des retours PDF',()=>{
 const blocks=flowBlocks([line('First line',36,50,'C97940'),line('second line',36,62,'EEEEEE'),line('New paragraph',36,90)]);
 assert.equal(blocks.length,2);assert.equal(blocks[0].runs.map(r=>r.text).join(''),'First line second line');assert.deepEqual(blocks[0].runs.filter(r=>r.text.trim()).map(r=>r.color),['C97940','EEEEEE']);
});
test('fragments sur une ligne : pas de mot dupliqué',()=>{
 const blocks=flowBlocks([line('Hello',36,50,'000000',{width:25}),line('world',66,50,'C97940',{width:25})]);
 assert.equal(blocks[0].runs.map(r=>r.text).join(''),'Hello world');
});
test('colonne étroite : listes distinctes, adresse continuée',()=>{
 const blocks=flowBlocks([line('Excel',418,50),line('SQL',418,62),line('mail',418,90),line('@example.test',418,102)],{columnWidth:170});
 assert.equal(blocks.length,3);assert.equal(blocks[2].runs.map(r=>r.text).join(''),'mail@example.test');
});
test('Word en flux : sans cadres, paragraphes et couleurs, colonnes structurées',async()=>{
 const lines=[line('Left line',36,50),line('continues here',36,62,'C97940'),line('Right content',420,50,'EEEEEE')];
 const doc=new Document({sections:[{children:flowingContent(lines,{width:595,height:842})}]});
 const zip=await JSZip.loadAsync(await Packer.toBuffer(doc));const xml=await zip.file('word/document.xml').async('string');
 assert(!xml.includes('w:framePr'));assert(!xml.includes('w:txbxContent'));assert(xml.includes('<w:tbl>'));assert(xml.includes('C97940'));assert(xml.includes('EEEEEE'));assert(xml.includes('continues here'));
});
