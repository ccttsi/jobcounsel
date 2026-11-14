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
 */
(function () {
  'use strict';
  if (window.JCPrefs) return;
  var d = document, root = d.documentElement;
  var TK = 'jc-theme', FK = 'jc-font';
  var MODES = ['light', 'dark', 'auto'];
  var LABEL = { light: '밝게', dark: '어둡게', auto: '자동(오전 7시~오후 7시 밝게)' };
  var FS = [1, 1.15, 1.3], FS_LABEL = ['기본', '크게(40대)', '더 크게(50대)'];
  var CAP = 28; // px. 이보다 큰 글자는 키우지 않는다.

  function get(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function mode() { var m = get(TK, 'auto'); return MODES.indexOf(m) >= 0 ? m : 'auto'; }
  function level() { var n = +get(FK, 0); return n === 1 || n === 2 ? n : 0; }

  /* ---------- 테마 ---------- */
  function resolve(m) { if (m !== 'auto') return m; var h = new Date().getHours(); return h >= 7 && h < 19 ? 'light' : 'dark'; }
  function applyTheme() {
    var t = resolve(mode());
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    var meta = d.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#08090c' : '#faf6ef');
  }
  function setMode(m) {
    set(TK, m); applyTheme();
    // 각 페이지의 기존 테마 코드도 같은 값을 다시 읽게 한다(다른 탭에서 바꾼 것과 같은 신호).
    try { window.dispatchEvent(new StorageEvent('storage', { key: TK, newValue: m })); } catch (e) {}
    paint();
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
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sl" d="M20 4 4 20"/><circle cx="7.6" cy="7.6" r="2.3"/><path d="M7.6 2.6v1.2M7.6 11.4v1.2M2.6 7.6h1.2M11.4 7.6h1.2M4.1 4.1l.8.8M10.3 10.3l.8.8M4.1 11.1l.8-.8M10.3 4.9l.8-.8"/><path d="M20.6 17.4a4.2 4.2 0 0 1-5.4-5.4 4.4 4.4 0 1 0 5.4 5.4z"/></svg>'
  };
  var CSS = ':host{display:inline-flex;align-items:center;gap:2px;flex:none;vertical-align:middle;color:inherit}' +
    'button{all:unset;box-sizing:border-box;width:40px;height:40px;border-radius:12px;display:inline-grid;place-items:center;cursor:pointer;color:inherit;-webkit-tap-highlight-color:transparent}' +
    'button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}' +
    'button:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
    'svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.t[data-m="dark"] svg path{fill:currentColor;stroke-width:1.2}' +
    '.t[data-m="auto"] svg .sl{stroke-width:1.4;opacity:.7}' +
    '.f{font:700 13px/1 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.02em;white-space:nowrap}' +
    '.f[data-l="1"]{font-size:15px}.f[data-l="2"]{font-size:17.5px}' +
    '.f small{font-size:.8em;font-weight:600;opacity:.75}';
  var hosts = [];
  function mount(host) {
    if (host.__jc) return; host.__jc = true;
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    sr.innerHTML = '<style>' + CSS + '</style><button class="t" type="button"></button><button class="f" type="button"></button>';
    sr.querySelector('.t').addEventListener('click', function () { setMode(MODES[(MODES.indexOf(mode()) + 1) % 3]); });
    sr.querySelector('.f').addEventListener('click', function () { setLevel((level() + 1) % 3); });
    hosts.push(sr);
  }
  function paint() {
    var m = mode(), l = level();
    hosts.forEach(function (sr) {
      var t = sr.querySelector('.t'), f = sr.querySelector('.f');
      t.innerHTML = ICON[m]; t.dataset.m = m;
      t.setAttribute('aria-label', '화면 테마: ' + LABEL[m] + '. 누르면 ' + LABEL[MODES[(MODES.indexOf(m) + 1) % 3]].replace(/\(.*\)/, '') + '(으)로 바뀝니다');
      t.title = '화면 테마: ' + LABEL[m];
      f.innerHTML = '가<small>/a</small>'; f.dataset.l = String(l);
      f.setAttribute('aria-label', '글자 크기: ' + FS_LABEL[l] + '. 누르면 ' + FS_LABEL[(l + 1) % 3] + '(으)로 바뀝니다');
      f.title = '글자 크기: ' + FS_LABEL[l];
    });
  }
  function mountAll() { d.querySelectorAll('[data-jc-prefs]').forEach(mount); paint(); }

  /* ---------- 시작 ---------- */
  function start() {
    if (typeof window.JC_FS_SKIP === 'string') skip = window.JC_FS_SKIP.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    mountAll();
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
      if (e.key === TK && e.isTrusted) { applyTheme(); paint(); }
    });
    window.addEventListener('load', rescale);
  }
  window.JCPrefs = { setMode: setMode, setLevel: setLevel, mode: mode, level: level, rescale: rescale };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
