import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const chapter = (num, title, body) => `---\nchapter: ${num}\ntitle: ${title}\nshort: t${num}\nsource: sample.pdf\n---\n\n## ${num}.1 ${title} {pages=1}\n\n${body}\n`;

// A listing with a caption and a line far wider than a phone screen: the long line must scroll
// inside its own <pre>, never push the page sideways.
const LISTING = '下面這段程式計算二項 pmf：\n\n```python title="二項 pmf"\nfrom math import comb\n\nn, k, p = 10, 2, 0.5\npmf = comb(n, k) * p ** k * (1 - p) ** (n - k)  # a deliberately over-long trailing comment to force horizontal scrolling inside the listing box on narrow screens 0123456789\nprint(round(pmf, 3))  # 0.044\n```\n';

test('code listings get a focusable copy button and do not overflow at 375px', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await writeFile(join(dir, 'content', '03-code.md'), chapter(3, 'Code', LISTING));
  await build(dir);
  const browser = await launchBrowser();
  assert.ok(browser, 'needs a browser for the code listing check');
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await page.route(/^https?:\/\//, (route) => route.abort());
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const el = document.querySelector('#s3-1 .code');
      if (!el) return null;
      const btn = el.querySelector('.code-copy');
      return { pre: !!el.querySelector('pre code.language-python'), btn: !!btn, tag: btn ? btn.tagName : '', label: btn ? (btn.getAttribute('aria-label') || '') : '', tab: btn ? btn.tabIndex : -1 };
    });
    assert.ok(box && box.pre, 'the listing keeps <pre><code class="language-python">');
    assert.ok(box.btn && box.tag === 'BUTTON', 'each listing gets a copy button');
    assert.ok(box.label, 'the copy button carries an aria-label');
    assert.ok(box.tab >= 0, 'the copy button is keyboard-focusable');
    // Clicking copies (or degrades gracefully) without errors, and a toast answers.
    await page.locator('#s3-1 .code-copy').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#toast.show').count(), 1, 'a toast answers the copy click');
    assert.deepEqual(errors, [], 'no page errors from the copy button');
    await page.close();

    // 375px: the page does not scroll sideways; the long line scrolls inside its own <pre>.
    const m = await browser.newPage({ viewport: { width: 375, height: 760 }, colorScheme: 'light' });
    await m.route(/^https?:\/\//, (route) => route.abort());
    await m.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
    await m.waitForTimeout(500);
    const mob = await m.evaluate(() => {
      const el = document.querySelector('#s3-1 .code');
      const pre = el.querySelector('pre');
      return { scrollW: document.documentElement.scrollWidth, right: el.getBoundingClientRect().right, scrolls: pre.scrollWidth > pre.clientWidth + 1 };
    });
    assert.ok(mob.scrollW <= 376, `page width is ${mob.scrollW}px at 375px`);
    assert.ok(mob.right <= 376, `listing right edge is ${mob.right}px at 375px`);
    assert.ok(mob.scrolls, 'the long line scrolls inside its own <pre>');
    await m.close();
  } finally {
    await browser.close();
  }
});

// Regression: every code line once read as followed by a blank line. The cause was a strut
// mismatch — the <pre> kept the 19px body font while its <code> shrank to .88rem, so each line
// box was ruled by the taller strut (30.4px pitch for 14px glyphs). The emitted HTML itself was
// clean (LF only, no per-line wrappers), so this test measures the rendered box: a 3-line listing
// must be ~3 line-heights tall, and its code must carry no carriage returns.
test('a 3-line listing renders exactly 3 lines, with no extra blank rows', async () => {
  const { readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await writeFile(join(dir, 'content', '03-code.md'), chapter(3, 'Code', '```python\nAAA\nBBB\nCCC\n```\n'));
  await build(dir);
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  const sec = /<section class="sec" id="s3-1"[\s\S]*?<\/section>/.exec(html);
  assert.ok(sec, 'the 03-code section rendered');
  const inner = /<pre><code class="language-python">([\s\S]*?)<\/code><\/pre>/.exec(sec[0]);
  assert.ok(inner, 'the listing emitted <pre><code>');
  assert.ok(!inner[1].includes('\r'), 'no carriage returns reach the page inside a listing');
  assert.equal(inner[1], 'AAA\nBBB\nCCC\n', 'exactly the three source lines');
  const browser = await launchBrowser();
  assert.ok(browser, 'needs a browser for the line-height check');
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const pre = document.querySelector('#s3-1 .code pre');
      const code = pre.querySelector('code');
      const pcs = getComputedStyle(pre), ccs = getComputedStyle(code);
      const lh = parseFloat(pcs.lineHeight);
      const rows = (pre.clientHeight - parseFloat(pcs.paddingTop) - parseFloat(pcs.paddingBottom)) / lh;
      return {
        lh, rows,
        preFont: parseFloat(pcs.fontSize), codeFont: parseFloat(ccs.fontSize),
        codeLH: parseFloat(ccs.lineHeight),
      };
    });
    assert.ok(Math.abs(m.rows - 3) < 0.15, `3-line listing is ${m.rows} line-heights tall (lh=${m.lh})`);
    // Strut match: the <pre> must not keep the 19px body font while its <code> shrinks to
    // .88rem. Before the fix this was 19px vs 14px, inflating every line box to a 30.4px pitch
    // so each code line read as followed by a blank line; row count alone cannot catch that
    // because the inflated line-height divides out. Assert the fonts match and the pitch is
    // 1.6x the code glyph size.
    assert.ok(Math.abs(m.preFont - m.codeFont) < 0.5, `<pre> font ${m.preFont}px must match <code> font ${m.codeFont}px`);
    assert.ok(Math.abs(m.lh - m.codeFont * 1.6) < 1.0, `line pitch ${m.lh}px must be 1.6x the ${m.codeFont}px code font`);
    await page.close();
  } finally {
    await browser.close();
  }
});
