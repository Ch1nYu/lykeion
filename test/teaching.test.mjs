import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teachingGate, loadTeachingConfig, plainText, charCount } from '../src/teaching.mjs';
import { teachingReviewGate, sourceGate, verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The gate reads the `teaching` object the build writes into checks.json. These helpers build the
// smallest object that exercises one rule, so a failure names the rule and nothing else.
const para = (text) => ({ kind: 'p', chars: charCount(text), text });
const sec = (blocks, extra = {}) => ({ id: 's1-1', num: '1.1', title: 'A section', file: '01-a.md', blocks, ...extra });
const defaults = await loadTeachingConfig();

function run(sections, { quiz = [], project = {}, config = defaults } = {}) {
  return teachingGate({ sections, quiz }, project, config);
}

const failing = (g) => g.items.filter((i) => i.ok === false);
// One rule's own items: a fixture that breaks two rules must still be able to assert on one of them.
const ruleItems = (g, rule) => g.items.filter((i) => i.msg.startsWith(`${rule}:`));
const ruleFailures = (g, rule) => ruleItems(g, rule).filter((i) => i.ok === false);

test('plainText and charCount drop maths, markup and whitespace but keep punctuation', () => {
  assert.equal(plainText('已知 $P(B) > 0$ 時，**條件機率**是 `x`。'), '已知 時，條件機率是 x。');
  assert.equal(plainText('$$P(A \\cap B) = P(A)P(B)$$'), '');
  // The lexicon patterns are written against real sentences, so `，` must survive.
  assert.equal(charCount('一，二 $x$ 三'), 4);
});

// ---------- pageRefs ----------
test('pageRefs fails body text and quiz items that point at a page, and passes prose that does not', async () => {
  const bad = run([sec([para('這個推論在講義 p.3 出現過。')])]);
  assert.equal(bad.status, 'fail');
  assert.match(failing(bad)[0].msg, /pageRefs: 01-a\.md §1\.1 p: page reference “p\.3” in “這個推論在講義 p\.3 出現過。”/);

  // Quiz stems, options and explanations are body text too.
  const quiz = run([sec([para('正常的段落。')])], { quiz: [{ where: '01-a.md §1.1 quiz #1', q: '見第 3 頁', o: ['a', 'b'], ex: '投影片 12 有圖。' }] });
  assert.equal(quiz.status, 'fail');
  assert.match(failing(quiz)[0].msg, /第 3 頁/);
  assert.match(failing(quiz)[1].msg, /投影片 12/);

  const ok = run([sec([para('這個推論在課堂上示範過。')])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'pageRefs')[0].msg, /no page references/);

  // An erratum carries a citation (`ref`) and section metadata carries the source pages: neither is
  // body text, so neither may trip the rule.
  const cited = run([sec([{ kind: 'erratum', chars: 12 }, { kind: 'p', chars: 4, text: '如上。' }])]);
  assert.equal(cited.status, 'pass');
});

// The excerpt in the message is what a writing agent searches the source file for, so a reference has
// to be reported whole: “p.1” for `p.10` would send the agent to a line that does not say it.
test('pageRefs reports the whole reference, not its first digit', async () => {
  const cases = [
    ['這個推論在講義 p.10 出現過。', 'p.10'],
    ['課本 p.14–15 有推導。', 'p.14–15'],
    ['請看 pp. 3-5 的圖。', 'pp. 3-5'],
    ['講義 12 那頁有例題。', '講義 12'],
    ['投影片 120 是總結。', '投影片 120'],
  ];
  for (const [text, ref] of cases) {
    const g = run([sec([para(text)])]);
    const msg = ruleFailures(g, 'pageRefs')[0]?.msg || '';
    assert.ok(msg.includes(`page reference “${ref}”`), `${text} → expected “${ref}”, got: ${msg}`);
  }
});

// ---------- maxParagraphChars ----------
test('maxParagraphChars fails a paragraph over the limit and passes one at the limit', async () => {
  const long = '字'.repeat(161);
  const bad = run([sec([para(long)])]);
  assert.equal(bad.status, 'fail');
  assert.match(failing(bad)[0].msg, /maxParagraphChars: 01-a\.md §1\.1: paragraph is 161 chars \(max 160\)/);

  const ok = run([sec([para('字'.repeat(160))])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'maxParagraphChars')[0].msg, /every paragraph is 160 chars or fewer/);
});

// ---------- maxProseRun ----------
test('maxProseRun fails a run of prose between two blocks and passes once a block breaks it', async () => {
  const bad = run([sec([para('字'.repeat(300)), para('字'.repeat(300))])]);
  assert.equal(bad.status, 'fail');
  assert.match(ruleFailures(bad, 'maxProseRun')[0].msg, /maxProseRun: 01-a\.md §1\.1: 600 chars of prose in a row \(max 520\)/);

  // A note, a Lab, a table — anything that is not a paragraph or a list ends the run. (Each paragraph
  // stays under maxParagraphChars, so only the run rule is under test.)
  const ok = run([sec([para('字'.repeat(150)), para('字'.repeat(150)), { kind: 'note', chars: 20, text: '提醒。' }, para('字'.repeat(150)), para('字'.repeat(150))])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'maxProseRun')[0].msg, /no run of prose exceeds 520 chars/);
});

// ---------- formulaExplained ----------
test('formulaExplained fails a formula with no prose after it, however the section ends', async () => {
  const stacked = run([sec([{ kind: 'formula', chars: 0 }, { kind: 'formula', chars: 0 }, para('說明。')])]);
  assert.match(failing(stacked)[0].msg, /formulaExplained: 01-a\.md §1\.1: the formula block is followed by another formula/);

  const heading = run([sec([{ kind: 'formula', chars: 0 }, { kind: 'h3', chars: 4, text: '下一題' }, para('說明。')])]);
  assert.match(failing(heading)[0].msg, /the formula block is followed by a heading/);

  const tail = run([sec([para('前言。'), { kind: 'display-math', chars: 0 }])]);
  assert.match(failing(tail)[0].msg, /the display-math block has no prose after it in this section/);

  // Spec C: every failure names file, section and a short excerpt. A rule that fires on a block with
  // no words of its own quotes the prose nearest to it, so the author can find the place.
  const near = run([sec([para('這個式子是貝氏定理。'), { kind: 'formula', chars: 0 }])]);
  assert.match(failing(near)[0].msg, /— near “這個式子是貝氏定理。”$/);
});

test('formulaExplained passes once prose follows, and never asks formula-parts to explain itself', async () => {
  const ok = run([sec([{ kind: 'analogy', chars: 10, text: '想像。' }, { kind: 'formula', chars: 0 }, para('這裡說的是這個式子怎麼來的。')])]);
  assert.equal(ok.status, 'pass');

  // formula-parts carries its own explanations (one per piece), so it is exempt as a subject …
  const parts = run([sec([{ kind: 'analogy', chars: 6, text: '想像。' }, { kind: 'formula-parts', chars: 0 }])]);
  assert.equal(ruleFailures(parts, 'formulaExplained').length, 0);
  // … and transparent as a neighbour: the prose after the pair is what explains them.
  const pair = run([sec([{ kind: 'analogy', chars: 6, text: '想像。' }, { kind: 'formula', chars: 0 }, { kind: 'formula-parts', chars: 0 }, para('說明。')])]);
  assert.equal(pair.status, 'pass');
});

// ---------- analogyBeforeFormula ----------
test('analogyBeforeFormula fails a section whose formula arrives before any analogy', async () => {
  const bad = run([sec([para('前言。'), { kind: 'formula', chars: 0 }, para('說明。')])]);
  assert.equal(bad.status, 'fail');
  assert.match(failing(bad)[0].msg, /analogyBeforeFormula: 01-a\.md §1\.1: the first formula arrives before any analogy/);

  const ok = run([sec([{ kind: 'analogy', chars: 20, text: '想像一罐糖果。' }, { kind: 'formula', chars: 0 }, para('說明。')])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'analogyBeforeFormula')[0].msg, /opens with an analogy/);

  // A section with no formula at all has nothing to prepare for.
  assert.equal(run([sec([para('純文字。')])]).status, 'pass');
});

// ---------- minBlockKinds ----------
test('minBlockKinds fails a long all-prose section and passes once a second kind appears', async () => {
  // Two 500-char paragraphs are 1000 chars of prose (over minChars) in one kind: the wall the rule
  // is about. maxProseRun fires on the same fixture, so each assertion names its own rule.
  const prose = [para('字'.repeat(500)), para('字'.repeat(500))];
  const bad = run([sec(prose)]);
  assert.equal(bad.status, 'fail');
  assert.match(ruleFailures(bad, 'minBlockKinds')[0].msg, /minBlockKinds: 01-a\.md §1\.1: 1000 chars of prose use 0 non-prose kind\(s\) — need 2 of/);

  const one = run([sec([...prose, { kind: 'note', chars: 20, text: '提醒。' }])]);
  assert.equal(ruleFailures(one, 'minBlockKinds').length, 1, 'one non-prose kind is not enough');

  const ok = run([sec([...prose, { kind: 'note', chars: 20, text: '提醒。' }, { kind: 'lab:stepper', chars: 0 }])]);
  assert.equal(ruleFailures(ok, 'minBlockKinds').length, 0);

  // Below minChars the rule stays out of the way: a short section may be pure prose.
  assert.equal(ruleFailures(run([sec([para('字'.repeat(500))])]), 'minBlockKinds').length, 0);

  // A bare display formula is not a teaching block: two `$$…$$` in a row must not satisfy a rule that
  // exists to make the reader look at something other than prose.
  const mathOnly = run([sec([...prose, { kind: 'display-math', chars: 0 }, { kind: 'display-math', chars: 0 }])]);
  assert.equal(ruleFailures(mathOnly, 'minBlockKinds').length, 1, 'display-math is not a counted kind');
});

// ---------- stepperShare ----------
test('stepperShare fails a site whose Labs are mostly steppers and passes at or under the share', async () => {
  const labs = (types) => [sec(types.map((t) => ({ kind: `lab:${t}`, chars: 0 })))];
  const bad = run(labs(['stepper', 'stepper', 'table']));
  assert.equal(bad.status, 'fail');
  assert.match(failing(bad)[0].msg, /stepperShare: 01-a\.md §1\.1: 2 of 3 Labs \(67%\) are steppers \(max 34%\)/);

  const ok = run(labs(['stepper', 'table', 'curve']));
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'stepperShare')[0].msg, /1 of 3 Labs are steppers/);

  // With fewer than three Labs there is no rhythm to judge.
  assert.equal(run(labs(['stepper', 'stepper'])).status, 'pass');
});

// ---------- lexicon ----------
test('lexicon fails a level:"fail" phrase and reports a level:"warn" phrase without failing', async () => {
  const bad = run([sec([para('眾所周知，這個式子很好用。')])]);
  assert.equal(bad.status, 'fail');
  const item = failing(bad)[0];
  assert.match(item.msg, /lexicon: 01-a\.md §1\.1: “眾所周知，這個式子很好用。” uses “眾所周知”/);

  const warn = run([sec([para('值得注意的是，分母不能是零。')])]);
  assert.equal(warn.status, 'pass');
  const w = warn.items.find((i) => i.warn);
  assert.equal(w.ok, null);
  assert.match(w.msg, /uses “值得注意的是”/);
  assert.match(warn.headline, /warning/);

  // A clean sentence matches nothing.
  const ok = run([sec([para('分母不能是零，所以這裡先假設它不為零。')])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'lexicon')[0].msg, /no entry of style-lexicon\.json matches/);
});

test('lexicon skips an entry written for another language', async () => {
  const config = await loadTeachingConfig();
  const en = { pattern: 'it is obvious that', why: 'say why instead', level: 'fail', lang: 'en', flags: 'i' };
  const withEn = { ...config, lexicon: [...config.lexicon, en] };
  const zh = run([sec([para('It is obvious that this holds.')])], { project: { lang: 'zh-Hant-TW' }, config: withEn });
  assert.equal(zh.status, 'pass', 'an en entry must not fire on a zh project');
  const enProject = run([sec([para('It is obvious that this holds.')])], { project: { lang: 'en' }, config: withEn });
  assert.equal(enProject.status, 'fail');
});

// ---------- project override ----------
test('a project overrides a rule, appends lexicon entries and switches shipped ones off', async () => {
  const override = await loadTeachingConfig({
    maxParagraphChars: 20,
    lexicon: [{ pattern: '本講堂', why: '不要用「本講堂」自稱。', level: 'fail', lang: 'any' }],
    lexiconOff: ['眾所周知'],
  });
  assert.equal(override.rules.maxParagraphChars, 20, 'the project value wins');
  assert.equal(override.rules.maxProseRun, 520, 'keys the project leaves alone keep their default');
  assert.ok(override.lexicon.some((e) => e.pattern === '本講堂'), 'project entries are appended');
  assert.ok(!override.lexicon.some((e) => e.pattern === '眾所周知'), 'lexiconOff removes a shipped entry');
  assert.deepEqual(override.unknown, [], 'every override key names a real rule');

  // The override reaches the gate: a 30-char paragraph fails only because the project lowered the limit.
  const text = '字'.repeat(30);
  assert.equal(run([sec([para(text)])]).status, 'pass');
  const strict = run([sec([para(text)])], { config: override });
  assert.equal(strict.status, 'fail');
  assert.match(failing(strict)[0].msg, /paragraph is 30 chars \(max 20\)/);

  // A misspelt key is reported instead of being silently ignored.
  const typo = await loadTeachingConfig({ maxParagraph: 20 });
  assert.deepEqual(typo.unknown, ['maxParagraph']);
  assert.match(failing(run([sec([para('短。')])], { config: typo }))[0].msg, /no rule "maxParagraph"/);
  // The message lists what the project may write, so the typo itself must not appear as allowed.
  assert.doesNotMatch(failing(run([sec([para('短。')])], { config: typo }))[0].msg, /allowed: [^)]*maxParagraph,/);
});

// ---------- teaching review gate (shares the source gate's mechanism) ----------
const review = (reviewer, status = 'pass') => [`STATUS: ${status}`, ...(reviewer === undefined ? [] : [`Reviewer: ${reviewer}`]), '', '## Findings', '- none', ''].join('\n');

async function reviewGateWith(text, file = 'teaching-review.md') {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  if (text !== null) await writeFile(join(dir, file), text);
  return teachingReviewGate(dir);
}

test('teaching review is pending until teaching-review.md exists', async () => {
  const g = await reviewGateWith(null);
  assert.equal(g.name, 'teaching review');
  assert.equal(g.status, 'pending');
  assert.equal(g.headline, 'awaiting agent review (references/teaching-reviewer.md)');
  assert.match(g.items[0].msg, /teaching-review\.md not found/);
});

test('teaching review reads STATUS, and warns when the writing agent reviewed itself', async () => {
  const pass = await reviewGateWith(review('independent'));
  assert.equal(pass.status, 'pass');
  assert.equal(pass.headline, 'independent (from teaching-review.md)');
  assert.equal(pass.items[0].ok, true);
  assert.equal(pass.items[0].warn, undefined);

  const self = await reviewGateWith(review('self'));
  assert.equal(self.status, 'pass', 'a self-review still passes when its STATUS says pass');
  assert.equal(self.headline, 'self-review, not independent (from teaching-review.md)');
  assert.equal(self.items[0].warn, true, 'but it is painted ⚠, not ✓');

  const fail = await reviewGateWith(review('independent', 'fail'));
  assert.equal(fail.status, 'fail');
  assert.equal(fail.items[0].ok, false);
});

// The two review gates must be one mechanism: if a future change teaches the source gate a new
// header convention, the teaching review has to inherit it, not drift.
test('teaching review and source review share one mechanism', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'teaching-review.md'), 'STATUS: pass\nreviewer: SUB-AGENT\n\n## Findings\n- none\n');
  const teaching = await teachingReviewGate(dir);
  await writeFile(join(dir, 'source-check.md'), 'STATUS: pass\nreviewer: SUB-AGENT\n\n## Findings\n- none\n');
  const source = await sourceGate(dir);
  assert.equal(teaching.headline, source.headline.replace('source-check.md', 'teaching-review.md'));
  assert.match(teaching.headline, /reviewer "sub-agent" not recognised/);
  assert.equal(teaching.items[0].warn, true);
});

// A list item's paragraph is the list, not a second block: recording both reported the same sentence
// twice in the report (once as `list`, once as `p`), which reads as two problems to fix.
test('a list is one block, so a page reference inside it is reported once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'List probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const body = [
    '---', 'chapter: 1', 'title: List', 'short: list', 'source: sample.pdf', '---', '',
    '## 1.1 清單 {pages=1}', '',
    '- 第一個要點，講義 p.10 有圖。',
    '',
    '- 第二個要點。', '',
  ].join('\n');
  await writeFile(join(dir, 'content', '01-list.md'), body);
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const kinds = checks.teaching.sections[0].blocks.map((b) => b.kind);
  assert.deepEqual(kinds, ['list'], 'the list is one block and its items are not paragraphs');
  const g = await teachingGate(checks.teaching, {}, defaults);
  const refs = ruleFailures(g, 'pageRefs');
  assert.equal(refs.length, 1, `the reference is reported once, got: ${refs.map((r) => r.msg).join(' | ')}`);
  assert.match(refs[0].msg, /page reference “p\.10”/);
  assert.match(refs[0].msg, /§1\.1 list:/, 'the block that owns the text is named as a list');
});

// ---------- plainMath ----------
// Each entry is one shape of maths typed as text: the rule's whole job is to find all five, so one
// test per pattern is only worth its name if the gate fails on that shape and passes the same
// sentence with the maths set properly.
test('plainMath fails every shape of maths typed as plain text and passes the same words set as maths', async () => {
  const shapes = [
    ['注意力用 √d_k 縮放。', /d_k/],
    ['寫成 \\sqrt{d} 才是根號。', /\\sqrt/],
    ['答案 x^2 是平方。', /x\^2/],
    ['矩陣 QKᵀ 乘上 V。', /Kᵀ/],
    ['第 x_{i} 項。', /x_\{/],
  ];
  for (const [text, hit] of shapes) {
    const g = run([sec([para(text)])]);
    assert.equal(g.status, 'fail', `expected a failure for “${text}”`);
    const fails = ruleFailures(g, 'plainMath');
    assert.equal(fails.length, 1, `one failure for “${text}”, got: ${fails.map((f) => f.msg).join(' | ')}`);
    assert.match(fails[0].msg, hit);
    // The fix instruction: name the block, quote the sentence, say what to write instead.
    assert.match(fails[0].msg, /01-a\.md §1\.1 p:/);
    assert.match(fails[0].msg, /write it as \$…\$/);
  }

  // The same words with the maths in `$…$` are already rendered, so the record carries no maths and the
  // rule has nothing to report. (The build strips maths out of `text`; this is that contract.)
  const ok = run([sec([para('注意力用縮放讓內積不要太大。'), para('答案是一個平方。')])]);
  assert.equal(ok.status, 'pass');
  assert.match(ruleItems(ok, 'plainMath')[0].msg, /no maths typed as plain text/);

  // Quiz stems, options and explanations are body text, so a typed-in vector is caught there too.
  const quiz = run([sec([para('正常的一段。')])], { quiz: [{ where: '01-a.md §1.1 quiz #1', q: '算 √d_k', o: ['1', 'QKᵀ'], ex: '記得 x^2。' }] });
  const qFails = ruleFailures(quiz, 'plainMath');
  assert.equal(qFails.length, 3, `one failure per quiz field, got: ${qFails.map((f) => f.msg).join(' | ')}`);
  assert.match(qFails.map((f) => f.msg).join(' '), /question/);
  assert.match(qFails.map((f) => f.msg).join(' '), /option 2/);
  assert.match(qFails.map((f) => f.msg).join(' '), /explanation/);
});

// ---------- numericMath ----------
// A lone number set as maths inherits the maths face, size and baseline, so it reads as a foreign word
// in the sentence. A number inside a real expression is maths and must pass.
test('numericMath fails a lone number set as maths and passes numbers inside an expression', async () => {
  const lone = ['0', '0.5', '-1', '1{,}000', '90\\%'];
  for (const src of lone) {
    const g = run([sec([{ kind: 'p', chars: 4, text: '機率是這樣。', math: [src] }])]);
    assert.equal(g.status, 'fail', `expected a failure for $${src}$`);
    const fails = ruleFailures(g, 'numericMath');
    assert.equal(fails.length, 1, `one failure for $${src}$, got: ${fails.map((f) => f.msg).join(' | ')}`);
    assert.match(fails[0].msg, /is a lone number set as maths/);
    assert.match(fails[0].msg, /§1\.1 p:/);
  }

  const expressions = ['1 - 1/n_c', '\\binom{n}{k}', 'E[X] = np', '2^{k-1}', 'P(A \\mid B)'];
  const g = run([sec([{ kind: 'p', chars: 4, text: '每一個都是真的式子。', math: expressions }])]);
  assert.equal(g.status, 'pass', g.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  assert.match(ruleItems(g, 'numericMath')[0].msg, /every number in maths is part of an expression/);
});

// Both rules are configuration, not code: a project can switch one off or change what counts as a
// number without touching the gate.
test('a project can switch plainMath off and widen what numericMath ignores', async () => {
  const typed = [sec([para('注意力用 √d_k 縮放。')])];
  const off = await loadTeachingConfig({ plainMath: false });
  const g = run(typed, { config: off });
  assert.equal(g.status, 'pass');
  assert.match(ruleItems(g, 'plainMath')[0].msg, /rule disabled/);

  // Ignoring a letter makes `np` a “number” too — the point is that the list lives in JSON, so a
  // subject that writes numbers differently can say so.
  const wide = await loadTeachingConfig({ numericMath: { ignore: '\\s|\\d|[+\\-.,%$]|[{}]|[A-Za-z]' } });
  const num = run([sec([{ kind: 'p', chars: 4, text: '式子。', math: ['np'] }])], { config: wide });
  assert.equal(num.status, 'fail');
  assert.match(ruleFailures(num, 'numericMath')[0].msg, /\$np\$/);
});

// ---------- what the record carries for these two rules ----------
test('the teaching record keeps each block’s words and the maths it sets, and leaves Lab labels alone', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Maths probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await mkdir(join(dir, 'labs', 'grow'), { recursive: true });
  await writeFile(join(dir, 'labs', 'grow', 'lab.js'), 'export function mount(el, api, p) { el.textContent = p.hint || ""; }\n');
  const body = [
    '---', 'chapter: 1', 'title: Maths', 'short: maths', 'source: sample.pdf', '---', '',
    '## 1.1 式子 {pages=1}', '',
    '這一段有 $0.5$ 與 $1 - 1/n_c$ 兩個數字。', '',
    '```formula GINI', "tex: 'G = 1'", 'parts:', "  - { tex: 'G', say: '左邊是 $0$ 的化身。' }", "  - { tex: ' = 1', say: '右邊是 $1 - 1/n_c$。' }", '```', '',
    '```lab grow', 'tag: LAB A', 'title: 一個 Lab', 'hint: 看 $E[X]$ 怎麼動。', 'label: d_k', '', 'note: 記得 QKᵀ 不對稱。', '```', '',
  ].join('\n');
  await writeFile(join(dir, 'content', '01-maths.md'), body);
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const blocks = checks.teaching.sections[0].blocks;
  const p = blocks.find((b) => b.kind === 'p');
  const parts = blocks.find((b) => b.kind === 'formula-parts');
  const lab = blocks.find((b) => b.kind === 'lab:grow');
  // `text` is the prose with the maths taken out — a rule that reads it must not see rendered formulas.
  assert.equal(p.text, '這一段有 與 兩個數字。');
  assert.deepEqual(p.math, ['0.5', '1 - 1/n_c']);
  // A parts formula carries its `say` sentences, and the maths inside them stays visible to the rules.
  assert.match(parts.text, /左邊是 的化身。/);
  assert.deepEqual(parts.math, ['0', '1 - 1/n_c']);
  // A Lab's `hint` and `note` are sentences the rules read; its `label` is a label by design.
  assert.match(lab.text, /看 怎麼動。/);
  assert.match(lab.text, /記得 QKᵀ 不對稱。/);
  assert.doesNotMatch(lab.text, /d_k/);
  assert.deepEqual(lab.math, ['E[X]']);

  // Which is exactly what the gate then says about it.
  const g = teachingGate(checks.teaching, {}, defaults);
  assert.match(ruleFailures(g, 'plainMath')[0].msg, /QKᵀ/);
  assert.match(ruleFailures(g, 'numericMath')[0].msg, /\$0\.5\$/);
});

// ---------- end to end ----------
test('the sample project builds and its teaching gate passes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await build(dir);
  const r = await verify(dir, { render: false });
  const g = r.gates.find((x) => x.name === 'teaching');
  assert.ok(g, r.gates.map((x) => x.name).join(', '));
  assert.equal(g.status, 'pass', g.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  assert.ok(r.gates.some((x) => x.name === 'teaching review'));
  // checks.json carries the data the gate reads.
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  assert.ok(checks.teaching && Array.isArray(checks.teaching.sections), 'checks.json needs teaching.sections');
  assert.ok(checks.teaching.quiz.length > 0, 'checks.json needs the quiz text');
});
