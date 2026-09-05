import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResume, latexToText } from '../server/parser';
import { demo } from '../shared/demo';
import { defaultDesign, resumeSchema } from '../shared/schema';
import { renderDocument, renderLatex, escapeLatex } from '../shared/render';

const latex = String.raw`\documentclass[11pt]{article}
\usepackage{XCharter}
\begin{document}
\centerline{\Huge Deniz Yılmaz}
\centerline{\href{mailto:deniz@example.com}{deniz@example.com} | İstanbul, Türkiye | \href{https://example.com}{Portfolio}}
\section*{Education}
\textbf{Example University} -- Software Engineering \hfill 2020 -- 2024 \\
\section*{Skills}
\textbf{Systems \& Cloud:} C/C++, Python, Docker \\
\textbf{Languages:} Turkish, English \\
\section*{Experience}
\textbf{Engineer,} {Sample Studio} \hfill 2024 -- Present \\
\begin{itemize}
\item Built an offline-first sync layer with 24/7 operation.
\item Improved a 14-day reporting tool by 10\%. % Not resume content.
\end{itemize}
\section*{Projects}
\textbf{Notes} | \textit{Flutter, Dart} \hfill \href{https://example.com/beta}{Public preview} \\
\begin{itemize}
\item Created a tool with Unicode: Bahçeşehir, Şişli, Iğdır.
\end{itemize}
\end{document}`;

test('LaTeX preserves sections, bullets, Unicode, dates, escapes, and distinct URL labels', () => {
  const { resume, sourceText } = parseResume(latex, true);
  assert.equal(resume.name, 'Deniz Yılmaz');
  assert.equal(resume.contacts.length, 3);
  assert.deepEqual(
    resume.sections.map((s) => s.title),
    ['Education', 'Skills', 'Experience', 'Projects'],
  );
  assert.equal(resume.sections[2].content.split('\n').filter((l) => l.startsWith('- ')).length, 2);
  for (const value of [
    'Systems & Cloud',
    'C/C++',
    '24/7',
    '14-day',
    '10%',
    'Bahçeşehir, Şişli, Iğdır',
    '[Public preview](https://example.com/beta)',
  ])
    assert.ok(sourceText.includes(value), value);
  assert.ok(!sourceText.includes('Not resume content'));
  assert.ok(resume.sections[0].content.includes('\t2020 -- 2024'));
});

test('uppercase names, roles and skill values are retained as content', () => {
  const { resume } = parseResume(
    'CV\nJANE DOE\njane@example.com\nExperience\nSOFTWARE ENGINEER\nACME LTD\n2023–2026\nDelivered a feature.\nSkills\nPYTHON\nSQL',
  );
  assert.equal(resume.name, 'JANE DOE');
  assert.equal(resume.sections.length, 2);
  const html = renderDocument(resume, defaultDesign);
  for (const value of ['SOFTWARE ENGINEER', 'ACME LTD', 'PYTHON', 'SQL'])
    assert.ok(html.includes(value));
});

test('Turkish headings and custom explicit headings preserve content', () => {
  const { resume } = parseResume(
    'Deniz Yılmaz\ndeniz@example.com\nEĞİTİM\nÖrnek Üniversitesi\nİŞ DENEYİMİ\nÖrnek firma\nYABANCI DİLLER\nİngilizce\n## Seçilmiş çalışmalar\nBir kitap',
  );
  assert.deepEqual(
    resume.sections.map((s) => s.title),
    ['EĞİTİM', 'İŞ DENEYİMİ', 'YABANCI DİLLER', 'Seçilmiş çalışmalar'],
  );
});

test('Markdown document title remains the person name', () => {
  const { resume } = parseResume(
    '# Jane Doe\nSoftware Engineer\njane@example.com\n## Experience\nWorked at Acme Inc.',
  );
  assert.equal(resume.name, 'Jane Doe');
  assert.equal(resume.headline, 'Software Engineer');
  assert.deepEqual(resume.contacts, ['jane@example.com']);
  assert.equal(resume.sections[0].title, 'Experience');
});

test('unrecognized prose is preserved for manual editing', () => {
  const body =
    'I built accessible products for small businesses. I also taught workshops and volunteered at a local library.';
  const { resume } = parseResume(`Jane Doe\njane@example.com\n${body}`);
  assert.ok(resume.sections.some((s) => s.content.includes(body)));
});

test('large section below overall 80K content limit validates', () => {
  const { resume } = parseResume(
    'Jane Doe\njane@example.com\nExperience\n' + 'Long work description. '.repeat(1000),
  );
  assert.ok(resumeSchema.safeParse(resume).success);
});

test('empty, scanned and oversized text fails explicitly', () => {
  assert.throws(() => parseResume(''), /Yeterli metin/);
  assert.throws(() => parseResume('x'.repeat(80_001)), /80.000/);
});

test('exported XeLaTeX can be imported without layout arguments polluting the name', () => {
  const { resume } = parseResume(renderLatex(demo, defaultDesign), true);
  assert.equal(resume.name, demo.name);
  assert.equal(resume.headline, demo.headline);
  assert.equal(resume.sections.length, demo.sections.length);
  assert.ok(
    resume.sections.find((s) => s.title === 'Experience')?.content.includes('offline sync'),
  );
});

test('HTML rendering escapes active content and rejects script URLs', () => {
  const unsafe = structuredClone(demo);
  unsafe.name = '<img src=x onerror=alert(1)>';
  unsafe.sections[0].content =
    '**A & B**\n<script>alert(1)</script>\n[click](javascript:alert)\n[valid](https://example.com)';
  const html = renderDocument(unsafe, defaultDesign);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('<strong>A &amp; B</strong>'));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('Content-Security-Policy'));
});

test('LaTeX escapes commands and special characters rather than executing them', () => {
  assert.equal(
    escapeLatex(String.raw`\input{secret} & 10%`),
    String.raw`\textbackslash{}input\{secret\} \& 10\%`,
  );
  const value = latexToText(
    String.raw`\begin{document}\centerline{Jane Doe}\input{/etc/passwd}\section*{Experience}Safe content\end{document}`,
  );
  assert.ok(!value.includes('/etc/passwd'));
  assert.ok(value.includes('Safe content'));
});
