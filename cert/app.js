/*
 * 자격증 도감 · 화면 엔진
 *
 * 데이터(고치지 않고 읽기만 한다)
 *   data/certifications.json  certifications-wiki v1.0.0 · 830건(국가기술 513 · 국가전문 212 · 국가공인 민간 101 · 국가주관 능력검정 4)
 *
 * 주소
 *   #list?c=KT&g=기사&f=3&mo=5&m=고용노동부&a=한국산업인력공단&has=1&q=정보처리&p=2   찾기(조건은 모두 고를 때만)
 *   #KT-0269   자격 한 건         #about   출처와 한계
 *
 * 규칙
 *   - 값이 null이거나 비어 있는 항목은 줄을 만들지 않고 아예 뺀다. 뺀 항목 이름은 상세 맨 아래 안내 문장에만 모아 적고
 *     시행기관 공식 주소(official_url·official_urls)로 잇는다.
 *   - 외부 API·저장 없음. 조건은 주소(hash)에만 남는다(고를 때는 replaceState, 상세로 갈 때만 기록을 남긴다).
 */
(function () {
  'use strict';
  var d = document, main = d.getElementById('main');
  var CATS = [
    { k: 'KT', key: '국가기술자격', short: '국가기술', name: '국가기술자격' },
    { k: 'KP', key: '국가전문자격(면허 포함)', short: '국가전문', name: '국가전문자격(면허 포함)' },
    { k: 'KN', key: '국가공인 민간자격', short: '공인민간', name: '국가공인 민간자격' },
    { k: 'KA', key: '국가주관 능력검정', short: '능력검정', name: '국가주관 능력검정' }
  ];
  var CK = {}; CATS.forEach(function (c, i) { c.i = i; CK[c.k] = c; });
  var GRADES = ['기술사', '기능장', '기사', '산업기사', '기능사'];
  var FQ = [['1', '연 1회 이하'], ['2', '연 2회'], ['3', '연 3회'], ['4', '연 4회 이상']];
  var PER = 20;
  var EMB = {
    KT: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a2.1 2.1 0 0 0 3 3l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
    KP: '<path d="M12 3v17M6 20h12M4 7h16"/><path d="M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
    KN: '<circle cx="12" cy="9" r="6"/><path d="M8.6 13.8 7 22l5-2.8 5 2.8-1.6-8.2"/><path d="m10 9 1.4 1.4L14.2 7.6"/>',
    KA: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>'
  };
  var IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    filt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>'
  };
  var META, ITEMS = [], BYID = {}, FAM = {};
  var st = blank(), view = '', listY = 0, lastList = '';

  function blank() { return { c: '', g: '', f: '', mo: '', m: '', a: '', has: '', q: '', p: 1 }; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function has(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.some(has);
    if (typeof v === 'object') { for (var k in v) if (has(v[k])) return true; return false; }
    return true;
  }
  function flat(v) {
    if (!has(v)) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.reduce(function (a, x) { return a.concat(flat(x)); }, []);
    var out = []; for (var k in v) out = out.concat(flat(v[k])); return out;
  }
  function ko(a, b) { return a.localeCompare(b, 'ko'); }
  function fmt(n) { return Number(n).toLocaleString('ko-KR'); }
  function sq(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  /* 한글 초성 */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 44032; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i].toLowerCase(); }
    return o.replace(/\s+/g, '');
  }

  /* 시행처 표기 다듬기: 원자료 앞의 ': ', 뒤의 (www…) 주소 */
  function normAg(s) { return String(s || '').replace(/^\s*:\s*/, '').replace(/\s*\((?:https?:\/\/)?www\.[^)]*\)\s*$/i, '').trim(); }

  /* 시행 월: "4~5월·7~8월·10~11월(실기)" → 단계 '실기'에 4,5,7,8,10,11 */
  function months(sp) {
    var rows = [], idx = {};
    ((sp && sp.typical_months) || []).forEach(function (s) {
      var lab = (String(s).match(/\(([^)]+)\)\s*$/) || [])[1] || '', body = String(s).replace(/\([^)]*\)\s*$/, ''), re = /(\d{1,2})\s*(?:~\s*(\d{1,2}))?\s*월/g, m, set = [];
      while ((m = re.exec(body))) {
        var a = +m[1], b = m[2] ? +m[2] : a;
        if (a < 1 || a > 12 || b < 1 || b > 12) continue;
        for (var k = a; ; k = k % 12 + 1) { set.push(k); if (k === b) break; }
      }
      if (!set.length) return;
      if (!(lab in idx)) { idx[lab] = rows.length; rows.push({ lab: lab, on: {} }); }
      set.forEach(function (k) { rows[idx[lab]].on[k] = 1; });
    });
    var all = {}; rows.forEach(function (r) { for (var k in r.on) all[k] = 1; });
    return { rows: rows, all: all, any: rows.length > 0 };
  }
  function fqBucket(f) {
    if (!has(f)) return '';
    if (/격년/.test(f)) return '1';
    var n = +((String(f).match(/(\d+)/) || [])[1] || 0);
    if (!n) return '';
    return n <= 1 ? '1' : n === 2 ? '2' : n === 3 ? '3' : '4';
  }
  function famKey(x) { return x._c === 'KT' ? x.name.replace(/(기술사|기능장|산업기사|기사|기능사보|기능사)$/, '') : ''; }

  function prep(x) {
    x._c = String(x.id).slice(0, 2); if (!CK[x._c]) x._c = (CATS.filter(function (c) { return c.key === x.category; })[0] || CATS[0]).k;
    x._ag = normAg(x.agency);
    x._mo = months(x.schedule_pattern);
    x._fq = fqBucket(x.schedule_pattern && x.schedule_pattern.frequency);
    x._gi = GRADES.indexOf(x.grade_or_field);
    x._jobs = (x.related_jobs || []).filter(function (j) { return j && has(j.name); });
    x._has = has(x.subjects) || has(x.exam_method);
    x._cho = cho(x.name);
    x._f = [
      ['name', x.name, 100], ['grade', x.grade_or_field, 14], ['subj', flat(x.subjects).join(' · '), 12], ['jobs', x._jobs.map(function (j) { return j.name; }).join(' · '), 12],
      ['agency', x._ag, 9], ['ministry', x.ministry, 9], ['law', x.related_law, 8], ['method', flat(x.exam_method).join(' · '), 6], ['pass', x.pass_criteria, 4],
      ['duty', x.duties, 3], ['sum', x.summary, 2], ['out', x.outlook, 1]
    ].filter(function (f) { return has(f[1]); }).map(function (f) { return { k: f[0], t: String(f[1]), s: sq(f[1]), w: f[2] }; });
    var fk = famKey(x); if (fk) (FAM[fk] = FAM[fk] || []).push(x);
  }
  var FLAB = { grade: '등급', subj: '과목', jobs: '관련 직업', agency: '시행처', ministry: '소관부처', law: '법령', method: '시험방식', pass: '합격기준', duty: '직무', sum: '개요', out: '전망' };

  /* ---------- 상태 ↔ 주소 ---------- */
  function readHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (/^K[TPNA]-\d{4}$/.test(h) && BYID[h]) return { v: 'item', id: h };
    if (h === 'about') return { v: 'about' };
    var s = blank(), q = h.indexOf('?');
    if (/^list/.test(h) && q > -1) {
      h.slice(q + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i < 0) return; var k = kv.slice(0, i), v = kv.slice(i + 1);
        try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
        if (k in s) s[k] = k === 'p' ? Math.max(1, parseInt(v, 10) || 1) : v;
      });
    }
    if (s.c && !CK[s.c]) s.c = '';
    if (s.c !== 'KT') s.g = '';
    return { v: 'list', s: s };
  }
  function listHash(s) {
    var o = [];
    ['c', 'g', 'f', 'mo', 'm', 'a', 'has', 'q'].forEach(function (k) { if (s[k]) o.push(k + '=' + encodeURIComponent(s[k])); });
    if (s.p > 1) o.push('p=' + s.p);
    return '#list' + (o.length ? '?' + o.join('&') : '');
  }
  function setState(patch, keepPage) {
    for (var k in patch) st[k] = patch[k];
    if (!keepPage && !('p' in patch)) st.p = 1;
    if (st.c !== 'KT') st.g = '';
    try { history.replaceState(null, '', listHash(st)); } catch (e) { location.hash = listHash(st); }
    updateList();
  }

  /* ---------- 거르기·찾기 ---------- */
  function toks(q) { return String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean); }
  function isCho(t) { return /^[ㄱ-ㅎ]+$/.test(t); }
  function score(x, ts) {
    if (!ts.length) return { sc: 1 };
    var total = 0, hit = null;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], ts2 = t.replace(/\s+/g, ''), best = 0, bf = null;
      if (isCho(t)) { if (x._cho.indexOf(t) > -1) { best = x._cho.indexOf(t) === 0 ? 45 : 30; bf = 'name'; } }
      else for (var j = 0; j < x._f.length; j++) {
        var f = x._f[j], at = f.s.indexOf(ts2); if (at < 0) continue;
        var w = f.w; if (f.k === 'name') w = f.s === ts2 ? 160 : at === 0 ? 120 : 100;
        if (w > best) { best = w; bf = f; }
      }
      if (!best) return null;
      total += best; if (i === 0 || (hit && hit.k === 'name' && bf && bf.k !== 'name')) hit = bf;
    }
    return { sc: total, hit: hit && hit.k && hit.k !== 'name' ? hit : null };
  }
  function pass(x, s, skip) {
    if (skip !== 'c' && s.c && x._c !== s.c) return false;
    if (skip !== 'g' && s.g && x.grade_or_field !== s.g) return false;
    if (skip !== 'f' && s.f && x._fq !== s.f) return false;
    if (skip !== 'mo' && s.mo && !x._mo.all[s.mo]) return false;
    if (skip !== 'm' && s.m && x.ministry !== s.m) return false;
    if (skip !== 'a' && s.a && x._ag !== s.a) return false;
    if (skip !== 'has' && s.has && !x._has) return false;
    return true;
  }
  var qCache = { q: null, map: null };
  function qmap(q) {
    if (qCache.q === q) return qCache.map;
    var ts = toks(q), m = {};
    ITEMS.forEach(function (x) { var r = score(x, ts); if (r) m[x.id] = r; });
    qCache = { q: q, map: m }; return m;
  }
  function filtered(s, skip) {
    var m = skip === 'q' ? null : qmap(s.q);
    return ITEMS.filter(function (x) { return (!m || m[x.id]) && pass(x, s, skip); });
  }
  function sorted(arr, s) {
    var m = qmap(s.q), q = toks(s.q).length;
    return arr.slice().sort(function (a, b) {
      if (q) { var d1 = m[b.id].sc - m[a.id].sc; if (d1) return d1; }
      return (CK[a._c].i - CK[b._c].i) || ((a._gi < 0 ? 9 : a._gi) - (b._gi < 0 ? 9 : b._gi)) || ko(a.name, b.name);
    });
  }
  function counts(s, skip, fn) { var o = {}; filtered(s, skip).forEach(function (x) { var k = fn(x); if (k == null) return; [].concat(k).forEach(function (kk) { o[kk] = (o[kk] || 0) + 1; }); }); return o; }

  /* ---------- 공용 조각 ---------- */
  function hl(text, q) {
    var t = esc(text), ts = toks(q).filter(function (x) { return !isCho(x); });
    ts.forEach(function (w) {
      var e = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (!e) return;
      try { t = t.replace(new RegExp('(' + e + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>'); } catch (er) {}
    });
    return t;
  }
  function snippet(f, q) {
    var t = f.t, w = (toks(q)[0] || '').toLowerCase(), at = t.toLowerCase().indexOf(w);
    if (at < 0) at = 0;
    var a = Math.max(0, at - 22), b = Math.min(t.length, at + w.length + 40);
    return '<p class="r-x"><b>' + FLAB[f.k] + '</b>' + (a > 0 ? '…' : '') + hl(t.slice(a, b), q) + (b < t.length ? '…' : '') + '</p>';
  }
  function strip(mo) {
    if (!mo.any) return '';
    var h = '<span class="strip" role="img" aria-label="시험이 있는 달: ' + Object.keys(mo.all).sort(function (a, b) { return a - b; }).join('·') + '월">';
    for (var k = 1; k <= 12; k++) h += '<i' + (mo.all[k] ? ' class="on"' : '') + '></i>';
    return h + '</span>';
  }
  function emb(c) { return '<span class="emb" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + EMB[c] + '</svg></span>'; }
  function safeUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, ''); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
  function host(u) { return u.replace(/^https?:\/\//i, '').replace(/\/$/, ''); }

  /* ---------- 탭·첫머리 ---------- */
  function tabs(cur) {
    var h = '<a href="#list" ' + (cur === 'all' ? 'aria-current="page"' : '') + '>전체 <small>' + fmt(ITEMS.length) + '</small></a>';
    CATS.forEach(function (c) { h += '<a class="k-' + c.k + '" href="#list?c=' + c.k + '" ' + (cur === c.k ? 'aria-current="page"' : '') + '><i aria-hidden="true"></i>' + c.short + ' <small>' + fmt(c.n) + '</small></a>'; });
    h += '<a class="sm" href="#about" ' + (cur === 'about' ? 'aria-current="page"' : '') + '>출처와 한계</a>';
    d.getElementById('tabsIn').innerHTML = h;
    var a = d.querySelector('#tabsIn [aria-current]'); if (a && a.scrollIntoView && a.offsetLeft) { var box = d.getElementById('tabsIn'); box.scrollLeft = Math.max(0, a.offsetLeft - 16); }
  }
  function tally() {
    d.getElementById('heroN').textContent = fmt(ITEMS.length);
    d.getElementById('tally').innerHTML = CATS.map(function (c) {
      return '<a class="k-' + c.k + '" href="#list?c=' + c.k + '"><i aria-hidden="true"></i><span>' + esc(c.name) + '</span><b>' + fmt(c.n) + '<small>건</small></b></a>';
    }).join('');
  }

  /* ---------- 찾기 화면 ---------- */
  function renderList() {
    view = 'list';
    var c = st.c ? CK[st.c] : null;
    main.innerHTML =
      (c ? '<p class="cdef k-' + c.k + '"><b>' + esc(c.short) + '</b><span>' + esc((META.categories_definition || {})[c.key] || '') + '</span></p>' : '') +
      '<div class="sb" id="sb">' + IC.search + '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="자격 이름, 과목, 관련 직업, 시행처로 찾기" aria-label="자격증 찾기"><button class="clr" id="qx" type="button" aria-label="검색어 지우기">' + IC.x + '</button></div>' +
      '<p class="eg" id="eg">예: <button type="button">직업상담사</button><button type="button">데이터베이스</button><button type="button">간호</button><button type="button">ㅈㅂㅊㄹ</button><button type="button">국토교통부</button></p>' +
      '<div class="fd"><aside class="fl" id="fl"><button class="fl-t" id="flT" type="button" aria-expanded="false">' + IC.filt + '조건 고르기<i id="flN"></i></button><div class="fl-b" id="flB"></div></aside>' +
      '<section id="res" aria-live="polite"></section></div>';
    var q = d.getElementById('q'); q.value = st.q;
    var tmr = 0;
    q.addEventListener('input', function () { d.getElementById('sb').classList.toggle('has', !!q.value); clearTimeout(tmr); tmr = setTimeout(function () { setState({ q: q.value.trim() }); }, 140); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { q.blur(); } });
    d.getElementById('qx').addEventListener('click', function () { q.value = ''; d.getElementById('sb').classList.remove('has'); setState({ q: '' }); q.focus(); });
    d.getElementById('eg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; q.value = b.textContent; d.getElementById('sb').classList.add('has'); setState({ q: b.textContent }); });
    d.getElementById('flT').addEventListener('click', function () { var fl = d.getElementById('fl'), on = !fl.classList.contains('open'); fl.classList.toggle('open', on); this.setAttribute('aria-expanded', String(on)); });
    d.getElementById('fl').addEventListener('click', onFilter);
    d.getElementById('fl').addEventListener('change', function (e) { var s = e.target.closest('select'); if (!s) return; var o = {}; o[s.name] = s.value; setState(o); });
    d.getElementById('res').addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (b) { setState({ p: +b.getAttribute('data-p') }); var r = d.getElementById('res'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.pageYOffset - 140)); return; }
      var x = e.target.closest('[data-un]'); if (x) { var o = {}; o[x.getAttribute('data-un')] = ''; setState(o); }
    });
    d.getElementById('sb').classList.toggle('has', !!st.q);
    updateList();
  }
  function onFilter(e) {
    var b = e.target.closest('button[data-k]'); if (!b) { if (e.target.closest('.reset')) setState({ g: '', f: '', mo: '', m: '', a: '', has: '' }); return; }
    var k = b.getAttribute('data-k'), v = b.getAttribute('data-v'), o = {}; o[k] = st[k] === v ? '' : v; setState(o);
  }
  function chip(k, v, label, n) {
    var on = st[k] === v;
    return '<button type="button" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '"' + (!n && !on ? ' disabled' : '') + '>' + esc(label) + '<small>' + fmt(n || 0) + '</small></button>';
  }
  function select(name, label, cnt, all) {
    var keys = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || ko(a, b); });
    if (st[name] && keys.indexOf(st[name]) < 0) keys.unshift(st[name]);
    var h = '<select name="' + name + '" aria-label="' + label + '"><option value="">' + all + '</option>';
    keys.forEach(function (k) { h += '<option value="' + esc(k) + '"' + (st[name] === k ? ' selected' : '') + '>' + esc(k) + ' (' + fmt(cnt[k] || 0) + ')</option>'; });
    return h + '</select>';
  }
  function updateList() {
    if (view !== 'list') return;
    d.body.toggleAttribute('data-home', !st.c && !st.g && !st.f && !st.mo && !st.m && !st.a && !st.has);
    tabs(st.c || 'all');
    var cdef = main.querySelector('.cdef'), c = st.c ? CK[st.c] : null;
    if (c) { if (!cdef) { cdef = d.createElement('p'); main.insertBefore(cdef, main.firstChild); } cdef.className = 'cdef k-' + c.k; cdef.innerHTML = '<b>' + esc(c.short) + '</b><span>' + esc((META.categories_definition || {})[c.key] || '') + '</span>'; }
    else if (cdef) cdef.remove();
    /* 조건 */
    var h = '';
    if (st.c === 'KT') { var gc = counts(st, 'g', function (x) { return x._gi > -1 ? x.grade_or_field : null; }); h += '<div class="fg"><h3>등급</h3><div class="opts">' + GRADES.map(function (g) { return chip('g', g, g, gc[g]); }).join('') + '</div></div>'; }
    var fc = counts(st, 'f', function (x) { return x._fq || null; });
    h += '<div class="fg"><h3>연간 시행 횟수</h3><div class="opts">' + FQ.map(function (f) { return chip('f', f[0], f[1], fc[f[0]]); }).join('') + '</div></div>';
    var mc = counts(st, 'mo', function (x) { return Object.keys(x._mo.all); });
    h += '<div class="fg"><h3>시험이 있는 달</h3><div class="mo">';
    for (var k = 1; k <= 12; k++) { var on = st.mo === String(k), n = mc[k] || 0; h += '<button type="button" data-k="mo" data-v="' + k + '" aria-pressed="' + on + '"' + (!n && !on ? ' disabled' : '') + ' aria-label="' + k + '월, ' + n + '건">' + k + '월<small>' + n + '</small></button>'; }
    h += '</div></div>';
    h += '<div class="fg"><h3>소관부처</h3>' + select('m', '소관부처', counts(st, 'm', function (x) { return x.ministry || null; }), '모든 부처') + '</div>';
    h += '<div class="fg"><h3>시행처 · 자격관리자</h3>' + select('a', '시행처', counts(st, 'a', function (x) { return x._ag || null; }), '모든 시행처') + '</div>';
    var hc = counts(st, 'has', function (x) { return x._has ? '1' : null; });
    h += '<div class="fg"><h3>수록 정보</h3><div class="opts">' + chip('has', '1', '시험과목·방식이 있는 자격만', hc['1']) + '</div></div>';
    var nAct = ['g', 'f', 'mo', 'm', 'a', 'has'].filter(function (k) { return st[k]; }).length;
    if (nAct) h += '<button type="button" class="reset">조건 모두 풀기</button>';
    d.getElementById('flB').innerHTML = h;
    d.getElementById('flN').textContent = nAct ? nAct + '개 고름' : '';
    /* 결과 */
    var arr = sorted(filtered(st), st), pages = Math.max(1, Math.ceil(arr.length / PER));
    if (st.p > pages) st.p = pages;
    var cur = arr.slice((st.p - 1) * PER, st.p * PER), m = qmap(st.q);
    var act = [];
    if (st.g) act.push(['g', st.g]); if (st.f) act.push(['f', FQ.filter(function (f) { return f[0] === st.f; })[0][1]]); if (st.mo) act.push(['mo', st.mo + '월 시험']);
    if (st.m) act.push(['m', st.m]); if (st.a) act.push(['a', st.a]); if (st.has) act.push(['has', '과목·방식 있음']);
    var r = '<div class="vw"><p class="cnt"><b>' + fmt(arr.length) + '</b>건' + (st.q ? ' · 「' + esc(st.q) + '」' : '') + '</p>' +
      (act.length ? '<div class="act">' + act.map(function (a) { return '<button type="button" data-un="' + a[0] + '" aria-label="' + esc(a[1]) + ' 조건 풀기">' + esc(a[1]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    if (!arr.length) r += '<p class="empty">조건에 맞는 자격이 없습니다. 검색어를 줄이거나 <a href="#list' + (st.c ? '?c=' + st.c : '') + '">조건을 풀어</a> 보십시오.</p>';
    else {
      r += '<div class="rows two">';
      cur.forEach(function (x) {
        var sp = x.schedule_pattern || {}, fq = has(sp.frequency) ? '<em>' + esc(sp.frequency) + '</em>' : '', hit = m[x.id] && m[x.id].hit;
        var gr = has(x.grade_or_field) && x.grade_or_field.length <= 24 ? '<span class="tg">' + esc(x.grade_or_field) + '</span>' : '';
        r += '<a class="row k-' + x._c + '" href="#' + x.id + '"><span class="r-n">' + hl(x.name, st.q) + '</span>' +
          '<span class="r-s"><span class="ty">' + CK[x._c].short + '</span>' + gr + '<span>' + esc(x._ag) + (x.ministry ? ' · ' + esc(x.ministry) : '') + '</span></span>' +
          (hit ? snippet(hit, st.q) : '') +
          ((fq || x._mo.any) ? '<span class="r-m">' + fq + strip(x._mo) + '</span>' : '') + '</a>';
      });
      r += '</div>' + pager(st.p, pages);
    }
    d.getElementById('res').innerHTML = r;
  }
  function pager(p, n) {
    if (n <= 1) return '';
    var w = window.innerWidth < 400 ? 1 : 2, h = '<nav class="pg" aria-label="쪽 나누기"><button type="button" data-p="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + ' aria-label="앞 쪽">‹</button>', last = 0;
    for (var i = 1; i <= n; i++) {
      if (i === 1 || i === n || Math.abs(i - p) <= w) { if (last && i - last > 1) h += '<span>…</span>'; h += '<button type="button" data-p="' + i + '"' + (i === p ? ' aria-current="page"' : '') + '>' + i + '</button>'; last = i; }
    }
    return h + '<button type="button" data-p="' + (p + 1) + '"' + (p >= n ? ' disabled' : '') + ' aria-label="다음 쪽">›</button></nav>';
  }

  /* ---------- 자격 한 건 ---------- */
  function subjBlock(v, c) {
    if (Array.isArray(v)) { var l = v.filter(has); return '<div class="sj"><div><ol>' + l.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div></div>'; }
    var ks = Object.keys(v).filter(function (k) { return has(v[k]); });
    return '<div class="sj ' + (ks.length >= 3 ? 'n3' : ks.length === 2 ? 'n2' : '') + '">' + ks.map(function (k) {
      var l = flat(v[k]);
      return '<div><h3>' + esc(k.replace(/_/g, ' · ')) + (l.length > 1 ? '<small>' + l.length + '과목</small>' : '') + '</h3><ol>' + l.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    }).join('') + '</div>';
  }
  function kvBlock(v) {
    if (typeof v === 'string') return '<p class="t">' + esc(v) + '</p>';
    var ks = Object.keys(v).filter(function (k) { return has(v[k]); });
    return '<dl class="kv">' + ks.map(function (k) { return '<dt>' + esc(k.replace(/_/g, ' · ')) + '</dt><dd>' + esc(flat(v[k]).join(' / ')) + '</dd>'; }).join('') + '</dl>';
  }
  function passBlock(s) {
    var parts = String(s).split(/\s+-\s+(?=[^:：]{1,14}\s*[:：])/).map(function (p) { return p.trim(); }).filter(Boolean);
    var kv = parts.map(function (p) { var m = p.match(/^([^:：]{1,14}?)\s*[:：]\s*(.+)$/); return m ? [m[1].trim(), m[2].trim()] : null; });
    if (kv.every(Boolean)) return '<div class="pass"><dl class="kv">' + kv.map(function (a) { return '<dt>' + esc(a[0]) + '</dt><dd>' + esc(a[1]) + '</dd>'; }).join('') + '</dl></div>';
    return '<div class="pass"><p>' + esc(s) + '</p></div>';
  }
  function sec(title, inner, cls, tag) { return '<section class="sec' + (cls ? ' ' + cls : '') + '"><h2>' + esc(title) + (tag ? ' <small>' + esc(tag) + '</small>' : '') + '</h2>' + inner + '</section>'; }
  function renderItem(id) {
    view = 'item';
    var x = BYID[id], c = CK[x._c], sp = x.schedule_pattern || {}, miss = [];
    d.body.removeAttribute('data-home'); tabs(x._c);
    var back = listHash(st);
    /* 카드 */
    var dl = '';
    if (has(x._ag)) dl += '<dt>' + (x._c === 'KN' ? '자격관리자' : '시행처') + '</dt><dd><a href="#list?a=' + encodeURIComponent(x._ag) + '">' + esc(x._ag) + '</a></dd>';
    if (has(x.ministry)) dl += '<dt>소관부처</dt><dd><a href="#list?m=' + encodeURIComponent(x.ministry) + '">' + esc(x.ministry) + '</a></dd>';
    if (has(x.related_law)) dl += '<dt>근거 법령</dt><dd>' + esc(x.related_law) + '</dd>';
    var ac = x.accreditation;
    if (ac && has(ac.valid_from) && has(ac.valid_to)) {
      var prev = (ac.previous_periods || []).filter(function (p) { return p && p.from; }).length, today = new Date().toISOString().slice(0, 10);
      dl += '<dt>공인 기간</dt><dd><span class="code">' + esc(ac.valid_from) + ' ~ ' + esc(ac.valid_to) + '</span>' + (ac.valid_to < today ? ' · 이 날짜로는 공인 기간이 지났습니다' : '') + (prev ? ' · 앞선 공인 ' + prev + '회' : '') + '</dd>';
    }
    var lic = '<article class="lic k-' + x._c + '"><p class="lic-top"><b>' + esc(c.short) + '</b><span class="code">' + esc(x.id) + '</span></p><span class="holo" aria-hidden="true"></span>' +
      '<div class="lic-id">' + emb(x._c) + '<div><h1>' + esc(x.name) + '</h1>' + (has(x.grade_or_field) ? '<p class="gr">' + esc(x.grade_or_field) + '</p>' : '') + '</div></div>' +
      (dl ? '<dl>' + dl + '</dl>' : '') + '<span class="seal2">참고용<br>REF.</span></article>';
    /* 시행 패턴 */
    var s1 = '';
    if (has(sp.frequency) || x._mo.any) {
      var cal = '';
      if (x._mo.any) {
        var head = '<div class="cal-r cal-h" aria-hidden="true"><b></b><div class="cal-g">'; for (var k = 1; k <= 12; k++) head += '<i>' + k + '</i>'; head += '</div></div>';
        var n = 0;
        cal = '<div class="cal" role="img" aria-label="' + esc(x._mo.rows.map(function (r) { return (r.lab || '시행') + ' ' + Object.keys(r.on).sort(function (a, b) { return a - b; }).join('·') + '월'; }).join(', ')) + '">' + head +
          x._mo.rows.map(function (r, ri) {
            var g = ''; for (var k = 1; k <= 12; k++) g += r.on[k] ? '<i class="on" style="--i:' + (n++) + '"></i>' : '<i></i>';
            return '<div class="cal-r r' + Math.min(ri, 3) + '"><b>' + esc(r.lab || '시행') + '</b><div class="cal-g">' + g + '</div></div>';
          }).join('') + '</div>';
      } else miss.push('시행 월');
      s1 = '<section class="box s1"><h2>시행 패턴<small>최근 공식 일정 기준</small></h2>' +
        (has(sp.frequency) ? '<p class="freq"><b>' + esc(sp.frequency) + '</b>' + (x._c === 'KT' ? '<span>' + esc(x.grade_or_field) + ' 계열 표준</span>' : '') + '</p>' : '') + cal +
        (has(sp.note) ? '<p class="note">' + esc(sp.note) + '</p>' : '') + '</section>';
    } else miss.push('시행 횟수·시기');
    /* 본문 */
    var b = '';
    if (has(x.subjects)) b += sec('시험과목', subjBlock(x.subjects), '', flat(x.subjects).length + '과목'); else miss.push('시험과목');
    if (has(x.exam_method)) b += sec('시험방식', kvBlock(x.exam_method)); else miss.push('시험방식');
    if (has(x.pass_criteria)) b += sec('합격기준', passBlock(x.pass_criteria)); else miss.push('합격기준');
    if (has(x.acquisition_raw)) b += sec('취득방법 원문 요약', '<p class="t">' + esc(x.acquisition_raw) + '</p>');
    if (has(x.note)) b += sec('덧붙임', '<p class="t">' + esc(x.note) + '</p>');
    if (has(x.summary)) b += sec(x._c === 'KT' ? '자격 개요' : '개요', '<p class="t">' + esc(x.summary) + '</p>', 'fo');
    if (has(x.duties)) b += sec('수행 직무', '<p class="t">' + esc(x.duties) + '</p>', 'fo');
    if (has(x.outlook)) b += sec('진로와 전망', '<p class="t">' + esc(x.outlook) + '</p>', 'fo');
    /* 옆 칸: 사다리·관련 직업·같은 갈래 */
    var s2 = '', fam = FAM[famKey(x)] || [];
    if (fam.length > 1) {
      fam = fam.slice().sort(function (a, b) { return a._gi - b._gi; });
      s2 += '<section class="box s2 k-' + x._c + '"><h2>같은 종목의 등급 사다리</h2><div class="lad">' + fam.map(function (f) {
        return '<a href="#' + f.id + '"' + (f.id === x.id ? ' aria-current="page"' : '') + '>' + esc(f.name) + '<small>' + esc(f.grade_or_field) + '</small></a>';
      }).join('') + '</div></section>';
    }
    if (x._jobs.length) {
      s2 += '<section class="box s2"><h2>관련 직업<small>참고용 연결</small></h2><div class="chips">' + x._jobs.map(function (j) {
        return '<a href="../decalcomania/#' + encodeURIComponent(j.job_id) + '">' + esc(j.name) + (has(j.group) ? '<small>' + esc(j.group) + '</small>' : '') + '</a>';
      }).join('') + '</div><p class="src">커리어넷 직업명과 자격 이름의 낱말을 맞춘 결과입니다. 누르면 커리어데칼코마니의 직업 화면으로 갑니다.</p></section>';
    }
    var near = [];
    if (has(x.ministry)) near.push(['#list?m=' + encodeURIComponent(x.ministry), esc(x.ministry) + ' 소관 자격', ITEMS.filter(function (y) { return y.ministry === x.ministry; }).length]);
    if (has(x._ag)) near.push(['#list?a=' + encodeURIComponent(x._ag), esc(x._ag) + (x._c === 'KN' ? ' 관리 자격' : ' 시행 자격'), ITEMS.filter(function (y) { return y._ag === x._ag; }).length]);
    if (x._c === 'KT' && x._gi > -1) near.push(['#list?c=KT&g=' + encodeURIComponent(x.grade_or_field), esc(x.grade_or_field) + ' 등급 전체', ITEMS.filter(function (y) { return y._c === 'KT' && y.grade_or_field === x.grade_or_field; }).length]);
    near = near.filter(function (n) { return n[2] > 1; });
    if (near.length) s2 += '<section class="box s2"><h2>이어서 찾기</h2><ul class="links">' + near.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + '<i>' + fmt(n[2]) + '건</i></a></li>'; }).join('') + '</ul></section>';
    if (!b) b = '';
    /* 최하단: 미표기 안내 + 공식 주소 + 출처 */
    var urls = [];
    [x.official_url].concat(x.official_urls || []).forEach(function (u) { var s = safeUrl(u); if (s && urls.indexOf(s) < 0) urls.push(s); });
    var srcs = x.source ? Object.keys(x.source).filter(function (k) { return has(x.source[k]); }).map(function (k) { return '<b>' + esc(SRCLAB[k] || k) + '</b> ' + esc(x.source[k]); }).join(' · ') : '';
    var mt = '<section class="miss">' +
      (miss.length ? '<p><b>미표기 항목(' + miss.map(esc).join('·') + ')은 공공데이터·법령상 공식 근거가 확인되지 않은 정보이므로, 시행기관 공식 안내를 확인해 주세요.</b></p>'
                   : '<p><b>여기 적힌 내용은 최근 공식 자료를 정리한 참고값입니다.</b> 접수·시험일과 바뀐 과목은 시행기관 공식 안내를 확인해 주세요.</p>') +
      urls.map(function (u, i) { return '<a class="go' + (i ? ' line' : '') + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>' + (i ? '' : '시행기관 공식 안내 · ') + esc(host(u)) + '</span></a>'; }).join('') +
      (srcs ? '<p class="src">이 항목의 출처 — ' + srcs + '</p>' : '') + '</section>';
    main.innerHTML = '<nav class="crumbs" aria-label="위치"><a href="' + back + '">' + IC.back + '목록으로</a><span>/</span>' + esc(c.name) + (x._c === 'KT' && x._gi > -1 ? ' <span>/</span> ' + esc(x.grade_or_field) : '') + '</nav>' +
      '<div class="dt">' + lic + '<div class="side">' + s1 + s2 + '</div>' + (b ? '<div class="body">' + b + '</div>' : '') + mt + '</div>';
    var calEl = main.querySelector('.cal'); if (calEl) requestAnimationFrame(function () { calEl.classList.add('run'); });
    fitSide();
    window.scrollTo(0, 0);
    try { d.title = x.name + ' · 자격증 도감'; } catch (e) {}
  }
  /* 옆 칸이 화면보다 길면 붙여 두지 않는다(아래가 잘려 보이지 않게) */
  function fitSide() {
    var s = main.querySelector('.dt>.side'); if (!s) return;
    s.classList.remove('tall');
    if (getComputedStyle(s).display === 'contents') return;
    if (s.offsetHeight > window.innerHeight - 150) s.classList.add('tall');
  }
  var fitT = 0; window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fitSide, 160); });
  d.addEventListener('jc-immersive', function () { setTimeout(fitSide, 60); });
  var SRCLAB = { primary: '기본 자료', listing: '종목 목록', ministry: '주무부처', schedule: '일정', license: '이용 조건', subjects: '과목', exam_method: '시험방식', pass_criteria: '합격기준', duty: '직무', exam_rule: '시험 규정', frequency: '시행 횟수' };

  /* ---------- 출처와 한계 ---------- */
  function renderAbout() {
    view = 'about'; d.body.removeAttribute('data-home'); tabs('about');
    var m = META, h = '<div class="ab"><h1>출처와 한계</h1><p class="lead">이 도감은 공공데이터포털에서 인증키 없이 내려받을 수 있는 파일데이터를 정제하고, 데이터에 없는 시험과목·시험방식·시행 주기만 법령과 시행기관의 공개 사실 정보로 채운 자료(certifications-wiki v' + esc(m.version || '') + ', ' + esc(m.enriched_at || m.generated_at || '') + ')를 그대로 읽어 보여 줍니다. 확인하지 못한 값은 화면에 싣지 않았습니다.</p>';
    h += '<h2>4대 분류와 채움 현황</h2><div class="cats">' + CATS.map(function (c) {
      var l = ITEMS.filter(function (x) { return x._c === c.k; }), N = l.length || 1;
      var bars = [['시험과목', function (x) { return has(x.subjects); }], ['시험방식', function (x) { return has(x.exam_method); }], ['합격기준', function (x) { return has(x.pass_criteria); }], ['시행 횟수', function (x) { return has(x.schedule_pattern && x.schedule_pattern.frequency); }]].map(function (b) {
        var n = l.filter(b[1]).length; return '<div><span>' + b[0] + '</span><u><s style="transform:scaleX(' + (n / N).toFixed(3) + ')"></s></u><em>' + n + '</em></div>';
      }).join('');
      return '<a class="k-' + c.k + '" href="#list?c=' + c.k + '"><h3>' + esc(c.name) + '<b>' + fmt(l.length) + '</b></h3><p>' + esc((m.categories_definition || {})[c.key] || '') + '</p><div class="fill" aria-label="항목별 채운 건수">' + bars + '</div></a>';
    }).join('') + '</div>';
    var sr = m.sources || {};
    h += '<h2>원자료(공공데이터포털 파일데이터)</h2><table class="tbl"><thead><tr><th>번호</th><th>데이터셋</th><th>이용 조건</th></tr></thead><tbody>' + Object.keys(sr).map(function (k) {
      var s = sr[k], u = safeUrl(s.url);
      return '<tr><td class="code">' + esc(k) + '</td><td>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name || k) + '</a>' : esc(s.name || k)) + '</td><td>' + esc(s.license || '') + '</td></tr>';
    }).join('') + '</tbody></table>';
    var en = m.enrichment_sources || {};
    if (Object.keys(en).length) h += '<h2>빈 항목을 채운 공식 출처</h2><ul class="lim">' + Object.keys(en).map(function (k) { return '<li><b>' + esc(k) + '</b> — ' + esc(en[k]) + '</li>'; }).join('') + '</ul>';
    var sb = m.schedule_basis || {};
    if (Object.keys(sb).length) h += '<h2>시행 패턴의 기준</h2><ul class="lim">' + Object.keys(sb).map(function (k) { return '<li><b>' + esc(k) + '</b> — ' + esc(sb[k]) + '</li>'; }).join('') + '</ul>';
    h += '<h2>한계와 주의</h2><ul class="lim">' + (m.limitations || []).map(function (s) { return '<li>' + esc(String(s).replace(/\bnull\b/g, '빈 값')) + '</li>'; }).join('') +
      '<li>국가기술자격의 시행 패턴은 등급(계열) 표준 일정입니다. 종목별 실제 회차는 Q-net 회별 시행종목에서 확인해야 합니다.</li>' +
      '<li>관련 직업은 830건 가운데 ' + ITEMS.filter(function (x) { return x._jobs.length; }).length + '건만 이어져 있습니다. 자격 이름과 직업명이 구조적으로 달라 연결이 적으며, 진로를 단정하지 않는 참고용입니다.</li>' +
      '<li>시행처 이름 앞뒤에 붙은 기호나 주소는 화면에서만 다듬어 묶었고, 원자료의 홈페이지 주소 표기(오탈자로 보이는 것 포함)는 그대로 두었습니다.</li></ul>';
    h += '<h2>저작권과 이용</h2><ul class="lim"><li>' + esc(m.license_note || '') + '</li><li>법령의 조문과 별표는 저작권법 제7조에 따라 보호 대상이 아닙니다. 시험 일정·검정 횟수는 공공기관이 공개한 사실 정보입니다.</li><li>기관 이름은 시행처를 알리려고 적었을 뿐이며, 이 화면은 어떤 기관의 공식 자료도 아닙니다.</li></ul></div>';
    main.innerHTML = h; window.scrollTo(0, 0);
  }

  /* ---------- 길잡이 ---------- */
  function route() {
    var r = readHash();
    if (view === 'list' && r.v !== 'list') { listY = window.pageYOffset; lastList = listHash(st); }
    if (r.v === 'item') { renderItem(r.id); return; }
    try { d.title = '자격증 도감 · 4대 분류 자격증 위키'; } catch (e) {}
    if (r.v === 'about') { renderAbout(); return; }
    var wasList = view === 'list', from = view;
    st = r.s;
    if (!wasList) { renderList(); if (from === 'item' && listHash(st) === lastList) window.scrollTo(0, listY); else if (from) window.scrollTo(0, 0); }
    else { var q = d.getElementById('q'); if (q && q.value !== st.q) q.value = st.q; updateList(); }
  }

  function load() {
    fetch('./data/certifications.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (D) {
      META = D.metadata || {}; ITEMS = D.items || [];
      ITEMS.forEach(function (x) { BYID[x.id] = x; prep(x); });
      CATS.forEach(function (c) { c.n = ITEMS.filter(function (x) { return x._c === c.k; }).length; });
      tally(); route();
      window.addEventListener('hashchange', route);
    }).catch(function () {
      main.innerHTML = '<p class="empty">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주십시오.</p>';
    });
  }

  /* 이용 안내 접고 펴기 */
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
