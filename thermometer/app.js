/* app.js — 32번 산업 온도계
 *
 * 자료는 ./data/thermometer.json 하나만 읽는다(계약: ./data/SCHEMA.md).
 * 계산은 이미 build_thermometer.py가 끝냈고, 여기서는 다시 계산하지 않는다
 * — 화면과 데이터가 다른 온도를 말하는 일이 없도록.
 *
 * 두 갈래 분류: 체감 산업군(구직자가 부르는 이름) ↔ 표준산업분류(KSIC 정석).
 * 같은 24개 산업을 묶는 방식만 바꾼다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var DATA = null, BYID = {}, drawnSel = null;
  var state = { cls: 'feel', sort: 'temp', q: '', sel: null, page: 0 };
  var indexScrollTop = 0;
  /* 한 쪽에 놓는 산업 수 — 24개를 세로로 다 펼치면 첫 화면이 목록만 된다.
     쪽을 넘겨도 그룹 이름표는 따라오고, 그룹은 웬만하면 쪽 사이에서 쪼개지 않는다. */
  var PER = 9;
  var PAGES = [];

  /* ---------- 작은 도구 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function sign(v) { return (v > 0 ? '+' : '') + String(v); }
  function tempText(t) { return t == null ? '—' : sign(t.toFixed(1)) + '℃'; }
  function tone(t) { return t == null ? 'mid' : (t >= 8 ? 'hot' : (t <= -2 ? 'cold' : 'mid')); }
  function tempVar(t) { return t == null ? 'var(--mild)' : (t >= 8 ? 'var(--hot)' : (t <= -2 ? 'var(--cold)' : 'var(--mild)')); }
  /* 온도에 따라 색을 이어 붙인다 — 파랑(-20) → 황토(0) → 벽돌(+40).
     색은 테마 토큰(--cold/--mild/--hot)에서 읽어 오므로 밝게/어둡게가 바뀌면 같이 바뀐다. */
  function rgbOf(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v.charAt(0) === '#') {
      var h = v.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = v.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : fallback;
  }
  function ramp() {
    return [[-20, rgbOf('--t-cold', [47, 111, 143])], [-8, rgbOf('--t-cool', [95, 157, 179])], [0, rgbOf('--t-mid', [179, 166, 140])], [12, rgbOf('--t-hot2', [192, 138, 82])], [40, rgbOf('--t-hot', [166, 58, 36])]];
  }
  function tempColor(t) {
    if (t == null) return 'var(--track)';
    var R = ramp(), v = Math.max(-20, Math.min(40, t)), a = R[0], b = R[R.length - 1];
    for (var i = 0; i < R.length - 1; i++) {
      if (v >= R[i][0] && v <= R[i + 1][0]) { a = R[i]; b = R[i + 1]; break; }
    }
    var k = (v - a[0]) / (b[0] - a[0] || 1);
    var c = a[1].map(function (x, i) { return Math.round(x + (b[1][i] - x) * k); });
    return 'rgb(' + c.join(',') + ')';
  }
  function pct(t) { return t == null ? 0 : Math.max(0, Math.min(100, (t + 20) / 60 * 100)); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  /* 주격 조사(이/가) — 앞 글자의 받침을 보고 고른다. 국내는 받침이 없어 「가」, 글로벌은 ㄹ 받침이라 「이」.
     「국내가」를 베껴 「글로벌가」라고 쓰는 일이 없도록 이름표와 조사를 따로 두지 않고 여기서 붙인다. */
  function gaJosa(word) {
    var s = String(word || ''), c = s.charCodeAt(s.length - 1);
    return (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28) ? '이' : '가';
  }

  function match(row) {
    if (!state.q) return true;
    var q = norm(state.q), hay = norm(
      [row.name, row.en, row.feel.name, row.feel.group, row.ksic.code, row.ksic.mid, row.ksic.major_name, row.one_line]
        .concat(row.tags || []).join(' ')
    );
    return hay.indexOf(q) >= 0;
  }

  function sortRows(rows, mode) {
    var out = rows.slice();
    if (mode === 'size') {
      out.sort(function (a, b) { return (b.size.value || 0) - (a.size.value || 0); });
    } else if (mode === 'name') {
      out.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    } else {
      out.sort(function (a, b) {
        var ta = a.domestic.temperature, tb = b.domestic.temperature;
        if (ta == null && tb == null) return a.name.localeCompare(b.name, 'ko');
        if (ta == null) return 1;
        if (tb == null) return -1;
        return tb - ta;
      });
    }
    return out;
  }

  var KSIC_ORDER = ['C', 'D', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'P', 'Q'];

  function groups(rows) {
    var map = {}, order = [];
    if (state.cls === 'ksic') {
      rows.forEach(function (r) {
        var k = r.ksic.major;
        if (!map[k]) { map[k] = { key: k, name: r.ksic.major_name, code: k, items: [] }; order.push(k); }
        map[k].items.push(r);
      });
      order.sort(function (a, b) {
        var ia = KSIC_ORDER.indexOf(a), ib = KSIC_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    } else {
      (DATA.feel_groups || []).forEach(function (g) {
        map[g.id] = { key: g.id, name: g.name, code: '', sub: g.sub, items: [] };
        order.push(g.id);
      });
      rows.forEach(function (r) {
        var g = map[r.feel.group_id];
        if (!g) { g = map[r.feel.group_id] = { key: r.feel.group_id, name: r.feel.group, code: '', sub: '', items: [] }; order.push(r.feel.group_id); }
        g.items.push(r);
      });
      order = order.filter(function (k) { return map[k].items.length; });
    }
    return order.map(function (k) {
      var g = map[k];
      g.items = sortRows(g.items, state.sort);
      return g;
    });
  }

  /* ---------- 온도계 그림 ---------- */
  /* 눈금: -20℃(아래) ~ +40℃(위). 두 자루가 언제나 같은 크기·같은 좌표를 쓴다. */
  var Y_TOP = 16, Y_BOT = 150, Y_BULB = 168;
  function yOf(t) { return Y_BOT - (Math.max(-20, Math.min(40, t)) + 20) / 60 * (Y_BOT - Y_TOP); }

  function thermo(side, t, band, used, total) {
    var k = t == null ? 0 : (Y_BULB - yOf(t)) / (Y_BULB - Y_TOP);
    var fillColor = t == null ? 'var(--track)' : tempColor(t);
    var ticks = [-20, -10, 0, 10, 20, 30, 40].map(function (v) {
      var y = yOf(v), zero = v === 0;
      return '<line x1="62" x2="' + (zero ? 74 : 70) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line-2)" stroke-width="' + (zero ? 1.4 : 1) + '"/>'
        + '<text x="74" y="' + (y + 5.4) + '" font-size="16" font-weight="700" fill="var(--dim)">' + v + '</text>';
    }).join('');
    var dots = '';
    for (var i = 0; i < total; i++) dots += '<s class="' + (i < used ? 'on' : '') + '"></s>';
    return '<div class="thermo">'
      + '<div class="th-g"><svg viewBox="0 0 120 184" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + (side === 'domestic' ? '국내' : '글로벌') + ' 온도 ' + (t == null ? '근거 없음' : t + '도') + '">'
      + '<rect x="24" y="' + Y_TOP + '" width="36" height="' + (Y_BULB - Y_TOP) + '" rx="18" fill="var(--track)"/>'
      + (t == null
        ? '<line x1="24" x2="60" y1="' + (Y_BOT - 8) + '" y2="' + (Y_BOT - 8) + '" stroke="var(--line-2)" stroke-width="2" stroke-dasharray="3 3"/>'
        : '<rect class="merc" x="24" y="' + Y_TOP + '" width="36" height="' + (Y_BULB - Y_TOP) + '" rx="18" style="--k:' + k.toFixed(3) + ';transform:scaleY(' + k.toFixed(3) + ')" fill="' + fillColor + '"/>'
          + '<line x1="24" x2="60" y1="' + yOf(t) + '" y2="' + yOf(t) + '" stroke="var(--panel)" stroke-width="1.6" opacity=".6"/>')
      + '<rect x="24" y="' + Y_TOP + '" width="36" height="' + (Y_BULB - Y_TOP) + '" rx="18" fill="none" stroke="var(--line-2)" stroke-width="1"/>'

      + ticks
      + '</svg></div>'
      + '<div class="th-x">'
      + '<div class="th-h"><b>' + (side === 'domestic' ? '국내' : '글로벌') + '</b><span>' + (side === 'domestic' ? 'KR' : 'World') + '</span></div>'
      + '<div class="th-v" style="color:' + tempVar(t) + '">' + (t == null ? '—' : sign(t.toFixed(1))) + '<span class="u">℃</span></div>'
      + '<div class="th-b">' + esc(band) + '</div>'
      + '<div class="th-c"><i aria-hidden="true">' + dots + '</i><span>근거 ' + used + '/' + total + '축</span></div>'
      + '</div></div>';
  }

  /* ---------- 관측 요약 ---------- */
  /* 이 띠는 자료가 정해 놓은 값(가장 뜨거운·차가운 산업)이라 분류·정렬·검색과 상관없다.
     그래서 한 번만 그리고, 버튼을 누를 때마다 갈아 끼우지 않는다(다시 그리면 등장 모션과
     카드 손맛 탐색이 한쪽 카드에만 늦게 붙어 덜커덕거린다). */
  function renderDeck() {
    var rows = DATA.industries.filter(function (r) { return r.domestic.temperature != null || r.global.temperature != null; });
    function pick(side, dir) {
      var list = rows.filter(function (r) { return r[side].temperature != null; });
      if (!list.length) return null;
      list.sort(function (a, b) { return dir > 0 ? b[side].temperature - a[side].temperature : a[side].temperature - b[side].temperature; });
      return list[0];
    }
    var cells = [
      { side: 'domestic', label: '국내에서 가장 더움', pick: pick('domestic', 1) },
      { side: 'domestic', label: '국내에서 가장 차가움', pick: pick('domestic', -1) },
      { side: 'global', label: '글로벌에서 가장 더움', pick: pick('global', 1) },
      { side: 'global', label: '글로벌에서 가장 차가움', pick: pick('global', -1) }
    ];
    $('deck').innerHTML = cells.map(function (c) {
      if (!c.pick) return '';
      var r = c.pick, t = r[c.side].temperature;
      var thin = r[c.side].axes_used < 2 ? '<em>근거 1축</em>' : '';
      return '<button type="button" class="dk ' + tone(t) + '" data-jump="' + r.id + '">'
        + '<span class="lb">' + c.label + '</span>'
        + '<span class="nmw"><span class="nm">' + esc(r.name) + '</span>' + thin + '</span>'
        + '<span class="t">' + tempText(t) + '</span></button>';
    }).join('');
  }

  /* ---------- 쪽 나눔 ---------- */
  /* 그룹은 쪽 사이에서 되도록 쪼개지 않는다. 그룹 하나가 한 쪽보다 크면(KSIC C처럼) 나눠 담고
     이어지는 쪽의 이름표에 「계속」을 붙인다. */
  function paginate(gs) {
    var pages = [], cur = null;
    function open() { cur = { groups: [], rows: 0 }; pages.push(cur); }
    gs.forEach(function (g) {
      var items = g.items, at = 0;
      while (at < items.length) {
        if (!cur || cur.rows >= PER) open();
        var space = PER - cur.rows, left = items.length - at;
        if (left > space && left <= PER) { open(); space = PER; }
        var take = Math.min(space, left);
        cur.groups.push({ key: g.key, code: g.code, name: g.name, total: items.length, cont: at > 0, items: items.slice(at, at + take) });
        cur.rows += take; at += take;
      }
    });
    return pages.length ? pages : [{ groups: [], rows: 0 }];
  }

  /* 어느 쪽에 이 산업이 있는가 — 요약 띠·이전/다음으로 건너뛰었을 때 목록도 따라간다. */
  function pageOf(id) {
    for (var p = 0; p < PAGES.length; p++) {
      for (var i = 0; i < PAGES[p].groups.length; i++) {
        var its = PAGES[p].groups[i].items;
        for (var k = 0; k < its.length; k++) if (its[k].id === id) return p;
      }
    }
    return -1;
  }

  function flatIds() {
    var out = [];
    PAGES.forEach(function (p) { p.groups.forEach(function (g) { g.items.forEach(function (r) { out.push(r.id); }); }); });
    return out;
  }

  function renderPager(total) {
    var n = PAGES.length, at = state.page, h;
    if (n <= 1) { $('pager').hidden = true; $('pager').innerHTML = ''; return; }
    h = '';
    for (var p = 0; p < n; p++) {
      h += '<button type="button" class="pg" data-page="' + p + '" aria-label="' + (p + 1) + '쪽' + (p === at ? ' (지금 쪽)' : '') + '"' + (p === at ? ' aria-current="page"' : '') + '>' + (p + 1) + '</button>';
    }
    h += '<span class="sr">모두 ' + total + '개, ' + n + '쪽 중 ' + (at + 1) + '쪽</span>';
    $('pager').innerHTML = h;
    $('pager').hidden = false;
  }

  /* ---------- 색인 ---------- */
  function renderIndex() {
    var rows = DATA.industries.filter(match);
    var gs = groups(rows);
    $('idxTitle').textContent = state.cls === 'ksic' ? '표준산업분류(KSIC)' : '체감 산업군';
    $('idxCount').textContent = rows.length + '개';
    if (!rows.length) {
      $('idxScroll').innerHTML = '<div class="empty"><b>찾은 산업이 없습니다</b>이름이나 분류 코드를 다르게 적어 보세요. 예: 반도체, C261, 물류</div>';
      PAGES = []; state.page = 0;
      renderPager(0);
      return;
    }
    PAGES = paginate(gs);
    if (state.followSel) {
      var fp = pageOf(state.sel);
      if (fp >= 0) state.page = fp;
      state.followSel = false;
    }
    if (state.page > PAGES.length - 1) state.page = PAGES.length - 1;
    if (state.page < 0) state.page = 0;
    var h = '';
    PAGES[state.page].groups.forEach(function (g) {
      h += '<h3 class="grp-h"><em>' + esc(g.code) + '</em>' + esc(g.name) + (g.cont ? ' <span class="ct">계속</span>' : '') + '<span class="c">' + g.total + '</span></h3>';
      h += '<div role="list">';
      g.items.forEach(function (r) {
        var d = r.domestic.temperature, gl = r.global.temperature;
        h += '<button type="button" class="row" role="listitem" data-id="' + r.id + '" aria-current="' + (state.sel === r.id) + '">'
          + '<span class="tx"><span class="nm">' + esc(r.name) + '</span>'
          + '<span class="cd">' + esc(state.cls === 'ksic' ? r.ksic.mid : r.ksic.code + ' · ' + fmtNum(r.size.value) + r.size.unit) + '</span></span>'
          + '<span class="twin">'
          + '<span class="tv ' + tone(d) + '"><small>국</small>' + tempText(d) + '</span>'
          + '<span class="tv ' + tone(gl) + '"><small>글</small>' + tempText(gl) + '</span>'
          + '</span></button>';
      });
      h += '</div>';
    });
    var sc = $('idxScroll'), top = sc.scrollTop;
    sc.innerHTML = h;
    sc.scrollTop = top;
    renderPager(rows.length);
    var cur = sc.querySelector('[aria-current="true"]');
    if (cur && state.justSelected) {
      if (sc.scrollHeight > sc.clientHeight + 2) cur.scrollIntoView({ block: 'nearest' });
      state.justSelected = false;
    }
  }

  /* ---------- 상세 ---------- */
  function bar(s) {
    if (s == null) return '<span class="bar" aria-hidden="true"></span><span class="vv na">—</span>';
    var p = Math.max(4, Math.min(100, Math.abs(s) * 100));
    return '<span class="bar' + (s < 0 ? ' neg' : '') + '" aria-hidden="true"><u style="--v:' + (p / 100).toFixed(2) + ';--c:' + (s >= 0 ? 'var(--hot)' : 'var(--cold)') + '"></u></span>'
      + '<span class="vv" style="color:' + (s >= 0 ? 'var(--hot)' : 'var(--cold)') + '">' + sign((s * 100).toFixed(0)) + '</span>';
  }

  function evidence(axis, block) {
    var a = (block.axes || {})[axis] || { items: [] };
    if (!a.items.length) return '<p class="na">이 축의 공식 근거를 확인하지 못했습니다. 확인되지 않은 값은 넣지 않고 비웁니다.</p>';
    return '<ul>' + a.items.map(function (it) {
      var src = srcById(it.source_id);
      var up = it.yoy * (it.dir || 1) > 0;
      return '<li>'
        + '<span class="lb">' + esc(it.label) + '</span>'
        + '<span class="yy ' + (up ? 'up' : 'dn') + '">' + sign(it.yoy) + '%</span>'
        + '<span class="mt">' + esc(it.value) + ' · ' + esc(it.period)
        + (it.note ? ' · ' + esc(it.note) : '')
        + (src ? ' · <a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.name) + '</a>' : '')
        + '</span></li>';
    }).join('') + '</ul>';
  }

  var AXIS_NAME = { emp: '고용', prod: '생산', rev: '매출', trend: '트렌드' };

  function srcById(id) {
    if (!DATA) return null;
    for (var i = 0; i < DATA.sources.length; i++) if (DATA.sources[i].source_id === id) return DATA.sources[i];
    return null;
  }

  function usedSources(row) {
    var ids = [], seen = {};
    ['domestic', 'global'].forEach(function (side) {
      ['emp', 'prod', 'rev', 'trend'].forEach(function (ax) {
        (((row[side] || {}).axes || {})[ax] || { items: [] }).items.forEach(function (it) {
          if (!seen[it.source_id]) { seen[it.source_id] = 1; ids.push(it.source_id); }
        });
      });
    });
    (row.info || []).forEach(function (it) { if (!seen[it.source_id]) { seen[it.source_id] = 1; ids.push(it.source_id); } });
    return ids.map(srcById).filter(Boolean);
  }

  function ksicQuery(row) {
    return encodeURIComponent(row.name.replace(/·.*$/, '').trim());
  }

  /* 두 온도의 차이를 한 줄로 — 이 화면의 답이 "얼마나 다른가"이기 때문.
     주어는 늘 더 뜨거운 쪽이다. 예전에는 글로벌이 더울 때 「글로벌이 …더 차가움」이라고
     반대로 적혔다(주어만 바꾸고 서술어를 그대로 둔 탓) — 서술어는 뜨거움 하나로 고정한다. */
  function gapLine(row) {
    var d = row.domestic.temperature, g = row.global.temperature;
    if (d == null || g == null) return '';
    var gap = Math.round((d - g) * 10) / 10;
    if (Math.abs(gap) < 0.05) return '<span class="tag gap">국내·글로벌 같은 온도</span>';
    var hotter = gap > 0 ? '국내' : '글로벌';
    return '<span class="tag gap"><b>' + hotter + '</b>' + gaJosa(hotter) + ' ' + Math.abs(gap).toFixed(1) + '℃ 더 뜨거움</span>';
  }

  function renderDetail() {
    drawnSel = state.sel;
    var row = BYID[state.sel];
    if (!row) { $('det').innerHTML = '<div class="det-in"><div class="empty"><b>산업을 고르세요</b>왼쪽 목록에서 산업을 누르면 국내·글로벌 두 온도와 네 축의 근거가 열립니다.</div></div>'; return; }
    var d = row.domestic, g = row.global;
    var order = sortRows(DATA.industries.filter(function (r) { return r.domestic.temperature != null; }), 'temp').map(function (r) { return r.id; });
    var at = order.indexOf(row.id);
    var srcs = usedSources(row);

    var axes = ['emp', 'prod', 'rev', 'trend'].map(function (ax) {
      var sd = (d.axes || {})[ax] || { score: null }, sg = (g.axes || {})[ax] || { score: null };
      var has = (sd.items || []).length || (sg.items || []).length;
      return '<div class="ax"><button type="button" class="ax-s" data-axis="' + ax + '" aria-expanded="false"' + (has ? '' : ' disabled') + '>'
        + '<span class="an">' + AXIS_NAME[ax] + '<small>' + (ax === 'emp' ? '사람' : ax === 'prod' ? '실물' : ax === 'rev' ? '돈' : '수요') + '</small></span>'
        + bar(sd.score) + bar(sg.score)
        + '</button><div class="ax-b" hidden></div></div>';
    }).join('');

    var info = (row.info || []).length
      ? '<div class="blk"><h3>고유 근거</h3><ul class="kv">' + row.info.map(function (it) {
        var src = srcById(it.source_id);
        return '<li><b>' + esc(it.label) + '</b><span>' + esc(it.value) + '</span>'
          + '<small>' + esc(it.period) + (src ? ' · ' + esc(src.name) : '') + (it.note ? ' · ' + esc(it.note) : '') + '</small></li>';
      }).join('') + '</ul></div>'
      : '';

    var q = ksicQuery(row);
    $('det').innerHTML = '<div class="det-in">'
      + '<div class="dt-h">'
      + '<button type="button" class="back" id="backBtn" aria-label="목록으로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>'
      + '<div class="dt-t"><h2>' + esc(row.name) + ' <span style="font-size:.62em;font-weight:750;color:var(--dim);letter-spacing:0" class="num">' + esc(row.domestic.temperature == null ? '' : (row.domestic.rank ? row.domestic.rank + '위' : '')) + '</span></h2>'
      + '<div class="tags"><span class="tag k num">' + esc(row.ksic.code) + '</span><span class="tag">' + esc(row.feel.group) + '</span><span class="tag num">종사자 ' + fmtNum(row.size.value) + esc(row.size.unit) + ' · ' + esc(row.size.period) + '</span>' + gapLine(row) + '</div>'
      + '<p>' + esc(row.one_line) + '</p></div>'
      + '<div class="nv"><button type="button" id="prevBtn" aria-label="이전 산업"' + (at <= 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg></button>'
      + '<button type="button" id="nextBtn" aria-label="다음 산업"' + (at < 0 || at >= order.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>'
      + '</div>'
      + '<div class="thermos">' + thermo('domestic', d.temperature, d.band, d.axes_used, d.axes_total) + thermo('global', g.temperature, g.band, g.axes_used, g.axes_total) + '</div>'
      + '<div class="blk"><div class="leg"><span>축</span><span>국내</span><span></span><span>글로벌</span><span></span></div>'
      + '<div class="axes">' + axes + '</div>'
      + '</div>'
      + '<div class="duo">' + info
      + '<div class="blk"><h3>이어 보기</h3><div class="links">'
      + '<a class="lk" href="../company/?q=' + q + '">기업 명함첩<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a>'
      + '<a class="lk" href="../emerging/?q=' + q + '">신산업 브리핑<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a>'
      + '<a class="lk" href="../taxonomy/?q=' + q + '">직업분류 사전<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a>'
      + '</div>'
      + '<details class="sub"><summary>이 산업에 쓴 출처 ' + srcs.length + '곳 · 기준시점 <svg class="ch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>'
      + '<ul class="srcs">' + srcs.map(function (s) {
        return '<li><span class="tk">' + (s.track === 'A' ? 'A' : 'B') + '</span>'
          + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a> — ' + esc(s.title) + ' (' + esc(s.published) + ')</li>';
      }).join('') + '</ul></details>'
      + '</div></div>'
      + '</div>';

    var body = $('det');
    body.querySelectorAll('.ax-s').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.parentNode.querySelector('.ax-b');
        var open = btn.getAttribute('aria-expanded') === 'true';
        if (!box) return;
        if (open) { btn.setAttribute('aria-expanded', 'false'); box.hidden = true; box.innerHTML = ''; return; }
        var ax = btn.getAttribute('data-axis');
        box.innerHTML = '<div style="display:grid;gap:8px"><div><div class="sub2">국내</div>' + evidence(ax, d) + '</div>'
          + '<div><div class="sub2">글로벌</div>' + evidence(ax, g) + '</div></div>';
        btn.setAttribute('aria-expanded', 'true'); box.hidden = false;
      });
    });
    var back = $('backBtn');
    if (back) back.addEventListener('click', function () { showIndex(); });
    var prev = $('prevBtn'), next = $('nextBtn');
    if (prev) prev.addEventListener('click', function () { select(order[at - 1]); });
    if (next) next.addEventListener('click', function () { select(order[at + 1]); });
  }

  function fmtNum(v) {
    if (v == null) return '—';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만';
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ---------- 방법·출처 ---------- */
  /* 제목 옆 관측 시각 — 자료를 만든 시각(generated_at)을 그대로 쓴다.
     손으로 적어 두면 자료를 새로 재고도 날짜만 낡으므로, 화면은 늘 자료가 말하는 날짜를 보여 준다. */
  function stampObserved() {
    var el = $('obsDate'), g = String((DATA && DATA.generated_at) || '');
    if (!el || !/^\d{4}-\d{2}-\d{2}/.test(g)) return;
    var d = g.slice(0, 10);
    el.setAttribute('datetime', d);
    el.textContent = d.replace(/-/g, '.');
    /* 2026-11-23 C2-08 ⑤: 「매주 토요일 갱신」인데 자료가 9일 넘게 묵었으면 화면이 스스로 알린다(갱신이 한 번 빠졌다는 뜻). */
    var age = (Date.now() - Date.parse(d + 'T00:00:00+09:00')) / 86400000, obs = el.parentElement;
    if (obs && age > 9 && !obs.querySelector('.late')) {
      var late = document.createElement('span'); late.className = 'late';
      late.textContent = ' · 갱신 지연 ' + Math.floor(age) + '일';
      obs.appendChild(late);
    }
  }

  function renderMore() {
    var m = DATA.method || {};
    var w = m.weights || {}, b = m.baseline || {};
    var srcList = DATA.sources.map(function (s) {
      return '<li><b>' + esc(s.name) + '</b> · <span style="color:var(--dim)">' + (s.track === 'A' ? 'Track A 재가공 허락' : 'Track B 사실·수치만') + '</span>'
        + '<span class="meta">' + esc(s.title) + ' · ' + esc(s.published) + ' · ' + esc(s.license && s.license.name) + '</span>'
        + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a></li>';
    }).join('');
    $('moreIn').innerHTML = ''
      + '<h3>온도를 내는 식</h3>'
      + '<p>근거 하나: <code>ratio = 전년비 ÷ 눈금</code>, <code>점수 = tanh(ratio) × 방향</code>. 축 점수는 그 축 근거의 평균이고, 종합은 실린 축만으로 가중 평균(고용 ' + w.emp + ' · 생산 ' + w.prod + ' · 매출 ' + w.rev + ' · 트렌드 ' + w.trend + ')한 뒤 <b>실린 가중치 합의 제곱근</b>을 곱합니다. 종합이 0 이상이면 ×40, 0 미만이면 ×20 해 <b>−20~+40℃</b>로 폅니다.</p>'
      + '<ul><li>눈금 — 고용 ' + b.emp + '% · 생산 ' + b.prod + '% · 매출 ' + b.rev + '% · 트렌드 ' + b.trend + '% (이만큼이면 확실히 뜨겁다고 봄)</li>'
      + '<li>tanh를 쓰는 이유 — 눈금의 1배면 0.76, 2배면 0.96으로 1에 가까워질 뿐 넘지 않아, 큰 산업이 전부 끝값에 몰리지 않습니다.</li>'
      + '<li>√(커버리지)를 곱하는 이유 — 근거가 1축뿐이면 그 온도도 55%만 믿습니다. 화면에 「근거 1/4축」처럼 함께 적습니다.</li>'
      + '<li>말(밴드)은 2축 이상일 때만 붙입니다 — 20℃ 이상 폭염 · 8℃ 이상 더움 · 2℃ 초과 따뜻함 · −2~2℃ 평년 · −8℃ 초과 서늘 · −14℃ 초과 추움 · 그 아래 한파.</li></ul>'
      + '<h3>무엇을 재는가</h3>'
      + '<p><b>국내</b>는 국가데이터처 산업활동동향(생산·소매판매·건설수주) · 고용노동부 사업체노동력조사(종사자) · 한국은행 기업경영분석(매출) · 산업통상부 수출입동향(수출)입니다. <b>글로벌</b>은 미국 BLS 산업별 고용 · 업종 국제기구 지표(SIA·WSTS·worldsteel·Clarksons·IEA) · FAO·EIA 가격지수 · 시장 전망(WSTS·IEA·SIPRI·UNWTO)입니다.</p>'
      + '<h3>지키는 선</h3>'
      + '<ul><li>모든 수치에 <b>기준시점</b>을 답니다. 2026년 9월 생산지수와 2025년 연간 매출액은 다른 달의 값입니다 — 섞어서 「이번 달」이라고 말하지 않습니다.</li>'
      + '<li>온도는 <b>매주 토요일</b>에 다시 잽니다. 언제 잰 온도인지는 제목 옆에 적혀 있습니다.</li>'
      + '<li><b>확인되지 않은 값은 지어내지도, 0으로 채우지도 않습니다.</b> 근거가 없으면 그 축을 비우고, 비운 사실을 화면에 적습니다.</li>'
      + '<li>보도자료·민간 조사기관(Track B)은 <b>사실·수치만</b> 인용하고 문장·표·그림을 옮기지 않습니다. 재가공이 허락된 자료(Track A)만 원문 표기를 붙입니다.</li>'
      + '<li>민간 잡포털·블로그는 출처로 쓰지 않습니다.</li></ul>'
      + '<h3>출처 ' + DATA.sources.length + '곳</h3>'
      + '<ul class="srclist">' + srcList + '</ul>';
  }

  /* ---------- 상태 ---------- */
  function showIndex() {
    document.body.setAttribute('data-view', 'index');
    var sc = $('idxScroll');
    if (sc) sc.scrollTop = indexScrollTop;
  }
  function showDetail() {
    indexScrollTop = $('idxScroll').scrollTop;
    document.body.setAttribute('data-view', 'detail');
    var d = $('det');
    if (d) d.scrollIntoView({ block: 'start' });
  }

  function select(id, opts) {
    if (!BYID[id]) return;
    state.sel = id;
    state.justSelected = true;
    state.followSel = true;
    renderIndex();
    renderDetail();
    if (opts && opts.mobile && window.innerWidth < 900) showDetail();
    try {
      var u = new URL(location.href);
      u.searchParams.set('i', id);
      history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString());
    } catch (e) { }
  }

  function paintSegs() {
    $('classSeg').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-class') === state.cls));
    });
    $('sortSeg').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sort') === state.sort));
    });
  }

  function renderAll() {
    paintSegs();
    renderIndex();
    /* 상세는 고른 산업이 바뀔 때만 다시 그린다 — 정렬·분류를 바꿔도 같은 산업이면 온도계 막대가
       다시 차오르는 애니메이션만 되풀이되어 화면이 덜커덕거린다. */
    if (drawnSel !== state.sel) renderDetail();
  }

  /* ---------- 시작 ---------- */
  function boot(data) {
    DATA = data;
    (DATA.industries || []).forEach(function (r) { BYID[r.id] = r; });
    stampObserved();
    var q = '', i = '';
    try {
      var p = new URLSearchParams(location.search);
      q = (p.get('q') || '').trim();
      i = (p.get('i') || '').trim();
    } catch (e) { }
    state.q = q;
    if (q) { $('q').value = q; $('qx').hidden = false; }

    var first = i && BYID[i] ? i : null;
    if (!first) {
      var top = sortRows(DATA.industries, 'temp')[0];
      first = top ? top.id : (DATA.industries[0] || {}).id;
    }
    state.sel = first;
    /* 주소로 특정 산업을 열고 들어왔으면 목록도 그 산업이 있는 쪽을 펼친다 */
    state.followSel = !!(i && BYID[i]);
    renderMore();
    renderDeck();
    renderAll();
    if (i && BYID[i] && window.innerWidth < 900) showDetail();

    try {
      new MutationObserver(function () { if (state.sel) renderDetail(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-jc-tone'] });
    } catch (e) { }

    $('classSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-class]');
      if (!b) return;
      state.cls = b.getAttribute('data-class');
      state.followSel = true;
      renderAll();
    });
    $('sortSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) return;
      state.sort = b.getAttribute('data-sort');
      state.followSel = true;
      renderAll();
    });
    $('pager').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (!b) return;
      var to = parseInt(b.getAttribute('data-page'), 10);
      if (isNaN(to) || to === state.page) return;
      state.page = to;
      renderIndex();
      var sc = $('idxScroll');
      if (sc.scrollHeight > sc.clientHeight + 2) sc.scrollTop = 0;
    });

    var qi = $('q'), timer = 0;
    qi.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = qi.value.trim();
        state.page = 0;
        state.followSel = false;
        $('qx').hidden = !state.q;
        renderIndex();
        var firstMatch = DATA.industries.filter(match)[0];
        if (firstMatch && !match(BYID[state.sel] || {})) { state.sel = firstMatch.id; renderIndex(); renderDetail(); }
      }, 90);
    });
    qi.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var r = DATA.industries.filter(match)[0]; if (r) select(r.id, { mobile: true }); }
    });
    $('qx').addEventListener('click', function () {
      qi.value = ''; state.q = ''; state.page = 0; $('qx').hidden = true; renderIndex(); qi.focus();
    });

    $('idxScroll').addEventListener('click', function (e) {
      var row = e.target.closest('[data-id]');
      if (row) select(row.getAttribute('data-id'), { mobile: true });
    });
    $('deck').addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]');
      if (b) select(b.getAttribute('data-jump'), { mobile: true });
    });
    $('idxScroll').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var ids = flatIds();
      var at = ids.indexOf(state.sel);
      var to = e.key === 'ArrowDown' ? at + 1 : at - 1;
      if (at < 0 || to < 0 || to >= ids.length) return;
      e.preventDefault();
      select(ids[to]);
      var el = $('idxScroll').querySelector('[data-id="' + ids[to] + '"]');
      if (el) el.focus();
    });
  }

  fetch('./data/thermometer.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(boot)
    .catch(function () {
      var box = '<div class="empty"><b>자료를 불러오지 못했습니다</b>잠시 뒤 화면 위의 「다시 시도」를 눌러 주세요.</div>';
      $('idxScroll').innerHTML = box;
      $('det').innerHTML = '<div class="det-in">' + box + '</div>';
    });
})();
