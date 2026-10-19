// The `teaching` gate: does the writing teach, or does it just restate the slides?
//
// Every threshold and every style pattern lives in `references/teaching-rules.json` and
// `references/style-lexicon.json`, and a project overrides any of them under `lykeion.json`
// `"teaching": {…}`. Nothing subject-specific is hard-coded here: a statistics lecture and a
// literature lecture are checked by the same code, and only the lexicon entries say which
// language a phrase belongs to.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RULES_PATH = join(ROOT, 'references', 'teaching-rules.json');
export const LEXICON_PATH = join(ROOT, 'references', 'style-lexicon.json');

// Block kinds that carry prose the reader reads as sentences.
export const PROSE = new Set(['p', 'list']);
// Kinds whose text the lexicon, the page-reference and the plain-maths rules read. A Lab counts by its
// `lab:` prefix: its `hint`, `text`, `note` and verdict lines are sentences the reader reads.
export const TEXTY = new Set(['p', 'list', 'note', 'callout', 'analogy', 'takeaway', 'formula-parts', 'erratum']);
export const isTexty = (kind) => TEXTY.has(kind) || String(kind || '').startsWith('lab:');
// The kinds `minBlockKinds` counts, with `lab:<type>` folded to `lab` so a Lab is one kind.
const kindFamily = (kind) => (kind.startsWith('lab:') ? 'lab' : kind);
export const BLOCK_KINDS = ['analogy', 'takeaway', 'note', 'callout', 'formula', 'formula-parts', 'lab', 'table', 'code'];
const BLOCK_KIND_SET = new Set(BLOCK_KINDS);

// Plain text of a Markdown fragment: no maths, no markup, punctuation kept (the lexicon patterns
// are written against real sentences, `，` and `。` included).
export function plainText(src) {
  return String(src ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Visible characters of a fragment: no whitespace, no maths.
export const charCount = (src) => [...plainText(src).replace(/\s+/g, '')].length;

// `<q>…</q>` marks a number quoted from the slides. The build keeps the marks as two private-use
// characters so the gate can see where a quotation starts and ends; `unmark` drops them for everything
// that shows or counts text.
const QUOTE_OPEN = '', QUOTE_CLOSE = '';
const QUOTED = /[\s\S]*?/g;
const MARKER = /[]/g;
export const markQuotes = (src) => String(src ?? '').replace(/<q>/g, QUOTE_OPEN).replace(/<\/q>/g, QUOTE_CLOSE);
// Plain text that keeps the quotation marks (see `markQuotes`).
export const markedText = (src) => plainText(markQuotes(src));
export const unmark = (s) => String(s ?? '').replace(MARKER, '');

const excerpt = (s, at = 0, len = 36) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= len) return t;
  const start = Math.max(0, Math.min(at - Math.floor(len / 3), t.length - len));
  return `${start > 0 ? '…' : ''}${t.slice(start, start + len)}${start + len < t.length ? '…' : ''}`;
};

// ---------- configuration ----------
// The defaults are the shipped JSON files; a project may override any rule key, append lexicon
// entries, and switch a shipped entry off by its pattern string. A misspelt override key is
// reported (not silently ignored), the same stance the build takes on unknown Lab parameters.
export async function loadTeachingConfig(override = {}) {
  const [base, baseLexicon] = await Promise.all([RULES_PATH, LEXICON_PATH].map((p) => readFile(p, 'utf8').then(JSON.parse)));
  const { lexicon = [], lexiconOff = [], ...rest } = override || {};
  const unknown = Object.keys(rest).filter((k) => !(k in base));
  const rules = { ...base, ...rest };
  const off = new Set([].concat(lexiconOff || []).map(String));
  const added = [].concat(lexicon || []).filter((e) => e && e.pattern);
  const entries = [...baseLexicon, ...added].filter((e) => e && e.pattern && !off.has(String(e.pattern)));
  return { rules, lexicon: entries, unknown, known: Object.keys(base) };
}

const compile = (patterns, flags = '') => []
  .concat(patterns || [])
  .map((p) => { try { return new RegExp(p, flags); } catch { return null; } })
  .filter(Boolean);

// A lexicon entry applies to a project when it names no language, the project names none, or the
// project's language starts with the entry's (`zh` covers `zh-Hant-TW`).
const langApplies = (entry, projectLang) => {
  const want = String(entry.lang || 'any').toLowerCase();
  if (want === 'any' || !projectLang) return true;
  return String(projectLang).toLowerCase().startsWith(want);
};

// ---------- proseNumbers helpers ----------
// A number as the reader sees it: an optional minus, digits with an optional decimal part, an optional
// percent sign. Not preceded by a Latin letter, digit, `_` or `.`, so `x2.5` and `2.1.3` are not numbers
// here (versions and section numbers are the `ignore` patterns' job).
const NUMBER = /(?<![A-Za-z0-9_.])([-−]?)(\d+(?:\.\d+)?)(?:\s?(%|％))?/g;
// The kinds whose words the `proseNumbers` rule reads (see rule 12).
const NUMBER_PROSE = new Set(['p', 'list', 'note', 'callout', 'analogy', 'takeaway', 'formula-parts']);

// Does `x`, written to `d` decimals, read as `w`? Rounding and truncation both count, because a slide
// sometimes truncates where a computed value rounds: 0.4449 reads as 0.444 by truncation, 0.4444 as 0.444
// either way.
const agrees = (x, d, w) => {
  if (!Number.isFinite(x)) return false;
  const f = 10 ** d, s = x * f;
  return [Math.round(s), Math.trunc(s + Math.sign(s) * 1e-9)].some((k) => Math.abs(k / f - w) < 1e-9);
};

// The candidate nearest to `w`, for the failure message. A percentage is compared both as a percentage
// (`0.9995` is `99.95 %`) and as the value itself (`8.3` is `8.3 %`).
const closest = (cands, pct, w) => {
  let best = null;
  for (const c of cands) {
    if (!Number.isFinite(c.v)) continue;
    for (const v of pct ? [c.v * 100, c.v] : [c.v]) {
      const dist = Math.abs(v - w);
      if (!best || dist < best.dist) best = { dist, v, kind: c.kind, from: c.from };
    }
  }
  return best;
};
// A number for a message: six significant figures, no float noise (99.95400000001 → 99.954).
const shown = (v) => String(Number(Number(v).toPrecision(6)));

// ---------- the gate ----------
// `teaching` is the `teaching` object written into checks.json:
//   { sections: [{ id, num, title, file, blocks: [{ kind, chars, text? }] }],
//     quiz:     [{ where, q, o, ex }] }
// `slideText` is a Map of section id → the slide text of its pages (loadSlideText in verify.mjs).
export function teachingGate(teaching, project = {}, config = { rules: {}, lexicon: [] }, slideText = null) {
  const { rules = {}, lexicon = [], unknown = [], known = [] } = config;
  const items = [];
  const sections = teaching?.sections || [];
  const quiz = teaching?.quiz || [];
  const projectLang = project.lang;

  if (!teaching) {
    return {
      name: 'teaching', status: 'pending', headline: 'checks.json has no teaching data — rebuild',
      items: [{ ok: null, msg: 'checks.json was written before the teaching gate existed: run "lykeion build" again' }],
    };
  }

  // One item per failure, one summary item per rule that found nothing.
  const report = (rule, failures, okMsg) => {
    if (!failures.length) { items.push({ ok: true, msg: `${rule}: ${okMsg}` }); return; }
    for (const f of failures) {
      items.push(f.warn ? { ok: null, warn: true, msg: `${rule}: ${f.msg}` } : { ok: false, msg: `${rule}: ${f.msg}` });
    }
  };

  for (const key of unknown) {
    items.push({ ok: false, msg: `lykeion.json "teaching" has no rule "${key}" (allowed: ${known.join(', ')})` });
  }

  const where = (s) => `${s.file}${s.num ? ` §${s.num}` : ''}`;
  const blocksOf = (s) => s.blocks || [];
  const textBlocks = (s) => blocksOf(s).filter((b) => isTexty(b.kind) && b.text);
  // Spec: every failure names file, section and a short excerpt. A rule that fires on a block with no
  // words of its own (a formula, a heading, a Lab) quotes the prose nearest to it instead — the
  // sentence before it, else the section's first sentence, else the section title.
  const quote = (s, at = -1) => {
    const bs = blocksOf(s);
    const prose = bs.filter((b) => PROSE.has(b.kind) && b.text);
    const before = at >= 0 ? bs.slice(0, at).filter((b) => PROSE.has(b.kind) && b.text).pop() : null;
    const pick = before || prose[0];
    if (pick) return ` — near “${excerpt(pick.text)}”`;
    return s.title ? ` — near “${s.title}”` : '';
  };

  // 1. pageRefs — a pointer at a page number (the patterns live in teaching-rules.json) sends the
  //    reader to a page they do not have.
  //    Section `pages` metadata and an erratum's `ref` are citations, not body text, so they are
  //    never scanned; quiz stems, options and explanations are.
  const pagePatterns = rules.pageRefs && rules.pageRefs !== false
    ? compile(rules.pageRefs.patterns, rules.pageRefs.flags || '')
    : [];
  {
    const failures = [];
    const scan = (text, label) => {
      for (const re of pagePatterns) {
        re.lastIndex = 0;
        const m = re.exec(text);
        if (m) failures.push({ msg: `${label}: page reference “${m[0]}” in “${excerpt(text, m.index)}” — the page is not in the reader's hands; name the idea instead` });
      }
    };
    for (const s of sections) for (const b of textBlocks(s)) scan(b.text, `${where(s)} ${b.kind}`, s);
    for (const q of quiz) {
      scan(q.q || '', `${q.where} question`, null);
      (q.o || []).forEach((o, i) => scan(o, `${q.where} option ${i + 1}`, null));
      scan(q.ex || '', `${q.where} explanation`, null);
    }
    report('pageRefs', failures, pagePatterns.length ? 'no page references in body text or quiz items' : 'rule disabled');
  }

  // 2. maxParagraphChars — a 200-character paragraph is a wall, not an explanation.
  const maxPara = Number(rules.maxParagraphChars);
  if (maxPara > 0) {
    const failures = [];
    for (const s of sections) for (const b of blocksOf(s)) {
      if (b.kind !== 'p' || !b.chars || b.chars <= maxPara) continue;
      failures.push({ msg: `${where(s)}: paragraph is ${b.chars} chars (max ${maxPara}) — “${excerpt(b.text)}”` });
    }
    report('maxParagraphChars', failures, `every paragraph is ${maxPara} chars or fewer`);
  }

  // 3. maxProseRun — prose, prose, prose with nothing to look at in between.
  const maxRun = Number(rules.maxProseRun);
  if (maxRun > 0) {
    const failures = [];
    for (const s of sections) {
      let run = 0, first = null;
      const flush = () => {
        if (run > maxRun) failures.push({ msg: `${where(s)}: ${run} chars of prose in a row (max ${maxRun}) starting “${excerpt(first)}” — break it with a formula, Lab, table or note` });
        run = 0; first = null;
      };
      for (const b of blocksOf(s)) {
        if (PROSE.has(b.kind)) { run += b.chars || 0; if (first === null) first = b.text || ''; }
        else flush();
      }
      flush();
    }
    report('maxProseRun', failures, `no run of prose exceeds ${maxRun} chars`);
  }

  // 4. formulaExplained — a formula dropped between two formulas (or straight into a heading or the
  //    end of the section) was never taught. `formula-parts` carries its own explanation, so it is
  //    exempt as a subject and transparent as a neighbour.
  if (rules.formulaExplained) {
    const failures = [];
    for (const s of sections) {
      const bs = blocksOf(s);
      bs.forEach((b, i) => {
        if (b.kind !== 'formula' && b.kind !== 'display-math') return;
        for (let j = i + 1; j < bs.length; j++) {
          const k = bs[j].kind;
          if (PROSE.has(k)) return;
          if (k === 'formula' || k === 'display-math' || k === 'h3' || k === 'h4') {
            failures.push({ msg: `${where(s)}: the ${b.kind} block is followed by ${k === 'formula' || k === 'display-math' ? 'another formula' : 'a heading'} before any prose explains it${quote(s, i)}` });
            return;
          }
          if (k === 'formula-parts') continue;
        }
        failures.push({ msg: `${where(s)}: the ${b.kind} block has no prose after it in this section — say what it means${quote(s, i)}` });
      });
    }
    report('formulaExplained', failures, 'every formula is followed by prose that explains it');
  }

  // 5. analogyBeforeFormula — the concrete picture comes first, and the formula can point back at it.
  if (rules.analogyBeforeFormula) {
    const failures = [];
    for (const s of sections) {
      const bs = blocksOf(s);
      const first = bs.findIndex((b) => b.kind === 'formula' || b.kind === 'formula-parts' || b.kind === 'display-math');
      if (first < 0) continue;
      if (bs.slice(0, first).some((b) => b.kind === 'analogy')) continue;
      failures.push({ msg: `${where(s)}: the first formula arrives before any analogy — add an \`analogy\` block it can return to${quote(s, first)}` });
    }
    report('analogyBeforeFormula', failures, 'every section that has a formula opens with an analogy');
  }

  // 6. minBlockKinds — a long section made only of paragraphs is a wall of text, however correct.
  const minKinds = rules.minBlockKinds;
  if (minKinds && Number(minKinds.minChars) >= 0 && Number(minKinds.kinds) > 0) {
    const failures = [];
    for (const s of sections) {
      const prose = blocksOf(s).filter((b) => PROSE.has(b.kind)).reduce((n, b) => n + (b.chars || 0), 0);
      if (prose <= Number(minKinds.minChars)) continue;
      const used = [...new Set(blocksOf(s).map((b) => kindFamily(b.kind)).filter((k) => BLOCK_KIND_SET.has(k)))];
      if (used.length >= Number(minKinds.kinds)) continue;
      failures.push({ msg: `${where(s)}: ${prose} chars of prose use ${used.length} non-prose kind(s)${used.length ? ` (${used.join(', ')})` : ''} — need ${minKinds.kinds} of ${BLOCK_KINDS.join(', ')}${quote(s)}` });
    }
    report('minBlockKinds', failures, `every section over ${minKinds.minChars} chars of prose uses at least ${minKinds.kinds} non-prose kinds`);
  }

  // 7. stepperShare — one Lab type doing all the work is a rhythm problem, not a content problem.
  //    A plain number is read as the share; the object form also carries the Lab count below which a
  //    share is meaningless (one stepper out of two Labs is not a habit).
  const shareRule = rules.stepperShare;
  const share = typeof shareRule === 'object' && shareRule ? Number(shareRule.share) : Number(shareRule);
  const minLabs = typeof shareRule === 'object' && shareRule ? Number(shareRule.minLabs ?? 0) : 0;
  if (share > 0) {
    const labs = sections.flatMap((s) => blocksOf(s).filter((b) => b.kind.startsWith('lab:')).map((b) => ({ ...b, section: s })));
    if (labs.length >= minLabs) {
      const steppers = labs.filter((b) => b.kind === 'lab:stepper');
      const ratio = labs.length ? steppers.length / labs.length : 0;
      const failures = ratio > share
        ? [{ msg: `${where((steppers[0] || labs[0]).section)}: ${steppers.length} of ${labs.length} Labs (${Math.round(ratio * 100)}%) are steppers (max ${Math.round(share * 100)}%) — walk another idea with a different Lab type${quote((steppers[0] || labs[0]).section)}` }]
        : [];
      report('stepperShare', failures, `${steppers.length} of ${labs.length} Labs are steppers`);
    }
  }

  // 8. lexicon — the phrases that sound like teaching and are not. `fail` stops the gate, `warn`
  //    is reported with ⚠ and does not.
  if (lexicon.length) {
    const failures = [];
    let matched = 0;
    for (const entry of lexicon) {
      if (!langApplies(entry, projectLang)) continue;
      const re = compile([entry.pattern], entry.flags || '')[0];
      if (!re) { items.push({ ok: false, msg: `lexicon: pattern “${entry.pattern}” is not a valid regular expression` }); continue; }
      for (const s of sections) for (const b of textBlocks(s)) {
        re.lastIndex = 0;
        const m = re.exec(b.text);
        if (!m) continue;
        matched++;
        failures.push({ warn: entry.level !== 'fail', msg: `${where(s)}: “${excerpt(b.text, m.index)}” uses “${m[0]}” — ${entry.why || 'rewrite it as a plain sentence'}` });
      }
    }
    report('lexicon', failures, `no entry of style-lexicon.json matches (${lexicon.length} entries)`);
  }

  // 9. plainMath — maths typed as text: it renders with its underscores and carets showing, so the
  //    reader sees `√d_k` where the site shows `√(d_k)`. The patterns are data (every subject types
  //    maths differently); anything inside `$…$` has already been lifted out of `text`, which is why
  //    only the typed-in-plain form is left to find.
  const plainMathRule = rules.plainMath;
  const plainMath = plainMathRule && plainMathRule !== false ? compile(plainMathRule.patterns, plainMathRule.flags || '') : [];
  {
    const failures = [];
    const scan = (text, label, s) => {
      // One failure per field: a sentence that types `√d_k` matches both the radical and the subscript
      // pattern, and reporting it twice sends the agent to the same line twice.
      for (const re of plainMath) {
        re.lastIndex = 0;
        const m = re.exec(text);
        if (!m) continue;
        failures.push({ msg: `${label}: “${excerpt(text, m.index)}” types the maths in plain text (“${m[0]}”) — write it as $…$ so it renders${s ? quote(s) : ''}` });
        return;
      }
    };
    for (const s of sections) for (const b of textBlocks(s)) scan(b.text, `${where(s)} ${b.kind}`, s);
    for (const q of quiz) {
      scan(q.q || '', `${q.where} question`);
      (q.o || []).forEach((o, i) => scan(o, `${q.where} option ${i + 1}`));
      scan(q.ex || '', `${q.where} explanation`);
    }
    report('plainMath', failures, plainMath.length ? 'no maths typed as plain text' : 'rule disabled');
  }

  // 10. numericMath — a lone number set as maths. It inherits the maths font, the maths size and the
  //     maths baseline, so it sits in the sentence like a foreign word: `0.5` typed as text matches
  //     the body, `$0.5$` does not. Numbers inside a real expression are maths and pass.
  const numericRule = rules.numericMath;
  const numericIgnore = numericRule && numericRule !== false ? new RegExp(String(numericRule.ignore || ''), 'g') : null;
  if (numericIgnore) {
    const failures = [];
    const scan = (srcs, label, s) => {
      for (const src of [].concat(srcs || [])) {
        if (String(src).replace(numericIgnore, '').length) continue;
        failures.push({ msg: `${label}: “$${src}$” is a lone number set as maths — write it as plain text so it matches the body${s ? quote(s) : ''}` });
      }
    };
    for (const s of sections) for (const b of blocksOf(s)) scan(b.math, `${where(s)} ${b.kind}`, s);
    for (const q of quiz) scan(q.math, q.where);
    report('numericMath', failures, 'every number in maths is part of an expression');
  }

  // 11. codeSource — a listing says where its code comes from. Invented code with invented numbers is
  //     what this rule stops: `from="slides"` must use identifiers the slides really print, a reference
  //     must be one the site cites, and an illustration the author wrote must say so in its title.
  //     Output blocks are exempt. `slideText` is the page text per section id (see verify.mjs); without it
  //     a slides listing is reported as not checkable, never as a failure.
  const codeRule = rules.codeSource;
  if (codeRule) {
    const outputTitles = new Set(codeRule.outputTitles || []);
    const keywords = new Set(codeRule.keywords || []);
    const label = codeRule.exampleLabel || '示範';
    const minShare = Number(codeRule.minIdentifierShare ?? 0.5);
    const cited = [].concat(project.references || []);
    const failures = [];
    for (const s of sections) for (const b of blocksOf(s)) {
      if (b.kind !== 'code' || outputTitles.has(b.title)) continue;
      const loc = where(s);
      const shown = b.title ? `“${b.title}”` : 'a listing';
      const from = String(b.from ?? '').trim();
      if (!from) {
        failures.push({ msg: `${loc}: ${shown} has no from — say where this code comes from (from="slides", a reference, or from="example" with 「${label}」 in the title)${quote(s)}` });
        continue;
      }
      if (from === 'slides') {
        const ids = (b.ids || []).filter((w) => !keywords.has(w));
        const text = slideText?.get(s.id);
        if (!text) {
          failures.push({ warn: true, msg: `${loc}: ${shown} is from="slides", but the slide text of pages ${s.pages || '(none)'} is not extracted — not checkable` });
          continue;
        }
        if (!ids.length) {
          failures.push({ warn: true, msg: `${loc}: ${shown} is from="slides", but it has no identifiers to check — not checkable` });
          continue;
        }
        const missing = ids.filter((w) => !new RegExp(`(?<![A-Za-z0-9_])${w}(?![A-Za-z0-9_])`).test(text));
        const share = (ids.length - missing.length) / ids.length;
        if (share < minShare) {
          failures.push({ msg: `${loc}: ${shown} is from="slides", but ${Math.round(share * 100)}% of its identifiers appear on pages ${s.pages} (need ${Math.round(minShare * 100)}%); not on the slides: ${missing.slice(0, 6).join(', ')}${quote(s)}` });
        }
        continue;
      }
      if (from === 'example') {
        if (!String(b.title || '').includes(label)) {
          failures.push({ msg: `${loc}: ${shown} is from="example", but its title has no 「${label}」 — the reader must see that it is an illustration, not the course's code` });
        }
        continue;
      }
      const lower = from.toLowerCase();
      if (cited.some((r) => String(r).toLowerCase().startsWith(lower))) continue;
      failures.push({ msg: `${loc}: ${shown} is from="${from}", which is none of "slides", "example" or a reference in lykeion.json (${cited.join(' / ') || 'no references'})` });
    }
    report('codeSource', failures, 'every code listing says where it comes from');
  }

  // 12. proseNumbers — a decimal or a percentage the reader reads must be a number the section computes:
  //     a `calc` expect, or a Lab readout at its default inputs, at the precision written. A number inside
  //     `<q>…</q>` is an explicit quotation of the slides and passes. Integers are not checked. The reading
  //     text is paragraphs, lists, notes, callouts, analogies, takeaways, a parts formula's words and the
  //     quiz explanations; headings, tables, code and maths are not reading text.
  const numbersRule = rules.proseNumbers;
  // A checks.json written before the numeric record existed has no calc or readouts to check against:
  // every decimal would fail for the wrong reason, so ask for a build instead.
  const numbersStale = sections.some((s) => !Array.isArray(s.calc) || !Array.isArray(s.readouts));
  if (numbersRule && numbersRule !== false && numbersStale) {
    report('proseNumbers', [{ warn: true, msg: 'checks.json was written before the numeric record existed — run "lykeion build" again' }], '');
  } else if (numbersRule && numbersRule !== false) {
    const ignore = compile([].concat(numbersRule.ignore || []), 'g');
    const failures = [];
    const expects = (s) => [
      ...(s?.calc || []).map((c) => ({ v: Number(c.expect), kind: 'calc expect', from: c.note || c.expr })),
      ...(s?.readouts || []).map((r) => ({ v: Number(r.value), kind: 'Lab readout at default', from: `${r.lab} ${r.label}`.trim() })),
    ];
    const scan = (src, label, cands) => {
      // Spans that are quoted or ignored are blanked to spaces of the same length, so every index below
      // still points into `src`.
      const masked = [QUOTED, ...ignore].reduce((out, re) => out.replace(re, (x) => ' '.repeat(x.length)), src);
      for (const m of masked.matchAll(NUMBER)) {
        const [token, sign, digits, unit] = m;
        const pct = !!unit;
        const decimals = (digits.split('.')[1] || '').length;
        if (!pct && !decimals) continue;
        const w = Number(digits) * (sign ? -1 : 1);
        if (cands.some((c) => agrees(c.v, decimals, w) || (pct && agrees(c.v * 100, decimals, w)))) continue;
        const at = m.index - (src.slice(0, m.index).match(MARKER) || []).length;
        const near = closest(cands, pct, w);
        const hint = near ? ` (closest ${near.kind}: ${shown(near.v)}${pct ? ' %' : ''}${near.from ? ` (${near.from})` : ''})` : '';
        failures.push({ msg: `${label}: “${token.trim()}” in “${excerpt(unmark(src), at)}” matches no calc or Lab readout in this section${hint} — compute it with a \`calc\`, show it in the Lab, or mark the slide's figure with <q>` });
      }
    };
    for (const s of sections) {
      const cands = expects(s);
      for (const b of blocksOf(s)) {
        if (!NUMBER_PROSE.has(b.kind) || !(b.marked ?? b.text)) continue;
        scan(b.marked ?? b.text, `${where(s)} ${b.kind}`, cands);
      }
    }
    for (const q of quiz) {
      const src = q.exMarked ?? q.ex;
      if (!src) continue;
      scan(src, `${q.where} explanation`, expects(sections.find((s) => s.id === q.sec)));
    }
    report('proseNumbers', failures, 'every decimal and percentage matches a calc or a Lab readout at its default, or is quoted');
  }

  const bad = items.filter((i) => i.ok === false).length;
  const warns = items.filter((i) => i.warn).length;
  return {
    name: 'teaching',
    status: bad ? 'fail' : 'pass',
    headline: bad ? `${bad} problem(s)` : warns ? `${items.length} checks passed, ${warns} warning(s)` : `${items.length} checks passed`,
    items,
  };
}
