/* 대문 — 데일리 브리핑 소식 띠 (2026-11-24, 태화님 지시)
 * 오늘 브리핑(briefing/data/briefing.json, 피클이 매일 씀)의 카드 제목을 첫 마디로 줄여 한 건씩 왼쪽으로 넘긴다.
 * - 같은 자료실 안의 파일만 읽는다(외부 호출 0). 띠 자리(높이)는 처음부터 잡아 두어 아래 통찰이 늦게 밀리지 않게 하고,
 *   읽기에 실패하거나 카드가 없으면 띠를 통째로 감춘다(빈 칸 금지).
 * - 넘김: setTimeout 한 번 + transform 전이. 상시 루프 0. 정해진 바퀴(LAPS)를 돌면 멈추고 재생 단추로 다시 흐른다.
 * - 멈춤: 멈춤 단추 · 마우스를 올리거나 초점이 들어올 때 · 화면 밖 · 탭 숨김 · 모드 시트 · 집중 보기 · 감속 모드.
 * - 손으로: 띠를 좌우로 밀면 한 건씩 넘어간다.
 */
(function () {
  'use strict';
  var sec = document.getElementById('tick'); if (!sec) return;
  var vp = document.getElementById('tkVp'), track = document.getElementById('tkTrack');
  var nEl = document.getElementById('tkN'), tEl = document.getElementById('tkT'), dEl = document.getElementById('tkDate');
  var pz = document.getElementById('tkPause'), root = document.documentElement;
  var HOLD = 4600, LAPS = 3;
  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var items = [], N = 0, k = 0, steps = 0, timer = 0, due = 0, left = HOLD;
  var paused = false, hover = false, focus = false, vis = false, drag = null;

  function reduce() { return !!(mq && mq.matches); }
  function short(t) { t = String(t || '').trim(); var i = t.indexOf(' — '); return i > 6 ? t.slice(0, i) : t; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function build(d) {
    var cs = (d && d.cards || []).filter(function (c) { return c && c.id && c.title; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!cs.length) { sec.hidden = true; return; }
    var ed = d.edition || {}, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ed.date || '');
    if (m) dEl.textContent = (+m[2]) + '.' + m[3] + (ed.weekday ? ' ' + ed.weekday : '');
    N = cs.length; tEl.textContent = N;
    var one = function (c, clone) {
      var rg = c.region === 'global' ? '해외' : c.region === 'kr' ? '국내' : '';
      return '<li' + (clone ? ' aria-hidden="true"' : '') + '><a class="a-tk-i" href="./briefing/#' + encodeURIComponent(c.id) + '" data-visit="briefing"' +
        (clone ? ' tabindex="-1"' : '') + ' title="' + esc(c.title) + '">' + (rg ? '<i>' + rg + '</i>' : '') + '<span>' + esc(short(c.title)) + '</span></a></li>';
    };
    /* 끝에서 처음으로 이음매 없이 돌도록 한 벌을 더 붙인다(읽기 프로그램에는 숨김) */
    track.innerHTML = cs.map(function (c) { return one(c, false); }).join('') + cs.map(function (c) { return one(c, true); }).join('');
    items = [].slice.call(track.children);
    measure();
    /* 띠 폭이 바뀌거나(회전·창 크기) 글꼴이 늦게 와서 제목 폭이 바뀌면 다시 잰다 */
    var re = function () { measure(); place(true); };
    if (window.ResizeObserver) { var ro = new ResizeObserver(re); ro.observe(vp); ro.observe(track); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(re);
    watch(); go(0, true); schedule();
  }
  function measure() {
    /* 한 건이 띠 폭을 넘지 않게: 넘치는 제목은 두 줄로 접는다(전문은 title·브리핑 지면) */
    sec.style.setProperty('--tk-max', Math.max(180, vp.clientWidth - 24) + 'px');
  }
  /* 넘길 때마다 한 번만 잰다(프레임마다 재지 않는다). 사이 마름모(li::before)는 빼고 제목 첫 글자를 띠 왼쪽 끝에 앉힌다.
     띠 전체가 함께 옮겨져 있으므로 화면 좌표의 차이가 곧 거리다. */
  function off(i) {
    var a = items[i] && items[i].firstElementChild, a0 = items[0].firstElementChild;
    return a ? a.getBoundingClientRect().left - a0.getBoundingClientRect().left : 0;
  }
  function place(jump) {
    track.classList.toggle('is-jump', !!jump);
    track.style.transform = 'translate3d(' + (-off(k)) + 'px,0,0)';
    if (jump) { void track.offsetWidth; track.classList.remove('is-jump'); }
  }
  function go(i, jump) {
    k = i; place(jump || reduce());
    nEl.textContent = (k % N) + 1;
    if (k >= N) setTimeout(function () { if (k >= N) { k -= N; place(true); } }, reduce() ? 0 : 860);
  }
  function step(dir) {
    if (dir < 0 && k === 0) { k = N; place(true); }
    go(k + dir);
  }
  function canRun() {
    return !paused && !hover && !focus && !drag && vis && !document.hidden && !reduce() &&
      !root.hasAttribute('data-jc-modeov') && !root.hasAttribute('data-jc-imm');
  }
  function bar(on) {
    sec.classList.remove('is-run');
    if (on) { sec.style.setProperty('--tk-hold', left + 'ms'); void sec.offsetWidth; sec.classList.add('is-run'); }
  }
  function stop() { if (timer) { clearTimeout(timer); timer = 0; left = Math.max(400, due - Date.now()); } bar(false); }
  function schedule() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!canRun() || !N) { bar(false); return; }
    due = Date.now() + left; bar(true);
    timer = setTimeout(function () {
      timer = 0; left = HOLD; steps++;
      go(k + 1);
      if (steps >= N * LAPS) { setPaused(true); return; }
      schedule();
    }, left);
  }
  function restart() { left = HOLD; schedule(); }
  function setPaused(p) {
    paused = p; if (!p) steps = 0;
    var lb = p ? '소식 넘김 다시 시작' : '소식 넘김 멈추기';
    pz.setAttribute('aria-pressed', String(p)); pz.setAttribute('aria-label', lb); pz.title = lb;
    if (p) stop(); else restart();
  }
  function watch() {
    pz.addEventListener('click', function () { setPaused(!paused); });
    sec.addEventListener('mouseenter', function () { hover = true; stop(); });
    sec.addEventListener('mouseleave', function () { hover = false; schedule(); });
    track.addEventListener('focusin', function (e) {
      focus = true; stop();
      var li = e.target.closest('li'), i = items.indexOf(li); if (i >= 0 && i < N && i !== k) go(i);
    });
    track.addEventListener('focusout', function (e) { if (!track.contains(e.relatedTarget)) { focus = false; schedule(); } });
    /* 손으로 밀기: 가로로 28px 넘게 밀면 한 건. 세로 스크롤은 그대로(touch-action:pan-y) */
    vp.addEventListener('pointerdown', function (e) { if (e.button) return; drag = { x: e.clientX, y: e.clientY, moved: false }; stop(); });
    vp.addEventListener('pointermove', function (e) {
      if (!drag || drag.moved) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) { drag.moved = true; step(dx < 0 ? 1 : -1); }
    });
    var end = function () { if (!drag) return; var m = drag.moved; drag = null; if (m) { vp.dataset.swiped = '1'; setTimeout(function () { delete vp.dataset.swiped; }, 0); } restart(); };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    vp.addEventListener('click', function (e) { if (vp.dataset.swiped) { e.preventDefault(); e.stopPropagation(); } }, true);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { vis = es[es.length - 1].isIntersecting; vis ? schedule() : stop(); }).observe(sec);
    else vis = true;
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : schedule(); });
    try { new MutationObserver(function () { canRun() ? schedule() : stop(); }).observe(root, { attributes: true, attributeFilter: ['data-jc-modeov', 'data-jc-imm'] }); } catch (e) {}
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { canRun() ? schedule() : stop(); });
  }

  function load() {
    fetch('./briefing/data/briefing.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(build).catch(function () { sec.hidden = true; });
  }
  /* 첫 화면 그리기가 끝난 뒤에 받는다 */
  if (document.readyState === 'complete') setTimeout(load, 0);
  else window.addEventListener('load', function () { setTimeout(load, 0); });
})();
