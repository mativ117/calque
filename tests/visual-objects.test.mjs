import test from 'node:test';
import assert from 'node:assert/strict';
import {visualGroups,visualDifference,scanRegions,outsideVisuals,visualRun} from '../src/visual-objects.js';
import {translator} from '../src/i18n.js';
import {Document,Packer,Paragraph} from 'docx';
import JSZip from 'jszip';
const ops={paintImageXObject:1,constructPath:2,endPath:3,clip:4,eoClip:5};
const bounds=boxes=>({isEmpty:i=>!boxes[i],minX:i=>boxes[i][0],minY:i=>boxes[i][1],maxX:i=>boxes[i][2],maxY:i=>boxes[i][3]});
test('photos et contour associés, fond latéral et filets exclus',()=>{
 const operators={fnArray:[2,2,1,2],argsArray:[[7],[7],[],[7]]};
 const b=bounds([[.67,0,1,1],[.73,.04,.94,.2],[.74,.05,.93,.19],[.06,.3,.63,.305]]);
 const result=visualGroups(operators,ops,b,{width:595,height:842});
 assert.equal(result.groups.length,1);assert.deepEqual(result.groups[0].indices.sort(),[1,2]);assert.equal(result.groups[0].image,true);
});
test('plafond de séparation et absence de coordonnées explicites',()=>{
 assert.equal(visualGroups({fnArray:[],argsArray:[]},ops,null,{width:595,height:842}).limited,true);
 const boxes=Array.from({length:20},(_,i)=>[.02+i%5*.19,.02+Math.floor(i/5)*.2,.1+i%5*.19,.1+Math.floor(i/5)*.2]);
 const result=visualGroups({fnArray:boxes.map(()=>1),argsArray:boxes.map(()=>[])},ops,bounds(boxes),{width:595,height:842});assert.equal(result.groups.length,16);assert.equal(result.limited,true);
});
test('comparaison tient compte des pixels transparents et des couleurs visibles',()=>{
 assert.equal(visualDifference([255,0,0,0],[0,255,0,0]),0);assert.equal(visualDifference([255,0,0,255],[0,255,0,255]),1);assert.equal(visualDifference([0,0,0,255],[0,0,0,0]),1);
});
test('scan : image dense détectée, mots exclus, grande page sombre refusée',()=>{
 const width=200,height=300;const data=new Uint8ClampedArray(width*height*4).fill(255);
 const rect=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){let i=(yy*width+xx)*4;data[i]=data[i+1]=data[i+2]=50;}};
 rect(120,20,50,60);rect(20,150,70,12);
 const ocr={blocks:[{paragraphs:[{lines:[{words:[{bbox:{x0:20,y0:150,x1:90,y1:162},text:'Recognised text'}]}]}]}]};
 const result=scanRegions({data,width,height},ocr,width,height);assert.equal(result.length,1);assert(result[0].x>=115);
 data.fill(0);assert.equal(scanRegions({data,width,height},{blocks:[]},width,height).length,0);
});
test('texte contenu dans une illustration scan non dupliqué dans le flux',()=>{
 const lines=[{x:10,baseline:20,width:20},{x:100,baseline:100,width:30}];assert.deepEqual(outsideVisuals(lines,[{box:{x:0,y:0,width:50,height:50}}]),[lines[1]]);
});
for(const language of ['fr','en','nl'])test('objet image Word et description traduite : '+language,async()=>{
 const t=translator(language),data=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64');
 const run=visualRun({data,box:{x:72,y:144,width:100,height:80},kind:'picture'},t,1);
 const zip=await JSZip.loadAsync(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[run]})]}]})));
 const xml=await zip.file('word/document.xml').async('string');assert(xml.includes(t('visualName',{index:1})));assert(xml.includes('914400'));assert(xml.includes('1828800'));assert(xml.includes(t('visualPictureDescription')));assert(!xml.includes('w:framePr'));
});
