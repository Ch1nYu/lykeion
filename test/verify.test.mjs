import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { numericGate, coverageGate, parsePages, verify, quizReviewGate, optionTells } from '../src/verify.mjs';
import { build, checkLabParams } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = { compile: (e) => () => Function(`"use strict"; return (${e});`)() };

test('numeric gate fails on a wrong stated value and on a number question without calc', () => {
  const g = numericGate([
    { where: 'a', kind: 'calc', expr: '1/3', expect: 0.333, tol: 0.0015 },
    { where: 'b', kind: 'calc', expr: '1/3', expect: 0.35, tol: 0.0015 },
    { where: 'c', kind: 'quiz-missing-calc', expect: 4 },
  ], M);
  assert.equal(g.status, 'fail');
  assert.deepEqual(g.items.map((i) => i.ok), [true, false, false]);
});

test('coverage gate reports uncited pages as ranges', () => {
  const g = coverageGate([{ file: 'a.pdf', pages: '1-10' }], [
    { file: 'x.md', source: 'a.pdf', num: '1.1', title: 't', pages: '1-3,5' },
    { file: 'x.md', source: 'a.pdf', num: '1.2', title: 'u', pages: '6-8' },
  ]);
  assert.equal(g.status, 'fail');
  assert.match(g.items[0].msg, /uncited: 4, 9-10/);
  assert.deepEqual([...parsePages('2-4, 7')], [2, 3, 4, 7]);
});

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

test('build fails on broken TeX instead of shipping it', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-bad.md'), '---\nchapter: 3\ntitle: Bad\nsource: sample.pdf\n---\n\n## 3.1 Bad {pages=1}\n\n$\\frac{1}{$\n');
  await assert.rejects(build(dir), /TeX error/);
});

test('render gate catches a Lab that throws', async () => {
  const dir = await sampleCopy();
  await mkdir(join(dir, 'labs', 'boom'), { recursive: true });
  await writeFile(join(dir, 'labs', 'boom', 'lab.js'), "Lykeion.registerLab('boom', function () { throw new Error('kaboom'); });");
  await writeFile(join(dir, 'content', '03-boom.md'), '---\nchapter: 3\ntitle: Boom\nsource: sample.pdf\n---\n\n## 3.1 Boom {pages=1}\n\n```lab boom\ntitle: x\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'fail');
  assert.ok(render.items.some((i) => i.ok === false && /kaboom/.test(i.msg)));
});

test('render gate moves a slider that starts at its maximum the other way', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-max.md'), '---\nchapter: 3\ntitle: Max\nsource: sample.pdf\n---\n\n## 3.1 Max {pages=1}\n\n```lab slider-calc\ntitle: x\ninputs: [{ id: k, label: k, min: 2, max: 20, step: 1, value: 20 }]\noutputs: [{ label: r, expr: "1/log2(k)" }]\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  // The appended chapter's Lab is the last one mounted, so identify it by the gate's own Lab count
  // instead of a hardcoded index (the sample fixture gains Labs as content grows).
  const mounted = render.items.find((i) => /Labs mounted/.test(i.msg));
  assert.ok(mounted, render.items.map((i) => i.msg).join('\n'));
  const last = Number(mounted.msg.match(/(\d+) Labs mounted/)[1]);
  assert.ok(render.items.some((i) => i.ok === true && new RegExp(`Lab lab-${last} \\(slider-calc\\): slider → output changed`).test(i.msg)), render.items.map((i) => i.msg).join('\n'));
});

test('build rejects Lab parameters the Lab type does not support', () => {
  const schema = { keys: ['title', 'outputs'], items: { outputs: ['label', 'expr'] } };
  const errs = checkLabParams(schema, { type: 'table', where: 'x.md §1.1', params: { title: 't', outputs: [{ label: 'a', expr: '1', labels: {} }], colour: 'red' } });
  assert.equal(errs.length, 2);
  assert.match(errs.join('\n'), /no parameter "colour"/);
  assert.match(errs.join('\n'), /outputs\[0\] has no key "labels"/);
});

test('build rejects an unknown key inside a single-object Lab parameter', () => {
  const schema = { keys: ['title', 'range'], objects: { range: ['value', 'min', 'max'] } };
  const ok = checkLabParams(schema, { type: 'slider-calc', where: 'x.md §1.1', params: { title: 't', range: { value: 2, min: 1, max: 5 } } });
  assert.deepEqual(ok, []);
  const errs = checkLabParams(schema, { type: 'slider-calc', where: 'x.md §1.1', params: { title: 't', range: { value: 2, minimum: 1 } } });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /x\.md §1\.1: Lab "slider-calc" range has no key "minimum" \(allowed: value, min, max\)/);
  // A non-object value is left to the Lab itself, which reports it when it mounts.
  assert.deepEqual(checkLabParams(schema, { type: 'slider-calc', where: 'x.md §1.1', params: { range: 3 } }), []);
});

test('build wires a schema.objects check through for a custom Lab', async () => {
  // checkLabParams is also exercised directly above; this one proves build() reads a Lab's
  // schema.json and applies its `objects` entry, so a custom Lab author gets the error at build time.
  const dir = await sampleCopy();
  await mkdir(join(dir, 'labs', 'probe'), { recursive: true });
  await writeFile(join(dir, 'labs', 'probe', 'lab.js'), "Lykeion.registerLab('probe', function (root, p, api) { api.setVal(root.appendChild(api.H('b')), String(p.range.value)); });");
  await writeFile(join(dir, 'labs', 'probe', 'schema.json'), JSON.stringify({ keys: ['title', 'range'], objects: { range: ['value', 'min', 'max'] } }));
  await writeFile(join(dir, 'content', '03-probe.md'), '---\nchapter: 3\ntitle: Probe\nsource: sample.pdf\n---\n\n## 3.1 Probe {pages=1}\n\n```lab probe\ntitle: x\nrange: { value: 2, minimum: 1 }\n```\n');
  await assert.rejects(build(dir), /Lab "probe" range has no key "minimum" \(allowed: value, min, max\)/);
});

test('build rejects an unknown stepper chip state and lists the allowed ones', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'labs', 'stepper', 'schema.json'), 'utf8'));
  const where = 'x.md §1.1';
  const ok = checkLabParams(schema, { type: 'stepper', where, params: { steps: [{ label: 'a', chips: [{ text: 'A', state: 'good' }, { text: 'B' }] }], legend: { good: '留下' } } });
  assert.deepEqual(ok, []);
  const errs = checkLabParams(schema, { type: 'stepper', where, params: { steps: [{ label: 'a', chips: [{ text: 'A', state: 'freq' }, { text: 'B', state: 'pruned' }] }] } });
  assert.equal(errs.length, 2);
  assert.match(errs[0], /x\.md §1\.1: Lab "stepper" steps\[0\]\.chips\[0\]\.state "freq" must be one of good, bad, muted, info/);
  assert.match(errs[1], /steps\[0\]\.chips\[1\]\.state "pruned"/);
  // The legend is a single object parameter, so a key that is not a state is a build error too.
  const legendErrs = checkLabParams(schema, { type: 'stepper', where, params: { steps: [{ label: 'a' }], legend: { good: '留下', frequency: 'x' } } });
  assert.equal(legendErrs.length, 1);
  assert.match(legendErrs[0], /Lab "stepper" legend has no key "frequency" \(allowed: good, bad, muted, info\)/);
});

test('stepper legend swatches reuse the chip class, so they cannot drift from the chips', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-legend.md'), '---\nchapter: 3\ntitle: Legend\nsource: sample.pdf\n---\n\n## 3.1 Legend {pages=1}\n\n```lab stepper\ntitle: x\nlegend: { good: 留下, muted: 剪掉 }\nsteps:\n  - label: a\n    chips: [{ text: A, state: good }, { text: B, state: muted }]\n  - label: b\n    chips: [{ text: C, state: good }]\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const legend = render.items.find((i) => /stepper legend/.test(i.msg));
  assert.ok(legend, render.items.map((i) => i.msg).join('\n'));
  assert.equal(legend.ok, true);
  assert.match(legend.msg, /stepper legend: 2 swatches match the chip states they name/);
});

// A quiz block usually sits at the end of a chapter, so without `sec` every item links back to the
// chapter's last section (a §1.2 question linking to §1.4). `sec` names the section; `pages` infers it.
test('quiz items are attributed to the section they test, by sec or by pages', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-attr.md'), '---\nchapter: 3\ntitle: Attr\nshort: attr\nsource: sample.pdf\n---\n\n'
    + '## 3.1 First {pages=1-2}\n\nintro\n\n'
    + '## 3.2 Second {pages=3}\n\nintro\n\n'
    + '## 3.3 Third {pages=4}\n\nintro\n\n'
    + '```quiz attr\n'
    + '- q: explicit sec\n  o: [a, b]\n  a: 0\n  ex: x\n  sec: "3.2"\n'
    + '- q: inferred from pages\n  o: [a, b]\n  a: 0\n  ex: x\n  pages: 1\n'
    + '- q: falls back to the block\'s section\n  o: [a, b]\n  a: 0\n  ex: x\n'
    + '```\n');
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const data = JSON.parse((await readFile(join(dir, 'checks.json'), 'utf8')));
  assert.ok(data.checks.length >= 0);
  // The built page carries the section id each item links back to.
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  const levels = JSON.parse(/<script type="application\/json" id="lykeion-data">([\s\S]*?)<\/script>/.exec(html)[1]).levels;
  const lv = levels.find((l) => l.t === 'attr');
  assert.deepEqual(lv.qs.map((q) => q.sec), ['s3-2', 's3-1', 's3-3']);
  assert.equal(checks.built !== undefined, true);
});

test('build rejects a quiz sec that names no section or a section of another chapter', async () => {
  const dir = await sampleCopy();
  const withQuiz = (sec) => '---\nchapter: 3\ntitle: Bad\nshort: bad\nsource: sample.pdf\n---\n\n'
    + '## 3.1 Only {pages=1}\n\n```quiz bad\n- q: x\n  o: [a, b]\n  a: 0\n  ex: x\n  sec: "' + sec + '"\n```\n';
  await writeFile(join(dir, 'content', '03-bad.md'), withQuiz('9.9'));
  await assert.rejects(build(dir), /03-bad\.md §3\.1 quiz #1: sec "9\.9" names no section in this chapter/);
  await writeFile(join(dir, 'content', '03-bad.md'), withQuiz('1.1'));
  await assert.rejects(build(dir), /03-bad\.md §3\.1 quiz #1: sec "1\.1" is in another chapter/);
});

// Options are shuffled for the reader, so the source position of `a` says nothing — but a right
// option that is always the longest is a tell a student can exploit without understanding (spec item 3).
test('quiz review fails an item whose right option is clearly the longest', () => {
  const q = { type: 'choice', q: '哪一個是對的？', o: ['更新知識庫即可更新知識，不必重新訓練大型模型', '消除幻覺', '預測股價', '不需向量'], a: 0, sec: 's2-4' };
  const g = quizReviewGate([{ t: 'RAG 原理', qs: [q] }]);
  assert.equal(g.status, 'fail');
  assert.match(g.items[0].msg, /Quiz Level “RAG 原理” #1 \(§2\.4\) .*right option is clearly the longest/);
});

test('quiz review fails absolute-word distractors, a lone hedge and a stem echo', () => {
  const abs = { q: '關於 RAG 的敘述何者正確？', o: ['能降低幻覺的機率', '一定能消除所有幻覺', '從不需要更新資料', '能夠預測未來股價'], a: 0 };
  assert.match(optionTells(abs).join(), /2 distractors use absolute words/);
  const hedge = { q: '下列何者正確？', o: ['通常能提高準確度', '能讓模型變小', '能取代資料庫', '能加速訓練'], a: 0 };
  assert.match(optionTells(hedge).join(), /only the right option is hedged/);
  const echo = { q: '向量資料庫在檢索階段負責什麼？', o: ['在檢索階段比對向量資料庫', '把答案寫成文字', '計算訓練損失', '產生使用者問題'], a: 0 };
  assert.match(optionTells(echo).join(), /repeats the stem's wording/);
});

test('quiz review passes balanced items, numeric options and the level-wide habit check', () => {
  const fair = { q: '下列哪個元件負責檢索相似向量？', o: ['向量資料庫', '文字嵌入器', '語言生成器', '提示詞模板'], a: 0 };
  assert.deepEqual(optionTells(fair), []);
  assert.deepEqual(optionTells({ q: 'Gini 是多少？', o: ['0.444', '0.5', '1', '0.25'], a: 0 }), []);
  const ok = quizReviewGate([{ t: '公平', qs: Array.from({ length: 4 }, () => fair) }]);
  assert.equal(ok.status, 'pass');
  assert.match(ok.items[0].msg, /Quiz Level “公平”: 4 choice items, no option gives the key away/);
  // Each item only slightly longer, but the key is the longest every time: a habit the student learns.
  const slight = { q: '選哪個？', o: ['甲乙丙丁戊', '甲乙丙丁', '甲乙丙丁', '甲乙丙丁'], a: 0 };
  const habit = quizReviewGate([{ t: '習慣', qs: Array.from({ length: 4 }, () => slight) }]);
  assert.equal(habit.status, 'fail');
  assert.match(habit.items.at(-1).msg, /right option is the longest in 4\/4 items/);
});

// The sidebar is a long list of links before the content, so a keyboard reader has to Tab through
// every chapter before reaching the sheet. The skip link must be the FIRST focusable element and it
// must really move focus into `main` (not just scroll to it).
test('render gate finds a skip link that is the first stop and moves focus into the main content', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const ok = await verify(dir);
  const render = ok.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const item = render.items.find((i) => /skip link/.test(i.msg));
  assert.ok(item, render.items.map((i) => i.msg).join('\n'));
  assert.equal(item.ok, true);

  // Remove the skip link from a temp copy of the built page: the gate must fail and say so.
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  const stripped = html.replace(/<a class="skip"[^>]*>[^<]*<\/a>\s*/, '');
  assert.notEqual(stripped, html, 'the built page has no skip link to remove');
  await writeFile(join(dir, 'sample.html'), stripped);
  const bad = await verify(dir);
  const badRender = bad.gates.find((g) => g.name === 'render');
  assert.equal(badRender.status, 'fail');
  assert.ok(badRender.items.some((i) => i.ok === false && /skip link/.test(i.msg)), badRender.items.map((i) => i.msg).join('\n'));
});
