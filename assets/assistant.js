/* assistant.js — 자료실 비서 (모든 지면 공통 위젯)
 *
 * 세 화면
 *   1) 대화 — 로그인 + 내 AI 키가 있으면, 자료실 근거와 「지금 열려 있는 자료」로 설명해 준다.
 *      실무 모드 4종(쉬운 3줄 · 모의면접·서류 · 교차 비교 · 오프닝 질문)과 웹 교차 확인(Gemini).
 *   2) 찾기 — 로그인·키가 없어도 늘 켜져 있다. 자료실 통합 검색(assistant/search.js).
 *   3) 내 키 — Gemini(1순위)·OpenRouter·Groq·DeepSeek·OpenAI 호환 주소.
 *
 * 지키는 것
 *   - 대화는 **본인만** 본다. 로그아웃 상태에서는 이 브라우저(localStorage)에만 남고,
 *     로그인 상태에서는 내 계정의 「내 대화 기록함」(jc_assistant_threads·jc_assistant_messages)에 쌓인다.
 *     기록함은 RLS 로 잠겨 있어 남의 계정에서는 열리지 않고, 사용자가 직접 고치고 지울 수 있다.
 *   - 「묻기」를 누르면 기다리는 동안 지금 무엇을 하는지 네 단계(검색 → 정리 → 추론 → 작성)로 알린다.
 *     단계는 서버가 SSE stage 이벤트(추론)와 첫 글자(작성)로 알려 주고, 나머지는 화면에서 잰다.
 *   - 키는 서버에서만 풀린다. 브라우저에는 끝 4자리만 보인다.
 *   - 답변은 텍스트로만 그린다(innerHTML 로 넣지 않는다).
 */
(function () {
  'use strict';
  if (window.JCAssistant) return;

  /* ---------- 이 스크립트의 위치로 경로를 잡는다(대문·섹터 어디에 붙여도 동작) ---------- */
  var me = document.currentScript;
  if (!me) {
    var all = document.querySelectorAll('script[src*="assistant.js"]');
    me = all[all.length - 1];
  }
  var BASE = '';
  try {
    var src = me && me.src ? me.src : '';
    BASE = src ? src.replace(/assets\/assistant\.js.*$/, '') : new URL('./', location.href).href;
  } catch (e) { BASE = './'; }

  var API = (function () {
    var c = window.JC_ASSIST_CONFIG || {};
    if (c.url) return c.url;
    var s = window.JC_SYNC_CONFIG;
    if (s && s.url) return String(s.url).replace(/\/+$/, '') + '/functions/v1/assistant-proxy';
    return 'https://vzxwdfswlolhcluljkgi.supabase.co/functions/v1/assistant-proxy';
  })();

  var CHAT_KEY = 'jc-assist-chat-v1';       // 지금 대화의 사본(이 브라우저에만 · 새로고침·오프라인 대비)
  var HIST_KEY = 'jc-assist-threads-v1';    // 로그아웃 상태의 대화 목록(이 브라우저에만)
  var IMPORT_KEY = 'jc-assist-import-v1';   // 계정으로 옮기기 안내를 그만 물을지
  var PREF_KEY = 'jc-assist-pref-v1';       // 토글 상태
  var RECENT_KEY = 'jc-assist-recent-v1';   // 최근 본 자료(이 브라우저에만, 제안용)

  /* ---------- 스타일 ---------- */
  if (!document.querySelector('link[data-jca-css]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = BASE + 'assets/assistant.css';
    link.setAttribute('data-jca-css', '');
    document.head.appendChild(link);
  }

  /* ---------- 검색 엔진 ---------- */
  window.JCA_BASE = BASE;
  var searchLoading = null;
  function withSearch(fn) {
    if (window.JCAssistSearch) return fn();
    if (searchLoading) { searchLoading.push(fn); return null; }
    searchLoading = [fn];
    var sc = document.createElement('script');
    sc.src = BASE + 'assistant/search.js';
    sc.onload = function () {
      var q = searchLoading || []; searchLoading = null;
      q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    sc.onerror = function () { searchLoading = null; };
    document.head.appendChild(sc);
    return null;
  }

  /* 보내기 전 거르개 둘 — 네트워크 0. 아직 못 불러왔으면 그냥 보낸다(서버가 같은 파일로 다시 거르는 최종 관문이다).
     · assistant/guard.js  프롬프트 주입·탈옥(지침 무시·지침 빼내기·제한 없는 모드) → 먼저 본다
     · assistant/scope.js  자료실과 관계없는 요청(코드·주가·날씨 …) */
  var gateLoading = {};
  function loadGate(name, glob) {
    if (window[glob] || gateLoading[name]) return;
    gateLoading[name] = true;
    var sc = document.createElement('script');
    sc.src = BASE + 'assistant/' + name;
    sc.onerror = function () { gateLoading[name] = false; };
    document.head.appendChild(sc);
  }
  function loadScope() {
    loadGate('guard.js', 'JCAssistGuard');
    loadGate('scope.js', 'JCAssistScope');
    loadGate('rewrite.js', 'JCAssistRewrite');
    loadChunks();
  }
  /* AUP-3 근거 조각(assistant/chunks.js + assistant/data/chunks.json, 약 44KB) — 대화 탭이 열릴 때 한 번 받는다.
     못 받으면 예전처럼 검색 결과만 근거로 보낸다. */
  var chunksLoading = false;
  function loadChunks() {
    if (chunksLoading || (window.JCAssistChunks && window.JCAssistChunks.ready())) return;
    chunksLoading = true;
    var sc = document.createElement('script');
    sc.src = BASE + 'assistant/chunks.js';
    sc.onload = function () {
      fetch(BASE + 'assistant/data/chunks.json', { cache: 'default' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && window.JCAssistChunks) window.JCAssistChunks.use(j); })
        .catch(function () { chunksLoading = false; });
      /* AUP-7 뜻 벡터(63KB) — 조각과 같은 때 받아 둔다. 못 받아도 검색은 그대로 돈다. */
      if (window.JCAssistSearch && window.JCAssistSearch.loadVectors) {
        try { window.JCAssistSearch.loadVectors(); } catch (e) {}
      }
    };
    sc.onerror = function () { chunksLoading = false; };
    document.head.appendChild(sc);
  }
  /* { kind:'guard'|'off', message } 또는 null */
  function scopeOf(q) {
    try {
      var g = window.JCAssistGuard ? window.JCAssistGuard.check(q) : null;
      if (g && g.verdict === 'attack') return { kind: 'guard', message: window.JCAssistGuard.message };
      var sv = window.JCAssistScope ? window.JCAssistScope.check(q) : null;
      if (sv && sv.verdict === 'off') return { kind: 'off', message: sv.message };
    } catch (e) {}
    return null;
  }

  /* ---------- 상태 ---------- */
  /* 키는 Google Gemini 하나만 쓴다 — 외부 임의 주소 호출이 없어 안전하고, 웹 교차 확인을 모두가 쓸 수 있다. */
  var PROVIDER = { id: 'gemini', name: 'Google Gemini' };
  var KEY_PAGE = 'https://aistudio.google.com/apikey';
  /* 무료 키 발급 4단계 — 도해는 우리가 직접 그린 SVG(외부 화면 캡처 아님). */
  var GUIDE_STEPS = [
    { img: 'gemini-key-1.svg', title: 'Google AI Studio 열기',
      desc: '아래 링크를 새 탭으로 열고 Google 계정으로 로그인하세요. 따로 가입비나 결제 정보가 필요 없어요.',
      link: true },
    { img: 'gemini-key-2.svg', title: '「Create API key」 누르기',
      desc: '오른쪽 위의 「Create API key」(API 키 만들기) 단추를 누르세요. 화면에 따라 왼쪽 「API keys」 메뉴 안에 있을 수 있어요.' },
    { img: 'gemini-key-3.svg', title: '프로젝트 고르고 「키 생성」',
      desc: '새 프로젝트를 고르면 됩니다. 이미 쓰는 프로젝트가 있으면 그대로 골라도 괜찮아요.' },
    { img: 'gemini-key-4.svg', title: '복사해서 붙여 넣기',
      desc: 'AIza… 로 시작하는 키를 복사해 아래 칸에 붙여 넣고 「키 등록」을 누르면 끝이에요. 키는 만든 직후에만 다시 볼 수 있어요.' }
  ];
  var CHIPS = ['수습인데 잘렸어요', '실업급여', 'ㅂㄷㅊ', '공기업', '면접 질문', '뜨는 직업'];
  var MODES = [
    { id: 'easy3', label: '쉬운 3줄', ph: '내담자에게 그대로 읽어 줄 3줄로 정리해 주세요. 상황: ',
      tip: '내담자 눈높이로 세 줄' },
    { id: 'mock', label: '모의면접·서류', ph: '비식별 모의면접과 서류 피드백을 주세요. 지원 직무: ',
      tip: '이름 없이 면접·서류 연습' },
    { id: 'compare', label: '교차 비교', ph: '두 대상을 같은 축으로 비교해 주세요: ',
      tip: '산업·기업·직무를 나란히' },
    { id: 'opening', label: '오프닝 질문', ph: '상담 첫 10분에 쓸 오프닝 질문지를 만들어 주세요. 상황: ',
      tip: '첫 10분 질문 5개' }
  ];

  /* 기다리는 동안의 네 단계 — ① 은 화면이 자료실을 찾는 시간, ② 는 근거를 정리해 보내는 시간,
     ③ 은 모델이 답을 만드는 시간(서버 stage 이벤트), ④ 는 글자가 흐르는 시간(첫 delta). */
  var STAGES = [
    { id: 'search', label: '검색', line: '자료실에서 근거를 찾고 있어요' },
    { id: 'collect', label: '정리', line: '근거를 정리해 요청을 보내고 있어요' },
    { id: 'think', label: '추론', line: 'AI가 답을 생각하고 있어요' },
    { id: 'write', label: '작성', line: '답변을 쓰고 있어요' }
  ];
  function stageIndex(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i;
    return -1;
  }

  var st = {
    open: false, tab: '', q: '', results: [], searched: false, lastQ: '',
    busy: false, keys: [], keysLoaded: false,
    provider: 'gemini', msg: '', msgKind: '',
    thread: [], waitTurn: '',
    threadId: '', threadKey: '', threadTitle: '', localThreads: [], threads: [], threadsLoaded: false, threadsErr: '',
    histOpen: false, histBusy: false, renaming: '', renameVal: '', importAsk: false,
    stage: '', askStart: 0,
    ktest: null, autoOpen: false, webOn: false, suggestOn: true, welcome: true, mode: '', step: 0, guideOpen: true,
    recent: [], sug: null
  };
  /* 화면 대화방 열쇠 → 서버 uuid. 첫 저장이 방을 만들기 전에 둘이 겹쳐 저장돼도 방이 하나만 생기게. */
  var ID_MAP = {};
  var el = {};
  var lastFocus = null;

  function t(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  /* 도해 넘김 화살표 — 글꼴 글리프(‹ ›)는 글꼴마다 자리가 달라 상자 가운데에서 흔들린다.
     선으로 그린 SVG 를 넣어 어떤 글꼴에서도 44×44 상자 한가운데에 오게 한다. */
  function chev(dir) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', dir === 'prev' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  /* ---------- 로그인 ---------- */
  function sess() {
    try {
      var v = localStorage.getItem('jc-sync-session');
      var o = v ? JSON.parse(v) : null;
      return o && o.token ? o : null;
    } catch (e) { return null; }
  }
  function loggedIn() { return !!sess(); }
  function hasKey() { return st.keys.length > 0; }

  /* ---------- 대화 보관함 (로그아웃 = 이 브라우저 / 로그인 = 내 계정 기록함) ---------- */

  var HIST_TURNS_MAX = 30;      // 한 대화방에 남기는 주고받음 수(서버도 40에서 자른다)

  /* 저장·불러오기에 쓰는 모양으로 다듬는다 — 남는 것은 질문·답·근거·모드뿐이다. */
  function normTurn(x) {
    if (!x || typeof x !== 'object' || !String(x.q || '').trim()) return null;
    return {
      id: String(x.id || '') || newId(),
      q: String(x.q).slice(0, 1200),
      a: String(x.a || '').slice(0, 4000),
      refs: Array.isArray(x.refs) ? x.refs.slice(0, 3) : [],
      web: Array.isArray(x.web) ? x.web.slice(0, 5) : [],
      mode: String(x.mode || ''),
      websearch: !!x.websearch,
      scope: (x.scope === 'off' || x.scope === 'guard') ? x.scope : '',
      err: !!x.err
    };
  }
  function normTurns(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      var v = normTurn(x);
      if (v) out.push(v);
    });
    return out.slice(-HIST_TURNS_MAX);
  }
  function plainTurn(x) {
    return { id: x.id, q: x.q, a: x.a || '', refs: x.refs || [], web: x.web || [],
             mode: x.mode || '', websearch: !!x.websearch, err: !!x.err };
  }
  function makeKey() { return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function titleOf(turns) {
    return short((turns && turns[0] ? turns[0].q : '') || '', 34) || '새 대화';
  }

  /* 로그아웃 상태의 대화 목록 — 이 브라우저에만 */
  function localLoad() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(HIST_KEY) || 'null'); } catch (e) { raw = null; }
    var list = [];
    if (raw && Array.isArray(raw.list)) {
      raw.list.forEach(function (x) {
        if (!x || typeof x !== 'object') return;
        var turns = normTurns(x.turns);
        if (!turns.length) return;
        list.push({
          id: String(x.id || makeKey()),
          title: String(x.title || titleOf(turns)).slice(0, 80),
          updated: Number(x.updated || 0) || Date.now(),
          turns: turns
        });
      });
    } else {
      /* 예전의 한 줄짜리 대화(chat-v1)를 첫 대화방으로 옮긴다. */
      var old = null;
      try { old = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}'); } catch (e) { old = null; }
      var t0 = old && Array.isArray(old.turns) ? normTurns(old.turns) : [];
      if (t0.length) list.push({ id: makeKey(), title: '이전 대화', updated: Date.now(), turns: t0 });
    }
    list.sort(function (a, b) { return b.updated - a.updated; });
    st.localThreads = list.slice(0, 30);
    localSaveList();
  }
  function localSaveList() {
    try {
      var s = JSON.stringify({ v: 1, list: st.localThreads.slice(0, 30) });
      if (s.length > 300000) st.localThreads = st.localThreads.slice(0, 8);
      localStorage.setItem(HIST_KEY, JSON.stringify({ v: 1, list: st.localThreads.slice(0, 30) }));
    } catch (e) {}
  }
  function localFind(id) {
    for (var i = 0; i < st.localThreads.length; i++) if (st.localThreads[i].id === id) return i;
    return -1;
  }

  function loadLocal() {
    /* 지금 대화의 사본 — 새로고침해도 보던 대화와 그 대화방 열쇠가 함께 돌아온다 */
    try {
      var o = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}');
      if (o && Array.isArray(o.turns)) {
        var who = loggedIn() ? (sess().username || 'user') : '';
        var same = (o.u || '') === who;
        if (same) {
          st.thread = normTurns(o.turns);
          st.threadTitle = String(o.title || '');
          var key = String(o.key || '');
          if (key && /^(s|l|k):/.test(key)) {
            st.threadKey = key;
            if (key.indexOf('s:') === 0) { st.threadId = key.slice(2); ID_MAP[key] = st.threadId; }
          }
        } else {
          try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
        }
      }
    } catch (e) {}
    localLoad();
    /* 사본에서 이어 오지 못했으면, 로그아웃 상태에서는 가장 최근 대화를 보여 준다 */
    if (!loggedIn() && !st.threadKey && st.localThreads.length) {
      st.threadKey = 'l:' + st.localThreads[0].id;
      st.thread = st.localThreads[0].turns.slice();
      st.threadTitle = st.localThreads[0].title;
    }
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof p.autoOpen === 'boolean') st.autoOpen = p.autoOpen;
      if (typeof p.webOn === 'boolean') st.webOn = p.webOn;
      if (typeof p.suggestOn === 'boolean') st.suggestOn = p.suggestOn;
      if (typeof p.welcome === 'boolean') st.welcome = p.welcome;
      if (p.provider) st.provider = p.provider;
      if (p.mode) st.mode = p.mode;
      if (p.lastQ) st.lastQ = p.lastQ;
    } catch (e) {}
    try {
      var r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (Array.isArray(r)) st.recent = r.slice(-8);
    } catch (e) {}
  }

  /* 지금 대화를 저장한다 — 로그아웃이면 이 브라우저 목록에, 로그인이면 내 계정 기록함에. */
  function saveChat() {
    st.thread = st.thread.slice(-HIST_TURNS_MAX);
    st.thread.forEach(function (x) { x.id = x.id || newId(); });
    if (st.thread.length && !st.threadTitle) st.threadTitle = titleOf(st.thread);
    try {
      var s = JSON.stringify({ v: 2, key: st.threadKey, title: st.threadTitle, u: loggedIn() ? (sess().username || 'user') : '', turns: st.thread });
      if (s.length > 220000) st.thread = st.thread.slice(-12);
      localStorage.setItem(CHAT_KEY, JSON.stringify({ v: 2, key: st.threadKey, title: st.threadTitle, u: loggedIn() ? (sess().username || 'user') : '', turns: st.thread }));
    } catch (e) {}
    if (!st.thread.length) return;

    if (!loggedIn()) {
      if (!st.threadKey) st.threadKey = 'l:' + makeKey();
      var id = st.threadKey.replace(/^l:/, '');
      var at = localFind(id);
      var rec = {
        id: id,
        title: (at >= 0 && st.localThreads[at].title) || st.threadTitle || titleOf(st.thread),
        updated: Date.now(),
        turns: st.thread.slice()
      };
      st.threadTitle = rec.title;
      if (at >= 0) st.localThreads[at] = rec;
      else st.localThreads.unshift(rec);
      st.localThreads.sort(function (a, b) { return b.updated - a.updated; });
      st.localThreads = st.localThreads.slice(0, 30);
      localSaveList();
      st.threadsLoaded = true;
      return;
    }
    scheduleSave();
  }

  /* 계정 저장은 조금 모아서 보낸다(답 한 번에 한 번, 제목 고침과 겹치지 않게). */
  var saveTimer = null, saveChain = Promise.resolve();
  function scheduleSave() {
    if (!loggedIn()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!loggedIn() || !st.thread.length) return saveChain;
    if (!st.threadKey) st.threadKey = 'k:' + makeKey();
    var key = st.threadKey;
    var turns = st.thread.slice().map(plainTurn);
    var title = st.threadTitle || titleOf(st.thread);
    saveChain = saveChain.then(function () {
      return call('history_save', { thread_id: ID_MAP[key] || '', title: title, turns: turns })
        .then(function (j) {
          if (!j || !j.thread_id) return;
          var fresh = !ID_MAP[key];
          ID_MAP[key] = j.thread_id;
          var current = st.threadKey === key;      // 그사이 다른 대화로 넘어갔을 수 있다
          if (current) st.threadId = j.thread_id;
          /* 방이 새로 만들어졌으면 열쇠를 서버 것(s:uuid)으로 바꾼다 —
             그래야 새로고침 사본에 서버 열쇠가 적혀 다음에 같은 방으로 이어진다. */
          if (fresh && st.threadKey === key) {
            st.threadKey = 's:' + j.thread_id;
            ID_MAP[st.threadKey] = j.thread_id;
            try {
              localStorage.setItem(CHAT_KEY, JSON.stringify({ v: 2, key: st.threadKey, title: st.threadTitle,
                u: loggedIn() ? (sess().username || 'user') : '', turns: st.thread }));
            } catch (e) {}
          }
          if (fresh && current) {
            st.threadTitle = j.title || title;
            st.threads.unshift({ id: j.thread_id, title: st.threadTitle, turns: j.turns || turns.length, updated: new Date().toISOString() });
          } else if (fresh) {
            st.threads.unshift({ id: j.thread_id, title: j.title || title, turns: j.turns || turns.length, updated: new Date().toISOString() });
          } else {
            for (var i = 0; i < st.threads.length; i++) {
              if (st.threads[i].id === j.thread_id) {
                st.threads[i].turns = j.turns || turns.length;
                st.threads[i].updated = new Date().toISOString();
              }
            }
          }
          st.threadsErr = '';
        });
    })['catch'](function (e) {
      st.threadsErr = e && e.error === 'session'
        ? '로그인이 풀려 대화를 계정에 저장하지 못했어요.'
        : '대화를 계정에 저장하지 못했어요. 이 브라우저에는 남아 있어요.';
    });
    return saveChain;
  }
  function savePref() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        autoOpen: st.autoOpen, webOn: st.webOn,
        suggestOn: st.suggestOn, welcome: st.welcome, provider: st.provider, mode: st.mode,
        lastQ: st.lastQ
      }));
    } catch (e) {}
  }
  function recordPage() {
    var title = (document.title || '').slice(0, 80);
    var path = location.pathname + location.search;
    if (st.recent.length && st.recent[st.recent.length - 1].path === path) return;
    st.recent.push({ path: path, title: title, ts: Date.now() });
    st.recent = st.recent.slice(-8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(st.recent)); } catch (e) {}
  }

  /* ---------- 서버 호출 ---------- */
  function call(action, extra) {
    var s = sess();
    if (!s) return Promise.reject({ error: 'session' });
    var body = { action: action, session_token: s.token };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) throw j && j.error ? j : { error: 'server' };
        return j;
      });
    });
  }

  var ERR = {
    session: '로그인이 풀렸어요. 다시 로그인해 주세요.',
    no_key: '등록된 키가 없어요. 「내 키」에서 먼저 등록해 주세요.',
    bad_key: '키가 거부되었어요. 키를 다시 확인해 주세요.',
    bad_base_url: '주소는 https 공개 주소만 쓸 수 있어요(사설망·IP 주소는 막습니다).',
    quota: '제공자의 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요.',
    rate: '잠깐 쉬어 가요. 1분에 12번까지 여쭤볼 수 있어요.',
    upstream: 'AI 서비스에 닿지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    server: '서버에서 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    bad_request: '요청을 확인해 주세요.'
  };
  function errText(e) {
    var c = (e && e.error) || 'server';
    return (e && e.message && (c === 'bad_key' || c === 'bad_base_url' || c === 'rate' || c === 'quota')) ? e.message : (ERR[c] || ERR.server);
  }

  /* ---------- 대화 목록 (로그인 = 내 계정 / 로그아웃 = 이 브라우저) ---------- */

  function importState() {
    try { return localStorage.getItem(IMPORT_KEY) || ''; } catch (e) { return ''; }
  }
  function setImportState(v) {
    try { localStorage.setItem(IMPORT_KEY, v); } catch (e) {}
  }

  function listThreads() {
    if (!loggedIn()) {
      return Promise.resolve(st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      }));
    }
    return call('history_list').then(function (j) { return j.threads || []; });
  }

  /* 목록만 다시 읽는다(지금 보는 대화는 그대로 둔다). */
  function refreshThreads() {
    if (st.histBusy) return;
    st.histBusy = true;
    listThreads().then(function (list) {
      st.threads = list;
      st.threadsLoaded = true;
      st.threadsErr = '';
      st.histBusy = false;
      render();
    })['catch'](function (e) {
      st.threadsLoaded = true;
      st.histBusy = false;
      st.threadsErr = e && e.error === 'session'
        ? '로그인이 풀려 대화 목록을 불러오지 못했어요.'
        : '대화 목록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
      render();
    });
  }

  /* 로그인 상태에서 처음 한 번 — 목록을 받고, 보고 있는 대화가 없으면 가장 최근 것을 연다. */
  function ensureHistory() {
    if (!loggedIn()) {
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      st.threadsLoaded = true;
      return;
    }
    if (st.threadsLoaded || st.histBusy) return;
    st.histBusy = true;
    listThreads().then(function (list) {
      st.threads = list;
      st.threadsLoaded = true;
      st.threadsErr = '';
      st.histBusy = false;
      /* 이 브라우저에만 있던 대화가 있으면 한 번 물어본다(저절로 올리지 않는다). */
      st.importAsk = !list.length && st.localThreads.length > 0 && importState() === '';
      if (!st.thread.length && list.length) openThread(list[0].id);
      else render();
    })['catch'](function (e) {
      st.threadsLoaded = true;
      st.histBusy = false;
      st.threadsErr = e && e.error === 'session'
        ? '로그인이 풀려 대화 목록을 불러오지 못했어요.'
        : '대화 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.';
      render();
    });
  }

  function findThread(id) {
    for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === id) return st.threads[i];
    return null;
  }

  /* 대화방 하나를 연다 — 목록 시트는 닫고 그 대화를 편다. */
  function openThread(id) {
    if (!id) return;
    if (st.busy) {
      st.msg = '답을 쓰는 중이에요. 끝나면 넘어갈게요.';
      st.msgKind = '';
      render();
      return;
    }
    var key = (loggedIn() ? 's:' : 'l:') + id;
    if (key === st.threadKey) {
      st.histOpen = false;
      render();
      return;
    }
    var load;
    if (!loggedIn()) {
      var at = localFind(id);
      if (at < 0) return;
      load = Promise.resolve({ title: st.localThreads[at].title, turns: st.localThreads[at].turns });
    } else {
      ID_MAP[key] = id;
      load = call('history_get', { thread_id: id }).then(function (j) { return j.thread || null; });
    }
    flushSave();
    load.then(function (th) {
      if (!th) return;
      st.threadKey = key;
      st.threadId = loggedIn() ? id : '';
      st.threadTitle = th.title || titleOf(th.turns);
      st.thread = normTurns(th.turns);
      st.histOpen = false;
      st.msg = '';
      render();
      scrollThread();
    })['catch'](function (e) {
      st.msg = errText(e);
      st.msgKind = 'err';
      render();
    });
  }

  /* 새 대화 — 지금 대화는 목록에 남기고 빈 방에서 다시 시작한다. */
  function newThread() {
    if (st.busy) {
      st.msg = '답을 쓰는 중이에요. 끝나면 넘어갈게요.';
      st.msgKind = '';
      render();
      return;
    }
    flushSave();
    if (st.thread.length) saveChat();
    st.thread = [];
    st.threadKey = '';
    st.threadId = '';
    st.threadTitle = '';
    st.histOpen = false;
    st.msg = '';
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
    render();
    if (el.chatInput) { try { el.chatInput.focus({ preventScroll: true }); } catch (e) {} }
  }

  function renameThread(id, title) {
    var clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return;
    var row = findThread(id);
    if (!loggedIn()) {
      var at = localFind(id);
      if (at < 0) return;
      st.localThreads[at].title = clean;
      localSaveList();
      if (st.threadKey === 'l:' + id) st.threadTitle = clean;
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      st.renaming = '';
      render();
      return;
    }
    call('history_rename', { thread_id: id, title: clean }).then(function () {
      if (row) row.title = clean;
      if (st.threadKey === 's:' + id) st.threadTitle = clean;
      st.renaming = '';
      render();
    })['catch'](function (e) {
      st.msg = errText(e);
      st.msgKind = 'err';
      render();
    });
  }

  function deleteThread(id, quiet) {
    if (!id) return Promise.resolve();
    if (!loggedIn()) {
      var at = localFind(id);
      if (at >= 0) st.localThreads.splice(at, 1);
      localSaveList();
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      if (st.threadKey === 'l:' + id) { st.thread = []; st.threadKey = ''; st.threadTitle = ''; }
      render();
      return Promise.resolve();
    }
    return call('history_delete', { thread_id: id }).then(function () {
      st.threads = st.threads.filter(function (x) { return x.id !== id; });
      delete ID_MAP['s:' + id];
      if (st.threadKey === 's:' + id) { st.thread = []; st.threadKey = ''; st.threadId = ''; st.threadTitle = ''; }
      render();
    })['catch'](function (e) {
      if (quiet) return;
      st.msg = errText(e);
      st.msgKind = 'err';
      render();
    });
  }

  function clearAllThreads() {
    if (!window.confirm('내 대화를 모두 지울까요? 되돌릴 수 없어요.')) return;
    st.thread = []; st.threadKey = ''; st.threadId = ''; st.threadTitle = '';
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
    if (!loggedIn()) {
      st.localThreads = [];
      localSaveList();
      st.threads = [];
      render();
      return;
    }
    ID_MAP = {};
    call('history_clear').then(function () {
      st.threads = [];
      render();
    })['catch'](function (e) {
      st.msg = errText(e);
      st.msgKind = 'err';
      render();
    });
  }

  /* 이 브라우저에만 있던 대화를 내 계정으로 옮긴다 — 한 번 물어보고, 물어본 뒤에만. */
  function importLocalThreads() {
    if (!loggedIn() || !st.localThreads.length) return;
    st.histBusy = true;
    render();
    var src = st.localThreads.slice(0, 12).reverse();     // 오래된 것부터 올려 가장 최근 것이 맨 위에 오게
    var done = [];
    var chain = Promise.resolve();
    src.forEach(function (rec) {
      chain = chain.then(function () {
        return call('history_save', { title: rec.title, turns: rec.turns.map(plainTurn) })
          .then(function (j) { if (j && j.thread_id) done.push(j.thread_id); });
      });
    });
    chain.then(function () {
      st.localThreads = [];
      localSaveList();
      setImportState('done');
      st.importAsk = false;
      st.histBusy = false;
      refreshThreads();
      if (done.length) openThread(done[done.length - 1]);
    })['catch'](function (e) {
      st.histBusy = false;
      st.importAsk = false;
      st.msg = errText(e);
      st.msgKind = 'err';
      render();
    });
  }


  /* ---------- 뼈대 ---------- */

  function build() {
    var launch = t('button', 'jca-launch');
    launch.type = 'button';
    launch.setAttribute('aria-haspopup', 'dialog');
    launch.setAttribute('aria-expanded', 'false');
    launch.setAttribute('aria-label', '자료실 비서 열기');
    launch.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/>' +
      '<path d="M8.5 8.5h7M8.5 12h4"/></svg>' +
      '<span class="jca-launch-x">자료실 비서</span>';
    launch.addEventListener('click', function () { open(); });
    document.body.appendChild(launch);
    el.launch = launch;

    var bd = t('div', 'jca-backdrop');
    bd.hidden = true;
    bd.addEventListener('click', function () { close(); });
    document.body.appendChild(bd);
    el.bd = bd;

    var p = t('section', 'jca-panel');
    p.hidden = true;
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'false');
    p.setAttribute('aria-label', '자료실 비서');

    var head = t('div', 'jca-head');
    var ti = t('div', 'jca-title');
    ti.appendChild(t('b', null, '자료실 비서'));
    el.sub = t('span', null, '자료실 전체를 찾아 드려요');
    ti.appendChild(el.sub);
    head.appendChild(ti);

    el.sugTog = t('button', 'jca-swtog');
    el.sugTog.type = 'button';
    el.sugTog.setAttribute('aria-label', '먼저 제안받기');
    el.sugTog.addEventListener('click', function () {
      st.suggestOn = !st.suggestOn; savePref(); render();
    });
    head.appendChild(el.sugTog);

    var x = t('button', 'jca-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', '닫기');
    x.addEventListener('click', close);
    head.appendChild(x);

    var tabs = t('div', 'jca-tabs');
    tabs.setAttribute('role', 'tablist');
    el.tabs = {};
    [['chat', '대화'], ['find', '찾기'], ['key', '내 키']].forEach(function (pair) {
      var b = t('button', 'jca-tab', pair[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () {
        st.tab = pair[0]; st.msg = ''; st.msgKind = '';
        render();
        if (el.body) el.body.scrollTop = 0;
        if (pair[0] === 'chat' && el.chatInput) el.chatInput.focus({ preventScroll: true });
        if (pair[0] === 'find' && el.input) el.input.focus({ preventScroll: true });
      });
      el.tabs[pair[0]] = b;
      tabs.appendChild(b);
    });

    var body = t('div', 'jca-body');
    el.body = body;

    /* 첫 안내 — 로그인·키가 없을 때 한 번(다시 보기 가능) */
    el.welcome = t('div', 'jca-welcome');
    body.appendChild(el.welcome);

    /* ============ 대화 ============ */
    var chat = t('div', 'jca-chat');
    el.chatPane = chat;

    /* 대화 목록 줄 — 왼쪽 「지난 대화」, 가운데 지금 대화 제목, 오른쪽 「+ 새 대화」 */
    el.histBar = t('div', 'jca-histbar');
    el.histBtn = t('button', 'jca-hbtn');
    el.histBtn.type = 'button';
    el.histBtn.setAttribute('aria-label', '지난 대화 목록 열기');
    el.histBtn.addEventListener('click', function () {
      st.histOpen = !st.histOpen;
      if (st.histOpen) refreshThreads();
      render();
    });
    el.histBar.appendChild(el.histBtn);
    el.histTitle = t('span', 'jca-hist-title');
    el.histBar.appendChild(el.histTitle);
    el.newBtn = t('button', 'jca-hbtn jca-hnew', '+ 새 대화');
    el.newBtn.type = 'button';
    el.newBtn.setAttribute('aria-label', '새 대화 시작');
    el.newBtn.addEventListener('click', newThread);
    el.histBar.appendChild(el.newBtn);
    chat.appendChild(el.histBar);

    /* 지난 대화 시트 — 대화 본문 자리를 그대로 덮는다(높이가 흔들리지 않게) */
    el.hist = t('section', 'jca-hist');
    el.hist.setAttribute('aria-label', '내 대화 목록');
    chat.appendChild(el.hist);

    el.chatSug = t('div', 'jca-sug');
    el.chatSug.hidden = true;
    chat.appendChild(el.chatSug);

    el.thread = t('div', 'jca-thread');
    el.thread.setAttribute('aria-live', 'polite');
    chat.appendChild(el.thread);

    var modes = t('div', 'jca-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', '실무 활용 모드');
    el.modeBtns = {};
    MODES.forEach(function (m) {
      var b = t('button', 'jca-mode', m.label);
      b.type = 'button';
      b.title = m.tip;
      b.setAttribute('aria-pressed', String(st.mode === m.id));
      b.addEventListener('click', function () {
        st.mode = (st.mode === m.id) ? '' : m.id;
        savePref();
        if (st.mode && el.chatInput) el.chatInput.placeholder = m.ph;
        else if (el.chatInput) el.chatInput.placeholder = PH;
        render();
        if (el.chatInput) el.chatInput.focus();
      });
      el.modeBtns[m.id] = b;
      modes.appendChild(b);
    });
    chat.appendChild(modes);

    el.chatFoot = t('div', 'jca-compose');
    el.chatInput = t('input');
    el.chatInput.type = 'text';
    el.chatInput.className = 'jca-in';
    el.chatInput.placeholder = PH;
    el.chatInput.setAttribute('aria-label', '비서에게 묻기');
    el.chatInput.setAttribute('autocomplete', 'off');
    el.chatInput.setAttribute('enterkeyhint', 'send');
    el.chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    el.chatFoot.appendChild(el.chatInput);
    el.send = t('button', 'jca-send', '묻기');
    el.send.type = 'button';
    el.send.addEventListener('click', send);
    el.chatFoot.appendChild(el.send);
    chat.appendChild(el.chatFoot);

    var opts = t('div', 'jca-opts');
    var autoToggle = t('label', 'jca-tog');
    el.autoBox = t('input');
    el.autoBox.type = 'checkbox';
    el.autoBox.checked = st.autoOpen;
    el.autoBox.addEventListener('change', function () { st.autoOpen = el.autoBox.checked; savePref(); });
    autoToggle.appendChild(el.autoBox);
    autoToggle.appendChild(t('span', null, '답변 뒤 첫 자료 열기'));
    opts.appendChild(autoToggle);

    el.webWrap = t('label', 'jca-tog');
    el.webBox = t('input');
    el.webBox.type = 'checkbox';
    el.webBox.checked = st.webOn;
    el.webBox.addEventListener('change', function () {
      st.webOn = el.webBox.checked; savePref(); render();
    });
    el.webWrap.appendChild(el.webBox);
    el.webWrap.appendChild(t('span', null, '웹 교차 확인'));
    opts.appendChild(el.webWrap);

    var sugToggle2 = t('label', 'jca-tog');
    el.sugBox2 = t('input');
    el.sugBox2.type = 'checkbox';
    el.sugBox2.checked = st.suggestOn;
    el.sugBox2.addEventListener('change', function () { st.suggestOn = el.sugBox2.checked; savePref(); render(); });
    sugToggle2.appendChild(el.sugBox2);
    sugToggle2.appendChild(t('span', null, '먼저 제안받기'));
    opts.appendChild(sugToggle2);
    chat.appendChild(opts);

    el.webNote = t('p', 'jca-hint jca-website');
    chat.appendChild(el.webNote);

    el.chatOff = t('div', 'jca-off');
    chat.appendChild(el.chatOff);

    body.appendChild(chat);

    /* ============ 찾기 ============ */
    var find = t('div', 'jca-find');
    find.hidden = true;
    el.findPane = find;

    var sr = t('div', 'jca-search');
    el.input = t('input');
    el.input.type = 'search';
    el.input.placeholder = '예: 수습인데 잘렸어요, ㅂㄷㅊ, 공기업';
    el.input.setAttribute('aria-label', '자료실 검색');
    el.input.setAttribute('autocomplete', 'off');
    el.input.setAttribute('enterkeyhint', 'search');
    el.input.addEventListener('input', function () {
      st.q = el.input.value;
      if (el.clear) el.clear.hidden = !st.q;
      debounce(runSearch, 140);
    });
    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
    sr.appendChild(el.input);
    el.clear = t('button', 'jca-clear', '×');
    el.clear.type = 'button';
    el.clear.setAttribute('aria-label', '검색어 지우기');
    el.clear.hidden = true;
    el.clear.addEventListener('click', function () {
      el.input.value = ''; st.q = ''; el.clear.hidden = true;
      runSearch(); el.input.focus();
    });
    sr.appendChild(el.clear);
    find.appendChild(sr);

    el.findSug = t('div', 'jca-sug');
    el.findSug.hidden = true;
    find.appendChild(el.findSug);

    el.chips = t('div', 'jca-chips');
    CHIPS.forEach(function (c) {
      var b = t('button', 'jca-chip', c);
      b.type = 'button';
      b.addEventListener('click', function () {
        el.input.value = c; st.q = c; el.clear.hidden = false; runSearch();
      });
      el.chips.appendChild(b);
    });
    find.appendChild(el.chips);

    el.read = t('div', 'jca-read');
    el.read.hidden = true;
    find.appendChild(el.read);

    /* 선참조 지도가 집은 「먼저 볼 곳」— 색인 전체를 뒤지기 전에 섹터부터 좁힌다. */
    el.route = t('div', 'jca-read jca-route');
    el.route.hidden = true;
    find.appendChild(el.route);

    el.secTitle = t('div', 'jca-sec');
    find.appendChild(el.secTitle);
    el.list = t('ul', 'jca-list');
    find.appendChild(el.list);
    el.empty = t('div', 'jca-empty');
    find.appendChild(el.empty);

    el.findNote = t('p', 'jca-note');
    find.appendChild(el.findNote);
    body.appendChild(find);

    /* ============ 내 키 ============ */
    var keys = t('div', 'jca-keys-pane');
    keys.hidden = true;
    el.keysPane = keys;

    el.keyIntro = t('p', 'jca-hint');
    keys.appendChild(el.keyIntro);
    /* 글자 링크가 아니라 테두리·배경이 있는 정식 단추로 둔다(2026-11-19 지적). */
    var again = t('button', 'jca-again');
    again.type = 'button';
    again.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4"/><path d="M4.2 4.6v4.2h4.2"/></svg><span>처음 안내 다시 보기</span>';
    again.addEventListener('click', function () { st.welcome = true; savePref(); render(); });
    keys.appendChild(again);

    var fp = t('div', 'jca-field');
    fp.appendChild(t('label', null, '어떤 키를 쓰시나요?'));
    var one = t('div', 'jca-one');
    one.appendChild(t('b', null, 'Google Gemini'));
    one.appendChild(t('span', null, 'Google AI Studio에서 만드는 무료 키 하나면 됩니다.'));
    fp.appendChild(one);
    keys.appendChild(fp);

    var fk = t('div', 'jca-field');
    var lk = t('label', null, '내 API 키');
    lk.setAttribute('for', 'jca-key-input');
    fk.appendChild(lk);
    el.key = t('input');
    el.key.id = 'jca-key-input';
    el.key.type = 'password';
    el.key.placeholder = '키를 붙여 넣어 주세요';
    el.key.setAttribute('autocomplete', 'new-password');
    el.key.setAttribute('autocapitalize', 'off');
    el.key.setAttribute('spellcheck', 'false');
    el.key.setAttribute('aria-describedby', 'jca-key-help');
    fk.appendChild(el.key);
    el.keyHelp = t('small');
    el.keyHelp.id = 'jca-key-help';
    fk.appendChild(el.keyHelp);
    keys.appendChild(fk);


    var row = t('div', 'jca-row');
    el.save = t('button', 'jca-btn jca-primary', '키 등록');
    el.save.type = 'button';
    el.save.addEventListener('click', saveKey);
    row.appendChild(el.save);
    keys.appendChild(row);

    el.guide = t('div', 'jca-guide');
    keys.appendChild(el.guide);

    el.msg = t('p', 'jca-msg');
    keys.appendChild(el.msg);

    el.keyList = t('ul', 'jca-keys');
    keys.appendChild(el.keyList);

    /* 연결 테스트 — 키가 실제로 도는지 한 번 불러 보고 답·걸린 시간·모델 이름을 보여 준다.
       저절로 부르지 않는다(무료 일일 횟수를 아끼려면 이 단추를 눌렀을 때만). */
    var kt = t('div', 'jca-ktest');
    el.ktest = kt;
    var kth = t('div', 'jca-ktest-hd');
    kth.appendChild(t('b', null, '키 연결 확인'));
    kth.appendChild(t('span', null, '「안녕하세요」 · 무료 1회'));
    kt.appendChild(kth);
    el.ktestBtn = t('button', 'jca-btn jca-ktest-btn', '연결 테스트');
    el.ktestBtn.type = 'button';
    el.ktestBtn.addEventListener('click', runKeyTest);
    kt.appendChild(el.ktestBtn);
    el.ktestOut = t('div', 'jca-ktest-out');
    el.ktestOut.setAttribute('aria-live', 'polite');
    kt.appendChild(el.ktestOut);
    keys.appendChild(kt);

    el.privacy = t('p', 'jca-note');
    el.privacy.innerHTML = '<b>대화는 나만 볼 수 있습니다.</b> ' +
      '로그아웃 상태에서는 이 브라우저에만, 로그인 상태에서는 내 계정의 기록함에 보관되고 다른 사람은 열어 볼 수 없습니다. ' +
      '두 경우 모두 직접 고치거나 지울 수 있어요.<br>' +
      '질문은 답을 만들기 위해 AI 서비스(Google Gemini)로 전달되지만, 우리 서버는 질문·답변을 로그로 남기지 않습니다.<br>' +
      '키는 서버에서 암호화해 보관하고, 브라우저에는 끝 4자리만 보입니다.<br>' +
      '내담자 이름·연락처 같은 개인정보는 입력하지 마세요.';
    keys.appendChild(el.privacy);

    body.appendChild(keys);

    var foot = t('div', 'jca-foot');
    el.foot = foot;

    p.appendChild(head);
    p.appendChild(tabs);
    p.appendChild(body);
    p.appendChild(foot);
    document.body.appendChild(p);
    el.panel = p;

    p.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    document.addEventListener('keydown', function (e) {
      if (st.open && e.key === 'Escape') close();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!st.open || !el.panel) return;
      if (el.panel.contains(e.target) || el.launch.contains(e.target)) return;
      if (el.bd && !el.bd.hidden) return;
      close();
    }, true);
    window.addEventListener('jc-sync-change', function () {
      st.keysLoaded = false; st.keys = [];
      if (st.open) refreshKeys();
      var who = loggedIn() ? (sess().username || 'user') : '';
      if (who !== st.userSeen) { st.userSeen = who; switchUser(); }
      render();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === 'jc-sync-session') { st.keysLoaded = false; st.keys = []; st.ktest = null; if (st.open) refreshKeys(); render(); }
      if (e.key === HIST_KEY && !loggedIn()) {
        localLoad();
        st.threads = st.localThreads.map(function (x) {
          return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
        });
        render();
      }
    });
  }

  var PH = '상황을 문장으로 적어 주세요. 예: 내담자가 수습 마지막 날 해고를 통보받았대요';
  var timer = null;
  function debounce(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }

  /* ---------- 열고 닫기 ---------- */

  function open() {
    if (!el.panel) build();
    lastFocus = document.activeElement;
    st.open = true;
    el.panel.hidden = false;
    el.bd.hidden = window.innerWidth > 760;
    requestAnimationFrame(function () {
      el.panel.classList.add('is-on');
      if (el.bd && !el.bd.hidden) el.bd.classList.add('is-on');
    });
    el.launch.setAttribute('aria-expanded', 'true');
    if (!st.tab) st.tab = loggedIn() ? 'chat' : 'find';
    st.sug = buildSuggestion();
    render();
    setTimeout(function () {
      /* 「내 키」는 입력칸을 자동으로 잡지 않는다(안내 도해가 위에서 잘린다). */
      var f = st.tab === 'chat' ? el.chatInput : (st.tab === 'find' ? el.input : null);
      try { if (f) f.focus({ preventScroll: true }); } catch (e) {}
    }, 80);
    loadIndex();
    if (loggedIn()) {
      refreshKeys();
      ensureHistory();
    } else if (!st.threadsLoaded) {
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      st.threadsLoaded = true;
    }
  }

  function close() {
    if (!el.panel) return;
    st.open = false;
    el.panel.classList.remove('is-on');
    if (el.bd) el.bd.classList.remove('is-on');
    el.launch.setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      if (st.open) return;
      el.panel.hidden = true;
      if (el.bd) el.bd.hidden = true;
    }, 200);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- 색인 ---------- */

  function loadIndex() {
    loadScope();
    withSearch(function () {
      window.JCAssistSearch.load().then(function () {
        st.sug = buildSuggestion();
        if (st.q) runSearch();
        render();
        /* 기업 명함첩 색인은 첫 검색 때 따로 받는다 — 늦게 도착하면 찾기 목록을 다시 그린다. */
        if (window.JCAssistSearch.onUpdate) {
          window.JCAssistSearch.onUpdate(function () { if (st.q) { runSearch(); render(); } });
        }
      }).catch(function () {
        if (el.empty) el.empty.textContent = '자료실 색인을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
      });
    });
  }

  /* ---------- 먼저 제안 (브라우저 안에서만 계산 · 토큰 0) ---------- */

  function sectorOfPath() {
    var parts = location.pathname.split('/').filter(Boolean);
    var host = parts.slice(-1)[0] === '' ? parts.slice(-2, -1) : parts;
    var id = '';
    var secs = (window.JCAssistSearch && window.JCAssistSearch.sectors && window.JCAssistSearch.sectors()) || [];
    for (var i = 0; i < parts.length; i++) {
      for (var j = 0; j < secs.length; j++) {
        if (secs[j].id === parts[i]) id = parts[i];
      }
    }
    return id;
  }

  function short(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > (n || 24) ? s.slice(0, (n || 24) - 1) + '…' : s;
  }

  /* 지금 화면·최근 이동으로 「이어 볼 곳」을 고른다. 서버를 부르지 않는다. */
  function buildSuggestion() {
    if (!st.suggestOn) return null;
    var S = window.JCAssistSearch;
    if (!S || !S.ready()) return null;
    var secs = S.sectors() || [];
    var cur = sectorOfPath();
    var curSec = null;
    for (var i = 0; i < secs.length; i++) if (secs[i].id === cur) curSec = secs[i];
    var prev = null;
    for (var k = st.recent.length - 1; k >= 0; k--) {
      var pp = st.recent[k].path.split('?')[0];
      if (pp.indexOf('/' + cur) === -1 || cur === '') { prev = st.recent[k]; break; }
    }
    var prevTitle = prev ? short(prev.title || prev.path, 22) : '';

    /* 1) 지금 화면의 섹터와 낱말이 겹치는 다른 섹터 → 「이어 볼 곳」 */
    if (curSec) {
      var tags = curSec.tags || [];
      var best = null, bestN = 0;
      secs.forEach(function (s) {
        if (s.id === curSec.id) return;
        var n = (s.tags || []).filter(function (x) { return tags.indexOf(x) >= 0; }).length;
        if (n > bestN) { bestN = n; best = s; }
      });
      if (best && bestN >= 1) {
        return {
          text: (prevTitle ? '방금 보신 「' + prevTitle + '」에 이어, ' : '') +
            '이 자료와 함께 보면 좋은 「' + best.title + '」예요.',
          label: best.title + ' 열기', url: best.url, ask: '「' + best.title + '」에서 지금 상황에 쓸 만한 것을 짧게 짚어 주세요.'
        };
      }
      /* 2) 겹치는 섹터가 없으면 같은 섹터의 다른 자료 */
      var hits = S.search(curSec.title, { limit: 4 }) || [];
      var other = hits.filter(function (r) { return r.sector === curSec.id && r.title !== curSec.title; })[0];
      if (other) {
        return {
          text: (prevTitle ? '방금 보신 「' + prevTitle + '」 곁에서 ' : '') +
            '「' + short(other.title, 26) + '」도 확인해 보실래요?',
          label: '열기', url: other.url, ask: '「' + other.title + '」을 쉬운 3줄로 정리해 주세요.'
        };
      }
    }

    /* 3) 최근에 찾아본 낱말이 있으면 그 자료로 */
    if (st.lastQ) {
      var rr = S.search(st.lastQ, { limit: 3 }) || [];
      if (rr.length) {
        return {
          text: '찾으시던 「' + short(st.lastQ, 18) + '」와 이어서 「' + short(rr[0].title, 24) + '」도 보실래요?',
          label: '열기', url: rr[0].url, ask: '「' + rr[0].title + '」을 쉬운 3줄로 정리해 주세요.'
        };
      }
    }

    /* 4) 섹터 밖(대문 등)이면 최근 본 곳으로 */
    if (st.recent.length >= 2) {
      var last = st.recent[st.recent.length - 2];
      var id = '';
      var parts = last.path.split('/').filter(Boolean);
      for (var a = 0; a < parts.length; a++) for (var b = 0; b < secs.length; b++) if (secs[b].id === parts[a]) id = parts[a];
      var sec = null;
      for (var c = 0; c < secs.length; c++) if (secs[c].id === id) sec = secs[c];
      if (sec) {
        return {
          text: '방금 보신 「' + short(last.title || sec.title, 24) + '」에서 이어서, 「' + sec.title + '」을 다시 열어 볼까요?',
          label: sec.title + ' 열기', url: sec.url, ask: '「' + sec.title + '」에서 오늘 볼 만한 것을 짚어 주세요.'
        };
      }
    }
    return null;
  }

  function renderSuggestion(host) {
    if (!host) return;
    var s = st.sug;
    if (!st.suggestOn || !s) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = '';
    var ic = t('span', 'jca-sug-i', '먼저');
    host.appendChild(ic);
    host.appendChild(t('span', 'jca-sug-t', s.text));
    if (s.url) {
      var a = t('a', 'jca-sug-b', s.label);
      a.href = href(s.url);
      host.appendChild(a);
    }
    if (s.ask) {
      var b = t('button', 'jca-sug-b jca-sug-ask', '설명 듣기');
      b.type = 'button';
      b.addEventListener('click', function () {
        if (loggedIn() && hasKey()) {
          st.tab = 'chat'; render();
          if (el.chatInput) el.chatInput.value = s.ask;
          ask(s.ask, false);
        } else {
          st.tab = 'find'; st.q = s.ask; if (el.input) el.input.value = s.ask;
          runSearch();
        }
      });
      host.appendChild(b);
    }
  }

  /* ---------- 주소 ---------- */

  function href(u) {
    var s = String(u || '');
    if (!s) return BASE || './';
    if (/^https?:\/\//i.test(s)) return s;
    return BASE + s.replace(/^\.?\//, '');
  }
  function openRef(url) {
    var h = href(url);
    if (!h) return;
    location.href = h;
  }

  /* ---------- 찾기 ---------- */

  function runSearch() {
    if (!window.JCAssistSearch || !window.JCAssistSearch.ready()) { st.searched = false; return; }
    var q = (st.q || '').trim();
    st.searched = true;
    if (!q) { st.results = []; render(); return; }
    var list = window.JCAssistSearch.search(q, { limit: 14 });
    /* 지금 보고 있는 섹터의 «문»은 뒤로 — 이미 그 안에 있으니 누르면 제자리다. */
    var cur = sectorOfPath();
    if (cur) {
      var doors = [], rest = [];
      list.forEach(function (r) {
        var isDoor = r.kind === 'doc' && r.sector === cur && new RegExp('^\\.?/?' + cur + '/?$').test(String(r.url || ''));
        (isDoor ? doors : rest).push(r);
      });
      list = rest.concat(doors);
    }
    st.results = list.slice(0, 12);
    if (st.lastQ !== q) { st.lastQ = q; savePref(); st.sug = buildSuggestion(); }
    render();
  }

  function highlight(text, toks) {
    var frag = document.createDocumentFragment();
    var s = String(text || '');
    if (!toks || !toks.length) { frag.appendChild(document.createTextNode(s)); return frag; }
    var low = s.toLowerCase(), marks = [];
    toks.forEach(function (tk) {
      if (!tk || tk.length < 2 || /[ㄱ-ㅎ]/.test(tk)) return;
      var i = low.indexOf(tk.toLowerCase());
      if (i >= 0) marks.push([i, i + tk.length]);
    });
    if (!marks.length) { frag.appendChild(document.createTextNode(s)); return frag; }
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var pos = 0;
    marks.forEach(function (m) {
      if (m[0] < pos) return;
      frag.appendChild(document.createTextNode(s.slice(pos, m[0])));
      var mk = document.createElement('mark');
      mk.textContent = s.slice(m[0], m[1]);
      frag.appendChild(mk);
      pos = m[1];
    });
    frag.appendChild(document.createTextNode(s.slice(pos)));
    return frag;
  }

  function renderFind() {
    var search = window.JCAssistSearch;
    var toks = search && search.tokenize ? (search.tokenize(st.q) || []) : [];
    var q = (st.q || '').trim();

    renderSuggestion(el.findSug);
    el.chips.hidden = !!q;

    var info = q && search && search.analyze ? search.analyze(q) : null;
    el.read.innerHTML = '';
    if (info && (info.tokens.length || info.added.length)) {
      el.read.hidden = false;
      el.read.appendChild(t('span', 'jca-read-l', '이렇게 읽었어요'));
      info.tokens.forEach(function (w) {
        if (/^[ㄱ-ㅎ]+$/.test(w)) return;
        el.read.appendChild(t('span', 'jca-read-k', w));
      });
      info.added.slice(0, 6).forEach(function (a) {
        var chip = t('span', 'jca-read-k jca-read-add', a.word);
        if (a.why) chip.title = a.why;
        el.read.appendChild(chip);
      });
      if (info.situation) el.read.appendChild(t('span', 'jca-read-k jca-read-sit', '상담 상황으로 읽음'));
    } else {
      el.read.hidden = true;
    }

    /* 선참조 — 작은 지도가 고른 섹터 2곳을 먼저 보여 준다(누르면 그 섹터로). */
    el.route.innerHTML = '';
    var rt = q && search && search.route ? search.route(q, { limit: 2 }) : [];
    if (q && rt.length) {
      el.route.hidden = false;
      el.route.appendChild(t('span', 'jca-read-l', '먼저 볼 곳'));
      rt.forEach(function (r) {
        var a = t('a', 'jca-read-k jca-read-go', (r.no ? r.no + ' ' : '') + r.title);
        a.href = href(r.url);
        if (r.why && r.why.length) a.title = r.why.join(' · ');
        el.route.appendChild(a);
      });
    } else {
      el.route.hidden = true;
    }

    el.secTitle.textContent = q ? (st.results.length ? '자료실에서 찾은 것 · ' + st.results.length + '건' : '') : '';
    el.list.innerHTML = '';
    st.results.forEach(function (r) {
      var li = t('li');
      var a = t('a', 'jca-hit');
      a.href = href(r.url);
      var top = t('div', 'jca-hit-top');
      top.appendChild(t('span', 'jca-badge', r.sectorTitle || r.sector));
      var tt = t('span', 'jca-hit-t');
      tt.appendChild(highlight(r.title, toks));
      top.appendChild(tt);
      a.appendChild(top);
      if (r.snippet) {
        var pp = t('p');
        pp.appendChild(highlight(r.snippet, toks));
        a.appendChild(pp);
      }
      li.appendChild(a);
      el.list.appendChild(li);
    });

    if (q && !st.results.length) {
      el.empty.textContent = '자료실 색인에서 찾지 못했어요. 낱말을 조금 줄이거나, 초성(예: ㅂㄷㅊ)으로 다시 찾아보세요.';
      el.empty.hidden = false;
    } else if (!q) {
      el.empty.textContent = search && search.ready()
        ? '무엇이든 찾아보세요. 섹터·자격증·법령·기업·이론·직업분류에서 찾아 드려요.'
        : '자료실 색인을 불러오는 중…';
      el.empty.hidden = false;
    } else {
      el.empty.hidden = true;
    }

    el.findNote.hidden = false;
    if (!loggedIn()) {
      el.findNote.innerHTML = '<b>지금은 바로 찾기 모드예요.</b> 로그인하고 내 AI 키를 등록하시면, 찾은 자료를 근거로 설명과 맥락까지 정리해 드려요.';
      var fnote = t('div', 'jca-note-act');
      fnote.appendChild(noteBtn('로그인하기', 'jca-primary', function () {
        if (window.JCSync && window.JCSync.open) { close(); window.JCSync.open('login'); }
      }));
      el.findNote.appendChild(fnote);
    } else if (!hasKey()) {
      el.findNote.innerHTML = '<b>한 걸음만 더 하면 AI 설명이 켜져요.</b> Gemini 무료 키를 1순위로 권해 드려요.';
      var fnote2 = t('div', 'jca-note-act');
      fnote2.appendChild(noteBtn('내 키 등록하기', 'jca-primary', function () { st.tab = 'key'; render(); }));
      el.findNote.appendChild(fnote2);
    } else {
      el.findNote.hidden = true;
    }
  }

  /* 안내문 속 링크 대신 쓰는 정식 단추 — 안내문 아래 한 줄에 같은 높이로 놓인다. */
  function noteBtn(label, cls, fn) {
    var b = t('button', 'jca-btn jca-btn-sm' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------- 대화 ---------- */

  function renderChat() {
    var ready = loggedIn() && hasKey();
    el.chatPane.classList.toggle('jca-off-mode', !ready);
    el.chatPane.classList.toggle('jca-hist-on', !!st.histOpen);

    /* 대화 목록 줄 */
    var n = loggedIn() ? st.threads.length : st.localThreads.length;
    el.histBtn.innerHTML = '';
    el.histBtn.appendChild(t('span', null, '지난 대화'));
    if (n) el.histBtn.appendChild(t('b', null, String(n)));
    el.histBtn.setAttribute('aria-expanded', String(!!st.histOpen));
    el.histTitle.textContent = st.thread.length ? (st.threadTitle || titleOf(st.thread)) : '';
    el.histTitle.title = el.histTitle.textContent;
    renderHist();

    el.chatSug.hidden = !ready || !!st.histOpen;
    if (ready) renderSuggestion(el.chatSug);

    /* 웹 교차 확인 — Gemini 의 google_search 그라운딩 */
    el.webBox.checked = st.webOn;
    el.webNote.hidden = !ready;
    el.webNote.textContent = st.webOn
      ? '웹 교차 확인이 켜졌어요. 자료실 기준과 구글 검색 결과를 나눠 드립니다.'
      : '웹 교차 확인을 켜면 자료실 기준과 구글 검색 결과를 나눠서 확인해 드려요.';


    el.thread.innerHTML = '';
    if (!st.thread.length) {
      var intro = t('div', 'jca-intro');
      intro.appendChild(t('b', null, '상황을 문장으로 적어 주세요.'));
      intro.appendChild(t('p', null, '예: 「내담자가 3개월 수습 마지막 날 해고를 통보받았대요. 어떤 조문을 봐야 할까요?」'));
      intro.appendChild(t('p', null, '찾은 자료와 지금 열려 있는 자료를 근거로, 친절하게 풀어 드려요.'));
      if (loggedIn() && st.threads.length) {
        var back = t('button', 'jca-btn jca-hist-back', '지난 대화 이어서 보기');
        back.type = 'button';
        back.addEventListener('click', function () { st.histOpen = true; refreshThreads(); render(); });
        intro.appendChild(back);
      }
      el.thread.appendChild(intro);
    } else {
      var hd = t('div', 'jca-thread-hd');
      hd.appendChild(t('span', null, '대화 ' + st.thread.length + '개 · ' +
        (loggedIn() ? '내 기록함에 보관' : '이 브라우저에만')));
      var clr = t('button', 'jca-mini', '이 대화 지우기');
      clr.type = 'button';
      clr.addEventListener('click', clearChat);
      hd.appendChild(clr);
      el.thread.appendChild(hd);
    }

    st.thread.forEach(function (turn) { el.thread.appendChild(renderTurn(turn)); });

    Object.keys(el.modeBtns).forEach(function (id) {
      el.modeBtns[id].setAttribute('aria-pressed', String(st.mode === id));
    });
    if (el.chatInput) {
      el.chatInput.placeholder = st.mode
        ? (MODES.filter(function (m) { return m.id === st.mode; })[0] || {}).ph || PH
        : PH;
    }

    if (ready) {
      el.chatOff.hidden = true;
      el.chatFoot.hidden = false;
      el.send.disabled = st.busy;
      el.send.textContent = st.busy ? '답하는 중…' : '묻기';
    } else {
      el.chatFoot.hidden = true;
      el.chatOff.hidden = false;
      el.chatOff.innerHTML = '';
      var box = t('div', 'jca-note');
      if (!loggedIn()) {
        box.innerHTML = '<b>AI 대화는 로그인과 내 키가 필요해요.</b> 지금은 「찾기」에서 자료실 전체를 바로 찾을 수 있어요.';
      } else {
        box.innerHTML = '<b>AI 대화를 켜려면 내 키가 필요해요.</b> Google Gemini 무료 키를 1순위로 권해 드려요.';
      }
      /* 안내문 아래 단추 줄 — 같은 높이·같은 폭으로 나란히 */
      var offRow = t('div', 'jca-note-act');
      if (!loggedIn()) {
        offRow.appendChild(noteBtn('로그인하기', 'jca-primary', function () {
          if (window.JCSync && window.JCSync.open) { close(); window.JCSync.open('login'); }
        }));
      } else {
        offRow.appendChild(noteBtn('내 키 등록하기', 'jca-primary', function () { st.tab = 'key'; render(); }));
      }
      offRow.appendChild(noteBtn('찾기로 이동', '', function () { st.tab = 'find'; render(); }));
      box.appendChild(offRow);
      el.chatOff.appendChild(box);
    }
    scrollThread();
  }

  /* ---------- 지난 대화 시트 ---------- */

  function when(v) {
    var d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 0) diff = 0;
    if (diff < 60000) return '방금';
    if (diff < 3600000) return Math.round(diff / 60000) + '분 전';
    if (diff < 86400000) return Math.round(diff / 3600000) + '시간 전';
    if (diff < 7 * 86400000) return Math.round(diff / 86400000) + '일 전';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function isCurrentThread(id) {
    return st.threadKey === (loggedIn() ? 's:' : 'l:') + id;
  }

  function renderHist() {
    if (!el.hist) return;
    /* 제목을 고치는 중이면 다시 그리지 않는다(입력하던 글자·포커스가 날아간다). */
    if (st.renaming && el.hist.contains(document.activeElement)) return;
    el.hist.innerHTML = '';

    var hd = t('div', 'jca-hist-hd');
    var ttl = t('div', 'jca-hist-ttl');
    ttl.appendChild(t('b', null, '내 대화'));
    ttl.appendChild(t('span', null, loggedIn() ? '내 계정에만 보관 · 다른 사람은 볼 수 없어요' : '이 브라우저에만 보관돼요'));
    hd.appendChild(ttl);
    var closeBtn = t('button', 'jca-mini', '닫기');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', function () { st.histOpen = false; render(); });
    hd.appendChild(closeBtn);
    el.hist.appendChild(hd);

    var acts = t('div', 'jca-row jca-hist-acts');
    var nw = t('button', 'jca-btn jca-primary', '+ 새 대화');
    nw.type = 'button';
    nw.disabled = st.busy;
    nw.addEventListener('click', newThread);
    acts.appendChild(nw);
    var list = loggedIn() ? st.threads : st.localThreads;
    if (list.length) {
      var all = t('button', 'jca-btn', '전체 비우기');
      all.type = 'button';
      all.disabled = st.busy;
      all.addEventListener('click', clearAllThreads);
      acts.appendChild(all);
    }
    el.hist.appendChild(acts);

    /* 로그아웃 상태 — 로그인하면 무엇이 달라지는지 한 줄로 */
    if (!loggedIn()) {
      var note = t('div', 'jca-note');
      note.innerHTML = '<b>로그인하면 내 대화가 계정에 보관돼요.</b> 다른 기기에서도 이어 볼 수 있고, 다른 사람은 볼 수 없어요. 지금 대화는 이 브라우저에만 남습니다.';
      var hnote = t('div', 'jca-note-act');
      hnote.appendChild(noteBtn('로그인하기', 'jca-primary', function () {
        if (window.JCSync && window.JCSync.open) { close(); window.JCSync.open('login'); }
      }));
      note.appendChild(hnote);
      el.hist.appendChild(note);
    }

    /* 이 브라우저에만 있던 대화 — 계정으로 옮길지 한 번만 묻는다 */
    if (loggedIn() && st.importAsk && st.localThreads.length) {
      var card = t('div', 'jca-hist-import');
      card.appendChild(t('b', null, '이 브라우저에만 있던 대화 ' + st.localThreads.length + '개가 있어요.'));
      card.appendChild(t('p', null, '내 계정으로 옮기면 기기를 바꿔도 이어 볼 수 있어요. 옮기지 않으면 이 브라우저에만 남습니다.'));
      var row2 = t('div', 'jca-row');
      var go = t('button', 'jca-btn jca-primary', '내 계정으로 옮기기');
      go.type = 'button';
      go.disabled = st.histBusy;
      go.addEventListener('click', importLocalThreads);
      row2.appendChild(go);
      var keep = t('button', 'jca-btn', '이 브라우저에만 두기');
      keep.type = 'button';
      keep.addEventListener('click', function () {
        setImportState('declined');
        st.importAsk = false;
        render();
      });
      row2.appendChild(keep);
      card.appendChild(row2);
      el.hist.appendChild(card);
    }

    if (loggedIn() && !st.threadsLoaded) {
      el.hist.appendChild(t('p', 'jca-hint', '대화 목록을 불러오는 중…'));
    }
    if (st.threadsErr) el.hist.appendChild(t('p', 'jca-hint jca-hist-err', st.threadsErr));

    if (!list.length) {
      if (st.threadsLoaded) {
        el.hist.appendChild(t('p', 'jca-empty', st.importAsk
          ? '아래 「내 계정으로 옮기기」를 누르면 이 브라우저의 대화가 여기에 쌓입니다.'
          : '아직 지난 대화가 없어요. 아래에 상황을 적고 「묻기」를 누르면 여기에 차곡차곡 쌓입니다.'));
      }
      return;
    }

    var ul = t('ul', 'jca-hist-list');
    list.forEach(function (row) {
      var li = t('li', 'jca-hrow');
      if (isCurrentThread(row.id)) li.setAttribute('aria-current', 'true');

      if (st.renaming === row.id) {
        var ed = t('div', 'jca-hrow-edit');
        var inp = t('input', 'jca-hrow-in');
        inp.type = 'text';
        inp.value = st.renameVal;
        inp.maxLength = 80;
        inp.setAttribute('aria-label', '대화 제목');
        inp.addEventListener('input', function () { st.renameVal = inp.value; });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); renameThread(row.id, st.renameVal); }
          else if (e.key === 'Escape') { st.renaming = ''; render(); }
        });
        ed.appendChild(inp);
        var ok = t('button', 'jca-hmini', '저장');
        ok.type = 'button';
        ok.addEventListener('click', function () { renameThread(row.id, st.renameVal); });
        ed.appendChild(ok);
        var cancel = t('button', 'jca-hmini', '취소');
        cancel.type = 'button';
        cancel.addEventListener('click', function () { st.renaming = ''; render(); });
        ed.appendChild(cancel);
        li.appendChild(ed);
        setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 0);
      } else {
        var main = t('button', 'jca-hrow-main');
        main.type = 'button';
        main.addEventListener('click', function () { openThread(row.id); });
        main.appendChild(t('span', 'jca-hrow-t', row.title || '새 대화'));
        var cnt = Array.isArray(row.turns) ? row.turns.length : (row.turns || 0);
        main.appendChild(t('span', 'jca-hrow-m',
          cnt + '개 주고받음' + (when(row.updated) ? ' · ' + when(row.updated) : '') +
          (isCurrentThread(row.id) ? ' · 보고 있는 대화' : '')));
        li.appendChild(main);

        var acts2 = t('div', 'jca-hrow-acts');
        var ren = t('button', 'jca-hmini', '이름');
        ren.type = 'button';
        ren.setAttribute('aria-label', '이 대화 제목 바꾸기');
        ren.addEventListener('click', function () {
          st.renaming = row.id;
          st.renameVal = row.title || '';
          render();
        });
        acts2.appendChild(ren);
        var del = t('button', 'jca-hmini', '삭제');
        del.type = 'button';
        del.setAttribute('aria-label', '이 대화 지우기');
        del.addEventListener('click', function () {
          if (!window.confirm('「' + short(row.title || '새 대화', 20) + '」 대화를 지울까요? 되돌릴 수 없어요.')) return;
          if (isCurrentThread(row.id)) { st.thread = []; st.threadTitle = ''; st.threadKey = ''; st.threadId = ''; try { localStorage.removeItem(CHAT_KEY); } catch (e) {} }
          deleteThread(row.id);
        });
        acts2.appendChild(del);
        li.appendChild(acts2);
      }
      ul.appendChild(li);
    });
    el.hist.appendChild(ul);
    el.hist.appendChild(t('p', 'jca-hint', loggedIn()
      ? '대화는 내 계정에만 보관되고, 지우면 바로 사라져요.'
      : '이 목록은 이 브라우저에만 저장돼요. 브라우저 기록을 지우면 함께 사라집니다.'));
  }

  /* ---------- 진행 단계 (검색 → 정리 → 추론 → 작성) ---------- */

  function renderStage(turn) {
    var box = t('div', 'jca-stage');
    box.setAttribute('data-stage', turn.stage || 'search');
    box.setAttribute('data-tid', turn.id);
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    var cur = stageIndex(turn.stage);
    STAGES.forEach(function (s, i) {
      var step = t('div', 'jca-step' + (i < cur ? ' done' : (i === cur ? ' on' : '')));
      step.appendChild(t('span', 'jca-seg'));
      step.appendChild(t('span', 'jca-step-l', (i < cur ? '✓ ' : '') + s.label));
      box.appendChild(step);
    });
    var sec0 = Math.floor((Date.now() - (st.askStart || Date.now())) / 1000);
    box.appendChild(t('span', 'jca-stage-c',
      (cur >= 0 ? STAGES[cur].line : '답을 준비하고 있어요') + (sec0 >= 1 ? ' · ' + sec0 + '초' : '')));
    return box;
  }

  var stageTimer = null;
  function stopStageClock() {
    if (stageTimer) { clearInterval(stageTimer); stageTimer = null; }
  }
  function startStageClock() {
    stopStageClock();
    stageTimer = setInterval(stageTick, 1000);
  }
  /* 지금 단계와 기다린 시간만 다시 쓴다 — 화면 전체를 다시 그리지 않는다. */
  function stageTick() {
    if (!el.thread) return;
    var box = el.thread.querySelector('.jca-stage');
    if (!box) return;                      /* 답이 끝나 막대가 사라졌을 때는 조용히 넘어간다 */
    var line = box.querySelector('.jca-stage-c');
    if (!line) return;
    var i = stageIndex(box.getAttribute('data-stage'));
    if (i < 0) return;
    var sec = Math.floor((Date.now() - (st.askStart || Date.now())) / 1000);
    line.textContent = STAGES[i].line + (sec >= 1 ? ' · ' + sec + '초' : '');
  }

  function renderTurn(turn) {
    var wrap = t('div', 'jca-turn');
    var qb = t('div', 'jca-q');
    qb.appendChild(t('span', 'jca-q-t', turn.q));
    var acts = t('div', 'jca-turn-acts');
    var ed = t('button', 'jca-mini', '수정');
    ed.type = 'button';
    ed.setAttribute('aria-label', '이 질문을 고쳐 다시 묻기');
    ed.addEventListener('click', function () { editTurn(turn.id); });
    var rq = t('button', 'jca-mini', '다시');
    rq.type = 'button';
    rq.setAttribute('aria-label', '같은 질문을 다시 묻기');
    rq.addEventListener('click', function () { askAgain(turn); });
    var dl = t('button', 'jca-mini', '삭제');
    dl.type = 'button';
    dl.setAttribute('aria-label', '이 대화 삭제');
    dl.addEventListener('click', function () { delTurn(turn.id); });
    acts.appendChild(ed); acts.appendChild(rq); acts.appendChild(dl);
    qb.appendChild(acts);
    wrap.appendChild(qb);

    var ab = t('div', 'jca-a');
    if (turn.wait) {
      ab.classList.add('jca-a-wait');
      ab.appendChild(renderStage(turn));
    }
    if (!turn.wait || turn.live) {
      if (turn.scope === 'off' || turn.scope === 'guard') {
        ab.classList.add('jca-a-scope');
        ab.appendChild(t('span', 'jca-a-tag', turn.scope === 'guard' ? '답할 수 없는 요청' : '자료실 범위 밖'));
      } else if (turn.mode || turn.websearch) {
        var tag = [];
        if (turn.mode) {
          var mm = MODES.filter(function (m) { return m.id === turn.mode; })[0];
          if (mm) tag.push(mm.label);
        }
        if (turn.websearch) tag.push('웹 교차 확인');
        if (tag.length) ab.appendChild(t('span', 'jca-a-tag', tag.join(' · ')));
      }
      var body = t('div', 'jca-a-b');
      body.setAttribute('data-tid', turn.id);
      body.textContent = turn.live ? visibleStream(turn.a) : (turn.a || '');
      ab.appendChild(body);
      if (turn.err) ab.classList.add('jca-a-err');

      if (turn.refs && turn.refs.length) {
        ab.appendChild(t('div', 'jca-a-sub', '자료실 근거'));
        var ul = t('ul', 'jca-refs');
        turn.refs.forEach(function (r) {
          var li = t('li');
          var a = t('a');
          a.href = href(r.url);
          a.appendChild(t('b', null, r.title || '자료'));
          a.appendChild(t('span', null, '근거 자료 열기 · ' + (r.sector || '')));
          li.appendChild(a);
          ul.appendChild(li);
        });
        ab.appendChild(ul);
        var openBtn = t('button', 'jca-btn jca-open', '첫 자료 바로 열기');
        openBtn.type = 'button';
        openBtn.addEventListener('click', function () { openRef(turn.refs[0].url); });
        ab.appendChild(openBtn);
      }

      if (turn.web && turn.web.length) {
        ab.appendChild(t('div', 'jca-a-sub', '외부 확인(구글 검색)'));
        var wl = t('ul', 'jca-refs jca-weblist');
        turn.web.slice(0, 5).forEach(function (w) {
          var li2 = t('li');
          var a2 = t('a');
          a2.href = w.url;
          a2.target = '_blank';
          a2.rel = 'noopener noreferrer';
          var host = '';
          try { host = new URL(w.url).hostname.replace(/^www\./, ''); } catch (e) {}
          a2.appendChild(t('b', null, w.title || host));
          a2.appendChild(t('span', null, host + ' · 새 창에서 열기'));
          li2.appendChild(a2);
          wl.appendChild(li2);
        });
        ab.appendChild(wl);
      }
    }
    wrap.appendChild(ab);
    return wrap;
  }

  function scrollThread() {
    if (!el.thread) return;
    try {
      var b = el.thread.closest('.jca-body');
      if (b) b.scrollTop = b.scrollHeight;
    } catch (e) {}
  }

  function newId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function send() {
    if (st.busy) return;
    var q = (el.chatInput.value || '').trim();
    if (q.length < 2) { el.chatInput.focus(); return; }
    /* 범위 밖 요청은 로그인·키가 없어도 바로 안내한다 — 모델을 부르지 않는다. */
    if (scopeBlock(q)) { el.chatInput.value = ''; return; }
    if (!loggedIn()) { st.tab = 'find'; render(); if (window.JCSync) window.JCSync.open('login'); return; }
    if (!hasKey()) { st.tab = 'key'; render(); return; }
    ask(q, true);
  }

  /* AUP-7 — 질문 벡터. 경량 질의 임베딩 경로가 켜져 있을 때(assistant/data/semantic-vectors.json 의
     provider 가 채워졌을 때)만 부른다. 꺼져 있으면 네트워크 요청 0 — 검색은 지금과 100% 같다.
     받은 벡터는 검색·조각에 앉히고, 이 질문의 벡터와 모델이 다르면 붙이지 않는다(assistant/search.js). */
  function queryVectorFor(q) {
    var S = window.JCAssistSearch;
    if (!S || !S.provider) return Promise.resolve(false);
    var p = S.provider();
    if (!p) { try { S.setQueryVector(q, null); } catch (e) {} return Promise.resolve(false); }
    var url = p + (p.indexOf('?') < 0 ? '?' : '&') + 'q=' + encodeURIComponent(q);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var v = j && (j.vector || j.embedding);
        var ok = !!(v && S.setQueryVector(q, v, (j && j.model) || S.providerModel()));
        if (window.JCAssistChunks && window.JCAssistChunks.setQueryVector) window.JCAssistChunks.setQueryVector(ok ? v : null, j && j.model);
        return ok;
      })
      .catch(function () { try { S.setQueryVector(q, null); } catch (e) {} return false; });
  }

  /* 비서에게 건네는 근거 — 근거 조각(법정 수치·법령 풀이·조문, 최대 2)을 앞에, 검색 결과를 뒤에 붙여 5개.
     조각 고르는 규칙은 assistant/chunks.js 하나 — AUP-2 성적표 러너도 같은 파일을 쓴다. */
  function evidence(q) {
    var hits = [];
    if (window.JCAssistSearch && window.JCAssistSearch.ready()) {
      hits = window.JCAssistSearch.search(q, { limit: 5 }).map(function (x) {
        return { title: x.title, sector: x.sectorTitle || x.sector, url: x.url, snippet: x.snippet || '' };
      });
    }
    var C = window.JCAssistChunks;
    if (C && C.ready()) {
      try { return C.evidence(q, hits).map(function (e) { return { title: e.title, sector: e.sector, url: e.url, snippet: e.snippet }; }); } catch (e) {}
    }
    return hits;
  }

  /* 범위 밖이면 안내 한 턴을 남기고 true. 질문을 서버로 보내지 않는다. */
  function scopeBlock(q) {
    var sv = scopeOf(q);
    if (!sv) return false;
    st.thread.push({ id: newId(), ts: Date.now(), q: q, a: sv.message, refs: [], web: [], mode: '', websearch: false, scope: sv.kind });
    render(); saveChat(); scrollThread();
    return true;
  }

  function ask(q, clearInput) {
    if (scopeBlock(q)) { if (clearInput && el.chatInput) el.chatInput.value = ''; return; }
    var turn = { id: newId(), ts: Date.now(), q: q, a: '', refs: [], web: [], wait: true, stage: 'search',
                 mode: st.mode || '', websearch: st.webOn };
    st.thread.push(turn);
    st.busy = true;
    st.askStart = Date.now();
    startStageClock();
    if (clearInput && el.chatInput) el.chatInput.value = '';
    render(); saveChat();

    /* 「검색 중」을 먼저 한 프레임 그리고서 실제 일을 시작한다 — 같은 틱에 끝나면 단계가 보이지 않는다. */
    setTimeout(function () {
      /* 뜻 벡터가 오면 검색에 앉힌 뒤 답을 부른다 — 없으면(꺼짐·실패) 그대로 진행한다. */
      var sq = searchQ(q, prevOf(turn));
      queryVectorFor(sq).then(function () { runAsk(turn, q); });
    }, 60);
  }

  /* 단계를 바꾸고 그 자리만 다시 그린다(답이 흐르는 중에는 글자를 다시 그리지 않는다). */
  function setStage(turn, id) {
    if (!turn || !id || turn.stage === id) return;
    turn.stage = id;
    if (!st.busy) return;
    render();
  }

  /* AUP-4 이어지는 질문 — 이 대화의 앞 질문(최근 2개, 범위 밖·막힌 턴 제외).
     «그럼 수습 기간엔요?»를 «최저임금 수습 기간엔요?»로 이어 붙여 검색·근거 조각을 고르고(assistant/rewrite.js),
     비서에게는 사용자가 쓴 질문 그대로 + 앞 질문을 «참고» 칸으로 함께 보낸다. */
  function prevOf(turn) {
    var i = st.thread.indexOf(turn), out = [];
    for (var k = (i < 0 ? st.thread.length : i) - 1; k >= 0 && out.length < 2; k--) {
      var t = st.thread[k];
      if (t && t.q && !t.scope) out.unshift(String(t.q).slice(0, 200));
    }
    return out;
  }
  function searchQ(q, prev) {
    var R = window.JCAssistRewrite;
    if (!R || !prev.length) return q;
    try { return R.rewrite(q, prev).q || q; } catch (e) { return q; }
  }

  function runAsk(turn, q) {
    var prev = prevOf(turn), sq = searchQ(q, prev);
    var body = { question: q, evidence: evidence(sq), provider: st.provider, stream: true };
    if (prev.length) body.prev = prev;
    if (st.mode) body.mode = st.mode;
    if (st.webOn) body.websearch = true;
    /* 선참조 지도 — 비서 지침이 「먼저 보는」 섹터 지도와, 지도가 집은 후보 섹터를 함께 받는다. */
    var S = window.JCAssistSearch;
    if (S && S.map && S.preface && S.preface()) {
      body.map = S.map(30);
      var rt0 = S.route ? S.route(sq, { limit: 3 }) : [];
      if (rt0.length) {
        body.route = rt0.map(function (r) { return { no: r.no || '', title: r.title, url: r.url, why: r.why || [] }; });
      }
    }
    setStage(turn, 'collect');

    /* 첫 글자가 오는 대로 말풍선에 붙인다(마커 [[REFS:…]] 부분은 가린다). */
    function paintLive() {
      if (!turn.live) {
        turn.live = true;
        turn.stage = 'write';
        render();
      }
      var node = el.thread ? el.thread.querySelector('.jca-a-b[data-tid="' + turn.id + '"]') : null;
      if (!node) return;
      node.textContent = visibleStream(turn.a);
      node.classList.add('jca-a-live');
      scrollThread();
    }

    function applyDone(j) {
      turn.a = j.answer || turn.a || '';
      turn.refs = j.references || [];
      turn.web = j.web || [];
      turn.websearch = !!j.websearch;
      if (j.scope === 'off' || j.scope === 'guard') { turn.scope = j.scope; turn.websearch = false; }
      if (j.guard === 'leak') { turn.scope = 'guard'; turn.websearch = false; turn.refs = []; turn.web = []; }
      if (j.model) turn.model = j.model;
      delete turn.live;
    }

    /* onStage 는 단계 id 하나만 받는다 — 지금 대화(turn)에 붙인다. */
    streamAsk(body, turn, paintLive, applyDone, function (id) { setStage(turn, id); }).then(function () {
      turn.wait = false;
      turn.stage = '';
    })['catch'](function (e) {
      turn.wait = false; turn.stage = ''; turn.err = true;
      var msg = errText(e);
      turn.a = turn.a ? turn.a + '\n\n' + msg : msg;
      turn.refs = []; turn.web = [];
    }).then(function () {
      st.busy = false;
      stopStageClock();
      delete turn.wait;
      render(); saveChat();
      if (st.autoOpen && turn.refs && turn.refs.length && !turn.err) {
        setTimeout(function () { openRef(turn.refs[0].url); }, 1400);
      }
    });
  }

  /* 스트리밍 마커([[REFS:…]])가 보이지 않게 자른다. */
  function visibleStream(s) {
    var v = String(s == null ? '' : s);
    var i = v.indexOf('[[');
    return i < 0 ? v : v.replace(/\s+$/, '').slice(0, i).replace(/\s+$/, '');
  }

  /* SSE 로 답을 받아 글자마다 onDelta 로 넘긴다. SSE 가 아니면 일반 JSON 응답으로 처리한다. */
  function streamAsk(body, turn, onDelta, onDone, onStage) {
    var s = sess();
    if (!s) return Promise.reject({ error: 'session' });
    var payload = { action: 'ask', session_token: s.token };
    Object.keys(body || {}).forEach(function (k) { payload[k] = body[k]; });
    /* 스트리밍이 막하는 중간 서버(프록시 등)가 응답을 모아 버릴 때를 대비해, 첫 글자가 늦어도 연결은 살린다. */
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.indexOf('text/event-stream') < 0 || !r.body || !r.body.getReader) {
        /* SSE 가 아닌 응답(오류 JSON 또는 예전 서버) — 그대로 읽는다. */
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || j.ok === false) throw (j && j.error ? j : { error: 'server' });
          onDone(j);
        });
      }

      var reader = r.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      var stopped = false;

      return new Promise(function (resolve, reject) {
        function pump() {
          if (stopped) return;
          reader.read().then(function (step) {
            if (stopped) return;
            if (step.done) { stopped = true; resolve(null); return; }
            buf += dec.decode(step.value, { stream: true });
            var nl = buf.indexOf('\n\n');
            while (nl >= 0) {
              var block = buf.slice(0, nl);
              buf = buf.slice(nl + 2);
              var ev = '';
              var data = '';
              block.split('\n').forEach(function (line) {
                if (line.indexOf('event:') === 0) ev = line.slice(6).trim();
                else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
              });
              if (data) {
                var j = null;
                try { j = JSON.parse(data); } catch (x) { j = null; }
                if (j) {
                  if (ev === 'delta') {
                    turn.a += (j.t || '');
                    onDelta();
                  } else if (ev === 'stage') {
                    /* 서버가 알려 주는 단계 — 지금은 「추론 중」 하나. */
                    if (onStage) onStage(j.stage === 'thinking' ? 'think' : String(j.stage || ''));
                  } else if (ev === 'done') {
                    onDone(j);
                    stopped = true;
                    try { reader.cancel(); } catch (x) { /* 이미 끝났다 */ }
                    resolve(null);
                    return;
                  } else if (ev === 'error') {
                    stopped = true;
                    reject(j);
                    return;
                  }
                }
              }
              nl = buf.indexOf('\n\n');
            }
            pump();
          })['catch'](function (e) {
            if (stopped) return;
            stopped = true;
            reject(e || { error: 'upstream' });
          });
        }
        pump();
      });
    });
  }

  function askAgain(turn) {
    if (st.busy) return;
    var i = st.thread.indexOf(turn);
    if (i < 0) return;
    st.thread.splice(i, 1);
    ask(turn.q, false);
  }

  function editTurn(id) {
    var i = -1;
    st.thread.forEach(function (x, k) { if (x.id === id) i = k; });
    if (i < 0) return;
    var turn = st.thread[i];
    st.thread = st.thread.slice(0, i);
    if (el.chatInput) { el.chatInput.value = turn.q; el.chatInput.focus(); }
    render(); saveChat();
  }

  function delTurn(id) {
    st.thread = st.thread.filter(function (x) { return x.id !== id; });
    render(); saveChat();
  }

  function clearChat() {
    if (st.busy) return;
    var msg = loggedIn()
      ? '이 대화를 지울까요? 되돌릴 수 없어요.'
      : '이 브라우저에 저장된 이 대화를 지울까요? 되돌릴 수 없어요.';
    if (!window.confirm(msg)) return;
    var key = st.threadKey, sid = st.threadId;
    var lid = key && key.indexOf('l:') === 0 ? key.slice(2) : '';
    st.thread = []; st.threadTitle = ''; st.threadKey = ''; st.threadId = '';
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
    if (sid) deleteThread(sid, true);
    else if (lid) deleteThread(lid, true);
    else render();
  }

  /* 로그인·로그아웃으로 보는 곳이 바뀔 때 — 지금 대화를 놓고 그 사람 것으로 다시 시작한다. */
  function switchUser() {
    stopStageClock();
    st.thread = []; st.threadKey = ''; st.threadId = ''; st.threadTitle = '';
    st.threads = []; st.threadsLoaded = false; st.threadsErr = '';
    st.histOpen = false; st.renaming = ''; st.importAsk = false;
    ID_MAP = {};
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
    if (!loggedIn()) {
      localLoad();
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      st.threadsLoaded = true;
      if (st.localThreads.length) {
        st.threadKey = 'l:' + st.localThreads[0].id;
        st.thread = st.localThreads[0].turns.slice();
        st.threadTitle = st.localThreads[0].title;
      }
      return;
    }
    ensureHistory();
  }

  /* ---------- 내 키 ---------- */

  function refreshKeys() {
    if (!loggedIn()) { st.keys = []; st.keysLoaded = true; render(); return; }
    call('list_keys').then(function (j) {
      st.keys = j.keys || [];
      st.keysLoaded = true;
      if (st.keys.length) st.guideOpen = false;
      render();
    }).catch(function () {
      st.keysLoaded = true;
      render();
    });
  }

  function saveKey() {
    if (st.busy) return;
    var key = (el.key.value || '').trim();
    if (key.length < 8) { setMsg('키를 붙여 넣어 주세요.', 'err'); return; }
    var extra = { provider: PROVIDER.id, key: key };
    st.busy = true; el.save.disabled = true; setMsg('등록하는 중…', '');
    call('set_key', extra).then(function () {
      st.busy = false; el.save.disabled = false;
      el.key.value = '';
      st.ktest = null;                 // 키를 바꿨으면 지난 테스트 결과는 지운다(저절로 부르지는 않는다)
      setMsg('키를 등록했어요. 아래 「연결 테스트」를 누르면 바로 확인해 볼 수 있어요.', 'ok');
      st.keysLoaded = false;
      refreshKeys();
    }).catch(function (e) {
      st.busy = false; el.save.disabled = false;
      setMsg(errText(e), 'err');
    });
  }

  /* 연결 테스트 — 누를 때만 「안녕하세요」를 한 번 보내고 답·걸린 시간·모델 이름을 보여 준다. */
  function nowMs() {
    try { return window.performance.now(); } catch (e) { return Date.now(); }
  }

  function runKeyTest() {
    if (!loggedIn()) { setMsg('먼저 로그인해 주세요.', 'err'); return; }
    if (!hasKey()) { setMsg('먼저 키를 등록해 주세요.', 'err'); return; }
    if (st.ktest && st.ktest.state === 'run') return;
    st.ktest = { state: 'run' };
    renderKeys();
    var t0 = nowMs();
    call('ping').then(function (j) {
      var ms = typeof j.ms === 'number' ? j.ms : (nowMs() - t0);
      st.ktest = {
        state: 'ok',
        text: String(j.reply || '').slice(0, 120),
        model: String(j.model || ''),
        secs: (Math.max(0, ms) / 1000).toFixed(1),
        skipped: skipList(j.skipped),
        google: googleNote(j)
      };
      renderKeys();
    }).catch(function (e) {
      st.ktest = { state: 'err', text: errText(e), skipped: skipList(e && e.skipped), google: googleNote(e) };
      renderKeys();
    });
  }

  /* 서버가 준 «건너뛴 모델»은 모델명·사유·HTTP 코드만 쓴다. 모자란 값은 버린다. */
  function skipList(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 4).map(function (s) {
      return {
        model: String((s && s.model) || ''),
        reason: String((s && s.reason) || ''),
        code: Number((s && s.code) || 0)
      };
    }).filter(function (s) { return !!s.model; });
  }

  /* 타임아웃·5xx로 밀렸을 때만 서버가 실어 보내는 구글 공식 상태 한 줄. */
  function googleNote(j) {
    if (!j || !j.google_status) return null;
    return { text: String(j.google_status).slice(0, 200), url: String(j.google_status_url || '') };
  }

  function skipText(s) {
    return s.model + ' ' + s.reason + (s.code ? '(' + s.code + ')' : '');
  }

  function delKey(provider) {
    if (st.busy) return;
    st.busy = true;
    call('delete_key', { provider: provider }).then(function () {
      st.busy = false;
      st.ktest = null;
      setMsg('키를 지웠어요.', 'ok');
      refreshKeys();
    }).catch(function (e) {
      st.busy = false;
      setMsg(errText(e), 'err');
    });
  }

  function setMsg(s, kind) {
    st.msg = s; st.msgKind = kind || '';
    if (el.msg) {
      el.msg.textContent = s;
      el.msg.className = 'jca-msg' + (kind ? ' ' + kind : '');
    }
  }

  function renderGuide() {
    if (!el.guide) return;
    if (!st.guideOpen) {
      el.guide.innerHTML = '';
      var back = t('button', 'jca-link', '무료 키 발급 4단계 다시 보기');
      back.type = 'button';
      back.addEventListener('click', function () { st.guideOpen = true; renderKeys(); });
      el.guide.appendChild(back);
      return;
    }
    var i = Math.max(0, Math.min(st.step, GUIDE_STEPS.length - 1));
    var g = GUIDE_STEPS[i];
    el.guide.innerHTML = '';

    var hd = t('div', 'jca-guide-hd');
    hd.appendChild(t('b', null, '무료 키 만들기'));
    hd.appendChild(t('span', null, '4단계 · 30초'));
    el.guide.appendChild(hd);

    var fig = t('figure', 'jca-guide-fig');
    var img = t('img');
    img.src = BASE + 'assistant/guides/' + g.img;
    img.alt = 'Google AI Studio 에서 무료 키를 만드는 ' + (i + 1) + '단계 도해';
    img.width = 320; img.height = 200;
    img.loading = 'lazy';
    fig.appendChild(img);
    el.guide.appendChild(fig);

    var cap = t('div', 'jca-guide-cap');
    cap.appendChild(t('b', null, (i + 1) + '. ' + g.title));
    cap.appendChild(t('p', null, g.desc));
    if (g.link) {
      var a = t('a', 'jca-kpage', 'Google AI Studio 열기 ↗');      a.href = KEY_PAGE;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      cap.appendChild(a);
    }
    el.guide.appendChild(cap);

    var nav = t('div', 'jca-guide-nav');
    var prev = t('button', 'jca-arrow');
    prev.type = 'button';
    prev.setAttribute('aria-label', '이전 단계');
    prev.appendChild(chev('prev'));
    prev.disabled = i === 0;
    prev.addEventListener('click', function () { st.step = Math.max(0, i - 1); renderGuide(); });
    nav.appendChild(prev);

    /* 가운데 묶음 — 점 인디케이터와 「1 / 4」 를 한 덩이로 묶어 좌·우 화살표 사이 정가운데에 둔다 */
    var mid = t('div', 'jca-guide-mid');
    var dots = t('div', 'jca-dots');
    GUIDE_STEPS.forEach(function (_, k) {
      var d = t('button', 'jca-dot' + (k === i ? ' on' : ''));
      d.type = 'button';
      d.setAttribute('aria-label', (k + 1) + '단계로');
      d.setAttribute('aria-current', String(k === i));
      d.addEventListener('click', function () { st.step = k; renderGuide(); });
      dots.appendChild(d);
    });
    mid.appendChild(dots);
    mid.appendChild(t('span', 'jca-guide-n', (i + 1) + ' / ' + GUIDE_STEPS.length));
    nav.appendChild(mid);

    var next = t('button', 'jca-arrow');
    next.type = 'button';
    next.setAttribute('aria-label', '다음 단계');
    next.appendChild(chev('next'));
    next.disabled = i === GUIDE_STEPS.length - 1;
    next.addEventListener('click', function () { st.step = Math.min(GUIDE_STEPS.length - 1, i + 1); renderGuide(); });
    nav.appendChild(next);
    el.guide.appendChild(nav);

    var acts = t('div', 'jca-guide-acts');
    var skip = t('button', 'jca-btn', '이미 발급했어요');
    skip.type = 'button';
    skip.addEventListener('click', function () {
      st.guideOpen = false;
      renderKeys();
      var f = document.getElementById('jca-key-input');
      if (f) { try { f.focus({ preventScroll: false }); } catch (e) {} f.scrollIntoView({ block: 'center' }); }
    });
    acts.appendChild(skip);
    var go = t('a', 'jca-btn jca-kpage', '발급 페이지 열기 ↗');
    go.href = KEY_PAGE;
    go.target = '_blank';
    go.rel = 'noopener noreferrer';
    acts.appendChild(go);
    el.guide.appendChild(acts);
  }

  function renderKeys() {
    el.keyIntro.textContent = loggedIn()
      ? 'Google Gemini 키를 넣으면 「대화」에서 자료실 근거로 설명해 드려요. 키는 서버에서 암호화해 보관합니다.'
      : '키를 등록하려면 먼저 로그인해 주세요. 로그인은 아이디와 비밀번호만 씁니다.';

    /* 무료 키 발급 3단계 + 바로 가는 링크(새 탭) */
    el.keyHelp.innerHTML = '';
    el.keyHelp.appendChild(document.createTextNode('무료 키 만들기: '));
    var a = t('a', null, 'aistudio.google.com/apikey');
    a.href = KEY_PAGE;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.keyHelp.appendChild(a);

    renderGuide();

    el.keyList.innerHTML = '';
    st.keys.forEach(function (k) {
      var li = t('li', 'jca-key');
      var box = t('div', 'jca-key-n');
      box.appendChild(t('b', null, PROVIDER.name + ' · ' + (k.masked || '****')));
      box.appendChild(t('span', null, '등록됨 · 웹 교차 확인 사용 가능'));
      li.appendChild(box);
      var del = t('button', 'jca-del', '삭제');
      del.type = 'button';
      del.setAttribute('aria-label', 'Gemini 키 삭제');
      del.addEventListener('click', function () { delKey(PROVIDER.id); });
      li.appendChild(del);
      el.keyList.appendChild(li);
    });

    el.save.disabled = !loggedIn() || st.busy;
    el.key.disabled = !loggedIn();
    renderKeyTest();
  }

  function renderKeyTest() {
    if (!el.ktestBtn || !el.ktestOut) return;
    var res = st.ktest;
    var running = !!(res && res.state === 'run');
    el.ktestBtn.disabled = !loggedIn() || !hasKey() || running;
    el.ktestBtn.textContent = running ? '테스트 중…' : '연결 테스트';
    el.ktestOut.className = 'jca-ktest-out' + (res && res.state === 'err' ? ' err' : '');
    el.ktestOut.innerHTML = '';
    if (!res) { el.ktestOut.hidden = true; return; }
    el.ktestOut.hidden = false;
    if (res.state === 'run') {
      el.ktestOut.appendChild(t('p', null, '「안녕하세요」라고 보내는 중…'));
      return;
    }
    if (res.state === 'err') {
      el.ktestOut.appendChild(t('p', null, res.text || '테스트에 실패했어요.'));
      /* 실패해도 «어디서 밀렸는지»와 «구글 쪽 상태»는 그대로 보여 준다. */
      appendTestNotes(res);
      return;
    }
    el.ktestOut.appendChild(t('p', 'jca-ktest-say', '“' + (res.text || '연결됐어요') + '”'));
    var meta = t('p', 'jca-ktest-meta');
    meta.appendChild(t('b', null, '연결됨 · ' + res.secs + '초'));
    if (res.model) meta.appendChild(t('span', null, res.model));
    el.ktestOut.appendChild(meta);
    appendTestNotes(res);
  }

  /* 연결 테스트 카드 아래 진단 두 줄 — ① 건너뛴 모델과 이유 ② 구글 서버 상태. */
  function appendTestNotes(res) {
    if (res.skipped && res.skipped.length) {
      var line = t('p', 'jca-ktest-note');
      line.appendChild(t('b', null, res.skipped.length + '개 모델 건너뜀'));
      res.skipped.forEach(function (s, i) {
        var tail = i < res.skipped.length - 1 ? ',' : '';
        line.appendChild(t('span', 'jca-ktest-sk', skipText(s) + tail));
      });
      el.ktestOut.appendChild(line);
    }
    if (res.google && res.google.text) {
      var gs = t('p', 'jca-ktest-note jca-ktest-status');
      gs.appendChild(t('b', null, '구글 서버 상태'));
      var gt = t('span', 'jca-ktest-gtxt', res.google.text);
      gt.title = res.google.text;              // 좁은 화면에서 줄임표로 잘려도 전체 문장은 tooltip 으로
      gs.appendChild(gt);
      if (res.google.url) {
        var a = t('a', 'jca-ktest-link', '상태 페이지 ↗');
        a.href = res.google.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        gs.appendChild(a);
      }
      el.ktestOut.appendChild(gs);
    }
  }

  /* ---------- 그리기 ---------- */

  function renderWelcome() {
    if (!el.welcome) return;
    /* 찾기에서 이미 낱말을 처 올리면 첫 안내는 접는다 — 첫 결과가 화면 아래로 밀리지 않게.
       검색창을 비우면 다시 나온다. */
    var searching = st.tab === 'find' && !!(st.q || '').trim();
    var show = st.welcome && !(loggedIn() && hasKey()) && !searching;
    el.welcome.hidden = !show;
    el.welcome.innerHTML = '';
    if (!show) return;
    var hd = t('div', 'jca-w-hd');
    hd.appendChild(t('b', null, '자료실 비서예요'));
    var closeW = t('button', 'jca-mini', '접기');
    closeW.type = 'button';
    closeW.addEventListener('click', function () { st.welcome = false; savePref(); render(); });
    hd.appendChild(closeW);
    el.welcome.appendChild(hd);

    el.welcome.appendChild(t('p', 'jca-w-p',
      '지금은 로그인 없이도 자료실 전체를 바로 찾을 수 있어요. 내 AI 키를 연결하면 여기에 더해집니다.'));

    var ul = t('ul', 'jca-w-list');
    [
      '지금 보고 계신 자료를 쉽게 설명하고, 하위 문서로 이동까지 도와드려요',
      '내담자 눈높이 3줄 변환 · 모의면접·자기소개서 피드백',
      '구글 검색과 자료실을 교차 확인해 해석해 드려요 (Gemini 키)',
      '보던 흐름에 맞춰 다음 자료를 먼저 제안해 드려요'
    ].forEach(function (x) { ul.appendChild(t('li', null, x)); });
    el.welcome.appendChild(ul);

    var act = t('div', 'jca-w-act');
    var go = t('button', 'jca-btn jca-primary', loggedIn() ? '내 키 연결하기' : '로그인하고 키 연결');
    go.type = 'button';
    go.addEventListener('click', function () {
      if (!loggedIn()) {
        close();
        if (window.JCSync && window.JCSync.open) window.JCSync.open('login');
        return;
      }
      st.tab = 'key'; render();
    });
    act.appendChild(go);
    var find = t('button', 'jca-btn', '그냥 찾아보기');
    find.type = 'button';
    find.addEventListener('click', function () { st.tab = 'find'; render(); });
    act.appendChild(find);
    el.welcome.appendChild(act);

    var free = t('p', 'jca-w-free');
    free.appendChild(document.createTextNode('무료 키는 '));
    var fa = t('a', null, 'Google AI Studio');
    fa.href = KEY_PAGE;
    fa.target = '_blank';
    fa.rel = 'noopener noreferrer';
    free.appendChild(fa);
    free.appendChild(document.createTextNode('에서 30초면 만들 수 있어요.'));
    el.welcome.appendChild(free);

    var freeAct = t('div', 'jca-w-free-act');
    var how = t('button', 'jca-btn jca-btn-sm', '4단계로 알려 주기');
    how.type = 'button';
    how.addEventListener('click', function () { st.step = 0; st.tab = 'key'; render(); });
    freeAct.appendChild(how);
    el.welcome.appendChild(freeAct);
    el.welcome.appendChild(t('p', 'jca-w-priv', '대화는 나만 볼 수 있는 기록함에 보관돼요. 키는 서버에서 암호화해 보관합니다.'));
  }

  function render() {
    if (!el.panel) return;
    if (!st.tab) st.tab = loggedIn() ? 'chat' : 'find';
    Object.keys(el.tabs).forEach(function (k) {
      el.tabs[k].setAttribute('aria-selected', String(k === st.tab));
    });
    el.chatPane.hidden = st.tab !== 'chat';
    el.findPane.hidden = st.tab !== 'find';
    el.keysPane.hidden = st.tab !== 'key';

    el.sugBox2.checked = st.suggestOn;
    el.sugTog.setAttribute('aria-pressed', String(st.suggestOn));
    el.sugTog.innerHTML = '';
    el.sugTog.appendChild(t('span', null, '먼저 제안'));
    el.sugTog.appendChild(t('b', null, st.suggestOn ? '켜짐' : '꺼짐'));

    /* 첫 안내는 지금 탭의 «찾는 칸 아래»(찾기) 또는 «맨 위»(대화)에 둔다. */
    if (st.tab === 'find' && el.findPane && el.findSug.nextSibling !== el.welcome) el.findPane.insertBefore(el.welcome, el.findSug.nextSibling);
    else if (el.chatPane && el.welcome.parentNode !== el.chatPane) el.chatPane.insertBefore(el.welcome, el.chatPane.firstChild);
    renderWelcome();

    el.foot.innerHTML = st.tab === 'key'
      ? '<b>키는 암호화해 서버에</b> · 원본은 다시 보여 주지 않습니다'
      : (loggedIn()
        ? '<b>대화는 내 기록함에만</b> · 다른 사람은 볼 수 없습니다'
        : '<b>대화는 이 브라우저에만</b> · 로그인하면 계정에 보관합니다');

    if (st.tab === 'chat') renderChat();
    else if (st.tab === 'find') renderFind();
    else renderKeys();

    if (el.msg) el.msg.className = 'jca-msg' + (st.msgKind ? ' ' + st.msgKind : '');
  }

  /* ---------- 상담 프리셋으로 바로 가기 (?preset=) ----------
     대문의 프리셋 장부(assets/presets.js)를 읽어, 그 프리셋이 속한 모드로 맞춘 뒤 적용한다. */
  function applyPresetParam() {
    var m = /[?&]preset=([A-Za-z0-9_-]+)/.exec(location.search);
    if (!m) return;
    var id = m[1], P = window.JC_PRESETS;
    if (!P) return;
    var want = '';
    if ((P.seed || []).some(function (p) { return p && p.id === id; })) want = 'seed';
    else if ((P.match || []).some(function (p) { return p && p.id === id; })) want = 'match';
    if (!want) return;
    var cur = '';
    try { cur = localStorage.getItem('jc-mode') || ''; } catch (e) {}
    var guard = 'jc-preset-once:' + id;
    var once = false;
    try { once = sessionStorage.getItem(guard) === '1'; } catch (e) {}
    if (cur !== want && !once) {
      try { sessionStorage.setItem(guard, '1'); localStorage.setItem('jc-mode', want); } catch (e) {}
      location.reload();
      return;
    }
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (window.JCDECK && window.JCDECK.preset) {
        clearInterval(t);
        try { window.JCDECK.preset(id); } catch (e) {}
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        try { sessionStorage.removeItem(guard); } catch (e) {}
      } else if (tries > 60) { clearInterval(t); }
    }, 120);
  }

  /* ---------- 시작 ---------- */
  function boot() {
    loadLocal();
    st.userSeen = loggedIn() ? (sess().username || 'user') : '';
    if (!loggedIn()) {
      st.threads = st.localThreads.map(function (x) {
        return { id: x.id, title: x.title, turns: x.turns.length, updated: x.updated };
      });
      st.threadsLoaded = true;
    }
    recordPage();
    build();
    applyPresetParam();
    if (window.JCAssistSearch) loadIndex();
    render();
    if (loggedIn()) ensureHistory();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.JCAssistant = {
    open: open,
    openKeys: function () {
      st.tab = 'key';
      st.guideOpen = true;
      open();
      render();
    },
    close: close,
    history: function () { return st.thread.slice(); },
    threads: function () { return (loggedIn() ? st.threads : st.localThreads).slice(); },
    clear: clearChat,
    version: 4
  };
})();
