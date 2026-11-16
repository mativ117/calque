import { fixtures } from './fixtures.mjs';
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
test.beforeAll(async({browser})=>fixtures(browser));
async function select(page,file){await page.locator('#file').setInputFiles(`tests/fixtures/${file}`);await expect(page.locator('#convert')).toBeEnabled();}
async function convert(page){
 await page.locator('#convert').click();await expect(page.locator('#result')).toBeVisible({timeout:110_000});
 const event=page.waitForEvent('download');await page.locator('#download').click();const download=await event;
 return JSZip.loadAsync(await readFile(await download.path()));
}
test('parcours unique responsive, comparaison disponible après sélection',async({page})=>{
 await page.goto('./');await expect(page).toHaveTitle(/Calque/);await expect(page.locator('#convert')).toBeDisabled();
 expect(await page.getByRole('radio').count()).toBe(0);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await select(page,'texte.pdf');await expect(page.locator('#original-preview canvas')).toBeVisible();
 await expect(page.locator('#text-preview')).toContainText('après la conversion');
 await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'tests/interface-desktop.png',fullPage:true});
});
test('toutes les pages sources sont incluses, texte éditable et ZIP sans lien externe',async({page})=>{
 await page.goto('./');await select(page,'texte.pdf');const zip=await convert(page);
 const xml=await zip.file('word/document.xml').async('string');expect(xml).toContain('Bonjour');expect(xml).toContain('Deuxieme');
 expect((xml.match(/<w:sectPr\b/g)||[]).length).toBe(2);expect(xml).toContain('w:w="6000" w:h="8000"');expect(xml).toContain('w:w="8000" w:h="6000"');
 expect(await zip.file('word/_rels/document.xml.rels').async('string')).not.toContain('TargetMode="External"');
 await expect(page.locator('#validation-status')).toContainText('2 page(s) source');
 await expect(page.locator('#text-preview')).toContainText('Bonjour');await page.locator('#next-page').click();await expect(page.locator('#text-preview')).toContainText('Deuxieme');
 await page.locator('#clear').click();await expect(page.locator('#convert')).toBeDisabled();await expect(page.locator('#review')).toBeHidden();await expect(page.locator('#result')).toBeHidden();
});
test('lecture réelle d’un scan : réseau local en lecture, aucun stockage documentaire',async({page})=>{
 const external=[],writes=[],errors=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');await select(page,'scan.pdf');const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 expect(xml).toContain('Bonjour');expect(xml).toContain('confidentiel');expect(xml).toContain('Page d’origine 1');
 await expect(page.locator('#text-preview')).toContainText('Bonjour');
 expect(external).toEqual([]);expect(writes).toEqual([]);expect(errors).toEqual([]);
 expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,db:0});
});
for(const file of ['document.png','document.jpg'])test('image de document acceptée : '+file,async({page})=>{
 await page.goto('./');await select(page,file);const zip=await convert(page);
 expect(await zip.file('word/document.xml').async('string')).toContain('Bonjour');await expect(page.locator('#review')).toBeVisible();await expect(page.locator('#alert-list')).toContainText('ne sont pas reconstruits');
});
test('tableau non reconstruit : perte explicitement signalée dans le bilan et le Word',async({page})=>{
 await page.goto('./');await select(page,'tableau.pdf');const zip=await convert(page);
 const xml=await zip.file('word/document.xml').async('string');expect(xml).toContain('Facture test');expect(xml).toContain('ne sont pas reconstruits');
 await expect(page.locator('#review-warnings')).toContainText('dessins, des lignes ou des images');
});
test('page vide : aucun faux succès de lecture',async({page})=>{
 await page.goto('./');await select(page,'vide.pdf');const zip=await convert(page);
 await expect(page.locator('#alert-list')).toContainText('aucun texte reconnu');await expect(page.locator('#text-preview')).toContainText('Aucun texte reconnu');expect(await zip.file('word/document.xml').async('string')).toContain('Aucun texte reconnu');
});
test('image sombre et faible résolution : avertissements explicites',async({page})=>{
 await page.goto('./');await select(page,'sombre.png');await convert(page);await expect(page.locator('#review-warnings')).toContainText('Page sombre');
 await select(page,'faible.png');await convert(page);await expect(page.locator('#review-warnings')).toContainText('Image de petite taille');
});
test('rotation manuelle appliquée à l’aperçu et invalidation du résultat',async({page})=>{
 await page.goto('./');await select(page,'texte.pdf');const canvas=page.locator('#original-preview canvas');const width=await canvas.getAttribute('width'),height=await canvas.getAttribute('height');
 await page.locator('#rotate-right').click();await expect(page.locator('#status')).toContainText('Page tournée');
 await expect(canvas).toHaveAttribute('width',height);await expect(canvas).toHaveAttribute('height',width);
 const zip=await convert(page);expect(await zip.file('word/document.xml').async('string')).toContain('w:w="8000" w:h="6000"');
 await page.locator('#rotate-left').click();await expect(page.locator('#result')).toBeHidden();
});
test('mauvais format, PDF invalide et annulation',async({page})=>{
 await page.goto('./');await page.locator('#file').setInputFiles({name:'document.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('PK invalid')});await expect(page.locator('#error')).toContainText('Word ne sont pas acceptés');
 await page.locator('#file').setInputFiles('tests/fixtures/invalide.pdf');await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#convert')).toBeDisabled();
 await select(page,'scan.pdf');await page.locator('#convert').click();await expect(page.locator('#language')).toBeDisabled();await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('annulée');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#convert')).toBeEnabled();
});
for(const [language,title,error]of[['fr','Un fichier. Un Word modifiable.','Format non pris en charge'],['en','One file. Editable Word text.','Unsupported format'],['nl','Eén bestand. Bewerkbare Word-tekst.','Niet-ondersteund formaat']])test('interface et contrôles traduits : '+language,async({page})=>{
 await page.goto(`./?lang=${language}`);await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('#converter-title')).toHaveText(title);
 expect(await page.locator('body').innerText()).not.toMatch(/\bOCR\b/);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`tests/interface-mobile-${language}.png`,fullPage:true});
 await page.locator('#file').setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.locator('#error')).toContainText(error);
});
test('changer de langue conserve la source et traduit l’aperçu et le Word',async({page})=>{
 await page.goto('./?lang=fr');await select(page,'document.png');await page.locator('#language').selectOption('nl');await expect(page.locator('#file-title')).toHaveText('document.png');
 const zip=await convert(page);expect(await zip.file('word/document.xml').async('string')).toContain('Oorspronkelijke pagina 1');await expect(page.locator('#result-title')).toHaveText('Uw Word-document is klaar.');
});
test('scan multilingue : contenu non traduit et notes en anglais',async({page})=>{
 await page.goto('./?lang=en');await select(page,'multilingue.pdf');const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 for(const word of ['Bonjour','Please','vergadering','negen','Original page 1'])expect(xml).toContain(word);
});

test('image démesurée refusée avant décodage',async({page})=>{
 await page.goto('./');const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(100000,16);bytes.writeUInt32BE(100000,20);
 await page.locator('#file').setInputFiles({name:'huge.png',mimeType:'image/png',buffer:bytes});await expect(page.locator('#error')).toContainText('40 millions');await expect(page.locator('#convert')).toBeDisabled();
});
test('une page tournée peut être reconnue automatiquement et le réglage est signalé',async({page})=>{
 await page.goto('./');await select(page,'tourne.png');const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 expect(xml).toContain('Bonjour');await expect(page.locator('#text-preview')).toContainText('Bonjour');
 await expect(page.locator('#review-warnings')).toContainText('orientation');
});

test('PDF de 150 pages texte : toutes les pages sont converties',async({page})=>{
 const start=Date.now();await page.goto('./');await select(page,'long-150.pdf');await expect(page.locator('#workload-note')).toBeVisible();
 const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 expect((xml.match(/<w:sectPr\b/g)||[]).length).toBe(150);
 for(let i=1;i<=150;i++)expect(xml).toContain('Source page '+String(i).padStart(3,'0'));
 await expect(page.locator('#work-status')).toContainText('150 / 150');await expect(page.locator('#validation-status')).toContainText('150 page(s) source');
 console.log(JSON.stringify({fixture:'150 text pages',elapsedMs:Date.now()-start}));
});
test('PDF de 151 pages refusé avec une explication, limites inchangées',async({page})=>{
 await page.goto('./');await page.locator('#file').setInputFiles('tests/fixtures/long-151.pdf');await expect(page.locator('#error')).toContainText('dépasse 150 pages');await expect(page.locator('#convert')).toBeDisabled();await expect(page.locator('#review')).toBeHidden();
});
test('intervalle de pages : validation et aperçu conservent la numérotation source',async({page})=>{
 await page.goto('./');await select(page,'long-150.pdf');await page.locator('#page-range').evaluate(element=>element.open=true);
 await page.locator('#first-page').fill('50');await page.locator('#last-page').fill('52');
 const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 expect((xml.match(/<w:sectPr\b/g)||[]).length).toBe(3);for(const i of [50,51,52])expect(xml).toContain('Source page '+String(i).padStart(3,'0'));expect(xml).not.toContain('Source page 049');expect(xml).not.toContain('Source page 053');
 await expect(page.locator('#selection-summary')).toContainText('50 à 52 sur 150');await expect(page.locator('#review-page')).toHaveValue('50');
 await page.locator('#review-page').selectOption('49');await expect(page.locator('#text-preview')).toContainText('pas été incluse');
 await page.locator('#first-page').fill('54');await expect(page.locator('#range-error')).toBeVisible();await expect(page.locator('#convert')).toBeDisabled();
});
test('ouverture annulable : la lecture du fichier ne se poursuit pas',async({page})=>{
 await page.addInitScript(()=>{
  const Reader=window.FileReader;
  window.FileReader=class extends Reader{
   readAsArrayBuffer(file){if(file.name==='slow.pdf'){this.pending=setTimeout(()=>super.readAsArrayBuffer(file),10000);}else super.readAsArrayBuffer(file);}
   abort(){clearTimeout(this.pending);window.readerStopped=true;super.abort();}
  };
 });
 await page.goto('./');await page.locator('#file').setInputFiles({name:'slow.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 slow')});
 await expect(page.locator('#cancel')).toBeVisible();await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('Ouverture annulée');expect(await page.evaluate(()=>window.readerStopped)).toBe(true);
 await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#convert')).toBeDisabled();
 await select(page,'texte.pdf');await convert(page);
});
test('scan de 13 pages : progression exacte et reprise après renouvellement du moteur',async({page})=>{
 const start=Date.now();await page.goto('./');await select(page,'scan-long.pdf');
 await page.evaluate(()=>{
  window.readingStatuses=[];const status=document.getElementById('status');
  window.statusObserver=new MutationObserver(()=>{if(status.textContent.includes('Lecture du texte'))window.readingStatuses.push(status.textContent);});window.statusObserver.observe(status,{childList:true,subtree:true});
 });
 const zip=await convert(page);const xml=await zip.file('word/document.xml').async('string');
 expect((xml.match(/<w:sectPr\b/g)||[]).length).toBe(13);for(let i=1;i<=13;i++)expect(xml).toContain('Page d’origine '+i+' —');
 expect((await page.evaluate(()=>window.readingStatuses)).some(status=>status.includes('page 13 sur 13'))).toBe(true);
 await expect(page.locator('#work-status')).toContainText('13 / 13');
 console.log(JSON.stringify({fixture:'13 scanned pages',elapsedMs:Date.now()-start}));
});
