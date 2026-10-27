import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { labStates, formatLabs } from '../src/labs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// `lykeion labs` is for a reviewer who cannot move a slider: it must say what each Lab shows at the
// settings a reader tries first, in the words and numbers the page shows.
test('labs lists every Lab of the sample with its readouts and verdict per state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-labs-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await build(dir);
  const labs = await labStates(dir);
  assert.equal(labs.length, 6, 'the sample has six Labs');

  const a = labs.find((l) => l.tag === 'LAB A');
  assert.equal(a.type, 'slider-calc');
  assert.deepEqual(a.states.map((s) => s.name), ['opening', 'pa at min', 'pa at max']);
  const opening = a.states[0];
  assert.deepEqual(opening.inputs, { pa: 0.3 });
  assert.equal(opening.readouts[0].text, '0.120', 'a readout is written as the page writes it');
  assert.equal(opening.readouts.find((r) => r.label === '判準').text, '不獨立或負相關', 'labels replace exact values');
  assert.match(opening.verdict, /此時 A 與 B 獨立/);
  assert.match(a.states[2].verdict, /^P\(A\|B\) > P\(A\)/);

  const text = formatLabs(labs);
  assert.match(text, /^01-conditional\.md §1\.1 — LAB A /m);
  assert.match(text, /^ {2}pa at max \(pa=1\): P\(A∩B\) 0\.400/m);
});

test('labs marks a Lab whose verdict never changes, and a blank verdict line', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-labs-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Labs probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const lab = (p) => `\`\`\`lab slider-calc\n${JSON.stringify(p)}\n\`\`\``;
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\n---\n\n## 1.1 A section {pages=1}\n\n${lab({
    tag: 'LAB S', inputs: [{ id: 'g', label: 'γ', min: 0, max: 1, step: 0.5, value: 0.5 }], outputs: [{ label: 'y', expr: '1' }], verdict: [{ when: 'true', text: '永遠這句。' }],
  })}\n\n${lab({
    tag: 'LAB B', inputs: [{ id: 'd', label: 'd', min: -1, max: 1, step: 0.5, value: 0.5 }], outputs: [{ label: 'd', expr: 'd' }], verdict: [{ when: 'd > 0', text: '差距為正。' }],
  })}\n`);
  await build(dir);
  const labs = await labStates(dir);
  assert.match(labs[0].note, /the verdict is the same in every state/);
  assert.equal(labs[1].states.find((s) => s.name === 'd at min').verdict, null);
  assert.match(formatLabs(labs), /verdict: \(none — the verdict line is blank\)/);
});
