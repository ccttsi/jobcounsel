/* 오늘의 브리핑 — briefing/data/briefing.json(스키마 v1.x, briefing/data/SCHEMA.md)을 읽기만 해서 그린다.
   수집·번역·외부 API 호출은 이 파일에 넣지 않는다(역할 분리). 모르는 필드는 무시한다(전방 호환). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var main = $('main');
  var BASE = 'data/';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  /* 원자료의 소수 자릿수를 그대로 둔다(0.42를 0.4로 반올림하면 수치가 바뀐다). 천 단위만 쉼표. */
  function fmt(v) { if (v == null || isNaN(v)) return ''; return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 3 }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  var TRACK_OF = { 'KOGL-1': 'A', 'PUBLIC-DOMAIN': 'A', 'CC-BY-4.0': 'A', 'PRESS': 'B', 'KOGL-NONE': 'B' };

  /* ---------- 배지·출처 ---------- */
  function trackBadge(t) {
    return t === 'B' ? '<span class="bd B" title="트랙 B: 본문을 옮기지 않고 사실·수치만 새로 씀">B · 사실·수치만</span>'
      : '<span class="bd A" title="트랙 A: 라이선스가 허락한 재가공">A · 재가공 허용</span>';
  }
  function srcLine(t, s) {
    if (!s) return '';
    var L = s.license || {}, url = safeUrl(s.source_url);
    return '<div class="src">' + trackBadge(t) +
      (L.verified === false ? '<span class="bd chk">라이선스 확인 중</span>' : '') +
      '<span>' + esc(L.attribution_text || (s.source_name + (s.source_title ? ' 「' + s.source_title + '」' : '') + (L.name ? ' (' + L.name + ')' : ''))) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">원문 보기</a>' : '') + '</div>';
  }

  /* ---------- 도표 (SVG, 카드당 하나) ---------- */
  var W = 320, H = 156, PL = 8, PR = 8, PT = 18, PB = 26;
  function domain(vals, extra) {
    var v = vals.filter(function (x) { return x != null && !isNaN(x); }).concat(extra.filter(function (x) { return x != null; }));
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (lo === hi) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.12; return [lo - (lo < 0 ? pad : 0), hi + (hi > 0 ? pad : 0)];
  }
  function chart(cd) {
    var type = cd.type, labels = arr(cd.labels), S = arr(cd.series).slice(0, 2), n = labels.length;
    if (!n || !S.length) return '';
    var all = []; S.forEach(function (s) { all = all.concat(arr(s.values)); });
    var ref = cd.reference_value != null ? +cd.reference_value : null;
    var barLike = /bar/.test(type);
    var dm = domain(all, barLike ? [0, ref] : [ref]), lo = dm[0], hi = dm[1];
    var y = function (v) { return PT + (hi - v) / (hi - lo) * (H - PT - PB); };
    var iw = W - PL - PR, slot = iw / n, g = '';
    var col = function (s) { return s.emphasis ? 'var(--c-main)' : 'var(--c-sub)'; };
    var label = function (x, yy, v, anchor) { return '<text x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" text-anchor="' + (anchor || 'middle') + '" font-size="10" font-weight="700" fill="var(--ink)">' + esc(fmt(v)) + '</text>'; };

    if (barLike) {
      var base = y(Math.max(lo, Math.min(hi, 0)));
      var k = S.length, bw = Math.min(30, slot * 0.62 / k);
      labels.forEach(function (lb, i) {
        var cx = PL + slot * i + slot / 2;
        S.forEach(function (s, j) {
          var v = arr(s.values)[i]; if (v == null || isNaN(v)) return;
          var x = cx - (bw * k) / 2 + bw * j + (k > 1 ? 1 : 0), yv = y(v), top = Math.min(yv, base), h = Math.max(1, Math.abs(yv - base));
          g += '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (bw - (k > 1 ? 2 : 0)).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + col(s) + '"/>';
          g += label(x + bw / 2 - (k > 1 ? 1 : 0), v >= 0 ? top - 4 : top + h + 11, v);
        });
        g += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + esc(lb) + '</text>';
      });
      g = '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + base.toFixed(1) + '" y2="' + base.toFixed(1) + '" stroke="var(--line-2)" stroke-width="1"/>' + g;
    } else if (type === 'slope' || type === 'line') {
      var xs = labels.map(function (lb, i) { return type === 'slope' ? (i === 0 ? PL + 48 : W - PR - 48) : PL + slot * i + slot / 2; });
      S.forEach(function (s) {
        var pts = []; arr(s.values).forEach(function (v, i) { if (v != null && !isNaN(v)) pts.push([xs[i], y(v), v]); });
        if (pts.length > 1) g += '<polyline fill="none" stroke="' + col(s) + '" stroke-width="' + (s.emphasis ? 2.4 : 1.6) + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p, i) {
          g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + col(s) + '"/>';
          g += type === 'slope' ? label(p[0] + (i === 0 ? -8 : 8), p[1] + 3.5, p[2], i === 0 ? 'end' : 'start') : label(p[0], p[1] - 7, p[2]);
        });
      });
      labels.forEach(function (lb, i) { g += '<text x="' + xs[i].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + esc(lb) + '</text>'; });
    }
    if (ref != null && !(barLike && ref === 0)) {
      var yr = y(ref);
      g += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + yr.toFixed(1) + '" y2="' + yr.toFixed(1) + '" stroke="var(--c-ref)" stroke-width="1" stroke-dasharray="3 3"/>' +
        '<text x="' + (W - PR) + '" y="' + (yr - 3).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="var(--c-ref)">기준 ' + esc(fmt(ref)) + '</text>';
    }
    var aria = S.map(function (s) { return s.name + ': ' + labels.map(function (lb, i) { var v = arr(s.values)[i]; return lb + ' ' + (v == null ? '값 없음' : fmt(v)); }).join(', '); }).join(' / ');
    var legend = '<p class="lg">' + S.map(function (s) { return '<span><i style="background:' + col(s) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '<span>단위 ' + esc(cd.unit) + '</span></p>';
    return '<figure class="ch">' + legend + '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria + ' (단위 ' + cd.unit + ')') + '">' + g + '</svg>' +
      (cd.note ? '<figcaption>' + esc(cd.note) + '</figcaption>' : '') + '</figure>';
  }
  function spark(sp) {
    var v = arr(sp && sp.values).filter(function (x) { return x != null && !isNaN(x); });
    if (v.length < 2) return '';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (lo === hi) { lo -= 1; hi += 1; }
    var w = 100, h = 28, pts = v.map(function (x, i) { return [(i / (v.length - 1)) * (w - 6) + 3, 3 + (hi - x) / (hi - lo) * (h - 6)]; });
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--c-sub)" stroke-width="1.6" vector-effect="non-scaling-stroke" points="' +
      pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.4" fill="var(--c-main)"/></svg>';
  }

  /* ---------- 화면 ---------- */
  var current = null;
  function render(d, opts) {
    opts = opts || {};
    var E = d.edition || {}, srcById = {};
    arr(d.sources).forEach(function (s) { if (s && s.id) srcById[s.id] = s; });
    var ok = function (id, where) { if (srcById[id]) return true; console.warn('[briefing] 출처 id 없음:', id, where); return false; };
    var dates = arr(d.archive_dates);

    var cards = arr(d.cards).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).filter(function (c) {
      var sid = c.source && c.source.source_id;
      if (!sid || !ok(sid, c.id) || (c.chart_data && c.chart_data.source_id && !ok(c.chart_data.source_id, c.id))) return false;
      var lt = c.source.license && c.source.license.type;
      if (lt && TRACK_OF[lt] && TRACK_OF[lt] !== c.track) console.warn('[briefing] 트랙·라이선스 짝 어긋남:', c.id, c.track, lt);
      return true;
    });

    var status = '';
    if (E.data_status && E.data_status !== 'ok' || arr(d.cards).length < 5) {
      status = '<p class="status" role="status"><b>' + (E.data_status === 'fallback' ? '오늘 자 갱신 실패' : '일부 자료 누락') + '</b> ' + esc(E.data_status_note || '이번 호는 카드 수가 평소보다 적습니다.') + '</p>';
    }
    if (opts.notice) status += '<p class="status" role="status">' + esc(opts.notice) + '</p>';

    var picker = dates.length > 1 ? '<label><span class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">지난 호 고르기</span><select id="dateSel">' +
      dates.map(function (x) { return '<option value="' + esc(x) + '"' + (x === E.date ? ' selected' : '') + '>' + esc(x) + (x === dates[0] ? ' (최신)' : '') + '</option>'; }).join('') + '</select></label>' : '';

    var html = '<header class="mast"><div class="mast-top"><span class="ed"><b>제' + esc(E.no) + '호</b><span class="num">' + esc(E.date) + ' (' + esc(E.weekday) + ')</span><span>' + esc(E.reading_minutes || 3) + '분 읽기</span></span>' + picker + '</div>' +
      '<h1>' + esc(E.title) + '</h1>' + (E.subtitle ? '<p>' + esc(E.subtitle) + '</p>' : '') + status + '</header>';

    html += '<ul class="hm" aria-label="오늘의 핵심 수치">' + arr(d.headline_metrics).filter(function (m) { return ok(m.source_id, m.id); }).slice(0, 4).map(function (m) {
      var s = srcById[m.source_id], arw = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '–';
      var dirTxt = m.direction === 'up' ? '증가' : m.direction === 'down' ? '감소' : '보합';
      return '<li class="jc-pop"><span class="lb">' + esc(m.label) + '</span><span class="vl num">' + esc(m.value_text) + '<span class="ar" aria-label="' + dirTxt + '">' + arw + '</span></span>' +
        '<span class="pd">' + esc(m.period) + (m.delta_from ? ' · ' + esc(m.delta_from) + ' 대비' : '') + '</span>' + spark(m.spark) +
        '<span class="ft">' + trackBadge(m.track) + '<span>' + esc(s.source_name) + '</span></span></li>';
    }).join('') + '</ul>';

    html += '<div class="sh"><h2>이슈 카드</h2><small class="num">' + cards.length + '장 · 무슨 일 → 수치·근거 → 상담 시사점</small></div><div class="cards">' +
      cards.map(function (c, i) {
        var t = c.three_step || {};
        return '<article class="card" id="' + esc(c.id) + '" aria-labelledby="t-' + esc(c.id) + '">' +
          '<div class="card-k"><span class="no">' + String(i + 1).padStart(2, '0') + '</span>' + esc(c.category) + '</div>' +
          '<h3 id="t-' + esc(c.id) + '">' + esc(c.title) + '</h3>' + (c.kicker ? '<p class="kicker">' + esc(c.kicker) + '</p>' : '') +
          (c.chart_data ? chart(c.chart_data) : '') +
          (arr(c.key_numbers).length ? '<ul class="kn">' + arr(c.key_numbers).slice(0, 4).map(function (k) {
            return '<li>' + esc(k.label) + ' <b>' + esc(k.value) + '</b>' + (k.delta ? '<i>' + esc(k.delta) + '</i>' : '') + '</li>';
          }).join('') + '</ul>' : '') +
          '<ol class="st"><li><b>무슨 일인가</b>' + esc(t.what) + '</li><li><b>수치·근거</b>' + esc(t.evidence) + '</li><li><b>상담·구직 시사점</b>' + esc(t.implication) + '</li></ol>' +
          (c.counselor_question ? '<p class="q"><b>내담자에게 물어볼 질문</b>' + esc(c.counselor_question) + '</p>' : '') +
          (arr(c.tags).length ? '<div class="tags">' + arr(c.tags).slice(0, 4).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
          srcLine(c.track, c.source) + '</article>';
      }).join('') + '</div>';

    var R = d.radar;
    if (R && arr(R.rows).length) {
      var cols = arr(R.columns).length === 2 ? R.columns : ['해외 동향', '국내 영향'];
      html += '<div class="sh"><h2>' + esc(R.title || 'AI × 직무 변화 레이더') + '</h2><small class="num">기준 ' + esc(R.as_of) + '</small></div><div class="rd">' +
        arr(R.rows).map(function (r) {
          var ids = arr(r.source_ids).filter(function (id) { return ok(id, r.id); });
          return '<section class="rr" aria-label="' + esc(r.group) + '"><h3>' + esc(r.group) + '</h3><div class="two"><div><b>' + esc(cols[0]) + '</b>' + esc(r.abroad) + '</div><div><b>' + esc(cols[1]) + '</b>' + esc(r.domestic) + '</div></div>' +
            '<div class="cs"><span class="ch"><b>바뀌는 것</b>' + esc(r.changing) + '</span><span class="sy"><b>남는 것</b>' + esc(r.staying) + '</span></div>' +
            (ids.length ? '<p class="ids">출처: ' + ids.map(function (id) { var s = srcById[id]; return trackBadge(TRACK_OF[(s.license || {}).type] || 'A') + ' ' + esc(s.source_name); }).join(' · ') + '</p>' : '') + '</section>';
        }).join('') + '</div>';
    }

    var P = d.copyright_policy || {};
    html += '<div class="sh"><h2>출처와 라이선스</h2><small class="num">' + arr(d.sources).length + '건</small></div><ul class="srcs">' +
      arr(d.sources).map(function (s) {
        var L = s.license || {}, t = TRACK_OF[L.type] || '', url = safeUrl(s.source_url);
        return '<li>' + (t ? trackBadge(t) + ' ' : '') + (L.verified === false ? '<span class="bd chk">확인 중</span> ' : '') + esc(s.source_name) + ' 「' + esc(s.source_title) + '」' +
          (url ? ' · <a href="' + esc(url) + '" target="_blank" rel="noopener">원문</a>' : '') +
          '<span class="ln">' + esc(L.name) + (L.scope ? ' · ' + esc(L.scope) : '') + (s.published_at ? ' · 게시 ' + esc(s.published_at) : '') + (L.verified_at ? ' · 확인 ' + esc(L.verified_at) : '') + (s.usage ? ' · ' + esc(s.usage) : '') + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="pol">' + [P.summary, P.track_a_note && 'A: ' + P.track_a_note, P.track_b_note && 'B: ' + P.track_b_note, P.quote_limit_words && '인용은 카드당 ' + P.quote_limit_words + '단어 이내로 제한합니다.', P.contact, d.disclaimer]
        .filter(Boolean).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '<p class="num">갱신 ' + esc(String(d.updated_at || '').replace('T', ' ').slice(0, 16)) + ' · 스키마 ' + esc(d.schema_version) + '</p></div>';

    main.innerHTML = html;
    current = d;
    var sel = $('dateSel');
    if (sel) sel.addEventListener('change', function () { go(sel.value); });
  }

  /* ---------- 불러오기·지난 호 ---------- */
  function get(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function setDateUrl(date, latest) {
    try { var q = latest ? location.pathname : location.pathname + '?date=' + encodeURIComponent(date); history.replaceState(null, '', q + location.hash); } catch (e) {}
  }
  var latest = null;
  function go(date) {
    if (!latest) return;
    if (date === (latest.edition || {}).date) { render(latest); setDateUrl(date, true); return; }
    get(BASE + 'archive/' + encodeURIComponent(date) + '.json').then(function (d) { render(d); setDateUrl(date); })
      .catch(function () { render(latest, { notice: date + ' 브리핑이 없습니다. 최신 호를 보여 드립니다.' }); setDateUrl(date, true); });
  }
  $('pvT').addEventListener('click', function () {
    var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기';
  });
  get(BASE + 'briefing.json').then(function (d) {
    latest = d;
    var want = new URLSearchParams(location.search).get('date');
    if (want && /^\d{4}-\d{2}-\d{2}$/.test(want) && want !== (d.edition || {}).date) go(want); else render(d);
  }).catch(function () {
    main.innerHTML = '<p class="status" role="status"><b>브리핑을 불러오지 못했습니다.</b> 잠시 뒤 다시 열어 주세요.</p>';
  });
})();
