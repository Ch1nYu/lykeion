// `lykeion build`: chapter Markdown + fixed runtime + Palette → one self-contained Lecture Site.
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { createMarkdown, tex, fenceInfo, headingIds } from './markdown.mjs';
import { plainText, charCount, TEXTY, loadTeachingConfig } from './teaching.mjs';
import { loadPalette, paletteCss } from './palette.mjs';
import { projectMathSource, applyProjectMath } from './mathlib.mjs';
import { parsePages } from './verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const help = `lykeion build [project-dir] [--palette id] [--out file]

project-dir contains lykeion.json and content/*.md (default: current directory).
Writes the Lecture Site (lykeion.json "output", default <title>.html) and checks.json for "lykeion verify".
Fails on any TeX, quiz, erratum or Lab error.`;

const BUILD_STR = { challenge: '挑戰第 {n} 關：{t} →', pages: '講義 p.{p}', erratum: '勘誤／補充', quizTitle: '隨堂闖關', quizNum: 'QUIZ', quizSec: '闖關地圖', quizSub: '答對 60% 以上解鎖下一關；星等依正確率計算', home: '總覽', prevView: '上一章', nextView: '下一章', pagerLabel: '上一章／下一章' };
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

  // One entry per view (the hero and each chapter); the pager needs the whole sequence, so the
  // per-chapter markup is collected first and the pagers are appended once the order is known.
  const viewList = [];
  const chapterViews = [];
  // The build applies two of the teaching rules itself (how many parts a `formula` needs, and how
  // many of them must explain something), so it reads the same JSON the gate does — plus the
  // project's own override, so a project that relaxes a rule relaxes it in both places.
  const { rules: teachingRules } = await loadTeachingConfig(project.teaching || {});
  // What the `teaching` gate reads back: each section's blocks in document order, and the plain text
  // of every quiz item (a page reference in a question is as bad as one in a paragraph).
  const teachingSections = [];
  const teachingQuiz = [];
  // Every section number in the site, so a quiz `sec` pointing at another chapter's section is caught.
  const allSectionNums = chapters.flatMap((ch) => splitSections(ch).filter((s) => s.num).map((s) => s.num));
  for (const ch of chapters) {
    const sections = splitSections(ch);
    const chNum = ch.meta.chapter ?? '';
    const chId = `ch${String(chNum).replace(/\W+/g, '-') || chapters.indexOf(ch) + 1}`;
    const chLevels = [];
    let out = `<div class="chapter view" id="${esc(chId)}" data-num="${esc(ch.meta.label ?? `CH ${chNum}`)}" data-title="${esc(ch.meta.short ?? ch.meta.title)}">\n`;
    out += `<div class="ch-head"><span class="ch-n">${esc(String(chNum).padStart(2, '0'))}</span><h2>${esc(ch.meta.title)}</h2>${ch.meta.subtitle ? `<span class="src">${esc(ch.meta.subtitle)}</span>` : ''}</div>\n`;
    for (const sec of sections) {
      const where = `${ch.file}${sec.num ? ` §${sec.num}` : ''}`;
      const ctx = { errors, where, sec, secs: sections, allSectionNums, chapter: ch, levels, levelIndex, chLevels, checks, labsUsed, labSeq, labUses, project, S, quizText: teachingQuiz, teachingRules, formulaSeq: { n: 0 } };
      const md = createMarkdown(ctx);
      md.renderer.rules.fence = (tokens, i) => renderFence(tokens[i], ctx, () => labCount++);
      const tokens = md.parse(sec.body, {});
      // Only a numbered section can name a heading: the intro above the first `##` has no id to prefix,
      // so numbering its headings would collide across chapters (`undefined-1`).
      const rendered = md.renderer.render(tokens, md.options, ctx);
      const body = sec.id && sec.num ? headingIds(rendered, sec.id) : rendered;
      for (const leak of literalMarkers(body)) errors.push(`${where}: literal ${leak} left in prose — emphasis did not close (check for a marker next to punctuation)`);
      if (!sec.num) { out += `<div class="prose">${body}</div>\n`; continue; }
      teachingSections.push({ id: sec.id, num: sec.num, title: sec.title, file: ch.file, blocks: collectBlocks(tokens) });
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
    chapterViews.push({ id: chId, num: ch.meta.label ?? `CH ${chNum}`, title: ch.meta.short ?? ch.meta.title, html: out.replace(/<div class="prose">\s*<\/div>\n?/g, '') });
  }

  for (const [t, sub] of Object.entries(project.levels || {})) { const i = levelIndex.get(t); if (i !== undefined) levels[i].s = sub; }
  if (levels.length) {
    chapterViews.push({ id: 'quizCh', num: S.quizNum, title: S.quizTitle, html: `<div class="chapter view" id="quizCh" data-num="${esc(S.quizNum)}" data-title="${esc(S.quizTitle)}">
<div class="ch-head"><span class="ch-n">★</span><h2>${esc(S.quizTitle)}</h2><span class="src">${esc(S.quizSub)}</span></div>
<section class="sec" id="quiz" data-num="Q" data-title="${esc(S.quizSec)}" data-quiz="1">
<h3><span class="sn">§Q</span><span class="t">${esc(S.quizSec)}</span></h3>
<div class="quiz"><div class="trail" id="trail"></div><div id="qStage"></div></div>
<div class="sec-end"></div>
</section>
</div>` });
  }

  // Lab assets: repo Lab types first, then project-local custom Labs.
  const labJs = [], labCss = [];
  for (const type of labsUsed) {
    const found = await findLab(type, dir);
    if (!found) { errors.push(`Lab type "${type}" not found in labs/ or ${join(dir, 'labs')}`); continue; }
    const uses = labUses.filter((x) => x.type === type);
    if (found.schema) for (const u of uses) errors.push(...checkLabParams(found.schema, u));
    labJs.push(`/* Lab: ${type} */\n${found.js}`);
    if (found.css) labCss.push(`/* Lab: ${type} */\n${found.css}`);
  }

  if (errors.length) throw new Error(`${errors.length} build error(s):\n  - ${errors.join('\n  - ')}`);

  const palette = opts.paletteObj || await loadPalette(opts.palette || project.palette || 'desk-teal');
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const [shell, baseCss, mathJs, runtimeJs] = await Promise.all(['shell.html', 'base.css', 'mathlib.js', 'runtime.js'].map((f) => readFile(join(ROOT, 'runtime', f), 'utf8')));
  const projectMath = await projectMathSource(dir);
  if (projectMath.trim()) {
    // Fail here, at build time, naming math.js — not later inside the reader's browser.
    applyProjectMath(new Function(`${mathJs}\nreturn LykeionMath;`)(), projectMath);
  }
  const data = { key: project.key || `lykeion:${project.title}`, strings: project.strings || {}, levels };
  const hero = project.hero ? `<div class="view" id="home">${renderHero(project, chapters, errors)}</div>` : '';
  // The pager closes every chapter view with the previous and the next one, so a reader can keep
  // going without returning to the index.
  // The hero title may carry inline markup (<em>); the pager wants its plain text.
  const heroTitle = String(project.hero?.title || project.title).replace(/<[^>]+>/g, '');
  viewList.push(...(hero ? [{ id: 'home', num: '', title: heroTitle }] : []), ...chapterViews.map((v) => ({ id: v.id, num: v.num, title: v.title })));
  const pagerFor = (id) => {
    const i = viewList.findIndex((v) => v.id === id);
    if (i < 0) return '';
    const prev = viewList[i - 1], next = viewList[i + 1];
    const link = (v, cls, label) => `<a class="${cls}" href="#${esc(v.id)}"><span>${esc(label)}</span><b>${esc(v.num ? `${v.num} ${v.title}` : v.title)}</b></a>`;
    return `<nav class="pager" aria-label="${esc(S.pagerLabel)}">${prev ? link(prev, 'prev', S.prevView) : '<span></span>'}${next ? link(next, 'next', S.nextView) : ''}</nav>`;
  };
  // The pager goes last inside the view, before its closing tag (the view's own markup may contain
  // other `</div>` lines, so close it from the end).
  const withPager = (v) => {
    const close = v.html.lastIndexOf('</div>');
    return v.html.slice(0, close) + pagerFor(v.id) + '\n' + v.html.slice(close);
  };
  const chaptersHtml = chapterViews.map(withPager).join('\n');
  const slots = {
    lang: esc(project.lang || 'zh-Hant-TW'), title: esc(project.title), description: esc(project.description || ''), version: pkg.version,
    eyebrow: esc(project.eyebrow || ''), palette_css: paletteCss(palette), base_css: baseCss, lab_css: labCss.join('\n'),
    store_key: JSON.stringify(data.key).replace(/</g, '\\u003c'),
    hero, chapters: chaptersHtml, data_json: JSON.stringify(data).replace(/</g, '\\u003c'),
    runtime_js: `${mathJs}\n${projectMath}\n${runtimeJs}`, lab_js: labJs.join('\n'),
  };
  // Single pass over {{slot}} markers, so slot values are never re-scanned.
  const html = shell.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`runtime/shell.html slot {{${k}}} has no value`);
    return slots[k];
  });
  if (errors.length) throw new Error(`${errors.length} build error(s):\n  - ${errors.join('\n  - ')}`);

  const out = resolve(dir, opts.out || project.output || `${project.title}.html`);
  await writeFile(out, html);
  // `levels` is written for the quiz-review gate: it reads the stem and the options, which only exist here.
  const levelDump = levels.map((l) => ({ t: l.t, qs: l.qs.map((q) => ({ type: q.type, q: q.q, a: q.a, o: q.o || [], sec: q.sec })) }));
  if (opts.writeChecks !== false) await writeFile(join(dir, 'checks.json'), JSON.stringify({ built: new Date().toISOString(), output: basename(out), scope: project.scope || [], sections: collectSections(chapters), levels: levelDump, checks, teaching: { sections: teachingSections, quiz: teachingQuiz } }, null, 2) + '\n');
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

// A literal `**` / `__` that survived rendering means an author wrote emphasis the renderer could not
// pair. It ships as visible asterisks, so treat it as a build error (same stance as unrendered TeX).
// Only prose counts: code, fences, maths and Lab parameters may legitimately contain `**` (Python `2 ** 8`).
function literalMarkers(html) {
  const prose = html
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<code[\s\S]*?<\/code>/g, ' ')
    .replace(/<math[\s\S]*?<\/math>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return ['**', '__'].filter((m) => prose.includes(m));
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

// ---------- teaching data (checks.json "teaching") ----------
// The `teaching` gate counts block kinds and reads the prose, so the build records what each section
// is made of: the tokens are already parsed for rendering, so this walks them instead of re-parsing
// the HTML. `chars` is what a reader actually reads — no whitespace, no maths (a formula's characters
// are not prose the gate should count, and `$$…$$` has already been lifted out of the paragraphs).
// `text` is kept for the kinds the gate reads as sentences (lexicon, page references).

function collectBlocks(tokens) {
  const blocks = [];
  // How many list levels deep the walk is; a paragraph at depth > 0 belongs to a list item.
  let listDepth = 0;
  const push = (kind, text = '') => {
    const t = TEXTY.has(kind) ? plainText(text) : '';
    const b = { kind, chars: charCount(text) };
    if (t) b.text = t;
    blocks.push(b);
  };
  // Fence tokens carry their info string; the custom blocks are named there.
  const fenceKind = (t) => {
    const { lang, words } = fenceInfo(t.info);
    const arg = words.slice(1).join(' ');
    if (lang === 'formula') return isFormulaParts(t.content) ? 'formula-parts' : 'formula';
    if (lang === 'lab') return `lab:${arg}`;
    if (['note', 'callout', 'analogy', 'takeaway'].includes(lang)) return lang;
    // quiz and calc render no prose of their own (the quiz text is listed per item instead).
    if (lang === 'quiz' || lang === 'calc') return null;
    if (lang === 'erratum') return 'erratum';
    return 'code';
  };
  // The visible words of a table are its cells; its pipes and dashes are layout.
  const tableText = (at) => {
    const parts = [];
    for (let i = at + 1; i < tokens.length && tokens[i].type !== 'table_close'; i++) if (tokens[i].type === 'inline') parts.push(inlineText(tokens[i]));
    return parts.join(' ');
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'fence': {
        const kind = fenceKind(t);
        // A formula's own characters are maths, not prose; only a parts formula carries words.
        if (kind === 'erratum') push(kind, String(parseYamlText(t.content).text || ''));
        else if (kind === 'formula-parts') push(kind, formulaPartsText(t.content));
        else if (kind) push(kind, kind.startsWith('lab:') || kind === 'formula' ? '' : t.content);
        break;
      }
      case 'math_block': push('display-math'); break;
      // The gate's vocabulary stops at h4; a deeper heading still breaks a prose run, so it counts as one.
      case 'heading_open': push(t.tag === 'h3' ? 'h3' : 'h4', inlineText(tokens[i + 1])); break;
      case 'table_open': push('table', tableText(i)); break;
      // A paragraph inside a list item is part of that list: the list block already carries its words,
      // so recording it again would report the same sentence twice (once as `list`, once as `p`).
      case 'paragraph_open': if (!listDepth) push('p', inlineText(tokens[i + 1])); break;
      case 'bullet_list_open':
      case 'ordered_list_open':
        push('list', listText(tokens, i));
        listDepth++;
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        listDepth = Math.max(0, listDepth - 1);
        break;
      default: break;
    }
  }
  return blocks;
}

// The YAML body of an `erratum` block, read leniently: this only feeds the char count.
function parseYamlText(src) {
  try { const v = yaml.load(src); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

// The words of a parts formula: the `say` sentences and the `hint`, never the TeX or the YAML keys.
function formulaPartsText(src) {
  const v = parseYamlText(src);
  const says = (Array.isArray(v.parts) ? v.parts : []).map((p) => (p && typeof p === 'object' ? String(p.say || '') : ''));
  return [...says, String(v.hint || '')].join(' ');
}

// The text of an inline token: its children, minus maths (which the gate must not count as prose).
function inlineText(t) {
  if (!t || t.type !== 'inline') return '';
  return t.children.map((c) => (c.type === 'math_inline' ? '' : c.type === 'softbreak' || c.type === 'hardbreak' ? ' ' : c.content || '')).join('');
}

// A list is one block: every item's text, so the gate can read it as a sentence run.
function listText(tokens, at) {
  const parts = [];
  // Count nesting so a sub-list inside an item does not end the outer list early.
  let depth = 0;
  for (let i = at; i < tokens.length; i++) {
    const type = tokens[i].type;
    if (type === 'bullet_list_open' || type === 'ordered_list_open') depth++;
    else if (type === 'bullet_list_close' || type === 'ordered_list_close') {
      depth--;
      if (!depth) break;
    } else if (type === 'inline') parts.push(inlineText(tokens[i]));
  }
  return parts.join(' ');
}

// ---------- custom fenced blocks ----------
function renderFence(token, ctx, countLab) {
  const { lang: kind, attrs, words } = fenceInfo(token.info);
  const arg = words.slice(1).join(' ');
  const md = createMarkdown(ctx);
  const src = token.content;
  switch (kind) {
    case 'formula': {
      // Two forms. The body is TeX (the original form, kept verbatim); if it parses as a YAML mapping
      // with `tex`, it is a formula broken into clickable parts, each with the words that explain it.
      if (!isFormulaParts(src)) {
        return `<div class="formula">${arg ? `<span class="tag">${esc(arg)}</span>` : ''}${tex(src.trim(), true, ctx.errors, ctx.where)}</div>\n`;
      }
      return renderFormulaParts(parseYaml(src, ctx, 'formula'), arg, ctx, md);
    }
    case 'analogy':
      return `<div class="analogy">${arg ? `<b class="tag">${md.renderInline(arg)}</b>` : ''}<div class="body">${md.render(src.trim())}</div></div>\n`;
    case 'takeaway':
      return `<div class="takeaway">${md.render(src.trim())}</div>\n`;
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
      // A plain fence is a code listing: a language label, an optional `title="…"` caption, and the
      // code itself. No syntax highlighting — a Lecture Site must work offline with no dependencies.
      const cls = kind ? ` class="language-${esc(kind)}"` : '';
      const bar = kind || attrs.title
        ? `<div class="code-bar">${kind ? `<span class="code-lang">${esc(kind)}</span>` : ''}${attrs.title ? `<span class="code-cap">${esc(attrs.title)}</span>` : ''}</div>`
        : '';
      return `<div class="code">${bar}<pre><code${cls}>${esc(src)}</code></pre></div>\n`;
    }
  }
}

function parseYaml(src, ctx, kind) {
  try { return yaml.load(src); } catch (e) { ctx.errors.push(`${ctx.where}: invalid YAML in ${kind} block: ${e.message.split('\n')[0]}`); return null; }
}

// A `formula` body is TeX, unless it is a YAML mapping with a `tex` key — then it is a formula broken
// into parts. TeX almost never survives YAML (a `\` starts a control sequence and `{` starts a flow
// mapping, both of which throw), but a one-word formula like `E[X] = np` loads as a plain string, so
// the shape decides, not whether the parse threw.
function isFormulaParts(src) {
  const text = String(src || '').trim();
  if (!text.startsWith('{') && !/^tex\s*:/m.test(text)) return false;
  let v;
  try { v = yaml.load(text); } catch { return false; }
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.tex === 'string';
}

const squash = (s) => String(s || '').replace(/\s+/g, '');

// A formula taught piece by piece: the pieces are laid out in order as buttons, and one explanation
// area (the stack pattern) shows the words for whichever piece is selected. Everything is rendered at
// build time — the runtime only toggles classes and `aria-pressed` — so the block still reads as a
// complete formula with no JavaScript, and the whole formula is also present once, visually hidden,
// for assistive technology (which would otherwise read the pieces as a broken sentence).
function renderFormulaParts(parts, label, ctx, md) {
  if (!parts) return '';
  const rule = ctx.teachingRules?.formulaParts || {};
  const minParts = Number(rule.minParts ?? 2);
  const minExplained = Number(rule.minExplained ?? 2);
  const whole = String(parts.tex || '');
  const list = Array.isArray(parts.parts) ? parts.parts : [];
  if (list.length < minParts) { ctx.errors.push(`${ctx.where}: formula with parts needs at least ${minParts} parts`); return ''; }

  // 1. The pieces must spell the whole formula. Whitespace is free (layout is not content), so it is
  //    dropped on both sides before comparing; anything else is a typo the reader would see twice.
  const spelled = list.map((p) => (typeof p === 'string' ? p : p && p.tex) || '').join('');
  if (squash(spelled) !== squash(whole)) {
    ctx.errors.push(`${ctx.where}: formula parts do not spell its tex — parts give "${squash(spelled).slice(0, 60)}", tex is "${squash(whole).slice(0, 60)}"`);
  }

  // 2. A clickable piece with nothing to say is a dead end: at least `minExplained` must carry `say`.
  const says = list.filter((p) => p && typeof p === 'object' && String(p.say || '').trim()).length;
  if (says < minExplained) ctx.errors.push(`${ctx.where}: formula parts need at least ${minExplained} parts with "say" (found ${says})`);

  const cells = [];
  const keys = [];
  list.forEach((p, i) => {
    const piece = typeof p === 'string' ? { tex: p } : (p || {});
    const html = tex(String(piece.tex || ''), true, ctx.errors, ctx.where);
    const say = String(piece.say || '').trim();
    // A piece with no `say` is still part of the formula, just not clickable — an operator or a
    // bracket that needs no explanation.
    cells.push(say
      ? `<button type="button" class="piece" data-part="${i}" aria-pressed="${keys.length === 0 ? 'true' : 'false'}">${html}</button>`
      : `<span class="piece static">${html}</span>`);
    if (say) keys.push({ i, html: md.renderInline(say) });
  });

  // The explanation area is the stack pattern: every `say` is rendered up front in the same grid cell,
  // so choosing a piece never changes the height of the block. The first clickable piece starts
  // selected, so the area is never empty on arrival.
  const id = `${esc(ctx.sec.id || 'intro')}-f${ctx.formulaSeq.n}`;
  ctx.formulaSeq.n++;
  const say = keys.length
    ? `<div class="say stack" id="${id}-say">${keys.map((k, n) => `<span data-part="${k.i}"${n === 0 ? ' class="on"' : ''}>${k.html}</span>`).join('')}<span class="sr-only" aria-live="polite"></span></div>`
    : '';
  return `<div class="formula parts"${label ? ` data-label="${esc(label)}"` : ''}><div class="eq">${cells.join('')}</div>${say}${parts.hint ? `<p class="hint">${md.renderInline(String(parts.hint))}</p>` : ''}<span class="sr-only">${tex(whole, true, ctx.errors, ctx.where)}</span></div>\n`;
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
    // The gate reads quiz text as body text: a page reference or a filler phrase is as bad in a
    // question as in a paragraph, and this is the only place the plain strings still exist.
    ctx.quizText.push({ where: w, q: plainText(q.q), o: (Array.isArray(q.o) ? q.o : []).map(plainText), ex: plainText(q.ex) });
    const item = { type: num ? 'num' : 'choice', q: inl(q.q), ex: inl(q.ex), a: q.a, sec: quizSection(q, ctx, w), pages: q.pages || ctx.sec.pages || '' };
    if (num) item.tol = Number(q.tol ?? 0);
    else item.o = q.o.map(inl);
    ctx.levels[li].qs.push(item);
    if (num && q.calc !== undefined) ctx.checks.push({ where: w, kind: 'quiz', expr: String(q.calc), expect: q.a, tol: Math.max(Number(q.tol ?? 0), 1e-9) });
    if (num && q.calc === undefined) ctx.checks.push({ where: w, kind: 'quiz-missing-calc', expect: q.a });
  }
}

// Which section a quiz item links back to. A quiz block usually sits at the end of a chapter, so the
// block's own section is rarely the one the item tests: an explicit `sec` wins, then the first section
// of this chapter whose `pages` contain the item's page, then the block's section (the old behaviour).
function quizSection(q, ctx, where) {
  const secs = ctx.secs || [];
  if (q.sec !== undefined) {
    const want = String(q.sec);
    const hit = secs.find((s) => s.num === want);
    if (hit) return hit.id;
    // A section number that exists in another chapter is a copy-paste slip, not a typo.
    const elsewhere = (ctx.allSectionNums || []).includes(want);
    ctx.errors.push(`${where}: sec "${want}" ${elsewhere ? 'is in another chapter' : 'names no section in this chapter'}`);
    return ctx.sec.id;
  }
  if (q.pages) {
    let want;
    try { want = parsePages(q.pages); } catch { return ctx.sec.id; }
    const hit = secs.find((s) => s.pages && [...parsePages(s.pages)].some((p) => want.has(p)));
    if (hit) return hit.id;
  }
  return ctx.sec.id;
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
// `enums` constrains a value nested inside a list item: `{ enums: { steps: { 'chips.state': [...] } } }`
// means every `steps[i].chips[j].state` must be one of the listed values. An absent value is allowed
// (the Lab then falls back to its neutral look); only a value the author did write is checked.
export function checkLabParams(schema, { type, params, where }) {
  const errs = [];
  for (const k of Object.keys(params)) if (!schema.keys.includes(k)) errs.push(`${where}: Lab "${type}" has no parameter "${k}" (allowed: ${schema.keys.join(', ')})`);
  for (const [k, allowed] of Object.entries(schema.items || {})) {
    for (const [i, item] of (Array.isArray(params[k]) ? params[k] : []).entries()) {
      if (!item || typeof item !== 'object') continue;
      for (const key of Object.keys(item)) if (!allowed.includes(key)) errs.push(`${where}: Lab "${type}" ${k}[${i}] has no key "${key}" (allowed: ${allowed.join(', ')})`);
      for (const [path, values] of Object.entries((schema.enums || {})[k] || {})) {
        // Walk the dotted path, fanning out over any array met on the way.
        let at = [{ v: item, at: `${k}[${i}]` }];
        for (const seg of path.split('.')) {
          at = at.flatMap((n) => {
            const v = n.v == null ? undefined : n.v[seg];
            if (Array.isArray(v)) return v.map((x, j) => ({ v: x, at: `${n.at}.${seg}[${j}]` }));
            return [{ v, at: `${n.at}.${seg}` }];
          });
        }
        for (const found of at) {
          if (found.v != null && !values.includes(found.v)) errs.push(`${where}: Lab "${type}" ${found.at} "${found.v}" must be one of ${values.join(', ')}`);
        }
      }
    }
  }
  // Single-object parameters (e.g. a `range: { value, min, max }` control) get the same key check,
  // so a typo like `minimum:` fails the build instead of being silently ignored.
  for (const [k, allowed] of Object.entries(schema.objects || {})) {
    const obj = params[k];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) errs.push(`${where}: Lab "${type}" ${k} has no key "${key}" (allowed: ${allowed.join(', ')})`);
  }
  return errs;
}

