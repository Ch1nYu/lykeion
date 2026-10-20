import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { shots, run } from '../src/shots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// `lykeion shots` is the one command whose output is looked at rather than asserted on, so its tests
// check what a reviewer would: the file set is exactly chapters × themes × widths, each file is a real
// PNG, the pixel size is the width that was asked for, and the capture is taller than the screen (a
// blank page is exactly one viewport tall, a chapter is not).

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A PNG is signature, then IHDR: 4-byte length, 'IHDR', width, height (big-endian), bit depth, colour type…
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const png = async (file) => {
  const buf = await readFile(file);
  assert.deepEqual(buf.subarray(0, 8), PNG_SIG, `${file} is a PNG`);
  return { buf, ...pngSize(buf) };
};

const WIDTHS = { mobile: 375, desktop: 1280 };
const HEIGHTS = { mobile: 760, desktop: 900 };

const sampleCopy = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-shots-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  await build(dir);
  return dir;
};

// One chapter, long enough to be taller than the screen: the shape most projects start as.
const tiny = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-shots-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Shots probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const filler = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 段內文，用來把這一章拉得比一個螢幕還長。`).join('\n\n');
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\nshort: probe\nsource: sample.pdf\n---\n\n## 1.1 A section {pages=1}\n\n${filler}\n`);
  await build(dir);
  return dir;
};

test('shots writes one full-page PNG per chapter, theme and viewport', async (t) => {
  const dir = await sampleCopy();
  const res = await shots(dir);
  // A machine without a browser cannot render anything at all: skip loudly, as the render tests do.
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  assert.equal(res.ok, true, res.message);

  // The file name is the chapter's content-file stem: the one identifier the project already has.
  const slugs = (await readdir(join(dir, 'content'))).filter((f) => f.endsWith('.md')).sort().map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(slugs, ['01-conditional', '02-binomial'], 'the fixture has two chapters');
  const want = slugs.flatMap((s) => ['light', 'dark'].flatMap((theme) => Object.keys(WIDTHS).map((vp) => `${s}.${theme}.${vp}.png`)));

  assert.equal(res.outDir, join(dir, 'shots'), 'the default output is <project>/shots');
  assert.deepEqual((await readdir(res.outDir)).sort(), want.sort(), 'exactly the expected files, nothing else');
  assert.equal(res.files.length, want.length);
  assert.match(res.message, new RegExp(`\\b${want.length}\\b`), 'the summary line counts the images');
  assert.ok(res.message.includes(res.outDir), 'the summary line names the output dir');

  for (const name of want) {
    const [, , theme, vp] = /^(.*)\.(light|dark)\.(mobile|desktop)\.png$/.exec(name);
    const file = join(res.outDir, name);
    const { buf, w, h } = await png(file);
    assert.ok(buf.length > 1000, `${name} is not an empty image (${buf.length} bytes)`);
    assert.equal(w, WIDTHS[vp], `${name} was captured ${WIDTHS[vp]}px wide`);
    assert.ok(h > HEIGHTS[vp], `${name} is a full-page capture, taller than the ${HEIGHTS[vp]}px screen (${h}px)`);
    // The theme really switched: the same chapter at the same width cannot produce identical pixels.
    if (theme === 'dark') {
      const slug = slugs.find((s) => name.startsWith(s));
      const light = await readFile(join(res.outDir, `${slug}.light.${vp}.png`));
      assert.notDeepEqual(buf, light, `${name} differs from its light twin — the theme was applied`);
    }
    // The chapter really switched: a capture named for the second chapter must not be the first one
    // again, which is what a stale view (the page still showing the previous chapter) would produce.
    if (slugs.length > 1 && slugs.indexOf(slugs.find((s) => name.startsWith(s))) > 0) {
      const prev = await readFile(join(res.outDir, name.replace(/^.*?\./, `${slugs[0]}.`)));
      assert.notDeepEqual(buf, prev, `${name} differs from the previous chapter — the view was switched`);
    }
  }
});

// The command must never look like it worked when nothing was rendered. It says so, writes nothing,
// and reports failure — the same contract as the render gate's "skipped — NOT render-verified".
test('with no browser it reports skipped — NOT rendered and writes nothing', async () => {
  const dir = await tiny();
  const res = await shots(dir, { launch: async () => null });
  assert.equal(res.skipped, true, 'the result says it was skipped');
  assert.equal(res.ok, false, 'a skipped render is not a success');
  assert.deepEqual(res.files, [], 'no image is claimed');
  assert.match(res.message, /skipped — NOT rendered/);
  assert.match(res.message, /no browser/, 'the message names the cause');
  assert.doesNotMatch(res.message, /\b\d+ (screenshots|images|PNGs?)\b/i, 'no summary line counting images');
  await assert.rejects(stat(join(dir, 'shots')), /ENOENT/, 'the output dir was never created');
});

test('--out sends the PNGs there and leaves the default shots/ alone', async (t) => {
  const dir = await tiny();
  const out = join(dir, 'elsewhere');
  const res = await run([dir, '--out', out]);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  assert.equal(res.ok, true, res.message);
  assert.equal(res.outDir, out);
  assert.deepEqual((await readdir(out)).sort(), [
    '01-probe.dark.desktop.png', '01-probe.dark.mobile.png', '01-probe.light.desktop.png', '01-probe.light.mobile.png',
  ]);
  await assert.rejects(stat(join(dir, 'shots')), /ENOENT/, 'the default output dir was not touched');
});

// The CLI turns a skipped render into a failure, so a script that runs `lykeion shots` cannot read a
// clean exit as "the images are there". Checked here through the same seam, with the exit code
// restored afterwards so it does not leak into the rest of the run.
test('the CLI exits non-zero when nothing could be rendered', async () => {
  const dir = await tiny();
  const before = process.exitCode;
  try {
    const res = await run([dir], { launch: async () => null });
    assert.equal(res.skipped, true);
    assert.equal(process.exitCode, 1, 'a skipped render sets a failing exit code');
  } finally {
    process.exitCode = before;
  }
});
