import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLabParams } from '../src/build.mjs';
import { tiny, renderItems, find } from './.project.mjs';

// A bar's `active` expression marks the bar the current inputs pick out of a fixed distribution.
// The mark is a class only (no box metric changes), so the Lab keeps its height as it moves.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAB_SRC = readFileSync(join(ROOT, 'labs', 'slider-calc', 'lab.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'runtime', 'base.css'), 'utf8');
const schema = () => JSON.parse(readFileSync(join(ROOT, 'labs', 'slider-calc', 'schema.json'), 'utf8'));

// Same vm harness as slider-bars.test.mjs: run the shipped Lab source in Node with a stub DOM.
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
  assert.equal(mount && mount.type, 'slider-calc');
  return mount.fn;
}

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

// k = 0…3 of a binomial pmf, with the bar for k marked active; `plain` has no `active` at all.
function mountBars() {
  const mount = loadLab();
  const root = stubEl('div');
  root.parentNode = { id: 'lab-1' };
  mount(root, {
    inputs: [{ id: 'k', label: 'k', min: 0, max: 3, step: 1, value: 2 }],
    outputs: [],
    bars: [
      { label: 'k=0', expr: 'k == 0 ? 0.1 : 0.05', max: 0.4, active: 'k == 0' },
      { label: 'k=1', expr: 'k == 1 ? 0.1 : 0.05', max: 0.4, active: 'k == 1' },
      { label: 'k=2', expr: 'k == 2 ? 0.1 : 0.05', max: 0.4, active: 'k == 2' },
      { label: 'k=3', expr: 'k == 3 ? 0.1 : 0.05', max: 0.4, active: 'k == 3' },
      { label: 'plain', expr: '0.05', max: 0.4 },
    ],
  }, apiStub);
  const find = (kids, cls) => kids.find((k) => k.attrs.class === cls);
  const controls = find(root.kids, 'controls');
  const barWrap = find(root.kids, 'bars2');
  return { range: controls.kids[0].querySelector('input'), bars: barWrap.kids };
}

const markedLabels = (bars) => bars.map((b, i) => (b.classes.has('active') ? i : -1)).filter((i) => i >= 0);

test('exactly the bar whose active is truthy is marked, and the mark follows the slider', () => {
  const { range, bars } = mountBars();
  assert.deepEqual(markedLabels(bars), [2], 'only k=2 is marked at k = 2');
  for (const k of ['0', '1', '3']) {
    range.value = k;
    range.listeners.input();
    assert.deepEqual(markedLabels(bars), [Number(k)], `the mark moves to k=${k}`);
  }
  // Back to a value two bars would both match if the class were not re-evaluated: still exactly one.
  range.value = '2';
  range.listeners.input();
  assert.deepEqual(markedLabels(bars), [2]);
});

test('a bar without active is never marked', () => {
  const { range, bars } = mountBars();
  const plain = bars[4];
  for (const k of ['0', '1', '2', '3']) {
    range.value = k;
    range.listeners.input();
    assert.equal(plain.classes.has('active'), false, `the plain bar stays unmarked at k=${k}`);
    assert.equal(plain.attrs.class, 'hbar');
  }
});

test('marking adds no inline style, so the bar keeps its box while the mark moves', () => {
  const { range, bars } = mountBars();
  const shape = () => bars.map((b) => ({
    cls: b.attrs.class,
    // The fill and zero-line styles are the geometry the Lab already writes; nothing else may appear.
    fill: Object.keys(b.querySelector('i').style).sort(),
    valueStyle: Object.keys(b.querySelector('b').style),
  }));
  const before = shape();
  range.value = '0';
  range.listeners.input();
  const after = shape();
  assert.deepEqual(after, before, 'toggling the mark writes no inline style');
  assert.deepEqual(after.map((s) => s.fill), before.map(() => ['width']), 'a one-sided fill still only carries its width');
});

// The stylesheet side of "no height change": every rule that marks an active bar may only touch
// colour and font-weight. A padding, margin, border width, font-size or line-height there would move
// the box under the reader as the mark travels.
test('the active-bar styles touch colour and weight only, from palette tokens', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2] }))
    .filter((r) => /\.hbar[^,{]*\.active|\.hbar\.active/.test(r.sel));
  assert.ok(rules.length >= 2, `expected active-bar rules in base.css, found ${rules.length}`);
  const boxy = /^(height|min-height|max-height|padding|padding-\w+|margin|margin-\w+|gap|row-gap|font-size|line-height|border-width|border-\w+-width|border|display|grid-template-rows)$/;
  for (const r of rules) {
    for (const decl of r.body.split(';')) {
      const [prop] = decl.split(':').map((s) => s.trim());
      if (!prop) continue;
      assert.equal(boxy.test(prop), false, `${r.sel} must not set ${prop} (it would resize the Lab)`);
      if (/^(background|background-color|color|border-color)$/.test(prop)) {
        assert.match(decl, /var\(--[\w-]+\)/, `${r.sel} { ${decl.trim()} } must use a palette token`);
      }
      assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(decl), false, `${r.sel} { ${decl.trim()} } must not hard-code a colour`);
    }
  }
  const marked = rules.map((r) => r.body).join(';');
  assert.match(marked, /background:var\(--s2\)/, 'the marked fill uses the second series colour');
  assert.match(marked, /border-color:var\(--accent\)/, 'the marked track takes the accent border');
  assert.doesNotMatch(marked, /\.track\{[^}]*background/, 'the marked track keeps the neutral background, so its empty part is not read as a second segment');
  assert.match(marked, /text-decoration:underline/, 'the marked label and number are underlined');
  assert.doesNotMatch(marked, /font-weight/, 'the mark keeps the weight, so a label cannot wrap when marked');
  // The signed bar's negative fill is the same --s2, so the active rule has to out-specify it.
  const sels = rules.map((r) => r.sel).join(',');
  assert.match(sels, /\.hbar\.active \.track i\.neg/, 'the active rule overrides the signed negative fill');
  assert.match(sels, /\.hbar\.active\.signed \.track i\.neg/, 'a marked negative signed bar takes the accent fill');
});

// ---------- schema ----------

test('schema accepts active on a bar', () => {
  const params = { title: 't', bars: [{ label: 'k=2', expr: 'k == 2 ? 0.1 : 0', max: 0.25, active: 'k == 2' }] };
  assert.deepEqual(checkLabParams(schema(), { type: 'slider-calc', where: 'x.md §1.1', params }), []);
});

test('schema still rejects unknown bar keys next to active', () => {
  const params = { title: 't', bars: [{ label: 'a', expr: 'x', active: 'x > 1', colour: 'red' }] };
  const errs = checkLabParams(schema(), { type: 'slider-calc', where: 'x.md §1.1', params });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /bars\[0\] has no key "colour"/);
});

// ---------- render gate ----------

test('a Lab whose active bar moves keeps its height (render gate)', async (t) => {
  const dir = await tiny(
    '```lab slider-calc\ntitle: 二項分布\n' +
    'inputs: [{ id: k, label: k, min: 0, max: 3, step: 1, value: 2 }]\n' +
    'outputs: [{ label: "C(3,k)", expr: "k == 0 ? 1 : k == 1 ? 3 : k == 2 ? 3 : 1" }]\n' +
    'bars: [' +
    '{ label: "k=0", expr: "k == 0 ? 0.1 : 0.05", max: 0.4, active: "k == 0" }, ' +
    '{ label: "k=1", expr: "k == 1 ? 0.1 : 0.05", max: 0.4, active: "k == 1" }, ' +
    '{ label: "k=2", expr: "k == 2 ? 0.1 : 0.05", max: 0.4, active: "k == 2" }, ' +
    '{ label: "k=3", expr: "k == 3 ? 0.1 : 0.05", max: 0.4, active: "k == 3" }' +
    ']\n```\n',
  );
  const items = await renderItems(t, dir);
  if (!items) return;
  const stability = find(items, /keeps its height while its controls move at 1280px/);
  assert.ok(stability, `expected a Lab-stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(stability.ok, true, stability.msg);
});
