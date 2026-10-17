// Markdown → HTML for chapter content: markdown-it plus TeX ($…$, $$…$$) rendered to MathML by KaTeX.
// TeX errors are collected, never silently rendered (ADR 0001).
import MarkdownIt from 'markdown-it';
import katex from 'katex';

export function tex(src, display, errors, where) {
  try {
    return katex.renderToString(src, { output: 'mathml', displayMode: display, throwOnError: true, strict: 'ignore', trust: false });
  } catch (e) {
    errors.push(`${where}: TeX error in "${src.slice(0, 60)}": ${e.message}`);
    return `<code class="tex-error">${src.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code>`;
  }
}

// CommonMark's flanking rules assume spaces around punctuation. Chinese writes ）」。（ directly
// against the emphasised run, so `**向量嵌入（Vector Embeddings）**是` is not right-flanking and the
// markers stay literal. Next to CJK text a marker only needs "not whitespace" on that side, which is
// what a Chinese author expects; everywhere else markdown-it's own rules apply unchanged.
const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uFF00-\uFFEF\u3040-\u30FF\uAC00-\uD7AF\uF900-\uFAFF]/;

function cjkEmphasisPlugin(md) {
  // Same shape as markdown-it's own emphasis tokenizer (it splits a run into one token per marker so
  // `***x***` can pair up); only the flanking decision is relaxed, and only beside CJK characters.
  md.inline.ruler.at('emphasis', (state, silent) => {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) return false;
    if (marker !== 95 && marker !== 42) return false;
    const scanned = state.scanDelims(start, marker === 42);
    const prev = start > 0 ? state.src[start - 1] : '';
    const next = state.src[start + scanned.length] || '';
    let open = scanned.can_open, close = scanned.can_close;
    if (CJK.test(prev) || CJK.test(next)) {
      if (next && !/\s/.test(next)) open = true;
      if (prev && !/\s/.test(prev)) close = true;
    }
    for (let i = 0; i < scanned.length; i++) {
      const token = state.push('text', '', 0);
      token.content = String.fromCharCode(marker);
      state.delimiters.push({ marker, length: scanned.length, token: state.tokens.length - 1, end: -1, open, close });
    }
    state.pos += scanned.length;
    return true;
  });
}

function mathPlugin(md, ctx) {
  // inline $…$ (not $$), no space just inside the delimiters, closing $ not followed by a digit
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    const s = state.src, p = state.pos;
    if (s[p] !== '$' || s[p + 1] === '$') return false;
    if (/\s/.test(s[p + 1] || ' ')) return false;
    let q = p + 1;
    while ((q = s.indexOf('$', q)) !== -1) {
      if (s[q - 1] === '\\') { q++; continue; }
      if (/\s/.test(s[q - 1]) || /\d/.test(s[q + 1] || '')) { q++; continue; }
      break;
    }
    if (q === -1) return false;
    if (!silent) { const t = state.push('math_inline', 'math', 0); t.content = s.slice(p + 1, q); }
    state.pos = q + 1;
    return true;
  });
  // block $$ … $$ (may span lines)
  md.block.ruler.after('fence', 'math_block', (state, start, end, silent) => {
    let pos = state.bMarks[start] + state.tShift[start];
    if (state.src.slice(pos, pos + 2) !== '$$') return false;
    if (silent) return true;
    let first = state.src.slice(pos + 2, state.eMarks[start]);
    let content, line = start;
    if (first.trim().endsWith('$$')) content = first.trim().slice(0, -2);
    else {
      const parts = [first];
      for (line = start + 1; line < end; line++) {
        const l = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
        if (l.trim().endsWith('$$')) { parts.push(l.trim().slice(0, -2)); break; }
        parts.push(l);
      }
      if (line >= end) return false;
      content = parts.join('\n');
    }
    const t = state.push('math_block', 'math', 0);
    t.content = content.trim(); t.map = [start, line + 1];
    state.line = line + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, i) => tex(tokens[i].content, false, ctx.errors, ctx.where);
  md.renderer.rules.math_block = (tokens, i) => `<div class="formula">${tex(tokens[i].content, true, ctx.errors, ctx.where)}</div>\n`;
}

// A fence info string carries a first word (a language for a listing, a block name for a custom block),
// then optional attributes: `python title="Top-K 查詢"`. Only `title` means anything to the build (a
// caption); other attributes are parsed so a listing copied from another tool still builds, then dropped.
// A word containing `=` is an attribute, never a language, so a bare `title="x"` does not become
// `language-title="x"`, and an attribute never leaks into a block name (`quiz 條件機率 title="x"`).
export function fenceInfo(info) {
  const src = String(info || '').trim();
  // Tokenise on whitespace, but keep a quoted value whole so `title="a b"` stays one attribute.
  const parts = [];
  const re = /(?:^|\s+)(?:([\w-]+)=("([^"]*)"|'([^']*)'|(\S*))|(\S+))/g;
  for (let m; (m = re.exec(src));) {
    if (m[6] !== undefined) parts.push({ word: m[6] });
    else parts.push({ key: m[1], value: m[3] ?? m[4] ?? m[5] ?? '' });
  }
  const words = parts.filter((p) => p.word !== undefined).map((p) => p.word);
  const attrs = {};
  for (const p of parts) if (p.key) attrs[p.key] = p.value;
  return { lang: words[0] || '', attrs, words };
}

export function createMarkdown(ctx) {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  cjkEmphasisPlugin(md);
  mathPlugin(md, ctx);
  // tables get a scroll wrapper and the house style
  md.renderer.rules.table_open = () => '<div class="tablewrap"><table class="data">\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  return md;
}
