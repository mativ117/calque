import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { Document, Packer, Paragraph, TextRun, ImageRun, SectionType, PageOrientation } from 'docx';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const ROOT = new URL(import.meta.env.BASE_URL, window.location.href);
const resource = (path) => new URL(path, ROOT).href;
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 150;
import { ocrParagraphs } from './ocr-format.js';
const MAX_PIXELS = 12_000_000;

export function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Conversion annulée.', 'AbortError');
}
export async function openPdf(file, signal) {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choisissez un PDF non vide de 50 Mo maximum.');
  checkAbort(signal);
  const data = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  const task = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false,
    cMapUrl: resource('pdfjs/cmaps/'), cMapPacked: true,
    standardFontDataUrl: resource('pdfjs/standard_fonts/'),
    wasmUrl: resource('pdfjs/wasm/'), maxImageSize: MAX_PIXELS, useSystemFonts: false });
  const abort = () => { void task.destroy(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    checkAbort(signal);
    if (pdf.numPages > MAX_PAGES) { await pdf.destroy(); throw new Error('Ce PDF dépasse la limite de 150 pages.'); }
    return pdf;
  } catch (error) {
    checkAbort(signal);
    if (error.name === 'PasswordException') throw new Error('Ce PDF est protégé par un mot de passe. Utilisez une copie déverrouillée.');
    if (error.message?.includes('150 pages')) throw error;
    throw new Error('Impossible de lire ce PDF. Il est peut-être endommagé ou dans un format non pris en charge.');
  } finally { signal?.removeEventListener('abort', abort); }
}
function dimensions(page) {
  const view = page.getViewport({ scale: 1 });
  if (Math.min(view.width, view.height) < 72 || Math.max(view.width, view.height) > 1584)
    throw new Error('Dimensions incompatibles avec Word : chaque côté doit mesurer entre 2,54 et 55,88 cm.');
  return view;
}
function properties(view, faithful) {
  const landscape = view.width > view.height;
  return { type: SectionType.NEXT_PAGE, page: {
    size: { width: Math.round((landscape ? view.height : view.width) * 20),
      height: Math.round((landscape ? view.width : view.height) * 20),
      orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
    margin: { top: faithful ? 0 : 480, bottom: faithful ? 0 : 480,
      left: faithful ? 0 : 480, right: faithful ? 0 : 480, header: 0, footer: 0 },
  } };
}
async function render(page, view, signal, dpi) {
  const scale = Math.min(dpi / 72, Math.sqrt(MAX_PIXELS / (view.width * view.height)));
  const canvas = document.createElement('canvas');
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'rgb(255,255,255)' });
  const abort = () => task.cancel();
  signal?.addEventListener('abort', abort, { once: true });
  try { await task.promise; checkAbort(signal); return canvas; }
  catch (error) { canvas.width = canvas.height = 0; checkAbort(signal); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}
async function imageParagraph(page, view, signal) {
  const canvas = await render(page, view, signal, 216);
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Le navigateur ne peut pas générer l’image de cette page.');
    const data = new Uint8Array(await blob.arrayBuffer());
    checkAbort(signal);
    return new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, children: [new ImageRun({
      type: 'png', data, transformation: { width: view.width * 96 / 72, height: view.height * 96 / 72 },
      floating: { horizontalPosition: { relative: 'page', offset: 0 }, verticalPosition: { relative: 'page', offset: 0 },
        behindDocument: true, allowOverlap: true, layoutInCell: false },
    })] });
  } finally { canvas.width = canvas.height = 0; }
}
function nativeText(content) {
  const children = []; let runs = []; let previousY;
  const flush = () => { if (runs.length) children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: runs })); runs = []; };
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    if (previousY !== undefined && Math.abs(y - previousY) > 3) flush();
    const style = content.styles[item.fontName] || {};
    const font = (style.fontFamily || 'Arial').replace(/["']/g, '');
    runs.push(new TextRun({ text: item.str + ' ', font,
      size: Math.round(Math.max(5, Math.min(144, Math.hypot(item.transform[2], item.transform[3])))) * 2,
      bold: /bold/i.test(item.fontName + font), italics: /italic|oblique/i.test(item.fontName + font) }));
    previousY = y;
    if (item.hasEOL) flush();
  }
  flush(); return children;
}
export async function convertPdf(pdf, mode, { signal, onProgress = () => {} } = {}) {
  if (!['faithful', 'editable', 'ocr'].includes(mode)) throw new Error('Mode de conversion inconnu.');
  const sections = []; const alerts = []; let worker; let currentPage = 0; let ocrPages = 0;
  const stopWorker = () => { if (worker) void worker.terminate(); };
  signal?.addEventListener('abort', stopWorker, { once: true });
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      currentPage = number;
      checkAbort(signal);
      onProgress({ page: number, total: pdf.numPages, progress: (number - 1) / pdf.numPages * 95, phase: 'Conversion' });
      const page = await pdf.getPage(number);
      try {
        const view = dimensions(page);
        let children;
        if (mode === 'faithful') children = [await imageParagraph(page, view, signal)];
        else {
          const content = mode === 'editable' ? await page.getTextContent() : null;
          const native = content?.items.some(item => 'str' in item && item.str.trim());
          if (native) children = nativeText(content);
          else {
            if (!worker) {
              onProgress({ page: number, total: pdf.numPages, progress: (number - 1) / pdf.numPages * 95, phase: 'Chargement du moteur OCR local' });
              // Tous les chemins sont explicitement sur la même origine. Aucun cache IndexedDB.
              worker = await createWorker('fra+eng', 1, {
                workerPath: resource('ocr/worker.min.js'), corePath: resource('ocr/'), langPath: resource('ocr/'),
                workerBlobURL: false, gzip: false, cacheMethod: 'none',
                errorHandler: () => {},
                logger: message => {
                  if (message.status === 'recognizing text') onProgress({ page: number, total: pdf.numPages,
                    progress: ((number - 1 + message.progress * .9) / pdf.numPages) * 95, phase: 'Reconnaissance OCR' });
                },
              });
              checkAbort(signal);
              await worker.setParameters({ classify_enable_learning: '0', user_defined_dpi: '300' });
            }
            const canvas = await render(page, view, signal, 300);
            try {
              const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
              checkAbort(signal);
              const recognized = ocrParagraphs(data, number);
              children = recognized.children;
              if (recognized.alert) alerts.push(recognized.alert);
              ocrPages++;
            } finally { canvas.width = canvas.height = 0; }
          }
        }
        sections.push({ properties: properties(view, mode === 'faithful'), children });
      } finally { page.cleanup(); }
      // Laisse le navigateur afficher la progression et traiter l’annulation.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    checkAbort(signal);
    onProgress({ page: pdf.numPages, total: pdf.numPages, progress: 97, phase: 'Création du Word' });
    const document = new Document({ creator: '', lastModifiedBy: '', title: '', description: '',
      styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 0 } } } } }, sections });
    const blob = await Packer.toBlob(document);
    checkAbort(signal);
    return { blob, alerts, ocrPages, pages: pdf.numPages };
  } catch (error) {
    checkAbort(signal);
    throw new Error(`Page ${currentPage || 1} : ${error.message || 'conversion impossible. Essayez un document plus petit ou le mode fidèle.'}`);
  } finally {
    signal?.removeEventListener('abort', stopWorker);
    if (worker) await worker.terminate();
  }
}
