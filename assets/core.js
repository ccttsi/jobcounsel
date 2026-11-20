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
 * 7) 뒤로가기 = 세부 팝업 닫기: 자료 안에서 세부 자료를 열면 브라우저 뒤로가기(iOS 스와이프·안드로이드 버튼)가
 *    이전 화면으로 나가지 않고 «열려 있던 팝업만» 닫아 상위 화면으로 돌아간다(JCBackStack).
 *
 * 섹터가 쓸 수 있는 것: window.JCCore = { base, state(), warm(href), notice(text, label, fn), clear(), query(), applyQuery() }
 *                     window.JCBackStack = { bind(el, closeFn), release(el), depth(), open(el, closeFn) }
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
   * 개인 학습·공유용으로 만든 화면이라 검색엔진·AI 수집기에 싣지 않는다. 각 페이지 <head>에 같은 meta가 이미 있고,
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
   * 운영 도메인(ccttsi.github.io · ccttsi.pages.dev)에서만, 한 번만 붙인다. 로컬 서버·Playwright 검사(127.0.0.1·localhost)에서는 요청이 나가지 않는다.
   * 로더 주소를 바꿀 때는 Sentry 프로젝트 설정의 Loader Script에서 받은 주소로만 바꾼다. */
  var SENTRY_LOADER = 'https://js.sentry-cdn.com/a4dd71f88a40c92db04ab84f35b062c0.min.js';
  var PROD = location.hostname === 'ccttsi.github.io' || location.hostname === 'ccttsi.pages.dev';
  if (PROD && !d.querySelector('script[data-jc-sentry]')) {
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

  /* ---------- 7) 뒤로가기 = 세부 팝업 닫기 ----------
   * 자리(문제): 자료 안에서 세부 자료를 열었는데, 습관적으로 X를 누르지 않고 브라우저 뒤로가기(아이폰 스와이프·안드로이드 버튼)를
   *           누르면 팝업이 닫히기는커녕 이전 화면으로 튕겨 나간다. 팝업은 히스토리에 흔적을 남기지 않기 때문이다.
   * 하는 일: 팝업·모달·드로어·상세 시트가 열리면 «같은 주소로» 히스토리 한 칸을 쌓는다. 뒤로가기가 오면 맨 위 팝업 하나만 닫는다.
   *           X·배경·ESC로 먼저 닫으면 쌓아 둔 칸을 history.back()으로 거둬, 다음 뒤로가기가 두 번 눌리지 않게 한다.
   *           ?q=·#hash는 건드리지 않는다(pushState에 지금 주소를 그대로 넘긴다).
   * 알아보는 법: role="dialog"·aria-modal="true"·<dialog>·.sheet·.drawer·.modal, 그리고 섹터가 붙인 data-jc-layer.
   *           화면을 덮는 크기(넓이 22% 이상 또는 높이 55% 이상)만 팝업으로 본다 — 작은 드롭다운·말풍선은 건드리지 않는다.
   * 닫는 법: 섹터가 JCBackStack.bind(요소, closeFn)로 닫는 함수를 넘기면 그것을 부른다. 안 넘기면
   *         팝업 안의 닫기 단추(‘닫기’·…X·…Close·data-close)를 누르고, 그래도 열려 있으면 ESC를 보내고, 마지막에는 감춘다.
   * 중첩: 두 겹이 열리면 한 번에 한 겹씩 닫힌다.
   */
  var BS = (function () {
    var SEL = '[role="dialog"],[aria-modal="true"],dialog,.sheet,.drawer,.modal,[data-jc-layer]';
    var CLOSE = '[data-jc-layer-close],[data-close],[data-act^="close"],[aria-label*="닫기"],button[id$="X"],button[id$="Close"],button[id$="close"],.sh-x button,.det-x button';
    var layers = [], fns = null, snaps = null, seq = 0, suppress = 0, raf = 0, lastLen = history.length, lastUrl = location.href, lastBefore = '', lastTouch = '', touchPush = 0, touchRep = 0, pushN = 0, repN = 0, fix = null, touched = false, quiet = false;
    /* 주소를 바꾸기 직전의 주소를 기억해 둔다 — 팝업이 열릴 때 섹터가 #hash를 끼워 넣는 경우가 많다 */
    try {
      ['pushState', 'replaceState'].forEach(function (k) {
        var raw = history[k]; if (typeof raw !== 'function') return;
        history[k] = function () {
          lastBefore = location.href;
          if (k === 'pushState') pushN++; else repN++;
          return raw.apply(history, arguments);
        };
      });
    } catch (e) {}
    try { fns = new WeakMap(); snaps = new WeakMap(); } catch (e) {}

    function st(el) { try { return getComputedStyle(el); } catch (e) { return null; } }
    function zi(el) { var c = st(el); var v = c ? parseInt(c.zIndex, 10) : 0; return isNaN(v) ? 0 : v; }

    /* 쌓임 순서: z-index가 큰 것이 위, 같으면 문서에서 뒤에 있는 것이 위 */
    function above(a, b) {
      var za = zi(a), zb = zi(b); if (za !== zb) return za > zb;
      return !!(a.compareDocumentPosition(b) & 4);            // b가 a 뒤(문서 순서)면 a가 아래
    }

    /* 화면을 덮고 있는가 — 작은 드롭다운·말풍선·머리말은 팝업이 아니다 */
    function shown(el) {
      if (!el || !el.isConnected || el.nodeType !== 1) return false;
      if (el.closest('[data-jc-ignore]')) return false;
      if (el.hasAttribute('hidden') || el.hidden) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      var c = st(el); if (!c) return false;
      if (c.display === 'none' || c.visibility === 'hidden' || c.visibility === 'collapse') return false;
      if (parseFloat(c.opacity) < 0.05) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      /* 화면 밖으로 밀어 둔 것(transform: translateX(100%))은 닫힌 것이다 */
      var vw = window.innerWidth || 360, vh = window.innerHeight || 640;
      var w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w < 2 || h < 2) return false;
      var cond = el.getAttribute('data-jc-layer');
      if (cond) { try { if (!d.querySelector(cond)) return false; } catch (e) {} }   // data-jc-layer="body.detail" 같은 조건
      if (el.hasAttribute('data-jc-layer')) return true;
      return (w * h) >= 0.22 * vw * vh || (h >= 0.55 * vh && w >= 240);
    }
    function scrim(el) {
      if (el.id === 'ov' || el.id === 'scrim') return true;
      var cn = ' ' + (el.getAttribute('class') || '') + ' ';
      return / (scrim|ov|veil|backdrop) /.test(cn);
    }
    /* 한 겹으로 친다: 상자 안에 상자가 같이 열린 경우(겹쳐 쌓지 않는다) */
    function kin(a, b) { try { return a.contains(b) || b.contains(a); } catch (e) { return false; } }

    function found() {
      var out = [], all;
      try { all = d.querySelectorAll(SEL); } catch (e) { return out; }
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (scrim(el) || !shown(el)) continue;
        if (el.tagName === 'HEADER' || el.tagName === 'NAV') continue;
        var dup = false;
        for (var j = 0; j < out.length; j++) if (kin(out[j], el)) { dup = true; break; }
        if (!dup) out.push(el);
      }
      out.sort(function (a, b) { return above(b, a) ? -1 : above(a, b) ? 1 : 0; });   // 아래 → 위
      return out;
    }

    /* 닫힌 모습을 기억해 둔다(마지막 수단으로 되돌릴 때 쓴다) */
    function remember() {
      var all; try { all = d.querySelectorAll(SEL); } catch (e) { return; }
      for (var i = 0; i < all.length; i++) {
        var el = all[i]; if (shown(el)) continue;
        try {
          snaps.set(el, { cls: el.getAttribute('class'), hidden: el.hidden, aria: el.getAttribute('aria-hidden'), style: el.getAttribute('style') });
        } catch (e) {}
      }
    }

    function push(el, still) {
      still = still || quiet;
      var entry = { el: el, id: 'jc' + (++seq), ours: false, native: false, initial: still || !touched, url0: (lastTouch && sameDoc(lastTouch, location.href)) ? lastTouch : (lastBefore && sameDoc(lastBefore, location.href)) ? lastBefore : lastUrl, url: location.href };
      /* 섹터가 스스로 히스토리를 쌓았는가 — pushState를 부탓거나, 주소만 바꾼 #hash 이동(location.hash=) */
      if (still) { entry.close = fns ? fns.get(el) : null; layers.push(entry); lastLen = history.length; entry.len = lastLen; return entry; }
      var viaApi = (pushN + repN) > (touchPush + touchRep);
      var grew = touched && (pushN > touchPush || (location.href !== lastTouch && !viaApi));
      touchPush = pushN; touchRep = repN;
      try {
        if (grew) entry.native = true;
        else {
          history.pushState({ jcLayer: entry.id }, '', location.href);
          entry.ours = true;
        }
      } catch (e) { entry.ours = false; }
      entry.close = fns ? fns.get(el) : null;
      layers.push(entry);
      lastLen = history.length; entry.len = lastLen;
      return entry;
    }

    function sameDoc(a, b) { return String(a).split('#')[0] === String(b).split('#')[0]; }

    /* 쌓아 둔 칸을 거둔다 — 부른 쪽이 이미 팝업을 닫았을 때 */
    function settle(entry) {
      if (!entry || entry.settled) return; entry.settled = true;
      var i = layers.indexOf(entry); if (i > -1) layers.splice(i, 1);
      /* 주소만 {…}로 바뀌었을 뿐 같은 문서라면 닫힌 팝업의 흔적을 지운다 */
      if (!sameDoc(entry.url0, entry.url)) { entry.ours = entry.native = false; }
      if (entry.initial) return;                                      // 첫 화면에서 이미 열려 있던 팝업 — 뒤로가기는 페이지 이탈
      if (entry.ours && entry.live !== false && history.length === (entry.len || 0)) {
        fix = sameDoc(location.href, entry.url0) ? entry.url0 : null;
        entry.live = false;
        suppress++;
        try { history.back(); } catch (e) { suppress = Math.max(0, suppress - 1); }
        lastLen = history.length;
      } else if (entry.native && entry.live !== false && history.length === (entry.len || 0) && sameDoc(location.href, entry.url)) {
        /* 섹터가 남긴 #hash 칸 하나를 함께 거둔다(주소를 이미 되돌렸어도 칸은 남아 있다) */
        fix = sameDoc(location.href, entry.url0) ? entry.url0 : null;
        suppress++;
        try { history.back(); } catch (e) { suppress = Math.max(0, suppress - 1); }
        lastLen = history.length;
      }
    }

    function sync() {
      if (!d.body) return;
      remember();
      var now = found(), i, alive = [];
      for (i = 0; i < layers.length; i++) {
        var e = layers[i];
        if (!e.el.isConnected || !shown(e.el)) { settle(e); continue; }  // 섹터가 먼저 닫았다
        alive.push(e);
      }
      layers = alive;
      for (i = 0; i < now.length; i++) {
        if (index(now[i]) < 0) push(now[i]);
      }
      lastLen = history.length; lastUrl = location.href;
    }
    function index(el) { for (var i = 0; i < layers.length; i++) if (layers[i].el === el) return i; return -1; }

    var t1 = 0, t2 = 0;
    function later() {                                             // 전환(motion)이 끝난 뒤 한 번 더
      clearTimeout(t1); clearTimeout(t2);
      t1 = setTimeout(sync, 70); t2 = setTimeout(sync, 280);
    }
    function tick() {
      if (raf) return;
      raf = setTimeout(function () { raf = 0; sync(); later(); }, 16);
    }

    /* ───── 닫기 ───── */
    function esc() {
      var ev;
      try { ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }); }
      catch (e) { ev = d.createEvent('Event'); ev.initEvent('keydown', true, true); try { ev.key = 'Escape'; } catch (e2) {} }
      var t = d.activeElement || d.body;
      try { t.dispatchEvent(ev); } catch (e) {}
      if (!ev.defaultPrevented) { try { d.dispatchEvent(ev); } catch (e) {} }
    }
    function force(el) {
      var s = snaps ? snaps.get(el) : null;
      try {
        if (el.tagName === 'DIALOG' && el.open) { el.close(); return; }
        if (s) {
          if (s.cls === null) el.removeAttribute('class'); else el.setAttribute('class', s.cls);
          el.hidden = !!s.hidden;
          if (s.aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', s.aria);
          if (s.style === null) el.removeAttribute('style'); else el.setAttribute('style', s.style);
        } else { el.hidden = true; el.setAttribute('aria-hidden', 'true'); }
        root.style.overflow = ''; if (d.body) d.body.style.overflow = '';            // 잠긴 스크롤을 푼다
      } catch (e) {}
    }
    function shut(el, n) {
      n = n || 0;
      if (!shown(el)) return;
      if (el.tagName === 'DIALOG' && el.open && n === 0) { try { el.close(); } catch (e) {} }
      var b = n === 0 ? (el.querySelector('[data-jc-layer-close]') || el.querySelector(CLOSE) || (el.parentElement && el.parentElement.querySelector(CLOSE))) : null;
      if (b) { try { b.click(); } catch (e) {} }
      else if (n < 2) esc();
      else { force(el); return; }
      if (n < 3) setTimeout(function () { shut(el, n + 1); }, 110);
    }

    /* ───── 뒤로가기 ───── */
    window.addEventListener('popstate', function (ev) {
      if (suppress > 0) {                                             // 내가 거둔 칸
        suppress--;
        if (fix) { try { history.replaceState(history.state, '', fix); } catch (e) {} fix = null; }
        lastUrl = location.href; lastLen = history.length;
        return;
      }
      var top = layers[layers.length - 1];
      if (!top) return;                                              // 팝업이 없으면 섹터·브라우저에 맡긴다
      if (ev && ev.state && ev.state.jcLayer && ev.state.jcLayer === top.id) return;   // 앞으로 가기(지금 칸으로) 
      top.live = false;                                              // 브라우저가 이미 한 칸 물렀다
      if (!shown(top.el)) { settle(top); return; }
      if (typeof top.close === 'function') { try { top.close(); } catch (e) {} }
      else shut(top.el);
      settle(top);
      /* 닫힌 팝업의 #hash가 주소에 남아 있으면 걷어 낸다 */
      if (!top.initial && top.url0 && sameDoc(location.href, top.url0) && location.href !== top.url0) {
        try { history.replaceState(history.state, '', top.url0); } catch (e) {}
      } else if (top.initial && top.url === top.url0 && location.href === top.url && location.hash) {
        /* 딥링크로 저절로 열린 팝업 — 닫았으니 주소의 #hash도 걷는다 */
        try { history.replaceState(history.state, '', location.href.split('#')[0]); } catch (e) {}
      }
      lastUrl = location.href; lastLen = history.length;
      setTimeout(sync, 120); setTimeout(sync, 400);
    });

    function watch() {
      if (!window.MutationObserver || !d.body) return;
      try {
        new MutationObserver(function (recs) {
          for (var i = 0; i < recs.length; i++) {
            var r = recs[i];
            if (r.type === 'childList') { tick(); return; }
            var t = r.target;
            if (!t || t.nodeType !== 1) continue;
            if (t === d.body || t === root || (t.matches && t.matches(SEL))) { tick(); return; }
            /* 감싸개에 hidden·class가 붙는 경우(바깥 상자를 감추면 안쪽 팝업도 사라진다) */
            for (var k = 0; k < layers.length; k++) {
              if (layers[k].el === t || layers[k].el.contains(t) || t.contains(layers[k].el)) { tick(); return; }
            }
          }
        }).observe(d.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'role', 'data-jc-layer'] });
      } catch (e) {}
    }

    /* 섹터가 부르는 문 */
    var api = {
      bind: function (el, fn) {                                     // 팝업 요소에 «닫는 함수»를 붙인다
        if (typeof el === 'string') el = d.querySelector(el);
        if (!el || !fns) return;
        fns.set(el, fn);
        var i = index(el); if (i > -1) layers[i].close = fn;
        setTimeout(sync, 0);
      },
      release: function (el) {                                      // 섹터가 팝업을 닫았을 때 정리(보통은 자동)
        if (typeof el === 'string') el = d.querySelector(el);
        var i = el ? index(el) : layers.length - 1; if (i < 0) return;
        settle(layers[i]);
      },
      depth: function () { return layers.length; },                  // 열려 있는 겹 수
      open: function (el, fn) {                                      // 히스토리에 없는 팝업을 직접 등록
        if (typeof el === 'string') el = d.querySelector(el);
        if (!el) return;
        if (fn && fns) fns.set(el, fn);
        if (index(el) < 0) push(el);
      }
    };

    /* 사용자가 화면을 한 번이라도 만졌는가 — 안 만졌으면 딥링크로 저절로 열린 팝업이다 */
    ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown'].forEach(function (t) {
      d.addEventListener(t, function () { touched = true; lastTouch = location.href; touchPush = pushN; touchRep = repN; }, { capture: true, passive: true });
    });

    ready(function () { watch(); sync(); setTimeout(sync, 200); setTimeout(sync, 700); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) { layers = []; quiet = true; sync(); quiet = false; } });
    return api;
  })();
  window.JCBackStack = BS;

  window.JCCore = {
    base: BASE,
    /* 대문 검색이 넘긴 낱말 — 섹터가 직접 쓸 때 */
    query: function () { return DLQ; },
    applyQuery: deepLink,
    state: function () { return { failed: st.failed, offline: st.offline, pending: st.pending }; },
    warm: function (href) { try { var u = new URL(href, location.href); if (u.origin === location.origin) warm(u.origin + u.pathname); } catch (e) {} },
    notice: function (text, label, fn) { show(String(text || ''), label || null, fn); },
    clear: hide
  };
})();
