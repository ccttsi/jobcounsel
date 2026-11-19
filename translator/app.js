/*
 * 내담자 언어 번역기 · 화면 엔진 (26번 섹터)
 *
 * 데이터(고치지 않고 읽기만 한다)
 *   data/terms.json  client-language-translator v1.0.0 — 용어 201(직무 65 · 산업 51 · 학력 40 · 제도 45)
 *
 * 주소
 *   ?q=MES          다른 섹터·개인비서에서 낱말로 바로 들어온다(정확히 맞으면 그 용어를 연다)
 *   #t=mes          용어 한 장을 바로 연다
 *
 * 규칙
 *   - 외부 API·저장 없음. 검색어는 화면 안에서만 쓴다.
 *   - 목록은 쪽 단위로 끊어 그린다(끝없는 세로 스크롤 금지). 휴대폰은 목록 ↔ 한 장 보기.
 *   - 화면에 그리는 글은 모두 data/terms.json 에서 나온다(화면에 문장을 지어 넣지 않는다).
 */
(function () {
  'use strict';
  var d = document;
  var $ = function (id) { return d.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var PAGE = 8;
  var LABEL = {
    theory: '이론 위키', vpi: '검사 해석', dacum: 'DACUM', manual: '국취 실무 가이드', hud: '국취 HUD',
    library: '미래고용 서재', decalcomania: '커리어데칼코마니', univ: '대학·학과', grad: '대학원',
    talk: '상담 대화', transit: '환승노선도', parsons: '파슨스 원전', labor: '노동시장 산책', cert: '자격증 도감',
    company: '기업 명함첩', thermometer: '산업 온도계', reality: '취업 현위치', briefing: '오늘의 브리핑',
    emerging: '신산업 브리핑', taxonomy: '직무분류', portals: '채용 사이트', surgery: '서류 해부실',
    interview: '면접 전술 덱', portfolio: '포트폴리오 편집실', law: '직업상담 법전'
  };
  var QPATTERN = { taxonomy: 1, company: 1, thermometer: 1, emerging: 1, decalcomania: 1, univ: 1, grad: 1 };
  var HPATTERN = { cert: '#list?q=' };

  var D = null;          /* terms.json */
  var T = [];            /* 용어 배열 */
  var BY = {};           /* id → 용어 */
  var SRC = {};          /* 출처 id → 출처 */
  var CATN = {};         /* 분야 id → 이름 */
  var st = { cat: 'all', q: '', page: 0, sel: null };

  var mq = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
  function narrow() { return !!mq.matches; }

  /* ---------- 글 다듬기 ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s·・\-_/()[\].]/g, ''); }
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  /* 한글 첫소리만 뽑는다 — 「ㄱㅊㅈ」로 「국취제」를 찾기 위해 */
  function chosung(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) out += CHO[Math.floor((c - 0xAC00) / 588)];
      else if (/[a-z0-9]/.test(s[i])) out += s[i];
    }
    return out;
  }
  function isHangul(s) { return /[가-힣]/.test(s); }
  function isChosungStr(s) { return /^[ㄱ-ㅎ]+$/.test(s); }

  /* ---------- 검색 열쇠 ---------- */
  function index() {
    T.forEach(function (t, i) {
      t._i = i;
      var names = [t.term, t.ko, t.full].concat(t.aka || []);
      t._k = names.map(norm).filter(Boolean);
      t._c = names.map(function (n) { return chosung(String(n || '').toLowerCase()); }).filter(Boolean);
      t._easy = norm(t.easy);
      t._ctx = norm(t.ctx);
    });
  }

  function score(t, q, qc) {
    var n = norm(q), best = 0;
    if (!n) return 1;
    for (var i = 0; i < t._k.length; i++) {
      var k = t._k[i];
      if (k === n) { best = Math.max(best, 100); continue; }
      if (k.indexOf(n) === 0) { best = Math.max(best, 80); continue; }
      if (k.indexOf(n) > 0) best = Math.max(best, 62);
    }
    if (!best && qc.length > 1 && (isHangul(qc) || isChosungStr(qc))) {
      for (var j = 0; j < t._c.length; j++) if (t._c[j].indexOf(qc) === 0) { best = Math.max(best, 58); break; }
    }
    if (!best && t._easy.indexOf(n) >= 0) best = 40;
    if (!best && t._ctx.indexOf(n) >= 0) best = 26;
    return best;
  }

  function hits() {
    var q = st.q.trim();
    var qc = isChosungStr(q) ? q : chosung(q.toLowerCase());
    var out = [];
    for (var i = 0; i < T.length; i++) {
      var t = T[i];
      if (st.cat !== 'all' && t.cat !== st.cat) continue;
      var s = score(t, q, qc);
      if (!s) continue;
      out.push({ t: t, s: s });
    }
    out.sort(function (a, b) { return (b.s - a.s) || (a.t._i - b.t._i); });
    return out.map(function (x) { return x.t; });
  }

  function catCounts() {
    var q = st.q.trim(), qc = isChosungStr(q) ? q : chosung(q.toLowerCase()), c = { all: 0 };
    (D.categories || []).forEach(function (x) { c[x.id] = 0; });
    for (var i = 0; i < T.length; i++) {
      if (q && !score(T[i], q, qc)) continue;
      c[T[i].cat] = (c[T[i].cat] || 0) + 1; c.all++;
    }
    return c;
  }

  /* ---------- 그리기: 탭 ---------- */
  function renderTabs() {
    var c = catCounts();
    var list = [{ id: 'all', name: '전체', short: '전체' }].concat(D.categories || []);
    $('tabs').innerHTML = list.map(function (x) {
      var on = st.cat === x.id, n = c[x.id] || 0;
      return '<button type="button" role="tab" data-cat="' + esc(x.id) + '" aria-selected="' + on + '"'
        + ' aria-label="' + esc(x.name + ' ' + n + '개') + '">'
        + '<span class="tl">' + esc(x.name) + '</span><span class="ts">' + esc(x.short || x.name) + '</span>'
        + '<small>' + n + '</small></button>';
    }).join('');
  }

  /* ---------- 그리기: 목록 ---------- */
  function hl(text, q) {
    var n = String(q || '').trim();
    if (!n) return esc(text);
    var s = String(text), low = s.toLowerCase(), k = n.toLowerCase(), out = '', at = 0, i;
    while ((i = low.indexOf(k, at)) >= 0) {
      out += esc(s.slice(at, i)) + '<em>' + esc(s.slice(i, i + n.length)) + '</em>';
      at = i + n.length;
    }
    return out + esc(s.slice(at));
  }
  function rowHTML(t) {
    return '<li><button type="button" class="row" data-id="' + esc(t.id) + '" aria-current="' + (st.sel === t.id) + '">'
      + '<span class="r-m"><span class="r-t"><b' + (isHangul(t.term) ? '' : ' class="num"') + '>' + hl(t.term, st.q) + '</b>'
      + '<small>' + esc(t.ko) + '</small></span>'
      + '<span class="r-e">' + esc(t.easy) + '</span></span>'
      + (st.cat === 'all' ? '<span class="r-b b-' + esc(t.cat) + '">' + esc(CATN[t.cat] || '') + '</span>' : '')
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="color:var(--dim)"><path d="m9 18 6-6-6-6"/></svg>'
      + '</button></li>';
  }
  function renderList() {
    var a = hits(), n = a.length, pages = Math.max(1, Math.ceil(n / PAGE));
    if (st.page >= pages) st.page = pages - 1;
    if (st.page < 0) st.page = 0;
    var from = st.page * PAGE, slice = a.slice(from, from + PAGE);
    $('lstN').textContent = String(n);
    $('lstSub').textContent = n ? (st.q ? '「' + st.q.trim() + '」에 걸린 말' : '누르면 뜻과 이어 물을 질문이 열립니다') : '찾은 말이 없습니다';
    $('clr').hidden = !st.q;
    if (!n) {
      $('rows').innerHTML = '<li class="empty"><b>그 말을 찾지 못했습니다</b>'
        + '<p>줄임말이면 풀어 써 보세요(예: 국취 → 국민취업지원제도). 분야 탭을 「전체」로 바꿔도 찾아봅니다.</p>'
        + '<div class="e-b"><button type="button" id="eClr">검색 지우기</button><button type="button" id="eAll">전체 용어 보기</button></div></li>';
      $('pg').innerHTML = '';
      bindEmpty();
      return;
    }
    $('rows').innerHTML = slice.map(rowHTML).join('');
    $('pg').innerHTML = pages > 1
      ? '<button type="button" data-pg="-1" aria-label="이전 쪽"' + (st.page === 0 ? ' disabled' : '') + '>‹</button>'
        + '<span class="p-n">' + (st.page + 1) + ' / ' + pages + '</span>'
        + '<button type="button" data-pg="1" aria-label="다음 쪽"' + (st.page >= pages - 1 ? ' disabled' : '') + '>›</button>'
      : '<span class="p-n">' + (n ? '1 / 1' : '') + '</span>';
  }
  function bindEmpty() {
    var c = $('eClr'), a = $('eAll');
    if (c) c.addEventListener('click', function () { setQ('', true); });
    if (a) a.addEventListener('click', function () { st.cat = 'all'; setQ('', true); });
  }

  /* ---------- 그리기: 상세 ---------- */
  function hrefOf(l) {
    var to = l.to, q = l.q || '';
    if (HPATTERN[to]) return '../' + to + '/' + HPATTERN[to] + (q ? encodeURIComponent(q) : '');
    if (q && QPATTERN[to]) return '../' + to + '/?q=' + encodeURIComponent(q);
    return '../' + to + '/';
  }
  function detailHTML(t) {
    var src = t.src ? SRC[t.src] : null;
    var sub = [t.full, t.ko].filter(Boolean);
    var out = '<article class="card" data-term="' + esc(t.id) + '">'
      + '<div class="c-hd"><div class="c-top"><span class="badge b-' + esc(t.cat) + '">' + esc(CATN[t.cat] || '') + '</span></div>'
      + '<h2 class="' + (isHangul(t.term) ? '' : 'mono') + '">' + esc(t.term) + '</h2>'
      + (sub.length ? '<p class="c-sub">' + esc(sub.join(' · ')) + '</p>' : '')
      + '</div>'
      + '<section class="blk b-easy"><h3>한 줄 뜻</h3><p>' + esc(t.easy) + '</p></section>'
      + '<section class="blk b-ctx"><h3>내담자 말 속에서는</h3><p>' + esc(t.ctx) + '</p></section>'
      + '<section class="blk b-qs"><h3>이어서 물어볼 질문</h3><ol>' + t.qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></section>'
      + '<section class="blk b-lks"><h3>연계 자료</h3><div class="lks">' + (t.links || []).map(function (l) {
        return '<a href="' + hrefOf(l) + '">' + esc(LABEL[l.to] || l.to) + (l.q ? '<span>· ' + esc(l.q) + '</span>' : '') + '<i aria-hidden="true">↗</i></a>';
      }).join('') + '</div></section>'
      + '<p class="c-src">' + (src
        ? '<b>출처</b> <a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.name) + '</a> — ' + esc(src.note)
        : '<b>출처</b> 공식 정의를 붙이지 않은 말입니다 — 업계에서 통용되는 약어·표현이라 기관 문서의 정의를 확인하지 않았습니다.')
      + ' · <b>기준일</b> ' + esc(D.updated_at) + '</p>'
      + '</article>';
    return out;
  }
  function renderDetail() {
    var t = st.sel ? BY[st.sel] : null;
    if (!t) {
      $('detBody').innerHTML = '<p class="card-hint">목록에서 말을 고르면, 쉬운 뜻 · 내담자 말 속 실제 맥락 · 이어 물을 질문 · 연계 자료가 여기 열립니다.</p>';
      return;
    }
    $('detBody').innerHTML = detailHTML(t);
  }

  /* ---------- 상태 바꾸기 ---------- */
  function draw() {
    renderTabs();
    renderList();
    renderDetail();
  }
  function setQ(v, keepCat) {
    st.q = v; st.page = 0;
    if (!keepCat) st.cat = 'all';
    $('q').value = v;
    $('qx').hidden = !v;
    draw();
  }
  function setCat(c) {
    st.cat = c; st.page = 0; draw();
  }
  function hashOf(id) { return id ? '#t=' + encodeURIComponent(id) : ''; }
  function select(id, opt) {
    opt = opt || {};
    if (!BY[id]) return false;
    st.sel = id;
    if (narrow()) d.body.classList.add('detail');
    if (opt.hash !== false) {
      try { history[opt.push ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + hashOf(id)); } catch (e) { }
    }
    d.title = BY[id].term + ' · 내담자 언어 번역기';
    renderList(); renderDetail();
    var cur = $('rows').querySelector('[aria-current="true"]');
    if (cur && opt.focus) { try { cur.focus({ preventScroll: true }); } catch (e) { } }
    return true;
  }
  function closeDetail(pop) {
    d.body.classList.remove('detail');
    st.sel = null;
    if (!pop) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
    d.title = '내담자 언어 번역기 · 용어 ' + T.length;
    renderList(); renderDetail();
  }

  /* ---------- 주소 ---------- */
  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    var m = /^t=([^&]+)/.exec(h);
    if (m) { var id = decodeURIComponent(m[1]); if (BY[id]) { select(id, { hash: false }); return true; } }
    return false;
  }
  function fromQuery() {
    var q = '';
    try { q = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) { }
    if (!q) return;
    st.q = q; st.page = 0; $('q').value = q; $('qx').hidden = false;
    var list = hits(), exact = null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var names = [t.term, t.ko].concat(t.aka || []);
      for (var j = 0; j < names.length; j++) if (norm(names[j]) === norm(q)) { exact = t; break; }
      if (exact) break;
    }
    if (exact) select(exact.id, { hash: false });
  }

  /* ---------- 사건 ---------- */
  function bind() {
    var pvT = $('pvT'), pvB = $('pvB');
    pvT.addEventListener('click', function () {
      var on = pvT.getAttribute('aria-expanded') === 'true';
      pvT.setAttribute('aria-expanded', String(!on));
      pvB.hidden = on;
      pvT.querySelector('.pv-c').textContent = on ? '펼치기' : '접기';
    });

    var rafQ = 0, input = $('q');
    input.addEventListener('input', function () {
      $('qx').hidden = !input.value;
      if (rafQ) return;
      rafQ = requestAnimationFrame(function () { rafQ = 0; st.q = input.value; st.page = 0; renderTabs(); renderList(); });
    });
    $('qform').addEventListener('submit', function (e) {
      e.preventDefault();
      st.q = input.value; st.page = 0;
      var a = hits();
      if (a.length) { if (narrow()) input.blur(); select(a[0].id, { push: true }); }
      else { renderTabs(); renderList(); }
    });
    $('qx').addEventListener('click', function () { setQ('', true); input.focus(); });
    $('clr').addEventListener('click', function () { setQ('', true); });

    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      setCat(b.getAttribute('data-cat'));
    });
    $('rows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      select(b.getAttribute('data-id'), { push: true });
    });
    $('pg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]'); if (!b || b.disabled) return;
      st.page = Math.max(0, st.page + Number(b.getAttribute('data-pg')));
      renderList();
      var lh = $('lstTitle').getBoundingClientRect().top + window.scrollY - 12;
      if (window.scrollY > lh) window.scrollTo(0, lh);
    });
    $('detBack').addEventListener('click', function () { closeDetail(false); if (history.length > 1) { } });
    $('quick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      setQ(b.getAttribute('data-q'), true);
      var a = hits(); if (a.length) select(a[0].id, { push: true });
    });
    window.addEventListener('hashchange', function () {
      if (!fromHash()) { if (d.body.classList.contains('detail')) closeDetail(true); }
    });
    window.addEventListener('popstate', function () {
      if (!fromHash() && d.body.classList.contains('detail')) closeDetail(true);
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.body.classList.contains('detail')) { closeDetail(false); }
    });
  }

  function quickChips() {
    var want = ['MES', '수율', '국취', '내일배움카드', 'SI', '경력단절여성'];
    $('quick').innerHTML = '<b>자주 듣는 말</b>' + want.map(function (w) {
      return '<button type="button" data-q="' + esc(w) + '">' + esc(w) + '</button>';
    }).join('');
  }

  function start(data) {
    D = data; T = (data.terms || []).slice();
    (data.categories || []).forEach(function (c) { CATN[c.id] = c.name; });
    (data.sources || []).forEach(function (s) { SRC[s.id] = s; });
    T.forEach(function (t) { BY[t.id] = t; });
    index();
    quickChips();
    bind();
    d.title = '내담자 언어 번역기 · 용어 ' + T.length;
    fromQuery();
    if (!fromHash() && !st.sel) draw();
    else { renderTabs(); renderList(); }
    /* 큰 화면은 오른쪽이 비지 않게 첫 용어를 미리 펼친다(주소에는 남기지 않는다) */
    if (!st.sel && !narrow()) {
      var first = hits()[0];
      if (first) select(first.id, { hash: false });
    }
  }

  fetch('./data/terms.json', { cache: 'force-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () {
      $('rows').innerHTML = '';
      $('lstSub').textContent = '자료를 불러오지 못했습니다';
      $('detBody').innerHTML = '<p class="loading">용어 자료를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>';
    });
})();
