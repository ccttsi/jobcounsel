/* deckfab.js — 왼쪽 아래 카드덱 단추 + 덱 미니 스위처 (2026-11-20)
 *
 * 왜
 *   「상담 플로우 아키텍트를 자료 중 하나가 아니라 비서에 대칭되는 위치에, 불투명한 똑같은 디자인으로,
 *    카드덱 아이콘으로, 리다이렉트 되게 분리」 (태화님 지시).
 *   자료 목록(01~35)에서 빠진 ./flow/로 가는 길이 하나뿐이면 안 되므로, 이 단추는 **모든 지면**에 있다.
 *
 * 하는 일
 *   1) 카드덱 단추 — 오른쪽 아래 자료실 비서 단추(assets/assistant.js의 .jca-launch)를 거울처럼 뒤집은 자리·모양.
 *      누르면 ./flow/ 로 간다. 지금 /flow/ 안이거나 /mydeck/ 안이면 숨긴다(중복 동선 방지).
 *      집중 보기(html[data-jc-imm="on"])에서는 비서와 같이 숨는다.
 *   2) 덱 미니 스위처 — 마이덱에서 자료를 열고 들어온 경우에만(sessionStorage 'jc_active_deck',
 *      mydeck/deck-nav.js가 적어 둔다) 왼쪽 아래에 한 줄 슬림 바로 선다: 덱 이름 · 지금 자리 · 이전/다음 · 나가기.
 *      가운데를 누르면 덱 전체 단계 목록이 열려 1→5→3→4→2처럼 아무 데나 건너뛴다.
 *      덱 밖에서 일반 진입하면 아예 그리지 않는다.
 *
 * 지키는 것
 *   · 움직임은 transform·opacity만(§2). reduced-motion·집중 보기에서는 멈추거나 숨는다.
 *   · 화면 아래에 고정 띠(섹터의 바닥 메뉴·답변 타이머)가 있으면 그 위로 비켜 앉는다(--jcf-lift).
 *   · 서버를 부르지 않고, 무엇도 기기에 남기지 않는다(덱 문맥은 마이덱이 쓴 sessionStorage를 읽기만 한다).
 *   · 섹터 수·이름을 여기에 적지 않는다 — 장부(assets/tools.js JC_TOOLS · JC_APPS)에서 읽는다.
 */
(function () {
  'use strict';
  if (window.JCDeckFab) return;
  window.JCDeckFab = true;

  var d = document, root = d.documentElement;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var BASE = ME.replace(/assets\/deckfab\.js(\?.*)?$/, '');
  var FLOW = BASE + 'flow/';
  var DECK_KEY = 'jc_active_deck';
  var FLOW_FOLDER = 'flow', DECK_HOME = 'mydeck';

  /* ---------- 스타일 ---------- */
  if (!d.querySelector('link[data-jcf-css]')) {
    var link = d.createElement('link');
    link.rel = 'stylesheet';
    link.href = BASE + 'assets/deckfab.css';
    link.setAttribute('data-jcf-css', '');
    (d.head || root).appendChild(link);
  }

  /* ---------- 장부 ---------- */
  function tools() { return (window.JC_TOOLS || []).concat(window.JC_APPS || []); }
  function byId(id) {
    var a = tools();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  function hrefOf(t) {
    if (!t) return FLOW;
    return BASE + String(t.path || '').replace(/^\.\//, '');
  }
  /* 지금 화면이 어느 폴더인가 — 대문이면 '' */
  var BASEPATH = (function () { try { return new URL(BASE, location.href).pathname; } catch (e) { return '/'; } })();
  function folderNow() {
    var here = location.pathname;
    if (here.indexOf(BASEPATH) !== 0) return '';
    here = here.slice(BASEPATH.length).replace(/index\.html$/, '');
    return (here.split('/')[0] || '').toLowerCase();
  }
  function folderOf(t) {
    return String((t && t.path) || '').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase();
  }

  /* ---------- 덱 문맥 (마이덱이 적어 둔 것 — 읽기만 한다) ---------- */
  function context() {
    try {
      var o = JSON.parse(sessionStorage.getItem(DECK_KEY) || 'null');
      if (!o || !o.steps || !o.steps.length) return null;
      return o;
    } catch (e) { return null; }
  }
  function saveContext(o) {
    try { sessionStorage.setItem(DECK_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function dropContext() {
    try { sessionStorage.removeItem(DECK_KEY); } catch (e) {}
  }

  /* ---------- 뼈대 ---------- */
  var ICON_DECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9.6" y="3.2" width="10.4" height="13.2" rx="2.1"/>' +
    '<path d="M7.2 6.4H6a2 2 0 0 0-2 2v10.4a2 2 0 0 0 2 2h8.6a2 2 0 0 0 2-2v-1.2"/>' +
    '<path d="M12.6 7.4h4.4M12.6 10.6h4.4"/></svg>';
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

  var el = { fab: null, bar: null, panel: null, mid: null, name: null, pos: null, prev: null, next: null, list: null };
  var ctx = null, at = 0, built = false, open = false;

  function mk(tag, cls, html) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    if (built) return true;
    if (!d.body) return false;
    built = true;

    /* 1) 카드덱 단추 — 진짜 링크라 새 탭·키보드·미리 받기가 그대로 산다 */
    var a = mk('a', 'jcf-launch', ICON_DECK + '<span class="jcf-launch-x">상담 플로우</span>');
    a.href = FLOW;
    a.setAttribute('aria-label', '상담 플로우 아키텍트 열기 — 키워드로 상담 순서를 짭니다');
    d.body.appendChild(a);
    el.fab = a;

    /* 2) 덱 슬림 바 (덱 문맥이 있을 때만 보인다) */
    var bar = mk('div', 'jcf-bar');
    bar.hidden = true;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', '지금 짜고 있는 상담 덱 — 다른 자료로 건너뛰기');
    bar.appendChild(mk('span', 'jcf-bar-ic', ICON_DECK));
    var mid = mk('button', 'jcf-bar-mid');
    mid.type = 'button';
    mid.setAttribute('aria-haspopup', 'dialog');
    mid.setAttribute('aria-expanded', 'false');
    el.name = mk('b');
    el.pos = mk('i');
    mid.appendChild(el.name);
    mid.appendChild(el.pos);
    mid.addEventListener('click', function () { togglePanel(); });
    bar.appendChild(mid);
    el.mid = mid;

    el.prev = mk('button', 'jcf-bar-b');
    el.prev.type = 'button';
    el.prev.innerHTML = CHEV_L;
    el.prev.setAttribute('aria-label', '덱의 이전 단계');
    el.prev.addEventListener('click', function () { go(at - 1); });
    bar.appendChild(el.prev);

    el.next = mk('button', 'jcf-bar-b');
    el.next.type = 'button';
    el.next.innerHTML = CHEV_R;
    el.next.setAttribute('aria-label', '덱의 다음 단계');
    el.next.addEventListener('click', function () { go(at + 1); });
    bar.appendChild(el.next);

    var x = mk('button', 'jcf-bar-b jcf-bar-x');
    x.type = 'button';
    x.innerHTML = ICON_X;
    x.setAttribute('aria-label', '덱 걷어 두기 — 이 화면에서 덱 표시를 닫습니다(덱은 마이덱에 그대로 있습니다)');
    x.addEventListener('click', function () { leave(); });
    bar.appendChild(x);

    d.body.appendChild(bar);
    el.bar = bar;

    /* 3) 단계 전체 목록 — 어디로든 건너뛰기 */
    var p = mk('section', 'jcf-panel');
    p.hidden = true;
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', '덱 단계 고르기');
    var head = mk('div', 'jcf-p-head');
    el.pTitle = mk('b');
    el.pCount = mk('span');
    head.appendChild(el.pTitle);
    head.appendChild(el.pCount);
    p.appendChild(head);
    var ul = mk('div', 'jcf-p-list');
    ul.setAttribute('role', 'list');
    p.appendChild(ul);
    el.list = ul;
    var foot = mk('div', 'jcf-p-foot');
    var my = mk('a', null, '마이덱에서 보기');
    my.href = BASE + DECK_HOME + '/';
    foot.appendChild(my);
    var close = mk('button', null, '닫기');
    close.type = 'button';
    close.addEventListener('click', function () { togglePanel(false); });
    foot.appendChild(close);
    p.appendChild(foot);
    d.body.appendChild(p);
    el.panel = p;

    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open && !e.defaultPrevented) { togglePanel(false); }
    }, true);
    d.addEventListener('pointerdown', function (e) {
      if (!open) return;
      var t = e.target;
      if (t && (p.contains(t) || bar.contains(t))) return;
      togglePanel(false);
    }, true);

    paint();
    return true;
  }

  /* ---------- 그리기 ---------- */
  function paint() {
    if (!built) return;
    var folder = folderNow();
    var hideFab = folder === FLOW_FOLDER || folder === DECK_HOME;
    /* 집중 보기는 CSS가 숨긴다(html[data-jc-imm="on"]). 여기서는 중복 동선만 본다. */
    el.fab.hidden = hideFab;

    ctx = context();
    at = -1;
    if (ctx) {
      for (var i = 0; i < ctx.steps.length; i++) {
        if (folderOf(byId(ctx.steps[i].id)) === folder) { at = i; break; }
      }
    }
    var show = !!ctx && at >= 0 && folder !== '' && folder !== FLOW_FOLDER && folder !== DECK_HOME;
    if (!show) {
      el.bar.classList.remove('on');
      el.bar.hidden = true;
      togglePanel(false);
      return;
    }
    var name = String(ctx.name || '').trim() || '내 상담 덱';
    el.name.textContent = name;
    el.name.title = name;
    el.pos.textContent = (at + 1) + ' / ' + ctx.steps.length;
    el.mid.setAttribute('aria-label', name + ' — ' + ctx.steps.length + '단계 가운데 ' + (at + 1) + '단계. 눌러서 다른 단계 고르기');
    el.prev.disabled = at <= 0;
    el.next.disabled = at >= ctx.steps.length - 1;
    el.bar.hidden = false;
    /* 한 프레임 뒤에 켠다 — 처음 그릴 때 위로 튀지 않게 */
    requestAnimationFrame(function () { if (!el.bar.hidden) el.bar.classList.add('on'); });
  }

  function paintPanel() {
    if (!ctx) return;
    el.pTitle.textContent = String(ctx.name || '').trim() || '내 상담 덱';
    el.pCount.textContent = ctx.steps.length + '단계';
    el.list.innerHTML = '';
    ctx.steps.forEach(function (st, i) {
      var row = mk('button', 'jcf-p-row');
      row.type = 'button';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-current', String(i === at));
      var n = mk('span', 'n', String(i + 1));
      var t = mk('span', 't', st.title || st.id);
      t.title = st.title || st.id;
      row.appendChild(n);
      row.appendChild(t);
      if (i === at) row.setAttribute('aria-label', (i + 1) + '단계 ' + (st.title || st.id) + ' — 지금 보고 있는 단계');
      else row.setAttribute('aria-label', (i + 1) + '단계 ' + (st.title || st.id) + '로 건너뛰기');
      row.addEventListener('click', function () { go(i); });
      el.list.appendChild(row);
    });
  }

  function togglePanel(on) {
    if (on === undefined) on = !open;
    if (!ctx) on = false;
    open = on;
    if (on) { paintPanel(); el.panel.hidden = false; }
    el.mid.setAttribute('aria-expanded', String(on));
    requestAnimationFrame(function () {
      if (on) el.panel.classList.add('on');
      else {
        el.panel.classList.remove('on');
        setTimeout(function () { if (!open) el.panel.hidden = true; }, 190);
      }
    });
    if (on) {
      var cur = el.list.querySelector('[aria-current="true"]');
      if (cur && cur.focus) cur.focus({ preventScroll: true });
    } else if (el.mid && open === false) {
      /* 닫을 때 초점은 가운데 단추로 돌아온다(키보드가 허공에 남지 않게) */
      if (el.panel.contains(d.activeElement)) el.mid.focus({ preventScroll: true });
    }
  }

  /* ---------- 이동 ---------- */
  function go(i) {
    if (!ctx) return;
    if (i < 0 || i >= ctx.steps.length || i === at) return;
    var t = byId(ctx.steps[i].id);
    var o = {};
    for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) o[k] = ctx[k];
    o.index = i;
    o.at = Date.now();
    saveContext(o);
    location.href = hrefOf(t);
  }
  function leave() {
    dropContext();
    ctx = null;
    togglePanel(false);
    el.bar.classList.remove('on');
    setTimeout(function () { if (!ctx) el.bar.hidden = true; }, 190);
    if (el.fab && !el.fab.hidden) el.fab.focus({ preventScroll: true });
  }

  /* ---------- 화면 아래 고정 띠 위로 비켜 앉기 ----------
   * 섹터가 바닥에 두는 띠(예: 이론 위키의 5칸 메뉴, 면접의 답변 시간 판)는 높이가 제각각이다.
   * 단추와 바가 그 띠를 덮으면 그 띠의 단추를 누를 수 없다 — 아래 가장자리에서 띠를 찾아 그 높이만큼 올린다.
   * (assets/marker.js의 lift()와 같은 방법. 다만 우리는 왼쪽·가운데만 본다 — 오른쪽은 비서·도구함 자리다.) */
  var liftT = 0;
  function lift() {
    var vh = window.innerHeight || 640, vw = window.innerWidth || 360;
    var xs = [0.42, 0.5, 0.6], l = 0, i, j;
    for (j = 0; j < xs.length; j++) {
      var list;
      try { list = d.elementsFromPoint(Math.round(vw * xs[j]), vh - 4) || []; } catch (e) { list = []; }
      for (i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || e === d.body || e === root) continue;
        if (e === el.bar || e === el.panel || (e.closest && e.closest('.jcf-bar,.jcf-panel,.jcf-launch'))) continue;
        var cs;
        try { cs = getComputedStyle(e); } catch (e2) { continue; }
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        var r = e.getBoundingClientRect();
        if (!r.height || r.height > vh * 0.35) continue;
        if (r.bottom < vh - 2) continue;
        l = Math.max(l, vh - r.top);
      }
    }
    l = Math.round(l);
    if (el.fab) {
      el.fab.style.setProperty('--jcf-lift', l + 'px');
      /* 띠 위로 올라간 때는 아래로 걸치지 않는다 — 걸친 부분이 그 띠의 단추를 덮으면 누를 수 없다 */
      el.fab.classList.toggle('is-lifted', l > 0);
    }
    if (el.bar) el.bar.style.setProperty('--jcf-lift', l + 'px');
    if (el.panel) el.panel.style.setProperty('--jcf-lift', l + 'px');
  }
  function later() { clearTimeout(liftT); liftT = setTimeout(function () { lift(); }, 120); }

  /* ---------- 시작 ---------- */
  function start() {
    /* 장부가 늦게 도착해도 된다 — 지금 없으면 이 화면에 tools.js를 한 번 받아 둔다 */
    if (!window.JC_TOOLS) {
      var s = d.createElement('script');
      s.src = BASE + 'assets/tools.js';
      s.async = true;
      s.onload = function () { paint(); };
      (d.head || root).appendChild(s);
    }
    build();
    lift();
    setTimeout(lift, 500);
    setTimeout(lift, 1400);
    window.addEventListener('resize', later);
    window.addEventListener('orientationchange', later);
    window.addEventListener('load', function () { setTimeout(lift, 60); });
    /* 테마·집중 보기가 바뀌면 다시 (숨김은 CSS가 하지만, 집중 보기를 나오면 다시 그려야 한다) */
    try {
      new MutationObserver(function () { paint(); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-jc-imm', 'data-jc-tone'] });
    } catch (e) {}
    /* 다른 탭이 덱을 바꾼 경우는 없다(문맥은 창 안에서만 산다) */
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.JCDeckFab = { refresh: function () { paint(); }, lift: lift };
})();
