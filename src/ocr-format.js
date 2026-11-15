import { Paragraph, TextRun } from 'docx';
export const CONFIDENCE = 85;

export function ocrParagraphs(data, pageNumber) {
  const lines = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []));
  const words = lines.flatMap(line => line.words || []).filter(word => word.text?.trim());
  if (data.text?.trim() && !words.length) throw new Error('Le moteur OCR n’a pas fourni les scores de confiance. Réessayez la conversion.');
  const uncertain = words.filter(word => !Number.isFinite(word.confidence) || word.confidence < CONFIDENCE).length;
  const empty = !words.length;
  const note = empty ? 'Aucun texte reconnu : page vide ou scan illisible. Vérifiez le PDF source.'
    : uncertain ? `${uncertain} mot(s) incertain(s) en jaune. Relisez tout le texte.` : 'Texte reconnu : une relecture reste nécessaire.';
  const children = [new Paragraph({ spacing: { after: 160 }, children: [
    new TextRun({ text: `Page source ${pageNumber} — OCR : `, italics: true, size: 18, color: '63705E' }),
    new TextRun({ text: note, size: 18, ...(empty || uncertain ? { highlight: 'yellow' } : {}) }),
  ] })];
  for (const line of lines) {
    const lineWords = (line.words || []).filter(word => word.text?.trim());
    if (!lineWords.length) continue;
    children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: lineWords.map(word => new TextRun({
      text: word.text + ' ', font: 'Arial', size: 22,
      ...(!Number.isFinite(word.confidence) || word.confidence < CONFIDENCE ? { highlight: 'yellow' } : {}),
    })) }));
  }
  return { children, alert: empty || uncertain ? { page: pageNumber, kind: empty ? 'empty' : 'uncertain', uncertain, total: words.length } : null };
}
