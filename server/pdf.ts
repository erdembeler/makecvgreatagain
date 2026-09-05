import { chromium } from 'playwright';
import { renderDocument } from '../shared/render';
import type { Design, Resume } from '../shared/schema';

export async function generatePdf(resume: Resume, design: Design): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  const timeout = setTimeout(() => {
    void browser.close();
  }, 30_000);
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(renderDocument(resume, design), { waitUntil: 'load', timeout: 15_000 });
    return await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
}
