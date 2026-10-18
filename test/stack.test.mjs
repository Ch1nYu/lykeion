import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAB_SRC = readFileSync(join(ROOT, 'labs', 'stepper', 'lab.js'), 'utf8');

// A DOM small enough for the stepper Lab: elements remember their children, classes and innerHTML.
function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(), className: '', children: [], style: {}, dataset: {}, attrs: {}, disabled: false,
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    querySelector() { return null; },
    // The live region only ever gets `textContent`, so the stub needs the plain property.
    textContent: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
      toggle(c, on) { const want = on === undefined ? !this._set.has(c) : !!on; if (want) this._set.add(c); else this._set.delete(c); return want; },
      contains(c) { return this._set.has(c); },
    },
    // Minimal innerHTML: just enough to build the <span data-i="n"> variants the stack creates.
    set innerHTML(v) {
      this._html = v;
      this.children = [];
      for (const m of String(v).matchAll(/<span data-i="(\d+)">([\s\S]*?)<\/span>/g)) {
        const c = makeEl('span');
        c.dataset.i = m[1];
        c._html = m[2];
        c.textContent = m[2].replace(/<[^>]+>/g, '');
        this.children.push(c);
      }
    },
    get innerHTML() { return this._html ?? ''; },
  };
  return el;
}

// The stack helper is a top-level function in the runtime, which is an IIFE. Lift it out by
// evaluating the whole file with a DOM stub and reading the Lab api it publishes — the same
// function every Lab receives, so this tests the shipped implementation, not a copy.
function loadStack() {
  // The runtime reads its data block and its controls at load time; a stub for every id keeps the
  // IIFE happy while api.stack is the only thing under test.
  const dataEl = makeEl('script');
  dataEl.textContent = JSON.stringify({ key: 'test', levels: [] });
  const stub = (sel) => (sel === '#lykeion-data' ? dataEl : makeEl('div'));
  const ctx = {
    document: {
      querySelector: stub,
      querySelectorAll: () => [],
      getElementById: () => makeEl('div'),
      addEventListener() {},
      createElement: (t) => makeEl(t),
      createElementNS: (_ns, t) => makeEl(t),
      documentElement: makeEl('html'),
      visibilityState: 'visible',
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => fn(0),
    IntersectionObserver: class { observe() {} disconnect() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    navigator: {}, console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'runtime', 'runtime.js'), 'utf8'), ctx, { filename: 'runtime.js' });
  assert.equal(typeof ctx.Lykeion.api.stack, 'function', 'api.stack must be exposed to Labs');
  return { stack: ctx.Lykeion.api.stack, makeEl };
}

test('api.stack puts every variant in one cell and shows exactly one', () => {
  const { stack, makeEl } = loadStack();
  const el = makeEl('div');
  const s = stack(el, ['<b>a</b>', '<b>b</b>', '<b>c</b>']);
  assert.ok(el.classList.contains('stack'), 'the host element becomes a grid stack');
  assert.equal(el.children.length, 4, 'every variant is rendered up front, so the box is as tall as the tallest');
  assert.deepEqual(el.children.slice(0, 3).map((c) => c.innerHTML), ['<b>a</b>', '<b>b</b>', '<b>c</b>']);
  assert.deepEqual(el.children.slice(0, 3).map((c) => c.classList.contains('on')), [false, false, false], 'nothing is shown until show() is called');
  assert.ok(el.children[3].attrs.class.includes('sr-only'), 'the last child is the live region that announces the shown variant');

  s.show(1);
  assert.deepEqual(el.children.slice(0, 3).map((c) => c.classList.contains('on')), [false, true, false]);
  s.show(2);
  assert.deepEqual(el.children.slice(0, 3).map((c) => c.classList.contains('on')), [false, false, true]);
});

test('api.stack announces the shown variant and drops the box when none is shown', () => {
  const { stack, makeEl } = loadStack();
  const el = makeEl('div');
  const s = stack(el, ['one', 'two']);
  const live = el.children[2];
  s.show(1);
  assert.equal(live.textContent, 'two', 'the live region carries the text a reader now sees');
  s.show(-1);
  assert.equal(live.textContent, '', 'nothing to announce');
  assert.ok(el.classList.contains('is-empty'), 'the empty box drops its padding and tint');
  s.show(0);
  assert.ok(!el.classList.contains('is-empty'), 'showing a variant brings the box back');
});

test('api.stack show(-1) hides every variant but keeps the reserved space', () => {
  const { stack, makeEl } = loadStack();
  const el = makeEl('div');
  const s = stack(el, ['one', 'two']);
  s.show(0);
  s.show(-1);
  assert.deepEqual(el.children.slice(0, 2).map((c) => c.classList.contains('on')), [false, false], 'no variant is visible');
  assert.equal(el.children.length, 3, 'the variants (and so the box height) are still there, plus the live region');
});

test('the stepper Lab stacks every step view, so walking the steps cannot resize the Lab', () => {
  // The source is checked because the behaviour needs a real browser; the render gate measures the
  // heights, this pins the structure the gate depends on.
  assert.match(LAB_SRC, /api\.stack\(view, steps\.map\(stepHtml\)\)/);
  assert.doesNotMatch(LAB_SRC, /view\.innerHTML\s*=/, 'steps must not be re-rendered into the same box');
});

test('the verdict Labs stack every verdict instead of swapping one box', () => {
  for (const name of ['slider-calc', 'table']) {
    const src = readFileSync(join(ROOT, 'labs', name, 'lab.js'), 'utf8');
    assert.match(src, /api\.stack\(verdictEl, verdicts\.map/, `${name} must stack its verdicts`);
    assert.doesNotMatch(src, /verdictEl\.(innerHTML|textContent)\s*=/, `${name} must not swap the verdict text in place`);
  }
});
