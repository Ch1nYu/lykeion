import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdown } from '../src/markdown.mjs';
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
