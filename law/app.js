/* app.js — 직업상담 법전 (/law/)
 *
 * 화면 셋: 첫 화면(검색) · 법령 상세(쉬운 풀이·사례 / 가변형 시각자료 / 조문 전문) · 책처럼 보기(목차 + 쪽 넘김).
 * 자료는 data/laws.json 하나에서 읽는다(스키마: data/SCHEMA.md). 법령 이름·개수는 코드에 적지 않는다.
 * 모션은 transform·opacity만. 입력은 한 프레임에 한 번만 다시 그린다.
 */
(function () {
  'use strict';
  var d = document;
  var $ = function (id) { return d.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); };
  var reEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  var D = null, LAWS = [], byId = {}, SITS = [], PAGES = [];
  var state = { q: '', hits: [], tab: 'easy', law: null, art: '', page: 0, view: 'home' };
  var rafQ = 0;

  /* ---------- 자료 ---------- */
  function load() {
    fetch('./data/laws.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(init)
      .catch(function () {
        $('rows').innerHTML = '<li class="empty"><b>법령 자료를 불러오지 못했습니다.</b> 연결을 확인한 뒤 다시 열어 주세요.</li>';
      });
  }

  function init(data) {
    D = data;
    LAWS = (D.laws || []).slice();
    SITS = D.situations || [];
    SITS.forEach(function (s) { s._terms = (s.terms || []).map(norm); });
    LAWS.forEach(function (l) {
      byId[l.id] = l;
      indexLaw(l);
    });
    buildPages();
    renderChips();
    var cnt = $('bookCount');
    if (cnt) cnt.textContent = LAWS.length + '건 · ' + PAGES.length + '쪽';
    renderList('');
    route();
  }

  function indexLaw(l) {
    var arts = l.articles || [];
    l._name = norm(l.name + ' ' + (l.short || ''));
    l._keys = norm((l.keywords || []).join(' ') + ' ' + (l.chips || []).join(' ') + ' ' + (l.why || ''));
    l._chips = (l.chips || []).map(norm);
    l._keysArr = (l.keywords || []).map(norm);
    l._line = norm(l.one_line || '');
    l._artT = arts.map(function (a) { return norm(a.no + ' ' + (a.title || '')); });
    l._artB = arts.map(function (a) { return norm((a.paras || []).join(' ')); });
  }

  /* 샤드(대량 아카이브) — law 에 shard 가 있으면 열 때 그 조각을 받아 붙인다 */
  function hydrate(l) {
    if (!l) return Promise.resolve(l);
    if ((l.articles && l.articles.length) || !l.shard) return Promise.resolve(l);
    if (l._loading) return l._loading;
    l._loading = fetch('./data/' + l.shard + '.json', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (sh) {
        var one = (sh.laws || []).filter(function (x) { return x.id === l.id; })[0];
        if (one) {
          ['easy', 'examples', 'check', 'visual', 'articles'].forEach(function (k) {
            if (one[k]) l[k] = one[k];
          });
          if (one.articleCount) l.articleCount = one.articleCount;
          indexLaw(l); buildPages();
        }
        return l;
      })
      .catch(function () { return l; });
    return l._loading;
  }

  /* ---------- 검색 ---------- */
  function situationHits(tokens) {
    var map = {};
    SITS.forEach(function (s) {
      var n = 0;
      tokens.forEach(function (t) {
        if (t.length < 1) return;
        for (var i = 0; i < s._terms.length; i++) {
          var term = s._terms[i];
          if (term === t || (term.length > 1 && (term.indexOf(t) >= 0 || t.indexOf(term) >= 0))) { n += 1; break; }
        }
      });
      if (n) map[s.id] = { sit: s, n: n };
    });
    return map;
  }

  function scoreLaw(l, q) {
    var tokens = q.split(' ').filter(function (t) { return t.length > 0; });
    if (!tokens.length) return null;
    var score = 0, why = [], arts = [], allHit = true, sitMap = situationHits(tokens);
    tokens.forEach(function (t) {
      var hit = 0;
      if (l._name.indexOf(t) >= 0) { hit = Math.max(hit, t.length > 1 ? 120 : 40); why.push('이름'); }
      if (l._chips.some(function (c) { return c === t || c.indexOf(t) >= 0; })) { hit = Math.max(hit, 60); why.push('상황 키워드'); }
      if (l._keysArr.some(function (k) { return k === t; })) { hit = Math.max(hit, 48); why.push('「' + t + '」'); }
      else if (l._keys.indexOf(t) >= 0) { hit = Math.max(hit, 34); why.push('「' + t + '」'); }
      if (l._line.indexOf(t) >= 0) hit = Math.max(hit, 14);
      var ai = -1;
      for (var i = 0; i < l._artT.length; i++) if (l._artT[i].indexOf(t) >= 0) { ai = i; break; }
      if (ai >= 0) { hit = Math.max(hit, 20); if (arts.indexOf(l.articles[ai].no) < 0) arts.push(l.articles[ai].no); }
      else {
        for (var j = 0; j < l._artB.length; j++) if (l._artB[j].indexOf(t) >= 0) { hit = Math.max(hit, 9); if (arts.indexOf(l.articles[j].no) < 0) arts.push(l.articles[j].no); break; }
      }
      if (!hit) allHit = false;
      score += hit;
    });
    if (!allHit) return null;
    var sitLabel = null;
    Object.keys(sitMap).forEach(function (id) {
      var s = sitMap[id].sit;
      (s.laws || []).forEach(function (ref) {
        if (ref.id !== l.id) return;
        score += 54 * sitMap[id].n;
        sitLabel = s.label;
        (ref.articles || []).forEach(function (no) { if (arts.indexOf(no) < 0) arts.push(no); });
      });
    });
    if (l.priority) score += 6;
    var uniq = [];
    why.forEach(function (w) { if (uniq.indexOf(w) < 0) uniq.push(w); });
    return { score: score, why: sitLabel ? '「' + sitLabel + '」 상담 상황' : uniq.join(' · '), arts: arts.slice(0, 4) };
  }

  function search(q) {
    var nq = norm(q);
    if (!nq) return [];
    var out = [];
    LAWS.forEach(function (l) {
      var r = scoreLaw(l, nq);
      if (r) out.push({ law: l, score: r.score, why: r.why, arts: r.arts });
    });
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var pa = a.law.priority ? 1 : 0, pb = b.law.priority ? 1 : 0;
      if (pb !== pa) return pb - pa;
      return String(a.law.no).localeCompare(String(b.law.no));
    });
    return out;
  }

  function mark(text, q) {
    var s = esc(text);
    norm(q).split(' ').filter(Boolean).forEach(function (t) {
      if (t.length < 2) return;
      try {
        s = s.replace(new RegExp(reEsc(esc(t)), 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
      } catch (e) { /* 무시 */ }
    });
    return s;
  }

  /* ---------- 첫 화면 ---------- */
  function rowHTML(l, why, q, arts) {
    var tag = l.kind ? '<span class="tag">' + esc(l.kind) + '</span>' : '';
    var star = l.priority ? '<span class="tag star">⭐</span>' : '';
    var sub = q ? (why || '') : (l.why || '');
    var art = (arts && arts.length) ? ' · ' + arts.join(' · ') : '';
    return '<li><a class="row" href="#law=' + encodeURIComponent(l.id) + '">' +
      '<span class="r-no num" aria-hidden="true">' + esc(l.no || '') + '</span>' +
      '<span><span class="r-n">' + mark(l.name, q) + '</span><span class="r-s"><span class="r-b">' + tag + star + '</span>' +
      mark((sub ? sub + ' · ' : '') + (l.one_line || ''), q) + esc(art) + '</span></span>' +
      '<span class="r-go" aria-hidden="true">→</span></a></li>';
  }

  function renderList(q, opts) {
    opts = opts || {};
    var hitList;
    if (!norm(q)) {
      hitList = LAWS.filter(function (l) { return l.priority; }).map(function (l) { return { law: l }; });
      $('resTitle').innerHTML = '⭐ 우선참조 <i>' + hitList.length + '</i>';
      $('resSub').textContent = '누르면 쉬운 풀이와 조문 전문이 열립니다';
      $('resClear').hidden = true;
    } else {
      hitList = search(q);
      $('resTitle').innerHTML = '검색 결과 <i>' + hitList.length + '</i>';
      $('resSub').textContent = '「' + q + '」 — 관련도와 우선참조 가중치 순';
      $('resClear').hidden = false;
    }
    state.q = q;
    var rows = $('rows');
    if (!hitList.length) {
      rows.innerHTML = '<li class="empty"><b>「' + esc(q) + '」에 맞는 법령을 찾지 못했습니다.</b><br>' +
        '상황 낱말(예: 소개비, 수습, 알바)로 다시 찾거나, 법전 목차에서 직접 골라 보세요.' +
        '<span class="acts"><button type="button" data-act="book">법전 목차 열기</button>' +
        '<button type="button" data-act="reset">검색 지우기</button></span></li>';
      return;
    }
    var html = hitList.map(function (h) { return rowHTML(h.law, h.why, q, h.arts); }).join('');
    rows.innerHTML = (norm(q) || opts.headOnly === false) ? html : html;
    rows.setAttribute('data-head', norm(q) ? 'search' : 'priority');
  }

  function renderChips() {
    var box = $('chips');
    box.innerHTML = SITS.slice(0, 6).map(function (s) {
      return '<button type="button" data-sit="' + esc(s.id) + '" aria-pressed="false">' + esc(s.label) + '</button>';
    }).join('');
  }

  function setQuery(q, focus) {
    var input = $('q');
    input.value = q;
    $('qx').hidden = !q;
    [].forEach.call($('chips').children, function (b) { b.setAttribute('aria-pressed', 'false'); });
    if (q) {
      var s = SITS.filter(function (x) { return x.label === q; })[0];
      if (s) {
        var btn = $('chips').querySelector('[data-sit="' + s.id + '"]');
        if (btn) btn.setAttribute('aria-pressed', 'true');
      }
    }
    renderList(q);
    if (focus) input.focus();
  }

  /* ---------- 법령 상세 ---------- */
  function openLaw(id, artNo) {
    var l = byId[id];
    if (!l) { goHome(); return; }
    hydrate(l).then(function () {
      state.law = l;
      state.art = (artNo && (l.articles || []).some(function (a) { return a.no === artNo; })) ? artNo : ((l.articles || [])[0] || {}).no || '';
      state.tab = artNo ? 'text' : 'easy';
      $('view-home').hidden = true;
      $('view-book').hidden = true;
      $('view-law').hidden = false;
      state.view = 'law';
      d.documentElement.classList.add('law-view');
      d.documentElement.classList.remove('book-mode');
      renderLaw(l);
      window.scrollTo(0, 0);
    });
  }

  function renderLaw(l) {
    var arts = l.articles || [];
    var tabs = [{ k: 'easy', t: '풀이·사례' }];
    if (l.visual) tabs.push({ k: 'visual', t: '시각자료' });
    tabs.push({ k: 'text', t: '조문', n: arts.length });

    var meta = '<div class="lh-meta">' +
      '<span><b>시행</b> ' + esc(l.effective || '') + '</span>' +
      (l.promulgation ? '<span><b>공포</b> ' + esc(l.promulgation) + '</span>' : '') +
      (l.ministry ? '<span><b>소관</b> ' + esc(l.ministry) + '</span>' : '') +
      '<a class="lh-link" href="' + esc(l.law_url) + '" target="_blank" rel="noopener">국가법령정보센터 원문' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></div>';

    var chips = (l.chips || []).length ? '<div class="chips" style="margin-top:10px">' + l.chips.map(function (c) {
      return '<button type="button" data-q="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div>' : '';

    var easy = (l.easy || []).map(function (e) {
      return '<div class="e"><h3>' + esc(e.h) + '</h3><p>' + esc(e.p) + '</p></div>';
    }).join('');

    var exs = (l.examples || []).map(function (x) {
      return '<div class="ex"><div class="scene">' + esc(x.scene) + '</div><div class="dlg">' +
        '<p class="q">' + esc(x.q) + '</p><p class="a">' + esc(x.a) + '</p></div></div>';
    }).join('');

    var checks = (l.check || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    var blockA = '<div class="dt-a blk" data-blk="easy">' +
      '<h2 class="b-h"><b>①</b> 쉬운 풀이</h2><div class="easy">' + easy + '</div>' +
      (exs ? '<h2 class="b-h"><b>②</b> 실전 예시</h2><div class="exh">' + exs + '</div>' : '') +
      '</div>';

    var blockC = checks ? '<div class="dt-c blk" data-blk="check">' +
      '<h2 class="b-h"><b>' + (l.visual ? '④' : '③') + '</b> 실무 체크</h2><ul class="check">' + checks + '</ul></div>' : '';

    var blockV = l.visual ? '<div class="dt-v blk" data-blk="visual">' + visualHTML(l.visual) + '</div>' : '';

    var blockT = '<div class="dt-t blk" data-blk="text">' +
      '<h2 class="b-h"><b>' + (l.visual ? '③' : '②') + '</b> 조문 전문 <span style="font-weight:600">' + arts.length + '개</span></h2>' +
      '<div class="artwrap"><div class="artchips" role="group" aria-label="조문 고르기">' +
      arts.map(function (a) {
        return '<button type="button" data-art="' + esc(a.no) + '" aria-pressed="false"><span>' + esc(a.no) + '</span>' +
          (a.title ? '<small>' + esc(a.title) + '</small>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="art" id="artBox" tabindex="0"></div>' +
      '<p class="rights">법령·조례 조문은 저작권법 제7조에 따라 저작권 보호 대상이 아닙니다. 조문 글자는 원문 그대로이고, 개정 연혁 표시만 읽기 쉽도록 뺐습니다.</p>' +
      '</div></div>';

    $('view-law').innerHTML =
      '<div class="lawhead"><div class="lh-top"><a class="crumb" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>법전</a>' +
      '<span class="tag">' + esc(l.kind || '') + '</span>' + (l.priority ? '<span class="tag star">⭐ 우선참조</span>' : '') + '</div>' +
      '<h2>' + esc(l.name) + '</h2><p class="one">' + esc(l.one_line || '') + '</p>' + meta + chips + '</div>' +
      '<div class="tabs" role="tablist" aria-label="법령 보기">' + tabs.map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t.k + '" aria-selected="false">' + t.t +
          (t.n ? '<span class="cnt">' + t.n + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="dt" data-tab="' + state.tab + '">' + blockA + blockV + blockT + '</div>';

    setTab(state.tab);
    selectArt(state.art);
  }

  function setTab(k) {
    var l = state.law; if (!l) return;
    if (k === 'visual' && !l.visual) k = 'easy';
    state.tab = k;
    var dt = $('view-law').querySelector('.dt');
    if (dt) dt.setAttribute('data-tab', k);
    [].forEach.call($('view-law').querySelectorAll('.tabs [role="tab"]'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === k ? 'true' : 'false');
    });
  }

  function selectArt(no) {
    var l = state.law; if (!l) return;
    var arts = l.articles || [];
    var a = arts.filter(function (x) { return x.no === no; })[0] || arts[0];
    if (!a) return;
    state.art = a.no;
    [].forEach.call($('view-law').querySelectorAll('.artchips button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-art') === a.no ? 'true' : 'false');
    });
    var box = $('artBox');
    if (!box) return;
    box.innerHTML = '<h3>' + esc(a.no) + (a.title ? '(' + esc(a.title) + ')' : '') +
      '<small>' + esc(a.kind || l.kind || '') + ' · ' + esc(a.src || l.name) + '</small></h3>' +
      (a.paras || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<p class="src"><a href="' + esc(a.link || l.law_url) + '" target="_blank" rel="noopener">원문에서 확인</a>' +
      (a.trim ? ' · ' + esc(a.trim) : '') + '</p>';
    box.scrollTop = 0;
    if (window.JCCore && window.JCCore.state && window.JCCore.state().failed) window.JCCore.clear();
  }

  /* ---------- 가변형 시각자료 ---------- */
  function visualHTML(v) {
    if (!v || !v.kind) return '';
    var head = '<figcaption><b>' + esc(v.title || '') + '</b></figcaption>';
    var body = '';
    if (v.kind === 'bars') {
      var max = Number(v.max) || 100;
      body = '<div class="bars">' + (v.items || []).map(function (it) {
        var pct = Math.max(0, Math.min(1, (Number(it.value) || 0) / max));
        return '<div class="bar"><span class="bl">' + esc(it.label) + '</span>' +
          '<span class="bt" aria-hidden="true"><i style="transform:scaleX(' + pct.toFixed(4) + ')"></i></span>' +
          '<span class="bv">' + esc(it.value) + esc(v.unit || '') + '</span>' +
          (it.note ? '<span class="bn">' + esc(it.note) + '</span>' : '') + '</div>';
      }).join('') + '</div>' +
        '<p class="sr">' + (v.items || []).map(function (it) { return it.label + ' ' + it.value + (v.unit || ''); }).join(', ') + '</p>';
    } else if (v.kind === 'compare') {
      body = '<div class="cmp">' +
        '<div class="c ok"><h4><i aria-hidden="true">O</i>' + esc(v.left.head) + '</h4><ul>' +
        (v.left.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="c no"><h4><i aria-hidden="true">X</i>' + esc(v.right.head) + '</h4><ul>' +
        (v.right.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>';
    } else if (v.kind === 'flow') {
      body = '<div class="flow">' + (v.steps || []).map(function (s, i, arr) {
        return '<div class="st"><span class="n num">' + (i + 1) + '</span><b>' + esc(s.k) + '</b><span>' + esc(s.d) + '</span></div>' +
          (i < arr.length - 1 ? '<span class="ar" aria-hidden="true"></span>' : '');
      }).join('') + '</div>';
    } else if (v.kind === 'timeline') {
      body = '<div class="tl">' + (v.items || []).map(function (x) {
        return '<div class="pt"><span class="t">' + esc(x.t) + '</span><span class="d">' + esc(x.d) + '</span></div>';
      }).join('') + '</div>';
    }
    return '<figure class="vis">' + head + body + (v.note ? '<p class="vnote">' + esc(v.note) + '</p>' : '') + '</figure>';
  }

  /* ---------- 책처럼 보기 ---------- */
  function buildPages() {
    PAGES = [];
    LAWS.forEach(function (l) {
      (l.articles || []).forEach(function (a) { PAGES.push({ law: l, art: a }); });
    });
  }

  function openBook(target) {
    var start = 0;
    if (target && target.id) {
      for (var i = 0; i < PAGES.length; i++) {
        if (PAGES[i].law.id === target.id && (!target.no || PAGES[i].art.no === target.no)) { start = i; break; }
      }
    }
    var need = [];
    PAGES.forEach(function (p) { if (!(p.law.articles || []).length) need.push(p.law); });
    Promise.all((need.length ? need : []).map(hydrate)).then(function () {
      buildPages();
      state.page = Math.min(start, Math.max(0, PAGES.length - 1));
      renderBook();
      $('view-home').hidden = true;
      $('view-law').hidden = true;
      $('view-book').hidden = false;
      state.view = 'book';
      d.documentElement.classList.add('law-view', 'book-mode');
      window.scrollTo(0, 0);
    });
  }

  function renderBook() {
    var box = $('view-book');
    if (!box.getAttribute('data-built')) {
      box.innerHTML =
        '<div class="bk"><div class="bk-bar">' +
        '<button type="button" class="bk-btn" id="bkBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>법전</button>' +
        '<span class="pos"><b id="bkNo">1</b> / <span id="bkTot">1</span></span>' +
        '<span class="sp"></span>' +
        '<button type="button" class="bk-btn bk-tocbtn" id="bkToc">목차</button>' +
        '</div><div class="bk-body">' +
        '<nav class="bk-toc" id="bkTocPanel" aria-label="법전 목차"></nav>' +
        '<div class="bk-main"><div class="paper" id="paper" aria-live="polite">' +
        '<div class="pg-law"><span class="k" id="pgKind"></span><span id="pgLaw"></span></div>' +
        '<h3 id="pgTitle"></h3>' +
        '<div class="pg-body" id="pgBody"></div>' +
        '<div class="pg-foot"><a id="pgSrc" href="#" target="_blank" rel="noopener">국가법령정보센터 원문</a>' +
        '<span id="pgNote">저작권법 제7조 · 조문 원문</span><span class="stamp" id="pgStamp"></span></div>' +
        '</div><div class="bk-nav">' +
        '<button type="button" id="bkPrev">← 이전</button><span class="hint">← → 키로도 넘깁니다</span>' +
        '<button type="button" id="bkNext">다음 →</button></div></div></div></div>';
      box.setAttribute('data-built', '1');
      $('bkBack').addEventListener('click', goHome);
      $('bkPrev').addEventListener('click', function () { goPage(state.page - 1, -1); });
      $('bkNext').addEventListener('click', function () { goPage(state.page + 1, 1); });
      $('bkToc').addEventListener('click', openSheet);
      $('bkTocPanel').addEventListener('click', onTocClick);
      bindSwipe($('paper'));
    }
    $('bkTot').textContent = PAGES.length;
    renderToc();
    paintPage(null);
  }

  function tocHTML() {
    var out = '<h3>법전 목차</h3>';
    LAWS.forEach(function (l) {
      if (!(l.articles || []).length) return;
      out += '<ol><li><button type="button" class="ch" data-law="' + esc(l.id) + '">' +
        '<i>' + esc(l.no) + '</i><span>' + esc(l.name) + '<small>' + esc(l.kind || '') + ' · 조문 ' + (l.articles || []).length + '</small></span></button></li>' +
        (l.articles || []).map(function (a) {
          return '<li><button type="button" class="li" data-law="' + esc(l.id) + '" data-no="' + esc(a.no) + '">' +
            '<span>' + esc(a.no) + '</span>' + esc(a.title || '') + '</button></li>';
        }).join('') + '</ol>';
    });
    return out;
  }

  function renderToc() {
    var panel = $('bkTocPanel');
    if (!panel) return;
    panel.innerHTML = tocHTML();
    var sb = $('sheetBody');
    if (sb && $('sheet').classList.contains('on')) sb.innerHTML = '<nav class="bk-toc">' + tocHTML() + '</nav>';
    paintToc();
  }

  function paintToc() {
    var cur = PAGES[state.page]; if (!cur) return;
    [].forEach.call(d.querySelectorAll('.bk-toc .li'), function (b) {
      var on = b.getAttribute('data-law') === cur.law.id && b.getAttribute('data-no') === cur.art.no;
      b.setAttribute('aria-current', on ? 'page' : 'false');
      if (on && b.scrollIntoView && b.closest('.bk-toc')) {
        var box = b.closest('.bk-toc');
        if (box.scrollHeight > box.clientHeight) {
          var top = b.offsetTop - box.offsetTop;
          if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
        }
      }
    });
    [].forEach.call(d.querySelectorAll('.bk-toc .ch'), function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-law') === cur.law.id ? 'true' : 'false');
    });
  }

  function paintPage(dir) {
    var cur = PAGES[state.page]; if (!cur) return;
    var l = cur.law, a = cur.art;
    $('pgKind').textContent = (a.kind || l.kind || '');
    $('pgLaw').textContent = a.src || l.name;
    $('pgTitle').textContent = a.no + (a.title ? '(' + a.title + ')' : '');
    $('pgBody').innerHTML = (a.paras || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    $('pgBody').scrollTop = 0;
    $('pgSrc').href = a.link || l.law_url;
    $('pgNote').textContent = '저작권법 제7조 · ' + (a.src || l.name) + ' 원문';
    $('pgStamp').textContent = String(state.page + 1);
    $('bkNo').textContent = state.page + 1;
    $('bkPrev').disabled = state.page <= 0;
    $('bkNext').disabled = state.page >= PAGES.length - 1;
    paintToc();
    var paper = $('paper');
    if (paper && dir && !reduce()) {
      try {
        paper.animate(
          [{ opacity: .35, transform: 'translateX(' + (dir > 0 ? 22 : -22) + 'px)' }, { opacity: 1, transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(.2,.9,.3,1)' }
        );
      } catch (e) { /* 무시 */ }
    }
    try { d.dispatchEvent(new CustomEvent('jc-busy')); } catch (e) { }
    setTimeout(function () { try { d.dispatchEvent(new CustomEvent('jc-busy')); } catch (e) { } }, 220);
  }

  function goPage(i, dir) {
    if (i < 0 || i >= PAGES.length) return;
    state.page = i;
    paintPage(dir);
    var cur = PAGES[i];
    if (cur) history.replaceState(null, '', '#book=' + encodeURIComponent(cur.law.id) + '/' + encodeURIComponent(cur.art.no));
  }

  function onTocClick(e) {
    var b = e.target.closest ? e.target.closest('button[data-law]') : null;
    if (!b) return;
    var id = b.getAttribute('data-law'), no = b.getAttribute('data-no') || '';
    for (var i = 0; i < PAGES.length; i++) {
      if (PAGES[i].law.id === id && (!no || PAGES[i].art.no === no)) { goPage(i, 0); break; }
    }
    closeSheet();
  }

  function bindSwipe(el) {
    if (!el) return;
    var sx = 0, sy = 0, on = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      on = true; sx = e.clientX; sy = e.clientY;
    }, { passive: true });
    el.addEventListener('pointercancel', function () { on = false; }, { passive: true });
    el.addEventListener('pointerup', function (e) {
      if (!on) return; on = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      goPage(state.page + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function openSheet() {
    var sh = $('sheet');
    $('sheetBody').innerHTML = '<nav class="bk-toc">' + tocHTML() + '</nav>';
    $('sheetBody').addEventListener('click', onTocClick);
    sh.hidden = false;
    sh.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { sh.classList.add('on'); });
    var x = $('sheetX'); if (x) x.focus({ preventScroll: true });
    paintToc();
  }
  function closeSheet() {
    var sh = $('sheet');
    if (!sh || sh.hidden) return;
    sh.classList.remove('on');
    sh.setAttribute('aria-hidden', 'true');
    setTimeout(function () { if (!sh.classList.contains('on')) sh.hidden = true; }, 300);
  }

  /* ---------- 화면 전환·주소 ---------- */
  function goHome() {
    $('view-law').hidden = true;
    $('view-book').hidden = true;
    $('view-home').hidden = false;
    state.view = 'home';
    state.law = null;
    d.documentElement.classList.remove('law-view', 'book-mode');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    renderList($('q').value || '');
    window.scrollTo(0, 0);
  }

  function route() {
    var h = location.hash.replace(/^#/, '');
    if (!h) { goHome(); return; }
    if (h.indexOf('book') === 0) {
      var bm = /^book=([^/]+)(?:\/(.+))?$/.exec(h);
      if (bm) openBook({ id: decodeURIComponent(bm[1]), no: bm[2] ? decodeURIComponent(bm[2]) : '' });
      else openBook(null);
      return;
    }
    var m = /^law=([^&]+)(?:&a=(.+))?$/.exec(h);
    if (m) openLaw(decodeURIComponent(m[1]), m[2] ? decodeURIComponent(m[2]) : '');
    else goHome();
  }

  /* ---------- 사건 묶기 ---------- */
  function bind() {
    var input = $('q');
    input.addEventListener('input', function () {
      $('qx').hidden = !input.value;
      if (rafQ) return;
      rafQ = requestAnimationFrame(function () {
        rafQ = 0;
        renderList(input.value);
      });
    });
    $('qform').addEventListener('submit', function (e) {
      e.preventDefault();
      var hits = search(input.value);
      if (hits.length) location.hash = 'law=' + encodeURIComponent(hits[0].law.id);
      else renderList(input.value);
    });
    $('qx').addEventListener('click', function () { setQuery('', true); });
    $('resClear').addEventListener('click', function () { setQuery('', true); });
    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sit]'); if (!b) return;
      var on = b.getAttribute('aria-pressed') === 'true';
      setQuery(on ? '' : b.textContent, false);
      if (state.view === 'law') goHome();
    });
    $('rows').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.getAttribute('data-act') === 'book') openBook(null);
      else setQuery('', true);
    });
    $('bookBtn').addEventListener('click', function () { openBook(null); });

    $('view-law').addEventListener('click', function (e) {
      var t = e.target;
      var tab = t.closest ? t.closest('[data-tab]') : null;
      if (tab && tab.getAttribute('role') === 'tab') { setTab(tab.getAttribute('data-tab')); return; }
      var art = t.closest ? t.closest('[data-art]') : null;
      if (art) { selectArt(art.getAttribute('data-art')); return; }
      var qbtn = t.closest ? t.closest('button[data-q]') : null;
      if (qbtn) { setQuery(qbtn.textContent, true); goHome(); }
    });

    $('pvT').addEventListener('click', function () {
      var open = $('pvT').getAttribute('aria-expanded') === 'true';
      $('pvT').setAttribute('aria-expanded', open ? 'false' : 'true');
      $('pvB').hidden = open;
      $('pvL').textContent = open ? '펼치기' : '접기';
    });

    $('sheetX').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });

    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('sheet').hidden) { closeSheet(); return; }
        if (state.view === 'book') { goHome(); return; }
      }
      if (state.view !== 'book' || !$('sheet').hidden) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(state.page + 1, 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(state.page - 1, -1); }
      else if (e.key === 'Home') { e.preventDefault(); goPage(0, -1); }
      else if (e.key === 'End') { e.preventDefault(); goPage(PAGES.length - 1, 1); }
    });

    d.addEventListener('keydown', function (e) {
      if (state.view !== 'home') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var rows = [].slice.call($('rows').querySelectorAll('a.row'));
      if (!rows.length) return;
      var i = rows.indexOf(d.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
      rows[n].focus();
      rows[n].scrollIntoView({ block: 'nearest' });
    });

    $('brand').addEventListener('click', function (e) { e.preventDefault(); goHome(); });
    window.addEventListener('hashchange', route);
  }

  bind();
  load();
})();
