/* modes.js — 대문의 시드(11) · 매치(12) 모드 전환 경험 (2026-11-17)
 *
 * 트리거 두 가지
 *   ① 롤링 화면: 반원 다이얼 오른쪽 슬롯 레버 — 1차(장전) → 2차(당김 & 글래스 + 롤링 회전)
 *   ② 목록 화면: 쪽수 아래 동전        — 1차(세팅) → 2차(플립 & 날아오름 + 글래스)
 * 5분마다 반쯤만 작동하는 아이들 힌트로 "이게 트리거"임을 알린다(장전·오버레이 중이면 건너뛴다).
 * 2차로 고르면 블록을 따라 글래스가 빠지거나 내려가며 사라지고, 대문이 그 모드로 재구성된다.
 *
 * 모드 재구성은 index.html 안쪽 내비게이션이 맡는다(window.JC_NAV). 이 파일은 기계(트리거·오버레이·연출)만 다룬다.
 * 움직임은 transform·opacity만 쓰고, 감속 모드에서는 연출 없이 바로 결과로 간다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var hoverMQ = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : { matches: false };
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var DWELL = 300;          /* 아이들 힌트 간격(초) — 페이지를 보고 있는 시간만 센다 */
  var ARM_IDLE = 9000;      /* 1차만 누른 채 두면 이만큼 뒤 조용히 풀린다 */

  var nav, ov, glass, slot, slotBtn, coinRow, coinBtn, fly, cards = [], foot, back;
  var open = false, picking = false, armed = '', armT = 0, dwell = 0, timers = [], restFocus = null;

  function reduce() { return !!reduceMQ.matches; }
  function hoverOK() { return !!hoverMQ.matches; }
  function cur() { return (nav && nav.getMode && nav.getMode()) || 'all'; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }
  /* ---------- 1. 트리거 상태 ---------- */
  /* 장전만 푼다 — 발동(pulled)의 연출은 각자의 타이머가 끝까지 보여 준다.
     레버 장전을 풀면(바깥 클릭·ESC·타임아웃) 뒤로 감아 둔 롤링도 한 칸 되돌아온다. */
  function disarm(keepWheel) {
    var was = armed;
    clearTimeout(armT); armT = 0; armed = '';
    if (slot && slot.getAttribute('data-st') === 'armed') slot.removeAttribute('data-st');
    if (coinRow && coinRow.getAttribute('data-st') === 'armed') coinRow.removeAttribute('data-st');
    if (!keepWheel && was === 'lever' && nav && nav.spin) nav.spin(1, 240);
  }
  function arm(which) {
    if (armed === which) return true;
    disarm();
    armed = which; dwell = 0;
    (which === 'lever' ? slot : coinRow).setAttribute('data-st', 'armed');
    if (which === 'lever' && nav && nav.spin) nav.spin(-1, 260);   /* 장전: 롤링을 한 칸 뒤로 감아 둔다 */
    armT = setTimeout(disarm, ARM_IDLE);
    return false;
  }
  function leverTap() {
    if (cur() !== 'all' || open) return;
    if (arm('lever')) pullLever();
  }
  function coinTap() {
    if (cur() !== 'all' || open) return;
    if (arm('coin')) flipCoin();
  }
  /* 당김 → 바퀴가 620ms 동안 빙글빙글 도는 것을 먼저 보여 주고, 560ms에 불투명 글래스가 페이드인한다. */
  function pullLever() {
    clearTimeout(armT); armed = '';
    slot.setAttribute('data-st', 'pulled');
    if (nav && nav.spin) nav.spin(12, 1200);              /* 감아 둔 한 칸을 풀고 여러 바퀴, 감속하며 정차 */
    setTimeout(function () { slot.removeAttribute('data-st'); }, 1340);
    openOv(slotBtn, reduce() ? 0 : 1060);
  }
  /* 동전이 820ms 동안 회전하며 화면 위로 떠오른 뒤, 글래스는 800ms에 페이드인한다. */
  function flipCoin() {
    clearTimeout(armT); armed = '';
    coinRow.setAttribute('data-st', 'pulled');
    flyCoin();
    setTimeout(function () { coinRow.removeAttribute('data-st'); }, 1280);
    openOv(coinBtn, reduce() ? 0 : 1040);
  }
  function flyCoin() {
    if (reduce() || !coinBtn) return;
    var c = coinBtn.querySelector('.a-coin'); if (!c) return;
    var r = c.getBoundingClientRect();
    if (!fly) { fly = document.createElement('div'); fly.className = 'a-coinfly'; document.body.appendChild(fly); }
    var i = c.cloneNode(true);
    i.style.left = (r.left + r.width / 2) + 'px';
    i.style.top = (r.top + r.height / 2) + 'px';
    fly.appendChild(i);
    setTimeout(function () { if (i.parentNode) i.parentNode.removeChild(i); }, 1320);
  }

  /* ---------- 2. 아이들 힌트 (5분마다 반쯤) ---------- */
  function listOpen() { var lv = $('listView'); return !!lv && !lv.hidden; }
  function hint() {
    if (open || armed || picking || reduce() || cur() !== 'all' || document.hidden) return;
    if (listOpen()) {
      if (!coinRow || !coinRow.offsetParent) return;
      coinRow.setAttribute('data-st', 'hint');
      setTimeout(function () { if (coinRow.getAttribute('data-st') === 'hint') coinRow.removeAttribute('data-st'); }, 1600);
    } else {
      if (!slot || !slot.offsetParent) return;
      slot.setAttribute('data-st', 'hint');
      setTimeout(function () { if (slot.getAttribute('data-st') === 'hint') slot.removeAttribute('data-st'); }, 1300);
      if (nav && nav.spin) nav.spin(7, 900);               /* 몇 칸만 촤르르 */
    }
  }
  function tickDwell() {
    if (document.hidden || open || armed) return;
    if (++dwell >= DWELL) { dwell = 0; hint(); }
  }

  /* ---------- 3. 오버레이 ---------- */
  /* 카드에 바로 초점을 주면 열자마자 강조 테두리가 켜져 「네온 상자」처럼 보인다. 무대 자체에 초점을 둔다. */
  function focusFirst() {
    var c = ov && ov.querySelector('.a-modes-in');
    if (c && c.focus) { try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }
  }
  function openOv(src, delay) {
    if (open || !ov) return;
    open = true; picking = false; dwell = 0;
    restFocus = src || document.activeElement;
    disarm();
    clearTimers();
    if (delay) { later(revealOv, delay); return; }   /* 발동 연출을 먼저 보여 준 뒤 무대가 열린다 */
    revealOv();
  }
  function revealOv() {
    if (!open || !ov) return;
    resetCards();
    ov.hidden = false;
    document.documentElement.setAttribute('data-jc-modeov', '');
    if (slotBtn) slotBtn.setAttribute('aria-expanded', 'true');
    if (coinBtn) coinBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    if (reduce()) { ov.classList.add('a-open', 'a-in', 'a-settled'); focusFirst(); return; }
    requestAnimationFrame(function () { ov.classList.add('a-open'); });
    later(function () { ov.classList.add('a-in'); }, 90);                    /* 블록이 제자리로 */
    later(function () { ov.classList.add('a-settled'); }, 90 + 560);        /* 글자·도해가 따라온다 */
    later(focusFirst, 70);
  }
  function closeOv(back2) {
    if (!open || !ov) return;
    open = false; picking = false; clearTimers();
    ov.classList.remove('a-open', 'a-in', 'a-settled', 'a-pick', 'a-pick-seed', 'a-pick-match');
    ov.hidden = true;
    document.documentElement.removeAttribute('data-jc-modeov');
    if (slotBtn) slotBtn.setAttribute('aria-expanded', 'false');
    if (coinBtn) coinBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    resetCards();
    if (back2 !== false && restFocus && restFocus.focus && restFocus.offsetParent !== null) {
      try { restFocus.focus({ preventScroll: true }); } catch (e) { }
    } else if (back && back.offsetParent !== null) {
      try { back.focus({ preventScroll: true }); } catch (e) { }
    }
    restFocus = null;
  }
  function resetCards() {
    for (var i = 0; i < cards.length; i++) { cards[i].removeAttribute('data-step'); cards[i].classList.remove('a-on'); }
  }
  function resetOther(m) {
    for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-mode') !== m) cards[i].removeAttribute('data-step');
  }
  function setStep(card, n) {
    if (card.getAttribute('data-step') === String(n)) return;
    card.setAttribute('data-step', String(n));
  }
  function pick(m) {
    if (!open || picking) return;
    picking = true;
    var c = byMode(m); if (c) setStep(c, 2);       /* 시드: 투입구로 빨려 들어감 · 매치: 공 쏟아짐 */
    if (reduce()) { apply(m); closeOv(false); return; }
    later(function () { ov.classList.add('a-pick', 'a-pick-' + m); }, 150);
    later(function () { apply(m); }, 460);          /* 연출 뒤에서 미리 재구성해 둔다 */
    later(function () { closeOv(false); }, 820);
  }
  function pickAll() {
    if (!open || picking) return;
    picking = true;
    if (reduce()) { apply('all'); closeOv(false); return; }
    ov.classList.add('a-pick');
    later(function () { apply('all'); }, 260);
    later(function () { closeOv(false); }, 520);
  }
  function apply(m) {
    if (nav && nav.applyMode) nav.applyMode(m);
  }
  function byMode(m) { for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-mode') === m) return cards[i]; return null; }

  /* ---------- 4. 붙이기 ---------- */
  function init() {
    nav = window.JC_NAV || null;
    ov = $('modeOv'); glass = $('modeGlass'); slot = $('slot'); slotBtn = $('slotBtn');
    coinRow = $('coinRow'); coinBtn = $('coinBtn'); back = $('modeBack');
    var seeds = document.querySelectorAll('.a-mode');
    for (var i = 0; i < seeds.length; i++) cards.push(seeds[i]);

    /* 개수 배지: 11 · 12 · 23 (섹터 개수는 장부에서 센다) */
    var c = (nav && nav.counts) ? nav.counts() : { all: 0, seed: 0, match: 0 };
    var cnt = { seed: $('seedCnt'), match: $('matchCnt') };
    if (cnt.seed) cnt.seed.textContent = c.seed + '칸';
    if (cnt.match) cnt.match.textContent = c.match + '칸';
    var fa = $('modeAllN'); if (fa) fa.textContent = c.all;

    if (slotBtn) slotBtn.addEventListener('click', leverTap);
    if (coinBtn) coinBtn.addEventListener('click', coinTap);

    for (var k = 0; k < cards.length; k++) (function (card) {
      var m = card.getAttribute('data-mode');
      card.addEventListener('click', function (e) {
        if (open === false) return;
        e.preventDefault();
        if (card.getAttribute('data-step') === '1') { pick(m); return; }
        if (!card.getAttribute('data-step')) { resetOther(m); setStep(card, 1); }
      });
      if (hoverOK()) {
        card.addEventListener('mouseenter', function () {
          if (!open || picking) return;
          if (!card.getAttribute('data-step')) { resetOther(m); setStep(card, 1); }
        });
        card.addEventListener('mouseleave', function () {
          if (card.getAttribute('data-step') === '1') card.removeAttribute('data-step');
        });
      }
    })(cards[k]);

    var ma = $('modeAll'); if (ma) ma.addEventListener('click', pickAll);
    var mx = $('modeX'); if (mx) mx.addEventListener('click', function () { closeOv(); });
    if (back) back.addEventListener('click', function () { if (nav && nav.applyMode) nav.applyMode('all'); });
    if (ov) ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target === glass) closeOv();
    });

    /* 1차만 누른 채 다른 곳을 누르면 조용히 풀린다 */
    document.addEventListener('pointerdown', function (e) {
      if (!armed) return;
      var t = e.target;
      if (armed === 'lever' && slot && slot.contains(t)) return;
      if (armed === 'coin' && coinRow && coinRow.contains(t)) return;
      disarm();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (open && !picking) { e.preventDefault(); closeOv(); }
        else if (armed) { e.preventDefault(); disarm(); }
        return;
      }
      if (!open || e.key !== 'Tab') return;
      var f = [], all = ov.querySelectorAll('button');
      for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null) f.push(all[i]);
      if (!f.length) return;
      var at = f.indexOf(document.activeElement);
      if (e.shiftKey) { if (at <= 0) { e.preventDefault(); f[f.length - 1].focus(); } }
      else if (at === f.length - 1 || at < 0) { e.preventDefault(); f[0].focus(); }
    });

    setInterval(tickDwell, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
