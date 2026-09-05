import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createApp } from '../server/app';
import { extractFile } from '../server/extract';
import { demo } from '../shared/demo';
import { defaultDesign } from '../shared/schema';

let server: Server;
let base: string;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
async function upload(name: string, data: Buffer | string) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(Buffer.from(data))]), name);
  return fetch(`${base}/api/import`, { method: 'POST', body: form });
}

test('paste import returns editable sections and full source', async () => {
  const response = await post('/api/import', {
    text: 'Deniz Yılmaz\ndeniz@example.com\nExperience\nWorked on accessible products.\nSkills\nTypeScript, Python',
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.resume.name, 'Deniz Yılmaz');
  assert.equal(result.method, 'local');
  assert.equal(result.resume.sections.length, 2);
  assert.ok(result.sourceText.includes('TypeScript'));
  assert.ok(result.warnings.length > 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('UTF-8 TXT uploads preserve Turkish characters', async () => {
  const response = await upload(
    'resume.TXT',
    'Deniz Yılmaz\ndeniz@example.com\nEğitim\nÖrnek Üniversitesi, Şişli\nBeceriler\nTürkçe, İngilizce',
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.sourceText.includes('Örnek Üniversitesi, Şişli'));
});

test('DOCX reads paragraphs and table text', async () => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Deniz Yılmaz</w:t></w:r></w:p><w:p><w:r><w:t>deniz@example.com</w:t></w:r></w:p><w:p><w:r><w:t>Experience</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Software Engineer, Örnek Firma</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  );
  const response = await upload('resume.docx', await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.sourceText.includes('Software Engineer, Örnek Firma'));
});

test('bad, unsupported, empty, binary and excessive uploads have useful errors', async () => {
  for (const [name, content] of [
    ['resume.docx', 'not zip'],
    ['resume.pdf', 'not pdf'],
    ['resume.exe', 'anything'],
    ['resume.txt', ''],
    ['resume.txt', 'binary\u0000 data is not a valid CV file'],
  ]) {
    const response = await upload(name, content);
    assert.equal(response.status, 422, name);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const tooLarge = await upload('resume.txt', Buffer.alloc(10 * 1024 * 1024 + 1, 'x'));
  assert.equal(tooLarge.status, 400);
  assert.match((await tooLarge.json()).error, /10 MB/);
});

test('DOCX expansion is bounded before document parsing', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', 'x'.repeat(26 * 1024 * 1024));
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(extractFile(data, 'large.docx'), /çok büyük/);
});

test('cross-origin requests, foreign hosts and invalid exports are rejected', async () => {
  const origin = await fetch(`${base}/api/import`, {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(origin.status, 403);
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(`${base}/api/health`, { headers: { Host: 'attacker.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const invalid = await post('/api/export/pdf', {
    resume: demo,
    design: { ...defaultDesign, fontSize: 999 },
  });
  assert.equal(invalid.status, 400);
  const malformed = await fetch(`${base}/api/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad',
  });
  assert.equal(malformed.status, 400);
});

test('TEX export uses Unicode-capable XeLaTeX and preserves source content', async () => {
  const response = await post('/api/export/tex', { resume: demo, design: defaultDesign });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition') || '', /resume.tex/);
  const text = await response.text();
  assert.ok(text.includes('XeLaTeX'));
  assert.ok(text.includes('Deniz Yılmaz'));
  assert.ok(text.includes('offline sync'));
  assert.ok(text.includes('\\usepackage{fontspec}'));
});

test('PDF exports real A4 text and can be uploaded again', { timeout: 45_000 }, async () => {
  const response = await post('/api/export/pdf', {
    resume: demo,
    design: { ...defaultDesign, density: 'compact' },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/pdf/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    assert.ok(Math.abs(viewport.width - 595.28) < 1);
    assert.ok(Math.abs(viewport.height - 841.89) < 1);
    const text = (await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    for (const value of [
      'Deniz Yılmaz',
      'İstanbul',
      'Software Engineer',
      'offline sync',
      'Languages spoken',
    ])
      assert.ok(text.includes(value), value);
  } finally {
    await task.destroy();
  }
  const reimport = await upload('generated.pdf', Buffer.from(bytes));
  assert.equal(reimport.status, 200);
  assert.ok((await reimport.json()).sourceText.includes('Deniz Yılmaz'));
});

test(
  'long CV creates multiple pages without losing final bullets',
  { timeout: 45_000 },
  async () => {
    const long = structuredClone(demo);
    long.sections.push({
      id: 'long',
      title: 'Selected work',
      content:
        Array.from(
          { length: 70 },
          (_, i) =>
            `- Project ${i + 1}: Developed an accessible interface and a reliable data import workflow for a fictional sample application.`,
        ).join('\n') + '\n- FINAL_CONTENT_MARKER: Last achievement is retained.',
    });
    const response = await post('/api/export/pdf', { resume: long, design: defaultDesign });
    assert.equal(response.status, 200);
    const task = getDocument({
      data: new Uint8Array(await response.arrayBuffer()),
      useSystemFonts: true,
    });
    try {
      const pdf = await task.promise;
      assert.ok(pdf.numPages >= 3);
      const page = await pdf.getPage(pdf.numPages);
      const content = await page.getTextContent();
      assert.ok(
        content.items.some((item) => 'str' in item && item.str.includes('FINAL_CONTENT_MARKER')),
      );
    } finally {
      await task.destroy();
    }
  },
);
