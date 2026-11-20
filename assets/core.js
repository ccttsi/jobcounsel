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
