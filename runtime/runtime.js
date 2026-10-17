/* lykeion runtime: navigation, reading progress, theme, floating actions, quiz engine, Lab host.
   Page content is produced by `lykeion build`; this file only wires behaviour onto that markup. */
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
function fillRange(inp) { const p = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--p', p + '%'); }
function setSeg(seg, v) { $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
function onSeg(seg, fn) { seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg(seg, b.dataset.v); fn(b.dataset.v); }); }
function pulse(el) { if (!el || reduceMotion) return; el.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
function setVal(el, txt) { if (el.textContent !== txt) { el.textContent = txt; pulse(el); } }
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

/* ================= data & strings ================= */
const DATA = JSON.parse($('#lykeion-data').textContent);
const STR = Object.assign({
  menu: '目錄', navLabel: '章節導覽', reset: '重設進度', resetAsk: '確定清除所有閱讀紀錄與闖關成績？', resetYes: '清除', resetNo: '取消', resetDone: '進度已清除',
  notStarted: '尚未開始', allDone: '全部完成', readOf: '讀完 {r} / {t} 節', passedOf: '闖關通過 {p} / {t} 關', readToast: '§{n} {t} 已讀完',
  themeSystem: '主題：跟隨系統', themeLight: '主題：淺色', themeDark: '主題：深色', themeHint: '（按下切換）', toTop: '回到頁首',
  level: '第 {n} 關', qCount: '{n} 題', locked: '第 {n} 關「{t}」尚未解鎖。', lockedHint: '先通過第 {n} 關「{t}」（正確率 60% 以上）。', goLevel: '前往第 {n} 關',
  intro: '每題作答後立刻顯示解析；正確率 60% 以上解鎖下一關。', best: '最佳紀錄：{p}%', start: '開始挑戰', again: '再挑戰一次',
  qOf: '第 {i} / {n} 題　答對 {c}', answer: '輸入答案', check: '確認', next: '下一題', result: '看結果', combo: '連續答對 {n} 題！',
  right: '答對了。', wrong: '再想想。', correctIs: '正確答案是 {a}。', backTo: '回到 §{n} {t}', pages: '講義 p.{p}',
  perfect: '滿分過關', pass: '過關', fail: '還差一點', score: '答對 {c} / {n}', unlockedNext: '第 {n} 關「{t}」已解鎖。', allLevels: '所有關卡都完成了。',
  needPass: '正確率要 60% 以上才能解鎖下一關。', retry: '重新挑戰', review: '這次答錯的題目', passedToast: '第 {n} 關通過 {s}', labError: '這個 Lab 載入失敗：{e}',
  copy: '複製程式碼', copied: '已複製到剪貼簿', copyFail: '無法自動複製，請手動選取複製'
}, DATA.strings || {});
const T = (k, v = {}) => STR[k].replace(/\{(\w+)\}/g, (_, x) => (x in v ? v[x] : ''));
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
const api = { $, $$, H, S, esc, fmt, fillRange, setSeg, onSeg, pulse, setVal, toast, reduceMotion };
function registerLab(type, mount) { labTypes[type] = mount; }
function mountLabs() {
  $$('.lab[data-lab]').forEach(lab => {
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

function start() {
  store.load();
  $$('[data-str]').forEach(el => { el.textContent = STR[el.dataset.str]; });
  $$('[data-str-label]').forEach(el => el.setAttribute('aria-label', STR[el.dataset.strLabel]));
  document.addEventListener('input', e => { if (e.target.matches('input[type=range]')) fillRange(e.target); });
  mountLabs();
  mountCodeCopy();

  /* ---------- theme (floating button) ---------- */
  const themeBtn = $('#themeBtn');
  const THEMES = ['system', 'light', 'dark'];
  const ICON = {
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  const THEME_TXT = { system: STR.themeSystem, light: STR.themeLight, dark: STR.themeDark };
  function applyTheme() {
    const t = store.data.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    themeBtn.innerHTML = ICON[t];
    themeBtn.setAttribute('aria-label', THEME_TXT[t] + STR.themeHint);
    themeBtn.title = THEME_TXT[t];
  }
  themeBtn.addEventListener('click', () => { store.data.theme = THEMES[(THEMES.indexOf(store.data.theme) + 1) % 3]; store.save(); applyTheme(); toast(THEME_TXT[store.data.theme]); });
  applyTheme();

  /* ---------- back to top ---------- */
  const toTop = $('#toTop');
  toTop.setAttribute('aria-label', STR.toTop); toTop.title = STR.toTop;
  toTop.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); $('#main').focus?.({ preventScroll: true }); });

  /* ---------- navigation ---------- */
  const CHECK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.3 8 2.8"/></svg>';
  const sections = $$('.sec').filter(s => !s.dataset.quiz);
  const nav = $('#nav');
  const navLinks = {};
  let navQuiz = null;
  $$('.chapter').forEach(ch => {
    const g = H('div', { class: 'nav-group' });
    g.appendChild(H('div', { class: 'nav-ch' }, `<span class="n">${esc(ch.dataset.num)}</span>${esc(ch.dataset.title)}`));
    const ol = H('ol');
    if (ch.id === 'quizCh') navQuiz = ol;
    else $$('.sec', ch).forEach(sec => {
      const a = H('a', { href: '#' + sec.id }, `<span class="dot">${CHECK}</span><span class="num">${esc(sec.dataset.num)}</span><span>${esc(sec.dataset.title)}</span>`);
      navLinks[sec.id] = a; ol.appendChild(H('li')).appendChild(a);
    });
    g.appendChild(ol); nav.appendChild(g);
  });
  if (navQuiz) LEVELS.forEach((L, i) => navQuiz.appendChild(H('li')).appendChild(H('a', { href: '#quiz', 'data-level': i })));

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

  const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); setCurrent(e.target.id); } }), { rootMargin: '-25% 0px -65% 0px' });
  $$('.sec').forEach(s => spy.observe(s));
  const seenObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('seen'); }), { threshold: .05 });
  $$('.sec').forEach(s => seenObs.observe(s));
  function setCurrent(id) {
    if (currentId === id) return;
    if (currentId) dwell[currentId] = dwellOf(currentId);
    currentId = id; currentSince = performance.now();
    $$('.nav a.current').forEach(a => a.classList.remove('current'));
    if (navLinks[id]) navLinks[id].classList.add('current');
    const s = document.getElementById(id); if (s) $('#topTitle').textContent = `§${s.dataset.num} ${s.dataset.title}`;
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement; const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      $('#readbar').style.width = (p * 100).toFixed(1) + '%';
      toTop.classList.toggle('show', h.scrollTop > window.innerHeight);
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
  narrow.addEventListener('change', () => { if (!narrow.matches) drawer(false); syncInert(); });
  syncInert();
  menuBtn.addEventListener('click', () => drawer(!side.classList.contains('open')));
  scrim.addEventListener('click', () => drawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) drawer(false); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) drawer(false); });

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
    const back = s ? `<a href="#${esc(q.sec)}">${esc(T('backTo', { n: s.dataset.num, t: s.dataset.title }))}</a>` : '';
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
    if (navQuiz) $$('a', navQuiz).forEach((a, i) => { const r = store.data.quiz[i]; a.className = (r && r.passed ? 'read' : '') + (unlocked(i) ? '' : ' locked'); a.innerHTML = `<span class="dot">${CHECK}</span><span class="num">L${i + 1}</span><span>${esc(LEVELS[i].t)} <span class="stars">${r ? starsTxt(r.stars) : ''}</span></span>`; });
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
  document.addEventListener('click', e => { const a = e.target.closest('a[data-level]'); if (!a || !LEVELS.length) return; e.preventDefault(); drawer(false); Quiz.select(+a.dataset.level); });

  /* ---------- init ---------- */
  store.data.read.forEach(id => navLinks[id] && navLinks[id].classList.add('read'));
  if (LEVELS.length && $('#qStage')) { Quiz.select(0, true); }
  updateProgress();
}

window.Lykeion = { registerLab, start, api };
})();
