import express from 'express';
import multer from 'multer';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { exportSchema, MAX_TEXT, resumeSchema } from '../shared/schema';
import { renderLatex } from '../shared/render';
import { extractFile } from './extract';
import { parseResume } from './parser';
import { extractWithOllama, ollamaStatus } from './ollama';
import { generatePdf } from './pdf';

export function createApp(production = false) {
  const app = express();
  const allowedOrigins = [
    process.env.CV_WEB_PORT || '5173',
    process.env.CV_API_PORT || '3001',
  ].flatMap((port) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) {
      res.status(403).json({ error: 'Bu uygulama yalnızca localhost üzerinden kullanılabilir.' });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Bu kaynaktan gelen istek kabul edilmiyor.' });
      return;
    }
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '512kb' }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 100 },
  });
  app.get('/api/health', async (_req, res) => res.json({ ok: true, ollama: await ollamaStatus() }));
  let importBusy = false;
  app.post(
    '/api/import',
    (req, res, next) => {
      if (importBusy) {
        res.status(429).json({ error: 'Bir CV işleniyor. Tamamlanınca tekrar deneyin.' });
        return;
      }
      importBusy = true;
      res.once('finish', () => {
        importBusy = false;
      });
      res.once('close', () => {
        importBusy = false;
      });
      next();
    },
    upload.single('file'),
    async (req, res) => {
      let text: string;
      let isLatex = false;
      if (req.file) ({ text, isLatex } = await extractFile(req.file.buffer, req.file.originalname));
      else {
        if (typeof req.body?.text !== 'string') {
          res.status(400).json({ error: 'Bir CV dosyası yükleyin veya metin yapıştırın.' });
          return;
        }
        text = req.body.text;
        isLatex = /\\(?:documentclass|begin\{document\})/.test(text);
      }
      if (text.length > MAX_TEXT) {
        res.status(400).json({ error: 'En fazla 80.000 karakter destekleniyor.' });
        return;
      }
      const result = parseResume(text, isLatex);
      let method: 'local' | 'ollama' = 'local';
      if (req.body?.useAi === true || req.body?.useAi === 'true') {
        try {
          result.resume = await extractWithOllama(result.sourceText);
          method = 'ollama';
          result.warnings.push(
            'Yerel AI çıktısını kaynak metinle karşılaştırın; eksik veya hatalı bilgiler olabilir.',
          );
        } catch {
          result.warnings.push(
            'Yerel AI tamamlanamadı. Standart ayrıştırma kullanıldı; kaynak metinle karşılaştırarak kontrol edin.',
          );
        }
      }
      result.resume = resumeSchema.parse(result.resume);
      res.json({ ...result, method });
    },
  );
  let pdfBusy = false;
  app.post('/api/export/pdf', async (req, res) => {
    const { resume, design } = exportSchema.parse(req.body);
    if (pdfBusy) {
      res.status(429).json({ error: 'PDF hazırlanıyor. Birkaç saniye sonra tekrar deneyin.' });
      return;
    }
    pdfBusy = true;
    try {
      const pdf = await generatePdf(resume, design);
      res.type('application/pdf').attachment('resume.pdf').send(pdf);
    } catch (error) {
      if (
        error instanceof Error &&
        /Executable doesn't exist|browserType.launch/.test(error.message)
      ) {
        res.status(503).json({
          error:
            'PDF motoru kurulu değil. Terminalde npm run setup komutunu çalıştırıp tekrar deneyin.',
        });
      } else throw error;
    } finally {
      pdfBusy = false;
    }
  });
  app.post('/api/export/tex', (req, res) => {
    const { resume, design } = exportSchema.parse(req.body);
    res.type('text/plain').attachment('resume.tex').send(renderLatex(resume, design));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'İşlem bulunamadı.' }));
  if (production) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use(
    (
      error: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          error:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'Dosya en fazla 10 MB olabilir.'
              : 'Tek bir dosya yükleyin; yükleme sınırı aşıldı.',
        });
      } else if (error instanceof ZodError) {
        res.status(400).json({
          error:
            'CV alanları çok uzun veya geçersiz. Bölümleri ve tasarım ayarlarını kontrol edin.',
        });
      } else if (error.type === 'entity.too.large')
        res.status(413).json({ error: 'İstek çok büyük. Daha kısa bir CV kullanın.' });
      else if (error instanceof SyntaxError && error.status === 400)
        res.status(400).json({ error: 'İstek biçimi geçersiz.' });
      else
        res.status(422).json({
          error:
            /CV|PDF|DOCX|UTF-8|dosya|Dosya|metin|Metin|Desteklenen|Yeterli|Taranmış|En fazla/.test(
              error.message,
            )
              ? error.message
              : 'Dosya okunamadı veya işlem tamamlanamadı. Dosyayı kontrol edip tekrar deneyin.',
        });
    },
  );
  return app;
}
