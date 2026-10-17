// `lykeion verify`: the verification gates for a built Lecture Site → verify-report.md.
//   1 render   (headless browser: errors, maths, Labs, links, quiz, mobile, dark)
//   2 numeric  (every calc / number quiz answer recomputed)
//   3 coverage (every Scope page cited by a section)
//   4 source   (agent review against the Primary Source; read from source-check.md when present)
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { loadMath } from './mathlib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const help = `lykeion verify [project-dir] [--no-render]

Runs the gates on the last build (run "lykeion build" first) and writes <project>/verify-report.md.
Exit code 1 if any gate fails. Gate 4 (source) comes from <project>/source-check.md, written by the agent.`;

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
  gates.push(render ? await renderGate(htmlPath) : { name: 'render', status: 'skipped', items: [{ ok: null, msg: 'skipped by --no-render — NOT render-verified' }] });
  gates.push(await sourceGate(dir));

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

// ---------- gate: source (agent) ----------
async function sourceGate(dir) {
  let txt;
  try { txt = await readFile(join(dir, 'source-check.md'), 'utf8'); } catch {
    return { name: 'source', status: 'pending', headline: 'awaiting agent review (references/source-checker.md)', items: [{ ok: null, msg: 'source-check.md not found: the agent must review claims against the cited pages' }] };
  }
  const m = /^STATUS:\s*(pass|fail)/im.exec(txt);
  const status = m ? m[1].toLowerCase() : 'fail';
  const disputed = (txt.match(/^- \[disputed\]/gim) || []).length;
  return { name: 'source', status, headline: `${status}${disputed ? `, ${disputed} disputed item(s) for the user` : ''} (from source-check.md)`, items: [{ ok: status === 'pass', msg: 'see source-check.md' }] };
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
      const unrendered = [];
      const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest('code,pre,script,style,math,.lab-params') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent;
        if (/\$[^$\s][^$]*\$|\\(frac|times|sum|text|mathrm|alpha|beta|sigma|le|ge|cdot)\b/.test(t)) unrendered.push(t.trim().slice(0, 80));
      }
      const badLinks = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))));
      return {
        math: document.querySelectorAll('math').length,
        texErrors: document.querySelectorAll('.tex-error').length,
        labErrors: [...document.querySelectorAll('.lab-error')].map((e) => e.closest('.lab').id + ': ' + e.textContent),
        labs: [...document.querySelectorAll('.lab[data-lab]')].map((l) => ({ id: l.id, type: l.dataset.lab })),
        unrendered, badLinks,
        sections: document.querySelectorAll('.sec').length,
        navLinks: document.querySelectorAll('#nav a').length,
      };
    });
    add(stats.texErrors === 0, `${stats.math} formulas rendered as MathML; ${stats.texErrors} TeX errors`);
    add(stats.unrendered.length === 0, stats.unrendered.length ? `unrendered TeX in text: ${stats.unrendered.slice(0, 5).map((s) => `“${s}”`).join(', ')}` : 'no unrendered TeX in body text');
    add(stats.badLinks.length === 0, stats.badLinks.length ? `broken in-page links: ${[...new Set(stats.badLinks)].join(', ')}` : 'all in-page links resolve');
    add(stats.navLinks >= stats.sections - 1, `sidebar lists ${stats.navLinks} links for ${stats.sections} sections`);
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

    for (const lab of stats.labs) {
      const res = await page.evaluate(async (id) => {
        const el = document.getElementById(id), body = el.querySelector('.lab-body');
        const before = body.innerText;
        const range = body.querySelector('input[type=range]');
        const num = body.querySelector('input[type=number]');
        const btn = [...body.querySelectorAll('button')].find((b) => !b.disabled && b.getAttribute('aria-pressed') !== 'true');
        let how;
        if (range) { range.value = Number(range.value) === Number(range.max) ? range.min : range.max; range.dispatchEvent(new Event('input', { bubbles: true })); how = 'slider'; }
        else if (num) { num.value = String(Number(num.value || 0) + 7); num.dispatchEvent(new Event('input', { bubbles: true })); how = 'number input'; }
        else if (btn) { btn.click(); how = 'button'; }
        else return { how: 'none', changed: false };
        await new Promise((r) => setTimeout(r, 50));
        return { how, changed: body.innerText !== before, nan: /\bNaN\b|undefined|Infinity/.test(body.innerText) };
      }, lab.id);
      add(res.changed && !res.nan, `Lab ${lab.id} (${lab.type}): ${res.how === 'none' ? 'has no control' : `${res.how} → ${res.changed ? 'output changed' : 'NO visible change'}`}${res.nan ? ', shows NaN/undefined' : ''}`);
    }

    // Stepper legends: a legend exists only when the author named states, and each swatch must be a
    // chip (same class, same paint) rather than a hand-drawn box that can drift from the chips.
    for (const lab of stats.labs) {
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

    // Quiz: answer every Quiz Level correctly, in order; each must pass and unlock the next.
    const levels = await page.evaluate(() => JSON.parse(document.getElementById('lykeion-data').textContent).levels || []);
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
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });

    // Theme button cycles system → light → dark.
    const themes = [];
    for (let i = 0; i < 3; i++) { await page.click('#themeBtn'); themes.push(await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system')); }
    add(themes.join(',') === 'light,dark,system', `theme button cycles ${themes.join(' → ')}`);
    add(errors.length === 0, errors.length ? `desktop errors: ${errors.slice(0, 5).join(' | ')}` : 'no console or page errors (desktop)');
    await page.close();

    // Mobile, dark.
    const { page: m, errors: mErrors } = await openPage(browser, url, { viewport: { width: 375, height: 760 }, colorScheme: 'dark' });
    const mob = await m.evaluate(() => {
      const over = [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !e.closest('.tablewrap,.vizwrap,.formula,pre,.calc,.trail'); }).slice(0, 5).map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
      return { scrollW: document.documentElement.scrollWidth, over, paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(), bg: getComputedStyle(document.body).backgroundColor };
    });
    add(mob.scrollW <= 376 && mob.over.length === 0, mob.scrollW <= 376 && !mob.over.length ? 'no horizontal overflow at 375px' : `overflow at 375px: page width ${mob.scrollW}px${mob.over.length ? `; overflowing: ${mob.over.join(', ')}` : ''}`);
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
  for (const g of gates) {
    lines.push(`## ${g.name}`, '');
    const sorted = [...g.items].sort((a, b) => (a.ok === false ? -1 : 0) - (b.ok === false ? -1 : 0));
    for (const i of sorted) lines.push(`- ${i.ok === false ? '✗' : i.warn ? '⚠' : i.ok === true ? '✓' : '–'} ${i.msg}`);
    lines.push('');
  }
  return lines.join('\n');
}
