import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { checkLabParams, build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { tiny, renderItems, find, sampleCopy } from './.project.mjs';

// The curve Lab can draw a distribution as columns (`discrete: true`) and carry slider-calc's
// readouts and verdicts, so a Lab whose row list would grow with n fits the fixed-height plot instead.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAB_SRC = readFileSync(join(ROOT, 'labs', 'curve', 'lab.js'), 'utf8');
const schema = () => JSON.parse(readFileSync(join(ROOT, 'labs', 'curve', 'schema.json'), 'utf8'));

// Project maths the fixture uses; the real page gets it from fixtures/sample/math.js.
const MATH_SRC = readFileSync(join(ROOT, 'runtime', 'mathlib.js'), 'utf8') + `
LykeionMath.extend({
  binomPmf: function (n, k, p) {
    function C(a, b) { if (b < 0 || b > a) return 0; var r = 1; for (var i = 1; i <= b; i++) r = r * (a - b + i) / i; return Math.round(r); }
    return C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
});`;

// Run the shipped Lab source in Node with a stub DOM, the same harness the slider-calc tests use.
function loadLab() {
  let mount = null;
  const sandbox = { Lykeion: { registerLab: (type, fn) => { mount = { type, fn }; } } };
  vm.createContext(sandbox);
  vm.runInContext(MATH_SRC, sandbox, { filename: 'mathlib.js' });
  vm.runInContext(LAB_SRC, sandbox, { filename: 'lab.js' });
  assert.equal(mount && mount.type, 'curve');
  return mount.fn;
}

function stubEl(tag) {
  const slots = {};
  const e = {
    tag, attrs: {}, style: {}, kids: [], textContent: '', value: '', parentNode: null,
    listeners: {}, classes: new Set(),
    setAttribute(k, v) { e.attrs[k] = v; },
    appendChild(c) { e.kids.push(c); c.parentNode = e; return c; },
    addEventListener(t, fn) { e.listeners[t] = fn; },
    querySelector(sel) { return slots[sel]; },
    classList: {
      toggle(n, force) { if (force) e.classes.add(n); else e.classes.delete(n); },
      contains(n) { return e.classes.has(n); },
    },
  };
  Object.defineProperty(e, 'children', { get: () => e.kids });
  Object.defineProperty(e, 'innerHTML', {
    set(html) {
      e._html = html;
      e.kids.length = 0; // a real innerHTML write replaces the children
      for (const m of String(html).matchAll(/<(input|output|b)\b([^>]*)>/g)) {
        if (!slots[m[1]]) slots[m[1]] = stubEl(m[1]);
        const v = /value="([^"]*)"/.exec(m[2]);
        if (v && m[1] === 'input') slots[m[1]].value = v[1];
      }
    },
    get() { return e._html; },
  });
  return e;
}

const apiStub = {
  H(tag, attrs = {}, html) {
    const e = stubEl(tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  },
  S(tag, attrs = {}, parent) {
    const e = stubEl(tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  },
  esc: (s) => String(s),
  fmt: (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—'),
  setVal: (el, txt) => { el.textContent = txt; },
  // api.stack reserves one cell for every variant; the stub records which one is showing.
  stack(el, htmls) {
    el.kids.length = 0;
    for (const [i, h] of htmls.entries()) {
      const s = stubEl('span');
      s.attrs['data-i'] = i;
      s.textContent = h;
      el.appendChild(s);
    }
    let shown = -1;
    el.stack = { show(i) { shown = i; }, get shown() { return shown; } };
    return el.stack;
  },
};

function mountLab(params) {
  const mount = loadLab();
  const root = stubEl('div');
  root.parentNode = { id: 'lab-7' };
  mount(root, params, apiStub);
  return root;
}

const walk = (el, out = []) => { out.push(el); el.kids.forEach((k) => walk(k, out)); return out; };
const byClass = (root, cls) => walk(root).filter((e) => e.attrs.class === cls);
const byTag = (root, tag) => walk(root).filter((e) => e.tag === tag);
const sliderOf = (root, i) => byClass(root, 'ctl')[i].querySelector('input');

// ---------- schema (criterion 4) ----------

test('curve schema accepts discrete, outputs and verdict', () => {
  const params = {
    tag: 'LAB X',
    title: 't',
    discrete: true,
    x: { label: 'k', min: 0, max: 20 },
    y: { label: 'P', min: 0, max: 0.9 },
    inputs: [{ id: 'n', label: 'n', min: 4, max: 20, step: 1, value: 10 }],
    curves: [{ label: 'P(X=k)', expr: 'x > n ? 0 : 1' }],
    outputs: [{ label: 'np', expr: 'n / 2', digits: 2, best: 'max', labels: { '1': '一' } }],
    verdict: [{ when: 'n > 5', text: '大了。' }],
  };
  assert.deepEqual(checkLabParams(schema(), { type: 'curve', where: 'x.md §1.1', params }), []);
});

test('curve schema still rejects an unknown key, top-level and per item', () => {
  const errs = checkLabParams(schema(), {
    type: 'curve',
    where: 'x.md §1.1',
    params: { title: 't', curves: [{ label: 'c', expr: 'x' }], barz: [] },
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /has no parameter "barz"/);
  const item = checkLabParams(schema(), {
    type: 'curve',
    where: 'x.md §1.1',
    params: { title: 't', curves: [{ label: 'c', expr: 'x' }], outputs: [{ label: 'o', expr: 'x', colour: 'red' }] },
  });
  assert.equal(item.length, 1);
  assert.match(item[0], /outputs\[0\] has no key "colour"/);
});

// ---------- discrete drawing (criterion 1) ----------

const discreteLab = (extra = {}) => ({
  discrete: true,
  x: { label: 'k', min: 0, max: 4 },
  inputs: [{ id: 'n', label: 'n', min: 0, max: 4, step: 1, value: 2 }],
  curves: [{ label: 'P(X=k)', expr: 'x > n ? 0 : binomPmf(n, x, 0.5)' }],
  ...extra,
});

test('discrete draws one column per integer x, and none where the value is 0', () => {
  const root = mountLab(discreteLab());
  const rects = byTag(root, 'rect');
  // n = 2: k = 0, 1, 2 have probability; k = 3, 4 are zero and draw no ink.
  assert.equal(rects.length, 3);
  assert.equal(byTag(root, 'path').length, 0, 'a discrete curve is columns, not a line');
  // The columns are distinct, ordered slots under their own k.
  const xs = rects.map((r) => Number(r.attrs.x));
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.equal(new Set(xs).size, 3);
  for (const r of rects) assert.ok(Number(r.attrs.height) > 0, 'a drawn column has height');
});

test('discrete follows the sliders: a larger n grows the run of columns', () => {
  const root = mountLab(discreteLab());
  assert.equal(byTag(root, 'rect').length, 3);
  const n = sliderOf(root, 0);
  n.value = '4';
  n.listeners.input();
  assert.equal(byTag(root, 'rect').length, 5, 'k = 0…4 all have probability at n = 4');
});

test('without discrete the curve is still one 200-point path', () => {
  const root = mountLab(discreteLab({ discrete: undefined }));
  assert.equal(byTag(root, 'rect').length, 0, 'no columns on a line plot');
  const paths = byTag(root, 'path');
  assert.equal(paths.length, 1);
  const moves = paths[0].attrs.d.match(/[ML]/g) || [];
  assert.equal(moves.length, 201, '200 intervals → 201 points');
});

// ---------- the x axis follows an input (criterion 1) ----------

const spanLab = (x, extra = {}) => ({
  discrete: true,
  x,
  inputs: [{ id: 'n', label: 'n', min: 4, max: 20, step: 1, value: 10 }],
  curves: [{ label: 'P(X=k)', expr: '1 / (n + 1)' }],
  ...extra,
});

// The x tick labels are the middle-anchored .tick texts; the axis title sits there too, so drop it.
const xTicks = (root, label) => byTag(root, 'text')
  .filter((e) => e.attrs.class === 'tick' && e.attrs['text-anchor'] === 'middle' && e.textContent !== label)
  .map((e) => e.textContent);

test('x.max as an expression ends the axis at the input and follows it', () => {
  const root = mountLab(spanLab({ label: 'k', min: 0, max: 'n' }));
  assert.equal(byTag(root, 'rect').length, 11, 'k = 0…10 columns');
  assert.deepEqual(xTicks(root, 'k'), ['0', '2', '4', '6', '8', '10']);
  const n = sliderOf(root, 0);
  n.value = '12';
  n.listeners.input();
  assert.equal(byTag(root, 'rect').length, 13, 'k = 0…12 once n = 12');
  assert.deepEqual(xTicks(root, 'k'), ['0', '2', '4', '6', '8', '10', '12'], 'the axis ends at n, not at a fixed bound');
});

test('x.min is an expression too, so the axis can show a window that follows an input', () => {
  const root = mountLab(spanLab({ label: 'k', min: 'n - 2', max: 'n' }));
  assert.equal(byTag(root, 'rect').length, 3, 'k = n-2…n');
  assert.deepEqual(xTicks(root, 'k'), ['8', '9', '10'], 'only the integers of that window get a label');
});

test('a numeric x.max keeps a fixed axis, whatever the sliders do', () => {
  const root = mountLab(spanLab({ label: 'k', min: 0, max: 20 }));
  assert.equal(byTag(root, 'rect').length, 21, 'the axis is 0…20 from the start');
  const n = sliderOf(root, 0);
  n.value = '20';
  n.listeners.input();
  assert.equal(byTag(root, 'rect').length, 21, 'and stays 0…20 at n = 20');
  assert.deepEqual(xTicks(root, 'k'), ['0', '5', '10', '15', '20']);
});

test('a marker opens inside an expression axis, and its slider follows the axis', () => {
  const root = mountLab(spanLab({ label: 'k', min: 0, max: 'n' }, { marker: { label: 'k' } }));
  const marker = () => byClass(root, 'ctl')[1].querySelector('input');
  assert.equal(Number(marker().attrs.max), 10, 'the marker slider opens on 0…10');
  assert.equal(Number(marker().value), 5, 'the marker opens in the middle of the axis');
  assert.equal(byTag(root, 'circle').length, 1, 'the marker reads its curve');
  const n = sliderOf(root, 0);
  n.value = '20';
  n.listeners.input();
  assert.equal(Number(marker().attrs.max), 20, 'and grows with n');
});

// ---------- readouts (criterion 2) ----------

test('outputs render in a .readouts grid and update as the sliders move', () => {
  const root = mountLab({
    x: { label: 'k', min: 0, max: 10 },
    inputs: [{ id: 'n', label: 'n', min: 4, max: 20, step: 1, value: 10 }],
    curves: [{ label: 'P(X=k)', expr: 'x / n' }],
    outputs: [
      { label: 'np', expr: 'n * 0.3' },
      { label: 'n(1-p)', expr: 'n * 0.7' },
      { label: '判準', expr: 'n * 0.3 >= 5 ? 1 : 0', labels: { '1': '符合經驗法則', '0': '未達經驗法則' } },
    ],
  });
  const grids = byClass(root, 'readouts');
  assert.equal(grids.length, 1);
  const tiles = grids[0].kids;
  assert.equal(tiles.length, 3, 'one .ro per output');
  const shown = () => tiles.map((t) => t.querySelector('b').textContent);
  assert.deepEqual(shown(), ['3.000', '7.000', '未達經驗法則']);
  const n = sliderOf(root, 0);
  n.value = '20';
  n.listeners.input();
  assert.deepEqual(shown(), ['6.000', '14.000', '符合經驗法則'], 'labels map exact values, digits default to 3');
});

// ---------- verdict (criterion 3) ----------

test('verdict shows the first true text, and hides when none is true', () => {
  const stack = [];
  const root = mountLab({
    x: { label: 'k', min: 0, max: 10 },
    inputs: [{ id: 'n', label: 'n', min: 4, max: 20, step: 1, value: 10 }],
    curves: [{ label: 'P(X=k)', expr: 'x / n' }],
    verdict: [
      { when: 'n < 8', text: '小。' },
      { when: 'n < 12', text: '中。' },
      { when: 'true', text: '大。' },
    ],
  });
  const box = byClass(root, 'verdict')[0];
  assert.ok(box, 'a .verdict box is mounted');
  const st = box.stack;
  assert.ok(st, 'the verdict box is an api.stack cell');
  assert.equal(box.kids.length, 3, 'every verdict keeps its own cell, so the height never changes');
  const n = sliderOf(root, 0);
  assert.equal(st.shown, 1, 'n = 10 is the second verdict');
  n.value = '4';
  n.listeners.input();
  assert.equal(st.shown, 0, 'n = 4 is the first verdict');
  n.value = '20';
  n.listeners.input();
  assert.equal(st.shown, 2, 'n = 20 falls through to the last one');
});

// ---------- failure path (criterion 5) ----------

test('a bad outputs expr is a build error naming the Lab', async () => {
  // tiny() builds the probe itself, so write the files here and let the build fail.
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-curve-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Curve probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), [
    '---',
    'chapter: 1',
    'title: Probe',
    'short: probe',
    'source: sample.pdf',
    '---',
    '',
    '## 1.1 A section {pages=1}',
    '',
    '```lab curve',
    'tag: LAB BAD',
    'title: 壞掉的讀值',
    'inputs: [{ id: n, label: n, min: 4, max: 20, step: 1, value: 10 }]',
    'curves: [{ label: "P", expr: "x / n" }]',
    'outputs: [{ label: 半數, expr: "n *" }]',
    '```',
    '',
  ].join('\n'));
  await assert.rejects(() => build(dir), /Lab "curve" "半數" fails at its default inputs/);
});

test('a bad x.max expression is a build error naming the Lab', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-curve-x-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Curve x probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), [
    '---',
    'chapter: 1',
    'title: Probe',
    'short: probe',
    'source: sample.pdf',
    '---',
    '',
    '## 1.1 A section {pages=1}',
    '',
    '```lab curve',
    'tag: LAB BAD',
    'title: 壞掉的 x 軸',
    'inputs: [{ id: n, label: n, min: 4, max: 20, step: 1, value: 10 }]',
    'discrete: true',
    'x: { label: k, min: 0, max: "n *" }',
    'curves: [{ label: "P", expr: "x / n" }]',
    '```',
    '',
  ].join('\n'));
  await assert.rejects(() => build(dir), /Lab "curve" x\.max "n \*" fails at its default inputs/);
});

// ---------- the built sample (criterion 6) ----------

let browser = null;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); });

const openSample = async (t, width) => {
  if (!browser) { t.skip('no browser available'); return null; }
  const dir = await sampleCopy();
  await build(dir);
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
  await page.goto(pathToFileURL(join(dir, 'sample.html')).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.Lykeion.show('ch2', { noScroll: true }));
  await page.waitForTimeout(200);
  return page;
};

const labG = (page) => page.evaluate(() => {
  const lab = [...document.querySelectorAll('.lab')].find((l) => l.querySelector('.lab-head .tag')?.textContent.trim() === 'LAB G');
  if (!lab) return null;
  const svg = lab.querySelector('svg.viz');
  const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const box = svg.getBoundingClientRect();
  const scale = box.width / vb[2];
  const texts = [...svg.querySelectorAll('text.tick')];
  const rects = [...svg.querySelectorAll('rect')];
  const axis = [...svg.querySelectorAll('g.axis line')];
  const xNums = texts.filter((t) => t.getAttribute('text-anchor') === 'middle' && /^-?\d/.test(t.textContent));
  const num = (el, k) => Number(el.getAttribute(k));
  return {
    viewBox: vb,
    scale,
    width: box.width,
    cols: rects.length,
    readouts: lab.querySelectorAll('.readouts > .ro').length,
    bars: lab.querySelectorAll('.bars2').length,
    rows: lab.querySelectorAll('.hbar').length,
    topY: Math.min(...rects.map((r) => num(r, 'y'))),
    leftEdge: Math.min(...rects.map((r) => num(r, 'x'))),
    rightEdge: Math.max(...rects.map((r) => num(r, 'x') + num(r, 'width'))),
    axisTop: num(axis[1], 'y1'),
    axisLeft: num(axis[0], 'x1'),
    axisRight: num(axis[0], 'x2'),
    lastXLabel: xNums.length ? xNums[xNums.length - 1].textContent : null,
    labels: texts.map((t) => t.textContent),
    fontPx: texts.map((t) => parseFloat(getComputedStyle(t).fontSize) * scale),
    boxPx: texts.map((t) => t.getBoundingClientRect().height),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const growLabG = (page, n) => page.evaluate((n) => {
  const lab = [...document.querySelectorAll('.lab')].find((l) => l.querySelector('.lab-head .tag')?.textContent.trim() === 'LAB G');
  const input = lab.querySelector('input[type="range"]');
  input.value = n;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, String(n));

test('LAB G is columns up to k = n, not a 21-row list', async (t) => {
  const page = await openSample(t, 1280);
  if (!page) return;
  try {
    const h = await labG(page);
    assert.ok(h, 'LAB G is in the built sample');
    assert.equal(h.bars, 0, 'no slider-calc bar list is left behind');
    assert.equal(h.rows, 0, 'no hbar rows are left behind');
    assert.equal(h.cols, 11, 'n = 10 opens on 11 columns, k = 0…10');
    assert.equal(h.readouts, 3, 'the three outputs keep their readout grid');
    await growLabG(page, 20);
    const grown = await labG(page);
    assert.equal(grown.cols, 21, 'n = 20 draws all 21 columns, k = 0…20');
  } finally {
    await page.close();
  }
});

// Criterion 5: with `x.max: n` and no y bounds, the bars fill the plot at the opening values.
test('LAB G ends its x axis at n and fits the y axis to the tallest column', async (t) => {
  const page = await openSample(t, 1280);
  if (!page) return;
  try {
    const at = await labG(page);
    assert.ok(at, 'LAB G is in the built sample');
    assert.equal(at.lastXLabel, '10', 'the x axis ends at the opening n');
    assert.ok(Math.abs(at.topY - at.axisTop) < 0.6, `the tallest column reaches the top of the plot (${at.topY} vs ${at.axisTop})`);
    assert.ok(at.leftEdge - at.axisLeft < 6 && at.leftEdge >= at.axisLeft - 0.5, `the columns start at the left end of the axis (${at.leftEdge} vs ${at.axisLeft})`);
    assert.ok(at.axisRight - at.rightEdge < 6, `the last column ends at the right end of the axis (${at.rightEdge} vs ${at.axisRight})`);
    await growLabG(page, 20);
    const grown = await labG(page);
    assert.equal(grown.lastXLabel, '20', 'the x axis follows n');
    assert.ok(Math.abs(grown.topY - grown.axisTop) < 0.6, `and the y axis refits the taller column (${grown.topY} vs ${grown.axisTop})`);
  } finally {
    await page.close();
  }
});

// Criterion 4: the phone fix must not move the desktop chart by a pixel.
test('a numeric-x curve keeps its desktop chart at 1280px', async (t) => {
  const dir = await tiny([
    '固定 x 軸的曲線圖；手機版的調整不該改到桌機版。',
    '',
    '```lab curve',
    'tag: LAB N',
    'title: 固定 x 軸',
    'x: { label: x, min: 0, max: 20 }',
    'curves: [{ label: "f(x)", expr: "x / 20" }]',
    '```',
  ].join('\n'));
  if (!browser) { t.skip('no browser available'); return; }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  try {
    await page.goto(pathToFileURL(join(dir, 'probe.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.Lykeion.show('ch1', { noScroll: true }));
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const svg = document.querySelector('.lab svg.viz');
      if (!svg) return null;
      const texts = [...svg.querySelectorAll('text.tick')];
      return {
        viewBox: svg.getAttribute('viewBox'),
        font: texts.map((x) => parseFloat(getComputedStyle(x).fontSize)),
        xTicks: texts.filter((x) => x.getAttribute('text-anchor') === 'middle' && /^-?\d/.test(x.textContent))
          .map((x) => [x.textContent, Number(x.getAttribute('x'))]),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.ok(info, 'the curve Lab is on the page');
    assert.equal(info.viewBox, '0 0 560 300', 'the desktop chart keeps the 560×300 viewBox');
    for (const f of info.font) assert.equal(f, 11, 'the desktop tick labels keep their 11px size');
    // The old geometry: 46 units of left padding, 16 of right, so 0…20 maps onto 498 units.
    const want = [['0', 46], ['5', 170.5], ['10', 295], ['15', 419.5], ['20', 544]];
    assert.deepEqual(info.xTicks.map(([t]) => t), want.map(([t]) => t));
    info.xTicks.forEach(([, x], i) => assert.ok(Math.abs(x - want[i][1]) < 0.6, `${want[i][0]} sits at ${x}, expected ${want[i][1]}`));
    assert.equal(info.overflow, 0, 'and it does not overflow the page');
  } finally {
    await page.close();
  }
});

// Criterion 3: the tick labels must still be readable on a 375px phone.
test('at 375px every curve tick and axis label renders at 11px or more', async (t) => {
  const page = await openSample(t, 375);
  if (!page) return;
  try {
    const at = await labG(page);
    assert.ok(at, 'LAB G is in the built sample');
    assert.ok(at.viewBox[2] < 560, `the narrow chart draws a narrower viewBox (${at.viewBox[2]})`);
    assert.ok(at.labels.length >= 8, `the chart still has its ticks and axis labels (${at.labels.length})`);
    at.fontPx.forEach((px, i) => assert.ok(px >= 11, `"${at.labels[i]}" renders at ${px.toFixed(2)}px`));
    at.boxPx.forEach((px, i) => assert.ok(px >= 11, `"${at.labels[i]}" has a ${px.toFixed(2)}px box`));
    assert.equal(at.overflow, 0, 'no horizontal page overflow');
  } finally {
    await page.close();
  }
});

// ---------- height stability (criterion 3) ----------

test('a discrete curve Lab keeps its height while its controls move at both widths', async (t) => {
  const dir = await tiny([
    '這張圖把分布畫成柱子，拉動 n 看柱數變多，判準與說明也跟著換。',
    '',
    '```lab curve',
    'tag: LAB D',
    'title: 離散柱',
    'inputs: [{ id: n, label: n, min: 4, max: 20, step: 1, value: 10 }]',
    'discrete: true',
    'x: { label: k, min: 0, max: 20 }',
    'y: { label: "P(X=k)", min: 0, max: 1 }',
    'curves: [{ label: "P(X=k)", expr: "x > n ? 0 : (x + 1) / (n + 2)" }]',
    'outputs:',
    '  - { label: np, expr: "n / 2" }',
    '  - { label: 判準, expr: "n > 8 ? 1 : 0", labels: { "1": "符合經驗法則", "0": "未達經驗法則" } }',
    'verdict:',
    '  - { when: "n < 8", text: 柱數還少，形狀不穩定。 }',
    '  - { when: "true", text: 柱數夠多，形狀接近鐘形；這是篩選條件，不保證近似一定準確。 }',
    '```',
  ].join('\n'));
  const items = await renderItems(t, dir);
  if (!items) return;
  const swings = items.filter((i) => /\(curve\)/.test(i.msg) && /swing/.test(i.msg));
  assert.deepEqual(swings, [], `the discrete curve Lab must not resize:\n${swings.map((i) => i.msg).join('\n')}`);
  for (const width of ['1280px', '375px']) {
    const ok = find(items, new RegExp(`every Lab keeps its height while its controls move at ${width}`));
    assert.ok(ok, `expected the ${width} stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
    assert.equal(ok.ok, true, ok.msg);
  }
});
