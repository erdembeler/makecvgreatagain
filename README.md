# Make CV Great Again

Turn an existing resume into a clean, professional CV on your own computer.

Upload a PDF, DOCX, TXT, Markdown, or LaTeX file, review the extracted information, and export a selectable-text PDF or an editable `.tex` file for Overleaf. The app includes a Turkish interface, live preview, two single-column templates, editable sections, and optional local AI extraction through Ollama.

**No account. No API key. No cloud processing.** The standard parser and PDF export work without an AI model. All included demo content is fictional.

## Quick start

Requires **Node.js 22.13+** and npm. Internet access is needed for the initial dependency and Chromium downloads. No TeX installation is needed for PDF export.

```sh
git clone https://github.com/erdembeler/makecvgreatagain.git
cd makecvgreatagain
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**. The local API runs on port 3001. Both bind to the loopback interface.

On Linux, install Chromium system dependencies if needed:

```sh
npx playwright install --with-deps chromium
```

If a port is already in use, copy `.env.example` to `.env`, set `CV_WEB_PORT` and/or `CV_API_PORT`, and restart. For example, `CV_WEB_PORT=5174` changes the UI address to `http://127.0.0.1:5174`.

To serve a built version:

```sh
npm run build
npm start
```

Then open **http://127.0.0.1:3001** (or your configured API port). `npm start` requires the repository dependencies, including `tsx`; do not omit development dependencies when installing. The production server serves the built frontend and API together.

## Kullanım

1. **Yükle:** Eski CV’ni sürükleyip bırak veya metnini/LaTeX kodunu yapıştır.
2. **İçerik:** Adını, iletişim bilgilerini, tarihleri ve bölümleri kontrol et. Bölüm ekleyebilir, silebilir ve sırasını değiştirebilirsin. Çıkarılan kaynak metin bu sekmede bulunur.
3. **Tasarım:** Klasik veya modern şablonu seç. Yazı boyutunu ve sayfa yoğunluğunu ayarla.
4. **İndir:** PDF’yi indir veya Overleaf için `.tex` dosyasını al. Overleaf’te **XeLaTeX** derleyicisini seç.

Önizleme kaydırılabilir bir akış gösterir; PDF indirilirken içerik A4 sayfalarına ayrılır. İçerik tek sayfaya sığdırılmak için kesilmez. HTML/PDF ve LaTeX ayrı dizgi motorları kullandığı için yazı tipleri ve sayfa kırılımları birebir aynı olmayabilir.

CV içeriği oturum belleğinde tutulur. Sayfayı yenilemeden veya kapatmadan önce çıktını indir. Düzenlenebilir bir kopya için `.tex` dosyasını saklayabilirsin. Uygulama yeniden içe aktarmayı destekler; özel LaTeX komutlarının kayıpsız geri dönüşü garanti edilmez.

## Extraction modes

### Standard (default)

- PDF.js reads text-based PDFs; Mammoth extracts DOCX text, including table content.
- A non-executing LaTeX reader handles common CV commands, sections, bullets, links, and Unicode characters.
- A deterministic parser recognizes common English and Turkish section headings.
- Extracted content remains editable. The original extracted text is available for comparison.

This mode reorganizes and typesets the content. It does **not** semantically rewrite achievements or invent new experience. Unusual layouts and section names may need manual correction. Uppercase role names and skills are preserved as content.

### Local AI (optional)

Install [Ollama](https://ollama.com), start it, and download a model:

```sh
ollama pull llama3.2
```

`llama3.2` is the default model name, not a required model. To choose another locally installed model, copy `.env.example` to `.env` and set `OLLAMA_MODEL`. Restart the app after changing `.env`.

Refresh the connection under “Yerel AI ile ayrıştır”, then enable the checkbox before importing. Ollama uses [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) to map source text to the same editable schema. Requests go only to a loopback Ollama address. Before submitting CV content, the app checks model metadata and rejects cloud models, including aliases with remote-model metadata. Use a trusted, official local Ollama daemon.

For daemon-level enforcement, disable cloud features in Ollama itself: set `"disable_ollama_cloud": true` in `~/.ollama/server.json`, or start the Ollama daemon with `OLLAMA_NO_CLOUD=1`, then restart Ollama. Setting this variable only in this app’s `.env` does not configure an already-running daemon. See the [official local-only instructions](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features).

AI can omit or misread information. Compare its result against the source text before downloading. If inference fails, times out, or produces invalid output, the app falls back to standard extraction and shows a warning. The default timeout is 120 seconds. This mode requires sufficient RAM and a model capable of handling the input length; longer CVs may need a larger model/context or manual editing.

## Supported inputs and limits

| Input                 | Support                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `.pdf`                | Text-based PDF, up to 30 pages; encrypted files must be unlocked first |
| `.docx`               | Word text and tables; legacy `.doc` is unsupported                     |
| `.txt`, `.md`         | UTF-8; common section headings and basic Markdown                      |
| `.tex` / pasted LaTeX | Common CV syntax; uploaded commands are never executed                 |
| Scanned PDF / image   | No OCR in this version; run OCR first or paste the text                |

Maximum upload: **10 MB**. Maximum source/CV text: **80,000 characters**. Up to **24 sections** and **12 contact lines**. DOCX archives are checked before extraction, with an expanded-size limit of 25 MB and an entry limit of 2,000.

Multi-column PDFs can have an ambiguous reading order. Review the extracted result and use the source text to correct misplaced content. The output uses a single column and selectable text, but this does not guarantee a score or compatibility with every applicant tracking system.

The app keeps your language and factual claims. It does not verify your qualifications, translate your CV, or invent performance metrics.

## Privacy and local security

- CV uploads and extracted data are processed in memory and are not saved by the application, logged, or sent to cloud services.
- The frontend has no remote fonts, analytics, or third-party runtime assets. Explicitly opening GitHub, Overleaf, or CV links leaves the application.
- Downloaded files are saved by your browser. Your browser/OS may retain downloads, caches, swap, or crash data; “in memory” is not a forensic erasure guarantee.
- The server binds to `127.0.0.1`, validates request hosts/origins, and is intended for a trusted personal computer. Do not expose it publicly through a tunnel or reverse proxy without adding appropriate authentication and hardening.
- Uploaded LaTeX is parsed as text. PDF generation uses escaped HTML in a local Chromium process with outbound requests blocked. It never invokes an uploaded LaTeX program.
- `.env`, dependencies, build output, local test artifacts, and generated files are ignored by Git. Do not commit personal CVs or credentials when contributing.

## Development

```sh
npm run dev        # Vite + Express, with reload
npm run typecheck  # TypeScript validation
npm test           # Parser, input validation, API, and PDF round-trip tests
npm run build      # Typecheck + production frontend build
npm audit         # Dependency audit
```

The PDF integration tests require `npm run setup`. GitHub Actions installs Chromium, builds the application, runs tests, and audits dependencies.

```text
src/                 React interface and live CV preview
shared/schema.ts     Validated CV/design data model
shared/render.ts     Escaped HTML and XeLaTeX templates
shared/demo.ts       Fictional example CV
server/extract.ts    PDF, DOCX and UTF-8 input extraction
server/parser.ts     Local text and LaTeX parsing
server/ollama.ts     Optional local model extraction
server/pdf.ts        Chromium PDF generation
server/app.ts        Upload/export API and local request checks
tests/               Parser and end-to-end API/PDF tests
```

Contributions are welcome. Use fictional fixtures, preserve source content, and run the build and relevant tests before submitting a pull request. Improvements to PDF reading order, structured entry editing, and OCR can be developed as separate contributions.

## License

[MIT](LICENSE).
