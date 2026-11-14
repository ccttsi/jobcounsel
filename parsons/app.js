/*
 * 다시 읽는 『직업의 선택』 · 카드북 뷰어 엔진
 *
 * 데이터(./data/*.json)와 화면(이 파일)을 나눴다. 장을 더하거나 고칠 때는 data 폴더만 손댄다.
 *  - data/book.json      : 책 정보·저작권 고지·장 목록(chapters[].file 순서대로 읽는다)
 *  - data/glossary.json  : [[키]]로 부르는 옛 말 → 오늘의 말 사전
 *  - data/<장>.json      : { id, cards:[...] }
 *
 * 카드 종류(type): cover · text · quote · figure · table · chips · pairs · now · ask · source
 *  본문 안 **굵게**, [[용어키]](누르면 1909 → 2026 띄움) 를 쓸 수 있다. 카드 한 장 = 메시지 하나, 200자 이내.
 *  figure/cover 의 fig 값은 아래 FIG / ICON 의 이름이다.
 *
 * 읽기 방식: scroll(세로로 쭉) · card(한 장씩) · book(책처럼 펼쳐, 넓은 화면 두 쪽 + 책장 넘김)
 * 저장(이 브라우저에만): jc-parsons-mode, jc-parsons-pos. 주소 #p12 = 12쪽.
 */
(function () {
  'use strict';
  var d = document, W = window;
  var $ = function (id) { return d.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MK = 'jc-parsons-mode', PK = 'jc-parsons-pos';
  var MODES = ['scroll', 'card', 'book'];
  var reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var BOOK = null, G = {}, CARDS = [], CH = [], N = 0;
  var st = { mode: 'scroll', i: 0, busy: false, per: 2 };

  /* ---------- 불러오기 ---------- */
  function getJSON(u) {
    return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  }
  function load() {
    getJSON('./data/book.json').then(function (b) {
      BOOK = b;
      return Promise.all([getJSON('./data/' + b.glossary)].concat(b.chapters.map(function (c) { return getJSON('./data/' + c.file); })));
    }).then(function (all) {
      G = all[0].terms || {};
      BOOK.chapters.forEach(function (ch, k) {
        var cs = (all[k + 1] && all[k + 1].cards) || [];
        ch.start = CARDS.length; ch.count = cs.length;
        cs.forEach(function (c, j) { CARDS.push({ c: c, ch: ch, j: j }); });
        CH.push(ch);
      });
      N = CARDS.length;
      boot();
    }).catch(function (e) {
      $('reader').innerHTML = '<p class="msg">책을 펼치지 못했습니다. 인터넷 연결을 확인하고 새로 고침해 주십시오.<br><small>' + esc(e && e.message) + '</small></p>';
    });
  }

  /* ---------- 글 다듬기 ---------- */
  function rich(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[\[([\w-]+)\]\]/g, function (m, k) {
        var t = G[k]; if (!t) return esc(k);
        return '<button type="button" class="gl" data-k="' + k + '" aria-haspopup="dialog" aria-label="' + esc(t.then) + ', 오늘의 직업으로 바꿔 보기">' + esc(t.then) + '</button>';
      });
  }
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function numbered(ch) { return ch.orig && ch.orig.length > 0; }
  function chLabel(ch) { return numbered(ch) ? 'CH.' + two(ch.no) + ' · ' + ch.title : ch.title; }
  function origLabel(ch) { return '원문 제' + ch.orig.join('·') + '장'; }

  /* ---------- 그림 ---------- */
  var S = function (vb, body, label) { return '<svg class="fig" viewBox="' + vb + '" role="img" aria-label="' + esc(label) + '" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>'; };
  var T = function (x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.fs || 12) + '" text-anchor="' + (o.a || 'middle') + '" class="' + (o.c || 'ft') + '"' + (o.w ? ' font-weight="' + o.w + '"' : '') + '>' + esc(s) + '</text>'; };
  var FIG = {
    'three-factors': function () {
      return S('0 0 320 200',
        '<path d="M92 92 Q160 18 228 92" class="fs-a" fill="none" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>' +
        '<circle cx="78" cy="112" r="56" class="fa-soft"/><circle cx="242" cy="112" r="56" class="fa-soft"/>' +
        '<circle cx="78" cy="96" r="11" class="fs-i" fill="none" stroke-width="2.2"/><path d="M58 128 q20-22 40 0" class="fs-i" fill="none" stroke-width="2.2" stroke-linecap="round"/>' +
        '<rect x="224" y="90" width="36" height="26" rx="5" class="fs-i" fill="none" stroke-width="2.2"/><path d="M235 90 v-6 h14 v6" class="fs-i" fill="none" stroke-width="2.2"/>' +
        T(78, 150, '① 자기 이해', { fs: 13, w: 750 }) + T(242, 150, '② 직업 세계 이해', { fs: 13, w: 750 }) +
        '<rect x="112" y="30" width="96" height="26" rx="13" class="fa"/>' + T(160, 48, '③ 합리적 추론', { fs: 12.5, w: 800, c: 'ft-on' }) +
        '<path d="M160 160 l5 10 11 1-8 8 2 11-10-6-10 6 2-11-8-8 11-1z" class="fa"/>' + T(160, 198, '현명한 선택', { fs: 12, w: 750, c: 'fm' }),
        '자기 이해와 직업 세계 이해를 합리적 추론이 잇고, 그 끝에 현명한 선택이 있다는 도식');
    },
    lincoln: function () {
      return S('0 0 320 190',
        '<path d="M160 186 C160 140 160 120 160 110 C160 80 70 80 64 40" class="fs-m" fill="none" stroke-width="16" stroke-linecap="round" opacity=".35"/>' +
        '<path d="M160 110 C160 80 250 80 256 40" class="fs-a" fill="none" stroke-width="16" stroke-linecap="round" opacity=".55"/>' +
        '<path d="M160 186 V112" class="fs-a" fill="none" stroke-width="16" stroke-linecap="round" opacity=".55"/>' +
        '<path d="M44 28 h40 v6 h-8 v8 h-24 v-8 h-8z" class="fm-f"/>' + T(64, 62, '대장장이', { fs: 12.5, w: 700, c: 'fm' }) + T(64, 77, '시작하기 쉬움', { fs: 10.5, c: 'fm' }) +
        '<path d="M256 14 v30 M240 22 h32 M240 22 l-7 12 h14z M272 22 l-7 12 h14z" class="fs-a" fill="none" stroke-width="2.2" stroke-linejoin="round"/>' +
        T(256, 62, '법률가 ✓', { fs: 12.5, w: 800, c: 'fa-t' }) + T(256, 77, '어렵지만 기질에 맞음', { fs: 10.5, c: 'fm' }) +
        '<circle cx="160" cy="150" r="9" class="fa"/>' + T(178, 154, '링컨', { fs: 11.5, w: 700, a: 'start' }),
        '링컨의 갈림길: 대장장이와 법률가 가운데 법률가를 고른 그림');
    },
    schedule: function () {
      var l = '', y;
      for (y = 64; y <= 160; y += 16) l += '<rect x="56" y="' + y + '" width="' + (y < 112 ? 120 : 96) + '" height="5" rx="2.5" class="' + (y < 112 ? 'fa-soft2' : 'fm-soft') + '"/><rect x="40" y="' + (y - 2) + '" width="9" height="9" rx="2" class="fs-m" fill="none" stroke-width="1.4"/>';
      return S('0 0 320 190',
        '<rect x="24" y="22" width="172" height="160" rx="12" class="fpaper"/><rect x="82" y="14" width="56" height="18" rx="6" class="fm-f"/>' +
        T(40, 54, '1부 개인 기록', { fs: 11, w: 750, a: 'start', c: 'fa-t' }) + l +
        T(226, 92, '116', { fs: 46, w: 900, a: 'start', c: 'fa-t' }) + T(228, 114, '개의 질문', { fs: 13, w: 700, a: 'start' }) +
        T(228, 140, '1부 · 개인 기록', { fs: 11, a: 'start', c: 'fm' }) + T(228, 156, '2부 · 성품·능력', { fs: 11, a: 'start', c: 'fm' }),
        '116개 질문으로 된 두 부분짜리 질문지 그림');
    },
    'seven-steps': function () {
      var L = ['개인 자료', '자기 분석', '본인의 결정', '상담사 분석', '직업 세계 조망', '추론·조언', '적응 돕기'];
      var P = [[42, 46], [122, 46], [202, 46], [282, 46], [242, 136], [162, 136], [82, 136]], s = '';
      s += '<path d="M42 46 H282 C312 46 312 136 282 136 H82" class="fs-m" fill="none" stroke-width="2" stroke-dasharray="3 5" opacity=".7"/>';
      P.forEach(function (p, k) {
        var on = k === 2;
        s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (on ? 19 : 15) + '" class="' + (on ? 'fa' : 'fa-soft') + '"/>' +
          T(p[0], p[1] + 4.5, String(k + 1), { fs: on ? 15 : 13, w: 850, c: on ? 'ft-on' : 'fa-t' }) +
          T(p[0], p[1] + (on ? 36 : 32), L[k], { fs: 11, w: on ? 800 : 600, c: on ? 'fa-t' : 'ft' });
      });
      s += T(202, 14, '결정의 주인 ↓', { fs: 10.5, w: 750, c: 'fa-t' });
      return S('0 0 320 190', s, '상담의 7단계: 개인 자료, 자기 분석, 본인의 결정, 상담사 분석, 직업 세계 조망, 추론과 조언, 적응 돕기');
    },
    fundamentals: function () {
      var W16 = ['건강', '흥미', '끈기', '에너지', '철저함', '신속함', '믿음직함', '열정', '체계', '선견지명', '인내', '상식', '정직', '기억력', '판단력', '의지력'], s = '';
      W16.forEach(function (w, k) {
        var x = 10 + (k % 4) * 76, y = 10 + Math.floor(k / 4) * 44, on = k < 2;
        s += '<rect x="' + x + '" y="' + y + '" width="70" height="36" rx="11" class="' + (on ? 'fa' : 'fa-soft') + '"/>' + T(x + 35, y + 23, w, { fs: 12.5, w: on ? 800 : 650, c: on ? 'ft-on' : 'ft' });
      });
      return S('0 0 320 190', s, '어느 일에나 필요한 16가지 기본기');
    },
    eleven: function () {
      var L = ['사무·대리', '농업', '예술', '상업', '가사·개인 서비스', '어업', '제조', '기계·건축·건설', '전문·준전문', '운송', '그 밖'], s = '';
      L.forEach(function (w, k) {
        var row = Math.floor(k / 4), col = k % 4, n = row < 2 ? 4 : 3, wd = 72, gap = 6, x0 = (320 - (n * wd + (n - 1) * gap)) / 2;
        var x = x0 + col * (wd + gap), y = 12 + row * 58;
        s += '<rect x="' + x + '" y="' + y + '" width="' + wd + '" height="50" rx="12" class="fa-soft"/>' +
          T(x + 12, y + 20, two(k + 1), { fs: 10, w: 800, a: 'start', c: 'fa-t' }) + T(x + wd / 2, y + 38, w, { fs: w.length > 6 ? 9.5 : 11.5, w: 700 });
      });
      return S('0 0 320 190', s, '1909년 산업 11갈래');
    },
    demand: function () {
      var rows = [['상업·운송', 37, 62], ['전문 서비스', 12, 16]], s = '', max = 70, x0 = 92, wd = 196;
      rows.forEach(function (r, k) {
        var y = 34 + k * 70;
        s += T(10, y + 22, r[0], { fs: 12, w: 750, a: 'start' });
        s += '<g><title>' + r[0] + ' 1870년 인구 천 명당 ' + r[1] + '명</title><rect x="' + x0 + '" y="' + y + '" width="' + (wd * r[1] / max) + '" height="16" rx="4" class="fa-soft2"/></g>' + T(x0 + wd * r[1] / max + 6, y + 12.5, r[1] + '명', { fs: 11, a: 'start', c: 'fm' });
        s += '<g><title>' + r[0] + ' 1900년 인구 천 명당 ' + r[2] + '명</title><rect x="' + x0 + '" y="' + (y + 20) + '" width="' + (wd * r[2] / max) + '" height="16" rx="4" class="fa"/></g>' + T(x0 + wd * r[2] / max + 6, y + 32.5, r[2] + '명', { fs: 11, w: 800, a: 'start' });
      });
      s += '<line x1="' + x0 + '" y1="24" x2="' + x0 + '" y2="170" class="fs-m" stroke-width="1" opacity=".5"/>';
      s += '<rect x="92" y="6" width="10" height="10" rx="3" class="fa-soft2"/>' + T(106, 15, '1870년', { fs: 10.5, a: 'start', c: 'fm' }) +
        '<rect x="160" y="6" width="10" height="10" rx="3" class="fa"/>' + T(174, 15, '1900년', { fs: 10.5, a: 'start', c: 'fm' }) + T(316, 15, '인구 천 명당', { fs: 10, a: 'end', c: 'fm' });
      return S('0 0 320 180', s, '인구 천 명당 종사자 수: 상업·운송 1870년 37명에서 1900년 62명, 전문 서비스 12명에서 16명');
    },
    women: function () {
      var b = function (x, v, yr, on) { var h = v / 5.6 * 130; return '<g><title>' + yr + '년 여성 노동자 약 ' + v + '백만 명</title><rect x="' + x + '" y="' + (160 - h) + '" width="64" height="' + h + '" rx="5" class="' + (on ? 'fa' : 'fa-soft2') + '"/></g>' + T(x + 32, 152 - h, '약 ' + (v * 100) + '만', { fs: 12, w: on ? 800 : 600, c: on ? 'ft' : 'fm' }) + T(x + 32, 177, yr + '년', { fs: 11.5, w: 700, c: 'fm' }); };
      return S('0 0 320 190', '<line x1="40" y1="160" x2="280" y2="160" class="fs-m" stroke-width="1" opacity=".6"/>' + b(70, 1.8, 1870, false) + b(186, 5.3, 1900, true) +
        '<path d="M140 120 C160 100 170 80 182 66" class="fs-a" fill="none" stroke-width="2" stroke-dasharray="3 4"/><path d="M176 64 l8-1 -2 8" class="fs-a" fill="none" stroke-width="2"/>' + T(150, 92, '약 3배', { fs: 12, w: 800, c: 'fa-t' }),
        '미국 여성 노동자 1870년 약 180만 명에서 1900년 약 530만 명');
    },
    timeline: function () {
      var P = [[50, '1908.1', '직업국 개설'], [160, '1908.9', '파슨스 별세'], [270, '1909', '책 출간']], s = '<line x1="30" y1="96" x2="290" y2="96" class="fs-m" stroke-width="2"/>';
      P.forEach(function (p, k) { s += '<circle cx="' + p[0] + '" cy="96" r="' + (k === 2 ? 12 : 9) + '" class="' + (k === 2 ? 'fa' : k === 1 ? 'fm-f' : 'fa-soft2') + '"/>' + T(p[0], 70, p[1], { fs: 15, w: 850, c: 'fa-t' }) + T(p[0], 128, p[2], { fs: 12, w: 700 }); });
      s += '<rect x="226" y="140" width="88" height="34" rx="4" class="fpaper"/>' + T(270, 162, 'Choosing a Vocation', { fs: 8.5, w: 700, c: 'fserif' });
      return S('0 0 320 190', s, '1908년 1월 직업국 개설, 1908년 9월 파슨스 별세, 1909년 책 출간');
    },
    mottoes: function () {
      var M = [['빛', 'Light', '<circle cx="0" cy="0" r="7" class="fa"/><path d="M0-14v4M0 10v4M-14 0h4M10 0h4M-10-10l3 3M7 7l3 3M10-10l-3 3M-7 7l-3 3" class="fs-a" stroke-width="2" stroke-linecap="round"/>'],
        ['정보', 'Information', '<circle cx="0" cy="0" r="12" class="fs-a" fill="none" stroke-width="2.2"/><path d="M0-1v7" class="fs-a" stroke-width="2.6" stroke-linecap="round"/><circle cx="0" cy="-6" r="1.8" class="fa"/>'],
        ['영감', 'Inspiration', '<path d="M0-13 3-3 13 0 3 3 0 13-3 3-13 0-3-3z" class="fa"/>'],
        ['협력', 'Cooperation', '<circle cx="-5" cy="0" r="8" class="fs-a" fill="none" stroke-width="2.2"/><circle cx="5" cy="0" r="8" class="fs-a" fill="none" stroke-width="2.2"/>']], s = '';
      M.forEach(function (m, k) { var x = 10 + k * 77; s += '<rect x="' + x + '" y="20" width="69" height="150" rx="16" class="fa-soft"/><g transform="translate(' + (x + 34.5) + ' 62)">' + m[2] + '</g>' + T(x + 34.5, 112, m[0], { fs: 18, w: 850 }) + T(x + 34.5, 134, m[1], { fs: 9, c: 'fserif' }); });
      return S('0 0 320 190', s, '직업국의 네 가지 표어: 빛, 정보, 영감, 협력');
    },
    compare: function () {
      var R = ['흥미', '능력', '준비 기간', '전망'], s = T(132, 22, '길 A', { fs: 13, w: 800, c: 'fa-t' }) + T(250, 22, '길 B', { fs: 13, w: 800, c: 'fa-t' });
      R.forEach(function (r, k) {
        var y = 44 + k * 34, i;
        s += T(12, y + 13, r, { fs: 12, w: 700, a: 'start' });
        for (i = 0; i < 5; i++) { s += '<circle cx="' + (96 + i * 18) + '" cy="' + (y + 9) + '" r="6" class="fs-m" fill="none" stroke-width="1.5"/><circle cx="' + (214 + i * 18) + '" cy="' + (y + 9) + '" r="6" class="fs-m" fill="none" stroke-width="1.5"/>'; }
      });
      s += '<line x1="190" y1="34" x2="190" y2="176" class="fs-m" stroke-width="1" stroke-dasharray="3 4"/>' + T(160, 186, '빈칸은 직접 채워 보세요', { fs: 10.5, c: 'fm' });
      return S('0 0 320 192', s, '두 길을 흥미, 능력, 준비 기간, 전망 네 기준으로 나란히 놓고 채워 보는 빈 비교표');
    },
    halfwork: function () {
      return S('0 0 320 190',
        '<circle cx="160" cy="92" r="70" class="fa-soft"/><path d="M160 22 A70 70 0 0 1 160 162 Z" class="fa"/>' +
        '<rect x="104" y="80" width="30" height="22" rx="2" class="fs-i" fill="none" stroke-width="2.2"/><path d="M119 80 v22" class="fs-i" stroke-width="2"/>' +
        '<path d="M186 104 l16-16 m-4-8 a8 8 0 1 0 8 8" class="fs-on" fill="none" stroke-width="3" stroke-linecap="round"/>' +
        T(119, 124, '공부', { fs: 13, w: 800 }) + T(196, 124, '일', { fs: 13, w: 800, c: 'ft-on' }) + T(160, 184, '하루의 반 · 반', { fs: 11, c: 'fm' }),
        '하루의 반은 공부, 반은 일하는 학교 구상');
    }
  };
  var ICON = {
    book: '<path d="M8 12c8-4 16-4 24 0v40c-8-4-16-4-24 0z M32 12c8-4 16-4 24 0v40c-8-4-16-4-24 0z"/>',
    compass: '<circle cx="32" cy="32" r="22"/><path d="M40 24l-5 11-11 5 5-11z"/>',
    chat: '<path d="M10 14h32v20H24l-8 7v-7h-6z"/><path d="M46 24h8v18h-5v6l-7-6H30"/>',
    clipboard: '<rect x="14" y="12" width="36" height="44" rx="5"/><path d="M24 12v-4h16v4M22 28h20M22 36h20M22 44h12"/>',
    gauge: '<path d="M10 42a22 22 0 0 1 44 0"/><path d="M32 42l10-14"/><circle cx="32" cy="42" r="3"/>',
    grid: '<rect x="10" y="10" width="18" height="18" rx="4"/><rect x="36" y="10" width="18" height="18" rx="4"/><rect x="10" y="36" width="18" height="18" rx="4"/><rect x="36" y="36" width="18" height="18" rx="4"/>',
    chart: '<path d="M10 54h44"/><rect x="14" y="34" width="8" height="18" rx="2"/><rect x="28" y="22" width="8" height="30" rx="2"/><rect x="42" y="12" width="8" height="40" rx="2"/>',
    house: '<path d="M8 30L32 10l24 20"/><path d="M14 26v28h36V26"/><path d="M27 54V40h10v14"/>',
    notebook: '<rect x="14" y="8" width="36" height="48" rx="4"/><path d="M14 18h-4M14 30h-4M14 42h-4M22 20h20M22 28h20M22 36h14"/>',
    stamp: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="15"/><path d="M24 32h16"/>'
  };
  function icon(n) { return '<svg class="ico" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || ICON.book) + '</svg>'; }

  /* ---------- 카드 그리기 ---------- */
  function inner(c, ch) {
    var h = '';
    switch (c.type) {
      case 'cover':
        if (ch.no === 0) {
          h = '<div class="cv-fig">' + icon(c.fig) + '</div><div class="cv-no">1909</div>' +
            '<h2 class="cv-t">' + esc(BOOK.title) + '</h2><p class="cv-en">Choosing a Vocation · Frank Parsons</p>';
        } else {
          h = '<div class="cv-fig">' + icon(c.fig) + '</div><div class="cv-no">' + (numbered(ch) ? two(ch.no) : '+') + '</div>' +
            '<p class="cv-k">' + (numbered(ch) ? 'CHAPTER ' + two(ch.no) : 'APPENDIX') + '</p><h2 class="cv-t">' + esc(ch.title) + '</h2><p class="cv-en">' + esc(ch.en) + '</p>' +
            (numbered(ch) ? '<p class="cv-o">' + origLabel(ch) + '</p>' : '');
        }
        h += '<p class="cv-l">' + rich(c.lead) + '</p><span class="stamp" aria-hidden="true">1909<small>PUBLIC DOMAIN</small></span>';
        break;
      case 'quote':
        h = '<span class="q-mk" aria-hidden="true">“</span><blockquote class="q-en" lang="en">' + esc(c.en) + '</blockquote><p class="q-ko">' + rich(c.ko) + '</p>' +
          '<p class="q-ref">— 파슨스, ' + esc(c.ref) + '</p>' + (c.tail ? '<p class="bd sm">' + rich(c.tail) + '</p>' : '');
        break;
      case 'figure':
        h = '<h3 class="tt">' + rich(c.title) + '</h3><div class="fg">' + (FIG[c.fig] ? FIG[c.fig]() : '') + '</div><p class="bd sm">' + rich(c.body) + '</p>';
        break;
      case 'table':
        h = '<h3 class="tt">' + rich(c.title) + '</h3><div class="tb-w"><table class="tb c' + c.cols.length + '"><thead><tr>' + c.cols.map(function (x) { return '<th scope="col">' + rich(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          c.rows.map(function (r) { return '<tr>' + r.map(function (x, k) { return k === 0 ? '<th scope="row">' + rich(x) + '</th>' : '<td>' + rich(x) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></div>' + (c.body ? '<p class="bd sm mute">' + rich(c.body) + '</p>' : '');
        break;
      case 'chips':
        h = '<h3 class="tt">' + rich(c.title) + '</h3><p class="bd sm">' + rich(c.body) + '</p><ol class="chips">' + c.items.map(function (x, k) { return '<li><i>' + (k + 1) + '</i>' + rich(x) + '</li>'; }).join('') + '</ol>';
        break;
      case 'pairs':
        h = '<h3 class="tt">' + rich(c.title) + '</h3><ul class="pairs">' + c.items.map(function (p) { return '<li><span>' + rich(p[0]) + '</span><i aria-hidden="true"><b></b><b></b><b></b><b></b><b></b></i><span>' + rich(p[1]) + '</span></li>'; }).join('') + '</ul><p class="bd sm">' + rich(c.body) + '</p>';
        break;
      case 'now':
        h = '<p class="badge">2026 관점</p><h3 class="tt">' + rich(c.title) + '</h3><p class="bd">' + rich(c.body) + '</p>';
        break;
      case 'ask':
        h = '<p class="badge">✎ ' + esc(c.title) + '</p><p class="bd big">' + rich(c.body) + '</p><div class="lines" aria-hidden="true"><i></i><i></i><i></i></div>';
        break;
      case 'source':
        h = '<p class="badge">출처와 저작권</p><h3 class="tt">' + rich(c.title) + '</h3><p class="bd">' + rich(c.body) + '</p>' +
          (c.link ? '<a class="src-a" href="' + esc(c.link) + '"' + (/^https?:/.test(c.link) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(c.linkText || c.link) + ' ›</a>' : '');
        break;
      default:
        h = (c.title ? '<h3 class="tt">' + rich(c.title) + '</h3>' : '') + '<p class="bd">' + rich(c.body) + '</p>';
    }
    return h;
  }
  function cardHTML(idx, extra) {
    var it = CARDS[idx]; if (!it) return '<article class="cd blank' + (extra ? ' ' + extra : '') + '"><div class="cd-in"><p class="end">끝까지 읽었습니다.<br><small>처음부터 다시 보려면 차례를 누르십시오.</small></p></div></article>';
    var c = it.c, ch = it.ch;
    return '<article class="cd t-' + c.type + (extra ? ' ' + extra : '') + '" style="--h:' + ch.hue + '" data-i="' + idx + '"' + (extra ? '' : ' id="p' + (idx + 1) + '"') + ' aria-label="' + (idx + 1) + '쪽">' +
      '<header class="cd-top"><span class="cd-ch">' + esc(chLabel(ch)) + '</span><span class="cd-pg">' + (idx + 1) + ' / ' + N + '</span></header>' +
      '<div class="cd-in">' + inner(c, ch) + '</div></article>';
  }

  /* ---------- 공통: 위치 ---------- */
  function chapterOf(i) { var k; for (k = CH.length - 1; k >= 0; k--) if (i >= CH[k].start) return k; return 0; }
  function setPos(i, push) {
    st.i = Math.max(0, Math.min(N - 1, i));
    set(PK, String(st.i));
    var h = '#p' + (st.i + 1);
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) {} }
    var k = chapterOf(st.i), ch = CH[k];
    $('where').textContent = chLabel(ch);
    $('prog').style.transform = 'scaleX(' + ((st.i + 1) / N) + ')';
    Array.prototype.forEach.call(d.querySelectorAll('#tocList a'), function (a) { a.setAttribute('aria-current', String(+a.getAttribute('data-k') === k)); });
    paintSegs();
  }

  /* ---------- ① 세로로 쭉 ---------- */
  var io = null;
  function renderScroll() {
    $('reader').innerHTML = '<div class="scroll">' + CARDS.map(function (_, i) { return cardHTML(i); }).join('') + '</div>';
    if (io) io.disconnect();
    if ('IntersectionObserver' in W) {
      io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) setPos(+e.target.getAttribute('data-i')); });
      }, { rootMargin: '-45% 0px -45% 0px' });
      Array.prototype.forEach.call(d.querySelectorAll('.scroll .cd'), function (el) { io.observe(el); });
    }
  }
  function scrollTo(i, smooth) {
    var el = $('p' + (i + 1)); if (!el) return;
    var y = el.getBoundingClientRect().top + W.pageYOffset - 12;
    W.scrollTo({ top: y, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  /* ---------- ② 한 장씩 ---------- */
  function ctlHTML() {
    return '<div class="ctl"><button type="button" class="nb" id="bPrev" aria-label="이전 장"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<span class="cnt" id="cnt" aria-live="polite"></span>' +
      '<button type="button" class="nb pri" id="bNext" aria-label="다음 장"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>';
  }
  function segsHTML() {
    return '<div class="segs" id="segs" aria-hidden="true">' + CH.map(function (ch) { return '<span style="--h:' + ch.hue + ';flex:' + ch.count + '"><i></i></span>'; }).join('') + '</div>';
  }
  function paintSegs() {
    var s = $('segs'); if (!s) return;
    Array.prototype.forEach.call(s.children, function (el, k) {
      var ch = CH[k], f = st.i >= ch.start + ch.count ? 1 : st.i < ch.start ? 0 : (st.i - ch.start + 1) / ch.count;
      el.firstChild.style.transform = 'scaleX(' + f + ')';
    });
  }
  function renderCard() {
    $('reader').innerHTML = '<div class="deck">' + segsHTML() + '<div class="stage" id="stage"><div class="slot" id="slot"></div></div>' + ctlHTML() + '</div>';
    showCard(st.i, 0);
    bindNav($('stage'));
  }
  function showCard(i, dir) {
    i = Math.max(0, Math.min(N - 1, i));
    var slot = $('slot'); if (!slot) return;
    slot.innerHTML = cardHTML(i, 'solo');
    var el = slot.firstChild;
    if (dir && !reduce) { el.classList.add(dir > 0 ? 'in-r' : 'in-l'); el.offsetWidth; el.classList.remove('in-r', 'in-l'); }
    setPos(i); updCtl();
  }
  function updCtl() {
    var a = $('bPrev'), b = $('bNext'), c = $('cnt'); if (!c) return;
    if (st.mode === 'book' && st.per === 2) {
      var s = st.i - st.i % 2;
      c.innerHTML = '<b>' + (s + 1) + (s + 2 <= N ? '–' + (s + 2) : '') + '</b> / ' + N;
      a.disabled = s <= 0; b.disabled = s + 2 >= N;
    } else {
      c.innerHTML = '<b>' + (st.i + 1) + '</b> / ' + N;
      a.disabled = st.i <= 0; b.disabled = st.i >= N - 1;
    }
  }

  /* ---------- ③ 책처럼 펼쳐 ---------- */
  function renderBook() {
    $('reader').innerHTML = '<div class="bk-w">' + segsHTML() + '<div class="bk" id="bk"><div class="spread" id="spread"></div></div>' + ctlHTML() + '</div>';
    paintSpread();
    bindNav($('bk'));
  }
  function paintSpread() {
    var sp = $('spread'); if (!sp) return;
    sp.className = 'spread per' + st.per;
    if (st.per === 2) {
      var s = st.i - st.i % 2;
      sp.innerHTML = '<div class="pg L" id="pgL">' + cardHTML(s, 'page') + '</div><div class="pg R" id="pgR">' + cardHTML(s + 1, 'page') + '</div><i class="spine" aria-hidden="true"></i>';
    } else {
      sp.innerHTML = '<div class="pg R one" id="pgR">' + cardHTML(st.i, 'page') + '</div>';
    }
    setPos(st.i); updCtl();
  }
  function flip(dir) {
    if (st.busy) return;
    var per = st.per, s = per === 2 ? st.i - st.i % 2 : st.i, t = s + dir * per;
    if (t < 0 || t >= N) return;
    if (reduce) { st.i = t; paintSpread(); return; }
    var sp = $('spread'), L = $('pgL'), R = $('pgR'), leaf = d.createElement('div');
    st.busy = true; closePop();
    leaf.className = 'leaf ' + (dir > 0 ? 'fwd' : 'back') + (per === 1 ? ' one' : '');
    if (per === 2) {
      if (dir > 0) { leaf.innerHTML = face(s + 1, 'front') + face(s + 2, 'backf'); R.innerHTML = cardHTML(s + 3, 'page'); }
      else { leaf.innerHTML = face(s, 'front') + face(s - 1, 'backf'); L.innerHTML = cardHTML(s - 2, 'page'); }
    } else {
      if (dir > 0) { leaf.innerHTML = face(s, 'front') + '<div class="face backf paper"></div>'; R.innerHTML = cardHTML(t, 'page'); }
      else { leaf.innerHTML = face(t, 'front'); leaf.classList.add('from'); }
    }
    sp.appendChild(leaf);
    leaf.offsetWidth;
    leaf.classList.add('go');
    var done = false, end = function () {
      if (done) return; done = true;
      st.i = t; st.busy = false;
      paintSpread();
    };
    leaf.addEventListener('transitionend', function (e) { if (e.target === leaf && e.propertyName.indexOf('transform') >= 0) end(); });
    setTimeout(end, 1100);
  }
  function face(i, cls) { return '<div class="face ' + cls + '">' + cardHTML(i, 'page') + '<i class="shade" aria-hidden="true"></i></div>'; }

  /* ---------- 넘기기: 누르기·밀기·건반 ---------- */
  function step(dir) {
    if (st.mode === 'card') showCard(st.i + dir, dir);
    else if (st.mode === 'book') flip(dir);
    else scrollTo(st.i + dir, true);
  }
  function bindNav(area) {
    var x0 = 0, y0 = 0, t0 = 0, on = false, swallow = false;
    area.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      on = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now();
      swallow = popOpen() && !e.target.closest('.gl');
    });
    area.addEventListener('pointerup', function (e) {
      if (!on) return; on = false;
      if (swallow) { swallow = false; return; }
      if (e.target.closest('.gl, a, button, .tb-w')) return;
      if (W.getSelection && String(W.getSelection()).length > 0) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { step(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - t0 < 600) {
        var r = area.getBoundingClientRect();
        step(e.clientX - r.left < r.width * (st.mode === 'book' && st.per === 2 ? 0.5 : 0.35) ? -1 : 1);
      }
    });
    area.addEventListener('pointercancel', function () { on = false; });
    $('bPrev').addEventListener('click', function () { step(-1); });
    $('bNext').addEventListener('click', function () { step(1); });
  }
  d.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'Escape') { closePop(); closeSheet(); return; }
    if (st.mode === 'scroll' || sheetOpen()) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); step(-1); }
  });

  /* ---------- 크기 맞추기 ---------- */
  function fit() {
    var r = $('reader'), w = r.clientWidth, vh = W.innerHeight;
    var avail = Math.max(360, vh - 150);
    var cw = Math.min(520, w, Math.floor(avail * 0.8));
    r.style.setProperty('--cw', cw + 'px');
    var per = w >= 720 && W.innerWidth > W.innerHeight * 0.95 ? 2 : 1;
    var pw = Math.min(per === 2 ? Math.floor(w / 2) : w, Math.floor(avail * 0.8), 540);
    r.style.setProperty('--pw', pw + 'px');
    if (st.mode === 'book' && per !== st.per) { st.per = per; if ($('spread')) paintSpread(); }
    st.per = per;
  }
  var rT = 0;
  W.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { fit(); updCtl(); }, 120); });

  /* ---------- 읽기 방식 바꾸기 ---------- */
  function setMode(m, keep) {
    if (MODES.indexOf(m) < 0) m = 'scroll';
    st.mode = m; set(MK, m); closePop();
    d.body.setAttribute('data-mode', m);
    Array.prototype.forEach.call(d.querySelectorAll('[data-mode-btn]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode-btn') === m)); });
    fit();
    if (m === 'scroll') { renderScroll(); setPos(st.i); if (st.i > 0 || keep) scrollTo(st.i, false); }
    else {
      if (io) { io.disconnect(); io = null; }
      if (m === 'card') renderCard(); else renderBook();
      if (keep) { var y = $('bar').getBoundingClientRect().top + W.pageYOffset - 6; if (Math.abs(W.pageYOffset - y) > 4) W.scrollTo(0, y); }
    }
  }
  function go(i) {
    closeSheet();
    st.i = Math.max(0, Math.min(N - 1, i));
    if (st.mode === 'scroll') { setPos(st.i); scrollTo(st.i, true); }
    else if (st.mode === 'card') showCard(st.i, 0);
    else paintSpread();
  }

  /* ---------- 1909 → 2026 띄움 ---------- */
  var pop = null, popFor = null;
  function popOpen() { return pop && !pop.hidden; }
  function closePop() { if (!pop || pop.hidden) return; pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
  function openPop(btn) {
    var t = G[btn.getAttribute('data-k')]; if (!t) return;
    if (popFor === btn) { closePop(); return; }
    closePop();
    pop.innerHTML = '<div class="pp-sw"><span class="pp-old"><small>1909 · ' + esc(t.en) + '</small><s>' + esc(t.then) + '</s></span>' +
      '<span class="pp-ar" aria-hidden="true">→</span><span class="pp-new"><small>오늘이라면</small><b>' + esc(t.now) + '</b></span></div>' +
      '<p class="pp-n">' + esc(t.note) + '</p>';
    pop.hidden = false; popFor = btn; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('seen');
    pop.classList.remove('show'); pop.offsetWidth; pop.classList.add('show');
    var r = btn.getBoundingClientRect(), vw = d.documentElement.clientWidth, vh = W.innerHeight;
    var pw = Math.min(320, vw - 24); pop.style.width = pw + 'px';
    var left = Math.max(12, Math.min(vw - pw - 12, r.left + r.width / 2 - pw / 2));
    var ph = pop.offsetHeight, top = r.bottom + 10;
    if (top + ph > vh - 8 && r.top - ph - 10 > 8) top = r.top - ph - 10;
    pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
  }
  d.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('.gl');
    if (g) { e.preventDefault(); e.stopPropagation(); openPop(g); }
  });
  d.addEventListener('pointerdown', function (e) {
    if (!popOpen()) return;
    if (e.target.closest('#pop') || e.target.closest('.gl')) return;
    closePop();
  }, true);
  W.addEventListener('scroll', function () { closePop(); }, { passive: true });

  /* ---------- 차례·책 정보 ---------- */
  var lastFocus = null;
  function sheetOpen() { return !$('sheet').hidden; }
  function openSheet(which) {
    lastFocus = d.activeElement;
    $('sheet').hidden = false; d.body.classList.add('sheet-on');
    $('tocPane').hidden = which !== 'toc'; $('aboutPane').hidden = which !== 'about';
    $('sheetTitle').textContent = which === 'toc' ? '차례' : '이 책에 대해';
    setTimeout(function () { $('sheetClose').focus(); }, 30);
  }
  function closeSheet() { if (!sheetOpen()) return; $('sheet').hidden = true; d.body.classList.remove('sheet-on'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function buildSheets() {
    $('tocList').innerHTML = CH.map(function (ch, k) {
      return '<li><a href="#p' + (ch.start + 1) + '" data-k="' + k + '" style="--h:' + ch.hue + '"><span class="tn">' + (numbered(ch) ? two(ch.no) : (ch.no === 0 ? '서' : '+')) + '</span>' +
        '<span class="tx"><b>' + esc(ch.title) + '</b><small>' + esc(ch.en) + (numbered(ch) ? ' · ' + origLabel(ch) : '') + ' · ' + ch.count + '장</small></span></a></li>';
    }).join('');
    $('tocList').addEventListener('click', function (e) { var a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(CH[+a.getAttribute('data-k')].start); });
    var s = BOOK.source;
    $('aboutPane').innerHTML =
      '<dl class="src-dl"><dt>원문</dt><dd>' + esc(s.author) + ', <i>' + esc(s.title) + '</i>, ' + esc(s.publisher) + ', ' + s.year + ' (' + esc(s.edition) + ')</dd>' +
      '<dt>공개 원문</dt><dd><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a><br><small>' + esc(s.scan) + '</small></dd>' +
      '<dt>구성</dt><dd>' + esc(s.structure) + '</dd>' +
      '<dt>장 대응</dt><dd><ul class="map">' + CH.filter(numbered).map(function (ch) { return '<li><b>' + two(ch.no) + ' ' + esc(ch.title) + '</b> ← ' + origLabel(ch) + '</li>'; }).join('') + '</ul></dd>' +
      '<dt>저작권</dt><dd><ul class="rt">' + BOOK.rights.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></dd></dl>';
  }

  /* ---------- 시작 ---------- */
  function boot() {
    pop = $('pop');
    buildSheets();
    var m = get(MK), h = /^#p(\d+)$/.exec(location.hash), p = +get(PK);
    if (MODES.indexOf(m) < 0) m = W.innerWidth >= 1000 && W.innerWidth > W.innerHeight ? 'book' : 'scroll';
    var saved = p > 0 && p < N ? p : 0;
    st.i = h ? Math.max(0, Math.min(N - 1, +h[1] - 1)) : (m === 'scroll' ? 0 : saved);
    if (!h && m === 'scroll' && saved > 0) {
      var rb = $('resume'); rb.hidden = false; rb.querySelector('b').textContent = (saved + 1) + '쪽';
      rb.addEventListener('click', function () { rb.hidden = true; go(saved); });
    }
    Array.prototype.forEach.call(d.querySelectorAll('[data-mode-btn]'), function (b) { b.addEventListener('click', function () { if (st.mode !== b.getAttribute('data-mode-btn')) setMode(b.getAttribute('data-mode-btn'), true); }); });
    $('btnToc').addEventListener('click', function () { openSheet('toc'); });
    $('dockToc').addEventListener('click', function () { openSheet('toc'); });
    /* 세로 읽기에서 위쪽 단추 줄이 화면 밖으로 나가면, 아래에 작은 단추 묶음을 띄운다(읽던 자리를 잃지 않고 방식을 바꾸도록). */
    if ('IntersectionObserver' in W) new IntersectionObserver(function (es) { d.body.classList.toggle('bar-off', !es[0].isIntersecting && es[0].boundingClientRect.top < 0); }).observe($('bar'));
    $('btnAbout').addEventListener('click', function () { openSheet('about'); });
    $('sheetClose').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    $('cards').textContent = N;
    setMode(m, !!h);
    W.addEventListener('hashchange', function () { var x = /^#p(\d+)$/.exec(location.hash); if (x && +x[1] - 1 !== st.i) go(+x[1] - 1); });
  }

  /* 이용 안내 접고 펼치기 */
  (function () {
    var b = $('pvToggle'), box = $('pv'), body = $('pvBody'), lab = $('pvLabel');
    if (!b) return;
    b.addEventListener('click', function () {
      var on = !box.classList.contains('open');
      box.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); lab.textContent = on ? '접기' : '펼치기';
      if (on) body.removeAttribute('inert'); else body.setAttribute('inert', '');
    });
  })();

  load();
})();
