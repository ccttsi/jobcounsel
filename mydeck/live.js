/* live.js — 마이덱 라이브 · 마이덱 알고리즘 (2026-11-20)
 *
 * 두 꼭지
 *   · 마이덱 라이브   — 「하고 싶은 일」을 한 문장으로 적으면 핵심 키워드를 뽑아 완성덱 세 개.
 *   · 마이덱 알고리즘 — 개념·키워드를 하나만 눌러도 같은 세 갈래로 완성덱 세 개.
 *   짜는 일은 assemble.js가 맡고, 이 파일은 화면과 저장·실행(상담 OS 보드)을 맡는다.
 *
 * 보드
 *   고른 덱의 단계마다 발문·체크·근거 카드를 세운다. 단계 이동은 한 줄 레일(deck-nav.js)로
 *   어느 단계로든 한 번에 건너뛴다(1→5→3→4→2). ←/→와 좌우로 밀기도 함께 듣는다.
 *
 * 지키는 선
 *   · 색인에 있는 것만 근거로 세운다. 수치·조문·기업명을 지어내지 않는다.
 *   · 화면·문서 밖으로 내보내는 단추(요약 복사)는 두지 않는다.
 *   · 움직이는 값은 transform·opacity 뿐(DESIGN.md §2).
 */
(function () {
  'use strict';
  if (window.JCDeckLive) return;

  var PINS_KEY = 'jc-mydeck-live-pins-v1';
  var MAX_STEPS = 12;

  var state = {
    mode: 'decks', pick: 'algo', q: '', active: 0, built: null, pins: [],
    deck: null, deckId: '', fixed: false, courses: [], saving: false, busy: false, checks: {},
    savedWhere: '', graph: null
  };
  var dom = {};
  var typer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function toast(m) {
    var t = $('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('on'); }, 3600);
  }
  function loggedIn() { return !!(window.JCDeck && window.JCDeck.loggedIn()); }
  function store() { return window.JCDeck; }
  function A() { return window.JCAssemble; }

  function tools() { return window.JC_TOOLS || []; }
  function toolOf(id) {
    var out = null;
    tools().forEach(function (x) { if (x.id === id) out = x; });
    return out;
  }
  function secOf(id) { return A() ? A().sector(id) : (toolOf(id) || { id: id, no: '', title: id, badge: '', desc: '', meta: [], path: './' + id + '/', gi: '' }); }
  function pathHref(p) {
    p = String(p || '');
    if (p.indexOf('./') === 0) return '../' + p.slice(2);
    if (p.indexOf('../') === 0) return p;
    return '../' + p.replace(/^\//, '');
  }

  /* ================================================================ 발문 (질문 틀) */
  var ASK = {
    theory: ['이 내담자가 「자기 이해 · 직업 세계 · 합리적 추론」 중 어디에서 멈춰 있나요?',
             '이번 상담의 틀로 삼을 이론을 하나 골랐나요? 왜 그 이론인지 한 줄로 적어 두세요.'],
    parsons: ['내담자 스스로 자기 특성 · 직업 조건 · 둘의 관계를 말로 정리할 수 있나요?',
              '세 요인 중 비어 있는 칸이 어디인지 함께 짚어 봤나요?'],
    dacum: ['목표 직무의 책무와 과업을 내담자 말로 쪼개 봤나요?',
            '과업 진술문이 「행동 + 대상 + 조건 + 기준」을 갖췄는지 확인했나요?'],
    taxonomy: ['내담자가 말한 직무 이름을 분류 코드와 맞대어 봤나요?',
               '같은 이름의 다른 직무와 헷갈리고 있지 않나요?'],
    decalcomania: ['목표 직업과 이어지는 전공·개설 대학을 확인했나요?',
                   '그 연결이 면허필수인지 전공우대인지 구분했나요?'],
    library: ['보고서에서 인용할 수치가 있나요? 출처(보고서명·연도)를 함께 적었나요?',
              '그 수치가 이 내담자에게 어떤 의미인지 한 문장으로 옮겼나요?'],
    briefing: ['오늘 지면 중 이 내담자와 닿는 기사는 무엇인가요?',
               '그 기사의 수치를 상담에서 어떻게 쓸지 정했나요?'],
    emerging: ['이 직무가 신산업 어느 갈래에서 생겼는지 설명할 수 있나요?',
               '기존 직무와 최근 직무 중 내담자 경력과 가까운 쪽은 무엇인가요?'],
    labor: ['이 내담자의 상황을 노동시장 지표로 어떻게 읽을까요?',
            '실업률·고용률 같은 지표를 내담자에게 어떻게 풀어 말할까요?'],
    reality: ['내담자의 예측과 공식 통계를 먼저 맞대어 봤나요?',
              '착시가 컸던 항목은 무엇이었나요?'],
    'work-filter': ['내담자가 견딜 수 있는 근무 조건과 견디기 어려운 조건을 나눠 물었나요?',
                    '교대·이동·대면 중 걸리는 축이 무엇인가요?'],
    manual: ['수급자격 요건(피보험 단위기간·이직 사유) 중 걸리는 곳이 어디인가요?',
             '해당 조문을 함께 펴서 확인했나요?'],
    'kdt-calc': ['훈련비·수강자 유형을 넣어 자부담과 지원액을 함께 계산해 봤나요?',
                 '계좌 한도가 남아 있는지 확인했나요?'],
    law: ['문제가 임금·근로시간·해고 중 어디에 걸리는지 먼저 가르나요?',
          '서면 근로계약서·급여명세서·근무표를 볼 수 있나요?'],
    vpi: ['검사 결과를 내담자와 함께 읽었나요, 점수를 대신 해석했나요?',
          '흥미·성격·생활사가 서로 어긋나는 지점을 짚었나요?'],
    hud: ['유형 판정에 필요한 나이·가구·소득·취업 상태를 다 확인했나요?',
          '지급액·기한 계산 결과를 내담자에게 숫자로 보여 줬나요?'],
    triage: ['생계·주거, 심리·건강, 구직의지, 소득·재산, 최근 2년 취업경험 다섯 축을 확인했나요?',
             '위기 신호가 있으면 오늘 먼저 붙일 제도를 정했나요?'],
    talk: ['내담자 말을 되받아 주기(재진술·감정 반영)로 먼저 확인했나요?',
           '막히는 지점(저항·침묵)에서 질문을 바꿔 봤나요?'],
    translator: ['내담자가 쓴 말을 정식 용어로 바꿔 한 번 되짚어 줬나요?',
                 '낮춰 부르는 말·은어를 그대로 받아들이지 않고 뜻을 확인했나요?'],
    cert: ['목표 직무에 이 자격이 실제로 요구되는지 채용공고로 확인했나요?',
           '시험 일정과 응시 자격을 내담자가 직접 확인할 수 있게 안내했나요?'],
    univ: ['학과 이름이 같아도 학교마다 다른 교육과정을 확인했나요?',
           '유사학과와 같은 계열 학과 중 어디를 함께 볼지 정했나요?'],
    grad: ['석·박사 진학이 목표 직무에 필요한지 먼저 확인했나요?',
           '재정 지원과 자격 문턱을 함께 봤나요?'],
    company: ['이 기업의 업종·규모·최근 소식을 확인했나요?',
              '공공기관인지 대기업·중견기업인지 구분해 안내했나요?'],
    'fin-lab': ['세 표(재무상태표·손익계산서·현금흐름표)를 3개년으로 함께 봤나요?',
                '이 회사의 재무 체력 중 약한 축을 한 줄로 말할 수 있나요?'],
    portals: ['어느 채용 경로로 지원할지 정했나요?',
              '직무와 대상(신입·경력·장애인 등)에 맞는 사이트인지 확인했나요?'],
    thermometer: ['어느 산업의 수요를 확인할까요?',
                  '국내와 글로벌 온도가 갈리는 산업인지 봤나요?'],
    surgery: ['지원할 공고 문구에서 숨은 의도를 확인했나요?',
              '감점되는 문장이 있으면 원인과 다시 쓰는 법을 함께 짚었나요?'],
    interview: ['질문의 숨은 의도를 먼저 읽고 답변을 준비했나요?',
                '법적으로 물어보면 안 되는 질문인지 구분했나요?'],
    portfolio: ['채용 담당자가 90초에 보는 장면을 기준으로 정리했나요?',
                '소재를 3~5개로 줄였나요?'],
    transit: ['출발 유형(첫 진입·휴식 후 재진입·비자발적 전환·2막)을 정했나요?',
              '지금 막힌 환승역이 어디인가요?'],
    flow: ['이 순서가 내담자 상황과 맞는지 한 번 더 확인했나요?']
  };
  var ASK_ANY = ['이 단계에서 내담자에게 확인할 것을 한 문장으로 정리했나요?',
                 '근거 카드 중 상담 중 바로 열어 볼 것을 골랐나요?'];
  function askFor(st) {
    var a = ASK[st.id];
    return (a && a.length ? a : ASK_ANY).slice(0, 3);
  }

  /* ================================================================ 근거 카드 만들기 */
  function cardKey(r) { return (r.sector || '') + '|' + (r.title || '') + '|' + (r.url || ''); }

  function toCard(r) {
    return {
      sector: r.sector || '', sectorTitle: r.sectorTitle || secOf(r.sector).title,
      title: r.title || '', snippet: r.snippet || '', why: r.why || '', reason: r.reason || '',
      url: r.url || '', kind: r.kind || 'doc', score: r.score || 0
    };
  }
  function hrefOf(u, q) {
    u = String(u || '');
    if (/^https?:/i.test(u)) return u;
    if (u.indexOf('../') === 0) return u;
    if (u.indexOf('./') === 0) u = u.slice(2);
    u = '../' + u.replace(/^\//, '');
    if (u && u.indexOf('?') < 0 && u.indexOf('#') < 0 && q) u += '?q=' + encodeURIComponent(q);
    return u;
  }
  function shortQ(n) {
    var src = String(state.q || '').replace(/\s+/g, ' ').trim();
    return src.length > n ? src.slice(0, n - 1) + '…' : src;
  }
  function qShort() {
    var b = state.built;
    var toks = ((b && b.keys && b.keys.tokens) || []).filter(function (t) { return !/^[ㄱ-ㅎ]+$/.test(t); });
    return toks.slice(0, 4).join(' ') || shortQ(40);
  }

  function numsOf(cards) {
    var RE = /(\d[\d,]*(?:\.\d+)?)\s*(만원|억원|천원|원|퍼센트|%|개월|시간|년|일|주|개|곳|건|명|배|점|세)/g, out = [], seen = {};
    cards.forEach(function (c) {
      var text = (c.title || '') + ' ' + (c.snippet || '');
      var m, n = 0;
      RE.lastIndex = 0;
      while ((m = RE.exec(text)) && n < 2) {
        var v = m[0].replace(/\s+/g, ' ').trim();
        if (/^(19|20)\d{2}년$/.test(v)) continue;
        if (seen[v]) continue;
        seen[v] = 1; n++;
        out.push({ v: v, src: c.title });
        if (out.length >= 5) return;
      }
    });
    return out;
  }

  function pairsOf(id) {
    var g = state.graph;
    if (!g || !g.pairs) return [];
    var out = [];
    g.pairs.forEach(function (p) {
      if (p.a !== id && p.b !== id) return;
      var other = p.a === id ? p.b : p.a;
      if (!other || other === 'flow') return;
      out.push({ id: other, w: p.w || 0, link: !!p.link, shared: (p.shared || []).slice(0, 3), basis: p.basis || '' });
    });
    out.sort(function (x, y) { return y.w - x.w || (y.link ? 1 : 0) - (x.link ? 1 : 0); });
    return out.slice(0, 2);
  }

  function notesFor(an, id) {
    var out = [];
    (an.dict || []).forEach(function (d) {
      if (!d || (d.s || []).indexOf(id) < 0) return;
      var q = String(d.q || '').replace(/\s+/g, ''), c = String(d.c || '').replace(/\s+/g, '');
      if (q === c) return;
      out.push({ q: d.q, c: d.c, x: d.x || '' });
    });
    return out.slice(0, 2);
  }

  function build(deck, q) {
    var S = window.JCAssistSearch;
    var an = S.analyze(q);
    var list = S.search(q, { limit: 3000, perSector: 3000 }) || [];
    var bySector = {}, seen = {}, clean = [];

    list.forEach(function (r) {
      if (!r || !r.title) return;
      var k = cardKey(r);
      if (seen[k]) return;
      seen[k] = 1;
      clean.push(r);
      (bySector[r.sector] = bySector[r.sector] || []).push(r);
    });

    var stages = deck.steps.map(function (st, i) {
      var sec = secOf(st.id);
      return {
        idx: i, id: st.id, title: st.title || sec.title, badge: st.badge || sec.badge,
        sec: sec, own: (bySector[st.id] || []).slice(0, 3).map(toCard), ask: askFor(st),
        note: notesFor(an, st.id), meta: (sec.meta || []).slice(0, 3), pairs: pairsOf(st.id), nums: []
      };
    });
    stages.forEach(function (stg) { stg.nums = numsOf(stg.own); });

    var evCount = 0;
    stages.forEach(function (s) { evCount += s.own.length; });

    return { deck: deck, q: q, stages: stages, evCount: evCount, keys: an, at: new Date(), suggest: suggestFor(an, q, deck, clean) };
  }

  function suggestFor(an, q, deck, list) {
    var inDeck = {}, sc = {}, why = {};
    deck.steps.forEach(function (s) { inDeck[s.id] = 1; });
    function bump(id, w, label) {
      if (!id || inDeck[id] || id === 'flow' || !toolOf(id)) return;
      sc[id] = (sc[id] || 0) + w;
      if (label) { why[id] = why[id] || []; if (why[id].indexOf(label) < 0 && why[id].length < 3) why[id].push(label); }
    }
    var S = window.JCAssistSearch;
    (S.route(q, { limit: 8 }) || []).forEach(function (r) { bump(r.id, 2 + (r.score || 0) * 0.4, (r.why || [])[0] || ''); });
    (an.dict || []).forEach(function (d) {
      var isAlias = String(d.q || '').replace(/\s+/g, '') !== String(d.c || '').replace(/\s+/g, '');
      (d.s || []).forEach(function (id, i) { bump(id, (isAlias ? 2.4 : 1.4) - i * 0.15, d.c); });
    });
    var g = state.graph, nq = norm(q);
    if (g) {
      (g.starts || []).forEach(function (s) {
        if (!s.k || nq.indexOf(norm(s.k)) < 0) return;
        (s.to || []).forEach(function (id) { bump(id, 2.2, s.k); });
      });
      Object.keys(g.kw || {}).forEach(function (k) {
        if (k.length < 2 || nq.indexOf(norm(k)) < 0) return;
        (g.kw[k] || []).forEach(function (id) { bump(id, 0.45, k); });
      });
    }
    var hits = {};
    (list || []).forEach(function (r) { hits[r.sector] = (hits[r.sector] || 0) + 1; });
    Object.keys(hits).forEach(function (id) { if (hits[id] >= 2) bump(id, Math.min(2, hits[id] * 0.3), ''); });

    var out = Object.keys(sc).map(function (id) {
      var s = secOf(id);
      return { id: id, title: s.title, badge: s.badge, desc: s.desc, meta: s.meta, score: sc[id], why: why[id] || [] };
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.filter(function (x) { return x.score >= 2; }).slice(0, 3);
  }

  /* ================================================================ 근거 핀 */
  function readPins() {
    try {
      var o = JSON.parse(localStorage.getItem(PINS_KEY) || 'null');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function loadPins() {
    var all = readPins();
    state.pins = (state.built && all[state.built.deck.id]) ? all[state.built.deck.id] : [];
  }
  function savePins() {
    if (!state.built) return;
    var all = readPins();
    all[state.built.deck.id] = state.pins;
    try { localStorage.setItem(PINS_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function pinId(c) { return (c.sector || '') + '|' + (c.title || ''); }
  function isPinned(c) {
    var k = pinId(c), hit = false;
    state.pins.forEach(function (p) { if (p.k === k) hit = true; });
    return hit;
  }
  function togglePin(c, stageIdx) {
    var k = pinId(c);
    if (isPinned(c)) {
      state.pins = state.pins.filter(function (p) { return p.k !== k; });
      toast('고정을 풀었어요.');
    } else {
      state.pins = state.pins.concat([{ k: k, st: stageIdx, title: c.title, url: c.url, sector: c.sector, sectorTitle: c.sectorTitle, why: c.why }]);
      toast('상담 중 다시 볼 근거로 고정했어요.');
    }
    savePins();
    renderPins();
    renderStats();
  }

  /* ================================================================ 화면 — 모드 */
  function mountMode() {
    var host = $('lvModeHost');
    if (!host) return;
    clear(host);
    if (!loggedIn()) { host.hidden = true; return; }
    host.hidden = false;
    var bar = el('div', 'lv-mode');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', '마이덱 화면 고르기');
    [['decks', '내 덱'], ['live', '덱 짜기']].forEach(function (m) {
      var b = el('button', null, m[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.mode === m[0]));
      b.addEventListener('click', function () { setMode(m[0]); });
      bar.appendChild(b);
    });
    host.appendChild(bar);
  }

  function setMode(m) {
    if (m === 'live' && !loggedIn()) m = 'decks';
    state.mode = m;
    var deck = $('deckMode'), live = $('live'), hero = $('deckHero');
    if (deck) deck.hidden = m !== 'decks';
    if (hero) hero.hidden = m !== 'decks';
    if (live) live.hidden = m !== 'live';
    mountMode();
    if (m === 'live') {
      if (typer && state.pick === 'live') typer.start();
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    } else {
      if (typer) typer.stop();
    }
  }

  /* 내 덱 카드의 「라이브 실행」 — 그 덱을 고정해 두고 연다. */
  function open(deckId, deckObj) {
    if (!loggedIn()) { toast('덱 짜기는 로그인하면 쓸 수 있어요.'); return false; }
    var d = deckObj || null;
    state.deck = d || null;
    state.deckId = deckId || '';
    state.fixed = !!d;
    state.q = '';
    state.courses = [];
    state.built = null;
    state.active = 0;
    state.pins = [];
    if (dom.ask) dom.ask.value = '';
    setMode('live');
    setPick('live');
    mountFix();
    showCourses(true);
    setTimeout(focusAsk, 140);
    return true;
  }

  /* ================================================================ 화면 — 입력 */
  function mountFix() {
    var box = $('lvFix');
    if (!box) return;
    clear(box);
    box.hidden = !(state.fixed && state.deck);
    if (box.hidden) return;
    box.appendChild(el('b', null, '이 덱으로 엽니다'));
    box.appendChild(el('span', null, state.deck.name));
    var b = el('button', null, '덱 바꾸기');
    b.type = 'button';
    b.addEventListener('click', function () {
      state.fixed = false; state.deck = null; state.deckId = '';
      mountFix();
    });
    box.appendChild(b);
  }

  function setMsg(t, bad) {
    if (!dom.msg) return;
    dom.msg.textContent = t || '';
    dom.msg.className = 'lv-msg' + (bad ? ' bad' : '');
  }
  function focusAsk() {
    if (!dom.ask) return;
    try { dom.ask.focus({ preventScroll: true }); } catch (e) { try { dom.ask.focus(); } catch (e2) {} }
  }

  function showCourses(on) {
    var box = $('lvBox'), courses = $('lvCourses');
    if (box) box.hidden = !on && !state.built;
    if (!on && courses) courses.hidden = true;
  }

  /* 알고리즘(키워드 하나) ↔ 라이브(문장) */
  function setPick(m) {
    state.pick = m;
    var field = $('lvField'), chips = $('lvChips'), go = $('lvGo'), tut = $('lvTut'), pick = $('lvPick');
    var algo = m === 'algo';
    if (field) field.hidden = algo;
    if (chips) chips.hidden = !algo;
    if (go) go.hidden = algo;
    if (tut) tut.hidden = algo;
    if (pick) Array.prototype.forEach.call(pick.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-m') === m));
    });
    if (typer) { if (algo) typer.stop(); else typer.start(); }
    setHero();
    setMsg('');
  }

  /* 첫머리 — 지금 꼭지에 맞는 문장으로. 보드가 열리면 자리를 비킨다. */
  function setHero() {
    var hero = document.querySelector('.lv-hero');
    if (!hero) return;
    var kick = hero.querySelector('.kick .no');
    var h1 = hero.querySelector('h1');
    var algo = state.pick === 'algo';
    if (kick) kick.textContent = algo ? '마이덱 알고리즘' : '마이덱 라이브';
    if (h1) {
      clear(h1);
      if (algo) {
        h1.appendChild(el('em', null, '개념 하나'));
        h1.appendChild(document.createTextNode('만 눌러도 — 세 가지 완성덱'));
      } else {
        h1.appendChild(document.createTextNode('하고 싶은 일을 '));
        h1.appendChild(el('em', null, '한 문장'));
        h1.appendChild(document.createTextNode('으로 — 세 가지 완성덱'));
      }
    }
    hero.hidden = !!state.built;
  }

  function renderChips() {
    var host = $('lvChips');
    if (!host) return;
    clear(host);
    (A().CHIPS || []).forEach(function (k) {
      var b = el('button', 'lv-chip', k);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.q === k));
      b.addEventListener('click', function () {
        state.q = k;
        if (dom.ask) dom.ask.value = '';
        Array.prototype.forEach.call(host.children, function (x) { x.setAttribute('aria-pressed', String(x.textContent === k)); });
        generate(k);
      });
      host.appendChild(b);
    });
  }

  /* ================================================================ 세 가지 완성덱 */
  function generate(q) {
    q = String(q == null ? state.q : q).replace(/\s+/g, ' ').trim();
    state.q = q;
    if (!q) { setMsg('하고 싶은 일을 한 문장으로 적어 주세요.', true); focusAsk(); return; }
    if (state.busy) return;
    state.busy = true;
    if (dom.go) dom.go.disabled = true;
    setMsg(state.fixed ? '자료실 색인에서 근거를 찾는 중…' : '문장에서 걸리는 자료실 섹터를 찾는 중…');
    document.documentElement.setAttribute('data-jc-live', 'loading');
    A().load().then(function () {
      state.graph = A().graph();
      state.busy = false;
      if (dom.go) dom.go.disabled = false;
      if (state.fixed && state.deck) { setMsg(''); runBoard(); return; }
      var list = A().courses(q);
      state.courses = list;
      if (!list.length) {
        setMsg('이 말에서 걸리는 자료실 섹터를 찾지 못했어요. 「경력단절 내담자 첫 상담」처럼 상담 상황을 적거나, 다른 개념을 눌러 보세요.', true);
        renderCourses();
        document.documentElement.setAttribute('data-jc-live', 'idle');
        return;
      }
      setMsg('');
      renderCourses();
      document.documentElement.setAttribute('data-jc-live', 'ready');
      var host = $('lvCourses');
      if (host && host.getBoundingClientRect().top > window.innerHeight * 0.72) {
        try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    }).catch(function () {
      state.busy = false;
      if (dom.go) dom.go.disabled = false;
      document.documentElement.setAttribute('data-jc-live', 'failed');
      setMsg('자료실 색인을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.', true);
    });
  }

  function renderCourses() {
    var host = $('lvCourses');
    if (!host) return;
    clear(host);
    if (state.fixed || !state.courses.length) { host.hidden = true; return; }
    host.hidden = false;

    var hd = el('p', 'lv-c-hd');
    hd.appendChild(el('b', null, '이렇게 세 가지로 짰어요'));
    hd.appendChild(el('span', null, '단계를 누르면 갈라지는 자료가 열립니다 · 하나를 고르면 내 덱에 저장하고 상담 OS로 엽니다'));
    host.appendChild(hd);

    var wrap = el('div', 'lv-cards');
    A().cards(wrap, state.courses, { label: '이 덱으로 열기', onPick: pickCourse });
    host.appendChild(wrap);

    var foot = el('p', 'lv-c-why');
    foot.appendChild(document.createTextNode('근거는 자료실 색인과 시너지 지도에서만 가져왔습니다. 단계를 눌러 다른 자료로 바꾸거나 아래를 다시 짤 수 있습니다.'));
    host.appendChild(foot);
  }

  /* 고른 덱 → 내 덱에 저장 → 상담 OS 보드 */
  function pickCourse(c, btn) {
    if (state.saving) return;
    var D = store();
    if (!D) { setMsg('저장 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.', true); return; }
    var steps = c.steps.map(function (s) {
      var sec = secOf(s.id);
      return { id: s.id, no: sec.no, title: sec.title, badge: sec.badge };
    });
    state.saving = true;
    var was = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '저장하는 중…'; }
    D.save({ name: c.name, steps: steps }).then(function (r) {
      state.saving = false;
      if (btn) { btn.disabled = false; btn.textContent = was; }
      var deck = r.deck || { id: '', name: c.name, steps: steps, where: 'local' };
      state.deck = deck;
      state.deckId = deck.id;
      state.fixed = false;
      state.built = null;
      state.active = 0;
      state.checks = {};
      state.pins = [];
      state.savedWhere = r.source === 'server' ? 'server' : 'session';
      toast(r.source === 'server' ? '내 계정의 마이덱에 저장했어요.' : '이 창에 저장했어요. 창을 닫으면 초기화됩니다.');
      renderCourses();
      runBoard();
    }, function (e) {
      state.saving = false;
      if (btn) { btn.disabled = false; btn.textContent = was; }
      setMsg(D.errText(e || {}) || '덱으로 저장하지 못했어요.', true);
    });
  }

  /* ================================================================ 보드 */
  function runBoard(silent) {
    if (!state.deck || !state.deck.steps || !state.deck.steps.length) {
      if (!silent) setMsg('덱을 먼저 고르세요.', true);
      return;
    }
    var q = String(state.q || '').trim();
    if (!q) { if (!silent) setMsg('하고 싶은 일을 한 문장으로 적어 주세요.', true); focusAsk(); return; }
    if (state.busy) return;
    state.busy = true;
    if (dom.go) dom.go.disabled = true;
    if (!silent) setMsg('자료실 색인에서 근거를 찾는 중…');
    document.documentElement.setAttribute('data-jc-live', 'loading');
    A().load().then(function () {
      state.graph = A().graph();
      state.built = build(state.deck, q);
      if (!silent) { state.active = 0; state.checks = {}; }
      state.active = Math.min(state.active, state.built.stages.length - 1);
      loadPins();
      var box = $('lvBox'); if (box) box.hidden = true;
      var courses = $('lvCourses'); if (courses) courses.hidden = true;
      renderBoard();
      setMsg('');
      document.documentElement.setAttribute('data-jc-live', 'ready');
      if (!silent) {
        var host = $('lvBoard');
        if (host) { try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
      }
    }).catch(function () {
      document.documentElement.setAttribute('data-jc-live', 'failed');
      if (!silent) setMsg('근거를 세우지 못했어요. 잠시 뒤 다시 눌러 주세요.', true);
    }).then(function () {
      state.busy = false;
      if (dom.go) dom.go.disabled = false;
    });
  }

  function renderBoard() {
    var host = $('lvBoard');
    if (!host) return;
    clear(host);
    if (!state.built) { host.hidden = true; return; }
    host.hidden = false;

    var b = state.built;

    /* 보드가 열리면 첫머리는 비킨다 — 보드가 화면을 다 쓰게 */
    var heroEl = document.querySelector('.lv-hero');
    if (heroEl) heroEl.hidden = true;

    var top = el('div', 'lv-top');
    var hd = el('div', 'lv-top-hd');
    hd.appendChild(el('b', null, b.deck.name));
    var stats = el('div', 'lv-stats');
    stats.id = 'lvStats';
    hd.appendChild(stats);
    top.appendChild(hd);

    var toolsRow = el('div', 'lv-tools');
    var again = el('button', 'lv-tool', '근거 다시 찾기');
    again.type = 'button';
    again.addEventListener('click', function () { runBoard(); });
    toolsRow.appendChild(again);
    var back = el('button', 'lv-tool', '다른 덱 짜기');
    back.type = 'button';
    back.addEventListener('click', backToInput);
    toolsRow.appendChild(back);
    top.appendChild(toolsRow);

    var keys = el('p', 'lv-keys');
    keys.appendChild(el('b', null, '이렇게 읽었어요 — '));
    var toks = (b.keys.tokens || []).filter(function (t) { return !/^[ㄱ-ㅎ]+$/.test(t); });
    var added = (b.keys.added || []);
    keys.appendChild(document.createTextNode(toks.slice(0, 5).join(' · ') || '—'));
    if (added.length) {
      keys.appendChild(document.createTextNode(' / '));
      keys.appendChild(el('b', null, added.slice(0, 4).map(function (a) { return a.word; }).join(' · ')));
    }
    top.appendChild(keys);

    var saved = el('p', 'lv-saved');
    saved.appendChild(document.createTextNode(state.savedWhere === 'session'
      ? '이 창에 저장한 덱입니다. 창을 닫으면 초기화됩니다. — '
      : '내 덱에 저장했어요. — '));
    var openDeck = el('a', null, '내 덱에서 보기');
    openDeck.href = './';
    openDeck.addEventListener('click', function (e) {
      e.preventDefault();
      setMode('decks');
    });
    saved.appendChild(openDeck);
    top.appendChild(saved);
    host.appendChild(top);

    host.appendChild(window.JCDeckNav.make(b.deck, state.active, setActive));

    var pins = el('div', 'lv-pins');
    pins.id = 'lvPins';
    host.appendChild(pins);

    var panel = el('div', 'lv-panel');
    panel.id = 'lvPanel';
    host.appendChild(panel);

    if (b.suggest.length) host.appendChild(suggestBlock(b.suggest));

    renderStats();
    renderPins();
    renderPanel();
    window.JCDeckNav.context(b.deck, state.active);
  }

  function suggestBlock(list) {
    var sug = el('div', 'lv-sug');
    var open = false;
    var shd = el('button', 'lv-sug-toggle');
    shd.type = 'button';
    shd.setAttribute('aria-expanded', String(open));
    shd.appendChild(el('b', null, '덱에 없지만 걸리는 자료 ' + list.length + '곳'));
    shd.appendChild(el('span', null, '누르면 이 덱의 단계로 더합니다'));
    shd.appendChild(el('i', 'lv-sug-ar', open ? '접기' : '보기'));
    sug.appendChild(shd);
    var body = el('div', 'lv-sug-body');
    body.hidden = !open;
    list.forEach(function (s) { body.appendChild(suggestRow(s)); });
    sug.appendChild(body);
    shd.addEventListener('click', function () {
      var on = body.hidden;
      body.hidden = !on;
      shd.setAttribute('aria-expanded', String(on));
      shd.querySelector('.lv-sug-ar').textContent = on ? '접기' : '보기';
    });
    return sug;
  }

  function backToInput() {
    state.built = null;
    state.pins = [];
    var host = $('lvBoard');
    if (host) { clear(host); host.hidden = true; }
    window.JCDeckNav.clear();
    var box = $('lvBox'); if (box) box.hidden = false;
    mountFix();
    if (state.q && dom.ask) dom.ask.value = state.fixed ? '' : state.q;
    showCourses(true);
    renderCourses();
    if (typer) typer.paint();
    setHero();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  }

  function renderStats() {
    var box = $('lvStats');
    if (!box || !state.built) return;
    clear(box);
    var b = state.built;
    function stat(k, v) {
      var s = el('span', 'lv-stat');
      s.appendChild(document.createTextNode(k + ' '));
      s.appendChild(el('b', null, String(v)));
      return s;
    }
    box.appendChild(stat('단계', b.stages.length));
    box.appendChild(stat('근거', b.evCount));
    box.appendChild(stat('고정', state.pins.length));
  }

  function renderPins() {
    var box = $('lvPins');
    if (!box) return;
    clear(box);
    if (!state.built || !state.pins.length) { box.hidden = true; return; }
    box.hidden = false;
    var hd = el('div', 'lv-pins-hd');
    hd.appendChild(el('b', null, '상담 중 고정한 근거'));
    hd.appendChild(el('span', null, state.pins.length + '장 · 이 브라우저에만 남습니다'));
    box.appendChild(hd);
    state.pins.forEach(function (p) {
      var row = el('div', 'lv-pin');
      var tx = el('span', 'lv-pin-tx');
      tx.appendChild(el('span', 'lv-pin-t', p.title));
      var pb = String(secOf(p.sector).badge || '').trim();
      if (pb && pb !== String(p.title || '').trim() && pb !== (p.sectorTitle || '')) {
        tx.appendChild(el('span', 'lv-pin-s', pb.slice(0, 12)));
      }
      row.appendChild(tx);
      var a = el('a', null, '열기');
      a.href = hrefOf(p.url, qShort());
      a.setAttribute('aria-label', p.title + ' 열기');
      a.addEventListener('click', function () { window.JCDeckNav.context(state.built.deck, state.active); });
      row.appendChild(a);
      var x = el('button', null, '×');
      x.type = 'button';
      x.setAttribute('aria-label', p.title + ' 고정 풀기');
      x.addEventListener('click', function () {
        state.pins = state.pins.filter(function (x2) { return x2.k !== p.k; });
        savePins();
        renderPins();
        renderStats();
        renderPanel();
      });
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  /* 단계 이동 — 한 번 눌러 건너뛰기(랜덤워크), 이전/다음, ←/→, 좌우로 밀기 */
  function setActive(i) {
    if (!state.built) return;
    var n = state.built.stages.length;
    if (i < 0 || i >= n || i === state.active) return;
    state.active = i;
    var board = $('lvBoard');
    var old = board ? board.querySelector('.dk') : null;
    if (old && board) board.replaceChild(window.JCDeckNav.make(state.built.deck, i, setActive), old);
    renderPanel();
    window.JCDeckNav.context(state.built.deck, i);
    var p = $('lvPanel');
    if (p) {
      var r = p.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) {
        try { window.scrollTo({ top: r.top + window.pageYOffset - 56, behavior: 'smooth' }); } catch (e) {}
      }
    }
  }
  function stepBy(d) {
    if (!state.built) return;
    setActive(state.active + d);
  }

  function renderPanel() {
    var host = $('lvPanel');
    if (!host || !state.built) return;
    clear(host);
    var b = state.built, st = b.stages[state.active];
    if (!st) return;

    var hd = el('div', 'lv-p-hd');
    hd.appendChild(el('span', 'lv-step-n', String(state.active + 1)));
    hd.appendChild(el('b', null, st.title));
    host.appendChild(hd);

    var sub = el('p', 'lv-p-sub');
    sub.appendChild(document.createTextNode((st.badge ? st.badge + ' · ' : '') + '이 단계에서 세운 근거 ' + st.own.length + '장'));
    var open = el('a', 'lv-open-sec', '섹터 열기');
    open.href = pathHref(st.sec.path) + '?q=' + encodeURIComponent(qShort());
    open.setAttribute('aria-label', st.title + ' 섹터를 「' + qShort() + '」로 열기');
    open.addEventListener('click', function () { window.JCDeckNav.context(state.built.deck, state.active); });
    sub.appendChild(document.createTextNode(' — '));
    sub.appendChild(open);
    host.appendChild(sub);

    var body = el('div', 'lv-pbody');
    var colA = el('div', 'lv-pcol');
    var colB = el('div', 'lv-pcol');
    var colC = el('div', 'lv-pcol');
    body.appendChild(colA);
    body.appendChild(colB);
    body.appendChild(colC);

    colA.appendChild(sectionHead('상담 발문', st.ask.length + '개'));
    var ask = el('ul', 'lv-ask');
    st.ask.forEach(function (q) { ask.appendChild(el('li', null, q)); });
    st.note.forEach(function (n) {
      var li = el('li', 'io');
      li.appendChild(document.createTextNode('「' + n.q + '」를 '));
      li.appendChild(el('b', null, '「' + n.c + '」'));
      li.appendChild(document.createTextNode('로 읽었습니다' + (n.x ? ' — ' + n.x : '')));
      ask.appendChild(li);
    });
    colA.appendChild(ask);

    colA.appendChild(sectionHead('체크', '확인한 것만 누르세요'));
    var checks = el('div', 'lv-chk');
    checkItems(st).forEach(function (t, i) {
      var key = state.active + ':' + i;
      var b2 = el('button', 'lv-chk-b', t);
      b2.type = 'button';
      b2.setAttribute('aria-pressed', String(!!state.checks[key]));
      if (state.checks[key]) b2.classList.add('on');
      b2.addEventListener('click', function () {
        state.checks[key] = !state.checks[key];
        b2.setAttribute('aria-pressed', String(!!state.checks[key]));
        b2.classList.toggle('on', !!state.checks[key]);
      });
      checks.appendChild(b2);
    });
    colA.appendChild(checks);

    colB.appendChild(sectionHead('핵심 근거', st.own.length ? st.own.length + '장' : '없음'));
    var evs = el('div', 'lv-evs');
    if (!st.own.length) {
      var e = el('p', 'lv-empty');
      e.appendChild(el('b', null, '이 단계에서는 내담자 말에 걸리는 근거를 찾지 못했습니다. '));
      e.appendChild(document.createTextNode('아래 「이 섹터에서 찾기」로 직접 열어 보세요.'));
      evs.appendChild(e);
      var act = el('div', 'lv-ev-act');
      var sa = el('a', null, '이 섹터에서 「' + qShort() + '」 찾기');
      sa.href = pathHref(st.sec.path) + '?q=' + encodeURIComponent(qShort());
      sa.addEventListener('click', function () { window.JCDeckNav.context(state.built.deck, state.active); });
      act.appendChild(sa);
      evs.appendChild(act);
    } else {
      st.own.forEach(function (c) { evs.appendChild(evCard(c, state.active)); });
    }
    colB.appendChild(evs);

    if (st.nums.length) {
      colC.appendChild(sectionHead('근거 문장에 나온 숫자', st.nums.length + '개'));
      var ns = el('div', 'lv-nums');
      st.nums.forEach(function (n) {
        var chip = el('span', 'lv-num', n.v);
        chip.appendChild(el('span', null, ' · ' + shortSrc(n.src)));
        ns.appendChild(chip);
      });
      colC.appendChild(ns);
    }

    if (st.meta.length) {
      colC.appendChild(sectionHead('이 섹터가 다루는 범위', '자료실 기준'));
      var ms = el('div', 'lv-nums');
      st.meta.forEach(function (m) { ms.appendChild(el('span', 'lv-num', m)); });
      colC.appendChild(ms);
    }

    if (st.pairs.length) {
      colC.appendChild(sectionHead('이어지는 자료', '자료실이 잇는 짝'));
      var pl = el('div', 'lv-pairs');
      st.pairs.forEach(function (p) {
        var s = secOf(p.id);
        var row = el('div', 'lv-pair');
        var a = el('a', null, s.title);
        a.href = pathHref(s.path);
        row.appendChild(a);
        if (p.shared && p.shared.length) row.appendChild(el('span', null, p.shared.join(' · ')));
        pl.appendChild(row);
      });
      colC.appendChild(pl);
    }

    host.appendChild(body);

    var nav = el('div', 'lv-nav');
    var prev = el('button', null, '‹ 이전');
    prev.type = 'button';
    prev.disabled = state.active === 0;
    prev.addEventListener('click', function () { stepBy(-1); });
    var next = el('button', null, state.active === b.stages.length - 1 ? '마지막 단계' : '다음 ›');
    next.type = 'button';
    next.disabled = state.active === b.stages.length - 1;
    next.addEventListener('click', function () { stepBy(1); });
    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(el('span', 'lv-hintkey', '←/→ 또는 좌우로 밀어 이동'));
    nav.appendChild(el('span', 'lv-pos', (state.active + 1) + ' / ' + b.stages.length));
    host.appendChild(nav);
  }

  function sectionHead(title, sub) {
    var h = el('div', 'lv-sec-hd');
    h.appendChild(el('b', null, title));
    if (sub) h.appendChild(el('span', null, sub));
    h.appendChild(el('span', 'lv-sec-line'));
    return h;
  }
  function shortSrc(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    return t.length > 12 ? t.slice(0, 11) + '…' : t;
  }
  function checkItems(st) {
    var out = [];
    out.push('이 단계에서 확인할 것을 내담자에게 물어봤어요');
    var n = st.own.length;
    out.push(isStagePinned(state.active) ? '상담 중 다시 볼 근거를 고정했어요'
      : (n ? '근거 ' + n + '장 중 다시 볼 것을 고정해 두세요' : '이 섹터를 키워드로 직접 열어 확인했어요'));
    return out;
  }
  function isStagePinned(idx) {
    var hit = false;
    state.pins.forEach(function (p) { if (p.st === idx) hit = true; });
    return hit;
  }

  function evCard(c, stageIdx) {
    var box = el('article', 'lv-ev');
    var hd = el('div', 'lv-ev-hd');
    hd.appendChild(el('span', 'lv-ev-t', c.title));
    var sec = secOf(c.sector);
    var bt = String(sec.badge || '').trim(), tt = String(c.title || '').trim();
    var label = (bt && bt !== tt) ? bt : (sec.title !== tt ? sec.title : '');
    if (label) hd.appendChild(el('span', 'lv-ev-b', label));
    box.appendChild(hd);
    if (c.snippet) box.appendChild(el('p', 'lv-ev-x', c.snippet));
    if (c.why) box.appendChild(el('p', 'lv-ev-w', '걸린 곳 — ' + c.why));
    var act = el('div', 'lv-ev-act');
    var more = el('button', 'lv-ev-more', '발췌 보기');
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', function () {
      var on = !box.classList.contains('open');
      box.classList.toggle('open', on);
      more.setAttribute('aria-expanded', String(on));
      more.textContent = on ? '발췌 접기' : '발췌 보기';
    });
    var a = el('a', null, '근거 열기');
    a.href = hrefOf(c.url, qShort());
    a.setAttribute('aria-label', c.title + ' 근거 열기');
    a.addEventListener('click', function () { window.JCDeckNav.context(state.built.deck, state.active); });
    act.appendChild(a);
    var pin = el('button', null, isPinned(c) ? '고정됨' : '고정');
    pin.type = 'button';
    pin.setAttribute('aria-pressed', String(isPinned(c)));
    pin.setAttribute('aria-label', c.title + (isPinned(c) ? ' 고정 풀기' : ' 상담 중 고정'));
    pin.addEventListener('click', function () {
      togglePin(c, stageIdx);
      pin.setAttribute('aria-pressed', String(isPinned(c)));
      pin.textContent = isPinned(c) ? '고정됨' : '고정';
      pin.setAttribute('aria-label', c.title + (isPinned(c) ? ' 고정 풀기' : ' 상담 중 고정'));
    });
    act.appendChild(pin);
    act.appendChild(more);
    box.appendChild(act);
    return box;
  }

  function suggestRow(s) {
    var row = el('div', 'lv-sug-i');
    var txt = el('div', 'lv-sug-txt');
    txt.appendChild(el('b', null, s.title));
    var line = s.badge ? s.badge : '';
    if (s.why && s.why.length) line += (line ? ' · ' : '') + '내담자 말 「' + s.why.slice(0, 2).join(' · ') + '」에서 걸림';
    txt.appendChild(el('span', null, line));
    row.appendChild(txt);
    var full = state.deck.steps.length >= MAX_STEPS;
    var b = el('button', null, '덱에 추가');
    b.type = 'button';
    if (full) {
      b.disabled = true;
      b.textContent = '가득 참';
      b.setAttribute('aria-label', '덱은 ' + MAX_STEPS + '단계까지입니다');
    } else {
      b.addEventListener('click', function () { addSector(s, b); });
    }
    row.appendChild(b);
    return row;
  }

  function addSector(s, btn) {
    var deck = state.deck;
    if (!deck || !store()) return;
    if (deck.steps.length >= MAX_STEPS) return;
    var exists = false;
    deck.steps.forEach(function (x) { if (x.id === s.id) exists = true; });
    if (exists) { toast('이미 덱에 있는 섹터예요.'); return; }
    btn.disabled = true;
    btn.textContent = '더하는 중…';
    var steps = deck.steps.concat([{ id: s.id, no: s.no || '', title: s.title, badge: s.badge }]);
    store().save({ id: deck.id, name: deck.name, steps: steps, where: deck.where }).then(function (r) {
      var saved = r.deck || { id: deck.id, name: deck.name, steps: steps };
      state.deck = saved;
      state.deckId = saved.id;
      toast('「' + s.title + '」을(를) ' + (r.source === 'server' ? '내 계정의 덱' : '이 창의 덱') + '에 ' + steps.length + '단계로 더했어요.');
      runBoard(true);
    }, function (e) {
      btn.disabled = false;
      btn.textContent = '덱에 추가';
      toast(store().errText ? store().errText(e) : '덱에 더하지 못했어요.');
    });
  }

  /* ================================================================ 시작 */
  function bind() {
    dom.ask = $('lvAsk');
    dom.go = $('lvGo');
    dom.msg = $('lvMsg');
    var field = $('lvField');
    if (field && A()) typer = A().typing(field, function (v) { state.q = v; });

    if (dom.ask) {
      dom.ask.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate(); }
      });
    }
    if (dom.go) dom.go.addEventListener('click', function () { generate(); });

    var tut = $('lvTut');
    if (tut) tut.addEventListener('click', function () {
      var target = state.pick === 'algo' ? $('lvChips') : $('lvField');
      if (target) A().tutorial(target);
    });

    var pick = $('lvPick');
    if (pick) Array.prototype.forEach.call(pick.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { setPick(b.getAttribute('data-m')); });
    });

    window.JCDeckNav.key(document, 9999, function () { return state.active; }, function (i) { setActive(i); });
    var board = $('lvBoard');
    if (board) window.JCDeckNav.swipe(board, function () { stepBy(-1); }, function () { stepBy(1); });
  }

  function boot() {
    bind();
    renderChips();
    setPick(state.pick);
    mountMode();
    var live = $('live');
    if (live) live.hidden = true;
    if (state.mode === 'live' && !loggedIn()) setMode('decks');
    if (location.hash === '#live' && loggedIn()) setMode('live');
  }

  window.JCDeckLive = {
    open: open,
    setMode: setMode,
    toDecks: function () { setMode('decks'); },
    ready: function () { return !!window.JCAssistSearch && window.JCAssistSearch.ready(); },
    state: function () { return { mode: state.mode, pick: state.pick, courses: state.courses.length, built: !!state.built, active: state.active }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
