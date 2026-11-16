import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const target = new URL('../public/ocr/', import.meta.url);
await mkdir(target, { recursive: true });
const models = {
  nld: 'ced0e5e046a84c908a6aa7accbef9a232c4a5d9a8276691b81c6ee64d02963f6',
  fra: 'ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca',
  eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
};
for (const [language, hash] of Object.entries(models)) {
  const file = new URL(`${language}.traineddata`, target);
  let data;
  try { data = await readFile(file); } catch {
    const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/${language}.traineddata`);
    if (!response.ok) throw new Error(`Modèle OCR indisponible : ${language}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(data).digest('hex') !== hash) throw new Error(`Empreinte OCR incorrecte : ${language}`);
  await writeFile(file, data);
}
await copyFile('node_modules/tesseract.js/dist/worker.min.js', new URL('worker.min.js', target));
await copyFile('node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', new URL('worker-LICENSE.txt', target));
await copyFile('node_modules/tesseract.js-core/LICENSE', new URL('core-LICENSE.txt', target));
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core-(simd-)?lstm\.wasm(\.js)?$/.test(file))
    await copyFile(`node_modules/tesseract.js-core/${file}`, new URL(file, target));
}
// PDF.js charge ces ressources uniquement depuis la même origine.
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  const { cp } = await import('node:fs/promises');
  await cp(`node_modules/pdfjs-dist/${directory}`, `public/pdfjs/${directory}`, { recursive: true });
}
console.log('Composants PDF et OCR préparés et modèles vérifiés.');
const notices = [];
for (const [name, file] of [
  ['docx', 'node_modules/docx/LICENSE'],
  ['PDF.js', 'node_modules/pdfjs-dist/LICENSE'],
  ['Tesseract.js', 'node_modules/tesseract.js/LICENSE.md'],
  ['Tesseract.js-core', 'node_modules/tesseract.js-core/LICENSE'],
  ['JSZip', 'node_modules/jszip/LICENSE.markdown'],
  ['sax 1.6.1', 'node_modules/sax/LICENSE.md'],
  ['Modèles OCR', 'public/ocr/MODELS-LICENSE'],
]) notices.push(`${name}\n${'='.repeat(name.length)}\n${await readFile(file, 'utf8')}`);
await writeFile('public/THIRD-PARTY.txt', notices.join('\n\n'));
