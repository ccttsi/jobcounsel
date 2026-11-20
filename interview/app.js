/* 21. 면접 전술 덱 — 화면 코드만(자료는 interview/data/deck.json, 피클 담당 · 읽기 전용).
   계약: interview/data/SCHEMA.md · rules.turn. 한 턴: 질문 착지 → 숨은 의도(+법적 근거) → 핸드 → 함정 먼저 → 방어·실드 → 타이머 → 카운터.
   턴 타이머는 자료실 고유 「잉크 악보선」(design/studies/2026-11-16-면접-턴-타이머.md). 내보내기 없음, 상시 rAF 루프 없음. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slots(s) { return esc(s).replace(/\[([^\]\n]{1,24})\]/g, '<span class="slot">[$1]</span>'); }
  var mq = matchMedia('(min-width:900px)'), rm = matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return rm.matches || d.documentElement.hasAttribute('data-jc-imm'); }

  var TABS = [['duel', '질문 대전'], ['rq', '마지막 역질문'], ['wp', '약점 조립기'], ['tr', '2026 전형 변화']];
  var WHEN = [['tomorrow', '내일이다', 'duel', 'structured_bei'], ['week', '이번 주다', 'wp', ''], ['none', '아직 없다', 'tr', '']];
  var K = null, CT = {}, MODE = {}, LG = {}, PR = {};
  var UI = { tab: 'duel', when: '', arena: 'standard', mode: '', enc: '', rqT: '', wp: '', wpL: 0, len: 0 };
  try { UI.len = +(sessionStorage.getItem('jc-iv-len') || 0) || 0; } catch (e) {}
  var TURN = { intent: false, flip: [], timerCard: -1 };

  fetch('./data/deck.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    K = j; j.vocabularies.card_types.forEach(function (c) { CT[c.code] = c; }); j.vocabularies.sub_modes.forEach(function (m) { MODE[m.code] = m; });
    j.vocabularies.legal_flags.forEach(function (f) { LG[f.code] = f; }); j.vocabularies.pressure_levels.forEach(function (p) { PR[p.level] = p; });
    readHash(); renderTop(); render();
    $('foot').textContent = '학습·실습용 참고 자료입니다. 합격을 보장하지 않으며, 카드의 문장은 예시입니다. 법률 자문이 아닙니다. 질문·카드는 자료실이 직접 만들었고, 법령·공공 안내는 출처를 밝히며 언론 보도는 사실과 수치만 인용합니다.';
  }).catch(function () { $('main').innerHTML = '<p class="foot">덱을 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>'; });

  function readHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (/^enc\d+$/.test(h) && encById(h)) { UI.tab = 'duel'; var e = encById(h); UI.enc = h; UI.arena = e.arena; UI.mode = e.sub_mode; }
    else if (/^wp\d+$/.test(h)) { UI.tab = 'wp'; UI.wp = h; }
    else if (h === 'rq' || h === 'tr' || h === 'wp' || h === 'duel') UI.tab = h;
  }
  function writeHash() { var h = UI.tab === 'duel' ? (UI.enc || 'duel') : UI.tab === 'wp' && UI.wp ? UI.wp : UI.tab; try { history.replaceState(null, '', '#' + h); } catch (e) {} }
  function encById(id) { for (var i = 0; i < K.encounters.length; i++) if (K.encounters[i].id === id) return K.encounters[i]; return null; }
  /* 대문 검색이 넘긴 ?q= — 그 질문이 들어 있는 면접 대결을 연다 */
  window.JCDeepLink = function (term) {
    var n = String(term || '').replace(/\s/g, '').toLowerCase();
    if (!n) return true;
    for (var i = 0; i < K.encounters.length; i++) {
      var e = K.encounters[i], hay = ((e.question || '') + ' ' + (e.sub_mode || '')).replace(/\s/g, '').toLowerCase();
      if (hay.indexOf(n) >= 0) { UI.tab = 'duel'; UI.enc = e.id; UI.arena = e.arena; UI.mode = e.sub_mode; renderTop(); render(); return true; }
    }
    return true;
  };

  function renderTop() {
    $('tabs').innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '">' + t[1] + '</button>'; }).join('');
    $('when').innerHTML = '<span>면접이 언제인가요</span>' + WHEN.map(function (w) { return '<button type="button" data-when="' + w[0] + '" aria-pressed="' + (UI.when === w[0]) + '">' + w[1] + '</button>'; }).join('');
  }
  function render() {
    stopTimer();
    var h = UI.tab === 'duel' ? duelHtml() : UI.tab === 'rq' ? rqHtml() : UI.tab === 'wp' ? wpHtml() : trHtml();
    $('main').innerHTML = h;
    if (UI.tab === 'duel') { if (!UI.enc) UI.enc = list()[0].id; drawTurn(true); } else syncDock();
    if (!still()) [].forEach.call($('main').querySelectorAll('.rqc,.trc,.solo'), function (el, i) { if (el.animate) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: Math.min(i, 8) * 34, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' }); });
    writeHash();
  }

  /* ───── 질문 대전 ───── */
  function list() { return K.encounters.filter(function (e) { return e.arena === UI.arena && (!UI.mode || e.sub_mode === UI.mode); }); }
  function duelHtml() {
    var A = K.vocabularies.arenas, M = K.vocabularies.sub_modes.filter(function (m) { return m.arena === UI.arena; });
    var h = '<div class="two"><section class="box pane list-pane" id="lp" aria-label="질문 카드 목록"><div class="ph"><div class="chips">' + A.map(function (a) { return '<button type="button" data-arena="' + a.code + '" aria-pressed="' + (UI.arena === a.code) + '">' + esc(a.label) + '</button>'; }).join('') + '</div>';
    h += '<div class="chips"><button type="button" data-mode="" aria-pressed="' + !UI.mode + '">모든 모드</button>' + M.map(function (m) { var n = K.encounters.filter(function (e) { return e.sub_mode === m.code; }).length; return '<button type="button" data-mode="' + m.code + '" aria-pressed="' + (UI.mode === m.code) + '" title="' + esc(m.one_line) + '">' + esc(m.label) + '<small>' + n + '</small></button>'; }).join('') + '</div></div>';
    h += '<div class="scr" id="encL">' + rowsHtml() + '</div></section>';
    h += '<section class="box pane field" aria-label="이번 턴"><div class="fbar"><button type="button" class="lst" data-lst>목록</button><button type="button" data-step="-1" aria-label="이전 질문">‹</button><span class="pos num" id="pos"></span><button type="button" data-step="1" aria-label="다음 질문">›</button></div><div class="fbody" id="turn"></div><div class="tdock" id="tdock" hidden></div></section></div>';
    return h;
  }
  function rowsHtml() {
    return list().map(function (e) { var n = +e.id.replace('enc', ''); return '<button type="button" class="row" data-enc="' + e.id + '" aria-current="' + (UI.enc === e.id) + '" style="--c:' + (e.legal_flag === 'violation_alert' ? 'var(--alert)' : e.legal_flag === 'caution' ? 'var(--warn)' : 'transparent') + '"><span class="no num">' + n + '</span><span class="nm">' + esc(e.question.length > 40 ? e.question.slice(0, 40) + '…' : e.question) + '<small>' + esc(MODE[e.sub_mode].label) + ' · ' + e.time_limit_sec + '초</small></span><span class="lg" aria-hidden="true"></span></button>'; }).join('');
  }
  function pips(n) { var h = '<span class="pips" aria-label="압박 ' + n + '단계 · ' + esc((PR[n] || {}).label || '') + '">'; for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return h + '</span>'; }
  function canFlip(e, i) {
    var c = e.hand_cards[i].card_type, f = TURN.flip, has = function (t) { return e.hand_cards.some(function (x, j) { return x.card_type === t && f.indexOf(j) > -1; }); };
    if (!TURN.intent) return false;
    if (c === 'trap') return true;
    if (c === 'defense' || c === 'shield') return has('trap');
    if (c === 'counter') return has('trap') && (has('defense') || has('shield'));
    return true;
  }
  function drawTurn(fresh) {
    var e = encById(UI.enc); if (!e) return;
    var L = list(), idx = L.indexOf(e);
    $('pos').textContent = (idx + 1) + ' / ' + L.length + ' · ' + MODE[e.sub_mode].label;
    var h = '<article class="qcard' + (fresh && !still() ? ' land' : '') + '"><p class="mt"><span class="mode">' + esc(e.interviewer) + '</span>' + pips(e.pressure_level) + '<span class="num">' + e.time_limit_sec + '초</span>' + (e.legal_flag !== 'ok' ? '<span class="flag ' + e.legal_flag + '">' + esc(LG[e.legal_flag].label) + '</span>' : '') + '</p><h2>「' + esc(e.question) + '」</h2><p class="ctx">' + esc(e.context) + '</p></article>';
    if (!TURN.intent) h += '<button type="button" class="next" data-intent>숨은 의도 보기 <span>그다음 손에 든 카드</span></button>';
    else {
      h += '<div class="lay' + (TURN.introJust ? ' in' : '') + '"><h3>숨은 의도 · 면접관이 확인하려는 것</h3><p>' + esc(e.hidden_intent) + '</p><p style="color:var(--muted)"><b style="color:var(--ink)">좋은 답이 보여 줄 것</b> · ' + esc(e.answer_goal) + '</p></div>';
      if (e.legal_flag !== 'ok') h += '<div class="law" style="--c:' + (e.legal_flag === 'violation_alert' ? 'var(--alert)' : 'var(--warn)') + '"><h3>' + esc(LG[e.legal_flag].label) + ' · ' + esc(LG[e.legal_flag].one_line) + '</h3><p>' + esc(e.legal_basis) + '</p><p class="can"><b>지원자가 할 수 있는 일</b> · ' + esc(e.legal_note) + '</p><p class="nl">질문을 읽는 기준이며 회사 평가가 아닙니다. 법률 자문이 아닙니다.</p></div>';
      h += '<div class="hand ' + (e.hand_cards.length === 4 ? 'h4' : 'h3') + (TURN.dealJust && !still() ? ' deal' : '') + '" role="group" aria-label="손에 든 카드">' + e.hand_cards.map(function (c, i) { return cardHtml(e, c, i); }).join('') + '</div>';
      h += '<p class="win"><b>이기는 조건</b> · ' + esc(K.rules.win_condition) + '</p>';
      h += '<p class="foot" style="margin-top:8px"><b>코치 한 줄</b> · ' + esc(e.coach_note) + '</p>';
    }
    $('turn').innerHTML = h; TURN.introJust = false; TURN.dealJust = false;
    $('encL') && $('encL').querySelectorAll('[data-enc]').forEach(function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-enc') === UI.enc)); });
    if (fresh) $('turn').scrollTop = 0;
    /* 답변 시간은 카드 흐름 밖의 판에서 펼친다 — 카드가 밀리지 않게 */
    var td = $('tdock');
    if (td) { var dh = timerHtml(e); if (td.innerHTML !== dh) td.innerHTML = dh; td.hidden = !dh; }
    syncDock();
    if (TURN.timerCard > -1) { if (!TM || TM.card !== TURN.timerCard || TM.len !== pace(e).T) armTimer(e); else syncTimer(); }
  }
  function cardHtml(e, c, i) {
    var t = CT[c.card_type], on = TURN.flip.indexOf(i) > -1, can = canFlip(e, i);
    var col = 'var(--c-' + c.card_type + ')', first = c.card_type === 'trap' && !on && TURN.intent;
    var hint = c.card_type === 'trap' ? '쓰지 않는 카드 · 왜 지는지 먼저' : !can ? (c.card_type === 'counter' ? '방어·실드를 연 뒤에' : '함정을 먼저 읽은 뒤에') : '누르면 뒤집힙니다';
    var ps = c.pace_split || {};
    return '<div class="slot-c"><button type="button" class="card ' + c.card_type + (on ? ' flip' : '') + '" data-card="' + i + '"' + (can ? '' : ' disabled') + ' aria-pressed="' + on + '" style="--c:' + col + '">' +
      '<span class="face front"><span class="ty"><b>' + esc(t.symbol) + '</b>' + esc(t.label) + '</span><h4>' + esc(c.title) + '</h4><p class="hint">' + hint + '</p>' + (first ? '<span class="rd">먼저 읽기</span>' : '') + '</span>' +
      '<span class="face back" aria-hidden="' + !on + '"><span class="ty"><b>' + esc(t.symbol) + '</b>' + esc(t.label) + ' · ' + esc(c.title) + '</span>' +
      (c.card_type === 'trap' ? '<p><b>왜 지는가</b> · ' + esc(c.why_effect) + '</p><p class="why">' + slots(c.script_formula) + '</p>' : '<span class="ex">예시 · 내 사실로 채우기</span><p>' + slots(c.script_formula) + '</p><p class="why">' + esc(c.why_effect) + '</p>') +
      '<p class="pc">' + esc(ps.note || '') + '</p></span></button></div>';
  }

  /* ───── 잉크 악보선 타이머 ───── */
  var TM = null;
  function timerHtml(e) {
    if (TURN.timerCard < 0) return '';
    var P = pace(e), p = P.p, T = P.T, base = e.time_limit_sec;
    var labs = String(p.note || '').split('·').map(function (s) { return s.trim().replace(/\s*\d+.*$/, ''); });
    if (labs.length !== 3 || labs.some(function (x) { return !x; })) labs = ['도입', '사례', '연결'];
    var a = p.intro / T * 100, b = (p.intro + p.case) / T * 100;
    return '<div class="tt" id="tt" style="--dur:' + T + 's"><div class="tt-line" aria-hidden="true"><i class="ink"></i><i class="mk" style="left:' + a + '%"></i><i class="mk" style="left:' + b + '%"></i></div>' +
      '<div class="tt-seg" aria-hidden="true"><span style="width:' + a + '%" data-s="0">' + esc(labs[0]) + ' ' + p.intro + '</span><span style="width:' + (b - a) + '%" data-s="1">' + esc(labs[1]) + ' ' + p.case + '</span><span style="flex:1" data-s="2">' + esc(labs[2]) + ' ' + p.link + '</span></div>' +
      '<div class="tt-len" role="group" aria-label="답변 시간"><span>답변 시간</span>' + [0].concat(K.vocabularies.time_limits).filter(function (v) { return v !== base; }).map(function (v) { var on = v === 0 ? !UI.len || UI.len === base : UI.len === v; return '<button type="button" data-len="' + v + '" aria-pressed="' + on + '">' + (v === 0 ? '질문 기준 ' + base + '초' : v + '초') + '</button>'; }).join('') + '</div>' +
      '<div class="tt-row"><span class="n num" id="ttN" aria-live="off">' + T + '<small>초</small></span><span class="sg" id="ttS">' + esc(labs[0]) + '부터</span><span class="sp"></span><button type="button" id="ttGo" data-tgo>말하기 시작</button><button type="button" class="g" id="ttRe" data-tre hidden>처음부터</button></div></div>';
  }
  /* 판의 높이만큼 바닥 고정 도구(형광펜·비서)를 위로 비켜 앉힌다 — 판이 오른쪽 아래를 덮지 않게 */
  var LIFT0 = null;
  function syncDock() {
    var td = $('tdock'), h = 0, lift = 0;
    if (td && !td.hidden) {
      var r = td.getBoundingClientRect(), fixed = getComputedStyle(td).position === 'fixed';
      h = td.offsetHeight;
      /* 펼침 모션(translateY) 중에 재도 어긋나지 않게, 바닥 고정 판은 layout 높이로 위쪽 끝을 구한다 */
      var top = fixed ? innerHeight - h : r.top;
      /* 판이 바닥 도구(형광펜·비서, 아래 16px 띄우고 높이 52px)의 띠에 닿을 때만 그 높이만큼 비켜 준다 */
      if (r.bottom > innerHeight - 68) lift = Math.max(0, Math.round(innerHeight - top) - 8);
    }
    var rt = d.documentElement;
    if (LIFT0 === null) LIFT0 = rt.style.getPropertyValue('--jca-lift') || '';
    rt.style.setProperty('--tdock-h', h + 'px');
    rt.style.setProperty('--tdock-lift', lift + 'px');
    rt.style.setProperty('--jca-lift', lift ? lift + 'px' : LIFT0);
    d.body.classList.toggle('tdock-on', h > 0);
  }
  /* 창 크기가 바뀌면 형광펜 도구가 스스로 다시 앉는다 — 판이 열려 있으면 그 뒤에 한 번 더 맞춘다 */
  addEventListener('resize', function () { if (d.body.classList.contains('tdock-on')) setTimeout(syncDock, 60); });
  /* 답변 시간 조절: 고른 길이에 맞춰 도입·사례·연결을 같은 비율로 늘리거나 줄인다(데이터는 그대로) */
  function pace(e) {
    var p0 = e.hand_cards[TURN.timerCard].pace_split, base = e.time_limit_sec, T = UI.len || base;
    if (T === base) return { T: base, p: p0 };
    var f = T / base, a = Math.max(1, Math.round(p0.intro * f)), b = Math.max(1, Math.round(p0.case * f));
    return { T: T, p: { intro: a, case: b, link: Math.max(0, T - a - b), note: p0.note } };
  }
  function armTimer(e) { var P = pace(e); TM = { card: TURN.timerCard, len: P.T, T: P.T, p: P.p, acc: 0, at: 0, run: false, iv: 0, low: false, seg: -1 }; }
  /* 화면을 다시 그려도 진행 중인 타이머를 이어 붙인다(잉크선은 음수 지연으로 같은 지점에서) */
  function syncTimer() {
    var el = $('tt'); if (!el || !TM) return;
    var t = TM.acc + (TM.run ? (performance.now() - TM.at) / 1000 : 0); if (!t) return;
    if (!still()) { el.classList.add('run'); el.querySelector('.ink').style.animationDelay = (-t) + 's'; }
    if (!TM.run) { el.classList.add('pause'); $('ttGo').textContent = '이어 말하기'; } else $('ttGo').textContent = '멈춤';
    if (TM.low) el.classList.add('low');
    $('ttRe').hidden = false; TM.seg = -1; tick();
  }
  function tGo() {
    var el = $('tt'); if (!el || !TM) return;
    if (TM.run) { TM.acc += (performance.now() - TM.at) / 1000; TM.run = false; clearInterval(TM.iv); el.classList.add('pause'); $('ttGo').textContent = '이어 말하기'; return; }
    TM.run = true; TM.at = performance.now(); el.classList.remove('pause');
    if (!el.classList.contains('run') && !still()) el.classList.add('run');
    $('ttGo').textContent = '멈춤'; $('ttRe').hidden = false;
    clearInterval(TM.iv); TM.iv = setInterval(tick, 250); tick();
  }
  function tick() {
    if (!TM) return; var el = $('tt'); if (!el) { stopTimer(); return; }
    var t = TM.acc + (TM.run ? (performance.now() - TM.at) / 1000 : 0), left = Math.ceil(TM.T - t), n = $('ttN');
    var seg = t < TM.p.intro ? 0 : t < TM.p.intro + TM.p.case ? 1 : 2;
    if (left >= 0) n.innerHTML = left + '<small>초</small>'; else { n.innerHTML = '<span class="over">+' + (-left) + '</span><small>초 넘김</small>'; }
    if (seg !== TM.seg) { TM.seg = seg; el.querySelectorAll('[data-s]').forEach(function (s) { s.classList.toggle('now', +s.getAttribute('data-s') === seg); }); var lb = el.querySelector('[data-s="' + seg + '"]'); $('ttS').textContent = left >= 0 ? '지금 · ' + lb.textContent.replace(/\s*\d+$/, '') : '시간을 넘겼습니다 · 기록만 합니다'; }
    if (left < 0) $('ttS').textContent = '시간을 넘겼습니다 · 기록만 합니다';
    if (left <= 15 && left > 0 && !TM.low && !still()) { TM.low = true; el.classList.add('low'); }
  }
  function tReset() { var e = encById(UI.enc); stopTimer(); armTimer(e); TM.low = false; var el = $('tt'); if (!el) return; el.outerHTML = timerHtml(e); syncDock(); }
  function stopTimer() { if (TM) { clearInterval(TM.iv); if (TM.run) TM.acc += (performance.now() - TM.at) / 1000; TM.run = false; } }
  d.addEventListener('visibilitychange', function () { if (d.hidden && TM && TM.run) tGo(); });

  /* ───── 역질문 ───── */
  var rqFirst = true;
  function rqHtml() {
    if (rqFirst && !mq.matches && !UI.rqT) UI.rqT = K.vocabularies.company_types[0]; rqFirst = false;
    var types = K.vocabularies.company_types, L = K.reverse_questions.filter(function (r) { return !UI.rqT || r.company_type === UI.rqT; });
    var h = '<section class="box pane"><div class="ph"><div class="chips"><button type="button" data-rqt="" aria-pressed="' + !UI.rqT + '">모든 기업 유형</button>' + types.map(function (t) { return '<button type="button" data-rqt="' + esc(t) + '" aria-pressed="' + (UI.rqT === t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div><div class="scr"><div class="rq">';
    h += L.map(function (r) { return '<article class="rqc"><p class="av"><b>쓰지 말아야 할 때</b> · ' + esc(r.avoid_when) + '</p><span class="ex">' + esc(r.company_type) + ' · 예시</span><h4>' + slots(r.question) + '</h4><dl><dt>확인</dt><dd>' + esc(r.verifies) + '</dd><dt>효과</dt><dd>' + esc(r.why_effect) + '</dd><dt>쓸 때</dt><dd>' + esc(r.when_to_use) + '</dd></dl></article>'; }).join('');
    return h + '</div></div></section>';
  }
  /* ───── 약점 조립기 ───── */
  var WS = [['acknowledge', '인정', '사실을 한 문장으로'], ['pivot', '전환', '그때 쓴 기준·관점'], ['proof', '증명', '행동과 숫자']];
  function wpHtml() {
    var h = '<section class="box pane"><div class="ph"><div class="wp" role="group" aria-label="내 상황">' + K.weakness_presets.map(function (w) { return '<button type="button" data-wp="' + w.id + '" aria-pressed="' + (UI.wp === w.id) + '">' + esc(w.label) + '</button>'; }).join('') + '</div></div><div class="scr" style="padding:14px" id="wpB">' + wpBody() + '</div></section>';
    return h;
  }
  function wpBody(anim) {
    var w = K.weakness_presets.filter(function (x) { return x.id === UI.wp; })[0];
    if (!w) return '<p class="foot" style="margin:0">상황을 고르면 흔한 실수를 먼저 보고, 인정 → 전환 → 증명 세 칸을 차례로 조립합니다.</p>';
    var h = '<div class="law" style="--c:var(--warn);margin-top:0"><h3>먼저 · 흔한 실수</h3><p>' + esc(w.avoid) + '</p></div><div class="steps">';
    WS.forEach(function (s, i) { var on = i < UI.wpL; h += '<div class="step' + (on ? '' : ' wait') + '"><h4>' + (i + 1) + ' · ' + s[1] + ' <span style="font-weight:600;color:var(--dim)">' + s[2] + '</span></h4><p>' + (on ? slots(w.steps[s[0]]) : '…') + '</p></div>'; });
    h += '</div>';
    if (UI.wpL < 3) h += '<button type="button" class="next" data-wpn>' + WS[UI.wpL][1] + ' 칸 열기 <span>' + (UI.wpL + 1) + ' / 3</span></button>';
    else h += '<div class="lay"><h3>직무로 잇는 마지막 한 문장</h3><p>' + slots(w.bridge) + '</p></div><div class="lay" style="--c:var(--slot)"><span class="ex">예시 · 내 사실로 채우기</span><p>' + slots(w.example) + '</p></div>';
    return h;
  }
  /* ───── 2026 전형 변화 ───── */
  var CF = { statute: '법령', public_standard: '공공 표준', reported: '보도', single_source: '한 출처에서만 확인됨' };
  function trHtml() {
    var S = {}; K.sources.forEach(function (s) { S[s.id] = s; });
    var h = '<section class="box pane"><div class="scr" style="padding:14px"><div class="tr">';
    h += K.trends_2026.map(function (t) { return '<details class="trc"' + (mq.matches ? ' open' : '') + '><summary><span class="cf ' + t.confidence + '">' + esc(CF[t.confidence] || t.confidence) + ' · ' + esc(t.as_of) + '</span><h4>' + esc(t.title) + '</h4></summary><p>' + esc(t.fact) + '</p><p>' + esc(t.evidence) + '</p><p class="im"><b>준비할 것</b> · ' + esc(t.implication) + '</p>' + (t.confidence === 'single_source' ? '<p style="color:var(--warn)">한 출처에서만 확인된 내용입니다. 지원하는 공고 원문에서 다시 확인하세요.</p>' : '') + '<p style="font-size:12px">출처 ' + t.source_ids.map(function (i) { return esc((S[i] || {}).publisher || i); }).join(' · ') + '</p></details>'; }).join('');
    h += '</div><p class="foot" style="margin-top:14px"><b>출처와 한계</b></p><ol class="src">' + K.sources.map(function (s) { return '<li>' + esc(s.publisher) + ' · ' + esc(s.name) + ' (' + esc(s.as_of) + ') <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">원문 ↗</a></li>'; }).join('') + '</ol>';
    return h + '</div></section>';
  }

  /* ───── 누르기 ───── */
  function newTurn(id) { stopTimer(); TM = null; UI.enc = id; TURN = { intent: false, flip: [], timerCard: -1 }; writeHash(); drawTurn(true); closeList(); }
  d.addEventListener('click', function (ev) {
    if (!K) return; var b = ev.target.closest('button'); if (!b) { if (ev.target.classList && ev.target.classList.contains('scrim')) closeList(); return; }
    if (b.hasAttribute('data-tab')) { UI.tab = b.getAttribute('data-tab'); renderTop(); render(); return; }
    if (b.hasAttribute('data-when')) { var w = WHEN.filter(function (x) { return x[0] === b.getAttribute('data-when'); })[0]; UI.when = w[0]; UI.tab = w[2]; if (w[3]) { UI.arena = 'standard'; UI.mode = w[3]; UI.enc = ''; TURN = { intent: false, flip: [], timerCard: -1 }; } renderTop(); render(); return; }
    if (b.hasAttribute('data-arena')) { UI.arena = b.getAttribute('data-arena'); UI.mode = ''; UI.enc = list()[0].id; TURN = { intent: false, flip: [], timerCard: -1 }; render(); return; }
    if (b.hasAttribute('data-mode')) { UI.mode = b.getAttribute('data-mode'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('encL').innerHTML = rowsHtml(); if (list().indexOf(encById(UI.enc)) < 0) newTurn(list()[0].id); else drawTurn(false); return; }
    if (b.hasAttribute('data-enc')) { newTurn(b.getAttribute('data-enc')); return; }
    if (b.hasAttribute('data-step')) { var L = list(), i = L.indexOf(encById(UI.enc)) + (+b.getAttribute('data-step')); if (i >= 0 && i < L.length) newTurn(L[i].id); return; }
    if (b.hasAttribute('data-lst')) { openList(); return; }
    if (b.hasAttribute('data-intent')) { TURN.intent = true; TURN.introJust = true; TURN.dealJust = true; drawTurn(false); return; }
    if (b.hasAttribute('data-card')) {
      var e = encById(UI.enc), ci = +b.getAttribute('data-card'), ct = e.hand_cards[ci].card_type;
      if (TURN.flip.indexOf(ci) < 0) TURN.flip.push(ci); else TURN.flip.splice(TURN.flip.indexOf(ci), 1);
      if ((ct === 'defense' || ct === 'shield') && TURN.flip.indexOf(ci) > -1 && (TURN.timerCard < 0 || !(TM && TM.run))) { TURN.timerCard = ci; stopTimer(); }
      var st = $('turn').scrollTop; drawTurn(false); $('turn').scrollTop = st;
      var nb = $('turn').querySelector('[data-card="' + ci + '"]'); if (nb) nb.focus({ preventScroll: true });
      return;
    }
    if (b.hasAttribute('data-tgo')) { tGo(); return; }
    if (b.hasAttribute('data-tre')) { tReset(); return; }
    if (b.hasAttribute('data-len')) { var v = +b.getAttribute('data-len'); UI.len = v; try { sessionStorage.setItem('jc-iv-len', String(v)); } catch (_) {} tReset(); return; }
    if (b.hasAttribute('data-rqt')) { UI.rqT = b.getAttribute('data-rqt'); render(); return; }
    if (b.hasAttribute('data-wp')) { UI.wp = b.getAttribute('data-wp'); UI.wpL = 0; d.querySelectorAll('[data-wp]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('wpB').innerHTML = wpBody(); writeHash(); return; }
    if (b.hasAttribute('data-wpn')) { UI.wpL++; $('wpB').innerHTML = wpBody(); var s = $('wpB').querySelectorAll('.step')[UI.wpL - 1]; if (s && s.animate && !still()) s.animate([{ opacity: .35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' }); return; }
  });
  var scrim = null;
  function openList() { var lp = $('lp'); if (!lp || mq.matches) return; lp.classList.add('open'); scrim = d.createElement('div'); scrim.className = 'scrim'; d.body.appendChild(scrim); d.documentElement.style.overflow = 'hidden'; var c = lp.querySelector('[aria-current="true"]'); if (c) c.scrollIntoView({ block: 'center' }); }
  function closeList() { var lp = $('lp'); if (lp) lp.classList.remove('open'); if (scrim) { scrim.remove(); scrim = null; } d.documentElement.style.overflow = ''; }
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeList(); });
  $('pvT').addEventListener('click', function () { var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기'; });
  $('rst').addEventListener('click', function () { stopTimer(); TM = null; closeList(); UI = { tab: 'duel', when: '', arena: 'standard', mode: '', enc: '', rqT: '', wp: '', wpL: 0, len: 0 }; try { sessionStorage.removeItem('jc-iv-len'); } catch (_) {} TURN = { intent: false, flip: [], timerCard: -1 }; renderTop(); render(); window.scrollTo(0, 0); });
  if (mq.addEventListener) mq.addEventListener('change', closeList);
})();
