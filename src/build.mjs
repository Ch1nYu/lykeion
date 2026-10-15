// `lykeion build`: chapter Markdown + fixed runtime + Palette → one self-contained Lecture Site.
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { createMarkdown, tex } from './markdown.mjs';
import { loadPalette, paletteCss } from './palette.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const help = `lykeion build [project-dir] [--palette id] [--out file]

project-dir contains lykeion.json and content/*.md (default: current directory).
Writes the Lecture Site (lykeion.json "output", default <title>.html) and checks.json for "lykeion verify".
Fails on any TeX, quiz, erratum or Lab error.`;

const BUILD_STR = { challenge: '挑戰第 {n} 關：{t} →', pages: '講義 p.{p}', erratum: '勘誤／補充', quizTitle: '隨堂闖關', quizNum: 'QUIZ', quizSec: '闖關地圖', quizSub: '答對 60% 以上解鎖下一關；星等依正確率計算' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export async function run(args) {
  const opts = { dir: '.', palette: null, out: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--palette') opts.palette = args[++i];
    else if (args[i] === '--out') opts.out = args[++i];
    else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
    else opts.dir = args[i];
  }
  const res = await build(resolve(opts.dir), opts);
  console.log(`built ${res.sections} sections, ${res.questions} quiz items, ${res.labs} Labs → ${res.out}`);
}

export async function build(dir, opts = {}) {
  const project = JSON.parse(await readFile(join(dir, 'lykeion.json'), 'utf8').catch(() => { throw new Error(`no lykeion.json in ${dir}`); }));
  const S = { ...BUILD_STR, ...(project.buildStrings || {}) };
  const errors = [];
  const chapters = await loadChapters(join(dir, 'content'));
  if (!chapters.length) throw new Error(`no content/*.md in ${dir}`);

  const levels = []; // { t, s, qs }
  const levelIndex = new Map();
  const labSeq = { n: 0 };
  const labUses = []; // { type, params, where } for schema checks
  const checks = [];
  const labsUsed = new Set();
  let sectionCount = 0, labCount = 0;

  const chapterHtml = [];
  for (const ch of chapters) {
    const sections = splitSections(ch);
    const chNum = ch.meta.chapter ?? '';
    const chId = `ch${String(chNum).replace(/\W+/g, '-') || chapters.indexOf(ch) + 1}`;
    const chLevels = [];
    let out = `<div class="chapter" id="${esc(chId)}" data-num="${esc(ch.meta.label ?? `CH ${chNum}`)}" data-title="${esc(ch.meta.short ?? ch.meta.title)}">\n`;
    out += `<div class="ch-head"><span class="ch-n">${esc(String(chNum).padStart(2, '0'))}</span><h2>${esc(ch.meta.title)}</h2>${ch.meta.subtitle ? `<span class="src">${esc(ch.meta.subtitle)}</span>` : ''}</div>\n`;
    for (const sec of sections) {
      const where = `${ch.file}${sec.num ? ` §${sec.num}` : ''}`;
      const ctx = { errors, where, sec, chapter: ch, levels, levelIndex, chLevels, checks, labsUsed, labSeq, labUses, project, S };
      const md = createMarkdown(ctx);
      md.renderer.rules.fence = (tokens, i) => renderFence(tokens[i], ctx, () => labCount++);
      const body = md.render(sec.body);
      if (!sec.num) { out += `<div class="prose">${body}</div>\n`; continue; }
      sectionCount++;
      const pages = sec.pages ? `<p class="pages">${esc(fill(S.pages, { p: sec.pages }))}</p>` : '';
      out += `<section class="sec" id="${esc(sec.id)}" data-num="${esc(sec.num)}" data-title="${esc(sec.title)}" data-pages="${esc(sec.pages || '')}">\n`
        + `<h3><span class="sn">§${esc(sec.num)}</span><span class="t">${inlineTitle(sec.title, errors, where)}</span></h3>${pages}\n`
        + `<div class="prose">${body}</div>\n<div class="sec-end"></div>\n</section>\n`;
    }
    if (chLevels.length) {
      out += `<div class="nextch">${chLevels.map((li) => `<a class="btn" href="#quiz" data-level="${li}">${esc(fill(S.challenge, { n: li + 1, t: levels[li].t }))}</a>`).join(' ')}</div>\n`;
    }
    out += '</div>\n';
    chapterHtml.push(out.replace(/<div class="prose">\s*<\/div>\n?/g, ''));
  }

  for (const [t, sub] of Object.entries(project.levels || {})) { const i = levelIndex.get(t); if (i !== undefined) levels[i].s = sub; }
  if (levels.length) {
    chapterHtml.push(`<div class="chapter" id="quizCh" data-num="${esc(S.quizNum)}" data-title="${esc(S.quizTitle)}">
<div class="ch-head"><span class="ch-n">★</span><h2>${esc(S.quizTitle)}</h2><span class="src">${esc(S.quizSub)}</span></div>
<section class="sec" id="quiz" data-num="Q" data-title="${esc(S.quizSec)}" data-quiz="1">
<h3><span class="sn">§Q</span><span class="t">${esc(S.quizSec)}</span></h3>
<div class="quiz"><div class="trail" id="trail"></div><div id="qStage"></div></div>
<div class="sec-end"></div>
</section>
</div>`);
  }

  // Lab assets: repo Lab types first, then project-local custom Labs.
  const labJs = [], labCss = [];
  for (const type of labsUsed) {
    const found = await findLab(type, dir);
    if (!found) { errors.push(`Lab type "${type}" not found in labs/ or ${join(dir, 'labs')}`); continue; }
    if (found.schema) for (const u of labUses.filter((x) => x.type === type)) errors.push(...checkLabParams(found.schema, u));
    labJs.push(`/* Lab: ${type} */\n${found.js}`);
    if (found.css) labCss.push(`/* Lab: ${type} */\n${found.css}`);
  }

  if (errors.length) throw new Error(`${errors.length} build error(s):\n  - ${errors.join('\n  - ')}`);

  const palette = opts.paletteObj || await loadPalette(opts.palette || project.palette || 'desk-teal');
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const [shell, baseCss, mathJs, runtimeJs] = await Promise.all(['shell.html', 'base.css', 'mathlib.js', 'runtime.js'].map((f) => readFile(join(ROOT, 'runtime', f), 'utf8')));
  const data = { key: project.key || `lykeion:${project.title}`, strings: project.strings || {}, levels };
  const hero = project.hero ? renderHero(project, chapters, errors) : '';
  const slots = {
    lang: esc(project.lang || 'zh-Hant-TW'), title: esc(project.title), description: esc(project.description || ''), version: pkg.version,
    eyebrow: esc(project.eyebrow || ''), palette_css: paletteCss(palette), base_css: baseCss, lab_css: labCss.join('\n'),
    hero, chapters: chapterHtml.join('\n'), data_json: JSON.stringify(data).replace(/</g, '\\u003c'),
    runtime_js: `${mathJs}\n${runtimeJs}`, lab_js: labJs.join('\n'),
  };
  // Single pass over {{slot}} markers, so slot values are never re-scanned.
  const html = shell.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`runtime/shell.html slot {{${k}}} has no value`);
    return slots[k];
  });
  if (errors.length) throw new Error(`${errors.length} build error(s):\n  - ${errors.join('\n  - ')}`);

  const out = resolve(dir, opts.out || project.output || `${project.title}.html`);
  await writeFile(out, html);
  if (opts.writeChecks !== false) await writeFile(join(dir, 'checks.json'), JSON.stringify({ built: new Date().toISOString(), output: basename(out), scope: project.scope || [], sections: collectSections(chapters), checks }, null, 2) + '\n');
  return { out, sections: sectionCount, questions: levels.reduce((s, l) => s + l.qs.length, 0), labs: labCount };
}

async function loadChapters(contentDir) {
  let files;
  try { files = (await readdir(contentDir)).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  const out = [];
  for (const file of files) {
    const raw = await readFile(join(contentDir, file), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`${file}: missing YAML front matter (--- … ---)`);
    const meta = yaml.load(m[1]) || {};
    if (!meta.title) throw new Error(`${file}: front matter needs "title"`);
    out.push({ file, meta, body: m[2] });
  }
  return out;
}

// "## 3.1 Title {pages=3-5}" starts a section; text before the first one is the chapter intro.
const SEC_RE = /^##\s+(\d+(?:\.\d+)*)\s+(.+?)\s*(?:\{([^}]*)\})?\s*$/;
function splitSections(ch) {
  const lines = ch.body.split(/\r?\n/);
  const secs = [{ num: null, body: [] }];
  let inFence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && SEC_RE.exec(line);
    if (m) {
      const attrs = Object.fromEntries([...(m[3] || '').matchAll(/(\w+)=("[^"]*"|\S+)/g)].map(([, k, v]) => [k, v.replace(/^"|"$/g, '')]));
      secs.push({ num: m[1], title: m[2], pages: attrs.pages || null, id: attrs.id || `s${m[1].replace(/\./g, '-')}`, body: [] });
    } else secs[secs.length - 1].body.push(line);
  }
  return secs.map((s) => ({ ...s, body: s.body.join('\n') })).filter((s) => s.num || s.body.trim());
}

function collectSections(chapters) {
  return chapters.flatMap((ch) => splitSections(ch).filter((s) => s.num).map((s) => ({ file: ch.file, source: ch.meta.source || null, num: s.num, id: s.id, title: s.title, pages: s.pages })));
}

function inlineTitle(t, errors, where) {
  return esc(t).replace(/\$([^$]+)\$/g, (_, x) => tex(x, false, errors, where));
}

function renderHero(project, chapters, errors) {
  const h = project.hero;
  const toc = chapters.map((ch) => {
    const id = `ch${String(ch.meta.chapter ?? '').replace(/\W+/g, '-') || chapters.indexOf(ch) + 1}`;
    return `<a href="#${esc(id)}"><span class="n">${esc(ch.meta.label ?? `CHAPTER ${ch.meta.chapter ?? ''}`)}</span><b>${esc(ch.meta.short ?? ch.meta.title)}</b>${ch.meta.summary ? `<span>${esc(ch.meta.summary)}</span>` : ''}</a>`;
  }).join('');
  return `<header class="hero"><div class="eyebrow">${esc(h.eyebrow || project.eyebrow || '')}</div><h1>${h.title || esc(project.title)}</h1>${h.intro ? `<p>${esc(h.intro)}</p>` : ''}<nav class="toc" aria-label="toc">${toc}</nav></header>`;
}

// ---------- custom fenced blocks ----------
function renderFence(token, ctx, countLab) {
  const [kind, ...rest] = token.info.trim().split(/\s+/);
  const arg = rest.join(' ');
  const md = createMarkdown(ctx);
  const src = token.content;
  switch (kind) {
    case 'formula':
      return `<div class="formula">${arg ? `<span class="tag">${esc(arg)}</span>` : ''}${tex(src.trim(), true, ctx.errors, ctx.where)}</div>\n`;
    case 'note':
      return `<div class="note">${md.renderInline(src.trim())}</div>\n`;
    case 'callout':
      return `<div class="callout">${arg ? `<span class="lbl">${esc(arg)}</span>` : ''}${md.render(src)}</div>\n`;
    case 'erratum': {
      const e = parseYaml(src, ctx, 'erratum');
      if (!e) return '';
      if (!e.text || !e.ref) { ctx.errors.push(`${ctx.where}: erratum needs "text" and "ref"`); return ''; }
      return `<aside class="erratum"><span class="lbl">${esc(ctx.S.erratum)}</span>${md.render(String(e.text))}<cite>${md.renderInline(String(e.ref))}</cite></aside>\n`;
    }
    case 'calc': {
      const list = parseYaml(src, ctx, 'calc');
      for (const c of [].concat(list || [])) {
        if (c.expr === undefined || c.expect === undefined) { ctx.errors.push(`${ctx.where}: calc entries need "expr" and "expect"`); continue; }
        ctx.checks.push({ where: ctx.where, kind: 'calc', expr: String(c.expr), expect: Number(c.expect), tol: Number(c.tol ?? 0.0015), note: c.note || '' });
      }
      return '';
    }
    case 'quiz':
      addQuiz(parseYaml(src, ctx, 'quiz'), arg, ctx, md);
      return '';
    case 'lab':
      countLab();
      return renderLab(arg, parseYaml(src, ctx, 'lab') || {}, ctx);
    default: {
      const lang = kind ? ` class="language-${esc(kind)}"` : '';
      return `<pre><code${lang}>${esc(src)}</code></pre>\n`;
    }
  }
}

function parseYaml(src, ctx, kind) {
  try { return yaml.load(src); } catch (e) { ctx.errors.push(`${ctx.where}: invalid YAML in ${kind} block: ${e.message.split('\n')[0]}`); return null; }
}

function addQuiz(items, levelArg, ctx, md) {
  if (!items) return;
  const list = Array.isArray(items) ? items : items.questions || [];
  const levelTitle = (Array.isArray(items) ? null : items.level) || levelArg || ctx.chapter.meta.short || ctx.chapter.meta.title;
  if (!ctx.levelIndex.has(levelTitle)) { ctx.levelIndex.set(levelTitle, ctx.levels.length); ctx.levels.push({ t: levelTitle, s: '', qs: [] }); }
  const li = ctx.levelIndex.get(levelTitle);
  if (!ctx.chLevels.includes(li)) ctx.chLevels.push(li);
  for (const [k, q] of list.entries()) {
    const w = `${ctx.where} quiz #${k + 1}`;
    if (!q || !q.q || q.a === undefined || !q.ex) { ctx.errors.push(`${w}: needs q, a, ex`); continue; }
    const num = q.type === 'num';
    if (!num && (!Array.isArray(q.o) || q.o.length < 2 || !Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length)) { ctx.errors.push(`${w}: choice items need o[] and a valid index a`); continue; }
    if (num && typeof q.a !== 'number') { ctx.errors.push(`${w}: num items need a numeric a`); continue; }
    const inl = (s) => { const c = { ...ctx, where: w }; return createMarkdown(c).renderInline(String(s)); };
    const item = { type: num ? 'num' : 'choice', q: inl(q.q), ex: inl(q.ex), a: q.a, sec: ctx.sec.id, pages: q.pages || ctx.sec.pages || '' };
    if (num) item.tol = Number(q.tol ?? 0);
    else item.o = q.o.map(inl);
    ctx.levels[li].qs.push(item);
    if (num && q.calc !== undefined) ctx.checks.push({ where: w, kind: 'quiz', expr: String(q.calc), expect: q.a, tol: Math.max(Number(q.tol ?? 0), 1e-9) });
    if (num && q.calc === undefined) ctx.checks.push({ where: w, kind: 'quiz-missing-calc', expect: q.a });
  }
}

function renderLab(type, p, ctx) {
  if (!type) { ctx.errors.push(`${ctx.where}: lab block needs a type, e.g. \`\`\`lab slider-calc`); return ''; }
  ctx.labsUsed.add(type);
  // `text` / `note` values are inline Markdown with maths, rendered here so Labs receive HTML.
  const md = createMarkdown(ctx);
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === 'text' || k === 'note') && typeof x === 'string' ? md.renderInline(x) : walk(x)]));
    return v;
  };
  p = walk(p);
  ctx.labUses.push({ type, params: p, where: ctx.where });
  ctx.labSeq.n++;
  const id = p.id || `lab-${ctx.labSeq.n}`;
  const params = JSON.stringify(p).replace(/</g, '\\u003c');
  // Labs break out of the 44rem reading column.
  return `</div>\n<div class="lab" id="${esc(id)}" data-lab="${esc(type)}"><div class="lab-head"><span class="tag">${esc(p.tag || 'LAB')}</span><b>${esc(p.title || '')}</b>${p.hint ? `<span class="hint">${esc(p.hint)}</span>` : ''}</div><div class="lab-body"></div><script type="application/json" class="lab-params">${params}</script></div>\n<div class="prose">`;
}

async function findLab(type, dir) {
  for (const base of [join(ROOT, 'labs', type), join(dir, 'labs', type)]) {
    try {
      await access(join(base, 'lab.js'));
      const js = await readFile(join(base, 'lab.js'), 'utf8');
      const css = await readFile(join(base, 'lab.css'), 'utf8').catch(() => '');
      const schema = await readFile(join(base, 'schema.json'), 'utf8').then(JSON.parse, () => null);
      return { js, css, schema };
    } catch { /* try next */ }
  }
  return null;
}

// Unknown Lab parameters are errors: a misspelt or unsupported key would otherwise be ignored silently.
export function checkLabParams(schema, { type, params, where }) {
  const errs = [];
  for (const k of Object.keys(params)) if (!schema.keys.includes(k)) errs.push(`${where}: Lab "${type}" has no parameter "${k}" (allowed: ${schema.keys.join(', ')})`);
  for (const [k, allowed] of Object.entries(schema.items || {})) {
    for (const [i, item] of (Array.isArray(params[k]) ? params[k] : []).entries()) {
      if (!item || typeof item !== 'object') continue;
      for (const key of Object.keys(item)) if (!allowed.includes(key)) errs.push(`${where}: Lab "${type}" ${k}[${i}] has no key "${key}" (allowed: ${allowed.join(', ')})`);
    }
  }
  return errs;
}
