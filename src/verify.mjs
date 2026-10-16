// `lykeion verify`: the verification gates for a built Lecture Site → verify-report.md.
//   1 render   (headless browser: errors, maths, Labs, links, quiz, mobile, dark)
//   2 numeric  (every calc / number quiz answer recomputed)
//   3 coverage (every Scope page cited by a section)
//   4 source   (agent review against the Primary Source; read from source-check.md when present)
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';

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
  gates.push(numericGate(checksFile.checks, await loadMath()));
  gates.push(coverageGate(project.scope || [], checksFile.sections));
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

async function loadMath() {
  const src = await readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
  return new Function(`${src}\nreturn LykeionMath;`)();
}

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

    // Itemset Labs: the page computes its counts, the gate recomputes them from the same params
    // (LykeionMath.itemsets, the module inlined into the page) at several minsup values. A Lab
    // counts as an itemset Lab when its params carry transactions and its body shows [data-count]
    // readouts, so a project-local custom variant is held to the same standard as the built-in one.
    const math = await loadMath();
    for (const lab of stats.labs) {
      const probe = await page.evaluate(async (id) => {
        const el = document.getElementById(id);
        const params = JSON.parse(el.querySelector('script.lab-params').textContent);
        const body = el.querySelector('.lab-body');
        if (!Array.isArray(params.transactions) || !params.transactions.length) return null;
        if (!body.querySelector('[data-count]')) return null;
        // Legend contract: a swatch must be painted exactly like the node state it names, or the
        // legend teaches the wrong thing. The reference is a REAL lattice node of that state (never
        // a synthetic one built from the swatch's own class — that would compare the swatch to
        // itself and miss a swatch naming a state the lattice does not use).
        const svg = body.querySelector('svg.lattice');
        const styleOf = (g) => {
          const cs = getComputedStyle(g.querySelector('rect'));
          const ts = getComputedStyle(g.querySelector('.lat-txt'));
          return [cs.fill, cs.stroke, cs.strokeWidth, cs.strokeDasharray, ts.fill, ts.textDecorationLine].join('|');
        };
        const stateOf = (g) => [...g.classList].filter((c) => c !== 'lat-node' && c !== 'lg' && c !== 'muted').join(' ');
        // Swatches are `svg.lat-node`; real lattice nodes are `g.lat-node`, so this only ever
        // matches legend swatches and works even for a custom Lab that has no lattice at all.
        const swatches = [...body.querySelectorAll('svg.lat-node')].map((g) => ({ state: stateOf(g), paint: styleOf(g) }));
        // The states a swatch may name: the ones the lattice can render. A swatch naming anything
        // else is class drift (the bug this check exists for) and is reported as such.
        const valid = ['infrequent', 'empty'].concat(params.show && params.show.length ? params.show : ['frequent', 'closed', 'maximal']);
        const range = body.querySelector('input[type=range]');
        if (!range) return { params, readings: [], swatches, nodes: {}, valid };
        const readings = [], nodes = {};
        for (const v of [...new Set([range.min, range.max, range.max === range.min ? range.min : String(Number(range.max) - 1)])]) {
          range.value = v; range.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 30));
          const counts = {};
          for (const cell of body.querySelectorAll('[data-count]')) counts[cell.dataset.count] = Number(cell.querySelector('b').textContent);
          readings.push({ minsup: Number(range.value), counts });
          // Muted nodes are the states the reader asked not to see, so they are not a style reference.
          for (const g of (svg ? svg.querySelectorAll('g.lat-node') : [])) {
            if (g.classList.contains('muted')) continue;
            const st = stateOf(g);
            if (!(st in nodes)) nodes[st] = styleOf(g);
          }
        }
        return { params, readings, swatches, nodes, valid };
      }, lab.id);
      if (!probe) continue;
      const drift = probe.swatches.map((s) => ({ s, real: probe.nodes[s.state] }));
      // An unknown state name is class drift; a known state with no rendered node is fine (that state
      // simply does not occur at the probed minsup values), so only the paint comparison applies then.
      const unknown = drift.filter((d) => probe.valid.indexOf(d.s.state) < 0);
      const wrongPaint = drift.filter((d) => d.real && d.s.paint !== d.real);
      if (drift.length) add(!unknown.length && !wrongPaint.length, unknown.length
        ? `Lab ${lab.id} (${lab.type}): legend swatch "${unknown[0].s.state}" names a state the lattice does not use (states: ${probe.valid.join(', ')})`
        : wrongPaint.length
          ? `Lab ${lab.id} (${lab.type}): legend swatch "${wrongPaint[0].s.state}" is not painted like its node — swatch ${wrongPaint[0].s.paint}, node ${wrongPaint[0].real}`
          : `Lab ${lab.id} (${lab.type}): ${drift.length} legend swatches are painted exactly like the lattice node states they name`);
      if (!probe.readings.length) { add(false, `Lab ${lab.id} (${lab.type}): has no minsup slider to probe`); continue; }
      const wrong = (r) => Object.entries(r.counts)
        .map(([k, shown]) => ({ k, shown, want: math.itemsets(probe.params.transactions, r.minsup).counts[k] }))
        .filter((d) => d.want === undefined ? true : !Number.isFinite(d.shown) || d.shown !== d.want);
      const bad = probe.readings.map((r) => ({ r, d: wrong(r) })).filter((x) => x.d.length);
      const show = (r) => Object.keys(r.counts).map((k) => `${k} ${r.counts[k]}`).join('/');
      add(bad.length === 0, bad.length
        ? `Lab ${lab.id} (${lab.type}): displayed counts disagree with the params — minsup ${bad[0].r.minsup}: ${bad[0].d.map((d) => `${d.k} shows ${d.shown}, params give ${d.want}`).join('; ')}`
        : `Lab ${lab.id} (${lab.type}): displayed counts match LykeionMath.itemsets at ${probe.readings.length} minsup values (minsup ${probe.readings[0].minsup} → ${show(probe.readings[0])}, minsup ${probe.readings[probe.readings.length - 1].minsup} → ${show(probe.readings[probe.readings.length - 1])})`);
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
    for (const i of sorted) lines.push(`- ${i.ok === true ? '✓' : i.ok === false ? '✗' : '–'} ${i.msg}`);
    lines.push('');
  }
  return lines.join('\n');
}
