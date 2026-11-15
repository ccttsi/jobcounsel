/*
 * 기업 명함첩 · 화면 엔진
 *
 * 데이터(고치지 않고 읽기만 한다)
 *   data/companies.json  company-wiki v1.0.0 · 7,822곳(대기업 3,521 · 중견기업 3,946 · 공공기관 355)
 *
 * 주소
 *   #list?c=ENT&g=삼성&k=C&ct=일반회사&ls=1&t=…&mi=…&sd=…&ve=…&rv=1&em=2&in=…&o=emp&q=하이닉스&p=2   찾기(조건은 고를 때만)
 *   #ENT-1301110006246 · #MID-1058639463 · #PUB-C0247   한 곳            #about   출처와 한계
 *
 * 규칙
 *   - 레코드에 없는 항목(키 생략)은 줄을 만들지 않는다. 매출·직원수·자산이 0이면 "원자료에 값이 없거나 0"이라 싣지 않는다.
 *     상세 맨 아래에 미표기 안내 한 문장과, 있으면 공식 홈페이지(official_url)를 둔다.
 *   - 7,822건을 한 번에 그리지 않는다: 찾기 열쇠를 불러올 때 한 번 만들고, 목록은 20개씩 쪽 나누기.
 *   - 외부 API·저장 없음. 조건은 주소(hash)에만 남는다(고를 때는 replaceState, 상세로 갈 때만 기록을 남긴다).
 */
(function () {
  'use strict';
  var d = document, main = d.getElementById('main');
  var CATS = [
    { k: 'ENT', key: '대기업', name: '대기업', unit: '곳', src: 'FTC',
      def: '공정거래위원회가 2026-05-01 지정한 공시대상기업집단 102곳의 소속회사입니다. 매출·종업원수·자산총액은 2025년 결산 값입니다.' },
    { k: 'MID', key: '중견기업', name: '중견기업', unit: '곳', src: 'MME',
      def: '중견기업정보마당에 공개된 중견기업 확인서 발급기업 가운데 2026-11-16 기준 유효한 확인서를 가진 기업입니다. 공개 항목은 이름·사업자등록번호·확인서 정보뿐입니다.' },
    { k: 'PUB', key: '공공기관', name: '공공기관', unit: '곳', src: 'ALIO',
      def: '알리오에 공시되는 지정 공공기관 전체입니다. 직원수는 정원(임직원 총계), 매출은 2025년 결산 값입니다.' }
  ];
  var CK = {}, CN = {}; CATS.forEach(function (c, i) { c.i = i; CK[c.k] = c; CN[c.key] = c; });
  /* 한국표준산업분류(KSIC) 대분류 */
  var KSIC = {
    A: ['농림어업', '농업, 임업 및 어업'], B: ['광업', '광업'], C: ['제조', '제조업'], D: ['전기·가스', '전기, 가스, 증기 및 공기 조절 공급업'],
    E: ['수도·환경', '수도, 하수 및 폐기물 처리, 원료 재생업'], F: ['건설', '건설업'], G: ['도소매', '도매 및 소매업'], H: ['운수·창고', '운수 및 창고업'],
    I: ['숙박·음식', '숙박 및 음식점업'], J: ['정보통신', '정보통신업'], K: ['금융·보험', '금융 및 보험업'], L: ['부동산', '부동산업'],
    M: ['전문·과학기술', '전문, 과학 및 기술 서비스업'], N: ['사업지원·임대', '사업시설 관리, 사업 지원 및 임대 서비스업'], O: ['공공행정', '공공 행정, 국방 및 사회보장 행정'],
    P: ['교육', '교육 서비스업'], Q: ['보건·복지', '보건업 및 사회복지 서비스업'], R: ['예술·여가', '예술, 스포츠 및 여가관련 서비스업'],
    S: ['협회·수리·개인', '협회 및 단체, 수리 및 기타 개인 서비스업'], T: ['가구 내 고용', '가구 내 고용활동 및 달리 분류되지 않은 자가 소비 생산활동'], U: ['국제기관', '국제 및 외국기관']
  };
  var PUBT = ['공기업(시장형)', '공기업(준시장형)', '준정부기관(기금관리형)', '준정부기관(위탁집행형)', '기타공공기관'];
  var RV = [['1', '1조 원 이상', 1e12, Infinity], ['2', '1천억~1조', 1e11, 1e12], ['3', '100억~1천억', 1e10, 1e11], ['4', '100억 미만', 1, 1e10]];
  var EM = [['1', '1만 명 이상', 1e4, Infinity], ['2', '1천~1만', 1e3, 1e4], ['3', '100~1천', 100, 1e3], ['4', '100명 미만', 1, 100]];
  var SORTS = [['emp', '직원 많은 순'], ['ast', '자산 큰 순'], ['old', '설립 오래된 순'], ['new', '설립 최근 순'], ['name', '이름순']];
  var PER = 20;
  var IC = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    filt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>'
  };
  var KEYS = ['c', 'g', 'k', 'ct', 'ls', 't', 'mi', 'sd', 've', 'rv', 'em', 'in', 'o', 'q'];
  var FKEYS = ['g', 'k', 'ct', 'ls', 't', 'mi', 'sd', 've', 'rv', 'em', 'in'];
  var META, ITEMS = [], BYID = {}, GRP = {}, SAME = {}, DIST = {}, SRC = {};
  var st = blank(), view = '', listY = 0, lastList = '';
  var TODAY = (function () { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); })();

  function blank() { var s = { p: 1 }; KEYS.forEach(function (k) { s[k] = ''; }); return s; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function has(v) { return v != null && (typeof v !== 'string' || v.trim() !== ''); }
  function num(v) { return typeof v === 'number' && isFinite(v) && v !== 0; } // 0은 "값이 없거나 0"
  function ko(a, b) { return a.localeCompare(b, 'ko'); }
  function fmt(n) { return Number(n).toLocaleString('ko-KR'); }

  /* ---------- 찾기용 정규화 ---------- */
  // search_name과 같은 규칙: (주)·주식회사·(유) 등 법인 표기, 공백·기호를 빼고 소문자
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\(\s*(주|유|재|사|합|사단|재단|학)\s*\)|㈜|주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인/g, '')
      .replace(/[\s\-_.,·ㆍ()\[\]{}&/'"’`~!@#$%^*+=:;<>?|\\]+/g, '');
  }
  // 로마자는 한글 이름 표기로도 찾는다: sk하이닉스 → 에스케이하이닉스, lg → 엘지
  var LAT = { a: '에이', b: '비', c: '씨', d: '디', e: '이', f: '에프', g: '지', h: '에이치', i: '아이', j: '제이', k: '케이', l: '엘', m: '엠', n: '엔', o: '오', p: '피', q: '큐', r: '알', s: '에스', t: '티', u: '유', v: '브이', w: '더블유', x: '엑스', y: '와이', z: '지' };
  function hangulize(s) { return s.replace(/[a-z]/g, function (c) { return LAT[c]; }); }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 44032; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; }
    return o;
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* ---------- 숫자 읽기 ---------- */
  function won(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '', t;
    if (a >= 1e12) t = (a / 1e12).toFixed(a >= 1e14 ? 0 : 1).replace(/\.0$/, '') + '조';
    else if (a >= 1e8) t = fmt(Math.round(a / 1e8)) + '억';
    else if (a >= 1e4) t = fmt(Math.round(a / 1e4)) + '만';
    else t = fmt(a);
    return s + t + ' 원';
  }
  function wonFull(n) {
    var a = Math.abs(n), p = [], jo = Math.floor(a / 1e12), eok = Math.floor(a % 1e12 / 1e8), man = Math.floor(a % 1e8 / 1e4), r = a % 1e4;
    if (jo) p.push(fmt(jo) + '조'); if (eok) p.push(fmt(eok) + '억'); if (man) p.push(fmt(man) + '만'); if (r) p.push(fmt(r));
    return (n < 0 ? '−' : '') + (p.join(' ') || '0') + '원';
  }
  function wonShort(n) { var a = Math.abs(n), s = n < 0 ? '−' : ''; return s + (a >= 1e12 ? (a / 1e12).toFixed(1).replace(/\.0$/, '') + '조' : a >= 1e8 ? fmt(Math.round(a / 1e8)) + '억' : fmt(Math.round(a / 1e4)) + '만'); }
  function ppl(n) { return n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만 명' : fmt(n) + '명'; }
  function bucket(v, B) { if (!num(v) || v < 0) return ''; for (var i = 0; i < B.length; i++) if (v >= B[i][2] && v < B[i][3]) return B[i][0]; return ''; }

  /* ---------- 불러온 뒤 한 번 ---------- */
  function prep(x) {
    x._c = String(x.id).slice(0, 3); if (!CK[x._c]) x._c = (CN[x.category] || CATS[0]).k;
    x._rev = num(x.revenue) ? x.revenue : null;
    x._emp = num(x.employees) ? x.employees : null;
    x._ast = num(x.total_assets) ? x.total_assets : null;
    x._grp = has(x.group) ? x.group.split(/\s*\/\s*/).filter(Boolean) : [];
    x._k = has(x.ksic_code) && KSIC[x.ksic_code.charAt(0)] ? x.ksic_code.charAt(0) : '';
    x._rb = bucket(x._rev, RV); x._eb = bucket(x._emp, EM);
    x._ve = x._c === 'MID' && has(x.certificate_valid) ? (String(x.certificate_valid).match(/(\d{4}-\d{2}-\d{2})\s*$/) || [])[1] || '' : '';
    var sn = has(x.search_name) ? x.search_name : norm(x.name);
    x._n = sn; x._cho = cho(sn);
    x._id = digits(x.biz_no) + ' ' + digits(x.corp_reg_no) + ' ' + digits(x.certificate_no);
    // 찾기 열쇠: [낱말, 무게, 이름표]
    x._f = [];
    function add(k, v, w) { if (has(v)) x._f.push({ k: k, t: String(v), s: norm(v), w: w }); }
    add('group', x.group, 34); add('ind', x.industry, 14); add('min', x.ministry, 14); add('type', x._c === 'PUB' ? x.sub_category : '', 12);
    add('ceo', x.ceo, 7); add('hq', x.headquarters, 6); add('sum', x._c === 'PUB' ? x.business_summary : '', 2);
    (SAME[x._c + '|' + sn] = SAME[x._c + '|' + sn] || []).push(x);
    x._grp.forEach(function (g) { (GRP[g] = GRP[g] || []).push(x); });
  }
  // 분류별 규모 분포: 로그 눈금 24칸 + 순위
  function dist() {
    CATS.forEach(function (c) {
      ['_rev', '_emp', '_ast'].forEach(function (f) {
        var arr = ITEMS.filter(function (x) { return x._c === c.k && x[f] > 0; }).sort(function (a, b) { return b[f] - a[f]; });
        if (arr.length < 8) return;
        var lo = Math.log10(arr[arr.length - 1][f]), hi = Math.log10(arr[0][f]), bins = [], N = 24, w = (hi - lo) / N || 1;
        for (var i = 0; i < N; i++) bins.push(0);
        arr.forEach(function (x, i) {
          var b = Math.min(N - 1, Math.floor((Math.log10(x[f]) - lo) / w)); bins[b]++;
          x[f + 'R'] = (i > 0 && arr[i - 1][f] === x[f]) ? arr[i - 1][f + 'R'] : i + 1; x[f + 'B'] = b;
        });
        DIST[c.k + f] = { n: arr.length, lo: arr[arr.length - 1][f], hi: arr[0][f], bins: bins, max: Math.max.apply(null, bins), loL: lo, w: w };
      });
    });
  }

  /* ---------- 상태 ↔ 주소 ---------- */
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) {}
    if (/^(ENT|MID|PUB)-/.test(h) && BYID[h]) return { v: 'item', id: h };
    if (h === 'about') return { v: 'about' };
    var s = blank(), q = h.indexOf('?');
    if (/^list/.test(h) && q > -1) {
      h.slice(q + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i < 0) return; var k = kv.slice(0, i), v = kv.slice(i + 1);
        try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
        if (k in s) s[k] = k === 'p' ? Math.max(1, parseInt(v, 10) || 1) : v;
      });
    }
    return { v: 'list', s: fix(s) };
  }
  // 분류에 맞지 않는 조건은 버린다
  function fix(s) {
    if (s.c && !CK[s.c]) s.c = '';
    if (s.c !== 'ENT') { s.g = ''; s.k = ''; s.ct = ''; s.ls = ''; s.in = ''; }
    if (s.c !== 'PUB') { s.t = ''; s.mi = ''; s.sd = ''; }
    if (s.c !== 'MID') s.ve = '';
    if (s.c === 'MID') { s.rv = ''; s.em = ''; }
    return s;
  }
  function listHash(s) {
    var o = [];
    KEYS.forEach(function (k) { if (s[k]) o.push(k + '=' + encodeURIComponent(s[k])); });
    if (s.p > 1) o.push('p=' + s.p);
    return '#list' + (o.length ? '?' + o.join('&') : '');
  }
  function setState(patch) {
    for (var k in patch) st[k] = patch[k];
    if (!('p' in patch)) st.p = 1;
    fix(st);
    try { history.replaceState(null, '', listHash(st)); } catch (e) { location.hash = listHash(st); }
    updateList();
  }

  /* ---------- 거르기·찾기 ---------- */
  function toks(q) { return String(q || '').trim().toLowerCase().split(/\s+/).map(function (t) { return { raw: t, n: norm(t), h: hangulize(norm(t)), d: /^[\d-]{5,}$/.test(t) ? digits(t) : '' }; }).filter(function (t) { return t.n || t.d; }); }
  function isCho(t) { return /^[ㄱ-ㅎ]+$/.test(t); }
  function score(x, ts) {
    if (!ts.length) return { sc: 1 };
    var total = 0, hit = null;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], best = 0, bf = null;
      if (t.d) { if (x._id.indexOf(t.d) > -1) { best = 150; bf = { k: 'idno' }; } }
      else if (isCho(t.n)) { var ci = x._cho.indexOf(t.n); if (ci > -1) { best = ci === 0 ? 60 : 40; bf = { k: 'name' }; } }
      else {
        [t.n, t.h].forEach(function (w, wi) {
          if (!w || (wi && w === t.n)) return;
          var at = x._n.indexOf(w);
          if (at > -1) { var sc = x._n === w ? 200 : at === 0 ? 150 : 110; if (sc > best) { best = sc; bf = { k: 'name' }; } }
          for (var j = 0; j < x._f.length; j++) { var f = x._f[j]; if (f.w > best && f.s.indexOf(w) > -1) { best = f.w; bf = f; } }
        });
      }
      if (!best) return null;
      total += best; if (!hit || (hit.k === 'name' && bf.k !== 'name')) hit = bf;
    }
    // 같은 점수면 큰 곳이 먼저
    return { sc: total, hit: hit && hit.t ? hit : null };
  }
  function pass(x, s, skip) {
    if (skip !== 'c' && s.c && x._c !== s.c) return false;
    if (skip !== 'g' && s.g && x._grp.indexOf(s.g) < 0) return false;
    if (skip !== 'k' && s.k && x._k !== s.k) return false;
    if (skip !== 'in' && s.in && x.industry !== s.in) return false;
    if (skip !== 'ct' && s.ct && x.corp_type !== s.ct) return false;
    if (skip !== 'ls' && s.ls && !has(x.listed_date)) return false;
    if (skip !== 't' && s.t && x.sub_category !== s.t) return false;
    if (skip !== 'mi' && s.mi && x.ministry !== s.mi) return false;
    if (skip !== 'sd' && s.sd && x.location_sido !== s.sd) return false;
    if (skip !== 've' && s.ve && x._ve.slice(0, 7) !== s.ve) return false;
    if (skip !== 'rv' && s.rv && x._rb !== s.rv) return false;
    if (skip !== 'em' && s.em && x._eb !== s.em) return false;
    return true;
  }
  var qCache = { q: null, map: null };
  function qmap(q) {
    if (qCache.q === q) return qCache.map;
    var ts = toks(q), m = null;
    if (ts.length) { m = {}; for (var i = 0; i < ITEMS.length; i++) { var r = score(ITEMS[i], ts); if (r) m[ITEMS[i].id] = r; } }
    qCache = { q: q, map: m }; return m;
  }
  function filtered(s, skip) {
    var m = skip === 'q' ? null : qmap(s.q), out = [];
    for (var i = 0; i < ITEMS.length; i++) { var x = ITEMS[i]; if ((!m || m[x.id]) && pass(x, s, skip)) out.push(x); }
    return out;
  }
  function cmpNum(f, dir) {
    return function (a, b) {
      var va = a[f], vb = b[f];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (vb - va);
    };
  }
  function sorted(arr, s) {
    var m = qmap(s.q), byQ = !!m && !s.o, f;
    if (s.o === 'name') f = function (a, b) { return ko(a._n, b._n); };
    else if (s.o === 'emp') f = cmpNum('_emp', 1);
    else if (s.o === 'ast') f = cmpNum('_ast', 1);
    else if (s.o === 'old') f = cmpNum('established_year', -1);
    else if (s.o === 'new') f = cmpNum('established_year', 1);
    else f = cmpNum('_rev', 1);
    return arr.slice().sort(function (a, b) {
      if (byQ) { var d1 = m[b.id].sc - m[a.id].sc; if (d1) return d1; }
      return f(a, b) || cmpNum('_emp', 1)(a, b) || ko(a._n, b._n);
    });
  }
  function counts(s, skip, fn) {
    var o = {}, l = filtered(s, skip);
    for (var i = 0; i < l.length; i++) { var k = fn(l[i]); if (k == null || k === '') continue; [].concat(k).forEach(function (kk) { o[kk] = (o[kk] || 0) + 1; }); }
    return o;
  }

  /* ---------- 공용 조각 ---------- */
  function hl(text, q) {
    var t = esc(text), ts = String(q || '').trim().split(/\s+/).filter(function (w) { return w && !isCho(w) && !/^[\d-]{5,}$/.test(w); });
    ts.forEach(function (w) {
      var e = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (!e) return;
      try { t = t.replace(new RegExp('(' + e + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>'); } catch (er) {}
    });
    return t;
  }
  var FLAB = { group: '기업집단', ind: '업종', min: '주무부처', type: '기관 유형', ceo: '대표자', hq: '소재지', sum: '하는 일' };
  function snippet(f, q) {
    var t = f.t, w = (String(q || '').trim().split(/\s+/)[0] || '').toLowerCase(), at = t.toLowerCase().indexOf(w);
    if (at < 0) at = 0;
    var a = Math.max(0, at - 20), b = Math.min(t.length, at + w.length + 40);
    return '<p class="r-x"><b>' + FLAB[f.k] + '</b>' + (a > 0 ? '…' : '') + hl(t.slice(a, b), q) + (b < t.length ? '…' : '') + '</p>';
  }
  function safeUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, ''); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
  function host(u) { return u.replace(/^https?:\/\//i, '').replace(/\/$/, ''); }
  function initial(x) { var s = String(x._n || x.name).replace(/^(재|사)(?=[가-힣]{3})/, ''); var m = s.match(/[가-힣a-z0-9]/i); return m ? m[0].toUpperCase() : '·'; }
  function lineOf(x) {
    if (x._c === 'ENT') return [x.group, x.industry].filter(has).join(' · ');
    if (x._c === 'PUB') return [x.sub_category, x.ministry].filter(has).join(' · ');
    return '중견기업 확인서 발급기업';
  }

  /* ---------- 탭·첫머리 ---------- */
  function tabs(cur) {
    var h = '<a href="#list" ' + (cur === 'all' ? 'aria-current="page"' : '') + '>전체 <small>' + fmt(ITEMS.length) + '</small></a>';
    CATS.forEach(function (c) { h += '<a class="k-' + c.k + '" href="#list?c=' + c.k + '" ' + (cur === c.k ? 'aria-current="page"' : '') + '><i aria-hidden="true"></i>' + c.name + ' <small>' + fmt(c.n) + '</small></a>'; });
    h += '<a class="sm" href="#about" ' + (cur === 'about' ? 'aria-current="page"' : '') + '>출처와 한계</a>';
    var box = d.getElementById('tabsIn'); box.innerHTML = h;
    var a = box.querySelector('[aria-current]'); if (a && a.offsetLeft) box.scrollLeft = Math.max(0, a.offsetLeft - 16);
  }
  function album() {
    d.getElementById('heroN').textContent = fmt(ITEMS.length);
    var line = {
      ENT: '공시대상기업집단 ' + Object.keys(GRP).length + '곳 소속회사',
      MID: '유효한 중견기업 확인서 발급기업',
      PUB: '알리오 지정 공공기관 ' + PUBT.length + '개 유형'
    };
    var el = d.getElementById('album'), h = '';
    CATS.forEach(function (c) {
      h += '<a class="bc k-' + c.k + '" href="#list?c=' + c.k + '" data-jc-ignore><p class="nm"><span>' + esc(c.name) + '</span><span class="ct">' + fmt(c.n) + '<small>곳</small></span></p>' +
        '<p class="bc-top"><b>' + c.k + '</b><span>' + esc(c.src) + '</span></p><p class="ln">' + esc(line[c.k]) + '</p></a>';
    });
    el.insertAdjacentHTML('afterbegin', h);
  }

  /* ---------- 찾기 화면 ---------- */
  var EG = ['삼성전자', 'sk하이닉스', '한국전력', '건강보험', '카카오', 'ㅎㄱㄷㄹ'];
  function renderList() {
    view = 'list';
    main.innerHTML =
      '<div class="sb" id="sb">' + IC.search + '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="기업·기관 이름, 기업집단, 업종, 주무부처로 찾기" aria-label="기업 찾기"><button class="clr" id="qx" type="button" aria-label="검색어 지우기">' + IC.x + '</button></div>' +
      '<p class="eg" id="eg">예: ' + EG.map(function (e) { return '<button type="button">' + esc(e) + '</button>'; }).join('') + '</p>' +
      '<div class="fd"><aside class="fl" id="fl"><button class="fl-t" id="flT" type="button" aria-expanded="false">' + IC.filt + '조건 고르기<i id="flN"></i></button><div class="fl-b" id="flB"></div></aside>' +
      '<section id="res" aria-live="polite"></section></div>';
    var q = d.getElementById('q'); q.value = st.q;
    var tmr = 0;
    q.addEventListener('input', function () { d.getElementById('sb').classList.toggle('has', !!q.value); clearTimeout(tmr); tmr = setTimeout(function () { setState({ q: q.value.trim() }); }, 160); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') q.blur(); });
    d.getElementById('qx').addEventListener('click', function () { q.value = ''; d.getElementById('sb').classList.remove('has'); setState({ q: '' }); q.focus(); });
    d.getElementById('eg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; q.value = b.textContent; d.getElementById('sb').classList.add('has'); setState({ q: b.textContent }); });
    d.getElementById('flT').addEventListener('click', function () { var fl = d.getElementById('fl'), on = !fl.classList.contains('open'); fl.classList.toggle('open', on); this.setAttribute('aria-expanded', String(on)); });
    d.getElementById('fl').addEventListener('click', onFilter);
    d.getElementById('res').addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (b) { setState({ p: +b.getAttribute('data-p') }); var r = d.getElementById('res'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.pageYOffset - 140)); return; }
      var x = e.target.closest('[data-un]'); if (x) { var o = {}; o[x.getAttribute('data-un')] = ''; setState(o); }
    });
    d.getElementById('sb').classList.toggle('has', !!st.q);
    updateList();
  }
  function onSelect(e) { var s = e.target.closest('select[name]'); if (!s || view !== 'list') return; var o = {}; o[s.name] = s.value; setState(o); }
  function onFilter(e) {
    var b = e.target.closest('button[data-k]');
    if (!b) { if (e.target.closest('.reset')) { var o = {}; FKEYS.forEach(function (k) { o[k] = ''; }); setState(o); } return; }
    var k = b.getAttribute('data-k'), v = b.getAttribute('data-v'), p = {}; p[k] = st[k] === v ? '' : v; setState(p);
  }
  function chip(k, v, label, n, title) {
    var on = st[k] === v;
    return '<button type="button" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '"' + (title ? ' title="' + esc(title) + '"' : '') + (!n && !on ? ' disabled' : '') + '>' + esc(label) + '<small>' + fmt(n || 0) + '</small></button>';
  }
  function select(name, label, cnt, all, order) {
    var keys = order ? order.filter(function (k) { return cnt[k]; }) : Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || ko(a, b); });
    if (st[name] && keys.indexOf(st[name]) < 0) keys.unshift(st[name]);
    var h = '<select name="' + name + '" aria-label="' + label + '"><option value="">' + all + '</option>';
    keys.forEach(function (k) { h += '<option value="' + esc(k) + '"' + (st[name] === k ? ' selected' : '') + '>' + esc(k) + ' (' + fmt(cnt[k] || 0) + ')</option>'; });
    return h + '</select>';
  }
  function fg(title, inner) { return '<div class="fg"><h3>' + title + '</h3>' + inner + '</div>'; }
  function filters() {
    var h = '', c = st.c;
    if (c === 'ENT') {
      h += fg('기업집단', select('g', '기업집단', counts(st, 'g', function (x) { return x._grp; }), '모든 기업집단 (102곳)'));
      var kc = counts(st, 'k', function (x) { return x._k; });
      h += fg('업종 대분류', '<div class="opts">' + Object.keys(KSIC).filter(function (k) { return kc[k] || st.k === k; }).sort(function (a, b) { return (kc[b] || 0) - (kc[a] || 0); }).map(function (k) { return chip('k', k, KSIC[k][0], kc[k], KSIC[k][1]); }).join('') + '</div>');
      var cc = counts(st, 'ct', function (x) { return x.corp_type; }), lc = counts(st, 'ls', function (x) { return has(x.listed_date) ? '1' : ''; });
      h += fg('구분', '<div class="opts">' + Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; }).map(function (k) { return chip('ct', k, k, cc[k]); }).join('') + (st.ct && !cc[st.ct] ? chip('ct', st.ct, st.ct, 0) : '') + chip('ls', '1', '기업공개(상장) 법인', lc['1']) + '</div>');
    }
    if (c === 'PUB') {
      var tc = counts(st, 't', function (x) { return x.sub_category; });
      h += fg('기관 유형', '<div class="opts">' + PUBT.map(function (t) { return chip('t', t, t, tc[t]); }).join('') + '</div>');
      h += fg('주무부처', select('mi', '주무부처', counts(st, 'mi', function (x) { return x.ministry; }), '모든 주무부처'));
      h += fg('소재지', select('sd', '소재지 시·도', counts(st, 'sd', function (x) { return x.location_sido; }), '모든 시·도'));
    }
    if (c === 'MID') {
      var vc = counts(st, 've', function (x) { return x._ve.slice(0, 7); });
      h += fg('확인서 유효기간이 끝나는 달', '<div class="opts">' + Object.keys(vc).sort().map(function (k) { return chip('ve', k, k.replace('-', '년 ') + '월', vc[k]); }).join('') + '</div>');
      h += fg('공개 범위', '<p class="nt">중견기업정보마당은 확인서 발급기업의 이름·사업자등록번호·발급번호·유효기간만 공개합니다. 업종·매출·직원수로는 거를 수 없습니다.</p>');
    }
    if (c !== 'MID') {
      var rc = counts(st, 'rv', function (x) { return x._rb; }), ec = counts(st, 'em', function (x) { return x._eb; });
      h += fg('매출 규모 <small>2025 결산</small>', '<div class="opts">' + RV.map(function (r) { return chip('rv', r[0], r[1], rc[r[0]]); }).join('') + '</div>');
      h += fg('직원 규모', '<div class="opts">' + EM.map(function (r) { return chip('em', r[0], r[1], ec[r[0]]); }).join('') + '</div>');
      if (!c) h += fg('', '<p class="nt">중견기업은 매출·직원수가 공개되지 않아 규모 조건을 고르면 빠집니다.</p>');
    }
    return h;
  }
  function actives() {
    var a = [];
    if (st.g) a.push(['g', st.g]); if (st.k) a.push(['k', KSIC[st.k] ? KSIC[st.k][0] : st.k]); if (st.in) a.push(['in', st.in]);
    if (st.ct) a.push(['ct', st.ct]); if (st.ls) a.push(['ls', '기업공개 법인']);
    if (st.t) a.push(['t', st.t]); if (st.mi) a.push(['mi', st.mi]); if (st.sd) a.push(['sd', st.sd]);
    if (st.ve) a.push(['ve', st.ve.replace('-', '년 ') + '월 만료']);
    if (st.rv) a.push(['rv', '매출 ' + RV.filter(function (r) { return r[0] === st.rv; })[0][1]]);
    if (st.em) a.push(['em', '직원 ' + EM.filter(function (r) { return r[0] === st.em; })[0][1]]);
    return a;
  }
  function metrics(x) {
    var h = '';
    if (x._rev != null) h += '<span><small>매출</small><em' + (x._rev < 0 ? ' class="neg"' : '') + '>' + wonShort(x._rev) + '</em></span>';
    if (x._emp != null) h += '<span><small>' + (x._c === 'PUB' ? '정원' : '직원') + '</small><em>' + fmt(x._emp) + '</em></span>';
    if (st.o === 'ast' && x._ast != null) h += '<span><small>자산</small><em>' + wonShort(x._ast) + '</em></span>';
    if ((st.o === 'old' || st.o === 'new') && has(x.established_year)) h += '<span><small>설립</small><em>' + x.established_year + '</em></span>';
    if (x._c === 'MID' && x._ve) h += '<span><small>확인서</small><em>~' + esc(x._ve) + '</em></span>';
    return h ? '<span class="r-m">' + h + '</span>' : '';
  }
  function updateList() {
    if (view !== 'list') return;
    var home = !st.c && !st.q && !FKEYS.some(function (k) { return st[k]; });
    d.body.toggleAttribute('data-home', home);
    tabs(st.c || 'all');
    var cdef = main.querySelector('.cdef'), c = st.c ? CK[st.c] : null;
    if (c) { if (!cdef) { cdef = d.createElement('p'); main.insertBefore(cdef, main.firstChild); } cdef.className = 'cdef k-' + c.k; cdef.innerHTML = '<b>' + esc(c.name) + '</b><span>' + esc(c.def) + '</span>'; }
    else if (cdef) cdef.remove();
    d.getElementById('flB').innerHTML = filters() + (actives().length ? '<button type="button" class="reset">조건 모두 풀기</button>' : '');
    var act = actives();
    d.getElementById('flN').textContent = act.length ? act.length + '개 고름' : '';
    var arr = sorted(filtered(st), st), pages = Math.max(1, Math.ceil(arr.length / PER));
    if (st.p > pages) st.p = pages;
    var cur = arr.slice((st.p - 1) * PER, st.p * PER), m = qmap(st.q) || {};
    var so = '<label class="so">정렬<select name="o" aria-label="정렬">' + (st.q ? [['', '찾는 말과 가까운 순'], ['rev', '매출 큰 순']] : [['', '매출 큰 순']]).concat(SORTS).map(function (s) { return '<option value="' + s[0] + '"' + (st.o === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>';
    var r = '<div class="vw"><p class="cnt"><b>' + fmt(arr.length) + '</b>곳' + (st.q ? ' · 「' + esc(st.q) + '」' : '') + '</p>' + so +
      (act.length ? '<div class="act">' + act.map(function (a) { return '<button type="button" data-un="' + a[0] + '" aria-label="' + esc(a[1]) + ' 조건 풀기">' + esc(a[1]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    if (!arr.length) r += '<p class="empty">조건에 맞는 곳이 없습니다. 검색어를 줄이거나 <a href="#list' + (st.c ? '?c=' + st.c : '') + '">조건을 풀어</a> 보십시오.' + (st.c ? ' 다른 분류에 있을 수도 있습니다: <a href="' + listHash({ q: st.q, p: 1, c: '', g: '', k: '', ct: '', ls: '', t: '', mi: '', sd: '', ve: '', rv: '', em: '', in: '', o: '' }) + '">전체에서 찾기</a>' : '') + '</p>';
    else {
      r += '<div class="rows two">';
      cur.forEach(function (x) {
        var hit = m[x.id] && m[x.id].hit, sub = '';
        if (x._c === 'ENT') sub = (has(x.group) ? '<span class="tg">' + esc(x.group) + '</span>' : '') + (has(x.industry) ? '<span>' + esc(x.industry) + '</span>' : '');
        else if (x._c === 'PUB') sub = '<span class="tg">' + esc(x.sub_category) + '</span>' + (has(x.ministry) ? '<span>' + esc(x.ministry) + '</span>' : '');
        else sub = has(x.biz_no) ? '<span class="code">' + esc(x.biz_no) + '</span>' : '';
        r += '<a class="row k-' + x._c + '" href="#' + x.id + '"><span class="r-n">' + hl(x.name, st.q) + '</span>' +
          '<span class="r-s"><span class="ty">' + CK[x._c].name + '</span>' + sub + '</span>' +
          (hit && hit.k !== 'group' && hit.k !== 'ind' && hit.k !== 'min' && hit.k !== 'type' ? snippet(hit, st.q) : '') + metrics(x) + '</a>';
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

  /* ---------- 한 곳 ---------- */
  function sec(title, inner, cls, tag) { return '<section class="sec' + (cls ? ' ' + cls : '') + '"><h2>' + esc(title) + (tag ? ' <small>' + esc(tag) + '</small>' : '') + '</h2>' + inner + '</section>'; }
  function lk(href, text) { return '<a href="' + href + '">' + esc(text) + '</a>'; }
  function q1(o) { return listHash(fix(Object.assign(blank(), o))); }
  // 하는 일: "; " "□" "1." 으로 이어 적힌 공시 문장을 항목으로 나눈다
  function doesBlock(s) {
    var parts = String(s).split(/\s*;\s*|\s*□\s*/).map(function (p) { return p.replace(/^\s*(?:\d{1,2}|[①-⑳]|[가-하])\s*[.)]\s*/, '').trim(); }).filter(function (p) { return p.length > 1; });
    if (parts.length < 2) return '<p class="t">' + esc(s) + '</p>';
    return '<ol class="does">' + parts.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>';
  }
  function figure(x, f, label, val, ex, basis) {
    var D = DIST[x._c + f], h = '<div class="fig"><p class="fig-h"><span>' + label + '</span><b' + (x[f] < 0 ? ' class="neg"' : '') + '>' + val + '</b>' + (basis ? '<small>' + esc(basis) + '</small>' : '') + '</p>' + (ex ? '<p class="ex">' + esc(ex) + '</p>' : '');
    if (D && x[f] > 0) {
      var bins = '';
      D.bins.forEach(function (n, i) { bins += '<i' + (i === x[f + 'B'] ? ' class="me"' : '') + ' style="--h:' + (n ? Math.max(.06, n / D.max) : 0).toFixed(3) + ';--i:' + i + '"></i>'; });
      var r = x[f + 'R'], top = r / D.n * 100;
      var fmtV = f === '_emp' ? function (v) { return ppl(v); } : function (v) { return wonShort(v); };
      h += '<div class="hist" role="img" aria-label="' + esc(CK[x._c].name + ' ' + fmt(D.n) + '곳 가운데 ' + fmt(r) + '번째') + '" data-jc-still>' + bins + '</div>' +
        '<p class="hist-a" aria-hidden="true"><span>' + fmtV(D.lo) + '</span><span>로그 눈금</span><span>' + fmtV(D.hi) + '</span></p>' +
        '<p class="rank">' + esc(CK[x._c].name) + ' 가운데 값이 있는 ' + fmt(D.n) + '곳 중 <b>' + fmt(r) + '번째</b>' + (top <= 50 ? ' · 상위 ' + (top < 1 ? Math.max(.1, Math.ceil(top * 10) / 10).toFixed(1) : Math.ceil(top)) + '%' : '') + '</p>';
    }
    return h + '</div>';
  }
  function mates(list, x, val, max) {
    return '<ul class="mates">' + list.slice(0, max).map(function (y) {
      return '<li><a href="#' + y.id + '"' + (y.id === x.id ? ' aria-current="page"' : '') + '><span>' + esc(y.name) + '</span><i>' + val(y) + '</i></a></li>';
    }).join('') + '</ul>';
  }
  function byRev(a, b) { return cmpNum('_rev', 1)(a, b) || cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); }
  function renderItem(id) {
    view = 'item';
    var x = BYID[id], c = CK[x._c], miss = [];
    d.body.removeAttribute('data-home'); tabs(x._c);
    var back = view === 'item' && lastList ? lastList : listHash(st);
    /* 명함 */
    var dl = '';
    function row(label, v) { dl += '<dt>' + label + '</dt><dd>' + v + '</dd>'; }
    if (x._c === 'ENT') {
      if (x._grp.length) row('기업집단', x._grp.map(function (g) { return lk(q1({ c: 'ENT', g: g }), g); }).join(' · '));
      if (has(x.industry)) row('업종', lk(q1({ c: 'ENT', in: x.industry }), x.industry) + (has(x.ksic_code) ? ' <span class="code">' + esc(x.ksic_code) + '</span>' : '')); else miss.push('업종');
      if (has(x.ceo)) row('대표자', esc(x.ceo)); else miss.push('대표자');
      if (has(x.established_year)) row('설립', x.established_year + '년'); else miss.push('설립연도');
      if (has(x.listed_date)) row('기업공개', '<span class="code">' + esc(x.listed_date) + '</span>');
      if (has(x.corp_type)) row('구분', lk(q1({ c: 'ENT', ct: x.corp_type }), x.corp_type));
      miss.push('소재지', '홈페이지');
    } else if (x._c === 'PUB') {
      row('기관 유형', lk(q1({ c: 'PUB', t: x.sub_category }), x.sub_category));
      if (has(x.ministry)) row('주무부처', lk(q1({ c: 'PUB', mi: x.ministry }), x.ministry));
      if (has(x.ceo)) row('기관장', esc(String(x.ceo).replace(/^([가-힣]) ([가-힣]) ([가-힣])$/, '$1$2$3'))); else miss.push('기관장');
      if (has(x.established_year)) row('설립', x.established_year + '년'); else miss.push('설립연도');
      if (has(x.headquarters)) row('소재지', (has(x.location_sido) ? lk(q1({ c: 'PUB', sd: x.location_sido }), x.location_sido) + ' ' : '') + esc(String(x.headquarters).replace(x.location_sido || '\u0000', '').trim())); else miss.push('소재지');
      var u0 = safeUrl(x.official_url); if (u0) row('홈페이지', '<a href="' + esc(u0) + '" target="_blank" rel="noopener noreferrer">' + esc(host(u0)) + '</a>'); else miss.push('홈페이지');
      miss.push('업종');
    } else {
      if (has(x.biz_no)) row('사업자번호', '<span class="code">' + esc(x.biz_no) + '</span>');
      if (has(x.certificate_no)) row('확인서', '<span class="code">' + esc(x.certificate_no) + '</span>');
      miss.push('업종', '매출', '직원수', '대표자', '설립연도', '소재지', '홈페이지');
    }
    var seal = x._c === 'PUB' ? '<span class="seal round" aria-hidden="true">공공<br>기관</span>' : x._c === 'MID' ? '<span class="seal" aria-hidden="true">확인서<br>발급</span>' : '<span class="seal" aria-hidden="true">공시<br>대상</span>';
    var card = '<article class="card k-' + x._c + '"><p class="card-top"><b>' + esc(c.name) + '</b><span>' + esc(x.source || '') + '</span><span class="code">' + esc(x.id) + '</span></p>' + seal +
      '<div class="card-id"><span class="mono" aria-hidden="true">' + esc(initial(x)) + '</span><div><h1>' + esc(x.name) + '</h1><p class="sub">' + esc(lineOf(x)) + '</p></div></div>' +
      (dl ? '<dl>' + dl + '</dl>' : '') + '</article>';
    /* 숫자(옆 칸 위) */
    var s1 = '';
    if (x._c !== 'MID') {
      var figs = '';
      if (x._rev != null) figs += figure(x, '_rev', x._c === 'PUB' ? '매출(수익)' : '매출', won(x._rev), wonFull(x._rev), (x.revenue_year ? x.revenue_year + ' 결산' : '') + (has(x.revenue_as_of) ? ' · ' + x.revenue_as_of : ''));
      else miss.push('매출');
      if (x._emp != null) figs += figure(x, '_emp', x._c === 'PUB' ? '정원' : '종업원', fmt(x._emp) + '명', '', (x._c === 'PUB' ? '임직원 총계(A+B+C)' : '') + (has(x.employees_as_of) ? (x._c === 'PUB' ? ' · ' : '') + x.employees_as_of : ''));
      else miss.push(x._c === 'PUB' ? '정원' : '직원수');
      if (x._ast != null) figs += figure(x, '_ast', '자산총액', won(x._ast), wonFull(x._ast), has(x.total_assets_as_of) ? x.total_assets_as_of : '');
      else if (x._c === 'ENT') miss.push('자산총액');
      if (figs) s1 = '<section class="box s1 k-' + x._c + '"><h2>숫자로 보기<small>공시 원값</small></h2>' + figs +
        (x._rev != null && x._rev < 0 ? '<p class="src">음수 매출은 투자조합·펀드성 법인의 원자료 값(손실)입니다.</p>' : '') + '</section>';
    } else if (x._ve) {
      var from = (String(x.certificate_valid).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1], t0 = Date.parse(from), t1 = Date.parse(x._ve), tn = Date.parse(TODAY);
      if (t0 && t1 && t1 > t0) {
        var pos = Math.min(1, Math.max(0, (tn - t0) / (t1 - t0))), left = Math.round((t1 - tn) / 864e5);
        s1 = '<section class="box s1 k-MID"><h2>확인서 유효기간<small>중견기업정보마당</small></h2><div class="valid">' +
          '<div class="valid-b" role="img" aria-label="유효기간 ' + esc(x.certificate_valid) + ', 오늘은 ' + Math.round(pos * 100) + '% 지점"><i style="transform:scaleX(' + pos.toFixed(3) + ')"></i><u style="left:calc(' + (pos * 100).toFixed(1) + '% - 1px)"></u></div>' +
          '<p class="valid-a"><span>' + esc(from) + '</span><span>' + esc(x._ve) + '</span></p>' +
          '<p>' + (left >= 0 ? '오늘(' + TODAY + ') 기준 <b>' + fmt(left) + '일</b> 남았습니다.' : '오늘 기준 유효기간이 지났습니다.') + ' 확인서는 직전 사업연도 실적으로 해마다 다시 발급받습니다.</p></div></section>';
      }
    }
    /* 본문 */
    var b = '';
    if (has(x.business_summary)) b += sec(x._c === 'PUB' ? '하는 일' : '한 줄 소개', doesBlock(x.business_summary), '', x._c === 'PUB' ? '설립목적·주요사업 공시' : '공정위 영위업종 기준');
    else if (x._c !== 'MID') miss.push('하는 일');
    if (x._c === 'MID') b += sec('공개된 정보', '<p class="t">중견기업정보마당은 확인서를 발급받은 기업의 이름·사업자등록번호·발급번호·유효기간만 공개합니다. 정부가 중견기업 전체 명단을 공개하지 않으므로, 이 목록은 확인서를 받은 기업만 담은 하한 집합입니다.</p>');
    var ids = '';
    if (has(x.corp_reg_no)) ids += '<dt>법인등록번호</dt><dd class="code">' + esc(x.corp_reg_no) + '</dd>';
    if (has(x.biz_no) && x._c !== 'MID') ids += '<dt>사업자등록번호</dt><dd class="code">' + esc(String(x.biz_no).replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')) + '</dd>';
    if (has(x.certificate_valid)) ids += '<dt>확인서 유효기간</dt><dd class="code">' + esc(x.certificate_valid) + '</dd>';
    if (has(x.source_ref)) ids += '<dt>공시 기준</dt><dd>' + esc(String(x.source_ref).replace(/;\s*/g, ' · ').replace(/임직원수/g, '임직원 수').replace(/손익/g, '손익계산서')) + '</dd>';
    if (ids) b += sec('식별 번호와 기준', '<dl class="kv">' + ids + '</dl>', 'fo');
    /* 옆 칸 아래: 함께 보기 */
    var s2 = '';
    if (x._c === 'ENT') x._grp.forEach(function (g) {
      var L = (GRP[g] || []).slice().sort(byRev);
      s2 += '<section class="box s2 k-ENT"><h2>' + esc(g) + ' 소속회사<small>' + fmt(L.length) + '곳 · 매출 순</small></h2>' + mates(L, x, function (y) { return y._rev != null ? wonShort(y._rev) : ''; }, 8) +
        (L.length > 8 ? '<a class="more" href="' + q1({ c: 'ENT', g: g }) + '">' + esc(g) + ' 소속 ' + fmt(L.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    });
    if (x._c === 'PUB' && has(x.ministry)) {
      var P = ITEMS.filter(function (y) { return y._c === 'PUB' && y.ministry === x.ministry; }).sort(function (a, b) { return cmpNum('_emp', 1)(a, b) || ko(a._n, b._n); });
      if (P.length > 1) s2 += '<section class="box s2 k-PUB"><h2>' + esc(x.ministry) + ' 소관<small>' + fmt(P.length) + '곳 · 정원 순</small></h2>' + mates(P, x, function (y) { return y._emp != null ? fmt(y._emp) + '명' : ''; }, 8) +
        (P.length > 8 ? '<a class="more" href="' + q1({ c: 'PUB', mi: x.ministry }) + '">' + fmt(P.length) + '곳 모두 보기 ›</a>' : '') + '</section>';
    }
    var same = (SAME[x._c + '|' + x._n] || []).filter(function (y) { return y.id !== x.id; });
    if (same.length) s2 += '<section class="box s2"><h2>이름이 같은 다른 법인<small>' + same.length + '곳</small></h2>' + mates(same, x, function (y) { return esc(y.id.slice(4)); }, 8) + '<p class="src">같은 이름이라도 법인등록번호·사업자등록번호가 다른 별개 회사입니다.</p></section>';
    var near = [];
    if (x._c === 'ENT' && has(x.industry)) near.push([q1({ c: 'ENT', in: x.industry }), '같은 업종 · ' + x.industry, ITEMS.filter(function (y) { return y.industry === x.industry; }).length]);
    if (x._c === 'ENT' && x._k) near.push([q1({ c: 'ENT', k: x._k }), '업종 대분류 · ' + KSIC[x._k][0], ITEMS.filter(function (y) { return y._k === x._k; }).length]);
    if (x._c === 'PUB') near.push([q1({ c: 'PUB', t: x.sub_category }), x.sub_category + ' 전체', ITEMS.filter(function (y) { return y.sub_category === x.sub_category && y._c === 'PUB'; }).length]);
    if (x._c === 'PUB' && has(x.location_sido)) near.push([q1({ c: 'PUB', sd: x.location_sido }), x.location_sido + '에 있는 공공기관', ITEMS.filter(function (y) { return y.location_sido === x.location_sido; }).length]);
    if (x._c === 'MID' && x._ve) near.push([q1({ c: 'MID', ve: x._ve.slice(0, 7) }), x._ve.slice(0, 7).replace('-', '년 ') + '월에 확인서가 끝나는 곳', ITEMS.filter(function (y) { return y._ve && y._ve.slice(0, 7) === x._ve.slice(0, 7); }).length]);
    near = near.filter(function (n) { return n[2] > 1; });
    if (near.length) s2 += '<section class="box s2"><h2>이어서 찾기</h2><ul class="mates">' + near.map(function (n) { return '<li><a href="' + n[0] + '"><span>' + esc(n[1]) + '</span><i>' + fmt(n[2]) + '곳</i></a></li>'; }).join('') + '</ul></section>';
    /* 최하단: 미표기 안내 + 공식 홈페이지 + 출처 */
    var u = safeUrl(x.official_url), S = SRC[x.source] || {}, su = safeUrl(S.url);
    miss = miss.filter(function (m, i) { return miss.indexOf(m) === i; });
    var mt = '<section class="miss"><p><b>미표기 항목은 공식 공개 데이터(공정위·알리오·중견기업정보마당)에 포함되지 않은 정보입니다.</b></p>' +
      (miss.length ? '<p class="lst">이 화면에 싣지 않은 항목: ' + miss.map(esc).join(' · ') + '</p>' : '') +
      (u ? '<a class="go" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>공식 홈페이지 · ' + esc(host(u)) + '</span></a>' : '') +
      (su ? '<a class="go' + (u ? ' line' : '') + '" href="' + esc(su) + '" target="_blank" rel="noopener noreferrer">' + IC.out + '<span>원자료 · ' + esc(S.short || host(su)) + '</span></a>' : '') +
      '<p class="src"><b>이 항목의 출처</b> — ' + esc(S.name || x.source) + (S.as_of ? ' (' + esc(S.as_of) + ')' : '') + '. 기업과 기관의 최신 정보는 각 공식 공시로 확인하십시오.</p></section>';
    main.innerHTML = '<nav class="crumbs" aria-label="위치"><a href="' + back + '">' + IC.back + '목록으로</a><span>/</span>' + esc(c.name) +
      (x._c === 'ENT' && x._grp[0] ? ' <span>/</span> ' + esc(x._grp.join(' · ')) : x._c === 'PUB' ? ' <span>/</span> ' + esc(x.sub_category) : '') + '</nav>' +
      '<div class="dt">' + card + '<div class="side">' + s1 + s2 + '</div>' + (b ? '<div class="body">' + b + '</div>' : '') + mt + '</div>';
    var hs = main.querySelectorAll('.hist'); if (hs.length) requestAnimationFrame(function () { for (var i = 0; i < hs.length; i++) hs[i].classList.add('run'); });
    fitSide();
    window.scrollTo(0, 0);
    try { d.title = x.name + ' · 기업 명함첩'; } catch (e) {}
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

  /* ---------- 출처와 한계 ---------- */
  function renderAbout() {
    view = 'about'; d.body.removeAttribute('data-home'); tabs('about');
    var m = META, h = '<div class="ab"><h1>출처와 한계</h1><p class="lead">이 명함첩은 공정거래위원회·알리오·중견기업정보마당이 공개한 사실 정보만으로 만든 자료(company-wiki v' + esc(m.version || '') + ', ' + esc(m.built_at || '') + ')를 고치지 않고 읽어 보여 줍니다. 확인되지 않은 값은 화면에 싣지 않았습니다.</p>';
    var F = {
      ENT: [['매출', '_rev'], ['종업원수', '_emp'], ['자산총액', '_ast'], ['업종', 'industry'], ['소재지', 'headquarters']],
      MID: [['매출', '_rev'], ['직원수', '_emp'], ['업종', 'industry'], ['소재지', 'headquarters'], ['확인서', 'certificate_no']],
      PUB: [['매출', '_rev'], ['정원', '_emp'], ['하는 일', 'business_summary'], ['소재지', 'headquarters'], ['홈페이지', 'official_url']]
    };
    h += '<h2>3대 분류와 채움 현황</h2><div class="cats">' + CATS.map(function (c) {
      var l = ITEMS.filter(function (x) { return x._c === c.k; }), N = l.length || 1;
      var bars = F[c.k].map(function (b) {
        var n = l.filter(function (x) { return x[b[1]] != null && x[b[1]] !== ''; }).length;
        return '<div><span>' + b[0] + '</span><u><s style="transform:scaleX(' + (n / N).toFixed(3) + ')"></s></u><em>' + fmt(n) + '</em></div>';
      }).join('');
      return '<a class="k-' + c.k + '" href="#list?c=' + c.k + '"><h3>' + esc(c.name) + '<b>' + fmt(l.length) + '</b></h3><p>' + esc(c.def) + '</p><div class="fill" aria-label="항목별 채운 곳 수(0인 값은 뺌)">' + bars + '</div></a>';
    }).join('') + '</div>';
    h += '<h2>원자료</h2><table class="tbl"><thead><tr><th>출처</th><th>무엇을 가져왔나</th><th>기준일 · 이용 조건</th></tr></thead><tbody>' + (m.sources || []).map(function (s) {
      var u = safeUrl(s.url);
      return '<tr><td>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + '</a>' : esc(s.name)) + ' <span class="code">' + esc(s.id) + '</span></td><td>' + esc(s.used_for || '') + '</td><td>' + esc(s.as_of || '') + ' · ' + esc(s.license || '') + '</td></tr>';
    }).join('') + '</tbody></table>';
    h += '<h2>읽을 때 주의할 점</h2><ul class="lim">' +
      '<li><b>대기업은 2026-05-01 지정 기준</b>입니다. 그 뒤의 계열 편입·제외는 반영되지 않았습니다. 두 집단에 함께 올라 있는 법인은 두 집단 모두에서 보입니다.</li>' +
      '<li><b>단위</b>: 매출·자산총액은 원(원자료 백만 원 × 1,000,000), 직원수는 명입니다. 목록과 숫자 칸은 읽기 쉽게 조·억 단위로 줄여 보이고, 상세에는 원값을 함께 적습니다.</li>' +
      '<li><b>0인 값</b>: 대기업 매출 ' + fmt(ITEMS.filter(function (x) { return x._c === 'ENT' && x.revenue === 0; }).length) + '곳 등은 원자료에 0으로 적혀 있습니다. 값이 없는 경우와 구별되지 않아 숫자를 싣지 않고 미표기로 둡니다.</li>' +
      '<li><b>음수 매출</b>은 사모투자합자회사·투자목적회사 같은 펀드성 법인의 원자료 값(손실)입니다. 오류가 아닙니다.</li>' +
      '<li><b>공공기관 직원수는 정원</b>(임직원 총계 A+B+C)입니다. 현원과 다를 수 있습니다. 매출은 2025년 결산이며, 금융형 기관은 영업수익, 일반 기관은 매출·수익(매출액) 행입니다.</li>' +
      '<li><b>공공기관 업종은 비어 있습니다.</b> 알리오는 표준산업분류를 공개하지 않습니다. 기관 유형·주무부처·하는 일로 판단하십시오.</li>' +
      '<li><b>중견기업은 확인서 발급기업만</b> 공개됩니다(하한 집합). 업종·매출·직원수·주소는 공개되지 않아 비워 두었습니다.</li>' +
      '<li><b>같은 이름의 다른 법인</b>이 있습니다. 주소의 번호(법인등록번호·사업자등록번호)로 구분합니다.</li>' +
      '<li><b>규모 눈금</b>은 같은 분류 안에서 값이 있는 곳만 모아 로그 눈금 24칸으로 나눈 그림입니다. 순위는 원자료 값의 크기 순서일 뿐 기업의 좋고 나쁨이 아닙니다.</li>' +
      '<li>업종 대분류 이름은 통계청 한국표준산업분류(KSIC) 대분류 명칭이며, 코드 첫 글자로 묶었습니다.</li>' +
      (m.limitations || []).slice(0, 2).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    h += '<h2>갱신 주기</h2><ul class="lim"><li><b>공정거래위원회</b> — 해마다 5월 1일 기업집단 지정. 재무·인력은 직전 사업연도 결산.</li><li><b>알리오</b> — 분기 정기공시(1·4·7·10월 중순 마감).</li><li><b>중견기업정보마당</b> — 확인서 발급 때마다 수시로 바뀝니다.</li></ul>';
    h += '<h2>저작권과 이용</h2><ul class="lim"><li>명칭·주소·설립일·인원·매출·업종·확인서 번호 같은 단순 사실 정보이며, 공공기관이 공개를 전제로 배포하는 정보입니다. 재배포할 때는 위 출처를 밝혀 주십시오.</li><li>기업 로고·CI·사진·홈페이지 본문, 캐치프레이즈·인재상·복지 홍보 문구는 수집하지 않았습니다. 명함 가운데 동그라미 글자는 이름 첫 글자일 뿐 기업 표장이 아닙니다.</li><li>잡코리아·사람인·원티드·캐치 같은 민간 채용 플랫폼의 정보는 쓰지 않았습니다. 이 화면은 어떤 기관이나 기업의 공식 자료도, 채용 정보도 아닙니다.</li></ul></div>';
    main.innerHTML = h; window.scrollTo(0, 0);
  }

  /* ---------- 길잡이 ---------- */
  function route() {
    var r = readHash();
    if (view === 'list' && r.v !== 'list') { listY = window.pageYOffset; lastList = listHash(st); }
    if (r.v === 'item') { renderItem(r.id); return; }
    try { d.title = '기업 명함첩 · 대기업·중견기업·공공기관 기업 위키'; } catch (e) {}
    if (r.v === 'about') { renderAbout(); return; }
    var wasList = view === 'list', from = view;
    st = r.s;
    if (!wasList) { renderList(); if (from === 'item' && listHash(st) === lastList) window.scrollTo(0, listY); else if (from) window.scrollTo(0, 0); }
    else { var q = d.getElementById('q'); if (q && q.value !== st.q) q.value = st.q; updateList(); }
  }

  /* ---------- 불러오기: 4MB를 받는 동안 진행 막대(transform만) ---------- */
  var EST = 4215000;
  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      if (!r.body || !r.body.getReader || !window.TextDecoder) return r.json();
      var rd = r.body.getReader(), dec = new TextDecoder('utf-8'), parts = [], got = 0, bar = d.getElementById('ldBar');
      function pump() {
        return rd.read().then(function (o) {
          if (o.done) { parts.push(dec.decode()); return JSON.parse(parts.join('')); }
          got += o.value.length; parts.push(dec.decode(o.value, { stream: true }));
          if (bar) bar.style.transform = 'scaleX(' + Math.min(.98, got / EST).toFixed(3) + ')';
          return pump();
        });
      }
      return pump();
    });
  }
  function load() {
    fetchJson('./data/companies.json').then(function (D) {
      META = D.meta || {}; ITEMS = D.companies || [];
      (META.sources || []).forEach(function (s) { SRC[s.id] = s; });
      if (SRC.FTC) SRC.FTC.short = '공정거래위원회'; if (SRC.ALIO) SRC.ALIO.short = '알리오'; if (SRC.MME) SRC.MME.short = '중견기업정보마당';
      for (var i = 0; i < ITEMS.length; i++) { BYID[ITEMS[i].id] = ITEMS[i]; prep(ITEMS[i]); }
      CATS.forEach(function (c) { c.n = ITEMS.filter(function (x) { return x._c === c.k; }).length; });
      dist(); album(); main.addEventListener('change', onSelect); route();
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
