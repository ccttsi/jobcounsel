/* Emerging Industry — data/emerging.json(스키마 v1.0.0, data/SCHEMA.md)을 읽기만 해서 그린다.
   수집·번역·외부 API 호출은 이 파일에 넣지 않는다. 모르는 필드는 무시한다(전방 호환). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var BASE = 'data/';
  var main = $('main');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function fmt(v, d) { if (v == null || isNaN(v)) return ''; return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d == null ? 3 : d }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayKey() { var t = new Date(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
  var TRACK = { 'KOGL-1': 'A', 'KOGL-0': 'A', 'PUBLIC-DOMAIN': 'A', 'CC-BY-4.0': 'A', 'OECD': 'A', 'WEF': 'A', 'IAEA': 'A', 'PRESS': 'B' };

  var UI = { date: '', item: 0, sector: 'all', ym: 0, calMode: 'd', calYear: 0, filterSector: 'all', filterCat: 'all', filterPage: 0 };
  var DATA = null, DAY = null, cache = {}, LINKS = {};
  var BRIEF = null;                       /* 오늘의 브리핑(briefing/data/briefing.json) — 연결 칩에만 쓴다 */

  /* ───────── 도표 ───────── */

  function ticks(lo, hi, n) {
    var span = hi - lo || 1, raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag, step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var out = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
    return out;
  }
  /* 도표 — 카드가 실제로 그려진 폭(px)에 맞춰 그린다. X축 이름표가 제 칸에 다 들어가면 그대로 두고,
     하나라도 넘칠 때만 짧은 이름 + ⓘ(말풍선)로 접는다(briefing과 같은 규칙·같은 공용 모듈). */
  var CW = { PL: 42, PR: 12, PT: 14, H: 110 };
  function chart(m) {
    if (!m || !arr(m.labels).length || !arr(m.series).length) return '';
    return '<figure class="fig" data-cvm></figure>';
  }
  function chartInner(m, w) {
    var labels = arr(m.labels), S = arr(m.series).slice(0, 3), n = labels.length;
    var all = []; S.forEach(function (s) { all = all.concat(arr(s.values).filter(function (v) { return v != null && !isNaN(v); })); });
    if (!all.length) return '';
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    /* 막대는 언제나 0에서 시작한다(0이 아닌 바닥은 차이를 과장한다). 선은 값 범위에 맞춘다. */
    var zero = m.chart !== 'line';
    if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    var pad = (hi - lo) * 0.16 || 1;
    hi += pad; if (!zero) lo -= pad;
    var tk = ticks(lo, hi, 3);
    lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
    var pl = CW.PL, pr = CW.PR, pt = CW.PT;
    var iw = Math.max(60, w - pl - pr), slot = iw / n;
    var ax = JC_AXL.plan(labels, { width: iw, font: 11, gap: 9 });
    var fold = ax.fold, PB = fold ? 34 : 24, H = pt + CW.H + PB;
    var y = function (v) { return pt + (hi - v) / (hi - lo || 1) * CW.H; };
    var g = '', lowLab = 0;
    /* 글자 폭만큼 도표 밖으로 나가지 않게 가운데를 당긴다(선그래프의 양끝 이름표) */
    var midX = function (x, t, fs, wt) {
      var hw = JC_AXL.measure(t, fs, wt) / 2;
      if (x - hw < 1) x = 1 + hw; if (x + hw > w - 1) x = w - 1 - hw;
      return x;
    };

    tk.forEach(function (t) {
      g += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (pl - 6) + '" y="' + (y(t) + 3.4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="var(--dim)">' + esc(fmt(t, 2)) + '</text>';
    });

    var xOf;
    if (m.chart === 'line') {
      xOf = function (i) { return n === 1 ? pl + iw / 2 : pl + (iw / (n - 1)) * i; };
      S.forEach(function (s, si) {
        var pts = []; arr(s.values).forEach(function (v, i) { if (v != null && !isNaN(v)) pts.push([xOf(i), y(v), v]); });
        if (pts.length > 1) g += '<polyline fill="none" stroke="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '" stroke-width="' + (s.emphasis ? 2.2 : 1.5) + '" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p) {
          g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (s.emphasis ? 3 : 2.4) + '" fill="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '"/>';
          if (si === 0) {
            var ltxt = fmt(p[2], 2), lw = JC_AXL.measure(String(ltxt), 10.5, 700), lx = p[0];
            if (lx - lw / 2 < 1) lx = 1 + lw / 2; else if (lx + lw / 2 > w - 1) lx = w - 1 - lw / 2;
            g += '<text x="' + lx.toFixed(1) + '" y="' + (p[1] - 7).toFixed(1) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)">' + esc(ltxt) + '</text>';
          }
        });
      });
    } else {
      xOf = function (i) { return pl + slot * i + slot / 2; };
      var base = y(Math.max(lo, Math.min(hi, 0))), k = S.length;
      var bw = Math.min(40, (slot * 0.62) / k);
      labels.forEach(function (lb, i) {
        var cx = xOf(i);
        S.forEach(function (s, j) {
          var v = arr(s.values)[i]; if (v == null || isNaN(v)) return;
          var x = cx - (bw * k + (k - 1) * 4) / 2 + (bw + 4) * j;
          var yv = y(v), top = Math.min(yv, base), h = Math.max(1.5, Math.abs(yv - base));
          g += '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '"/>';
          var ly = v >= 0 ? top - 4 : top + h + 10;
          if (v < 0) lowLab = Math.max(lowLab, ly);   /* 0 아래로 내려간 값 라벨 — 축 이름표 줄을 밀아낸다 */
          /* 도표 오른쪽·왼쪽 밖으로 값 라벨이 넘치지 않게 가운데를 당긴다 */
          var vtxt = fmt(v, 2), vw2 = JC_AXL.measure(String(vtxt), 10.5, 700), vcx = x + bw / 2;
          if (vcx - vw2 / 2 < 1) vcx = 1 + vw2 / 2; else if (vcx + vw2 / 2 > w - 1) vcx = w - 1 - vw2 / 2;
          g += '<text x="' + vcx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)">' + esc(vtxt) + '</text>';
        });
      });
      g += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + base.toFixed(1) + '" y2="' + base.toFixed(1) + '" stroke="var(--line-2)" stroke-width="1"/>';
    }

    /* 0 아래 값 라벨이 축 이름표 줄을 침범하면 도표 아래를 그만큼 늘린다(라벨을 지우지 않는다). */
    if (lowLab > pt + CW.H) {
      PB = Math.max(PB, Math.ceil(lowLab + 25 - pt - CW.H));
      H = pt + CW.H + PB;
    }

    /* X축 이름표 — 다 들어가면 그대로, 넘치면 짧은 이름 1줄 + ⓘ(부가설명은 말풍선에서만) */
    /* 접었을 때 ⓘ는 «보이는 이름에서 빠진 것이 있는 칸»에만 — 숨긴 게 없는 칸(예: 2022)은 눌러도 같은 글자만 떠서 중복이었다
       (2026-11-24 태화님 「말풍선 내용과 아래 이름표가 중복」). */
    var hid = function (it) { var f = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); }; return f(it.full) !== f(it.coreText); };
    var axs = '';
    if (!fold) {
      labels.forEach(function (lb, i) {
        axs += '<text x="' + midX(xOf(i), lb, 11, 400).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(lb) + '</text>';
      });
    } else {
      ax.items.forEach(function (it, i) {
        var cx = midX(xOf(i), it.coreText, 11, 600).toFixed(1);
        axs += '<text x="' + cx + '" y="' + (H - 22) + '" text-anchor="middle" font-size="11" font-weight="600" fill="var(--muted)">' + esc(it.coreText) + '</text>';
        if (hid(it)) axs += JC_AXL.icon(+cx, H - 9, i);
      });
      ax.items.forEach(function (it, i) {
        if (!hid(it)) return;   /* 숨긴 내용이 없는 칸은 누를 거리가 없다 */
        var x = Math.max(0, xOf(i) - slot / 2), wd = Math.min(w - x, slot);
        g += '<rect class="axh" x="' + x.toFixed(1) + '" y="0" width="' + wd.toFixed(1) + '" height="' + H + '" pointer-events="all" data-ax="' + i + '" data-axl="' + esc(it.full) + '" role="button" tabindex="0" aria-expanded="false" aria-label="' + esc(it.full) + ' 전체 이름 보기"/>';
      });
    }

    var aria = S.map(function (s) { return s.name + ': ' + labels.map(function (lb, i) { var v = arr(s.values)[i]; return lb + ' ' + (v == null ? '값 없음' : fmt(v, 2)); }).join(', '); }).join(' / ');
    var legend = S.length > 1 ? '<span>' + S.map(function (s) { return esc(s.name); }).join(' · ') + '</span>' : '';
    return '<div class="fig-h"><b>' + esc(m.label) + '</b><span>' + esc(m.unit || '') + (m.cagr != null ? ' · 연평균 ' + esc(fmt(m.cagr, 1)) + '%' : '') + '</span></div>' +
      '<svg class="chs" viewBox="0 0 ' + Math.round(w) + ' ' + H + '" width="' + Math.round(w) + '" height="' + H + '" role="img" aria-label="' + esc(aria + ' (단위 ' + (m.unit || '') + ')') + '">' + axs + g + '</svg>' +
      '<figcaption>' + (legend ? legend + ' · ' : '') + (m.note ? esc(m.note) : '') + '</figcaption>';
  }

  /* 기사가 그려진 뒤 실제 폭으로 도표를 그린다. 폭이 바뀌면 다시 그린다. */
  function paintFig(fig) {
    if (!fig || !fig._m) return;
    var st = window.getComputedStyle(fig);
    var w = Math.round(fig.clientWidth - (parseFloat(st.paddingLeft) || 0) - (parseFloat(st.paddingRight) || 0));
    if (w < 80) return;
    if (fig._w === w && fig.firstChild) return;
    JC_AXL.close();
    JC_AXL.font(st.fontFamily);
    fig.innerHTML = chartInner(fig._m, w);
    fig._w = w;
    if (fig.firstChild) JC_AXL.bind(fig);
  }
  var figRO = window.ResizeObserver ? new ResizeObserver(function (list) {
    for (var i = 0; i < list.length; i++) paintFig(list[i].target);
  }) : null;
  function paintCharts(root, it) {
    var fig = root.querySelector('figure.fig[data-cvm]');
    if (!fig) return;
    if (it && it.market) fig._m = it.market;
    if (!fig._m) return;
    if (figRO && !fig._ro) { fig._ro = 1; figRO.observe(fig); }
    paintFig(fig);
  }

  /* ───────── 달력 ───────── */
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function ymOf(s) { var p = String(s).split('-'); return +p[0] * 12 + (+p[1] - 1); }
  function ymLabel(ym) { return Math.floor(ym / 12) + '년 ' + (ym % 12 + 1) + '월'; }
  function latestYm() { var d = arr(DATA && DATA.archive_dates); return d.length ? ymOf(d[d.length - 1]) : ymOf('2026-11'); }
  function nowYm() { var t = new Date(); return t.getFullYear() * 12 + t.getMonth(); }
  function minYm() {                                                            /* 최소 월 = 보관된 가장 이른 지면의 달 */
    var d = arr(DATA && DATA.archive_dates);
    return d.length ? ymOf(d[0]) : nowYm();
  }
  function maxYm() { return Math.max(nowYm(), latestYm()); }                    /* 현실의 이번 달까지 자동 확장 */
  function minLabel() { return ymLabel(minYm()); }

  function calendar() { return UI.calMode === 'm' ? monthMatrix() : dayGrid(); }

  /* 1~12월 n×n — 지면이 있는 달만 고를 수 있고, 연도는 ‹ ›로 넘긴다. */
  function monthMatrix() {
    var y = UI.calYear, ds = arr(DATA && DATA.archive_dates), cnt = {}, inYear = 0;
    ds.forEach(function (d) { if (+d.slice(0, 4) === y) { var m = +d.slice(5, 7); cnt[m] = (cnt[m] || 0) + 1; inYear++; } });
    var minY = Math.floor(minYm() / 12), maxY = Math.floor(maxYm() / 12);
    var curY = +String(UI.date).slice(0, 4), curM = +String(UI.date).slice(5, 7);   /* 지금 보고 있는 지면의 달 */
    var g = '';
    for (var m = 1; m <= 12; m++) {
      var n = cnt[m] || 0;
      g += '<button type="button" class="cal-m' + (n ? ' on' : '') + '" data-mi="' + m + '"' + (n ? '' : ' disabled') +
        ' aria-pressed="' + (y === curY && m === curM) + '"' +
        ' aria-label="' + y + '년 ' + m + '월' + (n ? ' · 지면 ' + n + '일' : ' · 지면 없음') + '">' +
        '<b>' + m + '월</b><span class="num">' + (n ? n + '일' : '–') + '</span></button>';
    }
    return '<div class="cal"><div class="cal-h">' +
      '<button type="button" data-y="-1" aria-label="이전 해"' + (y <= minY ? ' disabled' : '') + '>' + CHEV(-1) + '</button>' +
      '<button type="button" class="m cal-t" data-mode="d" aria-label="' + y + '년 · 날짜 고르기로 돌아가기">' + y + '년</button>' +
      '<button type="button" data-y="1" aria-label="다음 해"' + (y >= maxY ? ' disabled' : '') + '>' + CHEV(1) + '</button>' +
      '<button type="button" class="cal-now" data-today aria-label="오늘 지면 또는 오늘달로 가기">오늘</button></div>' +
      '<div class="cal-mg" role="group" aria-label="월 고르기">' + g + '</div></div>';
  }

  function dayGrid() {
    var ym = UI.ym, y = Math.floor(ym / 12), mo = ym % 12;
    var start = new Date(y, mo, 1).getDay(), last = new Date(y, mo + 1, 0).getDate();
    var t = new Date(), tKey = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    var dates = {}; arr(DATA && DATA.archive_dates).forEach(function (d) { dates[d] = 1; });
    var inMonth = 0; Object.keys(dates).forEach(function (d) { if (ymOf(d) === ym) inMonth++; });
    var g = '', i, d, key;
    /* 6주(42칸) 고정 — 달마다 줄 수가 달라도 시트 높이와 머리 화살표가 위아래로 흔들리지 않게 뒤를 빈 칸으로 채운다. */
    for (i = 0; i < start; i++) g += '<span aria-hidden="true"></span>';
    for (d = 1; d <= last; d++) {
      key = y + '-' + pad(mo + 1) + '-' + pad(d);
      var has = !!dates[key], sel = key === UI.date, today = key === tKey;
      g += '<button type="button" class="cal-d' + (has ? ' on' : '') + (today && !sel ? ' cal-today' : '') + '"' + (has ? ' data-day="' + key + '"' : ' disabled') +
        (sel ? ' aria-current="true"' : '') + ' aria-label="' + key + (today ? ' · 오늘' : '') + (has ? ' 지면 열기' : ' 지면 없음') + '">' +
        d + (has ? '<i aria-hidden="true"></i>' : '') + '</button>';
    }
    for (i = start + last; i < 42; i++) g += '<span aria-hidden="true"></span>';
    return '<div class="cal"><div class="cal-h">' +
      '<button type="button" data-ym="-1" aria-label="이전 달"' + (ym <= minYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" class="m cal-t num" data-mode="m" aria-expanded="' + (UI.calMode === 'm') + '" aria-label="' + ymLabel(ym) + ' · 연도와 월 고르기">' + ymLabel(ym) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<button type="button" data-ym="1" aria-label="다음 달"' + (ym >= maxYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<button type="button" class="cal-now" data-today aria-label="오늘 지면 또는 오늘달로 가기">오늘</button></div>' +
      '<div class="cal-w" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>' +
      '<div class="cal-g" role="group" aria-label="' + ymLabel(ym) + ' 지면 달력">' + g + '</div>' +
      '<p class="cal-f">' + (inMonth ? '이 달의 지면 <b class="num">' + inMonth + '</b>일' : (ym > latestYm() ? '이 달의 지면은 아직 없습니다' : '이 달의 지면 없음')) + ' · 테두리는 오늘</p></div>';
  }

  /* 레일용 미니 달력: 월 이동 + 달력 열기(날짜 칸은 시트에서 44px) */
  function miniCal() {
    var ym = UI.ym;
    return '<div class="cal-h">' +
      '<button type="button" data-ym="-1" aria-label="이전 달"' + (ym <= minYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" class="m num" data-cal aria-label="' + ymLabel(ym) + ' · 달력에서 날짜 고르기">' + ymLabel(ym) + '</button>' +
      '<button type="button" data-ym="1" aria-label="다음 달"' + (ym >= maxYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>' +
      '<button type="button" class="cm-go" data-cal>달력에서 날짜 고르기</button>';
  }

  /* ───────── 지면 ───────── */
  function dayMeta(d) {
    var idx = arr(DATA && DATA.archive_index);
    for (var i = 0; i < idx.length; i++) if (idx[i].date === d) return idx[i];
    return { date: d, no: 0, weekday: '', title: d, items: [] };
  }
  function sectorCounts() {
    var c = { all: 0 };
    arr(DATA && DATA.archive_index).forEach(function (d) { d.items.forEach(function (it) { c[it.sector] = (c[it.sector] || 0) + 1; c.all++; }); });
    return c;
  }
  /* 분류 띠: ① 대분류(All · I~IV) ② 그 아래 세부분류(카테고리). 세부분류는 All이 아닐 때만 편다. */
  var ROMAN = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
  function sectorTabs(pressed) {
    var cnt = sectorCounts();
    function tab(id, glyph, label, n, cls) {
      return '<button type="button" class="tab' + (cls ? ' ' + cls : '') + '" data-sector="' + esc(id) + '" aria-pressed="' + (pressed === id) + '">' +
        '<span class="rl" aria-hidden="true">' + glyph + '</span>' +
        '<span class="sr">' + esc(label) + ' 기사 모아 보기 </span>' +
        '<sup class="num" aria-hidden="true">' + n + '</sup><span class="sr">건</span></button>';
    }
    return '<div class="secs" role="group" aria-label="산업 대분류">' + tab('all', 'All', '전체', cnt.all, 'tab-all') +
      arr(DATA.sectors).map(function (s) { return tab(s.id, ROMAN[s.no] || s.no, s.name, cnt[s.id] || 0, ''); }).join('') + '</div>';
  }
  function renderFilters() {
    var cats = catsFor(UI.sector);
    var head = dayMeta(UI.date);
    var ds = arr(DATA && DATA.archive_dates);
    var i = ds.indexOf(UI.date);
    $('filters').innerHTML =
      '<div class="mstrip">' +
        '<button type="button" class="ms-b" data-mv="-1" aria-label="이전 지면"' + (i <= 0 ? ' disabled' : '') + '>‹</button>' +
        '<button type="button" class="ms-c" id="calBtn" aria-haspopup="dialog"><b class="num">' + esc(UI.date.slice(5).replace('-', '.')) + ' ' + esc(head.weekday) + '</b><span>달력에서 고르기</span></button>' +
        '<button type="button" class="ms-b" data-mv="1" aria-label="다음 지면"' + (i >= ds.length - 1 ? ' disabled' : '') + '>›</button></div>' +
      sectorTabs(UI.sector) +
      /* All일 때는 세부분류 줄을 펴지 않는다(1차~4차를 고른 뒤에만 그 갈래를 보여 준다). */
      (UI.sector !== 'all' && cats.length ? '<div class="cats" role="group" aria-label="세부분류">' +
        '<button type="button" data-cat="all" aria-pressed="' + (UI.filterCat === 'all') + '"><b>전체 범주</b><em>' + sectorResults(UI.sector).length + '</em></button>' +
        cats.map(function (c) {
          var n = sectorResults(UI.sector, c.id).length;
          return '<button type="button" data-cat="' + esc(c.id) + '" aria-pressed="' + (UI.filterCat === c.id) + '">' + esc(c.name) + '<em>' + n + '</em></button>';
        }).join('') + '</div>' : '');
  }
  function renderRail() {
    var ds = arr(DATA && DATA.archive_dates).slice().reverse();
    $('rail').innerHTML =
      '<div class="cm" role="group" aria-label="지면 달력">' + miniCal() + '</div>' +
      '<div class="rail-h days-h"><b>지난 지면</b><span class="num">' + ds.length + '일</span></div>' +
      '<ul class="days">' + ds.map(function (d) {
        var t = dayMeta(d);
        return '<li><button type="button" data-day="' + esc(d) + '" aria-current="' + (d === UI.date) + '"><b class="num">' + esc(d.slice(5)) + '</b><span>' + esc(t.title) + '</span></button></li>';
      }).join('') + '</ul>';
  }

  /* ───────── 다른 자료실로 잇기 (emerging/data/links.json) ─────────
     링크는 그 섹터에서 실제로 결과가 나오는 검색어만 쓴다. 확인되지 않은 곳은 굵은 글자로만 둔다. */
  function coChip(label) {
    var c = (LINKS.companies || {})[label];
    if (!c) return '<span>' + esc(label) + '</span>';
    return '<a class="tagl" href="../company/?q=' + encodeURIComponent(c.q) + '" title="기업 명함첩에서 찾기">' + esc(label) + '<i aria-hidden="true">↗</i></a>';
  }
  function studyItem(s) {
    var L = (LINKS.studies || {})[s];
    if (!L) return '<li><span class="sname">' + esc(s) + '</span></li>';
    var acts = '';
    if (L.uq) acts += '<a href="../univ/?q=' + encodeURIComponent(L.uq) + '" aria-label="대학 학과에서 ' + esc(s) + ' 찾기">대학 <b class="num">' + fmt(L.un) + '</b>곳<i aria-hidden="true">↗</i></a>';
    if (L.gq) acts += '<a href="../grad/?q=' + encodeURIComponent(L.gq) + '" aria-label="대학원에서 ' + esc(s) + ' 찾기">대학원 <b class="num">' + fmt(L.gn) + '</b>건<i aria-hidden="true">↗</i></a>';
    return '<li><span class="sname">' + esc(s) + '</span>' + (acts ? '<span class="sacts">' + acts + '</span>' : '') + '</li>';
  }
  function jobLinks(j) {
    var L = (LINKS.jobs || {})[j.id] || {}, out = '';
    if (L.tax) out += '<a class="jl" href="../taxonomy/?q=' + encodeURIComponent(L.tax.q) + '"><span>직무 분류</span><b>' + esc(L.tax.q) + '</b><i aria-hidden="true">↗</i></a>';
    if (L.decal) out += '<a class="jl" href="../decalcomania/?q=' + encodeURIComponent(j.name) + '"><span>커리어데칼코마니</span><b>학과·직업 흐름</b><i aria-hidden="true">↗</i></a>';
    return out ? '<div class="jlx">' + out + '</div>' : '';
  }
  function playersBlock(it) {
    var p = it.players || {}, dom = arr(p.domestic), glob = arr(p.glob);
    if (!dom.length && !glob.length) return '';
    var row = function (label, list, intl) {
      return list.length ? '<div class="row"><b>' + label + '</b><div class="tags' + (intl ? ' intl' : '') + '">' + list.map(coChip).join('') + '</div></div>' : '';
    };
    return '<section class="pl2" aria-labelledby="plH"><div class="ph"><b id="plH">주요 플레이어</b><span>기업·기관 · 명함첩에 있으면 눌러서 엽니다</span></div>' + row('국내', dom) + row('해외', glob, 1) + '</section>';
  }

  function jobsBlock(it) {
    var byId = {}; arr(DAY.jobs).forEach(function (j) { byId[j.id] = j; });
    var leg = arr(it.jobs && it.jobs.legacy).map(function (k) { return byId[k]; }).filter(Boolean);
    var neo = arr(it.jobs && it.jobs.new).map(function (k) { return byId[k]; }).filter(Boolean);
    if (!leg.length && !neo.length) return '';
    var chip = function (j, kind) {
      return '<button type="button" class="chip" data-job="' + esc(j.id) + '" data-kind="' + kind + '" aria-haspopup="dialog"><span>' + esc(j.name) + '</span><span class="ar" aria-hidden="true">↗</span></button>';
    };
    return '<section class="jobs" aria-labelledby="jobH"><div class="jobs-h"><b id="jobH">직무 분석</b>' +
      '<button type="button" class="nl-btn" data-next="1" aria-haspopup="dialog"><span class="st" aria-hidden="true">✧</span>넥스트 롤 랩</button></div><div class="jg">' +
      '<div class="old"><span class="t"><i aria-hidden="true"></i>기존 직무</span><div class="chips">' + leg.map(function (j) { return chip(j, 'old'); }).join('') + '</div></div>' +
      '<div class="new"><span class="t"><i aria-hidden="true"></i>최근 등장한 직무</span><div class="chips">' + neo.map(function (j) { return chip(j, 'new'); }).join('') + '</div></div>' +
      '</div></section>';
  }

  function sourceLine(it) {
    var s = arr(DAY.sources).filter(function (x) { return x.id === it.source_id; })[0] || {};
    var L = s.license || {}, track = s.track || TRACK[L.type] || 'A', url = safeUrl(s.url);
    return '<div class="src"><span class="bd">' + (track === 'B' ? 'B · 사실만' : 'A · 재가공') + '</span>' +
      '<span>' + esc(s.name || '출처 미상') + ' · ' + esc(s.title || '') + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">원문</a>' : '') + '</div>';
  }

  /* ── 오늘의 데일리 브리핑 연결 ── 기사 주제와 같은 분야를 다룬 브리핑 카드가 있을 때만 칩을 붙인다. */
  var BKEYS = {
    ai: ['AI', '인공지능'], semicon: ['반도체'], battery: ['배터리', '이차전지'],
    energy: ['에너지', '전력', '원전'], climate: ['기후', '탄소', '재생에너지'], robotics: ['로봇'],
    content: ['콘텐츠', '게임', '미디어'], health: ['의료', '보건', '돌봄', '간호', '건강'],
    smartfarm: ['농업', '스마트팜'], 'agri-robot': ['농업', '농기계'], space: ['우주', '위성'],
    quantum: ['양자'], fintech: ['핀테크', '금융'], edu: ['직업훈련', '재교육', '교육'],
    material: ['소재'], 'bio-mfg': ['바이오'], security: ['보안'],
    logistics: ['물류', '운송', '모빌리티'], resource: ['식량', '자원']
  };
  function loadBrief() {
    get('../briefing/data/briefing.json').then(function (b) {
      BRIEF = { date: String((b.edition || {}).date || ''), cards: arr(b.cards) };
      if (DAY) renderArticle();          /* 브리핑이 늦게 도착해도 지금 기사에 칩만 더한다 */
    }).catch(function () { BRIEF = null; });
  }
  function briefFor(it) {
    if (!BRIEF) return null;
    var keys = BKEYS[it.cat] || [];
    if (!keys.length) return null;
    for (var i = 0; i < BRIEF.cards.length; i++) {
      var c = BRIEF.cards[i];
      var text = [c.category, c.theme_label, c.title].concat(arr(c.tags)).join(' ');
      for (var k = 0; k < keys.length; k++) if (text.indexOf(keys[k]) >= 0) return c;
    }
    return null;
  }
  function briefChip(it) {
    var c = briefFor(it);
    if (!c) return '';
    return '<a class="bl" href="../briefing/' + (BRIEF.date ? '?date=' + esc(BRIEF.date) : '') + '">' +
      '<span>Today’s Briefing</span><b>' + esc(c.theme_label || c.category || '') + '</b><i aria-hidden="true">↗</i></a>';
  }

  function renderArticle() {
    if (window.JC_AXL) JC_AXL.close();
    var items = arr(DAY && DAY.items).slice().sort(function (a, b) { return a.order - b.order; });
    if (!items.length) { $('art').innerHTML = '<p class="empty">이 날의 지면이 없습니다.</p>'; return; }
    UI.item = Math.max(0, Math.min(items.length - 1, UI.item));
    var it = items[UI.item];
    var sec = arr(DAY.sectors).filter(function (s) { return s.id === it.sector; })[0] || { no: '' };
    var cat = arr(DAY.categories).filter(function (c) { return c.id === it.cat; })[0] || {};
    var keys = arr(it.key_numbers).slice(0, 3);
    var ch = chart(it.market);
    $('art').innerHTML =
      '<div class="art-h"><span class="nx num">' + pad(UI.item + 1) + ' / ' + pad(items.length) + '</span>' +
        '<button type="button" class="cat" data-sector="' + esc(it.sector) + '" aria-haspopup="dialog" aria-label="' + esc(sec.no) + '차 산업 기사 모아 보기">' + esc(sec.no) + '차 산업</button>' +
        (cat.name ? '<button type="button" class="cat" data-cat="' + esc(it.cat) + '" aria-haspopup="dialog" aria-label="' + esc(cat.name) + ' 범주 기사 모아 보기">' + esc(cat.name) + '</button>' : '') +
        '</div>' +
      '<div class="pgs" role="group" aria-label="이 번호의 기사">' + items.map(function (x, i) {
        return '<button type="button" data-item="' + i + '" aria-current="' + (i === UI.item) + '" aria-label="' + (i + 1) + '번째 기사">' + pad(i + 1) + '</button>';
      }).join('') + '</div>' +
      '<h3>' + esc(it.title) + '</h3>' +
      '<div class="art-top"><div>' + (it.kicker ? '<p class="kick">' + esc(it.kicker) + '</p>' : '') + '<p class="stand">' + esc(it.summary) + '</p></div>' + ch + '</div>' +
      (keys.length ? '<ul class="keys">' + keys.map(function (k) {
        return '<li><span class="l">' + esc(k.label) + '</span><span class="v num">' + esc(k.value) + '</span><span class="n">' + esc(k.note || '') + '</span></li>';
      }).join('') + '</ul>' : '') +
      playersBlock(it) +
      jobsBlock(it) +
      briefChip(it) +
      chainBtn(it) +
      '<div class="art-f">' + sourceLine(it) + '<span class="pn"><button type="button" data-go="-1" aria-label="이전 기사"' + (UI.item ? '' : ' disabled') + '>←</button><button type="button" data-go="1" aria-label="다음 기사"' + (UI.item < items.length - 1 ? '' : ' disabled') + '>다음 →</button></span></div>';
    paintCharts($('art'), it);
  }

  function renderSide() {
    var items = arr(DAY.items).slice().sort(function (a, b) { return a.order - b.order; });
    var counts = {}, total = 0, charts = 0;
    arr(DATA.archive_index).forEach(function (d) { d.items.forEach(function (it) { counts[it.sector] = (counts[it.sector] || 0) + 1; total++; }); });
    arr(DAY.items).forEach(function (it) { if (it.market) charts++; });
    var mx = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }).concat([1]));
    var top = arr(DATA.sectors).slice().sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0); })[0];
    $('side').innerHTML =
      '<section class="card"><h4>이 번호</h4><p class="note num">기사 ' + items.length + '건 · 도표 ' + charts + '개 · 직무 ' + items.reduce(function (a, it) { return a + arr(it.jobs && it.jobs.legacy).length + arr(it.jobs && it.jobs.new).length; }, 0) + '개</p><p class="note" style="margin-top:4px">날짜마다 기사 수는 다릅니다. 기사마다 부제와 직무 칸이 붙습니다.</p></section>' +
      '<section class="card"><h4>섹터 분포 · ' + arr(DATA.archive_dates).length + '일</h4><ul class="bars">' + arr(DATA.sectors).map(function (s) {
        var v = counts[s.id] || 0;
        return '<li><span>' + esc(s.no) + '차</span><span class="tr"><i class="' + (s.no === (top ? top.no : '4') ? 'a' : '') + '" style="transform:scaleX(' + (v / mx).toFixed(3) + ')"></i></span><b>' + v + '</b></li>';
      }).join('') + '</ul><p class="note" style="margin-top:6px">기사 ' + total + '건 · ' + (top ? esc(top.no) + '차 산업이 가장 많습니다.' : '') + '</p></section>' +
      '<section class="card"><h4>지면 안내</h4><p class="note"><b>도표는 원자료 값을 다시 그린 것입니다.</b> 성장률은 공표된 두 값으로 계산했고, 공표 값이 없으면 비워 두었습니다. <b>직무 칸의 기업은 그 직무를 실제로 운영·채용하는 곳</b>만 적었습니다.</p></section>';
  }

  function renderMast() {
    var e = (DAY && DAY.edition) || {};
    var items = arr(DAY && DAY.items).slice().sort(function (a, b) { return a.order - b.order; });
    var idx = Math.max(0, Math.min(items.length - 1, UI.item));
    var it = items[idx] || {};
    $('mDate').textContent = e.date + ' ' + (e.weekday || '');
    $('mRead').textContent = (e.reading_minutes || 4) + '분 읽기';
    $('mDekNo').textContent = items.length ? pad(idx + 1) : '';
    /* 제호 아래 한 줄은 그 날의 테마가 아니라 지금 보고 있는 기사의 부제다. */
    var tx = $('mDek'), sub = it.subtitle || it.dek || it.title || e.title || '';
    if (tx.textContent !== sub) {
      tx.textContent = sub;
      tx.classList.remove('swap'); void tx.offsetWidth; tx.classList.add('swap');
    }
    $('mCount').textContent = items.length + '개 기사 · 도표 ' + items.filter(function (i) { return i.market; }).length + '개';
    var b = $('edBtn'); if (b) b.innerHTML = '<b>지난 지면</b> 섹터로 찾기';
  }

  function render() {
    if (!DAY) return;
    var n = arr(DAY.items).length;
    if (UI.item < 0) UI.item = 0;
    if (n && UI.item > n - 1) UI.item = n - 1;
    renderMast(); renderFilters(); renderRail(); renderArticle(); renderSide(); centerPgs();
    try {
      var q = '?date=' + UI.date + (UI.item ? '#i' + (UI.item + 1) : '');
      history.replaceState(null, '', location.pathname + q);
    } catch (err) {}
  }

  /* 기사 번호 줄: 지금 번호가 화면 밖이면 가운데로 데려온다(390px·9건에서 08·09 잘림). */
  function centerPgs() {
    var box = $('art') && $('art').querySelector('.pgs');
    if (!box) return;
    var cur = box.querySelector('[aria-current="true"]');
    if (!cur) return;
    if (box.scrollWidth <= box.clientWidth + 1) return;
    box.classList.add('can');          /* 넘치는 것이 있으면 양 끝을 흐리게 — 잘린 번호가 거슬리지 않게 */
    requestAnimationFrame(function () {
      box.scrollLeft = Math.max(0, cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2);
    });
  }

  /* ───────── 불러오기 ───────── */
  function get(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function loadDay(date, item) {
    var it = item == null ? 0 : item;
    if (cache[date]) { DAY = cache[date]; UI.date = date; UI.item = it; UI.ym = ymOf(date); render(); return Promise.resolve(); }
    return get(BASE + 'archive/' + date + '.json').then(function (d) {
      cache[date] = d; DAY = d; UI.date = date; UI.item = it; UI.ym = ymOf(date); render();
    }).catch(function () { DAY = DATA; UI.date = (DATA.edition || {}).date; render(); });
  }

  /* ───────── 시트·팝업 ───────── */
  var lastFocus = null;
  function lock(on) {
    if (on) {
      var sw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty('--sw', sw + 'px');
      document.documentElement.classList.add('is-locked');
    } else {
      document.documentElement.classList.remove('is-locked');
      document.documentElement.style.removeProperty('--sw');
    }
  }
  function trap(el) {
    return function (e) {
      if (e.key !== 'Tab') return;
      var f = el.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };
  }
  function closeSheet() {
    var s = $('sheet'); if (!s || s.hidden) return;
    s.classList.remove('open');
    setTimeout(function () { if (!s.classList.contains('open')) { s.hidden = true; s.innerHTML = ''; } }, 240);
    lock(false); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function openSheet(html, title, onOpen) {
    var s = $('sheet');
    lastFocus = document.activeElement;
    if (!s) { document.body.insertAdjacentHTML('beforeend', '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="shT" hidden></div>'); s = $('sheet'); }
    s.innerHTML = '<div class="sheet-in"><div class="sh-h"><b id="shT">' + esc(title) + '</b><button type="button" class="sh-x" data-close>닫기</button></div>' + html + '</div>';
    s.hidden = false; lock(true);
    s.onclick = function (e) {
      if (e.target === s || e.target.closest('[data-close]')) { closeSheet(); return; }
      if (onOpen) onOpen(e, s);
    };
    s.onkeydown = trap(s);
    requestAnimationFrame(function () { s.classList.add('open'); var c = s.querySelector('[data-close]'); if (c) c.focus({ preventScroll: true }); });
  }
  function sectorResults(sec, cat) {
    var out = [];
    arr(DATA.archive_index).forEach(function (d) {
      d.items.forEach(function (it) {
        if (sec !== 'all' && it.sector !== sec) return;
        if (cat && cat !== 'all' && it.cat !== cat) return;
        out.push({ date: d.date, wd: d.weekday, no: d.no, item: it });
      });
    });
    return out;
  }
  function catsFor(sec) {
    var seen = {}, out = [];
    arr(DATA.categories).forEach(function (c) {
      if (!c) return;
      if (sec !== 'all' && c.sector !== sec) return;
      if (seen[c.id]) return;
      seen[c.id] = 1;
      out.push(c);
    });
    /* 대분류 순서(1차→4차), 그 안에서는 이름 순 — ‘전체’에서도 흐름이 읽히게 */
    var ord = {};
    arr(DATA.sectors).forEach(function (s, i) { ord[s.id] = i; });
    return out.sort(function (a, b) { return (ord[a.sector] || 0) - (ord[b.sector] || 0) || String(a.name).localeCompare(String(b.name), 'ko'); });
  }
  /* 섹터 → 카테고리 두 단 필터. 카테고리를 고르면 그 안의 기사만 남는다. */
  /* 넥스트 롤 랩 — 기사 흐름에서 뽑은 ‘창직·창업 탐색용 가설’. 확정 직무가 아니다. */
  function openNext() {
    var day = DAY, items = arr(day.items).slice().sort(function (a, b) { return a.order - b.order; });
    var it = items[UI.item] || items[0] || { jobs: {}, title: '' };
    var rows = [], seen = {};
    (it.jobs && it.jobs.new || []).concat(it.jobs && it.jobs.legacy || []).forEach(function (id) {
      var j = jobById(id);
      if (!j) return;
      arr(j.next_roles).forEach(function (n) {
        if (seen[n.n]) return;
        seen[n.n] = 1;
        rows.push({ name: n.n, why: n.w, from: j.name, kind: j.kind });
      });
    });
    rows = rows.slice(0, 3);
    var html = '<p class="nl-warn"><b>먼저 알려 드립니다.</b> 아래는 확정된 직무나 산업이 아닙니다. 이 기사의 흐름(수치·기업·기술)에서 “이런 일이 생길 수 있다”고 그려 본 <b>창직·창업 탐색용 예측 가설</b>입니다.</p>' +
      (rows.length ? '<ul class="nl-list">' + rows.map(function (r) {
        return '<li><span class="k">' + (r.kind === 'new' ? '신규 직무에서 파생' : '기존 직무에서 파생') + '</span>' +
          '<h5>' + esc(r.name) + '</h5><p>' + esc(r.why) + '</p></li>';
      }).join('') + '</ul>' : '<p class="note">이 기사에서는 아직 파생 가설을 만들지 못했습니다.</p>') +
      '<p class="nl-src">바탕: 「' + esc(it.title) + '」의 직무 분석. 가설은 상담·진로 탐색의 대화 소재로만 쓰고, 채용·자격 정보는 공식 자료로 확인하세요.</p>';
    openSheet(html, '넥스트 롤 랩', null);
  }
  /* 지난 지면 찾기 — 목록은 다섯 건씩 쪽으로 나눈다(시트 안 세로 스크롤을 만들지 않는다).
     짧은 화면(아이폰 SE 등)에서는 네 건으로 줄여 시트가 넘치지 않게 한다. */
  var PER_PAGE = 5;
  function CHEV(dir) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="' + (dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
  }
  function perPage() { return window.innerHeight < 740 ? 4 : PER_PAGE; }
  function openFilter() {
    UI.filterPage = 0;
    function draw() {
      var per = perPage();
      var sec = UI.filterSector, cat = UI.filterCat;
      var all = sectorResults(sec, cat).slice().reverse();
      var pages = Math.max(1, Math.ceil(all.length / per));
      UI.filterPage = Math.max(0, Math.min(pages - 1, UI.filterPage));
      var rows = all.slice(UI.filterPage * per, UI.filterPage * per + per);
      var ghost = '';
      for (var gi = rows.length; gi < per; gi++) ghost += '<li class="ghost" aria-hidden="true"></li>';   /* 쪽을 넘겨도 상자 높이가 그대로 */
      /* 대분류가 ‘전체’일 때는 세부분류를 펼치지 않는다(1차~4차를 고른 뒤에만 그 갈래를 보여 준다). */
      var cats = sec === 'all' ? [] : catsFor(sec);
      var html = sectorTabs(sec) +
        (cats.length ? '<div class="flt cats" role="group" aria-label="세부분류">' +
          '<button type="button" data-fc="all" aria-pressed="' + (!cat || cat === 'all') + '"><span>전체 범주</span><span class="num">' + sectorResults(sec, 'all').length + '</span></button>' +
          cats.map(function (c) {
            return '<button type="button" data-fc="' + esc(c.id) + '" aria-pressed="' + (cat === c.id) + '"><span>' + esc(c.name) + '</span><span class="num">' + sectorResults(sec, c.id).length + '</span></button>';
          }).join('') + '</div>' : '') +
        '<ol class="res">' + (rows.length ? rows.map(function (r) {
          var s = arr(DATA.sectors).filter(function (x) { return x.id === r.item.sector; })[0] || {};
          var cc = arr(DATA.categories).filter(function (x) { return x.id === r.item.cat; })[0] || {};
          return '<li><button type="button" data-open="' + esc(r.date) + '" data-oi="' + esc(r.item.id) + '"><b class="num">' + esc(r.date.slice(5)) + ' ' + esc(r.wd) + '</b><span class="tw"><span class="tt">' + esc(r.item.title) + '</span><em>' + esc(s.no) + '차 · ' + esc(cc.name || '') + '</em></span></button></li>';
        }).join('') + ghost : '<li class="empty">이 범주의 기사가 아직 없습니다.</li>') + '</ol>' +
        (rows.length ? '<nav class="pager" aria-label="지난 지면 쪽 넘기기">' +
          '<button type="button" data-fp="-1" aria-label="이전 쪽"' + (UI.filterPage <= 0 ? ' disabled' : '') + '>' + CHEV(-1) + '</button>' +
          '<span class="pg num"><b>' + (UI.filterPage + 1) + '</b> / ' + pages + '</span>' +
          '<button type="button" data-fp="1" aria-label="다음 쪽"' + (UI.filterPage >= pages - 1 ? ' disabled' : '') + '>' + CHEV(1) + '</button></nav>' : '');
      openSheet(html, '섹터·카테고리로 찾기 · 지난 지면', function (e, s) {
        var b = e.target.closest('[data-sector]');
        if (b) { UI.filterSector = b.getAttribute('data-sector'); UI.sector = UI.filterSector; UI.filterCat = 'all'; UI.filterPage = 0; renderFilters(); draw(); return; }
        var c = e.target.closest('[data-fc]');
        if (c) { UI.filterCat = c.getAttribute('data-fc'); UI.filterPage = 0; renderFilters(); draw(); return; }
        var p = e.target.closest('[data-fp]');
        if (p) {
          var d = +p.getAttribute('data-fp');
          UI.filterPage += d; draw();
          requestAnimationFrame(function () {   /* 쪽을 넘겨도 초점은 쪽 넘김 단추에 남긴다 */
            var sh = $('sheet'), nb = sh && sh.querySelector('[data-fp="' + d + '"]');
            if (!nb || nb.disabled) nb = sh && sh.querySelector('[data-fp="' + (-d) + '"]');
            if (nb) nb.focus({ preventScroll: true });
          });
        }
      });
    }
    draw();
  }
  function focusCal(sel) {
    var s = $('sheet'), el = s && s.querySelector(sel);
    if (el) requestAnimationFrame(function () { el.focus({ preventScroll: true }); });
  }
  function openCalendar() {
    UI.calMode = 'd';
    UI.calYear = Math.floor(UI.ym / 12);
    /* 달을 옮길 때 달력 칸만 다시 그린다. 시트를 통째로 다시 그리면 누른 단추가 DOM에서
       떨어져 문서 단추 처리기가 같은 누름을 한 번 더 받아 달이 두 칸씩 건너뛴다. */
    function draw() {
      var sh = $('sheet'), wrap = sh && !sh.hidden && sh.querySelector('.calwrap');
      if (wrap) { wrap.innerHTML = calendar(); return; }
      var t = todayKey(), ds = arr(DATA.archive_dates), has = ds.indexOf(t) >= 0;
      var last = ds.length ? ds[ds.length - 1] : '';
      var tip = has ? '오늘(' + esc(t.slice(5).replace('-', '.')) + ') 지면이 있습니다'
        : '오늘(' + esc(t.slice(5).replace('-', '.')) + ')은 아직 지면이 없습니다' + (last ? ' · 가장 최근 ' + esc(last.slice(5).replace('-', '.')) : '');
      openSheet('<p class="note">지면은 <b>' + esc(minLabel()) + '</b>부터 볼 수 있습니다. ' + tip + '.</p><div class="calwrap" data-jc-still>' + calendar() + '</div>', '지면 달력',
        function (e) {
          var b, m;
          /* 달력 안의 누름은 여기서 끝낸다 — 다시 그리면 누른 단추가 DOM에서 떨어져
             문서 처리기가 같은 누름을 한 번 더 받고 달이 두 칸씩 움직이는 것을 막는다. */
          if (e.target.closest('[data-today],[data-ym],[data-y],[data-mode],[data-mi]')) e.stopPropagation();
          /* 오늘 — 오늘 지면이 있으면 그 지면을 바로 열고, 없으면 오늘이 있는 달로만 옮긴다. */
          if ((b = e.target.closest('[data-today]'))) {
            var tk = todayKey();
            UI.ym = nowYm(); UI.calMode = 'd';
            if (arr(DATA.archive_dates).indexOf(tk) >= 0) { closeSheet(); loadDay(tk); }
            else { draw(); focusCal('.cal-d.cal-today:not([disabled]), [data-mode]'); }
            return;
          }
          if ((b = e.target.closest('[data-ym]'))) { UI.ym += +b.getAttribute('data-ym'); draw(); focusCal('[data-mode]'); return; }
          if ((b = e.target.closest('[data-y]'))) { UI.calYear += +b.getAttribute('data-y'); draw(); focusCal('.cal-m:not([disabled])'); return; }
          if ((b = e.target.closest('[data-mode]'))) {
            if (UI.calMode === 'm') UI.calMode = 'd';
            else { UI.calMode = 'm'; UI.calYear = Math.floor(UI.ym / 12); }
            draw(); focusCal(UI.calMode === 'm' ? '.cal-m:not([disabled])' : '[data-mode]'); return;
          }
          if ((m = e.target.closest('[data-mi]'))) {
            UI.ym = UI.calYear * 12 + (+m.getAttribute('data-mi') - 1); UI.calMode = 'd';
            draw(); focusCal('[data-mode]'); return;
          }
        });
    }
    draw();
  }

  /* ──────── 연결고리 — 같은 범주(트랙)의 지난 지면을 한 줄기로 ────────
     범주에 한 건뿐이면 같은 산업(대분류)으로 넓힌다. 2건 미만이면 단추를 그리지 않는다. */
  function chainData(catId, sectorId) {
    var out = [], label = '', kind = 'cat';
    arr(DATA.archive_index).forEach(function (d) {
      arr(d.items).forEach(function (x) { if (catId && x.cat === catId) out.push({ date: d.date, wd: d.weekday, it: x }); });
    });
    var c = arr(DATA.categories).filter(function (x) { return x.id === catId; })[0] || {};
    label = c.name || '이 범주';
    if (out.length < 2 && sectorId) {
      kind = 'sector'; out = [];
      arr(DATA.archive_index).forEach(function (d) {
        arr(d.items).forEach(function (x) { if (x.sector === sectorId) out.push({ date: d.date, wd: d.weekday, it: x }); });
      });
      var s = arr(DATA.sectors).filter(function (x) { return x.id === sectorId; })[0] || {};
      label = s.no ? s.no + '차 산업' : '이 산업';
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.it.order || 0) - (b.it.order || 0); });
    return { entries: out, label: label, kind: kind, key: kind + ':' + (kind === 'cat' ? catId : sectorId) };
  }
  function chainOf(it) { return it ? chainData(it.cat, it.sector) : null; }
  function chainBtn(it) {
    var c = chainOf(it);
    if (!c || c.entries.length < 2) return '';
    return '<button type="button" class="cnrow" data-chain="' + esc(c.key) + '" aria-haspopup="dialog">' +
      '<span class="k">연결고리</span> <b>' + esc(c.label) + '</b><span class="n">로 이어진 지면 <b class="num">' + c.entries.length + '</b>건</span>' +
      '<span class="ar" aria-hidden="true">→</span></button>';
  }
  function openChain(key) {
    var p = String(key || '').split(':'), kind = p[0], id = p[1];
    var c = kind === 'sector' ? chainData('', id) : chainData(id, '');
    if (!c || c.entries.length < 2) return;
    var sec = arr(DATA.sectors).filter(function (x) { return x.id === (kind === 'sector' ? id : (arr(DATA.categories).filter(function (q) { return q.id === id; })[0] || {}).sector); })[0] || {};
    var sib = kind === 'sector' ? [] : arr(DATA.categories).filter(function (x) { return x.sector === sec.id && x.id !== id; });
    var sorted = arr(DAY && DAY.items).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var cur = sorted[Math.max(0, Math.min(sorted.length - 1, UI.item))] || {};
    var html = '<p class="note">「<b>' + esc(c.label) + '</b>」으로 이어진 지면 <b class="num">' + c.entries.length + '</b>건입니다. 누르면 그 지면으로 갑니다.</p>' +
      '<ol class="cres">' + c.entries.map(function (e) {
        var on = e.date === UI.date && e.it.id === cur.id;
        var cc = arr(DATA.categories).filter(function (x) { return x.id === e.it.cat; })[0] || {};
        return '<li><button type="button" data-open="' + esc(e.date) + '" data-oi="' + esc(e.it.id) + '" aria-current="' + !!on + '" aria-label="' + esc(e.date + ' ' + (e.wd || '') + ' ' + e.it.title) + '">' +
          '<b class="dt num">' + esc(e.date.slice(5)) + '<small>' + esc(e.date.slice(0, 4)) + ' ' + esc(e.wd || '') + '</small></b>' +
          '<span class="tw"><span class="tt">' + esc(e.it.title) + '</span><em>' + esc(cc.name || '') + '</em></span></button></li>';
      }).join('') + '</ol>' +
      (sib.length ? '<div class="cnchips"><b>같은 ' + esc(sec.no) + '차 산업의 다른 트랙</b><div>' + sib.map(function (x) {
        var n = chainData(x.id, '');
        return '<button type="button" data-chain="cat:' + esc(x.id) + '">' + esc(x.name) + ' <span class="num">' + n.entries.length + '</span></button>';
      }).join('') + '</div></div>' : '');
    openSheet(html, '연결고리 · ' + c.label, function (e) {
      var b = e.target.closest('[data-chain]');
      if (b) { openChain(b.getAttribute('data-chain')); return; }
    });
  }

  /* 직무분석 */
  function jobById(id) {
    var r = arr(DAY && DAY.jobs).filter(function (j) { return j.id === id; })[0];
    return r || arr(DATA.jobs).filter(function (j) { return j.id === id; })[0] || null;
  }
  function closeJob() {
    var m = $('jobm'); if (!m || m.hidden) return;
    m.classList.remove('open');
    setTimeout(function () { if (!m.classList.contains('open')) { m.hidden = true; m.innerHTML = ''; } }, 240);
    lock(false); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function openJob(id, kind) {
    var j = jobById(id); if (!j) return;
    lastFocus = document.activeElement;
    var ksa = j.ksa || {};
    var K = arr(ksa.knowledge).length ? arr(ksa.knowledge) : arr(ksa.k);
    var S = arr(ksa.skills).length ? arr(ksa.skills) : arr(ksa.s);
    var A = arr(ksa.abilities).length ? arr(ksa.abilities) : arr(ksa.a);
    var rows = [['K', K], ['S', S], ['A', A]].filter(function (r) { return r[1].length; });
    var co = j.companies || {};
    var isNew = kind === 'new' || String(j.kind || '') === 'new';
    var sec = arr(DATA.sectors).filter(function (x) { return x.id === j.sector; })[0] || {};
    var html = '<div class="jm" id="jobm" role="dialog" aria-modal="true" aria-labelledby="jmT" hidden><div class="jm-in">' +
      '<div class="jm-h"><span class="k' + (isNew ? ' n' : '') + '">' + (isNew ? '최근 등장' : '기존 직무') + '</span>' +
        '<div class="who"><h3 id="jmT">' + esc(j.name) + '</h3>' +
        '<p class="jm-meta">' + (j.en ? '<span>' + esc(j.en) + '</span>' : '') +
          (sec.name ? '<i aria-hidden="true">·</i><span>' + esc(sec.name) + '</span>' : '') +
          '<i aria-hidden="true">·</i><span>NCS·O*NET 방식 5칸</span></p></div>' +
        '<button type="button" class="x" data-close aria-label="닫기">닫기</button></div>' +
      '<div class="jm-b">' + jobLinks(j) +
        '<section class="blk"><div class="blk-h"><span class="ni">01</span><b>하는 일</b><em>핵심 과업</em></div><p class="role">' + esc(j.role) + '</p></section>' +
        '<section class="blk"><div class="blk-h"><span class="ni">02</span><b>KSA</b><em>지식 · 기술 · 태도</em></div><div class="ksa2">' + rows.map(function (r) {
          var lb = { K: '지식', S: '기술', A: '태도' }[r[0]];
          return '<div class="ksa-row"><span class="kb ' + r[0].toLowerCase() + '">' + r[0] + '</span><span class="kl">' + lb + '</span><div class="tags">' + r[1].map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div></div>';
        }).join('') + '</div></section>' +
        '<section class="blk"><div class="blk-h"><span class="ni">03</span><b>채용 기업</b><em>국내 · 해외</em></div><div class="snap">' +
          '<div class="snap-c"><b>국내</b><div class="tags">' + arr(co.domestic || co.dom).map(coChip).join('') + '</div></div>' +
          '<div class="snap-c"><b>해외</b><div class="tags intl">' + arr(co.global || co.glob).map(coChip).join('') + '</div></div>' +
        '</div></section>' +
        '<section class="blk"><div class="blk-h"><span class="ni">04</span><b>진입 경로</b><em>전공 → 자격</em></div><div class="path">' +
          '<div class="step"><b>전공</b><ul class="sl">' + arr(j.study).map(studyItem).join('') + '</ul></div>' +
          '<div class="step"><b>자격·교육</b><span>' + arr(j.certs).map(esc).join(' · ') + '</span></div>' +
        '</div></section>' +
        '<section class="blk"><div class="blk-h"><span class="ni">05</span><b>핵심 아이디어</b><em>한 문장</em></div><p class="ins">' + esc(j.insight) + '</p></section>' +
      '</div>' +
      '<p class="jm-f">기업은 해당 직무를 실제로 운영하거나 채용하는 곳만 적었습니다. <b>기업 명함첩에 등재된 곳은 눌러서 바로 열 수 있습니다</b>(대기업·중견기업·공공기관만 담은 명함첩입니다). 전공은 대학·대학원 개설 학과로 이어집니다. 자격은 국가자격과 민간 교육을 구분했고, 국가자격이 없는 직무는 그렇게 적었습니다.</p>' +
      '</div></div>';
    var host = document.getElementById('jobhost');
    if (!host) { host = document.createElement('div'); host.id = 'jobhost'; document.body.appendChild(host); }
    host.innerHTML = html;
    var m = $('jobm');
    m.onclick = function (e) { if (e.target === m || e.target.closest('[data-close]')) closeJob(); };
    m.onkeydown = trap(m);
    m.hidden = false; lock(true);
    requestAnimationFrame(function () { m.classList.add('open'); var c = m.querySelector('[data-close]'); if (c) c.focus({ preventScroll: true }); });
  }

  /* ───────── 이벤트 ───────── */
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-job]'))) { openJob(b.getAttribute('data-job'), b.getAttribute('data-kind')); return; }
    if ((b = t.closest('[data-item]'))) { UI.item = +b.getAttribute('data-item'); render(); return; }
    if ((b = t.closest('[data-go]'))) { UI.item += +b.getAttribute('data-go'); render(); return; }
    if ((b = t.closest('[data-ym]'))) { if (b.closest('#sheet')) return; UI.ym += +b.getAttribute('data-ym'); renderRail(); return; }
    if ((b = t.closest('[data-cal]'))) { openCalendar(); return; }
    if (t.closest('[data-next]')) { openNext(); return; }
    if ((b = t.closest('[data-chain]')) && !t.closest('#sheet')) { openChain(b.getAttribute('data-chain')); return; }
    if ((b = t.closest('[data-sector]')) && !t.closest('#sheet')) {
      UI.sector = b.getAttribute('data-sector'); UI.filterSector = UI.sector; UI.filterCat = 'all';
      renderFilters(); openFilter(); return;
    }
    if ((b = t.closest('[data-cat]'))) {
      UI.filterSector = UI.sector; UI.filterCat = b.getAttribute('data-cat');
      renderFilters(); openFilter(); return;
    }
    if ((b = t.closest('[data-mv]'))) {
      var ds = arr(DATA.archive_dates), i = ds.indexOf(UI.date) + +b.getAttribute('data-mv');
      if (i >= 0 && i < ds.length) loadDay(ds[i]);
      return;
    }
    if ((b = t.closest('[data-open]'))) {
      var dt = b.getAttribute('data-open'), oi = b.getAttribute('data-oi');
      closeSheet();
      loadDay(dt).then(function () {
        var k = arr(DAY.items).map(function (x) { return x.id; }).indexOf(oi);
        if (k >= 0) { UI.item = k; render(); }
      });
      return;
    }
    if ((b = t.closest('[data-day]'))) { closeSheet(); loadDay(b.getAttribute('data-day')); return; }
    if ((b = t.closest('#calBtn'))) { openCalendar(); return; }
    if ((b = t.closest('#edBtn'))) { openFilter(); return; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeJob(); closeSheet(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (e.target.closest && e.target.closest('input,select,textarea,[role=tab]')) return;
      var items = arr(DAY && DAY.items); if (!items.length) return;
      UI.item = Math.max(0, Math.min(items.length - 1, UI.item + (e.key === 'ArrowRight' ? 1 : -1))); render();
    }
  });
  $('pvT').addEventListener('click', function () {
    var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기';
  });

  /* ───────── 시작 ───────── */
  function boot(d) {
    DATA = d; cache[(d.edition || {}).date] = d;
    var ask = readQ();                 /* render 가 주소를 ?date=… 로 바꾸기 전에 받아 둔다 */
    var want = new URLSearchParams(location.search).get('date');
    var h = (location.hash || '').replace('#', '');
    var d0 = validDate(want) && arr(d.archive_dates).indexOf(want) >= 0 ? want : (d.edition || {}).date;
    UI.ym = ymOf(d0);
    var it = /^i([1-9])$/.test(h) ? +h.slice(1) - 1 : 0;
    if (d0 === (d.edition || {}).date) { DAY = d; UI.date = d0; UI.item = it; render(); }
    else loadDay(d0, it);
    urlQuery(ask);
  }
  /* 다른 섹터에서 ?q=로 들어오면: 직무 이름이면 그 직무분석을, 아니면 제목에 그 말이 듣 지면을 보여 준다. */
  function nq0(s) { return String(s || '').toLowerCase().replace(/[\s·・ㆍ._\-()]/g, ''); }
  function readQ() {
    try { return (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) { return ''; }
  }
  function urlQuery(q) {
    if (!q || !DATA) return;
    var nq = nq0(q);
    var hit = arr(DATA.jobs).filter(function (j) { var n = nq0(j.name); return n === nq || n.indexOf(nq) >= 0 || (nq.length > 2 && nq.indexOf(n) === 0); })[0];
    if (hit) { openJob(hit.id, hit.kind); return; }
    /* 세부분류·대분류 이름이면 그 기사 모음을 바로 연다(예: ?q=반도체·?q=4차) */
    var cat = arr(DATA.categories).filter(function (c) {
      var n = nq0(c.name); return n === nq || (nq.length > 1 && n.indexOf(nq) === 0) || (nq.length > 1 && nq.indexOf(n) === 0);
    })[0];
    if (cat) { UI.sector = cat.sector; UI.filterSector = cat.sector; UI.filterCat = cat.id; renderFilters(); openFilter(); return; }
    var sec = arr(DATA.sectors).filter(function (s) {
      var n = nq0(s.name), sn = nq0(s.sub);
      return n === nq || n.replace('산업', '') === nq || (nq.length > 1 && sn.indexOf(nq) >= 0);
    })[0];
    if (sec) { UI.sector = sec.id; UI.filterSector = sec.id; UI.filterCat = 'all'; renderFilters(); openFilter(); return; }
    var res = [];
    arr(DATA.archive_index).forEach(function (d) {
      arr(d.items).forEach(function (it) { if (nq0(it.title).indexOf(nq) >= 0) res.push({ date: d.date, it: it }); });
    });
    if (!res.length) return;
    var rows = res.slice(0, 30).map(function (r) {
      var s = arr(DATA.sectors).filter(function (x) { return x.id === r.it.sector; })[0] || {};
      return '<li><button type="button" data-open="' + esc(r.date) + '" data-oi="' + esc(r.it.id) + '"><b class="num">' + esc(r.date.slice(5)) + '</b><span class="tw"><span class="tt">' + esc(r.it.title) + '</span><em>' + esc(s.no) + '차</em></span></button></li>';
    }).join('');
    openSheet('<p class="note">「' + esc(q) + '」이 제목에 든 지면입니다. 누르면 그 지면으로 갑니다.</p><ol class="res">' + rows + '</ol>', '지면 찾기 · ' + q, null);
  }
  Promise.all([get(BASE + 'emerging.json'), get(BASE + 'links.json').catch(function () { return null; })]).then(function (a) {
    LINKS = a[1] || {};
    boot(a[0]);
    loadBrief();
  }).catch(function () {
    main.innerHTML = '<p class="empty" style="padding:16px">지면을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>';
  });
})();
