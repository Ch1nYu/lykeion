import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { sampleCopy } from './.project.mjs';

// A stepper's control row is a layout promise, not content: only a measurement of the built page can
// tell whether the step chips and the two actions share a line. The fixture is built once for the file
// and every test reads the same site at the width a reader would use.
//
// The rows are read from where the controls actually sit, so the assertion is about the picture the
// reader sees rather than about a declared flex-wrap.

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

// Show a chapter: a Lab mounts the first time its view is shown, so a hidden view has no controls to
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

// The step chips (`.seg button`) and the two actions beside them (`←`, `下一步`), each as the box the
// reader sees: top and bottom are enough to say which row a control is on.
const controls = (page, tag) => page.evaluate((tag) => {
  const lab = [...document.querySelectorAll('.lab')].find((l) => l.querySelector('.lab-head .tag')?.textContent.trim() === tag);
  if (!lab) return null;
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
  };
  return {
    chips: [...lab.querySelectorAll('.seg button')].map(box),
    nav: [...lab.querySelectorAll('button')].filter((b) => !b.closest('.seg')).map(box),
  };
}, tag);

// Controls on one flex line are centred against each other, so their tops differ by a few pixels even
// though the reader sees one row: two boxes share a row when their vertical extents overlap, and sit on
// different rows when they do not (the row gap is larger than the slack).
const overlaps = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
const oneRow = (boxes) => boxes.every((b) => overlaps(b, boxes[0]));

test('a phone puts the step chips on their own row and keeps ← with 下一步 below them', async (t) => {
  // LAB D names three steps. On one line the chips push `←` to the far right of the first row and
  // `下一步` drops alone to a second, so the two buttons that walk the steps are split across rows.
  const page = await open(t, 375, 'ch2');
  if (!page) return;
  try {
    const c = await controls(page, 'LAB D');
    assert.ok(c, 'LAB D is on the page');
    assert.equal(c.chips.length, 3, 'LAB D shows three step chips');
    assert.equal(c.nav.length, 2, 'the stepper shows ← and 下一步');
    assert.ok(oneRow(c.chips), `the step chips share one row, got ${c.chips.map((b) => b.top).join(', ')}`);
    assert.ok(oneRow(c.nav), `← and 下一步 share one row, got ${c.nav.map((b) => b.top).join(', ')}`);
    const lastChip = Math.max(...c.chips.map((b) => b.bottom));
    const firstNav = Math.min(...c.nav.map((b) => b.top));
    assert.ok(firstNav > lastChip, `the actions sit below the chips (${firstNav} vs ${lastChip})`);
  } finally {
    await page.close();
  }
});

test('a desktop keeps the chips and both actions on one row', async (t) => {
  // Widening the page must not cost the single row the control bar has always had.
  const page = await open(t, 1280, 'ch2');
  if (!page) return;
  try {
    const c = await controls(page, 'LAB D');
    assert.ok(c, 'LAB D is on the page');
    assert.equal(c.chips.length, 3, 'LAB D shows three step chips');
    assert.equal(c.nav.length, 2, 'the stepper shows ← and 下一步');
    assert.ok(oneRow([...c.chips, ...c.nav]), `chips and actions share one row, got ${[...c.chips, ...c.nav].map((b) => b.top).join(', ')}`);
  } finally {
    await page.close();
  }
});
