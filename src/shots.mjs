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

export const help = `lykeion shots [project-dir] [--out dir]

Opens the built Lecture Site in a headless browser and writes one full-page PNG per chapter, theme
and viewport to <project>/shots/ (or --out):

  <chapter-slug>.<theme>.<viewport>.png   e.g. 01-conditional.dark.mobile.png

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
          const file = join(outDir, `${slugs[i]}.${theme}.${vp.name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          files.push(file);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { ok: true, skipped: false, outDir, files, message: `shots: ${files.length} full-page PNGs → ${outDir}` };
}

// A view change lays the page out again and mounts the Labs in it; the fonts have to settle too, or
// the capture shows the previous chapter's metrics under this one's text.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}
