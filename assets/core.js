/* core.js — 자료실 언더시스템(모든 섹터 밑에서 도는 공통 장치)
 *
 * 넣는 법: <head>의 <meta charset> 바로 아래에 defer 없이 한 줄.
 *            <script src="../assets/core.js"></script>      (대문은 ./assets/core.js)
 *          다른 스크립트보다 먼저 실행돼야 자료 요청을 빠짐없이 지킨다.
 *
 * 하는 일
 * 1) 자료 안전망: 같은 사이트의 data/*.json 요청이 끊기면(연결 오류·서버 5xx) 0.4초, 1.2초 뒤 스스로 다시 받는다.
 *    그래도 안 되면 섹터가 쓰던 안내 문구는 그대로 두고, 화면 위쪽에 「다시 시도」 띠를 띄운다.
 *    404(파일 없음)는 다시 받지 않는다 — 있어도 되고 없어도 되는 자료를 섹터가 스스로 판단한다.
 * 2) 기다림 표시: 자료를 0.6초 넘게 받고 있으면 화면 맨 위에 가는 선을 띄운다(transform만 움직임).
 * 3) 연결 안내: 인터넷이 끊기면 알리고, 다시 이어지면 끊긴 동안 못 받은 자료가 있을 때만 「다시 불러오기」를 권한다.
 * 4) 미리 받기: 자료실 안의 다른 화면으로 가는 링크에 손이 닿으면 그 화면 문서를 미리 받아 둔다(데이터 절약 모드에서는 쉼).
 *
 * 5) 이어 보기: 섹터 장부(tools.js)와 「이어 보기」 줄(next.js)을 불러온다.
 * 6) 오류 수집: 운영 도메인(ccttsi.github.io)에서만 Sentry 로더를 한 번 불러온다. 로컬·검사 화면에서는 부르지 않는다.
 *
 * 6) 딥링크: 대문 검색이 넘긴 ?q= 를 이 화면의 검색창에 채우고 바로 찾는다(data-jc-deep="off"면 섹터가 직접 받는다).
 *
 * 섹터가 쓸 수 있는 것: window.JCCore = { base, state(), warm(href), notice(text, label, fn), clear(), query(), applyQuery() }
 * 화면 밖으로 내보내는 것은 없다. 외부 서버를 부르지 않는다 — 예외는 6) 오류 수집 하나뿐이고,
 * 그마저도 운영 도메인에서만이다.
 */
(function () {
  'use strict';
  if (window.JCCore) return;
  var d = document, root = d.documentElement;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var BASE = ME.replace(/assets\/core\.js(\?.*)?$/, '');          // 자료실 뿌리 주소(끝에 /)
  var rawFetch = window.fetch ? window.fetch.bind(window) : null;
  var st = { failed: false, offline: false, pending: 0 };
  var RETRY = [400, 1200];                                         // 다시 받기 전 쉬는 시간(ms)

  /* ---------- 0-0) 검색엔진 비노출(noindex) ----------
   * 대문 밖의 자료는 회원 전용이라 검색엔진에 싣지 않는다. 각 페이지 <head>에 같은 meta가 이미 있고,
   * 이 줄은 그 줄을 빠뜨린 새 화면까지 덮는 안전망이다. 공개로 전환하면 이 두 줄(여기·각 페이지)과
   * robots.txt의 Disallow: / 를 함께 지운다. */
  (function () {
    if (d.querySelector('meta[name="robots"]')) return;
    var m = d.createElement('meta');
    m.setAttribute('name', 'robots');
    m.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    (d.head || root).appendChild(m);
  })();

  /* ---------- 0) 오류 수집(Sentry) ----------
   * Sentry 프로젝트 jobcounsel의 Browser JavaScript Loader Script.
   * 운영 도메인에서만, 한 번만 붙인다. 로컬 서버·Playwright 검사(127.0.0.1·localhost)에서는 요청이 나가지 않는다.
   * 로더 주소를 바꿀 때는 Sentry 프로젝트 설정의 Loader Script에서 받은 주소로만 바꾼다. */
  var SENTRY_LOADER = 'https://js.sentry-cdn.com/a4dd71f88a40c92db04ab84f35b062c0.min.js';
  if (location.hostname === 'ccttsi.github.io' && !d.querySelector('script[data-jc-sentry]')) {
    var sentryScript = d.createElement('script');
    sentryScript.src = SENTRY_LOADER;
    sentryScript.crossOrigin = 'anonymous';
    sentryScript.async = true;
    sentryScript.setAttribute('data-jc-sentry', '1');
    (d.head || root).appendChild(sentryScript);
  }

  /* ---------- 1) 자료 안전망 ---------- */
  function urlOf(input) { return typeof input === 'string' ? input : (input && input.url) || String(input); }
  function isData(input, init) {
    var m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
    if (String(m).toUpperCase() !== 'GET') return false;
    try { var u = new URL(urlOf(input), location.href); return u.origin === location.origin && /\.json$/i.test(u.pathname); } catch (e) { return false; }
  }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function guarded(input, init) {
    var n = 0;
    busy(1);
    function once() {
      return rawFetch(input, init).then(function (r) {
        if (r.status >= 500 && n < RETRY.length) return wait(RETRY[n++]).then(once);
        if (r.status >= 500) fail();
        return r;
      }, function (err) {
        if (err && err.name === 'AbortError') throw err;            // 섹터가 스스로 그만둔 요청
        if (n < RETRY.length) return wait(RETRY[n++]).then(once);
        fail(); throw err;
      });
    }
    return once().then(function (r) { busy(-1); return r; }, function (e) { busy(-1); throw e; });
  }
  if (rawFetch) window.fetch = function (input, init) { return isData(input, init) ? guarded(input, init) : rawFetch(input, init); };
  function fail() {
    st.failed = true;
    if (navigator.onLine === false) { st.offline = true; show('인터넷 연결이 끊겨 자료를 불러오지 못했습니다.', null); }
    else show('자료를 불러오지 못했습니다.', '다시 시도');
  }

  /* ---------- 화면 조각(그림자 DOM — 섹터 CSS와 섞이지 않는다) ---------- */
  var host = null, sr = null, bar = null, line = null, busyT = 0;
  var CSS = ':host{all:initial;position:fixed;left:0;right:0;top:0;z-index:2147482000;pointer-events:none;font-family:inherit}' +
    '.ln{position:absolute;left:0;right:0;top:0;height:2px;overflow:hidden;opacity:0;transition:opacity .18s}' +
    '.ln.on{opacity:1}' +
    '.ln i{position:absolute;left:0;top:0;width:40%;height:100%;background:var(--c);transform:translateX(-100%)}' +
    '.ln.on i{animation:run 1.1s cubic-bezier(.4,0,.2,1) infinite}' +
    '@keyframes run{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}' +
    '.bar{position:absolute;left:0;right:0;margin:0 auto;top:calc(env(safe-area-inset-top,0px) + 10px);display:flex;align-items:center;gap:4px;' +
    'width:fit-content;max-width:min(92vw,440px);box-sizing:border-box;padding:0 6px 0 16px;min-height:48px;border-radius:12px;' +
    'background:var(--bg);color:var(--fg);font-size:14px;line-height:1.45;letter-spacing:-.01em;' +
    'transform:translateY(-140%);opacity:0;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .18s;pointer-events:none}' +
    '.bar.on{transform:none;opacity:1;pointer-events:auto}' +
    '.bar p{margin:0;padding:10px 0;flex:1;min-width:0;word-break:keep-all}' +
    '.bar button{all:unset;box-sizing:border-box;min-width:44px;min-height:44px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;' +
    'border-radius:9px;font:inherit;font-weight:700;color:var(--fg);cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}' +
    '.bar button:active{opacity:.6}.bar button:focus-visible{outline:2px solid var(--c);outline-offset:-2px}' +
    '.bar .go{text-decoration:underline;text-underline-offset:3px}' +
    ':host{--bg:#2a2521;--fg:#f7f2ea;--c:#0f766e}:host([data-dark]){--bg:#e6e9ef;--fg:#08090c;--c:#2dd4bf}' +
    ':host([data-still]) .ln.on i{animation:none;transform:none;width:100%;opacity:.45}' +
    ':host([data-still]) .bar{transition:none}' +
    '@media (prefers-reduced-motion:reduce){.ln.on i{animation:none;transform:none;width:100%;opacity:.45}.bar{transition:none}}';
  function build() {
    if (host || !d.body) return !!host;
    host = d.createElement('div'); host.id = 'jc-core'; host.setAttribute('data-jc-ignore', '');
    sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    sr.innerHTML = '<style>' + CSS + '</style><div class="ln" aria-hidden="true"><i></i></div>' +
      '<div class="bar" role="status" aria-live="polite"><p></p><button type="button" class="go" hidden></button><button type="button" class="x" aria-label="안내 닫기">닫기</button></div>';
    line = sr.querySelector('.ln'); bar = sr.querySelector('.bar');
    bar.querySelector('.go').addEventListener('click', function () { if (act) act(); });
    bar.querySelector('.x').addEventListener('click', hide);
    d.body.appendChild(host); theme();
    try { new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-jc-imm'] }); } catch (e) {}
    return true;
  }
  function theme() {
    if (!host) return;
    if (root.getAttribute('data-theme') === 'dark') host.setAttribute('data-dark', ''); else host.removeAttribute('data-dark');
    if (root.hasAttribute('data-jc-imm')) host.setAttribute('data-still', ''); else host.removeAttribute('data-still');
  }
  function ready(fn) { if (d.body) fn(); else d.addEventListener('DOMContentLoaded', fn, { once: true }); }
  var act = null;
  function show(text, label, fn) {
    ready(function () {
      if (!build()) return;
      bar.querySelector('p').textContent = text;
      var go = bar.querySelector('.go');
      act = label ? (fn || reload) : null; go.hidden = !label; go.textContent = label || '';
      bar.classList.add('on');
    });
  }
  function hide() { if (bar) bar.classList.remove('on'); }
  function reload() { try { location.reload(); } catch (e) {} }

  /* ---------- 2) 기다림 표시 ---------- */
  function busy(n) {
    st.pending = Math.max(0, st.pending + n);
    if (st.pending && !busyT) busyT = setTimeout(function () { busyT = 0; if (st.pending) ready(function () { if (build() && st.pending) line.classList.add('on'); }); }, 600);
    if (!st.pending) { clearTimeout(busyT); busyT = 0; if (line) line.classList.remove('on'); }
  }

  /* ---------- 3) 연결 안내 ---------- */
  window.addEventListener('offline', function () { st.offline = true; show('인터넷 연결이 끊겼습니다. 열어 둔 화면은 그대로 볼 수 있습니다.', null); });
  window.addEventListener('online', function () {
    if (!st.offline) return; st.offline = false;
    if (st.failed) show('다시 연결됐습니다.', '다시 불러오기'); else hide();
  });

  /* ---------- 4) 미리 받기 ---------- */
  var warmed = {}, warmN = 0, hoverT = 0;
  function target(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !BASE || u.href.indexOf(BASE) !== 0) return null;
      if (u.pathname === location.pathname) return null;                                   // 같은 화면 안의 이동
      if (!/\/$|\.html$/.test(u.pathname)) return null;
      return u.origin + u.pathname;
    } catch (err) { return null; }
  }
  function warm(href) {
    if (!href || warmed[href] || warmN >= 6 || !rawFetch || navigator.onLine === false) return;
    var c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
    warmed[href] = 1; warmN++;
    try { rawFetch(href, { credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
  }
  d.addEventListener('touchstart', function (e) { warm(target(e)); }, { passive: true, capture: true });
  d.addEventListener('mouseover', function (e) { var h = target(e); clearTimeout(hoverT); if (h) hoverT = setTimeout(function () { warm(h); }, 90); }, { passive: true, capture: true });

  /* ---------- 6) 딥링크: 대문·비서 검색이 넘긴 ?q= 를 이 화면의 검색창에 채우고 바로 찾는다 ----------
   * 대문 빠른 검색은 결과마다 «찾은 낱말이 실린 주소»(translator/?q=GMP, company/?q=해커스)를 넘긴다.
   * 섹터는 그 낱말을 받아 ① 검색창을 채우고 ② 바로 거른 결과를 보여 줘야 한다.
   *   - 「?q=」·「?term=」·「?search=」 가운데 있는 것을 첫 낱말로 쓴다.
   *   - 섹터가 스스로 받는 화면은 <html data-jc-deep="off"> 로 표시해 둔다(두 번 거르지 않게).
   *   - 검색창 말고 «화면 고르기»가 필요한 섹터는 window.JCDeepLink(q) 를 정의한다.
   *     true(또는 없음)=처리 끝, false=아직 준비 안 됨(다음 차례에 다시 부른다).
   *   - 검색창은 <input data-deeplink>. 없으면 첫 type=search 칸을 쓴다.
   */
  var DLQ = (function () {
    try {
      var p = new URLSearchParams(location.search);
      return String(p.get('q') || p.get('term') || p.get('search') || '').trim();
    } catch (e) { return ''; }
  })();
  var DL = { done: false, n: 0 };
  function deepLink() {
    if (DL.done) return true;
    if (!DLQ) { DL.done = true; return true; }
    if (root.getAttribute('data-jc-deep') === 'off') { DL.done = true; return true; }   // 섹터가 스스로 받는다
    if (typeof window.JCDeepLink === 'function') {
      var r;
      try { r = window.JCDeepLink(DLQ); } catch (e) { r = true; }
      if (r !== false) DL.done = true;
      return DL.done;
    }
    var el = d.querySelector('[data-deeplink]') || d.querySelector('#q[type=search]') || d.querySelector('input[type=search]');
    if (!el || el.disabled || el.offsetParent === null) return false;   // 아직 안 그려졌다 — 다음 차례에
    if (el.value !== DLQ) {
      el.value = DLQ;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }
    DL.done = true;
    return true;
  }
  function deepLinkTick() {
    if (DL.done || !DLQ) return;
    if (deepLink() || ++DL.n > 40) return;          // 60ms × 40 = 약 2.4초까지 기다린다
    setTimeout(deepLinkTick, 60);
  }
  ready(function () { deepLinkTick(); setTimeout(deepLinkTick, 0); setTimeout(deepLinkTick, 300); });
  window.addEventListener('load', function () { setTimeout(deepLinkTick, 0); });

  /* ---------- 5) 이어 보기: 섹터 장부(tools.js)와 이어 보기 줄(next.js)을 대문이 아닌 화면에서 불러온다 ---------- */
  function load(src, then) { var s = d.createElement('script'); s.src = src; s.async = true; if (then) s.onload = then; (d.head || root).appendChild(s); }
  ready(function () {
    if (!BASE || location.href.split(/[?#]/)[0] === BASE) return;
    if (window.JC_TOOLS) load(BASE + 'assets/next.js'); else load(BASE + 'assets/tools.js', function () { load(BASE + 'assets/next.js'); });
  });

  /* ---------- 7) 회원 전용 게이트 (2026-11-20) ----------
   * 대문(자료실 뿌리)은 누구나 본다 — 로고·심전도·목차·시드/매치·이용 안내까지.
   * 그 밖의 자료 화면은 로그인한 사람에게만 연다. 세션은 assets/sync.js 가 localStorage
   * 'jc-sync-session' 에 두는 토큰 하나로 보고(서버 검증·만료는 sync.js 의 jc_pull 이 한다),
   * 로그인·로그아웃 때 sync.js 가 쏘는 'jc-sync-change' 신호로 열고 닫는다.
   *
   * 검사(CI 스모크·딥링크 실측)는 add_init_script 로 window.__JC_QA__ 를 심어 이 게이트를 건너뛴다.
   * 주소 파라미터로는 열 수 없다 — 화면을 여는 길이 하나뿐이어야 검사와 실제가 같다.
   */
  var LOCK = (function () {
    var SESS = 'jc-sync-session';
    var host = null, sr = null, locked = false, pending = null, CSS = null;
    var QA = function () { try { return !!window.__JC_QA__; } catch (e) { return false; } };
    function hubPath() { return String(BASE || '/').replace(/[?#].*$/, ''); }
    function here() { return location.href.split(/[?#]/)[0]; }
    function isHub() { return here() === hubPath(); }
    function isOwnPage() {                       /* 관리 화면은 자기 안에서 로그인을 받는다 */
      var rel = here().slice(String(BASE || '').length);
      return /^admin(\/|$)/.test(rel);
    }
    function guarded() { return !!BASE && !isHub() && !isOwnPage(); }
    function session() {
      try {
        var raw = localStorage.getItem(SESS);
        if (!raw) return null;
        var s = JSON.parse(raw);
        return s && s.token ? (s.username || '회원') : null;
      } catch (e) { return null; }
    }
    function theme() {
      if (!host) return;
      var dark = root.getAttribute('data-theme') === 'dark';
      var sepia = !dark && root.getAttribute('data-jc-tone') === 'sepia';
      if (dark) host.setAttribute('data-dark', ''); else host.removeAttribute('data-dark');
      if (sepia) host.setAttribute('data-sepia', ''); else host.removeAttribute('data-sepia');
    }
    CSS = [
      ':host{all:initial;position:fixed;inset:0;z-index:2147483400;display:block;' +
      '--bg:#faf6ef;--panel:#fffdf8;--line:#e9e0d2;--ink:#2a2521;--muted:#655c53;--acc:#0f766e;' +
      '--on:#fffdf8;--soft:#f5efe4;font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,' +
      '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Segoe UI",sans-serif;color:var(--ink);' +
      '-webkit-font-smoothing:antialiased}',
      ':host([data-dark]){--bg:#08090c;--panel:#10141d;--line:#232a38;--ink:#e6e9ef;--muted:#9aa2b4;--acc:#2dd4bf;--on:#06201d;--soft:#141a26}',
      ':host([data-sepia]){--bg:#f3e7cf;--panel:#fbf3e3;--line:#e0d0b4;--ink:#241d14;--muted:#6b5b45;--acc:#0d6b56;--on:#fbf3e3;--soft:#efe1c9}',
      '*{box-sizing:border-box;margin:0;font:inherit;color:inherit}',
      '.veil{position:absolute;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;' +
      'padding:max(20px,6vh) max(16px,4vw);overflow:auto}',
      '.card{width:min(460px,100%);background:var(--panel);border:1px solid var(--line);border-radius:20px;' +
      'padding:28px 24px 22px;box-shadow:0 30px 80px -28px rgba(40,30,20,.42);text-align:left}',
      ':host([data-dark]) .card{box-shadow:0 30px 80px -20px rgba(0,0,0,.8)}',
      '.seal{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.14em;' +
      'color:var(--acc);border:1px solid currentColor;border-radius:999px;padding:5px 11px}',
      'h2{font-family:"Cormorant Garamond","Noto Serif KR",Georgia,serif;font-size:23px;font-weight:600;' +
      'letter-spacing:-.01em;margin-top:14px;line-height:1.3}',
      'p.lead{font-size:14.5px;line-height:1.65;color:var(--muted);margin-top:10px;word-break:keep-all}',
      'p.lead b{color:var(--ink);font-weight:700}',
      '.row{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}',
      'button{all:unset;box-sizing:border-box;cursor:pointer;min-height:48px;padding:0 18px;border-radius:12px;' +
      'font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;' +
      '-webkit-tap-highlight-color:transparent}',
      'button:focus-visible,a:focus-visible{outline:2px solid var(--acc);outline-offset:2px}',
      '.go{background:var(--acc);color:var(--on);flex:1 1 140px}',
      '.go:active{opacity:.85}',
      '.sub{flex:1 1 110px;border:1px solid var(--line);color:var(--ink);background:var(--soft)}',
      'a.home{display:inline-flex;align-items:center;min-height:44px;margin-top:6px;font-size:13.5px;' +
      'font-weight:600;color:var(--muted);text-decoration:underline;text-underline-offset:3px}',
      '.fine{font-size:12.5px;line-height:1.6;color:var(--muted);margin-top:12px;' +
      'border-top:1px dashed var(--line);padding-top:12px}',
      '.fine b{color:var(--ink);font-weight:700}',
      '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
    ].join('\n');
    function openLogin(view) {
      var want = view === 'signup' ? 'signup' : 'login';
      function call() {
        var S = window.JCSync;
        if (S && typeof S.open === 'function' && S.configured !== false) { S.open(want); return true; }
        return false;
      }
      if (call()) return true;
      var s = d.createElement('script');                 /* marker.js 가 없거나 늦은 화면(검사 내역 등) */
      s.src = String(BASE || './') + 'assets/sync.js'; s.async = true;
      s.onload = function () { setTimeout(call, 20); setTimeout(call, 400); };
      s.onerror = function () { call(); };
      (d.head || root).appendChild(s);
      return false;
    }
    function build() {
      if (host || !d.body) return !!host;
      host = d.createElement('div');
      host.id = 'jc-gate';
      host.setAttribute('data-jc-ignore', '');
      sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      sr.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="veil" role="dialog" aria-modal="true" aria-labelledby="gt">' +
          '<div class="card">' +
            '<span class="seal">CCTT · MEMBERS</span>' +
            '<h2 id="gt">회원 전용 자료입니다</h2>' +
            '<p class="lead">대문의 <b>목차와 애니메이션</b>은 누구나 볼 수 있습니다. ' +
              '자료실의 각 자료는 <b>회원가입·로그인 후</b>에 열립니다.</p>' +
            '<div class="row">' +
              '<button type="button" class="go" data-act="signup">회원가입</button>' +
              '<button type="button" class="sub" data-act="login">로그인</button>' +
            '</div>' +
            '<a class="home" href="' + String(BASE || './') + '">← 대문으로 돌아가기</a>' +
            '<p class="fine">아이디와 비밀번호만 받습니다. 이메일·이름·연락처는 받지 않으며, ' +
              '비밀번호는 되돌릴 수 없는 방식으로 암호화해 저장합니다. 편집 구조·해석 콘텐츠·시각화·자체 데이터셋의 ' +
              '저작권은 제작자에게 있고, AI 학습·교안 재가공·무단 복제·상업적 재배포를 금합니다.</p>' +
          '</div>' +
        '</div>';
      sr.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (!b) return;
        openLogin(b.getAttribute('data-act'));
      });
      (d.body || root).appendChild(host);
      theme();
      try { new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-jc-tone'] }); } catch (e) {}
      return true;
    }
    function lock() {
      if (!guarded() || locked) return;
      locked = true;
      /* 내용이 잠깐이라도 보이지 않게 — 게이트가 그려지는 같은 틱에 풀린다 */
      if (!d.body) { d.addEventListener('DOMContentLoaded', lock, { once: true }); locked = false; return; }
      build();
      try { if ('inert' in HTMLElement.prototype) d.body.inert = true; } catch (e) {}
      root.setAttribute('data-jc-locked', '');
      var f = sr && sr.querySelector('.go'); try { if (f) f.focus({ preventScroll: true }); } catch (e) {}
    }
    function unlock() {
      if (!locked && !host) return;
      locked = false;
      try { if ('inert' in HTMLElement.prototype) d.body.inert = false; } catch (e) {}
      if (root.hasAttribute('data-jc-locked')) root.removeAttribute('data-jc-locked');
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = null; sr = null;
    }
    function refresh() { if (!guarded()) return; if (session()) unlock(); else lock(); }
    /* 대문: 비로그인으로 자료 링크를 누르면 그 자리에서 멈추고 로그인 창을 연다 */
    function intercept(e) {
      if (!isHub() || QA() || session()) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      var href = '';
      try { href = new URL(a.href, location.href).href; } catch (err) { return; }
      var base = hubPath();
      if (href.indexOf(base) !== 0) return;                        /* 바깥 링크는 그대로 */
      var rel = href.slice(base.length);
      if (!rel || /^($|#|index\.html)/.test(rel)) return;           /* 대문 안 이동(해시·목차)은 그대로 */
      if (/^admin(\/|$)/.test(rel)) return;
      e.preventDefault();
      e.stopPropagation();
      pending = href;
      openLogin('signup');
    }
    function afterLogin(user) {
      if (!user) { pending = null; return; }
      if (isHub() && pending) {
        var go = pending; pending = null;
        try { location.assign(go); } catch (e) {}
      }
    }
    if (guarded() && !QA()) {
      root.setAttribute('data-jc-locked', '');       /* head 단계 — 본문이 그려지기 전에 잠근다 */
      if (session()) root.removeAttribute('data-jc-locked'); else { locked = true; }
      if (d.body) { locked = false; refresh(); }     /* 늦게 불린 경우 */
      else d.addEventListener('DOMContentLoaded', function () { locked = false; refresh(); }, { once: true });
    }
    if (isHub() && !QA()) {
      ready(function () { d.addEventListener('click', intercept, true); });
    }
    d.addEventListener('jc-sync-change', function (e) {
      var u = e && e.detail && e.detail.user;
      if (guarded() && !QA()) { if (u) unlock(); else lock(); }
      if (isHub()) afterLogin(u);
    });
    /* 대문이 자료로 넘어가기 전에 묻는 문 — 허락되면 true, 아니면 로그인 창을 열고 false */
    function allow(href) {
      if (QA()) return true;
      if (session()) return true;
      if (href) pending = href;
      openLogin('signup');
      return false;
    }
    return { refresh: refresh, guarded: guarded, locked: function () { return locked; }, open: openLogin, allow: allow };
  })();

  window.JCCore = {
    base: BASE,
    /* 대문 검색이 넘긴 낱말 — 섹터가 직접 쓸 때 */
    query: function () { return DLQ; },
    applyQuery: deepLink,
    state: function () { return { failed: st.failed, offline: st.offline, pending: st.pending }; },
    warm: function (href) { try { var u = new URL(href, location.href); if (u.origin === location.origin) warm(u.origin + u.pathname); } catch (e) {} },
    notice: function (text, label, fn) { show(String(text || ''), label || null, fn); },
    clear: hide,
    /* 회원 전용 게이트: 화면은 core.js 가 스스로 잠근다. 섹터가 직접 열고 닫을 때만 쓴다 */
    gate: function () { return { locked: LOCK.locked(), open: LOCK.open, refresh: LOCK.refresh }; },
    /* 대문·검색이 자료를 열기 전에 부르는 문. true면 열어도 된다(로그인했거나 검사 모드) */
    member: function (href) { return LOCK.allow(href); }
  };
})();
