import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { sampleCopy } from './.project.mjs';

// A floating button is only harmless while nothing is under it. On a phone the reading column runs
// to the screen edge, so a fixed button in the bottom-right corner sat on the last characters of
// whatever line passed beneath it. Whether it does is a question about painted boxes, so these
// tests measure the built sample in a headless browser at the two widths the design distinguishes:
// a phone (375) and a desktop (1280).

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

// A chapter is the tallest view and the one a reader scrolls. `noScroll` keeps the router's own
// smooth scroll out of the measurement; the page's `scroll-behavior:smooth` would otherwise leave
// the boxes in flight while they are measured, so every scroll here is instant.
const open = async (t, width, height) => {
  if (!browser) { t.skip('no browser available'); return null; }
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
  await page.goto(await siteUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.Lykeion.show('ch1', { noScroll: true }));
  await page.waitForTimeout(400);
  return page;
};

const scrollTo = async (page, y) => {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
  await page.waitForTimeout(200);
};

// Every box the reader reads, and every floating control that could cover one. Only the part of the
// page the reader can actually read counts: text scrolled under the sticky top bar is behind the bar
// by design, so both the text and the control are clipped to the band below the bar and above the
// bottom of the window before they are compared. A control covers text only while it is painted: an
// opacity-0 button is invisible, so it is reported separately and must also refuse a tap — otherwise
// the reader taps a hole in the page it cannot see.
const scan = (page) => page.evaluate(() => {
  const shown = [...document.querySelectorAll('.view')].find((v) => !v.hidden);
  const band = { top: document.getElementById('topbar').getBoundingClientRect().bottom, bottom: innerHeight, left: 0, right: innerWidth };
  const clip = (r) => ({
    left: Math.max(r.left, band.left), right: Math.min(r.right, band.right),
    top: Math.max(r.top, band.top), bottom: Math.min(r.bottom, band.bottom),
  });
  const boxes = (sel) => [...shown.querySelectorAll(sel)]
    .map((el) => clip(el.getBoundingClientRect()))
    .filter((r) => r.right > r.left && r.bottom > r.top)
    .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
  const text = [...boxes('.prose'), ...boxes('.lab')];
  const controls = [...document.querySelectorAll('#themeBtn, #toTop, .toast')].map((el) => {
    const s = getComputedStyle(el), r = clip(el.getBoundingClientRect());
    return {
      name: el.id || el.className,
      // `inBand` is false for a control that sits wholly under the top bar: it is not over any text
      // the reader can see, so it is neither a cover nor a hole in the reading area.
      inBand: r.right > r.left && r.bottom > r.top,
      painted: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05,
      clickable: s.pointerEvents !== 'none',
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    };
  });
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const hits = [];
  for (const c of controls.filter((c) => c.inBand && c.painted)) {
    for (const t of text) if (overlaps(c.box, t)) hits.push(`${c.name} covers text at y=${Math.round(t.top)}`);
  }
  return {
    text: text.length,
    hits,
    hiddenTappable: controls.filter((c) => c.inBand && !c.painted && c.clickable).map((c) => c.name),
    fabTaps: getComputedStyle(document.querySelector('.fab')).pointerEvents,
  };
});

const toTopState = (page) => page.evaluate(() => {
  const b = document.getElementById('toTop'), s = getComputedStyle(b), r = b.getBoundingClientRect();
  return {
    y: Math.round(window.scrollY),
    shown: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && r.height > 0,
    tabbable: b.tabIndex >= 0,
  };
});

test('no floating control covers text on a phone, at load or after scrolling down', async (t) => {
  // The review's finding: at 375px the column ends at x=359 and the 42px button covered x≈315–357,
  // so the tail of every line that reached the bottom-right corner was hidden behind it.
  const page = await open(t, 375, 760);
  if (!page) return;
  try {
    for (const y of [0, 200, 420, 700, 1100, 1600, 2200]) {
      await scrollTo(page, y);
      const s = await scan(page);
      assert.ok(s.text > 0, `the chapter has text to cover at scrollY ${y}`);
      assert.deepEqual(s.hits, [], `at scrollY ${y}: ${s.hits.join('; ')}`);
      assert.deepEqual(s.hiddenTappable, [], `at scrollY ${y} an invisible control still takes taps: ${s.hiddenTappable.join(', ')}`);
      assert.equal(s.fabTaps, 'none', `at scrollY ${y} the floating stack lets taps through`);
    }
  } finally {
    await page.close();
  }
});

test('the theme toggle is one control inside the top bar on a phone', async (t) => {
  const page = await open(t, 375, 760);
  if (!page) return;
  try {
    const info = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#themeBtn')];
      const b = btns[0];
      const bar = document.getElementById('topbar');
      const r = b.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const s = getComputedStyle(b);
      const focused = (b.focus(), document.activeElement === b);
      return {
        count: btns.length,
        inBar: bar.contains(b),
        visible: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && r.width >= 24 && r.height >= 24,
        inside: r.left >= br.left - 1 && r.right <= br.right + 1 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1,
        tabbable: b.tabIndex >= 0 && !b.closest('[inert]'),
        focused,
        label: b.getAttribute('aria-label') || '',
        mode: b.dataset.mode,
        theme: document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      };
    });
    assert.equal(info.count, 1, 'exactly one theme button exists on a phone');
    assert.ok(info.inBar, 'the theme button lives in the top bar');
    assert.ok(info.inside, 'the theme button sits within the top bar box');
    assert.ok(info.visible, 'the theme button is painted');
    assert.ok(info.tabbable, 'the theme button is in the tab order');
    assert.ok(info.focused, 'the theme button can take focus');
    assert.ok(info.label.length > 0, 'the theme button keeps its accessible name');
    assert.ok(['light', 'dark'].includes(info.mode), `the theme button reports its mode (${info.mode})`);

    await page.click('#themeBtn');
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      mode: document.getElementById('themeBtn').dataset.mode,
      label: document.getElementById('themeBtn').getAttribute('aria-label') || '',
    }));
    const want = info.theme === 'dark' ? 'light' : 'dark';
    assert.equal(after.theme, want, `clicking the toggle switches the theme to ${want}`);
    assert.equal(after.mode, want, 'the button follows the theme it just set');
    assert.notEqual(after.label, info.label, 'the accessible name says what the next click does');
  } finally {
    await page.close();
  }
});

test('the back-to-top button shows only while scrolling up on a phone', async (t) => {
  // A permanent second button stacked above the theme one covered ~100px more of the same edge.
  const page = await open(t, 375, 760);
  if (!page) return;
  try {
    await scrollTo(page, 0);
    let s = await toTopState(page);
    assert.equal(s.shown, false, 'hidden at the top of the page');

    await scrollTo(page, 1520);
    s = await toTopState(page);
    assert.ok(s.y > 760, `scrolled past the first screen (y=${s.y})`);
    assert.equal(s.shown, false, 'hidden after scrolling down');
    assert.equal(s.tabbable, false, 'and out of the tab order while hidden');

    await scrollTo(page, 1280);
    s = await toTopState(page);
    assert.ok(s.shown, `shown while scrolling up past the first screen (y=${s.y})`);
    assert.equal(s.tabbable, true, 'and in the tab order while shown');

    await scrollTo(page, 1520);
    s = await toTopState(page);
    assert.equal(s.shown, false, 'hidden again on the way down');

    await scrollTo(page, 200);
    s = await toTopState(page);
    assert.equal(s.shown, false, `hidden near the top (y=${s.y})`);
    assert.equal(s.tabbable, false, 'and out of the tab order near the top');
  } finally {
    await page.close();
  }
});

test('desktop keeps the floating stack where it was', async (t) => {
  const page = await open(t, 1280, 900);
  if (!page) return;
  try {
    const info = await page.evaluate(() => {
      const b = document.getElementById('themeBtn'), fab = b.parentElement;
      const r = b.getBoundingClientRect();
      return {
        parent: fab.getAttribute('class') || '',
        position: getComputedStyle(fab).position,
        right: Math.round(innerWidth - r.right),
        bottom: Math.round(innerHeight - r.bottom),
        size: Math.round(r.width),
        inBar: document.getElementById('topbar').contains(b),
        mode: b.dataset.mode,
        label: b.getAttribute('aria-label') || '',
      };
    });
    assert.equal(info.parent, 'fab', 'the theme button stays in the floating stack');
    assert.equal(info.position, 'fixed', 'the stack is still fixed to the viewport');
    assert.ok(info.right >= 0 && info.right <= 40, `the stack keeps its right offset (${info.right}px)`);
    assert.ok(info.bottom >= 0 && info.bottom <= 40, `the stack keeps its bottom offset (${info.bottom}px)`);
    assert.ok(info.size >= 42, `the desktop button keeps its size (${info.size}px)`);
    assert.equal(info.inBar, false, 'the theme button is not in the top bar on desktop');
    assert.ok(info.label.length > 0, 'the theme button keeps its accessible name');

    // Desktop behaviour is unchanged: the button appears once the reader is past the first screen,
    // whether they got there scrolling down.
    await scrollTo(page, 1500);
    const down = await toTopState(page);
    assert.equal(down.shown, true, 'shown after one viewport of scrolling, as before');

    await page.click('#themeBtn');
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => document.getElementById('themeBtn').dataset.mode);
    assert.notEqual(after, info.mode, 'the desktop toggle still switches the theme');

    // Crossing the breakpoint moves the same button between the bar and the stack; it never adds a
    // copy, and the bar's measured height follows so a deep link still clears the sticky bar.
    const place = () => page.evaluate(() => {
      const b = document.getElementById('themeBtn');
      const bar = document.getElementById('topbar');
      return {
        count: document.querySelectorAll('#themeBtn').length,
        inBar: bar.contains(b),
        inFab: b.parentElement.classList.contains('fab'),
        topH: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 0),
        barH: Math.round(bar.getBoundingClientRect().height),
      };
    });
    await page.setViewportSize({ width: 375, height: 760 });
    await page.waitForTimeout(400);
    const narrow = await place();
    assert.equal(narrow.count, 1, 'still one theme button after narrowing');
    assert.ok(narrow.inBar && !narrow.inFab, 'narrowing moves it into the top bar');
    assert.ok(Math.abs(narrow.topH - narrow.barH) <= 1, `--top-h follows the phone bar (${narrow.topH} vs ${narrow.barH})`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    const wide = await place();
    assert.equal(wide.count, 1, 'still one theme button after widening');
    assert.ok(wide.inFab && !wide.inBar, 'widening puts it back in the floating stack');
    assert.ok(Math.abs(wide.topH - wide.barH) <= 1, `--top-h follows the desktop bar (${wide.topH} vs ${wide.barH})`);
  } finally {
    await page.close();
  }
});
