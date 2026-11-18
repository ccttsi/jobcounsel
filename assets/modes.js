/* modes.js — 대문의 시드(11) · 매치(12) 모드 전환 경험 (2026-11-17, 2026-11-18 R3)
 *
 * 트리거 두 가지
 *   ① 롤링 화면: 반원 다이얼 오른쪽 슬롯 레버 — 1차(2시→1시 장전) → 2차(1시→6시 회전 & 글래스 + 롤링 회전)
 *   ② 목록 화면: 쪽수 아래 심전도 파동 — 1차(심박 1초) → 2차(거친 파형으로 마구 뛰다 + 글래스)
 * 2분마다 반쯤만 작동하는 아이들 힌트(레버 5칸 래칫·심전도 기호 모핑)로 "이게 트리거"임을 알린다(장전·오버레이 중이면 건너뛴다).
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

  /* ---------- 심전도 방치 유도: 2분마다 다른 기호 4개로 모핑하는 5가지 정형 패턴(10분 주기) ----------
   * 기호는 모두 **점 36개짜리 한붓그리기 path**로 미리 정규화해 두었다. SMIL이 점과 점만 이어 그리므로
   * CPU 보간이 필요 없고, 어떤 기호에서 어떤 기호로도 이음매 없이 구부러진다(2초 모핑 = 4기호 × 0.5초).
   * 색은 기호마다 함께 바뀐다(자료실 팔레트: 청록·벽돌·황토·자주). 5패턴을 10분에 한 바퀴 돌고 다시 1번부터. */
  var ECG_SHAPES = {
    star: 'M22.00 4.00 L22.82 6.21 L23.63 8.42 L24.45 10.63 L25.88 11.99 L28.23 12.09 L30.59 12.18 L32.94 12.27 L31.93 13.46 L30.08 14.92 L28.23 16.38 L26.88 18.00 L27.52 20.27 L28.16 22.53 L28.80 24.80 L27.88 24.92 L25.92 23.62 L23.96 22.31 L22.00 21.00 L20.04 22.31 L18.08 23.62 L16.12 24.92 L15.20 24.80 L15.84 22.53 L16.48 20.27 L17.12 18.00 L15.77 16.38 L13.92 14.92 L12.07 13.46 L11.06 12.27 L13.41 12.18 L15.77 12.09 L18.12 11.99 L19.55 10.63 L20.37 8.42 L21.18 6.21 Z',
    heart: 'M22.00 10.40 L22.73 8.21 L24.17 6.41 L26.13 5.19 L28.39 4.75 L30.67 5.14 L32.68 6.29 L34.18 8.03 L35.00 10.19 L34.98 12.50 L34.15 14.66 L32.87 16.59 L31.28 18.28 L29.56 19.86 L27.80 21.37 L26.06 22.91 L24.39 24.53 L22.93 26.33 L22.00 28.44 L21.07 26.33 L19.61 24.53 L17.94 22.91 L16.20 21.37 L14.44 19.86 L12.72 18.28 L11.13 16.59 L9.85 14.66 L9.02 12.50 L9.00 10.19 L9.82 8.03 L11.32 6.29 L13.33 5.14 L15.61 4.75 L17.87 5.19 L19.83 6.41 L21.27 8.21 Z',
    inf: 'M22.00 16.00 L23.60 16.82 L25.21 17.61 L26.85 18.34 L28.54 18.96 L30.29 19.38 L32.08 19.46 L33.79 18.97 L35.05 17.72 L35.50 16.00 L35.05 14.28 L33.79 13.03 L32.08 12.54 L30.29 12.62 L28.54 13.04 L26.85 13.66 L25.21 14.39 L23.60 15.18 L22.00 16.00 L20.40 16.82 L18.79 17.61 L17.15 18.34 L15.46 18.96 L13.71 19.38 L11.92 19.46 L10.21 18.97 L8.95 17.72 L8.50 16.00 L8.95 14.28 L10.21 13.03 L11.92 12.54 L13.71 12.62 L15.46 13.04 L17.15 13.66 L18.79 14.39 L20.40 15.18 Z',
    dia: 'M22.00 3.00 L23.17 4.44 L24.33 5.89 L25.50 7.33 L26.67 8.78 L27.83 10.22 L29.00 11.67 L30.17 13.11 L31.33 14.56 L32.50 16.00 L31.33 17.44 L30.17 18.89 L29.00 20.33 L27.83 21.78 L26.67 23.22 L25.50 24.67 L24.33 26.11 L23.17 27.56 L22.00 29.00 L20.83 27.56 L19.67 26.11 L18.50 24.67 L17.33 23.22 L16.17 21.78 L15.00 20.33 L13.83 18.89 L12.67 17.44 L11.50 16.00 L12.67 14.56 L13.83 13.11 L15.00 11.67 L16.17 10.22 L17.33 8.78 L18.50 7.33 L19.67 5.89 L20.83 4.44 Z',
    moon: 'M28.36 26.18 L25.88 27.35 L23.20 27.92 L20.46 27.88 L17.80 27.22 L15.37 25.98 L13.27 24.21 L11.63 22.02 L10.53 19.51 L10.04 16.81 L10.18 14.07 L10.92 11.44 L12.25 9.04 L14.08 7.01 L16.33 5.44 L18.87 4.42 L21.58 4.02 L24.31 4.24 L26.92 5.08 L29.32 6.42 L31.67 7.84 L29.82 7.04 L27.12 6.62 L24.40 6.97 L21.92 8.11 L19.86 9.91 L18.40 12.23 L17.68 14.87 L17.74 17.60 L18.61 20.20 L20.17 22.45 L22.32 24.13 L24.86 25.14 L27.59 25.37 L30.26 24.80 L30.71 24.75 Z',
    bolt: 'M24.50 3.00 L23.41 4.66 L22.32 6.33 L21.23 7.99 L20.14 9.66 L19.05 11.32 L17.96 12.98 L16.87 14.65 L15.78 16.31 L15.57 17.50 L17.56 17.50 L19.55 17.50 L21.37 17.64 L20.97 19.58 L20.56 21.53 L20.15 23.48 L19.75 25.43 L19.34 27.37 L19.19 28.73 L20.33 27.10 L21.47 25.47 L22.61 23.84 L23.75 22.21 L24.89 20.58 L26.03 18.95 L27.18 17.32 L28.32 15.69 L29.46 14.06 L27.59 14.00 L25.60 14.00 L23.61 14.00 L22.98 12.83 L23.28 10.86 L23.59 8.90 L23.89 6.93 L24.20 4.97 Z'
  };
  var ECG_COLORS = ['#0f766e', '#b4532a', '#8f5f00', '#8a2f45'];
  var ECG_PATTERNS = [
    { s: ['star', 'heart', 'inf', 'dia'], c: [0, 1, 2, 3] },
    { s: ['heart', 'dia', 'moon', 'bolt'], c: [3, 0, 1, 2] },
    { s: ['inf', 'bolt', 'star', 'moon'], c: [2, 0, 3, 1] },
    { s: ['dia', 'moon', 'heart', 'inf'], c: [1, 3, 0, 2] },
    { s: ['bolt', 'inf', 'dia', 'star'], c: [0, 2, 3, 1] }
  ];
  var ecgStep = 0;

  var DWELL = 120;          /* 아이들 힌트 간격(초) — 5분 → 2분(2026-11-18 R3, 두 트리거 공통) */
  var ARM_IDLE = 9000;      /* 1차만 누른 채 두면 이만큼 뒤 조용히 풀린다 */

  var nav, ov, glass, slot, slotBtn, ecgRow, ecgBtn, cards = [], foot, back;
  var open = false, picking = false, armed = '', armT = 0, dwell = 0, timers = [], restFocus = null;

  /* ---------- 0. 정면 슬롯 레버 (2026-11-18 R4) ----------
   * 옆에서 본 팔의 각도 θ를 정면 화면에 3D→2D 원근 투영으로 그린다. 축(22,30.5)은 화면 안쪽을 향하고,
   *   손잡이 머리 y = 30 - 20·cos θ · 막대 길이 = 20.5·|cos θ| · 머리 크기 = 1 + 0.16·sin²θ
   * 이다. 상태가 바뀌어도 각도에서 각도로만 이어 가므로 중간에 끊기거나 튀지 않는다.
   *   · 1차(장전) 2시→1시: 짧은 감속 곡선(260ms)
   *   · 2차(격발) 1시→6시: 스프링(K=430, C=31)의 관성 곡선 하나로 6시까지 내려가 살짝 지나쳤다 안착(≈0.6s)
   *   · 방치 유도: 5칸 래칫으로 90ms 이동 + 90ms 정지를 다섯 번, 2초 정지, 같은 5칸 역방향(총 3.8s)
   * 움직이는 값은 손잡이 translate/scale과 막대 scaleY뿐이다(모두 transform). 다만 감속 모드에서는
   * 곡선 없이 결과 자세로 바로 간다. */
  var LV = { L: 19.5, th: 60, raf: 0, cap: null, shaft: null };
  function lvSet(th) {
    var a = th * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    LV.th = th;
    if (LV.cap) LV.cap.style.transform = 'translate3d(0,' + (LV.L * (1 - c)).toFixed(2) + 'px,0) scale(' + (1 + .16 * s * s).toFixed(3) + ')';
    if (LV.shaft) LV.shaft.style.transform = 'scaleY(' + c.toFixed(4) + ')';
  }
  function lvStop() { if (LV.raf) { cancelAnimationFrame(LV.raf); LV.raf = 0; } }
  function lvTween(to, ms) {
    lvStop();
    if (reduce() || !ms) { lvSet(to); return; }
    var from = LV.th, t0 = performance.now();
    function f(now) {
      var p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      lvSet(from + (to - from) * e);
      LV.raf = p < 1 ? requestAnimationFrame(f) : 0;
    }
    LV.raf = requestAnimationFrame(f);
  }
  /* 격발: 스프링이 6시(180°)를 향해 가속하고, 끝에서 살짝 지나쳤다 돌아와 무겁게 안착한다(≈0.8s).
     중간 각도에서 걸리는 구간이 없다 — 한 번의 연속 곡선이다. */
  function lvFire() {
    lvStop();
    if (reduce()) { lvSet(180); return; }
    var th = LV.th, v = 0, tgt = 180, last = 0, K = 46, C = 10.5;
    function f(now) {
      if (!last) last = now;
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      v += (K * (tgt - th) - C * v) * dt; th += v * dt;
      lvSet(th);
      if (Math.abs(tgt - th) > .05 || Math.abs(v) > 2) LV.raf = requestAnimationFrame(f);
      else { lvSet(tgt); LV.raf = 0; }
    }
    LV.raf = requestAnimationFrame(f);
  }
  /* 방치 유도: 손을 놓지 않은 채 5칸 래칫으로 3시 30분(105°)까지 내려갔다 2초 멈추고, 같은 5칸으로 2시에 돌아온다.
     한 칸 = 180ms(90ms 이동 + 90ms 정지). 롤링도 같은 박자로 5칸 정방향 → 5칸 역방향이다. */
  function lvHint() {
    lvStop();
    if (reduce()) { lvSet(60); return; }
    var S = [], t = 0, prev = 60, down = [69, 78, 87, 96, 105], i, to;
    for (i = 0; i < 5; i++) { S.push({ t: t, d: 90, a: prev, b: down[i] }); t += 180; prev = down[i]; }
    S.push({ t: t, d: 2900 - t, a: prev, b: prev }); t = 2900;
    for (i = 4; i >= 0; i--) { to = i ? down[i - 1] : 60; S.push({ t: t, d: 90, a: prev, b: to }); t += 180; prev = to; }
    var t0 = 0, end = t;
    function f(now) {
      if (!t0) t0 = now;
      var el = now - t0, th = 60, k, s, p;
      for (k = 0; k < S.length; k++) {
        s = S[k];
        if (el < s.t) { th = s.a; break; }
        if (el <= s.t + s.d) { p = s.d ? (el - s.t) / s.d : 1; p = p * p * (3 - 2 * p); th = s.a + (s.b - s.a) * p; break; }
        th = s.b;
      }
      lvSet(th);
      if (el < end) LV.raf = requestAnimationFrame(f); else { lvSet(60); LV.raf = 0; }
    }
    LV.raf = requestAnimationFrame(f);
  }

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
    if (ecgRow && ecgRow.getAttribute('data-st') === 'armed') ecgRow.removeAttribute('data-st');
    if (was === 'lever') lvTween(60, 340);          /* 장전을 풀면 2시로 천천히 돌아온다 */
    if (!keepWheel && was === 'lever' && nav && nav.spin) nav.spin(1, 240);
  }
  function arm(which) {
    if (armed === which) return true;
    disarm();
    armed = which; dwell = 0;
    (which === 'lever' ? slot : ecgRow).setAttribute('data-st', 'armed');
    if (which === 'lever') {
      lvTween(30, 260);                             /* 1차: 2시 → 1시 */
      if (nav && nav.spin) nav.spin(-1, 260);       /* 장전: 롤링을 한 칸 뒤로 감아 둔다 */
    }
    armT = setTimeout(disarm, ARM_IDLE);
    return false;
  }
  function leverTap() {
    if (cur() !== 'all' || open) return;
    if (arm('lever')) pullLever();
  }
  function ecgTap() {
    if (cur() !== 'all' || open) return;
    if (arm('ecg')) pulseEcg();
  }
  /* 당김 → 바퀴가 620ms 동안 빙글빙글 도는 것을 먼저 보여 주고, 560ms에 불투명 글래스가 페이드인한다. */
  function pullLever() {
    clearTimeout(armT); armed = '';
    slot.setAttribute('data-st', 'pulled');
    lvFire();                                            /* 스프링 하나로 1시 → 6시 */
    if (nav && nav.spin) nav.spin(12, 1200);              /* 감아 둔 한 칸을 풀고 여러 바퀴, 감속하며 정차 */
    setTimeout(function () { slot.removeAttribute('data-st'); lvTween(60, 420); }, 1340);
    openOv(slotBtn, reduce() ? 0 : 1060);
  }
  /* 2차(격발): 거친 파형이 0.28초에 한 번씩 마구 뛰는 것을 900ms 보여 준 뒤 무대가 페이드인한다.
     파형은 한 겹의 translate3d만 돌므로, 이 900ms 동안 새로 그리는 프레임이 0이다. */
  function pulseEcg() {
    clearTimeout(armT); armed = '';
    ecgRow.setAttribute('data-st', 'pulled');
    ecgSync();
    setTimeout(function () { ecgRow.removeAttribute('data-st'); ecgSync(); }, 1200);
    openOv(ecgBtn, reduce() ? 0 : 900);
  }
  /* ---------- 2. 아이들 힌트 (5분마다 반쯤) ---------- */
  function listOpen() { var lv = $('listView'); return !!lv && !lv.hidden; }
  function hint() {
    if (open || armed || picking || reduce() || cur() !== 'all' || document.hidden) return;
    if (listOpen()) {
      if (!ecgRow || !ecgRow.offsetParent) return;
      /* 3.8초: 앞 예고 물결 0.9초 → 기호 4개 모핑 2.0초(0.5초씩) → 뒤 예고 물결 0.9초 */
      var pat = ECG_PATTERNS[ecgStep % ECG_PATTERNS.length]; ecgStep++;
      var md = $('ecgMorphD'), mc = $('ecgMorphC'), shape = $('ecgShape');
      ecgRow.setAttribute('data-st', 'hint');
      if (md && mc && shape) {
        var d1 = ECG_SHAPES[pat.s[0]], d2 = ECG_SHAPES[pat.s[1]], d3 = ECG_SHAPES[pat.s[2]], d4 = ECG_SHAPES[pat.s[3]];
        md.setAttribute('values', [d1, d1, d2, d2, d3, d3, d4, d4, d4].join(';'));
        md.setAttribute('keyTimes', '0;0.16;0.25;0.41;0.5;0.66;0.75;0.91;1');
        mc.setAttribute('values', pat.c.map(function (k) { return ECG_COLORS[k]; }).join(';'));
        mc.setAttribute('keyTimes', '0;0.25;0.5;0.75');
        shape.setAttribute('d', d1);
        setTimeout(function () {                       /* 앞 예고가 끝나는 0.9초에 모핑 시작 */
          if (ecgRow.getAttribute('data-st') !== 'hint') return;
          try { md.beginElement(); mc.beginElement(); } catch (e) { }
        }, 900);
      }
      setTimeout(function () { if (ecgRow.getAttribute('data-st') === 'hint') ecgRow.removeAttribute('data-st'); }, 3820);
    } else {
      if (!slot || !slot.offsetParent) return;
      /* 격발과 다르게 손을 놓지 않고 천천히 당겼다 놓는다:
         2시 → 3시 30분까지 **5칸을 한 칸씩 딱딱 걸리며**(한 칸 180ms) 내려가 2초 멈췄다가,
         같은 5칸을 역방향으로 되감아 원래 자료 자리로 정확히 돌아온다. */
      slot.setAttribute('data-st', 'hint');
      lvHint();
      var hit = function (k, ms) {
        return setTimeout(function () {
          if (slot.getAttribute('data-st') !== 'hint') return;   /* 그새 격발했으면 건드리지 않는다 */
          if (nav && nav.spin) nav.spin(k, 130);
        }, ms);
      };
      for (var i = 0; i < 5; i++) hit(1, i * 180);              /* 내려가며 5칸 정방향 */
      for (var j = 0; j < 5; j++) hit(-1, 2900 + j * 180);      /* 3시 30분에서 2초 쉰 뒤 5칸 역방향 */
      setTimeout(function () { if (slot.getAttribute('data-st') === 'hint') slot.removeAttribute('data-st'); }, 3820);
    }
  }
  function tickDwell() {
    if (!ECG.on && ECG.cx && ecgWanted()) ecgSync();   /* 안전망: 흘러야 하는데 멈춰 있으면 켠다 */
    if (document.hidden || open || armed) return;
    if (++dwell >= DWELL) { dwell = 0; hint(); }
  }

  /* ---------- 2. 심전도 — 하나의 연속 파형 (2026-11-18 R4) ----------
   * 상태별로 SVG·애니메이션을 갈아끼우지 않고, 캔버스 168×34 하나에 rAF로 매 프레임 그린다.
   *   · 박동 위상 ph는 계속 흘러가기만 한다 — 상태가 바뀌어도 선이 리셋·절단되지 않는다.
   *   · 속도·진폭·톤은 목표값으로 lerp(≈200ms)해서 몃 박동에 걸쳐 부드럽게 변한다.
   *   · 파형 한 주기는 256칸 표(ECG_TAB)로 미리 계산해 둔다 — P·Q·R·S·T를 가우스로 엮은 모양.
   * 평상시 2.75초당 1회 · 진폭 R 7px / 장전 1.05초 · 1.16배 / 격발 0.42초 · 1.85배 + 박동마다 R 높이가 흔들린다.
   * 그리는 중에는 레이아웃·페인트가 없다(캔버스 한 층, 168×34 CSS px) */
  var ECG = { cv: null, cx: null, on: false, raf: 0, last: 0, dpr: 1,
    ph: 0, sp: .36, amp: 1, tone: 0, c1: [15, 118, 110], c2: [180, 83, 42] };
  var ECG_W = 168, ECG_H = 34, ECG_BASE = 20, ECG_BEAT = 84, ECG_R = 7;
  var ECG_T = { idle: { sp: .36, amp: 1, tone: 0 }, armed: { sp: .95, amp: 1.16, tone: .3 }, pulled: { sp: 2.4, amp: 1.85, tone: 1 } };
  var ECG_TAB = (function () {
    var t = new Float32Array(256), i, u, g = function (x, m, s, h) { var d = (x - m) / s; return h * Math.exp(-d * d); };
    for (i = 0; i < 256; i++) {
      u = i / 256;
      t[i] = g(u, .165, .030, .22) + g(u, .300, .012, -.16) + g(u, .345, .014, 1) + g(u, .390, .016, -.30) + g(u, .545, .055, .24);
    }
    return t;
  })();
  function ecgRGB(v, fb) {
    v = (v || '').trim();
    if (v.charAt(0) !== '#') return fb;
    if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
  }
  function ecgColors() {
    try {
      var cs = getComputedStyle(document.documentElement);
      ECG.c1 = ecgRGB(cs.getPropertyValue('--a1'), ECG.c1);
      ECG.c2 = ecgRGB(cs.getPropertyValue('--a2'), ECG.c2);
    } catch (e) { }
  }
  function ecgState() {
    var st = ecgRow ? ecgRow.getAttribute('data-st') : '';
    return ECG_T[st === 'pulled' ? 'pulled' : (st === 'armed' ? 'armed' : 'idle')];
  }
  function ecgFit() {
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (dpr !== ECG.dpr || ECG.cv.width !== Math.round(ECG_W * dpr)) {
      ECG.dpr = dpr;
      ECG.cv.width = Math.round(ECG_W * dpr);
      ECG.cv.height = Math.round(ECG_H * dpr);
      ECG.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  function ecgPaint() {
    var cx = ECG.cx; if (!cx) return;
    var amp = ECG_R * ECG.amp, tone = ECG.tone, x, pa, bi, u, uu, i0, fr, v, y, fr2;
    cx.clearRect(0, 0, ECG_W, ECG_H);
    cx.beginPath();
    for (x = 0; x <= ECG_W; x += .6) {
      pa = ECG.ph - (ECG_W - x) / ECG_BEAT; bi = Math.floor(pa); u = pa - bi;
      uu = u * 256; i0 = uu | 0; fr = uu - i0;
      v = ECG_TAB[i0] * (1 - fr) + ECG_TAB[(i0 + 1) & 255] * fr;
      if (tone > .02) { fr2 = ((bi * 2654435761) >>> 0) % 997 / 997; v *= 1 + (fr2 - .5) * .26 * tone; }   /* 거칠기: 박동마다 R 높이가 흔들린다 */
      y = ECG_BASE - v * amp;
      if (x === 0) cx.moveTo(0, y); else cx.lineTo(x, y);
    }
    cx.lineWidth = 1.6; cx.lineJoin = 'round'; cx.lineCap = 'round';
    cx.strokeStyle = 'rgb(' + Math.round(ECG.c1[0] + (ECG.c2[0] - ECG.c1[0]) * tone) + ',' +
      Math.round(ECG.c1[1] + (ECG.c2[1] - ECG.c1[1]) * tone) + ',' +
      Math.round(ECG.c1[2] + (ECG.c2[2] - ECG.c1[2]) * tone) + ')';
    cx.stroke();
  }
  function ecgFrame(now) {
    if (!ECG.on) return;
    var dt = ECG.last ? Math.min(.05, (now - ECG.last) / 1000) : 0; ECG.last = now;
    var t = ecgState(), k = 1 - Math.exp(-dt / .20), kt = 1 - Math.exp(-dt / .30);
    ECG.sp += (t.sp - ECG.sp) * k;
    ECG.amp += (t.amp - ECG.amp) * k;
    ECG.tone += (t.tone - ECG.tone) * kt;
    ECG.ph += ECG.sp * dt;
    ecgPaint();
    ECG.raf = requestAnimationFrame(ecgFrame);
  }
  function ecgStop() { ECG.on = false; if (ECG.raf) { cancelAnimationFrame(ECG.raf); ECG.raf = 0; } }
  function ecgWanted() {
    return !!(ECG.cx && ecgRow && ecgRow.offsetParent && !document.hidden && !open && !reduce() && cur() === 'all');
  }
  /* 감속 모드·가려진 화면: 루프 없이 지금 자세의 한 장만 그려 둔다 */
  function ecgStill() {
    if (!ECG.cx || !ecgRow || !ecgRow.offsetParent) return;
    var t = ecgState();
    ECG.sp = t.sp; ECG.amp = t.amp; ECG.tone = t.tone;
    if (!reduce()) { ECG.sp = .36; ECG.amp = 1; ECG.tone = 0; }
    ecgFit(); ecgPaint();
  }
  function ecgSync() {
    if (ecgWanted()) {
      if (ECG.on) return;
      ecgFit(); ecgColors();
      ECG.on = true; ECG.last = 0;
      ECG.raf = requestAnimationFrame(ecgFrame);
    } else { ecgStop(); ecgStill(); }
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
    ecgStop();                                  /* 글래스가 덮이면 파도도 세운다 */
    resetCards();
    ov.hidden = false;
    document.documentElement.setAttribute('data-jc-modeov', '');
    if (slotBtn) slotBtn.setAttribute('aria-expanded', 'true');
    if (ecgBtn) ecgBtn.setAttribute('aria-expanded', 'true');
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
    if (ecgBtn) ecgBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    resetCards();
    if (back2 !== false && restFocus && restFocus.focus && restFocus.offsetParent !== null) {
      try { restFocus.focus({ preventScroll: true }); } catch (e) { }
    } else if (back && back.offsetParent !== null) {
      try { back.focus({ preventScroll: true }); } catch (e) { }
    }
    restFocus = null;
    ecgSync();                                  /* 무대가 걷히면 파도를 다시 흘린다 */
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
  /* 고름: 고른 카드가 잠기는 한 박자(맞물림·색인 줄) 뒤에 **무대 전체를 한 번에** 페이드아웃한다.
     카드·오브제·글래스·바닥이 따로 사라지던 잔상과 프레임드랍을 없앴다(2026-11-18 밤).
     덱 화면은 **무대가 투명해진 뒤**【0.45s】에 세운다 — 덱을 만드는 한 프레임(33~50ms)이
     화면 변화가 없는 순간에 묻혀, 누를 때의 반응과 페이드가 끊기지 않는다. */
  function pick(m) {
    if (!open || picking) return;
    picking = true;
    var c = byMode(m); if (c) setStep(c, 2);       /* 시드: 색인 줄 · 매치: 잠금 표시 */
    if (reduce()) { apply(m); closeOv(false); return; }
    later(function () { ov.classList.add('a-pick'); }, 120);
    later(function () { apply(m); }, 450);            /* 무대가 투명해진 뒤에 덱을 세운다 — 덱 생성 프레임이 보이지 않는다 */
    later(function () { closeOv(false); }, 520);
  }
  function pickAll() {
    if (!open || picking) return;
    picking = true;
    if (reduce()) { apply('all'); closeOv(false); return; }
    ov.classList.add('a-pick');
    later(function () { apply('all'); }, 360);
    later(function () { closeOv(false); }, 430);
  }
  function apply(m) {
    if (nav && nav.applyMode) nav.applyMode(m);
  }
  function byMode(m) { for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-mode') === m) return cards[i]; return null; }

  /* ---------- 4. 붙이기 ---------- */
  function init() {
    nav = window.JC_NAV || null;
    ov = $('modeOv'); glass = $('modeGlass'); slot = $('slot'); slotBtn = $('slotBtn');
    ecgRow = $('ecgRow'); ecgBtn = $('ecgBtn'); back = $('modeBack');
    ECG.cv = $('ecgCv');
    if (ECG.cv) { try { ECG.cx = ECG.cv.getContext('2d'); } catch (e) { ECG.cx = null; } }
    ecgColors();
    LV.cap = $('leverCap'); LV.shaft = $('leverShaft'); lvSet(60);
    var seeds = document.querySelectorAll('.a-mode');
    for (var i = 0; i < seeds.length; i++) cards.push(seeds[i]);

    /* 개수 배지: 11 · 12 · 23 (섹터 개수는 장부에서 센다) */
    var c = (nav && nav.counts) ? nav.counts() : { all: 0, seed: 0, match: 0 };
    var cnt = { seed: $('seedCnt'), match: $('matchCnt') };
    if (cnt.seed) cnt.seed.textContent = c.seed + '칸';
    if (cnt.match) cnt.match.textContent = c.match + '칸';
    var fa = $('modeAllN'); if (fa) fa.textContent = c.all;

    if (slotBtn) slotBtn.addEventListener('click', leverTap);
    if (ecgBtn) {
      ecgBtn.addEventListener('click', ecgTap);
      /* 마우스에서는 올려 두기만 해도 1차 장전(심박 1초) — 내려가면 풀린다 */
      if (hoverOK()) {
        ecgBtn.addEventListener('mouseenter', function () { if (cur() === 'all' && !open && !armed) arm('ecg'); });
        ecgBtn.addEventListener('mouseleave', function () { if (armed === 'ecg') disarm(); });
      }
    }

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
      if (armed === 'ecg' && ecgRow && ecgRow.contains(t)) return;
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

    /* 다른 탭·가려진 화면에서는 심전도를 멈춘다(배터리·프레임 0) */
    function ecgPause() {
      if (document.hidden) document.documentElement.setAttribute('data-ecg-off', '');
      else document.documentElement.removeAttribute('data-ecg-off');
      ecgSync();
    }
    document.addEventListener('visibilitychange', ecgPause); ecgPause();

    /* 목록이 열리고 닫힐 때(index.html setList) 파형을 켜고 끈다 */
    document.addEventListener('jc-list', ecgSync);
    /* 테마가 바뀌면 파형 색을 다시 읽는다 */
    try {
      new MutationObserver(function (rec) {
        var theme = false;
        for (var i = 0; i < rec.length; i++) if (rec[i].attributeName === 'data-theme') theme = true;
        if (theme) ecgColors();
        requestAnimationFrame(function () { ecgSync(); });   /* 모드가 바뀌면(덱 → 대문) 파도를 다시 흘린다 */
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-jc-mode'] });
    } catch (e) { }
    window.addEventListener('resize', function () { if (!ECG.on) ecgStill(); });

    setInterval(tickDwell, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
