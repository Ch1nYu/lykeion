import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdown, fenceInfo } from '../src/markdown.mjs';
import { build } from '../src/build.mjs';

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
