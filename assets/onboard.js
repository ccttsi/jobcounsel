/* onboard.js — 대문 첫 화면 안내(온보딩) · 2026-11-22
 *
 * 세 장짜리 안내를 띄우고 닫는다. 겉모습은 assets/onboard.css, 내용은 index.html의 #onb 안에 있다.
 *
 * 뜨는 조건(태화님 지시 2026-11-22)
 *   · 로그인 상태(이 기기의 세션 열쇠 jc-sync-session 유지)면 뜨지 않는다 — <head>가 html[data-jc-onb]로 정한다.
 *   · 비로그인은 대문에 들어올 때마다 뜬다. 다만 이 탭에서 한 번 닫았으면(건너뛰기·완료·자료 열기)
 *     그 탭에서는 다시 뜨지 않는다(sessionStorage). 창을 새로 열면 다시 뜬다.
 *   · 대문의 「튜토리얼」 단추를 누르면 로그인 상태에서도 언제든 다시 연다.
 *
 * 장 넘김 — 이전·다음 단추, 점 인디케이터, 좌우로 밀기, ←/→ 키. ESC·「건너뛰기」로 닫는다.
 * 건너뛰기 단추는 머리 오른쪽 끝 한 곳에 고정되어 어느 장에서든 같은 자리에 있다.
 */
(function () {
  'use strict';
  var box = document.getElementById('onb');
  if (!box) return;
  var card = document.getElementById('onbCard'),
      bd = document.getElementById('onbBd'),
      slides = [].slice.call(bd.querySelectorAll('.a-onb-s')),
      stepNo = document.getElementById('onbStepNo'),
      skipB = document.getElementById('onbSkip'),
      prevB = document.getElementById('onbPrev'),
      nextB = document.getElementById('onbNext'),
      dots = [].slice.call(document.getElementById('onbDots').children),
      moreB = document.getElementById('onbTour'),
      headBtn = document.getElementById('tourBtn'),
      N = slides.length,
      KEY = 'jc-onb-session',
      open = false,
      step = 0,
      lastFocus = null,
      lockY = 0,
      snap = false,
      fixT = 0,
      tdx = 0, tdy = 0, tx = 0, ty = 0;
  if (!N) return;
  window.__onbReady = true;                 /* <head>의 안전장치(스크립트가 못 실리면 안내를 스스로 걷는다) */

  /* ---------- 한 장 보이기 ---------- */
  function show(i, keepScroll) {
    for (var k = 0; k < N; k++) {
      var on = (k === i);
      slides[k].hidden = !on;
      if (dots[k]) {
        if (dots[k].classList.contains('on') !== on) dots[k].classList.toggle('on', on);
        dots[k].setAttribute('aria-current', on ? 'step' : 'false');
        dots[k].tabIndex = on ? 0 : -1;
      }
    }
    stepNo.textContent = (i + 1) + ' / ' + N;
    prevB.disabled = (i === 0);
    nextB.textContent = (i === N - 1) ? '자료실 열기' : '다음';   /* 폭을 고정해 두어 바닥이 흔들리지 않는다 */
    if (!keepScroll) bd.scrollTop = 0;
  }
  function go(i) {
    if (i < 0 || i > N - 1 || i === step) return;
    step = i;
    show(step);
  }

  /* ---------- 카드 높이 못 박기 ----------
     장마다 글이 다르지만 카드 높이는 가장 긴 장에 맞춘다. 그래야 「다음」을 눌러도 카드 위·아래 경계와
     건너뛰기 단추가 1px도 움직이지 않는다(제5조 5-4·5-7). 화면이 작으면 카드 최대 높이 안에서 본문만 스크롤. */
  function fixH() {
    var i, max = 0, cur = step;
    bd.classList.remove('fit');          /* 잴 때는 가운데 정렬을 끈다(백분율 높이가 측정을 흔들지 않게) */
    bd.style.height = 'auto';
    for (i = 0; i < N; i++) {
      for (var k = 0; k < N; k++) slides[k].hidden = (k !== i);
      if (bd.scrollHeight > max) max = bd.scrollHeight;
    }
    show(cur, true);
    var hd = box.querySelector('.a-onb-hd'), ft = box.querySelector('.a-onb-ft');
    var chrome = (hd ? hd.offsetHeight : 0) + (ft ? ft.offsetHeight : 0) + 2;
    var room = Math.max(140, Math.round(Math.min(window.innerHeight * 0.82, 600) - chrome - 2));
    var want = Math.ceil(max);
    bd.style.height = Math.min(want, room) + 'px';
    /* 가장 긴 장이 다 들어가면 짧은 장은 가운데로 앉힌다(카드 아래 빈 띠 방지). 잘리는 장이 있으면 위에서부터. */
    bd.classList.toggle('fit', want <= room);
    bd.scrollTop = 0;
  }

  /* ---------- 뒤 화면 스크롤 잠금 ----------
     안내는 position:fixed다. 뒤 화면이 스크롤되면 카드가 덜덜 떨리므로 touchmove·wheel을 막고
     (카드 본문 안쪽 스크롤은 살린다) 자리가 어긋나면 같은 프레임에 되돌린다. */
  function inBody(t) { return !!(t && t.closest && t.closest('.a-onb-bd')); }
  function onTouch(e) { if (open && !inBody(e.target) && e.cancelable) e.preventDefault(); }
  function onWheel(e) { if (open && !inBody(e.target)) e.preventDefault(); }
  function onScroll() {
    if (!open || snap) return;
    if (Math.abs((window.pageYOffset || 0) - lockY) > 0.5) {
      snap = true;
      window.scrollTo(0, lockY);
      setTimeout(function () { snap = false; }, 90);
    }
  }
  function lock() {
    lockY = window.pageYOffset || 0;
    document.documentElement.setAttribute('data-jc-onblock', '');
    document.addEventListener('touchmove', onTouch, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function unlock() {
    document.documentElement.removeAttribute('data-jc-onblock');
    document.removeEventListener('touchmove', onTouch, { passive: false });
    document.removeEventListener('wheel', onWheel, { passive: false });
    window.removeEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 열기·닫기 ---------- */
  function openGate() {
    if (open || !N) return;
    open = true;
    lastFocus = document.activeElement;
    document.documentElement.setAttribute('data-jc-onb', '');   /* CSS가 판과 카드를 띄운다 */
    box.removeAttribute('aria-hidden');
    step = 0;
    show(0);
    fixH();
    lock();
    try { card.focus({ preventScroll: true }); } catch (e) { }
  }
  function closeGate() {
    if (!open) return;
    open = false;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { }   /* 이 탭에서는 다시 뜨지 않는다 */
    document.documentElement.removeAttribute('data-jc-onb');
    box.setAttribute('aria-hidden', 'true');
    unlock();
    try { (lastFocus && lastFocus.focus ? lastFocus : headBtn).focus({ preventScroll: true }); } catch (e) { }
  }

  /* ---------- 단추·점·키 ---------- */
  if (headBtn) headBtn.addEventListener('click', openGate);
  skipB.addEventListener('click', closeGate);
  prevB.addEventListener('click', function () { go(step - 1); });
  nextB.addEventListener('click', function () {
    if (step < N - 1) go(step + 1);
    else closeGate();
  });
  dots.forEach(function (d, k) {
    d.addEventListener('click', function () { go(k); });
  });
  /* 마지막 장 — 화면에서 한 곳씩 짚어 주는 둘러보기로 넘긴다(깊이 보려는 사람만) */
  if (moreB) moreB.addEventListener('click', function () {
    closeGate();
    if (window.JCTour) setTimeout(window.JCTour, 60);
  });
  /* 자료를 골라 나가면 안내는 끝난 것으로 본다 — 돌아왔을 때 다시 가로막지 않는다 */
  [].forEach.call(bd.querySelectorAll('a[href]'), function (a) {
    a.addEventListener('click', function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) { } });
  });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); closeGate(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); if (step < N - 1) go(step + 1); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); if (step > 0) go(step - 1); return; }
    if (k === 'Tab') {                                   /* 포커스가 뒤 화면으로 새지 않게 */
      var f = [skipB].concat(dots, [prevB, nextB, moreB]).filter(function (b) {
        return b && !b.disabled && !b.hidden && b.offsetParent !== null;
      });
      if (!f.length) return;
      var at = f.indexOf(document.activeElement), d = e.shiftKey ? -1 : 1;
      e.preventDefault();
      f[(at < 0 ? 0 : (at + d + f.length) % f.length)].focus();
      return;
    }
    if ((k === ' ' || k === 'Enter') && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (k === ' ' || k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();                                /* 뒤 화면 스크롤 잠금 */
    }
  });

  /* ---------- 좌우로 밀어 넘기기 ---------- */
  bd.addEventListener('touchstart', function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    tx = t.clientX; ty = t.clientY; tdx = 0; tdy = 0;
  }, { passive: true });
  bd.addEventListener('touchmove', function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    tdx = t.clientX - tx; tdy = t.clientY - ty;
  }, { passive: true });
  bd.addEventListener('touchend', function () {
    if (Math.abs(tdx) > 44 && Math.abs(tdx) > Math.abs(tdy) * 1.4) {
      if (tdx < 0) { if (step < N - 1) go(step + 1); } else { if (step > 0) go(step - 1); }
    }
    tdx = 0; tdy = 0;
  }, { passive: true });

  /* 창 크기·글꼴이 바뀌면 높이를 다시 잰다 */
  function refix() {
    if (!open) return;
    clearTimeout(fixT);
    fixT = setTimeout(fixH, 120);
  }
  window.addEventListener('resize', refix);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refix).catch(function () { });
  /* 로그인·로그아웃 — 로그인한 사람에게는 이 안내를 더 붙들지 않는다 */
  window.addEventListener('jc-sync-change', function () {
    if (open && document.documentElement.getAttribute('data-jc-auth') === 'in') closeGate();
  });

  /* ---------- 뜰 것인가 — <head>가 정한 표시를 따른다 ---------- */
  if (document.documentElement.hasAttribute('data-jc-onb')) openGate();
})();
