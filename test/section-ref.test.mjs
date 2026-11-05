import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';

// A `§4.5` in the text promises a section the reader can open: a `##` section or a whole chapter.
const project = async (body) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-ref-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Ref probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\n---\n\n## 1.1 First {pages=1}\n\n### 1.1.1 A numbered heading\n\n第一節。\n\n## 1.2 Second {pages=2}\n\n${body}\n`);
  return dir;
};

test('a reference to a section or a chapter of the site builds', async () => {
  await build(await project('回到 §1.1，或整章 §1。'));
});

test('a reference to a numbered ### heading fails, naming the section it sits in', async () => {
  await assert.rejects(build(await project('細節見 §1.1.1。')), /01-probe\.md §1\.2: §1\.1\.1 is a ### heading inside §1\.1, not a section the reader can open/);
});

// Real pages cite a group of sections (§4.3 over §4.3.1–§4.3.4) and another work's sections in prose,
// and the reader can follow both, so a number the site does not carry builds.
test('a number the site does not carry builds; a ### heading in a quiz still fails', async () => {
  await build(await project('整章 §1、Tan 等人第 5 章 §5.2 與 §1.5 都不檢查。'));
  const quiz = '```quiz\n- { q: "見 §1.1.1 的定義", o: ["甲", "乙"], a: 0, ex: "因為甲。" }\n```';
  await assert.rejects(build(await project(quiz)), /01-probe\.md §1\.2 quiz #1: §1\.1\.1 is a ### heading inside §1\.1/);
});

test('a ### number in an erratum ref, in code or quoted with <q> is not checked', async () => {
  await build(await project('```erratum\ntext: 講義寫反了。\nref: Ross, 10th ed., §1.1.1\n```\n\n原文寫 <q>見 §1.1.1</q>，程式在 `§1.1.1`。'));
});
