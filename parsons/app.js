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
  /* 넘기는 동안에는 다른 모듈(assets/marker.js 의 형광펜 재그리기 등)이 문서 전체를 다시 재지 않도록 알린다.
     그런 재측정이 넘김 도중에 끼어들면 한 프레임을 통째로 잡아먹어 60Hz 에서도 툭 끊긴다. */
  function setBusy(v) { var was = !!W.JC_BUSY; st.busy = v; W.JC_BUSY = v; if (was !== !!v) try { W.dispatchEvent(new CustomEvent('jc-busy', { detail: !!v })); } catch (e) {} }   // 도구함(포스트잇)이 넘김 시작·끝을 알 수 있게
  var pulseT = 0;
  /* 짧은 전환(한 장씩 보기·차례 점프)도 넘김과 같은 신호를 보낸다.
     포스트잇이 옅게 사라졌다가 새 자리에서 떠오르는 것은 이 신호 하나로 결정된다. */
  function pulseBusy(ms) {
    setBusy(true); clearTimeout(pulseT);
    pulseT = setTimeout(function () { setBusy(false); }, ms || 280);
  }

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
    stopFlip();
    $('reader').removeAttribute('data-jc-still');
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
    stopFlip();
    $('reader').removeAttribute('data-jc-still');
    $('reader').innerHTML = '<div class="deck">' + segsHTML() + '<div class="stage" id="stage"><div class="slot" id="slot"></div></div>' + ctlHTML() + '</div>';
    showCard(st.i, 0);
    bindNav($('stage'));
  }
  function showCard(i, dir) {
    i = Math.max(0, Math.min(N - 1, i));
    var slot = $('slot'); if (!slot) return;
    /* 한 장씩 보기도 쪽이 바뀌는 전환이다. 포스트잇은 이 신호에 옅게 숨었다가 새 자리에서 떠오른다
       (예전에는 다시 그리기가 350ms 늦게 돌아 새 쪽에서 메모가 늦게 튀어나왔다). */
    if (dir && !reduce) pulseBusy(260);
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

  /* ---------- ③ 책처럼 펼쳐 ----------
     페이지 칸(.pg)은 한 번만 만들어 두고 내용만 바꾼다. 넘김이 끝날 때 펼침면을 통째로
     갈아엎으면 브라우저가 새로 그리는 동안 한두 프레임이 비어 깜빡이므로, 낱장이 덮고 있는
     동안 목표 쪽을 미리 그려 두고 한 프레임 뒤에 낱장을 걷는다. */
  function cardNode(i) {
    var box = d.createElement('div');
    box.innerHTML = cardHTML(i, 'page');
    return box.firstChild;
  }
  function setPage(pg, i) {
    if (!pg) return;
    if (i == null) {
      if (pg.firstChild || pg.dataset.i) { pg.removeAttribute('data-i'); pg.replaceChildren(); }
      return;
    }
    if (pg.dataset.i === String(i) && pg.firstChild) return;   // 이미 그 쪽이면 건드리지 않는다
    pg.dataset.i = String(i);
    pg.replaceChildren(cardNode(i));
  }
  function dropCasts() {
    Array.prototype.forEach.call(d.querySelectorAll('.pg .cast'), function (c) { c.remove(); });
  }
  function renderBook() {
    stopFlip();
    /* 책 보기에서는 쪽이 갈릴 때마다 새 덩어리 등장 모션(.jc-in)이 겹치지 않게 한다.
       넘기는 동작 자체가 전환이라, 그 위에 또 페이드인이 생기면 끝마다 화면이 한 번 번진다. */
    $('reader').setAttribute('data-jc-still', '');
    $('reader').innerHTML = '<div class="bk-w">' + segsHTML() + '<div class="bk" id="bk"><div class="spread" id="spread"><div class="pg L" id="pgL" hidden></div><div class="pg R" id="pgR"></div><i class="spine" aria-hidden="true"></i></div></div>' + ctlHTML() + '</div>';
    paintSpread();
    sizeOne();
    bindNav($('bk'));
  }
  function paintSpread() {
    var sp = $('spread'); if (!sp) return;
    var per = st.per, L = $('pgL'), R = $('pgR');
    if (sp.dataset.per !== String(per)) {
      sp.classList.toggle('per2', per === 2);
      sp.classList.toggle('per1', per !== 2);
      sp.dataset.per = String(per);
      L.hidden = per !== 2;
      R.classList.toggle('one', per !== 2);
    }
    if (per === 2) {
      var s = st.i - st.i % 2;
      setPage(L, s); setPage(R, s + 1);
    } else {
      setPage(L, null); setPage(R, st.i);
    }
    dropCasts();
    setPos(st.i); updCtl();
  }
  /* 한 쪽 보기(좁은 화면)에서는 종이 한 장이 화면에 꼭 들어오게 잡는다. 위의 머리말·단추가
     차지한 만큼을 빼고 남은 높이를 재서, 가로로 꽉 차면서 넘침 없이 들어가는 크기를 고른다. */
  function sizeOne() {
    var r = $('reader'), sp = $('spread');
    if (!r || !sp) return;
    if (st.mode !== 'book' || st.per !== 1 || W.innerWidth > 700) {
      if (r.style.getPropertyValue('--ph')) r.style.removeProperty('--ph');
      return;
    }
    var vh = W.innerHeight, w = r.clientWidth;
    var top = sp.getBoundingClientRect().top + W.pageYOffset;
    var room = Math.max(240, vh - top - 84);          // 아래 단추·여백을 빼고 남는 높이
    var pw = Math.round(Math.min(w, 540, room / 1.35));
    var ph = Math.round(Math.min(room, pw * 1.35));
    if (pw < 200) { pw = Math.max(200, Math.round(w * .9)); ph = Math.round(pw * 1.35); }
    if (r.style.getPropertyValue('--pw') !== pw + 'px') r.style.setProperty('--pw', pw + 'px');
    if (r.style.getPropertyValue('--ph') !== ph + 'px') r.style.setProperty('--ph', ph + 'px');
  }
  /* 책장 넘김: 진행값 p(0→1) 하나로 낱장 각도·낱장 음영·아래 쪽에 드리우는 그림자를 함께 그린다.
     모든 그림자는 p=0과 p=1에서 0이 되도록 잡아, 끌기 시작·놓기·내려앉은 직후에 끊김 없이 이어진다. */
  var fl = null;
  function buildFlip(dir) {
    if (st.busy || fl) return null;
    var per = st.per, s = per === 2 ? st.i - st.i % 2 : st.i, t = s + dir * per;
    if (t < 0 || t >= N) return null;
    var sp = $('spread'), L = $('pgL'), R = $('pgR'); if (!sp || !R) return null;
    var leaf = d.createElement('div'), under = null, cover = null, front, back;
    closePop();
    leaf.className = 'leaf ' + (dir > 0 ? 'fwd' : 'back') + (per === 1 ? ' one' : '');
    /* 낱장 앞면 = 지금 보이는 쪽, 뒷면 = 넘어가며 드러날 쪽.
       낱장에 덮인 채로 다음 쪽을 미리 그려 두어야 들추는 순간 빈 면이 보이지 않는다. */
    if (per === 2) {
      if (dir > 0) { front = s + 1; back = s + 2; setPage(R, s + 3); under = R; cover = L; }
      else { front = s; back = s - 1; setPage(L, s - 2); under = L; cover = R; }
    } else {
      if (dir > 0) { front = s; back = t; setPage(R, t); under = R; }
      else { front = t; back = s; cover = R; }
    }
    leaf.appendChild(faceNode(front, 'front'));
    leaf.appendChild(faceNode(back, 'backf'));
    var mk = function (pg) { if (!pg) return null; var c = d.createElement('i'); c.className = 'cast'; c.setAttribute('aria-hidden', 'true'); pg.appendChild(c); return c; };
    var sh = leaf.querySelectorAll('.shade');
    fl = { dir: dir, per: per, t: t, leaf: leaf, p: 0, raf: 0,
      fs: sh[0], bs: sh[1], uc: mk(under), cc: mk(cover) };
    sp.appendChild(leaf);
    drawFlip(0);
    return fl;
  }
  function drawFlip(p) {
    if (!fl) return;
    p = Math.max(0, Math.min(1, p)); fl.p = p;
    var a;
    if (fl.per === 1 && fl.dir < 0) a = -180 * (1 - p);   // 한 쪽 보기에서 뒤로: 왼쪽 밖에서 들어온다
    else a = fl.dir > 0 ? -180 * p : 180 * p;
    fl.leaf.style.transform = 'rotateY(' + a.toFixed(2) + 'deg)';
    var lift = Math.sin(Math.PI * p);                      // 0 → 1(낱장이 섰을 때) → 0
    // 낱장 음영: 들릴수록 짙어지고 눕을수록 옅어진다(앞·뒷면 중 보이는 면에만 보인다)
    var ls = Math.min(1, lift * 1.1).toFixed(3);
    if (fl.fs) fl.fs.style.opacity = ls;
    if (fl.bs) fl.bs.style.opacity = ls;
    // 드러나는 쪽: 낱장이 막 들렸을 때 접힘부 그림자가 짙고, 멀어질수록 옅어진다
    if (fl.uc) fl.uc.style.opacity = (Math.pow(1 - p, 1.4) * Math.min(1, p * 6)).toFixed(3);
    // 덮이는 쪽: 낱장이 다가올수록 짙어지다 내려앉으며 0
    if (fl.cc) fl.cc.style.opacity = (p > .5 ? Math.sin((p - .5) * 2 * Math.PI) * .9 : 0).toFixed(3);
  }
  function animFlip(to, ms, ease) {
    if (!fl) return;
    var f = fl, from = f.p, t0 = -1;
    setBusy(true);
    cancelAnimationFrame(f.raf);
    drawFlip(from);                            // 시작 자세를 먼저 확정한다
    var tick = function (now) {
      /* 첫 프레임은 새로 만든 낱장·다음 쪽을 실제로 그리는 데 쓰고, 시계는 그다음 프레임부터.
         (같은 프레임에서 시계를 시작하면 레이아웃·래스터 시간만큼 진행값이 건너뛰어 앞부분이 툭 튄다) */
      if (t0 < 0) { t0 = now; f.raf = requestAnimationFrame(tick); return; }
      var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      drawFlip(from + (to - from) * ease(k));
      if (k < 1) f.raf = requestAnimationFrame(tick);
      else endFlip(to >= 1);
    };
    f.raf = requestAnimationFrame(tick);
  }
  function endFlip(commit) {
    if (!fl) return;
    var f = fl;
    cancelAnimationFrame(f.raf);
    if (commit) st.i = f.t;
    /* 목표 쪽을 낱장이 덮고 있는 동안 먼저 그려 둔다. 낱장이 보여 주던 면과 같은 내용이라
       바뀌는 것이 보이지 않고, 한 프레임 뒤에 낱장을 걷어도 이미 그려진 면이 드러난다. */
    paintSpread();
    /* 낱장은 제자리에 내려앉은 자세 그대로 잠시 더 둔다. 그 면과 아래에 새로 그린 쪽이 같은 그림이라
       걷어도 바뀌는 것이 없고, 그 사이에 아래 쪽이 실제로 그려져 다음 프레임에 빈 면이 드러나지 않는다. */
    var n = 0, start = 0, done = false, to;
    var finish = function () { if (done) return; done = true; clearTimeout(to); dropLeaf(f); };
    to = setTimeout(finish, 420);           // 화면이 가려 rAF 가 멈춰도 낱장이 남지 않게
    var step = function (now) {
      if (!start) start = now;
      n++;
      if (n >= 2 && now - start >= 120) finish();
      else f.raf = requestAnimationFrame(step);
    };
    f.raf = requestAnimationFrame(step);
  }
  function dropLeaf(f) {
    if (f.leaf && f.leaf.parentNode) f.leaf.parentNode.removeChild(f.leaf);
    if (fl === f) fl = null;
    setBusy(false);
    dropCasts();
  }
  /* ---------- ③-b 한 쪽 보기: 떼어 내기 · 페이드인 ----------
     한 쪽 보기(모바일)에는 3D 낱장·접힘 음영·그림자 갱신이 없다. 넘기는 동안 움직이는 값은
     transform 과 opacity 두 가지뿐이고, 그마저 브라우저 합성기(compositor)가 처리한다.
     JS 프레임 루프도, 레이아웃도, 페인트도 넘김 중에는 없다 — 화면 주사율(60·120·144Hz)을
     그대로 따라간다.
       다음 쪽: 보던 종이가 위 모서리에서 떼어져 비스듬히 떨어지며 옅어진다. 떼는 동안에도
                아래에는 다음 쪽이 이미 그려져 있어 빈 면이 드러나지 않는다.
       이전 쪽: 새 종이가 살짝 비껴 있다가 제자리에 안착하며 나타난다(페이드인). */
  var mfl = null;
  var CAN_ANIM = !!(W.Element && W.Element.prototype && W.Element.prototype.animate);
  var KF_TEAR = [
    { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
    { transform: 'translate3d(-.5%,-1.2%,0) rotate(-2.2deg) scale(1.004)', opacity: 1, offset: .12 },
    { transform: 'translate3d(1.6%,7%,0) rotate(1.8deg) scale(.982)', opacity: .84, offset: .4 },
    { transform: 'translate3d(5%,16%,0) rotate(5deg) scale(.935)', opacity: .34, offset: .7 },
    { transform: 'translate3d(9%,24%,0) rotate(8.5deg) scale(.9)', opacity: 0, offset: 1 }
  ];
  var KF_FADE = [
    { transform: 'translate3d(-3%,2.2%,0)', opacity: 0, offset: 0 },
    { transform: 'translate3d(0,0,0)', opacity: 1, offset: 1 }
  ];
  function mLeaf(i) {
    var el = d.createElement('div');
    el.className = 'mleaf';
    el.setAttribute('aria-hidden', 'true');
    el.appendChild(cardNode(i));
    return el;
  }
  function mBuild(dir) {
    if (mfl) return null;
    var s = st.i, t = s + dir;
    if (t < 0 || t >= N) return null;
    var sp = $('spread'), R = $('pgR');
    if (!sp || !R) return null;
    closePop();
    var layer = mLeaf(dir > 0 ? s : t), kf, dur, ease;
    if (dir > 0) {
      setPage(R, t);                       // 떼는 종이 아래에 다음 쪽을 먼저 깔아 둔다
      layer.classList.add('tear');
      kf = KF_TEAR; dur = 520; ease = 'cubic-bezier(.33,.42,.26,1)';
    } else {
      layer.classList.add('fade');
      kf = KF_FADE; dur = 400; ease = 'cubic-bezier(.22,.68,.24,1)';
    }
    sp.appendChild(layer);
    var anim = null;
    if (CAN_ANIM) {
      anim = layer.animate(kf, { duration: dur, easing: ease, fill: 'both' });
      anim.pause(); anim.currentTime = 0;
    }
    setBusy(true);
    mfl = { dir: dir, s: s, t: t, layer: layer, anim: anim, dur: dur, p: 0, timer: 0 };
    return mfl;
  }
  function mSeek(p) {                       // 끄는 동안: 진행값만 옮긴다(합성기 값 두 개)
    if (!mfl) return;
    p = Math.max(0, Math.min(1, p)); mfl.p = p;
    if (mfl.anim) mfl.anim.currentTime = p * mfl.dur;
  }
  function mPlay(to, ms) {                  // 놓았을 때: 남은 만큼만 이어서 GPU 로 완결
    var f = mfl; if (!f) return;
    if (!f.anim) { mFinish(to >= .5); return; }
    var rest = Math.abs(to - f.p);
    if (rest < .002) { mFinish(to >= .5); return; }
    clearTimeout(f.timer);
    f.anim.playbackRate = (to > f.p ? 1 : -1) * (rest * f.dur) / Math.max(120, ms);
    f.anim.onfinish = function () { mFinish(to >= .5); };
    f.anim.play();
    f.timer = setTimeout(function () { mFinish(to >= .5); }, ms + 400);   // 화면이 가려도 남지 않게
  }
  function mFinish(commit) {
    var f = mfl; if (!f) return;
    mfl = null; clearTimeout(f.timer);
    if (f.anim) { f.anim.onfinish = null; try { f.anim.cancel(); } catch (_) {} }
    if (commit) st.i = f.t;
    var R = $('pgR');
    /* 이전 쪽으로 갈 때는 방금 나타난 종이를 그대로 바닥 칸으로 옮긴다. 같은 DOM 이라
       다시 그리지 않고, 옮기는 순간에도 화면에 보이는 것은 같은 그림이다(빈 면 0). */
    if (commit && f.dir < 0 && R && f.layer.firstChild) { R.dataset.i = String(f.t); R.replaceChildren(f.layer.firstChild); }
    if (f.layer.parentNode) f.layer.parentNode.removeChild(f.layer);
    paintSpread();          // 새 면을 먼저 그린 뒤에 넘김을 풀어, 포스트잇이 새 자리에서 떠오르게 한다
    setBusy(false);
  }
  function mStop() {
    var f = mfl; if (!f) return false;
    mfl = null; clearTimeout(f.timer);
    if (f.anim) { f.anim.onfinish = null; try { f.anim.cancel(); } catch (_) {} }
    if (f.layer && f.layer.parentNode) f.layer.parentNode.removeChild(f.layer);
    return true;
  }
  function mFlip(dir) {
    if (mfl) return;
    if (!mBuild(dir)) return;
    mPlay(1, mfl.dir > 0 ? 520 : 400);
  }
  function mRelease(cancel, v) {            // v: 넘기는 방향으로의 손가락 속도(px/ms)
    var f = mfl; if (!f) return;
    var go = !cancel && (f.p > .32 || (v > .5 && f.p > .04)) && !(v < -.4);
    mPlay(go ? 1 : 0, go ? Math.max(130, 330 * (1 - f.p)) : Math.max(130, 240 * f.p));
  }
  function stopFlip() {                     // 보기 방식을 바꾸거나 크기가 달라질 때 낱장을 즉시 거둔다
    var hadM = mStop();
    var f = fl;
    fl = null;
    if (f) {
      cancelAnimationFrame(f.raf);
      if (f.leaf && f.leaf.parentNode) f.leaf.parentNode.removeChild(f.leaf);
    }
    dropCasts();
    /* 거둔 뒤에 면을 맞추고, 마지막에 넘김을 풀어 포스트잇이 새 자리에서 떠오르게 한다 */
    if (hadM && $('spread') && st.mode === 'book') paintSpread();
    setBusy(false);
  }
  var easeIO = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  var easeOut = function (k) { return 1 - Math.pow(1 - k, 3); };
  function flip(dir) {
    if (st.busy || fl || mfl) return;
    var per = st.per, s = per === 2 ? st.i - st.i % 2 : st.i, t = s + dir * per;
    if (t < 0 || t >= N) return;
    if (reduce) { st.i = t; paintSpread(); return; }
    if (per === 1 && CAN_ANIM) { mFlip(dir); return; }   // 한 쪽 보기: 떼어 내기·페이드인
    if (!buildFlip(dir)) return;
    animFlip(1, 860, easeIO);
  }
  function faceNode(i, cls) {
    var f = d.createElement('div');
    f.className = 'face ' + cls;
    f.appendChild(cardNode(i));
    var s = d.createElement('i');
    s.className = 'shade';
    s.setAttribute('aria-hidden', 'true');
    f.appendChild(s);
    return f;
  }

  /* ---------- 넘기기: 누르기·밀기·건반 ---------- */
  function step(dir) {
    if (st.mode === 'card') showCard(st.i + dir, dir);
    else if (st.mode === 'book') flip(dir);
    else scrollTo(st.i + dir, true);
  }
  function bindNav(area) {
    var x0 = 0, y0 = 0, t0 = 0, on = false, swallow = false, drag = null;
    area.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      on = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); drag = null;
      swallow = popOpen() && !e.target.closest('.gl');
    });
    // 책 보기: 손가락·마우스를 따라 책장이 넘어간다
    area.addEventListener('pointermove', function (e) {
      if (!on || st.mode !== 'book' || reduce || swallow) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (!drag) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        if (e.target.closest('.tb-w') || (W.getSelection && String(W.getSelection()).length > 0)) return;
        var k = dx < 0 ? 1 : -1;
        if (st.per === 1 && CAN_ANIM) {                // 한 쪽 보기: 떼어 내기·페이드인을 끌어 당긴다
          if (!mBuild(k)) { on = false; return; }
          drag = { span: (mfl.layer.offsetWidth || 400) * 1.05, lx: e.clientX, lt: e.timeStamp, v: 0, mob: true };
        } else {
          if (!buildFlip(k)) { on = false; return; }
          var pw0 = fl.leaf.offsetWidth || 400;
          drag = { span: fl.per === 2 ? pw0 * 1.5 : pw0 * 1.1, lx: e.clientX, lt: e.timeStamp, v: 0, mob: false };
        }
        try { area.setPointerCapture(e.pointerId); } catch (_) {}
      }
      var dt = Math.max(1, e.timeStamp - drag.lt);
      drag.v = drag.v * .6 + ((e.clientX - drag.lx) / dt) * .4; drag.lx = e.clientX; drag.lt = e.timeStamp;
      if (drag.mob) {
        if (!mfl) return;
        mSeek((mfl.dir > 0 ? -dx : dx) / drag.span);
      } else {
        if (!fl) return;
        drawFlip((fl.dir > 0 ? -dx : dx) / drag.span);
      }
      e.preventDefault();
    });
    var release = function (cancel) {
      var d = drag; drag = null; if (!d) return;
      if (d.mob) { if (mfl) mRelease(cancel, d.v * (mfl.dir > 0 ? -1 : 1)); return; }
      if (!fl) { setBusy(false); return; }
      var f = fl, v = d.v * (f.dir > 0 ? -1 : 1);
      var go = !cancel && (f.p > .38 || (v > .45 && f.p > .05)) && !(v < -.35);
      var rest = go ? 1 - f.p : f.p;
      animFlip(go ? 1 : 0, Math.max(180, 620 * rest), easeOut);
    };
    area.addEventListener('pointerup', function (e) {
      if (!on) return; on = false;
      if (drag) { release(false); return; }
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
    area.addEventListener('pointercancel', function () { on = false; if (drag) release(true); });
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
    if (st.mode === 'book' && per !== st.per) { st.per = per; stopFlip(); if ($('spread')) paintSpread(); }
    st.per = per;
    if ($('spread')) sizeOne();
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
      /* 좁은 화면의 책 보기는 종이 한 장이 화면에 들어오는 것이 기준이다.
         머리말까지 보이도록 맨 위로 돌아간다. */
      if (m === 'book' && W.innerWidth <= 700) { if (W.pageYOffset > 0) W.scrollTo(0, 0); }
      else if (keep) { var y = $('bar').getBoundingClientRect().top + W.pageYOffset - 6; if (Math.abs(W.pageYOffset - y) > 4) W.scrollTo(0, y); }
    }
  }
  function go(i) {
    closeSheet();
    stopFlip();
    st.i = Math.max(0, Math.min(N - 1, i));
    if (st.mode === 'scroll') { setPos(st.i); scrollTo(st.i, true); }
    else if (st.mode === 'card') { pulseBusy(300); showCard(st.i, 0); }
    else { pulseBusy(300); paintSpread(); }
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
    /* 대문 검색이 넘긴 ?q= — 그 낱말이 나오는 첫 쪽으로 넘긴다 */
    window.JCDeepLink = function (term) {
      var n = String(term || '').replace(/\s/g, '').toLowerCase();
      if (!n) return true;
      for (var i = 0; i < CARDS.length; i++) {
        var txt = '';
        try { txt = JSON.stringify(CARDS[i].c); } catch (e) { }
        if (txt.replace(/\s/g, '').toLowerCase().indexOf(n) >= 0) { go(i); return true; }
      }
      return true;
    };
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
