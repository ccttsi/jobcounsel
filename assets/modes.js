/* modes.js — 대문의 시드(11) · 매치(12) 모드 전환 경험 (2026-11-17, 2026-11-18 R3, 2026-11-19 R5)
 *
 * 트리거 두 가지
 *   ① 롤링 화면: 반원 다이얼 오른쪽 슬롯 레버 — 1차(2시→1시 장전) → 2차(1시→6시 회전 & 글래스 + 롤링 회전)
 *   ② 목록 화면: 쪽수 아래 심전도 파동 — 1차(심박 빨라짐) → 2차(거친 파형으로 마구 뛰다 + 글래스)
 * 2분마다 짝수분 00초에 5.0초 동안 작동하는 방치 유도(레버 5칸 래칫·심전도 한붓그리기)로 "이게 트리거"임을 알린다.
 * 방치 유도는 사용자가 만진 것으로 치지 않는다 — 끝나면 롤링이 그 자리에서 이어서 흐른다. 장전·오버레이 중이면 건너뛴다.
 *
 * 모드 재구성은 index.html 안쪽 내비게이션이 맡는다(window.JC_NAV). 이 파일은 기계(트리거·오버레이·연출)만 다룬다.
 * 움직임은 `transform`·`opacity`와 **캔버스 한 장**뿐이다(2026-11-19: SVG path/SMIL 제거). 감속 모드에서는 연출 없이 바로 결과로 간다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var hoverMQ = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : { matches: false };
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------- 심전도 방치 유도: 2분마다 다른 기호 4개로 모핑하는 5가지 정형 패턴(10분 주기) ----------
   * 기호는 모두 **점 36개짜리 한붓그리기 path**(viewBox 44×32, 중심 22,16)다. 방치 유도 때 캔버스가
   * 점과 점을 선형 보간해 그리므로, 어떤 기호에서 어떤 기호로도 이음매 없이 구부러진다(모양 하나당 0.9초).
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

  var ARM_IDLE = 9000;      /* 1차만 누른 채 두면 이만큼 뒤 조용히 풀린다 */
  var HINT_MS = 5000;       /* 방치 유도 길이 — 레버·심전도 둘 다 5.0초 */

  var nav, ov, glass, slot, slotBtn, ecgRow, ecgBtn, cards = [], foot, back;
  var open = false, picking = false, armed = '', armT = 0, timers = [], restFocus = null;

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
    if (LV.th === th) return;                 /* 같은 자세를 프레임마다 다시 쓰지 않는다(래칫 정지 구간 비용 0) */
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
  /* 방치 유도(5.0초, 2026-11-19): 손을 놓지 않은 채 5칸 래칫으로 3시 30분(105°)까지 내려갔다가
     같은 5칸으로 2시(60°)에 정확히 돌아온다. 롤링도 **보고 있던 자리에서** 같은 박자로 5칸 갔다가 되감긴다.
     한 칸 = 180ms(90ms 이동 + 90ms 정지) · 내려감 0~0.9초 · 멈춤 0.9~4.1초 · 올라옴 4.1~5.0초 = 5.0초 정각. */
  var HINT_DOWN = [69, 78, 87, 96, 105];
  function lvHint() {
    lvStop();
    if (reduce()) return false;
    var navi = (nav && nav.hintRollBegin) ? nav : null;
    if (!navi || !navi.hintRollBegin()) return false;   /* 롤링이 도는 중이면 방해하지 않는다 */
    var t0 = 0;
    function f(now) {
      if (!t0) t0 = now;
      var el = now - t0, th = 60, off = 0, i, k, from, to;
      if (el < 4100) {
        i = Math.min(4, Math.floor(el / 180));
        k = Math.min(1, (el - i * 180) / 90); k = k * k * (3 - 2 * k);
        from = i ? HINT_DOWN[i - 1] : 60; to = HINT_DOWN[i];
        th = from + (to - from) * k; off = i + k;
      } else if (el < HINT_MS) {
        i = Math.min(4, Math.floor((el - 4100) / 180));
        k = Math.min(1, (el - 4100 - i * 180) / 90); k = k * k * (3 - 2 * k);
        from = i ? HINT_DOWN[4 - i] : 105; to = i < 4 ? HINT_DOWN[3 - i] : 60;
        th = from + (to - from) * k; off = 5 - (i + k);
      } else {
        th = 60; off = 0;
      }
      lvSet(th);
      navi.hintRollTo(off);
      if (el < HINT_MS) { LV.raf = requestAnimationFrame(f); return; }
      lvSet(60); navi.hintRollTo(0); navi.hintRollEnd(); LV.raf = 0;
    }
    LV.raf = requestAnimationFrame(f);
    return true;
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
    cancelHint();
    disarm();
    armed = which;
    (which === 'lever' ? slot : ecgRow).setAttribute('data-st', 'armed');
    if (which === 'ecg') ECG.chg = 1;               /* 장전: 파형 위를 한 줄기 빛이 훑는다 */
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
  /* ---------- 2. 방치 유도 — 2분마다 짝수분 00초에 5.0초 ----------
   * 시각(Date)으로 다음 정각을 계산해 한 번씩 깨어난다. 1초마다 세던 방식은 드리프트가 쌓여 홀수분 50초에
   * 작동했다(2026-11-19 수정). 작동 중에는 사용자가 만진 것으로 치지 않고, 다 끝나면 롤링이 원래 자리에서
   * 이어서 흐른다. 장전·오버레이·가려진 화면·감속 모드에서는 거르고 다음 정각을 잡는다. */
  function listOpen() { var lv = $('listView'); return !!lv && !lv.hidden; }
  var hintOn = false, hintTimer = 0, hintEndT = 0;
  function cancelHint() {
    if (!hintOn) return false;
    hintOn = false;
    clearTimeout(hintEndT); hintEndT = 0;
    if (ecgRow && ecgRow.getAttribute('data-st') === 'hint') ecgRow.removeAttribute('data-st');
    if (slot && slot.getAttribute('data-st') === 'hint') slot.removeAttribute('data-st');
    HINT.on = false;
    if (LV.raf) { lvStop(); lvSet(60); }
    if (nav && nav.hintRollEnd) nav.hintRollEnd();
    ecgSync();
    return true;
  }
  function hint() {
    if (hintOn || open || armed || picking || reduce() || cur() !== 'all' || document.hidden) return false;
    if (listOpen()) {
      if (!ecgRow || !ecgRow.offsetParent) return false;
      var pat = ECG_PATTERNS[ecgStep % ECG_PATTERNS.length]; ecgStep++;
      HINT.on = true; HINT.t = 0; HINT.pat = pat;
      hintOn = true;
      ecgRow.setAttribute('data-st', 'hint');
      ecgSync();
    } else {
      if (!slot || !slot.offsetParent) return false;
      hintOn = true;
      slot.setAttribute('data-st', 'hint');
      if (!lvHint()) { cancelHint(); return false; }
    }
    /* 끝 시계는 시간표(hintTimer)와 다른 그릇에 둔다 — 다음 정각을 잡을 때 함께 지워지면 안 된다 */
    hintEndT = setTimeout(function () { if (hintOn) cancelHint(); }, HINT_MS + 40);
    return true;
  }
  /* 다음 「짝수분 00초」의 시각(ms). 이미 지난 정각은 잡지 않는다. */
  function nextEvenMinute(from) {
    var d = new Date(from); d.setSeconds(0, 0);
    var t = d.getTime();
    while (t <= from) t += 60000;
    if (new Date(t).getMinutes() % 2 !== 0) t += 60000;
    return t;
  }
  function scheduleHint() {
    clearTimeout(hintTimer); hintTimer = 0;
    var now = Date.now(), at = nextEvenMinute(now + 400);
    hintTimer = setTimeout(function () {
      hintTimer = 0;
      var late = Date.now() - at;
      /* 정각에서 -0.1~+3초 사이에 깨어났을 때만 작동한다(잠들었다 깨어난 탭은 건너뛴다) */
      if (late > -100 && late < 3000) hint();
      scheduleHint();
    }, Math.max(60, at - now));
  }

  /* ---------- 2. 심전도 — 캔버스 한 장의 연속 파형 + 방치 유도 한붓그리기 (2026-11-19 R5) ----------
   * 2026-11-19: SVG path의 `d` 문자열 재작성과 SMIL 모핑을 걷어내고 **캔버스 168×34 한 장**으로 통일했다.
   *   · 평상·장전·격발은 한 줄이 끊기지 않고 위상(ph) 그대로 이어지며 속도·진폭·굵기·톤이 변한다.
   *     평상 1.9초·2박동·1배·1.5px → 장전 0.62초·3박동·2.05배·2.4px+겹선+천장선 → 격발 0.26초·6.5박동·2.6배·2.7px.
   *   · 장전으로 넘어가면 0.9초 동안 한 줄기 빛이 파형을 왼쪽에서 오른쪽으로 훑고, R꼭대기마다 잔불이 튄다.
   *     위쪽에 천장 헤어라인이 나타나 R이 닿기 직전까지 차오른다 — 한 번 더 눌러 터뜨리고 싶게 하는 장치다.
   *   · 방치 유도(5.0초)도 같은 캔버스가 그린다: 파동이 가운데로 오므라들며(0.7초)
   *     한붓그리기 4개 모양으로 0.9초씩 구부러지고(3.6초), 다시 파동으로 풀린다(0.7초).
   *   · 프레임마다 DOM·SVG·레이아웃을 건드리지 않는다(캔버스 픽셀만). 감속 모드에서는 한 장만 그린다.
   */
  var ECG = { cv: null, cx: null, on: false, raf: 0, last: 0, dpr: 1,
    ph: 0, sp: 1 / 1.9, amp: 1, tone: 0, beat: 84, lw: 1.5, echo: 0, ceil: 0, chg: 0, arm: 0,
    c1: [15, 118, 110], c2: [180, 83, 42], c3: [162, 100, 0], dark: false };
  var ECG_W = 168, ECG_H = 34, ECG_BASE = 20, ECG_R = 8, ECG_CX = ECG_W / 2;
  /* 3단계: 주기(초/회) · 진폭(배) · 박동 폭(px — 작을수록 창 안에 박동이 다닥다닥 붙는다) · 색 톤(0=청록 … 1=벽돌)
     · 선 굵기 · 겹선(장전의 두 겹 박동) · 천장선(장전의 목표 헤어라인) */
  var ECG_T = {
    idle:   { sp: 1 / 1.9, amp: 1,    tone: 0,   beat: 84, lw: 1.5, echo: 0,   ceil: 0 },
    armed:  { sp: 1 / .62, amp: 2.05, tone: .5,  beat: 56, lw: 2.4, echo: .55, ceil: 1 },
    pulled: { sp: 1 / .26, amp: 2.6,  tone: 1,   beat: 26, lw: 2.7, echo: .18, ceil: 0 }
  };
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
      /* 파형의 세 색은 modes.css가 테마별로 정한다 — 평상 · 장전 · 격발 */
      ECG.c1 = ecgRGB(cs.getPropertyValue('--ecg-a'), ECG.c1);
      ECG.c3 = ecgRGB(cs.getPropertyValue('--ecg-b'), ECG.c3);
      ECG.c2 = ecgRGB(cs.getPropertyValue('--ecg-c'), ECG.c2);
      ECG.dark = document.documentElement.getAttribute('data-theme') === 'dark';
      /* 한붓그리기 기호 색: 어두운 테마에서는 종이 위 잉크색이 묻히므로 밝게 띄운다 */
      ECG_KC = (ECG.dark ? ['#2dd4bf', '#f4715e', '#fbbf24', '#e6a6c2'] : ECG_COLORS)
        .map(function (h) { return ecgRGB(h, [15, 118, 110]); });
    } catch (e) { }
  }
  var ECG_KC = [];
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
  /* 색은 세 정거장을 지난다 — 평상 청록(--a1) → 장전 황토(--a3) → 격발 벽돌(--a2).
     두 색만 섞으면 장전 중간이 탁한 올리브가 되므로, 채도가 살아 있는 황토를 경유한다. */
  function ecgTone(tone) {
    var a, b, p;
    if (tone <= .5) { a = ECG.c1; b = ECG.c3; p = tone * 2; } else { a = ECG.c3; b = ECG.c2; p = (tone - .5) * 2; }
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * p) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * p) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * p) + ')';
  }
  /* 파형 한 점의 y — 256칸 표를 선형 보간하고, 격발의 거칠기는 박동마다 R 높이를 흔든다 */
  function ecgY(x, ampMul) {
    var pa = ECG.ph - (ECG_W - x) / ECG.beat, bi = Math.floor(pa), u = pa - bi;
    var uu = u * 256, i0 = uu | 0, fr = uu - i0;
    var v = ECG_TAB[i0] * (1 - fr) + ECG_TAB[(i0 + 1) & 255] * fr;
    if (ECG.tone > .02) { var r = ((bi * 2654435761) >>> 0) % 997 / 997; v *= 1 + (r - .5) * (.26 + .22 * ECG.tone) * ECG.tone; }
    return ECG_BASE - v * ECG_R * ECG.amp * (ampMul || 1);
  }
  /* 가로 배율 kx: 1이면 창 전체를 흐르고, 작을수록 가운데로 오므라든다(방치 유도의 물결) */
  function ecgPath(cx, kx) {
    var stp = Math.max(.6, Math.min(1.7, ECG.beat / 50)), x, px;
    cx.beginPath();
    for (x = 0; x <= ECG_W + .01; x += stp) {
      px = ECG_CX + (x - ECG_CX) * kx;
      if (x === 0) cx.moveTo(px, ecgY(x, 1)); else cx.lineTo(px, ecgY(x, 1));
    }
  }
  /* R꼭대기 잔불 — 장전에서 박동이 지나간 자리에 작은 점이 잠깐 남는다 */
  function ecgSparks(cx) {
    var tone = ECG.tone, beat = ECG.beat, bi, x, age, a;
    for (bi = Math.floor(ECG.ph) - 2; bi <= Math.floor(ECG.ph) + 1; bi++) {
      x = ECG_W - (ECG.ph - (bi + .345)) * beat;
      if (x < 0 || x > ECG_W) continue;
      age = (ECG.ph - (bi + .345)) / ECG.sp;
      if (age < 0 || age > .34) continue;
      a = (1 - age / .34) * .8;
      cx.globalAlpha = a;
      cx.beginPath();
      cx.arc(x, ecgY(x, 1) - 2.6, 1.15 + .9 * (1 - age / .34), 0, 6.2832);
      cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function ecgPaint() {
    var cx = ECG.cx; if (!cx) return;
    cx.clearRect(0, 0, ECG_W, ECG_H);
    if (HINT.on) { ecgPaintHint(cx); return; }
    var main = ecgTone(ECG.tone);
    /* 장전: 천장 헤어라인 — R 꼭대기가 닿기 직전의 목표선.
       장전 3초 동안 4.6px → 2.6px로 내려와 「숨이 차오르고 있다」를 보여 주고,
       박동이 치솟을 때마다 그 선이 밝아진다(격발하면 이 선을 뚫는다). */
    if (ECG.ceil > .01) {
      var cy = 4.6 - 2 * ease(Math.min(1, ECG.arm / 3));
      var bp = ECG.ph - Math.floor(ECG.ph), bd = (bp - .345) / .075;
      var glow = Math.exp(-bd * bd);
      cx.save();
      cx.globalAlpha = (.22 + .55 * glow) * ECG.ceil; cx.strokeStyle = main; cx.lineWidth = 1;
      if (cx.setLineDash) cx.setLineDash([2, 3]);
      cx.beginPath(); cx.moveTo(6, cy); cx.lineTo(ECG_W - 6, cy); cx.stroke();
      cx.restore();
    }
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    /* 장전: 2.4px 위에 옅은 같은 선을 겹쳐 박동이 두 겹으로 아린다 */
    if (ECG.echo > .02) {
      cx.save(); cx.globalAlpha = .34 * ECG.echo; cx.strokeStyle = main;
      cx.lineWidth = Math.max(1, ECG.lw - .9); cx.translate(0, -2.4);
      ecgPath(cx, 1); cx.stroke(); cx.restore();
    }
    cx.lineWidth = ECG.lw; cx.strokeStyle = main;
    ecgPath(cx, 1); cx.stroke();
    /* 장전: 넘어간 직후 0.9초 동안 한 줄기 빛이 파형을 훑고 지나간다 */
    if (ECG.chg > 0) {
      var bw = 30, x0 = -bw + (ECG_W + bw) * ECG.chg;
      cx.save(); cx.beginPath(); cx.rect(x0, 0, bw, ECG_H); cx.clip();
      cx.globalAlpha = .9; cx.lineWidth = ECG.lw + 1.2;
      cx.strokeStyle = ecgTone(Math.min(1, ECG.tone + .45));
      ecgPath(cx, 1); cx.stroke(); cx.restore();
    }
    if (ECG.tone > .3) { cx.fillStyle = main; ecgSparks(cx); }
  }
  /* ---------- 방치 유도: 한붓그리기 기호 4개(점 36개)를 캔버스에서 직접 구부린다 ---------- */
  var HINT = { on: false, t: 0, pat: null };
  var SHAPE_PTS = {};
  function shapePts(name) {
    if (SHAPE_PTS[name]) return SHAPE_PTS[name];
    var m = (ECG_SHAPES[name] || '').match(/-?\d+(?:\.\d+)?/g) || [], a = [], i;
    for (i = 0; i + 1 < m.length; i += 2) a.push([+m[i], +m[i + 1]]);
    SHAPE_PTS[name] = a; return a;
  }
  function mixColor(a, b, p) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * p) + ',' + Math.round(a[1] + (b[1] - a[1]) * p) + ',' + Math.round(a[2] + (b[2] - a[2]) * p) + ')';
  }
  var SSC = 1.34;                       /* 한붓그리기 기호를 캔버스 34px 높이에 맞춰 키우는 배율 */
  function ease(p) { p = p <= 0 ? 0 : (p >= 1 ? 1 : p); return p * p * (3 - 2 * p); }
  function easeOut(p) { p = p <= 0 ? 0 : (p >= 1 ? 1 : p); return 1 - Math.pow(1 - p, 3); }
  function ecgPaintHint(cx) {
    var t = HINT.t, pat = HINT.pat, kx = .16, wa = 0, sa = 0, sc = 1, mp = 0;
    var A = null, B = null, ca = null, cb = null;
    if (t < 700) {                                   /* 0.7초: 파동이 가운데로 오므라들며 모양을 준비한다 */
      var p = t / 700;
      kx = 1 - .84 * ease(p); wa = 1 - .45 * ease(p);
      sa = ease((t - 380) / 320) * .9; sc = SSC * (.7 + .3 * ease((t - 380) / 320));
      A = B = shapePts(pat.s[0]); ca = cb = ECG_KC[pat.c[0]];
    } else if (t < 4300) {                           /* 3.6초: 모양 하나당 0.9초(0.26초 정지 + 0.64초 morph) */
      var lt = t - 700, slot = Math.min(3, Math.floor(lt / 900)), local = lt - slot * 900;
      var nm = pat.s, ci = pat.c;
      A = shapePts(nm[slot]);
      B = slot < 3 ? shapePts(nm[slot + 1]) : A;
      ca = ECG_KC[ci[slot]];
      cb = ECG_KC[ci[slot < 3 ? slot + 1 : slot]];
      mp = slot < 3 ? ease((local - 420) / 480) : 0;   /* 0.42초는 또렷이 머물고 0.48초에 구부러진다 */
      sa = 1; sc = SSC * (.95 + .05 * ease(Math.min(1, (lt - slot * 900) / 320)));
      kx = .16; wa = 0;
    } else {                                         /* 0.7초: 모양이 풀리며 파동이 다시 창을 채운다 */
      var q = Math.min(1, (t - 4300) / 700);
      kx = .16 + .84 * easeOut(q); wa = .55 + .45 * ease(q);
      sa = 1 - ease(Math.min(1, q * 1.8)); sc = SSC * (1 - .32 * ease(q));
      A = B = shapePts(pat.s[3]); ca = cb = ECG_KC[pat.c[3]];
    }
    if (wa > 0) {
      cx.globalAlpha = wa; cx.lineWidth = 1.6; cx.strokeStyle = ecgTone(0);
      cx.lineJoin = 'round'; cx.lineCap = 'round';
      ecgPath(cx, kx); cx.stroke();
      cx.globalAlpha = 1;
    }
    if (sa > .01 && A && A.length) {
      var n = Math.min(A.length, B.length), i, x, y, sx = 62, sy = 1;
      cx.globalAlpha = sa; cx.lineWidth = 2; cx.lineJoin = 'round'; cx.lineCap = 'round';
      cx.strokeStyle = mixColor(ca, cb, mp);
      cx.beginPath();
      for (i = 0; i < n; i++) {
        x = A[i][0] + (B[i][0] - A[i][0]) * mp;
        y = A[i][1] + (B[i][1] - A[i][1]) * mp;
        x = sx + 22 + (x - 22) * sc; y = sy + 16 + (y - 16) * sc;
        if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      }
      cx.closePath(); cx.stroke();
      cx.globalAlpha = 1;
    }
  }
  function ecgFrame(now) {
    if (!ECG.on) return;
    var dt = ECG.last ? Math.min(.05, (now - ECG.last) / 1000) : 0; ECG.last = now;
    var t = ecgState(), k = 1 - Math.exp(-dt / .20), kt = 1 - Math.exp(-dt / .30), kc = 1 - Math.exp(-dt / .16);
    ECG.sp += (t.sp - ECG.sp) * k;
    ECG.amp += (t.amp - ECG.amp) * k;
    ECG.beat += (t.beat - ECG.beat) * kt;
    ECG.tone += (t.tone - ECG.tone) * kc;          /* 색은 빠르게 — 두 색 사이 탁한 중간색을 오래 보이지 않게 */
    ECG.lw += (t.lw - ECG.lw) * k;
    ECG.echo += (t.echo - ECG.echo) * kt;
    ECG.ceil += (t.ceil - ECG.ceil) * kt;
    if (ECG.chg > 0) ECG.chg = Math.max(0, ECG.chg - dt / .9);
    ECG.arm = (ecgRow && ecgRow.getAttribute('data-st') === 'armed') ? Math.min(4, ECG.arm + dt) : 0;
    ECG.ph += ECG.sp * dt;
    if (HINT.on) HINT.t = Math.min(HINT_MS, HINT.t + dt * 1000);
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
    ECG.sp = t.sp; ECG.amp = t.amp; ECG.tone = t.tone; ECG.beat = t.beat;
    ECG.lw = t.lw; ECG.echo = t.echo; ECG.ceil = t.ceil; ECG.chg = 0; ECG.arm = 0;
    if (reduce()) { ECG.sp = 1 / 1.9; ECG.amp = 1; ECG.tone = 0; ECG.beat = 84; ECG.lw = 1.5; ECG.echo = 0; ECG.ceil = 0; }
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
    open = true; picking = false;
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
      if (hintOn) cancelHint();            /* 방치 유도 중에 손이 닿으면 그 자리에서 넘겨받는다 */
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
        else if (hintOn) { e.preventDefault(); cancelHint(); }
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
      if (document.hidden) cancelHint();
      else scheduleHint();                 /* 돌아오면 다음 짝수분 정각을 다시 잡는다 */
    }
    document.addEventListener('visibilitychange', ecgPause); ecgPause();

    /* 목록이 열리고 닫힐 때(index.html setList) 파형을 켜고 끈다 */
    document.addEventListener('jc-list', ecgSync);
    /* 테마가 바뀌면 파형 색을 다시 읽는다 */
    try {
      new MutationObserver(function (rec) {
        var theme = false;
        for (var i = 0; i < rec.length; i++) if (rec[i].attributeName === 'data-theme') theme = true;
        if (theme) ecgColors(); else cancelHint();          /* 모드가 바뀌면 방치 유도를 접는다(덱으로 넘어가므로) */
        requestAnimationFrame(function () { ecgSync(); });   /* 모드가 바뀌면(덱 → 대문) 파도를 다시 흘린다 */
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-jc-mode'] });
    } catch (e) { }
    window.addEventListener('resize', function () { if (!ECG.on) ecgStill(); });

    scheduleHint();
    /* 감독·검수용: 정각을 기다리지 않고 방치 유도를 한 번 돌려 본다 */
    window.JC_HINT = { run: hint, cancel: cancelHint, next: function () { return nextEvenMinute(Date.now()); }, active: function () { return hintOn; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
