// `lykeion palette`: load, check and render Palettes (ADR 0002).
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDir } from './config.mjs';
import { parseColor, composite, contrast, simulate, deltaE2000, CVD_KINDS } from './color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = {
  bundled: join(ROOT, 'palettes', 'bundled'),
  candidates: join(ROOT, 'palettes', 'candidates'),
  personal: () => join(configDir(), 'palettes'),
};

export const TOKENS = ['paper', 'paper-deep', 'card', 'ink', 'ink-2', 'muted', 'rule', 'rule-strong', 'accent', 'accent-ink', 'accent-soft',
  'hl', 'hl-soft', 'good', 'good-soft', 'bad', 'bad-soft', 's1', 's2', 's3', 'star', 'shadow', 'shadow-sm', 'drawer-shadow', 'scrim'];
const NON_COLOUR = new Set(['shadow', 'shadow-sm', 'drawer-shadow']);

export const help = `lykeion palette <list|check|specimen> [ids...] [--candidates] [--out file]

  list                 list Palettes (bundled, personal; --candidates adds candidates)
  check [ids...]       contrast and colour-vision checks; exits 1 if any Palette fails
  specimen [ids...]    write the Palette Specimen page (default: all candidates)`;

export async function run(args) {
  const [sub, ...rest] = args;
  const outIdx = rest.indexOf('--out');
  const out = outIdx >= 0 ? rest[outIdx + 1] : null;
  const ids = rest.filter((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
  const all = await loadAll({ candidates: rest.includes('--candidates') || sub === 'specimen' || ids.length > 0 });
  const pick = ids.length ? ids.map((id) => all.find((p) => p.id === id) || fail(`no Palette "${id}"`)) : all;
  if (sub === 'list') {
    for (const p of all) console.log(`${p.id.padEnd(18)} ${p.source.padEnd(10)} ${p.name}`);
  } else if (sub === 'check') {
    let bad = 0;
    for (const p of pick) {
      const r = checkPalette(p);
      console.log(formatReport(p, r));
      if (!r.ok) bad++;
    }
    if (bad) { process.exitCode = 1; console.log(`\n${bad} Palette(s) failed.`); }
  } else if (sub === 'specimen') {
    const { writeSpecimen } = await import('./specimen.mjs');
    const file = await writeSpecimen(ids.length ? pick : all.filter((p) => p.source === 'candidates'), out);
    console.log(`specimen → ${file}`);
  } else {
    throw new Error(help);
  }
}

const fail = (m) => { throw new Error(m); };

export async function loadAll({ candidates = false } = {}) {
  const out = [];
  const dirs = [['bundled', SOURCES.bundled], ['personal', SOURCES.personal()]];
  if (candidates) dirs.push(['candidates', SOURCES.candidates]);
  for (const [source, dir] of dirs) {
    let files = [];
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort(); } catch { continue; }
    for (const f of files) {
      const p = JSON.parse(await readFile(join(dir, f), 'utf8'));
      p.id ??= basename(f, '.json');
      p.source = source;
      validate(p);
      out.push(p);
    }
  }
  return out;
}

// Only the Palette Library (bundled + personal) is usable for a Lecture Site; candidates are not.
export async function loadPalette(id, { allowCandidates = false } = {}) {
  const p = (await loadAll({ candidates: allowCandidates })).find((x) => x.id === id);
  if (!p) throw new Error(`Palette "${id}" is not in the Palette Library (bundled or personal)`);
  return p;
}

export function validate(p) {
  for (const theme of ['light', 'dark']) {
    if (!p[theme]) throw new Error(`Palette ${p.id}: missing "${theme}"`);
    const missing = TOKENS.filter((t) => !(t in p[theme]));
    if (missing.length) throw new Error(`Palette ${p.id}.${theme}: missing tokens ${missing.join(', ')}`);
    for (const t of TOKENS) if (!NON_COLOUR.has(t)) parseColor(p[theme][t]);
    const g = p[theme].grain;
    if (!g || !Array.isArray(g.tint) || g.tint.length !== 3) throw new Error(`Palette ${p.id}.${theme}: grain.tint must be [r,g,b] in 0–1`);
  }
}

// ---------- CSS ----------
function grainUri(tint) {
  const [r, g, b] = tint.map((x) => +x.toFixed(3));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 .22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#(?!n\))/g, '%23')}")`;
}

function block(t, scheme) {
  const decl = TOKENS.map((k) => `--${k}:${t[k]}`).join('; ');
  return `${decl}; --grain:${grainUri(t.grain.tint)}; --grain-opacity:${t.grain.opacity}; --grain-blend:${t.grain.blend}; color-scheme:${scheme}`;
}

export function paletteCss(p, scope = ':root') {
  if (scope !== ':root') return `${scope}{${block(p.light, 'light')}}\n${scope}.dark{${block(p.dark, 'dark')}}`;
  return [
    `/* Palette: ${p.id} — ${p.name} */`,
    `:root{${block(p.light, 'light')}}`,
    `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){${block(p.dark, 'dark')}} }`,
    `:root[data-theme="dark"]{${block(p.dark, 'dark')}}`,
  ].join('\n');
}

// ---------- checks ----------
// [foreground, backgrounds[], minimum ratio, what it is]
const CONTRAST_RULES = [
  ['ink', ['paper', 'paper-deep', 'card'], 7, 'body text'],
  ['ink-2', ['paper', 'paper-deep', 'card'], 4.5, 'secondary text'],
  ['muted', ['paper', 'paper-deep', 'card'], 4.5, 'small labels'],
  ['accent', ['paper', 'paper-deep', 'card'], 4.5, 'links and section numbers'],
  ['accent-ink', ['accent'], 4.5, 'text on accent'],
  ['ink', ['hl', 'hl-soft', 'accent-soft', 'good-soft', 'bad-soft'], 4.5, 'text on tinted panels'],
  ['good', ['good-soft', 'card'], 4.5, 'success text'],
  ['bad', ['bad-soft', 'card'], 4.5, 'error and erratum text'],
  ['star', ['card', 'paper'], 3, 'stars'],
  ['s1', ['card', 'paper'], 3, 'data series'],
  ['s2', ['card', 'paper'], 3, 'data series'],
  ['s3', ['card', 'paper'], 3, 'data series'],
];
export const SERIES_MIN_DE = 12;

export function checkPalette(p) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    const t = p[theme];
    const paper = parseColor(t.paper);
    // Translucent tokens are judged as they appear over the paper.
    const solid = (k) => { const c = parseColor(t[k]); return c.a < 1 ? composite(c, paper) : c; };
    for (const [fg, bgs, min, what] of CONTRAST_RULES) {
      for (const bg of bgs) {
        const ratio = contrast(solid(fg), solid(bg));
        results.push({ theme, kind: 'contrast', name: `${fg} on ${bg}`, what, value: ratio, min, ok: ratio >= min });
      }
    }
    const series = ['s1', 's2', 's3'].map(solid);
    for (const vision of ['normal', ...CVD_KINDS]) {
      const sim = vision === 'normal' ? series : series.map((c) => simulate(c, vision));
      for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
        const de = deltaE2000(sim[i], sim[j]);
        results.push({ theme, kind: 'series', name: `s${i + 1} vs s${j + 1} (${vision})`, what: 'series distinguishable', value: de, min: SERIES_MIN_DE, ok: de >= SERIES_MIN_DE });
      }
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

export function formatReport(p, r) {
  const lines = [`${r.ok ? 'PASS' : 'FAIL'}  ${p.id} (${p.source}) — ${p.name}`];
  for (const x of r.results.filter((y) => !y.ok)) {
    lines.push(`   ✗ [${x.theme}] ${x.name}: ${x.value.toFixed(2)} < ${x.min} (${x.what})`);
  }
  return lines.join('\n');
}
