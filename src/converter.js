import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { translator, UserError } from './i18n.js';
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
export async function openPdf(file, signal, t = translator('fr')) {
  if (!file.size || file.size > MAX_BYTES) throw new UserError(t('errorSize'));
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
    if (pdf.numPages > MAX_PAGES) { await pdf.destroy(); throw new UserError(t('errorPages')); }
    return pdf;
  } catch (error) {
    checkAbort(signal);
    if (error.name === 'PasswordException') throw new UserError(t('errorPassword'));
    if (error instanceof UserError) throw error;
    throw new UserError(t('errorRead'));
  } finally { signal?.removeEventListener('abort', abort); }
}
function dimensions(page, t) {
  const view = page.getViewport({ scale: 1 });
  if (Math.min(view.width, view.height) < 72 || Math.max(view.width, view.height) > 1584)
    throw new UserError(t('errorDimensions'));
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
async function imageParagraph(page, view, signal, t) {
  const canvas = await render(page, view, signal, 216);
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new UserError(t('errorImage'));
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
export async function convertPdf(pdf, mode, { signal, onProgress = () => {}, t = translator('fr') } = {}) {
  if (!['faithful', 'editable', 'ocr'].includes(mode)) throw new UserError(t('errorMode'));
  const sections = []; const alerts = []; let worker; let currentPage = 0; let ocrPages = 0;
  const stopWorker = () => { if (worker) void worker.terminate(); };
  signal?.addEventListener('abort', stopWorker, { once: true });
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      currentPage = number;
      checkAbort(signal);
      onProgress({ page: number, total: pdf.numPages, progress: (number - 1) / pdf.numPages * 95, phase: t('phaseConvert') });
      const page = await pdf.getPage(number);
      try {
        const view = dimensions(page, t);
        let children;
        if (mode === 'faithful') children = [await imageParagraph(page, view, signal, t)];
        else {
          const content = mode === 'editable' ? await page.getTextContent() : null;
          const native = content?.items.some(item => 'str' in item && item.str.trim());
          if (native) children = nativeText(content);
          else {
            if (!worker) {
              onProgress({ page: number, total: pdf.numPages, progress: (number - 1) / pdf.numPages * 95, phase: t('phaseLoad') });
              // Tous les chemins sont explicitement sur la même origine. Aucun cache IndexedDB.
              worker = await createWorker('fra+eng+nld', 1, {
                workerPath: resource('ocr/worker.min.js'), corePath: resource('ocr/'), langPath: resource('ocr/'),
                workerBlobURL: false, gzip: false, cacheMethod: 'none',
                errorHandler: () => {},
                logger: message => {
                  if (message.status === 'recognizing text') onProgress({ page: number, total: pdf.numPages,
                    progress: ((number - 1 + message.progress * .9) / pdf.numPages) * 95, phase: t('phaseRead') });
                },
              });
              checkAbort(signal);
              await worker.setParameters({ classify_enable_learning: '0', user_defined_dpi: '300' });
            }
            const canvas = await render(page, view, signal, 300);
            try {
              const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
              checkAbort(signal);
              const recognized = ocrParagraphs(data, number, t);
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
    onProgress({ page: pdf.numPages, total: pdf.numPages, progress: 97, phase: t('phaseWord') });
    const document = new Document({ creator: '', lastModifiedBy: '', title: '', description: '',
      styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 0 } } } } }, sections });
    const blob = await Packer.toBlob(document);
    checkAbort(signal);
    return { blob, alerts, ocrPages, pages: pdf.numPages };
  } catch (error) {
    checkAbort(signal);
    throw new UserError(t('errorAtPage', { page: currentPage || 1, message: error instanceof UserError ? error.message : t('errorGeneric') }));
  } finally {
    signal?.removeEventListener('abort', stopWorker);
    if (worker) await worker.terminate();
  }
}
