import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadMath() {
  const src = await readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
  return new Function(`${src}\nreturn LykeionMath;`)();
}
const M = await loadMath();

// Hand-checked baskets over A–D: {D} is frequent but not closed, {A} is closed but not maximal.
const BASKETS = [
  { tid: 't1', items: ['A', 'B', 'C', 'D'] },
  { tid: 't2', items: ['A', 'B', 'C'] },
  { tid: 't3', items: ['A', 'B'] },
  { tid: 't4', items: ['A', 'C', 'D'] },
  { tid: 't5', items: ['B', 'C'] },
];
const labels = (sets) => sets.map((s) => s.label);

test('itemsets: frequent, closed and maximal sets are exact at two minsup values', () => {
  const m2 = M.itemsets(BASKETS, 2);
  assert.deepEqual(m2.universe, ['A', 'B', 'C', 'D']);
  assert.deepEqual(m2.counts, { frequent: 11, closed: 8, maximal: 2 });
  assert.deepEqual(labels(m2.frequent), ['A', 'B', 'C', 'D', 'A,B', 'A,C', 'A,D', 'B,C', 'C,D', 'A,B,C', 'A,C,D']);
  assert.deepEqual(labels(m2.closed), ['A', 'B', 'C', 'A,B', 'A,C', 'B,C', 'A,B,C', 'A,C,D']);
  assert.deepEqual(labels(m2.maximal), ['A,B,C', 'A,C,D']);

  const m3 = M.itemsets(BASKETS, 3);
  assert.deepEqual(m3.counts, { frequent: 6, closed: 6, maximal: 3 });
  assert.deepEqual(labels(m3.frequent), ['A', 'B', 'C', 'A,B', 'A,C', 'B,C']);
  assert.deepEqual(labels(m3.maximal), ['A,B', 'A,C', 'B,C']);

  // A frequent itemset that is not closed: {D} has the same support as its superset {A,D}.
  const d = m2.sets.find((s) => s.label === 'D');
  assert.equal(d.sigma, 2);
  assert.equal(d.frequent, true);
  assert.equal(d.closed, false);

  // A closed itemset that is not maximal: {A} has frequent proper supersets.
  const a = m2.sets.find((s) => s.label === 'A');
  assert.equal(a.sigma, 4);
  assert.equal(a.closed, true);
  assert.equal(a.maximal, false);

  // Every maximal itemset is closed; nothing is closed or maximal without being frequent.
  assert.ok(m2.maximal.every((s) => s.closed && s.frequent));
  assert.ok(m2.sets.every((s) => s.closed || s.maximal ? s.frequent : true));
  // minsup is an absolute count, clamped to at least 1.
  assert.equal(M.itemsets(BASKETS, 0).minsup, 1);
});

test('build rejects itemsets Lab parameters the type does not support', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-bad.md'), '---\nchapter: 3\ntitle: Bad\nsource: sample.pdf\n---\n\n## 3.1 Bad {pages=1}\n\n' +
    '```lab itemsets\ntransactions: [{ tid: 1, items: [A] }]\nminsup: { value: 1 }\nbaskets: 2\n```\n\n' +
    '```lab itemsets\ntransactions: [{ tid: 1, items: [A], weight: 3 }]\nminsup: { value: 1 }\n```\n\n' +
    '```lab itemsets\ntransactions: [{ tid: 1, items: [A] }]\nminsup: { value: 1, minimum: 1 }\nshow: [frequent, maximal]\n```\n');
  await assert.rejects(build(dir), (e) => {
    assert.match(e.message, /Lab "itemsets" has no parameter "baskets"/);
    assert.match(e.message, /Lab "itemsets" transactions\[0\] has no key "weight"/);
    assert.match(e.message, /Lab "itemsets" minsup has no key "minimum" \(allowed: value, min, max\)/);
    return true;
  });
});

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

// The lattice enumerates every non-empty subset of the item universe, so the build caps what the
// Lab can express instead of letting a 7-item Lab enumerate 127 sets (or 20 items → ~1M).
test('build rejects an itemsets Lab with more than 6 distinct items', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-wide.md'), '---\nchapter: 3\ntitle: Wide\nsource: sample.pdf\n---\n\n## 3.1 Wide {pages=1}\n\n' +
    '```lab itemsets\ntransactions:\n  - { tid: t1, items: [A, B, C, D] }\n  - { tid: t2, items: [D, E, F, G] }\nminsup: { value: 1 }\n```\n');
  await assert.rejects(build(dir), (e) => {
    assert.match(e.message, /Lab "itemsets" has 7 distinct items; at most 6 are supported/);
    return true;
  });
});

// The other two itemsets limits: the transaction count drives the slider range, and minsup is an
// absolute count, so a value the data cannot reach is an authoring error rather than a silent clamp.
test('build rejects an itemsets Lab whose transaction count or minsup is out of range', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-range.md'), '---\nchapter: 3\ntitle: Range\nsource: sample.pdf\n---\n\n## 3.1 Range {pages=1}\n\n' +
    '```lab itemsets\ntransactions: []\nminsup: { value: 1 }\n```\n\n' +
    '```lab itemsets\ntransactions: [{ tid: 1, items: [A] }]\nminsup: { value: 0 }\n```\n\n' +
    '```lab itemsets\ntransactions: [{ tid: 1, items: [A] }]\nminsup: { value: 5 }\n```\n');
  await assert.rejects(build(dir), (e) => {
    assert.match(e.message, /Lab "itemsets" has 0 transaction\(s\); 1–20 are supported/);
    assert.match(e.message, /Lab "itemsets" minsup\.value must be an integer between 1 and 1 \(the transaction count\); got 0/);
    assert.match(e.message, /Lab "itemsets" minsup\.value must be an integer between 1 and 1 \(the transaction count\); got 5/);
    return true;
  });
});

test('render gate recomputes the sample itemsets Lab counts and passes', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const checked = render.items.find((i) => /itemsets\): displayed counts match/.test(i.msg));
  assert.ok(checked, render.items.map((i) => i.msg).join('\n'));
  assert.equal(checked.ok, true);
  assert.match(checked.msg, /Lab lab-3 \(itemsets\): displayed counts match LykeionMath\.itemsets at 3 minsup values/);
  assert.match(checked.msg, /minsup 1 → frequent 15\/closed 9\/maximal 1/);
  // The legend swatches are painted by the same classes as the nodes they name, so the legend
  // cannot drift from the lattice (the bug that made all three swatches render as empty circles).
  const legend = render.items.find((i) => /legend swatches/.test(i.msg));
  assert.ok(legend, render.items.map((i) => i.msg).join('\n'));
  assert.equal(legend.ok, true);
  assert.match(legend.msg, /Lab lab-3 \(itemsets\): 5 legend swatches are painted exactly like the lattice node states they name/);
});

test('render gate catches a legend swatch that names a state the lattice does not use', async () => {
  const dir = await sampleCopy();
  await mkdir(join(dir, 'labs', 'itemsets-drift'), { recursive: true });
  await writeFile(join(dir, 'labs', 'itemsets-drift', 'lab.js'), DRIFT_LAB);
  await writeFile(join(dir, 'content', '03-drift-itemsets.md'), '---\nchapter: 3\ntitle: Drift\nsource: sample.pdf\n---\n\n## 3.1 Drift {pages=1}\n\n' +
    '```lab itemsets-drift\ntransactions:\n  - { tid: t1, items: [A, B] }\n  - { tid: t2, items: [A] }\nminsup: { value: 1 }\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'fail');
  const drift = render.items.filter((i) => i.ok === false && /legend swatch/.test(i.msg));
  assert.equal(drift.length, 1, render.items.map((i) => i.msg).join('\n'));
  assert.match(drift[0].msg, /\(itemsets-drift\): legend swatch "st-frequent" names a state the lattice does not use/);
});

// A project-local custom Lab that renders the itemsets readouts from its own (wrong) arithmetic:
// the gate must hold it to the same recomputation and name it.
const BROKEN_LAB = `Lykeion.registerLab('itemsets-broken', function (root, p, api) {
  var H = api.H;
  var n = (p.transactions || []).length || 1;
  var ctl = H('div', { class: 'controls' }, '<label for="bogus-minsup">minsup <output>' + n + '</output></label><input type="range" id="bogus-minsup" min="1" max="' + n + '" step="1" value="1">');
  root.appendChild(ctl);
  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  var cells = {};
  ['frequent', 'closed', 'maximal'].forEach(function (k) {
    cells[k] = H('div', { class: 'ro', 'data-count': k }, '<span>' + k + '</span><b>—</b>');
    ro.appendChild(cells[k]);
  });
  root.appendChild(ro);
  var range = ctl.querySelector('input'), out = ctl.querySelector('output');
  function draw() {
    out.textContent = range.value;
    ['frequent', 'closed', 'maximal'].forEach(function (k) { cells[k].querySelector('b').textContent = String(Number(range.value) + 100); });
  }
  range.addEventListener('input', draw);
  draw();
});
`;

// The same Lab, but its legend swatch names a class the lattice never uses: the gate must catch the
// drift instead of letting the legend describe states it never draws.
const DRIFT_LAB = BROKEN_LAB.replace(/itemsets-broken/g, 'itemsets-drift')
  .replace("root.appendChild(ro);", "root.appendChild(ro);\n  root.appendChild(H('div', { class: 'legend itemsets-legend' }, '<span><svg class=\"lg lat-node st-frequent\"><rect width=\"34\" height=\"26\"></rect><text class=\"lat-txt\">A</text></svg>頻繁</span>'));");

test('render gate fails, naming the Lab, when an itemsets Lab shows wrong counts', async () => {
  const dir = await sampleCopy();
  await mkdir(join(dir, 'labs', 'itemsets-broken'), { recursive: true });
  await writeFile(join(dir, 'labs', 'itemsets-broken', 'lab.js'), BROKEN_LAB);
  await writeFile(join(dir, 'content', '03-broken-itemsets.md'), '---\nchapter: 3\ntitle: Broken\nsource: sample.pdf\n---\n\n## 3.1 Broken {pages=1}\n\n' +
    '```lab itemsets-broken\ntransactions:\n  - { tid: t1, items: [A, B] }\n  - { tid: t2, items: [A] }\nminsup: { value: 1 }\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'fail');
  const wrong = render.items.filter((i) => i.ok === false && /\(itemsets-broken\)/.test(i.msg));
  assert.equal(wrong.length, 1, render.items.map((i) => i.msg).join('\n'));
  // Identify the mounted Lab by the gate's own Lab count, so the test does not depend on how many
  // Labs the sample fixture happens to contain.
  const mounted = Number(render.items.find((i) => /Labs mounted/.test(i.msg)).msg.match(/(\d+) Labs mounted/)[1]);
  assert.match(wrong[0].msg, new RegExp(`Lab lab-${mounted} \\(itemsets-broken\\): displayed counts disagree with the params`));
  assert.match(wrong[0].msg, /frequent shows 101, params give 3/);
  assert.match(wrong[0].msg, /closed shows 101, params give 2/);
  assert.match(wrong[0].msg, /maximal shows 101, params give 1/);
});
