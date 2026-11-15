import './style.css';
import { openPdf, convertPdf } from './converter.js';
import { resolveLanguage, translator, UserError } from './i18n.js';

const $ = id => document.getElementById(id);
let file, pdf, controller, busy = false, resultUrl, selection = 0;
let language = resolveLanguage(window.location.search, navigator.languages);
let t = translator(language);
const mode = () => document.querySelector('input[name="mode"]:checked').value;
function updateMode() {
  $('mode-note').textContent = t(`${mode()}Note`);
  $('advanced-title').textContent = t(mode() === 'ocr' ? 'ocrTitle' : 'advancedTitle');
}
function updateFile() {
  $('file-title').textContent = file ? file.name : t('dropTitle');
  $('file-meta').textContent = file ? t('fileInfo', {
    size: new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(file.size / 1024 / 1024),
    count: pdf.numPages,
  }) : t('dropHint');
  $('selected-actions').hidden = !file;
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('meta');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  $('language').value = language;
  $('convert-label').textContent = t('create');
  for (const anchor of document.querySelectorAll('a.brand')) anchor.href = `./?lang=${language}`;
  updateMode(); updateFile();
}
function resetResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null; $('result').hidden = true; $('download').removeAttribute('href');
  $('alert-list').replaceChildren(); $('error').hidden = true;
}
function setBusy(value) {
  busy = value;
  for (const id of ['file', 'dropzone', 'replace', 'clear', 'modes', 'language']) $(id).disabled = value;
  $('convert').disabled = value || !pdf;
  $('convert-label').textContent = t(value ? 'waiting' : 'create');
  $('cancel').hidden = !value;
  $('modes').setAttribute('aria-busy', String(value));
}
async function choose(selected) {
  if (!selected || busy) return;
  const version = ++selection;
  resetResult(); $('progress').hidden = true;
  controller?.abort(); controller = new AbortController();
  setBusy(true); $('cancel').hidden = true;
  const previous = pdf; pdf = null; file = null;
  if (previous) await previous.destroy();
  $('status').textContent = t('checking');
  try {
    const loaded = await openPdf(selected, controller.signal, t);
    if (version !== selection) { await loaded.destroy(); return; }
    pdf = loaded; file = selected; updateFile();
    $('status').textContent = t('ready');
  } catch (error) {
    if (version !== selection) return;
    updateFile();
    $('error').textContent = error instanceof UserError ? error.message : t('errorRead'); $('error').hidden = false;
    $('status').textContent = t('chooseOther');
  } finally { if (version === selection) setBusy(false); }
}
$('dropzone').addEventListener('click', () => $('file').click());
$('replace').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => { void choose(event.target.files[0]); event.target.value = ''; });
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => {
  event.preventDefault(); if (!busy) $('dropzone').classList.add('drag');
});
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => {
  event.preventDefault(); $('dropzone').classList.remove('drag');
});
$('dropzone').addEventListener('drop', event => {
  if (busy) return;
  if (event.dataTransfer.files.length > 1) {
    $('error').textContent = t('oneFile'); $('error').hidden = false; return;
  }
  void choose(event.dataTransfer.files[0]);
});
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('clear').addEventListener('click', async () => {
  if (busy) return;
  ++selection; controller?.abort(); resetResult();
  const previous = pdf; pdf = null; file = null; updateFile();
  $('status').textContent = t('initialStatus'); $('progress').hidden = true;
  setBusy(false); if (previous) await previous.destroy();
});
$('modes').addEventListener('change', () => {
  if (mode() === 'ocr') $('advanced').open = true;
  updateMode(); resetResult(); $('progress').hidden = true;
  if (pdf) $('status').textContent = t('ready');
});
$('language').addEventListener('change', () => {
  if (busy) return;
  language = $('language').value; t = translator(language);
  const url = new URL(window.location.href); url.searchParams.set('lang', language);
  window.history.replaceState(null, '', url);
  applyLanguage(); resetResult(); $('progress').hidden = true;
  $('status').textContent = t(pdf ? 'ready' : 'initialStatus');
});
$('cancel').addEventListener('click', () => {
  controller?.abort(); $('cancel').disabled = true;
  $('status').textContent = t('cancelling');
});
$('convert').addEventListener('click', async () => {
  if (busy || !pdf) return;
  resetResult(); controller = new AbortController(); setBusy(true);
  $('convert-label').textContent = t('converting');
  $('progress').hidden = false; $('progress').value = 0; $('cancel').disabled = false;
  const selectedMode = mode();
  try {
    const result = await convertPdf(pdf, selectedMode, { signal: controller.signal, t,
      onProgress: update => { $('progress').value = update.progress;
        $('status').textContent = t('progress', update); },
    });
    resultUrl = URL.createObjectURL(result.blob);
    $('download').href = resultUrl;
    $('download').download = file.name.replace(/\.pdf$/i, '') + '-calque.docx';
    $('result-summary').textContent = t('pagesDone', { count: result.pages }) + ' ' + (result.ocrPages
      ? t('summaryScans', { count: result.ocrPages })
      : t(selectedMode === 'faithful' ? 'summaryFaithful' : 'summaryEditable'));
    $('alerts').hidden = result.alerts.length === 0;
    for (const alert of result.alerts) {
      const line = document.createElement('li');
      line.textContent = t(alert.kind === 'empty' ? 'alertEmpty' : 'alertUncertain', { page: alert.page, count: alert.uncertain });
      $('alert-list').append(line);
    }
    $('result').hidden = false; $('progress').value = 100;
    $('status').textContent = t(result.alerts.length ? 'completedAlerts' : 'completed', { count: result.alerts.length });
    $('download').focus({ preventScroll: true });
    $('result').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  } catch (error) {
    if (error.name === 'AbortError') $('status').textContent = t('cancelled');
    else {
      $('error').textContent = error instanceof UserError ? error.message : t('errorGeneric');
      $('error').hidden = false; $('status').textContent = t('failed');
    }
    $('progress').hidden = true;
  } finally { setBusy(false); }
});
window.addEventListener('pagehide', () => { controller?.abort(); resetResult(); if (pdf) void pdf.destroy(); });
applyLanguage(); $('status').textContent = t('initialStatus');
