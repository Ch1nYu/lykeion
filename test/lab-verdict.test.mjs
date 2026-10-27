import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { teachingGate, loadTeachingConfig } from '../src/teaching.mjs';

// A slider-calc Lab with these inputs and verdicts, built; returns what the build recorded about its
// verdicts and the labVerdicts items of the teaching gate.
async function lab({ inputs, outputs = [{ label: 'y', expr: inputs.map((i) => i.id).join(' + ') }], verdict }) {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-verdict-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Verdict probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const params = JSON.stringify({ tag: 'LAB X', inputs, outputs, verdict });
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\n---\n\n## 1.1 A section {pages=1}\n\n\`\`\`lab slider-calc\n${params}\n\`\`\`\n`);
  await build(dir);
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  const gate = teachingGate(checks.teaching, {}, await loadTeachingConfig());
  return { found: checks.teaching.sections[0].verdicts, items: gate.items.filter((i) => i.msg.startsWith('labVerdicts')) };
}
const slider = (id, min, max, step, value) => ({ id, label: id, min, max, step, value });

test('a Lab whose verdicts follow the controls has nothing to report', async () => {
  const { found, items } = await lab({
    inputs: [slider('a', 0, 1, 0.1, 0.3)],
    verdict: [{ when: 'a == 0.3', text: '剛好。' }, { when: 'a > 0.3', text: '偏大。' }, { when: 'true', text: '偏小。' }],
  });
  assert.deepEqual(found, []);
  assert.equal(items.length, 1);
  assert.equal(items[0].ok, true);
});

test('an only verdict that is always true fails', async () => {
  const { items } = await lab({ inputs: [slider('a', 0, 1, 0.1, 0.5)], verdict: [{ when: 'true', text: '永遠這句。' }] });
  assert.equal(items[0].ok, false);
  assert.match(items[0].msg, /01-probe\.md §1\.1 Lab "LAB X": its only verdict is true at every setting/);
});

test('an always-true verdict ahead of others fails: the ones after it never show', async () => {
  const { items } = await lab({ inputs: [slider('a', 0, 1, 0.1, 0.5)], verdict: [{ when: 'a >= 0', text: '一。' }, { when: 'a > 0.5', text: '二。' }] });
  const bad = items.filter((i) => i.ok === false);
  assert.equal(bad.length, 1, items.map((i) => i.msg).join('\n'));
  assert.match(bad[0].msg, /verdict 1 \(when: "a >= 0"\) is true at every setting, so the verdict after it never shows/);
});

// The slider stops at 0.1, so "smoothing at zero" is text no reader can reach.
test('a verdict no setting reaches fails', async () => {
  const { items } = await lab({ inputs: [slider('alpha', 0.1, 2, 0.1, 1)], verdict: [{ when: 'alpha == 0', text: '平滑量為零。' }, { when: 'true', text: '有平滑。' }] });
  const bad = items.filter((i) => i.ok === false);
  assert.equal(bad.length, 1);
  assert.match(bad[0].msg, /verdict 1 \(when: "alpha == 0"\) is never true at every setting — a reader can never see it/);
});

test('a verdict pinned to the opening values of several controls is a warning', async () => {
  const { items } = await lab({
    inputs: [slider('n1', 1, 10, 1, 8), slider('n2', 1, 10, 1, 2)],
    verdict: [{ when: 'n1 == 8 && n2 == 2', text: '這是講義的例子。' }, { when: 'true', text: '其他情況。' }],
  });
  assert.ok(items.every((i) => i.ok !== false), 'warnings only');
  assert.ok(items.some((i) => i.warn && /verdict 1 .* is true only at the values the Lab opens on \(n1=8, n2=2\)/.test(i.msg)), items.map((i) => i.msg).join('\n'));
});

test('a setting where no verdict is true is a warning that names it', async () => {
  const { items } = await lab({ inputs: [slider('d', -1, 1, 0.5, 0.5)], verdict: [{ when: 'd > 0', text: '差距為正。' }, { when: 'd == 0', text: '沒有差距。' }] });
  assert.ok(items.every((i) => i.ok !== false));
  assert.ok(items.some((i) => i.warn && /no verdict is true at d=-1, so the verdict line goes blank there/.test(i.msg)), items.map((i) => i.msg).join('\n'));
});

test('a control that changes no readout and no verdict is a warning', async () => {
  const { items } = await lab({
    inputs: [slider('x', 0, 1, 0.5, 0), { ...slider('g', 0, 1, 0.5, 0.5), label: 'γ' }],
    outputs: [{ label: 'y', expr: 'x' }],
    verdict: [{ when: 'x > 0', text: '觸發。' }, { when: 'true', text: '未觸發。' }],
  });
  assert.ok(items.some((i) => i.warn && /moving "γ" changes no readout and no verdict/.test(i.msg)), items.map((i) => i.msg).join('\n'));
  assert.ok(!items.some((i) => /moving "x"/.test(i.msg)));
});

// Too many settings to try them all: the findings stand, but only as warnings, since an untried
// setting might still reach the verdict.
test('when not every setting can be tried, never-true is a warning, not a failure', async () => {
  const { items } = await lab({
    inputs: [slider('a', 0, 1000, 0.01, 5), slider('b', 0, 1, 0.5, 0)],
    verdict: [{ when: 'a == 5.005', text: '剛好。' }, { when: 'true', text: '其他。' }],
  });
  assert.ok(items.every((i) => i.ok !== false), items.map((i) => i.msg).join('\n'));
  assert.ok(items.some((i) => i.warn && /never true at every setting tried/.test(i.msg)));
});
