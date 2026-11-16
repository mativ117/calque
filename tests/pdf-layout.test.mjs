import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseOperators,mapFont,orderLines,scanLayout} from '../src/pdf-layout.js';
test('fontes natives : famille et styles',()=>{
 assert.deepEqual(mapFont({name:'ABCDEF+NimbusSans-BoldItalic'}),{font:'Arial',bold:true,italics:true});
 assert.equal(mapFont({name:'NimbusRoman-Regular'}).font,'Times New Roman');
});
test('couleurs et visibilité respectent la pile graphique',()=>{
 const ops={save:1,restore:2,setFillRGBColor:3,showText:4,setTextRenderingMode:5,transform:6,paintImageXObject:7};
 const a=analyseOperators({fnArray:[3,4,1,3,5,4,2,4,6,7],argsArray:[['#c97940'],[[{unicode:'A'}]],[],['#ffffff'],[3],[[{unicode:'B'}]],[],[[{unicode:'C'}]],[100,0,0,80,0,0],[]]},ops);
 assert.equal(a.text,'ABC');assert.equal(a.visibleCharacters,2);assert.deepEqual(a.paints.map(p=>p.color),['C97940','FFFFFF','C97940']);assert.equal(a.images[0].area,8000);
});
test('lecture logique par colonne avec pied en dernier',()=>{
 const line=(text,x,baseline,width=100)=>({text,x,baseline,width});
 const result=orderLines([line('footer',30,820),line('right1',420,100),line('left2',30,130),line('left1',30,100),line('right2',420,130)],{width:595,height:842});
 assert.equal(result.columns,2);assert.deepEqual(result.lines.map(l=>l.text),['left1','left2','right1','right2','footer']);
});
test('scan : sépare les grands espaces entre colonnes et garde les mots incertains',()=>{
 const data={blocks:[{paragraphs:[{lines:[{words:[{text:'Left',confidence:98,bbox:{x0:20,y0:20,x1:80,y1:40}},{text:'Right',confidence:60,bbox:{x0:420,y0:20,x1:480,y1:40}}]}]}]}]};
 const result=scanLayout(data,600,800,{width:600,height:800});assert.equal(result.lines.length,2);assert.equal(result.lines[1].runs[0].uncertain,true);
});

test('couleur des contours et quadrichromie récupérées',()=>{
 const ops={setStrokeRGBColor:1,setTextRenderingMode:2,showText:3,setFillCMYKColor:4};
 const result=analyseOperators({fnArray:[1,2,3,2,4,3],argsArray:[['#123456'],[1],[[{unicode:'A'}]],[0],[0,1,1,0],[[{unicode:'B'}]]]},ops);
 assert.deepEqual(result.paints.map(p=>p.color),['123456','FF0000']);
});
