/* lykeion runtime: views & router, navigation, reading progress, theme, floating actions,
   quiz engine, Lab host. Page content is produced by `lykeion build`; this file only wires
   behaviour onto that markup. */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function H(tag, attrs = {}, html) { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQ = matchMedia('(prefers-color-scheme: dark)');
function fillRange(inp) { const p = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--p', p + '%'); }
function setSeg(seg, v) { $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
function onSeg(seg, fn) { seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg(seg, b.dataset.v); fn(b.dataset.v); }); }
function pulse(el) { if (!el || reduceMotion) return; el.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
function setVal(el, txt) { if (el.textContent !== txt) { el.textContent = txt; pulse(el); } }
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

/* A label copied from rendered prose must not carry the maths source with it. KaTeX writes the TeX
   into an <annotation> beside the rendered MathML, and textContent flattens both, so a heading
   “除以 $\sqrt{d_k}$” read as “除以 dk\sqrt{d_k}”. A label that can hold HTML keeps the rendered
   maths and drops the annotation; a label that is only text (a toast, an aria-label) reads the
   clean `data-title` the build wrote for it — never the TeX. */
const dropTex = node => { const c = node.cloneNode(true); $$('annotation', c).forEach(a => a.remove()); return c; };
const labelHtml = node => (node ? dropTex(node).innerHTML : '');
// The rendered title of a section sits in its `.t`; a view names itself in its `h2`.
const titleEl = el => (el && ($('.t', el) || $('h2,h1', el))) || null;

/* One grid cell, every variant stacked on top of each other: switching text never changes the box
   height, so a readout or a verdict can change without the page jumping under the reader's eyes.
   show(-1) hides all variants but keeps the reserved space. */
function stack(el, htmls) {
  el.classList.add('stack');
  el.innerHTML = htmls.map((h, i) => `<span data-i="${i}">${h}</span>`).join('');
  const cells = [...el.children];
  // Screen readers only hear what changes, and a stack changes nothing but `visibility`. This
  // hidden live region carries the text of the variant that is showing, so it is announced.
  const live = H('span', { class: 'sr-only', 'aria-live': 'polite' });
  el.appendChild(live);
  return {
    show(i) {
      cells.forEach((c, k) => c.classList.toggle('on', k === i));
      // No variant (i = -1) keeps the box as tall as the tallest one but drops its padding.
      el.classList.toggle('is-empty', i < 0);
      live.textContent = i >= 0 && cells[i] ? cells[i].textContent : '';
    }
  };
}

/* ================= data & strings ================= */
const DATA = JSON.parse($('#lykeion-data').textContent);
const STR = Object.assign({
  menu: '目錄', navLabel: '章節導覽', chapters: '章節', home: '總覽', reset: '重設進度', resetAsk: '確定清除所有閱讀紀錄與闖關成績？', resetYes: '清除', resetNo: '取消', resetDone: '進度已清除',
  notStarted: '尚未開始', allDone: '全部完成', readOf: '讀完 {r} / {t} 節', passedOf: '闖關通過 {p} / {t} 關', readToast: '§{n} {t} 已讀完',
  themeToDark: '切換成深色模式', themeToLight: '切換成淺色模式', toTop: '回到頁首', skip: '跳到內容',
  level: '第 {n} 關', qCount: '{n} 題', locked: '第 {n} 關「{t}」尚未解鎖。', lockedHint: '先通過第 {n} 關「{t}」（正確率 60% 以上）。', goLevel: '前往第 {n} 關',
  intro: '每題作答後立刻顯示解析；正確率 60% 以上解鎖下一關。', best: '最佳紀錄：{p}%', start: '開始挑戰', again: '再挑戰一次',
  qOf: '第 {i} / {n} 題　答對 {c}', answer: '輸入答案', check: '確認', next: '下一題', result: '看結果', combo: '連續答對 {n} 題！',
  right: '答對了。', wrong: '再想想。', correctIs: '正確答案是 {a}。', backTo: '回到 §{n} {t}', pages: '講義 p.{p}',
  perfect: '滿分過關', pass: '過關', fail: '還差一點', score: '答對 {c} / {n}', unlockedNext: '第 {n} 關「{t}」已解鎖。', allLevels: '所有關卡都完成了。',
  needPass: '正確率要 60% 以上才能解鎖下一關。', retry: '重新挑戰', review: '這次答錯的題目', passedToast: '第 {n} 關通過 {s}', labError: '這個 Lab 載入失敗：{e}',
  copy: '複製程式碼', copied: '已複製到剪貼簿', copyFail: '無法自動複製，請手動選取複製'
}, DATA.strings || {});
const T = (k, v = {}) => STR[k].replace(/\{(\w+)\}/g, (_, x) => (x in v ? v[x] : ''));
// A template slot that is filled with rendered HTML rather than text: `backTo` names a section, and a
// section title may hold maths, which has to arrive as markup (see `labelHtml`).
const LABEL = '\u0000';
const LEVELS = DATA.levels || [];

/* ================= storage ================= */
const store = {
  key: DATA.key || 'lykeion', data: { read: [], quiz: {}, theme: 'system' },
  load() {
    try {
      const r = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (r && typeof r === 'object') {
        if (Array.isArray(r.read)) this.data.read = r.read.filter(x => typeof x === 'string');
        if (r.quiz && typeof r.quiz === 'object' && !Array.isArray(r.quiz)) this.data.quiz = r.quiz;
        if (['system', 'light', 'dark'].includes(r.theme)) this.data.theme = r.theme;
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ } }
};

/* ================= Lab host ================= */
const labTypes = {};
const api = { $, $$, H, S, esc, fmt, fillRange, setSeg, onSeg, pulse, setVal, toast, reduceMotion, stack };
// The router lives in start()'s closure, but the public API object is created before start() runs,
// so these two are forwarded through a holder that start() fills in.
const publicApi = { show: () => null, views: () => [] };
function registerLab(type, mount) { labTypes[type] = mount; }
// Labs mount the first time their view is shown: a chapter nobody opened costs nothing to read.
const mountedLabs = new WeakSet();
function mountLab(lab) {
  const body = $('.lab-body', lab), type = lab.dataset.lab;
  try {
    const p = $('script.lab-params', lab);
    const params = p ? JSON.parse(p.textContent) : {};
    if (!labTypes[type]) throw new Error(`unknown Lab type "${type}"`);
    labTypes[type](body, params, api);
    $$('input[type=range]', body).forEach(fillRange);
  } catch (e) {
    body.innerHTML = `<p class="lab-error">${esc(T('labError', { e: e.message }))}</p>`;
    console.error(`[lykeion] Lab ${lab.id || type}:`, e);
  }
}
function mountLabsIn(root) {
  $$('.lab[data-lab]', root).forEach(lab => {
    if (mountedLabs.has(lab)) return;
    mountedLabs.add(lab);
    mountLab(lab);
  });
}

/* Each code listing gets a small copy button: a real <button> so it is keyboard-focusable
   with an aria-label, answered by the existing toast. Graceful without the Clipboard API
   (a non-secure context or an old reader): fall back to selecting the code, still with a toast. */
function mountCodeCopy() {
  $$('.code').forEach(box => {
    if (box.querySelector('.code-copy')) return;
    const pre = box.querySelector('pre');
    if (!pre) return;
    if (!box.querySelector('.code-bar')) box.classList.add('naked');
    const bar = box.querySelector('.code-bar');
    const btn = H('button', { type: 'button', class: 'code-copy', 'aria-label': STR.copy },
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>');
    btn.title = STR.copy;
    btn.addEventListener('click', async () => {
      const code = box.querySelector('pre code') || pre;
      const text = code.textContent;
      let done = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          done = true;
        }
      } catch (e) { /* fall through to the selection fallback */ }
      if (!done) {
        const sel = getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      toast(done ? STR.copied : STR.copyFail);
    });
    // Inside the bar the button sits in the flex flow (margin-left:auto pushes it right);
    // a bar-less listing gets it overlaid, with padding kept clear of the code.
    (bar || box).appendChild(btn);
  });
}

/* A formula broken into parts: each clickable piece shows its own explanation in the one stack
   area below the formula. The pieces are buttons in the markup already, so this only wires the
   selection — with no script the formula still reads as a whole, and the first explanation is
   already the visible one. */
function mountFormulaParts() {
  $$('.formula.parts').forEach(box => {
    const pieces = $$('.eq button.piece', box);
    const say = box.querySelector('.say');
    if (!pieces.length || !say || box.dataset.wired) return;
    box.dataset.wired = '1';
    const cells = [...say.querySelectorAll('[data-part]')];
    const live = say.querySelector('[aria-live]');
    const show = (i) => {
      pieces.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.part) === i)));
      cells.forEach(c => c.classList.toggle('on', Number(c.dataset.part) === i));
      // Same contract as api.stack: the live region carries the text that just became visible, so a
      // screen reader hears the new explanation without re-reading the whole formula.
      if (live) {
        const on = cells.find(c => Number(c.dataset.part) === i);
        live.textContent = on ? on.textContent : '';
      }
    };
    // The build marks the first clickable piece as pressed; mirror that into the stack so the two
    // cannot disagree if a browser restores a previous selection on reload.
    const first = pieces.find(b => b.getAttribute('aria-pressed') === 'true') || pieces[0];
    show(Number(first.dataset.part));
    pieces.forEach(b => b.addEventListener('click', () => show(Number(b.dataset.part))));
  });
}

function start() {
  store.load();
  $$('[data-str]').forEach(el => { el.textContent = STR[el.dataset.str]; });
  $$('[data-str-label]').forEach(el => el.setAttribute('aria-label', STR[el.dataset.strLabel]));
  document.addEventListener('input', e => { if (e.target.matches('input[type=range]')) fillRange(e.target); });

  /* ---------- views & router ---------- */
  // A view is the hero or one chapter; exactly one is shown, the rest are hidden. Every in-page
  // link is a view change, so a section link to another chapter opens that chapter first.
  const views = $$('.view');
  const viewById = new Map(views.map(v => [v.id, v]));
  const viewOf = new Map();          // any element id inside a view → that view's id
  views.forEach(v => {
    viewOf.set(v.id, v.id);
    $$('[id]', v).forEach(el => viewOf.set(el.id, v.id));
  });
  let currentView = null;
  let navLinks = {};
  let navQuiz = null;
  const CHECK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.3 8 2.8"/></svg>';
  const sections = $$('.sec').filter(s => !s.dataset.quiz);
  const nav = $('#nav');
  const chaps = $('#chaps');
  // The tab strip lives in the top bar on a wide screen and at the top of the drawer on a phone;
  // both copies are built from the same list so they can never disagree.
  const chapsSide = $('#chapsSide');
  const tabsOf = id => [chaps, chapsSide].flatMap(h => [...h.querySelectorAll('button')]).filter(b => b.dataset.view === id);

  function viewTitle(v) { return v.dataset.title || $('h2,h1', v)?.textContent?.trim() || v.id; }
  // The hero's own title is a sentence, not a tab label; a view can name itself with `data-tab`,
  // and the home view falls back to the short `home` string.
  function viewTab(v) {
    if (v.dataset.tab) return v.dataset.tab;
    if (v.id === 'home') return STR.home;
    return viewTitle(v);
  }
  function viewNum(v) { return v.dataset.num || ''; }

  // The sticky bar's height is the scroll offset a deep link has to clear, and the sidebar's top.
  const topbar = $('#topbar');
  function measureTop() {
    const h = topbar ? Math.round(topbar.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--top-h', h + 'px');
  }

  function fillQuizNav() {
    if (!navQuiz) return;
    $$('a', navQuiz).forEach((a, i) => {
      const r = store.data.quiz[i];
      a.className = (r && r.passed ? 'read' : '') + (unlocked(i) ? '' : ' locked');
      a.innerHTML = `<span class="dot">${CHECK}</span><span class="num">L${i + 1}</span><span>${esc(LEVELS[i].t)} <span class="stars">${r ? starsTxt(r.stars) : ''}</span></span>`;
    });
  }

  // The sidebar only ever lists the view being read: its sections, and under the section the reader
  // is in, that section's own sub-headings (which need ids to be linkable).
  function renderNav(viewId) {
    nav.innerHTML = '';
    navLinks = {};
    navQuiz = null;
    const v = viewById.get(viewId);
    if (!v || !v.classList.contains('chapter')) {
      const g = H('div', { class: 'nav-group home' });
      g.appendChild(H('div', { class: 'nav-ch' }, esc(STR.chapters)));
      const ol = H('ol');
      views.filter(x => x.classList.contains('chapter')).forEach(ch => {
        const a = H('a', { href: '#' + ch.id }, `<span class="dot">${CHECK}</span><span class="num">${esc(viewNum(ch))}</span><span>${esc(viewTab(ch))}</span>`);
        navLinks[ch.id] = a;
        ol.appendChild(H('li')).appendChild(a);
      });
      g.appendChild(ol); nav.appendChild(g);
      paintRead();
      return;
    }
    const g = H('div', { class: 'nav-group' });
    g.appendChild(H('div', { class: 'nav-ch' }, `<span class="n">${esc(viewNum(v))}</span>${esc(viewTab(v))}`));
    const ol = H('ol');
    if (v.id === 'quizCh') {
      LEVELS.forEach((L, i) => ol.appendChild(H('li')).appendChild(H('a', { href: '#quiz', 'data-level': i })));
      navQuiz = ol;
    } else {
      $$('.sec', v).forEach(sec => {
        const a = H('a', { href: '#' + sec.id }, `<span class="dot">${CHECK}</span><span class="num">${esc(sec.dataset.num)}</span><span>${labelHtml(titleEl(sec)) || esc(sec.dataset.title)}</span>`);
        navLinks[sec.id] = a;
        ol.appendChild(H('li')).appendChild(a);
      });
    }
    g.appendChild(ol); nav.appendChild(g);
    paintRead();
    fillQuizNav();
    if (currentId) renderSubs(currentId);
    setCurrent(currentId, true);
  }

  function renderSubs(id) {
    $$('.nav .subs').forEach(el => el.remove());
    const sec = document.getElementById(id);
    if (!sec || !navLinks[id]) return;
    const heads = $$('h3[id],h4[id],h5[id]', sec).filter(h => h.parentElement !== sec || h.tagName !== 'H3');
    if (!heads.length) return;
    const wrap = H('div', { class: 'subs' });
    const ol = H('ol');
    heads.forEach(h => {
      const a = H('a', { class: 'sub', href: '#' + h.id }, labelHtml(h));
      navLinks[h.id] = a;
      ol.appendChild(H('li')).appendChild(a);
    });
    wrap.appendChild(ol);
    navLinks[id].closest('li').appendChild(wrap);
  }

  function paintRead() {
    const read = new Set(store.data.read);
    Object.keys(navLinks).forEach(id => {
      const a = navLinks[id], sec = document.getElementById(id);
      if (!sec) return;
      if (sec.classList.contains('chapter')) {
        const own = $$('.sec', sec).filter(s => !s.dataset.quiz);
        a.classList.toggle('read', own.length > 0 && own.every(s => read.has(s.id)));
      } else a.classList.toggle('read', read.has(id));
    });
  }

  function updateTabs() {
    views.forEach(v => {
      const on = v.id === currentView;
      tabsOf(v.id).forEach(b => {
        // Only one strip is on screen (the top bar on wide, the drawer's on narrow); marking both
        // would leave a stale `aria-current` in whichever strip reappears next.
        if (on && b.offsetParent !== null) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    });
    // The tab strip scrolls on a narrow screen: keep the open chapter visible in it.
    chaps.querySelectorAll('button[aria-current="true"]').forEach(b => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }

  // A hash resolves to the view that owns the target element, so a section link in a later chapter
  // opens that chapter. Targets outside every view (the sheet itself) keep the current view.
  function resolve(hash) {
    // `decodeURIComponent` throws on a malformed escape (`#%`, `#ch1%`), and that used to abort
    // `start()` before any view was chosen, leaving every view on the page at once.
    const raw = String(hash || '').replace(/^#/, '');
    let id = raw;
    try { id = decodeURIComponent(raw); } catch (e) { /* keep the undecoded string */ }
    const el = id ? document.getElementById(id) : null;
    if (!el) return { view: views[0], el: null, own: true };
    const vid = viewById.has(id) ? id : viewOf.get(id);
    if (!vid) return { view: viewById.get(currentView) || views[0], el, own: false };
    return { view: viewById.get(vid), el, own: true };
  }

  function setView(viewId) {
    const v = viewById.get(viewId) || views[0];
    if (!v) return null;
    if (currentView !== v.id) {
      if (currentId) { dwell[currentId] = dwellOf(currentId); currentId = null; currentSince = performance.now(); }
      views.forEach(x => { x.hidden = x !== v; });
      currentView = v.id;
      // `renderNav` rebuilds the sidebar, which throws away the link the reader just activated. Put
      // focus back inside the new sidebar so the keyboard does not fall back to the top of the page.
      const lost = $('#nav')?.contains(document.activeElement);
      renderNav(v.id);
      if (lost) {
        const back = (currentId && navLinks[currentId]) || $('#nav a') || $('#main');
        back.focus({ preventScroll: true });
      }
      updateTabs();
      mountLabsIn(v);
      // A view that was just opened has no current section yet, so the sidebar would sit without its
      // sub-headings until the reader scrolled. Name the view's first section instead.
      const first = $$('.sec', v)[0];
      if (first) setCurrent(first.id, true);
      else if ($('#topTitle')) $('#topTitle').textContent = '';
      // The sidebar's own scroll position belongs to the chapter that was open.
      const side = $('#side');
      if (side) side.scrollTop = 0;
    }
    return v;
  }

  function scrollToEl(el, instant) {
    const behavior = instant || reduceMotion ? 'auto' : 'smooth';
    // `html{scroll-behavior:smooth}` would animate an `auto` scroll too, so a jump the caller asked
    // to be instant (a deep link on load, a popstate) is forced through a temporary override.
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    if (behavior === 'auto') root.style.scrollBehavior = 'auto';
    // A view id (a chapter, the hero) always lands at the very top; a section clears the sticky bar,
    // which `scroll-padding-top` already accounts for.
    if (!el || el.classList.contains('view')) window.scrollTo({ top: 0, behavior });
    else el.scrollIntoView({ behavior, block: 'start' });
    if (behavior === 'auto') root.style.scrollBehavior = prev;
  }

  // Public: open a view by id, optionally without scrolling (the router scrolls, callers may not want to).
  function showView(id, opts = {}) {
    const { view, el } = resolve('#' + String(id).replace(/^#/, ''));
    const v = setView(view.id);
    if (el && el !== view) setCurrent(el.id, true);
    if (!opts.noScroll) scrollToEl(el, opts.instant);
    return v ? v.id : null;
  }
  publicApi.show = showView;
  publicApi.views = () => views.map(v => ({ id: v.id, title: viewTitle(v), num: viewNum(v), tab: viewTab(v) }));

  function navigate(href, opts = {}) {
    const { view, el, own } = resolve(href);
    if (own) setView(view.id);
    if (el && el !== view) setCurrent(el.id, true);
    // A caller that scrolls itself (the quiz card) passes `noScroll`, so the page does not travel to
    // the section and then again to the card inside it.
    if (!opts.noScroll) scrollToEl(el, opts.instant);
    if (opts.push !== false && own) {
      try { history.pushState({ view: view.id }, '', '#' + (el ? el.id : view.id)); }
      catch (e) { /* file:// documents have no history API: the view still changes */ }
    }
  }

  views.forEach(v => {
    [chaps, chapsSide].forEach(host => {
      const b = H('button', { type: 'button', 'data-view': v.id },
        `<span>${esc(viewNum(v))}</span> ${esc(viewTab(v))}`);
      b.addEventListener('click', () => navigate('#' + v.id));
      host.appendChild(b);
    });
  });
  chaps.setAttribute('aria-label', STR.chapters);
  chapsSide.setAttribute('aria-label', STR.chapters);

  // Every in-page link goes through the router: no native hash jump, and the browser's own
  // back/forward still walks the views the reader visited.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    // The skip link has its own handler (focus into main); the quiz levels are not router targets.
    if (!a || a.hasAttribute('data-level') || a.classList.contains('skip')) return;
    const href = a.getAttribute('href');
    if (!href || href === '#' || !document.getElementById(href.slice(1))) return;
    e.preventDefault();
    drawer(false);
    navigate(href);
  });
  window.addEventListener('popstate', () => navigate(location.hash || '#', { push: false, instant: true }));
  window.addEventListener('resize', measureTop, { passive: true });
  measureTop();

  /* ---------- theme (floating button) ---------- */
  // Two states only: the button flips between light and dark relative to whatever is showing now.
  // The stored value is still three-way, so a reader who never pressed it keeps following the system.
  const themeBtn = $('#themeBtn');
  const effectiveTheme = () => (store.data.theme === 'system' ? (darkQ.matches ? 'dark' : 'light') : store.data.theme);
  function syncTheme() {
    const t = effectiveTheme();
    themeBtn.dataset.mode = t;
    const label = t === 'dark' ? STR.themeToLight : STR.themeToDark;
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  }
  function setTheme(t) {
    store.data.theme = t;
    store.save();
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    syncTheme();
  }
  darkQ.addEventListener('change', syncTheme);
  themeBtn.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    if (reduceMotion) { setTheme(next); return; }
    // No View Transitions: cross-fade the colours instead, still without a hard flash.
    if (typeof document.startViewTransition !== 'function') {
      document.documentElement.classList.add('theme-fade');
      setTheme(next);
      setTimeout(() => document.documentElement.classList.remove('theme-fade'), 400);
      return;
    }
    // A circle grows out of the button, so the reader sees where the switch came from.
    const r = themeBtn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const rad = Math.round(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
    try {
      const vt = document.startViewTransition(() => setTheme(next));
      vt.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
          { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => { /* the transition was skipped; the theme still changed */ });
    } catch (e) { setTheme(next); }
  });
  syncTheme();

  /* ---------- back to top ---------- */
  const toTop = $('#toTop');
  toTop.setAttribute('aria-label', STR.toTop); toTop.title = STR.toTop;
  // It starts hidden at the top of the page, so it also starts out of the tab order.
  toTop.tabIndex = -1; toTop.setAttribute('aria-hidden', 'true');
  toTop.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); $('#main').focus?.({ preventScroll: true }); });

  /* ---------- navigation state ---------- */
  function updateProgress() {
    const read = sections.filter(s => store.data.read.includes(s.id)).length;
    const passed = LEVELS.filter((_, i) => store.data.quiz[i] && store.data.quiz[i].passed).length;
    const total = sections.length + LEVELS.length;
    const pct = total ? Math.round((read + passed) / total * 100) : 0;
    const C = 2 * Math.PI * 27;
    $('#ringVal').style.strokeDashoffset = C * (1 - pct / 100);
    $('#ringTxt').textContent = pct + '%';
    $('#topPct').textContent = pct + '%';
    $('#meterMain').textContent = pct === 100 ? STR.allDone : pct === 0 ? STR.notStarted : T('readOf', { r: read, t: sections.length });
    $('#meterSub').textContent = LEVELS.length ? T('passedOf', { p: passed, t: LEVELS.length }) : '';
  }
  function markRead(id) {
    if (store.data.read.includes(id)) return;
    store.data.read.push(id); store.save();
    navLinks[id] && navLinks[id].classList.add('read');
    updateProgress();
    const s = document.getElementById(id); toast(T('readToast', { n: s.dataset.num, t: s.dataset.title }));
  }

  // A section counts as read only after its end has been seen AND it was the current section long enough.
  const DWELL_MS = 6000;
  const dwell = {}; const endSeen = new Set();
  let currentId = null, currentSince = performance.now();
  const endObs = new IntersectionObserver(es => es.forEach(e => { const sec = e.target.closest('.sec'); if (sec && e.isIntersecting) endSeen.add(sec.id); }), { rootMargin: '0px 0px -10% 0px' });
  sections.forEach(s => { const end = $('.sec-end', s); if (end) endObs.observe(end); });
  function dwellOf(id) { return (dwell[id] || 0) + (id === currentId && document.visibilityState === 'visible' ? performance.now() - currentSince : 0); }
  setInterval(() => { endSeen.forEach(id => { if (dwellOf(id) >= DWELL_MS) { markRead(id); endSeen.delete(id); } }); }, 1000);

  const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); if (e.target.classList.contains('sec')) setCurrent(e.target.id); else if (e.target.id) setCurrent(e.target.id); } }), { rootMargin: '-25% 0px -65% 0px' });
  sections.forEach(s => spy.observe(s));
  const seenObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('seen'); }), { threshold: .05 });
  $$('.sec').forEach(s => seenObs.observe(s));
  function setCurrent(id, force) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    // A sub-heading only takes the highlight inside its section; the section stays current.
    if (/^H[3-5]$/.test(el.tagName)) {
      $$('.nav a.sub.current').forEach(a => a.classList.remove('current'));
      if (navLinks[id]) navLinks[id].classList.add('current');
      return;
    }
    if (currentId === id && !force) return;
    if (currentId) dwell[currentId] = dwellOf(currentId);
    currentId = id; currentSince = performance.now();
    $$('.nav a.current').forEach(a => a.classList.remove('current'));
    if (navLinks[id]) navLinks[id].classList.add('current');
    // The top bar names the section the reader is in; a view with no section (the quiz levels, the
    // chapter index) has nothing to name, so it is cleared instead of naming the previous view's.
    const s = document.getElementById(id); if ($('#topTitle')) $('#topTitle').innerHTML = s && s.dataset.num ? `§${esc(s.dataset.num)} ${labelHtml(titleEl(s)) || esc(s.dataset.title)}` : '';
    renderSubs(id);
    const heads = s ? $$('h3[id],h4[id],h5[id]', s) : [];
    heads.forEach(h => spy.observe(h));
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement; const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      $('#readbar').style.width = (p * 100).toFixed(1) + '%';
      // A faded button is still in the tab order, so it is taken out of it too, not just hidden.
      const up = h.scrollTop > window.innerHeight;
      toTop.classList.toggle('show', up);
      toTop.tabIndex = up ? 0 : -1;
      toTop.setAttribute('aria-hidden', up ? 'false' : 'true');
      ticking = false;
    });
  }, { passive: true });

  /* ---------- mobile drawer ---------- */
  const side = $('#side'), scrim = $('#scrim'), menuBtn = $('#menuBtn');
  const narrow = matchMedia('(max-width: 900px)');
  function syncInert() { const hide = narrow.matches && !side.classList.contains('open'); side.inert = hide; }
  function drawer(open) {
    side.classList.toggle('open', open); scrim.classList.toggle('show', open); menuBtn.setAttribute('aria-expanded', String(open)); syncInert();
    if (open) (side.querySelector('.nav a.current') || side.querySelector('.nav a'))?.focus({ preventScroll: true });
    else if (narrow.matches && side.contains(document.activeElement)) menuBtn.focus({ preventScroll: true });
  }
  narrow.addEventListener('change', () => { if (!narrow.matches) drawer(false); syncInert(); measureTop(); });
  syncInert();
  menuBtn.addEventListener('click', () => drawer(!side.classList.contains('open')));
  scrim.addEventListener('click', () => drawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) drawer(false); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) drawer(false); });
  // The chapter tabs live in the drawer on a phone; picking one is also a navigation, so close it.
  chapsSide.addEventListener('click', e => { if (e.target.closest('button')) drawer(false); });

  /* ---------- skip link ---------- */
  // The sidebar is a long list of links before the sheet, so the first Tab stop jumps over it.
  $('.skip')?.addEventListener('click', e => {
    e.preventDefault();
    drawer(false);
    const main = $('#main');
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------- reset ---------- */
  $('#resetBtn').addEventListener('click', () => { $('#resetConfirm').hidden = false; $('#resetNo').focus(); });
  $('#resetNo').addEventListener('click', () => { $('#resetConfirm').hidden = true; });
  $('#resetYes').addEventListener('click', () => {
    store.data.read = []; store.data.quiz = {}; store.save(); $('#resetConfirm').hidden = true;
    Object.keys(dwell).forEach(k => delete dwell[k]); endSeen.clear();
    Object.values(navLinks).forEach(a => a.classList.remove('read'));
    if (LEVELS.length) { Quiz.select(0, true); renderTrail(); }
    updateProgress(); toast(STR.resetDone);
  });

  /* ================= quiz ================= */
  const LOCK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const starsTxt = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const unlocked = i => i === 0 || !!(store.data.quiz[i - 1] && store.data.quiz[i - 1].passed);
  function secLink(q) {
    const s = q.sec && document.getElementById(q.sec);
    // The link text is built from a template, so the title slot takes the rendered maths in place of
    // a placeholder instead of being escaped into it.
    const back = s ? `<a href="#${esc(q.sec)}">${esc(T('backTo', { n: s.dataset.num, t: LABEL })).replace(LABEL, labelHtml(titleEl(s)) || esc(s.dataset.title))}</a>` : '';
    const pages = q.pages ? `<span class="mono">${esc(T('pages', { p: q.pages }))}</span>` : '';
    return back || pages ? `<span class="src">${[back, pages].filter(Boolean).join('　')}</span>` : '';
  }
  function renderTrail() {
    const tr = $('#trail'); tr.innerHTML = '';
    LEVELS.forEach((L, i) => {
      if (i) tr.appendChild(H('span', { class: 'link', 'aria-hidden': 'true' }));
      const r = store.data.quiz[i];
      const b = H('button', { type: 'button', class: 'stop' + (i === Quiz.level ? ' active' : '') + (r && r.passed ? ' done' : '') + (unlocked(i) ? '' : ' locked'), 'aria-label': `${T('level', { n: i + 1 })} ${L.t}`, 'aria-current': String(i === Quiz.level) },
        `<span class="disc">${unlocked(i) ? i + 1 : LOCK}</span><small>${esc(L.t)}</small><span class="st">${r ? starsTxt(r.stars) : ''}</span>`);
      b.addEventListener('click', () => Quiz.select(i)); tr.appendChild(b);
    });
    fillQuizNav();
  }
  const Quiz = {
    level: 0, qi: 0, correct: 0, combo: 0, answered: false, order: [], wrong: [],
    select(i, silent) {
      this.level = i; this.qi = -1; renderTrail(); this.intro();
      if (!silent) document.getElementById('quiz').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    },
    reset() { this.qi = 0; this.correct = 0; this.combo = 0; this.wrong = []; this.ask(); },
    intro() {
      const L = LEVELS[this.level], r = store.data.quiz[this.level], st = $('#qStage');
      if (!unlocked(this.level)) {
        st.innerHTML = `<div class="qcard"><p class="qtext">${esc(T('locked', { n: this.level + 1, t: L.t }))}</p><p>${esc(T('lockedHint', { n: this.level, t: LEVELS[this.level - 1].t }))}</p><button class="btn primary" id="qGo">${esc(T('goLevel', { n: this.level }))}</button></div>`;
        $('#qGo').onclick = () => this.select(this.level - 1, true); return;
      }
      st.innerHTML = `<div class="qcard"><div class="qmeta"><span>${esc(T('level', { n: this.level + 1 }))}</span><span>${esc(T('qCount', { n: L.qs.length }))}</span></div><p class="qtext qtitle">${esc(L.t)}</p><p class="qsub">${esc(L.s || '')}${L.s ? '。' : ''}${esc(STR.intro)}</p>${r ? `<p class="mono" style="color:var(--muted)">${esc(T('best', { p: Math.round(r.best * 100) }))}　${starsTxt(r.stars)}</p>` : ''}<button class="btn primary" id="qGo">${esc(r ? STR.again : STR.start)}</button></div>`;
      $('#qGo').onclick = () => this.reset();
    },
    ask() {
      const L = LEVELS[this.level], q = L.qs[this.qi], st = $('#qStage'); this.answered = false;
      this.order = q.type === 'num' ? [] : shuffle(q.o.map((_, i) => i));
      const body = q.type === 'num'
        ? `<div class="numans"><input type="number" step="any" id="qNum" inputmode="decimal" aria-label="${esc(STR.answer)}"><button class="btn primary" id="qCheck">${esc(STR.check)}</button></div>`
        : `<div class="opts">${this.order.map((oi, k) => `<button class="opt" data-i="${oi}"><span class="k">${'ABCDEFGH'[k]}</span><span>${q.o[oi]}</span></button>`).join('')}</div>`;
      st.innerHTML = `<div class="qcard"><div class="qmeta"><span>${esc(T('level', { n: this.level + 1 }))} · ${esc(L.t)}</span><span>${esc(T('qOf', { i: this.qi + 1, n: L.qs.length, c: this.correct }))}</span></div><div class="qbar"><i style="width:${this.qi / L.qs.length * 100}%"></i></div><div class="qtext">${q.q}</div>${body}<div id="qFb" aria-live="polite"></div><div class="qnav"><span class="combo" id="qCombo">${this.combo >= 2 ? esc(T('combo', { n: this.combo })) : ''}</span><button class="btn primary" id="qNext" hidden>${esc(this.qi + 1 < L.qs.length ? STR.next : STR.result)}</button></div></div>`;
      if (q.type === 'num') {
        const inp = $('#qNum'); const go = () => { if (inp.value.trim() === '') { inp.focus(); return; } this.grade(Math.abs(+inp.value - q.a) <= (q.tol || 0) + 1e-9, inp, inp.value); };
        $('#qCheck').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); inp.focus({ preventScroll: true });
      } else {
        $$('.opt', st).forEach(b => b.onclick = () => this.grade(+b.dataset.i === q.a, b, q.o[+b.dataset.i]));
      }
      $('#qNext').onclick = () => { this.qi++; if (this.qi < L.qs.length) this.ask(); else this.finish(); };
    },
    grade(ok, el, given) {
      if (this.answered) return; this.answered = true;
      const q = LEVELS[this.level].qs[this.qi];
      if (ok) { this.correct++; this.combo++; } else { this.combo = 0; this.wrong.push({ q, given }); }
      if (q.type === 'num') { el.classList.add(ok ? 'right' : 'wrong'); el.disabled = true; $('#qCheck').disabled = true; }
      else $$('.opt').forEach(b => { b.disabled = true; if (+b.dataset.i === q.a) b.classList.add('right'); else if (b === el) b.classList.add('wrong'); });
      $('#qFb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><b>${esc(ok ? STR.right : STR.wrong)}</b>${!ok && q.type === 'num' ? esc(T('correctIs', { a: q.a })) : ''}${q.ex}${secLink(q)}</div>`;
      $('#qCombo').textContent = this.combo >= 2 ? T('combo', { n: this.combo }) : '';
      pulse($('#qCombo'));
      const nx = $('#qNext'); nx.hidden = false; nx.focus({ preventScroll: true });
    },
    finish() {
      const L = LEVELS[this.level], ratio = this.correct / L.qs.length;
      const stars = ratio >= .9 ? 3 : ratio >= .75 ? 2 : ratio >= .6 ? 1 : 0, passed = ratio >= .6;
      const prev = store.data.quiz[this.level];
      store.data.quiz[this.level] = { best: Math.max(ratio, prev ? prev.best : 0), stars: Math.max(stars, prev ? prev.stars : 0), passed: passed || !!(prev && prev.passed) };
      store.save(); renderTrail(); updateProgress();
      const next = this.level + 1 < LEVELS.length;
      const review = this.wrong.length ? `<div class="review"><h6>${esc(STR.review)}</h6><ol>${this.wrong.map(w => `<li>${w.q.q}<span class="ans">${esc(T('correctIs', { a: '' }).replace(/[。.]$/, ''))}${w.q.type === 'num' ? esc(String(w.q.a)) : w.q.o[w.q.a]}</span>${secLink(w.q)}</li>`).join('')}</ol></div>` : '';
      $('#qStage').innerHTML = `<div class="qcard result"><div class="bigstars">${[0, 1, 2].map(i => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${i * .15}s">★</span>`).join('')}</div>
        <p class="qtext qtitle">${esc(passed ? (stars === 3 ? STR.perfect : STR.pass) : STR.fail)}：${esc(T('score', { c: this.correct, n: L.qs.length }))}</p>
        <p style="color:var(--ink-2)">${esc(passed ? (next ? T('unlockedNext', { n: this.level + 2, t: LEVELS[this.level + 1].t }) : STR.allLevels) : STR.needPass)}</p>
        <div class="qnav" style="justify-content:center"><button class="btn" id="qRetry">${esc(STR.retry)}</button>${passed && next ? `<button class="btn primary" id="qNextL">${esc(T('goLevel', { n: this.level + 2 }))}</button>` : ''}</div>${review}</div>`;
      $('#qRetry').onclick = () => this.reset();
      if ($('#qNextL')) $('#qNextL').onclick = () => this.select(this.level + 1, true);
      if (passed) toast(T('passedToast', { n: this.level + 1, s: starsTxt(stars) }));
    }
  };
  // A challenge button at the end of a chapter: open the quiz view first, then the level.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-level]');
    if (!a || !LEVELS.length) return;
    e.preventDefault();
    drawer(false);
    // Through the router, so Back returns to the chapter the reader came from and the URL names the
    // quiz. The card scrolls itself, hence `noScroll`.
    navigate('#quizCh', { noScroll: true });
    Quiz.select(+a.dataset.level);
  });

  /* ---------- init ---------- */
  mountCodeCopy();
  mountFormulaParts();
  store.data.read.forEach(id => navLinks[id] && navLinks[id].classList.add('read'));
  if (LEVELS.length && $('#qStage')) Quiz.select(0, true);
  // The head script already applied a stored theme before first paint; keep the DOM in step when it
  // could not (storage blocked) and repaint the button's own state.
  if (store.data.theme !== 'system') document.documentElement.setAttribute('data-theme', store.data.theme);
  syncTheme();
  const startView = resolve(location.hash).view;
  setView(startView ? startView.id : (views[0] ? views[0].id : null));
  if (location.hash && document.getElementById(location.hash.slice(1))) scrollToEl(document.getElementById(location.hash.slice(1)), true);
  updateProgress();
}

window.Lykeion = {
  registerLab, start, api,
  show: (id, opts) => publicApi.show(id, opts),
  views: () => publicApi.views()
};
})();
