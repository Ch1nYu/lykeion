import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdown, fenceInfo } from '../src/markdown.mjs';
import { build } from '../src/build.mjs';
import { charCount } from '../src/teaching.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const render = (src) => {
  const ctx = { errors: [], where: 'x.md §1.1' };
  return { html: createMarkdown(ctx).renderInline(src), errors: ctx.errors };
};

// CommonMark's flanking rules were written for spaces around punctuation. Chinese writes ）」。（
// directly against the emphasised run, so `**…（…）**是` would otherwise stay literal (spec item 1).
test('emphasis closes next to CJK punctuation and opens next to a CJK letter', () => {
  assert.equal(render('**向量嵌入（Vector Embeddings）**是檢索的基石').html, '<strong>向量嵌入（Vector Embeddings）</strong>是檢索的基石');
  assert.equal(render('**粗體**。').html, '<strong>粗體</strong>。');
  assert.equal(render('「**引號內**」').html, '「<strong>引號內</strong>」');
  assert.equal(render('是**（重點）**的').html, '是<strong>（重點）</strong>的');
  assert.equal(render('*斜體（x）*是').html, '<em>斜體（x）</em>是');
});

test('emphasis stays correct for plain English and for text that must not become emphasis', () => {
  assert.equal(render('a **bold** b').html, 'a <strong>bold</strong> b');
  assert.equal(render('中文（**重點**）是').html, '中文（<strong>重點</strong>）是');
  assert.equal(render('**A**（B）**C**').html, '<strong>A</strong>（B）<strong>C</strong>');
  // Unpaired markers, snake_case identifiers and multiplication stay literal.
  assert.equal(render('x**y').html, 'x**y');
  assert.equal(render('** a **').html, '** a **');
  assert.equal(render('my_var_name 與 5*3').html, 'my_var_name 與 5*3');
  // Code spans are untouched.
  assert.equal(render('`**not bold**`').html, '<code>**not bold**</code>');
});

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

const chapter = (num, title, body) => `---\nchapter: ${num}\ntitle: ${title}\nshort: t${num}\nsource: sample.pdf\n---\n\n## ${num}.1 ${title} {pages=1}\n\n${body}\n`;

// The guard: a literal `**` that survives rendering is a build error naming chapter and section,
// so this class of bug cannot ship silently again.
test('build fails, naming the chapter and section, when literal ** survives rendering', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-leak.md'), chapter(3, 'Leak', '這段有 **未關閉的粗體 標記。'));
  await assert.rejects(build(dir), /03-leak\.md §3\.1: literal \*\* left in prose/);
});

test('the literal ** guard ignores code spans, fences and maths', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-ok.md'), chapter(3, 'Ok', '用 `a ** b` 表示次方，$x ** 2$ 也可以。\n\n```python\nx = 2 ** 8\n```\n'));
  await build(dir);
});

// The plain-text label a section carries is read by toasts, the browser-facing API and the sidebar:
// it must never hold the TeX source, and never the doubled MathML marks. A formula is flattened to
// marks a reader can follow (`\sqrt{d_k}` reads as √(dk)) rather than to `dk\sqrt{d_k}`.
test('a section title with maths gives a plain-text label without TeX and without doubled marks', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-maths.md'), chapter(3, 'Maths', '內文。'));
  // Write the heading line by hand: `chapter()` puts the title in the `##` line, maths included.
  const file = join(dir, 'content', '03-maths.md');
  const src = await readFile(file, 'utf8');
  await writeFile(file, src.replace('## 3.1 Maths', '## 3.1 縮放用 $\\sqrt{d_k}$'));
  await build(dir);
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  const sec = /<section class="sec" id="s3-1"[\s\S]*?<\/section>/.exec(html)[0];
  const title = /data-title="([^"]*)"/.exec(sec)[1];
  assert.doesNotMatch(title, /\$|\\/, `the label must not carry TeX: ${title}`);
  assert.doesNotMatch(title, /dk\\?sqrt/, `the label must not double the marks: ${title}`);
  // The radical survives as a mark a reader (or a screen reader) can follow.
  assert.match(title, /√\(dk\)/);
  // The visible title still holds the rendered formula, so the page and its label cannot disagree.
  assert.match(sec, /<span class="t">縮放用 <span class="katex"><math/);
});

// ---------- code listings ----------
// A listing is a first-class part of the format: a plain fenced block with a language, an optional
// caption from `title="…"`, and no syntax highlighting (Lecture Sites must work offline).
const buildPage = async (body) => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-code.md'), chapter(3, 'Code', body));
  await build(dir);
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  // The fixture itself carries listings (02-binomial.md), so scope listing assertions to the
  // section this helper just added instead of matching the first listing on the whole page.
  const sec = /<section class="sec" id="s3-1"[\s\S]*?<\/section>/.exec(html);
  assert.ok(sec, 'the 03-code section rendered');
  return { dir, html, sec: sec[0] };
};

test('fence info splits the language from the attributes and ignores the rest', () => {
  const info = (s) => { const { lang, attrs } = fenceInfo(s); return { lang, attrs }; };
  assert.deepEqual(info('python'), { lang: 'python', attrs: {} });
  assert.deepEqual(info(''), { lang: '', attrs: {} });
  assert.deepEqual(info('python title="Top-K 查詢"'), { lang: 'python', attrs: { title: 'Top-K 查詢' } });
  assert.deepEqual(info('c++'), { lang: 'c++', attrs: {} });
  // Unknown attributes are parsed (and then ignored) so a listing copied from another tool builds.
  assert.deepEqual(info('python title="a b" start=3 linenos'), { lang: 'python', attrs: { title: 'a b', start: '3' } });
  // No language word: the whole info string is attributes, not a language named `title="x"`.
  assert.deepEqual(info('title="x"'), { lang: '', attrs: { title: 'x' } });
  // Words after the first stay words, so a block name keeps its space (`quiz 條件機率`).
  assert.deepEqual(fenceInfo('quiz 條件機率 title="x"').words, ['quiz', '條件機率']);
});

test('a fenced block keeps its language class, indentation and escaping', async () => {
  const { sec } = await buildPage('```python\ndef pmf(n, k):\n    p = 0.5\n    return comb(n, k) * p ** k  # a < b and c > d & "q"\n```\n');
  const listing = /<div class="code">[\s\S]*?<\/code><\/pre><\/div>/.exec(sec);
  assert.ok(listing, 'the fence is wrapped as a code listing');
  assert.match(listing[0], /<pre><code class="language-python">/);
  // Indentation survives: four spaces, not a stripped or re-wrapped line.
  assert.ok(listing[0].includes('\n    p = 0.5\n'), 'indentation must be preserved');
  // Code is escaped, never injected as HTML.
  assert.ok(listing[0].includes('a &lt; b and c &gt; d &amp;'), listing[0]);
  assert.ok(!listing[0].includes('a < b'), 'raw < must not reach the page inside a listing');
  // The block gets the wrapper the copy button mounts into, and no highlighting markup.
  assert.match(listing[0], /^<div class="code"><div class="code-bar"><span class="code-lang">python<\/span><\/div><pre>/);
  assert.ok(!/<span class="(hljs|token|k|kw)/.test(listing[0]), 'no syntax highlighter');
});

test('title="…" renders a caption above the block; unknown attributes are ignored', async () => {
  const { sec, html } = await buildPage('```python title="Top-K 查詢" start=5 linenos\nranks = [1, 2, 3]\n```\n');
  assert.match(sec, /<span class="code-cap">Top-K 查詢<\/span>/);
  // The caption sits in the bar, which comes before the <pre>.
  assert.ok(sec.indexOf('<span class="code-cap">Top-K 查詢</span>') < sec.indexOf('<pre><code class="language-python">'));
  assert.ok(!/start=|linenos/.test(sec), 'unknown attributes leave no trace in the listing');
});

test('block names still win over the code path, even with a title attribute', async () => {
  const { dir, html, sec } = await buildPage(
    '```note title="x"\n這是手寫註記。\n```\n\n'
    + '```calc title="x"\n- { expr: "0.3*0.4", expect: 0.12 }\n```\n\n'
    + '```quiz 只在這裡 title="x"\n- q: 一題\n  o: [a, b]\n  a: 0\n  ex: 因為 a。\n```\n\n'
    + '```python title="真的程式碼"\nx = 1\n```\n',
  );
  assert.match(sec, /<div class="note">這是手寫註記。<\/div>/);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  assert.deepEqual(checks.checks.filter((c) => c.where.startsWith('03-code.md')).map((c) => c.expr), ['0.3*0.4']);
  const levels = JSON.parse(/<script type="application\/json" id="lykeion-data">([\s\S]*?)<\/script>/.exec(html)[1]).levels;
  assert.deepEqual(levels.filter((l) => l.t === '只在這裡').map((l) => l.qs.length), [1], JSON.stringify(levels.map((l) => l.t)));
  assert.ok(!levels.some((l) => /title=/.test(l.t)), 'the title attribute must not leak into a block name');
  // Only the python fence became a listing; the three block names produced their own markup.
  assert.equal((sec.match(/<div class="code">/g) || []).length, 1);
  assert.match(sec, /<span class="code-cap">真的程式碼<\/span>/);
});

// ---------- intuition card and one-line conclusion (spec B1, B2) ----------
test('analogy renders as an intuition card with its title, and takeaway as a one-line conclusion', async () => {
  const { sec } = await buildPage(
    '```analogy 想像一罐糖果\n罐子裡有 $n$ 顆糖，每次抽一顆，抽完放回。\n```\n\n'
    + '```takeaway\n抽完放回就是「獨立」，抽完不放回就不是。\n```\n',
  );
  // The card carries its class, the title as its first line, and the body as rendered Markdown.
  assert.match(sec, /<div class="analogy"><b class="tag">想像一罐糖果<\/b><div class="body"><p>罐子裡有 <span class="katex">/);
  assert.match(sec, /<\/div><\/div>/);
  // A takeaway is prose in a block with the accent rule; the class is what styles it.
  assert.match(sec, /<div class="takeaway"><p>抽完放回就是「獨立」，抽完不放回就不是。<\/p>\n<\/div>/);
  // Neither block is a code listing, and neither leaks its fence into the page.
  assert.ok(!/```/.test(sec), 'the fence markers must not reach the page');
  assert.ok(!/<div class="code">[\s\S]*analogy/.test(sec), 'the analogy must not fall through to the code path');
});

test('analogy and takeaway keep their Markdown: emphasis, links and lists', async () => {
  const { sec } = await buildPage('```takeaway\n**重點**：不是 [複製](https://example.com)，是<mark>重建</mark>。\n```\n');
  assert.match(sec, /<div class="takeaway"><p><strong>重點<\/strong>：不是 <a href="https:\/\/example\.com">複製<\/a>，是<mark>重建<\/mark>。<\/p>/);
});

// ---------- `###` headings are linkable (spec B4) ----------
test('### headings inside a section get <section-id>-<n> ids, and a hand-written id is kept', async () => {
  const { html, sec } = await buildPage('### 第一個小節\n\n內文。\n\n<h3 id="named">第二個小節</h3>\n\n內文。\n\n#### 更深的\n\n內文。\n');
  // Numbered in document order from 1, and prefixed with the section id so two sections cannot collide.
  assert.match(sec, /<h3 id="s3-1-1">第一個小節<\/h3>/);
  // A heading that already carries an id keeps it — the build must not rename an anchor an author
  // (or a link from another section) already points at.
  assert.match(sec, /<h3 id="named">第二個小節<\/h3>/);
  // A heading that already has an id does not consume a number, so the generated ids stay contiguous.
  assert.match(sec, /<h4 id="s3-1-2">更深的<\/h4>/);
  // The ids resolve, so the sidebar links built from them are not broken.
  for (const id of ['s3-1-1', 'named', 's3-1-2']) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
});

// Only a numbered section has an id to prefix. The intro above the first `##` is shared by every
// chapter, so numbering its headings would mint the same `undefined-1` in each one.
test('a ### heading above the first section is left alone rather than given a colliding id', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-intro.md'), '---\nchapter: 3\ntitle: I\nshort: i\nsource: sample.pdf\n---\n\n### 開場\n\n內文。\n\n## 3.1 S {pages=1}\n\n### 小節\n\n內文。\n');
  await writeFile(join(dir, 'content', '04-intro.md'), '---\nchapter: 4\ntitle: J\nshort: j\nsource: sample.pdf\n---\n\n### 開場\n\n內文。\n\n## 4.1 S {pages=1}\n\n內文。\n');
  await build(dir);
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  assert.doesNotMatch(html, /id="undefined-\d"/);
  // The numbered section still numbers its own headings, so the sidebar has something to list.
  assert.match(html, /<h3 id="s3-1-1">小節<\/h3>/);
});

// ---------- the teaching record (spec B5) ----------
// `chars` is what a reader reads: no whitespace, no maths, and — for a parts formula — no YAML keys
// (`tex:`, `say:`, `hint:` are markup, not words). The gate's maxProseRun and minBlockKinds rules
// count these numbers, so a formula's YAML scaffolding must not read as prose.
test('the teaching record counts visible words, not maths or YAML keys', async () => {
  // The expected count is derived from the same strings that build the block, so the assertion
  // cannot drift when a `say` is reworded: a hand-retyped expectation is exactly how this test went
  // wrong once already.
  const says = ['左邊是我們要的純度指標。', '一減掉每一類機率的平方和：越集中，平方和越大，Gini 越小。', '求和的每一項是某一類的機率平方，把它們全部加起來。'];
  const hint = '點每一段看它在做什麼';
  const parts = [
    '```formula GINI',
    "tex: '\\mathrm{Gini} = 1 - \\sum_{i} p_{i}^{2}'",
    'parts:',
    "  - { tex: '\\mathrm{Gini}', say: '" + says[0] + "' }",
    "  - { tex: '=' }",
    "  - { tex: '1 - \\sum_{i}', say: '" + says[1] + "' }",
    "  - { tex: 'p_{i}^{2}', say: '" + says[2] + "' }",
    'hint: ' + hint,
    '```',
    '',
  ].join('\n');
  const { dir } = await buildPage([
    '```analogy 想像一罐糖果',
    '抽一顆、放回去，再抽一顆。',
    '```',
    '',
    parts,
    '這個式子是純度指標。',
    '',
    '```takeaway',
    '集中度越高，Gini 越小。',
    '```',
    '',
  ].join('\n'));
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const blocks = checks.teaching.sections.find((s) => s.id === 's3-1').blocks;
  assert.deepEqual(blocks.map((b) => b.kind), ['analogy', 'formula-parts', 'p', 'takeaway']);
  // The three `say` sentences plus the `hint`, and nothing else: not `tex:`, not `parts:`, not the TeX.
  assert.equal(blocks[1].chars, charCount(says.join('') + hint));
  // The `say` sentences *are* prose a rule must read (task E): they are where a formula is explained,
  // and a rule that skipped them would miss a page reference typed inside an explanation.
  assert.equal(blocks[1].text, [...says, hint].join(' '));
  assert.equal(blocks[0].text, '抽一顆、放回去，再抽一顆。');
  assert.equal(blocks[3].text, '集中度越高，Gini 越小。');
});

// ---------- a formula taught in parts (spec B3) ----------
// TeX is written with single-quoted YAML scalars: a double-quoted scalar reads `\frac` as an escape
// and fails to parse, so single quotes (or a block scalar) are the documented form for `tex:`.
const PARTS = [
  '```formula GINI',
  "tex: '\\mathrm{Gini} = 1 - \\sum_{i} p_{i}^{2}'",
  'parts:',
  "  - { tex: '\\mathrm{Gini}', say: '左邊是我們要的純度指標。' }",
  "  - { tex: '=' }",
  "  - { tex: '1 - \\sum_{i}', say: '一減掉每一類機率的平方和：越集中，平方和越大，Gini 越小。' }",
  "  - { tex: 'p_{i}^{2}', say: '求和的每一項是某一類的機率平方，把它們全部加起來。' }",
  'hint: 點每一段看它在做什麼',
  '```',
  '',
].join('\n');

test('a formula with parts renders clickable pieces, one explanation area, and the whole formula for AT', async () => {
  const { sec } = await buildPage(PARTS);
  // The card is the formula card, marked as the parts form, and carries its label.
  assert.match(sec, /<div class="formula parts" data-label="GINI">/);
  // Every part that has a `say` is a button; the first one starts pressed.
  const buttons = sec.match(/<button type="button" class="piece" data-part="\d" aria-pressed="(?:true|false)">/g) || [];
  assert.equal(buttons.length, 3);
  assert.match(buttons[0], /data-part="0" aria-pressed="true"/);
  assert.match(buttons[1], /data-part="2" aria-pressed="false"/);
  // Each piece is real MathML, not a TeX string, and the whole formula is rendered once more for AT.
  assert.equal((sec.match(/<math /g) || []).length, 5, 'four pieces plus the hidden whole formula');
  // ONE explanation area, every `say` pre-rendered inside it, exactly one visible at the start.
  const say = /<div class="say stack" id="s3-1-f0-say">([\s\S]*?)<\/div>\n<\/div>/.exec(sec);
  assert.ok(say, 'the explanation area is a stack');
  assert.equal((say[1].match(/<span data-part=/g) || []).length, 3, 'all say texts are rendered up front');
  assert.equal((say[1].match(/class="on"/g) || []).length, 1, 'exactly one explanation is visible');
  // The live region lets a screen reader hear the change without re-reading the formula.
  assert.match(say[1], /<span class="sr-only" aria-live="polite"><\/span>/);
  // The hint is prose, not maths.
  assert.match(sec, /<p class="hint">點每一段看它在做什麼<\/p>/);
});

test('a part with no say is rendered but is not a button', async () => {
  const { sec } = await buildPage([
    '```formula X',
    "tex: 'a + b = c'",
    'parts:',
    "  - { tex: 'a', say: '第一個量。' }",
    "  - { tex: ' + ' }",
    "  - { tex: 'b', say: '第二個量。' }",
    "  - { tex: ' = c' }",
    '```',
    '',
  ].join('\n'));
  // A piece the author did not explain is still shown, just not clickable: it is decoration, not
  // a thing to say something about.
  assert.match(sec, /<span class="piece static"><span class="katex">/);
  assert.equal((sec.match(/<button type="button" class="piece"/g) || []).length, 2);
});

test('the plain TeX body form of `formula` is unchanged', async () => {
  const { sec } = await buildPage('```formula BAYES\nP(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}\n```\n');
  // No parts wrapper, no buttons, no explanation area: exactly the block the fixture already had.
  assert.match(sec, /<div class="formula"><span class="tag">BAYES<\/span><span class="katex">/);
  assert.ok(!/class="formula parts"/.test(sec));
  assert.ok(!/aria-pressed/.test(sec));
});

const partsFormula = (tex, parts) => ['```formula X', `tex: '${tex}'`, 'parts:', ...parts.map((p) => `  - ${p}`), '```', ''].join('\n');

test('build rejects parts that do not spell the tex, and says what they spell', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-parts.md'), chapter(3, 'Parts',
    partsFormula('a + b = c', ["{ tex: 'a + b', say: '左邊。' }", "{ tex: '= d', say: '右邊。' }"])));
  await assert.rejects(build(dir), /03-parts\.md §3\.1: formula parts do not spell its tex — parts give "a\+b=d", tex is "a\+b=c"/);
});

test('build rejects a parts formula with fewer than two explained parts', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-say.md'), chapter(3, 'Say',
    partsFormula('a = b', ["{ tex: 'a', say: '左邊。' }", "{ tex: ' = b' }"])));
  await assert.rejects(build(dir), /03-say\.md §3\.1: formula parts need at least 2 parts with "say" \(found 1\)/);
});

test('build rejects a parts formula whose piece is not valid TeX', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-tex.md'), chapter(3, 'TeX',
    partsFormula('a = \\frac{1}{', ["{ tex: 'a', say: '左邊。' }", "{ tex: ' = \\frac{1}{', say: '右邊。' }"])));
  await assert.rejects(build(dir), /TeX error/);
});

test('build rejects a parts formula with fewer than two parts at all', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-one.md'), chapter(3, 'One',
    partsFormula('a', ["{ tex: 'a', say: '只有一段。' }"])));
  await assert.rejects(build(dir), /03-one\.md §3\.1: formula with parts needs at least 2 parts/);
});

// A clickable piece that is most of the formula teaches nothing the reader can take apart. The share
// is of the whole `tex` with whitespace removed: `abcdefgh` is 8 of the 10 characters of `x=abcdefgh`.
const COARSE = partsFormula('x = abcdefgh', ["{ tex: 'x', say: '左邊。' }", "{ tex: ' = ' }", "{ tex: 'abcdefgh', say: '右邊很長。' }"]);
const FINER = partsFormula('x = abcdefgh', ["{ tex: 'x', say: '左邊。' }", "{ tex: ' = ' }", "{ tex: 'abcd', say: '前半。' }", "{ tex: 'efgh', say: '後半。' }"]);

test('build rejects a clickable part that is more than half the formula, and says how to split it', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-coarse.md'), chapter(3, 'Coarse', COARSE));
  await assert.rejects(build(dir), /03-coarse\.md §3\.1: formula part "abcdefgh" is 80 % of the formula \(limit 50 %\) — split it into smaller pieces, each with its own say/);
});

test('build accepts the same formula split into pieces that are each at most half of it', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-finer.md'), chapter(3, 'Finer', FINER));
  await build(dir);
});

test('a part with no say is exempt from the share limit', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-static.md'), chapter(3, 'Static', partsFormula('x = abcdefgh', ["{ tex: 'x', say: '左邊。' }", "{ tex: ' = ', say: '等號。' }", "{ tex: 'abcdefgh' }"])));
  await build(dir);
});

test('a project can raise maxPartShare in lykeion.json, and the coarse part then builds', async () => {
  const dir = await sampleCopy();
  const config = JSON.parse(await readFile(join(dir, 'lykeion.json'), 'utf8'));
  config.teaching = { formulaParts: { maxPartShare: 0.8 } };
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify(config));
  await writeFile(join(dir, 'content', '03-coarse.md'), chapter(3, 'Coarse', COARSE));
  await build(dir);
});
