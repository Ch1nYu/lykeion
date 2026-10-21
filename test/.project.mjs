// Shared by the verify and render-gate test files: the same project fixtures and the same one-shot
// gate helper, so a file split by topic does not duplicate them. The leading dot keeps node's test
// runner from collecting this file as a test of its own.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { verify } from '../src/verify.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A writable copy of the sample project: the gate tests build into it, and building must never
// touch fixtures/sample itself.
export async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

// A one-chapter project carrying exactly the markup a probe needs, built and ready to verify.
export const tiny = async (body, { labs = {} } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-render-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Render probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\nshort: probe\nsource: sample.pdf\n---\n\n## 1.1 A section {pages=1}\n\n${body}\n`);
  for (const [type, js] of Object.entries(labs)) {
    await mkdir(join(dir, 'labs', type), { recursive: true });
    await writeFile(join(dir, 'labs', type, 'lab.js'), js);
  }
  await build(dir);
  return dir;
};

// One verify run per probe; a machine without a browser cannot check rendering at all, so the test
// skips loudly rather than passing on nothing (the same contract as the other render tests).
export const renderItems = async (t, dir) => {
  const res = await verify(dir, { render: true });
  const gate = res.gates.find((g) => g.name === 'render');
  assert.ok(gate, 'the render gate ran');
  if (gate.status === 'skipped') {
    t.skip('no browser available');
    return null;
  }
  return gate.items;
};

// Insert a fragment into the built page: the way to break one promise without breaking the build (a
// stylesheet that sets text too wide, a script that labels something the way a regression would).
export const append = async (dir, fragment) => {
  const file = join(dir, 'probe.html');
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('</body>', `${fragment}\n</body>`));
};

export const find = (items, re) => items.find((i) => re.test(i.msg));
