import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const RULES_PATH = join(ROOT, 'references', 'visual-rules.json');

// Same loader shape as loadTeachingConfig (src/teaching.mjs): the shipped json is the baseline, a
// project's "visual" block in lykeion.json is a sparse override, and any key that names nothing in
// the baseline is reported instead of being silently ignored — a typo in a threshold must not look
// like a rule that passed.
export async function loadVisualConfig(override = {}) {
  const base = JSON.parse(await readFile(RULES_PATH, 'utf8'));
  const rest = override || {};
  const unknown = Object.keys(rest).filter((k) => !(k in base));
  const rules = { ...base };
  for (const [k, v] of Object.entries(rest)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      rules[k] = { ...base[k], ...v };
    } else {
      rules[k] = v;
    }
  }
  return { rules, unknown, known: Object.keys(base) };
}

// Every rule reports the same shape so the gate can format failures and warnings identically.
const finding = (rule, msg) => ({ rule, msg });

// One scan for one view. The six probes are pure reads of the same DOM, so asking the page six
// times is six round trips for one answer — and the gate pays it per view, which was most of the
// sample's runtime. They stay separate functions, one per rule, and this is the one call that runs
// them; a rule that wants its own round trip has to argue for it.
const SCAN = () => {
  // Runs inside the page: finds the block stack of the shown chapter and the gaps between them.
  const HOLE = () => {
    const sheet = document.querySelector('main .sheet');
    if (!sheet) return { gaps: [] };
    const vis = (el) => {
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && s.display !== 'none';
    };
    const label = (el) => {
      const cls = String(el.className || '').split(/\s+/).filter(Boolean)[0];
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? `.${cls}` : '');
    };
    // The blocks of a chapter are its direct children under the section wrappers; walk the visible
    // boxes in document order and measure the space between consecutive ones.
    const blocks = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (!vis(child)) continue;
        const s = getComputedStyle(child);
        const isWrapper = ['SECTION', 'DIV'].includes(child.tagName) && child.children.length > 1 && !child.matches('.prose, .lab, .analogy, .takeaway, .note, .callout, .erratum, .code, .tablewrap, .formula, .pager');
        if (isWrapper) walk(child);
        else if (child.getClientRects().length > 0 && s.position !== 'absolute' && s.position !== 'fixed') blocks.push(child);
      }
    };
    walk(sheet);
    const gaps = [];
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1].getBoundingClientRect();
      const b = blocks[i].getBoundingClientRect();
      const gap = Math.round(b.top - a.bottom);
      if (gap > 0) gaps.push({ gap, from: label(blocks[i - 1]), to: label(blocks[i]) });
    }
    return { gaps };
  };

  // Runs inside the page: emoji in icon position. Scope is deliberately narrow — headings, nav links,
  // buttons and labels are places a reader reads as iconography, so an emoji there is decoration that
  // substitutes for design. Prose, quiz text and code are the author's own words (a probability
  // lecture may legitimately discuss 🎲), so they are exempt.
  const EMOJI = () => {
    const sheet = document.querySelector('main .sheet') || document.body;
    const SEL = 'h1,h2,h3,h4,h5,h6,nav a,button,[role="button"],label,summary,figcaption,th,.btn,.chipbtn,.tag';
    const PROSE = '.prose,.qtext,.katex,pre,code,table,.lab-body';
    const re = /\p{Extended_Pictographic}/u;
    const label = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 1).map((c) => `.${c}`).join('');
    const hits = [];
    const roots = [sheet, ...document.querySelectorAll('aside,header,footer,.fab')];
    const seen = new Set();
    // An icon is often injected by CSS rather than written in the text (`h2::before{content:"⭐"}`), so
    // the pseudo-elements are part of the same check — that is the most common way an emoji icon
    // reaches a page without the author typing it.
    const pseudo = (el) => ['::before', '::after'].map((p) => {
      const c = getComputedStyle(el, p).content;
      return c && c !== 'none' && c !== 'normal' ? c.replace(/^["']|["']$/g, '') : '';
    }).join('');
    for (const root of roots) {
      for (const el of root.querySelectorAll(SEL)) {
        if (seen.has(el) || el.closest(PROSE) || !el.getClientRects().length) continue;
        seen.add(el);
        const text = (el.textContent || '').trim();
        const m = re.exec(text) || re.exec(pseudo(el));
        if (m) hits.push({ el: label(el), emoji: m[0], text: text.slice(0, 40) });
      }
    }
    return { hits };
  };

  // Runs inside the page: text painted with a gradient. Only a gradient *clipped to the glyphs* counts;
  // the theme's highlight sweeps (`em`, `mark`, `.sec > h3 .t`) set a gradient background with no
  // background-clip and must stay legal.
  const GRADIENT = () => {
    const sheet = document.querySelector('main .sheet') || document.body;
    const label = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 1).map((c) => `.${c}`).join('');
    const hits = [];
    for (const el of [sheet, ...sheet.querySelectorAll('*')]) {
      if (!el.getClientRects().length) continue;
      const s = getComputedStyle(el);
      const clip = s.backgroundClip || s.webkitBackgroundClip || '';
      if (!/text/.test(clip)) continue;
      if (!/gradient/.test(s.backgroundImage || '')) continue;
      hits.push({ el: label(el), text: (el.textContent || '').trim().slice(0, 40) });
    }
    return { hits };
  };

  // Runs inside the page: runs of identical sibling cards. Two cards are a pair; a run of N is a wall
  // the reader scrolls past without reading. "Identical" = same tag + class, and heights within 25%.
  const CARDS = () => {
    const sheet = document.querySelector('main .sheet') || document.body;
    const cls = (el) => el.getAttribute('class') || '';
    const label = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + cls(el).split(/\s+/).filter(Boolean).slice(0, 1).map((c) => `.${c}`).join('');
    const key = (el) => el.tagName.toLowerCase() + '|' + cls(el).split(/\s+/).sort().join('.') + '|' + (el.getAttribute('role') || '');
    // A card is a block-level box, not an inline fragment: `span.katex` runs, table cells and SVG
    // chart parts are layout, not repeated content cards.
    const CARDY = new Set(['block', 'flex', 'grid', 'list-item', 'flow-root']);
    const SKIP = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'SVG', 'UL', 'OL', 'DL', 'SELECT', 'PRE', 'CODE', 'MATH']);
    const card = (el) => {
      if (SKIP.has(el.tagName) || el.closest('svg,math,.katex,pre,code,table')) return false;
      return CARDY.has(getComputedStyle(el).display);
    };
    const runs = [];
    for (const parent of [sheet, ...sheet.querySelectorAll('*')]) {
      if (SKIP.has(parent.tagName) || parent.closest('svg,math,table,pre,code')) continue;
      const kids = [...parent.children].filter((el) => el.getClientRects().length > 0 && !/^(SCRIPT|STYLE)$/.test(el.tagName) && card(el));
      if (kids.length < 2) continue;
      let run = [];
      const flush = () => {
        if (run.length >= 2) runs.push(run);
        run = [];
      };
      for (const kid of kids) {
        const prev = run[run.length - 1];
        const h = kid.getBoundingClientRect().height;
        const a = prev?.getBoundingClientRect();
        const b = kid.getBoundingClientRect();
        // Siblings that share a cell (the `.stack` variants, all `grid-area:1/1`) are alternatives of
        // one block, not a run of cards, so a run has to be stacked in flow.
        const stacked = !a || b.top >= a.bottom - 2;
        const same = prev && stacked && key(prev) === key(kid) && Math.abs(h - a.height) <= Math.max(8, h * 0.25);
        if (same) run.push(kid);
        else {
          flush();
          run = [kid];
        }
      }
      flush();
    }
    return { runs: runs.map((r) => ({ el: label(r[0]), count: r.length })) };
  };

  // Runs inside the page: left edges of text blocks in the reading column. Each distinct left x (2px
  // tolerance) is an edge; a page that stacks its blocks on many different x positions reads as a
  // patchwork instead of a column.
  const EDGES = () => {
    const sheet = document.querySelector('main .sheet') || document.body;
    const SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt';
    const PROSE = 'math,.katex,svg,script,style,.sr-only,pre,code,table,.tablewrap,.lab,.formula,.pager,.hero,.toc';
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const vis = (el) => {
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
    };
    const xs = [];
    for (const el of sheet.querySelectorAll(SEL)) {
      if (el.closest(PROSE) || !vis(el) || !hasText(el)) continue;
      xs.push(Math.round(el.getBoundingClientRect().left));
    }
    const edges = [];
    for (const x of xs.sort((a, b) => a - b)) {
      if (!edges.some((e) => Math.abs(e - x) <= 2)) edges.push(x);
    }
    return { edges };
  };

  // Runs inside the page: distinct computed font sizes among text elements. Too many is noise, too few
  // is no hierarchy at all.
  const SIZES = () => {
    const sheet = document.querySelector('main .sheet') || document.body;
    const SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt';
    const SKIP = 'math,.katex,svg,script,style,.sr-only,pre,code,table,.tablewrap,.lab,.formula';
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const vis = (el) => {
      const s = getComputedStyle(el);
      return el.getClientRects().length > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
    };
    const sizes = new Set();
    for (const el of sheet.querySelectorAll(SEL)) {
      if (el.closest(SKIP) || !vis(el) || !hasText(el)) continue;
      sizes.add(Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10);
    }
    return { sizes: [...sizes].sort((a, b) => b - a) };
  };

  return { hole: HOLE(), emojiIcon: EMOJI(), gradientText: GRADIENT(), cardWall: CARDS(), leftEdges: EDGES(), typeScale: SIZES() };
};

export async function measureVisual(page, rules) {
  const failures = [];
  const warnings = [];
  const vh = page.viewportSize()?.height || 900;
  const scan = await page.evaluate(SCAN);

  const hole = rules.hole;
  if (hole) {
    const { gaps } = scan.hole;
    const limit = Math.round(vh * (hole.maxGapVh ?? 0.5));
    for (const g of gaps) {
      if (g.gap > limit) failures.push(finding('hole', `${g.gap}px gap between ${g.from} and ${g.to} — taller than half the ${vh}px viewport (${limit}px); is a block missing or a margin doubled?`));
    }
  }

  const emojiIcon = rules.emojiIcon;
  if (emojiIcon) {
    for (const h of scan.emojiIcon.hits) failures.push(finding('emojiIcon', `${h.el} uses ${h.emoji} as an icon ("${h.text}") — icons in headings, nav, buttons and labels read as decoration; use a word or a CSS mark instead`));
  }

  const gradientText = rules.gradientText;
  if (gradientText) {
    for (const h of scan.gradientText.hits) failures.push(finding('gradientText', `${h.el} fills its text with a gradient via background-clip:text ("${h.text}") — gradient text costs contrast and looks like a template; use a solid colour`));
  }

  const cardWall = rules.cardWall;
  if (cardWall) {
    const min = cardWall.minRun ?? 4;
    for (const r of scan.cardWall.runs) {
      if (r.count >= min) warnings.push(finding('cardWall', `${r.count} identical ${r.el} siblings in a row — a card wall reads as a list of things nobody chose; merge or vary them`));
    }
  }

  const leftEdges = rules.leftEdges;
  if (leftEdges) {
    const cap = leftEdges.max ?? 5;
    const { edges } = scan.leftEdges;
    if (edges.length > cap) warnings.push(finding('leftEdges', `${edges.length} distinct left edges in the reading column (${edges.join(', ')}px) — more than ${cap}; align the blocks to one column`));
  }

  const typeScale = rules.typeScale;
  if (typeScale) {
    const min = typeScale.min ?? 2;
    const max = typeScale.max ?? 7;
    const { sizes } = scan.typeScale;
    if (sizes.length > max) warnings.push(finding('typeScale', `${sizes.length} distinct font sizes (${sizes.join(', ')}px) — more than ${max}; a type scale should be a scale`));
    else if (sizes.length < min) warnings.push(finding('typeScale', `${sizes.length} distinct font size(s) (${sizes.join(', ')}px) — fewer than ${min}; the page has no hierarchy`));
  }

  return { failures, warnings };
}
