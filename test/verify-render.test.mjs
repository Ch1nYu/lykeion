import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';
import { sampleCopy } from './.project.mjs';

// Full render gates on the sample project. A gate costs the same on a tiny project as on the sample
// — it opens the page, walks every view at both widths and drives every control — so the two probes
// that need one live here, and the gate-free checks stay in verify.test.mjs.

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

test('render gate moves a slider that starts at its maximum the other way', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-max.md'), '---\nchapter: 3\ntitle: Max\nsource: sample.pdf\n---\n\n## 3.1 Max {pages=1}\n\n```lab slider-calc\ntitle: x\ninputs: [{ id: k, label: k, min: 2, max: 20, step: 1, value: 20 }]\noutputs: [{ label: r, expr: "1/log2(k)" }]\n```\n');
  await build(dir);
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  // The appended chapter's Lab is the last one mounted, so identify it by the gate's own Lab count
  // instead of a hardcoded index (the sample fixture gains Labs as content grows).
  const mounted = render.items.find((i) => /Labs mounted/.test(i.msg));
  assert.ok(mounted, render.items.map((i) => i.msg).join('\n'));
  const last = Number(mounted.msg.match(/(\d+) Labs mounted/)[1]);
  assert.ok(render.items.some((i) => i.ok === true && new RegExp(`Lab lab-${last} \\(slider-calc\\): slider → output changed`).test(i.msg)), render.items.map((i) => i.msg).join('\n'));
});
