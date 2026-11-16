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

  /* ---------- 화면 ----------
     긴 세로 나열을 하지 않는다: 제호·핵심 수치 아래를 「이슈 카드 / 레이더 / 출처」 탭으로 나누고,
     이슈는 색인 + 카드 한 장, 카드 안 3단은 넓으면 가로 3열·좁으면 ①②③ 탭(순서 그대로). */
  var current = null, UI = { tab: 'issues', card: 0, step: {}, radar: 0 };
  var STEP_NAMES = ['무슨 일', '수치·근거', '상담 시사점'];
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
    UI.card = Math.max(0, Math.min(cards.length - 1, UI.card));

    var status = '';
    if (E.data_status && E.data_status !== 'ok' || arr(d.cards).length < 5) {
      status = '<p class="status" role="status"><b>' + (E.data_status === 'fallback' ? '오늘 자 갱신 실패' : '일부 자료 누락') + '</b> ' + esc(E.data_status_note || '이번 호는 카드 수가 평소보다 적습니다.') + '</p>';
    }
    if (opts.notice) status += '<p class="status" role="status">' + esc(opts.notice) + '</p>';
    var picker = dates.length > 1 ? '<label><span class="sr">지난 호 고르기</span><select id="dateSel">' +
      dates.map(function (x) { return '<option value="' + esc(x) + '"' + (x === E.date ? ' selected' : '') + '>' + esc(x) + (x === dates[0] ? ' (최신)' : '') + '</option>'; }).join('') + '</select></label>' : '';

    var html = '<div class="top"><header class="mast"><div class="mast-top"><span class="ed"><b>제' + esc(E.no) + '호</b><span class="num">' + esc(E.date) + ' (' + esc(E.weekday) + ')</span><span>' + esc(E.reading_minutes || 3) + '분 읽기</span></span>' + picker + '</div>' +
      '<h1>' + esc(E.title) + '</h1>' + (E.subtitle ? '<p>' + esc(E.subtitle) + '</p>' : '') + status + '</header>';
    html += '<ul class="hm" aria-label="오늘의 핵심 수치">' + arr(d.headline_metrics).filter(function (m) { return ok(m.source_id, m.id); }).slice(0, 4).map(function (m) {
      var s = srcById[m.source_id], arw = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '–';
      var dirTxt = m.direction === 'up' ? '증가' : m.direction === 'down' ? '감소' : '보합';
      return '<li class="jc-pop"><span class="lb">' + esc(m.label) + '</span><span class="vl num">' + esc(m.value_text) + '<span class="ar" aria-label="' + dirTxt + '">' + arw + '</span></span>' +
        '<span class="pd">' + esc(m.period) + (m.delta_from ? ' · ' + esc(m.delta_from) + ' 대비' : '') + '</span>' + spark(m.spark) +
        '<span class="ft">' + trackBadge(m.track) + '<span>' + esc(s.source_name) + '</span></span></li>';
    }).join('') + '</ul></div>';

    var R = d.radar, rows = R ? arr(R.rows) : [];
    UI.radar = Math.max(0, Math.min(rows.length - 1, UI.radar));
    var tabs = [['issues', '이슈 카드', cards.length], ['radar', 'AI × 직무 레이더', rows.length], ['sources', '출처·라이선스', arr(d.sources).length]].filter(function (t) { return t[0] !== 'radar' || rows.length; });
    if (!tabs.some(function (t) { return t[0] === UI.tab; })) UI.tab = 'issues';
    html += '<div class="tabs" role="tablist" aria-label="오늘 호 구성">' + tabs.map(function (t) {
      return '<button type="button" role="tab" id="tab-' + t[0] + '" class="tab" data-tab="' + t[0] + '" aria-controls="pane-' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '" tabindex="' + (UI.tab === t[0] ? 0 : -1) + '">' + esc(t[1]) + '<small>' + t[2] + '</small></button>';
    }).join('') + '</div>';

    /* 이슈 */
    html += '<section class="pane" id="pane-issues" role="tabpanel" aria-labelledby="tab-issues"' + (UI.tab === 'issues' ? '' : ' hidden') + '><div class="iss"><div><ol class="idx" aria-label="이슈 색인">' +
      cards.map(function (c, i) {
        return '<li><button type="button" data-card="' + i + '" aria-current="' + (i === UI.card) + '" aria-label="' + (i + 1) + '번: ' + esc(c.title) + '"><span class="n">' + String(i + 1).padStart(2, '0') + '</span><span class="ca">' + esc(c.category) + '</span><span class="ti">' + esc(c.title) + '</span></button></li>';
      }).join('') + '</ol></div><div class="cardbox">' +
      cards.map(function (c, i) {
        var t = c.three_step || {}, st = UI.step[c.id] || 0;
        return '<article class="card" id="' + esc(c.id) + '" data-step="' + st + '" aria-labelledby="t-' + esc(c.id) + '"' + (i === UI.card ? '' : ' hidden') + '>' +
          '<div class="card-top"><div class="card-h"><div class="card-k"><span class="no">' + String(i + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0') + '</span>' + esc(c.category) + '</div>' +
          '<h3 id="t-' + esc(c.id) + '">' + esc(c.title) + '</h3>' + (c.kicker ? '<p class="kicker">' + esc(c.kicker) + '</p>' : '') +
          (arr(c.key_numbers).length ? '<ul class="kn">' + arr(c.key_numbers).slice(0, 4).map(function (k) {
            return '<li>' + esc(k.label) + ' <b>' + esc(k.value) + '</b>' + (k.delta ? '<i>' + esc(k.delta) + '</i>' : '') + '</li>';
          }).join('') + '</ul>' : '') +
          (c.counselor_question ? '<p class="q"><b>내담자에게 물어볼 질문</b>' + esc(c.counselor_question) + '</p>' : '') + '</div>' +
          (c.chart_data ? chart(c.chart_data) : '') + '</div>' +
          '<div class="stp" role="tablist" aria-label="3단 읽기">' + STEP_NAMES.map(function (n, k) {
            return '<button type="button" role="tab" data-step="' + k + '" aria-selected="' + (st === k) + '">' + ['①', '②', '③'][k] + ' ' + n + '</button>';
          }).join('') + '</div>' +
          '<ol class="st"><li><b>무슨 일인가</b>' + esc(t.what) + '</li><li><b>수치·근거</b>' + esc(t.evidence) + '</li><li><b>상담·구직 시사점</b>' + esc(t.implication) + '</li></ol>' +
          '<div class="card-f">' + srcLine(c.track, c.source) + '<span class="pn"><button type="button" data-go="-1" aria-label="이전 이슈"' + (i ? '' : ' disabled') + '>←</button><button type="button" data-go="1" aria-label="다음 이슈"' + (i < cards.length - 1 ? '' : ' disabled') + '>다음 →</button></span></div></article>';
      }).join('') + '</div></div></section>';

    /* 레이더 */
    if (rows.length) {
      var cols = arr(R.columns).length === 2 ? R.columns : ['해외 동향', '국내 영향'];
      html += '<section class="pane" id="pane-radar" role="tabpanel" aria-labelledby="tab-radar"' + (UI.tab === 'radar' ? '' : ' hidden') + '>' +
        '<div class="rgi" aria-label="갈래 고르기">' + rows.map(function (r, i) { return '<button type="button" data-rad="' + i + '" aria-current="' + (i === UI.radar) + '">' + esc(r.group) + '</button>'; }).join('') + '</div>' +
        '<div class="rd">' + rows.map(function (r, i) {
          var ids = arr(r.source_ids).filter(function (id) { return ok(id, r.id); });
          return '<section class="rr' + (i === UI.radar ? ' on' : '') + '" aria-label="' + esc(r.group) + '"><h3>' + esc(r.group) + '</h3><div class="two"><div><b>' + esc(cols[0]) + '</b>' + esc(r.abroad) + '</div><div><b>' + esc(cols[1]) + '</b>' + esc(r.domestic) + '</div></div>' +
            '<div class="cs"><span class="ch"><b>바뀌는 것</b>' + esc(r.changing) + '</span><span class="sy"><b>남는 것</b>' + esc(r.staying) + '</span></div>' +
            (ids.length ? '<p class="ids">출처: ' + ids.map(function (id) { var s = srcById[id]; return trackBadge(TRACK_OF[(s.license || {}).type] || 'A') + ' ' + esc(s.source_name); }).join(' · ') + '</p>' : '') + '</section>';
        }).join('') + '</div><p class="pol num">기준 ' + esc(R.as_of) + '</p></section>';
    }

    /* 출처 */
    var P = d.copyright_policy || {};
    html += '<section class="pane" id="pane-sources" role="tabpanel" aria-labelledby="tab-sources"' + (UI.tab === 'sources' ? '' : ' hidden') + '><div class="srcw"><ul class="srcs">' +
      arr(d.sources).map(function (s) {
        var L = s.license || {}, t = TRACK_OF[L.type] || '', url = safeUrl(s.source_url);
        return '<li>' + (t ? trackBadge(t) + ' ' : '') + (L.verified === false ? '<span class="bd chk">확인 중</span> ' : '') + esc(s.source_name) + ' 「' + esc(s.source_title) + '」' +
          (url ? ' · <a href="' + esc(url) + '" target="_blank" rel="noopener">원문</a>' : '') +
          '<span class="ln">' + esc(L.name) + (L.scope ? ' · ' + esc(L.scope) : '') + (s.published_at ? ' · 게시 ' + esc(s.published_at) : '') + (L.verified_at ? ' · 확인 ' + esc(L.verified_at) : '') + (s.usage ? ' · ' + esc(s.usage) : '') + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="pol">' + [P.summary, P.track_a_note && 'A: ' + P.track_a_note, P.track_b_note && 'B: ' + P.track_b_note, P.quote_limit_words && '인용은 카드당 ' + P.quote_limit_words + '단어 이내로 제한합니다.', P.contact, d.disclaimer]
        .filter(Boolean).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '<p class="num">갱신 ' + esc(String(d.updated_at || '').replace('T', ' ').slice(0, 16)) + ' · 스키마 ' + esc(d.schema_version) + '</p></div></div></section>';

    main.innerHTML = html;
    current = d; current._cards = cards; current._rows = rows;
    var sel = $('dateSel');
    if (sel) sel.addEventListener('change', function () { go(sel.value); });
    linkNews(d);
  }

  /* ---------- 탭·카드 넘김: 다시 그리지 않고 표시만 바꾼다 ---------- */
  function setHash() {
    var h = UI.tab === 'issues' ? (current && current._cards[UI.card] ? '#' + current._cards[UI.card].id : '') : '#' + UI.tab;
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) {}
  }
  function showTab(t, focus) {
    UI.tab = t;
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    Array.prototype.forEach.call(main.querySelectorAll('.pane'), function (p) { p.hidden = p.id !== 'pane-' + t; });
    setHash();
  }
  function showCard(i, focus) {
    var cs = current._cards; if (!cs.length) return;
    UI.card = Math.max(0, Math.min(cs.length - 1, i));
    cs.forEach(function (c, k) { var el = document.getElementById(c.id); if (el) el.hidden = k !== UI.card; });
    Array.prototype.forEach.call(main.querySelectorAll('[data-card]'), function (b) { b.setAttribute('aria-current', String(+b.getAttribute('data-card') === UI.card)); });
    var el = document.getElementById(cs[UI.card].id);
    var top = main.querySelector('.tabs'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
    if (focus && el) { var h = el.querySelector('h3'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
    setHash();
  }
  main.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-tab]'))) { showTab(b.getAttribute('data-tab')); return; }
    if ((b = e.target.closest('[data-card]'))) { showCard(+b.getAttribute('data-card')); return; }
    if ((b = e.target.closest('[data-go]'))) { showCard(UI.card + +b.getAttribute('data-go'), true); return; }
    if ((b = e.target.closest('.stp [data-step]'))) {
      var card = b.closest('.card'), k = b.getAttribute('data-step'); card.setAttribute('data-step', k); UI.step[card.id] = +k;
      Array.prototype.forEach.call(card.querySelectorAll('.stp [data-step]'), function (x) { x.setAttribute('aria-selected', String(x === b)); });
      return;
    }
    if ((b = e.target.closest('[data-rad]'))) {
      UI.radar = +b.getAttribute('data-rad');
      Array.prototype.forEach.call(main.querySelectorAll('[data-rad]'), function (x) { x.setAttribute('aria-current', String(x === b)); });
      Array.prototype.forEach.call(main.querySelectorAll('.rr'), function (r, i) { r.classList.toggle('on', i === UI.radar); });
    }
  });
  main.addEventListener('keydown', function (e) {
    var t = e.target.closest && e.target.closest('[data-tab]');
    if (t && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      var all = Array.prototype.slice.call(main.querySelectorAll('[data-tab]')), i = all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
      i = (i + all.length) % all.length; showTab(all[i].getAttribute('data-tab'), true); e.preventDefault();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (UI.tab !== 'issues' || !current || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable],[role=tab]')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { showCard(UI.card + (e.key === 'ArrowRight' ? 1 : -1), true); }
  });
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h === 'radar' || h === 'sources') UI.tab = h;
    else if (h && current) { current._cards.forEach(function (c, i) { if (c.id === h) { UI.tab = 'issues'; UI.card = i; } }); }
  }
  window.addEventListener('hashchange', function () { if (!current) return; fromHash(); showTab(UI.tab); if (UI.tab === 'issues') showCard(UI.card); });

  /* ---------- 17-1 오늘의 원문 연결: news.json이 있을 때만 링크를 그린다 ---------- */
  var news = null;
  function linkNews(d) {
    var apply = function (n) {
      if (!n || !arr(n.items).length || n.date !== (d.edition || {}).date) return;
      var byIssue = {}, total = 0;
      arr(n.items).forEach(function (it) { if (it && it.track === 'A' && ((it.source || {}).license || {}).verified === true) { total++; if (it.issue_id) byIssue[it.issue_id] = (byIssue[it.issue_id] || 0) + 1; } });
      if (!total) return;
      var idx = main.querySelector('.idx');
      if (idx && !main.querySelector('.news-all')) idx.insertAdjacentHTML('afterend', '<p class="news-all"><a href="news/">오늘의 원문 ' + total + '건 →</a></p>');
      arr(d.cards).forEach(function (c) {
        var el = c.issue_id && byIssue[c.issue_id] && document.getElementById(c.id);
        if (el && !el.querySelector('.news-more')) el.querySelector('.card-f').insertAdjacentHTML('beforebegin', '<a class="news-more" href="news/?issue=' + encodeURIComponent(c.issue_id) + '">오늘의 원문 더 보기 →</a>');
      });
    };
    if (news) { apply(news); return; }
    get(BASE + 'news.json').then(function (n) { news = n; apply(n); }).catch(function () {});
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
    current = { _cards: arr(d.cards).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }) }; fromHash();
    if (want && /^\d{4}-\d{2}-\d{2}$/.test(want) && want !== (d.edition || {}).date) go(want); else render(d);
  }).catch(function () {
    main.innerHTML = '<p class="status" role="status"><b>브리핑을 불러오지 못했습니다.</b> 잠시 뒤 다시 열어 주세요.</p>';
  });
})();
