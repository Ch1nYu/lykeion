// Tests for the "tree" Lab: the split maths (LykeionMath.treeSplits / treeGrow), the build-time
// limits, and the render gate that recomputes the page's gains and grown tree from the params.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { build } from '../src/build.mjs';
import { verify } from '../src/verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadMath() {
  const src = await readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
  return new Function(`${src}\nreturn LykeionMath;`)();
}
async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

// 6 records, two attributes, two classes: A separates the classes almost cleanly, B barely at all,
// so every measure must prefer A and the hand-checked numbers below are easy to follow.
const ATTRS = [{ name: 'A', values: ['a1', 'a2', 'a3'] }, { name: 'B', values: ['b1', 'b2'] }];
const CLASS = { name: 'C', values: ['yes', 'no'] };
const RECORDS = [
  { A: 'a1', B: 'b1', C: 'yes' }, { A: 'a1', B: 'b2', C: 'yes' },
  { A: 'a2', B: 'b1', C: 'no' }, { A: 'a2', B: 'b2', C: 'no' },
  { A: 'a3', B: 'b1', C: 'no' }, { A: 'a3', B: 'b2', C: 'yes' },
];
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const cand = (res, attr) => res.candidates.find((c) => c.attr === attr);

test('treeSplits: weighted impurity and gain are exact for gini and entropy, multiway and binary', async () => {
  const M = await loadMath();

  // Parent: 3 yes / 3 no.
  const g = M.treeSplits(RECORDS, ATTRS, CLASS, 'gini', 'multiway');
  near(g.impurity, 0.5);
  assert.equal(g.counts.join(','), '3,3');
  // A: a1 (2,0), a2 (0,2), a3 (1,1) → gini 0, 0, 0.5 → weighted 1/6, gain 1/3.
  near(cand(g, 'A').weighted, 1 / 6);
  near(cand(g, 'A').gain, 1 / 3);
  assert.deepEqual(cand(g, 'A').groups.map((x) => x.label), ['a1', 'a2', 'a3']);
  assert.deepEqual(cand(g, 'A').groups.map((x) => x.counts.join(',')), ['2,0', '0,2', '1,1']);
  // B: b1 (1,2), b2 (2,1) → gini 4/9 each → weighted 4/9, gain 1/18.
  near(cand(g, 'B').weighted, 4 / 9);
  near(cand(g, 'B').gain, 1 / 18);
  assert.equal(g.best.attr, 'A');

  // Entropy: a1 and a2 are pure (0), a3 is 1 bit → weighted 1/3, gain 2/3.
  const e = M.treeSplits(RECORDS, ATTRS, CLASS, 'entropy', 'multiway');
  near(e.impurity, 1);
  near(cand(e, 'A').weighted, 1 / 3);
  near(cand(e, 'A').gain, 2 / 3);
  near(cand(e, 'B').weighted, -(1 / 3) * Math.log2(1 / 3) - (2 / 3) * Math.log2(2 / 3));
  assert.equal(e.best.attr, 'A');

  // Binary groups one value against the rest: a1 vs ¬a1 = (2,0) and (1,3).
  const gb = M.treeSplits(RECORDS, ATTRS, CLASS, 'gini', 'binary');
  assert.deepEqual(cand(gb, 'A').groups.map((x) => x.label), ['a1', '¬a1']);
  assert.deepEqual(cand(gb, 'A').groups.map((x) => x.n), [2, 4]);
  assert.deepEqual(cand(gb, 'A').groups.map((x) => x.counts.join(',')), ['2,0', '1,3']);
  near(cand(gb, 'A').weighted, 0.25); // (2/6)·0 + (4/6)·0.375
  near(cand(gb, 'A').gain, 0.25);
  assert.equal(gb.best.attr, 'A');
  const eb = M.treeSplits(RECORDS, ATTRS, CLASS, 'entropy', 'binary');
  near(cand(eb, 'A').weighted, (4 / 6) * (-0.25 * Math.log2(0.25) - 0.75 * Math.log2(0.75)));
  assert.equal(eb.best.attr, 'A');

  // The measure changes the numbers: B costs 4/9 under gini but only 1/3 under classification error.
  const er = M.treeSplits(RECORDS, ATTRS, CLASS, 'error', 'multiway');
  near(cand(er, 'B').weighted, 1 / 3);
  assert.notEqual(cand(er, 'B').weighted, cand(g, 'B').weighted);
  assert.equal(er.best.attr, 'A');

  // Hunt's algorithm grows the best split at every step; this data set ends up perfectly separated.
  const grown = M.treeGrow(RECORDS, ATTRS, CLASS, 'gini', 'multiway');
  assert.deepEqual(M.treeStats(grown), { depth: 2, leaves: 4 });
  assert.equal(grown.attr, 'A');
  assert.equal(M.treeError(grown, RECORDS, CLASS), 0);
  assert.equal(M.treePredict(grown, { A: 'a3', B: 'b1' }), 'no');
  assert.equal(M.treePredict(grown, { A: 'a3', B: 'b2' }), 'yes');
  // A pure node has no candidate splits worth taking, and log2(0) never leaks a NaN into a gain.
  const pure = M.treeSplits([{ A: 'a1', B: 'b1', C: 'yes' }, { A: 'a1', B: 'b2', C: 'yes' }], ATTRS, CLASS, 'entropy', 'multiway');
  assert.equal(pure.impurity, 0);
  assert.ok(pure.candidates.every((c) => Number.isFinite(c.gain) && Number.isFinite(c.weighted)));
});

// ---------- build limits ----------
const FM = '---\nchapter: 9\ntitle: Tree test\nshort: tree\nsubtitle: t\nsummary: s\nsource: sample.pdf\n---\n\n## 9.1 Tree {pages=1}\n\n';
const BASE = {
  tag: 'LAB T', title: '測試樹',
  attributes: [{ name: 'Weather', values: ['Sunny', 'Rainy'] }, { name: 'Wind', values: ['Weak', 'Strong'] }],
  class: { name: 'Play', values: ['Yes', 'No'] },
  records: [{ Weather: 'Sunny', Wind: 'Weak', Play: 'No' }, { Weather: 'Rainy', Wind: 'Strong', Play: 'Yes' }],
};
async function withLab(dir, params) {
  await writeFile(join(dir, 'content', '03-tree.md'), `${FM}\`\`\`lab tree\n${yaml.dump(params)}\`\`\`\n`);
}

test('build rejects an unknown tree Lab key and an undeclared attribute value', async () => {
  const dir = await sampleCopy();

  await withLab(dir, { ...BASE, colour: 'red' });
  await assert.rejects(build(dir), /Lab "tree" has no parameter "colour"/);

  const records = [{ Weather: 'Wet', Wind: 'Weak', Play: 'No' }, BASE.records[1]];
  await withLab(dir, { ...BASE, records });
  await assert.rejects(build(dir), /record 1 has undeclared value "Wet" for attribute "Weather" \(allowed: Sunny, Rainy\)/);

  const cls = [{ Weather: 'Sunny', Wind: 'Weak', Play: 'Maybe' }, BASE.records[1]];
  await withLab(dir, { ...BASE, records: cls });
  await assert.rejects(build(dir), /record 1 has undeclared class "Maybe" \(allowed: Yes, No\)/);

  await withLab(dir, { ...BASE, records: [{ Weather: 'Sunny', Wind: 'Weak', Wether: 'x', Play: 'No' }] });
  await assert.rejects(build(dir), /record 1 has unknown column "Wether" \(allowed: Weather, Wind, Play\)/);

  await withLab(dir, BASE);
  const r = await build(dir);
  assert.ok(r.labs >= 1);
});

test('build rejects tree Labs outside the supported limits', async () => {
  const dir = await sampleCopy();
  const many = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, values: ['x', 'y'] }));
  const rec = (keys) => Object.fromEntries([...keys.map((k) => [k, 'x']), ['Play', 'Yes']]);

  const cases = [
    [{ ...BASE, attributes: many, records: [rec(['A', 'B', 'C', 'D', 'E'])] }, /Lab "tree" has 5 attributes; 1–4 are supported/],
    [{ ...BASE, attributes: [{ name: 'Weather', values: ['Sunny'] }], records: [{ Weather: 'Sunny', Play: 'No' }] }, /attribute "Weather" has 1 value\(s\); 2–4 are supported/],
    [{ ...BASE, class: { name: 'Play', values: ['Yes', 'No', 'Maybe', 'Later'] } }, /Lab "tree" has 4 class value\(s\); 2–3 are supported/],
    [{ ...BASE, records: Array.from({ length: 17 }, () => BASE.records[0]) }, /Lab "tree" has 17 records; 1–16 are supported/],
    [{ ...BASE, records: [] }, /Lab "tree" has 0 records; 1–16 are supported/],
    [{ ...BASE, measure: 'chi2' }, /Lab "tree" measure "chi2" must be one of gini, entropy, error/],
    [{ ...BASE, split: 'ternary' }, /Lab "tree" split "ternary" must be one of multiway, binary/],
    [{ ...BASE, attributes: [{ name: 'Weather', values: ['Sunny', 'Rainy'] }, { name: 'Weather', values: ['Hot', 'Cool'] }] }, /two attributes named "Weather"/],
    [{ ...BASE, attributes: [{ name: 'Play', values: ['Sunny', 'Rainy'] }] }, /class "Play" has the same name as an attribute/],
    [{ ...BASE, records: [{ Weather: 'Sunny', Wind: 'Weak' }] }, /record 1 has no value for the class "Play"/],
  ];
  for (const [params, re] of cases) {
    await withLab(dir, params);
    await assert.rejects(build(dir), re, `expected ${re} for ${JSON.stringify(params).slice(0, 90)}`);
  }
});

// ---------- render gate ----------
test('render gate recomputes the sample tree Lab gains and grown tree', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const checked = render.items.find((i) => /\(tree\): root gains match/.test(i.msg));
  assert.ok(checked, render.items.map((i) => i.msg).join('\n'));
  assert.match(checked.msg, /Lab lab-\d+ \(tree\): root gains match LykeionMath\.treeSplits for 3 measure\(s\)/);
  const grown = render.items.find((i) => /\(tree\): auto-grow with /.test(i.msg));
  assert.ok(grown, render.items.map((i) => i.msg).join('\n'));
  assert.match(grown.msg, /auto-grow with (gini|entropy|error) gives the Hunt tree \(depth \d+, \d+ leaves, training error [\d.]+\)/);
  // The legend swatches are the nodes' own markup, so the legend cannot drift from the tree.
  const legend = render.items.find((i) => /\(tree\): \d+ legend swatches/.test(i.msg));
  assert.ok(legend, render.items.map((i) => i.msg).join('\n'));
  assert.match(legend.msg, /Lab lab-\d+ \(tree\): 4 legend swatches are painted exactly like the node states they name/);
  // The classify panel has to actually respond to a value change.
  const classify = render.items.find((i) => /\(tree\): classify panel/.test(i.msg));
  assert.ok(classify, render.items.map((i) => i.msg).join('\n'));
  assert.match(classify.msg, /classify panel moves the path or prediction for [1-9]\d* of \d+ attribute flips/);
  // Every edge from the root to the predicted leaf must be lit, not just the last one.
  const lit = render.items.find((i) => /\(tree\): the classified record lights/.test(i.msg));
  assert.ok(lit, render.items.map((i) => i.msg).join('\n'));
  assert.equal(lit.ok, true, lit.msg);
  assert.match(lit.msg, /Lab lab-\d+ \(tree\): the classified record lights all [1-9]\d* edges and [1-9]\d* nodes on its path/);
  // At 375px the tree either fits the column or scrolls, but its text must stay readable either way.
  const mob = render.items.find((i) => /^tree at 375px/.test(i.msg));
  assert.ok(mob, render.items.map((i) => i.msg).join('\n'));
  assert.equal(mob.ok, true, mob.msg);
});

// A project-local custom Lab can be registered under its own type name, so a broken variant is
// injected the same way the itemsets tests do it: same DOM contract, wrong numbers.
const BROKEN_TREE = [
  "Lykeion.registerLab('tree-broken', function (root, p, api) {",
  "  var H = api.H;",
  "  var measure = p.measure || 'gini';",
  "  var seg = H('div', { class: 'seg tree-measure' });",
  "  ['gini', 'entropy', 'error'].forEach(function (m) { seg.appendChild(H('button', { type: 'button', 'data-v': m }, m)); });",
  "  root.appendChild(seg);",
  "  var table = H('div', { class: 'tablewrap' }); root.appendChild(table);",
  "  var ro = H('div', { class: 'readouts' }); root.appendChild(ro);",
  "  var auto = H('button', { class: 'btn', 'data-act': 'auto' }, 'auto'); root.appendChild(auto);",
  "  function draw() {",
  "    api.setSeg(seg, measure);",
  "    var res = LykeionMath.treeSplits(p.records, p.attributes, p.class, measure, p.split);",
  "    table.innerHTML = '<table class=\"data\"><tbody>' + res.candidates.map(function (c) {",
  "      return '<tr><td>' + c.attr + '</td><td data-gain=\"' + c.attr + '\">' + (c.gain + 0.5).toFixed(4) + '</td></tr>';",
  "    }).join('') + '</tbody></table>';",
  "    var t = LykeionMath.treeGrow(p.records, p.attributes, p.class, measure, p.split);",
  "    var st = LykeionMath.treeStats(t), err = LykeionMath.treeError(t, p.records, p.class);",
  "    ro.innerHTML = '<div class=\"ro\" data-out=\"depth\"><b>' + st.depth + '</b></div>' +",
  "      '<div class=\"ro\" data-out=\"leaves\"><b>' + st.leaves + '</b></div>' +",
  "      '<div class=\"ro\" data-out=\"error\"><b>' + err.toFixed(3) + '</b></div>';",
  "  }",
  "  auto.addEventListener('click', draw);",
  "  api.onSeg(seg, function (v) { measure = v; draw(); });",
  "  draw();",
  "});",
].join('\n');

test('render gate fails, naming the Lab, when a tree Lab shows wrong gains', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-tree-broken.md'), `${FM}\`\`\`lab tree-broken\n${yaml.dump(BASE)}\`\`\`\n`);
  await mkdir(join(dir, 'labs', 'tree-broken'), { recursive: true });
  await writeFile(join(dir, 'labs', 'tree-broken', 'lab.js'), BROKEN_TREE);
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'fail');
  const mounted = Number(render.items.find((i) => /Labs mounted/.test(i.msg)).msg.match(/(\d+) Labs mounted/)[1]);
  const wrong = render.items.filter((i) => i.ok === false && new RegExp(`Lab lab-${mounted} \\(tree-broken\\)`).test(i.msg));
  assert.equal(wrong.length, 1, render.items.map((i) => `${i.ok} ${i.msg}`).join('\n'));
  assert.match(wrong[0].msg, /root gains disagree with the params/);
  assert.match(wrong[0].msg, /gini\/Weather shows [\d.]+, params give [\d.]+/);
});
