import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';
import { sampleCopy } from './.project.mjs';

// One full render gate: a stepper legend must reuse the chip class, so a swatch cannot drift away
// from the chip state it explains.

test('stepper legend swatches reuse the chip class, so they cannot drift from the chips', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-legend.md'), '---\nchapter: 3\ntitle: Legend\nsource: sample.pdf\n---\n\n## 3.1 Legend {pages=1}\n\n```lab stepper\ntitle: x\nlegend: { good: 留下, muted: 剪掉 }\nsteps:\n  - label: a\n    chips: [{ text: A, state: good }, { text: B, state: muted }]\n  - label: b\n    chips: [{ text: C, state: good }]\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const legend = render.items.find((i) => /stepper legend/.test(i.msg));
  assert.ok(legend, render.items.map((i) => i.msg).join('\n'));
  assert.equal(legend.ok, true);
  assert.match(legend.msg, /stepper legend: 2 swatches match the chip states they name/);
});
