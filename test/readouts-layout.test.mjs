import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { sampleCopy } from './.project.mjs';

// The readout grid and the reading column are layout promises, not content: only a measurement of the
// built page can tell whether they hold. The fixture is built once for the file and every test reads
// the same site at the width a reader would use.
//
// Readouts are the tiles of a Lab's output; their column and row counts are read from where the tiles
// actually sit, so the assertion is about the picture the reader sees, not a declared column count.

let browser = null;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); });

let url = null;
const siteUrl = async () => {
  if (!url) {
    const dir = await sampleCopy();
    await build(dir);
    url = pathToFileURL(join(dir, 'sample.html')).href;
  }
  return url;
};

// Show a chapter: a Lab mounts the first time its view is shown, so a hidden view has no readouts to
// measure. `noScroll` keeps the router's smooth scroll out of the way.
const open = async (t, width, view) => {
  if (!browser) { t.skip('no browser available'); return null; }
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
  await page.goto(await siteUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate((id) => window.Lykeion.show(id, { noScroll: true }), view);
  await page.waitForTimeout(200);
  return page;
};

const readoutGrid = (page, tag) => page.evaluate((tag) => {
  const lab = [...document.querySelectorAll('.lab')].find((l) => l.querySelector('.lab-head .tag')?.textContent.trim() === tag);
  if (!lab) return null;
  const grid = lab.querySelector('.readouts');
  const g = grid.getBoundingClientRect();
  const cells = [...grid.children].map((c) => {
    const b = c.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top) };
  });
  return {
    n: cells.length,
    cols: new Set(cells.map((c) => c.left)).size,
    rows: new Set(cells.map((c) => c.top)).size,
    cells,
    left: Math.round(g.left),
    right: Math.round(g.right),
  };
}, tag);

test('six readouts make a 3×2 block on desktop and a 2×3 block on a phone', async (t) => {
  // Six tiles under auto-fill break 5 + 1 at 1280 (the orphan card the visual review found), and one
  // per row at 375 costs six rows of scrolling for six numbers that are meant to be compared.
  const desktop = await open(t, 1280, 'ch2');
  if (!desktop) return;
  try {
    const d = await readoutGrid(desktop, 'LAB D');
    assert.ok(d, 'LAB D is on the page');
    assert.equal(d.n, 6, 'LAB D shows six readouts');
    assert.equal(d.cols, 3, `desktop: six readouts sit in three columns, got ${d.cols}`);
    assert.equal(d.rows, 2, `desktop: six readouts sit in two rows, got ${d.rows}`);
  } finally {
    await desktop.close();
  }

  const mobile = await open(t, 375, 'ch2');
  if (!mobile) return;
  try {
    const m = await readoutGrid(mobile, 'LAB D');
    assert.ok(m, 'LAB D is on the page');
    assert.equal(m.cols, 2, `phone: six readouts sit in two columns, got ${m.cols}`);
    assert.equal(m.rows, 3, `phone: six readouts sit in three rows, got ${m.rows}`);
  } finally {
    await mobile.close();
  }
});

test('an odd readout count leaves its last tile the full row on a phone', async (t) => {
  // LAB A has three readouts: two columns leave the third alone with half a row empty, so it takes
  // the row instead of sitting there as a ragged hole.
  const page = await open(t, 375, 'ch1');
  if (!page) return;
  try {
    const g = await readoutGrid(page, 'LAB A');
    assert.ok(g, 'LAB A is on the page');
    assert.equal(g.n, 3, 'LAB A shows three readouts');
    assert.equal(g.cols, 2, 'the first two tiles share a row');
    const last = g.cells[g.cells.length - 1];
    assert.ok(Math.abs(last.left - g.left) <= 2, `the last tile starts at the grid's left edge (${last.left} vs ${g.left})`);
    assert.ok(Math.abs(last.right - g.right) <= 2, `the last tile ends at the grid's right edge (${last.right} vs ${g.right})`);
  } finally {
    await page.close();
  }
});

test('prose, formula cards, tables, Labs and the pager share one right edge on desktop', async (t) => {
  // Two competing right edges — the 44rem reading column against the full-width Labs and pager — read
  // as a left-heavy page with a permanent empty band down its right side. One column fixes that; a
  // paragraph keeps its own --measure, so the line length does not grow with the column.
  const page = await open(t, 1280, 'ch1');
  if (!page) return;
  try {
    const m = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.view')].find((v) => !v.hidden);
      const right = (el) => Math.round(el.getBoundingClientRect().right);
      const prose = [...shown.querySelectorAll('.prose')].find((p) => p.querySelector('p'));
      const p = prose.querySelector('p');
      const root = getComputedStyle(document.documentElement);
      return {
        prose: right(prose),
        formula: right(shown.querySelector('.formula')),
        table: right(shown.querySelector('.tablewrap')),
        lab: right(shown.querySelector('.lab')),
        pager: right(shown.querySelector('.pager')),
        measure: parseFloat(root.getPropertyValue('--measure')) * parseFloat(getComputedStyle(p).fontSize),
        lineWidth: p.getBoundingClientRect().width,
      };
    });
    const edges = { prose: m.prose, formula: m.formula, table: m.table, lab: m.lab, pager: m.pager };
    for (const [name, x] of Object.entries(edges)) {
      assert.ok(Number.isFinite(x), `the ${name} block is on the page`);
      assert.ok(Math.abs(x - m.prose) <= 2, `the ${name} right edge is ${x}px, the reading column ends at ${m.prose}px`);
    }
    assert.ok(m.lineWidth <= m.measure + 2, `a paragraph keeps --measure (${Math.round(m.lineWidth)}px of ${Math.round(m.measure)}px)`);
  } finally {
    await page.close();
  }
});
