// Headless browser access. Prefer a system Chrome, fall back to Playwright's Chromium;
// callers must handle `null` (no browser) by reporting the skipped work, never by passing silently.
import { chromium } from 'playwright';

export async function launchBrowser() {
  for (const opts of [{ channel: 'chrome' }, {}]) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch {
      // try the next option
    }
  }
  return null;
}

// Serve local files to the page under a fake http origin, so ES modules load without file:// CORS limits.
export const LOCAL_ORIGIN = 'http://lykeion.local';

export async function routeLocal(page, resolveFile) {
  const { readFile } = await import('node:fs/promises');
  await page.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = resolveFile(path);
    if (!file) return route.fulfill({ status: 404, body: 'not found' });
    try {
      const body = await readFile(file);
      route.fulfill({ status: 200, body, contentType: contentType(file) });
    } catch {
      route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

function contentType(file) {
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.pdf')) return 'application/pdf';
  if (file.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
