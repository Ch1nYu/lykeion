// `lykeion verify`: the verification gates for a built Lecture Site → verify-report.md.
//   1 render          (headless browser: errors, maths, Labs, links, quiz, mobile, dark)
//   2 numeric         (every calc / number quiz answer recomputed)
//   3 coverage        (every Scope page cited by a section)
//   4 quiz review     (no option gives the answer away)
//   5 teaching        (the writing teaches: formulas explained, no walls of prose, no filler)
//   6 source          (agent review against the Primary Source; read from source-check.md when present)
//   7 teaching review (agent review of the teaching; read from teaching-review.md when present)
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { loadMath } from './mathlib.mjs';
import { teachingGate, loadTeachingConfig } from './teaching.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const help = `lykeion verify [project-dir] [--no-render]

Runs the gates on the last build (run "lykeion build" first) and writes <project>/verify-report.md.
Exit code 1 if any gate fails. Gate 4 (source) comes from <project>/source-check.md, written by the agent; a
Reviewer line in its header says whether the reviewer was independent or the writing agent itself.`;

export async function run(args) {
  const dir = resolve(args.find((a) => !a.startsWith('--')) || '.');
  const r = await verify(dir, { render: !args.includes('--no-render') });
  console.log(r.summary);
  console.log(`report → ${r.reportPath}`);
  if (!r.ok) process.exitCode = 1;
}

export async function verify(dir, { render = true } = {}) {
  const checksFile = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8').catch(() => { throw new Error(`no checks.json in ${dir}; run "lykeion build" first`); }));
  const project = JSON.parse(await readFile(join(dir, 'lykeion.json'), 'utf8'));
  const htmlPath = join(dir, checksFile.output);

  const gates = [];
  gates.push(numericGate(checksFile.checks, await loadMath(dir)));
  gates.push(coverageGate(project.scope || [], checksFile.sections));
  gates.push(quizReviewGate(checksFile.levels || []));
  gates.push(teachingGate(checksFile.teaching, project, await loadTeachingConfig(project.teaching || {})));
  gates.push(render ? await renderGate(htmlPath) : { name: 'render', status: 'skipped', items: [{ ok: null, msg: 'skipped by --no-render — NOT render-verified' }] });
  gates.push(await sourceGate(dir));
  gates.push(await teachingReviewGate(dir));

  const ok = gates.every((g) => g.status !== 'fail');
  const report = formatReport(project, checksFile, gates, ok);
  const reportPath = join(dir, 'verify-report.md');
  await writeFile(reportPath, report);
  const summary = gates.map((g) => `${icon(g.status)} ${g.name.padEnd(9)} ${g.headline || ''}`).join('\n');
  return { ok, gates, summary, reportPath };
}

const icon = (s) => ({ pass: '✓', fail: '✗', skipped: '–', pending: '…' }[s] || '?');

// ---------- gate: numeric ----------
export function numericGate(checks, M) {
  const items = [];
  for (const c of checks || []) {
    if (c.kind === 'quiz-missing-calc') { items.push({ ok: false, msg: `${c.where}: number question has no \`calc\`, its answer ${c.expect} is unverified` }); continue; }
    let val;
    try { val = Number(M.compile(c.expr)({})); } catch (e) { items.push({ ok: false, msg: `${c.where}: cannot evaluate \`${c.expr}\`: ${e.message}` }); continue; }
    const ok = Number.isFinite(val) && Math.abs(val - c.expect) <= c.tol + 1e-12;
    items.push({ ok, msg: `${c.where}: \`${c.expr}\` = ${fmtNum(val)}, stated ${c.expect}${ok ? '' : ` (off by ${fmtNum(Math.abs(val - c.expect))}, tol ${c.tol})`}${c.note ? ` — ${c.note}` : ''}` });
  }
  const bad = items.filter((i) => !i.ok).length;
  return { name: 'numeric', status: bad ? 'fail' : 'pass', headline: `${items.length - bad}/${items.length} numbers match`, items };
}
const fmtNum = (x) => (Number.isFinite(x) ? +x.toPrecision(6) : String(x));

// ---------- gate: coverage ----------
export function parsePages(spec) {
  const out = new Set();
  for (const part of String(spec || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new Error(`bad page spec "${part}"`);
    const a = +m[1], b = +(m[2] ?? m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
  }
  return out;
}
const ranges = (nums) => {
  const s = [...nums].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`); i = j; }
  return out.join(', ');
};

export function coverageGate(scope, sections) {
  const items = [];
  if (!scope.length) return { name: 'coverage', status: 'fail', headline: 'no scope in lykeion.json', items: [{ ok: false, msg: 'lykeion.json has no "scope"; coverage cannot be checked' }] };
  const single = scope.length === 1 ? basename(scope[0].file) : null;
  for (const s of sections) if (!s.pages) items.push({ ok: false, msg: `§${s.num} ${s.title} (${s.file}) declares no pages` });
  for (const sc of scope) {
    const want = parsePages(sc.pages);
    const have = new Set();
    for (const s of sections) {
      const src = s.source ? basename(s.source) : single;
      if (src !== basename(sc.file) || !s.pages) continue;
      for (const p of parsePages(s.pages)) have.add(p);
    }
    const missing = [...want].filter((p) => !have.has(p));
    const extra = [...have].filter((p) => !want.has(p));
    items.push({ ok: missing.length === 0, msg: `${sc.file} p.${sc.pages}: ${want.size - missing.length}/${want.size} pages cited${missing.length ? `; uncited: ${ranges(missing)}` : ''}` });
    if (extra.length) items.push({ ok: true, msg: `${sc.file}: sections also cite pages outside the scope: ${ranges(extra)} (note)` });
  }
  const bad = items.filter((i) => i.ok === false).length;
  return { name: 'coverage', status: bad ? 'fail' : 'pass', headline: bad ? `${bad} problem(s)` : 'every scope page is cited', items };
}

// ---------- gate: agent reviews ----------
// Two gates read a review the agent wrote: source-check.md (are the claims right?) and
// teaching-review.md (does the writing teach?). Ideally a reviewer with fresh context writes it (a
// sub-agent, or another agent session the host provides). When no such reviewer exists the writing
// agent reviews its own content, which is allowed — but the report must not print a ✓ beside it as if
// it were an independent check, so the headline says so and the item is painted ⚠. The STATUS line
// still decides.
const REVIEWERS = {
  independent: { how: 'independent', msg: 'see {file}' },
  self: { how: 'self-review, not independent', msg: 'reviewed by the writing agent, not independently — see {file}', warn: true },
};

async function reviewGate({ name, dir, file, awaiting, missing, countDisputed = false }) {
  let txt;
  try { txt = await readFile(join(dir, file), 'utf8'); } catch {
    return { name, status: 'pending', headline: awaiting, items: [{ ok: null, msg: missing }] };
  }
  const m = /^STATUS:\s*(pass|fail)/im.exec(txt);
  const status = m ? m[1].toLowerCase() : 'fail';
  const disputed = countDisputed ? (txt.match(/^- \[disputed\]/gim) || []).length : 0;
  // Only the header counts: a `Reviewer:` quoted inside a finding is prose being checked, not a claim
  // about who did the checking. A missing line is not a failure either — projects written before the
  // line existed still verify — so both unknowns warn instead of failing.
  const head = txt.split(/^##\s/m)[0];
  const rev = /^Reviewer:\s*([^\s(]+)\s*(?:\(([^)]*)\))?/im.exec(head);
  const reviewer = rev ? rev[1].toLowerCase() : null;
  const reason = rev?.[2]?.trim() || '';
  // A self-review must say why no independent reviewer was available; without that reason it fails.
  if (reviewer === 'self' && !reason) {
    return {
      name, status: 'fail', selfReview: true, headline: `self-review without a reason (from ${file})`,
      items: [{ ok: false, msg: `Reviewer "self" needs a reason: get an independent reviewer, or write Reviewer: self (reason), e.g. Reviewer: self (no sub-agent tool in this host) — see ${file}` }],
    };
  }
  const r = REVIEWERS[reviewer] || {
    how: reviewer ? `reviewer "${reviewer}" not recognised (use independent or self)` : 'reviewer not stated',
    msg: reviewer ? `Reviewer "${reviewer}" is not a value the gate knows (use independent or self); the STATUS line still decides — see {file}` : 'reviewer not stated: the header has no Reviewer line (independent or self) — see {file}',
    warn: true,
  };
  return {
    name,
    status,
    selfReview: reviewer === 'self',
    headline: `${r.how}${reason ? ` (${reason})` : ''}${disputed ? `, ${disputed} disputed item(s) for the user` : ''} (from ${file})`,
    items: [{ ok: status === 'pass', warn: r.warn, msg: r.msg.replace('{file}', file) }],
  };
}

export function sourceGate(dir) {
  return reviewGate({
    name: 'source', dir, file: 'source-check.md', countDisputed: true,
    awaiting: 'awaiting agent review (references/source-checker.md)',
    missing: 'source-check.md not found: the agent must review claims against the cited pages',
  });
}

export function teachingReviewGate(dir) {
  return reviewGate({
    name: 'teaching review', dir, file: 'teaching-review.md',
    awaiting: 'awaiting agent review (references/teaching-reviewer.md)',
    missing: 'teaching-review.md not found: the agent must review the writing against references/teaching-reviewer.md',
  });
}

// ---------- gate: quiz review ----------
// Options are shuffled for the reader, so the source position of `a` says nothing about the answer.
// What does give it away is the options themselves: a student who has not studied can still pick the
// key when it is the one long, careful, hedged option among short absolute ones, or the one that
// repeats the stem's wording. Any such tell fails the gate — a guessable quiz does not test anything.
const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ');
const optLen = (s) => [...plain(s).replace(/\s+/g, '')].length;
// Absolute words make a distractor easy to rule out; hedges make the key easy to spot.
const ABSOLUTE = /一定|必定|必然|絕對|完全|永遠|從不|從來|總是|所有|任何|全部|都能|都會|都不|只要|不可能|always|never|every|all\b|only\b|none\b|completely/i;
// Bare 較 and 相對 are left out: they also occur in plain words such as 比較 and 相對於.
const HEDGE = /通常|多半|大多|可能|不一定|未必|並非|往往|一般而言|usually|often|may\b|might\b|typically|generally/i;
// Terms of the stem: CJK bigrams and Latin words, so wording echoed from the question can be counted.
function terms(s) {
  const t = plain(s).toLowerCase(), out = new Set();
  const cjk = t.replace(/[^㐀-鿿]+/g, ' ').split(' ').filter(Boolean);
  for (const run of cjk) for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  for (const w of t.match(/[a-z][a-z0-9_-]{2,}/g) || []) out.add(w);
  return out;
}
const isNumeric = (s) => /^[\s$\\\d.,+\-−×*/^()%{}a-z]*$/i.test(plain(s)) && /\d/.test(plain(s));

// The tells of one choice item, as short reasons (empty when the options give nothing away).
export function optionTells(q) {
  const o = q.o || [], a = q.a, tells = [];
  if (o.length < 2 || a == null || !o[a]) return tells;
  if (o.every(isNumeric)) return tells; // numbers: length and wording carry no hint
  const others = o.filter((_, i) => i !== a);
  const L = optLen(o[a]), maxOther = Math.max(...others.map(optLen));
  if (L > maxOther && L - maxOther >= 3 && L >= 1.25 * maxOther) tells.push(`right option is clearly the longest (${L} vs ≤ ${maxOther} chars)`);
  const absOthers = others.filter((s) => ABSOLUTE.test(plain(s))).length;
  if (!ABSOLUTE.test(plain(o[a])) && absOthers >= 2) tells.push(`${absOthers} distractors use absolute words, the right option none`);
  if (HEDGE.test(plain(o[a])) && !others.some((s) => HEDGE.test(plain(s)))) tells.push('only the right option is hedged');
  const stem = terms(q.q);
  if (stem.size) {
    const echo = (s) => [...terms(s)].filter((t) => stem.has(t)).length;
    const er = echo(o[a]), eo = Math.max(...others.map(echo));
    if (er >= 3 && er > 2 * eo) tells.push(`only the right option repeats the stem's wording (${er} vs ≤ ${eo} terms)`);
  }
  return tells;
}

export function quizReviewGate(levels) {
  const items = [];
  let bad = 0;
  for (const L of levels || []) {
    const choice = (L.qs || []).filter((q) => q.type !== 'num' && Array.isArray(q.o) && q.o.length >= 2);
    let flagged = 0;
    choice.forEach((q, k) => {
      const tells = optionTells(q);
      if (!tells.length) return;
      flagged++;
      items.push({ ok: false, msg: `Quiz Level “${L.t}” #${k + 1}${q.sec ? ` (§${q.sec.replace(/^s/, '').replace(/-/g, '.')})` : ''} 「${plain(q.q).slice(0, 28)}…」: ${tells.join('; ')}` });
    });
    // A habit across the level is a tell even when no single item crosses a threshold.
    const longest = choice.filter((q) => q.o[q.a] && q.o.every((o, i) => i === q.a || optLen(o) < optLen(q.o[q.a]))).length;
    const levelBad = choice.length >= 4 && longest * 2 > choice.length;
    if (levelBad) items.push({ ok: false, msg: `Quiz Level “${L.t}”: right option is the longest in ${longest}/${choice.length} items` });
    if (flagged || levelBad) bad++;
    else items.push({ ok: true, msg: `Quiz Level “${L.t}”: ${choice.length} choice items, no option gives the key away` });
  }
  return { name: 'quiz review', status: bad ? 'fail' : 'pass', headline: bad ? `${bad} level(s) with a guessable key` : 'no level has a guessable key', items };
}
// ---------- gate: render ----------
async function renderGate(htmlPath) {
  const browser = await launchBrowser();
  if (!browser) return { name: 'render', status: 'skipped', headline: 'no browser available — NOT render-verified', items: [{ ok: null, msg: 'neither system Chrome nor Playwright Chromium could be launched' }] };
  const items = [];
  const add = (ok, msg) => items.push({ ok, msg });
  const url = pathToFileURL(htmlPath).href;
  const html = await readFile(htmlPath, 'utf8').catch(() => '');
  try {
    // Desktop, light.
    const { page, errors } = await openPage(browser, url, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });

    // Keyboard: the sidebar is a long index of links, so the first Tab stop must be a skip link
    // that is actually visible while focused and moves focus into the sheet.
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.keyboard.press('Tab');
    const firstStop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { tag: 'body', cls: '', text: '', isSkip: false, shown: false };
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown = cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 && box.width > 0 && box.height > 0
        && box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
      return { tag: el.tagName.toLowerCase(), cls: String(el.className || ''), text: (el.textContent || '').trim().slice(0, 40), isSkip: el.matches('.skip'), shown };
    });
    await page.keyboard.press('Enter');
    const landed = await page.evaluate(() => {
      const el = document.activeElement, main = document.getElementById('main');
      return { tag: el ? el.tagName.toLowerCase() : '(none)', id: el?.id || '', inMain: !!el && !!main && (el === main || main.contains(el)) };
    });
    const skipOk = firstStop.isSkip && firstStop.shown && landed.inMain;
    add(skipOk, skipOk
      ? `skip link “${firstStop.text}” is the first Tab stop, visible when focused, and Enter moves focus into main`
      : `skip link is not a working first Tab stop: first Tab focused ${firstStop.tag}${firstStop.cls ? '.' + firstStop.cls.split(' ')[0] : ''}${firstStop.isSkip ? ' (not visible while focused)' : ''}, Enter left focus on ${landed.tag}${landed.id ? '#' + landed.id : ''}${landed.inMain ? '' : ' (outside main)'}`);

    const stats = await page.evaluate(() => {
      // Maths that stayed as text anywhere the reader can see it: the prose, but also every label the
      // runtime derives from a heading — the sidebar, the top bar, the drawer, the pager, a toast.
      // KaTeX's own MathML is skipped: its <annotation> holds the TeX on purpose.
      const TEX_RESIDUE = /\$[^$\s][^$]*\$|\\[A-Za-z]{2,}|_\{|\^\{/;
      const regionOf = (el) => (el.closest('#nav, #side, #topbar, .pager, #toast, .hero') ? 'a label' : 'body text');
      const unrendered = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          if (n.parentElement.closest('code,pre,script,style,math,.lab-params,.sr-only')) return NodeFilter.FILTER_REJECT;
          return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      while (walker.nextNode()) {
        const n = walker.currentNode;
        const m = TEX_RESIDUE.exec(n.nodeValue);
        if (m) unrendered.push(`${regionOf(n.parentElement)}: “${n.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 60)}” (${m[0]})`);
      }
      const badLinks = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))));
      return {
        math: document.querySelectorAll('math').length,
        texErrors: document.querySelectorAll('.tex-error').length,
        labErrors: [...document.querySelectorAll('.lab-error')].map((e) => e.closest('.lab').id + ': ' + e.textContent),
        labs: [...document.querySelectorAll('.lab[data-lab]')].map((l) => ({ id: l.id, type: l.dataset.lab, view: l.closest('.view')?.id || '' })),
        views: window.Lykeion.views(),
        shown: [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id),
        unrendered, badLinks,
      };
    });
    add(stats.texErrors === 0, `${stats.math} formulas rendered as MathML; ${stats.texErrors} TeX errors`);
    add(stats.unrendered.length === 0, stats.unrendered.length ? `TeX shown as text: ${[...new Set(stats.unrendered)].slice(0, 5).join('; ')}` : 'no TeX residue in any visible text (prose, sidebar, top bar, pager, toast)');
    add(stats.badLinks.length === 0, stats.badLinks.length ? `broken in-page links: ${[...new Set(stats.badLinks)].join(', ')}` : 'all in-page links resolve');
    add(stats.shown.length === 1, `${stats.views.length} views (${stats.views.map((v) => v.id).join(', ')}), exactly one shown at a time (${stats.shown.join(', ') || 'none'})`);

    // The sidebar only ever lists the shown view: every link must point inside it, and a chapter view
    // must list exactly its own sections. The home view lists the chapter index, the quiz view its
    // levels — both are inside their own view, which is what the check enforces. Sub-heading links
    // (`.sub`, from the `###`/`####` headings inside a section) hang under their section and are
    // counted separately: they must point at a heading inside this view, not at a section.
    const navByView = [];
    for (const v of stats.views) {
      navByView.push(await page.evaluate(async (id) => {
        window.Lykeion.show(id, { noScroll: true });
        await new Promise((r) => setTimeout(r, 30));
        const view = document.getElementById(id);
        const secs = [...view.querySelectorAll('.sec')].filter((s) => !s.dataset.quiz).map((s) => s.id);
        const hrefs = (sel) => [...document.querySelectorAll(`#nav ${sel}`)].map((a) => decodeURIComponent(a.getAttribute('href').slice(1)));
        const links = hrefs('a:not(.sub)');
        const subs = hrefs('a.sub');
        const outside = links.filter((h) => !view.contains(document.getElementById(h))).slice(0, 3);
        const straySubs = subs.filter((h) => !view.querySelector(`h3[id="${h}"],h4[id="${h}"],h5[id="${h}"]`)).slice(0, 3);
        // A chapter view must list exactly its own sections. The home view is the chapter index and
        // the quiz view lists its levels, so there only the targets have to resolve (checked above).
        const ok = secs.length ? links.length === secs.length && outside.length === 0 && straySubs.length === 0 : true;
        return { id, secs: secs.length, links: links.length, subs: subs.length, outside, straySubs, ok };
      }, v.id));
    }
    const navBad = navByView.filter((n) => !n.ok);
    add(navBad.length === 0, navBad.length
      ? `sidebar lists the wrong links: ${navBad.map((n) => `${n.id} shows ${n.links} links for ${n.secs} sections${n.outside.length ? ` (outside the view: ${n.outside.join(', ')})` : ''}${n.straySubs.length ? ` (sub-links naming no heading: ${n.straySubs.join(', ')})` : ''}`).join('; ')}`
      : `sidebar lists only the shown view (${navByView.map((n) => `${n.id}: ${n.links} links${n.secs ? ` / ${n.secs} sections` : ''}${n.subs ? ` + ${n.subs} sub-links` : ''}`).join(', ')})`);
    add(stats.labErrors.length === 0, stats.labErrors.length ? `Labs failed to mount: ${stats.labErrors.join('; ')}` : `${stats.labs.length} Labs mounted`);

    // Code listings: every listing owns a focusable copy button with an aria-label. When the
    // page has no listing at all the check still runs — it passes with "no listings" instead of
    // going silent, so a code-heavy chapter that lost its listings is noticed in review.
    const codeProbe = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.code')];
      const badBtn = boxes.filter((b) => {
        const btn = b.querySelector('.code-copy');
        return !(btn && btn.tagName === 'BUTTON' && btn.getAttribute('aria-label') && btn.tabIndex >= 0);
      });
      const capped = boxes.filter((b) => b.querySelector('pre code[class*="language-"]')).length;
      return { total: boxes.length, badBtn: badBtn.length, capped };
    });
    add(codeProbe.badBtn === 0, codeProbe.total ? `${codeProbe.total} code listings, each with a focusable copy button (${codeProbe.capped} labelled with a language)` : 'no code listings on this page');

    // Labs mount the first time their view is shown, so every probe opens the view first.
    const showView = async (id) => {
      if (!id) return;
      await page.evaluate((v) => window.Lykeion.show(v, { noScroll: true }), id);
      await page.waitForTimeout(30);
    };

    // Typography, rhythm, stacks and formula parts, one view at a time: a hidden view lays out at
    // zero height, and the sidebar only lists the view being read.
    const perView = [];
    for (const v of stats.views) {
      perView.push(await page.evaluate(async (id) => {
        window.Lykeion.show(id, { noScroll: true });
        await new Promise((r) => setTimeout(r, 30));
        const view = document.getElementById(id);
        const root = getComputedStyle(document.documentElement);
        const norm = (s) => String(s || '').toLowerCase().replace(/["']/g, '').split(',').map((x) => x.trim()).filter(Boolean).join(',');
        const token = {
          display: norm(root.getPropertyValue('--f-display')),
          body: norm(root.getPropertyValue('--f-body')),
          mono: norm(root.getPropertyValue('--f-mono')),
        };
        const name = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 1).map((c) => `.${c}`).join('');
        const shown = (el) => getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0 && !el.classList.contains('sr-only');

        // E1 fonts: a visible element that owns text renders in the display or body face. Mono is
        // allowed only inside pre/code/kbd — a mono label in prose reads as a different voice.
        const fonts = [];
        let owners = 0;
        for (const el of view.querySelectorAll('*')) {
          if (el.closest('math, script, style, .lab-params')) continue;
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
          owners++;
          const fam = norm(getComputedStyle(el).fontFamily);
          if (fam === token.display || fam === token.body) continue;
          if (fam === token.mono && el.closest('pre, code, kbd')) continue;
          fonts.push({ sel: name(el), fam: getComputedStyle(el).fontFamily, mono: fam === token.mono });
        }

        // E2 rhythm: a reading paragraph keeps air between its lines and a readable measure.
        const rhythm = [];
        let paragraphs = 0;
        for (const p of view.querySelectorAll('.prose p')) {
          if (!p.getClientRects().length || getComputedStyle(p).visibility === 'hidden') continue;
          paragraphs++;
          const cs = getComputedStyle(p);
          const fs = parseFloat(cs.fontSize) || 0;
          const lh = cs.lineHeight === 'normal' ? 0 : parseFloat(cs.lineHeight) || 0;
          const ratio = fs ? lh / fs : 0;
          const width = p.getBoundingClientRect().width;
          if (ratio >= 1.7 - 0.01 && width <= 40 * fs + 1) continue;
          rhythm.push({ sel: name(p), ratio: Math.round(ratio * 100) / 100, width: Math.round(width), max: Math.round(40 * fs), text: (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) });
        }

        // E5 stacks: the pattern exists so that changing text never moves the layout, which only
        // holds while exactly one variant is visible. The live region inside a stack is excluded — it
        // is `visibility:visible` but clipped to a pixel by `.sr-only`, so it is not a variant.
        const stacks = [];
        for (const s of view.querySelectorAll('.stack')) {
          if (!s.getClientRects().length) continue;
          const on = [...s.children].filter(shown);
          if (on.length > 1) stacks.push({ sel: name(s), n: on.length, kids: on.slice(0, 3).map((c) => (c.dataset.i ?? c.className) || c.tagName.toLowerCase()) });
        }

        // E4 formula parts: pressing a piece must neither resize the card nor leave two explanations
        // visible. Every piece is clicked, so a card that only looks stable on one piece is caught.
        const parts = [];
        let partBlocks = 0, pieces = 0;
        for (const f of view.querySelectorAll('.formula.parts')) {
          const say = f.querySelector('.say');
          if (!say) { parts.push({ label: f.dataset.label || name(f), why: 'no explanation area' }); continue; }
          partBlocks++;
          const at = () => Math.round(f.getBoundingClientRect().height * 10) / 10;
          const shownCount = () => [...say.children].filter(shown).length;
          const start = { h: at(), n: shownCount() };
          const steps = [];
          for (const btn of f.querySelectorAll('.eq button.piece')) {
            btn.click();
            await new Promise((r) => setTimeout(r, 30));
            steps.push({ part: btn.dataset.part ?? '', h: at(), n: shownCount() });
            pieces++;
          }
          const hs = [start.h, ...steps.map((s) => s.h)];
          const swing = hs.length > 1 ? Math.max(...hs) - Math.min(...hs) : 0;
          // Name the cause in words: "no explanation" and "a moving card" are different fixes.
          const why = [];
          if (start.n === 0) why.push('opens with no explanation visible');
          else if (start.n > 1) why.push(`opens showing ${start.n} explanations`);
          for (const s of steps) {
            if (s.n === 0) why.push(`piece “${s.part}” leaves no explanation visible`);
            else if (s.n > 1) why.push(`piece “${s.part}” shows ${s.n} explanations`);
          }
          if (swing > 2) {
            const worst = steps.reduce((a, b) => (Math.abs(b.h - hs[0]) > Math.abs(a.h - hs[0]) ? b : a), steps[0] || { part: '—', h: hs[0] });
            why.push(`card height ${hs[0]}px → ${worst.h}px after piece “${worst.part}”`);
          }
          if (!why.length) continue;
          parts.push({ label: f.dataset.label || name(f), why: why.slice(0, 2).join('; ') });
        }
        // Inline maths must read as part of the sentence: a formula set larger than the body makes its
        // line taller than the paragraph's own rhythm, so the text either side sits on uneven lines.
        // Each line's height is the union of the ink boxes on it (text runs and the maths itself),
        // measured with Ranges — a display-style fraction is the one shape allowed to be taller.
        const inline = [];
        let inlineParas = 0;
        for (const p of view.querySelectorAll('.prose p')) {
          const maths = [...p.querySelectorAll('math:not([display="block"])')];
          if (!maths.length || !p.getClientRects().length) continue;
          inlineParas++;
          const cs = getComputedStyle(p);
          const normal = cs.lineHeight === 'normal' ? (parseFloat(cs.fontSize) || 16) * 1.2 : parseFloat(cs.lineHeight);
          const boxes = [];
          const range = document.createRange();
          range.selectNodeContents(p);
          for (const r of range.getClientRects()) boxes.push({ top: r.top, bottom: r.bottom });
          for (const m of maths) for (const r of m.getClientRects()) boxes.push({ top: r.top, bottom: r.bottom });
          boxes.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
          const lines = [];
          for (const b of boxes) {
            const line = lines.find((l) => b.top < l.bottom - 1 && b.bottom > l.top + 1);
            if (line) { line.top = Math.min(line.top, b.top); line.bottom = Math.max(line.bottom, b.bottom); }
            else lines.push({ ...b });
          }
          const tall = Math.max(0, ...lines.map((l) => l.bottom - l.top));
          const fraction = !!p.querySelector('math mfrac');
          const limit = normal * (fraction ? 2.2 : 1.15);
          if (tall <= limit) continue;
          inline.push({ sel: name(p), tall: Math.round(tall * 10) / 10, normal: Math.round(normal * 10) / 10, ratio: Math.round((tall / normal) * 100) / 100, fraction, text: (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) });
        }

        // A heading with maths must reach its label as rendered maths: the sidebar copies the heading,
        // and reading its textContent would paste the TeX source and the flattened marks into the link.
        // Both kinds of label are checked — a section's own title and a `###` sub-heading.
        const mathsTitles = [];
        const probeTitle = (titleEl, kind, id) => {
          if (!titleEl || !titleEl.querySelector('math')) return;
          const link = document.querySelector(`#nav a[href="#${id}"]`);
          mathsTitles.push({ id, kind, link: !!link, rendered: !!link && !!link.querySelector('math'), text: link ? (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '' });
        };
        for (const sec of view.querySelectorAll('.sec')) {
          // The sidebar lists a section's sub-headings only while the reader is in that section, so the
          // probe walks in the way a reader does: click the section's link and let the scroll land.
          const heads = [...sec.querySelectorAll('h3[id],h4[id],h5[id]')].filter((h) => h.parentElement !== sec || h.tagName !== 'H3');
          const own = sec.querySelector('.t');
          if (!(own && own.querySelector('math')) && !heads.some((h) => h.querySelector('math'))) continue;
          const link = document.querySelector(`#nav a[href="#${sec.id}"]`);
          if (link) {
            link.click();
            for (let k = 0; k < 12 && !heads.every((h) => document.querySelector(`#nav a[href="#${h.id}"]`)); k++) await new Promise((r) => setTimeout(r, 50));
          }
          probeTitle(own, 'section', sec.id);
          for (const h of heads) probeTitle(h, 'sub', h.id);
        }

        return { id, fonts, owners, rhythm, paragraphs, stacks, parts, partBlocks, pieces, inline, inlineParas, mathsTitles };
      }, v.id));
    }

    // E1 — one item, naming up to five offenders with the face they render in. A listing rendered
    // twice (two code blocks in one chapter) must not fill the message with the same selector.
    const fontOffenders = perView.flatMap((t) => t.fonts.map((f) => ({ ...f, view: t.id })));
    const uniqueFonts = fontOffenders.filter((f, i) => fontOffenders.findIndex((g) => g.view === f.view && g.sel === f.sel && g.fam === f.fam) === i);
    const owners = perView.reduce((n, t) => n + t.owners, 0);
    add(fontOffenders.length === 0, fontOffenders.length
      ? `${uniqueFonts.length} selector(s) render text in a face that is not --f-display or --f-body: ${uniqueFonts.slice(0, 5).map((f) => `${f.view} ${f.sel} → ${f.fam}${f.mono ? ' (mono outside pre/code/kbd)' : ''}`).join('; ')}`
      : `all ${owners} text elements use --f-display or --f-body (--f-mono only inside pre/code/kbd)`);

    // E2 — line-height ratio and measure, per paragraph that the reader actually reads.
    const rhythmBad = perView.flatMap((t) => t.rhythm.map((r) => ({ ...r, view: t.id })));
    const paragraphs = perView.reduce((n, t) => n + t.paragraphs, 0);
    add(rhythmBad.length === 0, rhythmBad.length
      ? `${rhythmBad.length} reading paragraphs break the rhythm (line-height ≥ 1.7, width ≤ 40em): ${rhythmBad.slice(0, 5).map((r) => `${r.view} ${r.sel} “${r.text}” line-height ×${r.ratio}${r.width > r.max ? `, ${r.width}px wide (max ${r.max}px)` : ''}`).join('; ')}`
      : `${paragraphs} reading paragraphs: line-height ≥ 1.7 and width ≤ 40em`);

    // E5 — at most one visible variant per stack.
    const stackBad = perView.flatMap((t) => t.stacks.map((s) => ({ ...s, view: t.id })));
    add(stackBad.length === 0, stackBad.length
      ? `${stackBad.length} stacks show more than one variant: ${stackBad.slice(0, 5).map((s) => `${s.view} ${s.sel} shows ${s.n} (${s.kids.join(', ')})`).join('; ')}`
      : 'every stack shows at most one variant');

    // E4 — a fixed card and exactly one explanation, for every piece.
    const partBad = perView.flatMap((t) => t.parts.map((p) => ({ ...p, view: t.id })));
    const partBlocks = perView.reduce((n, t) => n + t.partBlocks, 0);
    const pieceCount = perView.reduce((n, t) => n + t.pieces, 0);
    add(partBad.length === 0, partBad.length
      ? `${partBad.length} formula-parts blocks move or show the wrong number of explanations: ${partBad.slice(0, 5).map((p) => `${p.view} “${p.label}” ${p.why}`).join('; ')}`
      : `${partBlocks} formula-parts blocks keep their height across ${pieceCount} pieces and show exactly one explanation each`);

    // Inline maths — the paragraph's line boxes stay level, and a maths title reaches the sidebar as maths.
    const inlineBad = perView.flatMap((t) => t.inline.map((p) => ({ ...p, view: t.id })));
    const inlineParas = perView.reduce((n, t) => n + t.inlineParas, 0);
    add(inlineBad.length === 0, inlineBad.length
      ? `${inlineBad.length} paragraphs grow around their inline maths: ${inlineBad.slice(0, 5).map((p) => `${p.view} ${p.sel} “${p.text}” tallest line ${p.tall}px (×${p.ratio} of the ${p.normal}px line${p.fraction ? ', display-style fraction' : ''})`).join('; ')}`
      : `${inlineParas} paragraphs with inline maths keep their line spacing`);

    const titles = perView.flatMap((t) => t.mathsTitles);
    const titlesBad = titles.filter((t) => !t.link || !t.rendered || /[\\$]/.test(t.text));
    add(titlesBad.length === 0, titlesBad.length
      ? `${titlesBad.length} headings with maths do not reach the sidebar as rendered maths: ${titlesBad.slice(0, 5).map((t) => `#${t.id} (${t.kind}) ${t.link ? (t.rendered ? `shows “${t.text}”` : `shows “${t.text}” without the formula`) : 'has no sidebar link'}`).join('; ')}`
      : titles.length ? `${titles.length} headings with maths render as maths in the sidebar` : 'no heading carries maths');
    for (const lab of stats.labs) {
      await showView(lab.view);
      const res = await page.evaluate(async (id) => {
        const el = document.getElementById(id), body = el.querySelector('.lab-body');
        // innerText still reports `visibility:hidden` children, and a stack keeps every variant in the
        // DOM. Read only what the reader can see, or a stacked Lab looks frozen.
        const visibleText = (root) => {
          const parts = [];
          const walk = (n) => {
            if (n.nodeType === 3) { parts.push(n.textContent); return; }
            if (n.nodeType !== 1 || getComputedStyle(n).visibility === 'hidden') return;
            for (const c of n.childNodes) walk(c);
          };
          walk(root);
          return parts.join(' ').replace(/\s+/g, ' ').trim();
        };
        const before = visibleText(body);
        const range = body.querySelector('input[type=range]');
        const num = body.querySelector('input[type=number]');
        const btn = [...body.querySelectorAll('button')].find((b) => !b.disabled && b.getAttribute('aria-pressed') !== 'true');
        let how;
        if (range) { range.value = Number(range.value) === Number(range.max) ? range.min : range.max; range.dispatchEvent(new Event('input', { bubbles: true })); how = 'slider'; }
        else if (num) { num.value = String(Number(num.value || 0) + 7); num.dispatchEvent(new Event('input', { bubbles: true })); how = 'number input'; }
        else if (btn) { btn.click(); how = 'button'; }
        else return { how: 'none', changed: false };
        await new Promise((r) => setTimeout(r, 50));
        const after = visibleText(body);
        return { how, changed: after !== before, nan: /\bNaN\b|undefined|Infinity/.test(after) };
      }, lab.id);
      add(res.changed && !res.nan, `Lab ${lab.id} (${lab.type}): ${res.how === 'none' ? 'has no control' : `${res.how} → ${res.changed ? 'output changed' : 'NO visible change'}`}${res.nan ? ', shows NaN/undefined' : ''}`);
    }

    // Stepper legends: a legend exists only when the author named states, and each swatch must be a
    // chip (same class, same paint) rather than a hand-drawn box that can drift from the chips.
    for (const lab of stats.labs) {
      await showView(lab.view);
      const probe = await page.evaluate((id) => {
        const body = document.getElementById(id).querySelector('.lab-body');
        const legend = body.querySelector('.stepper-legend');
        if (!legend) return null;
        const paint = (el) => {
          const cs = getComputedStyle(el);
          return [cs.backgroundColor, cs.borderTopColor, cs.borderTopStyle, cs.color, cs.textDecorationLine].join('|');
        };
        const swatches = [...legend.querySelectorAll('.chip')].map((s) => ({
          state: [...s.classList].filter((c) => c !== 'chip').join(' '),
          paint: paint(s),
        }));
        // A chip of the same state, taken from the step body, is the reference paint. The stepper
        // shows one step at a time, so walk every step and collect one reference chip per state.
        const chips = {};
        const collect = () => {
          for (const c of body.querySelectorAll('.chips .chip')) {
            const state = [...c.classList].filter((x) => x !== 'chip').join(' ');
            if (state && !chips[state]) chips[state] = paint(c);
          }
        };
        collect();
        const buttons = [...body.querySelectorAll('.seg button')];
        for (const b of buttons) {
          if (Object.keys(chips).length >= 3) break;
          b.click();
          collect();
        }
        return { swatches, chips };
      }, lab.id);
      if (!probe) continue;
      const noChip = probe.swatches.filter((s) => !/^(good|bad|muted|info)$/.test(s.state));
      const drifted = probe.swatches.filter((s) => probe.chips[s.state] && s.paint !== probe.chips[s.state]);
      const compared = probe.swatches.filter((s) => probe.chips[s.state]);
      if (noChip.length) {
        add(false, `Lab ${lab.id} (${lab.type}): stepper legend swatch "${noChip[0].state || '(none)'}" is not a chip state (good, bad, muted, info)`);
      } else if (drifted.length) {
        add(false, `Lab ${lab.id} (${lab.type}): stepper legend swatch "${drifted[0].state}" is not painted like its chip — swatch ${drifted[0].paint}, chip ${probe.chips[drifted[0].state]}`);
      } else if (!compared.length) {
        add(false, `Lab ${lab.id} (${lab.type}): stepper legend names no state that a chip in this Lab uses`);
      } else {
        add(true, `Lab ${lab.id} (${lab.type}): stepper legend: ${compared.length} swatches match the chip states they name`);
      }
    }

    // E3 Lab stability: a Lab's box must not resize while its controls move — the page would jump
    // under the reader's hand. Every control is driven (each slider to its ends and three steps
    // between, each enabled button once) and the box height is sampled after every change. Both
    // widths are measured, because a control that fits on one line at 1280 can wrap at 375.
    const labStability = async (target, width) => {
      const found = await target.evaluate(() => [...document.querySelectorAll('.lab[data-lab]')]
        .map((l) => ({ id: l.id, type: l.dataset.lab, view: l.closest('.view')?.id || '' })));
      const out = [];
      for (const lab of found) {
        await target.evaluate((v) => window.Lykeion.show(v, { noScroll: true }), lab.view);
        await target.waitForTimeout(30);
        const res = await target.evaluate(async (id) => {
          const box = document.getElementById(id);
          const body = box.querySelector('.lab-body');
          const at = () => Math.round(box.getBoundingClientRect().height * 10) / 10;
          const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));
          const samples = [{ h: at(), control: '(initial)' }];
          const restore = [];
          // Sliders and number inputs: the two ends and up to five evenly spaced values between them.
          const inputs = [...body.querySelectorAll('input[type=range], input[type=number]')];
          // Name a control the way the reader sees it (its label), falling back to its position.
          const controlName = (inp, i) => {
            const txt = inp.closest('.ctl')?.querySelector('label, .lbl')?.firstChild?.textContent || '';
            const own = txt.replace(/\s+/g, ' ').trim().slice(0, 18);
            return own || `${inp.type === 'range' ? 'slider' : 'number input'} #${i + 1}`;
          };
          for (const [i, inp] of inputs.entries()) {
            const lo = Number(inp.min === '' ? 0 : inp.min);
            // A range with no `max` attribute has an implicit max of 100, not 1: probing 0…1 would
            // leave 99% of the slider untested.
            const hi = Number(inp.max === '' ? 100 : inp.max);
            const prev = inp.value;
            restore.push(() => { inp.value = prev; inp.dispatchEvent(new Event('input', { bubbles: true })); });
            const values = [lo, hi];
            for (let k = 0; k <= 4; k++) values.push(lo + ((hi - lo) * k) / 4);
            const uniq = [...new Set(values.filter((v) => Number.isFinite(v)).map((v) => String(Math.round(v * 1000) / 1000)))];
            for (const v of uniq) {
              inp.value = v;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              await settle();
              samples.push({ h: at(), control: `${controlName(inp, i)} = ${v}` });
            }
          }
          // Buttons: segments, actions, toggles — each enabled one, once.
          const buttons = [...body.querySelectorAll('button')].filter((b) => !b.disabled);
          for (const [i, b] of buttons.entries()) {
            const label = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22);
            b.click();
            await settle();
            samples.push({ h: at(), control: `button “${label || `#${i + 1}`}”` });
          }
          for (const r of restore) r();
          await settle();
          const hs = samples.map((s) => s.h);
          const lo = Math.min(...hs), hi = Math.max(...hs);
          const worst = samples.reduce((a, b) => (Math.abs(b.h - hs[0]) > Math.abs(a.h - hs[0]) ? b : a), samples[0]);
          return { swing: Math.round((hi - lo) * 10) / 10, start: samples[0].h, worst, samples: samples.length, inputs: inputs.length, buttons: buttons.length };
        }, lab.id);
        out.push({ ...lab, width, ...res });
      }
      return out;
    };
    const unstable = (await labStability(page, 1280)).filter((l) => l.swing > 2);
    add(unstable.length === 0, unstable.length
      ? `${unstable.length} Labs resize while their controls move: ${unstable.slice(0, 5).map((l) => `Lab ${l.id} (${l.type}) at ${l.width}px: height ${l.start}px → ${l.worst.h}px (${l.swing}px swing) after ${l.worst.control}`).join('; ')} — text that changes length must use api.stack`
      : `every Lab keeps its height while its controls move at 1280px (${stats.labs.length} Labs)`);

    // Quiz: the quiz lives in its own view, so open it first, then answer every level in order.
    const levels = await page.evaluate(() => JSON.parse(document.getElementById('lykeion-data').textContent).levels || []);
    if (levels.length) await showView('quizCh');
    for (const [li, L] of levels.entries()) {
      await page.locator('#trail .stop').nth(li).click();
      if (!(await page.locator('#qGo').count())) { add(false, `Quiz Level ${li + 1} could not be started`); break; }
      await page.locator('#qGo').click();
      let okAll = true;
      for (const q of L.qs) {
        if (q.type === 'num') { await page.fill('#qNum', String(q.a)); await page.click('#qCheck'); }
        else await page.locator(`.opt[data-i="${q.a}"]`).click();
        if (!(await page.locator('.fb.ok').count())) okAll = false;
        await page.click('#qNext');
      }
      const result = await page.locator('.result').count();
      add(okAll && result > 0, `Quiz Level ${li + 1} “${L.t}”: ${L.qs.length} questions answered with the key → ${okAll ? 'all accepted' : 'SOME REJECTED'}${result ? '' : ', no result screen'}`);
    }

    // E6 navigation. Three promises the page makes: a tab shows its own view, a sidebar link lands
    // its target inside the reading area rather than under the sticky bar, and history works both
    // ways (a deep link on load, Back after a tab click).
    //
    // Landing positions are measured with reduced motion on, on a page of their own: the runtime
    // scrolls smoothly by default, and sampling mid-animation would report the distance travelled so
    // far instead of where the link lands (a long jump measured after 220 ms reads as y=0). The
    // smooth path itself is covered by the back-to-top and deep-link checks.
    const e6 = await openPage(browser, url, { viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    // Instant scrolling still needs a frame to settle; two matching samples mean it has stopped.
    // A scroll that never stops is reported by the caller instead of being measured mid-flight.
    const settle = async () => {
      let last = -1;
      for (let i = 0; i < 20; i++) {
        await e6.page.waitForTimeout(40);
        const y = await e6.page.evaluate(() => Math.round(window.scrollY));
        if (y === last) return true;
        last = y;
      }
      return false;
    };
    const tabs = await e6.page.evaluate(() => [...document.querySelectorAll('#chaps button[data-view]')]
      .map((b) => ({ view: b.dataset.view, label: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) })));
    const tabBad = [];
    for (const t of tabs) {
      await e6.page.click(`#chaps button[data-view="${t.view}"]`);
      await e6.page.waitForTimeout(160);
      const shownNow = await e6.page.evaluate(() => [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id));
      if (shownNow.length !== 1 || shownNow[0] !== t.view) tabBad.push({ ...t, shown: shownNow });
    }
    // No tabs at all is a failure, not a pass: a reader who cannot change chapter has lost the book.
    add(tabs.length > 0 && tabBad.length === 0, tabs.length === 0
      ? 'no chapter tabs in the top bar: a reader cannot change chapter from the page'
      : tabBad.length
      ? `chapter tabs show the wrong view: ${tabBad.map((t) => `“${t.label}” → ${t.shown.join(', ') || 'none'} (want ${t.view})`).join('; ')}`
      : `${tabs.length} chapter tabs each show exactly their own view`);

    // A sticky bar means `scrollIntoView` alone would put the heading it scrolled to underneath the
    // bar; `scroll-padding-top` has to clear it. The page end counts as landed — the last section
    // cannot sit any lower than that.
    const landBad = [];
    let landings = 0;
    for (const v of stats.views) {
      const links = await e6.page.evaluate((id) => {
        window.Lykeion.show(id, { noScroll: true });
        return [...document.querySelectorAll('#nav a[href^="#"]')]
          .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26) }));
      }, v.id);
      await settle();
      for (const link of links) {
        if (link.href.length < 2) continue;
        // The sidebar is re-rendered for the view that is showing, so clicking a link from another
        // view's list would find nothing left to click. Re-open the view, then take its own link.
        await e6.page.evaluate((id) => window.Lykeion.show(id, { noScroll: true }), v.id);
        await settle();
        const clicked = await e6.page.evaluate((h) => {
          const a = document.querySelector(`#nav a[href="${h}"]`);
          if (a) a.click();
          return !!a;
        }, link.href);
        const settled = await settle();
        const land = await e6.page.evaluate((raw) => {
          let id = raw;
          try { id = decodeURIComponent(raw); } catch (e) { /* the router guards this too */ }
          const el = document.getElementById(id);
          if (!el) return { ok: false, why: 'names no element on the page', top: null, bar: null, end: false };
          const r = el.getBoundingClientRect();
          const bar = document.getElementById('topbar').getBoundingClientRect().bottom;
          const end = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
          const visible = r.bottom > 0 && r.top < window.innerHeight;
          return { ok: visible && (end || (r.top >= bar - 2 && r.top <= bar + 64)), why: '', top: Math.round(r.top), bar: Math.round(bar), end };
        }, link.href.slice(1));
        landings++;
        if (!clicked) landBad.push({ ...link, view: v.id, ok: false, why: 'the sidebar has no such link after the view was re-opened', top: null, bar: null, end: false });
        else if (!settled) landBad.push({ ...link, view: v.id, ok: false, why: 'the page kept scrolling, so the landing could not be measured', top: null, bar: null, end: false });
        else if (!land.ok) landBad.push({ ...link, view: v.id, ...land });
      }
    }
    await e6.page.close();
    add(landings > 0 && landBad.length === 0, landings === 0
      ? 'the sidebar has no links to follow: nothing to check about where it lands'
      : landBad.length
      ? `${landBad.length} of ${landings} sidebar links land in the wrong place: ${landBad.slice(0, 4).map((l) => `${l.view} “${l.text}” ${l.why || `→ target top y=${l.top}px, top bar bottom y=${l.bar}px${l.end ? ' (page at its end)' : ''}`}`).join('; ')}`
      : `${landings} sidebar links land their target just under the top bar (or at the page end)`);

    // A deep link is a first load, so it gets its own page: the main one already carries a hash and
    // history that would turn the navigation into a same-document jump.
    const lastCh = [...stats.views].reverse().find((v) => /^ch/.test(v.id));
    if (!lastCh) {
      add(false, 'no chapter view to deep-link into: the book has nothing to read');
    } else {
      const deepId = await page.evaluate((id) => {
        const secs = [...document.getElementById(id).querySelectorAll('.sec')].filter((s) => !s.dataset.quiz);
        return secs.length ? secs[secs.length - 1].id : '';
      }, lastCh.id);
      const { page: deepPage } = await openPage(browser, `${url}#${deepId}`, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
      const deep = await deepPage.evaluate((id) => {
        const el = document.getElementById(id);
        const r = el ? el.getBoundingClientRect() : null;
        const bar = document.getElementById('topbar').getBoundingClientRect().bottom;
        const end = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
        return {
          shown: [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id),
          top: r ? Math.round(r.top) : null, bar: Math.round(bar), end,
          inView: !!r && r.bottom > 0 && r.top < window.innerHeight,
          inBand: !!r && r.top >= bar - 2 && r.top <= bar + 64,
        };
      }, deepId);
      await deepPage.close();
      add(!!deepId && deep.shown.length === 1 && deep.shown[0] === lastCh.id && deep.inView && (deep.inBand || deep.end),
        `deep link #${deepId} opens ${deep.shown.join(', ') || 'none'} with the section ${deep.inBand ? 'just under the top bar' : deep.end ? 'at the page end' : 'out of place'} (section top y=${deep.top}px, top bar bottom y=${deep.bar}px)`);
    }

    // Back: two tab clicks, then the browser's own Back button must return to the first view. With a
    // single chapter the second click is another view (home), so Back still has something to undo.
    const chapterIds = stats.views.filter((v) => /^ch/.test(v.id)).map((v) => v.id);
    const allIds = stats.views.map((v) => v.id);
    const backTo = chapterIds[0] || allIds[0];
    const backFrom = chapterIds[1] || allIds.find((id) => id !== backTo);
    if (!backTo || !backFrom) {
      add(false, 'fewer than two views: Back cannot be tested');
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      for (const id of [backTo, backFrom]) {
        await page.click(`#chaps button[data-view="${id}"]`);
        await page.waitForTimeout(180);
      }
      await page.goBack();
      await page.waitForTimeout(320);
      const backShown = await page.evaluate(() => [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id));
      add(backShown.length === 1 && backShown[0] === backTo,
        `browser Back returns to ${backTo} (showing ${backShown.join(', ') || 'none'})`);
    }

    // Floating buttons. Back to top: hidden at the top, shown after one viewport, and it really
    // scrolls back. Theme: two states from a light system, and the label says what the click does.
    // The quiz run above wrote progress, so start from a clean store and a fresh document.
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // A chapter is the tallest view; the home view can be shorter than one viewport.
    await showView(stats.views.find((v) => /^ch/.test(v.id))?.id || stats.views[0]?.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
    const topState = await page.evaluate(() => {
      const b = document.getElementById('toTop'), cs = getComputedStyle(b);
      return { y: window.scrollY, opacity: Number(cs.opacity), clickable: cs.pointerEvents !== 'none', tabbable: b.tabIndex >= 0 };
    });
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
    await page.waitForTimeout(120);
    const downState = await page.evaluate(() => {
      const b = document.getElementById('toTop'), cs = getComputedStyle(b);
      return { y: window.scrollY, opacity: Number(cs.opacity), clickable: cs.pointerEvents !== 'none', tabbable: b.tabIndex >= 0 };
    });
    await page.click('#toTop', { timeout: 4000 }).catch(() => { /* a page too short to scroll cannot show the button */ });
    await page.waitForTimeout(700);
    const backY = await page.evaluate(() => window.scrollY);
    const hiddenAtTop = topState.opacity < 0.05 && !topState.clickable && !topState.tabbable;
    const shownAfter = downState.opacity > 0.95 && downState.clickable && downState.tabbable;
    // A project whose tallest view fits one viewport has nothing to scroll back from; the button is
    // correctly hidden, and clicking it is not a promise the page can break.
    const scrollable = downState.y > 1;
    add(!scrollable || (hiddenAtTop && shownAfter && backY <= 2), scrollable
      ? `back to top: ${hiddenAtTop ? 'hidden and out of the tab order' : `VISIBLE (opacity ${topState.opacity}${topState.tabbable ? ', still tabbable' : ''})`} at the top, ${shownAfter ? 'shown and tabbable' : `still hidden (opacity ${downState.opacity} at scrollY ${Math.round(downState.y)})`} after one viewport, click → scrollY ${Math.round(backY)}`
      : 'back to top: the tallest view fits one viewport, so there is nothing to scroll back from');

    // Theme: the reader starts on the system setting, so make the effective theme light first.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(60);
    // With no stored choice the attribute is absent and the system decides; report the effective
    // theme, which is what the button flips relative to.
    const readTheme = () => page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      label: document.getElementById('themeBtn').getAttribute('aria-label') || '',
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    const before = await readTheme();
    const flips = [];
    for (let i = 0; i < 2; i++) {
      await page.click('#themeBtn');
      await page.waitForTimeout(700);
      flips.push(await readTheme());
    }
    const themeOk = before.theme === 'light' && flips[0].theme === 'dark' && flips[1].theme === 'light'
      && flips[0].label !== before.label && flips[1].label === before.label
      && luminanceOf(flips[0].bg) !== null && luminanceOf(flips[0].bg) < 0.2 && luminanceOf(flips[1].bg) > 0.5;
    add(themeOk, `theme button flips ${before.theme} → ${flips.map((f) => f.theme).join(' → ')} from a light system, aria-label “${before.label}” → “${flips[0].label}”`);

    // The stored theme must beat the first paint, so a tiny head script applies it before the
    // scripts at the end of the body run. Two pieces of evidence: that script is inside <head> in
    // the built file (so it runs first), and after a reload the document is already dark.
    const headScript = /<head>[\s\S]*?localStorage\.getItem\(\s*"[^"]+"\s*\)[\s\S]*?<\/head>/.test(html);
    await page.evaluate(() => {
      const key = JSON.parse(document.getElementById('lykeion-data').textContent).key;
      const cur = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } })();
      cur.theme = 'dark';
      localStorage.setItem(key, JSON.stringify(cur));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme') || 'system',
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    add(headScript && afterReload.theme === 'dark' && luminanceOf(afterReload.bg) !== null && luminanceOf(afterReload.bg) < 0.2,
      headScript
        ? `stored theme applies before first paint (a head script reads the store key; after a reload data-theme is ${afterReload.theme}, body ${afterReload.bg})`
        : 'no head script reads the store key — a stored theme can only apply after first paint');
    // A challenge button is a navigation, so it must reach the history: otherwise Back skips the
    // quiz and a reload drops the reader back where they started.
    await page.evaluate(() => window.Lykeion.show('home', { noScroll: true }));
    const chapterId = stats.views.find((v) => /^ch/.test(v.id))?.id;
    await page.evaluate((id) => window.Lykeion.show(id, { noScroll: true }), chapterId);
    const beforeHref = await page.evaluate(() => location.hash);
    const challenge = page.locator(`#${chapterId} a[data-level]`).first();
    const hasChallenge = await challenge.count();
    if (hasChallenge) {
      await challenge.click();
      await page.waitForTimeout(300);
    }
    const afterNav = await page.evaluate(() => ({ hash: location.hash, shown: [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id) }));
    add(hasChallenge && afterNav.shown.length === 1 && afterNav.shown[0] === 'quizCh' && afterNav.hash && afterNav.hash !== beforeHref,
      hasChallenge
        ? `challenge button opens the quiz view and pushes history (${beforeHref || '(none)'} → ${afterNav.hash}, showing ${afterNav.shown.join(', ') || 'none'})`
        : 'no challenge button to test history with');

    // A malformed hash must not take the router down with it: an unguarded decodeURIComponent threw
    // inside start(), which left every view on the page at once.
    await page.goto(url + '#%', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const badHash = await page.evaluate(() => ({
      shown: [...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id),
      title: document.getElementById('topTitle')?.textContent || '',
    }));
    add(badHash.shown.length === 1,
      badHash.shown.length === 1
        ? `a malformed hash (#%) still shows exactly one view (${badHash.shown[0]})`
        : `malformed hash shows ${badHash.shown.length} views at once (${badHash.shown.join(', ')}): the router threw`);
    add(errors.length === 0, errors.length ? `desktop errors: ${errors.slice(0, 5).join(' | ')}` : 'no console or page errors (desktop)');
    await page.close();

    // Mobile, dark.
    const { page: m, errors: mErrors } = await openPage(browser, url, { viewport: { width: 375, height: 760 }, colorScheme: 'dark' });
    const mob = await m.evaluate(() => {
      const over = [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !e.closest('.tablewrap,.vizwrap,.formula,pre,.calc,.trail'); }).slice(0, 5).map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
      return { scrollW: document.documentElement.scrollWidth, over, paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(), bg: getComputedStyle(document.body).backgroundColor };
    });
    add(mob.scrollW <= 376 && mob.over.length === 0, mob.scrollW <= 376 && !mob.over.length ? 'no horizontal overflow at 375px' : `overflow at 375px: page width ${mob.scrollW}px${mob.over.length ? `; overflowing: ${mob.over.join(', ')}` : ''}`);

    // The same stability promise at 375px, where a control that fits beside its label at 1280 wraps
    // onto a second line.
    const narrow = (await labStability(m, 375)).filter((l) => l.swing > 2);
    add(narrow.length === 0, narrow.length
      ? `${narrow.length} Labs resize while their controls move at 375px: ${narrow.slice(0, 5).map((l) => `Lab ${l.id} (${l.type}): height ${l.start}px → ${l.worst.h}px (${l.swing}px swing) after ${l.worst.control}`).join('; ')} — text that changes length must use api.stack`
      : `every Lab keeps its height while its controls move at 375px (${stats.labs.length} Labs)`);
    await m.click('#menuBtn');
    const opened = await m.evaluate(() => document.getElementById('side').classList.contains('open'));
    await m.keyboard.press('Escape');
    const closed = await m.evaluate(() => !document.getElementById('side').classList.contains('open') && document.getElementById('side').inert);
    add(opened && closed, `mobile drawer opens and closes with Esc${opened && closed ? '' : ' — FAILED'}`);
    const lum = luminanceOf(mob.bg);
    add(lum !== null && lum < 0.2, `dark theme applies (body background ${mob.bg})`);
    add(mErrors.length === 0, mErrors.length ? `mobile errors: ${mErrors.slice(0, 5).join(' | ')}` : 'no console or page errors (mobile, dark)');
    await m.close();
  } catch (e) {
    add(false, `render gate crashed: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  const bad = items.filter((i) => i.ok === false).length;
  return { name: 'render', status: bad ? 'fail' : 'pass', headline: bad ? `${bad} problem(s)` : `${items.length} checks passed`, items };
}

// Verification must not depend on the network: external web fonts are blocked and pages are
// checked once the DOM is ready (fonts only change how the page looks, not whether it works).
async function openPage(browser, url, opts) {
  const page = await browser.newPage(opts);
  await page.route(/^https?:\/\//, (route) => route.abort());
  const errors = watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { page, errors };
}

function watch(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

function luminanceOf(css) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) return null;
  const l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * l(+m[1]) + 0.7152 * l(+m[2]) + 0.0722 * l(+m[3]);
}

// ---------- report ----------
function formatReport(project, checksFile, gates, ok) {
  const lines = [
    `# Verify report — ${project.title}`,
    '',
    `- Built: ${checksFile.built}`,
    `- Verified: ${new Date().toISOString()}`,
    `- Result: **${ok ? (gates.some((g) => g.status === 'pending' || g.status === 'skipped') ? 'PASS (with gates not yet run — see below)' : 'PASS') : 'FAIL'}**`,
    '',
    '| Gate | Status | Summary |',
    '|---|---|---|',
    ...gates.map((g) => `| ${g.name} | ${icon(g.status)} ${g.status} | ${g.headline || ''} |`),
    '',
  ];
  const selfReviews = gates.filter((g) => g.selfReview).length;
  if (selfReviews) lines.push(`⚠ ${selfReviews} review(s) by the writing agent itself — not an independent check.`, '');
  for (const g of gates) {
    lines.push(`## ${g.name}`, '');
    const sorted = [...g.items].sort((a, b) => (a.ok === false ? -1 : 0) - (b.ok === false ? -1 : 0));
    for (const i of sorted) lines.push(`- ${i.ok === false ? '✗' : i.warn ? '⚠' : i.ok === true ? '✓' : '–'} ${i.msg}`);
    lines.push('');
  }
  return lines.join('\n');
}
