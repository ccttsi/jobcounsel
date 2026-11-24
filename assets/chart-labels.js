/* 도표 X축 라벨 — 긴 이름은 짧게 접고, 막대·라벨을 누르면 전체 이름을 말풍선으로 띄운다.
   브리핑(briefing/app.js)·신산업(emerging/app.js) 도표가 함께 쓴다.
   규칙: 라벨이 제 칸에 다 들어가면 도표는 지금 모습 그대로 두고, 하나라도 넘칠 때만 접는다.
   접을 때 막대 아래에는 짧은 핵심 이름 1줄 + ⓘ만 남긴다. 괄호 안 기간·출처 같은 부가설명은
   아래에 다시 쓰지 않고 말풍선에서만 보여 준다(같은 이름이 둘이어도 1줄 유지, 말풍선으로 구분). */
(function () {
  'use strict';
  if (window.JC_AXL) return;

  var FONT = '"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Segoe UI",sans-serif';
  var cvs = null, mcache = {};

  function font(f) { if (f) FONT = String(f); }
  /* canvas 글꼴 문자열은 «첫 글꼴 이름»만 준다.
     "Pretendard Variable",Pretendard,-apple-system,… 같은 목록을 통째로 주면 엔진이 문자열을 버리고
     앞서 있던 기본 글꼴로 재어 폭이 15%쯤 작게 나온다 — 그래서 이름표가 접히지 않고 한 줄에 겹쳤다
     (2026-11-24 실기기 사진). 첫 이름만 주면 SVG가 그리는 폭과 같아진다. */
  function face() {
    var f = String(FONT).split(',')[0].trim();
    return f || 'sans-serif';
  }
  function measure(text, px, weight) {
    var t = String(text == null ? '' : text);
    var key = px + '/' + (weight || 600) + '/' + t;
    var v = mcache[key];
    if (v != null) return v;
    if (cvs === null) {
      try { cvs = document.createElement('canvas').getContext('2d'); } catch (e) { cvs = false; }
    }
    if (cvs) { cvs.font = (weight || 600) + ' ' + px + 'px ' + face(); v = cvs.measureText(t).width; }
    else v = t.length * px * 0.95;
    mcache[key] = v;
    return v;
  }
  /* 제 칸에 들어가게 자르고 말줄임표를 붙인다. */
  function fit(text, maxW, px, weight) {
    var t = String(text == null ? '' : text);
    if (measure(t, px, weight) <= maxW) return t;
    var lo = 0, hi = t.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (measure(t.slice(0, mid) + '…', px, weight) <= maxW) lo = mid; else hi = mid - 1;
    }
    if (lo <= 0) return '';
    return t.slice(0, lo).replace(/[\s,·、]+$/, '') + '…';
  }

  function escq(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }

  /* ───────── 값·눈금 숫자 한 벌 ─────────
     빼기 부호는 글꼴 폭에 맡기지 않고 짧은 선으로 그린다.
     iOS는 고정폭 숫자(tabular-nums)에서 마이너스까지 숫자 폭으로 벌려 「- 5.2」처럼 보인다
     (2026-11-24 태화님 실기기 사진). 부호를 선으로 그리면 엔진과 무관하게 숫자에 붙어 보이고,
     숫자 자체는 고정폭 글자 그대로라 눈금 간격 균일성은 유지된다.
     쓰는 법: num('-5.2', {x, y, anchor:'middle', fs:10.5, weight:700, fill:'var(--ink)'})
     → {html, left, right, w} (left·right는 그린 글자의 좌우 끝 좌표) */
  var SIGN = { w: 0.238, gap: 0.057, top: 0.291, h: 0.119 };   /* 글자 크기(fs) 배수 — Pretendard 굵은 700의 하이픈 잉크 실측값 */
  function numW(text, fs, weight) {
    var t = String(text == null ? '' : text), f = fs || 10.5;
    var neg = t.charAt(0) === '-', body = neg ? t.slice(1) : t;
    return measure(body, f, weight || 400) + (neg ? f * (SIGN.w + SIGN.gap) : 0);
  }
  function num(text, o) {
    o = o || {};
    var t = String(text == null ? '' : text);
    var fs = o.fs || 10.5, wt = o.weight || 400, an = o.anchor || 'start';
    var neg = t.charAt(0) === '-', body = neg ? t.slice(1) : t;
    var bw = measure(body, fs, wt);
    var sw = neg ? fs * SIGN.w : 0, gap = neg ? fs * SIGN.gap : 0;
    var total = sw + gap + bw;
    var left = an === 'end' ? o.x - total : an === 'middle' ? o.x - total / 2 : o.x;
    var y = o.y, fill = o.fill || 'var(--ink)', h = '';
    if (neg) {
      h += '<rect x="' + left.toFixed(2) + '" y="' + (y - fs * SIGN.top).toFixed(2) + '" width="' + sw.toFixed(2) +
        '" height="' + (fs * SIGN.h).toFixed(2) + '" rx="' + (fs * SIGN.h / 2).toFixed(2) + '" fill="' + fill + '"/>';
    }
    h += '<text x="' + (left + sw + gap).toFixed(2) + '" y="' + y.toFixed(1) + '" text-anchor="start" font-size="' + fs + '"' +
      (wt !== 400 ? ' font-weight="' + wt + '"' : '') + ' fill="' + fill + '">' + escq(body) + '</text>';
    return { html: h, left: left, right: left + total, w: total };
  }

  /* ───────── 겹침 재기 — 값 라벨이 선·점·다른 라벨에 닿지 않게 자리를 고를 때 ───────── */
  function segSeg(ax, ay, bx, by, px, py, qx, qy) {
    var d1 = (qx - px) * (ay - py) - (qy - py) * (ax - px), d2 = (qx - px) * (by - py) - (qy - py) * (bx - px);
    var d3 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), d4 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  /* box = [left, top, right, bottom], seg = [x1, y1, x2, y2] */
  function hitSeg(box, seg, m) {
    m = m == null ? 1.5 : m;
    var l = box[0] - m, t = box[1] - m, r = box[2] + m, b = box[3] + m;
    var x1 = seg[0], y1 = seg[1], x2 = seg[2], y2 = seg[3];
    if ((x1 >= l && x1 <= r && y1 >= t && y1 <= b) || (x2 >= l && x2 <= r && y2 >= t && y2 <= b)) return true;
    return segSeg(x1, y1, x2, y2, l, t, r, t) || segSeg(x1, y1, x2, y2, r, t, r, b) ||
           segSeg(x1, y1, x2, y2, r, b, l, b) || segSeg(x1, y1, x2, y2, l, b, l, t);
  }
  function hitDot(box, dot, pad) {
    var nx = Math.max(box[0], Math.min(dot[0], box[2])), ny = Math.max(box[1], Math.min(dot[1], box[3]));
    var rr = (dot[2] || 3.2) + (pad == null ? 1 : pad);
    return (dot[0] - nx) * (dot[0] - nx) + (dot[1] - ny) * (dot[1] - ny) < rr * rr;
  }
  function hitBox(a, b, m) {
    m = m == null ? 1.5 : m;
    return !(a[2] + m <= b[0] || a[0] - m >= b[2] || a[3] + m <= b[1] || a[1] - m >= b[3]);
  }

  /* "신규 채용(상하이과기대, 2023~2026초)" → 이름 「신규 채용」 + 설명 「상하이과기대, 2023~2026초」 */
  function unwrap(label) {
    var s = String(label == null ? '' : label).replace(/\s+/g, ' ').trim();
    var m = /^([^（()]+?)\s*[（(]\s*([^（）()]*?)\s*[)）]\s*$/.exec(s);
    if (m && m[1]) return { core: m[1].trim(), note: m[2].trim() };
    var p = s.split(' ');
    if (p.length > 1) {
      var last = p[p.length - 1];
      if (/^\d/.test(last) && last.length <= 10 && p[0].length <= 8) return { core: p.slice(0, -1).join(' '), note: last };
    }
    return { core: s, note: '' };
  }

  /* labels, {width: 칸 전체 폭(px), font, gap} → {fold, slot, items} */
  function plan(labels, o) {
    o = o || {};
    var n = labels.length, fs = o.font || 11, gap = o.gap == null ? 8 : o.gap;
    var width = Math.max(60, +o.width || 300);
    var slot = width / n;
    var items = labels.map(function (lb) {
      var u = unwrap(lb);
      return { full: String(lb == null ? '' : lb), core: u.core, note: u.note,
        fw: measure(String(lb == null ? '' : lb), fs, 400),
        coreText: u.core };
    });
    var fold = false;
    for (var i = 0; i < n; i++) if (items[i].fw > slot - gap) fold = true;
    if (!fold) return { fold: false, slot: slot, font: fs, items: items };
    /* 접을 때: 핵심 이름 한 줄만 남긴다. 괄호 안 설명은 아래에 쓰지 않고 말풍선(it.full)에서만. */
    items.forEach(function (it) {
      it.coreText = fit(it.core, Math.max(16, slot - 6), fs, 600);
    });
    return { fold: true, slot: slot, font: fs, items: items };
  }

  /* 수납형 트리거 아이콘(ⓘ) — 도표 안에 그린다. 누르는 넓이는 도표 쪽에서 준다. */
  function icon(cx, cy, i) {
    cx = Math.round(cx * 10) / 10; cy = Math.round(cy * 10) / 10;
    return '<g class="axi" data-axi="' + i + '" aria-hidden="true">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="6.1" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
      '<path d="M' + cx + ' ' + (cy + 0.2) + 'v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + (cy - 3) + '" r=".9" fill="currentColor"/></g>';
  }

  /* ───────── 말풍선 ───────── */
  var pop = null, openState = null, hoverTimer = 0, closeTimer = 0, hideTimer = 0;

  function ensurePop() {
    if (pop && pop.parentNode) return pop;
    pop = document.createElement('div');
    pop.className = 'axp';
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    pop.innerHTML = '<i class="axp-c" aria-hidden="true"></i><span class="axp-t"></span>';
    document.body.appendChild(pop);
    return pop;
  }

  /* 말풍선 자리: 값 라벨을 가리지 않는 자리를 고른다.
     예전에는 누른 칸 바로 위(도표 아래 띠 위)에만 띄워서, 그 위에 앉은 값 라벨(예: c01 2022의 36.1)을
     덮었다(2026-11-24 태화님 사진). 이제 ① 지금처럼 띠 위 → ② 값 라벨들 위로 올림 → ③ 도표 아래 →
     ④ 도표 위 순서로 값 라벨과 겹치지 않는 첫 자리를 쓴다. */
  function valueBoxes(fig, svg) {
    var vb = (fig && fig._vlab) || [], sr = svg && svg.getBoundingClientRect();
    if (!sr || !vb.length) return [];
    var k = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? sr.width / svg.viewBox.baseVal.width : 1;
    return vb.map(function (q) {
      return [sr.left + q[0] * k, sr.top + q[1] * k, sr.left + q[2] * k, sr.top + q[3] * k];
    });
  }
  function place(cx, cy, fig, svg) {
    var p = ensurePop();
    var vw = window.innerWidth, vh = window.innerHeight;
    /* 폭·높이는 «화면 왼쪽 끝에 붙였을 때»로 잰다. 앞서 놓인 자리(left)에 따라
       fixed 요소의 쓸 수 있는 폭이 줄어 글자가 접히고 높이가 달라지기 때문이다(아직 투명한 때라 깜박이지 않는다). */
    p.style.left = '8px';
    p.style.top = '-9999px';
    var pw = p.offsetWidth, ph = p.offsetHeight;
    var left = Math.min(Math.max(8, cx - pw / 2), Math.max(8, vw - pw - 8));
    var boxes = valueBoxes(fig, svg), sr = svg && svg.getBoundingClientRect();
    var above = cy - ph - 12 >= 6 || cy > vh - cy;
    var tops = [above ? cy - ph - 12 : cy + 12, above ? cy + 12 : cy - ph - 12];
    /* ② 띠 위에 앉은 값 라벨들보다 위로 올린다 */
    var top = 1e9;
    for (var i = 0; i < boxes.length; i++) {
      var q = boxes[i];
      if (q[2] < left - 4 || q[0] > left + pw + 4) continue;
      if (q[3] < cy - 6) top = Math.min(top, q[1]);
    }
    if (top < 1e9) tops.push(top - ph - 8);
    if (sr) { tops.push(sr.bottom + 6); tops.push(sr.top - ph - 6); }
    var best = tops[0], bestHit = 1e9;
    for (var t2 = 0; t2 < tops.length; t2++) {
      var tp = Math.min(Math.max(6, tops[t2]), Math.max(6, vh - ph - 6));
      var hits = 0;
      for (var j = 0; j < boxes.length; j++) {
        var o = boxes[j];
        if (!(left + pw <= o[0] - 4 || left >= o[2] + 4 || tp + ph <= o[1] - 4 || tp >= o[3] + 4)) hits++;
      }
      if (hits < bestHit) { bestHit = hits; best = tp; }
      if (!hits && tp === tops[t2]) break;
    }
    p.style.left = s(left) + 'px';
    p.style.top = s(best) + 'px';
    p.classList.toggle('up', best + ph <= cy);
    var caret = p.querySelector('.axp-c');
    caret.style.left = s(Math.min(Math.max(12, cx - left), Math.max(12, pw - 12))) - 5 + 'px';
    caret.style.top = best + ph <= cy ? 'auto' : '-5px';
    caret.style.bottom = best + ph <= cy ? '-5px' : 'auto';
  }
  function s(v) { return Math.round(v); }

  function show(fig, i, el, pinned, ev) {
    var p = ensurePop(), t = p.querySelector('.axp-t');
    var full = el.getAttribute('data-axl') || '';
    clearTimeout(hideTimer);
    clearTimeout(closeTimer);
    if (openState && openState.fig === fig) clearTriggers(fig);
    t.textContent = full;
    p.hidden = false;
    p.classList.remove('on');
    openState = { fig: fig, i: i, pinned: !!pinned };
    Array.prototype.forEach.call(fig.querySelectorAll('[data-ax="' + i + '"]'), function (x) { x.setAttribute('aria-expanded', 'true'); });
    Array.prototype.forEach.call(fig.querySelectorAll('.axi'), function (g) { g.classList.toggle('on', +g.getAttribute('data-axi') === i); });
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.bottom - 10;
    if (ev && ev.clientY) cy = Math.min(Math.max(ev.clientY, r.top), r.bottom);   /* 손가락이 닿은 자리 위에 띄운다 */
    /* 이름표 줄(도표 아래 띠)을 누르면 말풍선이 옆 이름표를 덮지 않게 띠 위로 올려 잡는다 */
    var svg = el.ownerSVGElement, sr = svg && svg.getBoundingClientRect();
    if (sr && cy > sr.bottom - 52) cy = sr.bottom - 52;
    place(cx, Math.min(Math.max(cy, 0), window.innerHeight), fig, svg);
    requestAnimationFrame(function () { if (openState) p.classList.add('on'); });
  }
  function clearTriggers(fig) {
    Array.prototype.forEach.call(fig.querySelectorAll('[data-ax][aria-expanded="true"]'), function (x) { x.setAttribute('aria-expanded', 'false'); });
    Array.prototype.forEach.call(fig.querySelectorAll('.axi.on'), function (g) { g.classList.remove('on'); });
  }

  function close() {
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    if (!openState) return;
    var fig = openState.fig;
    openState = null;
    if (fig) clearTriggers(fig);
    if (pop) {
      pop.classList.remove('on');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (!openState && pop) pop.hidden = true; }, 170);
    }
  }

  function trg(el) { return el && el.closest ? el.closest('[data-ax]') : null; }

  function bind(fig) {
    if (!fig || fig._axlBound) return;
    fig._axlBound = 1;
    var click = function (e) {
      var a = trg(e.target);
      if (!a) return;
      var i = +a.getAttribute('data-ax');
      if (openState && openState.fig === fig && openState.i === i) { close(); return; }
      show(fig, i, a, true, e);
    };
    fig.addEventListener('click', click);
    fig.addEventListener('keydown', function (e) {
      var a = trg(e.target);
      if (!a) return;
      var i = +a.getAttribute('data-ax');
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (openState && openState.fig === fig && openState.i === i) close(); else show(fig, i, a, true, e);
      } else if (e.key === 'Escape') { close(); }
    });
    if (!(window.matchMedia && window.matchMedia('(hover:hover)').matches)) return;
    fig.addEventListener('mouseover', function (e) {
      var a = trg(e.target);
      if (!a) return;
      clearTimeout(closeTimer);
      var i = +a.getAttribute('data-ax');
      if (openState && openState.fig === fig && openState.i === i) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { show(fig, i, a, false, e); }, 130);
    });
    fig.addEventListener('mouseout', function (e) {
      var a = trg(e.target);
      if (!a) return;
      clearTimeout(hoverTimer);
      if (!openState || openState.pinned) return;
      closeTimer = setTimeout(close, 170);
    });
  }

  /* 바깥을 누르거나 스크롤하면 닫는다 */
  document.addEventListener('click', function (e) {
    if (!openState) return;
    var t = e.target;
    if (t && t.closest && (t.closest('.axp') || t.closest('[data-ax]'))) return;
    close();
  }, true);
  document.addEventListener('scroll', function () { if (openState) close(); }, { passive: true, capture: true });
  window.addEventListener('resize', function () { if (openState) close(); });

  window.JC_AXL = { font: font, measure: measure, fit: fit, unwrap: unwrap, plan: plan, icon: icon, bind: bind, close: close,
    num: num, numW: numW, hitSeg: hitSeg, hitDot: hitDot, hitBox: hitBox,
    open: function () { return !!openState; } };
})();
