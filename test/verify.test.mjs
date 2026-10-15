import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numericGate, coverageGate, parsePages, verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';

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
