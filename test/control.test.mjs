import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, rawTextErrors, yamlEscapeErrors } from '../src/build.mjs';
import { createMarkdown } from '../src/markdown.mjs';

// A TeX command that lost its backslash leaves a control character behind, and nothing downstream
// complains: `$<tab>heta$` is not maths, so KaTeX never sees it and the page prints "heta".
const project = async (body) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-control-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Control probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\n---\n\n## 1.1 A section {pages=1}\n\n${body}\n`);
  return dir;
};

test('a tab that ate the backslash of \\theta fails the build with its line', async () => {
  const dir = await project('角度 $\theta$ 很小。');
  await assert.rejects(build(dir), /01-probe\.md:8: tab before a letter in “角度 \$␉heta\$ 很小。”/);
});

test('a form feed or a bell anywhere in the file fails the build', () => {
  const errs = rawTextErrors('x.md', 'a\n$\frac{1}{2}$ and $\x07lpha$\n');
  assert.equal(errs.length, 1, 'one message per line');
  assert.match(errs[0], /^x\.md:2: control character in “\$␌rac\{1\}\{2\}\$/);
});

test('tabs in leading indentation and in code listings are left alone', () => {
  assert.deepEqual(rawTextErrors('x.md', '\tindented line\n```make\nall:\n\tcc\tmain.c\n```\n'), []);
  // A YAML block is not a listing: a tab before a letter inside it is still a lost backslash.
  assert.equal(rawTextErrors('x.md', '```formula\n{ tex: \'\theta\' }\n```\n').length, 1);
});

// YAML makes the character itself: in double quotes "\alpha" is a bell + "lpha", "\frac" a form feed.
test('a control character YAML made out of an escape fails the build, naming the key', async () => {
  const dir = await project('```lab slider-calc\ninputs: [{ id: a, label: "a", min: 0, max: 1, step: 0.1, value: 0.5 }]\noutputs: [{ label: "x", expr: "a" }]\nverdict: [{ when: "a > 0.5", text: "角度 $\\alpha$ 變大" }]\n```');
  await assert.rejects(build(dir), /01-probe\.md §1\.1: lab block: "verdict\[0\]\.text" has a control character in “角度 \$␇lpha\$ 變大”/);
});

test('yamlEscapeErrors ignores a character the source itself carries', () => {
  assert.deepEqual(yamlEscapeErrors({ t: 'a\tb' }, 't: "a\tb"', 'w'), []);
  assert.equal(yamlEscapeErrors({ t: 'a\tb' }, 't: "a\\tb"', 'w').length, 1);
});

// The opposite mistake: a single-quoted YAML string keeps both backslashes, and TeX reads `\\` as a
// line break, so `\\theta` prints the letters "theta" without any KaTeX error.
test('a doubled backslash before a TeX command is a build error', () => {
  const ctx = { errors: [], where: 'x.md §1.1' };
  createMarkdown(ctx).renderInline('角 $\\\\theta$ 與 $a \\\\ b$ 與 $\\\\\\alpha$');
  assert.equal(ctx.errors.length, 1, ctx.errors.join('\n'));
  assert.match(ctx.errors[0], /x\.md §1\.1: TeX "\\\\theta" writes \\\\theta: \\\\ is a line break/);
});
