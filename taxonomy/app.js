/* 18. 직업·직무 3대 분류 교차 사전 — 화면 코드만(자료는 taxonomy/data/, 피클 담당 · 읽기 전용).
   계약: taxonomy/data/SCHEMA.md. 공식 매핑에 없는 연결은 「공식 매핑 자료 없음」으로 끊고 추정하지 않는다.
   KSA는 능력단위를 열 때만 ksa/index.json → 대분류 샤드를 받는다. 내보내기(저장·인쇄·복사) 기능 없음. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nz(s) { return String(s || '').toLowerCase().replace(/[·‧ㆍ・\s]/g, ''); }
  function n0(n) { return Number(n).toLocaleString('ko-KR'); }
  var mq = matchMedia('(min-width:900px)');

  var SYS = {
    ncs: { name: 'NCS', kind: '직무', full: '국가직무능력표준', c: 'var(--c-ncs)', levels: ['major', 'middle', 'minor', 'sub'] },
    keco: { name: 'KECO', kind: '직업', full: '한국고용직업분류 2025', c: 'var(--c-keco)', levels: ['major', 'middle', 'minor', 'sub'] },
    ksco: { name: 'KSCO', kind: '직업', full: '한국표준직업분류 제8차', c: 'var(--c-ksco)', levels: ['major', 'middle', 'minor', 'sub', 'detail'] }
  };
  var TABS = [['ncs', 'NCS', '직무'], ['keco', 'KECO', '고용직업'], ['ksco', 'KSCO', '표준직업'], ['job', '직업명', '고용24'], ['src', '출처', '한계']];
  var T = null, LV = {};
  var UI = { tab: 'ncs', path: { ncs: [], keco: [], ksco: [] }, sel: null, q: '', more: 50, jobMore: 100 };
  try { var sv = JSON.parse(localStorage.getItem('jc-taxonomy') || 'null'); if (sv && sv.tab) { UI.tab = sv.tab; if (sv.path) UI.path = sv.path; if (sv.sel) UI.sel = sv.sel; } } catch (e) {}
  function save() { try { localStorage.setItem('jc-taxonomy', JSON.stringify({ tab: UI.tab, path: UI.path, sel: UI.sel })); } catch (e) {} }

  /* 이용 안내 펼치기 */
  $('pvT').addEventListener('click', function () { var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기'; });

  /* 처음으로: 검색·탭·경로·선택을 모두 비우고 첫 화면(NCS 전체)으로 */
  $('rst').addEventListener('click', function () {
    var b = this; b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); setTimeout(function () { b.classList.remove('spin'); }, 450);
    closeSheet(); UI.tab = 'ncs'; UI.path = { ncs: [], keco: [], ksco: [] }; UI.sel = null; UI.q = ''; UI.more = 50; UI.jobMore = 100;
    $('q').value = ''; $('qx').hidden = true; save();
    if (T) { renderTabs(); render(); $('list').scrollTop = 0; $('det').scrollTop = 0; }
    window.scrollTo(0, 0);
  });

  /* ───── 자료 ───── */
  fetch('./data/taxonomy.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    T = j; LV = j.meta.level_keys;
    var N = T.N = { ncs: {}, keco: {}, ksco: {} }, K = T.K = { ncs: {}, keco: {}, ksco: {} };
    ['ncs', 'keco', 'ksco'].forEach(function (s) {
      SYS[s].levels.forEach(function (l) {
        j[s].levels[l].forEach(function (x) { x.sys = s; x.lv = l; x._n = nz(x.name); N[s][x.code] = x; var p = x.parent || ''; (K[s][p] = K[s][p] || []).push(x); });
      });
    });
    (j.ncs.legacy || []).forEach(function (x) { if (N.ncs[x.code]) return; var o = { code: x.code, name: x.name, parent: x.parent, sys: 'ncs', lv: x.level, legacy: true, _n: nz(x.name) }; N.ncs[x.code] = o; (K.ncs[o.parent || ''] = K.ncs[o.parent || ''] || []).push(o); });
    T.U = {}; T.UC = {};
    j.ncs.units.forEach(function (u) { T.UC[u.code] = u; u.subs.forEach(function (s) { (T.U[s] = T.U[s] || []).push(u); }); });
    T.NK = {}; T.KN = {}; T.KK = {}; T.SK = {}; T.TR = {}; T.JK = {}; T.JS = {}; T.J = {};
    j.mappings.ncs_keco.forEach(function (m) { push(T.NK, m.ncs_code, m.keco_code); push(T.KN, m.keco_code, m.ncs_code); });
    j.mappings.keco_ksco.forEach(function (m) { T.KK[m.keco_code] = m.ksco_code; push(T.SK, m.ksco_code, m.keco_code); });
    j.mappings.ncs_training.forEach(function (m) { push(T.TR, m.ncs_code, m.training_name); });
    j.jobs.forEach(function (x) { x._n = nz(x.name); T.J[x.konet] = x; push(T.JK, x.keco_code, x.konet); if (x.ksco_code) push(T.JS, x.ksco_code, x.konet); });
    T.JOBS = j.jobs.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    renderTabs(); render(); urlQuery();
  }).catch(function () { $('list').innerHTML = '<p class="empty">분류 자료를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>'; });
  /* 다른 섹터에서 ?q=로 들어오면 그 낱말로 바로 찾는다(직무·기업·학과에서 넘어오는 길). */
  function urlQuery() {
    var q = '';
    try { q = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) {}
    if (!q) return;
    UI.q = q; UI.sel = null; UI.more = 50;
    $('q').value = q; $('qx').hidden = false;
    renderTabs(); render();
  }
  function push(o, k, v) { var a = o[k] = o[k] || []; if (a.indexOf(v) < 0) a.push(v); }

  function node(s, c) { return T.N[s][c] || null; }
  function lvName(x) { var k = LV[x.sys] || {}; return k[x.lv] || ''; }
  function pathOf(x) { var out = []; while (x) { out.unshift(x); x = x.parent ? node(x.sys, x.parent) : null; } return out; }
  function kids(s, c) { return T.K[s][c || ''] || []; }
  function badge(s) { if (s === 'job') return '<span class="bd" style="--c:var(--c-job)">직업 · 고용24</span>'; return '<span class="bd" style="--c:' + SYS[s].c + '">' + SYS[s].name + ' · ' + SYS[s].kind + '</span>'; }

  /* ───── 색인 띠(직업명 목록 오른쪽) ─────
     · 누르거나 끌면(손가락·마우스 모두) 그 머리글자 묶음으로 곧장 옮긴다. 끄는 동안은 띠 왼쪽에 큰 글자 말풍선이 따라온다.
     · 띠는 하나의 조정 막대(role=slider)라 Tab 한 번에 들어오고 ↑↓·Home·End로 옮긴다(41개 단추를 탭 순서에 늘어놓지 않는다).
     · 띠 높이가 모자라면(휴대폰) 사이사이를 «•»로 줄여 보이되, 끄는 위치는 전체 색인을 그대로 나눠 모든 글자에 닿는다.
     · 없는 글자(예: G)는 그다음 있는 묶음으로 간다. 움직임은 transform·opacity만, 상시 루프 0(목록을 굴리는 동안만 rAF 한 번씩). */
  var IDX = (function () {
    var rail = null, bub = null, list = null, cur = '', drag = null, hideT = 0, raf = 0, shown = false, layoutRaf = 0, skip = false;
    function build() {
      if (rail) return;
      list = $('list');
      var pane = list.parentNode; pane.classList.add('has-rail');
      rail = d.createElement('div'); rail.className = 'azr'; rail.id = 'azr'; rail.tabIndex = 0;
      rail.setAttribute('role', 'slider'); rail.setAttribute('aria-orientation', 'vertical'); rail.setAttribute('aria-label', '머리글자 색인');
      rail.setAttribute('aria-valuemin', '1'); rail.setAttribute('aria-valuemax', String(IDX_KEYS.length));
      bub = d.createElement('div'); bub.className = 'azb'; bub.setAttribute('aria-hidden', 'true');
      pane.appendChild(rail); pane.appendChild(bub);
      rail.addEventListener('pointerdown', down);
      rail.addEventListener('pointermove', move);
      rail.addEventListener('pointerup', up); rail.addEventListener('pointercancel', up); rail.addEventListener('lostpointercapture', up);
      rail.addEventListener('keydown', key);
      list.addEventListener('scroll', onScroll, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(function () { if (shown) lay(); }).observe(list);
    }
    /* 보이는 칸 수에 맞춰 띠 글자를 고른다 — # · ㄱ~ㅎ(15칸)은 늘 다 보이고, 모자라면 영문(26칸)만 «A • E • …»로 줄인다.
       칸마다 맡는 색인 범위(r0~r1)를 적어 두어, 줄인 «•» 위를 끌어도 그 사이 글자에 모두 닿는다. */
    var items = [];
    function lay() {
      cancelAnimationFrame(layoutRaf);
      layoutRaf = requestAnimationFrame(function () {
        var top = list.offsetTop, h = list.clientHeight;
        rail.style.top = top + 'px'; rail.style.height = h + 'px';
        var max = Math.max(19, Math.floor((h - 16) / 13)), fixed = 15, lat = IDX_KEYS.length - fixed;
        items = [];
        for (var i = 0; i < fixed; i++) items.push({ k: IDX_KEYS[i], r0: i, r1: i });
        var L = max - fixed;
        if (L >= lat) for (i = fixed; i < IDX_KEYS.length; i++) items.push({ k: IDX_KEYS[i], r0: i, r1: i });
        else {
          var S = Math.max(3, L % 2 ? L : L - 1), prev = -1;
          for (var j = 0; j < S; j += 2) {
            var at = fixed + Math.round(j / (S - 1) * (lat - 1));
            if (prev >= 0 && at - prev > 1) items.push({ k: '•', r0: prev + 1, r1: at - 1 });
            items.push({ k: IDX_KEYS[at], r0: at, r1: at }); prev = at;
          }
        }
        rail.innerHTML = '<span class="azr-in">' + items.map(function (it) {
          if (it.k === '•') return '<i class="dot">•</i>';
          return '<i data-k="' + it.k + '"' + (T.JG[it.k] ? '' : ' class="no"') + '>' + it.k + '</i>';
        }).join('') + '</span>';
        mark(cur, true);
      });
    }
    function show() { build(); shown = true; rail.hidden = false; lay(); cur = ''; onScroll(); }
    function hide() { shown = false; if (rail) { rail.hidden = true; bub.classList.remove('on'); } if (list) list.classList.remove('has-idx'); }
    /* 띠 위의 높이 → 어느 칸 → 그 칸이 맡은 범위 안의 몇 번째 글자인가 */
    function keyAt(y) {
      var is = rail.firstChild.children; if (!is.length) return IDX_KEYS[0];
      var t0 = is[0].getBoundingClientRect().top, t1 = is[is.length - 1].getBoundingClientRect().bottom;
      var f = Math.max(0, Math.min(0.99999, (y - t0) / (t1 - t0))) * items.length, it = items[Math.floor(f)];
      if (!it) return IDX_KEYS[0];
      return IDX_KEYS[it.r0 + Math.min(it.r1 - it.r0, Math.floor((f % 1) * (it.r1 - it.r0 + 1)))];
    }
    /* 없는 글자면 그다음 있는 묶음(끝이면 바로 앞 묶음) */
    function target(k) {
      var i = IDX_KEYS.indexOf(k);
      for (var j = i; j < IDX_KEYS.length; j++) if (T.JG[IDX_KEYS[j]]) return IDX_KEYS[j];
      for (j = i - 1; j >= 0; j--) if (T.JG[IDX_KEYS[j]]) return IDX_KEYS[j];
      return null;
    }
    function jump(k, y) {
      var t = target(k); if (!t) return;
      var sec = list.querySelector('.jg[data-k="' + t + '"]'); if (!sec) return;
      var bs = sec.querySelectorAll('.jb'); fillBlock(bs[0]); fillBlock(bs[1]);
      skip = list.scrollTop !== Math.round(sec.offsetTop - list.firstElementChild.offsetTop);   /* 이 옮김이 부르는 굴림 표시 한 번은 건너뛴다(반올림으로 앞 묶음이 잡히는 것 방지) */
      list.scrollTop = sec.offsetTop - list.firstElementChild.offsetTop;
      mark(t);
      if (y != null) {
        var pr = rail.parentNode.getBoundingClientRect(), lr = list.getBoundingClientRect();
        var yy = Math.max(lr.top + 28, Math.min(lr.bottom - 28, y)) - pr.top;
        bub.textContent = k === '#' ? '#' : k;
        bub.classList.toggle('miss', t !== k);
        bub.style.transform = 'translate3d(0,' + (yy - 28).toFixed(1) + 'px,0)';
        bub.classList.add('on');
      }
    }
    function mark(k, force) {
      if (!rail || (!force && k === cur)) return;
      cur = k;
      var on = rail.querySelector('i.on'); if (on) on.classList.remove('on');
      var el = rail.querySelector('i[data-k="' + k + '"]'); if (el) el.classList.add('on');
      var i = IDX_KEYS.indexOf(k);
      rail.setAttribute('aria-valuenow', String(i + 1)); rail.setAttribute('aria-valuetext', k === '#' ? '숫자' : k);
    }
    function down(e) {
      if (e.button) return;
      e.preventDefault(); clearTimeout(hideT);
      try { rail.setPointerCapture(e.pointerId); } catch (er) {}
      drag = { k: '', touch: e.pointerType !== 'mouse' };
      rail.classList.add('drag');
      move(e);
    }
    function move(e) {
      if (!drag) return;
      var k = keyAt(e.clientY);
      if (k === drag.k) return;
      drag.k = k; jump(k, e.clientY);
      if (drag.touch && navigator.vibrate) { try { navigator.vibrate(6); } catch (er) {} }
    }
    function up() {
      if (!drag) return; drag = null;
      rail.classList.remove('drag');
      clearTimeout(hideT); hideT = setTimeout(function () { bub.classList.remove('on'); }, 420);
    }
    function key(e) {
      var i = Math.max(0, IDX_KEYS.indexOf(cur)), n = -1;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') n = i + 1;
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') n = i - 1;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = IDX_KEYS.length - 1;
      if (n < 0) return;
      e.preventDefault();
      n = Math.max(0, Math.min(IDX_KEYS.length - 1, n));
      /* 없는 글자는 건너뛴다 — 같은 방향으로 다음 있는 글자, 그 방향에 없으면 반대쪽(End → 마지막 있는 글자) */
      var step = (e.key === 'End' || n > i) ? 1 : -1, m = n;
      while (m >= 0 && m < IDX_KEYS.length && !T.JG[IDX_KEYS[m]]) m += step;
      if (m < 0 || m >= IDX_KEYS.length) { m = n; while (m >= 0 && m < IDX_KEYS.length && !T.JG[IDX_KEYS[m]]) m -= step; }
      if (m >= 0 && m < IDX_KEYS.length) jump(IDX_KEYS[m]);
    }
    /* 목록을 굴리면 지금 보는 묶음의 글자를 띠에 표시 — 굴리는 동안만 한 프레임에 한 번 */
    function onScroll() {
      if (skip) { skip = false; return; }
      if (!shown || raf || drag) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var top = list.getBoundingClientRect().top + 8, secs = list.querySelectorAll('.jg'), k = '';
        for (var i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top <= top) k = secs[i].getAttribute('data-k'); else break; }
        mark(k || (secs[0] && secs[0].getAttribute('data-k')) || '');
      });
    }
    return { show: show, hide: hide };
  })();

  /* ───── 탭 ───── */
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) { var c = SYS[t[0]] ? SYS[t[0]].c : 'var(--c-job)'; return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0] && !UI.q) + '" style="--c:' + c + '">' + t[1] + '<small>' + t[2] + '</small></button>'; }).join('');
  }
  function setTab(t) { UI.tab = t; UI.q = ''; $('q').value = ''; $('qx').hidden = true; UI.more = 50; UI.jobMore = 100; save(); renderTabs(); render(); }
  d.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b && T) setTab(b.getAttribute('data-tab')); });

  /* ───── 목록 ───── */
  function render() {
    var src = UI.tab === 'src' && !UI.q;
    $('split').hidden = src; $('src').hidden = !src; $('foot').hidden = src;
    if (src) { IDX.hide(); renderSrc(); return; }
    if (!(UI.tab === 'job' && !UI.q)) { $('list').classList.remove('has-idx'); IDX.hide(); }
    if (UI.q) renderSearch(); else if (UI.tab === 'job') renderJobs(); else renderTree();
    if (UI.sel) renderDet(UI.sel, true); else $('det').innerHTML = pickHtml();
  }
  function pickHtml() { return '<div class="det-x"><button type="button" data-close>닫기</button></div><div class="pick"><div><b>항목을 고르면 여기에 연결이 보입니다</b>세 분류 사이의 공식 연결, 능력단위, KSA(지식·기술·태도)</div></div>'; }
  function rowHtml(x, opt) {
    opt = opt || {};
    var n = x.sys ? kids(x.sys, x.code).length : 0, cur = UI.sel && UI.sel.s === x.sys && UI.sel.c === x.code;
    var meta = n ? n0(n) : (x.sys === 'ncs' && x.lv === 'sub' ? '능력단위 ' + (T.U[x.code] || []).length : '');
    return '<button type="button" class="row" data-s="' + x.sys + '" data-c="' + esc(x.code) + '"' + (cur ? ' aria-current="true"' : '') + '><span class="cd">' + esc(x.code) + '</span><span class="nm">' + esc(x.name) + (opt.sub ? '<small>' + opt.sub + '</small>' : '') + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + (opt.badge ? badge(x.sys) : '') + '<span class="ct">' + meta + '</span>' + (n ? '<span class="ar" aria-hidden="true">›</span>' : '') + '</button>';
  }
  function renderTree() {
    var s = UI.tab, p = UI.path[s] || [], par = p.length ? node(s, p[p.length - 1]) : null;
    if (p.length && !par) { UI.path[s] = []; p = []; }
    var h = '<button type="button" data-crumb="-1">' + SYS[s].name + ' 전체</button>';
    p.forEach(function (c, i) { var x = node(s, c); if (x) h += '<span class="sep" aria-hidden="true">›</span><button type="button" data-crumb="' + i + '">' + esc(x.name) + '</button>'; });
    h = '<div class="cr-s">' + h + '</div>';
    if (par) h += '<button type="button" class="more" data-open="' + s + '|' + esc(par.code) + '">자세히</button>';
    $('crumb').innerHTML = h; var cs = $('crumb').firstChild; cs.scrollLeft = cs.scrollWidth;
    var list = kids(s, par ? par.code : '');
    var lvl = list[0] ? lvName(list[0]) : '';
    $('lh').innerHTML = (par ? '<button type="button" class="upb" data-crumb="' + (p.length - 2) + '" aria-label="한 단계 위로">↑ 상위</button>' : '') + '<b>' + (par ? esc(par.name) : SYS[s].full) + '</b><span>' + (lvl ? lvl + ' ' : '') + n0(list.length) + '개</span>' + (s === 'ncs' ? '<span>· 직무 기준</span>' : '<span>· 직업 기준</span>');
    $('list').innerHTML = list.length ? list.map(function (x) { return rowHtml(x); }).join('') : '<p class="empty">아래 단계가 없습니다.</p>';
    $('list').scrollTop = 0;
  }
  /* ───── 고용24 직업명 — 머리글자 묶음 + 오른쪽 색인 띠(2026-11-24 태화님 지시) ─────
     6,713개를 「100개 더 보기」로 늘리던 목록을 머리글자(# · ㄱ~ㅎ · A~Z) 묶음으로 한 번에 그리고,
     묶음마다 content-visibility:auto로 화면 밖 묶음은 배치·그리기를 건너뛴다. 묶음 머리는 목록 안에서 붙박이(sticky).
     색인 띠는 목록 순서(숫자 → 한글 → 영문)와 같은 차례로 선다. 겹자음(ㄲ·ㄸ·ㅃ·ㅆ·ㅉ)은 홑자음 묶음에 넣는다(사전 관행). */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', CHO1 = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
  var IDX_KEYS = ['#'].concat('ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'.split(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  function keyOf(name) {
    var ch = String(name || '').charAt(0), c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) { var k = CHO.charAt(Math.floor((c - 0xAC00) / 588)); return CHO1[k] || k; }
    if (/[a-z]/i.test(ch)) return ch.toUpperCase();
    return '#';
  }
  /* 6,713줄을 한꺼번에 만들면 휴대폰(4배 느린 CPU)에서 2.1초 걸렸다 → 묶음 안을 100줄 단위 칸(.jb)으로 나누고,
     화면 가까이 온 칸만 채운다. 칸 높이는 «줄 수 × 한 줄 높이(--row, em)»로 미리 정확히 잡아 두어
     채워져도 목록 높이가 변하지 않는다(스크롤 위치 보정이 없는 iPhone Safari에서도 튀지 않는다). */
  var JB = 100, jbIO = null;
  function fillBlock(el) {
    if (!el || el.getAttribute('data-f')) return;
    var g = T.JG[el.parentNode.getAttribute('data-k')], i = +el.getAttribute('data-i');
    el.innerHTML = g.slice(i, i + JB).map(jobRow).join('');
    el.setAttribute('data-f', '1');
    if (jbIO) jbIO.unobserve(el);
  }
  function renderJobs() {
    $('crumb').innerHTML = '<div class="cr-s"><button type="button">고용24 직업 전체</button></div>';
    $('lh').innerHTML = '<b>직업명 가나다순</b><span>' + n0(T.JOBS.length) + '개 · 직업 기준</span>';
    if (!T.JG) {   /* 묶음은 한 번만 나눈다 */
      T.JG = {}; T.JOBS.forEach(function (x) { var k = keyOf(x.name); (T.JG[k] = T.JG[k] || []).push(x); });
    }
    var h = '';
    IDX_KEYS.forEach(function (k) {
      var g = T.JG[k]; if (!g) return;
      h += '<section class="jg" data-k="' + k + '" aria-label="' + (k === '#' ? '숫자' : k) + ' ' + g.length + '개">' +
        '<h3 class="jg-h" aria-hidden="true">' + (k === '#' ? '0–9' : k) + '<small>' + n0(g.length) + '</small></h3>';
      for (var i = 0; i < g.length; i += JB) h += '<div class="jb" data-i="' + i + '" style="--n:' + Math.min(JB, g.length - i) + '"></div>';
      h += '</section>';
    });
    var L = $('list');
    L.innerHTML = h; L.classList.add('has-idx'); L.scrollTop = 0;
    if (jbIO) jbIO.disconnect();
    var blocks = L.querySelectorAll('.jb');
    if (window.IntersectionObserver) {
      jbIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) fillBlock(e.target); }); }, { root: L, rootMargin: '900px 0px' });
      blocks.forEach(function (el) { jbIO.observe(el); });
    } else blocks.forEach(fillBlock);
    fillBlock(blocks[0]);
    /* 골라 둔 직업이 있으면 그 칸을 채워 표시가 보이게 */
    if (UI.sel && UI.sel.s === 'job') { var x = T.J[UI.sel.c]; if (x) { var k = keyOf(x.name), gi = T.JG[k].indexOf(x); fillBlock(L.querySelector('.jg[data-k="' + k + '"] .jb[data-i="' + (gi - gi % JB) + '"]')); } }
    IDX.show();
  }
  function jobRow(x) { var cur = UI.sel && UI.sel.s === 'job' && UI.sel.c === x.konet; return '<button type="button" class="row" data-s="job" data-c="' + x.konet + '"' + (cur ? ' aria-current="true"' : '') + '><span class="nm">' + esc(x.name) + '<small>' + esc((node('keco', x.keco_code) || {}).name || '') + '</small></span>' + (UI.q ? badge('job') : '') + '</button>'; }

  /* ───── 검색 ───── */
  var qT = 0;
  $('q').addEventListener('input', function () { $('qx').hidden = !this.value; clearTimeout(qT); var v = this.value; qT = setTimeout(function () { UI.q = v.trim(); UI.more = 50; if (T) { renderTabs(); render(); } }, 200); });
  $('qx').addEventListener('click', function () { $('q').value = ''; this.hidden = true; UI.q = ''; if (T) { renderTabs(); render(); } $('q').focus(); });
  function renderSearch() {
    var q = nz(UI.q), raw = UI.q.trim(), hits = [];
    ['ncs', 'keco', 'ksco'].forEach(function (s) { for (var c in T.N[s]) { var x = T.N[s][c]; if (x._n.indexOf(q) >= 0 || c.indexOf(raw) === 0) hits.push(x); } });
    T.jobs.forEach(function (x) { if (x._n.indexOf(q) >= 0) hits.push(x); });
    hits.sort(function (a, b) { var an = a._n === q ? 0 : a._n.indexOf(q) === 0 ? 1 : 2, bn = b._n === q ? 0 : b._n.indexOf(q) === 0 ? 1 : 2; return an - bn; });
    $('crumb').innerHTML = '<div class="cr-s"><button type="button">검색 · 「' + esc(raw) + '」</button></div>';
    $('lh').innerHTML = '<b>' + n0(hits.length) + '건</b><span>세 분류와 직업을 함께 찾았습니다</span>';
    if (!hits.length) { $('list').innerHTML = '<p class="empty">맞는 항목이 없습니다. 더 짧게 적거나 코드 앞자리로 찾아 보세요.</p>'; return; }
    $('list').innerHTML = hits.slice(0, UI.more).map(function (x) { if (x.konet) return jobRow(x); var p = pathOf(x); return rowHtml(x, { badge: true, sub: lvName(x) + (p.length > 1 ? ' · ' + esc(p[p.length - 2].name) : '') }); }).join('') + (hits.length > UI.more ? '<button type="button" class="morebtn" data-more>' + n0(Math.min(50, hits.length - UI.more)) + '건 더 보기</button>' : '');
  }

  /* ───── 목록 누르기 ───── */
  $('split').addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-crumb]'))) { var i = +b.getAttribute('data-crumb'); UI.path[UI.tab] = UI.path[UI.tab].slice(0, i + 1); save(); renderTree(); return; }
    if ((b = e.target.closest('[data-more]'))) { UI.more += 50; var st = $('list').scrollTop; renderSearch(); $('list').scrollTop = st; return; }
    if ((b = e.target.closest('[data-open]'))) { var p = b.getAttribute('data-open').split('|'); select(p[0], p[1]); return; }
    if ((b = e.target.closest('[data-close]'))) { closeSheet(); return; }
    if ((b = e.target.closest('.row[data-s]'))) {
      var s = b.getAttribute('data-s'), c = b.getAttribute('data-c');
      if (s !== 'job' && !UI.q && kids(s, c).length) { UI.path[s] = pathOf(node(s, c)).map(function (x) { return x.code; }); save(); renderTree(); if (mq.matches) select(s, c); return; }
      if (UI.q && s !== 'job') { UI.tab = s; UI.path[s] = pathOf(node(s, c)).slice(0, -1).map(function (x) { return x.code; }); }
      select(s, c);
      $('list').querySelectorAll('.row[aria-current]').forEach(function (x) { x.removeAttribute('aria-current'); }); b.setAttribute('aria-current', 'true');
      return;
    }
    if ((b = e.target.closest('[data-go]'))) { var g = b.getAttribute('data-go').split('|'); goTo(g[0], g[1]); return; }
    if ((b = e.target.closest('[data-unit]'))) { openUnit(b.getAttribute('data-unit')); return; }
    if ((b = e.target.closest('[data-back]'))) { var k = b.getAttribute('data-back').split('|'); renderDet({ s: k[0], c: k[1] }); return; }
    if ((b = e.target.closest('[data-jl]'))) { var jl = b.parentNode; jl.querySelectorAll('[hidden]').forEach(function (x) { x.hidden = false; }); b.remove(); return; }
  });
  function goTo(s, c) {
    if (s === 'job') { select('job', c); return; }
    var x = node(s, c); if (!x) return;
    UI.q = ''; $('q').value = ''; $('qx').hidden = true; UI.tab = s;
    var p = pathOf(x).map(function (y) { return y.code; }); UI.path[s] = kids(s, c).length ? p : p.slice(0, -1);
    save(); renderTabs(); renderTree(); select(s, c);
  }
  function select(s, c) { UI.sel = { s: s, c: c }; save(); renderDet(UI.sel); openSheet(); }

  /* ───── 한눈에 인사이트(능력단위명·능력단위요소·KSA 원문만 세어 만든 요약) ─────
     자료: data/insights/ (taxonomy/data/build_insights.py가 만든다). 화면은 읽기만 한다. */
  var IN = { ix: null, sh: {} };
  function insIndex() {
    if (IN.ix) return Promise.resolve(IN.ix);
    return fetch('./data/insights/index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { IN.ix = j; return j; });
  }
  function insShard(kind, major) {
    var key = kind + major;
    if (IN.sh[key]) return Promise.resolve(IN.sh[key]);
    return insIndex().then(function (ix) {
      var rel = (ix[kind] || {})[major]; if (!rel) throw 0;
      return fetch('./data/insights/' + rel, { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { IN.sh[key] = j; return j; });
    });
  }
  /* 조사 고르기 — 인용부호 안 낱말의 끝소리로 고른다(부호로 고르면 틀린다) */
  function jong(w) {
    var ch = String(w || ' ').slice(-1), c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 !== 0;
    if (/[0-9]/.test(ch)) return '0136780'.indexOf(ch) >= 0;
    return false;
  }
  function qj(w, pair) { return '「' + w + '」' + (jong(w) ? pair.split('/')[0] : pair.split('/')[1]); }
  function cleanItem(s) { return String(s == null ? '' : s).replace(/^\s*\d+\s*[.)]\s*/, '').trim(); }
  function cleanAct(s) {
    var t = cleanItem(s).replace(/\s+/g, ' ');
    var cut = t.replace(/\s*(하기|한다|하다)$/, '').trim();
    var last = cut.split(/[^0-9A-Za-z가-힣]+/).filter(Boolean).pop() || '';
    return (cut && last.length >= 2) ? cut : t;
  }
  var INS_LV = { major: ['이 분야가 뭐 하는 거예요?', '분야 관통'], middle: ['이 분야가 뭐 하는 거예요?', '분야 관통'], minor: ['이 직무가 뭐 하는 거예요?', '직무 공통'], sub: ['이 직무가 뭐 하는 거예요?', '직무 실무'] };
  var INS_LINKS = [
    ['../work-filter/', '직업 현실 리얼 필터', '근무 환경·사람 대면·교대 같은 현실 조건으로 걸러 보기'],
    ['../cert/', '자격증 도감', '이 직무와 이어지는 자격을 찾아보기'],
    ['../interview/', '면접 전술 덱', '면접 질문 유형·답변 구조를 카드로 익히기']
  ];
  function ksaStrip(x) {
    if (!x || (!x.k && !x.s && !x.a)) return '';
    return '<div class="insBar" role="img" aria-label="KSA 항목 수 비율 — 지식 ' + x.kp + '%, 기술 ' + x.sp + '%, 태도 ' + x.ap + '%">' +
      '<i style="--c:var(--c-ncs);flex:' + Math.max(x.kp, 1) + '"></i><i style="--c:var(--c-keco);flex:' + Math.max(x.sp, 1) + '"></i><i style="--c:var(--c-ksco);flex:' + Math.max(x.ap, 1) + '"></i></div>' +
      '<p class="insKsa"><span style="--c:var(--c-ncs)">지식 ' + x.kp + '%</span><span style="--c:var(--c-keco)">기술 ' + x.sp + '%</span><span style="--c:var(--c-ksco)">태도 ' + x.ap + '%</span>' + (x.b ? '<b>' + esc(x.b) + '</b>' : '') + '<small>KSA 원문 항목 수</small></p>';
  }
  function insLinks() {
    return '<div class="insLk">' + INS_LINKS.map(function (l) {
      return '<a href="' + l[0] + '" title="' + esc(l[2]) + '">' + esc(l[1]) + '<span aria-hidden="true">↗</span></a>';
    }).join('') + '</div>';
  }
  function insQHtml(qs, note) {
    if (!qs || !qs.length) return '';
    return '<details class="insQ"><summary><span class="qk">직무적합성 면접 예상 질문</span><b>' + qs.length + '개</b><small>KSA 원문 근거</small></summary><ol>' +
      qs.map(function (q) { return '<li><p class="qq">' + esc(q.q) + '</p><p class="qw"><b>근거</b>' + (q.why || []).map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</p></li>'; }).join('') +
      '</ol><p class="qnote">' + esc(note || '질문은 이 분류의 KSA 원문 항목을 그대로 인용해 만든 틀입니다. 실제 채용 질문이 아니며, 원문에 없는 내용은 넣지 않았습니다.') + '</p></details>';
  }
  function insCard(e) {
    var meta = INS_LV[e.lv] || INS_LV.sub;
    var st = e.stats || {}, s = [];
    if (st.units) s.push('능력단위 ' + n0(st.units) + '개');
    if (st.subs) s.push('세분류 ' + n0(st.subs) + '개');
    if (st.minors) s.push('소분류 ' + n0(st.minors) + '개');
    if (st.lvMin) s.push('수준 ' + st.lvMin + (st.lvMax && st.lvMax !== st.lvMin ? '–' + st.lvMax : ''));
    if (st.hours) s.push('표준훈련시간 ' + n0(st.hours) + '시간');
    var h = '<section class="ins" aria-label="한눈에 보기"><div class="insHd"><span class="insKick">한눈에 · ' + meta[1] + '</span><h3 class="insT">' + meta[0] + '</h3></div>';
    if (e.line) h += '<p class="insLine">' + esc(e.line) + '</p>';
    if (e.acts && e.acts.length) h += '<ul class="insActs">' + e.acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    if (!e.line) h += '<p class="insNo">이 분류의 능력단위에는 KSA 원천이 없어 한 줄 정의를 만들지 않았습니다. 아래 원문 목록만 있습니다.</p>';
    h += ksaStrip(e.ksa);
    if (e.kw && e.kw.length) h += '<p class="insKw"><b>빈출 키워드</b>' + e.kw.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</p>';
    if (s.length) h += '<p class="insStat">' + s.join(' · ') + '</p>';
    h += insLinks();
    h += insQHtml(e.qs);
    return h + '</section>';
  }
  /* KECO·KSCO·고용24 직업 — 이 원자료에는 직무 수행 설명이 없다. 있는 것(분류 위치·공식 매핑)만 보여 준다. */
  function bridgeCard(s, c) {
    var t = s === 'job' ? T.J[c] : node(s, c); if (!t) return '';
    var nm = [], situ = '';
    function nmOf(sy, code) { var x = code && node(sy, code); return x ? '「' + x.name + '」' : ''; }
    if (s === 'job') {
      nm = T.KN[t.keco_code] || [];
      var kp = nmOf('keco', t.keco_code), sp2 = nmOf('ksco', t.ksco_code), parts = [];
      if (kp) parts.push('고용직업분류 ' + kp);
      if (sp2) parts.push('표준직업분류 ' + sp2);
      situ = '고용24 직업 「' + t.name + '」은 ' + (parts.join(' · ') || '분류 자료 없음') + '에 속한 직업입니다.' +
        (sp2 ? '' : ' 표준직업분류 연결은 원자료에 없습니다.');
    } else if (s === 'keco') {
      if (t.lv !== 'sub') return '';
      nm = T.KN[c] || [];
      var kx = nmOf('ksco', T.KK[c]);
      situ = kx ? 'KECO 세분류 「' + t.name + '」은 표준직업분류 ' + kx + '에 대응합니다.'
                : 'KECO 세분류 「' + t.name + '」은 표준직업분류 연결이 원자료에 없습니다.';
    } else if (s === 'ksco') {
      if (t.lv !== 'sub') return '';
      (T.SK[c] || []).forEach(function (k) { (T.KN[k] || []).forEach(function (m) { if (nm.indexOf(m) < 0) nm.push(m); }); });
      var ke = (T.SK[c] || []).map(function (k) { return nmOf('keco', k); }).filter(Boolean);
      situ = ke.length ? 'KSCO 세분류 「' + t.name + '」은 고용직업분류 ' + ke.join(' · ') + '에 대응합니다.'
                       : 'KSCO 세분류 「' + t.name + '」은 고용직업분류 연결이 원자료에 없습니다.';
    } else return '';
    var h = '<section class="ins" aria-label="한눈에 보기"><div class="insHd"><span class="insKick">한눈에 · 원자료 범위</span><h3 class="insT">이 ' + (s === 'job' ? '직업이' : '세분류가') + ' 뭐 하는 거예요?</h3></div>';
    h += '<p class="insLine">' + esc(situ) + '</p>';
    if (nm.length) {
      h += '<p class="insNote">수행 내용은 공식 매핑으로 이어진 NCS 직무(소분류)의 능력단위·KSA에 있습니다. 그 직무를 열면 그 화면 위에 한 줄 정의와 면접 예상 질문이 나옵니다.</p>';
      h += '<div class="insGoWrap"><b>이어지는 NCS 직무</b>' + nm.slice(0, 8).map(function (m) { var x = node('ncs', m); return x ? '<button type="button" class="insGo" data-go="ncs|' + esc(m) + '">' + esc(x.name) + '</button>' : ''; }).join('') + (nm.length > 8 ? '<span class="insDim">외 ' + n0(nm.length - 8) + '개</span>' : '') + '</div>';
    } else {
      h += '<p class="insNo">이 분류에는 공식 매핑으로 이어진 NCS 직무가 없습니다. 원자료에 수행 설명도 없어, 여기서 직무 내용을 만들지 않습니다.</p>';
    }
    h += insLinks();
    return h + '</section>';
  }
  function fillInsight(box) {
    if (!box) return;
    var s = box.getAttribute('data-ins-s'), c = box.getAttribute('data-ins-c'), key = s + c;
    box.setAttribute('data-ins-key', key);
    if (s === 'ncs') {
      insShard('nodes', c.slice(0, 2)).then(function (pk) {
        if (box.getAttribute('data-ins-key') !== key) return;
        var e = pk.nodes[c];
        box.innerHTML = e ? insCard(e) : '';
        if (!e) box.remove();
      }).catch(function () { if (box.getAttribute('data-ins-key') === key) box.innerHTML = '<section class="ins"><p class="insNo">한눈에 보기를 불러오지 못했습니다. 아래 원문 목록은 그대로 볼 수 있습니다.</p></section>'; });
    } else {
      box.innerHTML = bridgeCard(s, c);
      if (!box.innerHTML) box.remove();
    }
  }
  /* 능력단위 화면의 질문 — KSA 원문(rec.e)에서 바로 만든다(같은 틀, 같은 원문) */
  function unitQs(u, rec) {
    var have = (rec.e || []).filter(function (e) { return (e.k && e.k.length) || (e.s && e.s.length) || (e.a && e.a.length); });
    if (!have.length) return [];
    var at = function (i) { return have[Math.min(i, have.length - 1)]; };
    var e1 = at(0), e2 = at(Math.floor(have.length / 2)), e3 = at(have.length - 1);
    var k1 = (e1.k || [])[0], s1 = (e1.s || [])[0] || (e2.s || [])[0], k2 = (e2.k || []).slice(-1)[0], a1 = (e3.a || [])[0] || (e1.a || [])[0];
    var out = [];
    if (k1) out.push({ q: '「' + cleanAct(e1.f) + '」 업무를 실제로 해 본 경험이 있습니까? 그때 ' + qj(cleanItem(k1), '을/를') + ' 어떻게 확인하고 적용했는지 구체적으로 말씀해 주세요.', why: [cleanItem(k1)].concat(s1 ? [cleanItem(s1)] : []) });
    if (k2) out.push({ q: '「' + cleanItem(k2) + '」에 대해 설명해 주세요. 「' + u.name + '」에서 이 내용이 왜 필요하다고 생각합니까?', why: [cleanItem(k2)].concat(k1 && k1 !== k2 ? [cleanItem(k1)] : []) });
    if (s1) out.push({ q: '「' + cleanItem(s1) + '」 항목을 기준으로 볼 때, ' + qj(cleanAct(e2.f), '은/는') + ' 어느 수준까지 할 수 있습니까? 최근 사례를 하나 들어 말씀해 주세요.', why: [cleanItem(s1)] });
    if (a1) out.push({ q: qj(cleanItem(a1), '이/가') + ' 필요한 상황을 하나 가정해, 본인이 어떻게 행동할지 말씀해 주세요.', why: [cleanItem(a1)].concat((e3.a || []).slice(1, 2).map(cleanItem)) });
    return out.slice(0, 4);
  }
  function unitCard(u, ent, rec) {
    var st = [];
    if (u.level != null) st.push('수준 ' + u.level);
    if (u.hours != null) st.push('표준 훈련시간 ' + u.hours + '시간');
    if (u.subs && u.subs.length) st.push('세분류 ' + n0(u.subs.length) + '곳에 걸침');
    var acts = ent && ent.acts ? ent.acts : (rec.e || []).map(function (e) { return cleanAct(e.f); }).filter(Boolean).slice(0, 4);
    var h = '<section class="ins" aria-label="한눈에 보기"><div class="insHd"><span class="insKick">한눈에 · 능력단위 실무</span><h3 class="insT">이 업무가 뭐 하는 거예요?</h3></div>';
    h += '<p class="insLine">' + esc((ent && ent.line) || ('「' + u.name + '」 업무로, ' + acts.join(', ') + ' 등을 수행하는 능력단위입니다.')) + '</p>';
    if (acts.length) h += '<ul class="insActs">' + acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    h += ksaStrip(ent && ent.ksa);
    if (ent && ent.kw && ent.kw.length) h += '<p class="insKw"><b>빈출 키워드</b>' + ent.kw.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</p>';
    if (st.length) h += '<p class="insStat">' + st.join(' · ') + '</p>';
    h += insLinks();
    h += insQHtml(unitQs(u, rec), '질문은 이 능력단위의 KSA 원문 항목을 그대로 인용해 만든 틀입니다. 실제 채용 질문이 아니며, 원문에 없는 내용은 넣지 않았습니다.');
    return h + '</section>';
  }

  /* ───── 상세 ───── */
  var X = '<div class="det-x"><button type="button" data-close>닫기</button></div>';
  function lk(s, c, extra) { var x = s === 'job' ? T.J[c] : node(s, c); if (!x) return ''; return '<button type="button" data-go="' + s + '|' + esc(c) + '">' + (s === 'job' ? '' : '<span class="cd">' + esc(c) + '</span>') + '<span class="nm">' + esc(x.name) + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + (extra ? '<span class="ct">' + extra + '</span>' : '') + '</button>'; }
  var NONE = '<span class="none">공식 매핑 자료 없음</span>';
  function renderDet(sel, quiet) {
    var h = X, s = sel.s, c = sel.c;
    if (s === 'job') { h += jobDet(T.J[c]); }
    else {
      var x = node(s, c); if (!x) { $('det').innerHTML = pickHtml(); return; }
      h += '<div class="tags">' + badge(s) + '<span class="bd" style="--c:var(--dim)">' + lvName(x) + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + '</div>';
      h += '<h2>' + esc(x.name) + '</h2><p class="path num">' + esc(c) + '</p>' +
        '<div class="insWrap" data-ins-s="' + s + '" data-ins-c="' + esc(c) + '"></div>' + upHtml(x);
      if (s === 'ncs') h += ncsDet(x); else if (s === 'keco') h += kecoDet(x); else h += kscoDet(x);
      var ks = kids(s, c); if (ks.length) h += '<h3>아래 ' + lvName(ks[0]) + ' <small>' + n0(ks.length) + '개 · 왼쪽 목록에서 고릅니다</small></h3>';
    }
    if (s !== 'job' && T.meta.corrections) T.meta.corrections.forEach(function (k) { if (k.code === c && s === 'keco') h += '<p class="path">원자료 오기 정정: 「' + esc(k.asis) + '」 → 「' + esc(k.tobe) + '」</p>'; });
    $('det').innerHTML = h; if (!quiet) $('det').scrollTop = 0;
    fillInsight($('det').querySelector('[data-ins-s]'));
  }
  /* 올라가기: 지금 항목이 어느 소·중·대분류에서 왔는지 한 칸씩 위로 */
  function upHtml(x, title) {
    var p = pathOf(x).slice(0, -1).reverse(); if (!p.length) return '';
    return '<h3>' + (title || '올라가기') + ' <small>' + SYS[x.sys].name + ' · 누르면 그 분류로 이동</small></h3><ol class="up">' + p.map(function (y) {
      return '<li><button type="button" data-go="' + y.sys + '|' + esc(y.code) + '"><span class="lv">↑ ' + lvName(y) + '</span><span class="cd">' + esc(y.code) + '</span><span class="nm">' + esc(y.name) + '</span></button></li>'; }).join('') + '</ol>';
  }
  function ncsDet(x) {
    var h = '', minor = x.code.length >= 6 ? x.code.slice(0, 6) : null;
    if (minor) {
      var ke = T.NK[minor] || [];
      h += '<h3>이어지는 직업(KECO 세분류) <small>공식 연결은 NCS 소분류 기준' + (x.code.length > 6 ? ' · 「' + esc((node('ncs', minor) || {}).name || minor) + '」' : '') + '</small></h3>';
      h += ke.length ? '<div class="lk">' + ke.map(function (k) { return lk('keco', k, (T.JK[k] || []).length ? '직업 ' + (T.JK[k] || []).length : ''); }).join('') + '</div>' : NONE;
      var tr = (T.TR[x.code] || []).concat(x.code.length > 6 ? [] : []).filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (tr.length) h += '<h3>국가기간·전략산업직종 <small>공식 연결 훈련직종</small></h3><div class="chips">' + tr.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    if (x.lv === 'sub' || x.code.length === 8) {
      var u = T.U[x.code] || [];
      h += '<h3>능력단위 <small>' + u.length + '개 · 누르면 KSA(지식·기술·태도)</small></h3>';
      h += u.length ? '<div class="units">' + u.map(unitRow).join('') + '</div>' : '<p class="path">연결된 능력단위 자료가 없습니다.</p>';
    }
    return h;
  }
  function unitRow(u) { return '<button type="button" class="unit" data-unit="' + esc(u.code) + '"><span class="nm">' + esc(u.name) + (u.sub_link === 'code' ? '<span class="cdlk" title="고시 별표에 없어 분류번호로 이은 연결">번호 연결</span>' : '') + '</span><span class="mt">수준 ' + (u.level == null ? '—' : u.level) + '<br>' + (u.hours == null ? '—' : u.hours + '시간') + '</span></button>'; }
  function kecoDet(x) {
    if (x.lv !== 'sub') return '';
    var h = '<h3>표준직업분류(KSCO) <small>세분류 1:1 공식 연결</small></h3>';
    var ks = T.KK[x.code]; h += ks ? '<div class="lk">' + lk('ksco', ks) + '</div>' : NONE;
    var nm = T.KN[x.code] || [];
    h += '<h3>필요한 직무(NCS 소분류) <small>공식 연결</small></h3>' + (nm.length ? '<div class="lk">' + nm.map(function (c) { return lk('ncs', c); }).join('') + '</div>' : NONE);
    return h + jobsBlock(T.JK[x.code] || []);
  }
  function kscoDet(x) {
    var sub = x.lv === 'detail' ? x.parent : x.lv === 'sub' ? x.code : null; if (!sub) return '';
    var h = '<h3>역추적 <small>KSCO → KECO → NCS → 능력단위</small></h3><ol class="chain">';
    h += '<li style="--c:var(--c-ksco)"><p class="st">KSCO 세분류</p><div class="lk">' + lk('ksco', sub) + '</div></li>';
    var ke = T.SK[sub] || [];
    if (!ke.length) { h += '<li class="cut"><p class="st" style="color:var(--warn)">KECO 세분류</p>' + NONE + '</li></ol>'; return h + jobsBlock(T.JS[sub] || []); }
    h += '<li style="--c:var(--c-keco)"><p class="st">KECO 세분류</p><div class="lk">' + ke.map(function (k) { return lk('keco', k); }).join('') + '</div></li>';
    var nm = []; ke.forEach(function (k) { (T.KN[k] || []).forEach(function (m) { if (nm.indexOf(m) < 0) nm.push(m); }); });
    if (!nm.length) { h += '<li class="cut"><p class="st" style="color:var(--warn)">NCS 소분류</p>' + NONE + '</li></ol>'; return h + jobsBlock(T.JS[sub] || []); }
    h += '<li style="--c:var(--c-ncs)"><p class="st">NCS 소분류</p><div class="lk">' + nm.map(function (m) { return lk('ncs', m); }).join('') + '</div></li>';
    var subs = []; nm.forEach(function (m) { kids('ncs', m).forEach(function (y) { subs.push(y); }); });
    h += '<li style="--c:var(--c-ncs)"><p class="st">NCS 세분류 → 능력단위</p><div class="lk">' + subs.map(function (y) { return lk('ncs', y.code, '능력단위 ' + (T.U[y.code] || []).length); }).join('') + '</div></li></ol>';
    return h + jobsBlock(T.JS[sub] || []);
  }
  function jobsBlock(ids) {
    if (!ids.length) return '<h3>이 분류의 직업 <small>고용24</small></h3><p class="path">연결된 직업이 없습니다.</p>';
    return '<h3>이 분류의 직업 <small>고용24 ' + n0(ids.length) + '개</small></h3><div class="lk">' + ids.map(function (k, i) { return (i >= 12 ? lk('job', k).replace('<button ', '<button hidden ') : lk('job', k)); }).join('') + (ids.length > 12 ? '<button type="button" class="morebtn" data-jl>' + n0(ids.length - 12) + '개 더 보기</button>' : '') + '</div>';
  }
  function jobDet(x) {
    if (!x) return pickHtml();
    var h = '<div class="tags">' + badge('job') + '</div><h2>' + esc(x.name) + '</h2><p class="path num">고용24 직업코드 ' + esc(x.konet) + '</p>';
    h += '<div class="insWrap" data-ins-s="job" data-ins-c="' + esc(x.konet) + '"></div>';
    var nm = T.KN[x.keco_code] || [];
    h += '<h3>세 분류에서 이 직업은 <small>공식 매핑만</small></h3><div class="jc">';
    h += '<div class="r" style="--c:var(--c-ncs)"><b>NCS 직무</b><div class="v">' + (nm.length ? '<div class="lk">' + nm.map(function (m) { return lk('ncs', m); }).join('') + '</div>' : NONE) + '</div></div>';
    h += '<div class="r" style="--c:var(--c-keco)"><b>KECO</b><div class="v"><div class="lk">' + lk('keco', x.keco_code) + '</div></div></div>';
    h += '<div class="r" style="--c:var(--c-ksco)"><b>KSCO</b><div class="v">' + (x.ksco_code && node('ksco', x.ksco_code) ? '<div class="lk">' + lk('ksco', x.ksco_code) + '</div>' : NONE) + '</div></div></div>';
    var ke = node('keco', x.keco_code), ks = x.ksco_code && node('ksco', x.ksco_code);
    if (ke) h += upHtml({ sys: 'keco', parent: ke.parent, code: '', name: '' }, '어디에서 왔나 · 고용직업분류').replace('<ol class="up">', '<ol class="up"><li><button type="button" data-go="keco|' + esc(ke.code) + '"><span class="lv">· 세분류</span><span class="cd">' + esc(ke.code) + '</span><span class="nm">' + esc(ke.name) + '</span></button></li>');
    if (ks) h += upHtml({ sys: 'ksco', parent: ks.parent, code: '', name: '' }, '어디에서 왔나 · 표준직업분류').replace('<ol class="up">', '<ol class="up"><li><button type="button" data-go="ksco|' + esc(ks.code) + '"><span class="lv">· 세분류</span><span class="cd">' + esc(ks.code) + '</span><span class="nm">' + esc(ks.name) + '</span></button></li>');
    return h;
  }

  /* ───── 능력단위 · KSA ───── */
  var KI = null, KS = {};
  function openUnit(code) {
    var u = T.UC[code]; if (!u) return; var back = UI.sel;
    var head = X + '<button type="button" class="back" data-back="' + back.s + '|' + esc(back.c) + '">‹ ' + esc((back.s === 'job' ? T.J[back.c] : node(back.s, back.c) || {}).name || '') + '</button>' +
      '<div class="tags">' + badge('ncs') + '<span class="bd" style="--c:var(--dim)">능력단위</span>' + (u.in_notice ? '' : '<span class="bd lg">고시 별표 밖</span>') + (u.sub_link === 'code' ? '<span class="bd lg">분류번호로 이은 연결</span>' : '') + '</div>' +
      '<h2>' + esc(u.name) + '</h2><p class="path num">' + esc(u.code) + ' · 수준 ' + (u.level == null ? '—' : u.level) + ' · 표준 훈련시간 ' + (u.hours == null ? '—' : u.hours + '시간') + '</p>' +
      '<div class="insWrap" id="uIns"></div><h3>KSA <small>지식 · 기술 · 태도 — 원문 그대로</small></h3>';
    $('det').innerHTML = head + '<p class="loading">KSA를 불러오고 있습니다…</p>'; $('det').scrollTop = 0;
    var mj = u.code10.slice(0, 2);
    (KI ? Promise.resolve(KI) : fetch('./data/ksa/index.json', { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { KI = j; return j; }))
      .then(function (ix) { var sh = null; ix.shards.forEach(function (x) { if (x.major === mj) sh = x; }); if (!sh) return null; return KS[mj] || fetch('./data/ksa/' + sh.file.split('/').pop(), { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { KS[mj] = j; return j; }); })
      .then(function (sd) {
        if (!$('det').querySelector('[data-back]')) return;
        var rec = sd && sd.units && sd.units[u.code], h = head;
        if (!rec || !rec.e || !rec.e.length) h += '<span class="none">KSA 원천 자료 없음</span>';
        else h += '<div class="ksa">' + rec.e.map(function (el, i) {
          return '<details class="el"' + (i === 0 ? ' open' : '') + '><summary>' + esc(el.f) + '</summary><div class="kb">' + [['k', '지식', 'var(--c-ncs)'], ['s', '기술', 'var(--c-keco)'], ['a', '태도', 'var(--c-ksco)']].map(function (z) {
            var a = el[z[0]] || []; return '<div style="--c:' + z[2] + '"><h4>' + z[1] + '</h4>' + (a.length ? '<ul>' + a.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="nil">원천에 없음</p>') + '</div>';
          }).join('') + '</div></details>';
        }).join('') + '</div>';
        h += '<p class="path" style="margin-top:12px">출처 · 한국산업인력공단 국가직무능력표준 정보_GW(공공데이터포털 15157547, 이용허락범위 제한 없음)</p>';
        $('det').innerHTML = h;
        drawUnitInsight(u, rec);   /* 위에서 innerHTML을 새로 그리므로 «그 뒤에» 채운다 */
      }).catch(function () { if ($('det').querySelector('[data-back]')) $('det').innerHTML = head + '<p class="empty">KSA 자료를 불러오지 못했습니다.</p>'; });
  }
  function drawUnitInsight(u, rec) {
    var box = $('uIns'); if (!box) return;
    var key = u.code; box.setAttribute('data-ins-key', key);
    var apply = function (ent) {
      if (box.getAttribute('data-ins-key') !== key) return;
      if (!rec || !rec.e || !rec.e.length) {
        box.innerHTML = '<section class="ins"><div class="insHd"><span class="insKick">한눈에 · 능력단위</span><h3 class="insT">이 업무가 뭐 하는 거예요?</h3></div>' +
          '<p class="insNo">이 능력단위에는 KSA 원천 자료가 없어 한 줄 정의와 면접 예상 질문을 만들지 않았습니다. 원자료에 없는 내용은 넣지 않습니다.</p>' + insLinks() + '</section>';
        return;
      }
      box.innerHTML = unitCard(u, ent, rec);
    };
    insShard('units', u.code10.slice(0, 2)).then(function (pk) { apply(pk.units[u.code]); }
    ).catch(function () { apply(null); });
  }
  $('det').addEventListener('click', function (e) { var b; if ((b = e.target.closest('[data-close]'))) { closeSheet(); e.stopPropagation(); } });

  /* ───── 휴대폰 시트 ───── */
  var last = null;
  function openSheet() { if (mq.matches) return; var w = $('detWrap'); if (w.classList.contains('on')) return; last = d.activeElement; w.classList.add('on'); d.documentElement.style.overflow = 'hidden'; setTimeout(function () { $('det').focus({ preventScroll: true }); }, 30); }
  function closeSheet() { var w = $('detWrap'); if (!w.classList.contains('on')) return; w.classList.remove('on'); d.documentElement.style.overflow = ''; if (last && last.focus) last.focus({ preventScroll: true }); }
  $('detWrap').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  mq.addEventListener ? mq.addEventListener('change', function () { closeSheet(); }) : null;

  /* ───── 출처·한계 ───── */
  function renderSrc() {
    var h = '<section class="pane"><h2>출처 · 라이선스</h2><ul class="sl">' + T.sources.map(function (s) { return '<li><b>' + esc(s.name) + '</b><span>' + esc(s.publisher) + ' · <span class="lc">' + esc(s.license) + '</span> · 기준 ' + esc(s.base_date) + '</span><span>쓰임: ' + esc(s.used_for) + '</span>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">원자료 안내 ↗</a>' : '') + '</li>'; }).join('');
    h += '</ul></section><section class="pane"><h2>알려진 한계</h2><ol class="lim">';
    var c = T.meta.counts, v = T.meta.coverage;
    [
      'NCS ↔ KECO 공식 매핑은 NCS 소분류 단위로만 있고, KECO 세분류 ' + n0(c.keco.sub) + '개 가운데 ' + n0(Object.keys(T.KN).length) + '개만 덮습니다. 없는 연결은 「자료 없음」이지 「관계 없음」이 아닙니다.',
      'KECO 세분류 ' + n0(c.keco.sub - v.keco_sub_with_ksco) + '개는 KSCO 연결이 없고, 고용24 직업 ' + n0(v.jobs_total - v.jobs_with_ksco) + '개는 KSCO가 비어 있습니다.',
      '능력단위 일부는 고시 별표에 없어 분류번호로 이었습니다(「번호 연결」 표시).',
      'NCS ' + n0(v.ncs_legacy_codes) + '개 코드는 현행 고시에 없습니다(「현행 고시에 없음」 표시, 건수에 합산하지 않음).',
      'KSA는 능력단위요소별 원문 목록이며, 원천에 없는 능력단위는 「KSA 원천 자료 없음」으로 둡니다.',
      'KECO 2025는 2018년판과 코드 번호가 다릅니다. 예전 자료와 코드로 섞지 마세요.'
    ].forEach(function (t) { h += '<li>' + t + '</li>'; });
    h += '</ol>' + (T.meta.corrections || []).map(function (k) { return '<p class="foot">원자료 오기 정정 · KECO ' + esc(k.code) + ' 「' + esc(k.asis) + '」 → 「' + esc(k.tobe) + '」</p>'; }).join('');
    h += '<p class="foot">' + esc(T.meta.notice) + ' 워크넷 직업사전·한국직업전망 등 재가공이 허용되지 않는 자료는 쓰지 않았습니다.</p></section>';
    $('src').innerHTML = h;
  }
})();
