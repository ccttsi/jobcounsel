/* 20. 서류·공고 해부실 — 화면 코드만(자료는 surgery/data/, 피클 담당 · 읽기 전용).
   계약: surgery/data/SCHEMA.md. lexicon.json은 조립 엔진 안에서만 읽고, 키워드 목록·매핑표를 화면에 펼치지 않는다.
   조립·조사 처리는 surgery/data/validate.py(find_entry · fix_particles · assemble)와 같은 결과를 낸다. 내보내기 기능 없음. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* [숫자]·[기간] 같은 자리는 눈에 띄게(빈칸 표시) */
  function slots(s) { return esc(s).replace(/\[([^\]\s][^\]]{0,14})\]/g, '<span class="slot">[$1]</span>'); }
  var mq = matchMedia('(min-width:900px)'), rm = matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return rm.matches || d.documentElement.hasAttribute('data-jc-imm'); }

  var MODS = [
    ['jd', '공고 문구가 있어요', '공고 해부학'],
    ['xr', '내 자소서 문장이 있어요', '탈락 문장 X-선'],
    ['ly', '내 상황이 걱정돼요', '이력서 재배치'],
    ['op', '단어 하나만 있어요', '문장 수술실']
  ];
  var A = null, LEX = null, LEXP = null;
  var UI = { m: '', jdC: '', jdS: '', jd: '', jdL: 0, xr: '', xrL: 0, ly: '', op: '', pur: 'cover_para', tone: '' };
  var SIG = { green: 'var(--g)', yellow: 'var(--y)', red: 'var(--r)' };

  fetch('./data/anatomy.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    A = j; A.CL = {}; j.vocabularies.clusters.forEach(function (c) { A.CL[c.code] = c.name; });
    A.SG = {}; j.vocabularies.signal_types.forEach(function (c) { A.SG[c.code] = c; });
    A.FM = {}; j.vocabularies.resume_formats.forEach(function (c) { A.FM[c.code] = c; });
    readHash(); renderDx(); render();
    $('foot').textContent = '학습·실습용 참고 자료입니다. 특정 회사의 채용공고 원문이나 다른 사람의 합격 자소서를 옮기지 않았고, 외부 AI를 쓰지 않습니다. 모든 문장 예시는 자료실이 직접 만들었으며, [숫자]·[기간] 자리는 내 사실로 채웁니다.';
  }).catch(function () { $('main').innerHTML = '<p class="empty">자료를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>'; });
  function loadLex() { if (!LEXP) { LEXP = fetch('./data/lexicon.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { LEX = j; return j; }); LEXP.catch(function () { LEXP = null; }); } return LEXP; }

  /* 대문 검색이 넘긴 ?q= — 문장 수술실을 그 낱말로 연다 */
  window.JCDeepLink = function (term) {
    if (!term) return true;
    UI.m = 'op'; UI.op = String(term).slice(0, 40); render(); return true;
  };

  /* 주소: #m=jd&id=jd01 (입력한 단어는 남기지 않는다) */
  function readHash() {
    var o = {}; String(location.hash).replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (MODS.some(function (m) { return m[0] === o.m; })) UI.m = o.m;
    if (o.id) { if (UI.m === 'jd') UI.jd = o.id; else if (UI.m === 'xr') UI.xr = o.id; else if (UI.m === 'ly') UI.ly = o.id; }
  }
  function writeHash() {
    var id = UI.m === 'jd' ? UI.jd : UI.m === 'xr' ? UI.xr : UI.m === 'ly' ? UI.ly : '';
    var h = UI.m ? '#m=' + UI.m + (id ? '&id=' + encodeURIComponent(id) : '') : location.pathname + location.search;
    try { history.replaceState(null, '', h); } catch (e) {}
  }

  function renderDx() {
    $('dx').innerHTML = MODS.map(function (m, i) { return '<button type="button" role="tab" data-m="' + m[0] + '" aria-selected="' + (UI.m === m[0]) + '"><span class="n">' + (i + 1) + '</span><span class="q">' + m[1] + '</span><b>' + m[2] + '</b></button>'; }).join('');
  }
  function render() {
    if (!A) return;
    var h = '';
    if (!UI.m) h = '<div class="box" style="padding:18px"><p style="margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:-.03em">지금 손에 있는 것을 고르세요</p><p style="margin:0;color:var(--muted);font-size:15px">공고 문구 ' + A.jd_anatomy.length + '개 · 감점 문장 ' + A.xray_cases.length + '개 · 이력서 상황 ' + A.resume_layouts.length + '개를 한 겹씩 열어 보고, 단어 하나로 자소서 문장 예시를 조립해 봅니다.</p></div>';
    else if (UI.m === 'jd') h = jdHtml(); else if (UI.m === 'xr') h = xrHtml(); else if (UI.m === 'ly') h = lyHtml(); else h = opHtml();
    $('main').innerHTML = h;
    if (UI.m === 'jd' && UI.jd) jdDet(true); else if (UI.m === 'xr' && UI.xr) xrDet(true); else if (UI.m === 'ly' && UI.ly) placeLy(null);
    if (UI.m === 'op') bindOp();
    writeHash();
  }
  function setM(m) {
    UI.m = m; closeSheet(); $('dx').classList.remove('first');
    $('dx').querySelectorAll('[data-m]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-m') === m)); });
    render();
    if (m === 'op') setTimeout(function () { var i = $('opIn'); if (i && mq.matches) i.focus({ preventScroll: true }); }, 30);
  }

  /* ───── ① 공고 해부학 ───── */
  function jdList() { return A.jd_anatomy.filter(function (x) { return (!UI.jdC || x.cluster === UI.jdC) && (!UI.jdS || x.signal_type === UI.jdS); }); }
  function jdHtml() {
    var h = '<div class="two"><section class="box pane" aria-label="공고 문구 목록"><div class="ph"><p class="h">범주 · 신호등으로 좁히기</p><div class="chips" id="jdC">';
    h += '<button type="button" data-jdc="" aria-pressed="' + !UI.jdC + '">전체</button>' + A.vocabularies.clusters.map(function (c) { return '<button type="button" data-jdc="' + c.code + '" aria-pressed="' + (UI.jdC === c.code) + '">' + esc(c.name) + '</button>'; }).join('');
    h += '</div><div class="chips">' + A.vocabularies.signal_types.map(function (s) { return '<button type="button" data-jds="' + s.code + '" aria-pressed="' + (UI.jdS === s.code) + '" style="--c:' + SIG[s.code] + '"><i></i>' + esc(s.name) + '</button>'; }).join('') + '</div></div>';
    h += '<div class="scr" id="jdL">' + jdRows() + '</div></section>' + detShell() + '</div>';
    return h;
  }
  function jdRows() {
    var L = jdList(); if (!L.length) return '<p class="empty">이 조합에 맞는 문구가 없습니다. 조건 하나를 풀어 보세요.</p>';
    return L.map(function (x) { return '<button type="button" class="row" data-jd="' + x.id + '" aria-current="' + (UI.jd === x.id) + '" style="--c:' + SIG[x.signal_type] + '"><span class="sg" aria-label="' + esc(A.SG[x.signal_type].name) + '"></span><span class="nm">「' + esc(x.phrase) + '」<small>' + esc(A.CL[x.cluster]) + '</small></span><span class="ar" aria-hidden="true">›</span></button>'; }).join('');
  }
  var JD_LAYERS = [['hidden_intent', '숨은 의도 보기', '숨은 의도', '현업·인사팀이 이 문구로 말하려는 것'], ['appeal', '어필할 것 보기', '자소서·면접에서 보여 줄 것', '형용사가 아니라 행동·수치로'], ['question', '역공 질문 보기', '물어볼 질문', '공격이 아니라 조건 확인'], ['verify', '확인할 곳 보기', '확인할 것', '전화·면접·현직자']];
  function jdDet(quiet) {
    var x = A.jd_anatomy.filter(function (y) { return y.id === UI.jd; })[0]; if (!x) return;
    var s = A.SG[x.signal_type];
    var h = X + '<p class="k"><span class="sig" style="--c:' + SIG[x.signal_type] + '">' + esc(s.name) + '</span>' + esc(A.CL[x.cluster]) + '</p><h2>「' + esc(x.phrase) + '」</h2><p class="sub">' + esc(s.desc) + ' 문구를 읽는 법이며, 회사를 평가하는 말이 아닙니다.</p>';
    h += '<div class="cut' + (UI.jdL ? ' on' : '') + '"><i></i></div>';
    for (var i = 0; i < UI.jdL; i++) { var L = JD_LAYERS[i], v = i === 0 ? x.hidden_intent : x.counter_scalpel[L[0]]; h += '<div class="lay' + (i === UI.jdL - 1 && !quiet ? ' in' : '') + '" style="--c:' + (i === 0 ? SIG[x.signal_type] : 'var(--acc)') + '"><h3>' + L[2] + ' <span style="font-weight:600;color:var(--dim)">· ' + L[3] + '</span></h3><p>' + esc(v) + '</p></div>'; }
    h += UI.jdL < JD_LAYERS.length ? '<button type="button" class="next" data-jdnext>' + JD_LAYERS[UI.jdL][1] + ' <span>' + (UI.jdL + 1) + ' / ' + JD_LAYERS.length + '</span></button>' : '<p class="done">네 겹을 모두 열었습니다. 다른 문구를 골라 보세요.</p>';
    $('det').innerHTML = h; if (!quiet) openSheet();
  }

  /* ───── ② 탈락 문장 X-선 ───── */
  function xrHtml() {
    var h = '<div class="two"><section class="box pane" aria-label="감점 문장 목록"><div class="ph"><p class="h">주제 ' + A.xray_cases.length + '가지 · 자주 감점되는 문장</p></div><div class="scr">';
    h += A.xray_cases.map(function (x, i) { return '<button type="button" class="row" data-xr="' + x.id + '" aria-current="' + (UI.xr === x.id) + '" style="--c:var(--r)"><span class="nm">' + esc(x.theme) + '<small>' + esc(x.before.length > 34 ? x.before.slice(0, 34) + '…' : x.before) + '</small></span><span class="ar" aria-hidden="true">›</span></button>'; }).join('');
    return h + '</div></section>' + detShell() + '</div>';
  }
  var XR_LAYERS = ['왜 감점인지 보기', '고치는 원칙 보기', '다시 쓴 예시 보기', 'STAR 네 줄 보기'];
  function xrDet(quiet) {
    var x = A.xray_cases.filter(function (y) { return y.id === UI.xr; })[0]; if (!x) return;
    var h = X + '<p class="k">' + esc(x.theme) + '</p><div class="film' + (UI.xrL ? ' xr' : '') + '" id="film"><span class="lb">감점 문장</span><span class="t">' + esc(x.before) + '</span><span class="scan" aria-hidden="true"></span></div><div style="height:10px"></div>';
    var L = UI.xrL, lastIn = function (i) { return i === L - 1 && !quiet ? ' in' : ''; };
    if (L >= 1) h += '<div class="lay' + lastIn(0) + '" style="--c:var(--r)"><h3>왜 감점인가</h3><p>' + esc(x.xray_diagnosis) + '</p></div>';
    if (L >= 2) h += '<div class="lay' + lastIn(1) + '"><h3>고치는 원칙</h3><p>' + esc(x.rule) + '</p></div>';
    if (L >= 3) h += '<div class="lay' + lastIn(2) + '" style="--c:var(--slot)"><span class="ex">예시 · 내 숫자로 바꾸기</span><p>' + slots(x.after_star) + '</p>' + (x.metric_hint ? '<p class="hint">넣을 숫자 · ' + slots(x.metric_hint) + '</p>' : '') + '</div>';
    if (L >= 4) h += '<div class="lay' + lastIn(3) + '"><h3>STAR 네 줄 · 예시</h3><div class="star">' + ['S', 'T', 'A', 'R'].map(function (k) { return '<div><b>' + k + '</b><span>' + slots(x.star[k]) + '</span></div>'; }).join('') + '</div></div>';
    h += L < XR_LAYERS.length ? '<button type="button" class="next" data-xrnext>' + XR_LAYERS[L] + ' <span>' + (L + 1) + ' / ' + XR_LAYERS.length + '</span></button>' : '<p class="done">예시는 그대로 내지 말고, [ ] 자리를 내 사실로 채워 다시 써 보세요.</p>';
    $('det').innerHTML = h;
    if (!quiet && L === 1) { var f = $('film'); f.classList.remove('xr'); void f.offsetWidth; f.classList.add('xr'); }
    if (!quiet) openSheet();
  }

  /* ───── ③ 이력서 재배치 ───── */
  var LY_PREV = null;
  function lyHtml() {
    var h = '<div class="two"><section class="box" style="padding:14px" aria-label="상황 고르기"><p class="ph h" style="border:0;padding:0;margin:0 0 8px;font-size:13px;font-weight:800;color:var(--dim)">내 상황 하나</p><div class="sit">';
    h += A.resume_layouts.map(function (x) { return '<button type="button" data-ly="' + x.id + '" aria-pressed="' + (UI.ly === x.id) + '">' + esc(x.situation) + '<small>' + esc(A.FM[x.recommended_format].name) + '</small></button>'; }).join('');
    h += '</div></section><section class="box pane" aria-label="이력서 섹션 순서"><div class="scr" style="padding:14px" id="lyB">' + lyBody() + '</div></section></div>';
    return h;
  }
  function lyBody() {
    var x = A.resume_layouts.filter(function (y) { return y.id === UI.ly; })[0];
    if (!x) return '<p class="empty" style="margin:0">상황을 고르면 이력서 섹션이 그 상황에 맞는 순서로 다시 놓이고, 왜 그 순서인지와 면접 방어 공식이 따라옵니다.</p>';
    var f = A.FM[x.recommended_format];
    var h = '<span class="fmt">' + esc(f.name) + '</span><p class="hint" style="margin:0 0 10px">' + esc(x.format_reason) + '</p><ol class="stack" id="stack">';
    x.section_order.forEach(function (s, i) { h += '<li class="blk" data-sec="' + esc(s) + '"><span class="o num">' + (i + 1) + '</span>' + esc(s) + '<span class="mv"></span></li>'; });
    h += '</ol><p class="why"><b>왜 이 순서인가</b> · ' + esc(x.order_reason) + '</p>';
    h += x.defense_scripts.map(function (s, i) { return '<details class="dfn"' + (i === 0 ? ' open' : '') + '><summary>Q. ' + esc(s.question) + '</summary><div class="b"><p class="f">공식 · ' + esc(s.formula) + '</p><p><span class="ex">예시 · 내 사실로 바꾸기</span><br>' + slots(s.example) + '</p></div></details>'; }).join('');
    if (x.cautions) h += '<p class="caut"><b>흔한 실수</b> · ' + esc(x.cautions) + '</p>';
    return h;
  }
  /* 블록은 자리만 옮긴다(FLIP, transform·opacity) */
  function placeLy(prevRects) {
    var st = $('stack'); if (!st) return;
    var x = A.resume_layouts.filter(function (y) { return y.id === UI.ly; })[0], prevOrder = LY_PREV;
    [].forEach.call(st.children, function (li, i) {
      var name = li.getAttribute('data-sec'), was = prevOrder ? prevOrder.indexOf(name) : -1, mv = li.querySelector('.mv');
      if (prevOrder && was > -1 && was > i) { li.classList.add('up'); mv.textContent = '↑ ' + (was - i) + '칸'; }
      else if (prevOrder && was < 0) { mv.textContent = '새로'; }
      if (!prevRects || still() || typeof li.animate !== 'function') return;
      var a = li.getBoundingClientRect(), b = prevRects[name];
      if (b) { var dy = b.top - a.top; if (Math.abs(dy) > 1) li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1)' }); }
      else li.animate([{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: i * 34, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    });
    LY_PREV = x.section_order.slice();
    var why = $('lyB').querySelector('.why'); if (why && prevRects && !still() && why.animate) why.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 260, easing: 'ease-out', fill: 'backwards' });
  }

  /* ───── ④ 문장 수술실 ───── */
  var TONES = [['', '네 가지 톤'], ['achievement', '성과·수치형'], ['problem', '문제해결·논리형'], ['collaboration', '협업·조율형'], ['stability', '성실·안정형']];
  function opHtml() {
    var h = '<div class="two"><section class="box op" aria-label="단어 넣기">' +
      '<a class="lm-link" href="../layer-merge/"><span class="lm-k">경험×공고 레이어</span><span class="lm-d">공고와 내 경험을 겹쳐 K(지식)·S(기술)·A(태도) 연결 근거와 전개 순서를 봅니다</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a>' +
      '<p style="margin:0 0 8px;font-size:15px;font-weight:800">경험을 떠올리게 하는 단어 하나</p>';
    h += '<div class="in"><label class="sr" for="opIn">단어</label><input id="opIn" type="text" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="예: 편의점, 엑셀, 조별과제, 갈등" value="' + esc(UI.op) + '"></div>';
    h += '<p class="hint">쉼표로 몇 개를 함께 넣어도 됩니다. 숫자를 같이 적으면(예: 편의점 2년) 그 자리에 들어갑니다.</p>';
    h += '<div class="ctl"><span class="seg" role="group" aria-label="용도">' + [['cover_para', '자소서 문단'], ['resume_line', '이력서 한 줄']].map(function (p) { return '<button type="button" data-pur="' + p[0] + '" aria-pressed="' + (UI.pur === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</span></div>';
    h += '<div class="ctl"><span class="seg" role="group" aria-label="톤">' + TONES.map(function (t) { return '<button type="button" data-tone="' + t[0] + '" aria-pressed="' + (UI.tone === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</span></div>';
    h += '<div class="frag" id="frag" aria-hidden="true"></div><p class="read" id="read"></p></section>';
    h += '<section class="box pane" aria-label="조립한 문장"><div class="scr" style="padding:14px"><div class="outs" id="outs"><p class="empty" style="margin:0">단어를 넣으면 역량 · 행동 · 수치로 나눈 뒤 톤별 문장 예시로 다시 조립합니다.</p></div><div id="evid"></div></div></section></div>';
    return h;
  }
  var opT = 0;
  function bindOp() { var i = $('opIn'); if (!i) return; i.addEventListener('input', function () { UI.op = i.value; clearTimeout(opT); opT = setTimeout(function () { runOp(true); }, 120); }); if (UI.op) runOp(false); }
  function runOp(anim) {
    var w = UI.op.trim(); if (!w) { $('outs').innerHTML = '<p class="empty" style="margin:0">단어를 넣으면 역량 · 행동 · 수치로 나눈 뒤 톤별 문장 예시로 다시 조립합니다.</p>'; $('frag').innerHTML = ''; $('read').textContent = ''; $('evid').innerHTML = ''; return; }
    if (!LEX) { $('outs').innerHTML = '<p class="empty" style="margin:0">조립 준비 중…</p>'; loadLex().then(function () { runOp(anim); }).catch(function () { $('outs').innerHTML = '<p class="empty" style="margin:0">조립 자료를 불러오지 못했습니다.</p>'; }); return; }
    var R = build(w, UI.pur, UI.tone);
    var fr = $('frag'); fr.innerHTML = R.frag.map(function (f) { return '<span><small>' + f[0] + '</small>' + esc(f[1]) + '</span>'; }).join('');
    $('read').textContent = R.read;
    var o = $('outs'); o.innerHTML = R.rows.map(function (r) { return '<article class="sent"><p class="tn">' + esc(r.tone_kr) + '<span class="ex">예시 · 내 숫자로 바꾸기</span></p><p>' + slots(r.sentence) + '</p></article>'; }).join('');
    $('evid').innerHTML = R.evidence ? '<p class="ev"><b>근거 한 줄 · 예시</b><br>' + slots(R.evidence) + '</p>' : '';
    if (anim && !still()) { [fr, o].forEach(function (el) { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }); }
  }

  /* 조립 엔진 — validate.py와 같은 순서·같은 결과(단어 하나일 때). 난수 없음. */
  function stripTail(s) {
    var strip = LEX.assembly.suffix_strip.slice().sort(function (a, b) { return b.length - a.length; }), changed = true;
    while (changed) { changed = false; for (var i = 0; i < strip.length; i++) { var t = strip[i]; if (s.length > t.length + 1 && s.slice(-t.length) === t) { s = s.slice(0, -t.length); changed = true; } } }
    return s;
  }
  function findEntry(word) {
    var norm = stripTail(word.trim().toLowerCase().replace(/ /g, '')), E = LEX.entries, i, j, k;
    for (i = 0; i < E.length; i++) for (j = 0; j < E[i].trigger_keywords.length; j++) if (norm === E[i].trigger_keywords[j].replace(/ /g, '')) return { e: E[i], how: 'exact', all: [E[i]] };
    var best = null, bl = 0, cands = [];
    for (i = 0; i < E.length; i++) for (j = 0; j < E[i].trigger_keywords.length; j++) {
      k = E[i].trigger_keywords[j].replace(/ /g, '');
      if (k.length >= 2 && (norm.indexOf(k) > -1 || (norm.length >= 2 && k.indexOf(norm) > -1))) { if (cands.indexOf(E[i]) < 0) cands.push(E[i]); if (k.length > bl) { best = E[i]; bl = k.length; } }
    }
    if (best) return { e: best, how: 'partial', all: [best].concat(cands.filter(function (c) { return c !== best; })) };
    for (i = 0; i < LEX.categories.length; i++) { var c = LEX.categories[i]; for (j = 0; j < c.category_hints.length; j++) if (norm.indexOf(c.category_hints[j].replace(/ /g, '')) > -1) { var fb = Object.assign({}, c.fallback, { id: 'fallback_' + c.code, category: c.code, _cat: c.name }); return { e: fb, how: 'category', all: [fb] }; } }
    var g = Object.assign({}, LEX.assembly.fallback.generic, { id: 'fallback_generic', category: 'generic' });
    return { e: g, how: 'generic', all: [g] };
  }
  function lastHangul(t) { for (var i = t.length - 1; i >= 0; i--) { var ch = t.charAt(i); if (ch >= '가' && ch <= '힣') return ch.charCodeAt(0); if (/[0-9A-Za-z)\]}]/.test(ch)) return -1; } return -1; }
  function hasB(t) { var c = lastHangul(t); return c < 0 ? true : (c - 0xAC00) % 28 !== 0; }
  function rieul(t) { var ch = t.charAt(t.length - 1); return ch >= '가' && ch <= '힣' && (ch.charCodeAt(0) - 0xAC00) % 28 === 8; }
  function fixParticles(s) {
    s = s.replace(/(\((?:을|를|은|는|이|가|로)\))\1+/g, '$1');   // 문형의 '(는)(는)' 같은 겹친 표기를 하나로
    [['을(를)', '을', '를'], ['은(는)', '은', '는'], ['이(가)', '이', '가'], ['으로(로)', '으로', '로']].forEach(function (p) {
      var re = new RegExp('(\\S+?)' + p[0].replace(/[()]/g, '\\$&'), 'g');
      s = s.replace(re, function (m, w) { if (p[0] === '으로(로)') return w + ((!hasB(w) || rieul(w)) ? '로' : '으로'); return w + (hasB(w) ? p[1] : p[2]); });
    });
    return s.replace(/(\S+?)이었습니다/g, function (m, w) { return w + (hasB(w) ? '이었습니다' : '였습니다'); });
  }
  function build(input, purpose, tone) {
    var parts = input.split(/[,，·ㆍ\n]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var nums = [], words = parts.map(function (p) {
      var m = p.match(/(\d+(?:\.\d+)?)\s*(년|개월|달|주|일|시간|건|명|회|%|곳|개)?/);
      if (m) nums.push({ v: m[1], u: m[2] || '' });
      return p.replace(/\d+(?:\.\d+)?\s*(년|개월|달|주|일|시간|건|명|회|%|곳|개)?/g, '').trim() || p;
    });
    var main = words[0], F = findEntry(main), e = F.e;
    /* 여러 단어: 대표 entry의 맥락·수치, 역량·동사는 후보 전체에서 번갈아(blend_rule) */
    var pool = F.all.slice(); words.slice(1).forEach(function (w) { var f2 = findEntry(w); if (pool.indexOf(f2.e) < 0) pool.push(f2.e); });
    var comps = e.core_competencies.slice(), verbs = e.action_verbs.slice();
    if (pool.length > 1) { comps = []; verbs = []; var mx = 0; pool.forEach(function (p) { mx = Math.max(mx, p.core_competencies.length, p.action_verbs.length); });
      for (var r = 0; r < mx; r++) pool.forEach(function (p) { if (p.core_competencies[r] && comps.indexOf(p.core_competencies[r]) < 0) comps.push(p.core_competencies[r]); if (p.action_verbs[r] && verbs.indexOf(p.action_verbs[r]) < 0) verbs.push(p.action_verbs[r]); }); }
    var frames = LEX.tone_frames.filter(function (f) { return !tone || f.id === tone; }).slice(0, 4), rows = [];
    var n = tone ? Math.min(3, frames[0].purposes[purpose].length) : frames.length;
    for (var i = 0; i < n; i++) {
      var f = tone ? frames[0] : frames[i], T = f.purposes[purpose], tpl = T[i % T.length];
      var v = { keyword: main, context: e.context, competency: comps[i % comps.length], verb: verbs[(i + 1) % verbs.length], metric: e.metric_prompts[(i + 2) % e.metric_prompts.length], evidence: e.evidence_patterns[0] };
      var s = tpl; Object.keys(v).forEach(function (k) { s = s.split('{' + k + '}').join(v[k]); });
      rows.push({ tone_kr: f.name, sentence: fillNums(fixParticles(s), nums) });
    }
    var ev = '';
    if (parts.length > 1 && e.evidence_patterns && e.evidence_patterns.length) {
      ev = e.evidence_patterns[0]; var vv = { keyword: main, context: e.context, competency: comps[1 % comps.length], verb: verbs[0], metric: e.metric_prompts[0] };
      Object.keys(vv).forEach(function (k) { ev = ev.split('{' + k + '}').join(vv[k]); }); ev = fillNums(fixParticles(ev), nums);
    }
    var read;
    if (F.how === 'exact' || F.how === 'partial') read = '「' + main + '」을(를) ' + e.context + ' 경험으로 읽고, ' + comps.slice(0, 2).join(' · ') + ' 역량으로 옮겼습니다.';
    else if (F.how === 'category') read = '「' + main + '」을(를) ' + e._cat + ' 경험으로 읽고, ' + comps.slice(0, 2).join(' · ') + ' 역량으로 옮겼습니다.';
    else read = '「' + main + '」 경험을 넓은 틀로 조립했습니다. [ ] 자리에 내 숫자와 장면을 채우면 문장이 내 것이 됩니다.';
    return { rows: rows, evidence: ev, read: fixParticles(read), frag: [['역량', comps[0]], ['행동', verbs[1 % verbs.length]], ['수치', e.metric_prompts[2 % e.metric_prompts.length]]] };
  }
  /* 입력에 숫자가 있으면 [숫자]·[기간]에 넣는다(단위가 년·개월·주·일이면 기간) */
  function fillNums(s, nums) {
    nums.forEach(function (n) {
      var isP = /^(년|개월|달|주|일)$/.test(n.u);
      if (isP) { if (s.indexOf('[기간]') > -1) s = s.replace('[기간]', n.v + n.u); }   // 기간은 [기간]에만
      else if (s.indexOf('[숫자]') > -1) s = s.replace('[숫자]', n.v);               // 개수·횟수는 [숫자]에만
    });
    return s;
  }

  /* ───── 상세 껍데기·시트 ───── */
  var X = '<div class="det-x"><button type="button" data-close>닫기</button></div>';
  function detShell() { return '<div class="det-wrap" id="detWrap" data-jc-layer><section class="box pane det" id="det" tabindex="-1" aria-live="polite"><div class="empty" style="margin:0">왼쪽(휴대폰은 위) 목록에서 하나를 고르면 한 겹씩 열립니다.</div></section></div>'; }
  var last = null;
  function openSheet() { if (mq.matches) return; var w = $('detWrap'); if (!w || w.classList.contains('on')) return; last = d.activeElement; w.classList.add('on'); d.documentElement.style.overflow = 'hidden'; setTimeout(function () { var x = w.querySelector('[data-close]'); if (x) x.focus({ preventScroll: true }); }, 40); }
  function closeSheet() { var w = $('detWrap'); if (!w || !w.classList.contains('on')) return; w.classList.remove('on'); d.documentElement.style.overflow = ''; if (last && last.focus) last.focus({ preventScroll: true }); }

  d.addEventListener('click', function (e) {
    if (!A) return; var b = e.target.closest('button');
    if (!b) { if (e.target.id === 'detWrap') closeSheet(); return; }
    if (b.hasAttribute('data-m')) { setM(b.getAttribute('data-m')); return; }
    if (b.hasAttribute('data-close')) { closeSheet(); return; }
    if (b.hasAttribute('data-jdc')) { UI.jdC = b.getAttribute('data-jdc'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('jdL').innerHTML = jdRows(); return; }
    if (b.hasAttribute('data-jds')) { var s = b.getAttribute('data-jds'); UI.jdS = UI.jdS === s ? '' : s; b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-jds') === UI.jdS)); }); $('jdL').innerHTML = jdRows(); return; }
    if (b.hasAttribute('data-jd')) { UI.jd = b.getAttribute('data-jd'); UI.jdL = 0; d.querySelectorAll('[data-jd]').forEach(function (x) { x.setAttribute('aria-current', String(x === b)); }); jdDet(false); writeHash(); $('det').scrollTop = 0; return; }
    if (b.hasAttribute('data-jdnext')) { UI.jdL++; jdDet(false); var c = $('det').querySelector('.cut'); if (c && UI.jdL === 1 && !still()) { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); } scrollLast(); return; }
    if (b.hasAttribute('data-xr')) { UI.xr = b.getAttribute('data-xr'); UI.xrL = 0; d.querySelectorAll('[data-xr]').forEach(function (x) { x.setAttribute('aria-current', String(x === b)); }); xrDet(false); writeHash(); $('det').scrollTop = 0; return; }
    if (b.hasAttribute('data-xrnext')) { UI.xrL++; xrDet(false); scrollLast(); return; }
    if (b.hasAttribute('data-ly')) {
      var st = $('stack'), rects = null;
      if (st) { rects = {}; [].forEach.call(st.children, function (li) { rects[li.getAttribute('data-sec')] = li.getBoundingClientRect(); }); }
      UI.ly = b.getAttribute('data-ly'); d.querySelectorAll('[data-ly]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('lyB').innerHTML = lyBody(); placeLy(rects); writeHash();
      if (!mq.matches) { var bx = $('lyB').closest('.box').getBoundingClientRect(); if (bx.top > innerHeight * .5) window.scrollTo({ top: scrollY + bx.top - 10, behavior: still() ? 'auto' : 'smooth' }); }
      return;
    }
    if (b.hasAttribute('data-pur')) { UI.pur = b.getAttribute('data-pur'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); runOp(false); return; }
    if (b.hasAttribute('data-tone')) { UI.tone = b.getAttribute('data-tone'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); runOp(false); return; }
  });
  function scrollLast() { var det = $('det'), ls = det.querySelectorAll('.lay'), l = ls[ls.length - 1]; if (!l) return; var q = l.getBoundingClientRect(), p = det.getBoundingClientRect(); if (q.bottom > p.bottom - 60) det.scrollTo({ top: det.scrollTop + q.top - p.top - 60, behavior: still() ? 'auto' : 'smooth' }); }
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  $('pvT').addEventListener('click', function () { var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기'; });
  $('rst').addEventListener('click', function () { closeSheet(); UI = { m: '', jdC: '', jdS: '', jd: '', jdL: 0, xr: '', xrL: 0, ly: '', op: '', pur: 'cover_para', tone: '' }; LY_PREV = null; renderDx(); render(); window.scrollTo(0, 0); });
  if (mq.addEventListener) mq.addEventListener('change', function () { closeSheet(); });
})();
