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

export function createMarkdown(ctx) {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  mathPlugin(md, ctx);
  // tables get a scroll wrapper and the house style
  md.renderer.rules.table_open = () => '<div class="tablewrap"><table class="data">\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  return md;
}
