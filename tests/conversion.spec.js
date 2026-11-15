import { fixtures } from './fixtures.mjs';
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

test.beforeAll(async ({ browser }) => { await fixtures(browser); });

async function select(page, file) {
 await page.locator('#file').setInputFiles(`tests/fixtures/${file}`);
 await expect(page.locator('#convert')).toBeEnabled();
}
async function convert(page, mode) {
 if(mode === 'ocr') await page.locator('#advanced').evaluate(element=>element.open=true);
 await page.locator(`input[value="${mode}"]`).check();
 await page.locator('#convert').click();
 await expect(page.locator('#result')).toBeVisible({timeout: 100_000});
 const event = page.waitForEvent('download');
 await page.locator('#download').click();
 const download = await event;
 return JSZip.loadAsync(await readFile(await download.path()));
}
test('page responsive et accessible sans fichier', async ({ page }) => {
 await page.goto('./');
 await expect(page).toHaveTitle(/Calque/);
 await expect(page.locator('#convert')).toBeDisabled();
 for(const width of [390, 768, 1440]) {
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:1440,height:1050});
 await page.screenshot({path:'tests/interface-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'tests/interface-mobile.png',fullPage:true});
});
test('mode fidèle : deux images, dimensions portrait et paysage, aucun lien externe', async ({ page }) => {
 await page.goto('./'); await select(page,'texte.pdf');
 const zip = await convert(page,'faithful');
 const xml = await zip.file('word/document.xml').async('string');
 expect((xml.match(/<wp:anchor\b/g)||[]).length).toBe(2);
 expect(xml).toContain('w:w="6000" w:h="8000"');
 expect(xml).toContain('w:w="8000" w:h="6000"');
 expect(Object.keys(zip.files).filter(path=>path.startsWith('word/media/')&&!zip.files[path].dir)).toHaveLength(2);
 const rels=await zip.file('word/_rels/document.xml.rels').async('string');
 expect(rels).not.toContain('TargetMode="External"');
});
test('texte natif extrait et retrait du document',async({page})=>{
 await page.goto('./'); await select(page,'texte.pdf');
 const zip=await convert(page,'editable');
 expect(await zip.file('word/document.xml').async('string')).toContain('Bonjour');
 await page.locator('#clear').click();
 await expect(page.locator('#convert')).toBeDisabled();
 await expect(page.locator('#result')).toBeHidden();
});
test('OCR réel sur scan, uniquement requêtes locales en lecture, sans stockage documentaire',async({page})=>{
 const external=[]; const writes=[]; const errors=[];
 page.on('request',request=>{
  if(!request.url().startsWith('http://127.0.0.1:4173/')&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:')) external.push(request.url());
  if(!['GET','HEAD'].includes(request.method())) writes.push(request.url());
 });
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('./'); await select(page,'scan.pdf');
 const zip=await convert(page,'ocr');
 const xml=await zip.file('word/document.xml').async('string');
 expect(xml).toContain('Bonjour'); expect(xml).toContain('confidentiel');
 expect(xml).toContain("Page d’origine 1");
 expect(external).toEqual([]); expect(writes).toEqual([]); expect(errors).toEqual([]);
 expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,db:0});
});
test('page vide : alerte dans le bilan et dans Word, OCR automatique en mode texte',async({page})=>{
 await page.goto('./'); await select(page,'vide.pdf');
 const zip=await convert(page,'editable');
 await expect(page.locator('#alert-list')).toContainText('Page 1 : aucun texte reconnu');
 expect(await zip.file('word/document.xml').async('string')).toContain('Aucun texte reconnu');
});
test('PDF invalide et annulation de l’OCR',async({page})=>{
 await page.goto('./');
 await page.locator('#file').setInputFiles('tests/fixtures/invalide.pdf');
 await expect(page.locator('#error')).toContainText('Impossible de lire');
 await expect(page.locator('#convert')).toBeDisabled();
 await select(page,'scan.pdf');
 await page.locator('#advanced').evaluate(element=>element.open=true);
 await page.locator('input[value="ocr"]').check();
 await page.locator('#convert').click();
 await page.locator('#cancel').click();
 await expect(page.locator('#status')).toContainText('annulée');
 await expect(page.locator('#result')).toBeHidden();
 await expect(page.locator('#convert')).toBeEnabled();
});

for(const [language, title, error] of [
 ['fr','Garder l’apparence','Impossible de lire'],
 ['en','Keep the page appearance','could not be read'],
 ['nl','De opmaak behouden','kon niet worden gelezen'],
]) test(`interface ${language} compréhensible, responsive et erreurs traduites`,async({page})=>{
 await page.goto(`./?lang=${language}`);
 await expect(page.locator('html')).toHaveAttribute('lang',language);
 await expect(page.getByRole('radio',{name:title,exact:true})).toBeVisible();
 expect(await page.locator('input[name="mode"]:visible').count()).toBe(2);
 expect(await page.locator('body').innerText()).not.toMatch(/\bOCR\b/);
 for(const width of [390,768,1440]) {
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`tests/interface-mobile-${language}.png`,fullPage:true});
 await page.locator('#file').setInputFiles('tests/fixtures/invalide.pdf');
 await expect(page.locator('#error')).toContainText(error);
});
test('changer de langue conserve le PDF sélectionné et traduit le résultat',async({page})=>{
 await page.goto('./?lang=fr');await select(page,'texte.pdf');
 await page.locator('#language').selectOption('nl');
 await expect(page.locator('#file-title')).toHaveText('texte.pdf');
 await expect(page.locator('#convert')).toBeEnabled();
 await expect(page).toHaveURL(/lang=nl/);
 await convert(page,'editable');
 await expect(page.locator('#result-title')).toHaveText('Uw Word-document is klaar.');
 await expect(page.locator('#status')).toContainText('Word-bestand downloaden');
});
test('un scan français, anglais et néerlandais est reconnu avec une interface anglaise',async({page})=>{
 await page.goto('./?lang=en');await select(page,'multilingue.pdf');
 const zip=await convert(page,'editable');
 const xml=await zip.file('word/document.xml').async('string');
 expect(xml).toContain('Bonjour');expect(xml).toContain('Please');expect(xml).toContain('vergadering');expect(xml).toContain('negen');
 expect(xml).toContain('Original page 1');
 await expect(page.locator('#result-summary')).toContainText('original PDF');
});
