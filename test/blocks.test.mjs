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

// The three teaching blocks of spec B, on one page: an intuition card, a formula taught in parts and
// a one-line conclusion.
const BLOCKS = [
  '```analogy 想像一罐糖果',
  '罐子裡有紅糖與藍糖，抽一顆、放回去，再抽一顆。第二次的機率不會因為第一次而改變。',
  '```',
  '',
  '```formula GINI',
  "tex: '\\mathrm{Gini} = 1 - \\sum_{i} p_{i}^{2}'",
  'parts:',
  "  - { tex: '\\mathrm{Gini}', say: '左邊是我們要的純度指標。' }",
  "  - { tex: '=' }",
  "  - { tex: '1 - \\sum_{i}', say: '一減掉每一類機率的平方和。' }",
  "  - { tex: 'p_{i}^{2}', say: '求和的每一項是某一類的機率平方，把它們全部加起來。' }",
  'hint: 點每一段看它在做什麼',
  '```',
  '',
  '```takeaway',
  '抽完放回就是獨立；抽完不放回就不是。',
  '```',
  '',
].join('\n');

async function page() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await writeFile(join(dir, 'content', '03-blocks.md'), chapter(3, 'Blocks', BLOCKS));
  await build(dir);
  const browser = await launchBrowser();
  assert.ok(browser, 'needs a browser for the block checks');
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await p.route(/^https?:\/\//, (route) => route.abort());
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await p.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  await p.evaluate(() => window.Lykeion.show('ch3', { noScroll: true }));
  await p.waitForTimeout(100);
  return { browser, page: p, errors };
}

test('a formula in parts explains the piece you press, and only that piece', async () => {
  const { browser, page: p, errors } = await page();
  try {
    const before = await p.evaluate(() => {
      const box = document.querySelector('#s3-1 .formula.parts');
      const shown = [...box.querySelectorAll('.say [data-part]')]
        .filter((s) => getComputedStyle(s).visibility !== 'hidden')
        .map((s) => s.textContent.trim());
      const pressed = [...box.querySelectorAll('.eq button.piece')]
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.dataset.part);
      return { shown, pressed, label: box.dataset.label, buttons: box.querySelectorAll('.eq button.piece').length };
    });
    // The build preselects the first explained piece, so the card never opens with an empty area.
    assert.deepEqual(before.pressed, ['0']);
    assert.equal(before.shown.length, 1, `one explanation visible, got ${JSON.stringify(before.shown)}`);
    assert.match(before.shown[0], /純度指標/);
    assert.equal(before.label, 'GINI');

    // Pressing another piece moves the explanation and the pressed state together.
    await p.click('#s3-1 .formula.parts .eq button.piece[data-part="2"]');
    await p.waitForTimeout(120);
    const after = await p.evaluate(() => {
      const box = document.querySelector('#s3-1 .formula.parts');
      return {
        shown: [...box.querySelectorAll('.say [data-part]')]
          .filter((s) => getComputedStyle(s).visibility !== 'hidden')
          .map((s) => s.textContent.trim()),
        pressed: [...box.querySelectorAll('.eq button.piece')]
          .filter((b) => b.getAttribute('aria-pressed') === 'true')
          .map((b) => b.dataset.part),
        live: box.querySelector('.say [aria-live]').textContent.trim(),
      };
    });
    assert.deepEqual(after.pressed, ['2']);
    assert.equal(after.shown.length, 1);
    assert.match(after.shown[0], /平方和/);
    // The live region repeats the visible text so a screen reader hears the change.
    assert.match(after.live, /平方和/);

    // The whole formula is present for AT but takes no space on screen.
    const hidden = await p.evaluate(() => {
      const box = document.querySelector('#s3-1 .formula.parts');
      const el = box.querySelector('.sr-only math, .sr-only .katex, .sr-only');
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    assert.ok(hidden.w <= 1 && hidden.h <= 1, `the AT copy must be visually hidden, got ${hidden.w}×${hidden.h}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('the explanation area keeps one height as pieces change, so the page does not jump', async () => {
  const { browser, page: p } = await page();
  try {
    const heights = [];
    for (const i of [0, 2, 3, 0]) {
      await p.click(`#s3-1 .formula.parts .eq button.piece[data-part="${i}"]`);
      await p.waitForTimeout(80);
      heights.push(await p.evaluate(() => document.querySelector('#s3-1 .formula.parts .say').getBoundingClientRect().height));
    }
    // A stack lays every variant in the same grid cell, so the box is as tall as the longest text
    // from the start and never resizes under the reader's cursor.
    assert.equal(new Set(heights.map((h) => Math.round(h))).size, 1, `heights: ${heights.join(', ')}`);
  } finally {
    await browser.close();
  }
});

test('analogy and takeaway are painted in both themes and stay inside the column', async () => {
  const { browser, page: p } = await page();
  try {
    const paint = () => p.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(`#s3-1 ${sel}`);
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderLeftColor,
          borderW: cs.borderLeftWidth,
          width: el.getBoundingClientRect().width,
          prose: document.querySelector('#s3-1 .prose').getBoundingClientRect().width,
        };
      };
      return { analogy: read('.analogy'), takeaway: read('.takeaway'), theme: document.documentElement.dataset.theme || 'light' };
    });
    const light = await paint();
    // The card is a card (its own background, not the page) and the takeaway is a rule, not a box.
    assert.notEqual(light.analogy.bg, 'rgba(0, 0, 0, 0)');
    assert.ok(parseFloat(light.analogy.width) <= light.analogy.prose + 1, 'the card fits the prose column');
    assert.ok(parseFloat(light.takeaway.borderW) >= 3, `the takeaway has an accent rule, got ${light.takeaway.borderW}`);
    assert.ok(parseFloat(light.takeaway.width) <= light.takeaway.prose + 1);

    await p.evaluate(() => window.Lykeion.show('ch3', { noScroll: true }));
    await p.evaluate(() => {
      const btn = document.getElementById('themeBtn');
      if (btn) btn.click();
    });
    await p.waitForTimeout(400);
    const dark = await paint();
    assert.equal(dark.theme, 'dark');
    // Both themes repaint: the card keeps a distinct background and the text stays readable (the
    // palette guarantees contrast, so "different from light" is the check here).
    assert.notEqual(dark.analogy.bg, light.analogy.bg);
    assert.notEqual(dark.analogy.color, light.analogy.color);
    assert.notEqual(dark.takeaway.border, light.takeaway.border);
    assert.equal(dark.takeaway.borderW, light.takeaway.borderW);
  } finally {
    await browser.close();
  }
});

test('the sidebar lists the ### headings of a section under it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await writeFile(join(dir, 'content', '03-subs.md'), chapter(3, 'Subs',
    '### 第一個問題\n\n內文。\n\n### 第二個問題\n\n內文。\n\n```note\n提醒。\n```\n'));
  await build(dir);
  const browser = await launchBrowser();
  assert.ok(browser, 'needs a browser for the sidebar check');
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.route(/^https?:\/\//, (route) => route.abort());
  try {
    await p.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(500);
    await p.evaluate(() => window.Lykeion.show('ch3', { noScroll: true }));
    await p.waitForTimeout(120);
    const subs = await p.evaluate(() => [...document.querySelectorAll('#nav a.sub')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim(),
      resolves: !!document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))),
    })));
    assert.deepEqual(subs.map((s) => s.text), ['第一個問題', '第二個問題']);
    assert.deepEqual(subs.map((s) => s.href), ['#s3-1-1', '#s3-1-2']);
    assert.ok(subs.every((s) => s.resolves), 'every sub-link resolves to a heading');
  } finally {
    await browser.close();
  }
});

// Maths in a sidebar label is set at the label's own size and stays on the line of its words. A label
// that is a `###` heading (`.nav a.sub`) used to break after the words and let its maths drop to a line
// of its own, and the `.94em` that suits body text left the maths visibly smaller than the link text.
test('maths in a sidebar label is the label size and sits on the line with its words', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await writeFile(join(dir, 'content', '03-labels.md'), chapter(3, '縮放 $\\sqrt{d_k}$', '### 除以 $\\sqrt{d_k}$\n\n這一段。\n'));
  await build(dir);
  const browser = await launchBrowser();
  assert.ok(browser, 'needs a browser for the label check');
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await p.route(/^https?:\/\//, (route) => route.abort());
    await p.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(500);
    await p.evaluate(() => window.Lykeion.show('ch3', { noScroll: true }));
    await p.waitForTimeout(100);
    const m = await p.evaluate(() => {
      const size = (el) => parseFloat(getComputedStyle(el).fontSize);
      const main = document.querySelector('#nav a[href="#s3-1"]');
      const sub = document.querySelector('#nav a.sub');
      return {
        mainMath: size(main.querySelector('math')),
        mainLabel: size(main.querySelector(':scope > span:last-child')),
        subMath: size(sub.querySelector('math')),
        subLink: size(sub),
        // The link's own padding is not text: count only the box between it, in line-heights.
        subLines: (() => {
          const cs = getComputedStyle(sub);
          const text = sub.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          return text / parseFloat(cs.lineHeight);
        })(),
      };
    });
    assert.equal(m.mainMath, m.mainLabel, `main label maths ${m.mainMath}px, label ${m.mainLabel}px`);
    assert.equal(m.subMath, m.subLink, `sub-heading maths ${m.subMath}px, link ${m.subLink}px`);
    // One line of text is one line-height; a label that wrapped would be two.
    assert.ok(m.subLines < 1.5, `sub-heading wrapped onto ${m.subLines.toFixed(2)} lines`);
  } finally {
    await browser.close();
  }
});
