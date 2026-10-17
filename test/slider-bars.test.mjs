import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, checkLabParams } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAB_SRC = readFileSync(join(ROOT, 'labs', 'slider-calc', 'lab.js'), 'utf8');
const schema = () => JSON.parse(readFileSync(join(ROOT, 'labs', 'slider-calc', 'schema.json'), 'utf8'));

// The geometry helper is a top-level function in the browser Lab source; pull it
// into Node with vm (stdlib only) so the unit tests exercise the shipped code.
function loadLab() {
  let mount = null;
  const sandbox = {
    Lykeion: { registerLab: (type, fn) => { mount = { type, fn }; } },
    LykeionMath: {
      compile: (expr, ids) => ((st) => new Function(...ids, `return (${expr});`)(...ids.map((k) => st[k]))),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(LAB_SRC, sandbox, { filename: 'lab.js' });
  assert.equal(typeof sandbox.sliderBarGeom, 'function', 'lab.js must expose a top-level sliderBarGeom helper');
  assert.equal(mount && mount.type, 'slider-calc');
  // Objects built inside the vm context have that realm's Object.prototype, which strict deepEqual
  // treats as different; copy the result into this realm before comparing.
  const geom = (...args) => ({ ...sandbox.sliderBarGeom(...args) });
  return { geom, mount: mount.fn };
}

const approx = (a, b) => Math.abs(a - b) < 1e-12;

// ---------- pure geometry ----------

test('one-sided bars (min 0): value maps to a 0-anchored fill fraction', () => {
  const { geom } = loadLab();
  assert.deepEqual(geom(0.1, 0, 0.4), { left: 0, width: 0.25, zero: 0 });
  assert.deepEqual(geom(0, 0, 0.4), { left: 0, width: 0, zero: 0 });
  assert.deepEqual(geom(0.4, 0, 0.4), { left: 0, width: 1, zero: 0 });
});

test('one-sided bars clamp out-of-range values', () => {
  const { geom } = loadLab();
  assert.deepEqual(geom(-2, 0, 0.4), { left: 0, width: 0, zero: 0 });
  assert.deepEqual(geom(99, 0, 0.4), { left: 0, width: 1, zero: 0 });
});

test('signed bars (min < 0): zero line sits at the position of 0', () => {
  const { geom } = loadLab();
  const pos = geom(0.5, -1, 1);
  assert.ok(approx(pos.left, 0.5) && approx(pos.width, 0.25) && approx(pos.zero, 0.5));
  const neg = geom(-0.5, -1, 1);
  assert.ok(approx(neg.left, 0.25) && approx(neg.width, 0.25) && approx(neg.zero, 0.5));
  const zero = geom(0, -1, 1);
  assert.ok(approx(zero.left, 0.5) && approx(zero.width, 0) && approx(zero.zero, 0.5));
});

test('signed bars clamp to [min, max] and support asymmetric ranges', () => {
  const { geom } = loadLab();
  const hi = geom(2, -1, 1);
  assert.ok(approx(hi.left, 0.5) && approx(hi.width, 0.5));
  const lo = geom(-2, -1, 1);
  assert.ok(approx(lo.left, 0) && approx(lo.width, 0.5));
  // Asymmetric: min -0.5, max 1.5 → span 2, zero at 0.25.
  const a = geom(1.5, -0.5, 1.5);
  assert.ok(approx(a.left, 0.25) && approx(a.width, 0.75) && approx(a.zero, 0.25));
  const b = geom(-0.5, -0.5, 1.5);
  assert.ok(approx(b.left, 0) && approx(b.width, 0.25) && approx(b.zero, 0.25));
});

test('geometry is safe for degenerate ranges and non-finite values', () => {
  const { geom } = loadLab();
  assert.deepEqual(geom(1, 1, 1), { left: 0, width: 0, zero: 0 });
  assert.deepEqual(geom(1, 2, 1), { left: 0, width: 0, zero: 0 });
  assert.equal(geom(NaN, -1, 1).width, 0);
  assert.equal(geom(Infinity, -1, 1).width, 0);
  assert.equal(geom(NaN, 0, 1).width, 0);
});

// ---------- schema ----------

test('build accepts a signed bar (min) on slider-calc', () => {
  const params = { title: 't', bars: [{ label: 'd', expr: 'pa - 0.3', min: -0.3, max: 0.7 }] };
  assert.deepEqual(checkLabParams(schema(), { type: 'slider-calc', where: 'x.md §1.1', params }), []);
});

test('schema still rejects unknown bar keys', () => {
  const params = { title: 't', bars: [{ label: 'd', expr: 'x', colour: 'red' }] };
  const errs = checkLabParams(schema(), { type: 'slider-calc', where: 'x.md §1.1', params });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /bars\[0\] has no key "colour"/);
});

// ---------- mounted Lab behaviour (stub DOM, no browser) ----------

function stubEl(tag) {
  const slots = {};
  const e = {
    tag, attrs: {}, style: {}, kids: [],
    textContent: '', hidden: false, value: '',
    listeners: {}, classes: new Set(),
    setAttribute(k, v) { e.attrs[k] = v; },
    appendChild(c) { e.kids.push(c); return c; },
    addEventListener(t, fn) { e.listeners[t] = fn; },
    querySelector(sel) { return slots[sel]; },
    classList: {
      toggle(n, force) { if (force) e.classes.add(n); else e.classes.delete(n); },
      contains(n) { return e.classes.has(n); },
    },
  };
  Object.defineProperty(e, 'innerHTML', {
    set(html) {
      e._html = html;
      for (const m of String(html).matchAll(/<(input|output|i|u|b)\b([^>]*)>/g)) {
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
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmt: (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—'),
  setVal: (el, txt) => { el.textContent = txt; },
};

function mountBars() {
  const { mount } = loadLab();
  const root = stubEl('div');
  root.parentNode = { id: 'lab-9' };
  mount(root, {
    inputs: [{ id: 'x', label: 'X', min: -10, max: 10, step: 1, value: 2 }],
    outputs: [],
    bars: [
      { label: 'U', expr: 'x / 40', max: 0.4 },
      { label: 'D', expr: 'x / 10', min: -1, max: 1 },
    ],
  }, apiStub);
  const find = (kids, cls) => kids.find((k) => k.attrs.class === cls);
  const controls = find(root.kids, 'controls');
  const barWrap = find(root.kids, 'bars2');
  return { root, range: controls.kids[0].querySelector('input'), bars: barWrap.kids };
}

test('a bar without min renders exactly as before (width-only fill, signed label)', () => {
  const { range, bars } = mountBars();
  assert.ok(range, 'the slider input is mounted');
  const u = bars[0];
  assert.equal(u.attrs.class, 'hbar');
  assert.equal(u.querySelector('u'), undefined, 'no zero-line element on a one-sided bar');
  assert.equal(u.querySelector('i').style.left, undefined, 'one-sided fill is not positioned');
  assert.ok(approx(parseFloat(u.querySelector('i').style.width), 5), `fill 0.05 of scale 1, got ${u.querySelector('i').style.width}`);
  assert.equal(u.querySelector('b').textContent, '0.050');
});

test('a bar with min < 0 renders a centre-zero bar with a signed label', () => {
  const { bars } = mountBars();
  const d = bars[1];
  assert.equal(d.attrs.class, 'hbar signed');
  const zero = d.querySelector('u');
  assert.ok(zero, 'a zero-line element is mounted');
  assert.ok(approx(parseFloat(zero.style.left), 50), `zero at 50%, got ${zero.style.left}`);
  const fill = d.querySelector('i');
  assert.ok(approx(parseFloat(fill.style.left), 50), `fill starts at zero, got ${fill.style.left}`);
  assert.ok(approx(parseFloat(fill.style.width), 10), `fill spans 0.1 of the track, got ${fill.style.width}`);
  assert.equal(fill.classList.contains('pos'), true);
  assert.equal(fill.classList.contains('neg'), false);
  assert.equal(d.querySelector('b').textContent, '0.200', 'the label shows the signed value, no abs()');
});

test('moving the slider into the negative moves the signed fill left of zero', () => {
  const { range, bars } = mountBars();
  range.value = '-6';
  range.listeners.input();
  const u = bars[0];
  assert.equal(u.querySelector('i').style.width, '0%', 'a negative value clamps a one-sided fill to empty');
  assert.equal(u.querySelector('b').textContent, '-0.150');
  const d = bars[1];
  const fill = d.querySelector('i');
  assert.ok(approx(parseFloat(fill.style.left), 20), `fill ends at zero, got ${fill.style.left}`);
  assert.ok(approx(parseFloat(fill.style.width), 30), `fill spans 0.3 of the track, got ${fill.style.width}`);
  assert.equal(fill.classList.contains('neg'), true);
  assert.equal(fill.classList.contains('pos'), false);
  assert.equal(d.querySelector('b').textContent, '-0.600');
});

test('a signed value of exactly 0 collapses the fill onto the zero line', () => {
  const { range, bars } = mountBars();
  range.value = '0';
  range.listeners.input();
  const d = bars[1];
  const fill = d.querySelector('i');
  assert.ok(approx(parseFloat(fill.style.left), 50));
  assert.equal(parseFloat(fill.style.width), 0);
  assert.equal(d.querySelector('b').textContent, '0.000');
});

// ---------- end-to-end build ----------

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

test('build accepts a signed bar in a real chapter', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-signed.md'),
    '---\nchapter: 3\ntitle: Signed\nsource: sample.pdf\n---\n\n## 3.1 Signed {pages=1}\n\n' +
    '```lab slider-calc\ntitle: deviation from independence\n' +
    'inputs: [{ id: pa, label: "P(A|B)", min: 0, max: 1, step: 0.05, value: 0.3 }]\n' +
    'outputs: [{ label: "P(A∩B)", expr: "pa * 0.4" }]\n' +
    'bars: [{ label: "P(A∩B) - 0.12", expr: "pa * 0.4 - 0.12", min: -0.12, max: 0.28 }]\n' +
    '```\n');
  await build(dir);
});
