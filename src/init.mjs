// `lykeion init`: create a Lecture Site project next to its Primary Source.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { loadConfig } from './config.mjs';
import { suggestPalette } from './palette.mjs';

export const help = `lykeion init <pdf...> --title <title> [--pages a-b ...] [--depth survey|standard|deep] [--dir project-dir]

Creates <first pdf dir>/lykeion/ (or --dir) with lykeion.json and content/.
--pages may be given once per PDF, in the same order; default is every page.
Fails if the project already exists.`;

export async function run(args) {
  const o = { pdfs: [], pages: [], title: null, depth: null, dir: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--title') o.title = args[++i];
    else if (a === '--pages') o.pages.push(args[++i]);
    else if (a === '--depth') o.depth = args[++i];
    else if (a === '--dir') o.dir = args[++i];
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else o.pdfs.push(a);
  }
  if (!o.pdfs.length || !o.title) throw new Error(help);
  const cfg = await loadConfig();
  const depth = o.depth || cfg.depth;
  if (!['survey', 'standard', 'deep'].includes(depth)) throw new Error(`--depth must be survey, standard or deep`);
  const dir = resolve(o.dir || join(dirname(resolve(o.pdfs[0])), 'lykeion'));
  if (await access(join(dir, 'lykeion.json')).then(() => true, () => false)) throw new Error(`${dir}/lykeion.json already exists (use incremental mode instead)`);
  await mkdir(join(dir, 'content'), { recursive: true });

  const { pdfjsPageCount } = await import('./extract.mjs');
  const scope = [];
  for (const [i, pdf] of o.pdfs.entries()) {
    const n = await pdfjsPageCount(resolve(pdf));
    scope.push({ file: basename(pdf), path: resolve(pdf), pages: o.pages[i] || `1-${n}` });
  }
  const palette = await suggestPalette();
  const project = {
    title: o.title, description: '', eyebrow: '', lang: cfg.language, palette, depth, output: `${o.title}.html`,
    hero: { title: o.title, intro: '' }, levels: {}, scope, references: [],
  };
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify(project, null, 2) + '\n');
  console.log(`project → ${dir}\npalette suggestion: ${palette} (unused so far)\nscope: ${scope.map((s) => `${s.file} p.${s.pages}`).join('; ')}`);
}
