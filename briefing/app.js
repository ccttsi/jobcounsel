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
  /* ---------- 17-2: 권역 배지(07:00 한국판 / 23:00 해외판)와 갱신 시각 ----------
     필드가 없으면 아무것도 그리지 않는다(전방 호환). 읽는 필드: 항목의 edition("kr-0700"|"global-2300", 둘이면 배열), updated_at, run_id,
     루트 runs[edition].status === "failed"·last_ok(선택). */
  var ED = { 'kr-0700': ['kr', '한국판 07:00', '07:00 한국 갱신'], 'global-2300': ['gl', '해외판 23:00', '23:00 해외 갱신'] };
  function eds(x) { return arr(Array.isArray(x && x.edition) ? x.edition : (x && typeof x.edition === 'string' ? [x.edition] : [])).filter(function (e) { return ED[e]; }); }
  function kst(t) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(String(t || '')); return m ? m[2] + '-' + m[3] + ' ' + m[4] : ''; }
  function edBadges(x) { return eds(x).map(function (e) { return '<span class="bd ed ' + ED[e][0] + '">' + ED[e][1] + '</span>'; }).join(''); }
  function edStamp(x) {
    var e = eds(x); if (!e.length || !x.updated_at) return '';
    return '<span class="eds num">' + e.map(function (k) { return ED[k][2]; }).join(' · ') + ' · ' + esc(String(x.updated_at).replace('T', ' ').slice(0, 16)) + '</span>';
  }
  function edBand(d) {
    var last = {}, seen = false;
    arr(d.cards).concat(arr(d.headline_metrics), arr((d.radar || {}).rows)).forEach(function (x) {
      var e = eds(x); if (!e.length) return; seen = true;
      if (e.length === 1 && x.updated_at && (!last[e[0]] || x.updated_at > last[e[0]])) last[e[0]] = x.updated_at;   // 두 권역에 걸친 항목의 시각은 어느 권역 것인지 알 수 없어 띠 계산에서 뺀다
    });
    var runs = d.runs || {};
    Object.keys(runs).forEach(function (e) { if (ED[e]) seen = true; });
    if (!seen) return '';
    return '<span class="edband">' + Object.keys(ED).map(function (e) {
      var r = runs[e] || {}, failed = r.status === 'failed';
      /* 권역 하나 = 한 줄(.edr) — 휴대폰에서는 한국판·해외판이 위아래 두 줄로 같은 칸에 선다(2026-11-23 IMG_7862) */
      return '<span class="edr"><span class="bd ed ' + ED[e][0] + '">' + ED[e][1] + '</span>' + (last[e] || r.updated_at ? '<span class="num edt">최근 갱신 ' + esc(kst(last[e] || r.updated_at)) + '</span>' : '<span class="edt">아직 없음</span>') +
        (failed ? '<span class="bd chk">갱신 실패' + (r.last_ok ? '(직전 ' + esc(String(r.last_ok).slice(5, 10)) + ' 자)' : '') + '</span>' : '') + '</span>';
    }).join('<span class="sep" aria-hidden="true">·</span>') + '</span>';
  }

  /* ---------- 17-2: 하단 메인테마(날짜와 무관하게 계속 보는 핵심) ----------
     읽는 필드: main_themes[{theme_id, title, summary, updated_at, items[{issue_id, title, source, license, first_seen, last_updated, track}]}].
     license.verified가 true인 항목만. 기본은 접힘 — 테마를 누르면 그 테마 하나만 펼친다(세로로 늘어놓지 않는다). */
  function themesHtml(d, cards) {
    var T = arr(d.main_themes).map(function (t) {
      var items = arr(t.items).filter(function (it) { return it && it.license && it.license.verified === true; });
      return { t: t, items: items };
    }).filter(function (x) { return x.items.length; });
    if (!T.length) return '';
    var cardByIssue = {}; cards.forEach(function (c) { if (c.issue_id) cardByIssue[c.issue_id] = c.id; });
    UI.themeData = T; UI.cardByIssue = cardByIssue;
    return '<section class="themes" id="themes" aria-labelledby="thH"><h2 id="thH">메인테마</h2><small>날짜와 무관하게 계속 보는 핵심</small><div class="th-list" data-jc-pop>' + T.map(function (x, i) {
      return '<button type="button" class="th-b" data-theme="' + i + '" aria-haspopup="dialog"><b>' + esc(x.t.title) + '</b><span class="num">' + x.items.length + '건</span></button>';
    }).join('') + '</div></section>';
  }
  /* 테마는 페이지를 늘리지 않고 아래에서 올라오는 시트로 연다(무의미한 세로 스크롤 금지) */
  var lastThemeBtn = null;
  function openTheme(i, btn) {
    var x = (UI.themeData || [])[i]; if (!x) return; lastThemeBtn = btn;
    var sh = $('thSheet');
    if (!sh) { document.body.insertAdjacentHTML('beforeend', '<div class="th-sheet" id="thSheet" role="dialog" aria-modal="true" aria-labelledby="thT" hidden></div>'); sh = $('thSheet');
      sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-th-close]')) closeTheme(); else if (e.target.closest('a[href^="#"]')) closeTheme(true); }); }
    sh.innerHTML = '<div class="th-in"><div class="th-top"><div><b id="thT">' + esc(x.t.title) + '</b>' + (x.t.updated_at ? ' <small class="num">갱신 ' + esc(String(x.t.updated_at).slice(0, 10)) + '</small>' : '') + '</div><button type="button" class="th-x" data-th-close aria-label="닫기">닫기</button></div>' +
      (x.t.summary ? '<p class="th-s">' + esc(x.t.summary) + '</p>' : '') + '<ol class="th-i">' +
      x.items.map(function (it) {
        var src = typeof it.source === 'string' ? { source_name: it.source } : (it.source || {}), L = it.license || {}, su = safeUrl(src.source_url);
        var go = it.issue_id && UI.cardByIssue[it.issue_id] ? '<a href="#' + esc(UI.cardByIssue[it.issue_id]) + '">오늘 카드</a>' : '';
        var t = it.track || TRACK_OF[L.type] || 'A';
        return '<li><span class="th-t">' + esc(it.title) + '</span><span class="th-m">' + trackBadge(t) + '<span>' + esc(src.source_name || '') + (L.name ? ' · ' + esc(L.name) : '') + '</span>' +
          (it.first_seen ? '<span class="num">처음 ' + esc(String(it.first_seen).slice(0, 10)) + '</span>' : '') + (it.last_updated ? '<span class="num">최근 ' + esc(String(it.last_updated).slice(0, 10)) + '</span>' : '') +
          go + (su ? '<a href="' + esc(su) + '" target="_blank" rel="noopener">원문</a>' : '') + '</span></li>';
      }).join('') + '</ol></div>';
    sh.hidden = false; requestAnimationFrame(function () { sh.classList.add('open'); var c = sh.querySelector('[data-th-close]'); if (c) c.focus({ preventScroll: true }); });
  }
  function closeTheme(keepFocus) {
    var sh = $('thSheet'); if (!sh || sh.hidden) return;
    sh.classList.remove('open'); setTimeout(function () { if (!sh.classList.contains('open')) sh.hidden = true; }, 260);
    if (!keepFocus && lastThemeBtn) lastThemeBtn.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTheme(); });

  function srcLine(t, s, extra) {
    if (!s) return '';
    var L = s.license || {}, url = safeUrl(s.source_url);
    return '<div class="src">' + trackBadge(t) +
      (L.verified === false ? '<span class="bd chk">라이선스 확인 중</span>' : '') +
      '<span>' + esc(L.attribution_text || (s.source_name + (s.source_title ? ' 「' + s.source_title + '」' : '') + (L.name ? ' (' + L.name + ')' : ''))) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">원문 보기</a>' : '') + (extra || '') + '</div>';
  }

  /* ---------- 도표 (SVG, 카드당 하나) ----------
     그림은 카드가 실제로 그려진 폭(px)에 맞춰 그린다 — 화면 폭에 따라 글자가 작아지거나 커지지 않는다.
     X축 이름표가 제 칸에 다 들어가면 그대로 두고, 하나라도 넘칠 때만 짧은 이름 + ⓘ(말풍선)로 접는다. */
  var CW = { PL: 10, PR: 10, PT: 18, H: 112 };
  function domain(vals, extra) {
    var v = vals.filter(function (x) { return x != null && !isNaN(x); }).concat(extra.filter(function (x) { return x != null; }));
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (lo === hi) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.12; return [lo - (lo < 0 ? pad : 0), hi + (hi > 0 ? pad : 0)];
  }
  function chart(cd, id) { return '<figure class="ch" data-cv="' + esc(id) + '"></figure>'; }

  function chartInner(cd, w) {
    var type = cd.type, labels = arr(cd.labels), S = arr(cd.series).slice(0, 2), n = labels.length;
    if (!n || !S.length) return '';
    var all = []; S.forEach(function (s) { all = all.concat(arr(s.values)); });
    var ref = cd.reference_value != null ? +cd.reference_value : null;
    var barLike = /bar/.test(type);
    var dm = domain(all, barLike ? [0, ref] : [ref]), lo = dm[0], hi = dm[1];
    var pl = CW.PL, pr = CW.PR, pt = CW.PT;
    var iw = Math.max(60, w - pl - pr), slot = iw / n;
    var ax = JC_AXL.plan(labels, { width: iw, font: 11, gap: 9 });
    var fold = ax.fold, PB = fold ? 34 : 24, H = pt + CW.H + PB;
    var y = function (v) { return pt + (hi - v) / (hi - lo) * CW.H; };
    var col = function (s) { return s.emphasis ? 'var(--c-main)' : 'var(--c-sub)'; };
    /* 값 라벨 자리를 기억해 둔다 — 기준선 이름표가 겹칠 자리를 피해 앉도록 */
    var vboxes = [], lowLab = 0;
    var label = function (x, yy, v, anchor) {
      var t = String(fmt(v)), wv = JC_AXL.measure(t, 10.5, 700), an = anchor || 'middle';
      var left = an === 'end' ? x - wv : an === 'middle' ? x - wv / 2 : x;
      if (left < 1) x += 1 - left; else if (left + wv > w - 1) x -= left + wv - (w - 1);   /* 도표 오른쪽·왼쪽 밖으로 넘치지 않게 */
      left = an === 'end' ? x - wv : an === 'middle' ? x - wv / 2 : x;
      vboxes.push([left, yy - 11, left + wv, yy + 3]);
      return '<text x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" text-anchor="' + an + '" font-size="10.5" font-weight="700" fill="var(--ink)">' + esc(fmt(v)) + '</text>';
    };
    var xOf = function (i) { return type === 'slope' ? (i === 0 ? pl + 48 : w - pr - 48) : pl + slot * i + slot / 2; };
    /* 글자 폭만큼 도표 밖으로 나가지 않게 가운데를 당긴다(선그래프의 양끝 이름표) */
    var midX = function (x, t, fs, wt) {
      var hw = JC_AXL.measure(t, fs, wt) / 2;
      if (x - hw < 1) x = 1 + hw; if (x + hw > w - 1) x = w - 1 - hw;
      return x;
    };
    var g = '';

    if (barLike) {
      var base = y(Math.max(lo, Math.min(hi, 0)));
      var k = S.length, bw = Math.min(34, slot * 0.62 / k);
      labels.forEach(function (lb, i) {
        var cx = xOf(i);
        S.forEach(function (s, j) {
          var v = arr(s.values)[i]; if (v == null || isNaN(v)) return;
          var x = cx - (bw * k) / 2 + bw * j + (k > 1 ? 1 : 0), yv = y(v), top = Math.min(yv, base), h = Math.max(1, Math.abs(yv - base));
          g += '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (bw - (k > 1 ? 2 : 0)).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + col(s) + '"/>';
          var ly = v >= 0 ? top - 4 : top + h + 11;
          if (v < 0) lowLab = Math.max(lowLab, ly);   /* 0 아래로 내려간 값 라벨 — 축 이름표 줄을 밀아낸다 */
          g += label(x + bw / 2 - (k > 1 ? 1 : 0), ly, v);
        });
      });
      g = '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + base.toFixed(1) + '" y2="' + base.toFixed(1) + '" stroke="var(--line-2)" stroke-width="1"/>' + g;
    } else if (type === 'slope' || type === 'line') {
      var xs = labels.map(function (lb, i) { return xOf(i); });
      S.forEach(function (s) {
        var pts = []; arr(s.values).forEach(function (v, i) { if (v != null && !isNaN(v)) pts.push([xs[i], y(v), v]); });
        if (pts.length > 1) g += '<polyline fill="none" stroke="' + col(s) + '" stroke-width="' + (s.emphasis ? 2.4 : 1.6) + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p, i) {
          g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + col(s) + '"/>';
          g += type === 'slope' ? label(p[0] + (i === 0 ? -8 : 8), p[1] + 3.5, p[2], i === 0 ? 'end' : 'start') : label(p[0], p[1] - 7, p[2]);
        });
      });
    }
    if (ref != null && !(barLike && ref === 0)) {
      var yr = y(ref);
      g += '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + yr.toFixed(1) + '" y2="' + yr.toFixed(1) + '" stroke="var(--c-ref)" stroke-width="1" stroke-dasharray="3 3"/>';
      /* 기준선 이름표 — 값 라벨과 겹치지 않는 자리(오른쪽 위 → 아래 → 왼쪽)를 골라 앉힌다. */
      var rt = '기준 ' + fmt(ref), rw = JC_AXL.measure(rt, 10, 400);
      var cand = [[w - pr, yr - 3, 'end'], [w - pr, yr + 11, 'end'], [w - pr, yr - 16, 'end'], [w - pr, yr + 24, 'end'],
                  [pl, yr - 3, 'start'], [pl, yr + 11, 'start'], [pl, yr - 16, 'start'], [pl, yr + 24, 'start']];
      var hitBox = function (l, t, r2, b) {
        return vboxes.some(function (q) { return !(r2 <= q[0] - 2 || l >= q[2] + 2 || b <= q[1] - 2 || t >= q[3] + 2); });
      };
      var pick = cand[0];
      for (var ci = 0; ci < cand.length; ci++) {
        var c = cand[ci], cl = c[2] === 'end' ? c[0] - rw : c[0], cr = cl + rw, ct = c[1] - 10, cb = c[1] + 3;
        if (cl < 0 || cr > w || ct < 0 || cb > H) continue;
        if (hitBox(cl, ct, cr, cb)) continue;
        pick = c; break;
      }
      g += '<text x="' + pick[0] + '" y="' + pick[1].toFixed(1) + '" text-anchor="' + pick[2] + '" font-size="10" fill="var(--c-ref)">' + esc(rt) + '</text>';
    }

    /* 0 아래 값 라벨이 축 이름표 줄을 침범하면 도표 아래를 그만큼 늘린다(라벨을 지우지 않는다). */
    if (lowLab > pt + CW.H) {
      PB = Math.max(PB, Math.ceil(lowLab + 25 - pt - CW.H));
      H = pt + CW.H + PB;
    }

    /* X축 이름표 — 제 칸에 다 들어가면 그대로, 하나라도 넘치면 짧은 이름 1줄 + ⓘ로 접는다(부가설명은 말풍선에서만) */
    var axs = '';
    if (!fold) {
      labels.forEach(function (lb, i) {
        axs += '<text x="' + midX(xOf(i), lb, 11, 400).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(lb) + '</text>';
      });
    } else {
      ax.items.forEach(function (it, i) {
        var cx = midX(xOf(i), it.coreText, 11, 600).toFixed(1);
        axs += '<text x="' + cx + '" y="' + (H - 22) + '" text-anchor="middle" font-size="11" font-weight="600" fill="var(--muted)">' + esc(it.coreText) + '</text>';
        axs += JC_AXL.icon(+cx, H - 9, i);
      });
      /* 막대·이름표를 함께 덮는 누름 자리 — 손가락이 닿는 넓이(칸 전체) */
      ax.items.forEach(function (it, i) {
        var hw = type === 'slope' ? Math.min(iw / 2, 140) : slot;
        var x = Math.max(0, xOf(i) - hw / 2), wd = Math.min(w - x, hw);
        g += '<rect class="axh" x="' + x.toFixed(1) + '" y="0" width="' + wd.toFixed(1) + '" height="' + H + '" pointer-events="all" data-ax="' + i + '" data-axl="' + esc(it.full) + '" role="button" tabindex="0" aria-expanded="false" aria-label="' + esc(it.full) + ' 전체 이름 보기"/>';
      });
    }

    var aria = S.map(function (s) { return s.name + ': ' + labels.map(function (lb, i) { var v = arr(s.values)[i]; return lb + ' ' + (v == null ? '값 없음' : fmt(v)); }).join(', '); }).join(' / ');
    var legend = '<p class="lg">' + S.map(function (s) { return '<span><i style="background:' + col(s) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '<span>단위 ' + esc(cd.unit) + '</span></p>';
    return legend + '<svg class="chs" viewBox="0 0 ' + Math.round(w) + ' ' + H + '" width="' + Math.round(w) + '" height="' + H + '" role="img" aria-label="' + esc(aria + ' (단위 ' + cd.unit + ')') + '">' + axs + g + '</svg>' +
      (cd.note ? '<figcaption>' + esc(cd.note) + '</figcaption>' : '');
  }

  /* 카드가 화면에 그려진 뒤 실제 폭으로 도표를 그린다. 폭이 바뀌면 다시 그린다. */
  function paintChart(fig) {
    var id = fig.getAttribute('data-cv'), cs = (current && current._cards) || [], cd = null;
    for (var i = 0; i < cs.length; i++) if (String(cs[i].id) === id) { cd = cs[i].chart_data; break; }
    if (!cd) return;
    var st = window.getComputedStyle(fig);
    var w = Math.round(fig.clientWidth - (parseFloat(st.paddingLeft) || 0) - (parseFloat(st.paddingRight) || 0));
    if (w < 80) return;                                   /* 아직 숨은 카드 — 보이면 ResizeObserver가 다시 부른다 */
    if (fig._w === w && fig.firstChild) return;
    JC_AXL.close();
    JC_AXL.font(st.fontFamily);
    fig.innerHTML = chartInner(cd, w);
    fig._w = w;
    if (fig.firstChild) JC_AXL.bind(fig); else fig.hidden = true;
  }
  function paintCharts() {
    Array.prototype.forEach.call(main.querySelectorAll('figure.ch[data-cv]'), function (fig) {
      if (chartRO && !fig._ro) { fig._ro = 1; chartRO.observe(fig); }
      paintChart(fig);
    });
  }
  var chartRO = window.ResizeObserver ? new ResizeObserver(function (list) {
    for (var i = 0; i < list.length; i++) paintChart(list[i].target);
  }) : null;
  window.addEventListener('resize', paintCharts);

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
  var current = null, UI = { tab: 'issues', card: 0, step: {}, radar: 0, theme: '' };
  /* 지난 호 목록 — archive/<날짜>.json 은 자기 날짜만 archive_dates 에 담고 있어서, 그 파일만 보고 그리면
     지난 호를 연 순간 「지난 호 고르기」가 사라져 최신 호로 돌아올 길이 없다. 한 번이라도 본 날짜를 모아 두고,
     「최신」 표시는 실제 최신 호(오늘)에만 붙인다. */
  var knownDates = [], latestDate = '';
  function archiveList(d) {
    var seen = {};
    knownDates.concat(arr(d.archive_dates)).forEach(function (x) { x = String(x || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(x)) seen[x] = 1; });
    knownDates = Object.keys(seen).sort().reverse();
    return knownDates;
  }
  /* ---------- 미니 달력 · 연결고리(체인) ---------- */
  var CAL = null;
  function initCalendar(cur, dates) {
    var btn = $('dateBtn'); if (!btn || !window.JC_CAL) return;
    CAL = JC_CAL({ button: btn, dates: dates, current: cur, label: calLabel, onPick: function (x) { go(x); } });
    CAL.setDates(dates, cur);
  }
  function chainBtn(key, label) {
    return '<button type="button" class="chain" data-chain="' + esc(key) + '" data-label="' + esc(label || '') + '" aria-haspopup="dialog" aria-label="' + esc((label || '') + ' 같은 흐름의 자료 보기') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9.4 14.6l5.2-5.2"/><path d="M8.1 17.7l-1.5 1.5a3.7 3.7 0 0 1-5.2-5.2l3.1-3.1a3.7 3.7 0 0 1 5.2 0"/><path d="M15.9 6.3l1.5-1.5a3.7 3.7 0 0 1 5.2 5.2l-3.1 3.1a3.7 3.7 0 0 1-5.2 0"/></svg><span>연결고리</span></button>';
  }
  /* ---------- 신산업 지면으로 잇기 ----------
     카드의 태그·제목·주제에서 /emerging/ 이 실제로 결과를 내는 검색어만 고른다(없는 말은 링크를 걸지 않는다). */
  var EMG_TAGS = [
    [/반도체/, '반도체', '반도체'], [/배터리|이차전지/, '배터리', '배터리'], [/로봇/, '로봇', '로봇'],
    [/돌봄/, '돌봄', '돌봄'], [/의료|보건|헬스/, '의료', '디지털헬스'], [/연금/, '연금', '연금'],
    [/훈련/, '훈련', '직업훈련'], [/콘텐츠/, '콘텐츠', '콘텐츠'], [/보안/, '보안', '보안'],
    [/양자/, '양자', '양자'], [/우주/, '우주', '우주'], [/수소/, '수소', '수소'],
    [/전력|에너지/, '에너지', '에너지'], [/데이터/, '데이터', '데이터'], [/(^|\s|·)AI(\s|$|·)|인공지능/, 'AI', 'AI']
  ];
  var EMG_THEME = { 'th-ai-labor': ['AI', 'AI'], 'th-skills-training': ['훈련', '직업훈련'], 'th-pension-social': ['연금', '연금'] };
  function emgOf(c) {
    var bag = arr(c.tags).join(' ') + ' ' + (c.title || '') + ' ' + (c.category || '');
    for (var i = 0; i < EMG_TAGS.length; i++) if (EMG_TAGS[i][0].test(bag)) return { q: EMG_TAGS[i][1], label: EMG_TAGS[i][2] };
    var t = EMG_THEME[c.theme_key];
    return t ? { q: t[0], label: t[1] } : null;
  }
  function emgLink(c) {
    var e = emgOf(c); if (!e) return '';
    return '<a class="emg" href="../emerging/?q=' + encodeURIComponent(e.q) + '" title="신산업 지면에서 「' + esc(e.label) + '」 찾기"><span>신산업</span> <b>' + esc(e.label) + '</b> <i aria-hidden="true">↗</i></a>';
  }
  /* ---------- 노동시장 산책으로 잇기 ----------
     카드가 노동시장 산책 실기사로 표시(labor_walk: true)된 경우에만 칩을 붙인다.
     실기사 목록·날짜는 briefing/data/labor-walk.json이 가지고, 여기서는 그 지면·카드로 딥링크만 건다. */
  function laborWalk(c, date) {
    if (c.labor_walk !== true) return '';
    return '<a class="labw" href="../labor/?date=' + encodeURIComponent(date) + '&card=' + encodeURIComponent(c.id) + '#news" title="노동시장 산책에서 이 기사로 지표 읽기를 연습합니다">' +
      '<span>노동시장 산책</span> <b>실기사로 읽기</b> <i aria-hidden="true">↗</i></a>';
  }
  function countChains() {
    var c = (window.JC_CHAIN && JC_CHAIN.counts) ? JC_CHAIN.counts() : {};
    Array.prototype.forEach.call(main.querySelectorAll('[data-chain]'), function (b) {
      var n = c[b.getAttribute('data-chain')] || 0, s = b.querySelector('.n');
      if (n > 1) { if (!s) { s = document.createElement('span'); s.className = 'n'; b.appendChild(s); } s.textContent = n; }
      else if (s) s.parentNode.removeChild(s);
    });
  }
  var STEP_NAMES = ['무슨 일', '수치·근거', '상담 시사점'];
  /* 휴대폰 3단 탭은 좁아서 「상담 시사점」을 「시사점」으로 줄여 쓴다(화면 낭독기는 aria-label로 전체 이름을 받는다) */
  var STEP_TABS = ['무슨 일', '수치·근거', '시사점'];
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  function weekdayNum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getDay() : 0; }
  function fmtDate(s) { return String(s || '').replace(/-/g, '.'); }
  function calLabel(s) { return fmtDate(s) + ' (' + WEEKDAY[weekdayNum(s)] + ')'; }
  function render(d, opts) {
    opts = opts || {};
    JC_AXL.close();
    var E = d.edition || {}, srcById = {};
    /* 출처 색인 — 2026-09 이전 호는 sources[]에 id 없이 source_id만 있다. 그대로 두면 그 호의 카드가
       통째로 그려지지 않아(지난 날짜 112일·카드 163장) 옛 형식도 받아 준다. 새 데이터는 id를 적는다(SCHEMA §8). */
    arr(d.sources).forEach(function (s) { var k = s && (s.id || s.source_id); if (k) srcById[k] = s; });
    var ok = function (id, where) { if (srcById[id]) return true; console.warn('[briefing] 출처 id 없음:', id, where); return false; };
    var dates = archiveList(d);

    var cards = arr(d.cards).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).filter(function (c) {
      var sid = c.source && c.source.source_id;
      if (!sid || !ok(sid, c.id) || (c.chart_data && c.chart_data.source_id && !ok(c.chart_data.source_id, c.id))) return false;
      var lt = c.source.license && c.source.license.type;
      if (lt && TRACK_OF[lt] && TRACK_OF[lt] !== c.track) console.warn('[briefing] 트랙·라이선스 짝 어긋남:', c.id, c.track, lt);
      return true;
    });
    UI.card = Math.max(0, Math.min(cards.length - 1, UI.card));

    var status = '';
    if (E.data_status && E.data_status !== 'ok') {
      status = '<p class="status" role="status"><b>' + (E.data_status === 'fallback' ? '오늘 자 갱신 실패' : '일부 자료 누락') + '</b> ' + esc(E.data_status_note || '이번 호는 카드 수가 평소보다 적습니다.') + '</p>';
    }
    if (opts.notice) status += '<p class="status" role="status">' + esc(opts.notice) + '</p>';
    var dTxt = fmtDate(E.date), wdTxt = E.weekday || WEEKDAY[weekdayNum(E.date)];
    var html = '<div class="top"><header class="mast">' +
      '<div class="mast-rule"></div>' +
      '<div class="mast-toprow"><h1 class="nameplate">고용·AI 인포 브리핑<small>직업상담 자료실</small></h1>' +
      '<div class="mast-meta"><span class="l"><span class="num">' + esc(E.reading_minutes || 3) + '분 읽기</span></span>' +
      '<span class="datewrap"><button type="button" class="datebtn" id="dateBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/></svg><span data-cal-label>' + esc(calLabel(E.date)) + '</span><svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></span></div></div>' +
      '<div class="mast-double"></div>' +
      '<div class="mast-body"><div class="leadwrap"><span class="mast-kick">오늘의 지면</span><h2 class="mast-lead">' + esc(E.title) + '</h2>' +
      (E.subtitle ? '<p class="mast-deck">' + esc(E.subtitle) + '</p>' : '') + status + (edBand(d) ? '<div class="mast-band">' + edBand(d) + '</div>' : '') + '</div>' +
      (arr(d.headline_metrics).filter(function (m) { return ok(m.source_id, m.id); }).length ? '<section class="hmw"><div class="section-head"><h2>오늘의 숫자</h2><small>원자료 기준</small></div><ul class="hm" aria-label="오늘의 핵심 수치">' + arr(d.headline_metrics).filter(function (m) { return ok(m.source_id, m.id); }).slice(0, 4).map(function (m) {
      var s = srcById[m.source_id], arw = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '–';
      var dirTxt = m.direction === 'up' ? '증가' : m.direction === 'down' ? '감소' : '보합';
      return '<li class="jc-pop"><span class="lb">' + esc(m.label) + '</span><span class="vl num">' + esc(m.value_text) + '<span class="ar" aria-label="' + dirTxt + '">' + arw + '</span></span>' +
        '<span class="pd">' + esc(m.period) + (m.delta_from ? ' · ' + esc(m.delta_from) + ' 대비' : '') + '</span>' + spark(m.spark) +
        '<span class="ft">' + trackBadge(m.track) + edBadges(m) + '<span>' + esc(s.source_name) + '</span></span></li>';
    }).join('') + '</ul></section>' : '') + '</div></header></div>';

    var R = d.radar, rows = R ? arr(R.rows) : [];
    UI.radar = Math.max(0, Math.min(rows.length - 1, UI.radar));
    /* 탭 이름 — 좁은 화면(420px 이하)은 셋째 값의 짧은 이름으로 바꿔 쓴다(탭 줄이 넘치지 않게). */
    var tabs = [['issues', '이슈 카드', '이슈 카드', cards.length], ['radar', 'AI × 직무 레이더', 'AI 레이더', rows.length], ['sources', '출처·라이선스', '출처·라이선스', arr(d.sources).length]].filter(function (t) { return t[0] !== 'radar' || rows.length; });
    if (!tabs.some(function (t) { return t[0] === UI.tab; })) UI.tab = 'issues';
    html += '<div class="tabs" role="tablist" aria-label="오늘 호 구성">' + tabs.map(function (t) {
      return '<button type="button" role="tab" id="tab-' + t[0] + '" class="tab" data-tab="' + t[0] + '" aria-controls="pane-' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '" tabindex="' + (UI.tab === t[0] ? 0 : -1) + '" aria-label="' + esc(t[1]) + ' ' + t[3] + '">' + '<span class="tl">' + esc(t[1]) + '</span><span class="ts" aria-hidden="true">' + esc(t[2]) + '</span><small>' + t[3] + '</small></button>';
    }).join('') + '</div>';

    /* 이슈 */
    html += '<section class="pane" id="pane-issues" role="tabpanel" aria-labelledby="tab-issues"' + (UI.tab === 'issues' ? '' : ' hidden') + '><div class="iss"><div><ol class="idx" aria-label="이슈 색인">' +
      cards.map(function (c, i) {
        return '<li><button type="button" data-card="' + i + '" aria-current="' + (i === UI.card) + '" aria-label="' + (i + 1) + '번: ' + esc(c.title) + '"><span class="n">' + String(i + 1).padStart(2, '0') + '</span><span class="ca">' + esc(c.category) + '</span><span class="ti">' + esc(c.title) + '</span></button></li>';
      }).join('') + '</ol></div><div class="cardbox">' +
      cards.map(function (c, i) {
        var t = c.three_step || {}, st = UI.step[c.id] || 0;
        return '<article class="card" id="' + esc(c.id) + '" data-step="' + st + '" aria-labelledby="t-' + esc(c.id) + '"' + (i === UI.card ? '' : ' hidden') + '>' +
          '<div class="card-top"><div class="card-h"><div class="card-k"><span class="no">' + String(i + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0') + '</span>' + esc(c.category) + edBadges(c) + '</div>' +
          '<h3 id="t-' + esc(c.id) + '">' + esc(c.title) + '</h3>' + (c.kicker ? '<p class="kicker">' + esc(c.kicker) + '</p>' : '') +
          (arr(c.key_numbers).length ? '<ul class="kn">' + arr(c.key_numbers).slice(0, 4).map(function (k) {
            return '<li>' + esc(k.label) + ' <b>' + esc(k.value) + '</b>' + (k.delta ? '<i>' + esc(k.delta) + '</i>' : '') + '</li>';
          }).join('') + '</ul>' : '') +
          (c.counselor_question ? '<p class="q"><b>내담자에게 물어볼 질문</b>' + esc(c.counselor_question) + '</p>' : '') + '</div>' +
          (c.chart_data ? chart(c.chart_data, c.id) : '') + '</div>' +
          '<div class="stp" role="tablist" aria-label="3단 읽기">' + STEP_TABS.map(function (n, k) {
            return '<button type="button" role="tab" data-step="' + k + '" aria-selected="' + (st === k) + '" aria-label="' + ['①', '②', '③'][k] + ' ' + STEP_NAMES[k] + '">' + ['①', '②', '③'][k] + ' ' + n + '</button>';
          }).join('') + '</div>' +
          '<ol class="st"><li><b>무슨 일인가</b>' + esc(t.what) + '</li><li><b>수치·근거</b>' + esc(t.evidence) + '</li><li><b>상담·구직 시사점</b>' + esc(t.implication) + '</li></ol>' +
          '<div class="card-f" data-jc-pop>' + (c.theme_key ? chainBtn(c.theme_key, c.theme_label, c.region) : '') + emgLink(c) + laborWalk(c, E.date) + srcLine(c.track, c.source) + edStamp(c) + '<span class="pn"><button type="button" data-go="-1" aria-label="이전 이슈"' + (i ? '' : ' disabled') + '>←</button><button type="button" data-go="1" aria-label="다음 이슈"' + (i < cards.length - 1 ? '' : ' disabled') + '>다음 →</button></span></div></article>';
      }).join('') + '</div></div></section>';

    /* 레이더 */
    if (rows.length) {
      var cols = arr(R.columns).length === 2 ? R.columns : ['해외 동향', '국내 영향'];
      html += '<section class="pane" id="pane-radar" role="tabpanel" aria-labelledby="tab-radar"' + (UI.tab === 'radar' ? '' : ' hidden') + '>' +
        '<div class="rgi" aria-label="갈래 고르기">' + rows.map(function (r, i) { return '<button type="button" data-rad="' + i + '" aria-current="' + (i === UI.radar) + '">' + esc(r.group) + '</button>'; }).join('') + '</div>' +
        '<div class="rd">' + rows.map(function (r, i) {
          var ids = arr(r.source_ids).filter(function (id) { return ok(id, r.id); });
          return '<section class="rr' + (i === UI.radar ? ' on' : '') + '" aria-label="' + esc(r.group) + '"><h3>' + esc(r.group) + ' ' + edBadges(r) + '</h3><div class="two"><div><b>' + esc(cols[0]) + '</b>' + esc(r.abroad) + '</div><div><b>' + esc(cols[1]) + '</b>' + esc(r.domestic) + '</div></div>' +
            '<div class="cs"><span class="ch"><b>바뀌는 것</b>' + esc(r.changing) + '</span><span class="sy"><b>남는 것</b>' + esc(r.staying) + '</span></div>' +
            (ids.length ? '<div class="ids"><b class="ids-h">출처</b><ul class="ids-l">' + ids.map(function (id) {
              var s = srcById[id];
              return '<li>' + trackBadge(TRACK_OF[(s.license || {}).type] || 'A') + '<span class="ids-n">' + esc(s.source_name) + '</span></li>';
            }).join('') + '</ul></div>' : '') + '</section>';
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

    html += themesHtml(d, cards);
    main.innerHTML = html;
    current = d; current._cards = cards; current._rows = rows;
    initCalendar(E.date, dates);
    paintCharts();
    countChains();
    linkNews(d);
    if (location.hash === '#themes' && $('themes')) $('themes').scrollIntoView({ block: 'start' });
  }

  /* ---------- 탭·카드 넘김: 다시 그리지 않고 표시만 바꾼다 ---------- */
  function setHash() {
    var h = UI.tab === 'issues' ? (current && current._cards[UI.card] ? '#' + current._cards[UI.card].id : '') : '#' + UI.tab;
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) {}
  }
  function showTab(t, focus) {
    JC_AXL.close();
    UI.tab = t;
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    Array.prototype.forEach.call(main.querySelectorAll('.pane'), function (p) { p.hidden = p.id !== 'pane-' + t; });
    setHash();
  }
  function showCard(i, focus) {
    var cs = current._cards; if (!cs.length) return;
    JC_AXL.close();
    UI.card = Math.max(0, Math.min(cs.length - 1, i));
    cs.forEach(function (c, k) { var el = document.getElementById(c.id); if (el) el.hidden = k !== UI.card; });
    Array.prototype.forEach.call(main.querySelectorAll('[data-card]'), function (b) { b.setAttribute('aria-current', String(+b.getAttribute('data-card') === UI.card)); });
    var el = document.getElementById(cs[UI.card].id);
    paintCharts();
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
    if ((b = e.target.closest('.th-b[data-theme]'))) { openTheme(+b.getAttribute('data-theme'), b); return; }
    if ((b = e.target.closest('[data-chain]'))) {
      JC_CHAIN.open(b.getAttribute('data-chain'), { base: BASE, label: b.getAttribute('data-label') || '', today: ((current || {}).edition || {}).date || '' });
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
    if (h === 'themes') { var th = main.querySelector('.themes'); if (th) setTimeout(function () { th.scrollIntoView({ block: 'start' }); }, 0); return; }
    if (h === 'radar' || h === 'sources') UI.tab = h;
    else if (h && current) { current._cards.forEach(function (c, i) { if (c.id === h) { UI.tab = 'issues'; UI.card = i; } }); }
  }
  window.addEventListener('hashchange', function () { if (!current) return; fromHash(); showTab(UI.tab); if (UI.tab === 'issues') showCard(UI.card); });
  /* 대문 검색이 넘긴 ?q= — 제목·갈래에 그 낱말이 있는 카드를 바로 펼친다 */
  window.JCDeepLink = function (term) {
    if (!term || !current) return false;
    var n = String(term).replace(/\s/g, '').toLowerCase();
    var cs = current._cards || [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], hay = ((c.title || '') + ' ' + (c.category || '') + ' ' + (c.theme_label || '')).replace(/\s/g, '').toLowerCase();
      if (hay.indexOf(n) >= 0) { UI.tab = 'issues'; UI.card = i; showTab('issues'); showCard(i); return true; }
    }
    return true;
  };

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
  if (window.JC_CHAIN) JC_CHAIN.load(BASE).then(countChains).catch(function () {});
  get(BASE + 'briefing.json').then(function (d) {
    latest = d; latestDate = (d.edition || {}).date || ''; archiveList(d);   // 지난 호 직접 링크(?date=)로 들어와도 목록이 남게
    var want = new URLSearchParams(location.search).get('date');
    current = { _cards: arr(d.cards).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }) }; fromHash();
    if (want && /^\d{4}-\d{2}-\d{2}$/.test(want) && want !== (d.edition || {}).date) go(want); else render(d);
  }).catch(function () {
    main.innerHTML = '<p class="status" role="status"><b>브리핑을 불러오지 못했습니다.</b> 잠시 뒤 다시 열어 주세요.</p>';
  });
})();
