import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teachingGate, loadTeachingConfig, plainText, charCount, markedText, unmark, termsOf } from '../src/teaching.mjs';
import { teachingReviewGate, sourceGate, verify, loadSlideText } from '../src/verify.mjs';
import { build } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The gate reads the `teaching` object the build writes into checks.json. These helpers build the
// smallest object that exercises one rule, so a failure names the rule and nothing else.
const para = (text) => ({ kind: 'p', chars: charCount(text), text });
const sec = (blocks, extra = {}) => ({ id: 's1-1', num: '1.1', title: 'A section', file: '01-a.md', blocks, calc: [], readouts: [], ...extra });
const defaults = await loadTeachingConfig();

function run(sections, { quiz = [], project = {}, config = defaults, slideText = null } = {}) {
  return teachingGate({ sections, quiz }, project, config, slideText);
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

test('lexicon skips a term that a parenthesised Latin gloss follows, and still reports plain filler', async () => {
  // A translated term with its English gloss is a term, not filler.
  const glossed = run([sec([para('從資料中萃取非顯而易見（non-trivial）的資訊。')])]);
  assert.equal(glossed.status, 'pass');
  assert.match(ruleItems(glossed, 'lexicon')[0].msg, /no entry of style-lexicon\.json matches/);
  assert.equal(run([sec([para('非顯而易見(non-trivial)的資訊。')])]).status, 'pass', 'ASCII parentheses count too');

  // Plain 顯而易見 is still a warning, and so is one followed by a parenthesis with no Latin in it.
  const plain = run([sec([para('這一步顯而易見，不必證明。')])]);
  assert.match(plain.items.find((i) => i.warn).msg, /uses “顯而易見”/);
  const cjk = run([sec([para('這一步顯而易見（很明白）。')])]);
  assert.match(cjk.items.find((i) => i.warn).msg, /uses “顯而易見”/);
});

test('lexicon names an entry whose exception is not defined instead of ignoring it', async () => {
  const config = await loadTeachingConfig({ lexicon: [{ pattern: '眾所周知', why: 'x', level: 'warn', except: ['glosed'] }] });
  const g = run([sec([para('分母不能是零。')])], { config });
  assert.equal(g.status, 'fail');
  assert.match(failing(g)[0].msg, /names exception “glosed”, which lexiconExceptions does not define/);
});

// ---------- project override ----------
test('the marketing lexicon fails a fail phrase and only warns on a warn phrase', async () => {
  const bad = run([sec([para('這三劍客各司其職，讀者一看就懂。')])]);
  assert.equal(bad.status, 'fail');
  assert.match(failing(bad)[0].msg, /uses “三劍客”/);

  const warn = run([sec([para('這個做法算是破局。')])]);
  assert.equal(warn.status, 'pass');
  assert.match(warn.items.find((i) => i.warn).msg, /uses “破局”/);
});

// ---------- codeSource ----------
// A listing as the build records it: its `from`, caption and identifiers, with no keyword filtered yet.
const listing = (over = {}) => ({ kind: 'code', chars: 10, from: null, title: null, ids: ['comb', 'pmf'], ...over });
const slidesSec = (blocks) => sec(blocks, { pages: '1' });

test('codeSource fails a listing with no from and passes one that cites a reference', () => {
  const none = run([sec([listing({ title: '計算' })])]);
  assert.equal(none.status, 'fail');
  assert.match(ruleFailures(none, 'codeSource')[0].msg, /no from — say where this code comes from/);

  const project = { references: ['Ross, *A First Course in Probability*, 10th ed.'] };
  const cited = run([sec([listing({ from: 'ross', title: '計算' })])], { project });
  assert.equal(cited.status, 'pass');

  const unknown = run([sec([listing({ from: 'Knuth', title: '計算' })])], { project });
  assert.match(ruleFailures(unknown, 'codeSource')[0].msg, /from="Knuth", which is none of/);
});

test('codeSource checks a slides listing against its section pages', () => {
  const slideText = new Map([['s1-1', 'from math import comb\npmf = comb(n, k)']]);
  const ok = run([slidesSec([listing({ from: 'slides', title: '二項' })])], { slideText });
  assert.equal(ok.status, 'pass');

  // `from` and `import` are keywords and do not count, so only `comb` and `pmf` are checked.
  const keywords = run([slidesSec([listing({ from: 'slides', ids: ['from', 'import', 'comb'] })])], { slideText });
  assert.equal(keywords.status, 'pass');

  const missing = run([slidesSec([listing({ from: 'slides', title: '二項', ids: ['comb', 'pmf', 'numpy'] })])], { slideText: new Map([['s1-1', 'comb pmf']]) });
  assert.equal(missing.status, 'pass', 'two of three identifiers is above half');

  const wrong = run([slidesSec([listing({ from: 'slides', title: '二項', ids: ['numpy', 'sklearn', 'comb'] })])], { slideText: new Map([['s1-1', 'comb']]) });
  assert.equal(wrong.status, 'fail');
  assert.match(ruleFailures(wrong, 'codeSource')[0].msg, /but 33% of its identifiers appear on pages 1 \(need 50%\); not on the slides: numpy, sklearn/);
});

test('codeSource reports a slides listing as not checkable when its page text is missing', () => {
  const g = run([slidesSec([listing({ from: 'slides', title: '二項' })])]);
  assert.equal(g.status, 'pass');
  const w = ruleItems(g, 'codeSource').find((i) => i.warn);
  assert.equal(w.ok, null);
  assert.match(w.msg, /not extracted — not checkable/);
});

test('codeSource requires 「示範」 in the title of an example listing', () => {
  const bare = run([sec([listing({ from: 'example', title: '二項 pmf' })])]);
  assert.equal(bare.status, 'fail');
  assert.match(ruleFailures(bare, 'codeSource')[0].msg, /from="example", but its title has no 「示範」/);

  const labelled = run([sec([listing({ from: 'example', title: '示範：二項 pmf' })])]);
  assert.equal(labelled.status, 'pass');
});

test('codeSource exempts output blocks', () => {
  const g = run([sec([listing({ title: '輸出', from: null, ids: ['0'] })])]);
  assert.equal(g.status, 'pass');
  assert.equal(ruleItems(g, 'codeSource').length, 1);
  assert.match(ruleItems(g, 'codeSource')[0].msg, /every code listing says where it comes from/);
});

test('loadSlideText reads the pages a section cites, found by the chapter source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await mkdir(join(dir, 'pages', 'sample'), { recursive: true });
  await writeFile(join(dir, 'pages', 'index.json'), JSON.stringify({ sources: [{ pdf: 'C:/course/sample.pdf', stem: 'sample' }] }));
  await writeFile(join(dir, 'pages', 'sample', 'p-001.txt'), 'comb pmf');
  await writeFile(join(dir, 'pages', 'sample', 'p-002.txt'), 'more');
  const map = await loadSlideText(dir, [{ id: 's1-1', source: 'sample.pdf', pages: '1-2' }, { id: 's2-1', source: 'other.pdf', pages: '1' }]);
  assert.match(map.get('s1-1'), /comb pmf[\s\S]*more/);
  assert.equal(map.has('s2-1'), false);
});

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

  const self = await reviewGateWith(review('self (no sub-agent tool in this host)'));
  assert.equal(self.status, 'pass', 'a self-review still passes when its STATUS says pass');
  assert.equal(self.headline, 'self-review, not independent (no sub-agent tool in this host) (from teaching-review.md)');
  assert.equal(self.items[0].warn, true, 'but it is painted ⚠, not ✓');
  assert.equal(self.selfReview, true);

  const fail = await reviewGateWith(review('independent', 'fail'));
  assert.equal(fail.status, 'fail');
  assert.equal(fail.items[0].ok, false);
});

// A self-review without a stated reason is not accepted: the writer must either get an independent
// reviewer or say why none was available.
test('teaching review fails a self-review that gives no reason', async () => {
  const g = await reviewGateWith(review('self'));
  assert.equal(g.status, 'fail');
  assert.equal(g.items[0].ok, false);
  assert.match(g.items[0].msg, /Reviewer "self" needs a reason/);
  assert.equal(g.selfReview, true);
});

test('teaching review with an independent reviewer is not a self-review', async () => {
  const g = await reviewGateWith(review('independent'));
  assert.equal(g.selfReview, false);
});

test('teaching review warns when the Reviewer line is missing', async () => {
  const g = await reviewGateWith(review(undefined));
  assert.equal(g.status, 'pass');
  assert.equal(g.headline, 'reviewer not stated (from teaching-review.md)');
  assert.equal(g.items[0].warn, true);
});

test('teaching review reads an independent fail and a self-review with reason', async () => {
  const self = await reviewGateWith(review('self (no sub-agent tool in this host)', 'fail'));
  assert.equal(self.status, 'fail');
  assert.equal(self.headline, 'self-review, not independent (no sub-agent tool in this host) (from teaching-review.md)');
  assert.equal(self.items[0].warn, true);
});

test('teaching review names the reason once in the headline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'teaching-review.md'), review('self (no sub-agent tool in this host)'));
  const g = await teachingReviewGate(dir);
  assert.equal(g.headline.split('no sub-agent tool in this host').length - 1, 1);
});

test('teaching review still warns for a self-review when the STATUS is a pass', async () => {
  const g = await reviewGateWith(review('self (no sub-agent tool in this host)', 'pass'));
  assert.equal(g.items[0].ok, true);
  assert.equal(g.items[0].warn, true);
  assert.equal(g.items[0].msg, 'reviewed by the writing agent, not independently — see teaching-review.md');
});

test('teaching review still pending is not a self-review', async () => {
  const g = await reviewGateWith(null);
  assert.equal(g.selfReview, undefined);
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

// ---------- plainMath in Lab labels ----------
// A Lab's labels are plain text by design, so the gate reads them on their own, with the same patterns as
// prose and one exception: a lone letter with digits (`x1`, `p2`) is a name, not maths.
const lab = (labels) => ({ kind: 'lab:slider-calc', chars: 0, labels });
test('plainMath holds Lab labels to the prose patterns and says how to write them instead', () => {
  const g = run([sec([lab(['向量維度 d_k', '除以 √d 後', 'QKᵀ'])])]);
  assert.equal(g.status, 'fail');
  const fails = ruleFailures(g, 'plainMath');
  assert.equal(fails.length, 3, `one failure per label, got: ${fails.map((f) => f.msg).join(' | ')}`);
  assert.match(fails[0].msg, /01-a\.md §1\.1 lab:slider-calc: label “向量維度 d_k” types the maths in plain text/);
  assert.match(fails[0].msg, /labels are plain text: write 「維度 d」 or 「除以根號 d」 instead of `d_k` \/ `√d`/);
  assert.match(fails[2].msg, /QKᵀ/);
});

test('plainMath lets a lone letter with digits stand in a label, but not with a subscript after it', () => {
  assert.equal(run([sec([lab(['x1', 'p2', '第 2 組'])])]).status, 'pass');
  assert.equal(run([sec([lab(['x1_k'])])]).status, 'fail', 'x1_k is still an underscore subscript');
  assert.equal(run([sec([lab(['x1^2'])])]).status, 'fail', 'x1^2 is still a caret');
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

// ---------- sayConnects ----------
// A parts formula's piece must tie to the analogy or the worked numbers. The fixtures are the smallest
// blocks the build would write: `says` is each explanation (plain text and its maths), `example` the
// digit-bearing paragraphs before the formula.
const says = (...texts) => texts.map((text) => ({ text, math: [] }));
const analogy = (title, text) => ({ kind: 'analogy', chars: charCount(text), title, text });
const parts = (label, list, example = '') => ({ kind: 'formula-parts', chars: 0, label, says: list, example });
const sayRule = (g) => ruleItems(g, 'sayConnects');

test('sayConnects fails a definitional say that ties to nothing in the analogy or the example', () => {
  // The model's own failure: a say that restates the definition while its analogy sits right above it.
  const g = run([sec([
    analogy('專案顧問媒合平台', '需求單與名片：顧問把需求單交給平台，平台依需求配對名片。'),
    parts('SOFTMAX', says('將縮放後的得分轉換為每行總和為一的注意力權重機率分布。', '在指數函數之前，把得分除以一個縮放常數。')),
  ])]);
  assert.equal(g.status, 'fail');
  const [f] = ruleFailures(g, 'sayConnects');
  assert.match(f.msg, /^sayConnects: 01-a\.md §1\.1: formula SOFTMAX has 2 of 2 explanations that do not tie/);
  assert.match(f.msg, /“將縮放後的得分轉換為每行總和為一的注意力權重機率分布。”/);
  assert.match(f.msg, /tie each piece to the analogy or the example: what it is in the analogy, or what number it takes in the example/);
});

test('sayConnects passes a candy-jar say that works through the analogy', () => {
  const g = run([sec([
    analogy('一罐糖果', '罐子裡有紅糖與藍糖，抽一顆、放回去，再抽一顆。第二次的機率不會因為第一次而改變。'),
    parts('DRAW', says('抽一顆糖、放回去之後，再抽一顆：兩次都是同一種糖的機率。', '紅糖與藍糖的比例，決定第二次抽到紅糖的機率。')),
  ])]);
  assert.equal(g.status, 'pass', failing(g).map((i) => i.msg).join('\n'));
  assert.equal(sayRule(g)[0].ok, true);
});

test('sayConnects passes a say that works through the numbers of the example', () => {
  // No analogy at all: the example is there (so the rule judges), and the digits alone make each say connect.
  const g = run([sec([
    { kind: 'p', chars: 8, text: '共有 10 次。' },
    parts('CALC', says('分子是 0.2，也就是 A 與 B 同時發生的量。', '分母是 0.4。'), '共有 10 次。'),
  ])]);
  // Only sayConnects is judged here: the fixture has no analogy, so analogyBeforeFormula fires on purpose.
  assert.equal(ruleFailures(g, 'sayConnects').length, 0);
  assert.equal(sayRule(g)[0].ok, true);
  // A number that sits in maths counts too: `$0.4$` is read from the record's maths, not from its plain text.
  const inMaths = run([sec([
    { kind: 'p', chars: 8, text: '共有 10 次。' },
    parts('CALC', [{ text: '分母是桌布的大小。', math: ['0.4'] }, { text: '分子是重疊的那塊。', math: ['0.2'] }], '共有 10 次。'),
  ])]);
  assert.equal(ruleFailures(inMaths, 'sayConnects').length, 0);
  assert.equal(sayRule(inMaths)[0].ok, true);
});

test('sayConnects ties a say to the worked example before the formula', () => {
  // No analogy: the paragraph before the formula is the example, and the say shares a word with it.
  const g = run([sec([
    { kind: 'p', chars: 12, text: '抽出的紅糖有 3 顆。' },
    parts('EX', says('紅糖的比例決定答案。', '把資料轉換為分布。'), '抽出的紅糖有 3 顆。'),
  ])]);
  assert.equal(ruleFailures(g, 'sayConnects').length, 0);
  assert.equal(sayRule(g)[0].ok, true);
});

test('sayConnects does not let a stop term count as a connection', () => {
  // Every shared word here is generic: 這個、公式、的、機率、表示、我們、計算、結果.
  const g = run([sec([
    analogy('公式的機率', '這個公式的機率是我們的計算結果。'),
    parts('GENERIC', says('這個公式表示的機率。', '我們的計算結果。')),
  ])]);
  assert.equal(g.status, 'fail');
  assert.equal(ruleFailures(g, 'sayConnects')[0].ok, false);
  assert.match(ruleFailures(g, 'sayConnects')[0].msg, /2 of 2 explanations/);

  // The term extraction itself: stop terms are gone, and a real word still shows.
  const stop = defaults.rules.sayConnects.stopTerms;
  const terms = termsOf('這個公式的機率：桌布 the rate', stop);
  assert.ok(terms.has('桌布'));
  assert.ok(terms.has('rate'));
  for (const t of ['機率', '公式', '這個', 'the']) assert.equal(terms.has(t), false, `${t} should not count`);
});

test('sayConnects reports ⚠ for a section with neither an analogy nor worked numbers, and does not fail on it', () => {
  const g = run([sec([parts('BARE', says('將資料轉換為機率分布。', '把它整理成一張表。'))])]);
  assert.equal(ruleFailures(g, 'sayConnects').length, 0, 'a warning never fails the gate');
  const [w] = sayRule(g);
  assert.equal(w.ok, null);
  assert.equal(w.warn, true);
  assert.match(w.msg, /formula BARE has no analogy and no worked numbers before it — cannot judge/);
});

test('sayConnects threshold is a project override, and the override keeps the stop terms', async () => {
  // One of two says ties (桌布), the other does not: 50% passes the default and fails a stricter project.
  const blocks = [analogy('桌布', '桌布以內。'), parts('HALF', says('桌布上那一塊。', '將資料轉換為分布。'))];
  assert.equal(run([sec(blocks)]).status, 'pass');
  const strict = await loadTeachingConfig({ sayConnects: { minShare: 0.8 } });
  assert.equal(strict.rules.sayConnects.minShare, 0.8);
  assert.ok(strict.rules.sayConnects.stopTerms.includes('機率'), 'a partial override keeps the stop terms');
  const g = run([sec(blocks)], { config: strict });
  assert.equal(g.status, 'fail');
  assert.match(ruleFailures(g, 'sayConnects')[0].msg, /need 80%/);
});

// ---------- what the record carries for these two rules ----------
test('the teaching record keeps each block’s words and the maths it sets, and keeps Lab labels apart from its prose', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Maths probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await mkdir(join(dir, 'labs', 'grow'), { recursive: true });
  await writeFile(join(dir, 'labs', 'grow', 'lab.js'), 'export function mount(el, api, p) { el.textContent = p.hint || ""; }\n');
  const body = [
    '---', 'chapter: 1', 'title: Maths', 'short: maths', 'source: sample.pdf', '---', '',
    '## 1.1 式子 {pages=1}', '',
    '這一段有 $0.5$ 與 $1 - 1/n_c$ 兩個數字。', '',
    '```formula GINI', "tex: 'G = 1'", 'parts:', "  - { tex: 'G', say: '左邊是 $0$ 的化身。' }", "  - { tex: ' = ' }", "  - { tex: '1', say: '右邊是 $1 - 1/n_c$。' }", '```', '',
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
  // The labels are recorded on their own, as typed, for the plainMath gate.
  assert.deepEqual(lab.labels, ['d_k']);

  // Which is exactly what the gate then says about it.
  const g = teachingGate(checks.teaching, {}, defaults);
  assert.match(ruleFailures(g, 'plainMath')[0].msg, /QKᵀ/);
  assert.match(ruleFailures(g, 'plainMath').map((f) => f.msg).join(' '), /label “d_k” types the maths in plain text/);
  assert.match(ruleFailures(g, 'numericMath')[0].msg, /\$0\.5\$/);
});

// ---------- proseNumbers ----------
// A prose paragraph whose `<q>…</q>` marks are kept, as the build records it (`marked`) when there are any.
const quoted = (src) => {
  const marked = markedText(src);
  return { kind: 'p', chars: charCount(src), text: unmark(marked), marked };
};
// The section's own numbers: its calc expects and its Lab readouts at their defaults.
const withNumbers = ({ calc = [], readouts = [] } = {}) => ({ calc: calc.map((expect) => ({ expr: String(expect), expect, note: '' })), readouts });
const calcOf = (expect) => ({ calc: [{ expr: String(expect), expect, note: '' }] });
const readout = (value, lab = 'LAB A', label = 'P(A∩B)') => ({ lab, label, value });

test('proseNumbers passes a decimal that a calc gives at the precision written', () => {
  const g = run([sec([para('後驗機率約為 0.083，比盛行率高很多。')], calcOf(0.083))]);
  assert.equal(g.status, 'pass', failing(g).map((i) => i.msg).join('\n'));
  assert.match(ruleItems(g, 'proseNumbers')[0].msg, /matches a calc or a Lab readout/);
  // The same sentence with a different figure is a contradiction the gate must name.
  const off = run([sec([para('後驗機率約為 0.084，比盛行率高很多。')], calcOf(0.083))]);
  assert.equal(ruleFailures(off, 'proseNumbers').length, 1);
  assert.match(ruleFailures(off, 'proseNumbers')[0].msg, /0\.084/);
});

test('proseNumbers passes a percentage that a Lab readout gives, as a percentage or as a fraction', () => {
  // 0.42 at its default input is 42.0 %; the prose says it in the same form.
  const g = run([sec([para('在預設值下，權重是 42.0%。')], withNumbers({ readouts: [readout(0.42)] }))]);
  assert.equal(g.status, 'pass', failing(g).map((i) => i.msg).join('\n'));
  // A Lab readout also reads as a percentage when the prose writes the fraction's percent form.
  const pct = run([sec([para('權重是 42%。')], withNumbers({ readouts: [readout(0.4201)] }))]);
  assert.equal(pct.status, 'pass', failing(pct).map((i) => i.msg).join('\n'));
});

test('proseNumbers fails the 90 % paragraph and names the closest Lab readout', () => {
  // The incident: the slide's 90 / 7 / 3 % were copied, while the Lab opened on the slide's scores and showed 99.954 %.
  const text = '轉換後給予蘋果 90%、它自己 7%、好吃 3%。';
  const g = run([sec([para(text)], withNumbers({ readouts: [readout(0.99954, 'LAB B', '給「蘋果」的權重')] }))]);
  assert.equal(g.status, 'fail');
  const msgs = ruleFailures(g, 'proseNumbers').map((i) => i.msg);
  assert.equal(msgs.length, 3, 'each of the three figures is reported once');
  assert.match(msgs[0], /§1\.1 p: “90%” in “[^”]*轉換後給予蘋果 90%/);
  assert.match(msgs[0], /closest Lab readout at default: 99\.954 % \(LAB B 給「蘋果」的權重\)/);
  assert.match(msgs[0], /compute it with a `calc`, show it in the Lab, or mark the slide's figure with <q>/);
});

test('proseNumbers exempts a number inside <q> and never exempts the words around it', () => {
  const quotedOnly = run([sec([quoted('講義寫 <q>90%</q>，我們算的是 0.5。')], calcOf(0.5))]);
  assert.equal(quotedOnly.status, 'pass', failing(quotedOnly).map((i) => i.msg).join('\n'));
  // Without the marks the same figure is an unsupported claim.
  const bare = run([sec([para('講義寫 90%，我們算的是 0.5。')], calcOf(0.5))]);
  assert.equal(ruleFailures(bare, 'proseNumbers').length, 1);
  assert.match(ruleFailures(bare, 'proseNumbers')[0].msg, /“90%”/);
  // A decimal outside the quotation still has to be computed.
  const outside = run([sec([quoted('講義寫 <q>90%</q>，我們算的是 0.6。')], calcOf(0.5))]);
  assert.match(ruleFailures(outside, 'proseNumbers')[0].msg, /“0\.6”/);
});

test('proseNumbers ignores integers, years and versions, and the project can ignore more', async () => {
  const g = run([sec([para('第 2 步有 3 個分支，2024 年的版本是 0.2.1，見 §3.1。')])]);
  assert.equal(g.status, 'pass', failing(g).map((i) => i.msg).join('\n'));

  // A decimal that is not a calc is still caught when no ignore pattern covers it.
  const plain = run([sec([para('在第 3.1 節說明。')])]);
  assert.match(ruleFailures(plain, 'proseNumbers')[0].msg, /“3\.1”/);
  const override = await loadTeachingConfig({ proseNumbers: { ignore: ['3\\.1 節'] } });
  assert.equal(run([sec([para('在第 3.1 節說明。')])], { config: override }).status, 'pass');
  assert.deepEqual(override.unknown, []);
  // Switched off, the rule says nothing at all.
  const off = await loadTeachingConfig({ proseNumbers: false });
  assert.equal(ruleItems(run([sec([para('後驗機率約為 0.084。')])], { config: off }), 'proseNumbers').length, 0);
});

test('proseNumbers reads a decimal at the precision written, rounded or truncated', () => {
  // 0.4449 truncates to 0.444 (the slide's style) and rounds to 0.445: both readings are accepted.
  const truncated = run([sec([para('權重為 0.444。')], calcOf(0.4449))]);
  assert.equal(truncated.status, 'pass', failing(truncated).map((i) => i.msg).join('\n'));
  // 0.4444 at two places is 0.44, but 0.45 is not a reading of it.
  assert.equal(run([sec([para('權重為 0.44。')], calcOf(0.4444))]).status, 'pass');
  assert.equal(run([sec([para('權重為 0.45。')], calcOf(0.4444))]).status, 'fail');
  // A percentage's precision is the percent's: 44.4% reads 0.4444 and 0.4449 alike.
  assert.equal(run([sec([para('占 44.4%。')], calcOf(0.4449))]).status, 'pass');
});

test('proseNumbers asks for a build, not a list of failures, when checks.json predates the numeric record', () => {
  const old = sec([para('後驗機率約為 0.084。')]);
  delete old.calc;
  delete old.readouts;
  const g = run([old]);
  assert.equal(g.status, 'pass');
  assert.equal(ruleFailures(g, 'proseNumbers').length, 0);
  assert.match(ruleItems(g, 'proseNumbers')[0].msg, /run "lykeion build" again/);
});

test('proseNumbers checks a quiz explanation against the section the item links to', () => {
  const quiz = [{ where: '01-a.md §1.2 quiz #1', q: '承上', o: ['a', 'b'], ex: '事後機率只有約 8.3%。', sec: 's1-1' }];
  // The linked section's calc gives 8.3 %.
  const linked = run([sec([para('正文。')], calcOf(0.083))], { quiz });
  assert.equal(ruleFailures(linked, 'proseNumbers').length, 0);
  // Nothing in the linked section gives it, even though another section's calc does.
  const other = run([sec([para('正文。')], { id: 's1-2', num: '1.2', ...calcOf(0.083) }), sec([para('正文。')])], { quiz });
  assert.match(ruleFailures(other, 'proseNumbers')[0].msg, /quiz #1 explanation: “8\.3%”/);
});

test('the teaching record holds each built-in Lab readout at its default inputs and each calc expect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Readouts probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const body = [
    '---', 'chapter: 1', 'title: Readouts', 'short: readouts', 'source: sample.pdf', '---', '',
    '## 1.1 讀數 {pages=1}', '',
    '講義寫 <q>90%</q>，我們算出 0.12。', '',
    '```calc', '- { expr: "0.3*0.4", expect: 0.12 }', '```', '',
    '```lab slider-calc', 'tag: LAB A', 'title: 滑桿', 'inputs:', '  - { id: pa, label: "P(A|B)", min: 0, max: 1, step: 0.05, value: 0.3 }',
    'outputs:', '  - { label: "P(A∩B)", expr: "pa * 0.4" }', '```', '',
    '```lab table', 'tag: LAB B', 'title: 表', 'names: [[k, nk], [x, y]]', 'rows: [成功, 失敗]', 'cols: [次數, 補數]', 'values: [[2, 8], [0, 0]]',
    'outputs: [{ label: "P(X=k)", expr: "k / (k + nk)" }]', '```', '',
    '```lab curve', 'tag: LAB C', 'title: 曲線', 'x: { label: k, min: 0, max: 20 }', 'curves: [{ label: "p = 0.5", expr: "x / 10" }]', 'marker: { label: k, value: 4 }', '```', '',
  ].join('\n');
  await writeFile(join(dir, 'content', '01-readouts.md'), body);
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const s = checks.teaching.sections[0];
  assert.deepEqual(s.calc.map((c) => c.expect), [0.12]);
  assert.deepEqual(s.readouts.map((r) => [r.lab, r.label, Math.round(r.value * 1000) / 1000]), [
    ['LAB A', 'P(A∩B)', 0.12], ['LAB B', 'P(X=k)', 0.2], ['LAB C', 'p = 0.5', 0.4],
  ]);
  // The quotation keeps its marks for the rule, and the words every other rule reads have none.
  const p = s.blocks.find((b) => b.kind === 'p');
  assert.equal(p.text, '講義寫 90%，我們算出 0.12。');
  assert.match(p.marked, /90%/);
  const g = teachingGate(checks.teaching, {}, defaults);
  assert.equal(ruleFailures(g, 'proseNumbers').length, 0, ruleFailures(g, 'proseNumbers').map((i) => i.msg).join('\n'));
});

// The sayConnects rule reads what the build records: a parts formula's label, its explanations in order
// (maths kept apart), and the digit paragraphs before it; an analogy's title is part of its words.
test('the teaching record carries a parts formula’s explanations and worked example, and an analogy’s title', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Tie probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const body = [
    '---', 'chapter: 1', 'title: Tie', 'short: tie', 'source: sample.pdf', '---', '',
    '## 1.1 連結 {pages=1}', '',
    '```analogy 一罐糖果', '罐子裡有紅糖與藍糖。', '```', '',
    '這一段沒有數字，只講紅糖。', '',
    '抽一顆糖的機率是 $0.5$，共有 3 次。', '',
    '```formula CANDY', "tex: 'P = \\frac{a}{b}'", 'parts:', "  - { tex: 'P', say: '左邊是紅糖的比例。' }", "  - { tex: ' = ' }", "  - frac:", "      num: [ { tex: 'a', say: '分子是 $0.2$ 的那一塊。' } ]", "      den: [ { tex: 'b' } ]", "    say: '整個分數。'", '```', '',
  ].join('\n');
  await writeFile(join(dir, 'content', '01-tie.md'), body);
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const blocks = checks.teaching.sections[0].blocks;
  const analogyBlock = blocks.find((b) => b.kind === 'analogy');
  const prose = blocks.find((b) => b.kind === 'p' && /機率/.test(b.text));
  const formula = blocks.find((b) => b.kind === 'formula-parts');
  assert.equal(analogyBlock.title, '一罐糖果');
  assert.equal(formula.label, 'CANDY');
  // Explanations in reading order: the piece, then the fraction's own say, then its numerator's.
  assert.deepEqual(formula.says, [
    { text: '左邊是紅糖的比例。', math: [] },
    { text: '整個分數。', math: [] },
    { text: '分子是 的那一塊。', math: ['0.2'] },
  ]);
  // Only the digit paragraph is worked example; the paragraph without a digit is left out.
  assert.equal(prose.text, '抽一顆糖的機率是 ，共有 3 次。');
  assert.equal(formula.example, '抽一顆糖的機率是 ，共有 3 次。');
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
