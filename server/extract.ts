import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import yauzl from 'yauzl';
import { extname } from 'node:path';
import { MAX_TEXT } from '../shared/schema';

async function validateDocx(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(new Error('DOCX dosyası okunamadı. Geçerli bir Word dosyası yükleyin.'));
      let total = 0;
      let count = 0;
      let documentFound = false;
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        total += entry.uncompressedSize;
        count++;
        if (entry.fileName === 'word/document.xml') documentFound = true;
        if (total > 25 * 1024 * 1024 || count > 2000) {
          zip.close();
          reject(new Error('DOCX içeriği çok büyük. Daha küçük bir belge yükleyin.'));
          return;
        }
        zip.readEntry();
      });
      zip.on('end', () =>
        documentFound ? resolve() : reject(new Error('Bu dosya geçerli bir DOCX belgesi değil.')),
      );
      zip.readEntry();
    });
  });
}

export async function extractFile(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; isLatex: boolean }> {
  const extension = extname(filename).toLowerCase();
  let text = '';
  if (extension === '.pdf') {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw new Error('Dosya geçerli bir PDF değil.');
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 30) throw new Error('En fazla 30 sayfalık PDF yükleyebilirsiniz.');
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        let previousY: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5];
          if (previousY !== undefined && Math.abs(y - previousY) > 3 && !text.endsWith('\n'))
            text += '\n';
          text += item.str + (item.hasEOL ? '\n' : ' ');
          previousY = y;
        }
        text += '\n\n';
        if (text.length > MAX_TEXT)
          throw new Error('PDF metni çok uzun. En fazla 80.000 karakter destekleniyor.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException')
        throw new Error('PDF parola korumalı. Parolasız bir kopyasını yükleyin.');
      throw error;
    } finally {
      await task.destroy();
    }
  } else if (extension === '.docx') {
    await validateDocx(buffer);
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === '.txt' || extension === '.tex' || extension === '.md') {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('Metin dosyası UTF-8 olmalı. UTF-8 olarak kaydedip tekrar yükleyin.');
    }
    if (text.includes('\u0000')) throw new Error('Dosya okunabilir bir metin dosyası değil.');
  } else throw new Error('Desteklenen dosyalar: PDF, DOCX, TXT, TEX ve Markdown.');
  if (text.length > MAX_TEXT)
    throw new Error('CV çok uzun. En fazla 80.000 karakter destekleniyor.');
  return {
    text,
    isLatex: extension === '.tex' || /\\(?:documentclass|begin\{document\})/.test(text),
  };
}
