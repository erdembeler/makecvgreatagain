import type { Design, Resume } from './schema';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function safeUrl(value: string): string | null {
  if (/^(https?:\/\/|mailto:)/i.test(value) && !/[\s<>"\\]/.test(value)) return value;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value)) return `mailto:${value}`;
  if (/^(www\.|github\.com\/|linkedin\.com\/)[^\s<>"\\]+$/i.test(value)) return `https://${value}`;
  return null;
}
/** Deliberately tiny inline grammar: text, bold and safe links. No raw HTML. */
export function inlineHtml(value: string): string {
  const tokens = value.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*)/g);
  return tokens
    .map((token) => {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const url = safeUrl(link[2]);
        return url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`
          : escapeHtml(token);
      }
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4)
        return `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
      return escapeHtml(token);
    })
    .join('');
}
function linesHtml(content: string): string {
  const lines = content.split('\n');
  let output = '';
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const bullet = /^[-•●▪]\s+/.test(line);
    if (!bullet && inList) {
      output += '</ul>';
      inList = false;
    }
    if (bullet) {
      if (!inList) {
        output += '<ul>';
        inList = true;
      }
      output += `<li>${inlineHtml(line.replace(/^[-•●▪]\s+/, ''))}</li>`;
    } else if (!line) {
      // LaTeX commonly puts an empty line between an entry title and its list.
      // Do not insert a breakable spacer there: it would orphan the title.
      const nextLine =
        lines
          .slice(i + 1)
          .find((s) => s.trim())
          ?.trim() ?? '';
      if (!/^[-•●▪]\s+/.test(nextLine)) output += '<div class="entry-gap"></div>';
    } else {
      const [left, ...right] = line.split('\t');
      const nextBullet = /^[-•●▪]\s+/.test(
        lines
          .slice(i + 1)
          .find((s) => s.trim())
          ?.trim() ?? '',
      );
      output += `<p class="${nextBullet ? 'entry-title' : ''}${right.length ? ' dated' : ''}"><span>${inlineHtml(left)}</span>${right.length ? `<span class="date">${inlineHtml(right.join(' '))}</span>` : ''}</p>`;
    }
  }
  if (inList) output += '</ul>';
  return output;
}
export function renderDocument(resume: Resume, design: Design): string {
  const compact = design.density === 'compact';
  const modern = design.template === 'modern';
  return `<!doctype html><html lang="${/\b(egitim|eğitim|deneyim|beceriler|projeler)\b/i.test(resume.sections.map((s) => s.title).join(' ')) ? 'tr' : 'en'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><title>${escapeHtml(resume.name || 'CV')}</title><style>
  @page { size: A4; margin: 12.7mm; }
  * { box-sizing: border-box; }
  html { background: white; }
  body { margin: 0; padding: 12.7mm; min-height: 297mm; color: #171717; font-family: ${modern ? 'Arial, Helvetica, sans-serif' : 'Georgia, "Times New Roman", serif'}; font-size: ${design.fontSize}pt; line-height: ${compact ? 1.24 : 1.38}; overflow-wrap: anywhere; }
  header { text-align: ${modern ? 'left' : 'center'}; padding-bottom: ${compact ? 5 : 8}pt; ${modern ? 'border-bottom: 2pt solid #23483c;' : ''} }
  h1 { font-size: 27pt; line-height: 1.1; letter-spacing: -.6pt; font-weight: ${modern ? '700' : '400'}; margin: 0 0 5pt; }
  .headline { font-size: 11pt; margin: 0 0 5pt; color: #454545; }
  .contacts { display: flex; flex-wrap: wrap; justify-content: ${modern ? 'flex-start' : 'center'}; column-gap: 7pt; row-gap: 2pt; font-size: 9pt; }
  .contact + .contact::before { content: '|'; padding-right: 7pt; color: #777; }
  a { color: inherit; text-decoration: none; }
  section { margin-top: ${compact ? 9 : 12}pt; }
  h2 { font-size: 12pt; margin: 0 0 5pt; border-bottom: ${modern ? '.7pt solid #b3c6bc' : '.7pt solid #222'}; padding-bottom: 3pt; break-after: avoid; ${modern ? 'color:#23483c;text-transform:uppercase;font-size:10pt;letter-spacing:1pt;' : ''} }
  p { margin: 0 0 3pt; }
  .dated { display: flex; justify-content: space-between; gap: 12pt; align-items: baseline; }
  .dated > span:first-child { flex: 1; }
  .date { text-align: right; max-width: 42%; flex-shrink: 0; }
  .entry-title { break-after: avoid; }
  ul { padding-left: 13pt; margin: 3pt 0 4pt; break-inside: avoid; }
  li { margin: 0 0 ${compact ? 1 : 2}pt; break-inside: avoid; }
  .entry-gap { height: ${compact ? 3 : 5}pt; }
  @media print { body { padding: 0; min-height: 0; } a { text-decoration: none; } }
  </style></head><body><header><h1>${escapeHtml(resume.name || 'Ad Soyad')}</h1>${resume.headline ? `<p class="headline">${escapeHtml(resume.headline)}</p>` : ''}<div class="contacts">${resume.contacts
    .filter((c) => c.trim())
    .map((contact) => {
      const url = safeUrl(contact);
      return `<span class="contact">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(contact)}</a>` : inlineHtml(contact)}</span>`;
    })
    .join('')}</div></header>${resume.sections
    .filter((s) => s.content.trim())
    .map((s) => `<section><h2>${escapeHtml(s.title)}</h2>${linesHtml(s.content)}</section>`)
    .join('')}</body></html>`;
}

export function escapeLatex(value: string): string {
  const replacements: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '&': '\\&',
    '%': '\\%',
    $: '\\$',
    '#': '\\#',
    _: '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return value.replace(/[\\&%$#_{}~^]/g, (c) => replacements[c]);
}
function inlineLatex(value: string): string {
  return value
    .split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*)/g)
    .map((token) => {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && safeUrl(link[2]))
        return `\\href{${escapeLatex(safeUrl(link[2])!)}}{${escapeLatex(link[1])}}`;
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4)
        return `\\textbf{${escapeLatex(token.slice(2, -2))}}`;
      return escapeLatex(token);
    })
    .join('');
}
export function renderLatex(resume: Resume, design: Design): string {
  const compact = design.density === 'compact';
  const body = resume.sections
    .filter((s) => s.content.trim())
    .map((section) => {
      let output = `\\section*{${escapeLatex(section.title)}}\n`;
      let inList = false;
      for (const line of section.content.split('\n')) {
        const bullet = /^[-•●▪]\s+/.test(line.trim());
        if (!bullet && inList) {
          output += '\\end{itemize}\n';
          inList = false;
        }
        if (bullet) {
          if (!inList) {
            output += '\\begin{itemize}\n';
            inList = true;
          }
          output += `\\item ${inlineLatex(line.trim().replace(/^[-•●▪]\s+/, ''))}\n`;
        } else if (!line.trim()) output += '\\par\\smallskip\n';
        else output += line.split('\t').map(inlineLatex).join(' \\hfill ') + '\\par\n';
      }
      if (inList) output += '\\end{itemize}\n';
      return output;
    })
    .join('\n');
  return `% Generated by Make CV Great Again. Compile with XeLaTeX in Overleaf.\n% Content is escaped; uploaded LaTeX is never executed by the application.\n\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.5in]{geometry}
\\usepackage{fontspec}
\\setmainfont{${design.template === 'modern' ? 'TeX Gyre Heros' : 'TeX Gyre Schola'}}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\pagestyle{empty}
\\raggedright
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{2pt}
\\titleformat{\\section}{\\bfseries\\large}{}{0pt}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{${compact ? 8 : 12}pt}{4pt}
\\setlist[itemize]{leftmargin=13pt,itemsep=${compact ? 0 : 2}pt,topsep=3pt,parsep=0pt}
\\begin{document}
\\fontsize{${design.fontSize}}{${(design.fontSize * (compact ? 1.24 : 1.38)).toFixed(2)}}\\selectfont
${design.template === 'classic' ? '\\begin{center}' : ''}
{\\fontsize{27}{30}\\selectfont ${escapeLatex(resume.name)}}\\par
${resume.headline ? escapeLatex(resume.headline) + '\\par' : ''}
{\\small ${resume.contacts
    .map((c) => {
      const url = safeUrl(c);
      return url ? `\\href{${escapeLatex(url)}}{${escapeLatex(c)}}` : inlineLatex(c);
    })
    .join(' \\enspace | \\enspace ')}}
${design.template === 'classic' ? '\\end{center}' : ''}
${body}
\\end{document}
`;
}
