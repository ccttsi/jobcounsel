/* 대문 — 데일리 브리핑 소식 띠 (2026-11-24, 태화님 지시: 「방송 하단 짧은 소식처럼 자연스럽게 흘러가게」)
 * 오늘 브리핑(briefing/data/briefing.json, 피클이 매일 씀)의 카드 제목을 첫 마디로 줄여 일정한 속도로 왼쪽으로 흘린다.
 * - 같은 자료실 안의 파일만 읽는다(외부 호출 0). 띠 자리(높이)는 처음부터 잡아 두어 아래 통찰이 늦게 밀리지 않게 하고,
 *   읽기에 실패하거나 카드가 없으면 띠를 통째로 감춘다(빈 칸 금지).
 * - 흐름: 같은 묶음 두 벌을 잇대고 CSS 애니메이션이 한 벌 폭만큼 민다(합성 단계 transform만, JS 프레임 루프 0).
 *   JS는 묶음 폭으로 길이(--tk-dur)만 정한다 → 화면 폭·글 길이와 무관하게 같은 읽기 속도(SPEED px/초).
 *   LAPS 바퀴를 돌면 멈추고(DESIGN §2-9 「3회 이내」), 재생 단추로 다시 흐른다.
 * - 멈춤: 멈춤 단추 · 마우스를 올리거나 초점이 들어올 때(CSS) · 누르고 있는 동안 · 화면 밖 · 탭 숨김 · 모드 시트 · 집중 보기.
 *   감속 모드에서는 흐르지 않고 손으로 옆으로 밀어 본다.
 */
(function () {
  'use strict';
  var sec = document.getElementById('tick'); if (!sec) return;
  var vp = document.getElementById('tkVp'), track = document.getElementById('tkTrack');
  var dEl = document.getElementById('tkDate'), pz = document.getElementById('tkPause'), root = document.documentElement;
  var SPEED = 46, LAPS = 3;
  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var cards = [], paused = false, ended = false, press = false, vis = false, setW = 0;

  function reduce() { return !!(mq && mq.matches); }
  function short(t) { t = String(t || '').trim(); var i = t.indexOf(' — '); return i > 6 ? t.slice(0, i) : t; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function one(c, clone) {
    var rg = c.region === 'global' ? '해외' : c.region === 'kr' ? '국내' : '';
    return '<li' + (clone ? ' aria-hidden="true"' : '') + '><a class="a-tk-i" href="./briefing/#' + encodeURIComponent(c.id) + '" data-visit="briefing"' +
      (clone ? ' tabindex="-1"' : '') + ' title="' + esc(c.title) + '">' + (rg ? '<i>' + rg + '</i>' : '') + '<span>' + esc(short(c.title)) + '</span></a></li>';
  }

  function build(d) {
    cards = (d && d.cards || []).filter(function (c) { return c && c.id && c.title; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!cards.length) { sec.hidden = true; return; }
    var ed = d.edition || {}, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ed.date || '');
    if (m) dEl.textContent = (+m[2]) + '.' + m[3] + (ed.weekday ? ' ' + ed.weekday : '');
    layout();
    var re = function () { var w = setW; layout(); if (Math.abs(w - setW) > 1) restart(); };
    if (window.ResizeObserver) new ResizeObserver(re).observe(vp);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(re);
    watch(); sync();
  }
  /* 한 벌이 띠 폭보다 짧으면(카드가 적은 날·넓은 화면) 같은 묶음을 되풀이해 한 벌을 띠보다 길게 만든다 — 빈 꼬리가 보이지 않게 */
  function layout() {
    var base = cards.map(function (c) { return one(c, false); }).join('');
    track.innerHTML = base;
    var reps = 1, w = track.scrollWidth;
    while (w > 0 && w * reps < vp.clientWidth + 40 && reps < 8) reps++;
    var setHtml = base;
    for (var r = 1; r < reps; r++) setHtml += cards.map(function (c) { return one(c, true); }).join('');
    track.innerHTML = setHtml + cards.map(function (c) { return one(c, true); }).join('').repeat(reps);
    setW = track.scrollWidth / 2;
    sec.style.setProperty('--tk-dur', Math.max(12, setW / SPEED).toFixed(2) + 's');
    sec.style.setProperty('--tk-laps', LAPS);
  }
  function canRun() {
    return !paused && !ended && !press && vis && !document.hidden && !reduce() &&
      !root.hasAttribute('data-jc-modeov') && !root.hasAttribute('data-jc-imm');
  }
  function sync() {
    sec.classList.add('is-flow');
    sec.classList.toggle('is-hold', !canRun());
  }
  function restart() {
    ended = false;
    sec.classList.remove('is-flow'); void track.offsetWidth; sync();
  }
  function label() {
    var p = paused || ended, lb = p ? '소식 흐름 다시 시작' : '소식 흐름 멈추기';
    pz.setAttribute('aria-pressed', String(p)); pz.setAttribute('aria-label', lb); pz.title = lb;
  }
  function watch() {
    pz.addEventListener('click', function () {
      if (ended) { paused = false; restart(); }
      else { paused = !paused; sync(); }
      label();
    });
    /* 안쪽 링크의 다른 애니메이션(공용 눌림 효과 등)이 끝나도 올라오므로 띠 자신의 흐름만 센다 */
    track.addEventListener('animationend', function (e) { if (e.target !== track || e.animationName !== 'tk-crawl') return; ended = true; label(); });
    /* 누르고 있는 동안 멈춘다(휴대폰에서 읽으려고 손가락을 대면 선다) */
    vp.addEventListener('pointerdown', function () { press = true; sync(); });
    var up = function () { if (!press) return; press = false; sync(); };
    vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up); vp.addEventListener('pointerleave', up);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { vis = es[es.length - 1].isIntersecting; sync(); }).observe(sec);
    else vis = true;
    document.addEventListener('visibilitychange', sync);
    try { new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-jc-modeov', 'data-jc-imm'] }); } catch (e) {}
    if (mq && mq.addEventListener) mq.addEventListener('change', sync);
    label();
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
