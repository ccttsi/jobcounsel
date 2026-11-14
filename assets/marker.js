/* 직업상담 통합 자료실 · 형광펜과 포스트잇 도구함
   - 모든 페이지가 <script src="…/assets/marker.js" defer></script> 한 줄로 불러 쓴다.
   - 기록은 이 기기의 localStorage에 페이지별로 저장된다(서버로 보내지 않는다).
   - 형광펜은 문서 구조를 건드리지 않도록 CSS Custom Highlight API로 칠한다. 지원하지 않는 브라우저는 <mark>로 감싼다.
   - 칠한 곳과 메모 위치는 "글자 자체"(앞뒤 문맥 포함)로 기억하므로 화면이 다시 그려져도 같은 글을 찾아 다시 칠한다. */
(function () {
  'use strict';
  if (window.__jcMarker) return;
  window.__jcMarker = true;
  var ME = (document.currentScript && document.currentScript.src) || '';
  // 기기 간 연동(로그인) 모듈을 함께 불러온다
  (function () {
    if (!ME || window.JCSync) return;
    var s = document.createElement('script'); s.src = ME.replace(/marker\.js(\?.*)?$/, 'sync.js'); s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  })();

  /* ---------------- 설정 ---------------- */
  var PENS = [
    { c: '#ffe14d', n: '노랑' }, { c: '#b8f25e', n: '연두' }, { c: '#7fd6ff', n: '하늘' },
    { c: '#ff9fd2', n: '분홍' }, { c: '#ffb35c', n: '주황' }
  ];
  var PAPERS = [
    { c: '#fff2a1', n: '레몬' }, { c: '#ffd7c4', n: '복숭아' }, { c: '#c8f0da', n: '민트' },
    { c: '#d2e6ff', n: '하늘' }, { c: '#e4d8ff', n: '라벤더' }
  ];
  var CTX = 32;            // 앞뒤 문맥 글자 수
  var MAX_QUOTE = 3000;    // 한 번에 칠할 수 있는 최대 글자 수
  var path = location.pathname.replace(/index\.html?$/, '') || '/';
  var KEY = 'jc-marks:' + path;
  var PKEY = 'jc-marker-prefs';
  var d = document, root = d.documentElement;
  var HAS_HL = !!(window.CSS && CSS.highlights && window.Highlight);

  /* ---------------- 저장 ---------------- */
  var mem = {};
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return mem[k] || def; } }
  function save(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var data = load(KEY, { v: 1, items: [] }); if (!data || !Array.isArray(data.items)) data = { v: 1, items: [] };
  var prefs = load(PKEY, {}) || {};
  prefs.pen = prefs.pen || PENS[0].c; prefs.paper = prefs.paper || PAPERS[0].c;
  prefs.penCustom = prefs.penCustom || '#c4a1ff'; prefs.paperCustom = prefs.paperCustom || '#f6e0b5';
  prefs.hidden = !!prefs.hidden;
  function commit() { save(KEY, data); }
  var commitT = null; function commitSoon() { clearTimeout(commitT); commitT = setTimeout(function () { commitT = null; commit(); }, 600); }
  function flush() { if (commitT) { clearTimeout(commitT); commitT = null; commit(); } }
  function commitPrefs() { save(PKEY, prefs); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- 색 계산 ---------------- */
  function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(h); }
  function rgb(h) { h = hexOk(h) ? h : '#ffe14d'; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(h, k) { var c = rgb(h).map(function (x) { return Math.max(0, Math.min(255, Math.round(x * k))); }); return 'rgb(' + c.join(',') + ')'; }
  function isDark() { return root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }

  /* ---------------- 본문 글자 색인 ---------------- */
  var uiHost, layerHost;   // 우리 UI는 색인에서 뺀다
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, TEMPLATE: 1, svg: 1, SVG: 1, IFRAME: 1, CANVAS: 1 };
  var idx = null;
  function buildIndex() {
    var nodes = [], starts = [], parts = [], pos = 0;
    var w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        for (var p = n.parentNode; p && p !== d.body; p = p.parentNode) {
          if (SKIP[p.nodeName] || p === uiHost || p === layerHost || (p.isContentEditable && p.contentEditable === 'true')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) { nodes.push(n); starts.push(pos); parts.push(n.nodeValue); pos += n.nodeValue.length; }
    idx = { nodes: nodes, starts: starts, text: parts.join(''), map: new Map(nodes.map(function (x, i) { return [x, i]; })) };
    return idx;
  }
  function locate(off, preferEnd) {
    var s = idx.starts, lo = 0, hi = s.length - 1;
    if (hi < 0) return null;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (s[mid] <= off) lo = mid; else hi = mid - 1; }
    var i = lo;
    if (preferEnd && off === s[i] && i > 0) i--;   // 끝점은 앞 노드의 끝에 둔다
    return { node: idx.nodes[i], offset: Math.min(off - s[i], idx.nodes[i].nodeValue.length) };
  }
  function pointToOffset(c, o) {
    if (c.nodeType === 3 && idx.map.has(c)) return idx.starts[idx.map.get(c)] + o;
    var r = d.createRange();
    try { r.setStart(c, o); } catch (e) { return -1; }
    var nodes = idx.nodes, lo = 0, hi = nodes.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (r.comparePoint(nodes[mid], 0) > 0) hi = mid; else lo = mid + 1; }
    return lo < nodes.length ? idx.starts[lo] : idx.text.length;
  }
  function rangeFromOffsets(a, b) {
    var s = locate(a, false), e = locate(b, true); if (!s || !e) return null;
    var r = d.createRange();
    try { r.setStart(s.node, s.offset); r.setEnd(e.node, e.offset); } catch (x) { return null; }
    return r;
  }
  function commonTail(a, b) { var n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; }
  function commonHead(a, b) { var n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }
  function findItem(it) {
    var t = idx.text, q = it.quote; if (!q) return -1;
    var best = -1, bestScore = -1, from = 0, guard = 0;
    while (guard++ < 400) {
      var at = t.indexOf(q, from); if (at < 0) break;
      var sc = commonTail(t.slice(Math.max(0, at - CTX), at), it.prefix || '') + commonHead(t.slice(at + q.length, at + q.length + CTX), it.suffix || '');
      if (sc > bestScore) { bestScore = sc; best = at; }
      if (sc >= (it.prefix || '').length + (it.suffix || '').length) break;
      from = at + 1;
    }
    return best;
  }
  function anchorOf(a, b) {
    var t = idx.text;
    return { quote: t.slice(a, b), prefix: t.slice(Math.max(0, a - CTX), a), suffix: t.slice(b, b + CTX) };
  }

  /* ---------------- 형광펜 칠하기 ---------------- */
  var styleEl = d.createElement('style'); styleEl.id = 'jc-marker-style';
  (d.head || root).appendChild(styleEl);
  var liveRanges = {};   // id -> Range (지금 화면에서 찾은 위치)
  function hlName(c) { return 'jc-hl-' + c.replace('#', '').toLowerCase(); }
  function paintStyles(colors) {
    var dark = isDark(), css = '';
    colors.forEach(function (c) {
      var bg = rgba(c, dark ? 0.42 : 0.62);
      if (HAS_HL) css += '::highlight(' + hlName(c) + '){background-color:' + bg + ';color:inherit}';
      css += 'mark.jc-mk[data-c="' + c + '"]{background:' + bg + '}';
    });
    css += 'mark.jc-mk{color:inherit;padding:0;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}';
    css += 'body.jc-mk-pen,body.jc-mk-pen *{cursor:text}body.jc-mk-note,body.jc-mk-note *{cursor:copy!important}@media (pointer:coarse){body.jc-mk-note,body.jc-mk-note *{cursor:pointer!important}}';
    styleEl.textContent = css;
  }
  var painting = false;
  function unwrapMarks() {
    var ms = d.querySelectorAll('mark.jc-mk');
    for (var i = 0; i < ms.length; i++) { var m = ms[i], p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize && p.normalize(); }
  }
  function wrapRange(r, c, id) {
    // 텍스트 노드 단위로 잘라 <mark>로 감싼다 (구형 브라우저용)
    var texts = [], w = d.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (r.intersectsNode(n)) texts.push(n);
    texts.forEach(function (tn) {
      var s = tn === r.startContainer ? r.startOffset : 0, e = tn === r.endContainer ? r.endOffset : tn.nodeValue.length;
      if (e <= s) return;
      var mid = tn; if (s > 0) mid = tn.splitText(s); if (e - s < mid.nodeValue.length) mid.splitText(e - s);
      var m = d.createElement('mark'); m.className = 'jc-mk'; m.setAttribute('data-c', c); m.setAttribute('data-id', id);
      mid.parentNode.insertBefore(m, mid); m.appendChild(mid);
    });
  }
  function repaint() {
    painting = true;
    try {
      if (!HAS_HL) unwrapMarks();
      buildIndex();
      liveRanges = {};
      var byColor = {};
      data.items.forEach(function (it) {
        var at = findItem(it); it._found = at >= 0;
        if (at < 0) return;
        var r = rangeFromOffsets(at, at + it.quote.length); if (!r) { it._found = false; return; }
        liveRanges[it.id] = r;
        if (it.type === 'hl' && !prefs.hidden && !it.off) (byColor[it.color] = byColor[it.color] || []).push({ r: r, id: it.id });
      });
      var colors = Object.keys(byColor);
      var all = {}; PENS.forEach(function (p) { all[p.c] = 1; }); all[prefs.penCustom] = 1; colors.forEach(function (c) { all[c] = 1; });
      paintStyles(Object.keys(all));
      if (HAS_HL) {
        var keep = {};
        colors.forEach(function (c) { keep[hlName(c)] = 1; var hl = new Highlight(); byColor[c].forEach(function (x) { hl.add(x.r); }); CSS.highlights.set(hlName(c), hl); });
        CSS.highlights.forEach(function (v, k) { if (k.indexOf('jc-hl-') === 0 && !keep[k]) CSS.highlights.delete(k); });
      } else {
        // 뒤쪽부터 감싸야 앞쪽 범위가 흔들리지 않는다
        var flat = []; colors.forEach(function (c) { byColor[c].forEach(function (x) { flat.push({ r: x.r, c: c, id: x.id }); }); });
        flat.sort(function (a, b) { return b.r.compareBoundaryPoints(Range.START_TO_START, a.r); });
        flat.forEach(function (x) { wrapRange(x.r, x.c, x.id); });
        if (flat.length) { buildIndex(); data.items.forEach(function (it) { if (it.type !== 'note') return; var at = findItem(it); if (at >= 0) liveRanges[it.id] = rangeFromOffsets(at, at + it.quote.length); }); }
      }
    } finally { setTimeout(function () { painting = false; }, 0); }
    placeNotes();
    renderList();
    paintFab();
  }
  var repaintT;
  function scheduleRepaint(ms) { clearTimeout(repaintT); repaintT = setTimeout(repaint, ms == null ? 350 : ms); }

  /* ---------------- 선택 영역 → 형광펜 ---------------- */
  function selectionRange() {
    var s = window.getSelection && getSelection(); if (!s || s.rangeCount === 0 || s.isCollapsed) return null;
    var r = s.getRangeAt(0);
    var host = r.commonAncestorContainer; host = host.nodeType === 3 ? host.parentNode : host;
    if (!host || !d.body.contains(host)) return null;
    for (var p = host; p && p !== d.body; p = p.parentNode) if (SKIP[p.nodeName] || p === uiHost || p === layerHost) return null;
    return r;
  }
  /* 아이폰 사파리는 '칠하기'를 누르는 순간 선택이 풀린다. 마지막으로 고른 범위를 기억해 두고 쓴다. */
  var pendSel = null;
  function pendingRange() { var r = selectionRange(); if (r) return r; if (pendSel && !pendSel.collapsed && d.body.contains(pendSel.commonAncestorContainer)) return pendSel; return null; }
  function applyHighlight() {
    var r = pendingRange(); pendSel = null; if (!r) return false;
    buildIndex();
    var a = pointToOffset(r.startContainer, r.startOffset), b = pointToOffset(r.endContainer, r.endOffset);
    if (a < 0 || b < 0) return false;
    var raw = idx.text.slice(a, b);
    // 앞뒤 공백은 칠하지 않는다
    var lead = raw.length - raw.replace(/^\s+/, '').length, trail = raw.length - raw.replace(/\s+$/, '').length;
    a += lead; b -= trail;
    if (b - a < 1) return false;
    if (b - a > MAX_QUOTE) { toast('한 번에 ' + MAX_QUOTE.toLocaleString() + '자까지 칠할 수 있어요.'); return false; }
    var it = anchorOf(a, b); it.id = uid(); it.type = 'hl'; it.color = prefs.pen; it.t = Date.now();
    data.items.push(it); commit();
    try { getSelection().removeAllRanges(); } catch (e) {}
    if (prefs.hidden) { prefs.hidden = false; commitPrefs(); }
    repaint();
    return true;
  }

  /* ---------------- 포스트잇 ---------------- */
  var notesEl;   // 레이어 안의 메모 묶음
  var openNote = null;
  function caretAt(x, y) {
    if (d.caretPositionFromPoint) { var p = d.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
    if (d.caretRangeFromPoint) { var r = d.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
    return null;
  }
  function addNoteAt(x, y) {
    buildIndex();
    var c = caretAt(x, y), off = -1;
    if (c && c.node && c.node.nodeType === 3 && idx.map.has(c.node)) off = pointToOffset(c.node, c.offset);
    if (off < 0) {
      // 글자가 없는 곳을 눌렀으면 가장 가까운 글자로 붙인다
      var el = d.elementFromPoint(x, y);
      if (el) { var tw = d.createTreeWalker(el, NodeFilter.SHOW_TEXT), n; while ((n = tw.nextNode())) { if (idx.map.has(n) && n.nodeValue.trim()) { off = idx.starts[idx.map.get(n)]; break; } } }
    }
    if (off < 0) { toast('글이 있는 곳을 눌러 붙여 주세요.'); return; }
    var t = idx.text, a = off, b = off;
    // 누른 곳의 낱말을 기준점으로 삼는다
    while (a > 0 && off - a < 12 && !/\s/.test(t[a - 1])) a--;
    while (b < t.length && b - off < 12 && !/\s/.test(t[b])) b++;
    if (b - a < 2) { b = Math.min(t.length, a + 6); }
    var it = anchorOf(a, b); it.id = uid(); it.type = 'note'; it.color = prefs.paper; it.text = ''; it.t = Date.now();
    data.items.push(it); commit();
    if (prefs.hidden) { prefs.hidden = false; commitPrefs(); }
    openNote = it.id;
    repaint();
    setTimeout(function () { var ta = notesEl && notesEl.querySelector('[data-id="' + it.id + '"] textarea'); if (ta) ta.focus(); }, 30);
  }
  function noteHTML(it) {
    var open = openNote === it.id, first = (it.text || '').split('\n')[0];
    var bg = it.color, edge = shade(it.color, 0.86), ink = '#3b3226';
    var s = '<div class="pn' + (open ? ' open' : '') + '" data-id="' + it.id + '" style="--paper:' + bg + ';--edge:' + edge + ';--ink:' + ink + '">';
    s += '<button class="pn-tab" data-act="toggle" aria-expanded="' + open + '" aria-label="포스트잇 메모' + (first ? ': ' + esc(first) : '') + '">' +
      '<span class="pn-tape" aria-hidden="true"></span><span class="pn-peek">' + (first ? esc(first) : '메모') + '</span></button>';
    if (open) {
      s += '<div class="pn-card"><span class="pn-tape" aria-hidden="true"></span>' +
        '<textarea rows="4" maxlength="2000" placeholder="여기에 메모를 적어 두세요" aria-label="메모 내용">' + esc(it.text || '') + '</textarea>' +
        '<div class="pn-bar"><span class="pn-sw">' + PAPERS.map(function (p) { return '<button class="dot" data-act="ncolor" data-c="' + p.c + '" style="--c:' + p.c + '" aria-label="' + p.n + '"' + (p.c === it.color ? ' aria-pressed="true"' : '') + '></button>'; }).join('') +
        '</span><button class="pn-x" data-act="ndel">떼기</button><button class="pn-x" data-act="toggle">접기</button></div></div>';
    }
    return s + '</div>';
  }
  function placeNotes() {
    if (!notesEl) return;
    var notes = data.items.filter(function (it) { return it.type === 'note' && !it.off; });
    var html = prefs.hidden ? '' : notes.map(noteHTML).join('');
    if (notesEl._html !== html) {
      var focusId = null, caret = null, ae = layerHost && layerHost.shadowRoot && layerHost.shadowRoot.activeElement;
      if (ae && ae.tagName === 'TEXTAREA') { focusId = ae.closest('.pn').getAttribute('data-id'); caret = [ae.selectionStart, ae.selectionEnd]; }
      notesEl.innerHTML = html; notesEl._html = html;
      if (focusId) { var ta = notesEl.querySelector('[data-id="' + focusId + '"] textarea'); if (ta) { ta.focus(); try { ta.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
    }
    position();
  }
  var posQueued = false;
  function position() {
    if (posQueued) return; posQueued = true;
    requestAnimationFrame(function () {
      posQueued = false;
      if (!notesEl || !layerHost) return;
      var base = layerHost.getBoundingClientRect(), vw = root.clientWidth;
      var els = notesEl.querySelectorAll('.pn');
      for (var i = 0; i < els.length; i++) {
        var el = els[i], id = el.getAttribute('data-id'), r = liveRanges[id], show = false;
        if (r) {
          var rects = r.getClientRects(), rc = rects.length ? rects[0] : r.getBoundingClientRect();
          if (rc && (rc.width || rc.height)) {
            show = true;
            // 다른 창(모달·서랍)에 가려진 글이면 메모도 숨긴다
            var cx = Math.min(Math.max(rc.left + 2, 1), vw - 1), cy = rc.top + rc.height / 2;
            if (cy > 0 && cy < innerHeight) {
              var top = d.elementFromPoint(cx, cy), anc = r.startContainer.parentNode;
              if (top && top !== layerHost && top !== uiHost && top !== anc && !anc.contains(top) && !top.contains(anc)) show = false;
            }
            var w = el.offsetWidth || 120, x = rc.left - base.left, y = rc.top - base.top - 30;
            x = Math.min(Math.max(x, 6 - base.left), vw - w - 6 - base.left);
            el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
          }
        }
        el.style.display = show ? '' : 'none';
      }
    });
  }

  /* ---------------- UI ---------------- */
  var ui = {}, mode = 'off';  // off | pen | note
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICON_PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 3.6 20.4 8.8 11 18.2l-5.2-5.2z" fill="var(--pen)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.8 13 4 20l7-1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.3 5.5l5.2 5.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  var ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v11l-5 5H4z" fill="var(--paper)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  var CSS_UI = [
    ':host{all:initial;--ink:#2a2521;--muted:#6b6158;--panel:#fffdf8;--line:#e6dccb;--soft:#f5efe4;--acc:#0f766e;--shadow:0 18px 50px -18px rgba(60,40,20,.45),0 2px 6px rgba(60,40,20,.08);font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:var(--ink);-webkit-text-size-adjust:100%}',
    ':host([data-dark]){--ink:#e6e9ef;--muted:#9aa2b4;--panel:#111621;--line:#2a3243;--soft:#182030;--acc:#2dd4bf;--shadow:0 18px 50px -14px rgba(0,0,0,.7)}',
    '*{box-sizing:border-box;font:inherit;color:inherit;margin:0}',
    'button{cursor:pointer;background:none;border:0;padding:0;-webkit-tap-highlight-color:transparent}',
    'button:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:10px}',
    '.fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(var(--lift,0px) + max(16px,env(safe-area-inset-bottom)));z-index:2;width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow);transition:transform .2s cubic-bezier(.2,1.4,.4,1),bottom .25s}',
    '.fab:active{transform:scale(.94)}',
    '.fab svg{width:26px;height:26px;transform:rotate(-8deg)}',
    '.fab .cnt{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:var(--acc);color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center}',
    ':host([data-dark]) .fab .cnt{color:#08221f}',
    '.fab[data-mode="pen"],.fab[data-mode="note"]{box-shadow:0 0 0 3px var(--panel),0 0 0 5px var(--acc),var(--shadow)}',
    '.panel{position:fixed;z-index:3;right:max(12px,env(safe-area-inset-right));bottom:calc(var(--lift,0px) + max(16px,env(safe-area-inset-bottom)) + 64px);width:min(320px,calc(100vw - 24px));max-height:calc(100vh - var(--lift,0px) - 110px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px 16px 14px;transform-origin:100% 100%;animation:pop .18s cubic-bezier(.2,1.2,.4,1)}',
    '@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}',
    '.tape{position:absolute;top:-11px;left:50%;width:92px;height:22px;transform:translateX(-50%) rotate(-3deg);background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 6px,transparent 6px 12px),rgba(244,201,150,.75);border-left:2px dotted rgba(255,255,255,.5);border-right:2px dotted rgba(255,255,255,.5);box-shadow:0 1px 2px rgba(0,0,0,.08)}',
    ':host([data-dark]) .tape{background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 6px,transparent 6px 12px),rgba(45,212,191,.35)}',
    '.hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}',
    '.hd b{font-size:16px;font-weight:750;letter-spacing:-.02em}.hd span{font-size:12px;color:var(--muted)}',
    '.tool{border:1px solid var(--line);border-radius:14px;padding:10px;background:var(--soft)}',
    '.tool+.tool{margin-top:10px}',
    '.big{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 10px;border-radius:10px;font-size:15px;font-weight:650;text-align:left}',
    '.big svg{width:26px;height:26px;flex:none}',
    '.big small{margin-left:auto;font-size:12px;font-weight:600;color:var(--muted)}',
    '.big[aria-pressed="true"]{background:var(--panel);box-shadow:0 1px 3px rgba(0,0,0,.12),inset 0 0 0 1.5px var(--acc)}',
    '.big[aria-pressed="true"] small{color:var(--acc)}',
    '.sw{display:flex;flex-wrap:wrap;gap:8px;padding:8px 2px 2px 4px}',
    '.dot{position:relative;width:30px;height:30px;border-radius:50%;background:var(--c);border:2px solid var(--panel);box-shadow:0 0 0 1px var(--line);flex:none}',
    '.dot::after{content:"";position:absolute;inset:-7px}',
    '.dot[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}',
    '.dot.custom{background:conic-gradient(from 90deg,#ff9fd2,#ffe14d,#b8f25e,#7fd6ff,#c4a1ff,#ff9fd2);overflow:hidden}',
    '.dot.custom i{position:absolute;inset:6px;border-radius:50%;background:var(--c);border:2px solid var(--panel)}',
    '.dot input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}',
    '.foot{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}',
    '.chip{min-height:40px;padding:0 12px;border-radius:99px;border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--muted);position:relative}',
    '.chip::after{content:"";position:absolute;inset:-3px 0}',
    '.chip:hover{color:var(--ink);border-color:var(--acc)}',
    '.chip.warn:hover{border-color:#c2410c;color:#c2410c}',
    '.note-hint{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.55}',
    '.acct{display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;padding:10px;border-radius:14px;border:1px dashed var(--line);text-align:left}',
    '.acct:hover{border-color:var(--acc);border-style:solid}',
    '.acct .av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--soft);color:var(--acc);font-weight:800;flex:none}',
    '.acct b{display:block;font-size:13.5px;font-weight:700}.acct small{display:block;font-size:12px;color:var(--muted)}',
    '.list{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px;display:grid;gap:6px}',
    '.list:empty{display:none}',
    '.row{display:flex;align-items:center;gap:2px}',
    '.row .li{flex:1;min-width:0}',
    '.row.off .li{opacity:.45}',
    '.tg{flex:none;width:44px;height:44px;display:grid;place-items:center}',
    '.tg b{position:relative;width:32px;height:19px;border-radius:99px;background:var(--line);transition:background .2s}',
    '.tg b::after{content:"";position:absolute;left:2px;top:2px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}',
    '.tg[aria-checked="true"] b{background:var(--acc)}',
    '.tg[aria-checked="true"] b::after{transform:translateX(13px)}',
    '.lx{flex:none;width:40px;height:44px;display:grid;place-items:center;color:var(--muted);border-radius:10px}',
    '.lx svg{width:16px;height:16px}',
    '.lx:hover{color:#c2410c;background:var(--soft)}',
    '.li{display:flex;align-items:flex-start;gap:8px;width:100%;padding:8px;border-radius:10px;text-align:left;font-size:13px;line-height:1.5}',
    '.li:hover{background:var(--soft)}',
    '.li i{flex:none;width:12px;height:12px;margin-top:4px;border-radius:3px;background:var(--c)}',
    '.li.note i{border-radius:2px;transform:rotate(-6deg)}',
    '.li span{flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.li em{flex:none;font-style:normal;font-size:11px;color:var(--muted);margin-top:2px}',
    '.pill{position:fixed;left:50%;bottom:calc(var(--lift,0px) + max(16px,env(safe-area-inset-bottom)) + 4px);transform:translateX(-50%);z-index:1;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 96px);padding:6px 6px 6px 14px;border-radius:99px;background:var(--ink);color:var(--panel);font-size:13px;font-weight:600;box-shadow:var(--shadow);animation:pop .18s}',
    '.pill>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pill button{min-height:36px;padding:0 12px;border-radius:99px;background:rgba(255,255,255,.14);color:inherit;font-size:13px;font-weight:700;white-space:nowrap}',
    ':host([data-dark]) .pill button{background:rgba(0,0,0,.12)}',
    '.pill .go{background:var(--pen);color:#2a2521}',
    '.pill i{width:10px;height:10px;border-radius:50%;background:var(--pen);flex:none}',
    '.pop{position:fixed;z-index:4;display:flex;align-items:center;gap:6px;padding:6px;border-radius:14px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow);animation:pop .14s}',
    '.pop .dot{width:26px;height:26px}',
    '.pop .rm{min-height:32px;padding:0 10px;border-radius:9px;font-size:13px;font-weight:700;color:#c2410c}',
    '.toast{position:fixed;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);z-index:5;max-width:calc(100vw - 28px);padding:10px 14px;border-radius:12px;background:var(--ink);color:var(--panel);font-size:13.5px;font-weight:600;box-shadow:var(--shadow);animation:pop .16s}',
    '[hidden]{display:none!important}',
    '@media (max-width:520px){.panel{left:12px;right:12px;width:auto;border-radius:20px 20px 16px 16px}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
    '@media print{:host{display:none!important}}'
  ].join('\n');

  var CSS_NOTES = [
    ':host{all:initial;font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}',
    '*{box-sizing:border-box;font:inherit;margin:0}',
    'button{cursor:pointer;background:none;border:0;padding:0;color:inherit}',
    '.pn{position:absolute;left:0;top:0;will-change:transform}',
    '.pn-tab{position:relative;display:flex;align-items:center;max-width:132px;min-height:28px;padding:4px 10px 4px 9px;background:var(--paper);color:var(--ink);font-size:12.5px;font-weight:600;line-height:1.3;border-radius:2px 2px 10px 2px;transform:rotate(-2.5deg);box-shadow:0 1px 1px rgba(0,0,0,.08),0 6px 14px -6px rgba(60,40,20,.45);background-image:linear-gradient(225deg,var(--edge) 0 7px,transparent 7px)}',
    '.pn-tab::after{content:"";position:absolute;inset:-8px -4px}',
    '.pn-peek{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.pn-tape{position:absolute;top:-7px;left:50%;width:30px;height:12px;transform:translateX(-50%) rotate(4deg);background:rgba(255,255,255,.55);box-shadow:0 0 0 1px rgba(0,0,0,.04)}',
    ':host([data-dark]) .pn-tab,:host([data-dark]) .pn-card{filter:brightness(.92) saturate(.9)}',
    '.pn.open .pn-tab{display:none}',
    '.pn-card{position:relative;width:min(240px,calc(100vw - 24px));padding:16px 12px 10px;background:var(--paper);color:var(--ink);border-radius:3px 3px 16px 3px;transform:rotate(-1deg);box-shadow:0 2px 2px rgba(0,0,0,.06),0 18px 34px -14px rgba(60,40,20,.55);background-image:linear-gradient(225deg,var(--edge) 0 12px,transparent 12px)}',
    '.pn-card .pn-tape{width:56px;height:16px;top:-9px}',
    'textarea{display:block;width:100%;min-height:84px;resize:vertical;border:0;outline:0;background:repeating-linear-gradient(transparent 0 23px,rgba(0,0,0,.08) 23px 24px);color:var(--ink);font-size:15px;line-height:24px;padding:0}',
    'textarea::placeholder{color:rgba(59,50,38,.5)}',
    '.pn-bar{display:flex;align-items:center;gap:4px;margin-top:8px}',
    '.pn-sw{display:flex;gap:5px;margin-right:auto}',
    '.dot{width:22px;height:22px;border-radius:50%;background:var(--c);border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 1px rgba(0,0,0,.12);position:relative}',
    '.dot::after{content:"";position:absolute;inset:-6px -2px}',
    '.dot[aria-pressed="true"]{box-shadow:0 0 0 2px #3b3226}',
    '.pn-x{min-height:32px;padding:0 8px;border-radius:8px;font-size:12.5px;font-weight:700;color:rgba(59,50,38,.75)}',
    '.pn-x:hover{background:rgba(0,0,0,.06)}',
    'button:focus-visible,textarea:focus-visible{outline:2px solid #0f766e;outline-offset:2px}',
    '@media print{:host{display:none!important}}'
  ].join('\n');

  function build() {
    uiHost = d.createElement('div'); uiHost.id = 'jc-marker-ui';
    var s = uiHost.attachShadow({ mode: 'open' });
    s.innerHTML = '<style>' + CSS_UI + '</style>' +
      '<div class="pill" id="pill" hidden role="status"></div>' +
      '<div class="pop" id="pop" hidden></div>' +
      '<div class="toast" id="toast" hidden role="status"></div>' +
      '<section class="panel" id="panel" hidden role="dialog" aria-label="형광펜과 포스트잇 도구함"></section>' +
      '<button class="fab" id="fab" aria-haspopup="dialog" aria-expanded="false" aria-label="도구함 열기: 형광펜과 포스트잇"></button>';
    ['pill', 'pop', 'toast', 'panel', 'fab'].forEach(function (k) { ui[k] = s.getElementById(k); });

    layerHost = d.createElement('div'); layerHost.id = 'jc-marker-notes';
    layerHost.style.cssText = 'position:absolute!important;left:0!important;top:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147482000!important;pointer-events:none';
    var ls = layerHost.attachShadow({ mode: 'open' });
    ls.innerHTML = '<style>' + CSS_NOTES + '.wrap>*{pointer-events:auto}</style><div class="wrap" id="notes"></div>';
    notesEl = ls.getElementById('notes');
    uiHost.style.cssText = 'position:fixed!important;z-index:2147483000!important;left:0;top:0;width:0;height:0;overflow:visible';
    d.body.appendChild(layerHost); d.body.appendChild(uiHost);
    syncTheme();
    wire(s, ls);
    paintFab();
  }
  function syncTheme() {
    var dk = isDark();
    [uiHost, layerHost].forEach(function (h) { if (h) { if (dk) h.setAttribute('data-dark', ''); else h.removeAttribute('data-dark'); } });
    if (uiHost) { uiHost.style.setProperty('--pen', prefs.pen); uiHost.style.setProperty('--paper', prefs.paper); }
  }
  function counts() { var h = 0, n = 0; data.items.forEach(function (it) { if (it.type === 'hl') h++; else n++; }); return { h: h, n: n }; }
  function paintFab() {
    if (!ui.fab) return;
    var c = counts(), total = c.h + c.n;
    ui.fab.setAttribute('data-mode', mode);
    ui.fab.innerHTML = (mode === 'note' ? ICON_NOTE : ICON_PEN) + (total ? '<span class="cnt" aria-hidden="true">' + total + '</span>' : '');
    ui.fab.setAttribute('aria-label', '도구함 ' + (ui.panel.hidden ? '열기' : '닫기') + ': 형광펜과 포스트잇' + (total ? ', 이 페이지에 ' + total + '개' : ''));
  }
  function swatches(list, cur, kind, custom) {
    var inList = list.some(function (p) { return p.c === cur; });
    return '<div class="sw" role="group" aria-label="' + (kind === 'pen' ? '형광펜 색' : '포스트잇 색') + '">' +
      list.map(function (p) { return '<button class="dot" data-act="' + kind + 'c" data-c="' + p.c + '" style="--c:' + p.c + '" aria-label="' + p.n + '" aria-pressed="' + (p.c === cur) + '"></button>'; }).join('') +
      '<label class="dot custom" style="--c:' + custom + '" aria-pressed="' + (!inList) + '" title="직접 고르기"><i></i><input type="color" data-act="' + kind + 'x" value="' + custom + '" aria-label="' + (kind === 'pen' ? '형광펜' : '포스트잇') + ' 색 직접 고르기"></label></div>';
  }
  function renderPanel() {
    var c = counts();
    ui.panel.innerHTML = '<span class="tape" aria-hidden="true"></span>' +
      '<div class="hd"><b>내 도구함</b><span>' + (window.JCSync && window.JCSync.user() ? '계정에 연동 중' : '이 기기에 저장돼요') + '</span></div>' +
      '<div class="tool"><button class="big" data-act="pen" aria-pressed="' + (mode === 'pen') + '">' + ICON_PEN + '형광펜<small>' + (mode === 'pen' ? '켜짐' : '켜기') + '</small></button>' + swatches(PENS, prefs.pen, 'pen', prefs.penCustom) + '</div>' +
      '<div class="tool"><button class="big" data-act="note" aria-pressed="' + (mode === 'note') + '">' + ICON_NOTE + '포스트잇<small>' + (mode === 'note' ? '붙일 곳 누르기' : '붙이기') + '</small></button>' + swatches(PAPERS, prefs.paper, 'paper', prefs.paperCustom) + '</div>' +
      '<div class="foot">' +
      (c.h + c.n ? '<button class="chip" data-act="hide" aria-pressed="' + prefs.hidden + '">' + (prefs.hidden ? '다시 보이기' : '잠시 숨기기') + '</button><button class="chip warn" data-act="clear">이 페이지 모두 지우기</button>' : '') +
      '</div>' +
      (c.h + c.n ? '' : '<p class="note-hint">형광펜을 켜고 글자를 드래그하면 칠해져요. 포스트잇은 붙이기를 누른 뒤 원하는 글 위를 누르세요.</p>') +
      '<div class="list" id="list" aria-label="이 페이지의 표시와 메모"></div>' + accountRow();
    renderList();
  }
  function accountRow() {
    var S = window.JCSync; if (!S || !S.configured) return '<p class="note-hint">기록은 이 기기에만 저장돼요.</p>';
    var u = S.user();
    return '<button class="acct" data-act="acct"><span class="av" aria-hidden="true">' + (u ? esc(u.charAt(0).toUpperCase()) : '☁') + '</span><span><b>' + (u ? esc(u) : '로그인하고 다른 기기와 이어 쓰기') + '</b><small>' + (u ? esc(S.label()) : '진도·형광펜·메모가 기기 사이에 연동돼요') + '</small></span></button>';
  }
  function renderList() {
    if (!ui.panel || ui.panel.hidden) return;
    var el = ui.panel.querySelector('#list'); if (!el) return;
    var items = data.items.slice().sort(function (a, b) { return a._found === b._found ? 0 : a._found ? -1 : 1; });
    el.innerHTML = items.map(function (it) {
      var txt = it.type === 'note' ? (it.text || '(빈 메모)') : it.quote;
      var kind = it.type === 'note' ? '메모' : '형광펜', on = !it.off, short = esc(txt.slice(0, 40));
      return '<div class="row' + (on ? '' : ' off') + '"><button class="li' + (it.type === 'note' ? ' note' : '') + '" data-act="jump" data-id="' + it.id + '" style="--c:' + it.color + '"><i aria-hidden="true"></i><span>' + esc(txt.slice(0, 160)) + '</span><em>' + (it._found ? kind : '다른 화면') + '</em></button>' +
        '<button class="tg" role="switch" aria-checked="' + on + '" data-act="onoff" data-id="' + it.id + '" aria-label="' + kind + ' ' + short + (on ? ' 숨기기' : ' 보이기') + '" title="' + (on ? '켜짐: 누르면 숨김' : '꺼짐: 누르면 보임') + '"><b aria-hidden="true"></b></button>' +
        '<button class="lx" data-act="lidel" data-id="' + it.id + '" aria-label="' + kind + ' ' + short + ' 지우기" title="지우기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>';
    }).join('');
  }
  var toastT;
  function toast(m) { if (!ui.toast) return; ui.toast.textContent = m; ui.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { ui.toast.hidden = true; }, 2600); }
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  function renderPill() {
    if (mode === 'off') { ui.pill.hidden = true; return; }
    if (mode === 'pen') {
      var sel = pendingRange();
      ui.pill.innerHTML = '<i aria-hidden="true"></i><span>' + (sel ? '선택한 글을 칠할까요?' : (coarse ? '글자를 길게 눌러 고르세요' : '칠할 글자를 드래그하세요')) + '</span>' +
        (sel ? '<button class="go" data-act="apply">칠하기</button>' : '') + '<button data-act="off">끄기</button>';
    } else {
      ui.pill.innerHTML = '<span>메모를 붙일 곳을 누르세요</span><button data-act="off">그만</button>';
    }
    ui.pill.hidden = false;
  }
  function setMode(m) {
    mode = m;
    d.body.classList.toggle('jc-mk-pen', m === 'pen'); d.body.classList.toggle('jc-mk-note', m === 'note');
    if (m !== 'off' && window.matchMedia && matchMedia('(max-width: 520px)').matches) closePanel();
    if (m === 'pen' && selectionRange() && !coarse) { applyHighlight(); }
    renderPill(); paintFab(); if (!ui.panel.hidden) renderPanel();
  }
  function openPanel() { ui.panel.hidden = false; renderPanel(); ui.fab.setAttribute('aria-expanded', 'true'); paintFab(); hidePop(); }
  function closePanel() { if (ui.panel.hidden) return; ui.panel.hidden = true; ui.fab.setAttribute('aria-expanded', 'false'); paintFab(); }

  /* 칠한 곳을 누르면 색 바꾸기·지우기 */
  var popId = null;
  function hitHighlight(x, y) {
    var c = caretAt(x, y); if (!c || !c.node) return null;
    var hit = null;
    data.items.forEach(function (it) {
      if (it.type !== 'hl' || hit || it.off) return; var r = liveRanges[it.id]; if (!r) return;
      try { if (r.isPointInRange(c.node, c.offset) && !(r.endContainer === c.node && r.endOffset === c.offset)) hit = it; } catch (e) {}
    });
    return hit;
  }
  function showPop(it, x, y) {
    popId = it.id;
    ui.pop.innerHTML = PENS.map(function (p) { return '<button class="dot" data-act="recolor" data-c="' + p.c + '" style="--c:' + p.c + '" aria-label="' + p.n + '으로 바꾸기" aria-pressed="' + (p.c === it.color) + '"></button>'; }).join('') +
      '<button class="rm" data-act="rmhl">지우기</button>';
    ui.pop.hidden = false;
    var w = ui.pop.offsetWidth, h = ui.pop.offsetHeight;
    ui.pop.style.left = Math.max(8, Math.min(x - w / 2, innerWidth - w - 8)) + 'px';
    ui.pop.style.top = (y - h - 14 < 8 ? y + 18 : y - h - 14) + 'px';
  }
  function hidePop() { if (ui.pop) { ui.pop.hidden = true; popId = null; } }
  function byId(id) { for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i]; return null; }
  function tomb(ids) { data.del = (data.del || []).concat(ids).slice(-500); }
  function remove(id) { data.items = data.items.filter(function (x) { return x.id !== id; }); tomb([id]); commit(); if (openNote === id) openNote = null; repaint(); if (!ui.panel.hidden) renderPanel(); }

  function wire(s, ls) {
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'pen') setMode(mode === 'pen' ? 'off' : 'pen');
      else if (a === 'note') setMode(mode === 'note' ? 'off' : 'note');
      else if (a === 'penc') { prefs.pen = b.getAttribute('data-c'); commitPrefs(); syncTheme(); renderPanel(); renderPill(); paintFab(); if (mode !== 'pen') setMode('pen'); }
      else if (a === 'paperc') { prefs.paper = b.getAttribute('data-c'); commitPrefs(); syncTheme(); renderPanel(); paintFab(); }
      else if (a === 'hide') { prefs.hidden = !prefs.hidden; commitPrefs(); repaint(); renderPanel(); }
      else if (a === 'clear') {
        if (window.confirm('이 페이지의 형광펜과 포스트잇을 모두 지울까요?')) { tomb(data.items.map(function (x) { return x.id; })); data.items = []; commit(); openNote = null; repaint(); renderPanel(); toast('모두 지웠어요.'); }
      }
      else if (a === 'jump') {
        var it = byId(b.getAttribute('data-id')), r = it && liveRanges[it.id];
        if (!r) { toast('이 표시는 지금 열려 있지 않은 화면에 있어요.'); return; }
        var el = r.startContainer.parentNode; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (it.type === 'note' && !it.off) { openNote = it.id; placeNotes(); }
        if (matchMedia('(max-width: 520px)').matches) closePanel();
      }
      else if (a === 'onoff') { var o2 = byId(b.getAttribute('data-id')); if (o2) { o2.off = !o2.off; o2.u = Date.now(); if (o2.off && openNote === o2.id) { flush(); openNote = null; } commit(); repaint(); var nb = ui.panel.querySelector('[data-act=onoff][data-id="' + o2.id + '"]'); if (nb) nb.focus(); } }
      else if (a === 'lidel') { var o3 = byId(b.getAttribute('data-id')); if (o3) { var nx = b.closest('.row'); nx = nx && (nx.nextElementSibling || nx.previousElementSibling); var nid = nx && nx.querySelector('.lx') && nx.querySelector('.lx').getAttribute('data-id'); remove(o3.id); toast(o3.type === 'note' ? '포스트잇을 뗐어요.' : '형광펜을 지웠어요.'); var f = nid && ui.panel.querySelector('.lx[data-id="' + nid + '"]'); if (f) f.focus(); } }
      else if (a === 'apply') { applyHighlight(); renderPill(); }
      else if (a === 'acct') { if (window.JCSync) window.JCSync.open(); }
      else if (a === 'off') setMode('off');
      else if (a === 'recolor') { var h = byId(popId); if (h) { h.color = b.getAttribute('data-c'); h.u = Date.now(); commit(); repaint(); } hidePop(); }
      else if (a === 'rmhl') { if (popId) remove(popId); hidePop(); toast('형광펜을 지웠어요.'); }
    });
    s.addEventListener('input', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-act');
      if (a === 'penx') { prefs.penCustom = prefs.pen = e.target.value; commitPrefs(); syncTheme(); paintStyles([prefs.pen]); e.target.parentNode.style.setProperty('--c', e.target.value); paintFab(); }
      if (a === 'paperx') { prefs.paperCustom = prefs.paper = e.target.value; commitPrefs(); syncTheme(); e.target.parentNode.style.setProperty('--c', e.target.value); paintFab(); }
    });
    s.addEventListener('change', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-act');
      if (a === 'penx' || a === 'paperx') { renderPanel(); repaint(); if (a === 'penx' && mode !== 'pen') setMode('pen'); }
    });
    ui.fab.addEventListener('click', function () { if (ui.panel.hidden) openPanel(); else closePanel(); });

    ls.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.closest('.pn').getAttribute('data-id'), a = b.getAttribute('data-act'), it = byId(id); if (!it) return;
      if (a === 'toggle') { flush(); openNote = openNote === id ? null : id; if (openNote === null && !(it.text || '').trim()) { remove(id); return; } placeNotes(); if (openNote) setTimeout(function () { var ta = notesEl.querySelector('[data-id="' + id + '"] textarea'); if (ta) ta.focus(); }, 20); }
      else if (a === 'ncolor') { it.color = b.getAttribute('data-c'); it.u = Date.now(); commit(); placeNotes(); renderList(); }
      else if (a === 'ndel') { remove(id); toast('포스트잇을 뗐어요.'); }
    });
    ls.addEventListener('input', function (e) {
      if (e.target.tagName !== 'TEXTAREA') return;
      var id = e.target.closest('.pn').getAttribute('data-id'), it = byId(id); if (!it) return;
      it.text = e.target.value; it.u = Date.now(); commitSoon(); renderList();
    });
    ls.addEventListener('focusout', flush);
    window.addEventListener('pagehide', flush);
    d.addEventListener('visibilitychange', function () { if (d.hidden) flush(); });
    ls.addEventListener('keydown', function (e) { if (e.key === 'Escape') { flush(); openNote = null; placeNotes(); } e.stopPropagation(); });
    ls.addEventListener('keyup', function (e) { e.stopPropagation(); });
    ls.addEventListener('keypress', function (e) { e.stopPropagation(); });

    // 문서 쪽 동작
    d.addEventListener('mouseup', function (e) {
      if (mode === 'pen' && e.button === 0 && !coarse && !isOurs(e)) setTimeout(function () { if (selectionRange()) applyHighlight(); }, 0);
    });
    d.addEventListener('selectionchange', function () { var r = selectionRange(); if (r) pendSel = r.cloneRange(); if (mode === 'pen') { clearTimeout(selT); selT = setTimeout(renderPill, 120); } });
    // 도구함이 열려 있을 때 바깥을 누르면 닫는다
    d.addEventListener('pointerdown', function (e) { if (!ui.panel.hidden && !isOurs(e) && mode !== 'note') closePanel(); }, true);
    // 칠하기 막대를 누를 때 선택이 풀리지 않게 한다(데스크톱)
    ui.pill.addEventListener('mousedown', function (e) { e.preventDefault(); });
    /* 아이폰 사파리는 링크가 아닌 글자를 눌러도 click을 보내지 않는 경우가 있다.
       손가락 탭은 pointerup으로 직접 처리하고, 뒤따르는 click은 한 번 무시한다. */
    var tap = null, tapDone = 0;
    d.addEventListener('pointerdown', function (e) { tap = (e.pointerType !== 'mouse' && !isOurs(e)) ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }, true);
    d.addEventListener('pointercancel', function () { tap = null; }, true);
    d.addEventListener('pointerup', function (e) {
      var t0 = tap; tap = null;
      if (!t0 || isOurs(e) || Math.abs(e.clientX - t0.x) > 10 || Math.abs(e.clientY - t0.y) > 10 || Date.now() - t0.t > 700) return;
      if (popId) hidePop();
      if (openNote && mode !== 'note') { flush(); var o = byId(openNote); openNote = null; if (o && !(o.text || '').trim()) remove(o.id); else placeNotes(); }
      if (mode === 'note') { tapDone = Date.now(); e.preventDefault(); addNoteAt(e.clientX, e.clientY); setMode('off'); return; }
      if (mode === 'off' && !(e.target.closest && e.target.closest('a,button,input,select,textarea,label,summary,[role=button],[role=slider],[onclick]'))) {
        var s3 = getSelection && getSelection(); if (s3 && !s3.isCollapsed) return;
        var hit = hitHighlight(e.clientX, e.clientY);
        if (hit) { tapDone = Date.now(); showPop(hit, e.clientX, e.clientY); }
      }
    }, true);
    d.addEventListener('click', function (e) {
      if (isOurs(e)) return;
      if (Date.now() - tapDone < 700) { e.preventDefault(); e.stopPropagation(); return; }
      if (mode !== 'pen') { var s0 = getSelection && getSelection(); if (!s0 || s0.isCollapsed) pendSel = null; }
      if (mode === 'note') { e.preventDefault(); e.stopPropagation(); addNoteAt(e.clientX, e.clientY); setMode('off'); return; }
      if (popId) { hidePop(); }
      if (openNote && !isOurs(e)) { flush(); var o = byId(openNote); openNote = null; if (o && !(o.text || '').trim()) remove(o.id); else placeNotes(); }
      if (mode === 'pen') { var s1 = getSelection && getSelection(); if (!s1 || s1.isCollapsed) { pendSel = null; clearTimeout(selT); selT = setTimeout(renderPill, 120); } return; }
      var s2 = getSelection && getSelection(); if (s2 && !s2.isCollapsed) return;
      var tgt = e.target.closest && e.target.closest('a,button,input,select,textarea,label,summary,[role=button],[onclick]');
      if (tgt && ui.panel.hidden) return;   // 링크·버튼은 원래 동작 그대로
      var hit = hitHighlight(e.clientX, e.clientY);
      if (hit) { if (tgt) { e.preventDefault(); e.stopPropagation(); } showPop(hit, e.clientX, e.clientY); }
    }, true);
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (!ui.pop.hidden) hidePop(); else if (mode !== 'off') setMode('off'); else if (!ui.panel.hidden) closePanel(); }
    });
    window.addEventListener('resize', function () { position(); lift(); hidePop(); });
    window.addEventListener('scroll', function () { position(); if (!ui.pop.hidden) hidePop(); }, { capture: true, passive: true });
  }
  var selT;
  function isOurs(e) { var p = e.composedPath ? e.composedPath() : []; return p.indexOf(uiHost) >= 0 || p.indexOf(layerHost) >= 0; }

  /* 하단에 고정된 막대(탭바 등)가 있으면 그 위로 비켜 앉는다 */
  function lift() {
    if (!uiHost) return;
    var x = innerWidth - 40, y = innerHeight - 6, l = 0;
    var els = d.elementsFromPoint ? d.elementsFromPoint(x, y) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i]; if (el === uiHost || el === layerHost || el === d.body || el === root) continue;
      var cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && cs.visibility !== 'hidden') {
        var r = el.getBoundingClientRect();
        if (r.height < innerHeight * 0.35 && r.bottom >= innerHeight - 2) { l = Math.max(l, innerHeight - r.top); }
      }
    }
    uiHost.style.setProperty('--lift', Math.round(l) + 'px');
  }

  window.JCMarker = { refresh: function () { if (ui.panel && !ui.panel.hidden) renderPanel(); } };
  /* ---------------- 시작 ---------------- */
  function start() {
    build();
    (function hook(n) { if (window.JCSync && window.JCSync.setToast) window.JCSync.setToast(toast); else if (n < 40) setTimeout(function () { hook(n + 1); }, 250); })(0);
    repaint();
    lift();
    var mo = new MutationObserver(function (list) {
      if (painting) return;
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t === uiHost || t === layerHost || t === styleEl || (t.nodeType === 1 && t.closest && t.closest('#jc-marker-ui,#jc-marker-notes'))) continue;
        if (t.nodeType === 1 && t.tagName === 'MARK' && t.classList.contains('jc-mk')) continue;
        var el = t.nodeType === 1 ? t : t.parentNode;
        if (el && el.closest && el.closest('[data-jc-ignore]')) continue;   // 시계처럼 계속 바뀌는 곳
        scheduleRepaint(); setTimeout(lift, 400); return;
      }
    });
    mo.observe(d.body, { childList: true, subtree: true, characterData: true });
    new MutationObserver(function () { syncTheme(); scheduleRepaint(60); setTimeout(lift, 300); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { data = load(KEY, { v: 1, items: [] }); repaint(); }
      if (e.key === PKEY) { prefs = load(PKEY, prefs); syncTheme(); repaint(); }
    });
    window.addEventListener('load', function () { scheduleRepaint(50); lift(); });
    window.addEventListener('hashchange', function () { scheduleRepaint(200); });
    setInterval(lift, 2000);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
