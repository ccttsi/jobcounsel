/*
 * 상담 대화 연습장 · 렌더링 엔진
 *
 * data.js(window.TALK_DATA)를 읽어 화면을 그린다. 글·규칙을 바꿀 때는 data.js만 고친다.
 * 외부 API 없이 정규식 패턴 매칭만으로 동작한다. 입력한 글은 저장하거나 보내지 않는다.
 *
 * 주소: #          첫 화면(갈래 고르기)
 *       #reflect   01 되받아 주기        #question 02 질문 바꾸기   #cushion 03 부드럽게 전하기
 *       #cloud     04 엇갈림 찾기        #stuck    05 막힐 때       #frame   06 선 긋고 길 잡기
 *       #mix       섞어서 연습           #about    이 연습장에 대해(출처)
 */
(function () {
  'use strict';
  var D = window.TALK_DATA;
  var d = document, $ = function (id) { return d.getElementById(id); };
  if (!D) { $('view').innerHTML = '<p class="loading">자료를 불러오지 못했습니다. 새로고침해 주세요.</p>'; return; }

  /* ───────── 공통 도구 ───────── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var reCache = {};
  function rx(src, fl) { if (fl == null) fl = 'g'; var k = fl + '|' + src; return reCache[k] || (reCache[k] = new RegExp(src, fl)); }
  function test(src, s) { var r = rx(src, ''); return r.test(s); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  var MODS = D.modules, MOD = {}; MODS.forEach(function (m) { MOD[m.id] = m; });

  /* 정규식 여러 개에 걸리는 곳을 겹치지 않게 감싼다. rules: [{re, cls, title}] */
  function marks(text, rules) {
    var hits = [];
    rules.forEach(function (r, ri) {
      var re = rx(r.re, 'g'), m; re.lastIndex = 0;
      while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } hits.push({ s: m.index, e: m.index + m[0].length, r: r, ri: ri }); }
    });
    hits.sort(function (a, b) { return a.s - b.s || (b.e - b.s) - (a.e - a.s); });
    var out = '', at = 0;
    hits.forEach(function (h) {
      if (h.s < at) return;
      out += esc(text.slice(at, h.s)) + '<mark class="' + h.r.cls + '"' + (h.r.title ? ' title="' + esc(h.r.title) + '"' : '') + '>' + esc(text.slice(h.s, h.e)) + '</mark>';
      at = h.e;
    });
    return out + esc(text.slice(at));
  }
  /* 맞은 곳을 띄어쓰기 단위(어절)로 넓혀 낱말로 보여 준다 */
  function eojeol(text, s, e) {
    while (s > 0 && !/[\s.,!?…"“”'()]/.test(text[s - 1])) s--;
    while (e < text.length && !/[\s.,!?…"“”'()]/.test(text[e])) e++;
    return text.slice(s, e);
  }
  function sentences(t) {
    /* 뒤돌아보기 정규식은 옛 사파리에서 문법 오류가 나므로 쓰지 않는다 */
    return (String(t).replace(/\r/g, '').match(/[^.!?…\n]+[.!?…]*/g) || []).map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^[.!?…]+$/.test(x); });
  }
  function copy(text, btn) {
    var done = function () { if (!btn) return; var o = btn.textContent; btn.textContent = '복사했습니다'; setTimeout(function () { btn.textContent = o; }, 1600); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    function fallback() { var ta = d.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; d.body.appendChild(ta); ta.select(); try { d.execCommand('copy'); } catch (x) {} ta.remove(); done(); }
  }
  function ico(name) {
    var P = {
      arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
      back: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      dot: '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
      shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20"/><path d="M4 17h3.5c1.6 0 2.6-1.6 3.5-3.4"/><path d="M13 10.4c.9-1.8 1.9-3.4 3.5-3.4H20"/><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }

  /* ───────── 상태 (기기에 저장하지 않는다) ───────── */
  var st = {
    reflect: { c: 'r1', mine: '', marks: {}, mode: 'fe', draft: '', checked: false, showEx: false, showFeel: false },
    question: { q: '' },
    cushion: { t: '', case: '', parts: ['', '', '', '', ''] },
    cloud: { c: 'm1', t: '' },
    stuck: { id: '', q: '' },
    frame: { id: '', q: '', done: {} },
    drill: {}
  };
  st.cloud.t = byId(D.cloudCases, 'm1').t;

  /* ───────── 왼쪽(또는 위) 갈래 목록 ───────── */
  function renderPicks(cur) {
    var h = MODS.map(function (m) {
      return '<a class="pk" href="#' + m.id + '"' + (cur === m.id ? ' aria-current="page"' : '') + '>'
        + '<span class="pk-no">' + m.no + '</span><span class="pk-tx"><b>' + esc(m.when) + '</b><small>' + esc(m.name) + ' · ' + esc(m.term) + '</small></span></a>';
    }).join('');
    h += '<a class="pk pk-sub" href="#mix"' + (cur === 'mix' ? ' aria-current="page"' : '') + '><span class="pk-no">' + ico('shuffle') + '</span><span class="pk-tx"><b>섞어서 연습하기</b><small>여섯 갈래의 연습 문제 ' + D.drills.length + '개</small></span></a>';
    h += '<a class="pk pk-sub" href="#about"' + (cur === 'about' ? ' aria-current="page"' : '') + '><span class="pk-no">?</span><span class="pk-tx"><b>이 연습장에 대해</b><small>갈래를 나눈 기준 · 바탕 이론과 출처</small></span></a>';
    $('picks').innerHTML = h;
  }

  /* ───────── 화면 조각 ───────── */
  function modHead(m) {
    return '<header class="mh"><p class="mh-no"><span>' + m.no + '</span> ' + esc(m.term) + '</p>'
      + '<h2>' + esc(m.name) + '</h2><p class="mh-when">이럴 때 · <b>' + esc(m.when) + '</b></p><p class="lead">' + esc(m.lead) + '</p></header>';
  }
  function points(m) {
    if (!m.points || !m.points.length) return '';
    return '<section class="pts" aria-label="핵심">' + m.points.map(function (p, i) {
      return '<div class="pt"><span class="pt-n">' + (i + 1) + '</span><b>' + esc(p[0]) + '</b><p>' + esc(p[1]) + '</p></div>';
    }).join('') + '</section>';
  }
  function phraseBlock(m) {
    var a = '', b = '';
    if (m.phrases && m.phrases.length) a = '<section class="blk"><h3>바로 쓰는 표현</h3><ul class="phr">' + m.phrases.map(function (p) {
      return '<li><button type="button" class="phr-t" data-copy="' + esc(p.t.replace(/^"|"$/g, '')) + '" title="눌러서 복사">' + esc(p.t) + '</button><small>' + esc(p.n) + '</small></li>';
    }).join('') + '</ul></section>';
    if (m.donts && m.donts.length) b = '<section class="blk"><h3>이것만은 피하기</h3><ul class="dnt">' + m.donts.map(function (x) {
      return '<li><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></li>';
    }).join('') + '</ul></section>';
    return a || b ? '<div class="two">' + a + b + '</div>' : '';
  }
  function pad(label, inner, extra) {
    return '<section class="pad' + (extra ? ' ' + extra : '') + '"><span class="tape">' + esc(label) + '</span>' + inner + '</section>';
  }
  function others(cur) {
    return '<nav class="oth" aria-label="다른 갈래"><p>다른 장면이 필요하면</p><div>' + MODS.filter(function (m) { return m.id !== cur; }).map(function (m) {
      return '<a href="#' + m.id + '"><span>' + m.no + '</span>' + esc(m.when) + '</a>';
    }).join('') + '</div></nav>';
  }

  /* ───────── 연습 문제 ───────── */
  function drillList(mid) { return D.drills.filter(function (x) { return !mid || x.m === mid; }); }
  function drillBlock(key, list, title) {
    if (!list.length) return '';
    var s = st.drill[key] || (st.drill[key] = { i: 0, pick: -1, order: null });
    if (key === 'mix' && !s.order) { s.order = list.map(function (_, i) { return i; }); shuffleArr(s.order); }
    var idx = s.order ? s.order[s.i % list.length] : s.i % list.length, q = list[idx], m = MOD[q.m];
    var opts = q.o.map(function (o, i) {
      var cls = 'op', after = '';
      if (s.pick >= 0) { cls += o.ok ? ' op-ok' : (i === s.pick ? ' op-no' : ' op-dim'); after = '<span class="op-f"><b>' + (o.ok ? '더 나은 쪽' : '다시 보기') + '</b> ' + esc(o.f) + '</span>'; }
      return '<li><button type="button" class="' + cls + '" data-dk="' + key + '" data-op="' + i + '"' + (s.pick >= 0 ? ' aria-disabled="true"' : '') + '><span class="op-l">' + 'ABC'[i] + '</span><span class="op-t">' + esc(o.t) + after + '</span></button></li>';
    }).join('');
    return '<section class="drill" id="drill-' + key + '"><div class="drill-h"><h3>' + esc(title) + '</h3><span class="num">' + ((s.i % list.length) + 1) + ' / ' + list.length + '</span></div>'
      + (key === 'mix' ? '<p class="drill-tag">' + m.no + ' ' + esc(m.name) + '</p>' : '')
      + '<p class="drill-c"><small>내담자</small>' + esc(q.c) + '</p><p class="drill-ask">어떻게 받으시겠어요?</p><ol class="ops">' + opts + '</ol>'
      + '<div class="drill-f"><button type="button" class="btn" data-dnext="' + key + '" data-dir="-1">이전</button>'
      + (s.pick >= 0 ? '<p class="drill-note">고른 답과 다른 말을 떠올렸다면 그것도 좋은 연습입니다. 보기는 정답이 아니라 비교해 볼 거리입니다.</p>' : '<p class="drill-note">하나를 고르면 세 보기의 설명이 모두 열립니다.</p>')
      + '<button type="button" class="btn btn-p" data-dnext="' + key + '" data-dir="1">다음 문제</button></div></section>';
  }
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ───────── 01 되받아 주기 ───────── */
  function feelHits(text) {
    var out = [];
    D.feelings.forEach(function (f) { if (test(f.re, text)) out.push(f); });
    return out;
  }
  function reflectSrc() {
    var s = st.reflect;
    if (s.c === 'mine') return { id: 'mine', who: '직접 넣은 말', s: sentences(s.mine), keys: [], feel: [], ex: null };
    return byId(D.reflectCases, s.c);
  }
  function toolReflect() {
    var s = st.reflect, c = reflectSrc();
    var chips = D.reflectCases.map(function (x) { return '<button type="button" class="fb" data-rc="' + x.id + '" aria-pressed="' + (s.c === x.id) + '">' + esc(x.who) + '</button>'; }).join('')
      + '<button type="button" class="fb" data-rc="mine" aria-pressed="' + (s.c === 'mine') + '">직접 넣기</button>';
    var body = '<div class="filt" role="group" aria-label="연습할 하소연 고르기">' + chips + '</div>';
    if (s.c === 'mine') body += '<label class="lb" for="rMine">내담자가 한 말(실명·연락처 등 개인정보는 넣지 마세요)</label><textarea id="rMine" class="ta" rows="4" placeholder="예: 요즘 아무것도 손에 안 잡혀요. 지원서를 열었다가 그냥 닫아요.">' + esc(s.mine) + '</textarea>';
    var all = c.s.join(' ');
    var key = s.c;
    var mk = s.marks[key] || (s.marks[key] = {});
    if (c.s.length) {
      body += '<p class="step"><b>1</b> 문장을 눌러 표시해 보세요. 한 번 누르면 <span class="tg-f">사실</span>, 두 번 누르면 <span class="tg-e">감정</span>, 세 번 누르면 지웁니다.</p>';
      body += '<p class="say" aria-label="내담자의 말">' + c.s.map(function (x, i) {
        var v = mk[i] || 0, lb = ['', '사실', '감정'][v];
        return '<button type="button" class="sn sn' + v + '" data-sn="' + i + '" aria-label="' + esc(x) + (lb ? ' (' + lb + ')' : '') + '">' + esc(x) + '</button>';
      }).join(' ') + '</p>';
      var fh = feelHits(all);
      body += '<p class="hint-row"><span>말 속에 이미 나온 감정 낱말</span>' + (fh.length ? fh.map(function (f) { return '<em class="fw">' + esc(f.w) + '</em>'; }).join('') : '<i>없음 · 감정이 겉으로 드러나지 않은 말입니다. 숨은 마음을 짐작해 보세요.</i>') + '</p>';
      if (c.feel && c.feel.length) body += '<p class="hint-row"><button type="button" class="lnk" data-rtoggle="showFeel">' + (s.showFeel ? '숨은 감정 후보 접기' : '숨은 감정 후보 보기') + '</button>' + (s.showFeel ? c.feel.map(function (f) { return '<em class="fw fw-h">' + esc(f) + '</em>'; }).join('') : '') + '</p>';
    }
    var modes = [['re', '재진술'], ['fe', '감정 반영'], ['su', '요약']];
    body += '<p class="step"><b>2</b> 무엇을 돌려줄지 고르고 직접 써 보세요.</p><div class="seg" role="group" aria-label="반영 종류">' + modes.map(function (x) { return '<button type="button" data-rmode="' + x[0] + '" aria-pressed="' + (s.mode === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    body += '<textarea id="rDraft" class="ta ta-line" rows="3" placeholder="' + (s.mode === 're' ? '예: ~하셨다는 거네요.' : s.mode === 'fe' ? '예: ~해서 많이 ~하셨겠어요.' : '예: 정리해 보면 ~, ~, 그리고 ~이네요.') + '">' + esc(s.draft) + '</textarea>';
    body += '<details class="vocab"><summary>감정 낱말 고르기 <small>누르면 쓰는 칸에 들어갑니다</small></summary>' + vocab() + '</details>';
    body += '<div class="acts"><button type="button" class="btn btn-p" data-rcheck>살펴보기</button>' + (c.ex ? '<button type="button" class="btn" data-rtoggle="showEx">' + (s.showEx ? '예시 접기' : '예시 보기') + '</button>' : '') + '</div>';
    body += '<div id="rOut" aria-live="polite">' + (s.checked ? reflectReport(c) : '') + '</div>';
    if (c.ex && s.showEx) body += '<dl class="exs"><dt>재진술</dt><dd>' + esc(c.ex.re) + '</dd><dt>감정 반영</dt><dd>' + esc(c.ex.fe) + '</dd><dt>요약</dt><dd>' + esc(c.ex.su) + '</dd></dl><p class="small">예시는 여러 답 가운데 하나입니다. 같은 말이라도 내담자와의 관계, 말투, 표정에 따라 더 맞는 반영이 달라집니다.</p>';
    return pad('연습장 · 되받아 주기', body);
  }
  function vocab() {
    var g = {}, order = [];
    D.feelings.forEach(function (f) { if (!g[f.k]) { g[f.k] = []; order.push(f.k); } g[f.k].push(f.w); });
    return '<div class="voc">' + order.map(function (k) {
      return '<p><b>' + esc(k) + '</b>' + g[k].map(function (w) { return '<button type="button" class="fw fw-b" data-ins="' + esc(w.replace(/다$/, '')) + '">' + esc(w) + '</button>'; }).join('') + '</p>';
    }).join('') + '</div>';
  }
  function reflectReport(c) {
    var s = st.reflect, t = s.draft.trim();
    if (!t) return '<p class="warn">쓰는 칸이 비어 있습니다. 한 문장이라도 먼저 써 보세요.</p>';
    var rows = [];
    D.reflectChecks.forEach(function (k) {
      if (k.kind === 'good') {
        var ok = k.use === 'feelings' ? feelHits(t).length > 0 : test(k.re, t);
        if (k.id === 'feel' && s.mode === 're') { rows.push(['info', ok ? '감정 낱말이 들어 있습니다. 재진술에서는 사실만 돌려줘도 충분합니다.' : '재진술은 감정 낱말 없이 사실만 돌려줘도 됩니다.']); return; }
        rows.push([ok ? 'ok' : 'no', ok ? k.label : k.miss]);
      } else if (test(k.re, t)) rows.push(['no', k.label + ' · ' + k.tip]);
    });
    if (c.keys && c.keys.length && s.mode !== 'fe') {
      var got = c.keys.filter(function (w) { return t.indexOf(w) >= 0; }), miss = c.keys.filter(function (w) { return t.indexOf(w) < 0; });
      rows.push([got.length >= Math.ceil(c.keys.length / 2) ? 'ok' : 'info', '핵심 사실 ' + got.length + '/' + c.keys.length + '개를 담았습니다' + (miss.length ? ' (안 들어간 것: ' + miss.join(', ') + ')' : '') + '. 모두 넣을 필요는 없고, 내담자에게 가장 무거운 것을 고릅니다.']);
    }
    var src = c.s.join(' ');
    if (src && t.length > src.length * 0.7) rows.push(['no', '반영이 내담자 말에 견줘 깁니다. 한두 문장으로 줄여 보세요.']);
    else if (t.length < 10) rows.push(['info', '조금 짧습니다. 사실이나 감정 하나를 더 담을 수 있는지 보세요.']);
    if (/\?\s*$/.test(t)) rows.push(['info', '물음표로 끝났습니다. 확인하는 반영("~라는 말씀이신가요?")이라면 괜찮지만, 새 질문이라면 반영 뒤에 따로 하세요.']);
    var mine = feelHits(t).map(function (f) { return f.w; });
    return '<p class="ck-h">살펴본 결과 <small>글자 패턴으로만 살핀 것이라 맥락은 반영하지 못합니다</small></p><ul class="ck">' + rows.map(function (r) {
      return '<li class="ck-' + r[0] + '">' + ico(r[0] === 'ok' ? 'check' : r[0] === 'no' ? 'x' : 'dot') + '<span>' + esc(r[1]) + '</span></li>';
    }).join('') + '</ul>' + (mine.length ? '<p class="hint-row"><span>쓴 감정 낱말</span>' + mine.map(function (w) { return '<em class="fw">' + esc(w) + '</em>'; }).join('') + '</p>' : '');
  }

  /* ───────── 02 질문 바꾸기 ───────── */
  function bigrams(s) { s = s.replace(/[\s?.!,]/g, ''); var o = {}; for (var i = 0; i < s.length - 1; i++) o[s.substr(i, 2)] = 1; return o; }
  function sim(a, b) { var A = bigrams(a), B = bigrams(b), n = 0, na = 0, nb = 0, k; for (k in A) { na++; if (B[k]) n++; } for (k in B) nb++; return na + nb ? 2 * n / (na + nb) : 0; }
  function analyzeQ(q) {
    var tags = D.questionRules.filter(function (r) { return test(r.re, q); });
    var open = test(D.openWords, q), closed = !open && test(D.closedEnd, q.replace(/[.!]+$/, ''));
    var isWhy = tags.some(function (r) { return r.id === 'why'; });
    var verdict, cls;
    if (isWhy) { verdict = '따지는 느낌의 질문'; cls = 'v-no'; }
    else if (tags.length && open) { verdict = '열린 질문이지만 다듬을 곳이 있습니다'; cls = 'v-mid'; }
    else if (tags.length) { verdict = '닫힌 질문 · 다듬을 곳이 있습니다'; cls = 'v-no'; }
    else if (open) { verdict = '열린 질문입니다'; cls = 'v-ok'; }
    else if (closed) { verdict = '닫힌 질문 (예/아니요로 답하게 됩니다)'; cls = 'v-mid'; }
    else { verdict = '질문 모양이 뚜렷하지 않습니다'; cls = 'v-mid'; }
    var best = null, bs = 0;
    D.questionBank.forEach(function (p) { var v = Math.max(sim(q, p.c), sim(q, p.o) * 0.8); if (v > bs) { bs = v; best = p; } });
    return { tags: tags, open: open, closed: closed, verdict: verdict, cls: cls, best: bs >= 0.18 ? best : null };
  }
  function toolQuestion() {
    var s = st.question;
    var body = '<label class="lb" for="qIn">평소 하는 질문을 넣어 보세요</label>'
      + '<div class="inrow"><input id="qIn" class="in" type="text" enterkeyhint="go" autocomplete="off" placeholder="예: 왜 회사를 그만두셨어요?" value="' + esc(s.q) + '"><button type="button" class="btn btn-p" data-qgo>살펴보기</button></div>'
      + '<div class="filt" role="group" aria-label="예로 넣어 보기"><span class="filt-l">예로 넣기</span>' + D.questionBank.slice(0, 10).map(function (p) { return '<button type="button" class="fb" data-qex="' + esc(p.c) + '">' + esc(p.c) + '</button>'; }).join('') + '</div>'
      + '<div id="qOut" aria-live="polite">' + (s.q.trim() ? qReport(s.q.trim()) : '') + '</div>';
    var frames = '<section class="blk"><h3>목적별 열린 질문 틀 <small>눌러서 복사</small></h3><div class="frm">' + D.questionFrames.map(function (f) {
      return '<div><b>' + esc(f.k) + '</b>' + f.q.map(function (x) { return '<button type="button" class="phr-t" data-copy="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
    }).join('') + '</div></section>';
    var bank = '<details class="blk bank"><summary><h3>닫힌 질문 → 열린 질문 짝 ' + D.questionBank.length + '개</h3></summary><ul class="pairs">' + D.questionBank.map(function (p) {
      return '<li><span class="pc">' + esc(p.c) + '</span><span class="pa" aria-hidden="true">→</span><span class="po">' + esc(p.o) + '</span><small>' + esc(p.tag) + '</small></li>';
    }).join('') + '</ul></details>';
    return pad('연습장 · 질문 바꾸기', body) + frames + bank;
  }
  function qReport(q) {
    var a = analyzeQ(q);
    var hl = marks(q, a.tags.map(function (r) { return { re: r.re, cls: 'm-no', title: r.label }; }).concat([{ re: D.openWords, cls: 'm-ok', title: '열린 질문 낱말' }]));
    var h = '<p class="qv ' + a.cls + '">' + esc(a.verdict) + '</p><p class="qline">' + hl + '</p>';
    if (a.tags.length) h += '<ul class="ck">' + a.tags.map(function (r) {
      return '<li class="ck-no">' + ico('x') + '<span><b>' + esc(r.label) + '</b> ' + esc(r.why) + '<span class="fix">' + r.fix.map(function (f) { return '<button type="button" class="phr-t" data-copy="' + esc(f) + '">' + esc(f) + '</button>'; }).join('') + '</span></span></li>';
    }).join('') + '</ul>';
    if (!a.tags.length && a.closed) h += '<p class="small">사실 확인(날짜, 자격 유무, 연락처)이 목적이라면 닫힌 질문이 맞습니다. 이야기를 넓히고 싶다면 "무엇·어떤·어떻게"로 바꿔 보세요.</p>';
    if (!a.tags.length && a.open) h += '<p class="small">좋습니다. 답을 들은 뒤에는 질문을 하나 더 잇기보다, 들은 말을 한 번 되받아 주면 대화가 깊어집니다.</p>';
    if (a.best) h += '<div class="near"><small>비슷한 짝</small><p><span class="pc">' + esc(a.best.c) + '</span><span class="pa" aria-hidden="true">→</span><button type="button" class="phr-t po" data-copy="' + esc(a.best.o) + '">' + esc(a.best.o) + '</button></p></div>';
    return h;
  }

  /* ───────── 03 부드럽게 전하기 ───────── */
  function toolCushion() {
    var s = st.cushion;
    var body = '<p class="step"><b>1</b> 전하려는 말을 넣으면 걸리는 표현을 짚어 드립니다.</p>'
      + '<div class="filt" role="group" aria-label="상황 고르기">' + D.cushionCases.map(function (c) { return '<button type="button" class="fb" data-cc="' + c.id + '" aria-pressed="' + (s.case === c.id) + '">' + esc(c.k) + '</button>'; }).join('') + '</div>'
      + '<textarea id="cIn" class="ta" rows="2" placeholder="예: 서류가 틀렸어요. 다시 떼 오세요.">' + esc(s.t) + '</textarea>'
      + '<div class="acts"><button type="button" class="btn btn-p" data-cgo>살펴보기</button></div>'
      + '<div id="cOut" aria-live="polite">' + (s.t.trim() ? cReport(s.t.trim()) : '') + '</div>';
    var p = s.parts, labels = ['쿠션', '사실', '이유', '대안', '확인'];
    var asm = '<p class="step"><b>2</b> 다섯 칸을 채우면 한 문장으로 이어 드립니다. 비워 둔 칸은 빼고 잇습니다.</p>'
      + '<div class="asm">'
      + '<div class="slot"><span class="sl">① 쿠션</span><div class="chips">' + D.cushionOpeners.map(function (o) { return '<button type="button" class="fb fb-s" data-op1="' + esc(o) + '" aria-pressed="' + (p[0] === o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>'
      + slot(1, '② 사실', '무엇이 되고 무엇이 안 되는지', '예: 이번 회차 수당은 지급이 어렵습니다.')
      + slot(2, '③ 이유', '왜 그런지 한 줄', '예: 신고하신 소득이 기준을 넘었기 때문입니다.')
      + slot(3, '④ 대안', '대신 할 수 있는 일', '예: 다음 회차가 제대로 나가도록 지금 같이 확인해 볼게요.')
      + '<div class="slot"><span class="sl">⑤ 확인</span><div class="chips">' + D.cushionClosers.map(function (o) { return '<button type="button" class="fb fb-s" data-op5="' + esc(o) + '" aria-pressed="' + (p[4] === o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>'
      + '</div><div class="outline"><small>이어 붙인 말</small><p id="asmOut">' + esc(assemble()) + '</p><button type="button" class="btn" data-copyasm>' + ico('copy') + '<span>복사</span></button></div>'
      + '<p class="small">상황을 고르면 다섯 칸이 예시로 채워집니다. 예시를 지우고 내 말로 바꿔 써 보세요. ' + labels.join(' → ') + ' 순서는 기본 틀일 뿐, 상황에 따라 줄이거나 바꿔도 됩니다.</p>';
    return pad('연습장 · 부드럽게 전하기', body) + pad('연습장 · 다섯 칸 조립기', asm, 'pad-b');
  }
  function slot(i, label, sub, ph) {
    return '<div class="slot"><label class="sl" for="slot' + i + '">' + label + ' <small>' + sub + '</small></label><input id="slot' + i + '" class="in" data-slot="' + i + '" type="text" autocomplete="off" placeholder="' + esc(ph) + '" value="' + esc(st.cushion.parts[i]) + '"></div>';
  }
  function assemble() {
    var p = st.cushion.parts.slice();
    if (p[4] && /^\(/.test(p[4])) p[4] = '';
    var out = [], first = p[0] ? p[0].trim() : '';
    var body = [p[1], p[2], p[3]].map(function (x) { return (x || '').trim(); }).filter(Boolean);
    if (first && body.length) {
      if (/[.!?]$/.test(first)) out.push(first, body[0]); else out.push(first + ' ' + body[0]);
      out = out.concat(body.slice(1));
    } else { if (first) out.push(first); out = out.concat(body); }
    if (p[4]) out.push(p[4].trim());
    var s = out.join(' ').replace(/\s+/g, ' ').trim();
    return s || '칸을 채우면 여기에 한 문장으로 나타납니다.';
  }
  function cReport(t) {
    var hits = D.softRules.filter(function (r) { return test(r.re, t); });
    var hl = marks(t, hits.map(function (r) { return { re: r.re, cls: 'm-no', title: r.label }; }));
    var h = '<p class="qline">' + hl + '</p>';
    if (!hits.length) h += '<p class="qv v-ok">걸리는 표현을 찾지 못했습니다.</p><p class="small">패턴에 없는 표현도 있으니, 소리 내어 읽어 보며 내가 이 말을 들으면 어떨지 한 번 더 살펴보세요. 대안이 들어 있는지도 확인해 보세요.</p>';
    else h += '<ul class="ck">' + hits.map(function (r) {
      return '<li class="ck-no">' + ico('x') + '<span><b>' + esc(r.label) + '</b> ' + esc(r.tip) + '<span class="fix">' + r.to.map(function (f) { return '<em class="sug">' + esc(f) + '</em>'; }).join('') + '</span></span></li>';
    }).join('') + '</ul>';
    var hasAlt = /대신|함께|같이|도와|방법|할 ?수 ?있|해 ?드릴|알려 ?드릴|안내해 ?드릴/.test(t);
    if (!hasAlt) h += '<p class="warn">대안이 보이지 않습니다. "대신 ~할 수 있습니다", "같이 ~해 볼게요"처럼 다음에 할 수 있는 일을 붙여 보세요.</p>';
    var cs = byId(D.cushionCases, st.cushion.case);
    if (cs && cs.raw === t) h += '<div class="near"><small>다듬은 예</small><p>' + esc(cs.parts.filter(Boolean).join(' ')) + '</p></div>';
    return h;
  }

  /* ───────── 04 엇갈림 찾기 (모순 클라우드) ───────── */
  function cloudAnalyze(t) {
    var sens = sentences(t), words = {}, pairs = [];
    function addWord(w, side, ax) { var k = side + '|' + w; if (!words[k]) words[k] = { w: w, side: side, ax: ax, n: 0 }; words[k].n++; }
    D.tensionAxes.forEach(function (ax) {
      var A = [], B = [];
      sens.forEach(function (sn, si) {
        [['a', A], ['b', B]].forEach(function (x) {
          var re = rx(ax[x[0]].re, 'g'), m; re.lastIndex = 0;
          while ((m = re.exec(sn))) { if (!m[0]) { re.lastIndex++; continue; } var w = eojeol(sn, m.index, m.index + m[0].length); x[1].push({ w: w, si: si }); addWord(w, x[0], ax.id); }
        });
      });
      if (A.length && B.length) {
        /* 같은 문장 안의 쌍을 먼저, 없으면 가장 가까운 문장끼리 */
        var best = null;
        A.forEach(function (a) { B.forEach(function (b) { if (a.w === b.w) return; var dist = Math.abs(a.si - b.si); if (!best || dist < best.dist) best = { a: a, b: b, dist: dist }; }); });
        if (best) pairs.push({ ax: ax, a: best.a, b: best.b, same: best.dist === 0, sa: sens[best.a.si], sb: sens[best.b.si] });
      }
    });
    var turns = sens.filter(function (sn) { return test(D.turnWords, sn); }).map(function (sn) {
      var m = rx('(' + D.turnWords + ')', '').exec(sn);
      if (!m) return null; var cut = m.index + m[0].length;
      return { l: sn.slice(0, cut).trim(), r: sn.slice(cut).replace(/^[\s,]+/, '').trim(), w: m[0] };
    }).filter(function (x) { return x && x.r; });
    var feel = feelHits(t);
    return { words: Object.keys(words).map(function (k) { return words[k]; }), pairs: pairs, turns: turns, feel: feel, sens: sens };
  }
  function toolCloud() {
    var s = st.cloud;
    var body = '<div class="filt" role="group" aria-label="연습할 말 고르기">' + D.cloudCases.map(function (c) { return '<button type="button" class="fb" data-mc="' + c.id + '" aria-pressed="' + (s.c === c.id) + '">' + esc(c.who) + '</button>'; }).join('')
      + '<button type="button" class="fb" data-mc="mine" aria-pressed="' + (s.c === 'mine') + '">직접 넣기</button></div>'
      + '<label class="lb" for="mIn">내담자가 한 말</label><textarea id="mIn" class="ta" rows="4" placeholder="상담 중 들은 말을 옮겨 적어 보세요. 실명·연락처 등 개인정보는 넣지 마세요.">' + esc(s.t) + '</textarea>'
      + '<div class="acts"><button type="button" class="btn btn-p" data-mgo>구름 띄우기</button></div><div id="mOut" aria-live="polite">' + (s.t.trim() ? cloudReport(s.t.trim()) : '') + '</div>';
    var types = '<section class="blk"><h3>엇갈림의 네 갈래 <small>빈칸을 채우면 짚는 말이 만들어집니다</small></h3><div class="dtypes">' + D.discrepancyTypes.map(function (x, i) {
      return '<div class="dt"><b>' + esc(x.k) + '</b><small>' + esc(x.d) + '</small><input class="in in-s" data-dt="' + i + '" data-ab="A" placeholder="' + (i === 0 ? '앞에서 한 말' : i === 1 ? '하겠다고 한 말' : i === 2 ? '말' : '바라는 것') + '" aria-label="' + esc(x.k) + ' 앞쪽"><input class="in in-s" data-dt="' + i + '" data-ab="B" placeholder="' + (i === 0 ? '지금 한 말' : i === 1 ? '예: 2주째 지원을 미루셨어요' : i === 2 ? '예: 목소리가 작아지셨어요' : '예: 관련 경력이 아직 없으세요') + '" aria-label="' + esc(x.k) + ' 뒤쪽"><p class="dt-o" id="dt' + i + '">' + esc(fillDt(i, '', '')) + '</p></div>';
    }).join('') + '</div><p class="small">짚는 말(직면)은 관계가 어느 정도 다져진 뒤에 씁니다. 판단("말이 다르네요")이 아니라 관찰("두 말씀이 함께 있네요")로 말하고, 내담자가 스스로 설명할 시간을 줍니다.</p></section>';
    return pad('연습장 · 모순 클라우드', body) + types;
  }
  function fillDt(i, a, b) { return D.discrepancyTypes[i].f.replace('{A}', a || '○○').replace('{B}', b || '○○'); }
  function cloudReport(t) {
    var r = cloudAnalyze(t), AX = {};
    D.tensionAxes.forEach(function (a, i) { AX[a.id] = i; });
    if (!r.words.length && !r.turns.length) return '<p class="warn">서로 당기는 낱말을 찾지 못했습니다. 말이 짧거나, 사전에 없는 표현일 수 있습니다. 이럴 때는 귀로 들은 엇갈림(말과 표정, 말과 행동)을 아래 네 갈래로 직접 적어 보세요.</p>';
    var pairedAx = {}; r.pairs.forEach(function (p) { pairedAx[p.ax.id] = 1; });
    var ws = r.words.slice().sort(function (a, b) { return (AX[a.ax] - AX[b.ax]) || (a.side < b.side ? -1 : 1); });
    var cloud = '<div class="cloud" aria-label="낱말 구름">' + ws.map(function (w, i) {
      var sz = Math.min(3, w.n) + (pairedAx[w.ax] ? 1 : 0), rot = ((i * 37) % 7) - 3;
      return '<span class="cw cw-' + w.side + ' cz' + sz + (pairedAx[w.ax] ? '' : ' cw-solo') + '" style="--r:' + rot + 'deg" title="' + esc(byId(D.tensionAxes, w.ax)[w.side].label) + '">' + esc(w.w) + '</span>';
    }).join('') + r.feel.map(function (f) { return '<span class="cw cw-f cz1" title="감정 낱말">' + esc(f.w) + '</span>'; }).join('') + '</div>'
      + '<p class="legend"><span class="cw-a">■</span> 한쪽 마음 <span class="cw-b">■</span> 맞은편 마음 <span class="cw-f">■</span> 감정 낱말 · 크고 진한 낱말일수록 맞은편과 짝을 이룹니다.</p>';
    var pairs = r.pairs.length ? '<h4 class="sub">당기는 쌍 ' + r.pairs.length + '개</h4><ol class="tp">' + r.pairs.map(function (p, i) {
      return '<li><p class="tp-h"><b>' + esc(p.ax.name) + '</b><small>' + (p.same ? '한 문장 안' : '서로 다른 문장') + '</small></p>'
        + '<p class="tp-w"><span class="cw-a">' + esc(p.a.w) + '</span><span class="tp-x" aria-hidden="true">⟷</span><span class="cw-b">' + esc(p.b.w) + '</span></p>'
        + '<div class="dbl"><small>양면 반영 만들기 · 내담자 말을 상담사 말로 바꿔 써 보세요</small>'
        + '<label><span>한편으로는</span><input class="in in-s" data-dbl="' + i + '" data-ab="A" value="' + esc(trimClause(p.sa, p.a.w)) + '"></label>'
        + '<label><span>다른 한편으로는</span><input class="in in-s" data-dbl="' + i + '" data-ab="B" value="' + esc(trimClause(p.sb, p.b.w)) + '"></label>'
        + '<p class="dbl-o" id="dbl' + i + '">' + esc(dblLine(trimClause(p.sa, p.a.w), trimClause(p.sb, p.b.w))) + '</p></div></li>';
    }).join('') + '</ol>' : '<p class="small">짝을 이룬 쌍은 없고, 한쪽 마음만 보입니다. 맞은편 마음이 말 밖(표정, 행동)에 있는지 살펴보세요.</p>';
    var turns = r.turns.length ? '<h4 class="sub">이음말로 갈린 문장</h4><ul class="turns">' + r.turns.map(function (x) {
      return '<li><span>' + esc(x.l.slice(0, -x.w.length)) + '<mark class="m-turn">' + esc(x.w) + '</mark></span> <span>' + esc(x.r) + '</span></li>';
    }).join('') + '</ul><p class="small">"~지만, ~는데"로 이어진 말은 뒤쪽만 남기 쉽습니다. 반영할 때는 "그리고"로 바꿔 두 마음을 모두 살립니다.</p>' : '';
    return cloud + pairs + turns;
  }
  function trimClause(sn, w) {
    var x = sn.replace(/[.!?…]+$/, '').trim(), m = rx('(' + D.turnWords + ')', '').exec(x);
    if (m) { var l = x.slice(0, m.index + m[0].length), r = x.slice(m.index + m[0].length); x = l.indexOf(w) >= 0 ? l : (r.indexOf(w) >= 0 ? r : x); }
    x = x.replace(/^[\s,]+|[\s,]+$/g, '');
    return x.length > 40 ? x.slice(0, 40) + '…' : x;
  }
  function dblLine(a, b) {
    a = (a || '○○').replace(/[.!?…]+$/, ''); b = (b || '○○').replace(/[.!?…]+$/, '');
    return '한편으로는 "' + a + '" 하는 마음이 있고, 다른 한편으로는 "' + b + '" 하는 마음도 함께 있으신 것 같아요.';
  }

  /* ───────── 05·06 상황 카드 ───────── */
  function situationTool(key, list, label) {
    var s = st[key];
    var found = s.q.trim() ? list.filter(function (x) { return x.hint && test(x.hint, s.q); }) : [];
    var crisis = found.filter(function (x) { return x.id === 'crisis'; });
    if (crisis.length) found = crisis.concat(found.filter(function (x) { return x.id !== 'crisis'; }));
    var body = '<label class="lb" for="' + key + 'In">내담자가 한 말이나 지금 장면을 적으면 맞는 카드를 찾아 드립니다</label>'
      + '<div class="inrow"><input id="' + key + 'In" class="in" data-sq="' + key + '" type="text" enterkeyhint="search" autocomplete="off" placeholder="' + (key === 'stuck' ? '예: 어차피 해 봤자 소용없어요' : '예: 선생님이 그냥 골라 주세요') + '" value="' + esc(s.q) + '"><button type="button" class="btn btn-p" data-sgo="' + key + '">찾기</button></div>'
      + '<div id="' + key + 'Found" aria-live="polite">' + (s.q.trim() ? (found.length ? '<p class="small">맞을 만한 카드 ' + found.length + '개 · 눌러서 펼치세요</p>' : '<p class="small">맞는 카드를 찾지 못했습니다. 아래 목록에서 가까운 장면을 골라 보세요.</p>') : '') + '</div>'
      + '<ul class="sits" role="list">' + (found.length ? found : list).map(function (x) {
        return '<li><button type="button" class="sit' + (x.id === 'crisis' ? ' sit-c' : '') + '" data-sit="' + key + ':' + x.id + '" aria-expanded="' + (s.id === x.id) + '"><b>' + esc(x.k) + '</b><small>' + esc(x.q) + '</small></button>' + (s.id === x.id ? sitCard(x) : '') + '</li>';
      }).join('') + '</ul>' + (found.length ? '<button type="button" class="lnk" data-sclear="' + key + '">전체 목록 보기</button>' : '');
    return pad(label, body);
  }
  function sitCard(x) {
    return '<div class="card' + (x.id === 'crisis' ? ' card-c' : '') + '">'
      + '<p class="cd-s"><span class="cd-l">먼저 알아차리기</span>' + esc(x.sign) + '</p>'
      + '<div class="cd-g"><div><span class="cd-l cd-no">피할 말</span><ul>' + x.avoid.map(function (a) { return '<li><b>' + esc(a[0]) + '</b><small>' + esc(a[1]) + '</small></li>'; }).join('') + '</ul></div>'
      + '<div><span class="cd-l cd-ok">해 볼 말</span><ul>' + x.try.map(function (a) { return '<li><button type="button" class="phr-t" data-copy="' + esc(a.replace(/^"|"$/g, '')) + '">' + esc(a) + '</button></li>'; }).join('') + '</ul></div></div>'
      + '<p class="cd-s"><span class="cd-l">이어 가기</span>' + esc(x.next) + '</p></div>';
  }
  function toolFrame() {
    var s = st.frame, n = D.structureList.filter(function (_, i) { return s.done[i]; }).length, all = D.structureList.length;
    var chk = '<p class="step"><b>1</b> 첫 만남 구조화 점검표 · 챙긴 것을 눌러 표시하세요 <span class="num">' + n + ' / ' + all + '</span></p><ul class="chk">' + D.structureList.map(function (x, i) {
      return '<li><button type="button" class="ci" data-sl="' + i + '" role="checkbox" aria-checked="' + !!s.done[i] + '"><span class="cb">' + (s.done[i] ? ico('check') : '') + '</span><span><b>' + esc(x.k) + '</b><small>' + esc(x.line) + '</small></span></button></li>';
    }).join('') + '</ul>' + (n === all ? '<p class="done-stamp" aria-label="모두 챙겼습니다">다 챙김</p>' : '')
      + '<p class="small">말투는 기관과 내담자에 맞게 바꿔 쓰세요. 비밀보장의 예외, 개인정보 이용 범위는 소속 기관의 지침과 동의서 내용을 그대로 따릅니다.</p>';
    return pad('연습장 · 첫 만남 구조화', chk) + situationTool('frame', D.frame, '연습장 · 선 긋기 상황 카드');
  }

  /* ───────── 화면 ───────── */
  function viewHome() {
    var h = '<section class="intro"><p class="eyebrow">상담 대화 연습장</p><h2>지금 필요한 장면을 바로 고르세요.</h2>'
      + '<p class="lead">여섯 갈래는 순서가 없습니다. 처음부터 차례로 볼 필요 없이, 상담 중에 막힌 장면이나 연습하고 싶은 기술 하나만 골라 펼치면 됩니다.</p></section>';
    h += '<ul class="home-picks">' + MODS.map(function (m) {
      return '<li><a href="#' + m.id + '"><span class="hp-no">' + m.no + '</span><span class="hp-tx"><small>이럴 때</small><b>' + esc(m.when) + '</b><span>' + esc(m.name) + ' · ' + esc(m.term) + '</span></span><span class="hp-ar">' + ico('arrow') + '</span></a></li>';
    }).join('') + '</ul>';
    h += drillBlock('mix', drillList(), '오늘의 한 문제');
    return h;
  }
  function viewModule(m) {
    var tool = '';
    if (m.tool === 'reflect') tool = toolReflect();
    else if (m.tool === 'question') tool = toolQuestion();
    else if (m.tool === 'cushion') tool = toolCushion();
    else if (m.tool === 'cloud') tool = toolCloud();
    else if (m.tool === 'situations') tool = situationTool('stuck', D.stuck, '연습장 · 막힐 때 상황 카드');
    else if (m.tool === 'frame') tool = toolFrame();
    return '<a class="back" href="#">' + ico('back') + '<span>갈래 고르기</span></a>' + modHead(m) + points(m) + tool + phraseBlock(m)
      + drillBlock(m.id, drillList(m.id), '연습 문제') + others(m.id);
  }
  function viewMix() {
    return '<a class="back" href="#">' + ico('back') + '<span>갈래 고르기</span></a><header class="mh"><p class="mh-no">여섯 갈래 섞기</p><h2>섞어서 연습하기</h2><p class="lead">내담자의 말 한 줄을 보고 세 가지 응답 가운데 더 나은 쪽을 고릅니다. 문제는 무작위 순서로 나옵니다.</p></header>'
      + drillBlock('mix', drillList(), '섞어서 연습') + others('');
  }
  function viewAbout() {
    var map = [['재진술·감정 반영', '01 되받아 주기', '요약을 더해 "듣고 돌려주기" 한 갈래로 묶었습니다. 셋 다 내담자의 말을 상담사의 말로 되돌려준다는 점이 같습니다.'],
      ['질문 전환', '02 질문 바꾸기', '닫힌·왜·유도·이중·선택형 질문을 판별하고, 해결중심 질문 틀(예외·척도·기적)을 더했습니다.'],
      ['쿠션어', '03 부드럽게 전하기', '낱말 목록에 그치지 않도록 "쿠션 → 사실 → 이유 → 대안 → 확인" 다섯 칸 구조와 걸리는 표현 점검기를 더했습니다.'],
      ['모순 클라우드', '04 엇갈림 찾기', '낱말 쌍 찾기에서 끝나지 않고, 양면 반영과 직면(말↔말, 말↔행동, 말↔표정, 바람↔현실)까지 잇도록 넓혔습니다.'],
      ['저항·침묵 대응', '05 막힐 때', '침묵을 "생각하는 침묵"과 "막힌 침묵"으로 나누고, 비자발적 참여(의무로 온 내담자), 위험 신호 카드를 더했습니다.'],
      ['구조화·경계 설정', '06 선 긋고 길 잡기', '첫 만남 구조화 점검표, 시간 초과, 목표 되잡기, 회기 마무리를 더했습니다.']];
    return '<a class="back" href="#">' + ico('back') + '<span>갈래 고르기</span></a><header class="mh"><p class="mh-no">이 연습장에 대해</p><h2>갈래를 나눈 기준</h2>'
      + '<p class="lead">상담 대화 기술을 "언제 쓰는가"로 나누었습니다. 기술 이름보다 상담 중에 마주치는 장면이 먼저 떠오르기 때문입니다. 여섯 갈래는 서로 순서가 없으며, 처음 구상한 여섯 항목을 아래처럼 다듬었습니다.</p></header>'
      + '<section class="blk"><ul class="remap">' + map.map(function (x) { return '<li><span class="rm-a">' + esc(x[0]) + '</span><span class="pa" aria-hidden="true">→</span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></li>'; }).join('') + '</ul></section>'
      + '<section class="blk"><h3>이렇게 써 주세요</h3><ul class="dnt">'
      + '<li><b>정답지가 아니라 연습장입니다.</b><small>예문과 판별 결과는 비교해 볼 거리일 뿐입니다. 같은 말도 내담자, 관계, 말투, 표정에 따라 맞는 응답이 달라집니다.</small></li>'
      + '<li><b>판별은 글자 패턴만 봅니다.</b><small>입력한 문장에서 미리 정해 둔 낱말·어미를 찾는 방식이라 맥락과 억양은 읽지 못합니다. 걸리지 않았다고 좋은 말이라는 뜻은 아닙니다.</small></li>'
      + '<li><b>입력한 글은 어디에도 저장되거나 전송되지 않습니다.</b><small>화면을 닫으면 사라집니다. 그래도 내담자의 실명·연락처·주민등록번호 같은 개인정보는 넣지 마세요.</small></li>'
      + '<li><b>위기 상황은 기관 지침이 먼저입니다.</b><small>"위험 신호" 카드는 연습용입니다. 실제 상황에서는 소속 기관의 위기 대응 절차를 따르고 전문 기관(자살예방 상담전화 109, 정신건강위기상담전화 1577-0199)에 연계합니다.</small></li></ul></section>'
      + '<section class="blk"><h3>바탕 이론과 출처</h3><dl class="src">' + D.sources.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>'
      + '<p class="small">이 연습장의 예문과 사례는 모두 자료실이 새로 쓴 연습용 문장이며, 위 책과 자료의 문장을 옮기지 않았습니다. 사례 속 인물은 지어낸 사람입니다. 판 ' + esc(D.version) + ' · ' + esc(D.updated) + '</p></section>';
  }

  /* ───────── 경로 ───────── */
  var curView = null;
  function route(keepScroll) {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    var html;
    if (MOD[h]) html = viewModule(MOD[h]);
    else if (h === 'mix') html = viewMix();
    else if (h === 'about') html = viewAbout();
    else { h = ''; html = viewHome(); }
    d.body.setAttribute('data-view', h || 'home');
    renderPicks(h);
    $('view').innerHTML = html;
    if (curView !== h && keepScroll !== true) {
      var top = $('view').getBoundingClientRect().top + window.pageYOffset - 8;
      if (curView !== null) window.scrollTo(0, h ? Math.max(0, top) : 0);
    }
    curView = h;
    d.title = (MOD[h] ? MOD[h].name + ' · ' : h === 'mix' ? '섞어서 연습 · ' : h === 'about' ? '이 연습장에 대해 · ' : '') + '상담 대화 연습장';
  }
  /* 입력 중인 칸의 포커스·커서를 지키며 일부만 다시 그린다 */
  function rerender() {
    var a = d.activeElement, id = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    var y = window.pageYOffset;
    route(true);
    window.scrollTo(0, y);
    if (id && $(id)) { var el = $(id); el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch (e) {} }
  }

  /* ───────── 이벤트 ───────── */
  d.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) return;
    var ds = t.dataset;
    if (ds.copy != null) { copy(ds.copy, null); flash(t); return; }
    if (ds.dk != null) { var s = st.drill[ds.dk]; if (s.pick < 0) { s.pick = +ds.op; rerender(); } return; }
    if (ds.dnext != null) { var k = ds.dnext, sd = st.drill[k], n = drillList(k === 'mix' ? '' : k).length; sd.i = (sd.i + (+ds.dir) + n) % n; sd.pick = -1; rerender(); var el = $('drill-' + k); if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' }); return; }
    /* 01 */
    if (ds.rc != null) { st.reflect.c = ds.rc; st.reflect.checked = false; st.reflect.showEx = false; st.reflect.showFeel = false; rerender(); return; }
    if (ds.sn != null) { var mk = st.reflect.marks[st.reflect.c]; mk[ds.sn] = ((mk[ds.sn] || 0) + 1) % 3; rerender(); return; }
    if (ds.rmode != null) { st.reflect.mode = ds.rmode; if (st.reflect.checked) st.reflect.checked = true; rerender(); return; }
    if (ds.rtoggle != null) { st.reflect[ds.rtoggle] = !st.reflect[ds.rtoggle]; rerender(); return; }
    if (ds.rcheck != null) { st.reflect.checked = true; rerender(); return; }
    if (ds.ins != null) { insertAt($('rDraft'), ds.ins); st.reflect.draft = $('rDraft').value; return; }
    /* 02 */
    if (ds.qgo != null) { st.question.q = $('qIn').value; rerender(); return; }
    if (ds.qex != null) { st.question.q = ds.qex; rerender(); return; }
    /* 03 */
    if (ds.cc != null) { var cs = byId(D.cushionCases, ds.cc); st.cushion.case = cs.id; st.cushion.t = cs.raw; st.cushion.parts = cs.parts.slice(); if (!st.cushion.parts[4]) st.cushion.parts[4] = ''; rerender(); return; }
    if (ds.cgo != null) { st.cushion.t = $('cIn').value; rerender(); return; }
    if (ds.op1 != null) { st.cushion.parts[0] = st.cushion.parts[0] === ds.op1 ? '' : ds.op1; rerender(); return; }
    if (ds.op5 != null) { st.cushion.parts[4] = st.cushion.parts[4] === ds.op5 ? '' : ds.op5; rerender(); return; }
    if (ds.copyasm != null) { copy(assemble(), t.querySelector('span')); return; }
    /* 04 */
    if (ds.mc != null) { st.cloud.c = ds.mc; st.cloud.t = ds.mc === 'mine' ? '' : byId(D.cloudCases, ds.mc).t; rerender(); if (ds.mc === 'mine') $('mIn').focus(); return; }
    if (ds.mgo != null) { st.cloud.t = $('mIn').value; rerender(); return; }
    /* 05·06 */
    if (ds.sit != null) { var p = ds.sit.split(':'); st[p[0]].id = st[p[0]].id === p[1] ? '' : p[1]; rerender(); return; }
    if (ds.sgo != null) { st[ds.sgo].q = $(ds.sgo + 'In').value; st[ds.sgo].id = ''; rerender(); return; }
    if (ds.sclear != null) { st[ds.sclear].q = ''; rerender(); return; }
    if (ds.sl != null) { st.frame.done[ds.sl] = !st.frame.done[ds.sl]; rerender(); return; }
  });
  d.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'rDraft') st.reflect.draft = t.value;
    else if (t.id === 'rMine') { st.reflect.mine = t.value; st.reflect.marks.mine = {}; clearTimeout(t._t); t._t = setTimeout(rerender, 500); }
    else if (t.id === 'cIn') st.cushion.t = t.value;
    else if (t.id === 'mIn') { st.cloud.t = t.value; st.cloud.c = 'mine'; }
    else if (t.dataset.slot != null) { st.cushion.parts[+t.dataset.slot] = t.value; $('asmOut').textContent = assemble(); }
    else if (t.dataset.dt != null) { var i = +t.dataset.dt, box = t.parentNode, ins = box.querySelectorAll('input'); $('dt' + i).textContent = fillDt(i, ins[0].value.trim(), ins[1].value.trim()); }
    else if (t.dataset.dbl != null) { var j = t.dataset.dbl, b2 = t.closest('.dbl').querySelectorAll('input'); $('dbl' + j).textContent = dblLine(b2[0].value.trim(), b2[1].value.trim()); }
  });
  d.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    var t = e.target;
    if (t.id === 'qIn') { e.preventDefault(); st.question.q = t.value; rerender(); }
    else if (t.dataset && t.dataset.sq) { e.preventDefault(); st[t.dataset.sq].q = t.value; st[t.dataset.sq].id = ''; rerender(); }
  });
  function insertAt(ta, w) {
    if (!ta) return; var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, e = ta.selectionEnd == null ? s : ta.selectionEnd;
    var pre = ta.value.slice(0, s), sp = pre && !/\s$/.test(pre) ? ' ' : '';
    ta.value = pre + sp + w + ta.value.slice(e); var p = (pre + sp + w).length; ta.focus(); try { ta.setSelectionRange(p, p); } catch (x) {}
  }
  function flash(el) { el.classList.add('copied'); setTimeout(function () { el.classList.remove('copied'); }, 1400); }

  /* 안내 한 줄 펼치기 */
  $('pvToggle').addEventListener('click', function () {
    var box = $('pv'), open = !box.classList.contains('open');
    box.classList.toggle('open', open); this.setAttribute('aria-expanded', String(open));
    $('pvLabel').textContent = open ? '접기' : '펼치기';
    if (open) $('pvBody').removeAttribute('inert'); else $('pvBody').setAttribute('inert', '');
  });

  window.addEventListener('hashchange', function () { route(); });
  route();
})();
