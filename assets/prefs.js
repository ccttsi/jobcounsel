/*
 * 직업상담 통합 자료실 · 공용 화면 설정 (테마 버튼 + 글자 크기 버튼)
 *
 * 쓰는 법: 페이지 머리말의 원하는 자리에 <span data-jc-prefs></span>를 두고
 *          </body> 앞에 <script src="../assets/prefs.js" defer></script>를 넣는다.
 *
 * 1) 테마 버튼 하나: 밝게(해) → 어둡게(초승달) → 자동(빗금으로 나눈 해·달) → 밝게 …
 *    저장 키 jc-theme = light | dark | auto. 자동은 오전 7시~오후 7시 밝게.
 * 2) 글자 크기 버튼(가/a): 기본 → 크게(40대) → 더 크게(50대) → 기본 …
 *    저장 키 jc-font = 0 | 1 | 2. 배율 1 · 1.15 · 1.3.
 *    문서의 스타일 규칙에서 글자 크기만 키운다(상자 크기·폭은 그대로라 줄바꿈으로 흘러내린다).
 *    28px이 넘는 큰 제목은 그대로 두고, 그보다 작은 글자는 28px을 넘지 않게 키운다.
 *    em·% 단위는 부모를 따라 이미 커지므로 건드리지 않는다.
 *    책등처럼 크기가 고정된 장식은 window.JC_FS_SKIP = '.book, .bookend'처럼 선택자로 빼 둔다.
 * 3) 집중 보기(몰입형 풀화면) 버튼: 머리말·메뉴·옆 목록·바닥글·장식을 숨기고 본문만 화면 가득(100dvh) 띄운다.
 *    되는 기기에서는 Fullscreen API도 함께 켠다. 끄기: Esc, 또는 오른쪽 아래 떠 있는 도구함.
 *    본문은 [data-jc-content] → main → [role=main] → #main → #app 순으로 찾고, 본문과 그 조상만 남긴 채
 *    나머지 형제 요소를 숨긴다. 그래서 새 꼭지도 <main>과 prefs.js만 있으면 그대로 따라온다.
 *    페이지별 조정(없어도 된다):
 *      window.JC_IMMERSIVE = { content: 'main' | function () { return el; },   // 본문
 *                              hide: '.tabs, .dock',                           // 더 숨길 것(본문 안쪽 포함)
 *                              keep: '.toast',                                 // 숨기지 않을 것
 *                              fullscreen: false };                            // Fullscreen API를 쓰지 않으려면
 *    숨기지 않을 요소에는 data-jc-keep을 달아도 된다. 대화 상자(role=dialog)와 화면에 고정된 알림은 저절로 남는다.
 *    몰입 중인 화면은 html[data-jc-imm]로 꾸민다. 버튼 하나만 따로 둘 때는 <span data-jc-prefs="immersive"></span>.
 * 4) 공통 디자인 층: 종이 결, 읽은 만큼 차는 색띠, 제목 줄바꿈 고르기, 세피아 종이 색, 교정지 재단선.
 *    모두 @layer 안에 있어 페이지 자체 스타일이 언제나 이긴다. 움직임은 transform·opacity만 쓴다.
 *    손맛 층: 위쪽 눈금·색띠(스크롤 rAF), 머리말 2톤 인쇄선, 제목 옆 소인, 눌리는 카드(.jc-pop, 실행 중에 찾아 단다),
 *    새로 들어온 덩어리의 등장 모션(.jc-in). 주기적으로 다시 그리는 곳은 data-jc-still로 뺀다.
 *    끄려면 window.JC_DESIGN = { grain: false, progress: false, seal: false, rule: false, enter: false }.
 *    세피아는 밝은 테마 위에 종이 색을 얹는 방식이라 저장 값은 jc-theme = light, jc-tone = sepia.
 */
(function () {
  'use strict';
  if (window.JCPrefs) return;
  var d = document, root = d.documentElement;
  var TK = 'jc-theme', FK = 'jc-font', NK = 'jc-tone';
  var MODES = ['light', 'sepia', 'dark', 'auto'];
  var LABEL = { light: '밝게', sepia: '세피아(종이 색)', dark: '어둡게', auto: '자동(오전 7시~오후 7시 밝게)' };
  var FS = [1, 1.15, 1.3], FS_LABEL = ['기본', '크게(40대)', '더 크게(50대)'];
  var CAP = 28; // px. 이보다 큰 글자는 키우지 않는다.

  function get(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function mode() {
    var m = get(TK, 'auto');
    if (m === 'light' && get(NK, '') === 'sepia') return 'sepia';
    return m === 'light' || m === 'dark' ? m : 'auto';
  }
  function level() { var n = +get(FK, 0); return n === 1 || n === 2 ? n : 0; }

  /* ---------- 테마 ---------- */
  function resolve(m) { if (m === 'sepia') return 'light'; if (m !== 'auto') return m; var h = new Date().getHours(); return h >= 7 && h < 19 ? 'light' : 'dark'; }
  function applyTheme() {
    var m = mode(), t = resolve(m), sep = m === 'sepia';
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    if (sep) { if (root.getAttribute('data-jc-tone') !== 'sepia') root.setAttribute('data-jc-tone', 'sepia'); }
    else if (root.hasAttribute('data-jc-tone')) root.removeAttribute('data-jc-tone');
    var meta = d.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#08090c' : sep ? '#f3e7cf' : '#faf6ef');
    if (dock) { if (t === 'dark') dock.host.setAttribute('data-dark', ''); else dock.host.removeAttribute('data-dark'); }
  }
  function setMode(m) {
    var stored = m === 'sepia' ? 'light' : m;
    set(TK, stored); set(NK, m === 'sepia' ? 'sepia' : ''); applyTheme();
    // 각 페이지의 기존 테마 코드도 같은 값을 다시 읽게 한다(다른 탭에서 바꾼 것과 같은 신호).
    try { window.dispatchEvent(new StorageEvent('storage', { key: TK, newValue: stored })); } catch (e) {}
    applyTheme(); // 페이지 코드가 data-theme을 다시 쓴 뒤에도 종이 색 표시가 맞도록
    paint(true);
  }

  /* ---------- 글자 크기 ---------- */
  var orig = new WeakMap();       // CSSStyleDeclaration → {fs, lh}
  var skip = [];                  // 크기를 고정할 선택자(window.JC_FS_SKIP = '.book, .bookend')
  var factor = 1;
  function skipRule(sel) { for (var i = 0; i < skip.length; i++) if (sel.indexOf(skip[i]) >= 0) return true; return false; }

  function scaledValue(v, f) {
    if (!v || f === 1) return v;
    v = v.trim();
    if (/^-?[\d.]+(em|%|ex|ch)$/i.test(v) || /^[a-z-]+$/i.test(v)) return null; // em·%·낱말 값은 부모를 따른다
    if (!/px|rem|vw|vh|vmin|vmax|var\(|clamp\(|calc\(|min\(|max\(/i.test(v)) return null;
    return 'max(' + v + ', min(calc(' + v + ' * ' + f + '), ' + CAP + 'px))';
  }
  function scaledLH(v, f) {
    if (!v || f === 1) return v;
    if (!/^-?[\d.]+(px|rem)$/.test(v.trim())) return null; // 단위 없는 줄 간격은 글자를 따라 커진다
    return 'calc(' + v.trim() + ' * ' + f + ')';
  }
  function touchDecl(st, f, isRule) {
    var o = orig.get(st);
    if (!o) {
      o = { fs: st.getPropertyValue('font-size'), fsP: st.getPropertyPriority('font-size'), lh: st.getPropertyValue('line-height'), lhP: st.getPropertyPriority('line-height') };
      if (!o.fs && !o.lh) return;
      orig.set(st, o);
    }
    if (o.fs) {
      var nv = f === 1 ? o.fs : scaledValue(o.fs, f);
      if (nv && st.getPropertyValue('font-size') !== nv) st.setProperty('font-size', nv, o.fsP);
    }
    if (o.lh) {
      var nl = f === 1 ? o.lh : scaledLH(o.lh, f);
      if (nl && st.getPropertyValue('line-height') !== nl) st.setProperty('line-height', nl, o.lhP);
    }
  }
  function walk(rules, f) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && !r.selectorText) { walk(r.cssRules, f); continue; } // @media, @supports, @layer
      if (!r.style || !r.selectorText) continue;
      if (skip.length && skipRule(r.selectorText)) continue;
      if (/^(:root|html)$/.test(r.selectorText.trim()) && !r.style.getPropertyValue('font-size')) continue;
      touchDecl(r.style, f, true);
      if (r.cssRules && r.cssRules.length) walk(r.cssRules, f); // 중첩 규칙
    }
  }
  function scaleSheets() {
    for (var i = 0; i < d.styleSheets.length; i++) {
      var sh = d.styleSheets[i], rules;
      try { rules = sh.cssRules; } catch (e) { continue; } // 다른 출처 스타일
      if (rules) walk(rules, factor);
    }
  }
  function scaleInline(rootEl) {
    var list = (rootEl || d).querySelectorAll('[style*="font-size"],[style*="font:"],[style*="line-height"]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (skip.length && el.closest(skip.join(','))) continue;
      touchDecl(el.style, factor, false);
    }
  }

  var pending = false;
  function rescale() {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; scaleSheets(); scaleInline(); });
  }
  function applyFont() {
    factor = FS[level()];
    root.setAttribute('data-jc-font', String(level()));
    scaleSheets(); scaleInline();
  }
  function setLevel(n) { set(FK, String(n)); applyFont(); paint(); }

  /* ---------- 버튼 ---------- */
  var ICON = {
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/></svg>',
    sepia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7.6l3.9 3.9v13.1H6.5z"/><path d="M14 3.6v4h4"/><path d="M9.3 12h5.4M9.3 15.4h5.4"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sl" d="M20 4 4 20"/><circle cx="7.6" cy="7.6" r="2.3"/><path d="M7.6 2.6v1.2M7.6 11.4v1.2M2.6 7.6h1.2M11.4 7.6h1.2M4.1 4.1l.8.8M10.3 10.3l.8.8M4.1 11.1l.8-.8M10.3 4.9l.8-.8"/><path d="M20.6 17.4a4.2 4.2 0 0 1-5.4-5.4 4.4 4.4 0 1 0 5.4 5.4z"/></svg>'
  };
  var ICON_IMM = {
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.2V4.5h4.7M19.5 9.2V4.5h-4.7M4.5 14.8v4.7h4.7M19.5 14.8v4.7h-4.7"/></svg>',
    on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 4.5v4.7H4.5M14.8 4.5v4.7h4.7M9.2 19.5v-4.7H4.5M14.8 19.5v-4.7h4.7"/></svg>'
  };
  var CSS = ':host{display:inline-flex;align-items:center;gap:2px;flex:none;vertical-align:middle;color:inherit}' +
    'button{all:unset;box-sizing:border-box;width:40px;height:40px;border-radius:12px;display:inline-grid;place-items:center;cursor:pointer;color:inherit;-webkit-tap-highlight-color:transparent}' +
    'button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}' +
    'button:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
    'svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.t[data-m="dark"] svg path{fill:currentColor;stroke-width:1.2}' +
    '.t[data-m="auto"] svg .sl{stroke-width:1.4;opacity:.7}' +
    '.f{width:auto;min-width:40px;padding:0 6px;font:700 13px/1 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.02em;white-space:nowrap}' +
    '.f[data-l="1"]{font-size:15px}.f[data-l="2"]{font-size:17.5px}' +
    '.f small{font-size:.8em;font-weight:600;opacity:.75}' +
    'button{transition:transform .14s ease}button:active{transform:scale(.92)}' +
    '@keyframes sw{from{opacity:0;transform:rotate(-45deg) scale(.7)}}' +
    '.t.sw svg{animation:sw .26s cubic-bezier(.2,.9,.3,1.2)}' +
    '@media (max-width:420px){button{width:36px}.f{min-width:36px;padding:0 3px}}' +
    '@media (prefers-reduced-motion:reduce){.t.sw svg{animation:none}button{transition:none}button:active{transform:none}}';
  var hosts = [];
  function mount(host) {
    if (host.__jc) return; host.__jc = true;
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    // data-jc-prefs="immersive"처럼 적으면 그 버튼만 둔다. 비워 두면 셋 다.
    var want = (host.getAttribute('data-jc-prefs') || '').toLowerCase();
    var all = !/theme|font|immersive/.test(want);
    sr.innerHTML = '<style>' + CSS + '</style>' +
      (all || /theme/.test(want) ? '<button class="t" type="button"></button>' : '') +
      (all || /font/.test(want) ? '<button class="f" type="button"></button>' : '') +
      (all || /immersive/.test(want) ? '<button class="i" type="button"></button>' : '');
    wireButtons(sr);
    hosts.push(sr);
  }
  function wireButtons(sr) {
    var t = sr.querySelector('.t'), f = sr.querySelector('.f'), i = sr.querySelector('.i');
    if (t) t.addEventListener('click', function () { setMode(MODES[(MODES.indexOf(mode()) + 1) % MODES.length]); });
    if (f) f.addEventListener('click', function () { setLevel((level() + 1) % 3); });
    if (i) i.addEventListener('click', function () { setImmersive(!immersive); });
  }
  function paint(swap) {
    var m = mode(), l = level();
    hosts.forEach(function (sr) {
      var t = sr.querySelector('.t'), f = sr.querySelector('.f'), i = sr.querySelector('.i');
      if (t) {
        t.innerHTML = ICON[m]; t.dataset.m = m;
        t.setAttribute('aria-label', '화면 테마: ' + LABEL[m] + '. 누르면 ' + LABEL[MODES[(MODES.indexOf(m) + 1) % MODES.length]].replace(/\(.*\)/, '') + '(으)로 바뀝니다');
        t.title = '화면 테마: ' + LABEL[m];
        if (swap === true) { t.classList.remove('sw'); void t.offsetWidth; t.classList.add('sw'); }
      }
      if (f) {
        f.innerHTML = '<span>가<small>/a</small></span>'; f.dataset.l = String(l);
        f.setAttribute('aria-label', '글자 크기: ' + FS_LABEL[l] + '. 누르면 ' + FS_LABEL[(l + 1) % 3] + '(으)로 바뀝니다');
        f.title = '글자 크기: ' + FS_LABEL[l];
      }
      if (i) {
        i.innerHTML = ICON_IMM[immersive ? 'on' : 'off'];
        i.setAttribute('aria-pressed', String(immersive));
        i.setAttribute('aria-label', immersive ? '집중 보기 끝내기' : '집중 보기: 본문만 화면 가득 띄웁니다');
        i.title = immersive ? '집중 보기 끝내기 (Esc)' : '집중 보기';
      }
    });
  }
  function mountAll() { d.querySelectorAll('[data-jc-prefs]').forEach(mount); paint(); }

  /* ---------- 공통 디자인 층 ---------- */
  // 페이지 스타일이 언제나 이기도록 꾸밈은 @layer 안에 둔다. 움직임은 transform·opacity뿐이다.
  var NOISE = function (rgb, a) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>' +
      '<feColorMatrix values="0 0 0 0 ' + rgb[0] + ' 0 0 0 0 ' + rgb[1] + ' 0 0 0 0 ' + rgb[2] + ' 0 0 0 ' + a + ' 0"/></filter>' +
      '<rect width="100%" height="100%" filter="url(#n)"/></svg>') + '")';
  };
  var BAR = 'linear-gradient(90deg,#ffe14d 0 20%,#ffb35c 20% 40%,#ff9fd2 40% 60%,#7fd6ff 60% 80%,#b8f25e 80% 100%)'; // 형광펜 다섯 색 = 인쇄 색띠
  var DESIGN_CSS =
    '@layer jc-design{' +
      'html{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,currentColor 26%,transparent) transparent}' +
      'h1,h2,h3{text-wrap:balance}' +
      'p,blockquote,figcaption{text-wrap:pretty}' +
      'main a{text-underline-offset:.18em;text-decoration-thickness:.07em}' +
      '::selection{background:rgba(255,225,77,.62);color:inherit}' +
      'html[data-theme="dark"] ::selection{background:rgba(255,225,77,.3)}' +
      'a:focus-visible,button:focus-visible,summary:focus-visible,[role="button"]:focus-visible,[tabindex]:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
      'button,summary,[role="button"]{transition:transform .14s ease}' +
      'button:active,summary:active,[role="button"]:active{transform:scale(.98)}' +
      '@media (prefers-reduced-motion:reduce){button,summary,[role="button"]{transition:none}button:active,summary:active,[role="button"]:active{transform:none}}' +
    '}' +
    /* 종이 결: 바탕색 위, 본문 아래에 까는 배경 무늬라 글자·카드 위로는 올라오지 않는다(고정하지 않고 함께 흐른다) */
    'html body.jc-paper{background-image:' + NOISE([.36, .27, .17], .1) + ';background-size:180px 180px;background-repeat:repeat;background-attachment:scroll}' +
    'html[data-theme="dark"] body.jc-paper{background-image:' + NOISE([1, 1, 1], .06) + '}' +
    /* 세피아: 밝은 테마 위에 종이 색을 곱해 얹는다 */
    '.jc-tone{display:none;position:fixed;inset:0;z-index:2147481500;pointer-events:none;background:#f6ead0;mix-blend-mode:multiply}' +
    'html[data-jc-tone="sepia"][data-theme="light"] .jc-tone{display:block}' +
    /* 집중 보기 */
    'html[data-jc-imm] [data-jc-imm="hide"]{display:none!important}' +
    'html[data-jc-imm] [data-jc-imm="path"],html[data-jc-imm] [data-jc-imm="content"]{grid-column:1/-1!important}' +
    /* 본문은 화면 높이를 채우고, 위아래에 숨 쉴 자리를 투명 테두리로 더한다(페이지의 안쪽 여백은 그대로 둔다) */
    'html[data-jc-imm] [data-jc-imm="content"]{min-height:100vh;min-height:100dvh;box-sizing:border-box;border-top:max(18px,env(safe-area-inset-top)) solid transparent;border-bottom:max(18px,env(safe-area-inset-bottom)) solid transparent}' +
    /* 교정지 재단선: 몰입 중에만 네 귀퉁이에 가는 선, 넓은 화면에서는 양옆에 맞춤표 */
    '.jc-crop{display:none;--c:rgba(74,56,38,.4);position:fixed;z-index:2147480500;pointer-events:none;' +
      'top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));left:max(8px,env(safe-area-inset-left));' +
      'background:' + ['0 0', '100% 0', '0 100%', '100% 100%'].map(function (p) {
        return 'linear-gradient(var(--c),var(--c)) ' + p + '/14px 1px no-repeat,linear-gradient(var(--c),var(--c)) ' + p + '/1px 14px no-repeat';
      }).join(',') + '}' +
    'html[data-theme="dark"] .jc-crop{--c:rgba(255,255,255,.3)}' +
    'html[data-jc-imm] .jc-crop{display:block}' +
    '.jc-crop::before,.jc-crop::after{content:"";display:none;position:absolute;top:50%;width:11px;height:11px;margin-top:-6px;border:1px solid var(--c);border-radius:50%;' +
      'background:linear-gradient(var(--c),var(--c)) 50% 50%/17px 1px no-repeat,linear-gradient(var(--c),var(--c)) 50% 50%/1px 17px no-repeat}' +
    '.jc-crop::before{left:-5px}.jc-crop::after{right:-5px}' +
    '@media (min-width:900px){.jc-crop::before,.jc-crop::after{display:block}}' +
    '@media print{html body.jc-paper{background-image:none}.jc-tone,.jc-crop,#jc-imm-dock{display:none!important}}';

  function layer(cls) { var el = d.createElement('div'); el.className = cls; el.setAttribute('aria-hidden', 'true'); el.setAttribute('data-jc-ignore', ''); d.body.appendChild(el); return el; }
  function design() {
    if (d.getElementById('jc-design')) return;
    var opt = window.JC_DESIGN || {};
    var st = d.createElement('style'); st.id = 'jc-design'; st.textContent = DESIGN_CSS; d.head.appendChild(st);
    // 바탕 무늬를 이미 쓰는 페이지는 건드리지 않는다
    if (opt.grain !== false && getComputedStyle(d.body).backgroundImage === 'none') d.body.classList.add('jc-paper');
    layer('jc-tone'); layer('jc-crop');
  }

  /* ---------- 손맛: 진행 띠, 머리말 2톤 선, 소인, 눌리는 카드, 등장 모션 ---------- */
  // 꾸밈은 모두 html:not([data-jc-imm]) 조건이라 집중 보기에서는 빠진다. 움직임은 transform·opacity뿐이고
  // 늘 움직이는 것은 없다(스크롤·누름·화면 전환에만 반응). prefers-reduced-motion이면 움직임을 끈다.
  var SEAL = '<svg class="jc-seal" viewBox="0 0 86 50" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-linecap="round">' +
    '<circle cx="25" cy="25" r="21" stroke-width="2.4"/><circle cx="25" cy="25" r="15.5" stroke-width="1.2" stroke-dasharray="1.5 3.2"/>' +
    '<path d="m25 16 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor" stroke="none"/>' +
    '<path d="M50 15c4-4 7 4 11 0s7 4 11 0 7 4 11 0M50 25c4-4 7 4 11 0s7 4 11 0 7 4 11 0M50 35c4-4 7 4 11 0s7 4 11 0 7 4 11 0" stroke-width="2"/></g></svg>';
  var POP_CSS =
    'html{--jc-edge:rgba(42,37,33,.14);--jc-edge-2:#2a2521;--jc-hi:#ffe14d;--jc-stamp:#c2452d}' +
    'html[data-theme="dark"]{--jc-edge:rgba(255,255,255,.11);--jc-edge-2:#f2c94c;--jc-hi:#f2c94c;--jc-stamp:#ff8a80}' +
    '@layer jc-design{' +
      '.jc-pop{transition:transform .24s cubic-bezier(.2,1.5,.35,1);box-shadow:3px 3px 0 var(--jc-edge)}' +
      '@media (hover:hover){.jc-pop:hover{transform:translate(-2px,-3px) rotate(-.35deg);box-shadow:6px 7px 0 var(--jc-edge-2)}.jc-pop.jc-pop-l:hover{transform:translate(-2px,-3px)}}' +
      '.jc-pop:active{transform:translate(1px,2px) scale(.985);box-shadow:1px 1px 0 var(--jc-edge-2)}' +
      'html[data-jc-imm] .jc-pop,html[data-jc-imm] .jc-pop:hover,html[data-jc-imm] .jc-pop:active{box-shadow:none;transform:none}' +
      '@media (prefers-reduced-motion:reduce){.jc-pop,.jc-pop:hover,.jc-pop:active{transition:none;transform:none}}' +
    '}' +
    '@keyframes jc-boing{0%{transform:scale(.955)}55%{transform:scale(1.028) rotate(-.5deg)}100%{transform:none}}' +
    'html:not([data-jc-imm]) .jc-boing{animation:jc-boing .36s cubic-bezier(.3,1.4,.4,1)}' +
    '@keyframes jc-in{from{opacity:0;transform:translateY(10px) scale(.985)}}' +
    'html:not([data-jc-imm]) .jc-in{animation:jc-in .34s cubic-bezier(.2,.9,.3,1.15) backwards;animation-delay:calc(var(--jc-i,0) * 34ms)}' +
    /* 위쪽 눈금 띠 + 읽은 만큼 차는 색띠 */
    '.jc-track{position:fixed;left:0;right:0;top:0;height:4px;z-index:2147480000;pointer-events:none;background:repeating-linear-gradient(90deg,var(--jc-edge) 0 1px,transparent 1px 8px)}' +
    '.jc-track i{display:block;height:100%;background:' + BAR + ';transform-origin:0 50%;transform:scaleX(0);will-change:transform}' +
    'html[data-jc-imm] .jc-track{display:none}' +
    /* 머리말 아래 어긋난 2톤 인쇄선 */
    '.jc-rule{position:absolute;left:0;right:0;bottom:-5px;height:7px;pointer-events:none;z-index:1;background:linear-gradient(var(--jc-edge-2),var(--jc-edge-2)) 0 0/100% 2px no-repeat,linear-gradient(var(--jc-hi),var(--jc-hi)) 7px 4px/100% 3px no-repeat}' +
    'html[data-jc-imm] .jc-rule{display:none}' +
    /* 제목 옆 소인 */
    '.jc-seal{display:inline-block;width:1.72em;height:1em;margin-left:.3em;vertical-align:-.12em;color:var(--jc-stamp);opacity:.78;transform:rotate(-9deg);transform-origin:30% 50%;pointer-events:none;-webkit-user-select:none;user-select:none}' +
    '@keyframes jc-stamp{0%{opacity:0;transform:rotate(-9deg) scale(1.8)}60%{opacity:.9;transform:rotate(-9deg) scale(.94)}100%{opacity:.78;transform:rotate(-9deg) scale(1)}}' +
    '.jc-seal.jc-new{animation:jc-stamp .46s cubic-bezier(.3,.9,.3,1) .25s backwards}' +
    'html[data-jc-imm] .jc-seal{display:none}' +
    '@media (prefers-reduced-motion:reduce){.jc-boing,.jc-in,.jc-seal.jc-new{animation:none!important}.jc-track i{display:none}}' +
    '@media print{.jc-track,.jc-rule,.jc-seal{display:none!important}.jc-pop{box-shadow:none!important}}';

  var popSeen = typeof WeakSet === 'function' ? new WeakSet() : null, popT = 0, sealed = false, reduce = null;
  var BLOCK = /^(DIV|SECTION|ARTICLE|LI|A|BUTTON|P|H1|H2|H3|H4|UL|OL|DL|HEADER|FIGURE|DETAILS|NAV|TABLE|TR|FORM|ASIDE|BLOCKQUOTE)$/;
  function still() { return immersive || (reduce && reduce.matches); }
  function popRoot() { return contentEl() || d.body; }
  function scanPop() {
    if (!popSeen) return;
    var list = popRoot().querySelectorAll('a,button,summary,[role="button"]'), vh = window.innerHeight, n = 0;
    for (var i = 0; i < list.length && n < 300; i++) {
      var el = list[i]; if (popSeen.has(el)) continue;
      var r = el.getBoundingClientRect(); if (!r.width) continue; // 아직 안 보이면 다음에 다시 본다
      popSeen.add(el); n++;
      if (r.width < 120 || r.height < 44 || r.height > vh * .8 || el.closest('[data-jc-still],[data-jc-ignore]')) continue;
      var cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopLeftRadius) < 8 || cs.transform !== 'none' || /fixed|sticky|absolute/.test(cs.position) || /inline$/.test(cs.display)) continue;
      var bg = cs.backgroundColor, hasBg = bg && bg !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg), hasBorder = parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none';
      if (!hasBg && !hasBorder) continue;
      el.classList.add('jc-pop'); if (r.width > 420) el.classList.add('jc-pop-l');
    }
  }
  function queuePop() { clearTimeout(popT); popT = setTimeout(scanPop, 380); }
  function seal() {
    if ((window.JC_DESIGN || {}).seal === false || d.querySelector('.jc-seal')) return;
    var hs = d.querySelectorAll('h1');
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i]; if (!h.offsetWidth || h.closest('[data-jc-ignore],dialog,[role="dialog"]')) continue;
      if (parseFloat(getComputedStyle(h).fontSize) < 24) continue;
      h.insertAdjacentHTML('beforeend', SEAL);
      if (!sealed) { sealed = true; var sv = h.querySelector('.jc-seal'); if (sv && !still()) sv.classList.add('jc-new'); }
      return;
    }
  }
  function rule() {
    var host = d.querySelector('[data-jc-prefs]:not([data-jc-prefs="immersive"])'); if (!host || (window.JC_DESIGN || {}).rule === false) return;
    var hd = host.closest('header') || host.parentElement; if (!hd || hd.querySelector('.jc-rule')) return;
    while (hd.parentElement && hd !== d.body && hd.offsetWidth < d.documentElement.clientWidth * .6) hd = hd.parentElement;
    if (hd === d.body || hd.querySelector('.jc-rule')) return;
    if (getComputedStyle(hd).position === 'static') hd.style.position = 'relative';
    var el = d.createElement('i'); el.className = 'jc-rule'; el.setAttribute('aria-hidden', 'true'); hd.appendChild(el);
  }
  function enter(records) {
    queuePop();
    if (!d.querySelector('.jc-seal')) setTimeout(seal, 60);
    if ((window.JC_DESIGN || {}).enter === false || still()) return;
    var ae = d.activeElement; if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return; // 글자를 치는 동안에는 가만히
    var added = [], i, j;
    for (i = 0; i < records.length; i++) for (j = 0; j < records[i].addedNodes.length; j++) {
      var n = records[i].addedNodes[j];
      if (n.nodeType === 1 && BLOCK.test(n.tagName) && n.isConnected && !/(^|\s)jc-/.test(n.className && n.className.baseVal === undefined ? n.className : '') && !n.closest('[data-jc-still],[data-jc-ignore],svg')) added.push(n);
    }
    if (!added.length) return;
    added = added.filter(function (n) { for (var k = 0; k < added.length; k++) if (added[k] !== n && added[k].contains(n)) return false; return true; });
    if (added.length === 1 && added[0].children.length >= 2 && added[0].offsetHeight > 200) { // 통째로 갈아 끼운 화면은 그 안의 덩어리들을 차례로
      var kids = [].filter.call(added[0].children, function (c) { return BLOCK.test(c.tagName); }); if (kids.length >= 2) added = kids;
    }
    var vh = window.innerHeight, k = 0;
    for (i = 0; i < added.length && k < 10; i++) {
      var el = added[i], r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh) continue; // 화면 밖은 움직이지 않는다
      var cs = getComputedStyle(el); if (cs.animationName !== 'none' || /fixed|absolute|sticky/.test(cs.position) || cs.transform !== 'none') continue;
      el.style.setProperty('--jc-i', k++); el.classList.add('jc-in');
      (function (el) { setTimeout(function () { el.classList.remove('jc-in'); el.style.removeProperty('--jc-i'); }, 900); })(el);
    }
  }
  function pop() {
    var opt = window.JC_DESIGN || {};
    reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion:reduce)') : null;
    var st = d.createElement('style'); st.id = 'jc-pop'; st.textContent = POP_CSS; d.head.appendChild(st);
    // 진행 띠: 스크롤을 rAF로 묶어 scaleX만 바꾼다(아이폰 사파리 포함 전 기종)
    if (opt.progress !== false) {
      var tr = layer('jc-track'), fill = d.createElement('i'), raf = 0; tr.appendChild(fill);
      var upd = function () { raf = 0; var se = d.scrollingElement || root, max = se.scrollHeight - window.innerHeight; fill.style.transform = 'scaleX(' + (max > 8 ? Math.min(1, Math.max(0, se.scrollTop / max)) : 0).toFixed(4) + ')'; };
      var req = function () { if (!raf && !still()) raf = requestAnimationFrame(upd); };
      window.addEventListener('scroll', req, { passive: true }); window.addEventListener('resize', req); upd();
    }
    rule(); seal(); scanPop(); setTimeout(scanPop, 700); setTimeout(function () { scanPop(); seal(); rule(); }, 2200);
    if (window.MutationObserver) new MutationObserver(enter).observe(d.body, { childList: true, subtree: true });
    d.addEventListener('click', queuePop, true);
    try { d.addEventListener('touchstart', function () {}, { passive: true }); } catch (e) {} // 아이폰에서 :active가 먹도록
    d.addEventListener('pointerup', function (e) {
      if (still() || !e.target.closest) return; var el = e.target.closest('.jc-pop'); if (!el) return;
      el.classList.remove('jc-boing'); void el.offsetWidth; el.classList.add('jc-boing');
      setTimeout(function () { el.classList.remove('jc-boing'); }, 420);
    }, true);
  }

  /* ---------- 집중 보기(몰입형 풀화면) ---------- */
  var immersive = false, dock = null, awake = false, sleepT = 0, eatClick = false, moveRaf = 0, zone = null;
  var IDLE_MS = 3600;
  var KEEP = 'script,style,link,template,noscript,[data-jc-keep],[data-jc-ignore],#jc-marker-ui,#jc-marker-notes,#jc-imm-dock,dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],[role="status"],[role="alert"],[role="tooltip"],[aria-live]';
  function cfg() { return window.JC_IMMERSIVE || {}; }
  function q(sel) { try { return sel ? d.querySelector(sel) : null; } catch (e) { return null; } }
  function contentEl() {
    var c = cfg().content, el = null;
    if (typeof c === 'function') { try { el = c(); } catch (e) {} if (typeof el === 'string') el = q(el); }
    else if (typeof c === 'string') el = q(c);
    return el || q('[data-jc-content]') || q('main') || q('[role="main"]') || q('#main') || q('#app');
  }
  function matches(el, sel) { try { return !!sel && el.matches(sel); } catch (e) { return false; } }
  function keepIt(el) {
    var c = cfg();
    if (matches(el, c.hide)) return false;
    if (matches(el, KEEP) || matches(el, c.keep)) return true;
    if (!el.offsetWidth && !el.offsetHeight && !el.getClientRects().length) return true; // 지금 안 보이는 것(닫힌 창, 그림 조각 모음)은 건드리지 않는다
    // 화면에 고정된 것 가운데 머리말·메뉴·바닥글이 아닌 것(알림, 창, 가림막)은 남긴다
    if (getComputedStyle(el).position === 'fixed' && !/^(HEADER|NAV|FOOTER)$/.test(el.tagName)) return true;
    return false;
  }
  function markAll() {
    var c = contentEl(), extra = cfg().hide, i;
    if (c && c !== d.body && c !== root) {
      c.setAttribute('data-jc-imm', 'content');
      for (var el = c; el && el !== d.body && el.parentElement; el = el.parentElement) {
        if (el !== c) el.setAttribute('data-jc-imm', 'path');
        var sibs = el.parentElement.children;
        for (i = 0; i < sibs.length; i++) if (sibs[i] !== el && !keepIt(sibs[i])) sibs[i].setAttribute('data-jc-imm', 'hide');
      }
    } else {
      // 본문을 못 찾으면 뼈대 요소만 숨긴다
      var list = d.querySelectorAll('body > header, body > nav, body > footer, body > aside:not([role="dialog"])');
      for (i = 0; i < list.length; i++) list[i].setAttribute('data-jc-imm', 'hide');
    }
    if (extra) { try { var more = d.querySelectorAll(extra); for (i = 0; i < more.length; i++) more[i].setAttribute('data-jc-imm', 'hide'); } catch (e) {} }
  }
  function unmark() {
    var list = d.querySelectorAll('[data-jc-imm]');
    for (var i = 0; i < list.length; i++) if (list[i] !== root) list[i].removeAttribute('data-jc-imm');
  }

  /* 떠 있는 도구함: 평소에는 연하게, 가까이 가거나 누르면 또렷하게 */
  // 평소에는 맨 아래 줄, 형광펜 버튼 왼쪽에 작은 손잡이 하나만 연하게 둔다. 누르거나 마우스가 가까이 오면 왼쪽으로 펼쳐진다.
  // (세로로 길게 세우면 본문·넘김 단추 옆을 가린다 — 2026-11-15 사용자 지적)
  var DOCK_CSS = ':host{all:initial;--ink:#2a2521;--panel:#fffdf8;--line:#e6dccb;--shadow:0 10px 24px -12px rgba(60,40,20,.5),0 2px 5px rgba(60,40,20,.1)}' +
    ':host([data-dark]){--ink:#e6e9ef;--panel:#111621;--line:#2a3243;--shadow:0 10px 24px -10px rgba(0,0,0,.75)}' +
    '.dock{position:fixed;right:var(--r,max(16px,env(safe-area-inset-right)));bottom:var(--b,max(16px,env(safe-area-inset-bottom)));z-index:1;display:flex;align-items:center;gap:6px;color:var(--ink);-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
    '.dock[hidden]{display:none}' +
    '.tools{display:flex;gap:2px;padding:3px;border-radius:16px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(10px) scale(.94);transform-origin:100% 50%;transition:opacity .2s ease,transform .24s cubic-bezier(.2,1.3,.4,1),visibility 0s .24s}' +
    '.dock.on .tools{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .2s ease,transform .24s cubic-bezier(.2,1.3,.4,1),visibility 0s}' +
    'button{all:unset;box-sizing:border-box;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;cursor:pointer;color:inherit;-webkit-tap-highlight-color:transparent;transition:transform .14s ease}' +
    '.h{width:40px;height:40px;border-radius:50%;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow);opacity:.3;transition:opacity .28s ease,transform .14s ease}' +
    '.dock.on .h,.dock.hi .h{opacity:1}' +
    '.h svg{width:19px;height:19px}' +
    '.tools button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}' +
    'button:active{transform:scale(.92)}' +
    'button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}' +
    'svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.t[data-m="dark"] svg path{fill:currentColor;stroke-width:1.2}' +
    '.t[data-m="auto"] svg .sl{stroke-width:1.4;opacity:.7}' +
    '.f{font:700 13px/1 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.02em;white-space:nowrap}' +
    '.f[data-l="1"]{font-size:14.5px}.f[data-l="2"]{font-size:16px}' +
    '.f small{font-size:.8em;font-weight:600;opacity:.75}' +
    '@keyframes sw{from{opacity:0;transform:rotate(-45deg) scale(.7)}}' +
    '.t.sw svg{animation:sw .26s cubic-bezier(.2,.9,.3,1.2)}' +
    '@media (prefers-reduced-motion:reduce){.tools,.dock.on .tools,.h,button{transition:none}.t.sw svg{animation:none}button:active{transform:none}}';
  function buildDock() {
    if (dock) return;
    var host = d.createElement('div'); host.id = 'jc-imm-dock'; host.setAttribute('data-jc-ignore', '');
    host.style.cssText = 'position:fixed!important;z-index:2147482500!important;left:0;top:0;width:0;height:0;overflow:visible';
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    sr.innerHTML = '<style>' + DOCK_CSS + '</style><div class="dock" role="toolbar" aria-label="집중 보기 도구함" hidden>' +
      '<div class="tools"><button class="f" type="button"></button><button class="t" type="button"></button><button class="i" type="button"></button></div>' +
      '<button class="h" type="button" aria-expanded="false" aria-label="집중 보기 도구 펼치기" title="집중 보기 도구 (Esc로 끝내기)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></svg></button></div>';
    d.body.appendChild(host);
    dock = { host: host, sr: sr, el: sr.querySelector('.dock'), h: sr.querySelector('.h') };
    wireButtons(sr); hosts.push(sr);
    dock.el.addEventListener('focusin', function () { wake(); });
    dock.el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') wake(true); });
    dock.el.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') wake(); });
    // 연한 상태에서 누른 첫 손길은 펼치기만 한다. 펼쳐진 뒤 손잡이를 다시 누르면 접는다.
    dock.el.addEventListener('click', function (e) {
      if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); return; }
      if (e.target.closest && e.target.closest('.h')) { e.stopPropagation(); sleep(); dock.h.blur(); }
    }, true);
    applyTheme();
  }
  function markerUi() { return d.getElementById('jc-marker-ui'); }
  function markerFab() { var m = markerUi(); return m && m.shadowRoot ? m.shadowRoot.querySelector('.fab') : null; }
  function placeDock() {
    if (!dock) return;
    var fab = markerFab(), r = fab && fab.getBoundingClientRect(), vh = window.innerHeight, vw = d.documentElement.clientWidth;
    // 형광펜 도구함 버튼이 있으면 같은 줄, 그 왼쪽에 앉는다(본문 옆을 세로로 가리지 않게)
    if (r && r.width) {
      dock.el.style.setProperty('--b', Math.max(6, Math.round(vh - r.bottom + (r.height - 40) / 2)) + 'px');
      var fr = parseFloat(getComputedStyle(fab).right) || 16; // 버튼이 가장자리로 물러나 있어도 제자리 기준으로 잡는다
      dock.el.style.setProperty('--r', Math.round(fr + r.width + 8) + 'px');
    } else { dock.el.style.removeProperty('--b'); dock.el.style.removeProperty('--r'); }
    var a = dock.h.getBoundingClientRect();
    zone = { l: a.left - 80, t: a.top - 80, r: (r && r.width ? Math.max(a.right, r.right) : a.right) + 80, b: a.bottom + 80 };
  }
  function setAwake(on) {
    awake = on;
    if (dock) { dock.el.classList.toggle('on', on); dock.h.setAttribute('aria-expanded', String(on)); if (on) dock.el.classList.remove('hi'); }
    var m = markerUi(); if (m) { if (immersive && !on) m.setAttribute('data-jc-idle', ''); else m.removeAttribute('data-jc-idle'); }
  }
  function wake(hold) {
    clearTimeout(sleepT);
    if (!awake) setAwake(true);
    if (!hold) sleepT = setTimeout(function () { if (!dock || !dock.el.matches(':hover')) setAwake(false); else wake(); }, IDLE_MS);
  }
  function sleep() { clearTimeout(sleepT); if (awake) setAwake(false); }
  function inPath(e, el) { var p = e.composedPath ? e.composedPath() : []; return !!el && p.indexOf(el) >= 0; }
  function onDown(e) {
    if (!immersive || !dock) return;
    if (inPath(e, dock.host)) {
      if (!awake && e.pointerType !== 'mouse') eatClick = true;
      else eatClick = false;
      wake();
    } else if (inPath(e, markerUi())) wake();
    else { eatClick = false; sleep(); }
  }
  function onMove(e) {
    if (e.pointerType !== 'mouse' || moveRaf || !zone) return;
    var x = e.clientX, y = e.clientY;
    moveRaf = requestAnimationFrame(function () {
      moveRaf = 0;
      if (!immersive || !zone) return;
      var near = x >= zone.l && x <= zone.r && y >= zone.t && y <= zone.b;
      if (near && !awake) wake(); // 멀어지면 잠깐 뒤 스스로 연해진다
    });
  }
  function onKey(e) {
    if (!immersive || e.key !== 'Escape' || e.defaultPrevented) return;
    // 집중 보기를 먼저 끝낸다(서재의 읽기 책상처럼 Esc로 닫히는 창은 그다음 Esc에 닫힌다)
    e.preventDefault(); e.stopImmediatePropagation(); setImmersive(false);
  }
  function fsEl() { return d.fullscreenElement || d.webkitFullscreenElement || null; }
  function fsEnter() {
    if (cfg().fullscreen === false) return;
    var fn = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!fn || fsEl()) return;
    try { var p = fn.call(root, { navigationUI: 'hide' }); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function fsExit() {
    if (!fsEl()) return;
    var fn = d.exitFullscreen || d.webkitExitFullscreen;
    try { var p = fn && fn.call(d); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  var fsWas = false;
  function onFs() {
    var now = !!fsEl();
    if (fsWas && !now && immersive) setImmersive(false); // 기기에서 전체 화면을 끝내면(Esc·뒤로) 집중 보기도 끝낸다
    fsWas = now;
    if (immersive) setTimeout(placeDock, 120);
  }
  var bound = false;
  function bind() {
    if (bound) return; bound = true;
    d.addEventListener('pointerdown', onDown, true);
    d.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey, true);
    d.addEventListener('fullscreenchange', onFs); d.addEventListener('webkitfullscreenchange', onFs);
    var re = function () { if (immersive) placeDock(); };
    window.addEventListener('resize', re); window.addEventListener('orientationchange', re);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', re);
  }
  function setImmersive(on) {
    on = !!on;
    if (on === immersive) return;
    immersive = on;
    if (on) {
      buildDock(); bind();
      markAll();
      root.setAttribute('data-jc-imm', 'on');
      dock.el.hidden = false;
      fsEnter();
      placeDock();
      setAwake(false); dock.el.classList.add('hi'); // 펼치지 않고 손잡이만 잠깐 또렷하게 보여 자리를 알린다
      setTimeout(function () { if (dock) dock.el.classList.remove('hi'); }, 2200);
      setTimeout(placeDock, 400); setTimeout(placeDock, 2300); // 형광펜 버튼이 바닥 막대를 비켜 앉았다가 내려오는 것을 따라간다
    } else {
      clearTimeout(sleepT); eatClick = false;
      root.removeAttribute('data-jc-imm');
      unmark();
      if (dock) dock.el.hidden = true;
      setAwake(false);
      fsExit();
    }
    paint();
    try { window.dispatchEvent(new CustomEvent('jc-immersive', { detail: { on: on } })); } catch (e) {}
    window.dispatchEvent(new Event('resize')); // 높이를 재는 화면(책 넘김, 고정 차례)이 다시 맞추도록
  }

  /* ---------- 시작 ---------- */
  function start() {
    if (typeof window.JC_FS_SKIP === 'string') skip = window.JC_FS_SKIP.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    design();
    mountAll();
    pop();
    applyTheme();
    applyFont();
    // 스타일이 새로 생기거나(Tailwind 실행형 등) 화면이 다시 그려지면 다시 적용한다.
    if (window.MutationObserver) {
      new MutationObserver(function (ms) {
        var again = false;
        for (var i = 0; i < ms.length; i++) {
          var m = ms[i];
          if (m.target.nodeName === 'STYLE') { again = true; break; }
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeName === 'STYLE' || n.nodeName === 'LINK') { again = true; break; }
            if (n.nodeType === 1 && level() && (n.hasAttribute('style') || n.querySelector('[style]'))) again = true;
            if (n.nodeType === 1 && (n.hasAttribute('data-jc-prefs') || n.querySelector('[data-jc-prefs]'))) mountAll();
          }
          if (again) break;
        }
        if (again) rescale();
      }).observe(d.documentElement, { childList: true, subtree: true });
    }
    setInterval(applyTheme, 60000);
    d.addEventListener('visibilitychange', function () { if (!d.hidden) applyTheme(); });
    window.addEventListener('storage', function (e) {
      if (e.key === FK && e.isTrusted) { applyFont(); paint(); }
      if ((e.key === TK || e.key === NK) && e.isTrusted) { applyTheme(); paint(); }
    });
    window.addEventListener('load', rescale);
  }
  window.JCPrefs = {
    setMode: setMode, setLevel: setLevel, mode: mode, level: level, rescale: rescale,
    immersive: { on: function () { setImmersive(true); }, off: function () { setImmersive(false); }, toggle: function () { setImmersive(!immersive); },
      active: function () { return immersive; }, refresh: function () { if (immersive) { unmark(); markAll(); placeDock(); } } }
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
