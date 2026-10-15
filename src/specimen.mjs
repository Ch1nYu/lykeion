// Palette Specimen: every Palette applied to the real sample Lecture Site, light and dark side by side.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { checkPalette } from './palette.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = join(ROOT, 'fixtures', 'sample');
const SWATCH = ['paper', 'paper-deep', 'card', 'ink', 'ink-2', 'muted', 'accent', 'accent-soft', 'hl', 'good', 'bad', 's1', 's2', 's3'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function writeSpecimen(palettes, out) {
  const file = resolve(out || join(ROOT, 'tmp', 'specimen', 'index.html'));
  const dir = dirname(file);
  await mkdir(dir, { recursive: true });
  const rows = [];
  for (const p of palettes) {
    const frames = [];
    for (const theme of ['light', 'dark']) {
      const name = `${p.id}-${theme}.html`;
      // Force one theme by giving both slots the same token set.
      await build(SAMPLE, { paletteObj: { ...p, light: p[theme], dark: p[theme] }, out: join(dir, name), writeChecks: false });
      frames.push(`<figure><figcaption>${theme === 'light' ? '淺色 Light' : '深色 Dark'}</figcaption><div class="frame"><iframe src="${name}" loading="lazy" title="${esc(p.name)} ${theme}"></iframe></div></figure>`);
    }
    const r = checkPalette(p);
    const sw = (t) => SWATCH.map((k) => `<span title="${k} ${esc(p[t][k])}" style="background:${esc(p[t][k])}"></span>`).join('');
    rows.push(`<section id="${esc(p.id)}">
  <header><h2>${esc(p.name)} <code>${esc(p.id)}</code></h2><p>${esc(p.description || '')}</p>
  <p class="status ${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓ 通過對比度與色盲檢查' : `✗ ${r.results.filter((x) => !x.ok).length} 項檢查未通過`} · 來源：${esc(p.source)}</p>
  <div class="sw"><b>淺</b>${sw('light')}</div><div class="sw"><b>深</b>${sw('dark')}</div></header>
  <div class="pair">${frames.join('')}</div>
</section>`);
  }
  const html = `<!DOCTYPE html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>lykeion Palette Specimen</title>
<style>
:root{color-scheme:light; --bg:#F6F6F4; --fg:#1E1E1E; --mut:#5A5A5A; --line:#DADADA}
body{margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui,"PingFang TC",sans-serif}
main{max-width:1500px; margin:0 auto; padding:32px 16px 80px}
h1{margin:0 0 4px} .lead{color:var(--mut); margin:0 0 24px}
nav{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:28px} nav a{padding:4px 12px; border:1px solid var(--line); border-radius:999px; color:var(--fg); text-decoration:none; background:#fff}
section{border-top:1px solid var(--line); padding:28px 0}
h2{margin:0; font-size:1.4rem} h2 code{font-size:.85rem; color:var(--mut); margin-left:8px}
header p{margin:4px 0; color:var(--mut)} .status.ok{color:#1F6B3A} .status.bad{color:#A3301F}
.sw{display:flex; align-items:center; gap:4px; margin-top:6px} .sw b{width:1.6em; font-size:.8rem; color:var(--mut)}
.sw span{width:26px; height:26px; border-radius:6px; border:1px solid rgba(0,0,0,.12)}
.pair{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:16px}
figure{margin:0} figcaption{font-size:.85rem; color:var(--mut); margin-bottom:6px}
.frame{position:relative; width:100%; aspect-ratio:1280/900; overflow:hidden; border:1px solid var(--line); border-radius:12px; background:#fff}
.frame iframe{position:absolute; top:0; left:0; width:1280px; height:900px; border:0; transform-origin:0 0}
@media (max-width:900px){.pair{grid-template-columns:minmax(0,1fr)}}
</style></head><body><main>
<h1>Palette Specimen</h1>
<p class="lead">每套 Palette 都套用在同一份範例講堂上，淺色與深色並排。可以直接在框內捲動、拉動 Lab 的滑桿、開始闖關，看實際效果。</p>
<nav>${palettes.map((p) => `<a href="#${esc(p.id)}">${esc(p.name)}</a>`).join('')}</nav>
${rows.join('\n')}
</main>
<script>
function fit(){document.querySelectorAll('.frame').forEach(function(f){f.querySelector('iframe').style.transform='scale('+(f.clientWidth/1280)+')';});}
addEventListener('resize',fit); fit();
</script></body></html>`;
  await writeFile(file, html);
  return file;
}
