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
function textPages(count){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:count},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+count+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<count;i++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',stream('BT /F1 14 Tf 50 700 Td (Source page '+String(i+1).padStart(3,'0')+') Tj ET'));
 return pdf(objects);
}
function scanPages(count,jpeg){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:count},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+count+' >>',stream(jpeg,'/Type /XObject /Subtype /Image /Width 1654 /Height 2339 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode')];
 for(let i=0;i<count;i++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',stream('q 595 0 0 842 0 0 cm /Im1 Do Q'));
 return pdf(objects);
}
export async function fixtures(browser) {
 await mkdir('tests/fixtures',{recursive:true});
 await writeFile('tests/fixtures/long-150.pdf',textPages(150));
 await writeFile('tests/fixtures/long-151.pdf',textPages(151));
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
 const avatar=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='#999';ctx.fillRect(0,0,16,16);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
 const cvObjects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [6 0 R 8 0 R] /Count 2 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',stream(avatar,'/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode')];
 for(let index=0;index<2;index++){
  const parts=[
   '0.09 0.09 0.09 rg 397 0 198 842 re f',
   '0.79 0.47 0.25 rg 394 0 3 842 re f',
   '0.5 0.5 0.5 rg BT /F1 8 Tf 36 22 Td (SYNTHETIC CV) Tj ET',
   '0.79 0.47 0.25 rg BT /F2 10 Tf 550 22 Td (0'+(index+1)+') Tj ET',
   '0.1 0.1 0.1 rg BT /F2 24 Tf 36 790 Td (ALIX EXAMPLE) Tj ET',
   '0.79 0.47 0.25 rg BT /F2 12 Tf 36 760 Td (BUSINESS ANALYST) Tj ET',
   '0.1 0.1 0.1 rg BT /F2 12 Tf 36 690 Td (PROFILE) Tj ET',
   '0.8 0.8 0.8 RG 0.5 w 36 682 m 372 682 l S',
   '0.1 0.1 0.1 rg BT /F1 10 Tf 36 660 Td (Left profile first line.) Tj 0 -14 Td (Left profile second line.) Tj ET',
   'BT /F2 12 Tf 36 600 Td (PROFESSIONAL EXPERIENCE) Tj ET',
   'BT /F1 10 Tf 36 575 Td (Project delivery and analysis.) Tj 0 -14 Td (Independent left column text.) Tj ET',
   '0.79 0.47 0.25 rg BT /F2 12 Tf 418 690 Td (CONTACT) Tj ET',
   '1 1 1 rg BT /F1 10 Tf 418 660 Td (Example City) Tj 0 -14 Td (contact@example.test) Tj ET',
   '0.79 0.47 0.25 rg BT /F2 12 Tf 418 600 Td (CORE SKILLS) Tj ET',
   '1 1 1 rg BT /F1 10 Tf 418 575 Td (Requirements) Tj 0 -14 Td (Independent right text.) Tj ET',
  ];
  if(index===0)parts.push('q 90 0 0 90 439 720 cm /Photo Do Q');
  cvObjects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Photo 5 0 R >> >> /Contents '+(7+index*2)+' 0 R >>',stream(parts.join('\n')));
 }
 await writeFile('tests/fixtures/cv-columns.pdf',pdf(cvObjects));
 for(const [file,blank] of [['scan.pdf',false],['vide.pdf',true],['multilingue.pdf','multi']]) {
  const data=await page.evaluate(blank=>{
   const canvas=document.createElement('canvas');canvas.width=1654;canvas.height=2339;
   const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1654,2339);
   if(blank!==true){context.fillStyle='black';context.font='42px Arial';context.fillText('Bonjour document confidentiel 12345',120,240);if(blank==='multi'){context.fillText('Please review the confidential document.',120,340);context.fillText('De vergadering begint om negen uur.',120,440);}}
   return canvas.toDataURL('image/jpeg',.95).split(',')[1];
  },blank);
  if(file==='scan.pdf')await writeFile('tests/fixtures/scan-long.pdf',scanPages(13,Buffer.from(data,'base64')));
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
