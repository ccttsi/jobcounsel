/*
 * 대학원 탐구생활 · 화면 엔진
 *
 * 데이터(고치지 않고 읽기만 한다)
 *   data/grad_departments.json  대학 251 · 대학원 1,169 · 개설 학과 12,731 (대학알리미 2024-10-07 공시)
 *   data/grad_taxonomy.json     표준분류 대 5 · 중 35 · 소 192 + 전공명 사전(lookup)
 *   data/wiki.json              전공 글(중계열 단위 + 소계열 덧붙임), 세 트랙·재정·준비 가이드
 *
 * 주소
 *   #wiki            전공 위키 첫 화면      #wiki/M05  중계열 글      #wiki/S032  소계열 글
 *   #find?so=S032&ty=s&dg=2&tm=w&rg=서울&fd=국립&ct=1&q=상담&v=d|g|u&p=2   대학원 찾기
 *   #gs/G0529        대학원 한 곳           #uni/U113  대학 한 곳
 *   #guide           진학 가이드            #about     출처와 한계
 *
 * 두 화면 오가기: 지금 붙들고 있는 전공(ctx)을 위키 ↔ 찾기 양쪽 링크에 실어 준다.
 * 외부 API·저장 없음. 조건은 주소(hash)에만 남는다.
 */
(function () {
  'use strict';
  var d = document, main = d.getElementById('main');
  var G, T, W, D, GS, U, SO = {}, JG = {}, DA = {}, GSID = {}, UID = {}, soOfJung = {}, keyCache = [];
  var TYK = { '일반대학원': 'g', '전문대학원': 'p', '특수대학원': 's' }, TYN = { g: '일반대학원', p: '전문대학원', s: '특수대학원' };
  var REG = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var TM = { d: '주간', n: '야간', s: '계절제', r: '원격' };
  var PER = 20;
  var ctx = { so: '', jg: '' }, lastFind = '', statCache = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nf(n) { return (n || 0).toLocaleString('ko-KR'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s·・.,()\[\]\-\/]/g, ''); }
  function nm(s) { return String(s || '').replace(/・/g, '·'); } // 화면에는 가운뎃점으로
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function isNce(name) { return /^N\.C\.E/.test(name); }
  function soName(s) { return !isNce(s.name) ? nm(s.name) : isNce(JG[s.jung].name) ? DA[s.dae].name.replace('계열', '') + ' 융합·기타' : nm(JG[s.jung].name) + ' 기타'; }
  function jgName(j) { return isNce(j.name) ? DA[j.dae].name.replace('계열', '') + ' 융합·기타' : nm(j.name); }
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>';
  var MAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';

  /* ---------- 불러오기 ---------- */
  function load() {
    var get = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); };
    Promise.all([get('./data/grad_departments.json'), get('./data/grad_taxonomy.json'), get('./data/wiki.json')]).then(function (a) {
      G = a[0]; T = a[1]; W = a[2]; D = G.departments; GS = G.grad_schools; U = G.unis;
      T.dae.forEach(function (x) { DA[x.code] = x; });
      T.jung.forEach(function (x) { JG[x.code] = x; soOfJung[x.code] = []; });
      T.so.forEach(function (x) { SO[x.code] = x; soOfJung[x.jung].push(x); });
      GS.forEach(function (x, i) { x.i = i; GSID[x.id] = x; });
      U.forEach(function (x, i) { x.i = i; UID[x.id] = x; });
      head();
      urlQuery();
      /* 뒤로·앞으로 가기로 돌아온 화면은 떠날 때 보던 자리로 — 앞으로 넘어가는 이동(링크·단추)만 새 내용의 첫 줄부터 연다. */
      d.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) fwd = true; }, true);
      window.addEventListener('hashchange', function (e) {
        try { var oh = new URL(e.oldURL).hash || '#'; seen[oh] = window.scrollY; } catch (x) {}
        back = !fwd && seen[location.hash || '#'] != null; fwd = false; route();
      });
      route();
    }).catch(function () {
      main.innerHTML = '<p class="loading">자료를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주십시오.</p>';
    });
  }
  /* 다른 섹터에서 ?q=로 들어오면 그 낱말로 바로 찾는다(학과·전공에서 넘어오는 길). */
  function urlQuery() {
    var q = '';
    try { q = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) {}
    if (!q || location.hash) return;
    var href = '#find?q=' + encodeURIComponent(q);
    try { history.replaceState(null, '', location.pathname + location.search + href); }
    catch (e) { location.hash = href; }
  }
  function head() {
    var c = G.meta.counts, t = c.by_type;
    d.getElementById('catDl').innerHTML =
      '<dt>대학</dt><dd class="n">' + nf(c.universities) + '곳</dd>' +
      '<dt>대학원</dt><dd class="n">' + nf(c.grad_schools) + '곳</dd>' +
      '<dt>일반 · 전문 · 특수</dt><dd class="n">' + nf(t['일반대학원']) + ' · ' + nf(t['전문대학원']) + ' · ' + nf(t['특수대학원']) + '</dd>' +
      '<dt>개설 학과</dt><dd class="n">' + nf(c.departments) + '건</dd>' +
      '<dt>표준분류 대 · 중 · 소</dt><dd class="n">' + T.dae.length + ' · ' + T.jung.length + ' · ' + T.so.length + '</dd>';
    d.getElementById('nW').textContent = T.so.length;
    d.getElementById('nF').textContent = nf(c.departments);
  }

  /* ---------- 집계 ---------- */
  function rowsOf(kind, code) { // kind: so | jg | da
    return D.filter(function (r) { var s = SO[r[2]]; return kind === 'so' ? r[2] === code : kind === 'jg' ? s.jung === code : s.dae === code; });
  }
  function stat(kind, code) {
    var k = kind + code; if (statCache[k]) return statCache[k];
    var rows = rowsOf(kind, code), st = { n: rows.length, ty: { g: 0, p: 0, s: 0 }, tm: {}, deg: { m: 0, d: 0, i: 0 }, ct: 0, rg: {}, gs: {}, un: {} };
    rows.forEach(function (r) {
      var g = GS[r[0]];
      st.ty[TYK[g.type]]++; st.tm[r[5]] = (st.tm[r[5]] || 0) + 1;
      if (r[4] & 1) st.deg.m++; if (r[4] & 2) st.deg.d++; if (r[4] & 4) st.deg.i++;
      if (r[6] === '계약학과') st.ct++;
      st.rg[r[10]] = (st.rg[r[10]] || 0) + 1; st.gs[r[0]] = (st.gs[r[0]] || 0) + 1; st.un[g.uni] = 1;
    });
    st.schools = Object.keys(st.gs).length; st.unis = Object.keys(st.un).length;
    st.topGs = Object.keys(st.gs).sort(function (a, b) { return st.gs[b] - st.gs[a] || a - b; }).slice(0, 5).map(function (i) { return { g: GS[i], n: st.gs[i] }; });
    st.topRg = Object.keys(st.rg).sort(function (a, b) { return st.rg[b] - st.rg[a]; }).slice(0, 5).map(function (x) { return [x, st.rg[x]]; });
    return (statCache[k] = st);
  }

  /* ---------- 주소 ---------- */
  function parse() {
    var h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'wiki', i = h.indexOf('?'), path = i < 0 ? h : h.slice(0, i), q = {};
    if (i >= 0) h.slice(i + 1).split('&').forEach(function (kv) { var j = kv.indexOf('='); if (j > 0) q[kv.slice(0, j)] = kv.slice(j + 1); });
    var seg = path.split('/');
    return { view: seg[0], id: seg[1] || '', q: q };
  }
  function findHref(f) {
    var keys = ['q', 'so', 'jg', 'da', 'ty', 'dg', 'tm', 'rg', 'fd', 'ct', 'v', 'p'], out = [];
    keys.forEach(function (k) { if (f[k] && !(k === 'v' && f[k] === 'd') && !(k === 'p' && +f[k] <= 1)) out.push(k + '=' + encodeURIComponent(f[k])); });
    return '#find' + (out.length ? '?' + out.join('&') : '');
  }
  function withCtx(f) { // 지금 붙든 전공을 찾기 조건에 싣는다
    var o = {}; for (var k in f) o[k] = f[k];
    delete o.so; delete o.jg; delete o.da; delete o.p;
    if (ctx.so) o.so = ctx.so; else if (ctx.jg) o.jg = ctx.jg;
    return o;
  }
  function syncSwap(view) {
    var sw = d.getElementById('swap'), w = d.getElementById('swWiki'), f = d.getElementById('swFind');
    var tab = view === 'find' || view === 'gs' || view === 'uni' ? 'find' : view === 'wiki' ? 'wiki' : view;
    sw.setAttribute('data-v', tab);
    w.href = '#wiki' + (ctx.so ? '/' + ctx.so : ctx.jg ? '/' + ctx.jg : '');
    f.href = findHref(withCtx(lastFind ? parseQ(lastFind) : {}));
    [[w, 'wiki'], [f, 'find'], [d.getElementById('swGuide'), 'guide'], [d.getElementById('swAbout'), 'about']].forEach(function (p) {
      if (p[1] === tab) p[0].setAttribute('aria-current', 'page'); else p[0].removeAttribute('aria-current');
    });
  }
  function parseQ(s) { var q = {}; s.split('&').forEach(function (kv) { var j = kv.indexOf('='); if (j > 0) q[kv.slice(0, j)] = decodeURIComponent(kv.slice(j + 1)); }); return q; }

  var first = true;
  function route() {
    var r = parse();
    if (r.view === 'wiki') { if (SO[r.id]) vSo(SO[r.id]); else if (JG[r.id]) vJung(JG[r.id]); else vWiki(r.id); }
    else if (r.view === 'find') vFind(r.q);
    else if (r.view === 'gs' && GSID[r.id]) vGs(GSID[r.id]);
    else if (r.view === 'uni' && UID[r.id]) vUni(UID[r.id]);
    else if (r.view === 'guide') vGuide(r.id);
    else if (r.view === 'about') vAbout();
    else { r.view = 'wiki'; vWiki(''); }
    if (r.view === 'wiki' && !SO[r.id] && !JG[r.id]) d.body.setAttribute('data-home', ''); else d.body.removeAttribute('data-home');
    syncSwap(r.view);
    d.title = (main.getAttribute('data-title') ? main.getAttribute('data-title') + ' · ' : '') + '대학원 탐구생활';
    /* 다른 글·화면으로 넘어가면 새 내용의 첫 줄부터 읽게 — 본문(main) 첫 줄을 위에 붙어 다니는 탭 줄 바로 아래로 올린다.
       (예전에는 붙어 다니는 #swap의 «지금 화면 위치»로 재서, 늘 올릴 필요가 없다고 판단해 글 중간에서 열렸다 — 2026-11-23 IMG_7864·7865)
       거름·쪽 넘김처럼 같은 화면 안에서 조건만 바꾸는 이동은 go(href, true)로 보던 자리를 그대로 둔다. */
    if (!first && back) { var y = seen[location.hash || '#']; requestAnimationFrame(function () { window.scrollTo(0, y); }); }
    else if (!first && !keepScroll) {
      var sw = d.getElementById('swap'), bar = sw ? sw.getBoundingClientRect().bottom : 0;
      var mt = main.getBoundingClientRect().top;
      if (mt < bar + 8 || mt > window.innerHeight * .6) window.scrollTo(0, Math.max(0, window.scrollY + mt - bar - 8));
    }
    first = false; keepScroll = false; back = false;
    if (window.JCPrefs && JCPrefs.rescale) JCPrefs.rescale();
  }
  var keepScroll = false, fwd = false, back = false, seen = {};
  function go(href, keep) { keepScroll = !!keep; fwd = true; if (location.hash === href) route(); else location.hash = href; }
  function page(title, html) { main.setAttribute('data-title', title || ''); main.innerHTML = html; }

  /* ---------- 공통 조각 ---------- */
  function mixBar(ty) { var n = ty.g + ty.p + ty.s || 1; return '<div class="mix" role="img" aria-label="일반 ' + ty.g + ', 전문 ' + ty.p + ', 특수 ' + ty.s + '"><b class="g" style="width:' + pct(ty.g, n) + '%"></b><b class="p" style="width:' + pct(ty.p, n) + '%"></b><b class="s" style="width:' + pct(ty.s, n) + '%"></b></div>'; }
  function bar(label, v, total, color) { return '<div class="bar"' + (color ? ' style="--c:var(' + color + ')"' : '') + '><em>' + label + '</em><div><b style="width:' + Math.max(v ? 2 : 0, pct(v, total)) + '%"></b></div><i>' + nf(v) + '</i></div>'; }
  function crumbs(s, j) {
    var da = DA[(s || j).dae], jj = j || JG[s.jung];
    return '<nav class="crumbs" aria-label="분류 경로"><a href="#wiki">전공 위키</a><span>›</span><a href="#wiki/' + da.code + '">' + esc(da.name) + '</a>' +
      (s ? '<span>›</span><a href="#wiki/' + jj.code + '">' + esc(jgName(jj)) + '</a>' : '') + '</nav>';
  }
  function bullets(a) { return a && a.length ? '<ul class="bl">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function degTags(bits) { return (bits & 1 ? '<span class="tg">석사</span>' : '') + (bits & 2 ? '<span class="tg">박사</span>' : '') + (bits & 4 ? '<span class="tg">석박통합</span>' : '') + (bits & 8 ? '<span class="tg">학석통합</span>' : ''); }
  function tyTag(g) { return '<span class="ty ' + TYK[g.type] + '">' + g.type.replace('대학원', '') + '</span>'; }

  /* ---------- 접고 펴는 칸 ---------- */
  // 휴대폰: 제목과 핵심 낱말만 먼저 보이고, 누른 칸만 펼친다. 넓은 화면: 왼쪽 목록 + 오른쪽 한 칸(가로 배치).
  function panes(list, cur, open) {
    cur = cur || 0;
    return '<div class="pn" style="grid-template-rows:repeat(' + list.length + ',auto) 1fr">' + list.map(function (s, i) {
      var on = i === cur ? ' cur' : '', op = open === i ? ' open' : '';
      return '<button type="button" class="pn-t' + on + op + '" data-pn="' + i + '" aria-expanded="' + (open === i) + '" style="grid-row:' + (i + 1) + '"><i>' + esc(s.n) + '</i><span><b>' + s.title + '</b>' +
        (s.keys && s.keys.length ? '<em>' + s.keys.filter(Boolean).slice(0, 3).map(function (k) { return '<u>' + esc(k) + '</u>'; }).join('') + '</em>' : '') + '</span></button>' +
        '<section class="pn-s' + on + op + '"><h2 class="pn-h"><i>' + esc(s.n) + '</i>' + s.title + '</h2>' + s.body + '</section>';
    }).join('') + '</div>';
  }
  function bindPanes() {
    main.querySelectorAll('.pn').forEach(function (pn) {
      pn.addEventListener('click', function (e) {
        var b = e.target.closest('.pn-t'); if (!b || b.parentNode !== pn) return;
        var sec = b.nextElementSibling, wasOpen = b.classList.contains('open');
        for (var i = 0; i < pn.children.length; i++) pn.children[i].classList.remove('cur');
        b.classList.add('cur'); sec.classList.add('cur');
        b.classList.toggle('open', !wasOpen); sec.classList.toggle('open', !wasOpen);
        b.setAttribute('aria-expanded', String(!wasOpen));
        if (window.JCPrefs && JCPrefs.rescale) JCPrefs.rescale();
      });
    });
  }
  function page2(title, html) { page(title, html); bindPanes(); }

  /* ---------- 전공 위키: 첫 화면 ---------- */
  function vWiki(anchor) {
    ctx.so = ''; ctx.jg = '';
    var h = '<div class="sb">' + MAG + '<input id="wq" type="search" inputmode="search" autocomplete="off" placeholder="전공·학과 이름 (예: 상담심리, 인공지능, 간호)" aria-label="전공·학과 이름으로 찾기"></div><div id="wsug"></div>' +
      '<p class="legend"><span style="--c:var(--tg)">일반</span><span style="--c:var(--tp)">전문</span><span style="--c:var(--ts)">특수</span><span style="--c:transparent">막대는 종류별 비중</span></p>';
    var list = T.dae.map(function (da, i) {
      var st = stat('da', da.code), js = T.jung.filter(function (j) { return j.dae === da.code; }).map(function (j) { return { j: j, st: stat('jg', j.code) }; })
        .filter(function (x) { return x.st.n > 0; }).sort(function (a, b) { return isNce(a.j.name) - isNce(b.j.name) || b.st.n - a.st.n; });
      var body = '<p class="pn-lead">' + esc(W.dae[da.code] || '') + '</p><div class="jg">' + js.map(function (x) {
        var j = x.j, w = wj(j), subs = soOfJung[j.code].filter(function (s) { return s.grad.dept > 0 && !isNce(s.name); }).sort(function (a, b) { return b.grad.dept - a.grad.dept; }).slice(0, 4);
        return '<a class="jc" href="#wiki/' + j.code + '"><div class="jc-t">' + esc(jgName(j)) + '<i>' + nf(x.st.n) + '</i></div><p>' + esc(w.one || '') + '</p>' +
          (subs.length ? '<ul>' + subs.map(function (s) { return '<li>' + esc(nm(s.name)) + '</li>'; }).join('') + '</ul>' : '') + mixBar(x.st.ty) + '</a>';
      }).join('') + '</div>';
      return { n: i + 1, title: esc(da.name) + '<small>' + nf(st.n) + '건</small>', keys: js.slice(0, 3).map(function (x) { return jgName(x.j); }), body: body };
    });
    var ai = -1; T.dae.forEach(function (da, i) { if (da.code === anchor) ai = i; });
    h += panes(list, ai < 0 ? 0 : ai, ai < 0 ? undefined : ai);
    page2('전공 위키', h);
    var inp = d.getElementById('wq'), box = d.getElementById('wsug');
    inp.addEventListener('input', function () { box.innerHTML = suggest(inp.value); });
  }
  function wj(j) { // 중계열 글. 교육은 한 편을 함께 쓰고, 기타(N.C.E.)는 공통 글
    if (isNce(j.name)) return W.jung.NCE;
    if (j.name === '교육') return W.jung.M03;
    return W.jung[j.code] || {};
  }
  function suggest(q) {
    var k = norm(q); if (k.length < 1) return '';
    var seen = {}, out = [];
    function add(code, via, w) { if (!SO[code] || SO[code].grad.dept === 0) return; if (seen[code]) { if (w > seen[code].w) { seen[code].w = w; seen[code].via = via; } return; } seen[code] = { s: SO[code], via: via, w: w }; out.push(seen[code]); }
    T.so.forEach(function (s) { if (isNce(s.name)) return; var n = norm(s.name); if (n.indexOf(k) >= 0) add(s.code, '', n === k ? 100 : 60); });
    Object.keys(T.lookup).forEach(function (name) { var n = norm(name); if (n.indexOf(k) >= 0) add(T.lookup[name], name, n === k ? 90 : 40); });
    T.so.forEach(function (s) { (s.top_names || []).forEach(function (t) { if (norm(t.name).indexOf(k) >= 0) add(s.code, t.name, 30); }); });
    out.sort(function (a, b) { return b.w - a.w || b.s.grad.dept - a.s.grad.dept; });
    var h = out.slice(0, 8).map(function (o) {
      return '<a href="#wiki/' + o.s.code + '"><b>' + esc(soName(o.s)) + '</b><small>' + esc(o.via && norm(o.via) !== norm(o.s.name) ? '‘' + o.via + '’ 포함 · ' : '') + esc(nm(JG[o.s.jung].name)) + '</small><i>' + nf(o.s.grad.dept) + '건</i></a>';
    }).join('');
    return '<div class="sug">' + (h || '<p>전공 분류에서는 찾지 못했습니다.</p>') +
      '<a href="' + findHref({ q: q.trim() }) + '"><b>‘' + esc(q.trim()) + '’ 이름이 들어간 학과·대학원 찾기</b><i>대학원 찾기 ›</i></a></div>';
  }

  /* ---------- 전공 위키: 글 ---------- */
  function article(o) { // o: {kind, code, title, w, extra, s, j}
    var st = stat(o.kind, o.code), w = o.w, s = o.s, j = o.j, da = DA[(s || j).dae];
    var ff = {}; ff[o.kind] = o.code;
    var tot = st.n || 1, wk = (st.tm['야간'] || 0) + (st.tm['계절제'] || 0) + (st.tm['원격'] || 0);
    var subs = s ? [] : soOfJung[j.code].filter(function (x) { return x.grad.dept > 0; }).sort(function (a, b) { return isNce(a.name) - isNce(b.name) || b.grad.dept - a.grad.dept; });
    var h = '<header class="ah"><div>' + crumbs(s, j) + '<h1>' + esc(o.title) + '<span class="code">' + o.code + '</span></h1><p class="one">' + esc(w.one || '') + '</p></div>' +
      '<div><div class="figs"><div><b>' + nf(st.n) + '</b><span>개설 학과</span></div><div><b>' + nf(st.schools) + '</b><span>대학원</span></div><div><b>' + nf(st.unis) + '</b><span>대학</span></div></div>' +
      (st.n ? '<a class="go" href="' + findHref(ff) + '"><span>이 전공을 연 대학원 ' + nf(st.n) + '건 보기</span>' + ARROW + '</a>' : '') + '</div></header>';
    var list = [];

    // ① 무엇을 공부하나
    list.push({ n: 1, title: '무엇을 공부하나', keys: s ? (s.top_names || []).slice(0, 3).map(function (t) { return t.name; }) : subs.slice(0, 3).map(soName),
      body: bullets(w.study) + (w.byDae && w.byDae[da.code] ? '<p class="memo"><b>' + esc(da.name) + '의 교육 갈래</b>' + esc(w.byDae[da.code]) + '</p>' : '') +
        (s && s.top_names && s.top_names.length ? '<h3>대학원에서 실제로 쓰는 학과 이름</h3><div class="chips">' + s.top_names.map(function (t) {
          return '<a href="' + findHref({ so: s.code, q: t.name }) + '">' + esc(t.name) + '<i>' + t.n + '</i></a>';
        }).join('') + '</div>' : '') +
        (!s ? '<h3>세부 분야</h3><div class="subs">' + subs.map(function (x) { return '<a href="#wiki/' + x.code + '">' + esc(soName(x)) + '<i>' + nf(x.grad.dept) + '</i></a>'; }).join('') + '</div>' : '') });

    // ② 연구 주제와 방법
    if ((w.topics && w.topics.length) || (w.methods && w.methods.length))
      list.push({ n: 2, title: '연구 주제와 방법', keys: w.methods || [], body: bullets(w.topics) + (w.methods && w.methods.length ? '<h3>자주 쓰는 연구 방법</h3><ul class="chips">' + w.methods.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '') });

    // ③ 문턱과 실익
    list.push({ n: 3, title: '자격 문턱과 진학 실익', keys: [w.gk, o.extra ? '세부 확인 있음' : ''],
      body: '<div class="g2"><div><h3>학사와 달라지는 직무·자격 문턱</h3>' + bullets(w.gate) + (o.extra ? '<p class="memo"><b>' + esc(o.title) + '에서 확인할 점</b>' + esc(o.extra) + '</p>' : '') + '</div>' +
        '<div>' + (w.roi && w.roi.length ? '<h3>실익을 따질 때</h3>' + bullets(w.roi) : '') +
        '<details class="more"><summary>스스로 따져 보는 여섯 가지 질문</summary><div><p class="note" style="margin:0 0 6px">' + esc(W.roiNote) + '</p><ul class="qa">' + W.roi.map(function (r) { return '<li><b>' + esc(r[0]) + '</b>' + esc(r[1]) + '</li>'; }).join('') + '</ul></div></details></div></div>' });

    // ④ 세 트랙과 실제 분포
    var dom = ['g', 'p', 's'].sort(function (a, b) { return st.ty[b] - st.ty[a]; })[0];
    list.push({ n: 4, title: '세 트랙과 실제 개설 분포', keys: [TYN[dom].replace('대학원', '') + ' ' + Math.round(pct(st.ty[dom], tot)) + '%', wk ? '야간·계절 ' + Math.round(pct(wk, tot)) + '%' : '주간 중심'],
      body: (w.track ? '<p class="t">' + esc(w.track) + '</p>' : '') +
        '<div class="g3"><div><h3>대학원 종류</h3><div class="bars">' + ['g', 'p', 's'].map(function (k) { return '<a href="' + findHref(merge(ff, { ty: k })) + '">' + bar(TYN[k].replace('대학원', ''), st.ty[k], tot, k === 'g' ? '--tg' : k === 'p' ? '--tp' : '--ts') + '</a>'; }).join('') + '</div></div>' +
        '<div><h3>수업 시간</h3><div class="bars">' + bar('주간', st.tm['주간'] || 0, tot) + '<a href="' + findHref(merge(ff, { tm: 'w' })) + '">' + bar('야간·계절·원격', wk, tot) + '</a></div></div>' +
        '<div><h3>학위 과정</h3><div class="bars">' + bar('석사', st.deg.m, tot) + bar('박사', st.deg.d, tot) + bar('석박사통합', st.deg.i, tot) + '</div></div></div>' +
        '<div class="g2" style="margin-top:14px"><div class="box"><h3>많이 개설한 대학원</h3><ul class="tops">' + st.topGs.map(function (x) {
          return '<li><a href="#gs/' + x.g.id + '">' + tyTag(x.g) + '<span>' + esc(x.g.display) + '</span><i>' + x.n + '</i></a></li>';
        }).join('') + '</ul></div><div class="box"><h3>지역 (학과 소재지, 상위 5곳)</h3><div class="bars">' + st.topRg.map(function (x) { return '<a href="' + findHref(merge(ff, { rg: x[0] })) + '">' + bar(x[0], x[1], st.topRg[0][1]) + '</a>'; }).join('') + '</div></div></div>' +
        '<p class="note">학과 ' + nf(st.n) + '건 기준(대학알리미 2024-10-07 공시). 막대를 누르면 그 조건으로 대학원 찾기가 열립니다.</p>' +
        '<details class="more"><summary>세 종류의 대학원은 무엇이 다른가</summary><div>' + trackCards() + '</div></details>' });

    // ⑤ 재정
    list.push({ n: 5, title: 'BK21·TA/RA, 장학과 재정', keys: [w.fk, st.ct ? '계약학과 ' + st.ct + '건' : ''],
      body: (w.fund ? '<p class="t">' + esc(w.fund) + '</p>' : '') +
        (st.ct ? '<p class="memo"><b>계약학과</b>이 전공에는 계약학과가 ' + nf(st.ct) + '건 있습니다. <a href="' + findHref(merge(ff, { ct: '1' })) + '" style="font-weight:700;color:var(--acc)">목록 보기</a></p>' : '') +
        '<details class="more"><summary>지원 종류별로 확인할 점</summary><div class="fund" style="padding-top:8px">' + fundCards() + '</div></details>' });

    // ⑥ 준비
    list.push({ n: 6, title: '지도교수 컨택과 입학 준비', keys: [w.pk],
      body: (w.prep ? '<p class="t">' + esc(w.prep) + '</p>' : '') +
        '<details class="more"><summary>준비 순서</summary><div>' + timeline() + '</div></details><details class="more"><summary>컨택 메일에 담을 것</summary><div>' + mail() + '</div></details>' +
        '<a class="go line" href="#guide"><span>진학 가이드 전체 보기</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' });

    h += panes(list, 0) +
      '<p class="note">전공 설명은 자료실이 새로 쓴 참고용 글이며(' + esc(W.checked) + ' 확인), 개설 수는 대학알리미 2024-10-07 공시에서 화면이 직접 센 값입니다. 자격·제도 요건은 <a href="#about">출처</a>의 확인처에서 다시 확인하십시오.</p>';
    page2(o.title, h);
  }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function vSo(s) { ctx.so = s.code; ctx.jg = ''; var j = JG[s.jung]; article({ kind: 'so', code: s.code, title: soName(s), w: wj(isNce(s.name) ? { name: 'N.C.E.' } : j), extra: W.so[s.code] || '', s: s, j: j }); }
  function vJung(j) { ctx.jg = j.code; ctx.so = ''; article({ kind: 'jg', code: j.code, title: jgName(j), w: wj(j), extra: '', s: null, j: j }); }

  function trackCards() {
    var c = G.meta.counts.by_type;
    return '<div class="trk">' + W.tracks.map(function (t) {
      return '<article style="--c:var(--t' + t.key + ')"><h3>' + esc(t.id) + '<small>' + nf(c[t.id]) + '곳</small></h3><p>' + esc(t.one) + '</p><dl>' +
        t.rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></article>';
    }).join('') + '</div>';
  }
  function fundCards() { return W.fund.map(function (f) { return '<article><h3>' + esc(f.t) + '</h3><p>' + esc(f.b) + '</p><p>' + esc(f.c) + '</p></article>'; }).join(''); }
  function timeline() { return '<ol class="tl">' + W.prep.timeline.map(function (t) { return '<li><em>' + esc(t[0]) + '</em><b>' + esc(t[1]) + '</b><p>' + esc(t[2]) + '</p></li>'; }).join('') + '</ol>'; }
  function mail() { return '<ol class="mail">' + W.prep.contact.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>'; }

  /* ---------- 대학원 찾기 ---------- */
  function keyOf(i) { if (keyCache[i] == null) { var r = D[i], g = GS[r[0]]; keyCache[i] = norm(r[1]) + '|' + norm(g.display) + '|' + norm(r[9]); } return keyCache[i]; }
  function matchRows(f) {
    var toks = (f.q || '').trim().split(/\s+/).map(norm).filter(Boolean), out = [];
    for (var i = 0; i < D.length; i++) {
      var r = D[i], g = GS[r[0]], s = SO[r[2]];
      if (f.so && r[2] !== f.so) continue;
      if (f.jg && s.jung !== f.jg) continue;
      if (f.da && s.dae !== f.da) continue;
      if (f.ty && TYK[g.type] !== f.ty) continue;
      if (f.dg && !(r[4] & +f.dg)) continue;
      if (f.tm) { if (f.tm === 'w') { if (r[5] === '주간') continue; } else if (r[5] !== TM[f.tm]) continue; }
      if (f.rg && r[10] !== f.rg) continue;
      if (f.fd && g.found !== f.fd) continue;
      if (f.ct && r[6] !== '계약학과') continue;
      if (toks.length) { var k = keyOf(i), ok = true; for (var t = 0; t < toks.length; t++) if (k.indexOf(toks[t]) < 0) { ok = false; break; } if (!ok) continue; }
      out.push(i);
    }
    return out;
  }
  function vFind(q, partial) {
    var f = { q: q.q || '', so: SO[q.so] ? q.so : '', jg: JG[q.jg] ? q.jg : '', da: DA[q.da] ? q.da : '', ty: TYN[q.ty] ? q.ty : '', dg: /^[124]$/.test(q.dg) ? q.dg : '',
      tm: /^[dnsrw]$/.test(q.tm) ? q.tm : '', rg: REG.indexOf(q.rg) >= 0 ? q.rg : '', fd: /^(국립|공립|사립)$/.test(q.fd) ? q.fd : '', ct: q.ct ? '1' : '', v: /^[gu]$/.test(q.v) ? q.v : 'd', p: Math.max(1, parseInt(q.p, 10) || 1) };
    if (f.so) { f.jg = ''; f.da = ''; } else if (f.jg) f.da = '';
    ctx.so = f.so; ctx.jg = f.so ? '' : f.jg;
    lastFind = findHref(f).replace(/^#find\??/, '');
    var idx = matchRows(f), active = ['ty', 'dg', 'tm', 'rg', 'fd', 'ct', 'so', 'jg', 'da'].filter(function (k) { return f[k]; }).length;

    // 조건별 개수(다른 조건은 그대로 둔 채 이 조건만 바꿨을 때)
    function cnt(key, val) { var g = merge(f, {}); g[key] = val; return matchRows(g).length; }
    function opt(key, val, label, withN) { var on = f[key] === val; return '<button type="button" data-k="' + key + '" data-v="' + esc(val) + '" aria-pressed="' + on + '">' + label + (withN ? '<small>' + nf(cnt(key, val)) + '</small>' : '') + '</button>'; }

    var curDa = f.so ? SO[f.so].dae : f.jg ? JG[f.jg].dae : f.da, curJg = f.so ? SO[f.so].jung : f.jg;
    var top = '<div class="sb">' + MAG + '<input id="fq" type="search" inputmode="search" autocomplete="off" value="' + esc(f.q) + '" placeholder="학과·대학원·대학 이름 (예: 상담심리 서울, 교육대학원)" aria-label="학과·대학원·대학 이름으로 찾기"></div>';
    var h = '';
    if (f.so || f.jg) {
      var cs = f.so ? SO[f.so] : null, cj = f.jg ? JG[f.jg] : null;
      h += '<p class="ctx"><span>전공</span><b>' + esc(cs ? soName(cs) : jgName(cj)) + '</b><span class="code">' + (f.so || f.jg) + '</span>' +
        '<a href="#wiki/' + (f.so || f.jg) + '">이 전공 글 읽기 ⇄</a><button type="button" data-k="' + (f.so ? 'so' : 'jg') + '" data-v="">전공 조건 풀기 ×</button></p>';
    }
    h += '<div class="fd" style="margin-top:16px"><div class="fl" id="fl"><button type="button" class="fl-t" id="flT" aria-expanded="false">조건으로 거르기<i>' + (active ? active + '개 적용' : '펼치기') + '</i></button><div class="fl-b">' +
      '<div class="fg"><h3>대학원 종류</h3><div class="opts">' + opt('ty', 'g', '일반', 1) + opt('ty', 'p', '전문', 1) + opt('ty', 's', '특수', 1) + '</div></div>' +
      '<div class="fg"><h3>학위 과정</h3><div class="opts">' + opt('dg', '1', '석사', 1) + opt('dg', '2', '박사', 1) + opt('dg', '4', '석박사통합', 1) + '</div></div>' +
      '<div class="fg"><h3>수업 시간</h3><div class="opts">' + opt('tm', 'w', '일과 함께(야간·계절·원격)', 1) + opt('tm', 'd', '주간') + opt('tm', 'n', '야간') + opt('tm', 's', '계절제') + opt('tm', 'r', '원격') + '</div></div>' +
      '<div class="fg"><h3>전공 분류</h3><select id="selDa" aria-label="대계열"><option value="">대계열 전체</option>' + T.dae.map(function (x) { return '<option value="' + x.code + '"' + (curDa === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      (curDa ? '<select id="selJg" aria-label="중계열"><option value="">중계열 전체</option>' + T.jung.filter(function (x) { return x.dae === curDa; }).map(function (x) { return '<option value="' + x.code + '"' + (curJg === x.code ? ' selected' : '') + '>' + esc(jgName(x)) + '</option>'; }).join('') + '</select>' : '') +
      (curJg ? '<select id="selSo" aria-label="소계열"><option value="">소계열 전체</option>' + soOfJung[curJg].filter(function (x) { return x.grad.dept > 0; }).map(function (x) { return '<option value="' + x.code + '"' + (f.so === x.code ? ' selected' : '') + '>' + esc(soName(x)) + ' (' + x.grad.dept + ')</option>'; }).join('') + '</select>' : '') + '</div>' +
      '<div class="fg"><h3>지역 (학과 소재지)</h3><div class="opts">' + REG.map(function (x) { return opt('rg', x, x); }).join('') + '</div></div>' +
      '<div class="fg"><h3>설립</h3><div class="opts">' + opt('fd', '국립', '국립') + opt('fd', '공립', '공립') + opt('fd', '사립', '사립') + '</div></div>' +
      '<div class="fg"><h3>학과 특성</h3><div class="opts">' + opt('ct', '1', '계약학과만', 1) + '</div>' + (active || f.q ? '<button type="button" class="reset" id="reset">조건 모두 풀기</button>' : '') + '</div>' +
      '</div></div><div>';

    // 보기 방식
    var gsMap = {}, unMap = {};
    idx.forEach(function (i) { var g = D[i][0]; gsMap[g] = (gsMap[g] || 0) + 1; unMap[GS[g].uni] = (unMap[GS[g].uni] || 0) + 1; });
    var gsList = Object.keys(gsMap), unList = Object.keys(unMap);
    h += '<div class="vw"><div class="seg" role="group" aria-label="보기 방식">' +
      '<button type="button" data-k="v" data-v="d" aria-pressed="' + (f.v === 'd') + '">학과 ' + nf(idx.length) + '</button>' +
      '<button type="button" data-k="v" data-v="g" aria-pressed="' + (f.v === 'g') + '">대학원 ' + nf(gsList.length) + '</button>' +
      '<button type="button" data-k="v" data-v="u" aria-pressed="' + (f.v === 'u') + '">대학 ' + nf(unList.length) + '</button></div></div>';

    // 검색어가 전공 이름이면 위키로 잇는 길
    var lk = T.lookup[f.q.trim()] || (function () { var k = norm(f.q); if (!k) return ''; for (var c in SO) if (!isNce(SO[c].name) && norm(SO[c].name) === k) return c; return ''; })();
    if (lk && SO[lk] && lk !== f.so) h += '<p class="hint"><span>‘' + esc(f.q.trim()) + '’은(는) 표준분류에서 <b>' + esc(soName(SO[lk])) + '</b> 전공에 들어갑니다.</span><a href="#wiki/' + lk + '">전공 글 읽기 ⇄</a><a href="' + findHref(merge(f, { so: lk, q: '', p: 1 })) + '">이 전공 전체 ' + nf(SO[lk].grad.dept) + '건 보기</a></p>';

    var list = f.v === 'd' ? idx : f.v === 'g' ? gsList.sort(function (a, b) { return gsMap[b] - gsMap[a] || a - b; }) : unList.sort(function (a, b) { return unMap[b] - unMap[a] || a - b; });
    var pages = Math.max(1, Math.ceil(list.length / PER)); if (f.p > pages) f.p = pages;
    var slice = list.slice((f.p - 1) * PER, f.p * PER);
    if (!list.length) h += '<p class="empty">조건에 맞는 곳이 없습니다. 조건을 하나씩 풀어 보십시오.</p>';
    else {
      h += '<div class="rows two">';
      if (f.v === 'd') slice.forEach(function (i) {
        var r = D[i], g = GS[r[0]];
        h += '<div class="row"><button type="button" data-row="' + i + '" aria-expanded="false"><span class="r-n">' + esc(r[1]) + '</span><span class="r-s">' + esc(g.display) + '</span>' +
          '<span class="r-m">' + tyTag(g) + degTags(r[4]) + '<span class="tg' + (r[5] !== '주간' ? ' on' : '') + '">' + r[5] + '</span>' + (r[6] !== '일반과정' ? '<span class="tg on">' + esc(r[6]) + '</span>' : '') + '<span class="loc">' + esc(r[10] + ' ' + r[11]) + ' · ' + r[3] + '년</span></span></button></div>';
      });
      else if (f.v === 'g') slice.forEach(function (gi) {
        var g = GS[gi];
        h += '<div class="row"><a href="#gs/' + g.id + '"><span class="r-n">' + esc(g.display) + '</span><span class="r-s">조건에 맞는 학과 ' + nf(gsMap[gi]) + '건 · 전체 ' + nf(g.depts) + '건</span>' +
          '<span class="r-m">' + tyTag(g) + g.degrees.map(function (x) { return '<span class="tg">' + x.replace('석박사통합', '석박통합') + '</span>'; }).join('') + '<span class="loc">' + esc(g.region) + (g.found ? ' · ' + g.found : '') + '</span></span></a></div>';
      });
      else slice.forEach(function (ui) {
        var u = U[ui];
        h += '<div class="row"><a href="#uni/' + u.id + '"><span class="r-n">' + esc(u.name) + '</span><span class="r-s">조건에 맞는 학과 ' + nf(unMap[ui]) + '건 · 대학원 ' + u.grad_schools + '곳 · 전체 학과 ' + nf(u.depts) + '건</span>' +
          '<span class="r-m"><span class="tg">' + esc(u.kind) + '</span><span class="loc">' + esc(u.region) + (u.found ? ' · ' + u.found : '') + '</span></span></a></div>';
      });
      h += '</div>' + pager(f.p, pages);
    }
    h += '<p class="note">대학알리미 2024-10-07 공시 기준입니다. 학위 과정은 개설된 과정이며 지금 모집 중인지는 해당 대학원 모집요강으로 확인하십시오.</p></div></div>';
    var body = d.getElementById('fbody');
    if (partial && body) body.innerHTML = h; else { page('대학원 찾기', top + '<div id="fbody">' + h + '</div>'); body = d.getElementById('fbody'); }

    // 동작
    var fl = d.getElementById('fl');
    if (flOpen) { fl.classList.add('open'); d.getElementById('flT').setAttribute('aria-expanded', 'true'); }
    d.getElementById('flT').addEventListener('click', function () { flOpen = !flOpen; fl.classList.toggle('open', flOpen); this.setAttribute('aria-expanded', String(flOpen)); });
    function apply(ch, keep) { var g = merge(f, ch); if (!('p' in ch)) g.p = 1; go(findHref(g), keep); }
    body.querySelectorAll('[data-k]').forEach(function (b) {
      b.addEventListener('click', function () { var k = b.getAttribute('data-k'), v = b.getAttribute('data-v'), ch = {}; ch[k] = f[k] === v && k !== 'v' ? '' : v; apply(ch, k !== 'p'); });
    });
    var sel = function (id, fn) { var el = d.getElementById(id); if (el) el.addEventListener('change', function () { fn(el.value); }); };
    sel('selDa', function (v) { apply({ da: v, jg: '', so: '' }, true); });
    sel('selJg', function (v) { apply({ jg: v, so: '', da: v ? '' : curDa }, true); });
    sel('selSo', function (v) { apply({ so: v, jg: v ? '' : curJg }, true); });
    var rs = d.getElementById('reset'); if (rs) rs.addEventListener('click', function () { go('#find', true); });
    var inp = d.getElementById('fq');
    if (!partial) inp.addEventListener('input', function () {
      clearTimeout(qTimer); qTimer = setTimeout(function () {
        var g = parseQ(lastFind); g.q = inp.value; delete g.p;
        try { history.replaceState(null, '', findHref(g)); } catch (e) { location.hash = findHref(g); return; }
        vFind(parse().q, true); syncSwap('find');
        if (window.JCPrefs && JCPrefs.rescale) JCPrefs.rescale();
      }, 220);
    });
    else if (d.activeElement !== inp && inp.value !== f.q) inp.value = f.q;
    body.querySelectorAll('[data-row]').forEach(function (b) {
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') === 'true', host = b.parentNode, old = host.querySelector('.det');
        if (old) old.remove();
        b.setAttribute('aria-expanded', String(!open));
        if (!open) host.insertAdjacentHTML('beforeend', detail(+b.getAttribute('data-row')));
      });
    });
  }
  var flOpen = false, qTimer = 0;
  function detail(i) {
    var r = D[i], g = GS[r[0]], s = SO[r[2]], u = U[g.uni];
    ctx.so = s.code; ctx.jg = ''; syncSwap('find');
    return '<div class="det"><dl>' +
      '<dt>전공 분류</dt><dd>' + esc(nm(s.path)) + ' <span class="code" style="font-size:12.5px;color:var(--dim)">' + s.code + '</span></dd>' +
      '<dt>대학원</dt><dd>' + esc(g.display) + ' · ' + esc(g.type) + (g.found ? ' · ' + g.found : '') + '</dd>' +
      (r[9] ? '<dt>단과대학</dt><dd>' + esc(r[9]) + '</dd>' : '') +
      '<dt>학위 과정</dt><dd>' + G_deg(r[4]) + ' · 수업연한 ' + r[3] + '년 · ' + esc(r[5]) + '</dd>' +
      '<dt>학과 특성</dt><dd>' + esc(r[6]) + ' · 상태 ' + esc(r[7]) + '</dd>' +
      '<dt>소재지</dt><dd>' + esc(r[10] + ' ' + r[11]) + '</dd>' +
      '<dt>공시 코드</dt><dd class="code" style="font-size:13.5px">' + esc(r[8]) + '</dd></dl>' +
      '<div class="acts"><a class="go" href="#wiki/' + s.code + '"><span>‘' + esc(soName(s)) + '’ 전공 글 읽기</span>' + ARROW + '</a>' +
      '<a class="go line" href="#gs/' + g.id + '"><span>이 대학원의 학과 ' + nf(g.depts) + '건</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div></div>';
  }
  function G_deg(bits) { var a = []; if (bits & 1) a.push('석사'); if (bits & 2) a.push('박사'); if (bits & 4) a.push('석박사통합'); if (bits & 8) a.push('학석사통합'); return a.join(' · '); }
  function pager(cur, pages) {
    if (pages <= 1) return '';
    var set = {}, i; [1, 2, pages - 1, pages, cur - 1, cur, cur + 1].forEach(function (n) { if (n >= 1 && n <= pages) set[n] = 1; });
    var nums = Object.keys(set).map(Number).sort(function (a, b) { return a - b; }), h = '<nav class="pg" aria-label="쪽 넘기기"><button type="button" data-k="p" data-v="' + (cur - 1) + '" aria-label="이전 쪽"' + (cur <= 1 ? ' disabled' : '') + '>‹</button>';
    for (i = 0; i < nums.length; i++) {
      if (i && nums[i] - nums[i - 1] > 1) h += '<span>…</span>';
      h += '<button type="button" data-k="p" data-v="' + nums[i] + '"' + (nums[i] === cur ? ' aria-current="page"' : '') + '>' + nums[i] + '</button>';
    }
    return h + '<button type="button" data-k="p" data-v="' + (cur + 1) + '" aria-label="다음 쪽"' + (cur >= pages ? ' disabled' : '') + '>›</button></nav><p class="pg-h">' + cur + ' / ' + nf(pages) + '쪽</p>';
  }

  /* ---------- 대학원 한 곳 · 대학 한 곳 ---------- */
  function back() { return '<nav class="crumbs"><a href="#find' + (lastFind ? '?' + lastFind : '') + '">‹ 대학원 찾기로</a></nav>'; }
  function vGs(g) {
    var u = U[g.uni], rows = [], by = {};
    D.forEach(function (r, i) { if (r[0] === g.i) { rows.push(i); (by[r[2]] = by[r[2]] || []).push(i); } });
    var h = '<header class="one-h">' + back() + '<h1>' + esc(g.display) + '</h1><p class="r-m">' + tyTag(g) + g.degrees.map(function (x) { return '<span class="tg">' + x + '</span>'; }).join('') +
      '<span class="loc">' + esc(g.region) + (g.found ? ' · ' + g.found : '') + ' · ' + esc(g.kind) + ' · 공시 코드 ' + esc(g.code) + '</span></p>' +
      '<div class="figs"><div><b>' + nf(g.depts) + '</b><span>개설 학과</span></div><div><b>' + Object.keys(by).length + '</b><span>전공 분류</span></div><div><b>' + nf(g.closed_depts) + '</b><span>폐지로 빠진 학과</span></div></div>' +
      (g.kind === '대학' ? '<a class="go line" href="#uni/' + u.id + '"><span>' + esc(u.name) + '의 대학원 ' + u.grad_schools + '곳 모두 보기</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' : '') + '</header>';
    Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || (a < b ? -1 : 1); }).forEach(function (code) {
      var s = SO[code];
      h += '<section class="grp"><h3>' + esc(soName(s)) + '<span class="code" style="font-size:12.5px;font-weight:500;color:var(--dim)">' + by[code].length + '건</span><a href="#wiki/' + code + '">전공 글 ⇄</a></h3>';
      by[code].forEach(function (i) {
        var r = D[i];
        h += '<div class="row"><a href="' + findHref({ so: code }) + '"><span class="r-n">' + esc(r[1]) + '</span><span class="r-s">' + (r[9] ? esc(r[9]) + ' · ' : '') + '수업연한 ' + r[3] + '년 · ' + esc(r[10] + ' ' + r[11]) + '</span>' +
          '<span class="r-m">' + degTags(r[4]) + '<span class="tg' + (r[5] !== '주간' ? ' on' : '') + '">' + r[5] + '</span>' + (r[6] !== '일반과정' ? '<span class="tg on">' + esc(r[6]) + '</span>' : '') + '</span></a></div>';
      });
      h += '</section>';
    });
    h += '<p class="note">학과 이름을 누르면 같은 전공을 개설한 다른 대학원 목록으로 넘어갑니다. 폐지 학과는 목록에 싣지 않았고 건수만 적었습니다. 대학알리미 2024-10-07 공시 기준이며, 모집 여부는 이 대학원의 모집요강으로 확인하십시오.</p>';
    page(g.display, h);
  }
  function vUni(u) {
    var list = GS.filter(function (g) { return g.uni === u.i; }).sort(function (a, b) { return 'gps'.indexOf(TYK[a.type]) - 'gps'.indexOf(TYK[b.type]) || b.depts - a.depts; });
    var h = '<header class="one-h">' + back() + '<h1>' + esc(u.name) + '</h1><p class="r-m"><span class="tg">' + esc(u.kind) + '</span><span class="loc">' + esc(u.region) + (u.found ? ' · ' + u.found : '') + '</span></p>' +
      '<div class="figs"><div><b>' + u.grad_schools + '</b><span>대학원</span></div><div><b>' + nf(u.depts) + '</b><span>개설 학과</span></div><div><b>' + list.filter(function (g) { return g.degrees.indexOf('박사') >= 0 || g.degrees.indexOf('석박사통합') >= 0; }).length + '</b><span>박사 과정이 있는 대학원</span></div></div></header><div class="rows" style="margin-top:22px">';
    list.forEach(function (g) {
      h += '<div class="row"><a href="#gs/' + g.id + '"><span class="r-n">' + esc(g.name === u.name ? g.display : g.name + (g.campus && u.name.indexOf(g.campus) < 0 ? ' (' + g.campus + ')' : '')) + '</span><span class="r-s">개설 학과 ' + nf(g.depts) + '건</span>' +
        '<span class="r-m">' + tyTag(g) + g.degrees.map(function (x) { return '<span class="tg">' + x.replace('석박사통합', '석박통합') + '</span>'; }).join('') + '<span class="loc">' + esc(g.region) + '</span></span></a></div>';
    });
    h += '</div><p class="note">캠퍼스가 따로 공시되면 별도 학교로 셉니다. 대학알리미 2024-10-07 공시 기준입니다.</p>';
    page(u.name, h);
  }

  /* ---------- 진학 가이드 ---------- */
  function qa(list, w) { return '<ul class="qa">' + list.map(function (r) { return '<li><b' + (w ? ' style="min-width:' + w + '"' : '') + '>' + esc(r[0]) + '</b>' + esc(r[1]) + '</li>'; }).join('') + '</ul>'; }
  function vGuide() {
    var h = '<div class="gd"><h1>석·박사 진학 가이드</h1><p class="lead">어느 전공에나 공통인 내용입니다. 전공마다 달라지는 점은 전공 위키의 각 글에 있습니다.</p>' + panes([
      { n: 1, title: '세 가지 대학원 트랙', keys: ['일반', '전문', '특수'], body: trackCards() + '<details class="more"><summary>구분의 근거와 수업연한</summary><div><ul class="lim">' + W.trackNotes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></details>' },
      { n: 2, title: 'BK21·TA/RA, 장학과 재정', keys: ['BK21', 'RA·TA', '연구생활장려금'], body: '<div class="fund">' + fundCards() + '</div>' },
      { n: 3, title: '진학 실익을 따지는 여섯 질문', keys: ['문턱', '비용', '기간'], body: '<p class="note" style="margin:0 0 8px">' + esc(W.roiNote) + '</p>' + qa(W.roi) },
      { n: 4, title: '준비 순서', keys: ['6~12개월 전부터'], body: timeline() },
      { n: 5, title: '지도교수 컨택', keys: ['메일', '면담에서 확인할 것'], body: '<div class="g2"><div><h3>컨택 메일</h3>' + mail() + '</div><div><h3>면담·컨택에서 확인할 것</h3><ul class="ck">' + W.prep.check.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>' },
      { n: 6, title: '서류', keys: ['계획서', '어학', '추천서'], body: qa(W.prep.docs, '7.6em') }
    ], 0) + '<p class="note">제도와 금액은 ' + esc(W.checked) + '에 확인한 내용이며 해마다 바뀝니다. <a href="#about">출처</a>의 확인처에서 다시 확인하십시오.</p></div>';
    page2('진학 가이드', h);
  }

  /* ---------- 출처와 한계 ---------- */
  function vAbout() {
    var m = G.meta, c = m.counts;
    var h = '<div class="gd"><h1>출처와 한계</h1><p class="lead">숫자와 목록이 어디에서 왔고 어디까지 믿을 수 있는지 적었습니다.</p>' + panes([
      { n: 1, title: '개설 학과 데이터', keys: ['대학알리미', '2024-10-07'], body: '<ul class="refs">' + G.sources.map(function (s) {
        return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a><small>' + esc(s.provider) + ' · 기준 ' + esc(s.basis_date) + ' · ' + esc(s.license) + '</small><small>' + esc(s.used_for) + '</small></li>';
      }).join('') + '</ul><p class="note">원자료 대학원 행 ' + nf(c.source_rows) + '건에서 폐지 학과 ' + nf(c.closed_departments_excluded) + '건을 빼고 ' + nf(c.departments) + '건을 실었습니다. 데이터셋 만든 날 ' + esc(m.built_at) + ', 판 ' + esc(m.version) + '. 구조와 만드는 법은 <a href="./data/README.md">data/README.md</a>에 있습니다. 커리어넷 학과 연결(career_majors)은 데이터에만 있고 이 화면에서는 쓰지 않습니다.</p>' },
      { n: 2, title: '상담에 쓸 때의 한계', keys: ['통계 목적 자료', '모집요강 확인'], body: '<ul class="lim">' +
        '<li><b>통계 목적 자료입니다.</b> 대학알리미는 이 학과 목록이 실제 모집·운영 학과명과 다를 수 있다고 밝힙니다. 지원 전에 모집요강을 확인합니다.</li>' +
        '<li><b>기준일은 2024-10-07입니다.</b> 그 뒤의 신설·통합·폐과는 들어 있지 않습니다.</li>' +
        '<li><b>학위 과정은 개설된 과정입니다.</b> 지금 모집 중인지는 원자료에 없습니다.</li>' +
        '<li><b>설립 구분은 2023년 공시 기준입니다.</b> 당시 자료에 없던 2곳은 비어 있습니다.</li>' +
        '<li><b>‘기타’는 표준분류의 N.C.E.(달리 분류되지 않음)입니다.</b> 융합·신설 학과가 많아 학과 이름을 직접 봐야 합니다.</li>' +
        '<li><b>분류 코드(A·M·S)는 데이터셋의 내부 식별자입니다.</b> 교육부 공식 코드가 아닙니다.</li>' +
        '<li><b>건수는 캠퍼스 단위입니다.</b> 캠퍼스가 따로 공시되면 별도 대학으로 셉니다(모교 기준 ' + nf(c.universities_base) + '곳).</li>' +
        '<li><b>지역은 학과 소재지 기준입니다.</b> 대학원 소재지와 다른 경우가 있어 학과 단위로 걸렀습니다.</li></ul>' },
      { n: 3, title: '전공 글과 제도 정보', keys: ['새로 쓴 글', '확인처 8곳'], body: '<p class="t">' + esc(W.about) + '</p><h3>확인처</h3><ul class="refs">' + W.refs.map(function (r) {
        return '<li><a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.t) + '</a><small>' + esc(r.by) + '</small></li>';
      }).join('') + '</ul><p class="note">BK21 사업 규모와 수혜 비율은 교육부 발표를 다룬 2026년 7월 보도에서, 연구생활장려금 기준금액은 과학기술정보통신부 보도자료에서 확인했습니다(' + esc(W.checked) + '). 기관명은 출처를 밝히기 위해서만 씁니다.</p>' }
    ], 0) + '</div>';
    page2('출처와 한계', h);
  }

  /* ---------- 이용 안내 접기 ---------- */
  (function () {
    var pv = d.getElementById('pv'), t = d.getElementById('pvT'), b = d.getElementById('pvB'), l = d.getElementById('pvL');
    t.addEventListener('click', function () {
      var on = !pv.classList.contains('open'); pv.classList.toggle('open', on);
      t.setAttribute('aria-expanded', String(on)); l.textContent = on ? '접기' : '펼치기';
      if (on) b.removeAttribute('inert'); else b.setAttribute('inert', '');
    });
  })();

  load();
})();
