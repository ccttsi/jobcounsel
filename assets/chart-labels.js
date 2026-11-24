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
  function measure(text, px, weight) {
    var t = String(text == null ? '' : text);
    var key = px + '/' + (weight || 600) + '/' + t;
    var v = mcache[key];
    if (v != null) return v;
    if (cvs === null) {
      try { cvs = document.createElement('canvas').getContext('2d'); } catch (e) { cvs = false; }
    }
    if (cvs) { cvs.font = (weight || 600) + ' ' + px + 'px ' + FONT; v = cvs.measureText(t).width; }
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

  /* 말풍선 자리: 누른 지점 바로 위(자리가 없으면 바로 아래), 좌우는 화면 안으로 당긴다. */
  function place(cx, cy) {
    var p = ensurePop();
    var vw = window.innerWidth, vh = window.innerHeight;
    var pw = p.offsetWidth, ph = p.offsetHeight;
    var above = cy - ph - 14 >= 6 || cy > vh - cy;
    var top = above ? cy - ph - 12 : cy + 12;
    var left = Math.min(Math.max(8, cx - pw / 2), Math.max(8, vw - pw - 8));
    top = Math.min(Math.max(6, top), Math.max(6, vh - ph - 6));
    p.style.left = s(left) + 'px';
    p.style.top = s(top) + 'px';
    p.classList.toggle('up', above);
    var caret = p.querySelector('.axp-c');
    caret.style.left = s(Math.min(Math.max(12, cx - left), Math.max(12, pw - 12))) - 5 + 'px';
    caret.style.top = above ? 'auto' : '-5px';
    caret.style.bottom = above ? '-5px' : 'auto';
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
    place(cx, Math.min(Math.max(cy, 0), window.innerHeight));
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
    open: function () { return !!openState; } };
})();
