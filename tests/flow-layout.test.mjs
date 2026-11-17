import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,Packer} from 'docx';
import JSZip from 'jszip';
import {flowBlocks,flowingContent,partitionVisuals} from '../src/flow-layout.js';
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

test('fragments séparés par un grand espace ne deviennent pas une ligne unique',()=>{
 const blocks=flowBlocks([line('Left label',30,50,'242424',{width:50}),line('Right label',300,50)]);assert.equal(blocks.length,2);
});
test('grandes lettres et image : interligne extensible et place réservée dans le flux',async()=>{
 const lines=[line('small',36,50,'242424',{width:25}),line('BIG',65,50,'C97940',{fontSize:28,width:60}),line('After picture',36,200)];
 const picture={data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64'),box:{x:36,y:80,width:90,height:90},index:1,kind:'picture'};
 const {translator}=await import('../src/i18n.js');
 const doc=new Document({sections:[{children:flowingContent(lines,{width:595,height:842},{objects:[picture],t:translator('fr')})}]});
 const zip=await JSZip.loadAsync(await Packer.toBuffer(doc));const xml=await zip.file('word/document.xml').async('string');
 assert(xml.includes('w:line="672" w:lineRule="atLeast"'));assert(!xml.includes('w:lineRule="exact"'));assert(xml.includes('<wp:inline'));assert(!xml.includes('<wp:anchor'));assert(xml.indexOf('BIG')<xml.indexOf('<wp:inline'));assert(xml.indexOf('<wp:inline')<xml.indexOf('After picture'));assert(xml.includes('C97940'));
});
test('les superpositions intentionnelles et visuels entre colonnes restent signalables',()=>{
 const lines=[line('Left',30,50),line('Right',420,50)];
 const objects=[{box:{x:30,y:100,width:90,height:90}},{box:{x:20,y:30,width:180,height:40}},{box:{x:200,y:250,width:250,height:50}}];
 const result=partitionVisuals(lines,objects,{width:595,height:842});assert.equal(result.inline.length,1);assert.equal(result.floating.length,2);assert.equal(result.inline[0].index,1);
});
