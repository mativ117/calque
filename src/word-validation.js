import JSZip from 'jszip';
import { UserError } from './i18n.js';

// Vérification de structure, pas simulation du rendu de Microsoft Word.
export async function validateWord(blob, reports, expectedPages, t) {
 if(reports.length!==expectedPages || reports.some((page,index)=>page.page!==index+1))throw new UserError(t('errorValidation'));
 try {
  const zip=await JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
  for(const path of ['[Content_Types].xml','_rels/.rels','word/document.xml'])if(!zip.file(path))throw new Error('missing');
  const xml=await zip.file('word/document.xml').async('string');
  const parsed=new DOMParser().parseFromString(xml,'application/xml');
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  if(parsed.querySelector('parsererror') || !parsed.getElementsByTagNameNS(ns,'body').length || parsed.getElementsByTagNameNS(ns,'sectPr').length!==expectedPages)throw new Error('invalid');
  return {sourcePages:expectedPages,sections:expectedPages,structureChecked:true};
 } catch{throw new UserError(t('errorValidation'));}
}
