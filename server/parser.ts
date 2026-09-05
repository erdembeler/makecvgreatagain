import type { Resume } from '../shared/schema';
import { MAX_TEXT } from '../shared/schema';

const headings = new Set([
  'education',
  'egitim',
  'egitim bilgileri',
  'academic background',
  'experience',
  'work experience',
  'professional experience',
  'employment history',
  'deneyim',
  'is deneyimi',
  'is deneyimleri',
  'skills',
  'technical skills',
  'yetenekler',
  'beceriler',
  'teknik yetkinlikler',
  'yetkinlikler',
  'projects',
  'personal projects',
  'projeler',
  'summary',
  'professional summary',
  'profile',
  'profil',
  'ozet',
  'hakkimda',
  'objective',
  'languages',
  'diller',
  'yabanci diller',
  'certifications',
  'certificates',
  'sertifikalar',
  'awards',
  'oduller',
  'publications',
  'yayinlar',
  'references',
  'referanslar',
  'volunteering',
  'volunteer experience',
  'gonulluluk',
  'interests',
  'ilgi alanlari',
]);
function normalize(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .trim();
}
function plain(value: string) {
  return value.replace(/\*\*/g, '').trim();
}

/** A small, non-executing reader for common resume LaTeX commands. */
export function latexToText(input: string): string {
  const body = input.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/)?.[1] ?? input;
  const source = body
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== '%') continue;
        let slashes = 0;
        for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++;
        if (slashes % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join(' ');
  let position = 0;
  function group(): string {
    while (/\s/.test(source[position] ?? '') && position < source.length) position++;
    if (source[position] !== '{') return '';
    position++;
    return read(true);
  }
  function read(inGroup = false): string {
    let out = '';
    while (position < source.length) {
      const char = source[position++];
      if (char === '}') {
        if (inGroup) break;
        continue;
      }
      if (char === '{') {
        out += read(true);
        continue;
      }
      if (char !== '\\') {
        out += char === '~' ? ' ' : char;
        continue;
      }
      const next = source[position];
      if (next === '\\') {
        position++;
        out += '\n';
        continue;
      }
      if (next && /[%&#_${}]/.test(next)) {
        out += next;
        position++;
        continue;
      }
      const match = source.slice(position).match(/^[A-Za-z]+\*?/);
      if (!match) {
        if (next) {
          out += next;
          position++;
        }
        continue;
      }
      const command = match[0].replace(/\*$/, '');
      position += match[0].length;
      if (command === 'section' || command === 'subsection') {
        out += '\n\n## ' + group().trim() + '\n';
      } else if (command === 'textbf') {
        out += '**' + group().trim() + '**';
      } else if (['textit', 'emph', 'textrm', 'textnormal', 'underline', 'mbox'].includes(command))
        out += group();
      else if (command === 'centerline') out += '\n' + group().trim() + '\n';
      else if (command === 'href') {
        const url = group().trim();
        const label = group().trim();
        out +=
          url.replace(/^mailto:/, '') === label ||
          url.replace(/^https?:\/\//, '').replace(/\/$/, '') === label.replace(/\/$/, '')
            ? label
            : '[' + label + '](' + url + ')';
      } else if (command === 'url') out += group();
      else if (command === 'hfill') out += '\t';
      else if (command === 'fontsize') {
        group();
        group();
      } else if (command === 'item') out += '\n- ';
      else if (command === 'begin' || command === 'end') {
        group();
        out += '\n';
      } else if (
        ['vspace', 'hspace', 'input', 'include', 'label', 'pagestyle', 'setlength'].includes(
          command,
        )
      ) {
        group();
        if (command === 'setlength') group();
      } else if (['newline', 'par', 'smallskip', 'medskip', 'bigskip'].includes(command))
        out += '\n';
      else if (command === 'textbackslash') out += '\\';
      else if (command === 'textasciitilde') out += '~';
      else if (command === 'textasciicircum') out += '^';
      // Font switches and layout commands are deliberately not executed.
    }
    return out;
  }
  return read()
    .replace(/ +/g, ' ')
    .replace(/ *\t */g, '\t')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseResume(
  input: string,
  isLatex = false,
): { resume: Resume; sourceText: string; warnings: string[] } {
  if (input.length > MAX_TEXT)
    throw new Error('CV çok uzun. En fazla 80.000 karakter destekleniyor.');
  const sourceText = (isLatex ? latexToText(input) : input)
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (sourceText.length < 20)
    throw new Error(
      'Yeterli metin bulunamadı. Taranmış PDF için önce OCR uygulayın veya CV metnini yapıştırın.',
    );
  const lines = sourceText.split('\n').map((l) => l.trim());
  const resume: Resume = { name: '', headline: '', contacts: [], sections: [] };
  const header: string[] = [];
  let current: Resume['sections'][number] | undefined;
  for (const line of lines) {
    const title = plain(line.replace(/^#{1,3}\s+/, '').replace(/[:：]$/, ''));
    if (
      /^#\s+/.test(line) &&
      !current &&
      !header.some((l) => l.trim()) &&
      !headings.has(normalize(title))
    ) {
      header.push(title);
      continue;
    }
    const explicit = /^#{1,3}\s+/.test(line);
    if (explicit || headings.has(normalize(title))) {
      current = { id: `section-${resume.sections.length + 1}`, title, content: '' };
      resume.sections.push(current);
    } else if (current)
      current.content += (current.content ? '\n' : '') + line.replace(/^[•●▪◦]\s*/, '- ');
    else header.push(line);
  }
  const nonempty = header
    .filter(Boolean)
    .filter((l) => !/^(curriculum vitae|resume|résumé|özgeçmiş|cv)$/i.test(plain(l)));
  const isContact = (line: string) =>
    /@|https?:|www\.|github\.|linkedin\.|\+?\d[\d ()-]{7,}\d/.test(line);
  const nameIndex = nonempty.findIndex((l) => !isContact(l) && plain(l).length < 100);
  if (nameIndex >= 0) resume.name = plain(nonempty.splice(nameIndex, 1)[0]);
  const intro: string[] = [];
  for (const line of nonempty) {
    if (isContact(line)) {
      const parts = line.split(/\s*\|\s*|\s*[•·]\s*/).filter(Boolean);
      for (const part of parts) {
        if (resume.contacts.length < 12 && part.length <= 400) resume.contacts.push(part);
        else intro.push(part);
      }
    } else if (!resume.headline && line.length <= 80) resume.headline = plain(line);
    else intro.push(line);
  }
  if (intro.length)
    resume.sections.unshift({ id: 'intro', title: 'Profil / Profile', content: intro.join('\n') });
  if (!resume.sections.length)
    resume.sections.push({ id: 'details', title: 'Detaylar / Details', content: '' });
  for (const section of resume.sections) section.content = section.content.trim();
  const warnings = [
    'Otomatik ayrıştırılan bilgileri, özellikle adınızı, tarihleri ve bölüm sırasını kontrol edin.',
  ];
  if (!resume.name) warnings.push('Ad soyad otomatik bulunamadı. İçerik sekmesinden ekleyin.');
  if (!resume.sections.some((s) => s.content))
    warnings.push('Bölümler belirlenemedi. Kaynak metni kullanarak içeriği düzenleyin.');
  if (isLatex)
    warnings.push(
      'LaTeX içeriği metin olarak okundu; özel komutlar ve görsel yerleşim aktarılmayabilir.',
    );
  return { resume, sourceText, warnings };
}
