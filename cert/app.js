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
  // 만 단위 숫자를 화면마다 수천 번 맞춘다. 같은 수는 만든 글자를 다시 쓴다(localeCompare 류 Intl 비용 제거).
  var _fmtC = {};
  function fmt(n) { var k = Number(n), v = _fmtC[k]; if (v === undefined) v = _fmtC[k] = k.toLocaleString('ko-KR'); return v; }
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
    x._stages = stagesOf(x);
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
      return '<a class="k-' + c.k + '" href="#list?c=' + c.k + '"><i aria-hidden="true"></i><span>' + esc(c.short) + '</span><b>' + fmt(c.n) + '<small>건</small></b></a>';
    }).join('');
  }

  /* ---------- 찾기 화면 ---------- */
  // 한 쪽에 보일 개수: 대학학과위키처럼 5·10·20, 기기에 기억(jc-cert-per)
  var PERS = [5, 10, 20];
  try { var sp0 = +localStorage.getItem('jc-cert-per'); if (PERS.indexOf(sp0) > -1) PER = sp0; else PER = 10; } catch (e) { PER = 10; }
  var MQ_WIDE = window.matchMedia ? window.matchMedia('(min-width:980px)') : { matches: true };
  function renderList() {
    view = 'list';
    var c = st.c ? CK[st.c] : null;
    main.innerHTML =
      (c ? '<p class="cdef k-' + c.k + '"></p>' : '') +
      '<div class="sb" id="sb">' + IC.search + '<input id="q" data-deeplink type="search" enterkeyhint="search" autocomplete="off" placeholder="자격 이름, 과목, 관련 직업으로 찾기" aria-label="자격증 찾기"><button class="clr" id="qx" type="button" aria-label="검색어 지우기">' + IC.x + '</button></div>' +
      '<p class="eg" id="eg"><span>예</span><button type="button">직업상담사</button><button type="button">데이터베이스</button><button type="button">간호</button><button type="button">ㅈㅂㅊㄹ</button></p>' +
      '<div class="fd"><aside class="fl" id="fl" data-jc-layer=".fl.open" aria-label="조건 고르기"><div class="fl-sh" id="flSh"><div class="fl-hd"><b>조건 고르기</b><button type="button" class="fl-x" id="flX" aria-label="닫기">' + IC.x + '</button></div><div class="fl-b" id="flB"></div><div class="fl-ft"><button type="button" class="reset" id="flR">모두 풀기</button><button type="button" class="fl-go" id="flGo">결과 보기</button></div></div></aside>' +
      '<section id="res" aria-live="polite"></section></div><div class="scrim" id="scrim" hidden></div>';
    var q = d.getElementById('q'); q.value = st.q;
    var tmr = 0;
    q.addEventListener('input', function () { d.getElementById('sb').classList.toggle('has', !!q.value); clearTimeout(tmr); tmr = setTimeout(function () { setState({ q: q.value.trim() }); }, 140); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') q.blur(); });
    d.getElementById('qx').addEventListener('click', function () { q.value = ''; d.getElementById('sb').classList.remove('has'); setState({ q: '' }); q.focus(); });
    d.getElementById('eg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; q.value = b.textContent; d.getElementById('sb').classList.add('has'); setState({ q: b.textContent }); });
    d.getElementById('fl').addEventListener('click', onFilter);
    d.getElementById('fl').addEventListener('change', function (e) { var s = e.target.closest('select'); if (!s) return; var o = {}; o[s.name] = s.value; setState(o); });
    d.getElementById('flX').addEventListener('click', function () { sheet(false); });
    d.getElementById('flGo').addEventListener('click', function () { sheet(false); });
    d.getElementById('flR').addEventListener('click', function () { setState({ g: '', f: '', mo: '', m: '', a: '', has: '' }); });
    d.getElementById('scrim').addEventListener('click', function () { sheet(false); });
    d.getElementById('res').addEventListener('click', function (e) {
      var pb = e.target.closest('[data-per]'); if (pb) { PER = +pb.getAttribute('data-per'); try { localStorage.setItem('jc-cert-per', String(PER)); } catch (er) {} setState({ p: 1 }); return; }
      if (e.target.closest('#flOpen')) { sheet(true); return; }
      var b = e.target.closest('[data-p]'); if (b) { setState({ p: +b.getAttribute('data-p') }); var r = d.getElementById('res'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.pageYOffset - 140)); return; }
      var x = e.target.closest('[data-un]'); if (x) { var o = {}; o[x.getAttribute('data-un')] = ''; setState(o); }
    });
    d.getElementById('sb').classList.toggle('has', !!st.q);
    updateList();
  }
  // 휴대폰: 조건은 아래에서 올라오는 시트. 넓은 화면: 왼쪽 고정 칸.
  function sheet(on) {
    var fl = d.getElementById('fl'), sc = d.getElementById('scrim'); if (!fl) return;
    if (on && MQ_WIDE.matches) return;
    fl.classList.toggle('open', on); sc.hidden = !on;
    d.documentElement.classList.toggle('jc-lock', on);
    if (on) { var x = d.getElementById('flX'); if (x) x.focus(); }
  }
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.querySelector('.fl.open')) { e.stopPropagation(); sheet(false); } }, true);
  if (MQ_WIDE.addEventListener) MQ_WIDE.addEventListener('change', function () { sheet(false); if (view === 'item') route(); });
  function onFilter(e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
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
  // 조건 묶음은 접고 펴는 칸(details). 고른 값이 있으면 제목 옆에 보이고 처음부터 펼친다.
  var fgOpen = { g: true, f: true };
  function fg(key, title, cur, inner) {
    var open = key in fgOpen ? fgOpen[key] : !!cur;
    return '<details class="fg" data-fg="' + key + '"' + (open || cur ? ' open' : '') + '><summary><b>' + title + '</b>' + (cur ? '<em>' + esc(cur) + '</em>' : '') + '</summary><div class="fg-in">' + inner + '</div></details>';
  }
  function updateList() {
    if (view !== 'list') return;
    d.body.toggleAttribute('data-home', !st.c && !st.g && !st.f && !st.mo && !st.m && !st.a && !st.has);
    tabs(st.c || 'all');
    var cdef = main.querySelector('.cdef'), c = st.c ? CK[st.c] : null;
    if (c) { if (!cdef) { cdef = d.createElement('p'); main.insertBefore(cdef, main.firstChild); } cdef.className = 'cdef k-' + c.k; cdef.innerHTML = '<b>' + esc(c.short) + '</b><span>' + esc((META.categories_definition || {})[c.key] || '') + '</span>'; }
    else if (cdef) cdef.remove();
    var keep = {}; [].forEach.call(d.querySelectorAll('#flB details[data-fg]'), function (el) { fgOpen[el.getAttribute('data-fg')] = el.open; });
    /* 조건 */
    var h = '';
    if (st.c === 'KT') { var gc = counts(st, 'g', function (x) { return x._gi > -1 ? x.grade_or_field : null; }); h += fg('g', '등급', st.g, '<div class="opts">' + GRADES.map(function (g) { return chip('g', g, g, gc[g]); }).join('') + '</div>'); }
    var fc = counts(st, 'f', function (x) { return x._fq || null; });
    h += fg('f', '연간 시행 횟수', st.f ? FQ.filter(function (f) { return f[0] === st.f; })[0][1] : '', '<div class="opts">' + FQ.map(function (f) { return chip('f', f[0], f[1], fc[f[0]]); }).join('') + '</div>');
    var mc = counts(st, 'mo', function (x) { return Object.keys(x._mo.all); }), mh = '<div class="mo">';
    for (var k = 1; k <= 12; k++) { var on = st.mo === String(k), n = mc[k] || 0; mh += '<button type="button" data-k="mo" data-v="' + k + '" aria-pressed="' + on + '"' + (!n && !on ? ' disabled' : '') + ' aria-label="' + k + '월, ' + n + '건">' + k + '월<small>' + n + '</small></button>'; }
    h += fg('mo', '시험이 있는 달', st.mo ? st.mo + '월' : '', mh + '</div>');
    h += fg('m', '소관부처', st.m, select('m', '소관부처', counts(st, 'm', function (x) { return x.ministry || null; }), '모든 부처'));
    h += fg('a', '시행처 · 자격관리자', st.a, select('a', '시행처', counts(st, 'a', function (x) { return x._ag || null; }), '모든 시행처'));
    var hc = counts(st, 'has', function (x) { return x._has ? '1' : null; });
    h += fg('has', '수록 정보', st.has ? '과목·방식 있음' : '', '<div class="opts">' + chip('has', '1', '시험과목·방식이 있는 자격만', hc['1']) + '</div>');
    d.getElementById('flB').innerHTML = h;
    d.getElementById('flB').addEventListener('toggle', function (e) { var t = e.target; if (t.matches && t.matches('details[data-fg]')) fgOpen[t.getAttribute('data-fg')] = t.open; }, true);
    var nAct = ['g', 'f', 'mo', 'm', 'a', 'has'].filter(function (k) { return st[k]; }).length;
    d.getElementById('flR').hidden = !nAct;
    /* 결과 */
    var arr = sorted(filtered(st), st), pages = Math.max(1, Math.ceil(arr.length / PER));
    if (st.p > pages) st.p = pages;
    d.getElementById('flGo').textContent = fmt(arr.length) + '건 보기';
    var cur = arr.slice((st.p - 1) * PER, st.p * PER), m = qmap(st.q);
    var act = [];
    if (st.g) act.push(['g', st.g]); if (st.f) act.push(['f', FQ.filter(function (f) { return f[0] === st.f; })[0][1]]); if (st.mo) act.push(['mo', st.mo + '월 시험']);
    if (st.m) act.push(['m', st.m]); if (st.a) act.push(['a', st.a]); if (st.has) act.push(['has', '과목·방식 있음']);
    var r = '<div class="vw"><button type="button" class="fl-t" id="flOpen">' + IC.filt + '조건' + (nAct ? '<i>' + nAct + '</i>' : '') + '</button><p class="cnt"><b>' + fmt(arr.length) + '</b>건' + (st.q ? ' · 「' + esc(st.q) + '」' : '') + '</p>' + perSel() + '</div>' +
      (act.length ? '<div class="act">' + act.map(function (a) { return '<button type="button" data-un="' + a[0] + '" aria-label="' + esc(a[1]) + ' 조건 풀기">' + esc(a[1]) + '</button>'; }).join('') + '</div>' : '');
    if (!arr.length) r += '<p class="empty">조건에 맞는 자격이 없습니다. 검색어를 줄이거나 <a href="#list' + (st.c ? '?c=' + st.c : '') + '">조건을 풀어</a> 보십시오.</p>';
    else {
      r += '<div class="rows' + (PER > 5 ? ' two' : '') + '">';
      cur.forEach(function (x) {
        var sp = x.schedule_pattern || {}, hit = m[x.id] && m[x.id].hit, gr = x._gi > -1 ? x.grade_or_field : (has(x.grade_or_field) && x.grade_or_field.length <= 10 ? x.grade_or_field : '');
        var meta = [];
        if (has(sp.frequency)) meta.push('<span class="r-f">' + esc(String(sp.frequency).replace(/\(.*\)$/, '')) + '</span>');
        var ns = x._stages.length; if (x._stages[0] && x._stages[0].k) meta.push('<span class="r-st">' + x._stages.map(function (s) { return esc(s.k.split('_')[0]); }).slice(0, 3).join('<i>›</i>') + '</span>');
        r += '<a class="row k-' + x._c + '" href="#' + x.id + '"><span class="r-n">' + hl(x.name, st.q) + (gr ? ' <span class="tg">' + esc(gr) + '</span>' : '') + '</span>' +
          '<span class="r-s"><span class="ty">' + CK[x._c].short + '</span>' + meta.join('') + '</span>' +
          (hit ? snippet(hit, st.q) : '') + (x._mo.any ? '<span class="r-m">' + strip(x._mo) + '</span>' : '') + '</a>';
      });
      r += '</div>' + pager(st.p, pages);
    }
    d.getElementById('res').innerHTML = r;
  }
  function perSel() { return '<span class="per" role="group" aria-label="한 쪽에 보일 개수"><span>보기</span>' + PERS.map(function (n) { return '<button type="button" data-per="' + n + '" aria-pressed="' + (n === PER) + '" aria-label="' + n + '개씩 보기">' + n + '</button>'; }).join('') + '</span>'; }
  function pager(p, n) {
    if (n <= 1) return '';
    var w = window.innerWidth < 400 ? 1 : 2, h = '<nav class="pg" aria-label="쪽 나누기"><button type="button" data-p="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + ' aria-label="앞 쪽">‹</button>', last = 0;
    for (var i = 1; i <= n; i++) {
      if (i === 1 || i === n || Math.abs(i - p) <= w) { if (last && i - last > 1) h += '<span>…</span>'; h += '<button type="button" data-p="' + i + '"' + (i === p ? ' aria-current="page"' : '') + '>' + i + '</button>'; last = i; }
    }
    return h + '<button type="button" data-p="' + (p + 1) + '"' + (p >= n ? ' disabled' : '') + ' aria-label="다음 쪽">›</button></nav>';
  }

  /* ---------- 시험 단계 모으기: 과목·방식·합격기준을 단계(필기·실기·면접·1차…) 하나로 묶는다 ---------- */
  function stagesOf(x) {
    var S = [], idx = {};
    function add(k) { if (!(k in idx)) { idx[k] = S.length; S.push({ k: k, subj: null, meth: null, pass: null }); } return S[idx[k]]; }
    var sj = x.subjects, em = x.exam_method;
    if (has(sj) && !Array.isArray(sj) && typeof sj === 'object') Object.keys(sj).forEach(function (k) { if (has(sj[k])) add(k).subj = flat(sj[k]); });
    if (has(em) && typeof em === 'object') Object.keys(em).forEach(function (k) { if (has(em[k])) add(k).meth = flat(em[k]).join(' / '); });
    if (Array.isArray(sj) && has(sj)) { var t = S.filter(function (s) { return !s.subj; })[0] || add(''); t.subj = flat(sj); }
    if (typeof em === 'string' && has(em)) { if (!S.length) add(''); var t2 = S.filter(function (s) { return !s.meth; })[0]; if (t2) t2.meth = em; else S[0].meth = em; }
    var rest = '';
    if (has(x.pass_criteria)) {
      var segs = passSegs(x.pass_criteria), used = false;
      segs.forEach(function (sg) {
        if (!sg[0]) { rest += (rest ? ' ' : '') + sg[1]; return; }
        var keys = sg[0].split(/[·,\s]+/), hit = false;
        S.forEach(function (s) { if (keys.indexOf(s.k) > -1 || (s.k && keys.some(function (k) { return s.k.indexOf(k) === 0; }))) { s.pass = sg[1]; hit = true; } });
        if (!hit) rest += (rest ? ' ' : '') + sg[0] + ': ' + sg[1]; else used = true;
      });
      if (!S.length && rest) { add('').pass = rest; rest = ''; }
      else if (S.length === 1 && rest && !S[0].pass) { S[0].pass = rest; rest = ''; }
    }
    S.rest = rest;
    return S;
  }
  function passSegs(s) {
    return String(s).split(/\s+-\s+(?=[^:：]{1,14}\s*[:：])/).map(function (p) {
      var m = p.trim().match(/^([^:：]{1,14}?)\s*[:：]\s*(.+)$/); return m ? [m[1].trim(), m[2].trim()] : ['', p.trim()];
    }).filter(function (p) { return p[1]; });
  }
  var STAGE_IC = {
    pen: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/>',
    hand: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a2.1 2.1 0 0 0 3 3l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
    talk: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    num: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8"/>',
    star: '<path d="m12 4 2.5 5.2 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z"/>'
  };
  function stageIc(k) {
    var p = /필기|이론|1차/.test(k) ? 'pen' : /실기|작업|실무|2차/.test(k) ? 'hand' : /면접|구술|말하기|3차/.test(k) ? 'talk' : /급|심화|기본|TOPIK/.test(k) ? 'star' : 'num';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + STAGE_IC[p] + '</svg>';
  }
  function stageName(k) { return k ? k.replace(/_/g, ' · ') : '시험'; }
  /* 시험방식 문장 → 알아보기 쉬운 꼬리표 */
  function methTags(t) {
    var o = [], m;
    if ((m = t.match(/(\d)\s*지\s*택\s*(?:일|1)/))) o.push(['ck', m[1] + '지 택1']);
    else if (/객관식|선택형|택일/.test(t)) o.push(['ck', '객관식']);
    if (/필답/.test(t)) o.push(['pen', '필답형']);
    if (/작업형/.test(t)) o.push(['hand', '작업형']);
    if (/복합형/.test(t)) o.push(['hand', '복합형']);
    if (/논술|주관식|서술/.test(t)) o.push(['pen', /논술/.test(t) ? '논술형' : '주관식']);
    if (/단답/.test(t)) o.push(['pen', '단답형']);
    if (/면접|구술/.test(t)) o.push(['talk', '면접']);
    if (/CBT|컴퓨터/.test(t)) o.push(['ck', 'CBT']);
    if ((m = t.match(/과목당\s*(\d+)\s*문항/))) o.push(['n', '과목당 ' + m[1] + '문항']);
    else if ((m = t.match(/(\d+)\s*문항/))) o.push(['n', m[1] + '문항']);
    if ((m = t.match(/(\d+)\s*시간(?:\s*(\d+)\s*분)?/))) o.push(['t', m[1] + '시간' + (m[2] ? ' ' + m[2] + '분' : '')]);
    else if ((m = t.match(/(\d+)\s*분/))) o.push(['t', m[1] + '분']);
    return o;
  }
  var TAG_IC = { ck: '<path d="m5 12 4 4 10-10"/>', pen: STAGE_IC.pen, hand: STAGE_IC.hand, talk: STAGE_IC.talk, n: '<path d="M5 7h14M5 12h14M5 17h9"/>', t: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>' };
  function tagHtml(tg) { return '<span class="mt mt-' + tg[0] + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TAG_IC[tg[0]] + '</svg>' + esc(tg[1]) + '</span>'; }
  /* 합격기준 문장 → 100점 막대 위의 눈금 */
  function gaugeOf(t) {
    t = String(t || ''); var per = t.match(/(?:과목당|매\s*과목|각\s*과목)[^0-9]{0,12}(\d{2})\s*점/), avg = t.match(/평균\s*(\d{2})\s*점/), all = t.match(/(\d{2})\s*점\s*이상/);
    if (/만점/.test(t) && !/100\s*점/.test(t)) return null;
    var a = avg ? +avg[1] : (all ? +all[1] : null), p = per ? +per[1] : null;
    if (a == null && p == null) return null;
    if (p != null && a === p && !avg) a = null;
    return { per: p, avg: a };
  }
  function gaugeHtml(g, big) {
    var h = '<div class="gauge' + (big ? ' big' : '') + '" role="img" aria-label="' + (g.per != null ? '과목당 ' + g.per + '점 이상, ' : '') + (g.avg != null ? (g.per != null ? '평균 ' : '') + g.avg + '점 이상' : '') + '"><div class="g-bar">';
    if (g.per != null) h += '<i class="g-per" style="--v:' + g.per + '"></i>';
    if (g.avg != null) h += '<i class="g-avg" style="--v:' + g.avg + '"></i>';
    h += '</div><div class="g-lab">';
    if (g.per != null) h += '<span style="--v:' + g.per + '"><b>' + g.per + '</b>과목마다</span>';
    if (g.avg != null) h += '<span class="a" style="--v:' + g.avg + '"><b>' + g.avg + '</b>' + (g.per != null ? '평균' : '이상') + '</span>';
    return h + '</div></div>';
  }
  /* 긴 글: 세 줄만 보이고 「더 읽기」 */
  function clampText(t) { return '<div class="clamp"><p class="t">' + esc(t) + '</p><button type="button" class="more-b" hidden>더 읽기</button></div>'; }
  function armClamp(root) {
    [].forEach.call(root.querySelectorAll('.clamp'), function (c) {
      var p = c.querySelector('p'), b = c.querySelector('.more-b');
      if (p.scrollHeight > p.clientHeight + 4) { b.hidden = false; b.onclick = function () { var on = c.classList.toggle('open'); b.textContent = on ? '접기' : '더 읽기'; }; }
    });
  }

  /* ---------- 자격 한 건 ---------- */
  var tabSel = 'exam';
  function renderItem(id) {
    view = 'item';
    var x = BYID[id], c = CK[x._c], sp = x.schedule_pattern || {}, miss = [], S = x._stages;
    d.body.removeAttribute('data-home'); tabs(x._c);
    var back = listHash(st);
    /* 카드 */
    var dl = '';
    if (has(x._ag)) dl += '<dt>' + (x._c === 'KN' ? '관리' : '시행') + '</dt><dd><a href="#list?a=' + encodeURIComponent(x._ag) + '">' + esc(x._ag) + '</a></dd>';
    if (has(x.ministry)) dl += '<dt>소관</dt><dd><a href="#list?m=' + encodeURIComponent(x.ministry) + '">' + esc(x.ministry) + '</a></dd>';
    if (has(x.related_law)) dl += '<dt>법령</dt><dd>' + esc(x.related_law) + '</dd>';
    var ac = x.accreditation;
    if (ac && has(ac.valid_from) && has(ac.valid_to)) {
      var today = new Date().toISOString().slice(0, 10);
      dl += '<dt>공인</dt><dd><span class="code">' + esc(ac.valid_from.slice(0, 7).replace('-', '.')) + ' ~ ' + esc(ac.valid_to.slice(0, 7).replace('-', '.')) + '</span>' + (ac.valid_to < today ? ' · 기간 지남' : '') + '</dd>';
    }
    var gr = has(x.grade_or_field) ? x.grade_or_field : '', grLong = gr.length > 40;
    var lic = '<article class="lic k-' + x._c + '"><p class="lic-top"><b>' + esc(c.short) + '</b><span class="code">' + esc(x.id) + '</span></p><span class="holo" aria-hidden="true"></span>' +
      '<div class="lic-id">' + emb(x._c) + '<div><h1>' + esc(x.name) + '</h1>' + (gr ? (grLong ? '<details class="gr-d"><summary>등급·종류 ' + gr.split(/,\s*/).length + '가지</summary><p class="gr">' + esc(gr) + '</p></details>' : '<p class="gr">' + esc(gr) + '</p>') : '') + '</div></div>' +
      (dl ? '<dl>' + dl + '</dl>' : '') + '<span class="seal2">참고용<br>REF.</span></article>';
    /* 한눈에 */
    var nSubj = flat(x.subjects).length, g0 = null;
    S.forEach(function (s) { if (!g0 && s.pass) g0 = gaugeOf(s.pass); }); if (!g0 && S.rest) g0 = gaugeOf(S.rest);
    var tiles = [];
    if (has(sp.frequency)) tiles.push(['sched', '시행', '<b>' + esc(String(sp.frequency).replace(/\(.*\)$/, '')) + '</b>' + (x._mo.any ? strip(x._mo) : '')]);
    if (S.length && (S.length > 1 || S[0].k)) tiles.push(['exam', '단계', '<b class="flow">' + S.slice(0, 3).map(function (s) { return esc(stageName(s.k).split(' · ')[0]); }).join('<i>›</i>') + (S.length > 3 ? '<i>›</i>…' : '') + '</b>']);
    if (nSubj) tiles.push(['exam', '과목', '<b>' + nSubj + '<small>개</small></b>']);
    if (g0) tiles.push(['exam', '합격선', '<b>' + (g0.avg != null ? g0.avg : g0.per) + '<small>점↑</small></b>' + gaugeHtml(g0)]);
    var glance = tiles.length ? '<div class="glance">' + tiles.map(function (t) { return '<button type="button" class="tile" data-go="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + '</button>'; }).join('') + '</div>' : '';
    /* 패널: 시험 */
    var P = {}, T = [];
    if (S.length) {
      var steps = S.length > 1 ? '<div class="steps" role="tablist" aria-label="시험 단계">' + S.map(function (s, i) {
        return '<button type="button" role="tab" class="step" data-st="' + i + '" aria-selected="' + (i === 0) + '">' + stageIc(s.k) + '<span>' + esc(stageName(s.k)) + '</span>' + (s.subj ? '<small>' + s.subj.length + '과목</small>' : '') + '</button>';
      }).join('<i class="arw" aria-hidden="true"></i>') + '</div>' : '';
      var bodies = S.map(function (s, i) {
        var b = '';
        if (s.subj) b += '<h3>과목<small>' + s.subj.length + '</small></h3><ol class="sl">' + s.subj.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>';
        if (s.meth) { var tg = methTags(s.meth); b += '<h3>방식</h3>' + (tg.length ? '<div class="mts">' + tg.map(tagHtml).join('') + '</div>' : '') + '<p class="mx">' + esc(s.meth) + '</p>'; }
        if (s.pass) { var g = gaugeOf(s.pass); b += '<h3>합격선</h3>' + (g ? gaugeHtml(g, true) : '') + '<p class="mx">' + esc(s.pass) + '</p>'; }
        return '<div class="stp' + (i === 0 ? ' on' : '') + '" data-stp="' + i + '"' + (S.length > 1 ? ' role="tabpanel"' : '') + (i ? ' hidden' : '') + '>' + (S.length === 1 && S[0].k ? '<p class="one-st">' + stageIc(S[0].k) + esc(stageName(S[0].k)) + '</p>' : '') + b + '</div>';
      }).join('');
      if (S.rest) { var gr2 = gaugeOf(S.rest); bodies += '<div class="pass-all"><h3>합격기준</h3>' + (gr2 ? gaugeHtml(gr2, true) : '') + '<p class="mx">' + esc(S.rest) + '</p></div>'; }
      P.exam = steps + '<div class="stps">' + bodies + '</div>'; T.push(['exam', '시험']);
    }
    if (!has(x.subjects)) miss.push('시험과목'); if (!has(x.exam_method)) miss.push('시험방식'); if (!has(x.pass_criteria)) miss.push('합격기준');
    /* 패널: 일정 */
    if (has(sp.frequency) || x._mo.any) {
      var cal = '';
      if (x._mo.any) {
        var head = '<div class="cal-r cal-h" aria-hidden="true"><b></b><div class="cal-g">'; for (var k = 1; k <= 12; k++) head += '<i>' + k + '</i>'; head += '</div></div>';
        var n = 0;
        cal = '<div class="cal" role="img" aria-label="' + esc(x._mo.rows.map(function (r) { return (r.lab || '시행') + ' ' + Object.keys(r.on).sort(function (a, b) { return a - b; }).join('·') + '월'; }).join(', ')) + '">' + head +
          x._mo.rows.map(function (r, ri) {
            var gg = ''; for (var k = 1; k <= 12; k++) gg += r.on[k] ? '<i class="on" style="--i:' + (n++) + '"></i>' : '<i></i>';
            return '<div class="cal-r r' + Math.min(ri, 3) + '"><b>' + esc(r.lab || '시행') + '</b><div class="cal-g">' + gg + '</div></div>';
          }).join('') + '</div>';
      } else miss.push('시행 월');
      P.sched = (has(sp.frequency) ? '<p class="freq"><b>' + esc(sp.frequency) + '</b>' + (x._c === 'KT' && x._gi > -1 ? '<span>' + esc(x.grade_or_field) + ' 등급 표준 일정</span>' : '<span>최근 공식 일정 기준</span>') + '</p>' : '') + cal +
        (has(sp.note) ? '<details class="more"><summary>이 일정의 기준</summary><p class="note">' + esc(sp.note) + '</p></details>' : '');
      T.push(['sched', '일정']);
    } else miss.push('시행 횟수·시기');
    /* 패널: 소개 — 진출은 그림 칸, 긴 글은 세 줄 */
    var intro = '';
    if (has(x.summary)) intro += '<section class="ibx"><h3><i class="ic-dot"></i>' + (x._c === 'KT' ? '왜 생겼나' : '개요') + '</h3>' + clampText(x.summary) + '</section>';
    if (has(x.duties)) intro += '<section class="ibx"><h3><i class="ic-dot"></i>하는 일</h3>' + clampText(x.duties) + '</section>';
    if (has(x.outlook)) {
      var parts = String(x.outlook).split(/\s+-\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
      var go = parts.length > 1 ? parts[0] : '', tr = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
      if (go) intro += '<section class="ibx"><h3><i class="ic-dot"></i>진출하는 곳</h3>' + placeChips(go) + '</section>';
      if (tr) intro += '<section class="ibx"><h3><i class="ic-dot"></i>전망</h3>' + clampText(tr) + '</section>';
    }
    if (has(x.acquisition_raw)) intro += '<section class="ibx"><h3><i class="ic-dot"></i>취득방법 원문 요약</h3>' + clampText(x.acquisition_raw) + '</section>';
    if (has(x.note)) intro += '<section class="ibx"><h3><i class="ic-dot"></i>덧붙임</h3><p class="t">' + esc(x.note) + '</p></section>';
    if (intro) { P.intro = '<div class="ibs">' + intro + '</div>'; T.push(['intro', '소개']); }
    /* 패널: 연결 */
    var link = '', fam = FAM[famKey(x)] || [];
    if (fam.length > 1) {
      fam = fam.slice().sort(function (a, b) { return a._gi - b._gi; });
      link += '<section class="box k-' + x._c + '"><h2>같은 종목의 등급 사다리</h2><div class="lad">' + fam.map(function (f) {
        return '<a href="#' + f.id + '"' + (f.id === x.id ? ' aria-current="page"' : '') + '>' + esc(f.name) + '<small>' + esc(f.grade_or_field) + '</small></a>';
      }).join('') + '</div></section>';
    }
    if (x._jobs.length) {
      link += '<section class="box"><h2>관련 직업<small>참고용 연결</small></h2><div class="chips">' + x._jobs.map(function (j) {
        return '<a href="../decalcomania/#' + encodeURIComponent(j.job_id) + '">' + esc(j.name) + '</a>';
      }).join('') + '</div><p class="src">자격 이름과 직업명의 낱말을 맞춘 결과입니다. 누르면 커리어데칼코마니의 직업 화면으로 갑니다.</p></section>';
    }
    var near = [];
    if (has(x.ministry)) near.push(['#list?m=' + encodeURIComponent(x.ministry), esc(x.ministry) + ' 소관', ITEMS.filter(function (y) { return y.ministry === x.ministry; }).length]);
    if (has(x._ag)) near.push(['#list?a=' + encodeURIComponent(x._ag), esc(x._ag) + (x._c === 'KN' ? ' 관리' : ' 시행'), ITEMS.filter(function (y) { return y._ag === x._ag; }).length]);
    if (x._c === 'KT' && x._gi > -1) near.push(['#list?c=KT&g=' + encodeURIComponent(x.grade_or_field), esc(x.grade_or_field) + ' 등급 전체', ITEMS.filter(function (y) { return y._c === 'KT' && y.grade_or_field === x.grade_or_field; }).length]);
    near = near.filter(function (n) { return n[2] > 1; });
    if (near.length) link += '<section class="box"><h2>이어서 찾기</h2><ul class="links">' + near.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + '<i>' + fmt(n[2]) + '건</i></a></li>'; }).join('') + '</ul></section>';
    if (link) { P.link = '<div class="lks">' + link + '</div>'; T.push(['link', '연결']); }
    /* 최하단: 미표기 안내 + 공식 주소 + 출처(접힘) */
    var urls = [];
    [x.official_url].concat(x.official_urls || []).forEach(function (u) { var s = safeUrl(u); if (s && urls.indexOf(s) < 0) urls.push(s); });
    var srcs = x.source ? Object.keys(x.source).filter(function (k) { return has(x.source[k]); }).map(function (k) { return '<li><b>' + esc(SRCLAB[k] || k) + '</b> ' + esc(x.source[k]) + '</li>'; }).join('') : '';
    var mt = '<section class="miss">' +
      (miss.length ? '<p><b>미표기 항목(' + miss.map(esc).join('·') + ')은 공공데이터·법령상 공식 근거가 확인되지 않은 정보이므로, 시행기관 공식 안내를 확인해 주세요.</b></p>'
                   : '<p><b>최근 공식 자료를 정리한 참고값입니다.</b> 접수·시험일과 바뀐 과목은 시행기관 공식 안내를 확인해 주세요.</p>') +
      urls.map(function (u, i) { return '<a class="go' + (i ? ' line' : '') + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>' + (i ? '' : '공식 안내 · ') + esc(host(u)) + '</span></a>'; }).join('') +
      (srcs ? '<details class="more src-d"><summary>이 항목의 출처</summary><ul class="srcl">' + srcs + '</ul></details>' : '') + '</section>';
    if (!P[tabSel]) tabSel = T.length ? T[0][0] : '';
    var tabsH = T.length ? '<div class="ptabs" role="tablist" aria-label="자세히 보기">' + T.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tabSel) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      T.map(function (t) { return '<div class="pane" role="tabpanel" data-pane="' + t[0] + '"' + (t[0] === tabSel ? '' : ' hidden') + '>' + P[t[0]] + '</div>'; }).join('') : '';
    main.innerHTML = '<nav class="crumbs" aria-label="위치"><a href="' + back + '">' + IC.back + '목록으로</a><span>/</span>' + esc(c.name) + (x._c === 'KT' && x._gi > -1 ? ' <span>/</span> ' + esc(x.grade_or_field) : '') + '</nav>' +
      '<div class="dt k-' + x._c + '"><div class="dt-l">' + lic + glance + '</div><div class="dt-r">' + tabsH + '</div></div>' + mt;
    main.onclick = onItemClick;
    armPane();
    window.scrollTo(0, 0);
    try { d.title = x.name + ' · 자격증 도감'; } catch (e) {}
  }
  function armPane() {
    var pane = main.querySelector('.pane:not([hidden])'); if (!pane) return;
    armClamp(pane);
    var calEl = pane.querySelector('.cal'); if (calEl) { calEl.classList.remove('run'); void calEl.offsetWidth; calEl.classList.add('run'); }
  }
  function showTab(k, scroll) {
    var bs = main.querySelectorAll('.ptabs [data-tab]'); if (!bs.length) return;
    [].forEach.call(bs, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === k)); });
    [].forEach.call(main.querySelectorAll('.pane'), function (p) { p.hidden = p.getAttribute('data-pane') !== k; });
    tabSel = k; armPane();
    if (scroll) { var t = main.querySelector('.ptabs'); if (t) { var r = t.getBoundingClientRect(); if (r.top < 120 || r.top > window.innerHeight * .6) window.scrollTo(0, Math.max(0, r.top + window.pageYOffset - 130)); } }
  }
  function onItemClick(e) {
    if (view !== 'item') return;
    var t = e.target.closest('[data-tab]'); if (t) { showTab(t.getAttribute('data-tab')); return; }
    var g = e.target.closest('[data-go]'); if (g) { showTab(g.getAttribute('data-go'), true); return; }
    var s = e.target.closest('[data-st]'); if (s) {
      var i = s.getAttribute('data-st');
      [].forEach.call(main.querySelectorAll('[data-st]'), function (b) { b.setAttribute('aria-selected', String(b === s)); });
      [].forEach.call(main.querySelectorAll('[data-stp]'), function (p) { var on = p.getAttribute('data-stp') === i; p.hidden = !on; p.classList.toggle('on', on); });
    }
  }
  // 탭 줄에서 좌우 화살표로 옮기기
  d.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('[role="tab"]'); if (!b || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    var list = [].slice.call(b.parentNode.querySelectorAll('[role="tab"]')), i = list.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1);
    if (list[i]) { list[i].focus(); list[i].click(); e.preventDefault(); }
  });
  /* 진출하는 곳: 문장에서 기관·업체 이름만 뽑아 칩으로(뽑지 못하면 세 줄 글) */
  function placeChips(t) {
    var s = String(t).replace(/\([^)]*\)/g, ',').replace(/\s등\s/g, ',').replace(/(?:등|등의|등에|등으로)?\s*(?:에|으로|로)?\s*(?:진출|취업|근무|종사|활동)[^,.]*?(?:수 있다|할 수 있으며|가능하다|가능하며|하고 있다|한다)[.]?/g, ',').replace(/이밖에|또한|그리고|그 외|및|또는|기타/g, ',');
    var bits = s.split(/[,·、ㆍ.\/]|\s-\s/).map(function (b) { return b.replace(/^[\s,]+|[\s,]+$/g, '').replace(/^(?:주로|각종|정부의|관련|일부는|이외|이밖에)\s+/, '').replace(/(?:으로도|로도|에도)$/, '').replace(/\s*(?:등|등의|에|으로|로|에서)$/, ''); })
      .filter(function (b) { return b.length >= 2 && b.length <= 16 && b.split(' ').length <= 3 && !/[다음함됨]$|있으며|할 수|수 있|이다|하며|하고|에서$|거나$|하는$|[을를]\s|[을를]$|개발$|있다|이며|으며|된다|진출|취업|근무|활동|종사|분야로$|「|의한|걸쳐/.test(b); });
    var seen = {}; bits = bits.filter(function (b) { if (seen[b]) return false; seen[b] = 1; return true; });
    if (bits.length < 2) return clampText(t);
    return '<ul class="places">' + bits.slice(0, 12).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul><details class="more"><summary>원문 문장</summary><p class="note">' + esc(t) + '</p></details>';
  }

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
