/* next.js — 섹터 아래의 「이어 보기」 한 줄
 *
 * 지금 보는 섹터와 주제가 이어지는 섹터를 본문(<main>) 바로 아래에 보여 준다.
 * 무엇과 무엇이 이어지는지는 assets/tools.js의 JC_LINKS(방향 없는 짝)에서 읽는다 — 여기에는 섹터 이름도 개수도 적지 않는다.
 * 짝의 상대는 자료(JC_TOOLS)뿐 아니라 앱(JC_APPS — 상담 플로우)일 수도 있다. 두 장부를 함께 읽어 이름을 찾는다.
 * assets/core.js가 대문이 아닌 화면에서 tools.js 다음에 불러온다. 집중 보기에서는 숨는다.
 * 색은 그 화면의 글자색에서 섞어 쓴다(shell.css와 같은 방식). 움직임 없음.
 * 2026-11-22(CP2): 위아래 여백 28/20·안쪽 14px → 16/8·10px — 이 줄이 섹터마다 화면 분량을 0.04~0.13화면씩 늘리던 것을 줄였다.
 */
(function () {
  'use strict';
  if (window.__jcNext) return; window.__jcNext = true;
  var d = document, base = (window.JCCore && window.JCCore.base) || '';
  var CSS = '.jc-next{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:16px auto 8px;padding-top:10px;box-sizing:border-box;' +
    'border-top:1px solid rgba(127,127,127,.22);border-top-color:color-mix(in srgb,currentColor 12%,transparent);letter-spacing:-.02em;line-height:1.3}' +
    '.jc-next-k{flex:none;margin-right:4px;font-size:12.5px;font-weight:700;opacity:.66}' +
    '.jc-next a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box;padding:0 13px;border-radius:10px;color:inherit;text-decoration:none;font-size:13px;font-weight:750;' +
    'border:1px solid rgba(127,127,127,.28);border-color:color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 3%,transparent);-webkit-tap-highlight-color:transparent}' +
    '.jc-next a:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
    '@media (hover:hover){.jc-next a:hover{background:color-mix(in srgb,currentColor 7%,transparent)}}' +
    /* 휴대폰(≤599px): CP2에서 한 줄 가로 밀기로 두었더니 화면 끝에서 칩이 잘려 «빠진 칩»처럼 보였다
       (2026-11-24 지적). 잘린 글자 대신 줄바꿈으로 내려 앉히고, 끝 칩이 화면 끝에 붙지 않게 오른쪽 여백을 준다. */
    '@media (max-width:599px){.jc-next{flex-wrap:wrap;padding-right:16px;row-gap:4px}.jc-next-k{flex:0 0 100%;margin:0 0 -4px}.jc-next a{max-width:100%;white-space:normal;word-break:keep-all}}' +
    '.jc-next-one{flex-wrap:nowrap;overflow-x:auto;margin:0;padding-top:8px;padding-bottom:8px;scrollbar-width:none;flex:none}.jc-next-one::-webkit-scrollbar{display:none}.jc-next-one a{flex:none;white-space:nowrap}.jc-next-one::after{content:"";flex:0 0 56px}' +
    'html[data-jc-imm] .jc-next{display:none}';
  function run() {
    var T = (window.JC_TOOLS || []).concat(window.JC_APPS || []), L = window.JC_LINKS;
    if (!T.length || !L || !base || d.querySelector('.jc-next')) return;
    var here = location.href.split(/[?#]/)[0]; if (here.indexOf(base) !== 0) return;
    var folder = here.slice(base.length).split('/')[0]; if (!folder) return;                      // 대문
    var me = null, i; for (i = 0; i < T.length; i++) if (String(T[i].path).replace(/^\.\/|\/$/g, '') === folder) me = T[i];
    if (!me) return;
    var ids = {}; L.forEach(function (p) { if (p[0] === me.id) ids[p[1]] = 1; else if (p[1] === me.id) ids[p[0]] = 1; });
    var list = T.filter(function (t) { return ids[t.id]; }); if (!list.length) return;
    var main = d.querySelector('main') || d.querySelector('[role="main"]'); if (!main || !main.parentNode) return;
    var st = d.createElement('style'); st.textContent = CSS; d.head.appendChild(st);
    var nav = d.createElement('nav'); nav.className = 'jc-next'; nav.setAttribute('aria-label', '이어 보기'); nav.setAttribute('data-jc-ignore', '');
    var k = d.createElement('span'); k.className = 'jc-next-k'; k.textContent = '이어 보기'; nav.appendChild(k);
    list.forEach(function (t) { var a = d.createElement('a'); a.href = base + String(t.path).replace(/^\.\//, ''); a.textContent = t.title; nav.appendChild(a); });
    // 화면 전체가 한 장으로 고정된 섹터(페이지가 스크롤되지 않음)는 한 줄로만 두고 옆으로 민다
    var shell = getComputedStyle(d.body).overflowY === 'hidden';
    if (shell) nav.className += ' jc-next-one';
    function place() {
      // 놓을 자리: 본문 바로 아래. 본문이 격자·가로 줄의 한 칸이면(목차 옆 본문 등) 그 줄 전체의 아래로 올라간다.
      var anchor = main;
      while (anchor.parentNode && anchor.parentNode !== d.body) {
        var pc = getComputedStyle(anchor.parentNode);
        if (/grid/.test(pc.display) || (/flex/.test(pc.display) && /^row/.test(pc.flexDirection))) anchor = anchor.parentNode; else break;
      }
      if (nav.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', nav);
      // 본문과 같은 폭·같은 여백 선에 맞춘다
      var cs = getComputedStyle(anchor);
      nav.style.maxWidth = cs.maxWidth && cs.maxWidth !== 'none' ? cs.maxWidth : '';
      nav.style.paddingLeft = cs.paddingLeft; nav.style.paddingRight = cs.paddingRight;
      // 이 줄이 화면 맨 끝이면, 아래에 떠 있는 도구함·메뉴에 가리지 않게 휴대폰에서만 아래를 띄운다
      if (!shell) {
        nav.style.marginBottom = '';
        var end = (d.scrollingElement || d.documentElement).scrollHeight - (nav.getBoundingClientRect().bottom + window.pageYOffset);
        if (window.innerWidth < 900 && end < 64) nav.style.marginBottom = '84px';
      }
    }
    place(); setTimeout(place, 1200); window.addEventListener('resize', place, { passive: true });
  }
  // 꾸밈(스타일)이 다 붙은 뒤에 자리를 잡는다
  if (d.readyState === 'complete') run(); else window.addEventListener('load', run, { once: true });
})();
