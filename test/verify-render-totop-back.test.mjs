import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';
import { sampleCopy } from './.project.mjs';

// One full render gate, on the sample with the back-to-top button's smooth scroll stretched to
// 1.2 s. On GitHub's Linux runner that scroll took longer than the 700 ms the gate used to wait
// after the click, so it read scrollY 5 and failed a page that is fine (run 41978116559).
const slowSmoothScroll = `<style>html{scroll-behavior:auto!important}</style>
<script>{
  const jump = window.scrollTo.bind(window);
  window.scrollTo = function (o, y) {
    if (!o || typeof o !== 'object' || o.behavior !== 'smooth') return jump(o, y);
    const from = window.scrollY, to = o.top ?? from, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1200);
      jump(0, from + (to - from) * k);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
}</script>
`;

test('the back-to-top check waits for the scroll back to end, not a fixed 700 ms', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const page = join(dir, 'sample.html');
  const html = await readFile(page, 'utf8');
  await writeFile(page, html.replace('</body>', `${slowSmoothScroll}</body>`));
  const r = await verify(dir);
  const render = r.gates.find((g) => g.name === 'render');
  const item = render.items.find((i) => /^back to top/.test(i.msg));
  assert.ok(item, render.items.map((i) => i.msg).join('\n'));
  assert.equal(item.ok, true, item.msg);
});
