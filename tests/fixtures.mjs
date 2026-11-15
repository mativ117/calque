import { mkdir, writeFile } from 'node:fs/promises';
function pdf(objects) {
 const parts=[Buffer.from('%PDF-1.4\n')]; const offsets=[0]; let length=parts[0].length;
 for(const [index,object] of objects.entries()) {
  offsets.push(length);
  const bytes=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),Buffer.isBuffer(object)?object:Buffer.from(object),Buffer.from('\nendobj\n')]);
  parts.push(bytes); length+=bytes.length;
 }
 const xref=length;
 parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
 return Buffer.concat(parts);
}
function stream(data,extra='') {
 const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
 return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} ${extra} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);
}
export async function fixtures(browser) {
 await mkdir('tests/fixtures',{recursive:true});
 await writeFile('tests/fixtures/texte.pdf',pdf([
  '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  stream('BT /F1 14 Tf 30 200 Td (Bonjour confidentiel) Tj ET'),
  stream('BT /F1 14 Tf 30 200 Td (Deuxieme page) Tj ET'),
 ]));
 const page=await browser.newPage();
 for(const [file,blank] of [['scan.pdf',false],['vide.pdf',true]]) {
  const data=await page.evaluate(blank=>{
   const canvas=document.createElement('canvas');canvas.width=1654;canvas.height=2339;
   const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1654,2339);
   if(!blank){context.fillStyle='black';context.font='42px Arial';context.fillText('Bonjour document confidentiel 12345',120,240);}
   return canvas.toDataURL('image/jpeg',.95).split(',')[1];
  },blank);
  await writeFile(`tests/fixtures/${file}`,pdf([
   '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
   stream('q 595 0 0 842 0 0 cm /Im1 Do Q'),
   stream(Buffer.from(data,'base64'),'/Type /XObject /Subtype /Image /Width 1654 /Height 2339 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'),
  ]));
 }
 await page.close();
 await writeFile('tests/fixtures/invalide.pdf','not a pdf');
}
