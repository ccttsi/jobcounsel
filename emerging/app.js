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
  var TRACK = { 'KOGL-1': 'A', 'KOGL-0': 'A', 'PUBLIC-DOMAIN': 'A', 'CC-BY-4.0': 'A', 'OECD': 'A', 'WEF': 'A', 'IAEA': 'A', 'PRESS': 'B' };

  var UI = { date: '', item: 0, sector: 'all', ym: 0, filterSector: 'all', filterCat: 'all', filterPage: 0 };
  var DATA = null, DAY = null, cache = {}, LINKS = {};

  /* ───────── 도표 ───────── */
  var W = 340, H = 152, PL = 42, PR = 12, PT = 14, PB = 24;

  function ticks(lo, hi, n) {
    var span = hi - lo || 1, raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag, step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var out = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function chart(m) {
    if (!m || !arr(m.labels).length || !arr(m.series).length) return '';
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
    var y = function (v) { return PT + (hi - v) / (hi - lo || 1) * (H - PT - PB); };
    var iw = W - PL - PR, slot = iw / n, g = '';

    tk.forEach(function (t) {
      g += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (PL - 6) + '" y="' + (y(t) + 3.2).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="var(--dim)">' + esc(fmt(t, 2)) + '</text>';
    });

    if (m.chart === 'line') {
      var xs = labels.map(function (_, i) { return n === 1 ? PL + iw / 2 : PL + (iw / (n - 1)) * i; });
      S.forEach(function (s, si) {
        var pts = [];
        arr(s.values).forEach(function (v, i) { if (v != null && !isNaN(v)) pts.push([xs[i], y(v), v]); });
        if (pts.length > 1) g += '<polyline fill="none" stroke="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '" stroke-width="' + (s.emphasis ? 2.2 : 1.5) + '" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p) {
          g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (s.emphasis ? 3 : 2.4) + '" fill="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '"/>';
          if (si === 0) g += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 7).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--ink)">' + esc(fmt(p[2], 2)) + '</text>';
        });
      });
      labels.forEach(function (lb, i) {
        g += '<text x="' + xs[i].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + esc(lb) + '</text>';
      });
    } else {
      var base = y(Math.max(lo, Math.min(hi, 0))), k = S.length;
      var bw = Math.min(38, (slot * 0.62) / k);
      labels.forEach(function (lb, i) {
        var cx = PL + slot * i + slot / 2;
        S.forEach(function (s, j) {
          var v = arr(s.values)[i]; if (v == null || isNaN(v)) return;
          var x = cx - (bw * k + (k - 1) * 4) / 2 + (bw + 4) * j;
          var yv = y(v), top = Math.min(yv, base), h = Math.max(1.5, Math.abs(yv - base));
          g += '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + (s.emphasis ? 'var(--acc)' : 'var(--c-sub)') + '"/>';
          g += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (v >= 0 ? top - 4 : top + h + 10).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--ink)">' + esc(fmt(v, 2)) + '</text>';
        });
        g += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + esc(lb) + '</text>';
      });
      g += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + base.toFixed(1) + '" y2="' + base.toFixed(1) + '" stroke="var(--line-2)" stroke-width="1"/>';
    }

    var aria = S.map(function (s) { return s.name + ': ' + labels.map(function (lb, i) { var v = arr(s.values)[i]; return lb + ' ' + (v == null ? '값 없음' : fmt(v, 2)); }).join(', '); }).join(' / ');
    var legend = S.length > 1 ? '<span>' + S.map(function (s) { return esc(s.name); }).join(' · ') + '</span>' : '';
    return '<figure class="fig"><div class="fig-h"><b>' + esc(m.label) + '</b><span>' + esc(m.unit || '') + (m.cagr != null ? ' · 연평균 ' + esc(fmt(m.cagr, 1)) + '%' : '') + '</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria + ' (단위 ' + (m.unit || '') + ')') + '">' + g + '</svg>' +
      '<figcaption>' + (legend ? legend + ' · ' : '') + (m.note ? esc(m.note) : '') + '</figcaption></figure>';
  }

  /* ───────── 달력 ───────── */
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function ymOf(s) { var p = String(s).split('-'); return +p[0] * 12 + (+p[1] - 1); }
  function ymLabel(ym) { return Math.floor(ym / 12) + '년 ' + (ym % 12 + 1) + '월'; }
  function latestYm() { var d = arr(DATA && DATA.archive_dates); return d.length ? ymOf(d[d.length - 1]) : ymOf('2026-11'); }
  function nowYm() { var t = new Date(); return t.getFullYear() * 12 + t.getMonth(); }
  function minYm() { return ymOf('2026-11'); }                                  /* 최소 월 고정 */
  function maxYm() { return Math.max(nowYm(), latestYm()); }                    /* 현실의 이번 달까지 자동 확장 */

  function calendar() {
    var ym = UI.ym, y = Math.floor(ym / 12), mo = ym % 12;
    var start = new Date(y, mo, 1).getDay(), last = new Date(y, mo + 1, 0).getDate();
    var t = new Date(), tKey = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    var dates = {}; arr(DATA && DATA.archive_dates).forEach(function (d) { dates[d] = 1; });
    var inMonth = 0; Object.keys(dates).forEach(function (d) { if (ymOf(d) === ym) inMonth++; });
    var g = '', i, d, key;
    for (i = 0; i < start; i++) g += '<span></span>';
    for (d = 1; d <= last; d++) {
      key = y + '-' + pad(mo + 1) + '-' + pad(d);
      var has = !!dates[key];
      g += '<button type="button" class="cal-d' + (has ? ' on' : '') + '"' + (has ? ' data-day="' + key + '"' : ' disabled') +
        (key === tKey ? ' aria-current="true"' : '') + ' aria-label="' + key + (has ? ' 지면 열기' : ' 지면 없음') + '">' + d + (has ? '<i aria-hidden="true"></i>' : '') + '</button>';
    }
    return '<div class="cal"><div class="cal-h">' +
      '<button type="button" data-ym="-1" aria-label="이전 달"' + (ym <= minYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<span class="m num">' + ymLabel(ym) + '</span>' +
      '<button type="button" data-ym="1" aria-label="다음 달"' + (ym >= maxYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>' +
      '<div class="cal-w" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>' +
      '<div class="cal-g" role="group" aria-label="' + ymLabel(ym) + ' 지면 달력">' + g + '</div>' +
      '<p class="cal-f num">' + (inMonth ? '이 달의 지면 ' + inMonth + '일' : (ym > latestYm() ? '이 달의 지면은 아직 없습니다' : '이 달의 지면 없음')) + '</p></div>';
  }

  /* 레일용 미니 달력: 월 이동 + 달력 열기(날짜 칸은 시트에서 44px) */
  function miniCal() {
    var ym = UI.ym;
    return '<div class="cal-h">' +
      '<button type="button" data-ym="-1" aria-label="이전 달"' + (ym <= minYm() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<span class="m num">' + ymLabel(ym) + '</span>' +
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

  function renderArticle() {
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
      '<div class="art-f">' + sourceLine(it) + '<span class="pn"><button type="button" data-go="-1" aria-label="이전 기사"' + (UI.item ? '' : ' disabled') + '>←</button><button type="button" data-go="1" aria-label="다음 기사"' + (UI.item < items.length - 1 ? '' : ' disabled') + '>다음 →</button></span></div>';
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
    if (!cur || box.scrollWidth <= box.clientWidth + 1) return;
    requestAnimationFrame(function () {
      box.scrollLeft = Math.max(0, cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2);
      box.classList.add('can');
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
  function openCalendar() {
    function draw() {
      openSheet('<p class="note">지면은 <b>2026년 11월</b>부터 볼 수 있습니다.</p><div class="calwrap">' + calendar() + '</div>', '지면 달력',
        function (e) {
          var b = e.target.closest('[data-ym]');
          if (b) { UI.ym += +b.getAttribute('data-ym'); draw(); }
        });
    }
    draw();
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
  }).catch(function () {
    main.innerHTML = '<p class="empty" style="padding:16px">지면을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>';
  });
})();
