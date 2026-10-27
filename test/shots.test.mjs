import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
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

// Chromium refuses to paint a single capture taller than 16384px: past that line the pixels come back
// as the empty canvas (#ffffff, or flat #121212 in dark), not as the page. A chapter can easily be
// taller than that — 49,904px at 375 wide in the acceptance fixture — so a capture is taken in clips
// and a chapter that needs more than one is written as parts. Reading a row out of a PNG is the only
// way to see this from a test: the header still reports the full height, so the file looks complete.
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const decodePng = (buf) => {
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], colour: data[9] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = Math.ceil((ihdr.depth * PNG_CHANNELS[ihdr.colour]) / 8);
  const stride = ihdr.w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * ihdr.h);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  return { ...ihdr, bpp, stride, pixels: out };
};
// The colours on one row, as hex: one colour means nothing was drawn there.
const rowColours = (img, y) => {
  const counts = new Map();
  for (let x = 0; x < img.w; x++) {
    const i = y * img.stride + x * img.bpp;
    const hex = [...img.pixels.subarray(i, i + 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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

// A chapter past Chromium's 16384px capture limit, with a bright block at the very end: if the bottom
// of the page is lost, the block is lost with it. 200 paragraphs is ~17,500px at 375 wide and ~11,700px
// at 1280, so one fixture proves both halves — the mobile capture has to be split, the desktop one
// must stay a single file.
const tall = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-shots-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Tall probe', output: 'tall.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  const filler = Array.from({ length: 200 }, (_, i) => `第 ${i + 1} 段內文，用來把這一章拉得比一個螢幕還長。`).join('\n\n');
  const end = '<div class="endmark" style="background:#ff00aa;color:#000;padding:24px;font-size:40px;line-height:1.4">END OF CHAPTER</div>';
  await writeFile(join(dir, 'content', '01-tall.md'), `---\nchapter: 1\ntitle: Tall\nshort: tall\nsource: sample.pdf\n---\n\n## 1.1 A section {pages=1}\n\n${filler}\n\n${end}\n`);
  await build(dir);
  return dir;
};

test('a chapter taller than 16384px is captured to its last line', async (t) => {
  const dir = await tall();
  const res = await shots(dir);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  assert.equal(res.ok, true, res.message);

  // The end marker is #ff00aa; nothing else on this page is pink, so finding it anywhere in a capture
  // is proof the bottom of the chapter was painted rather than left as empty canvas.
  const pinkIn = async (file) => {
    const img = decodePng(await readFile(file));
    for (let y = 0; y < img.h; y += 4) {
      if (rowColours(img, y).some(([hex]) => hex === 'ff00aa')) return true;
    }
    return false;
  };

  for (const theme of ['light', 'dark']) {
    // Mobile: the chapter is over the limit, so the bottom of the page is the part that goes missing
    // first. Whatever the file layout, the LAST mobile file must contain the end of the chapter.
    const parts = (await readdir(res.outDir)).filter((f) => f.startsWith(`01-tall.${theme}.mobile.`) && f.endsWith('.png')).sort();
    const last = join(res.outDir, parts.at(-1));
    assert.equal(await pinkIn(last), true, `${parts.at(-1)} holds the end of the chapter — the bottom was captured`);
    // And the last capture does not end on the empty canvas a truncated capture leaves behind.
    const img = decodePng(await readFile(last));
    const blank = theme === 'dark' ? '121212' : 'ffffff';
    assert.notEqual(rowColours(img, img.h - 2)[0][0], blank, `${parts.at(-1)} does not end on the blank capture canvas (${blank})`);
    // A view taller than one capture is written as numbered parts, so nothing is silently dropped.
    assert.ok(parts.length > 1, `the ${theme} mobile chapter is split into parts (got ${parts.join(', ')})`);
    assert.match(parts[0], /\.p1\.png$/, 'the first part is numbered p1');
    assert.match(parts.at(-1), new RegExp(`\\.p${parts.length}\\.png$`), 'the parts are numbered without gaps');

    // Desktop: the same chapter fits under the limit, so it keeps today's single-file name.
    const one = join(res.outDir, `01-tall.${theme}.desktop.png`);
    const { h } = await png(one);
    assert.ok(h > 10000, `the desktop capture is the whole chapter (${h}px)`);
    assert.equal(await pinkIn(one), true, 'the desktop capture holds the end of the chapter too');
  }

  // The summary counts files that exist and says a view was split, so a reader is not surprised by p2.
  const onDisk = (await readdir(res.outDir)).filter((f) => f.endsWith('.png')).length;
  assert.equal(res.files.length, onDisk, 'every file it counts is on disk');
  assert.match(res.message, new RegExp(`\\b${onDisk}\\b`));
  assert.match(res.message, /split into parts/i, 'the summary says a view came in parts');
});

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
  assert.deepEqual((await readdir(res.outDir)).sort(), [...want, 'index.md'].sort(), 'exactly the expected files and the index, nothing else');
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
    '01-probe.dark.desktop.png', '01-probe.dark.mobile.png', '01-probe.light.desktop.png', '01-probe.light.mobile.png', 'index.md',
  ]);
  await assert.rejects(stat(join(dir, 'shots')), /ENOENT/, 'the default output dir was not touched');
});

// The index tells a reviewer which image holds which section, so a finding can be traced to its image
// and a reviewer can go straight to the part that holds a section.
test('index.md lists every image with the sections it shows', async (t) => {
  const dir = await sampleCopy();
  const res = await shots(dir);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  const index = await readFile(join(res.outDir, 'index.md'), 'utf8');
  for (const f of res.files) assert.ok(index.includes(`| ${f.split('/').at(-1)} |`), `index.md lists ${f}`);
  assert.match(index, /^## 01-conditional$/m);
  assert.match(index, /\| 01-conditional\.light\.mobile\.png \| chapter head; §1\.1 /);
  assert.match(res.message, /index\.md/);
});

// --quick is for checking a fix on the first screen: three viewport-sized images per chapter.
test('--quick writes each chapter\'s first screen in light/mobile, light/desktop and dark/mobile', async (t) => {
  const dir = await sampleCopy();
  const res = await run([dir, '--quick']);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  const pngs = (await readdir(res.outDir)).filter((f) => f.endsWith('.png')).sort();
  assert.deepEqual(pngs, ['01-conditional', '02-binomial'].flatMap((s) => [`${s}.dark.mobile.top.png`, `${s}.light.desktop.top.png`, `${s}.light.mobile.top.png`]).sort());
  for (const f of pngs) {
    const { w, h } = await png(join(res.outDir, f));
    const vp = f.includes('.mobile.') ? 'mobile' : 'desktop';
    assert.equal(w, WIDTHS[vp]);
    assert.equal(h, HEIGHTS[vp], `${f} is one screen`);
  }
  assert.match(await readFile(join(res.outDir, 'index.md'), 'utf8'), /not enough for a full review/);
});

// One visual reviewer per chapter gets only its chapter; a scope that names nothing is an error.
test('--scope captures only the named chapters, by stem or number', async (t) => {
  const dir = await sampleCopy();
  await assert.rejects(run([dir, '--scope', '07'], { launch: async () => null }), /--scope "07" matches no chapter \(chapters: 01-conditional, 02-binomial\)/);
  const res = await run([dir, '--scope', '2', '--quick']);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  const pngs = (await readdir(res.outDir)).filter((f) => f.endsWith('.png'));
  assert.equal(pngs.length, 3);
  assert.ok(pngs.every((f) => f.startsWith('02-binomial.')), pngs.join(', '));
});

// --segment cuts every view, short or long, into reading-height parts that are read in order.
test('--segment cuts every view into parts of one and a half screens', async (t) => {
  const dir = await tiny();
  const res = await run([dir, '--segment']);
  if (res.skipped) {
    t.skip('no browser available');
    return;
  }
  for (const [vp, h] of Object.entries(HEIGHTS)) {
    const parts = (await readdir(res.outDir)).filter((f) => f.startsWith(`01-probe.light.${vp}.p`)).sort();
    assert.ok(parts.length > 1, `${vp} is cut into parts (${parts.join(', ')})`);
    for (const f of parts.slice(0, -1)) assert.equal((await png(join(res.outDir, f))).h, Math.round(h * 1.5), `${f} is one and a half screens`);
  }
  await assert.rejects(run([dir, '--segment', '--quick']), /cannot be combined/);
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
