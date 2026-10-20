// `lykeion shots`: the built Lecture Site, captured as full-page PNGs — one per chapter, theme and
// viewport — so a reviewer (or the writing agent) can look at the page instead of trusting the gate.
//   <chapter-slug>.<theme>.<viewport>.png
// The slug is the chapter's content file stem (`content/NN-<slug>.md`), the one identifier the
// project already has; the theme and the width are the two things a capture can silently get wrong.
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { launchBrowser, routeLocal, LOCAL_ORIGIN } from './browser.mjs';

// The two widths the render gate also measures — a phone (the drawer layout) and a desktop (the
// sidebar layout). The height is a screen, not the capture: every image is full-page.
const VIEWPORTS = [{ name: 'mobile', width: 375, height: 760 }, { name: 'desktop', width: 1280, height: 900 }];
const THEMES = ['light', 'dark'];

// Chromium paints at most 16384px in one capture. Past that line it returns the empty canvas instead
// of the page — #ffffff, or flat #121212 in dark — while the PNG header still reports the full height,
// so a truncated capture looks complete. Long chapters are the normal case (the acceptance fixture
// reaches 49,904px at 375 wide), so a view taller than one capture is taken in clips of CLIP and
// written as numbered parts; a view that fits keeps its single-file name.
const LIMIT = 16384;
const CLIP = 8000;

export const help = `lykeion shots [project-dir] [--out dir]

Opens the built Lecture Site in a headless browser and writes one full-page PNG per chapter, theme
and viewport to <project>/shots/ (or --out):

  <chapter-slug>.<theme>.<viewport>.png   e.g. 01-conditional.dark.mobile.png

A chapter taller than one capture (>16384px, common at 375px wide) is written in numbered parts
instead, in order, top to bottom — every part has to be looked at:

  <chapter-slug>.<theme>.<viewport>.p1.png, .p2.png, …

themes: light, dark — the system setting the page follows until a reader presses the theme button.
viewports: mobile (375px wide), desktop (1280px wide).

Run "lykeion build" first. Without a browser the command writes nothing and exits 1.`;

// `opts` is the seam the tests use to run the command without a browser; the CLI passes none.
export async function run(args, { launch } = {}) {
  const cli = { dir: '.', out: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      cli.out = args[++i];
      if (!cli.out) throw new Error('--out needs a directory');
    } else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
    else cli.dir = args[i];
  }
  const r = await shots(resolve(cli.dir), { out: cli.out, launch });
  console.log(r.message);
  // A skipped render exits non-zero: the command's whole output is the images, so no images is a
  // failure to run — unlike a verify gate, which can still pass the gates that did run.
  if (!r.ok) process.exitCode = 1;
  return r;
}

export async function shots(dir, { out = null, launch = launchBrowser } = {}) {
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8').catch(() => { throw new Error(`no checks.json in ${dir}; run "lykeion build" first`); }));
  const htmlPath = join(dir, checks.output);
  const outDir = resolve(dir, out || 'shots');

  // A machine without a browser can capture nothing. Say so and stop: an empty shots/ directory that
  // looks like a finished run is worse than no run at all.
  const browser = await launch();
  if (!browser) {
    return { ok: false, skipped: true, outDir, files: [], message: 'shots: skipped — NOT rendered: no browser available (neither system Chrome nor Playwright Chromium could be launched)' };
  }

  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height } });
    // Offline, like the render gate: the web fonts are a nicety, and a capture that waits for the
    // network is a capture that fails on a train. Everything else the page needs is in the one file.
    await page.route(/^https?:\/\/(?!lykeion\.local)/, (route) => route.abort());
    // Served from the fake origin rather than file://, so the page gets a real origin (and real
    // storage) and the runtime starts the way it does for a reader.
    await routeLocal(page, (path) => (path === `/${basename(htmlPath)}` ? htmlPath : null));
    await page.goto(`${LOCAL_ORIGIN}/${basename(htmlPath)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Lykeion && window.Lykeion.views().length > 0);

    // content/NN-<slug>.md is rendered in file order and the chapter views come out of the build in
    // that same order, so pairing them by position is what ties a capture to its file name. The quiz
    // view is not a chapter (it holds the `data-quiz` section) and is dropped.
    const slugs = (await readdir(join(dir, 'content'))).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));
    const views = await page.evaluate(() => [...document.querySelectorAll('.chapter.view')].filter((v) => !v.querySelector('[data-quiz]')).map((v) => v.id));
    if (views.length !== slugs.length) throw new Error(`${views.length} chapter views in ${checks.output} for ${slugs.length} content/*.md — run "lykeion build" again`);

    await mkdir(outDir, { recursive: true });
    const split = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of THEMES) {
        // The system setting is what the runtime follows until a reader presses the theme button, so
        // this drives the same switch the page's own CSS reads — not a class bolted on for the camera.
        await page.emulateMedia({ colorScheme: theme });
        for (const [i, id] of views.entries()) {
          // A view is the only thing shown; `noScroll` keeps the capture at the chapter's head, and
          // the settle below lets the Labs it mounts lay themselves out first.
          await page.evaluate((v) => window.Lykeion.show(v, { noScroll: true }), id);
          await settle(page);
          const stem = `${slugs[i]}.${theme}.${vp.name}`;
          const parts = await capture(page, join(outDir, stem), vp);
          files.push(...parts);
          if (parts.length > 1) split.push(`${stem} p1-${parts.length}`);
          await page.setViewportSize({ width: vp.width, height: vp.height });
        }
      }
    }
    const message = split.length
      ? `shots: ${files.length} PNGs → ${outDir} (${split.length} view${split.length > 1 ? 's' : ''} split into parts, each to be read in order: ${split.join(', ')})`
      : `shots: ${files.length} full-page PNGs → ${outDir}`;
    return { ok: true, skipped: false, outDir, files, split, message };
  } finally {
    await browser.close();
  }
}

// Writes one capture for a view, or the numbered parts of a view too tall for one. Returns the files.
async function capture(page, stem, vp) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height <= LIMIT) {
    const file = `${stem}.png`;
    await page.screenshot({ path: file, fullPage: true });
    return [file];
  }
  // A tall viewport is what lets the page paint past the limit: scrolling to a clip and capturing the
  // viewport returns real pixels at any depth, while `fullPage` — and `fullPage` with a clip — do not.
  // The clip height is fixed so the parts are the same size, and it is re-measured after the resize
  // because a taller viewport can change how tall the page lays out.
  await page.setViewportSize({ width: vp.width, height: Math.min(CLIP, height) });
  await settle(page);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const count = Math.ceil(total / CLIP);
  const files = [];
  for (let i = 0; i < count; i++) {
    const top = i * CLIP;
    const tall = Math.min(CLIP, total - top);
    await page.setViewportSize({ width: vp.width, height: tall });
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await settle(page);
    const file = `${stem}.p${i + 1}.png`;
    await page.screenshot({ path: file });
    files.push(file);
  }
  return files;
}

// A view change lays the page out again and mounts the Labs in it; the fonts have to settle too, or
// the capture shows the previous chapter's metrics under this one's text.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}
