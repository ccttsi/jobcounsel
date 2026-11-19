/* assistant.js — 자료실 비서 (모든 지면 공통 위젯)
 *
 * 세 화면
 *   1) 대화 — 로그인 + 내 AI 키가 있으면, 자료실 근거와 「지금 열려 있는 자료」로 설명해 준다.
 *      실무 모드 4종(쉬운 3줄 · 모의면접·서류 · 교차 비교 · 오프닝 질문)과 웹 교차 확인(Gemini).
 *   2) 찾기 — 로그인·키가 없어도 늘 켜져 있다. 자료실 통합 검색(assistant/search.js).
 *   3) 내 키 — Gemini(1순위)·OpenRouter·Groq·DeepSeek·OpenAI 호환 주소.
 *
 * 지키는 것
 *   - 질문·대화는 **서버에 저장하지 않는다.** 대화 기록은 이 브라우저(localStorage)에만 남고
 *     사용자가 직접 고치고 지울 수 있다. 먼저 제안은 브라우저 안에서만 계산한다(토큰 0).
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

  var CHAT_KEY = 'jc-assist-chat-v1';       // 대화 기록(이 브라우저에만)
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

  var st = {
    open: false, tab: '', q: '', results: [], searched: false, lastQ: '',
    busy: false, keys: [], keysLoaded: false,
    provider: 'gemini', msg: '', msgKind: '',
    thread: [], waitTurn: '',
    ctxOn: true, autoOpen: false, webOn: false, suggestOn: true, welcome: true, mode: '', step: 0, guideOpen: true,
    recent: [], sug: null
  };
  var el = {};
  var lastFocus = null;

  function t(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
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

  /* ---------- 브라우저에만 남기는 것 ---------- */
  function loadLocal() {
    try {
      var o = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}');
      if (o && Array.isArray(o.turns)) st.thread = o.turns.slice(-30);
    } catch (e) {}
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof p.ctxOn === 'boolean') st.ctxOn = p.ctxOn;
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
  function saveChat() {
    st.thread = st.thread.slice(-30);
    try {
      var s = JSON.stringify({ v: 1, turns: st.thread });
      if (s.length > 220000) st.thread = st.thread.slice(-12);
      localStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, turns: st.thread }));
    } catch (e) {}
  }
  function savePref() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        ctxOn: st.ctxOn, autoOpen: st.autoOpen, webOn: st.webOn,
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

  /* ---------- 지금 열려 있는 자료 ---------- */
  function isHubPage() {
    var p = location.pathname;
    return /\/(index\.html)?$/.test(p) && !/\/[a-z0-9_-]+\/index\.html$/i.test(p) && p.split('/').filter(Boolean).length === 0;
  }
  function pageCtx() {
    var main = document.querySelector('main') || document.querySelector('[data-jc-content]') || document.body;
    var h = main ? main.querySelector('h1, h2') : null;
    var meta = document.querySelector('meta[name="description"]');
    var text = main ? String(main.innerText || '') : '';
    text = text.replace(/\s+/g, ' ').trim();
    return {
      path: location.pathname + location.search + location.hash,
      title: (document.title || '').slice(0, 120),
      heading: h ? String(h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
      desc: meta ? String(meta.content || '').slice(0, 240) : '',
      text: isHubPage() ? '' : text.slice(0, 700)
    };
  }
  function ctxLabel() {
    var p = pageCtx();
    var nm = (isHubPage() ? p.title : (p.heading || p.title)) || p.path;
    return nm.length > 34 ? nm.slice(0, 33) + '…' : nm;
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

    el.chatSug = t('div', 'jca-sug');
    el.chatSug.hidden = true;
    chat.appendChild(el.chatSug);

    el.ctxRow = t('div', 'jca-ctx');
    el.ctxText = t('span', 'jca-ctx-t', '');
    el.ctxRow.appendChild(el.ctxText);
    var ctxToggle = t('label', 'jca-tog');
    el.ctxBox = t('input');
    el.ctxBox.type = 'checkbox';
    el.ctxBox.checked = st.ctxOn;
    el.ctxBox.addEventListener('change', function () { st.ctxOn = el.ctxBox.checked; savePref(); render(); });
    ctxToggle.appendChild(el.ctxBox);
    ctxToggle.appendChild(t('span', null, '함께 보내기'));
    el.ctxRow.appendChild(ctxToggle);
    chat.appendChild(el.ctxRow);

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
    var again = t('button', 'jca-link', '처음 안내 다시 보기');
    again.type = 'button';
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

    el.privacy = t('p', 'jca-note');
    el.privacy.innerHTML = '<b>질문과 대화 내용은 서버에 저장·로깅하지 않습니다.</b><br>' +
      '대화 기록은 이 브라우저에만 남고, 직접 고치거나 지울 수 있어요.<br>' +
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
      render();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === 'jc-sync-session') { st.keysLoaded = false; st.keys = []; if (st.open) refreshKeys(); render(); }
      if (e.key === CHAT_KEY) { st.thread = []; loadLocal(); render(); }
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
    if (loggedIn()) refreshKeys();
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
    withSearch(function () {
      window.JCAssistSearch.load().then(function () {
        st.sug = buildSuggestion();
        if (st.q) runSearch();
        render();
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
    st.results = window.JCAssistSearch.search(q, { limit: 12 });
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
        el.read.appendChild(t('span', 'jca-read-k jca-read-add', a.word));
      });
      if (info.situation) el.read.appendChild(t('span', 'jca-read-k jca-read-sit', '상담 상황으로 읽음'));
    } else {
      el.read.hidden = true;
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
      addLink(el.findNote, '로그인하기', function () {
        if (window.JCSync && window.JCSync.open) { close(); window.JCSync.open('login'); }
      });
    } else if (!hasKey()) {
      el.findNote.innerHTML = '<b>한 걸음만 더 하면 AI 설명이 켜져요.</b> Gemini 무료 키를 1순위로 권해 드려요.';
      var b = t('button', 'jca-link', '내 키 등록하기');
      b.type = 'button';
      b.addEventListener('click', function () { st.tab = 'key'; render(); });
      el.findNote.appendChild(t('br'));
      el.findNote.appendChild(b);
    } else {
      el.findNote.hidden = true;
    }
  }

  function addLink(host, label, fn) {
    var b = t('a', 'jca-link', label);
    b.href = '#';
    b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
    host.appendChild(t('br'));
    host.appendChild(b);
  }

  /* ---------- 대화 ---------- */

  function renderChat() {
    var ready = loggedIn() && hasKey();
    el.chatPane.classList.toggle('jca-off-mode', !ready);

    el.chatSug.hidden = !ready;
    if (ready) renderSuggestion(el.chatSug);

    el.ctxRow.hidden = !ready;
    if (ready) {
      el.ctxText.textContent = '지금 연 자료 · ' + ctxLabel();
      el.ctxBox.checked = st.ctxOn;
      el.ctxRow.classList.toggle('jca-ctx-off', !st.ctxOn);
    }

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
      el.thread.appendChild(intro);
    } else {
      var hd = t('div', 'jca-thread-hd');
      hd.appendChild(t('span', null, '대화 ' + st.thread.length + '개 · 이 브라우저에만 저장'));
      var clr = t('button', 'jca-mini', '전체 삭제');
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
      el.send.textContent = st.busy ? '정리 중…' : '묻기';
    } else {
      el.chatFoot.hidden = true;
      el.chatOff.hidden = false;
      el.chatOff.innerHTML = '';
      var box = t('div', 'jca-note');
      if (!loggedIn()) {
        box.innerHTML = '<b>AI 대화는 로그인과 내 키가 필요해요.</b> 지금은 「찾기」에서 자료실 전체를 바로 찾을 수 있어요.';
        addLink(box, '로그인하기', function () {
          if (window.JCSync && window.JCSync.open) { close(); window.JCSync.open('login'); }
        });
      } else {
        box.innerHTML = '<b>AI 대화를 켜려면 내 키가 필요해요.</b> Google Gemini 무료 키를 1순위로 권해 드려요.';
        var b2 = t('button', 'jca-link', '내 키 등록하기');
        b2.type = 'button';
        b2.addEventListener('click', function () { st.tab = 'key'; render(); });
        box.appendChild(t('br'));
        box.appendChild(b2);
      }
      var goFind = t('button', 'jca-btn', '찾기로 이동');
      goFind.type = 'button';
      goFind.addEventListener('click', function () { st.tab = 'find'; render(); });
      box.appendChild(t('br'));
      box.appendChild(goFind);
      el.chatOff.appendChild(box);
    }
    scrollThread();
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
      var w = t('div', 'jca-wait');
      w.appendChild(t('i'));
      w.appendChild(document.createTextNode('자료실 근거를 모아 답을 정리하고 있어요…'));
      ab.appendChild(w);
    } else {
      if (turn.mode || turn.websearch) {
        var tag = [];
        if (turn.mode) {
          var mm = MODES.filter(function (m) { return m.id === turn.mode; })[0];
          if (mm) tag.push(mm.label);
        }
        if (turn.websearch) tag.push('웹 교차 확인');
        if (tag.length) ab.appendChild(t('span', 'jca-a-tag', tag.join(' · ')));
      }
      var body = t('div', 'jca-a-b');
      body.textContent = turn.a || '';
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

      if (turn.ctx && turn.ctx.title) {
        ab.appendChild(t('span', 'jca-ctx-used', '함께 본 자료 · ' + turn.ctx.title.slice(0, 40)));
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
    if (!loggedIn()) { st.tab = 'find'; render(); if (window.JCSync) window.JCSync.open('login'); return; }
    if (!hasKey()) { st.tab = 'key'; render(); return; }
    ask(q, true);
  }

  function evidence(q) {
    if (!window.JCAssistSearch || !window.JCAssistSearch.ready()) return [];
    var r = window.JCAssistSearch.search(q, { limit: 5 });
    return r.map(function (x) {
      return { title: x.title, sector: x.sectorTitle || x.sector, url: x.url, snippet: x.snippet || '' };
    });
  }

  function ask(q, clearInput) {
    var turn = { id: newId(), ts: Date.now(), q: q, a: '', refs: [], web: [], wait: true,
                 mode: st.mode || '', websearch: st.webOn };
    if (st.ctxOn) turn.ctx = { title: ctxLabel(), path: pageCtx().path };
    st.thread.push(turn);
    st.busy = true;
    if (clearInput && el.chatInput) el.chatInput.value = '';
    render(); saveChat();

    var body = { question: q, evidence: evidence(q), provider: st.provider };
    if (st.mode) body.mode = st.mode;
    if (st.webOn) body.websearch = true;
    if (st.ctxOn) body.page = pageCtx();

    call('ask', body).then(function (j) {
      turn.wait = false;
      turn.a = j.answer || '';
      turn.refs = j.references || [];
      turn.web = j.web || [];
      turn.websearch = !!j.websearch;
    }).catch(function (e) {
      turn.wait = false; turn.err = true; turn.a = errText(e); turn.refs = []; turn.web = [];
    }).then(function () {
      st.busy = false;
      render(); saveChat();
      if (st.autoOpen && turn.refs && turn.refs.length && !turn.err) {
        setTimeout(function () { openRef(turn.refs[0].url); }, 1400);
      }
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
    if (!window.confirm('이 브라우저에 저장된 대화를 모두 지울까요? 되돌릴 수 없어요.')) return;
    st.thread = [];
    render(); saveChat();
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
      setMsg('키를 등록했어요. 이제 「대화」에서 AI 설명을 쓸 수 있습니다.', 'ok');
      st.keysLoaded = false;
      refreshKeys();
    }).catch(function (e) {
      st.busy = false; el.save.disabled = false;
      setMsg(errText(e), 'err');
    });
  }

  function delKey(provider) {
    if (st.busy) return;
    st.busy = true;
    call('delete_key', { provider: provider }).then(function () {
      st.busy = false;
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
      var a = t('a', 'jca-kpage', 'Google AI Studio 열기 ↗');
      a.href = KEY_PAGE;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      cap.appendChild(a);
    }
    el.guide.appendChild(cap);

    var nav = t('div', 'jca-guide-nav');
    var prev = t('button', 'jca-arrow', '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', '이전 단계');
    prev.disabled = i === 0;
    prev.addEventListener('click', function () { st.step = Math.max(0, i - 1); renderGuide(); });
    nav.appendChild(prev);

    var dots = t('div', 'jca-dots');
    GUIDE_STEPS.forEach(function (_, k) {
      var d = t('button', 'jca-dot' + (k === i ? ' on' : ''));
      d.type = 'button';
      d.setAttribute('aria-label', (k + 1) + '단계로');
      d.setAttribute('aria-current', String(k === i));
      d.addEventListener('click', function () { st.step = k; renderGuide(); });
      dots.appendChild(d);
    });
    nav.appendChild(dots);
    nav.appendChild(t('span', 'jca-guide-n', (i + 1) + ' / ' + GUIDE_STEPS.length));

    var next = t('button', 'jca-arrow', '›');
    next.type = 'button';
    next.setAttribute('aria-label', '다음 단계');
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
  }

  /* ---------- 그리기 ---------- */

  function renderWelcome() {
    if (!el.welcome) return;
    var show = st.welcome && !(loggedIn() && hasKey());
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
    free.appendChild(document.createTextNode('에서 30초면 만들 수 있어요. '));
    var how = t('button', 'jca-link', '4단계로 알려 주기');
    how.type = 'button';
    how.addEventListener('click', function () { st.step = 0; st.tab = 'key'; render(); });
    free.appendChild(how);
    el.welcome.appendChild(free);
    el.welcome.appendChild(t('p', 'jca-w-priv', '질문과 대화는 서버에 저장·로깅하지 않습니다. 키는 서버에서 암호화해 보관해요.'));
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
      : '<b>대화 기록은 이 브라우저에만</b> · 질문은 서버에 저장하지 않습니다';

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
    recordPage();
    build();
    applyPresetParam();
    if (window.JCAssistSearch) loadIndex();
    render();
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
    clear: clearChat,
    version: 3
  };
})();
