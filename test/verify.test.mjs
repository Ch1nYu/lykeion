import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { numericGate, coverageGate, parsePages, verify, quizReviewGate, optionTells, sourceGate, teachingReviewGate } from '../src/verify.mjs';
import { build, checkLabParams } from '../src/build.mjs';
import { ROOT, sampleCopy } from './.project.mjs';

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

// `exclude` lists the pages a scope leaves out on purpose: they are not required, they are listed with
// their reason, and a section that cites one fails.
test('coverage gate lists excluded pages with their reason and does not require them', () => {
  const scope = [{ file: 'a.pdf', pages: '1-6', exclude: [{ pages: '1-3', reason: 'AI 發展史，不屬核心邏輯' }] }];
  const cited = [{ file: 'x.md', source: 'a.pdf', num: '1.1', title: 't', pages: '4-5' }];
  const short = coverageGate(scope, cited);
  assert.equal(short.status, 'fail', 'page 6 is still uncited');
  assert.match(short.items.map((i) => i.msg).join('\n'), /uncited: 6\b/);
  assert.doesNotMatch(short.items.map((i) => i.msg).join('\n'), /uncited: [^\n]*\b[123]\b/);

  const full = coverageGate(scope, [...cited, { file: 'x.md', source: 'a.pdf', num: '1.2', title: 'u', pages: '6' }]);
  assert.equal(full.status, 'pass');
  assert.ok(full.items.some((i) => i.ok && i.msg === 'a.pdf: excluded on purpose: p.1–3 — AI 發展史，不屬核心邏輯'), full.items.map((i) => i.msg).join('\n'));
  assert.match(full.items.find((i) => i.msg.startsWith('a.pdf p.1-6')).msg, /3\/3 pages cited/);
});

test('coverage gate fails a section that cites an excluded page, an exclusion with no reason, and one outside the scope', () => {
  const scope = [{ file: 'a.pdf', pages: '1-6', exclude: [{ pages: '2', reason: '書目' }] }];
  const citesIt = coverageGate(scope, [{ file: 'x.md', source: 'a.pdf', num: '1.1', title: 't', pages: '1-3,4-6' }]);
  assert.equal(citesIt.status, 'fail');
  assert.ok(citesIt.items.some((i) => i.ok === false && i.msg === '§1.1 cites p.2, which lykeion.json excludes'), citesIt.items.map((i) => i.msg).join('\n'));

  const noReason = coverageGate([{ file: 'a.pdf', pages: '1-6', exclude: [{ pages: '6', reason: '  ' }] }], [{ file: 'x.md', source: 'a.pdf', num: '1.1', title: 't', pages: '1-5' }]);
  assert.equal(noReason.status, 'fail');
  assert.ok(noReason.items.some((i) => i.ok === false && /exclude p\.6 has no reason/.test(i.msg)));

  const outside = coverageGate([{ file: 'a.pdf', pages: '1-6', exclude: [{ pages: '7-8', reason: '參考書目' }] }], [{ file: 'x.md', source: 'a.pdf', num: '1.1', title: 't', pages: '1-6' }]);
  assert.equal(outside.status, 'fail');
  assert.ok(outside.items.some((i) => i.ok === false && /exclude p\.7-8 is outside the scope p\.1-6/.test(i.msg)));
});

test('build fails on broken TeX instead of shipping it', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-bad.md'), '---\nchapter: 3\ntitle: Bad\nsource: sample.pdf\n---\n\n## 3.1 Bad {pages=1}\n\n$\\frac{1}{$\n');
  await assert.rejects(build(dir), /TeX error/);
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

// The source check is a review of the agent's own writing. When no independent reviewer exists (no
// sub-agent tool on the host), the writing agent reviews itself — which is allowed, but the report
// must say so instead of presenting a self-review as an independent one.
const sourceCheck = (reviewer, status = 'pass') => [`STATUS: ${status}`, ...(reviewer === undefined ? [] : [`Reviewer: ${reviewer}`]), '', '## Findings', '- none', ''].join('\n');

async function sourceGateWith(text) {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'source-check.md'), text);
  return sourceGate(dir);
}

test('source gate reports an independent review as such and leaves the status alone', async () => {
  const g = await sourceGateWith(sourceCheck('independent'));
  assert.equal(g.status, 'pass');
  // A headline carries no status prefix: the report table and the console line print that already.
  assert.equal(g.headline, 'independent (from source-check.md)');
  assert.equal(g.items[0].ok, true);
});

test('source gate says in the headline when the reviewer reviewed its own writing', async () => {
  const g = await sourceGateWith(sourceCheck('self (no sub-agent tool in this host)', 'fail'));
  // `self` only changes the headline: the STATUS line still decides the gate.
  assert.equal(g.status, 'fail');
  assert.equal(g.headline, 'self-review, not independent (no sub-agent tool in this host) (from source-check.md)');
  assert.match(g.items[0].msg, /reviewed by the writing agent, not independently/);
});

// A self-review must explain why an independent reviewer was unavailable.
test('source gate fails a self-review with no reason', async () => {
  const g = await sourceGateWith(sourceCheck('self'));
  assert.equal(g.status, 'fail');
  assert.equal(g.items[0].ok, false);
  assert.match(g.items[0].msg, /Reviewer "self" needs a reason: get an independent reviewer, or write Reviewer: self \(reason\)/);
});

// A self-review can pass the gate, but the report must not print a ✓ beside it as if it were a
// verified check: `warn` paints it ⚠, the one sign this project reserves for "not quite verified".
test('source gate keeps a reasoned self-review pass a pass but warns instead of ticking it', async () => {
  const g = await sourceGateWith(sourceCheck('self (no sub-agent tool in this host)'));
  assert.equal(g.status, 'pass');
  assert.equal(g.headline, 'self-review, not independent (no sub-agent tool in this host) (from source-check.md)');
  assert.equal(g.items[0].ok, true);
  assert.equal(g.items[0].warn, true);
});

// Projects written before the Reviewer line existed must not start failing: the gate says the
// reviewer is not stated and still trusts the STATUS line.
test('source gate reports a missing Reviewer line as not stated instead of failing', async () => {
  const g = await sourceGateWith(sourceCheck(undefined));
  assert.equal(g.status, 'pass');
  assert.equal(g.headline, 'reviewer not stated (from source-check.md)');
  assert.match(g.items[0].msg, /reviewer not stated/);
  assert.equal(g.items[0].warn, true);
});

test('source gate reads the Reviewer line case-insensitively and counts disputed findings', async () => {
  const g = await sourceGateWith('STATUS: pass\nreviewer: SELF (no sub-agent tool in this host)\n\n- [disputed] x\n');
  assert.equal(g.status, 'pass');
  assert.equal(g.headline, 'self-review, not independent (no sub-agent tool in this host), 1 disputed item(s) for the user (from source-check.md)');
});

// The line belongs to the header. A `Reviewer:` quoted further down, inside a finding, is part of the
// prose being checked, not a claim about who did the checking.
test('source gate ignores a Reviewer line that is not in the header', async () => {
  const g = await sourceGateWith('STATUS: pass\n\n## Findings\n- [certain] x.md §1.1 — the header must read `Reviewer: independent`\n');
  assert.equal(g.headline, 'reviewer not stated (from source-check.md)');
});

// A present-but-unrecognised value is not the same as a missing line: say which it is, and do not
// claim independence the file never claimed.
test('source gate names an unrecognised Reviewer value instead of calling it unstated', async () => {
  const g = await sourceGateWith(sourceCheck('sub-agent'));
  assert.equal(g.status, 'pass');
  assert.match(g.headline, /reviewer "sub-agent" not recognised/);
  assert.ok(!/not stated/.test(g.headline), g.headline);
});

// One reviewer per chapter writes `<stem>-<chapter>.md`. The gate reads the parts as one review, so
// nobody has to merge them by hand, and one failing part fails it.
test('review gates read per-chapter parts as one review', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'teaching-review-01.md'), sourceCheck('independent'));
  await writeFile(join(dir, 'teaching-review-02.md'), sourceCheck('independent'));
  const pass = await teachingReviewGate(dir);
  assert.equal(pass.status, 'pass');
  assert.equal(pass.headline, 'independent (from teaching-review-01.md, teaching-review-02.md)');
  assert.equal(pass.items.length, 2);

  await writeFile(join(dir, 'teaching-review-02.md'), sourceCheck('independent', 'fail'));
  const fail = await teachingReviewGate(dir);
  assert.equal(fail.status, 'fail');
  assert.deepEqual(fail.items.map((i) => i.ok), [true, false]);
  assert.match(fail.items[1].msg, /teaching-review-02\.md/);
});

test('review gates read the merged file and its parts together, and name the weakest reviewer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'source-check.md'), sourceCheck('independent'));
  await writeFile(join(dir, 'source-check-03.md'), 'STATUS: pass\nReviewer: self (no sub-agent tool in this host)\n\n- [disputed] x\n');
  const g = await sourceGate(dir);
  assert.equal(g.status, 'pass');
  assert.equal(g.selfReview, true, 'one self-reviewed chapter makes the gate a self-review');
  assert.equal(g.headline, 'self-review, not independent (no sub-agent tool in this host), 1 disputed item(s) for the user (from source-check.md, source-check-03.md)');

  await writeFile(join(dir, 'source-check-04.md'), sourceCheck('self'));
  const bad = await sourceGate(dir);
  assert.equal(bad.status, 'fail');
  assert.match(bad.items[0].msg, /see source-check-04\.md/);
});

// After the last round the writer can only answer a review, not have it re-done. `## Fixed after review`
// tells the fixed findings (⚠) apart from the open ones (✗), but the STATUS line still decides.
test('review gates tell findings fixed after review apart from open ones, and still fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  const findings = [
    'STATUS: fail', 'Reviewer: independent', '', '## Findings',
    '- [must-fix] 03-a.md §3.6 — formula part says its name; say what it means.',
    '- [must-fix] 03-a.md §3.6 — the Lab shows nothing.',
    '- [must-fix][content] 04-b.md §4.2 — the analogy misleads.',
    '- [suggestion] 04-b.md §4.3 — tie the log term back.',
    '', '## Checked', '- 03-a.md: §3.1–3.8',
  ];
  await writeFile(join(dir, 'teaching-review.md'), [...findings, '', '## Fixed after review',
    '- 03-a.md §3.6 — the part now says 「連抽兩次的機率」 (content/03-a.md)',
    '- 04-b.md §4.2 — new analogy (content/04-b.md)', ''].join('\n'));
  const g = await teachingReviewGate(dir);
  assert.equal(g.status, 'fail', 'a fix nobody re-reviewed is not a pass');
  assert.equal(g.headline, 'independent; 2 of 3 must-fix finding(s) fixed after review, not re-reviewed (from teaching-review.md)');
  const fixed = g.items.filter((i) => i.warn && /fixed after review/.test(i.msg));
  const open = g.items.filter((i) => /still open/.test(i.msg));
  assert.equal(fixed.length, 2);
  assert.equal(open.length, 1);
  assert.equal(open[0].ok, false);
  assert.match(open[0].msg, /teaching-review\.md: \[must-fix\] 03-a\.md §3\.6 — still open/);

  // A fix line that matches no finding is a mistake the gate names.
  await writeFile(join(dir, 'teaching-review.md'), [...findings, '', '## Fixed after review', '- 03-a.md 3.6 — typo in the location', ''].join('\n'));
  const typo = await teachingReviewGate(dir);
  assert.ok(typo.items.some((i) => i.ok === false && /lists “03-a\.md 3\.6”, which matches no \[must-fix\] finding/.test(i.msg)));

  // Without the section the gate reads as before.
  await writeFile(join(dir, 'teaching-review.md'), findings.join('\n'));
  const plain = await teachingReviewGate(dir);
  assert.equal(plain.headline, 'independent (from teaching-review.md)');
  assert.equal(plain.items.length, 1);
});

// The report names how many reviews the writing agent did itself, under the gate table, and says
// nothing when every review is independent.
test('report flags self-reviewed gates under the table and stays silent when none is self-reviewed', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const flag = '⚠ 2 review(s) by the writing agent itself — not an independent check.';
  await writeFile(join(dir, 'source-check.md'), sourceCheck('self (no sub-agent tool in this host)'));
  await writeFile(join(dir, 'teaching-review.md'), sourceCheck('self (no sub-agent tool in this host)'));
  await verify(dir, { render: false });
  const selfReport = await readFile(join(dir, 'verify-report.md'), 'utf8');
  assert.ok(selfReport.includes(flag), selfReport);
  assert.ok(selfReport.indexOf(flag) < selfReport.indexOf('## numeric'), 'the line sits under the gate table');

  await writeFile(join(dir, 'source-check.md'), sourceCheck('independent'));
  await writeFile(join(dir, 'teaching-review.md'), sourceCheck('independent'));
  await verify(dir, { render: false });
  const cleanReport = await readFile(join(dir, 'verify-report.md'), 'utf8');
  assert.ok(!cleanReport.includes('by the writing agent itself'), cleanReport);
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
