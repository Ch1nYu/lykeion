import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';
import { sampleCopy } from './.project.mjs';

// Two full render gates — one on the built page, one on the same page with the skip link removed —
// which is why this probe has a file to itself.

// The sidebar is a long list of links before the content, so a keyboard reader has to Tab through
// every chapter before reaching the sheet. The skip link must be the FIRST focusable element and it
// must really move focus into `main` (not just scroll to it).
test('render gate finds a skip link that is the first stop and moves focus into the main content', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const ok = await verify(dir);
  const render = ok.gates.find((g) => g.name === 'render');
  assert.equal(render.status, 'pass', render.items.filter((i) => i.ok === false).map((i) => i.msg).join('\n'));
  const item = render.items.find((i) => /skip link/.test(i.msg));
  assert.ok(item, render.items.map((i) => i.msg).join('\n'));
  assert.equal(item.ok, true);

  // Remove the skip link from a temp copy of the built page: the gate must fail and say so.
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  const stripped = html.replace(/<a class="skip"[^>]*>[^<]*<\/a>\s*/, '');
  assert.notEqual(stripped, html, 'the built page has no skip link to remove');
  await writeFile(join(dir, 'sample.html'), stripped);
  const bad = await verify(dir);
  const badRender = bad.gates.find((g) => g.name === 'render');
  assert.equal(badRender.status, 'fail');
  assert.ok(badRender.items.some((i) => i.ok === false && /skip link/.test(i.msg)), badRender.items.map((i) => i.msg).join('\n'));
});
