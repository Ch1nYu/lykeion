// `lykeion shots`: the built Lecture Site, captured as full-page PNGs — one per chapter, theme and
// viewport — so a reviewer (or the writing agent) can look at the page instead of trusting the gate.
//   <chapter-slug>.<theme>.<viewport>.png
// The slug is the chapter's content file stem (`content/NN-<slug>.md`), the one identifier the
// project already has; the theme and the width are the two things a capture can silently get wrong.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { launchBrowser, routeLocal, LOCAL_ORIGIN } from './browser.mjs';

// The two widths the render gate also measures — a phone (the drawer layout) and a desktop (the
// sidebar layout). The height is a screen, not the capture: every image is full-page.
const VIEWPORTS = [{ name: 'mobile', width: 375, height: 760 }, { name: 'desktop', width: 1280, height: 900 }];
const THEMES = ['light', 'dark'];
// `--quick` takes each chapter's first screen only, in the three captures that catch most first-glance
// faults: the phone and the desktop in light, and the phone in dark.
const QUICK = new Set(['light.mobile', 'light.desktop', 'dark.mobile']);
// `--segment` cuts every view into pieces of a reading height: one and a half screens, about what a
// reader takes in before scrolling, and small enough to look at without cutting it up again.
const SEGMENT = 1.5;

// Chromium paints at most 16384px in one capture. Past that line it returns the empty canvas instead
// of the page — #ffffff, or flat #121212 in dark — while the PNG header still reports the full height,
// so a truncated capture looks complete. Long chapters are the normal case (the acceptance fixture
// reaches 49,904px at 375 wide), so a view taller than one capture is taken in clips of CLIP and
// written as numbered parts; a view that fits keeps its single-file name.
const LIMIT = 16384;
const CLIP = 8000;

export const help = `lykeion shots [project-dir] [--out dir] [--scope chapter,…] [--segment | --quick]

Opens the built Lecture Site in a headless browser and writes one full-page PNG per chapter, theme
and viewport to <project>/shots/ (or --out):

  <chapter-slug>.<theme>.<viewport>.png   e.g. 01-conditional.dark.mobile.png

A chapter taller than one capture (>16384px, common at 375px wide) is written in numbered parts
instead, in order, top to bottom — every part has to be looked at:

  <chapter-slug>.<theme>.<viewport>.p1.png, .p2.png, …

shots/index.md lists every image with the sections it shows.

themes: light, dark — the system setting the page follows until a reader presses the theme button.
viewports: mobile (375px wide), desktop (1280px wide).

--scope    only these chapters: content file stems (03-entropy) or their numbers (03), comma-separated
           — for one visual reviewer per chapter
--segment  cut every view into numbered parts of one and a half screens (.p1.png, …), so each image
           can be looked at whole
--quick    each chapter's first screen only, as <slug>.<theme>.<viewport>.top.png in light/mobile,
           light/desktop and dark/mobile — to check a fix on the first screen, never for a full review

Run "lykeion build" first. Without a browser the command writes nothing and exits 1.`;

// `opts` is the seam the tests use to run the command without a browser; the CLI passes none.
export async function run(args, { launch } = {}) {
  const cli = { dir: '.', out: null, scope: [], mode: 'full' };
  const mode = (m) => {
    if (cli.mode !== 'full') throw new Error('--segment and --quick cannot be combined');
    cli.mode = m;
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      cli.out = args[++i];
      if (!cli.out) throw new Error('--out needs a directory');
    } else if (args[i] === '--scope') {
      const list = args[++i];
      if (!list) throw new Error('--scope needs chapters, e.g. --scope 03-entropy,04');
      cli.scope.push(...list.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (args[i] === '--segment') mode('segment');
    else if (args[i] === '--quick') mode('quick');
    else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
    else cli.dir = args[i];
  }
  const r = await shots(resolve(cli.dir), { out: cli.out, launch, scope: cli.scope, mode: cli.mode });
  console.log(r.message);
  // A skipped render exits non-zero: the command's whole output is the images, so no images is a
  // failure to run — unlike a verify gate, which can still pass the gates that did run.
  if (!r.ok) process.exitCode = 1;
  return r;
}

export async function shots(dir, { out = null, launch = launchBrowser, scope = [], mode = 'full' } = {}) {
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8').catch(() => { throw new Error(`no checks.json in ${dir}; run "lykeion build" first`); }));
  const htmlPath = join(dir, checks.output);
  const outDir = resolve(dir, out || 'shots');

  // content/NN-<slug>.md is rendered in file order and the chapter views come out of the build in
  // that same order, so pairing them by position is what ties a capture to its file name.
  const slugs = (await readdir(join(dir, 'content'))).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));
  const wanted = pickScope(slugs, scope);

  // A machine without a browser can capture nothing. Say so and stop: an empty shots/ directory that
  // looks like a finished run is worse than no run at all.
  const browser = await launch();
  if (!browser) {
    return { ok: false, skipped: true, outDir, files: [], message: 'shots: skipped — NOT rendered: no browser available (neither system Chrome nor Playwright Chromium could be launched)' };
  }

  const files = [];
  const index = new Map(); // slug → [{ name, sections }]
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

    // The quiz view is not a chapter (it holds the `data-quiz` section) and is dropped.
    const views = await page.evaluate(() => [...document.querySelectorAll('.chapter.view')].filter((v) => !v.querySelector('[data-quiz]')).map((v) => v.id));
    if (views.length !== slugs.length) throw new Error(`${views.length} chapter views in ${checks.output} for ${slugs.length} content/*.md — run "lykeion build" again`);

    await mkdir(outDir, { recursive: true });
    const split = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of THEMES) {
        if (mode === 'quick' && !QUICK.has(`${theme}.${vp.name}`)) continue;
        // The system setting is what the runtime follows until a reader presses the theme button, so
        // this drives the same switch the page's own CSS reads — not a class bolted on for the camera.
        await page.emulateMedia({ colorScheme: theme });
        for (const [i, id] of views.entries()) {
          if (!wanted.has(slugs[i])) continue;
          // A view is the only thing shown; `noScroll` keeps the capture at the chapter's head, and
          // the settle below lets the Labs it mounts lay themselves out first.
          await page.evaluate((v) => window.Lykeion.show(v, { noScroll: true }), id);
          await settle(page);
          const stem = `${slugs[i]}.${theme}.${vp.name}`;
          const parts = mode === 'quick'
            ? await firstScreen(page, join(outDir, `${stem}.top`), vp, id)
            : await capture(page, join(outDir, stem), vp, id, mode === 'segment' ? { clip: Math.round(vp.height * SEGMENT), always: true } : {});
          files.push(...parts.map((p) => p.file));
          if (!index.has(slugs[i])) index.set(slugs[i], []);
          index.get(slugs[i]).push(...parts.map((p) => ({ name: basename(p.file), sections: p.sections })));
          if (parts.length > 1) split.push(`${stem} p1-${parts.length}`);
          await page.setViewportSize({ width: vp.width, height: vp.height });
        }
      }
    }
    await writeFile(join(outDir, 'index.md'), indexMarkdown(checks.output, mode, index));
    const what = mode === 'quick' ? 'first-screen PNGs' : split.length ? 'PNGs' : 'full-page PNGs';
    const message = split.length
      ? `shots: ${files.length} ${what} → ${outDir} (${split.length} view${split.length > 1 ? 's' : ''} split into parts, each to be read in order: ${split.join(', ')}); sections per image in index.md`
      : `shots: ${files.length} ${what} → ${outDir}; sections per image in index.md`;
    return { ok: true, skipped: false, outDir, files, split, message };
  } finally {
    await browser.close();
  }
}

// `--scope` names chapters by content file stem (`03-entropy`), file name (`03-entropy.md`) or number
// (`03`, `3`). A name that matches no chapter is an error: a reviewer told to look at one chapter must
// not receive an empty folder.
function pickScope(slugs, scope) {
  if (!scope.length) return new Set(slugs);
  const out = new Set();
  for (const want of scope) {
    const w = want.replace(/\.md$/, '');
    const hit = slugs.filter((s) => s === w || (/^\d+$/.test(w) && Number(s.split('-')[0]) === Number(w)));
    if (!hit.length) throw new Error(`--scope "${want}" matches no chapter (chapters: ${slugs.join(', ')})`);
    for (const s of hit) out.add(s);
  }
  return out;
}

// The sections of the shown view, with their extent on the page, so each image can say what it shows.
const sectionsOf = (page, id) => page.evaluate((v) => [...document.getElementById(v).querySelectorAll('section.sec')].map((s) => {
  const r = s.getBoundingClientRect();
  return { num: s.dataset.num, title: s.dataset.title, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
}), id);
const within = (sections, top, bottom) => [
  ...(top === 0 ? ['chapter head'] : []),
  ...sections.filter((s) => s.bottom > top && s.top < bottom).map((s) => `§${s.num} ${s.title}`),
];

// Writes one capture for a view, or the numbered parts of a view too tall for one (or, with `always`,
// of every view). Returns { file, sections } for each image.
async function capture(page, stem, vp, id, { clip = CLIP, always = false } = {}) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (!always && height <= LIMIT) {
    const file = `${stem}.png`;
    const sections = await sectionsOf(page, id);
    await page.screenshot({ path: file, fullPage: true });
    return [{ file, sections: within(sections, 0, height) }];
  }
  // A tall viewport is what lets the page paint past the limit: scrolling to a clip and capturing the
  // viewport returns real pixels at any depth, while `fullPage` — and `fullPage` with a clip — do not.
  // The clip height is fixed so the parts are the same size, and it is re-measured after the resize
  // because a taller viewport can change how tall the page lays out.
  await page.setViewportSize({ width: vp.width, height: Math.min(clip, height) });
  await settle(page);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const sections = await sectionsOf(page, id);
  const count = Math.ceil(total / clip);
  const files = [];
  await pinToTop(page, true);
  try {
    for (let i = 0; i < count; i++) {
      const top = i * clip;
      const tall = Math.min(clip, total - top);
      await page.setViewportSize({ width: vp.width, height: tall });
      // The page scrolls smoothly (`html{scroll-behavior:smooth}`); an animated scroll can still be on
      // its way when the capture is taken, so this one jumps.
      await page.evaluate(([y, later]) => {
        document.documentElement.classList.toggle('shots-later', later);
        window.scrollTo({ top: y, behavior: 'instant' });
      }, [top, i > 0]);
      await settle(page);
      const file = `${stem}.p${i + 1}.png`;
      await page.screenshot({ path: file });
      files.push({ file, sections: within(sections, top, top + tall) });
    }
  } finally {
    await pinToTop(page, false);
  }
  return files;
}

// `--quick`: the screen a reader lands on, nothing below it.
async function firstScreen(page, stem, vp, id) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const sections = await sectionsOf(page, id);
  const file = `${stem}.png`;
  await page.screenshot({ path: file });
  return [{ file, sections: within(sections, 0, vp.height) }];
}

// shots/index.md: every image of this run with the sections it shows, so a reviewer can go straight to
// the image behind a finding, and knows which run the folder holds.
function indexMarkdown(output, mode, index) {
  const how = { full: 'full-page captures (a view over 16384px comes in parts)', segment: 'every view in parts of one and a half screens', quick: 'each chapter\'s first screen only — not enough for a full review' }[mode];
  const lines = [`# Shots of ${output}`, '', `Run: ${new Date().toISOString()}, ${how}. Read a view's parts in order; a section listed under two parts straddles the cut.`, ''];
  for (const [slug, images] of index) {
    lines.push(`## ${slug}`, '', '| Image | Shows |', '|---|---|');
    for (const im of images) lines.push(`| ${im.name} | ${im.sections.join('; ') || '—'} |`);
    lines.push('');
  }
  return lines.join('\n');
}

// A part is the viewport scrolled down the page, so whatever sticks to the viewport — the sticky top bar
// and sidebar, the fixed reading bar and floating buttons — is painted again at the top or bottom of
// every part, in the middle of the page it pictures. While parts are captured, sticky elements stay in
// the flow where they sit (`static`, which takes the same room) and fixed ones show in the first part
// only, as they would on a reader's first screen.
async function pinToTop(page, on) {
  await page.evaluate((on) => {
    const html = document.documentElement;
    if (!on) {
      document.getElementById('shots-pin')?.remove();
      html.classList.remove('shots-later');
      for (const el of document.querySelectorAll('[data-shots-pin]')) el.removeAttribute('data-shots-pin');
      return;
    }
    for (const el of document.body.querySelectorAll('*')) {
      const pos = getComputedStyle(el).position;
      if (pos === 'sticky' || pos === 'fixed') el.setAttribute('data-shots-pin', pos);
    }
    const style = document.createElement('style');
    style.id = 'shots-pin';
    style.textContent = '[data-shots-pin="sticky"]{position:static!important}.shots-later [data-shots-pin="fixed"]{visibility:hidden!important}';
    document.head.appendChild(style);
  }, on);
}

// A view change lays the page out again and mounts the Labs in it; the fonts have to settle too, or
// the capture shows the previous chapter's metrics under this one's text.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}
