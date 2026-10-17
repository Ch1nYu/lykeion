// `lykeion extract`: turn Primary Source PDFs into per-page text and PNG files,
// so any agent that can read text and images can work from them (ADR 0004).
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { launchBrowser, routeLocal, LOCAL_ORIGIN } from './browser.mjs';

const require = createRequire(import.meta.url);
const PDFJS_DIR = dirname(require.resolve('pdfjs-dist/package.json'));

export const help = `lykeion extract <pdf...> [--pages a-b] [--out dir] [--no-images] [--scale n]
lykeion extract --project <project-dir>     (every Scope entry → <project>/pages)

Writes <out>/<pdf-stem>/p-001.txt (+ p-001.png) per page and <out>/index.json.
Default out: <first pdf dir>/lykeion/pages`;

export async function run(args) {
  const opts = parseArgs(args);
  if (opts.project) {
    const proj = JSON.parse(await readFile(join(resolve(opts.project), 'lykeion.json'), 'utf8'));
    for (const sc of proj.scope || []) {
      await run([sc.path || join(resolve(opts.project), '..', sc.file), '--pages', sc.pages, '--out', join(resolve(opts.project), 'pages'), ...(opts.images ? [] : ['--no-images'])]);
    }
    return;
  }
  if (!opts.pdfs.length) throw new Error('No PDF given.\n\n' + help);
  const outRoot = resolve(opts.out || join(dirname(resolve(opts.pdfs[0])), 'lykeion', 'pages'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const index = [];
  for (const pdfPath of opts.pdfs.map((p) => resolve(p))) {
    const stem = basename(pdfPath, extname(pdfPath));
    const dir = join(outRoot, stem);
    await mkdir(dir, { recursive: true });
    const data = new Uint8Array(await readFile(pdfPath));
    const task = pdfjs.getDocument({ data, standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts') + '/', useSystemFonts: true, verbosity: 0 });
    const doc = await task.promise;
    const pages = pageList(opts.pages, doc.numPages);
    const glyphs = [];
    for (const n of pages) {
      const page = await doc.getPage(n);
      const text = await pageText(page);
      await writeFile(join(dir, `p-${pad(n)}.txt`), text);
      glyphs.push({ n, glyphs: await pageGlyphs(page, pdfjs.OPS) });
    }
    const broken = brokenMapPages(glyphs);
    index.push({ pdf: pdfPath, stem, numPages: doc.numPages, pages, dir, suspect: broken.pages, brokenChars: broken.chars });
    if (broken.pages.length) {
      console.log(`⚠ ${stem}: the PDF's text layer maps different glyphs to the same character (${broken.chars}), so the .txt is wrong on pages ${broken.pages.join(', ')}. Read the .png for those pages.`);
    }
    await task.destroy();
  }

  let images = 'skipped (--no-images)';
  if (opts.images) images = await renderImages(index, opts.scale);
  await writeFile(join(outRoot, 'index.json'), JSON.stringify({ images, sources: index }, null, 2) + '\n');
  console.log(`extracted ${index.reduce((s, x) => s + x.pages.length, 0)} pages → ${outRoot}`);
  if (images !== 'ok') console.log(`images: ${images}`);
}

function parseArgs(args) {
  const o = { pdfs: [], pages: null, out: null, images: true, scale: 1.5, project: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pages') o.pages = args[++i];
    else if (a === '--out') o.out = args[++i];
    else if (a === '--no-images') o.images = false;
    else if (a === '--scale') o.scale = Number(args[++i]);
    else if (a === '--project') o.project = args[++i];
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else o.pdfs.push(a);
  }
  return o;
}

export function pageList(spec, numPages) {
  if (!spec) return Array.from({ length: numPages }, (_, i) => i + 1);
  const m = /^(\d+)-(\d+)$/.exec(spec) || /^(\d+)$/.exec(spec);
  if (!m) throw new Error(`--pages must look like 3-40 or 7, got "${spec}"`);
  const a = Number(m[1]);
  const b = Math.min(Number(m[2] ?? m[1]), numPages);
  if (a < 1 || a > b) throw new Error(`--pages ${spec} is outside 1-${numPages}`);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

async function pageText(page) {
  const { items } = await page.getTextContent();
  // Rebuild lines from the text items' vertical positions.
  let out = '';
  let lastY = null;
  for (const it of items) {
    const y = it.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) { if (!out.endsWith('\n')) out += '\n'; }
    else if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += it.str ? ' ' : '';
    out += it.str;
    if (it.hasEOL) out += '\n';
    if (y !== undefined) lastY = y;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim() + '\n';
}

// The CJK glyphs a page draws, as [font, unicode, glyph code]. A PDF whose font maps two different
// glyph codes to one character (a broken ToUnicode table) produces text that reads plausibly but is
// wrong — 「耶穌的第一個」 comes out as 「穌的的一一個」 — while the rendered page is fine.
async function pageGlyphs(page, OPS) {
  const ops = await page.getOperatorList();
  const out = [];
  let font = '';
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.setFont) font = args[0];
    if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue;
    for (const g of args[0]) {
      if (g && typeof g === 'object' && g.unicode && CJK.test(g.unicode)) out.push([font, g.unicode, g.originalCharCode]);
    }
  }
  return out;
}
const CJK = /[㐀-鿿豈-﫿]/;

// Pages whose text is unreliable. Within one font, a character reached from more than one glyph code
// is a collision; the most frequent code is taken as the genuine glyph and every other code as a
// mis-mapped one, so only pages that draw a mis-mapped glyph are flagged.
export function brokenMapPages(pages) {
  const counts = new Map(); // font\0char -> Map(code -> count)
  for (const p of pages) {
    for (const [font, ch, code] of p.glyphs) {
      const k = font + '\u0000' + ch;
      if (!counts.has(k)) counts.set(k, new Map());
      counts.get(k).set(code, (counts.get(k).get(code) || 0) + 1);
    }
  }
  const wrong = new Set(), chars = new Set();
  for (const [k, codes] of counts) {
    if (codes.size < 2) continue;
    const top = [...codes].sort((a, b) => b[1] - a[1])[0][0];
    for (const code of codes.keys()) if (code !== top) wrong.add(k + '\u0000' + code);
    chars.add(k.split('\u0000')[1]);
  }
  const flagged = pages.filter((p) => p.glyphs.some(([f, ch, code]) => wrong.has(f + '\u0000' + ch + '\u0000' + code))).map((p) => p.n);
  return { pages: flagged, chars: [...chars].join('') };
}

async function renderImages(index, scale) {
  const browser = await launchBrowser();
  if (!browser) return 'skipped (no browser available)';
  try {
    const page = await browser.newPage();
    const files = new Map(index.map((s, i) => [`/pdf/${i}.pdf`, s.pdf]));
    await routeLocal(page, (p) => (p.startsWith('/pdfjs/') ? join(PDFJS_DIR, p.slice(7)) : files.get(p)));
    await page.goto(`${LOCAL_ORIGIN}/blank`).catch(() => {});
    await page.setContent('<!doctype html><canvas id="c"></canvas>');
    for (const [i, s] of index.entries()) {
      for (const n of s.pages) {
        const png = await page.evaluate(async ({ url, n, scale, origin }) => {
          const pdfjs = await import(`${origin}/pdfjs/build/pdf.min.mjs`);
          pdfjs.GlobalWorkerOptions.workerSrc = `${origin}/pdfjs/build/pdf.worker.min.mjs`;
          window.__docs ??= {};
          const doc = (window.__docs[url] ??= await pdfjs.getDocument({ url }).promise);
          const p = await doc.getPage(n);
          const vp = p.getViewport({ scale });
          const c = document.getElementById('c');
          c.width = Math.ceil(vp.width);
          c.height = Math.ceil(vp.height);
          await p.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise;
          return c.toDataURL('image/png');
        }, { url: `${LOCAL_ORIGIN}/pdf/${i}.pdf`, n, scale, origin: LOCAL_ORIGIN });
        await writeFile(join(s.dir, `p-${pad(n)}.png`), Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    return 'ok';
  } finally {
    await browser.close();
  }
}

const pad = (n) => String(n).padStart(3, '0');

export async function pdfjsPageCount(pdfPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(pdfPath)), verbosity: 0 });
  const doc = await task.promise;
  const n = doc.numPages;
  await task.destroy();
  return n;
}
