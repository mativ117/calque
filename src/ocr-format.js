import { translator, UserError } from './i18n.js';
import { Paragraph, TextRun } from 'docx';
export const CONFIDENCE = 85;

export function ocrParagraphs(data, pageNumber, t = translator('fr')) {
  const lines = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []));
  const words = lines.flatMap(line => line.words || []).filter(word => word.text?.trim());
  if (data.text?.trim() && !words.length) throw new UserError(t('errorScores'));
  const uncertain = words.filter(word => !Number.isFinite(word.confidence) || word.confidence < CONFIDENCE).length;
  const empty = !words.length;
  const note = t(empty ? 'wordEmpty' : uncertain ? 'wordUncertain' : 'wordReview', { count: uncertain });
  const children = [new Paragraph({ spacing: { after: 160 }, children: [
    new TextRun({ text: t('wordPrefix', { page: pageNumber }), italics: true, size: 18, color: '63705E' }),
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
  return { children, note, alert: empty || uncertain ? { page: pageNumber, kind: empty ? 'empty' : 'uncertain', uncertain, total: words.length } : null };
}
