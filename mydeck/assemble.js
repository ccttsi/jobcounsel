/* assemble.js — 질문 하나로 「필요한 만큼만」 상담 덱을 짜는 엔진 (2026-11-21)
 *
 * 쓰는 곳
 *   mydeck/ — 마이덱: 질문 한 칸 + 추천어 → 추천 덱 → 편집(순서·삽입·교체·삭제)
 *   flow/   — ① 어디서 시작할까요 카드의 뒷면(마이덱)
 *
 * 무엇을 하나
 *   ① 질문을 읽는다 — 낱말·약어 사전·시작 키워드·시너지 지도(flow/data/graph.json).
 *   ② 실용성 티어로 거른다 — 현장 1티어(계산·진단·법령·서류·면접 …)가 늘 앞선다.
 *      데이컴·파슨스·이론 위키·보고서 서재·대학원 같은 학습·연구용(3티어)은
 *      사용자가 그 말을 직접 꺼냈을 때만 후보에 넣는다.
 *   ③ 필요한 만큼만 짠다 — 한 자료로 끝나는 질문이면 **1칸 덱**, 여러 단계가 필요하면
 *      실제로 이어지는 2~5칸만. 여섯 갈래를 억지로 채우던 옛 방식(CATS[cat][0] 강제 삽입)은 버렸다.
 *   ④ 의미 있는 차이가 있을 때만 두 번째 덱(상황 보강형)을 낸다 — 같은 덱을 세 벌 복제하지 않는다.
 *
 * 지키는 선
 *   · 색인에 없는 섹터·수치·조문은 세우지 않는다. 없는 자료는 후보에 올리지 않는다.
 *   · 저장은 JCDeck이 맡는다 — 이 파일은 짜기·편집 화면만 맡는다.
 *   · 움직이는 값은 transform·opacity 뿐. 글자 타자는 한 글자마다 textContent만 바꾼다.
 *   · ./data/mydeck-weights.json(가중치)은 있으면 반영하고, 없거나 비어 있으면 내장 기본값으로 돈다.
 *     fetch 실패는 조용히 삼킨다(콘솔 오류·404를 만들지 않는다).
 */
(function () {
  'use strict';
  if (window.JCAssemble) return;

  var BASE = '../';

  /* ================================================================ 섹터 장부 */
  function tools() { return window.JC_TOOLS || []; }
  function toolOf(id) {
    var out = null;
    tools().forEach(function (x) { if (x.id === id) out = x; });
    return out;
  }
  function sector(id) {
    var t = toolOf(id);
    if (t) return { id: id, no: t.no || '', title: t.title || id, badge: t.badge || '', desc: t.desc || '', meta: t.meta || [], path: t.path || './' + id + '/', gi: t.gi || '', tags: t.tags || [] };
    var gs = ((st.graph && st.graph.sectors) || []);
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].id === id) return { id: id, no: gs[i].no || '', title: gs[i].title || id, badge: gs[i].badge || '', desc: gs[i].desc || '', meta: gs[i].meta || [], path: gs[i].path || './' + id + '/', gi: gs[i].gi || '', tags: gs[i].tags || [] };
    }
    return { id: id, no: '', title: id, badge: '', desc: '', meta: [], path: './' + id + '/', gi: '', tags: [] };
  }

  /* ================================================================ 실용성 티어
     1티어 — 상담 현장에서 바로 쓰는 자료. 추천 덱의 뼈대는 언제나 여기서 나온다.
     3티어 — 학습·연구용(데이컴·파슨스·이론·보고서·대학원). 질문이 그 말을 직접 꺼낼 때만.
     나머지 — 보조(분류·산업·동향). 질문에 걸릴 때만 한 칸 들어간다.
     2026-11-22: 공고문 점검(posting)·재직 첫해(first-year)는 내담자 서류를 그 자리에서 보는
     현장 직결이라 1티어에 넣었다. 사례개념화(casecon)는 이론을 사례에 대는 «적용» 도구지만
     상담 장면의 상시 계산·판단 도구는 아니므로 2티어(상황 보강)에 두었다 — 질문이 사례·사정·
     상담목표를 꺼내면 후보에 들어온다. 새 섹터를 넣을 때도 이 두 줄(티어·차례·그룹)을 함께 본다. */
  var TIER1 = ['triage', 'intake', 'policy-match', 'pay-calc', 'hud', 'kdt-calc', 'talk', 'translator',
    'work-filter', 'manual', 'law', 'company', 'portals', 'surgery', 'interview', 'portfolio', 'transit',
    'reality', 'vpi', 'cert', 'posting', 'first-year'];
  var STUDY = ['dacum', 'parsons', 'theory', 'library', 'grad'];
  function tierOf(id) {
    if (TIER1.indexOf(id) >= 0) return 1;
    if (STUDY.indexOf(id) >= 0) return 3;
    return 2;
  }
  function tierName(id) {
    var t = tierOf(id);
    return t === 1 ? '현장' : (t === 3 ? '학습·연구' : '보조');
  }

  /* 학습·연구용 자료를 부르는 말 — 사용자가 직접 꺼냈을 때만 허용한다 */
  var STUDY_SAY = {
    dacum: /(데이컴|데컴|dacum|직무\s*분석|과업\s*분석)/i,
    parsons: /(파슨스|parsons|원전|직업의\s*선택)/i,
    theory: /(이론|위키|상담\s*이론|직업상담\s*이론)/,
    library: /(보고서|서재|연구\s*보고|정책\s*연구)/,
    grad: /(대학원|석사|박사|진학)/
  };
  function studyAsked(q) {
    var s = String(q || ''), out = {};
    Object.keys(STUDY_SAY).forEach(function (id) { if (STUDY_SAY[id].test(s)) out[id] = 1; });
    return out;
  }

  /* ================================================================ 갈래·차례
     GROUPS — 편집 화면의 「자료 고르기」 분류. 없는 섹터는 그냥 빠진다.
     STAGE  — 상담이 실제로 흐르는 차례. 유동 덱은 이 차례로 줄을 세운다(억지로 채우지 않는다). */
  var GROUPS = [
    { id: 'intake', name: '접수·진단', ids: ['triage', 'intake', 'talk', 'translator', 'vpi', 'reality', 'hud', 'policy-match', 'pay-calc', 'work-filter'] },
    { id: 'policy', name: '제도·훈련', ids: ['manual', 'law', 'kdt-calc', 'cert', 'posting', 'first-year'] },
    { id: 'corp', name: '기업·직무', ids: ['company', 'fin-lab', 'taxonomy', 'careernet', 'valuechain', 'univ'] },
    { id: 'trend', name: '산업·동향', ids: ['thermometer', 'labor', 'briefing', 'emerging'] },
    { id: 'field', name: '실전', ids: ['portals', 'surgery', 'interview', 'portfolio', 'transit'] },
    { id: 'study', name: '학습·연구', ids: ['theory', 'casecon', 'parsons', 'dacum', 'library', 'grad', 'decalcomania'] }
  ];
  var CAT_OF = {}, CATS = {}, GROUP_NAME = { all: '전체' };
  GROUPS.forEach(function (g) {
    GROUP_NAME[g.id] = g.name;
    CATS[g.name] = g.ids.slice();
    g.ids.forEach(function (id) { if (!CAT_OF[id]) CAT_OF[id] = g.name; });
  });
  function groupOf(id) {
    var out = '';
    GROUPS.forEach(function (g) { if (g.ids.indexOf(id) >= 0) out = g.id; });
    return out || 'etc';
  }

  var STAGE = {
    triage: 10, intake: 11, talk: 12, translator: 13,
    vpi: 20, reality: 21, theory: 22, parsons: 23, casecon: 24,
    'work-filter': 30, 'pay-calc': 31, 'policy-match': 32, posting: 33,
    manual: 40, law: 41, 'first-year': 42, hud: 44, 'kdt-calc': 45, cert: 46,
    company: 50, labor: 51, taxonomy: 52, careernet: 53, valuechain: 54, 'fin-lab': 55,
    thermometer: 56, briefing: 57, emerging: 58, univ: 59,
    portals: 60, surgery: 61, interview: 62, portfolio: 63, transit: 64,
    dacum: 65, library: 66, grad: 67, decalcomania: 68
  };
  function stageOf(id) { return STAGE[id] || 99; }
  var ORDER = Object.keys(STAGE).sort(function (a, b) { return STAGE[a] - STAGE[b]; });

  /* 아직 자료실에 없는 섹터를 부르는 질문 — 합쳐지는 순간 그대로 그 자료가 쓰인다.
     지금은 아래 대체 자료로 안내하고, 대체가 없으면 유동 덱(검색 결과)으로 넘긴다. */
  var FALLBACK = { intake: 'triage', 'policy-match': 'manual' };
  function resolveId(id) {
    if (toolOf(id)) return id;
    var f = FALLBACK[id];
    return (f && toolOf(f)) ? f : '';
  }

  /* ================================================================ 읽기 */
  var st = { engine: 'idle', engP: null, graph: null, wait: null, weights: null };
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function weights() { return st.weights || {}; }
  function sectorW(id) {
    var w = weights().sectors || {};
    var v = Number(w[id]);
    return (isFinite(v) && v > 0) ? Math.max(0.4, Math.min(2.2, v)) : 1;
  }
  function pairW(a, b) {
    var p = weights().pairs || {};
    var v = Number(p[a + '|' + b] || p[b + '|' + a]);
    return (isFinite(v) && v > 0) ? Math.max(0.4, Math.min(2.2, v)) : 1;
  }
  function loadWeights() {
    if (st.weights) return Promise.resolve(st.weights);
    return fetch(BASE + 'mydeck/data/mydeck-weights.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { st.weights = (j && typeof j === 'object') ? j : {}; return st.weights; })
      .catch(function () { st.weights = {}; return st.weights; });
  }
  function loadGraph() {
    if (st.graph) return Promise.resolve(st.graph);
    return fetch(BASE + 'flow/data/graph.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { st.graph = j || null; return st.graph; })
      .catch(function () { return null; });
  }
  function loadEngine() {
    if (st.engine === 'ready') return Promise.resolve();
    if (st.engP) return st.engP;
    st.engine = 'loading';
    st.engP = new Promise(function (res, rej) {
      if (window.JCAssistSearch) return res();
      window.JCA_BASE = BASE;
      var sc = document.createElement('script');
      sc.src = BASE + 'assistant/search.js';
      sc.onload = function () { res(); };
      sc.onerror = function () { rej(new Error('search')); };
      document.head.appendChild(sc);
    }).then(function () {
      if (!window.JCAssistSearch) throw new Error('engine');
      return window.JCAssistSearch.load();
    }).then(function () {
      st.engine = 'ready';
    }, function (e) {
      st.engine = 'idle'; st.engP = null;
      throw e;
    });
    return st.engP;
  }
  function load() {
    if (st.wait) return st.wait;
    st.wait = Promise.all([loadEngine(), loadGraph(), loadWeights()]).then(function () { return true; }, function (e) {
      st.wait = null;
      throw e;
    });
    return st.wait;
  }

  /* ================================================================ 질문 읽기 — 현장 의도
     「국비훈련 자부담 계산」처럼 한 자료로 끝나는 질문을 잡는다. 두 조건(무엇 + 무엇을 하려는지)이
     함께 있어야만 1칸으로 판정한다 — 낱말 하나만 걸려서 억지로 1칸이 되지 않게. */
  var RULES = [
    { id: 'pay-calc', dom: /(퇴직금|연봉|실수령|주휴수당|최저임금|월급|급여|수당)/, act: /(계산|얼마|실수령|알려|조회|공제|떼)/, not: /(실업급여|구직급여|국취|취업성공수당|수급|훈련|내일배움)/, why: '급여·퇴직금 숫자를 바로 계산하는 도구' },
    { id: 'hud', dom: /(실업급여|구직급여|국취\s*수당|취업성공수당|수급)/, act: /(얼마|계산|금액|지급|받|기간|언제|모의)/, why: '지급액·기간을 숫자로 계산하는 도구' },
    { id: 'kdt-calc', dom: /(국비|내일배움카드|국민내일배움|kdt|훈련비|자부담|훈련장려금)/, act: /(계산|얼마|자부담|비용|지원|한도|부담)/, why: '훈련비 자부담과 지원액을 계산하는 도구' },
    { id: 'interview', dom: /면접/, act: /(압박|질문|답변|대비|전술|꼬리|돌발|준비)/, why: '면접 질문의 의도와 답변을 준비하는 덱' },
    { id: 'company', dom: /(회사|기업|업체|공기업|중견기업|대기업)/, act: /(매출|직원\s*수|규모|정보|재무|소재|확인|어떤|괜찮)/, why: '기업의 규모·매출·최근 소식을 확인하는 명함첩' },
    { id: 'intake', dom: /(초기\s*상담|첫\s*상담|접수\s*상담|인테이크)/, act: /(질문지|질문|체크|양식|무엇을\s*물|어떤\s*것)/, why: '접수에서 무엇을 물을지 정하는 질문지' },
    { id: 'surgery', dom: /(자기소개서|이력서|지원서|서류|입사지원)/, act: /(탈락|이유|첨삭|고치|해부|문장|문제|안\s*쓰|왜)/, why: '서류 문장을 뜯어 보고 고치는 해부실' },
    { id: 'portfolio', dom: /포트폴리오/, act: /(구조|정리|만들|편집|채용|어떻게)/, why: '채용 담당자가 보는 순서로 정리하는 편집실' },
    { id: 'vpi', dom: /(심리검사|직업선호도|흥미검사|적성검사|vpi|l형|검사)/, act: /(해석|결과|읽|보고|진로|어떻게|풀)/, why: '검사 결과를 내담자와 함께 읽는 해석 도구' },
    { id: 'work-filter', dom: /(근무\s*환경|교대|야간|출장|근무\s*조건)/, act: /(견딜|버틸|힘들|확인|걸러|맞)/, why: '견딜 수 있는 근무 조건을 걸러 보는 필터' },
    { id: 'talk', dom: /(대화|발문|경청|공감)/, act: /(연습|피드백|어떻게|훈련|배우)/, why: '발문·경청을 직접 연습하는 대화 도구' },
    { id: 'translator', dom: /(용어|은어|줄임말|무슨\s*말|쉬운\s*말|번역)/, act: /(알아|풀|바꿔|뜻|모르)/, why: '내담자 말을 정식 용어로 풀어 주는 번역기' },
    { id: 'cert', dom: /(자격증|자격)/, act: /(뭐|무엇|따면|종류|필요|찾|취업)/, why: '목표 직무에 필요한 자격을 찾는 도구' },
    { id: 'portals', dom: /(채용\s*사이트|구인\s*사이트|어디서\s*지원|채용\s*공고|공채)/, act: /(어디|골라|찾|지원|좋)/, why: '어느 채용 경로로 지원할지 고르는 안내판' },
    { id: 'law', dom: /(임금체불|해고|근로계약|근로시간|산재|부당|최저임금)/, act: /(법|조문|근거|기준|신고|어떻게)/, why: '상황에 맞는 법령·조문을 찾는 법전' },
    { id: 'manual', dom: /(국민취업지원|국취|구직자취업촉진|고용보험법|직업안정법)/, act: /(요건|대상|조문|법|신청|자격)/, why: '제도 요건과 조문을 확인하는 법령 가이드' },
    { id: 'reality', dom: /(현위치|객관|실제\s*취업|통계)/, act: /(재|확인|알아|비교)/, why: '내담자의 예측과 공식 통계를 맞대는 도구' },
    { id: 'transit', dom: /(전직|이직|커리어\s*전환|환승)/, act: /(순서|경로|어디|막힘|노선)/, why: '경력 전환의 환승역과 노선을 그리는 지도' },
    { id: 'policy-match', dom: /(지원금|지원\s*제도|정책|받을\s*수\s*있는)/, act: /(무엇|뭐|대상|매칭|확인|골라)/, not: /(국민취업지원|국취|구직자취업촉진|고용보험|내일배움|실업급여|구직급여)/, why: '내담자 조건에 맞는 지원 제도를 맞추는 도구' },
    { id: 'triage', dom: /(위기|긴급|응급|생계|노숙|쉼터)/, act: /(등급|분류|먼저|어떻게|확인)/, why: '위기 신호를 먼저 나누는 트리아지 보드' },
    { id: 'posting', dom: /(공고문|채용\s*공고|구인\s*공고|모집\s*요강|공고\s*문구)/, act: /(법령|위반|점검|문구|표현|검토|자격\s*요건|주휴|이상한|따져)/, not: /(어디|사이트|지원할)/, why: '공고문 문장에서 법령 위반 소지와 근거 조문을 찾는 점검대' },
    { id: 'first-year', dom: /(입사\s*후|입사일|수습|연차|해고|육아휴직|재직|근로계약서|금품청산|퇴사)/, act: /(언제|시점|확인|권리|의무|기한|며칠|기간|가능|물어)/, not: /(계산|실수령|공제|떼)/, why: '입사일을 기준으로 수습·연차·퇴직급여 시점을 짚는 시간축' },
    { id: 'careernet', dom: /(커리어넷|careernet|직업사전|직업백과|학과정보)/, act: /(공식|원문|확인|찾|어때|분류|연봉|전망|보여)/, why: '커리어넷 공식 원천에서 직업·학과를 바로 확인하는 사전' },
    { id: 'casecon', dom: /(사례\s*개념화|사례개념화|개념화|사례|케이스|사정|상담\s*목표|상담\s*계획)/, act: /(어떻게|세우|정리|이론|읽|적용|목표|틀|접근)/, not: /(이론\s*위키|파슨스)/, why: '한 사례를 이론 틀에 대어 사정·상담목표를 세우는 실습실' }
  ];
  function matchRules(q) {
    var s = String(q || ''), out = [];
    RULES.forEach(function (r) {
      if (!r.dom.test(s) || !r.act.test(s)) return;
      if (r.not && r.not.test(s)) return;
      if (!resolveId(r.id)) return;
      out.push({ id: r.id, why: r.why });
    });
    return out;
  }

  /* 여러 갈래가 함께 나오면 1칸이 아니라 흐름이다 */
  var BUCKETS = [
    ['제도', /(제도|요건|신청|대상자|자격\s*요건)/],
    ['훈련', /(훈련|국비|내일배움|교육\s*과정|직업교육)/],
    ['서류', /(서류|자기소개서|이력서|지원서|포트폴리오)/],
    ['기업', /(기업|회사|업체|공기업)/],
    ['검사', /(심리검사|진로\s*검사|적성|흥미)/],
    ['면접', /(면접)/],
    ['정책', /(지원금|정책|지원\s*바우처)/],
    ['대학', /(학과|전공|대학원|진학)/],
    ['산업', /(산업|업종|전망|노동시장)/]
  ];
  function bucketsOf(q) {
    var s = String(q || ''), out = [];
    BUCKETS.forEach(function (b) { if (b[1].test(s)) out.push(b[0]); });
    return out;
  }

  /* 질문의 상황 낱말 → 함께 볼 현장 자료 (유동 덱의 씨앗) */
  var SEEDS = [
    { re: /(제도|요건|신청)/, ids: ['manual', 'policy-match'], why: '제도' },
    { re: /(훈련|국비|내일배움|교육\s*과정)/, ids: ['kdt-calc', 'cert'], why: '훈련' },
    { re: /(서류|자기소개서|이력서|지원서)/, ids: ['surgery', 'portals'], why: '서류' },
    { re: /(기업|회사|업체)/, ids: ['company', 'fin-lab'], why: '기업' },
    { re: /(산업|업종|전망)/, ids: ['thermometer', 'emerging'], why: '산업' },
    { re: /(진로|적성|미정|탐색|무엇을\s*할지|뭘\s*할지)/, ids: ['vpi', 'reality', 'portals'], why: '진로 탐색' },
    { re: /(위기|긴급|생계|노숙)/, ids: ['triage'], why: '위기' },
    { re: /(경력\s*단절|경단|재취업|복귀)/, ids: ['triage', 'manual', 'kdt-calc'], why: '경력단절' },
    { re: /(청년|2030|mz)/i, ids: ['portals', 'hud', 'policy-match'], why: '청년' },
    { re: /(중장년|신중년|4050|50대)/, ids: ['transit', 'labor', 'company'], why: '중장년' }
  ];


  /* ================================================================ WITW MLC 연결
     WITW MLC(`witw-synergy-graph/1.0.0`)와 **같은 모양**으로 자료실 지도를 세운다.
       · sector_tier — 실용성 3티어(1 상담 현장 직결 · 2 상황 보강 · 3 학습·연구용)
       · pairs       — 두 자료가 왜 이어지는지(weight 1~8 · link · shared_keywords · practicality)
       · adjacency   — 자료별 이웃(티어 → practicality 순)
       · starts      — 사용자가 던진 말에서 시작 자료를 고르는 표
     런타임 지도는 flow/data/graph.json 하나이고 이 층이 그 지도를 MLC 규격으로 투영한다.
     학습 가중치(mydeck/data/mydeck-weights.json)는 weight·practicality에 곱해 반영된다.
     질문 분석(plan)도 이 층을 지나므로, 추천 순서·덱 구성·이어 붙이기가 MLC와 같은 기준을 쓴다. */
  var MLC_SCHEMA = 'witw-synergy-graph/1.0.0';
  var MLC_FEEDBACK = 'witw-mlc-feedback/1.0.0';
  function tierFactor(id) { var t = tierOf(id); return t === 1 ? 1 : (t === 2 ? 0.6 : 0.3); }
  function tierPairName(a, b) { var x = tierOf(a), y = tierOf(b); return Math.min(x, y) + '-' + Math.max(x, y); }
  function mlcDoc() {
    if (st.mlc) return st.mlc;
    var g = st.graph || {};
    var live = {};
    tools().forEach(function (t) { if (t && t.id) live[t.id] = 1; });
    var sectorTier = {};
    tools().forEach(function (t) { if (t && t.id) sectorTier[t.id] = tierOf(t.id); });
    var pairs = (g.pairs || []).filter(function (p) { return p && live[p.a] && live[p.b]; }).map(function (p) {
      var w = Number(p.w) || 0;
      return {
        id: p.a + '~' + p.b, a: p.a, b: p.b, weight: w, link: !!p.link,
        shared_count: (p.shared || []).length,
        shared_keywords: (p.shared || []).slice(0, 6),
        basis: p.basis || (p.link ? '자료실 연결 짝' : '겹치는 말'),
        tier_pair: tierPairName(p.a, p.b),
        practicality: Math.round(w * Math.min(tierFactor(p.a), tierFactor(p.b)) * pairW(p.a, p.b) * 100) / 100
      };
    });
    var adjMap = {};
    pairs.forEach(function (p) {
      adjMap[p.a] = adjMap[p.a] || [];
      adjMap[p.b] = adjMap[p.b] || [];
      adjMap[p.a].push({ to: p.b, title: sector(p.b).title, tier: tierOf(p.b), weight: p.weight, practicality: p.practicality, shared_keywords: p.shared_keywords, linked_in_tools: p.link });
      adjMap[p.b].push({ to: p.a, title: sector(p.a).title, tier: tierOf(p.a), weight: p.weight, practicality: p.practicality, shared_keywords: p.shared_keywords, linked_in_tools: p.link });
    });
    var adjacency = {};
    Object.keys(adjMap).forEach(function (id) {
      adjMap[id].sort(function (x, y) { return (x.tier - y.tier) || (y.practicality - x.practicality); });
      adjacency[id] = adjMap[id].slice(0, 8);
    });
    st.mlc = {
      schema: MLC_SCHEMA,
      built: new Date().toISOString(),
      counts: {
        sectors: tools().length,
        live_sectors: tools().length,
        apps: ((window.JC_APPS || []).length),
        pairs: pairs.length,
        linked_pairs: pairs.filter(function (p) { return p.link; }).length
      },
      tier_rules: {
        1: { label: '상담 현장 직결', use: '자동 추천 1순위', ids: TIER1.filter(function (id) { return live[id]; }) },
        2: { label: '상황 보강', use: '맥락이 맞을 때만', ids: Object.keys(sectorTier).filter(function (id) { return sectorTier[id] === 2; }) },
        3: { label: '학습·연구용', use: '직접 찾거나 끼워 넣을 때만', ids: STUDY.filter(function (id) { return live[id]; }) }
      },
      sector_tier: sectorTier,
      apps: {},
      example_flow: {
        basis: '상담이 흐르는 차례(손으로 정한 기본값)',
        order: ORDER.filter(function (id) { return live[id] && tierOf(id) === 1; }),
        why: '접수·진단 → 제도 → 기업·동향 → 실전'
      },
      pairs: pairs,
      adjacency: adjacency,
      starts: (g.starts || []).filter(function (x) { return x && x.k && (x.to || []).length; })
    };
    return st.mlc;
  }
  function mlcNeighbors(id) {
    var a = mlcDoc().adjacency[id];
    return a ? a.slice() : [];
  }
  function mlcPairOf(a, b) {
    var out = null;
    mlcDoc().pairs.forEach(function (p) { if (!out && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) out = p; });
    return out;
  }

  /* ================================================================ 후보 모으기 */
  var HIT = 2.6;   /* 이만큼 뚜렷이 걸려야 「질문이 부른 자료」로 본다 */
  function practical(id, allow) {
    var t = tierOf(id);
    if (t === 1) return 1.18;
    if (t === 3) return allow && allow[id] ? 1.16 : 0.45;
    return 1.0;
  }
  function pool(q, allow) {
    var S = window.JCAssistSearch;
    if (!S) return [];
    var out = {}, nq = norm(q);
    function bump(id, w, label) {
      if (!id || id === 'flow' || !toolOf(id)) return;
      var o = out[id] || (out[id] = { id: id, score: 0, why: [] });
      o.score += w;
      if (label && o.why.indexOf(label) < 0 && o.why.length < 3) o.why.push(label);
    }
    (S.route(q, { limit: 12 }) || []).forEach(function (r) { bump(r.id, 2 + (r.score || 0) * 0.8, (r.why || [])[0] || ''); });
    var an = S.analyze(q);
    (an.dict || []).forEach(function (d) {
      var alias = String(d.q || '').replace(/\s+/g, '') !== String(d.c || '').replace(/\s+/g, '');
      (d.s || []).forEach(function (id, i) { bump(id, (alias ? 2.2 : 1.3) - i * 0.12, d.c); });
    });
    /* 상담 은어·동의어 사전(2순위) — 「상담일지」·「3.3%」처럼 그 섹터를 콕 집는 말은
       첫 자리 섹터를 더 세게 민다. 사전이 없으면 analyze().syn 도 없어 예전과 같다. */
    (an.syn || []).forEach(function (g) {
      (g.s || []).slice(0, 2).forEach(function (id, i) {
        bump(id, Math.max(0.9, (Number(g.p) || 1) * 1.7 - i * 0.5), g.c);
      });
    });
    mlcDoc().starts.forEach(function (s) {
      if (!s.k || nq.indexOf(norm(s.k)) < 0) return;
      (s.to || []).forEach(function (id) { bump(id, 2.4, s.k); });
    });
    var g = st.graph;
    if (g) {
      Object.keys(g.kw || {}).forEach(function (k) {
        if (k.length < 2 || nq.indexOf(norm(k)) < 0) return;
        (g.kw[k] || []).forEach(function (id) { bump(id, 0.3, k); });
      });
    }
    (S.search(q, { limit: 40, perSector: 40 }) || []).forEach(function (r) {
      if ((r.score || 0) < 8) return;
      bump(r.sector, 0.15 + Math.min(0.6, (r.score || 0) / 60), '');
    });
    SEEDS.forEach(function (s) {
      if (!s.re.test(String(q || ''))) return;
      s.ids.forEach(function (id, i) { if (i < 2) bump(id, 2.3 - i * 0.35, s.why); });
    });
    return Object.keys(out).map(function (k) { return out[k]; })
      .filter(function (x) { return x.score >= 1.2; })
      .map(function (x) {
        x.tier = tierOf(x.id);
        x.rank = x.score * practical(x.id, allow) * sectorW(x.id);
        return x;
      })
      .sort(function (a, b) { return b.rank - a.rank; });
  }

  /* 학습·연구용 자료를 «직접» 꼬집은 짧은 질문 — 그 자료 한 칸으로 답한다("직무분석" → 데이컴) */
  function studySingle(q, allow) {
    var ids = Object.keys(allow || {});
    if (ids.length !== 1) return '';
    var s = norm(q);
    if (!s || s.split(' ').length > 4) return '';
    if (/(적용|실무|연습|활용|이어|함께|사례|흐름)/.test(String(q))) return '';
    return resolveId(ids[0]);
  }

  function deckName(q, tag) {
    var s = String(q || '').replace(/\s+/g, ' ').trim();
    if (s.length > 30) s = s.slice(0, 29) + '…';
    return (s || '내 상담 흐름') + ' · ' + tag;
  }
  function hasId(list, id) {
    var hit = false;
    (list || []).forEach(function (x) { if (x.id === id) hit = true; });
    return hit;
  }
  function sortSteps(list) {
    list.sort(function (a, b) { return stageOf(a.id) - stageOf(b.id); });
    return list;
  }
  function stepOf(id, why) {
    return { id: id, hit: true, why: (why || []).slice(0, 2), tier: tierOf(id) };
  }

  /* 이어 붙일 한 칸 — MLC 시너지 지도에서 practicality이 가장 높은 현장 자료 */
  function adjacent(list, allow) {
    var out = [], used = {}, seen = {};
    (list || []).forEach(function (s) { used[s.id] = 1; });
    var cand = [];
    (list || []).forEach(function (s) {
      mlcNeighbors(s.id).forEach(function (n) {
        if (!n || !n.to || used[n.to] || seen[n.to] || !toolOf(n.to)) return;
        if (tierOf(n.to) === 3 && !(allow && allow[n.to])) return;
        seen[n.to] = 1;
        cand.push({ id: n.to, score: n.practicality * sectorW(n.to) });
      });
    });
    cand.sort(function (x, y) { return y.score - x.score; });
    cand.forEach(function (c) { if (out.length < 2) out.push(c.id); });
    return out;
  }

  /* ================================================================ 유동 덱 짜기 */
  function plan(q) {
    q = String(q == null ? '' : q).replace(/\s+/g, ' ').trim();
    var an = null;
    try { an = window.JCAssistSearch ? window.JCAssistSearch.analyze(q) : null; } catch (e) { an = null; }
    var allow = studyAsked(q);
    var rules = matchRules(q);
    var buckets = bucketsOf(q);
    var list = pool(q, allow);
    var decks = [];
    var single = rules.length === 1 && buckets.length <= 1;
    var core = [];
    var seedWhy = [];

    /* 이 질문을 어떻게 읽었고, 어느 시너지 짝으로 줄을 세웠는지 — WITW MLC 규격 그대로 남긴다 */
    function mlcMeta(mode, steps) {
      var edges = [];
      for (var i = 1; i < steps.length; i++) {
        var p = mlcPairOf(steps[i - 1].id, steps[i].id);
        edges.push(p
          ? { a: p.a, b: p.b, weight: p.weight, practicality: p.practicality, link: p.link }
          : { a: steps[i - 1].id, b: steps[i].id, weight: 0, practicality: 0, link: false });
      }
      return {
        schema: MLC_SCHEMA,
        mode: mode,
        tier_limit: 1,
        intent: { domains: buckets, tools: rules.map(function (r) { return r.id; }), seeds: seedWhy },
        tiers: steps.map(function (x) { return { id: x.id, tier: tierOf(x.id) }; }),
        edges: edges
      };
    }

    if (single) {
      var rid = resolveId(rules[0].id);
      if (rid) core = [stepOf(rid, [rules[0].why])];
    }
    if (!core.length) {
      var sid = studySingle(q, allow);
      if (sid) { single = true; core = [stepOf(sid, ['「' + sector(sid).title + '」 — 질문에서 직접 꼬집은 학습·연구 자료'])]; }
    }
    if (!core.length) {
      /* 1차 — 질문이 실제로 부른 자료(의도 규칙 + 상황 씨앗). 2차 — 색인이 걸어 준 자료.
         한 덱은 5칸을 넘지 않고, 1차가 두 칸 이상이면 2차는 한 칸만 붙인다(억지로 채우지 않는다). */
      var wave1 = [], wave2 = [];
      function w1(id, why) {
        if (!id || !toolOf(id) || hasId(wave1, id) || hasId(wave2, id)) return;
        wave1.push(stepOf(id, why));
      }
      function w2(id, why) {
        if (!id || !toolOf(id) || hasId(wave1, id) || hasId(wave2, id)) return;
        if (tierOf(id) === 3 && !allow[id]) return;
        wave2.push(stepOf(id, why));
      }
      rules.forEach(function (r) { w1(resolveId(r.id), [r.why]); });
      SEEDS.forEach(function (s) {
        if (!s.re.test(String(q || ''))) return;
        if (seedWhy.indexOf(s.why) < 0 && seedWhy.length < 4) seedWhy.push(s.why);
        s.ids.forEach(function (id, i) { if (i === 0) w1(resolveId(id), [s.why]); else w2(resolveId(id), [s.why]); });
      });
      list.forEach(function (x) { if (x.rank >= HIT) w2(x.id, x.why); });

      core = wave1.slice();
      sortSteps(core);
      var room = core.length >= 4 ? 0 : (core.length === 3 ? 1 : (core.length === 2 ? 2 : 3));
      var cap = Math.min(5, core.length + room);
      wave2.forEach(function (s) {
        if (core.length >= cap || hasId(core, s.id)) return;
        core.push(s);
      });
      sortSteps(core);
      if (core.length > 5) core.length = 5;
      if (core.length < 2) {
        var add = adjacent(core, allow).concat(list.filter(function (x) {
          return !hasId(core, x.id) && x.tier <= 2 && x.rank >= HIT * 0.55;
        }).map(function (x) { return x.id; }));
        add.forEach(function (id) {
          if (core.length >= 2 || hasId(core, id) || !toolOf(id)) return;
          core.push(stepOf(id, []));
        });
        sortSteps(core);
      }
    }

    if (!core.length) return { q: q, keys: an, single: false, decks: [], reason: '', mlc: mlcMeta('none', []) };

    if (single) {
      var only = core[0];
      var whyOne = (only.why && only.why[0]) ? only.why[0] : '질문에 맞는 자료가 하나입니다';
      decks.push({
        id: 'single', kind: 'single', tag: '한 칸', title: '「' + sector(only.id).title + '」 하나로',
        why: whyOne + '.',
        reason: '질문에서 「' + (an && (an.tokens || []).slice(0, 3).join(' ')) + '」를 읽고, 한 자료로 답이 나오는 질문으로 판정했습니다.',
        steps: [only], hits: only.why.slice(0, 2), hitCount: 1,
        name: deckName(q, '한 칸'), edited: false
      });
      return { q: q, keys: an, single: true, decks: decks, reason: decks[0].why, mlc: mlcMeta('single', core) };
    }

    var hitWhy = [];
    core.forEach(function (s) { (s.why || []).forEach(function (w) { if (w && hitWhy.indexOf(w) < 0 && hitWhy.length < 3) hitWhy.push(w); }); });
    var reasonA;
    if (buckets.length >= 2) reasonA = '질문에 「' + buckets.join('」 「') + '」가 함께 나와, 실제로 이어지는 ' + core.length + '단계만 골랐습니다.';
    else if (hitWhy.length) reasonA = '「' + hitWhy.join('」 「') + '」에 걸리는 현장 자료 ' + core.length + '개로 짰습니다.';
    else reasonA = '질문에 걸리는 현장 자료 ' + core.length + '개로 짰습니다.';
    decks.push({
      id: 'core', kind: 'flow', tag: '핵심', title: '질문에 바로 닿는 단계만',
      why: reasonA, reason: '현장에서 바로 쓰는 자료만 골랐습니다. 데이컴·이론 위키 같은 학습·연구용은 넣지 않았습니다.',
      steps: core.slice(), hits: hitWhy, hitCount: core.length,
      name: deckName(q, '핵심'), edited: false
    });

    /* 상황 보강형 — 핵심에 한두 칸을 더 붙였을 때 «실제로 달라질 때만» 낸다 */
    if (core.length <= 4) {
      var extra = [];
      list.forEach(function (x) {
        if (extra.length >= 2) return;
        if (hasId(core, x.id)) return;
        if (x.tier === 3 && !allow[x.id]) return;
        if (x.rank < HIT * 0.55) return;
        extra.push(x.id);
      });
      adjacent(core, allow).forEach(function (id) {
        if (extra.length >= 2 || hasId(core, id) || extra.indexOf(id) >= 0) return;
        extra.push(id);
      });
      var wide = core.slice();
      extra.forEach(function (id) { if (wide.length < 5) wide.push(stepOf(id, [])); });
      sortSteps(wide);
      if (wide.length > core.length) {
        var addWhy = wide.filter(function (s) { return !hasId(core, s.id); }).map(function (s) { return sector(s.id).title; });
        decks.push({
          id: 'wide', kind: 'flow', tag: '보강', title: '한 칸씩 보강한 흐름',
          why: '핵심 ' + core.length + '단계에 「' + addWhy.join('」 「') + '」 단계를 더해 ' + wide.length + '단계로 넓혔습니다.',
          reason: '같은 질문을 조금 더 넓게 보는 덱입니다. 핵심 덱과 단계가 실제로 다를 때만 보여 줍니다.',
          steps: wide, hits: hitWhy, hitCount: wide.length,
          name: deckName(q, '보강'), edited: false
        });
      }
    }

    return { q: q, keys: an, single: false, decks: decks, reason: decks[0].why, mlc: mlcMeta('flow', core) };
  }

  function courses(q) { return plan(q).decks; }

  /* 중간 노드에서 갈라지는 다음 자료 — 사용자가 직접 고르는 자리라 학습·연구용도 후보에 둘 수 있다 */
  function branches(steps, i) {
    var ids = {}, seen = {}, out = [];
    steps.forEach(function (s) { ids[s.id] = 1; });
    var node = (steps[i] || {}).id;
    if (!node) return out;
    mlcNeighbors(node).forEach(function (n) {
      if (!n || !n.to || n.to === 'flow' || ids[n.to] || seen[n.to] || !toolOf(n.to)) return;
      seen[n.to] = 1;
      var why = (n.linked_in_tools ? '자료실 연결 짝' : '겹치는 말');
      if (n.shared_keywords && n.shared_keywords.length) why += ' · ' + n.shared_keywords.slice(0, 2).join(' · ');
      out.push({ id: n.to, why: why, kind: 'pair' });
    });
    ORDER.forEach(function (id) {
      if (ids[id] || seen[id] || !toolOf(id)) return;
      if (stageOf(id) <= stageOf(node)) return;
      seen[id] = 1;
      out.push({ id: id, why: '이 뒤에 오는 현장 자료', kind: 'stage' });
    });
    return out.sort(function (a, b) { return tierOf(a.id) - tierOf(b.id); }).slice(0, 3);
  }

  /* 그 아래를 새로 이어 붙인다 — 상담 차례를 따라 현장 자료 두 칸 */
  function extend(steps, i, seq) {
    var ids = {}, out = [];
    steps.forEach(function (s) { ids[s.id] = 1; });
    var node = (steps[i] || {}).id;
    var at = stageOf(node);
    var order = ORDER.slice();
    order.forEach(function (id) {
      if (out.length >= 2 || ids[id] || !toolOf(id)) return;
      if (tierOf(id) > 1) return;
      if (stageOf(id) <= at) return;
      out.push({ id: id, hit: false, why: [] });
    });
    return out;
  }

  /* 문장으로 이어 붙이기 — 노드 뒤에 오는 갈래를 우선해 두 칸을 고른다 */
  function branchLive(steps, i, q) {
    if (!window.JCAssistSearch || !String(q || '').trim()) return [];
    var ids = {}, out = [];
    steps.forEach(function (s) { ids[s.id] = 1; });
    var at = stageOf((steps[i] || {}).id);
    var list = pool(q, studyAsked(q));
    list.forEach(function (x) {
      if (out.length >= 2 || ids[x.id]) return;
      if (x.tier === 3) return;
      if (stageOf(x.id) >= at) { ids[x.id] = 1; out.push({ id: x.id, hit: true, why: [x.why[0] || q] }); }
    });
    if (!out.length) {
      ORDER.forEach(function (id) {
        if (out.length >= 2 || ids[id] || !toolOf(id) || tierOf(id) > 1) return;
        if (stageOf(id) < at) return;
        ids[id] = 1;
        out.push({ id: id, hit: false, why: [] });
      });
    }
    return out;
  }

  /* 줄인 이름 — 근거 링크의 ?q= 로 넘길 때 */
  function shortQ(q, n) {
    var s = String(q || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ================================================================ 회색 타자 로테이션 */
  var SENT = [
    '실업급여 얼마 받는지 계산',
    '경력단절 내담자 첫 상담부터 제도·훈련·서류까지',
    '면접 압박 질문 대비',
    '국비훈련 자부담 계산',
    '중장년 전직 상담 순서 잡기',
    '청년 진로 미정 내담자 탐색',
    '임금체불 내담자 법령 근거 찾기',
    '이 회사 매출·직원 확인',
    '서류 탈락 이유 짚어 주기',
    '심리검사 결과 해석',
    '초기상담 질문지',
    '채용 사이트 골라 안내하기'
  ];

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* field 안의 .lv-ask · .lv-ph · .lv-caret 을 쓴다 */
  function typing(field, onValue) {
    if (!field) return null;
    var ask = field.querySelector('.lv-ask');
    var ph = field.querySelector('.lv-ph');
    var span = ph ? ph.querySelector('span') : null;
    var t = { i: 0, j: 0, dir: 'in', timer: 0, on: false };

    /* 입력이 길어지면 상자도 네 줄까지 따라 는다(그 위로는 안에서 스크롤) */
    function grow() {
      if (!ask) return;
      ask.style.height = 'auto';
      var h = ask.scrollHeight + 2;
      ask.style.height = Math.max(92, Math.min(h, 168)) + 'px';
    }

    function wanted() {
      if (!ask || !ph || !span) return false;
      if (String(ask.value || '').length) return false;
      if (document.hidden) return false;
      if (reduceMotion()) return false;
      var host = field.closest('[hidden]');
      if (host) return false;
      return !!(field.offsetParent || field.getClientRects().length);
    }
    function paint() {
      if (!ph) return;
      var hide = reduceMotion() || String((ask && ask.value) || '').length;
      ph.classList.toggle('off', hide);
    }
    function start() {
      paint();
      if (!wanted()) {
        if (reduceMotion() && span) span.textContent = SENT[0];
        return;
      }
      if (t.on) return;
      t.on = true;
      if (!span.textContent) { t.i = 0; t.j = 0; t.dir = 'in'; }
      t.timer = setTimeout(tick, 320);
    }
    function stop() {
      t.on = false;
      if (t.timer) clearTimeout(t.timer);
      t.timer = 0;
    }
    function tick() {
      if (!t.on) return;
      if (!wanted()) { stop(); if (ph) ph.classList.add('off'); return; }
      var s = SENT[t.i] || '';
      if (t.dir === 'in') {
        t.j++;
        span.textContent = s.slice(0, t.j);
        if (t.j >= s.length) { t.dir = 'hold'; t.timer = setTimeout(function () { t.dir = 'out'; tick(); }, 1500); return; }
        t.timer = setTimeout(tick, 58 + Math.random() * 34);
        return;
      }
      if (t.dir === 'out') {
        t.j -= (t.j > 4 && Math.random() < 0.28) ? 2 : 1;
        if (t.j < 0) t.j = 0;
        span.textContent = s.slice(0, t.j);
        if (t.j === 0) {
          t.i = (t.i + 1) % SENT.length;
          t.dir = 'in';
          t.timer = setTimeout(tick, 380);
          return;
        }
        t.timer = setTimeout(tick, 26 + Math.random() * 20);
      }
    }

    if (ask) {
      ask.addEventListener('input', function () {
        grow();
        if (onValue) onValue(ask.value);
        if (String(ask.value || '').length) { stop(); if (ph) ph.classList.add('off'); }
        else { t.i = 0; t.j = 0; t.dir = 'in'; setTimeout(start, 500); }
      });
      ask.addEventListener('focus', function () { grow(); stop(); if (ph) ph.classList.add('off'); });
      ask.addEventListener('blur', function () {
        if (!String(ask.value || '').length) { t.i = 0; t.j = 0; t.dir = 'in'; start(); }
      });
      grow();
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

    return { start: start, stop: stop, paint: paint };
  }

  /* ================================================================ 작은 도우미 */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  var ICO_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';
  var ICO_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>';
  var ICO_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICO_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  /* ================================================================ 튜토리얼 — 어두운 베일 + 한 곳만 밝게
     한 곳(요소)만 넘기면 그 자리 한 장, 배열로 넘기면 차례대로 짚는 안내가 된다. */
  function tutorial(target) {
    var list = Array.isArray(target) ? target.slice() : (target ? [{ el: target, title: '사용법', body: '' }] : []);
    if (!list.length) return;
    var old = document.querySelector('.tu');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var at = 0;
    var ov = el('div', 'tu on');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '마이덱 사용법');
    var spot = el('div', 'tu-spot');
    var cap = el('div', 'tu-cap');
    var kick = el('span', 'tu-step');
    var p = el('p');
    var acts = el('div', 'tu-acts');
    var prev = el('button', null, '이전');
    prev.type = 'button';
    var next = el('button', 'tu-go', '다음');
    next.type = 'button';
    var skip = el('button', 'tu-skip', '건너뛰기');
    skip.type = 'button';
    acts.appendChild(prev);
    acts.appendChild(next);
    acts.appendChild(skip);
    cap.appendChild(kick);
    cap.appendChild(p);
    cap.appendChild(acts);
    ov.appendChild(spot);
    ov.appendChild(cap);

    function nodeOf(s) {
      var n = s && s.el;
      if (typeof n === 'string') { try { n = document.querySelector(n); } catch (e) { n = null; } }
      return n || null;
    }
    function place() {
      var s = list[at] || {};
      var n = nodeOf(s);
      var r = null;
      if (n && (n.offsetParent || n.getClientRects().length)) r = n.getBoundingClientRect();
      if (!r || (r.width < 2 && r.height < 2)) {
        spot.style.opacity = '0';
        spot.style.width = '0px';
        spot.style.height = '0px';
        cap.style.top = '50%';
        cap.style.bottom = 'auto';
        cap.style.transform = 'translate(-50%,-50%)';
        return;
      }
      spot.style.opacity = '1';
      var pad = 8;
      var left = Math.max(6, Math.round(r.left - pad));
      var top = Math.max(6, Math.round(r.top - pad));
      var w = Math.min(window.innerWidth - left - 6, Math.round(r.width + pad * 2));
      var h = Math.min(window.innerHeight - top - 6, Math.round(r.height + pad * 2));
      spot.style.left = left + 'px';
      spot.style.top = top + 'px';
      spot.style.width = w + 'px';
      spot.style.height = h + 'px';
      var space = window.innerHeight - (top + h);
      cap.style.transform = 'translateX(-50%)';
      if (space > 210) { cap.style.top = (top + h + 16) + 'px'; cap.style.bottom = 'auto'; }
      else { cap.style.top = 'auto'; cap.style.bottom = Math.max(16, window.innerHeight - top + 16) + 'px'; }
    }
    function paint() {
      var s = list[at] || {};
      kick.textContent = '마이덱 사용법 ' + (at + 1) + ' / ' + list.length;
      clear(p);
      if (s.title) p.appendChild(el('b', null, s.title));
      if (s.body) p.appendChild(document.createTextNode((s.title ? ' ' : '') + s.body));
      prev.disabled = at === 0;
      next.textContent = at === list.length - 1 ? '알겠어요' : '다음';
      place();
      if (at === list.length - 1) { try { next.focus({ preventScroll: true }); } catch (e) {} }
    }
    function close() {
      ov.classList.remove('on');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 180);
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', place);
    }
    function esc(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && at < list.length - 1) { at++; paint(); }
      if (e.key === 'ArrowLeft' && at > 0) { at--; paint(); }
    }
    prev.addEventListener('click', function () { if (at > 0) { at--; paint(); } });
    next.addEventListener('click', function () { if (at < list.length - 1) { at++; paint(); } else close(); });
    skip.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', place);
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    paint();
    requestAnimationFrame(function () { ov.classList.add('on'); });
  }

  /* ================================================================ 덱 편집기
     추천 덱과 내 덱에 저장된 덱이 **같은 편집기**를 쓴다.
       · 단계 위로/아래로 — 44px 아이콘 단추, 양 끝에서는 잠긴다
       · 단계 사이 「+ 여기에 자료 넣기」 — 모든 자료를 분류·검색으로 골라 그 자리에 끼운다
       · 「교체」 — 그 자리만 다른 자료로 바꾼다
       · 「×」 — 그 단계를 뺀다(한 번 되돌릴 수 있다. 최소 한 단계는 남긴다)
     지키는 선: 저장은 부르는 쪽(opts.onSave)이 한다. 이 편집기는 모양과 순서만 다룬다. */
  function editor(host, deck, opts) {
    opts = opts || {};
    deck = deck || {};
    var MAX = ((window.JCDeck && window.JCDeck.MAX_STEPS) || 12);
    var S = {
      editing: opts.editing !== false && !!opts.editable,
      undo: null,
      pick: -1,
      pickMode: 'insert',
      pickCat: 'all',
      steps: (deck.steps || []).map(function (s) {
        return { id: String(s.id || ''), hit: !!s.hit, why: (s.why || []).slice(0, 3) };
      })
    };
    var meta = {
      id: String(deck.id || ''), name: String(deck.name || ''), where: String(deck.where || ''),
      tag: String(deck.tag || ''), title: String(deck.title || deck.name || ''),
      why: String(deck.why || ''), kind: String(deck.kind || '')
    };
    var box = el('article', 'lv-course');
    var api = {
      el: box,
      deck: function () {
        return {
          id: meta.id, name: meta.name, where: meta.where, tag: meta.tag,
          title: meta.title, why: meta.why, kind: meta.kind, steps: payload()
        };
      },
      steps: payload,
      setEditing: function (v) { S.editing = !!v; S.pick = -1; paint(); }
    };

    function payload() {
      return S.steps.map(function (s) {
        var sec = sector(s.id);
        return { id: s.id, no: sec.no, title: sec.title, badge: sec.badge, hit: s.hit, why: (s.why || []).slice(0, 2) };
      });
    }
    function changed() { if (opts.onChange) opts.onChange(api.deck()); }

    /* 옮기기·빼기로 줄을 다시 그리면 누른 단추가 사라져 초점이 문서 처음(BODY)으로 떨어졌다 — 같은 단계를 연달아
       두세 칸 옮기려면 매번 새 단추를 찾아야 했다(2026-11-23 C2-21 ② 손맛). 다시 그린 뒤 그 단계의 같은 단추로 초점을 잇는다.
       끝에 닿아 그 단추가 꺼졌으면 반대 방향 단추로. 스크롤은 건드리지 않는다(preventScroll). */
    function refocus(row, k) {
      var acts = document.querySelectorAll('.ac-row-act'), a = acts[row];
      if (!a) return;
      var bs = a.querySelectorAll('button'), b = bs[k];
      if (b && b.disabled) b = bs[k === 0 ? 1 : k === 1 ? 0 : k];
      if (b && !b.disabled) { try { b.focus({ preventScroll: true }); } catch (e) { } }
    }
    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= S.steps.length) return;
      var a = S.steps[i];
      S.steps[i] = S.steps[j];
      S.steps[j] = a;
      changed();
      paint();
      refocus(j, d < 0 ? 0 : 1);
    }
    function del(i) {
      if (S.steps.length <= 1) return;
      S.undo = S.steps.slice();
      S.steps = S.steps.slice(0, i).concat(S.steps.slice(i + 1));
      changed();
      paint();
      refocus(Math.min(i, S.steps.length - 1), 3);   /* 뺀 자리로 올라온 단계의 「빼기」 — 연달아 정리할 수 있게 */
    }
    function insertAt(after, id) {
      if (!toolOf(id) || hasId(S.steps, id)) return;
      if (S.steps.length >= MAX) return;
      var stp = { id: id, hit: true, why: ['직접 고름'] };
      var at = after + 1;
      S.steps = S.steps.slice(0, at).concat([stp]).concat(S.steps.slice(at));
      S.pick = -1;
      changed();
      paint();
    }
    function replaceAt(i, id) {
      if (!toolOf(id)) return;
      var dup = false;
      S.steps.forEach(function (s, k) { if (k !== i && s.id === id) dup = true; });
      if (dup) return;
      S.undo = S.steps.slice();
      S.steps[i] = { id: id, hit: true, why: ['직접 바꿈'] };
      S.pick = -1;
      changed();
      paint();
    }

    /* ---------- 자료 고르기 ---------- */
    function picker(after) {
      var isReplace = S.pickMode === 'replace';
      var box2 = el('div', 'ac-pick');
      var hd = el('div', 'ac-pick-hd');
      hd.appendChild(el('b', null, isReplace ? '이 단계를 다른 자료로' : '여기에 자료 넣기'));
      hd.appendChild(el('span', null, '자료 ' + tools().length + '가지 · 분류로 골라도 됩니다'));
      var x = el('button', 'ac-pick-x');
      x.type = 'button';
      x.setAttribute('aria-label', '자료 고르기 닫기');
      x.innerHTML = ICO_X;
      x.addEventListener('click', function () { S.pick = -1; paint(); });
      hd.appendChild(x);
      box2.appendChild(hd);

      var inp = document.createElement('input');
      inp.type = 'search';
      inp.className = 'ac-pick-q';
      inp.placeholder = '자료 이름·주제로 찾기';
      inp.setAttribute('aria-label', '자료 이름으로 찾기');
      box2.appendChild(inp);

      var cats = el('div', 'ac-pick-cats');
      cats.setAttribute('role', 'group');
      cats.setAttribute('aria-label', '자료 분류');
      [['all', '전체']].concat(GROUPS.map(function (g) { return [g.id, g.name]; })).forEach(function (c) {
        var b = el('button', null, c[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(S.pickCat === c[0]));
        b.addEventListener('click', function () {
          S.pickCat = c[0];
          Array.prototype.forEach.call(cats.children, function (o) { o.setAttribute('aria-pressed', String(o === b)); });
          paintList();
        });
        cats.appendChild(b);
      });
      box2.appendChild(cats);

      var note = el('p', 'ac-pick-note');
      box2.appendChild(note);
      var list = el('div', 'ac-pick-list');
      box2.appendChild(list);

      /* 이름에 걸린 자료를 먼저 — 설명글에 스친 자료가 위로 올라오지 않게 */
      function scoreRow(t, q) {
        if (!q) return 1;
        var ti = norm(t.title), ba = norm(t.badge), sh = norm(t.short), gi = norm(t.gi);
        var tg = norm((t.tags || []).join(' ')), de = norm(t.desc);
        if (ti === q) return 100;
        if (ti.indexOf(q) === 0) return 90;
        if (ti.indexOf(q) >= 0) return 80;
        if (ba.indexOf(q) >= 0 || sh.indexOf(q) >= 0) return 60;
        if (tg.indexOf(q) >= 0) return 40;
        if (gi.indexOf(q) >= 0) return 30;
        if (de.indexOf(q) >= 0) return 10;
        return 0;
      }
      function paintList() {
        clear(list);
        var q = norm(inp.value);
        var rows = tools().map(function (t) {
          if (!t || !t.id || t.id === 'flow') return null;
          if (S.pickCat !== 'all' && groupOf(t.id) !== S.pickCat) return null;
          var sc = scoreRow(t, q);
          if (!sc) return null;
          return { t: t, sc: sc };
        }).filter(Boolean).sort(function (a, b) {
          return b.sc - a.sc || tierOf(a.t.id) - tierOf(b.t.id) || String(a.t.no || '').localeCompare(String(b.t.no || ''));
        }).map(function (x) { return x.t; });
        var study = S.pickCat === 'study' || rows.some(function (t) { return tierOf(t.id) === 3; });
        note.textContent = study ? '학습·연구용 자료입니다 — 현장 추천에는 넣지 않지만 직접 고를 수 있습니다.' : '';
        note.hidden = !study;
        if (!rows.length) {
          list.appendChild(el('p', 'ac-pick-empty', '이 말에 맞는 자료가 없습니다. 다른 말로 찾아보세요.'));
          return;
        }
        rows.forEach(function (t) {
          var already = hasId(S.steps, t.id) && !(isReplace && S.steps[after] && S.steps[after].id === t.id);
          var b = el('button', 'ac-pick-b');
          b.type = 'button';
          b.setAttribute('aria-label', t.title + (already ? ' — 이미 덱에 있음' : (isReplace ? ' 으로 바꾸기' : ' 넣기')));
          var tx = el('span', 'ac-pick-t');
          tx.appendChild(el('b', null, t.title || t.id));
          var sub = [];
          if (t.badge) sub.push(t.badge);
          sub.push(tierName(t.id));
          tx.appendChild(el('em', null, sub.join(' · ')));
          b.appendChild(tx);
          b.appendChild(el('span', 'ac-pick-add', already ? '이미 있음' : (isReplace ? '바꾸기' : '넣기')));
          if (already) b.disabled = true;
          else b.addEventListener('click', function () {
            if (isReplace) replaceAt(after, t.id);
            else insertAt(after, t.id);
          });
          list.appendChild(b);
        });
      }
      inp.addEventListener('input', paintList);
      paintList();
      return box2;
    }

    /* ---------- 그리기 ---------- */
    function paint() {
      clear(box);
      box.classList.toggle('edit', S.editing);

      var top = el('div', 'lv-c-top');
      if (meta.tag) top.appendChild(el('span', 'lv-c-tag', meta.tag));
      if (opts.editable !== false) {
        var ed = el('button', 'ac-edit', S.editing ? '편집 끝' : '단계 편집');
        ed.type = 'button';
        ed.setAttribute('aria-pressed', String(S.editing));
        ed.addEventListener('click', function () { S.editing = !S.editing; S.pick = -1; paint(); });
        top.appendChild(ed);
      }
      top.appendChild(el('span', 'lv-c-n', S.steps.length + '단계'));
      box.appendChild(top);

      if (meta.title && !opts.hideTitle) box.appendChild(el('h3', null, meta.title));
      if (meta.why) box.appendChild(el('p', 'lv-c-why', meta.why));

      var ol = el('ol', 'lv-c-steps');
      S.steps.forEach(function (s, i) {
        var sec = sector(s.id);
        var li = el('li', 'ac-row');
        var main = el('div', 'ac-main');
        main.appendChild(el('span', 'ac-n', String(i + 1)));
        var tx = el('span', 'ac-t');
        tx.appendChild(el('b', null, sec.title));
        var sub = '';
        if (s.why && s.why.length) sub = '「' + s.why[0] + '」에서 걸림';
        else if (s.hit) sub = '질문에서 걸림';
        if (sub) tx.appendChild(el('em', null, sub));
        main.appendChild(tx);
        li.appendChild(main);

        if (S.editing) {
          var act = el('div', 'ac-row-act');
          var up = el('button', 'ac-ico');
          up.type = 'button'; up.innerHTML = ICO_UP;
          up.setAttribute('aria-label', (i + 1) + '단계 ' + sec.title + ' 위로 옮기기');
          up.disabled = i === 0;
          up.addEventListener('click', function () { move(i, -1); });
          var down = el('button', 'ac-ico');
          down.type = 'button'; down.innerHTML = ICO_DOWN;
          down.setAttribute('aria-label', (i + 1) + '단계 ' + sec.title + ' 아래로 옮기기');
          down.disabled = i === S.steps.length - 1;
          down.addEventListener('click', function () { move(i, 1); });
          var rep = el('button', 'ac-mini', '교체');
          rep.type = 'button';
          rep.setAttribute('aria-label', (i + 1) + '단계 ' + sec.title + ' 을(를) 다른 자료로 바꾸기');
          rep.setAttribute('aria-pressed', String(S.pick === i && S.pickMode === 'replace'));
          rep.addEventListener('click', function () {
            if (S.pick === i && S.pickMode === 'replace') { S.pick = -1; paint(); return; }
            S.pick = i; S.pickMode = 'replace'; paint();
          });
          var delb = el('button', 'ac-ico del');
          delb.type = 'button'; delb.innerHTML = ICO_X;
          delb.setAttribute('aria-label', (i + 1) + '단계 ' + sec.title + ' 빼기');
          if (S.steps.length <= 1) delb.disabled = true;
          delb.addEventListener('click', function () { del(i); });
          act.appendChild(up); act.appendChild(down); act.appendChild(rep); act.appendChild(delb);
          li.appendChild(act);
        }
        ol.appendChild(li);

        if (S.editing && S.pick === i && S.pickMode === 'replace') {
          var wrapR = el('li', 'ac-pick-row');
          wrapR.appendChild(picker(i));
          ol.appendChild(wrapR);
        }
        if (S.editing) {
          var ins = el('li', 'ac-ins');
          var ib = el('button', 'ac-ins-b');
          ib.type = 'button';
          ib.setAttribute('aria-label', (i + 1) + '단계 뒤에 자료 넣기');
          ib.innerHTML = ICO_PLUS + '<span>여기에 자료 넣기</span>';
          var full = S.steps.length >= MAX;
          if (full) {
            ib.disabled = true;
            ib.setAttribute('aria-label', '덱은 ' + MAX + '단계까지입니다');
            clear(ib);
            ib.appendChild(el('span', null, MAX + '단계까지 — 더 넣으려면 하나를 빼세요'));
          } else {
            ib.addEventListener('click', function () {
              if (S.pick === i && S.pickMode === 'insert') { S.pick = -1; paint(); return; }
              S.pick = i; S.pickMode = 'insert'; paint();
            });
          }
          ins.appendChild(ib);
          ol.appendChild(ins);
          if (S.pick === i && S.pickMode === 'insert') {
            var wrapI = el('li', 'ac-pick-row');
            wrapI.appendChild(picker(i));
            ol.appendChild(wrapI);
          }
        }
      });
      box.appendChild(ol);

      if (S.steps.length === 1) {
        box.appendChild(el('p', 'ac-hint', S.editing
          ? '지금은 한 단계입니다. 「+ 여기에 자료 넣기」로 다른 자료를 이어 붙이세요.'
          : '자료 1개로 끝나는 질문입니다. 「단계 편집」으로 다른 자료를 이어 붙일 수 있어요.'));
      }

      if (S.undo && S.undo.length) {
        var u = el('div', 'ac-undo');
        u.appendChild(el('span', null, '단계를 바꿨습니다.'));
        var ub = el('button', null, '되돌리기');
        ub.type = 'button';
        ub.addEventListener('click', function () {
          S.steps = S.undo.slice();
          S.undo = null;
          changed();
          paint();
        });
        u.appendChild(ub);
        box.appendChild(u);
      }

      var foot = el('div', 'lv-c-foot');
      if (opts.saveLabel) {
        var sv = el('button', 'lv-c-go', opts.saveLabel);
        sv.type = 'button';
        sv.addEventListener('click', function () {
          if (opts.onSave) opts.onSave(api.deck(), sv);
        });
        foot.appendChild(sv);
      }
      if (opts.runLabel) {
        var run = el('button', 'ac-run', opts.runLabel);
        run.type = 'button';
        run.addEventListener('click', function () { if (opts.onRun) opts.onRun(api.deck(), run); });
        foot.appendChild(run);
      }
      if (foot.childNodes.length) box.appendChild(foot);
    }

    paint();
    if (host) { clear(host); host.appendChild(box); }
    return api;
  }

  /* 추천 덱 묶음 — 부르는 쪽은 {label, onPick, onRun}만 넘긴다 */
  function cards(host, list, opts) {
    opts = opts || {};
    clear(host);
    (list || []).forEach(function (c) {
      var e = editor(null, c, {
        editable: true, editing: false,
        saveLabel: opts.label || '내 덱에 저장',
        onSave: function (d, btn) { if (opts.onPick) opts.onPick(d, btn); },
        runLabel: opts.runLabel,
        onRun: function (d, btn) { if (opts.onRun) opts.onRun(d, btn); }
      });
      host.appendChild(e.el);
    });
  }

  window.JCAssemble = {
    load: load,
    graph: function () { return st.graph; },
    weights: weights,
    mlc: mlcDoc,
    MLC_SCHEMA: MLC_SCHEMA,
    MLC_FEEDBACK: MLC_FEEDBACK,
    sector: sector,
    toolOf: toolOf,
    plan: plan,
    courses: courses,
    branches: branches,
    branchLive: branchLive,
    extend: extend,
    cards: cards,
    editor: editor,
    typing: typing,
    tutorial: tutorial,
    shortQ: shortQ,
    tierOf: tierOf,
    tierName: tierName,
    groupOf: groupOf,
    groups: GROUPS,
    stageOf: stageOf,
    SENT: SENT,
    SUGGEST: [
      '실업급여 얼마 받는지 계산',
      '면접 압박 질문 대비',
      '국비훈련 자부담 계산',
      '초기상담 질문지',
      '경력단절 내담자 첫 상담부터 제도·훈련·서류까지',
      '청년 진로 미정 내담자 탐색',
      '임금체불 내담자 법령 근거 찾기',
      '이 회사 매출·직원 확인',
      '중장년 전직 상담 순서 잡기',
      '서류 탈락 이유 짚어 주기',
      '심리검사 결과 해석',
      '채용 사이트 골라 안내하기'
    ],
    CHIPS: ['경력단절여성', '국민취업지원제도', '실업급여', '직무분석', '자격증', '훈련', '면접', '기업', '청년', '중장년', '상담', '이직', '신산업', '직업상담사'],
    CAT_OF: CAT_OF,
    CATS: CATS
  };
})();
