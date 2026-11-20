/* assemble.js — 문장·키워드 하나로 완성덱 세 개를 짜는 엔진 (2026-11-20)
 *
 * 쓰는 곳
 *   mydeck/  — 「마이덱 라이브」(목적 문장) · 「마이덱 알고리즘」(개념 하나 딸깍)
 *   flow/    — ① 어디서 시작할까요 카드의 뒷면(마이덱 · 알고리즘 / 라이브)
 *
 * 무엇을 하나
 *   자료실 색인과 시너지 지도에서 걸리는 섹터를 모아(pool) → 상담의 자리(갈래)별로 하나씩 골라
 *   서로 다른 세 가지 완성덱을 짠다(courses). 덱의 중간 노드에서 갈라지는 다음 자료를 만들고(branches),
 *   아래를 새로 이어 붙인다(extend).
 *
 * 지키는 선
 *   · 색인에 없는 섹터·수치·조문은 세우지 않는다.
 *   · 저장은 JCDeck이 맡는다 — 이 파일은 짜기만 한다.
 *   · 움직이는 값은 transform·opacity 뿐. 글자 타자는 한 글자마다 textContent만 바꾼다.
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
    if (t) return { id: id, no: t.no || '', title: t.title || id, badge: t.badge || '', desc: t.desc || '', meta: t.meta || [], path: t.path || './' + id + '/', gi: t.gi || '' };
    var gs = ((st.graph && st.graph.sectors) || []);
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].id === id) return { id: id, no: gs[i].no || '', title: gs[i].title || id, badge: gs[i].badge || '', desc: gs[i].desc || '', meta: gs[i].meta || [], path: gs[i].path || './' + id + '/', gi: gs[i].gi || '' };
    }
    return { id: id, no: '', title: id, badge: '', desc: '', meta: [], path: './' + id + '/', gi: '' };
  }

  /* ================================================================ 읽기 */
  var st = { engine: 'idle', engP: null, graph: null, wait: null };
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

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
    st.wait = Promise.all([loadEngine(), loadGraph()]).then(function () { return true; }, function (e) {
      st.wait = null;
      throw e;
    });
    return st.wait;
  }

  /* ================================================================ 갈래·코스 */
  /* 배열 차례가 곧 그 갈래에서 먼저 꺼내는 기본 차례다. */
  var CATS = {
    '진단': ['triage', 'hud', 'reality', 'work-filter', 'vpi'],
    '이론': ['theory', 'talk', 'parsons', 'translator'],
    '직무': ['dacum', 'taxonomy', 'valuechain', 'decalcomania'],
    '기업': ['company', 'fin-lab', 'thermometer', 'labor', 'briefing', 'library', 'emerging'],
    '훈련': ['kdt-calc', 'cert', 'univ', 'grad'],
    '제도': ['manual', 'law'],
    '실전': ['interview', 'surgery', 'portfolio', 'portals', 'transit']
  };
  var CAT_OF = {};
  Object.keys(CATS).forEach(function (c) { CATS[c].forEach(function (id) { if (!CAT_OF[id]) CAT_OF[id] = c; }); });
  var HIT = 2.6;   /* 갈래의 기본 단계를 밀어내려면 그만큼 뚜렷이 걸려야 한다 */

  var COURSE_DEF = [
    { id: 'std', tag: '정석 적용형', title: '접수 진단에서 마무리까지, 차례로',
      seq: ['진단', '이론', '직무', '기업', '제도', '실전'],
      why: '내담자를 만나는 순서 그대로 — 진단으로 열고, 이론 틀과 직무·기업 자료를 거쳐 제도 조건을 확인한 뒤 실전으로 닫습니다.' },
    { id: 'drill', tag: '실전 연습형', title: '발문과 리허설로 먼저 익히기',
      seq: ['이론', '진단', '실전', '제도'],
      why: '대화·발문 연습을 맨 앞에 두고, 진단 뒤에 서류·면접을 바로 붙여 손으로 익힌 다음 제도로 근거를 채웁니다.' },
    { id: 'case', tag: '사례·법령 집중형', title: '제도와 법령 근거를 먼저 세우기',
      seq: ['제도', '진단', '훈련', '기업', '실전'],
      why: '법령·제도 요건을 먼저 확인하고, 자격·훈련과 기업 정보로 근거를 채운 뒤 실전 서류로 마무리합니다.' }
  ];

  function pool(q) {
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
    var g = st.graph;
    if (g) {
      (g.starts || []).forEach(function (s) {
        if (!s.k || nq.indexOf(norm(s.k)) < 0) return;
        (s.to || []).forEach(function (id) { bump(id, 2.4, s.k); });
      });
      Object.keys(g.kw || {}).forEach(function (k) {
        if (k.length < 2 || nq.indexOf(norm(k)) < 0) return;
        (g.kw[k] || []).forEach(function (id) { bump(id, 0.3, k); });
      });
    }
    (S.search(q, { limit: 40, perSector: 40 }) || []).forEach(function (r) {
      if ((r.score || 0) < 8) return;
      bump(r.sector, 0.15 + Math.min(0.6, (r.score || 0) / 60), '');
    });
    return Object.keys(out).map(function (k) { return out[k]; })
      .filter(function (x) { return x.score >= 1.2; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function deckName(q, tag) {
    var s = String(q || '').replace(/\s+/g, ' ').trim();
    if (s.length > 34) s = s.slice(0, 33) + '…';
    return (s || '내 상담 흐름') + ' · ' + tag;
  }

  function courses(q) {
    if (!window.JCAssistSearch) return [];
    var list = pool(q);
    if (!list.length) return [];
    var best = {};
    list.forEach(function (p) {
      var c = CAT_OF[p.id];
      if (!c || p.score < HIT) return;
      if (!best[c] || best[c].score < p.score) best[c] = p;
    });
    var out = [];
    COURSE_DEF.forEach(function (def) {
      var steps = [], used = {}, hitCount = 0;
      def.seq.forEach(function (cat) {
        var pick = best[cat];
        if (pick && !used[pick.id]) {
          used[pick.id] = 1; hitCount++;
          steps.push({ id: pick.id, hit: true, why: pick.why || [] });
          return;
        }
        var arr = CATS[cat] || [], d = null;
        for (var i = 0; i < arr.length && !d; i++) if (!used[arr[i]]) d = arr[i];
        if (!d) return;
        used[d] = 1;
        steps.push({ id: d, hit: false, why: [] });
      });
      if (steps.length < 3) return;
      var hits = [];
      steps.forEach(function (s) {
        if (!s.hit) return;
        (s.why || []).forEach(function (w) { if (w && hits.indexOf(w) < 0 && hits.length < 3) hits.push(w); });
      });
      out.push({
        id: def.id, seq: def.seq, tag: def.tag, title: def.title, why: def.why,
        steps: steps, hits: hits, hitCount: hitCount, name: deckName(q, def.tag), edited: false
      });
    });
    return out;
  }

  /* 중간 노드에서 갈라지는 다음 자료 */
  function branches(steps, i) {
    var ids = {}, seen = {}, out = [];
    steps.forEach(function (s) { ids[s.id] = 1; });
    var node = (steps[i] || {}).id;
    if (!node) return out;
    var g = st.graph;
    if (g && g.pairs) {
      g.pairs.filter(function (p) { return p.a === node || p.b === node; })
        .sort(function (a, b) { return (b.w || 0) - (a.w || 0); })
        .forEach(function (p) {
          var other = p.a === node ? p.b : p.a;
          if (!other || other === 'flow' || ids[other] || seen[other] || !toolOf(other)) return;
          seen[other] = 1;
          var why = (p.link ? '자료실 연결 짝' : '겹치는 말');
          if (p.shared && p.shared.length) why += ' · ' + p.shared.slice(0, 2).join(' · ');
          out.push({ id: other, why: why, kind: 'pair' });
        });
    }
    var cat = CAT_OF[node] || '';
    (CATS[cat] || []).forEach(function (id) {
      if (ids[id] || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, why: '같은 갈래의 다음 자리', kind: 'cat' });
    });
    return out.slice(0, 3);
  }

  /* 그 아래를 새로 이어 붙인다 — 갈래 차례를 따라 두 칸 */
  function extend(steps, i, seq) {
    var ids = {}, used = {};
    steps.forEach(function (s) { ids[s.id] = 1; });
    var node = (steps[i] || {}).id;
    var order = (seq && seq.length ? seq : ['진단', '이론', '직무', '기업', '제도', '실전']);
    var at = order.indexOf(CAT_OF[node]);
    if (at < 0) at = 0;
    var out = [];
    for (var k = at + 1; k < order.length && out.length < 2; k++) {
      var arr = CATS[order[k]] || [], pick = null;
      for (var j = 0; j < arr.length && !pick; j++) if (!ids[arr[j]] && !used[arr[j]]) pick = arr[j];
      if (!pick) continue;
      used[pick] = 1;
      out.push({ id: pick, hit: false, why: [] });
    }
    return out;
  }

  /* 문장으로 이어 붙이기 — 라이브 방식. 노드 뒤에 오는 갈래를 우선해 두 칸을 고른다.
     알고리즘으로 짠 덱이든 라이브로 짠 덱이든 같은 자리에서 부를 수 있다. */
  function branchLive(steps, i, q, seq) {
    if (!window.JCAssistSearch || !String(q || '').trim()) return [];
    var ids = {}, out = [];
    steps.forEach(function (s) { ids[s.id] = 1; });
    var node = (steps[i] || {}).id;
    var order = (seq && seq.length ? seq : ['진단', '이론', '직무', '기업', '제도', '실전']);
    var at = Math.max(0, order.indexOf(CAT_OF[node]));
    var list = pool(q);
    list.forEach(function (x) {
      if (out.length >= 2 || ids[x.id]) return;
      var ci = order.indexOf(CAT_OF[x.id]);
      if (ci >= at) { ids[x.id] = 1; out.push({ id: x.id, hit: true, why: [x.why[0] || q] }); }
    });
    if (!out.length) {
      for (var k = at + 1; k < order.length && !out.length; k++) {
        var arr = CATS[order[k]] || [];
        for (var j = 0; j < arr.length; j++) if (!ids[arr[j]]) { ids[arr[j]] = 1; out.push({ id: arr[j], hit: false, why: [] }); break; }
      }
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
    '이론공부 실무에 적용하기',
    '경력단절 내담자 첫 상담 흐름 짜기',
    '반도체 공정 직무랑 기업 연결하기',
    '국비지원 자부담 계산하고 훈련 추천하기',
    '실업급여 수급 자격 확인하기',
    '임금체불 내담자 법령 근거 찾기',
    '중장년 전직 상담 순서 잡기',
    '청년 구직자 진로 검사 해석하기',
    '면접 답변 코칭 준비하기',
    '자격증 따면 취업되는지 확인하기',
    '신산업 직무 변화 설명하기',
    '기업 재무제표 읽고 상담하기',
    '근무환경 견딜 수 있는지 확인하기',
    '학과와 직업 연결해서 안내하기',
    '취업 현위치 객관적으로 재기',
    '내담자 말을 정식 용어로 바꾸기',
    '고용지표로 노동시장 설명하기',
    '서류 탈락 이유 짚어 주기',
    '커리어 전환 환승역 찾기',
    '산업 온도로 전망 말해 주기',
    '채용 사이트 골라 안내하기',
    '직무분석으로 과업 정리하기',
    '경력단절 여성 훈련 과정 고르기',
    '상담 대화 연습하고 피드백 받기',
    '포트폴리오 구조 잡아 주기',
    '대학원 진학 상담 이어 가기',
    '국민취업지원제도 먼저 붙이기',
    '사례 하나로 상담 전체 훑기',
    '직업분류 코드로 직무 맞대기',
    '상담 기록 남길 순서 정하기'
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
        if (onValue) onValue(ask.value);
        if (String(ask.value || '').length) { stop(); if (ph) ph.classList.add('off'); }
        else { t.i = 0; t.j = 0; t.dir = 'in'; setTimeout(start, 500); }
      });
      ask.addEventListener('focus', function () { stop(); if (ph) ph.classList.add('off'); });
      ask.addEventListener('blur', function () {
        if (!String(ask.value || '').length) { t.i = 0; t.j = 0; t.dir = 'in'; start(); }
      });
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

    return { start: start, stop: stop, paint: paint };
  }

  /* ================================================================ 튜토리얼 — 어두운 베일 + 입력칸만 밝게 */
  function tutorial(field) {
    if (!field) return;
    var old = document.querySelector('.tu');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var r = field.getBoundingClientRect();
    var pad = 8;
    var ov = document.createElement('div');
    ov.className = 'tu on';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '입력창 사용법');
    var spot = document.createElement('div');
    spot.className = 'tu-spot';
    spot.style.left = Math.round(r.left - pad) + 'px';
    spot.style.top = Math.round(r.top - pad) + 'px';
    spot.style.width = Math.round(r.width + pad * 2) + 'px';
    spot.style.height = Math.round(r.height + pad * 2) + 'px';
    ov.appendChild(spot);

    var cap = document.createElement('div');
    cap.className = 'tu-cap';
    var k = document.createElement('span');
    k.className = 'tu-step';
    k.textContent = '한 문장이면 충분합니다';
    cap.appendChild(k);
    var p = document.createElement('p');
    var b1 = document.createElement('b');
    b1.textContent = '하고 싶은 일을 그대로 적으세요.';
    p.appendChild(b1);
    p.appendChild(document.createTextNode(' 「경력단절 내담자 첫 상담 흐름 짜기」처럼 적고 「완성덱 만들기」를 누르면, 자료실 색인에서 걸리는 섹터로 '));
    var b2 = document.createElement('b');
    b2.textContent = '세 가지 완성덱';
    p.appendChild(b2);
    p.appendChild(document.createTextNode('을 짜 줍니다. 마음에 드는 하나를 고르면 내 덱에 저장되고 상담 OS 보드가 열립니다.'));
    cap.appendChild(p);
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '알겠어요';
    cap.appendChild(ok);
    ov.appendChild(cap);

    var space = window.innerHeight - r.bottom;
    if (space > 200) cap.style.top = Math.round(r.bottom + 20) + 'px';
    else cap.style.bottom = Math.round(window.innerHeight - r.top + 20) + 'px';

    function close() {
      ov.classList.remove('on');
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 180);
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', esc, true);
    }
    function esc(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ok.addEventListener('click', close);
    document.addEventListener('keydown', esc, true);
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });
    setTimeout(function () { try { ok.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  /* ================================================================ 완성덱 카드 (수정 가능) */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  function cards(host, list, opts) {
    opts = opts || {};
    clear(host);
    list.forEach(function (c) { host.appendChild(card(c, opts)); });
  }

  function card(c, opts) {
    var box = el('article', 'lv-course');

    function paint() {
      clear(box);
      var top = el('div', 'lv-c-top');
      top.appendChild(el('span', 'lv-c-tag', c.tag));
      top.appendChild(el('span', 'lv-c-n', c.steps.length + '단계' + (c.edited ? ' · 고침' : '')));
      box.appendChild(top);
      box.appendChild(el('h3', null, c.title));

      var why = el('p', 'lv-c-why');
      if (c.hits.length) {
        var b = el('b', null, c.hits.map(function (w) { return '「' + w + '」'; }).join(' '));
        why.appendChild(b);
        why.appendChild(document.createTextNode(' 에서 걸린 섹터 ' + c.hitCount + '곳으로 짰습니다. '));
      } else {
        why.appendChild(document.createTextNode('걸린 섹터가 적어 기본 순서로 채웠습니다. '));
      }
      why.appendChild(document.createTextNode(c.why));
      box.appendChild(why);

      var ol = el('ol', 'lv-c-steps');
      c.steps.forEach(function (s, i) {
        var li = el('li');
        var btn = el('button', 'ac-step');
        btn.type = 'button';
        btn.setAttribute('aria-label', (i + 1) + '단계 ' + sector(s.id).title + ' — 눌러서 갈라지는 자료 보기');
        btn.appendChild(el('span', 'n', String(i + 1)));
        var tx = el('span', 't');
        tx.appendChild(el('b', null, sector(s.id).title));
        tx.appendChild(el('em', null, s.hit && s.why.length ? '「' + s.why[0] + '」에서 걸림' : (s.hit ? '색인에서 걸림' : '이 순서에 늘 놓는 단계')));
        btn.appendChild(tx);
        btn.addEventListener('click', function () { toggleBranch(li, c, i, paint, opts); });
        li.appendChild(btn);
        ol.appendChild(li);
      });
      box.appendChild(ol);

      var go = el('button', 'lv-c-go', opts.label || '이 흐름으로 열기');
      go.type = 'button';
      go.addEventListener('click', function () { if (opts.onPick) opts.onPick(c, go); });
      box.appendChild(go);
    }

    paint();
    return box;
  }

  /* 노드에서 갈라지기 — 알고리즘(후보 추천)과 라이브(문장) 두 방식 모두 이 자리에서 */
  function toggleBranch(li, c, i, paint, opts) {
    var next = li.nextSibling;
    if (next && next.classList && next.classList.contains('ac-branch')) { li.parentNode.removeChild(next); return; }
    Array.prototype.forEach.call(li.parentNode.parentNode.querySelectorAll('.ac-branch'), function (n) { n.parentNode.removeChild(n); });

    var box = el('div', 'ac-branch');
    var hd = el('p', 'ac-b-hd');
    hd.appendChild(el('b', null, (i + 1) + '단계 뒤에 이어 붙이기'));
    hd.appendChild(el('span', null, '자료를 고르거나, 할 일을 한 문장으로 적으세요'));
    box.appendChild(hd);

    var tabs = el('div', 'ac-b-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '브랜치 전개 방식');
    var body = el('div', 'ac-b-body');
    var mode = 'algo';

    function insert(step, limit) {
      var at = i + 1;
      var tail = limit ? [] : c.steps.slice(at);
      c.steps = c.steps.slice(0, at).concat([step]).concat(tail.filter(function (s) { return s.id !== step.id; }));
      c.edited = true;
      paint();
      if (opts.onEdit) opts.onEdit(c);
    }
    function insertMany(list) {
      if (!list.length) return;
      var at = i + 1;
      var tail = c.steps.slice(at).filter(function (s) {
        return !list.some(function (x) { return x.id === s.id; });
      });
      c.steps = c.steps.slice(0, at).concat(list).concat(tail);
      c.edited = true;
      paint();
      if (opts.onEdit) opts.onEdit(c);
    }

    function paintBody() {
      clear(body);
      Array.prototype.forEach.call(tabs.children, function (b) {
        var on = b.getAttribute('data-m') === mode;
        b.setAttribute('aria-selected', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      if (mode === 'algo') {
        var list = branches(c.steps, i);
        list.forEach(function (b) {
          var btn = el('button', 'ac-b');
          btn.type = 'button';
          var t = el('span', 'ac-b-t');
          t.appendChild(el('b', null, sector(b.id).title));
          t.appendChild(el('em', null, b.why));
          btn.appendChild(t);
          btn.appendChild(el('span', 'ac-b-add', '넣기'));
          btn.addEventListener('click', function () { insert({ id: b.id, hit: true, why: [String(b.why).split(' · ')[0]] }); });
          body.appendChild(btn);
        });
        if (!list.length) body.appendChild(el('p', 'ac-b-note', '이 노드에서 갈라지는 자료를 찾지 못했습니다. 「문장으로」에서 할 일을 적어 보세요.'));

        var more = el('button', 'ac-b alt');
        more.type = 'button';
        var mt = el('span', 'ac-b-t');
        mt.appendChild(el('b', null, '이 아래를 새로 짜기'));
        mt.appendChild(el('em', null, '여기서부터 갈래 차례대로'));
        more.appendChild(mt);
        more.appendChild(el('span', 'ac-b-add', '다시 짜기'));
        more.addEventListener('click', function () {
          var tail = extend(c.steps, i, c.seq);
          if (!tail.length) return;
          c.steps = c.steps.slice(0, i + 1).concat(tail);
          c.edited = true;
          paint();
          if (opts.onEdit) opts.onEdit(c);
        });
        body.appendChild(more);
        return;
      }

      /* 라이브 — 할 일을 한 문장으로 적으면 그 말에 걸리는 섹터로 이어 붙인다 */
      var live = el('div', 'ac-b-live');
      var lab = el('label', 'sr', '이어 붙일 일 한 문장');
      lab.setAttribute('for', 'acIn' + i + '-' + c.id);
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ac-b-in';
      inp.id = 'acIn' + i + '-' + c.id;
      inp.maxLength = 120;
      inp.autocomplete = 'off';
      inp.placeholder = '예) 이 내담자에게 맞는 훈련 과정 찾기';
      var go = el('button', 'ac-b-go', '이어 붙이기');
      go.type = 'button';
      var msg = el('p', 'ac-b-note');
      go.addEventListener('click', function () {
        var q = String(inp.value || '').trim();
        if (!q) { msg.textContent = '이어 붙일 일을 한 문장으로 적어 주세요.'; inp.focus(); return; }
        msg.textContent = '자료실 색인에서 찾는 중…';
        load().then(function () {
          var add = branchLive(c.steps, i, q, c.seq);
          if (!add.length) { msg.textContent = '이 말에서 걸리는 자료를 찾지 못했습니다. 다른 말로 적어 보세요.'; return; }
          insertMany(add);
        }, function () { msg.textContent = '자료실 색인을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'; });
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go.click(); } });
      live.appendChild(lab);
      live.appendChild(inp);
      live.appendChild(go);
      body.appendChild(live);
      body.appendChild(msg);
      setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 40);
    }

    [['algo', '알고리즘'], ['live', '문장으로']].forEach(function (m) {
      var b = el('button', null, m[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-m', m[0]);
      b.addEventListener('click', function () { mode = m[0]; paintBody(); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    box.appendChild(body);
    paintBody();
    li.parentNode.insertBefore(box, li.nextSibling);
  }

  window.JCAssemble = {
    load: load,
    graph: function () { return st.graph; },
    sector: sector,
    courses: courses,
    branches: branches,
    branchLive: branchLive,
    extend: extend,
    cards: cards,
    typing: typing,
    tutorial: tutorial,
    shortQ: shortQ,
    SENT: SENT,
    CHIPS: ['경력단절여성', '국민취업지원제도', '실업급여', '직무분석', '자격증', '훈련', '면접', '기업', '청년', '중장년', '상담', '이직', '신산업', '직업상담사'],
    CAT_OF: CAT_OF,
    CATS: CATS
  };
})();
