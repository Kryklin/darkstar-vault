import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', (request) => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  try {
    await page.goto('http://localhost:4200/vault', { waitUntil: 'networkidle2' });
    // Wait a bit to ensure everything executes
    await new Promise((r) => setTimeout(r, 2000));
  } catch (e) {
    console.error('Error navigating:', e);
  } finally {
    await browser.close();
  }
})();
