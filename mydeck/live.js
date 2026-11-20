/* live.js — 마이덱 라이브 (2026-11-20)
 *
 * 무엇을 하나
 *   사용자가 짜 둔 덱(단계 흐름)에 내담자 상황·키워드를 얹어, 단계마다 **자료실 색인에서 실제로 건진 근거**를
 *   배치한 「실전 상담 OS 보드」를 그 자리에서 만든다. 검색 결과를 늘어놓는 것이 아니라,
 *   덱의 1단계 → 2단계 → … 순서에 맞춰 각 단계 섹터의 근거·발문·체크·연결 자료를 한 장씩 세운다.
 *
 * 이 파일이 읽는 것 (전부 읽기 전용 — 고치지 않는다)
 *   ../assistant/search.js            자료실 통합 검색 엔진(약어 펼침·초성·섹터 경로까지)
 *   ../assistant/data/index.json      문서 색인(섹터·제목·찾기 낱말·설명·주소)
 *   ../assistant/data/index-companies.json  기업 명함첩(엔진이 늦게 받아 온다)
 *   ../assistant/data/rag-preface.json      현장 약어·정식 용어 사전 + 섹터 지도
 *   ../flow/data/graph.json           자료실이 잇는 짝(연결 카드)·키워드→섹터 지도
 *   ../assets/tools.js                섹터 장부(번호·이름·딱지·설명·기준 수치)
 *
 * 지키는 선
 *   · 색인에 있는 것만 근거로 세운다. 수치·조문·기업명을 지어내지 않는다(숫자는 근거 문장에서 그대로 떼어 온다).
 *   · 내담자 메모는 이 기기 밖으로 나가지 않고, 「요약 복사」에도 넣지 않는다.
 *   · 근거 핀(고정)은 이 브라우저에만 남는다(localStorage).
 *   · 움직이는 값은 transform·opacity 뿐(DESIGN.md §2).
 */
(function () {
  'use strict';
  if (window.JCDeckLive) return;

  var BASE = '../';
  var PINS_KEY = 'jc-mydeck-live-pins-v1';
  var MAX_STEPS = 12;

  var state = {
    mode: 'decks', deckId: '', q: '', scope: 'deck',
    active: 0, built: null, pins: [], decks: [],
    engine: 'idle', engP: null, graph: null, mounting: false,
    busy: false, checks: {}
  };
  var dom = {};

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
    toast.t = setTimeout(function () { t.classList.remove('on'); }, 3400);
  }

  /* ================================================================ 섹터 장부 */
  function tools() { return window.JC_TOOLS || []; }
  function toolOf(id) {
    var t = tools(), out = null;
    t.forEach(function (x) { if (x.id === id) out = x; });
    return out;
  }
  function secOf(id) {
    var t = toolOf(id);
    if (t) return { id: id, no: t.no || '', title: t.title || id, badge: t.badge || '', desc: t.desc || '', meta: t.meta || [], path: t.path || './' + id + '/', gi: t.gi || '' };
    var gs = ((state.graph && state.graph.sectors) || []);
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].id === id) return { id: id, no: gs[i].no || '', title: gs[i].title || id, badge: gs[i].badge || '', desc: gs[i].desc || '', meta: gs[i].meta || [], path: gs[i].path || './' + id + '/', gi: gs[i].gi || '' };
    }
    return { id: id, no: '', title: id, badge: '', desc: '', meta: [], path: './' + id + '/', gi: '' };
  }
  function pathHref(p) {
    p = String(p || '');
    if (p.indexOf('./') === 0) return '../' + p.slice(2);
    if (p.indexOf('../') === 0) return p;
    return '../' + p.replace(/^\//, '');
  }

  /* ================================================================ 예시 덱 */
  /* 덱이 하나도 없을 때 바로 만져 볼 수 있게 두는 예시. 제목·번호는 장부에서 읽는다(손으로 적지 않는다). */
  var SAMPLE_IDS = ['triage', 'translator', 'reality', 'manual', 'transit', 'portals'];
  function sampleDeck() {
    return {
      id: 'sample', name: '예시 덱 · 경력단절 후 재취업', where: 'sample',
      steps: SAMPLE_IDS.map(function (id) {
        var s = secOf(id);
        return { id: id, no: s.no, title: s.title, badge: s.badge };
      })
    };
  }
  function deckOf(id) {
    if (id === 'sample') return sampleDeck();
    var out = null;
    state.decks.forEach(function (d) { if (d.id === id) out = d; });
    return out;
  }

  /* ================================================================ 발문 (질문 틀)
     사실을 말하는 문장이 아니라 **상담사가 물어볼 질문**이다. 섹터마다 그 단계에서 확인할 것을 묻는다.
     섹터 장부의 역할(desc)과 짝을 맞춰 두었고, 수치·조문·기업명은 적지 않는다(그것은 근거 카드가 맡는다). */
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

  /* ================================================================ 색인·지도 읽기 */
  function loadGraph() {
    if (state.graph) return Promise.resolve(state.graph);
    return fetch(BASE + 'flow/data/graph.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { state.graph = j || null; return state.graph; })
      .catch(function () { return null; });
  }

  function loadEngine() {
    if (state.engine === 'ready') return Promise.resolve();
    if (state.engP) return state.engP;
    state.engine = 'loading';
    setMsg('자료실 색인을 받는 중…');
    state.engP = new Promise(function (res, rej) {
      if (window.JCAssistSearch) return res();
      window.JCA_BASE = BASE;
      var sc = document.createElement('script');
      sc.src = BASE + 'assistant/search.js';
      sc.onload = function () { res(); };
      sc.onerror = function () { rej(new Error('search.js')); };
      document.head.appendChild(sc);
    }).then(function () {
      if (!window.JCAssistSearch) throw new Error('engine');
      return window.JCAssistSearch.load();
    }).then(function () {
      state.engine = 'ready';
      setMsg('');
      try {
        if (window.JCAssistSearch.onUpdate) window.JCAssistSearch.onUpdate(function () { if (state.built) refreshCompanies(); });
      } catch (e) {}
    }, function (e) {
      state.engine = 'idle'; state.engP = null;
      setMsg('자료실 색인을 불러오지 못했어요. 연결을 확인하고 「상담 OS 만들기」를 다시 눌러 주세요.', true);
      throw e;
    });
    return state.engP;
  }

  /* 기업 명함첩은 늦게 도착한다 — 도착하면 근거 카드만 조용히 다시 채운다. */
  function refreshCompanies() {
    if (state.busy || !state.built) return;
    var deck = state.built.deck, q = state.built.q, scope = state.built.scope;
    var keep = state.active;
    state.built = build(deck, q, scope);
    state.active = Math.min(keep, state.built.stages.length - 1);
    renderBoard();
  }

  /* ================================================================ RAG → 상담 OS */
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
  function absOf(h) { try { return new URL(h, location.href).href; } catch (e) { return h; } }

  function numsOf(cards) {
    var RE = /(\d[\d,]*(?:\.\d+)?)\s*(만원|억원|천원|원|퍼센트|%|개월|시간|년|일|주|개|곳|건|명|배|점|세)/g, out = [], seen = {};
    cards.forEach(function (c) {
      var text = (c.title || '') + ' ' + (c.snippet || '');
      var m, n = 0;
      RE.lastIndex = 0;
      while ((m = RE.exec(text)) && n < 2) {
        var v = m[0].replace(/\s+/g, ' ').trim();
        if (/^(19|20)\d{2}년$/.test(v)) continue;          /* 연도는 수치로 세우지 않는다 */
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

  function build(deck, q, scope) {
    var S = window.JCAssistSearch;
    var an = S.analyze(q);
    var list = S.search(q, { limit: 3000, perSector: 3000 }) || [];
    var bySector = {}, used = {}, seen = {};

    /* 같은 카드가 두 번 서지 않게 — 제목+주소로 한 번만 */
    var clean = [];
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
      var own = (bySector[st.id] || []).slice(0, 3).map(toCard);
      own.forEach(function (c) { used[c.sector + '|' + c.title + '|' + c.url] = 1; });
      return {
        idx: i, id: st.id, no: st.no || sec.no, title: st.title || sec.title, badge: st.badge || sec.badge,
        sec: sec, own: own, cross: [], ask: askFor(st), note: notesFor(an, st.id),
        meta: (sec.meta || []).slice(0, 3), pairs: pairsOf(st.id), nums: []
      };
    });

    if (scope === 'all') {
      stages.forEach(function (stg) {
        var got = 0;
        for (var i = 0; i < clean.length && got < 2; i++) {
          var r = clean[i];
          if (!r || r.sector === stg.id || r.sector === 'flow') continue;
          if (used[cardKey(r)]) continue;
          if ((r.score || 0) < 5) continue;                 /* 약하게 스친 카드는 확장 근거로 세우지 않는다 */
          stg.cross.push(toCard(r));
          used[cardKey(r)] = 1;
          got++;
        }
      });
    }

    stages.forEach(function (stg) { stg.nums = numsOf(stg.own.concat(stg.cross)); });

    var evCount = 0;
    stages.forEach(function (s) { evCount += s.own.length + s.cross.length; });

    return {
      deck: deck, q: q, scope: scope, stages: stages, evCount: evCount,
      keys: an, at: new Date(),
      suggest: suggestFor(an, q, deck, clean)
    };
  }

  function suggestFor(an, q, deck, list) {
    var inDeck = {}, sc = {}, why = {};
    deck.steps.forEach(function (s) { inDeck[s.id] = 1; });
    function bump(id, w, label) {
      if (!id || inDeck[id] || id === 'flow') return;
      sc[id] = (sc[id] || 0) + w;
      if (label) { why[id] = why[id] || []; if (why[id].indexOf(label) < 0 && why[id].length < 3) why[id].push(label); }
    }
    var S = window.JCAssistSearch;
    (S.route(q, { limit: 8 }) || []).forEach(function (r) {
      bump(r.id, 2 + (r.score || 0) * 0.4, (r.why || [])[0] || '');
    });
    (an.dict || []).forEach(function (d, di) {
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
      return { id: id, no: s.no, title: s.title, badge: s.badge, desc: s.desc, meta: s.meta, score: sc[id], why: why[id] || [] };
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
  function pinId(c) { return (c.sector || '') + '|' + c.title; }
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
      toast('근거를 고정했어요.');
    }
    savePins();
    renderPins();
    updateTopStats();
  }

  /* ================================================================ 화면 — 모드 */
  function mountMode() {
    var host = $('lvModeHost');
    if (!host) return;
    clear(host);
    var bar = el('div', 'lv-mode');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', '마이덱 화면 고르기');
    [['decks', '내 덱'], ['live', '마이덱 라이브']].forEach(function (m) {
      var b = el('button', null);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.mode === m[0]));
      b.appendChild(document.createTextNode(m[1]));
      b.addEventListener('click', function () { setMode(m[0]); });
      bar.appendChild(b);
    });
    host.appendChild(bar);
  }

  function setMode(m) {
    state.mode = m;
    var deck = $('deckMode'), live = $('live'), hero = $('deckHero');
    if (deck) deck.hidden = m !== 'decks';
    if (hero) hero.hidden = m !== 'decks';
    if (live) live.hidden = m !== 'live';
    mountMode();
    if (m === 'live') {
      mountLive();
      loadDecks();
      loadEngine().catch(function () {});
      loadGraph();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    }
  }

  function open(deckId) {
    state.deckId = '';
    setMode('live');
    state.deckId = deckId || '';
    loadDecks(true);
    setTimeout(focusMemo, 120);
  }

  /* ================================================================ 화면 — 준비 칸 */
  function mountLive() {
    if (state.mounting) return;
    var setup = $('lvSetup');
    if (!setup) return;
    state.mounting = true;
    clear(setup);

    var brief = el('div', 'lv-brief');
    brief.id = 'lvBrief';
    brief.hidden = true;
    setup.appendChild(brief);
    dom.brief = brief;

    var blk1 = el('div', 'lv-blk');
    var lab1 = el('div', 'lv-lab');
    lab1.appendChild(el('span', 'lv-no', '1'));
    lab1.appendChild(document.createTextNode('어느 덱으로 상담하나요?'));
    var hint1 = el('span', 'lv-hint', '덱의 단계 순서대로 근거를 배치합니다');
    lab1.appendChild(hint1);
    blk1.appendChild(lab1);
    var sel = document.createElement('select');
    sel.className = 'lv-sel';
    sel.id = 'lvDeck';
    sel.setAttribute('aria-label', '상담에 쓸 내 덱 고르기');
    sel.addEventListener('change', function () {
      state.deckId = sel.value;
      state.built = null;
      renderBoard();
      loadPins();
    });
    blk1.appendChild(sel);
    dom.sel = sel;
    var colA = el('div', 'lv-setup-col');
    var colB = el('div', 'lv-setup-col');
    colA.appendChild(blk1);

    var blk2 = el('div', 'lv-blk');
    var lab2 = el('div', 'lv-lab');
    lab2.appendChild(el('span', 'lv-no', '2'));
    lab2.appendChild(document.createTextNode('내담자 상황·키워드'));
    var hint2 = el('span', 'lv-hint', '이 말로 자료실 색인을 뒤집니다 · 이 기기 밖으로 나가지 않습니다');
    lab2.appendChild(hint2);
    blk2.appendChild(lab2);
    var memo = document.createElement('textarea');
    memo.className = 'lv-inp';
    memo.id = 'lvMemo';
    memo.rows = 3;
    memo.maxLength = 300;
    memo.setAttribute('aria-label', '내담자 상황이나 키워드');
    memo.placeholder = '예) 45세, 육아로 6년 쉬었어요. 사무직으로 다시 일하고 싶고 국민취업지원제도를 알아보는 중입니다.';
    memo.addEventListener('input', function () { state.q = memo.value; markChips(); });
    blk2.appendChild(memo);
    dom.memo = memo;

    var chips = el('div', 'lv-chips');
    chips.id = 'lvChips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '빠른 상황');
    PRESETS.forEach(function (p) {
      var c = el('button', 'lv-chip', p.t);
      c.type = 'button';
      c.setAttribute('aria-pressed', 'false');
      c.setAttribute('data-q', p.q);
      c.addEventListener('click', function () {
        state.q = p.q;
        if (dom.memo) dom.memo.value = p.q;
        markChips();
        if (dom.memo) dom.memo.focus();
      });
      chips.appendChild(c);
    });
    blk2.appendChild(chips);
    colA.appendChild(blk2);

    var blk3 = el('div', 'lv-blk');
    var lab3 = el('div', 'lv-lab');
    lab3.appendChild(el('span', 'lv-no', '3'));
    lab3.appendChild(document.createTextNode('근거를 찾을 범위'));
    blk3.appendChild(lab3);
    var seg = el('div', 'lv-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'RAG 범위');
    [['deck', '내 덱 센터', '내 덱에 있는 섹터 안에서만 근거를 찾습니다'],
     ['all', '자료실 전체', '덱 밖 섹터에서도 근거를 찾아 단계에 함께 붙입니다']].forEach(function (s) {
      var b = el('button', null, s[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.scope === s[0]));
      b.setAttribute('aria-label', s[1] + ' — ' + s[2]);
      b.title = s[2];
      b.addEventListener('click', function () {
        state.scope = s[0];
        Array.prototype.forEach.call(seg.children, function (x, i) {
          x.setAttribute('aria-pressed', String((i === 0 ? 'deck' : 'all') === state.scope));
        });
        if (state.built) run();
      });
      seg.appendChild(b);
    });
    blk3.appendChild(seg);
    colB.appendChild(blk3);
    colB.appendChild(whatBox());

    var foot = el('div', 'lv-foot');
    var go = el('button', 'lv-go', '상담 OS 만들기');
    go.type = 'button';
    go.id = 'lvGo';
    go.addEventListener('click', run);
    foot.appendChild(go);
    var msg = el('p', 'lv-msg', '');
    msg.id = 'lvMsg';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    foot.appendChild(msg);
    colB.appendChild(foot);
    setup.appendChild(colA);
    setup.appendChild(colB);
    dom.go = go; dom.msg = msg;
    dom.parts = [colA, colB];

    state.mounting = false;
  }

  /* 생성한 뒤에는 조건을 한 줄로 접는다 — 보드가 화면을 다 쓰게 */
  function shortQ(n) {
    var src = String((state.built && state.built.q) || state.q || '').replace(/\s+/g, ' ').trim();
    return src.length > n ? src.slice(0, n - 1) + '…' : src;
  }
  function setCollapsed(on) {
    state.collapsed = !!on;
    (dom.parts || []).forEach(function (p) { p.hidden = state.collapsed; });
    var br = dom.brief;
    if (!br) return;
    br.hidden = !state.collapsed;
    clear(br);
    if (!state.collapsed) return;
    var deck = deckOf(state.deckId);
    var txt = el('div', 'lv-brief-txt');
    txt.appendChild(el('b', null, (deck ? deck.name : '내 덱') + ' · ' + (state.scope === 'all' ? '자료실 전체' : '내 덱 센터')));
    txt.appendChild(el('span', null, shortQ(52)));
    br.appendChild(txt);
    var b = el('button', null, '조건 바꾸기');
    b.type = 'button';
    b.addEventListener('click', function () { setCollapsed(false); focusMemo(); });
    br.appendChild(b);
  }
  function qShort() {
    var b = state.built;
    var toks = ((b && b.keys && b.keys.tokens) || []).filter(function (t) { return !/^[ㄱ-ㅎ]+$/.test(t); });
    var out = toks.slice(0, 4).join(' ');
    return out || shortQ(40);
  }

  function whatBox() {
    var box = el('div', 'lv-what');
    box.appendChild(el('b', null, '만들어지는 것'));
    var ul = el('ul');
    ['단계마다 상담 발문과 체크',
     '자료실 색인에서 건진 근거 카드 — 누르면 그 자리로 열립니다',
     '상담 중 다시 볼 근거 고정',
     '내담자 메모를 뺀 요약 복사'].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    box.appendChild(ul);
    return box;
  }

  /* 빠른 상황 — 자료실 지도(graph.json)에 실제로 있는 말로만 고른다 */
  var PRESETS = [
    { t: '경력단절 후 재취업', q: '경력단절여성 재취업' },
    { t: '국취 신청', q: '국민취업지원제도 구직촉진수당' },
    { t: '실업급여 자격', q: '실업급여 구직급여 수급자격' },
    { t: '임금체불·해고', q: '임금체불 해고' },
    { t: '면접 준비', q: '면접 질문 준비' },
    { t: '중장년 전직', q: '중장년 전직 훈련' },
    { t: '청년 이직', q: '청년 이직 진로' },
    { t: '신산업 직무', q: '신산업 직무 전망' },
    { t: '근무환경 확인', q: '근무환경 교대 근무' }
  ];

  function markChips() {
    var box = $('lvChips');
    if (!box) return;
    Array.prototype.forEach.call(box.children, function (c) {
      c.setAttribute('aria-pressed', String(c.getAttribute('data-q') === state.q));
    });
  }
  function setMsg(t, bad) {
    if (!dom.msg) return;
    dom.msg.textContent = t || '';
    dom.msg.className = 'lv-msg' + (bad ? ' bad' : '');
  }
  function focusMemo() { if (dom.memo) { try { dom.memo.focus({ preventScroll: false }); } catch (e) { dom.memo.focus(); } } }

  /* ================================================================ 덱 목록 */
  function loadDecks(force) {
    if (!window.JCDeck) return Promise.resolve();
    if (state.decks.length && !force) { fillDecks(); return Promise.resolve(); }
    return window.JCDeck.list().then(function (r) {
      state.decks = r.decks || [];
      fillDecks();
    }, function () {
      state.decks = window.JCDeck.localList ? window.JCDeck.localList() : [];
      fillDecks();
    });
  }

  function fillDecks() {
    var sel = dom.sel || $('lvDeck');
    if (!sel) return;
    clear(sel);
    var opts = state.decks.slice();
    if (!state.deckId) state.deckId = opts.length ? opts[0].id : 'sample';
    var found = false;
    opts.forEach(function (d, i) {
      var o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.name + ' · ' + d.steps.length + '단계' + (d.where === 'server' ? '' : ' (이 기기)');
      if (d.id === state.deckId) { o.selected = true; found = true; }
      sel.appendChild(o);
    });
    var o2 = document.createElement('option');
    o2.value = 'sample';
    o2.textContent = '예시 덱 · 경력단절 후 재취업 (' + sampleDeck().steps.length + '단계)';
    if (state.deckId === 'sample' || (!found && !opts.length)) { o2.selected = true; state.deckId = 'sample'; }
    sel.appendChild(o2);
    if (!found && opts.length) { state.deckId = opts[0].id; sel.value = opts[0].id; }
  }

  /* ================================================================ 실행 */
  function run() {
    if (state.busy) return;
    var q = String(state.q || '').replace(/\s+/g, ' ').trim();
    if (!q) {
      setMsg('내담자 상황이나 키워드를 한 줄 적어 주세요.', true);
      focusMemo();
      return;
    }
    var deck = deckOf(state.deckId);
    if (!deck || !deck.steps.length) { setMsg('덱을 먼저 고르세요.', true); return; }
    state.busy = true;
    if (dom.go) dom.go.disabled = true;
    setMsg('자료실 색인에서 근거를 찾는 중…');
    document.documentElement.setAttribute('data-jc-live', 'loading');

    Promise.all([loadEngine(), loadGraph()]).then(function () {
      state.built = build(deck, q, state.scope);
      state.active = 0;
      state.checks = {};
      loadPins();
      renderBoard();
      setCollapsed(true);
      setMsg('');
      document.documentElement.setAttribute('data-jc-live', 'ready');
      var board = $('lvBoard');
      if (board && board.getBoundingClientRect().top > window.innerHeight * 0.6) {
        try { board.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    }).catch(function () {
      document.documentElement.setAttribute('data-jc-live', 'failed');
      setMsg('근거를 세우지 못했어요. 잠시 뒤 「상담 OS 만들기」를 다시 눌러 주세요.', true);
    }).then(function () {
      state.busy = false;
      if (dom.go) dom.go.disabled = false;
    });
  }

  /* ================================================================ 화면 — 보드 */
  function renderBoard() {
    var host = $('lvBoard');
    if (!host) return;
    clear(host);
    var intro = $('lvIntro');
    if (!state.built) { host.hidden = true; if (intro) intro.hidden = false; return; }
    host.hidden = false;
    if (intro) intro.hidden = true;

    var b = state.built;

    /* 머리 — 덱 이름·규모·도구 */
    var top = el('div', 'lv-top');
    var hd = el('div', 'lv-top-hd');
    hd.appendChild(el('b', null, b.deck.name));
    top.appendChild(hd);
    var stats = el('div', 'lv-stats');
    stats.id = 'lvStats';
    hd.appendChild(stats);

    var keys = el('p', 'lv-keys');
    keys.appendChild(el('b', null, '이렇게 읽었어요 — '));
    var toks = (b.keys.tokens || []).filter(function (t) { return !/^[ㄱ-ㅎ]+$/.test(t); });
    var added = (b.keys.added || []);
    var kt = toks.slice(0, 5).join(' · ') || '—';
    keys.appendChild(document.createTextNode(kt));
    if (added.length) {
      keys.appendChild(document.createTextNode(' / '));
      keys.appendChild(el('b', null, added.slice(0, 4).map(function (a) { return a.word; }).join(' · ')));
    }
    top.appendChild(keys);

    var tools = el('div', 'lv-tools');
    var cp = el('button', 'lv-tool strong', '요약 복사');
    cp.type = 'button';
    cp.addEventListener('click', copySummary);
    tools.appendChild(cp);
    var again = el('button', 'lv-tool', '다시 찾기');
    again.type = 'button';
    again.addEventListener('click', run);
    again.setAttribute('aria-label', '근거 다시 찾기');
    tools.appendChild(again);
    var sw = el('button', 'lv-tool', b.scope === 'all' ? '내 덱만' : '전체로');
    sw.type = 'button';
    sw.setAttribute('aria-label', b.scope === 'all' ? '근거 범위를 내 덱 섹터 안으로 바꾸기' : '근거 범위를 자료실 전체로 넓히기');
    sw.addEventListener('click', function () {
      state.scope = b.scope === 'all' ? 'deck' : 'all';
      remountSeg();
      run();
    });
    tools.appendChild(sw);
    top.appendChild(tools);
    host.appendChild(top);

    var pins = el('div', 'lv-pins');
    pins.id = 'lvPins';
    var wide = window.innerWidth >= 900;

    var cols = el('div', 'lv-cols');
    var rail = el('div', 'lv-rail');
    var rhd = el('div', 'lv-rail-hd');
    rhd.appendChild(el('b', null, '상담 순서'));
    rhd.appendChild(el('span', null, b.stages.length + '단계'));
    rail.appendChild(rhd);
    var steps = el('div', 'lv-steps');
    steps.id = 'lvSteps';
    steps.setAttribute('role', 'tablist');
    steps.setAttribute('aria-label', '상담 단계');
    steps.setAttribute('data-jc-still', '');
    rail.appendChild(steps);
    cols.appendChild(rail);
    var panel = el('div', 'lv-panel');
    panel.id = 'lvPanel';
    panel.setAttribute('data-jc-still', '');
    cols.appendChild(panel);
    if (wide) rail.appendChild(pins); else host.appendChild(pins);
    host.appendChild(cols);

    if (b.suggest.length) {
      var sug = el('div', 'lv-sug');
      var open = false;
      var shd = el('button', 'lv-sug-toggle');
      shd.type = 'button';
      shd.setAttribute('aria-expanded', String(open));
      shd.appendChild(el('b', null, '덱에 없지만 걸리는 자료 ' + b.suggest.length + '곳'));
      shd.appendChild(el('span', null, '누르면 덱에 단계로 더합니다'));
      shd.appendChild(el('i', 'lv-sug-ar', open ? '접기' : '보기'));
      sug.appendChild(shd);
      var sbody = el('div', 'lv-sug-body');
      sbody.hidden = !open;
      b.suggest.forEach(function (s) { sbody.appendChild(suggestRow(s)); });
      sug.appendChild(sbody);
      shd.addEventListener('click', function () {
        var on = sbody.hidden;
        sbody.hidden = !on;
        shd.setAttribute('aria-expanded', String(on));
        shd.querySelector('.lv-sug-ar').textContent = on ? '접기' : '보기';
      });
      host.appendChild(sug);
    }

    renderStats();
    renderPins();
    renderSteps();
    renderPanel();
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
    var sc = el('span', 'lv-stat', b.scope === 'all' ? '자료실 전체' : '내 덱 센터');
    box.appendChild(sc);
  }
  function updateTopStats() { renderStats(); }

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

  function renderSteps(scroll) {
    var box = $('lvSteps');
    if (!box || !state.built) return;
    clear(box);
    state.built.stages.forEach(function (st, i) {
      var b = el('button', 'lv-step');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.active === i));
      b.setAttribute('aria-current', String(state.active === i));
      b.appendChild(el('span', 'lv-step-n', String(i + 1)));
      b.appendChild(el('span', 'lv-step-t', st.title));
      b.appendChild(el('span', 'lv-step-c', String(st.own.length + st.cross.length)));
      b.addEventListener('click', function () { state.active = i; renderSteps(true); renderPanel(); });
      box.appendChild(b);
    });
    if (scroll) {
      var cur = box.children[state.active];
      if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
    }
  }

  function chip(text, sub) {
    var n = el('span', 'lv-num', text);
    if (sub) n.appendChild(el('span', null, ' · ' + sub));
    return n;
  }

  function renderPanel() {
    var host = $('lvPanel');
    if (!host || !state.built) return;
    clear(host);
    var b = state.built, st = b.stages[state.active];
    if (!st) return;

    /* 머리 */
    var hd = el('div', 'lv-p-hd');
    hd.appendChild(el('span', 'lv-step-n', String(state.active + 1)));
    hd.appendChild(el('b', null, st.title));
    host.appendChild(hd);
    var sub = el('p', 'lv-p-sub');
    sub.appendChild(document.createTextNode((st.no ? st.no + '번 · ' : '') + (st.badge ? st.badge + ' · ' : '') + '이 단계 섹터에서 근거 ' + (st.own.length + st.cross.length) + '장'));
    var open = el('a', 'lv-open-sec', '섹터 열기');
    open.href = pathHref(st.sec.path) + '?q=' + encodeURIComponent(qShort());
    open.setAttribute('aria-label', st.title + ' 섹터를 「' + qShort() + '」로 열기');
    sub.appendChild(document.createTextNode(' — '));
    sub.appendChild(open);
    host.appendChild(sub);

    /* 큰 화면에서는 발문·체크와 근거를 좌우로 나눠 한 화면에 담는다 */
    var body = el('div', 'lv-pbody');
    var colA = el('div', 'lv-pcol');
    var colB = el('div', 'lv-pcol');
    var colC = el('div', 'lv-pcol');
    body.appendChild(colA);
    body.appendChild(colB);
    body.appendChild(colC);

    /* ① 발문 */
    colA.appendChild(sectionHead('상담 발문', st.ask.length + '개'));
    var ask = el('ul', 'lv-ask');
    st.ask.forEach(function (q) {
      ask.appendChild(el('li', null, q));
    });
    st.note.forEach(function (n) {
      var li = el('li', 'io');
      li.appendChild(document.createTextNode('「' + n.q + '」를 '));
      li.appendChild(el('b', null, '「' + n.c + '」'));
      li.appendChild(document.createTextNode('로 읽었습니다' + (n.x ? ' — ' + n.x : '')));
      ask.appendChild(li);
    });
    colA.appendChild(ask);

    /* ② 체크 */
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

    /* ③ 근거 */
    colB.appendChild(sectionHead('핵심 근거', st.own.length ? st.own.length + '장' : '없음'));
    var evs = el('div', 'lv-evs');
    if (!st.own.length) {
      var e = el('p', 'lv-empty');
      e.appendChild(el('b', null, '이 단계 섹터에서는 내담자 말에 걸리는 근거를 찾지 못했습니다. '));
      e.appendChild(document.createTextNode('자료 범위를 「자료실 전체」로 넓히거나, 이 섹터를 키워드로 직접 열어 보세요.'));
      evs.appendChild(e);
      var act = el('div', 'lv-ev-act');
      var sa = el('a', null, '이 섹터에서 「' + qShort() + '」 찾기');
      sa.href = pathHref(st.sec.path) + '?q=' + encodeURIComponent(qShort());
      act.appendChild(sa);
      if (b.scope === 'deck') {
        var wide = el('button', null, '자료실 전체로 넓히기');
        wide.type = 'button';
        wide.addEventListener('click', function () {
          state.scope = 'all';
          remountSeg();
          run();
        });
        act.appendChild(wide);
      }
      evs.appendChild(act);
    } else {
      st.own.forEach(function (c) { evs.appendChild(evCard(c, state.active, false)); });
    }
    if (st.cross.length) {
      st.cross.forEach(function (c) { evs.appendChild(evCard(c, state.active, true)); });
    }
    colB.appendChild(evs);

    /* ④ 근거 속 숫자 */
    if (st.nums.length) {
      colC.appendChild(sectionHead('근거 문장에 나온 숫자', st.nums.length + '개'));
      var ns = el('div', 'lv-nums');
      st.nums.forEach(function (n) { ns.appendChild(chip(n.v, shortSrc(n.src))); });
      colC.appendChild(ns);
    }

    /* ⑤ 이 섹터의 기준 */
    if (st.meta.length) {
      colC.appendChild(sectionHead('이 섹터가 다루는 범위', '자료실 기준'));
      var ms = el('div', 'lv-nums');
      st.meta.forEach(function (m) { ms.appendChild(chip(m)); });
      colC.appendChild(ms);
    }

    /* ⑥ 연결 카드 */
    if (st.pairs.length) {
      colC.appendChild(sectionHead('이어지는 자료', '자료실이 잇는 짝'));
      var pl = el('div', 'lv-pairs');
      st.pairs.forEach(function (p) {
        var s = secOf(p.id);
        var row = el('div', 'lv-pair');
        var a = el('a', null, (s.no ? s.no + '번 · ' : '') + s.title);
        a.href = pathHref(s.path);
        row.appendChild(a);
        if (p.shared && p.shared.length) row.appendChild(el('span', null, p.shared.join(' · ')));
        pl.appendChild(row);
      });
      colC.appendChild(pl);
    }

    host.appendChild(body);

    /* ⑦ 이동 */
    var nav = el('div', 'lv-nav');
    var prev = el('button', null, '이전 단계');
    prev.type = 'button';
    prev.disabled = state.active === 0;
    prev.addEventListener('click', function () { if (state.active > 0) { state.active--; renderSteps(true); renderPanel(); } });
    var next = el('button', null, state.active === b.stages.length - 1 ? '마지막 단계' : '다음 단계');
    next.type = 'button';
    next.disabled = state.active === b.stages.length - 1;
    next.addEventListener('click', function () { if (state.active < b.stages.length - 1) { state.active++; renderSteps(true); renderPanel(); } });
    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(el('span', 'lv-pos', (state.active + 1) + ' / ' + b.stages.length));
    host.appendChild(nav);
  }

  function remountSeg() {
    var segs = document.querySelectorAll('#lvSetup .lv-seg');
    if (!segs.length) return;
    Array.prototype.forEach.call(segs[0].children, function (x, i) {
      x.setAttribute('aria-pressed', String((i === 0 ? 'deck' : 'all') === state.scope));
    });
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
    var n = st.own.length + st.cross.length;
    out.push(isStagePinned(state.active) ? '상담 중 다시 볼 근거를 고정했어요'
      : (n ? '근거 ' + n + '장 중 다시 볼 것을 고정해 두세요' : '이 섹터를 키워드로 직접 열어 확인했어요'));
    return out;
  }
  function isStagePinned(idx) {
    var hit = false;
    state.pins.forEach(function (p) { if (p.st === idx) hit = true; });
    return hit;
  }

  function evCard(c, stageIdx, cross) {
    var box = el('article', 'lv-ev');
    var hd = el('div', 'lv-ev-hd');
    hd.appendChild(el('span', 'lv-ev-t', c.title));
    var sec = secOf(c.sector);
    var bt = String(sec.badge || '').trim(), tt = String(c.title || '').trim();
    var label = (bt && bt !== tt) ? bt : (sec.no ? sec.no + '번' : (sec.title !== tt ? sec.title : ''));
    if (label) hd.appendChild(el('span', 'lv-ev-b', cross ? '확장 · ' + label : label));
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
    txt.appendChild(el('b', null, (s.no ? s.no + '번 · ' : '') + s.title));
    var line = (s.badge ? s.badge : '');
    if (s.why && s.why.length) line += (line ? ' · ' : '') + '내담자 말 「' + s.why.slice(0, 2).join(' · ') + '」에서 걸림';
    txt.appendChild(el('span', null, line));
    row.appendChild(txt);
    var b = el('button', null, '덱에 추가');
    b.type = 'button';
    var full = state.built.deck.steps.length >= MAX_STEPS;
    var sample = state.built.deck.where === 'sample';
    if (full || sample) {
      b.disabled = true;
      b.textContent = sample ? '내 덱에서' : '가득 참';
      b.setAttribute('aria-label', sample ? '예시 덱에는 더할 수 없습니다 — 내 덱을 고르세요' : '덱은 ' + MAX_STEPS + '단계까지입니다');
    } else {
      b.addEventListener('click', function () { addSector(s, b); });
    }
    row.appendChild(b);
    return row;
  }

  function addSector(s, btn) {
    var deck = state.built ? state.built.deck : null;
    if (!deck || !window.JCDeck) return;
    if (deck.steps.length >= MAX_STEPS) return;
    var exists = false;
    deck.steps.forEach(function (x) { if (x.id === s.id) exists = true; });
    if (exists) { toast('이미 덱에 있는 섹터예요.'); return; }
    btn.disabled = true;
    btn.textContent = '더하는 중…';
    var steps = deck.steps.concat([{ id: s.id, no: s.no, title: s.title, badge: s.badge }]);
    window.JCDeck.save({ id: deck.id, name: deck.name, steps: steps, where: deck.where }).then(function (r) {
      var src = r && r.source === 'server' ? '내 계정의 덱' : '이 기기의 덱';
      toast('「' + s.title + '」을(를) ' + src + '에 ' + steps.length + '단계로 더했어요.');
      return window.JCDeck.list().then(function (rr) {
        state.decks = rr.decks || [];
        fillDecks();
        if (state.built) run();
      }, function () { if (state.built) run(); });
    }, function (e) {
      btn.disabled = false;
      btn.textContent = '덱에 추가';
      toast(window.JCDeck.errText ? window.JCDeck.errText(e || {}) : '덱에 더하지 못했어요.');
    });
  }

  /* ================================================================ 요약 복사 (개인정보 없이) */
  function summaryText() {
    var b = state.built;
    if (!b) return '';
    var out = [];
    out.push('마이덱 라이브 — ' + b.deck.name);
    out.push('자료실 색인에서 찾은 근거로 세운 상담 순서입니다. 내담자 메모는 넣지 않았습니다.');
    out.push('');
    b.stages.forEach(function (st, i) {
      out.push((i + 1) + '. ' + st.title + ((st.no || st.badge) ? ' (' + [st.no ? st.no + '번' : '', st.badge].filter(Boolean).join(' · ') + ')' : ''));
      st.ask.forEach(function (a) { out.push('   · 발문: ' + a); });
      var cards = st.own.concat(st.cross);
      cards.forEach(function (c) {
        out.push('   · 근거: ' + c.title + ' — ' + absOf(hrefOf(c.url, qShort())) + (c.why ? ' (' + c.why + ')' : ''));
      });
      if (!cards.length) out.push('   · 근거: 이 섹터에서는 걸리는 자료를 찾지 못함');
    });
    if (state.pins.length) {
      out.push('');
      out.push('고정한 근거');
      state.pins.forEach(function (p) {
        out.push('   · ' + p.title + ' — ' + absOf(hrefOf(p.url, qShort())));
      });
    }
    out.push('');
    out.push('자료실 · 마이덱 라이브');
    return out.join('\n');
  }

  function copySummary() {
    var text = summaryText();
    if (!text) return;
    function done() { toast('요약을 복사했어요. 내담자 메모는 넣지 않았습니다.'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-1000px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) done();
      else toast('복사하지 못했어요. 화면의 근거 카드를 직접 열어 주세요.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  /* ================================================================ 시작 */
  function boot() {
    mountMode();
    var live = $('live');
    if (live) live.hidden = true;
  }

  window.JCDeckLive = {
    open: open,
    setMode: setMode,
    ready: function () { return state.engine === 'ready'; },
    summary: summaryText
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
