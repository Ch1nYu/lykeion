import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';
import { sampleCopy } from './.project.mjs';

// One full render gate, on the sample with smooth scrolling switched off. The gate's scroll call
// then returns at once, as it does on GitHub's Windows runner, and a gate that read the back-to-top
// button a fixed 120 ms later caught it mid-fade (opacity ≈ 0.6) and failed a page that is fine.
// With smooth scrolling on, a local Chromium holds that call until the scroll ends (~630 ms), which
// is why a local run never showed it.
test('the back-to-top check waits for the fade, so an instant scroll is not read mid-fade', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const page = join(dir, 'sample.html');
  const html = await readFile(page, 'utf8');
  await writeFile(page, html.replace('</body>', '<style>html{scroll-behavior:auto!important}</style>\n</body>'));
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  const item = render.items.find((i) => /^back to top/.test(i.msg));
  assert.ok(item, render.items.map((i) => i.msg).join('\n'));
  assert.equal(item.ok, true, item.msg);
});
