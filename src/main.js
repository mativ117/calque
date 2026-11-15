import './style.css';
import { openPdf, convertPdf } from './converter.js';

const $ = id => document.getElementById(id);
let file, pdf, controller, busy = false, resultUrl, selection = 0;
const notes = {
  faithful: 'Le rendu est une image haute résolution. Un léger écart reste possible au zoom ou à l’impression.',
  editable: 'Mise en page simplifiée. Polices, tableaux et images non garantis. OCR automatique si une page ne contient pas de texte.',
  ocr: 'Français + anglais. Les mots incertains seront en jaune. L’OCR ne retrouve pas les polices originales. Une relecture reste nécessaire.',
};
function resetResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null; $('result').hidden = true; $('download').removeAttribute('href');
  $('alert-list').replaceChildren(); $('error').hidden = true;
}
function setBusy(value) {
  busy = value;
  for (const id of ['file', 'dropzone', 'replace', 'clear', 'modes']) $(id).disabled = value;
  $('convert').disabled = value || !pdf;
  $('cancel').hidden = !value;
  $('converter-title').closest('section').setAttribute('aria-busy', String(value));
}
async function choose(selected) {
  if (!selected || busy) return;
  const version = ++selection;
  resetResult(); $('progress').hidden = true;
  controller?.abort();
  controller = new AbortController();
  setBusy(true); $('cancel').hidden = true;
  const previous = pdf; pdf = null; file = null;
  if (previous) await previous.destroy();
  $('status').textContent = 'Vérification du document sur votre appareil…';
  try {
    const loaded = await openPdf(selected, controller.signal);
    if (version !== selection) { await loaded.destroy(); return; }
    pdf = loaded; file = selected;
    $('file-title').textContent = file.name;
    $('file-meta').textContent = `${(file.size / 1024 / 1024).toFixed(1)} Mo · ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;
    $('selected-actions').hidden = false;
    $('status').textContent = 'Document prêt. Choisissez votre résultat.';
  } catch (error) {
    if (version !== selection) return;
    $('file-title').textContent = 'Déposez votre PDF ici';
    $('file-meta').textContent = 'ou cliquez pour choisir un fichier';
    $('selected-actions').hidden = true;
    $('error').textContent = error.message; $('error').hidden = false;
    $('status').textContent = 'Choisissez un autre PDF.';
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
  if (event.dataTransfer.files.length > 1) {
    $('error').textContent = 'Choisissez un seul PDF à la fois.'; $('error').hidden = false; return;
  }
  void choose(event.dataTransfer.files[0]);
});
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('clear').addEventListener('click', async () => {
  if (busy) return;
  ++selection; controller?.abort(); resetResult();
  const previous = pdf; pdf = null; file = null;
  $('file-title').textContent = 'Déposez votre PDF ici';
  $('file-meta').textContent = 'ou cliquez pour choisir un fichier';
  $('selected-actions').hidden = true;
  $('status').textContent = 'Choisissez un PDF pour commencer.';
  $('progress').hidden = true;
  setBusy(false); if (previous) await previous.destroy();
});
$('modes').addEventListener('change', () => {
  $('mode-note').textContent = notes[document.querySelector('input[name="mode"]:checked').value];
  resetResult(); $('progress').hidden = true;
  if (pdf) $('status').textContent = 'Document prêt. Lancez la conversion avec le mode choisi.';
});
$('cancel').addEventListener('click', () => {
  controller?.abort(); $('cancel').disabled = true;
  $('status').textContent = 'Annulation en cours…';
});
$('convert').addEventListener('click', async () => {
  if (busy || !pdf) return;
  resetResult(); controller = new AbortController(); setBusy(true);
  $('progress').hidden = false; $('progress').value = 0; $('cancel').disabled = false;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  try {
    const result = await convertPdf(pdf, mode, { signal: controller.signal,
      onProgress: update => { $('progress').value = update.progress;
        $('status').textContent = `${update.phase} · page ${update.page} sur ${update.total}`; },
    });
    resultUrl = URL.createObjectURL(result.blob);
    $('download').href = resultUrl;
    $('download').download = file.name.replace(/\.pdf$/i, '') + '-calque.docx';
    $('result-summary').textContent = `${result.pages} page(s) traitée(s). ` + (result.ocrPages
      ? `${result.ocrPages} page(s) avec OCR. Relisez le texte avec votre PDF source, même sans alerte.`
      : mode === 'faithful' ? 'Les pages sont des images : leur texte ne sera pas modifiable.'
      : 'Le texte est modifiable. Vérifiez la mise en page avec le PDF source.');
    $('alerts').hidden = result.alerts.length === 0;
    for (const alert of result.alerts) {
      const line = document.createElement('li');
      line.textContent = `Page ${alert.page} : ` + (alert.kind === 'empty'
        ? 'aucun texte reconnu. Page vide ou scan illisible : vérifiez l’original.'
        : `${alert.uncertain} mot(s) incertain(s) sur ${alert.total}, surligné(s) en jaune.`);
      $('alert-list').append(line);
    }
    $('result').hidden = false; $('progress').value = 100;
    $('status').textContent = result.alerts.length ? `Word prêt · ${result.alerts.length} page(s) à vérifier.` : 'Conversion terminée. Votre Word est prêt à télécharger.';
    $('result').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  } catch (error) {
    if (error.name === 'AbortError') $('status').textContent = 'Conversion annulée. Aucun Word n’a été généré.';
    else {
      $('error').textContent = error.message || 'La conversion a échoué. Essayez un PDF plus petit.';
      $('error').hidden = false; $('status').textContent = 'Conversion impossible.';
    }
    $('progress').hidden = true;
  } finally { setBusy(false); }
});
window.addEventListener('pagehide', () => { controller?.abort(); resetResult(); if (pdf) void pdf.destroy(); });
