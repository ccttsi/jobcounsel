/* 자료실 관리 · 사이트 이용 통계 화면
   - 관리자 로그인(assets/sync.js)이 있어야 보인다. 서버 함수 jc_admin_dash가 관리자 여부를 다시 확인한다.
   - 받는 것은 합계뿐이다(assets/supabase-update-02-stats.sql). 아이디·개별 기록은 오지 않는다.
   - 외부 라이브러리 없이 HTML 막대로 그린다. 저장 키 없음(기간 선택은 주소 #d=7). */
(function () {
  'use strict';
  var d = document, $ = function (s, el) { return (el || d).querySelector(s); };
  var main = $('#main');

  var PAGES = {
    home: '첫 화면', theory: '직업상담 이론 위키', vpi: '직업선호도검사 해석', dacum: 'DACUM 직무분석',
    manual: '국취 매뉴얼 하이퍼위키', hud: '국취 상담 HUD', library: '미래고용 디지털 서재',
    decalcomania: '커리어데칼코마니', univ: '대학학과위키', grad: '석·박사 지도', talk: '상담 대화 연습장',
    transit: '환승노선도', parsons: '다시 읽는 『직업의 선택』', labor: '노동시장 산책'
  };
  var SRC = { direct: '직접 입력·즐겨찾기', search: '검색', social: 'SNS·메신저', link: '다른 사이트 링크', campaign: '캠페인 링크(utm)' };
  var SRC_ORDER = ['search', 'direct', 'link', 'social', 'campaign'];
  var DEV = { m: '휴대폰', t: '태블릿', d: 'PC' };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var RANGES = [[1, '오늘'], [7, '7일'], [30, '30일'], [90, '90일']];

  var st = { days: 30, data: null, busy: false, pgPage: 1, pgHost: 1, pgStay: 1 };
  var hm = /(?:^|[#&])d=(\d+)/.exec(location.hash); if (hm && [1, 7, 30, 90].indexOf(+hm[1]) >= 0) st.days = +hm[1];

  /* ---------- 도움 함수 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { return (+v || 0).toLocaleString('ko-KR'); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function pctS(a, b) { var p = pct(a, b); return (p % 1 ? p.toFixed(1) : p) + '%'; }
  function niceMax(v) { if (v <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function md(s) { var p = String(s).slice(0, 10).split('-'); return (+p[1]) + '.' + (+p[2]); }
  function wd(s) { var p = String(s).slice(0, 10).split('-'); return WD[new Date(+p[0], p[1] - 1, +p[2]).getDay()]; }
  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="dl eq">변화 없음</span>';
    if (!prev) return '<span class="dl up">새로 생김</span>';
    var r = Math.round((cur - prev) / prev * 100);
    return '<span class="dl ' + (r > 0 ? 'up' : r < 0 ? 'down' : 'eq') + '">' + (r > 0 ? '▲ ' + r : r < 0 ? '▼ ' + (-r) : '±0') + '%</span>';
  }
  function dur(sec) { sec = Math.round(+sec || 0); if (sec < 60) return sec + '초'; var m = Math.floor(sec / 60), r = sec % 60; return m + '분' + (r ? ' ' + r + '초' : ''); }
  function rangeName() { return st.days === 1 ? '오늘' : '최근 ' + st.days + '일'; }
  function prevName() { return st.days === 1 ? '어제' : '그 전 ' + st.days + '일'; }
  var toastT; function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2200); }

  /* ---------- 이용 안내 접기 ---------- */
  $('#pvT').addEventListener('click', function () {
    var pv = $('#pv'), o = !pv.classList.contains('open');
    pv.classList.toggle('open', o); this.setAttribute('aria-expanded', String(o)); $('#pvC').textContent = o ? '접기' : '펼치기';
    if (o) $('#pvB').removeAttribute('inert'); else $('#pvB').setAttribute('inert', '');
  });

  /* ---------- 들어가는 문 ---------- */
  function gate(title, body, extra) {
    main.innerHTML = '<div class="gate"><h2>' + title + '</h2><p>' + body + '</p>' + (extra || '') + '</div>';
  }
  function S() { return window.JCSync; }
  function check() {
    var s = S();
    if (!s) return;
    if (!s.configured) return gate('연동 설정이 없습니다', '이 사이트에 저장소 연결 정보가 없어 통계를 불러올 수 없습니다.');
    if (!s.user()) return gate('관리자만 볼 수 있습니다', '관리자 아이디로 로그인하면 가입 계정 수와 사이트 이용 통계가 이 화면에 나타납니다.', '<button class="go" data-jc-login>관리자 로그인</button>');
    if (!s.admin()) return gate('관리자 계정이 아닙니다', '지금 로그인한 계정에는 관리 권한이 없습니다. 관리자 계정은 데이터베이스의 SQL Editor에서만 지정할 수 있습니다.', '<a class="go" href="../">자료실 첫 화면으로</a>');
    load();
  }
  window.addEventListener('jc-sync-change', function () { if (!st.busy) { st.data = null; check(); } });
  (function wait(k) { if (S()) check(); else if (k < 60) setTimeout(function () { wait(k + 1); }, 100); else gate('불러오지 못했습니다', '로그인 도구(assets/sync.js)를 불러오지 못했습니다. 새로 고침해 주세요.'); })(0);

  function load() {
    if (st.busy) return; st.busy = true;
    var b = $('#reBtn'); if (b) b.classList.add('spin');
    if (!st.data) main.innerHTML = '<div class="gate"><h2>불러오는 중…</h2><p>' + rangeName() + ' 통계를 모으고 있습니다.</p></div>';
    S().adminCall('jc_admin_dash', { p_days: st.days }).then(function (r) {
      st.busy = false;
      if (!r || r.error === 'session') return check();
      if (r.error === 'forbidden') return check();
      if (r.error) throw r;
      st.data = r; st.pgPage = 1; st.pgHost = 1; st.pgStay = 1; render();
    }).catch(function (e) {
      st.busy = false;
      var j = e && e.j, missing = e && e.status === 404 || (j && (j.code === 'PGRST202' || /jc_admin_dash/.test(j.message || '')));
      if (missing) return gate('통계 설정이 아직 없습니다', '데이터베이스에 통계용 설정을 한 번 실행해야 이 화면이 열립니다.',
        '<ol><li>Supabase 대시보드 → SQL Editor → New query</li><li>저장소의 <code>assets/supabase-update-02-stats.sql</code> 전체를 붙여 넣고 Run</li><li>이 화면에서 새로 고침</li></ol><p style="margin-top:12px">그때부터 방문이 쌓입니다. 이전 방문은 기록되어 있지 않습니다.</p>');
      if (st.data) { render(); toast('새로 고치지 못했습니다. 인터넷 연결을 확인해 주세요.'); return; }
      gate('불러오지 못했습니다', '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.', '<button class="go" id="retry">다시 시도</button>');
      var rb = $('#retry'); if (rb) rb.onclick = load;
    });
  }

  /* ---------- 그리기 부품 ---------- */
  // 세로 막대(쌓기). rows: [{x, segs:[[값, 'c1'], …], tip}], xEvery: 몇 칸마다 아래 글자
  function cols(rows, opt) {
    var mx = 0; rows.forEach(function (r) { var s = 0; r.segs.forEach(function (g) { s += g[0]; }); if (s > mx) mx = s; });
    var top = niceMax(mx || 1), h = '<div class="cc" data-cc><div class="cc-plot">';
    [0, .5, 1].forEach(function (f) { h += '<div class="cc-gl' + (f === 0 ? ' base' : '') + '" style="bottom:' + (f * 100) + '%"><span>' + n(Math.round(top * f)) + '</span></div>'; });
    h += '<div class="cc-cols">';
    rows.forEach(function (r, i) {
      h += '<div class="cc-c" data-i="' + i + '">';
      r.segs.forEach(function (g) { if (g[0] > 0) h += '<i class="' + g[1] + '" style="height:calc(' + (g[0] / top * 100) + '% - 2px)"></i>'; });
      h += '</div>';
    });
    h += '</div></div><div class="cc-x">';
    var every = opt.xEvery || 1;
    rows.forEach(function (r, i) {
      if (i % every === 0 || (opt.last && i === rows.length - 1 && (rows.length - 1) % every > every / 2)) h += '<span style="left:' + ((i + .5) / rows.length * 100) + '%">' + esc(r.x) + '</span>';
    });
    h += '</div><div class="tip" hidden></div></div>';
    return { html: h, tips: rows.map(function (r) { return r.tip; }) };
  }
  var tipSets = [];
  function mount(htmlTips) { tipSets.push(htmlTips.tips); return htmlTips.html.replace('data-cc', 'data-cc="' + (tipSets.length - 1) + '"'); }
  function bindTips() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-cc]'), function (cc) {
      var tips = tipSets[+cc.getAttribute('data-cc')], tip = $('.tip', cc), hot = null;
      function show(c) {
        if (hot) hot.classList.remove('hot'); hot = c; if (!c) { tip.hidden = true; return; }
        c.classList.add('hot'); tip.innerHTML = tips[+c.getAttribute('data-i')]; tip.hidden = false;
        var cr = cc.getBoundingClientRect(), r = c.getBoundingClientRect(), w = tip.offsetWidth;
        var x = r.left - cr.left + r.width / 2 - w / 2; x = Math.max(0, Math.min(cr.width - w, x));
        tip.style.left = x + 'px'; tip.style.top = '-6px'; tip.style.transform = 'translateY(-100%)';
      }
      cc.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; var c = e.target.closest('.cc-c'); if (c !== hot) show(c); });
      cc.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') show(null); });
      cc.addEventListener('click', function (e) { var c = e.target.closest('.cc-c'); show(c === hot ? null : c); });
    });
  }
  d.addEventListener('pointerdown', function (e) { if (!e.target.closest('[data-cc]')) Array.prototype.forEach.call(d.querySelectorAll('.cc-c.hot'), function (c) { c.classList.remove('hot'); var t = c.closest('.cc').querySelector('.tip'); t.hidden = true; }); });

  // 가로 막대. rows: [{l, sub, v, segs?:[[값,'c1'],…], vs}]
  function bars(rows, max) {
    var mx = max || 0; if (!mx) rows.forEach(function (r) { if (r.v > mx) mx = r.v; }); mx = mx || 1;
    return '<div class="hb">' + rows.map(function (r) {
      var segs = r.segs || [[r.v, 'c1']];
      return '<div class="hb-r"><span class="hb-l" title="' + esc(r.l) + '">' + esc(r.l) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</span>' +
        '<span class="hb-t" aria-hidden="true">' + segs.filter(function (g) { return g[0] > 0; }).map(function (g) { return '<i class="' + g[1] + '" style="width:' + (g[0] / mx * 100) + '%"></i>'; }).join('') + '</span>' +
        '<span class="hb-v">' + (r.fmt || n(r.v)) + (r.vs ? '<small>' + esc(r.vs) + '</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  // 100% 나눔 막대. parts: [[이름, 값, 'c1'], …]
  function split(title, parts) {
    var tot = 0; parts.forEach(function (p) { tot += p[1]; });
    return '<div class="sp"><h3>' + esc(title) + '<span>' + n(tot) + '</span></h3>' +
      '<div class="sp-bar" role="img" aria-label="' + esc(title + ': ' + parts.map(function (p) { return p[0] + ' ' + pctS(p[1], tot); }).join(', ')) + '">' +
      (tot ? parts.filter(function (p) { return p[1] > 0; }).map(function (p) { return '<i class="' + p[2] + '" style="flex:' + p[1] + ' 1 0"></i>'; }).join('') : '') + '</div>' +
      '<div class="sp-k">' + parts.map(function (p) { return '<span><i class="' + p[2] + '"></i>' + esc(p[0]) + ' <b>' + pctS(p[1], tot) + '</b> · ' + n(p[1]) + '</span>'; }).join('') + '</div></div>';
  }
  function pager(total, per, cur, key) {
    var pages = Math.ceil(total / per); if (pages <= 1) return '';
    var h = '<nav class="pg" aria-label="쪽">';
    for (var i = 1; i <= pages; i++) h += '<button data-pg="' + key + '" data-n="' + i + '"' + (i === cur ? ' aria-current="page"' : '') + '>' + i + '</button>';
    return h + '</nav>';
  }
  function table(head, rows) {
    return '<details class="tbl"><summary>표로 보기</summary><div class="tw"><table><thead><tr>' + head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
  }

  /* ---------- 화면 ---------- */
  function render() {
    var D = st.data, A = D.accounts, T = D.traffic, P = T.prev || {};
    tipSets = [];
    var anonPv = T.pv - T.auth_pv, anonVis = T.visitors - T.auth_visitors, anonVisit = T.visits - T.auth_visits;
    var at = new Date(D.at), atS = at.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    var h = '';

    // 첫머리 + 기간
    h += '<section class="hero"><div><h1>사이트 이용 통계</h1><p>' + esc(rangeName()) + ' · ' + md(D.from) + (st.days > 1 ? '~' + md(D.to) : '') + ' · 한국 시간 기준</p></div>' +
      '<div class="ctl"><div class="seg" role="group" aria-label="기간">' + RANGES.map(function (r) { return '<button data-days="' + r[0] + '" aria-pressed="' + (st.days === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<button class="re" id="reBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>새로 고침</button>' +
      '<span class="at">' + esc(atS) + ' 기준</span></div></section>';

    // 큰 숫자 넷
    h += '<section class="kpis" aria-label="한눈에 보기">' +
      '<div class="kpi lead"><h3>가입 계정</h3><span class="v">' + n(A.members) + '<small>개</small></span><p>일반 회원 · 관리자 ' + n(A.admins) + '개 별도<br>' + esc(rangeName()) + ' 새 가입 ' + n(A.new_range) + '</p><a class="more" href="#acct">계정 자세히 ↓</a></div>' +
      '<div class="kpi"><h3>방문자</h3><span class="v">' + n(T.visitors) + '</span><p>' + delta(T.visitors, P.visitors) + ' ' + esc(prevName()) + ' 대비<br>처음 온 브라우저 ' + n(T.new_visitors) + '</p></div>' +
      '<div class="kpi"><h3>방문</h3><span class="v">' + n(T.visits) + '</span><p>' + delta(T.visits, P.visits) + ' ' + esc(prevName()) + ' 대비<br>방문당 ' + (T.visits ? (T.pv / T.visits).toFixed(1) : '0') + '쪽</p></div>' +
      '<div class="kpi"><h3>페이지 보기</h3><span class="v">' + n(T.pv) + '</span><p>' + delta(T.pv, P.pv) + ' ' + esc(prevName()) + ' 대비<br>오늘 ' + n(T.today_pv) + '쪽 · 방문자 ' + n(T.today_visitors) + '</p></div>' +
      '</section>';

    h += '<div class="grid">';

    // 로그인 vs 비로그인
    h += '<section class="card" id="auth"><h2>로그인 · 비로그인 이용 <small>' + esc(rangeName()) + '</small></h2>' +
      '<p class="lede">로그인은 선택 기능이라, 대부분은 로그인 없이 이용합니다. 관리자 방문은 세지 않습니다.</p>' +
      split('방문자', [['비로그인', anonVis, 'c1'], ['로그인', T.auth_visitors, 'c2']]) +
      split('방문', [['비로그인', anonVisit, 'c1'], ['로그인', T.auth_visits, 'c2']]) +
      split('페이지 보기', [['비로그인', anonPv, 'c1'], ['로그인', T.auth_pv, 'c2']]) + '</section>';

    // 계정
    var sg = A.signups || [], sgTot = 0; sg.forEach(function (x) { sgTot += x.n; });
    h += '<section class="card" id="acct"><h2>가입 계정 <small>개별 아이디는 보여 주지 않습니다</small></h2>' +
      '<div class="mini" style="margin-top:12px">' +
      '<div><b>' + n(A.users) + '</b><span>전체 계정(관리자 포함)</span></div>' +
      '<div><b>' + n(A.new7) + '</b><span>최근 7일 가입</span></div>' +
      '<div><b>' + n(A.new30) + '</b><span>최근 30일 가입</span></div>' +
      '<div><b>' + n(A.new_today) + '</b><span>오늘 가입</span></div>' +
      '<div><b>' + n(A.active1) + '</b><span>오늘 이용한 계정</span></div>' +
      '<div><b>' + n(A.active7) + '</b><span>7일 안에 이용한 계정</span></div>' +
      '<div><b>' + n(A.active30) + '</b><span>30일 안에 이용한 계정</span></div>' +
      '<div><b>' + n(A.devices) + '</b><span>로그인 유지 중인 기기</span></div></div>';
    if (st.days > 1) {
      h += '<h3 style="margin:16px 0 6px;font-size:14.5px">날마다 새 가입 <span style="color:var(--dim);font-weight:600">· 합계 ' + n(sgTot) + '</span></h3>' +
        (sgTot ? mount(cols(sg.map(function (x) { return { x: md(x.d), segs: [[x.n, 'c2']], tip: '<b>' + md(x.d) + ' (' + wd(x.d) + ')</b>새 가입 ' + n(x.n) }; }), { xEvery: xEvery(sg.length), last: true }))
          : '<p class="empty">이 기간에 새 가입이 없습니다.</p>');
    }
    h += '<p class="lede" style="margin:10px 0 0">이용한 계정은 로그인 상태로 자료실을 연 날짜(시각 없이)로 셉니다. 통계 설정 이후부터 쌓입니다.</p></section>';

    // 날마다
    var days = T.days || [];
    if (st.days > 1) {
      h += '<section class="card wide" id="daily"><h2>날마다 페이지 보기 <small>' + esc(rangeName()) + '</small></h2>' +
        '<div class="lgd"><span><i class="c1"></i>비로그인</span><span><i class="c2"></i>로그인</span></div>' +
        mount(cols(days.map(function (x) {
          return { x: md(x.d), segs: [[x.pv - x.apv, 'c1'], [x.apv, 'c2']], tip: '<b>' + md(x.d) + ' (' + wd(x.d) + ')</b>페이지 보기 ' + n(x.pv) + '<br>방문자 ' + n(x.vis) + '<br><i class="c1"></i>비로그인 ' + n(x.pv - x.apv) + ' · <i class="c2"></i>로그인 ' + n(x.apv) };
        }), { xEvery: xEvery(days.length), last: true })) +
        table(['날짜', '페이지 보기', '방문자', '로그인 보기'], days.slice().reverse().map(function (x) { return [md(x.d) + ' (' + wd(x.d) + ')', n(x.pv), n(x.vis), n(x.apv)]; })) + '</section>';
    }

    // 자료별: 많이 연 자료(첫 화면 제외) · 오래 머문 자료
    var pages = T.pages || [], home = null, res = [];
    pages.forEach(function (x) { if (x.page === 'home') home = x; else res.push(x); });
    var hasStay = T.stay_n != null, homeOut = T.home_out || 0;
    var opens = res.slice().sort(function (a, b) { return b.pv - a.pv; });
    var PP = 7, pp = st.pgPage, ps = opens.slice((pp - 1) * PP, pp * PP);
    h += '<section class="card" id="open"><h2>많이 연 자료 <small>첫 화면 제외 · ' + n(opens.length) + '곳</small></h2>' +
      '<p class="lede">자료 페이지가 열린 횟수입니다.' + (hasStay ? ' 아래 작은 글씨는 그중 첫 화면에서 눌러 들어온 횟수입니다.' : '') + '</p>' +
      (home && hasStay ? '<div class="mini mini2"><div><b>' + n(home.pv) + '</b><span>첫 화면 열람</span></div><div><b>' + n(homeOut) + '</b><span>첫 화면에서 자료를 누른 횟수</span></div></div>' : '') +
      (opens.length ? bars(ps.map(function (x, i) {
        return { l: ((pp - 1) * PP + i + 1) + '. ' + (PAGES[x.page] || x.page), sub: hasStay ? '첫 화면에서 클릭 ' + n(x.vh) : '첫 페이지로 들어온 방문 ' + n(x.visits), v: x.pv, vs: '로그인 ' + pctS(x.apv, x.pv) };
      }), opens[0].pv) + pager(opens.length, PP, pp, 'page') : '<p class="empty">아직 기록이 없습니다.</p>') + '</section>';

    var MIN = 3, stays = res.filter(function (x) { return x.sn >= MIN; }).sort(function (a, b) { return b.sa - a.sa; }), few = res.filter(function (x) { return x.sn > 0 && x.sn < MIN; }).length;
    var SP = 7, sp = st.pgStay, ss = stays.slice((sp - 1) * SP, sp * SP);
    h += '<section class="card" id="stay"><h2>오래 머문 자료 <small>평균 체류 시간</small></h2>' +
      '<p class="lede">화면을 실제로 보고 있던 시간만 잽니다. 다른 탭에 가 있거나 5분 넘게 손대지 않으면 멈추고, 한 번에 최대 30분까지 셉니다.</p>' +
      (!hasStay ? '<p class="empty">체류 시간을 재려면 <code>assets/supabase-update-02-stats.sql</code>을 다시 한 번 실행해 주세요.</p>'
        : stays.length ? bars(ss.map(function (x, i) {
          return { l: ((sp - 1) * SP + i + 1) + '. ' + (PAGES[x.page] || x.page), sub: '중앙값 ' + dur(x.sm) + ' · 잰 횟수 ' + n(x.sn), v: x.sa, fmt: dur(x.sa) };
        }), stays[0].sa) + pager(stays.length, SP, sp, 'stay')
        : '<p class="empty">아직 잰 기록이 부족합니다. 자료마다 ' + MIN + '번 넘게 재면 순위가 나옵니다.</p>') +
      (hasStay && home && home.sn ? '<p class="lede" style="margin:10px 0 0">첫 화면 평균 ' + dur(home.sa) + (few ? ' · 잰 횟수가 ' + MIN + '번이 안 되는 자료 ' + n(few) + '곳은 순위에서 뺐습니다.' : '') + '</p>' : '') + '</section>';

    // 유입 경로
    var srcs = T.sources || {}, visitsTot = 0; SRC_ORDER.forEach(function (k) { visitsTot += srcs[k] || 0; });
    var hosts = T.hosts || [], HP = 6, hp = st.pgHost, hs = hosts.slice((hp - 1) * HP, hp * HP);
    h += '<section class="card" id="src"><h2>유입 경로 <small>방문 ' + n(visitsTot) + '회 기준</small></h2>' +
      '<p class="lede">탭에서 처음 연 페이지가 어디서 왔는지입니다. 도메인 이름만 남기고 검색어는 남기지 않습니다.</p>' +
      (visitsTot ? bars(SRC_ORDER.map(function (k) { return { l: SRC[k], v: srcs[k] || 0, vs: pctS(srcs[k] || 0, visitsTot) }; }), 0) : '<p class="empty">아직 방문 기록이 없습니다.</p>');
    if (hosts.length) {
      h += '<h3 style="margin:16px 0 6px;font-size:14.5px">많이 들어온 곳</h3>' +
        bars(hs.map(function (x) { return { l: x.host, sub: SRC[x.src] || '', v: x.n, vs: pctS(x.n, visitsTot) }; }), hosts[0].n) + pager(hosts.length, HP, hp, 'host');
    }
    h += '</section>';

    // 시간대·요일
    var hrs = T.hours || [], wds = T.weekdays || [];
    h += '<section class="card" id="time"><h2>시간대 <small>페이지 보기 · 한국 시간</small></h2>' +
      mount(cols(hrs.map(function (v, i) { return { x: i + '시', segs: [[v, 'c1']], tip: '<b>' + i + '시~' + (i + 1) + '시</b>페이지 보기 ' + n(v) }; }), { xEvery: 6 }));
    if (st.days >= 7) {
      var order = [1, 2, 3, 4, 5, 6, 0];
      h += '<h3 style="margin:16px 0 6px;font-size:14.5px">요일</h3>' +
        mount(cols(order.map(function (w) { return { x: WD[w], segs: [[wds[w] || 0, 'c1']], tip: '<b>' + WD[w] + '요일</b>페이지 보기 ' + n(wds[w] || 0) }; }), { xEvery: 1 }));
    }
    h += '</section>';

    // 기기
    var dv = T.devices || {};
    h += '<section class="card" id="dev"><h2>기기 <small>방문자 기준</small></h2>' +
      split('방문자', [[DEV.m, dv.m || 0, 'c1'], [DEV.d, dv.d || 0, 'c2'], [DEV.t, dv.t || 0, 'c3']]) +
      '<p class="lede" style="margin:10px 0 0">기기 종류는 브라우저가 알려 주는 종류(휴대폰·태블릿·PC)만 봅니다. 기종·화면 크기는 남기지 않습니다.</p></section>';

    // 이 기기 제외
    h += '<section class="card"><h2>통계에서 빼기</h2><p class="lede">관리자로 로그인한 동안의 방문은 저절로 빠집니다. 로그아웃한 채로 둘러볼 때도 빼려면 아래를 켜 두세요(이 기기·이 브라우저에만 적용).</p>' +
      '<label class="opt"><input type="checkbox" id="offChk"' + (S().statsOff() ? ' checked' : '') + '><span><b>이 기기의 방문은 통계에 넣지 않기</b><br>설정은 이 브라우저에만 저장되고 다른 기기와 연동하지 않습니다.</span></label>' +
      '<p class="lede" style="margin:12px 0 0">' + (T.since ? '방문 기록은 ' + new Date(T.since).toLocaleDateString('ko-KR') + '부터 쌓였습니다. ' : '아직 쌓인 방문 기록이 없습니다. ') + '400일이 지난 기록은 이 화면을 열 때 지웁니다.</p></section>';

    h += '</div>';
    main.innerHTML = h;
    bindTips();
  }
  function xEvery(len) { return len <= 8 ? 1 : len <= 16 ? 2 : len <= 31 ? 5 : 14; }

  /* ---------- 조작 ---------- */
  main.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-days')) {
      var v = +b.getAttribute('data-days'); if (v === st.days || st.busy) return;
      st.days = v; history.replaceState(null, '', '#d=' + v); load();
    } else if (b.id === 'reBtn') load();
    else if (b.hasAttribute('data-pg')) {
      var k = b.getAttribute('data-pg'), card = b.closest('.card');
      var nn = +b.getAttribute('data-n'); if (k === 'page') st.pgPage = nn; else if (k === 'stay') st.pgStay = nn; else st.pgHost = nn;
      render();
      var c2 = d.getElementById(card.id); if (c2 && c2.getBoundingClientRect().top < 0) c2.scrollIntoView({ block: 'start' });
    }
  });
  main.addEventListener('change', function (e) {
    if (e.target.id === 'offChk') { S().statsOff(e.target.checked); toast(e.target.checked ? '이 기기의 방문은 이제 세지 않습니다.' : '이 기기의 방문도 다시 셉니다.'); }
  });
})();
