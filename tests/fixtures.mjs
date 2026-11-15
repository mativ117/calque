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
 await writeFile('tests/fixtures/tableau.pdf',pdf([
  '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  stream('0 0 0 RG 1 w 50 600 450 140 re S 50 670 m 500 670 l S 275 600 m 275 740 l S BT /F1 14 Tf 65 705 Td (Article) Tj 230 0 Td (Montant) Tj -230 -70 Td (Facture test) Tj 230 0 Td (123 EUR) Tj ET'),
 ]));
 const page=await browser.newPage();
 for(const [file,blank] of [['scan.pdf',false],['vide.pdf',true],['multilingue.pdf','multi']]) {
  const data=await page.evaluate(blank=>{
   const canvas=document.createElement('canvas');canvas.width=1654;canvas.height=2339;
   const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1654,2339);
   if(blank!==true){context.fillStyle='black';context.font='42px Arial';context.fillText('Bonjour document confidentiel 12345',120,240);if(blank==='multi'){context.fillText('Please review the confidential document.',120,340);context.fillText('De vergadering begint om negen uur.',120,440);}}
   return canvas.toDataURL('image/jpeg',.95).split(',')[1];
  },blank);
  await writeFile(`tests/fixtures/${file}`,pdf([
   '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
   stream('q 595 0 0 842 0 0 cm /Im1 Do Q'),
   stream(Buffer.from(data,'base64'),'/Type /XObject /Subtype /Image /Width 1654 /Height 2339 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'),
  ]));
 }
 for(const [file,kind] of [['document.png','clear'],['document.jpg','clear'],['sombre.png','dark'],['tourne.png','rotated'],['faible.png','small'],['flou.png','blur']]) {
  const data=await page.evaluate(kind=>{
   const c=document.createElement('canvas');c.width=kind==='small'?600:1654;c.height=kind==='small'?820:2339;
   const ctx=c.getContext('2d');ctx.fillStyle=kind==='dark'?'#333':'white';ctx.fillRect(0,0,c.width,c.height);
   if(kind==='rotated'){ctx.translate(c.width/2,c.height/2);ctx.rotate(Math.PI/2);ctx.translate(-c.height/2,-c.width/2);}
   ctx.fillStyle=kind==='dark'?'#777':'black';ctx.font=kind==='small'?'25px Arial':'42px Arial';
   if(kind==='blur')ctx.filter='blur(5px)';
   ctx.fillText('Bonjour document confidentiel 12345',40,240);
   ctx.fillText('Please review the document.',40,330);
   return c.toDataURL('image/png').split(',')[1];
  },kind);
  if(file.endsWith('.jpg')) {
   const jpg=await page.evaluate(async(data)=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);return c.toDataURL('image/jpeg',.95).split(',')[1];},data);
   await writeFile('tests/fixtures/'+file,Buffer.from(jpg,'base64'));
  }else await writeFile('tests/fixtures/'+file,Buffer.from(data,'base64'));
 }
 await page.close();
 await writeFile('tests/fixtures/invalide.pdf','not a pdf');
}
