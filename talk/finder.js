/*
 * 상담 대화 연습장 · 찾기 엔진 (관련도 순위)
 *
 * 아무 말이나 넣으면, 연습장 안의 모든 항목(갈래, 상황 카드, 표현, 질문 짝·틀, 다듬기 예,
 * 직면 틀, 연습 사례, 연습 문제, 구조화 문장, 피할 말) 가운데 가까운 것을 순서대로 뽑는다.
 * 외부 API·AI 없이 브라우저 안에서만 계산한다.
 *
 * 1) 조각 나누기: 띄어쓰기·문장부호를 지우고 두 글자 조각(바이그램)으로 쪼갠다.
 *    한국어는 어미가 붙어도 앞 두 글자가 남아 "불안해요/불안하다"가 서로 만난다.
 * 2) 신호 찾기: data.js의 규칙으로 감정 낱말, 질문 유형, 걸리는 표현, 당기는 낱말 쌍,
 *    상황 카드 단서(hint)를 찾아 신호 조각(sig:…)으로 더한다. 신호 조각은 무게가 크다.
 * 3) 무게 매기기(TF-IDF): 여러 항목에 흔한 조각은 가볍게, 드문 조각은 무겁게 본다.
 *    입력 조각마다 "얼마나 결과를 끌어왔는가"를 계산해 화면에 진하기로 보여 준다(어텐션처럼).
 * 4) 가까움: 항목 전체 글, 그리고 숨은 말뭉치(data.js corpus)의 예문 하나하나와 코사인 유사도를
 *    구해 가장 높은 값을 쓴다. 긴 입력은 예문이 입력 안에 얼마나 들어 있는지(포함률)도 본다.
 * 5) 연결망: data.js links의 이웃 항목에 점수 일부를 나눠 준다(한 걸음 전파).
 * 6) 안전: 위험 신호가 잡히면 위기 카드를 항상 맨 위로 올린다.
 */
(function () {
  'use strict';
  var D = window.TALK_DATA; if (!D) return;

  var PUNCT = /[\s.,!?…"“”'‘’()~\-·:;\/\[\]「」『』<>]/;
  function norm(s) { var o = '', map = []; s = String(s || '').toLowerCase(); for (var i = 0; i < s.length; i++) if (!PUNCT.test(s[i])) { o += s[i]; map.push(i); } return { t: o, map: map }; }
  function re(src) { return new RegExp(src); }
  function reg(src) { return new RegExp(src, 'g'); }

  /* ───────── 신호 탐지기 ───────── */
  var DET = [];
  D.feelings.forEach(function (f) { DET.push({ sig: 'feel:' + f.k, re: f.re, w: .35, label: f.w, kind: '감정' }); });
  D.questionRules.forEach(function (r) { DET.push({ sig: 'q:' + r.id, re: r.re, w: .5, label: r.label, kind: '질문', qOnly: true }); });
  D.softRules.forEach(function (r) { DET.push({ sig: 'soft:' + r.id, re: r.re, w: .5, label: r.label, kind: '걸리는 표현' }); });
  D.stuck.concat(D.frame).forEach(function (c) {
    var key = (D.stuck.indexOf(c) >= 0 ? 'stuck:' : 'frame:') + c.id;
    if (c.hint) DET.push({ sig: 'hint:' + key, re: c.hint, w: c.id === 'crisis' ? 3 : 1.1, label: c.k, kind: '상황', card: key });
  });
  function detect(text) {
    var out = [], seen = {};
    DET.forEach(function (d) {
      if (seen[d.sig]) return;
      if (d.qOnly && !/\?|[까요죠니냐]\s*$|왜|어떻게|무엇|뭐/.test(text)) return;
      var r = reg(d.re), m, spans = [];
      while ((m = r.exec(text))) { if (!m[0]) { r.lastIndex++; continue; } spans.push([m.index, m.index + m[0].length]); }
      if (spans.length) { seen[d.sig] = 1; out.push({ sig: d.sig, w: d.w, label: d.label, kind: d.kind, spans: spans }); }
    });
    /* 당기는 낱말 쌍 */
    D.tensionAxes.forEach(function (ax) {
      var a = reg(ax.a.re), b = reg(ax.b.re), ma = a.exec(text), mb = b.exec(text);
      if (ma && mb && ma[0] !== mb[0]) out.push({ sig: 'pair:' + ax.id, w: .55, label: ax.name, kind: '당기는 쌍', spans: [[ma.index, ma.index + ma[0].length], [mb.index, mb.index + mb[0].length]] });
    });
    return out;
  }

  /* ───────── 조각과 무게 ───────── */
  function grams(text) {
    var n = norm(text), t = n.t, g = {};
    for (var i = 0; i < t.length - 1; i++) { var k = t.substr(i, 2); g[k] = (g[k] || 0) + 1; }
    if (t.length === 1) g['1:' + t] = 1;
    return g;
  }
  var ITEMS = [], BYKEY = {}, DF = {}, NDOC = 0;
  function add(it) {
    it.ex = ((D.corpus && D.corpus[it.key]) || []).concat(it.ex || []);
    var full = [it.title, it.text].concat(it.ex).join(' ');
    it.g = grams(full);
    /* 상황 단서(hint:)는 그 카드 자신의 것만 단다. 다른 카드의 단서가 본문에 우연히 걸려도 무시한다 */
    it.sigs = {}; detect(full).forEach(function (s) {
      if (s.sig.indexOf('hint:') === 0) return;
      /* 질문 유형·걸리는 표현 신호는 상담사의 말투를 가리키므로, 질문·전하기 갈래 항목에만 단다 */
      if (/^(q|soft):/.test(s.sig) && it.mod !== 'question' && it.mod !== 'cushion') return;
      it.sigs[s.sig] = 1;
    });
    if (it.card && it.card.hint) it.sigs['hint:' + it.key] = 1;
    (it.sig || []).forEach(function (s) { it.sigs[s] = 1; });
    it.exg = it.ex.map(grams);
    ITEMS.push(it); BYKEY[it.key] = it;
  }
  var ICON = {}; D.modules.forEach(function (m) { ICON[m.id] = m.icon; });
  var NAME = {}; D.modules.forEach(function (m) { NAME[m.id] = m.name; });

  /* 색인 만들기: 연습장의 모든 항목 */
  D.modules.forEach(function (m) {
    var sig = { reflect: ['feel:*'], question: ['q:*'], cushion: ['soft:*'], cloud: ['pair:*'] }[m.id] || [];
    add({ key: 'mod:' + m.id, mod: m.id, kind: '갈래', title: m.name, snip: m.when, text: [m.when, m.term, m.lead].concat((m.points || []).map(function (p) { return p.join(' '); })).join(' '), sig: sig });
    (m.phrases || []).forEach(function (p, i) { add({ key: 'ph:' + m.id + ':' + i, mod: m.id, kind: '바로 쓰는 표현', title: p.t.replace(/^"|"$/g, ''), snip: p.n, text: p.n, copy: p.t.replace(/^"|"$/g, ''), ex: [p.t] }); });
    (m.donts || []).forEach(function (p, i) { add({ key: 'dn:' + m.id + ':' + i, mod: m.id, kind: '피할 말', title: p[0], snip: p[1], text: p[1], ex: [p[0]] }); });
  });
  D.stuck.forEach(function (c) { add({ key: 'stuck:' + c.id, mod: 'stuck', kind: '상황 카드', title: c.k, snip: c.q, text: [c.q, c.sign, c.tags.join(' '), c.next].concat(c.try, c.avoid.map(function (a) { return a.join(' '); })).join(' '), card: c }); });
  D.frame.forEach(function (c) { add({ key: 'frame:' + c.id, mod: 'frame', kind: '상황 카드', title: c.k, snip: c.q, text: [c.q, c.sign, c.tags.join(' '), c.next].concat(c.try, c.avoid.map(function (a) { return a.join(' '); })).join(' '), card: c }); });
  D.questionBank.forEach(function (p, i) { add({ key: 'qb:' + i, mod: 'question', kind: '질문 짝', title: p.o, snip: '닫힌 질문: ' + p.c, text: p.c + ' ' + p.tag, copy: p.o, ex: [p.c, p.o] }); });
  D.questionFrames.forEach(function (f, i) { f.q.forEach(function (q, j) { add({ key: 'qf:' + i + ':' + j, mod: 'question', kind: '질문 틀 · ' + f.k, title: q, snip: f.k, text: f.k, copy: q }); }); });
  D.cushionCases.forEach(function (c) { add({ key: 'cc:' + c.id, mod: 'cushion', kind: '다듬기 예', title: c.k, snip: '"' + c.raw + '" → ' + c.parts.filter(Boolean).join(' '), text: c.raw + ' ' + c.parts.join(' '), ex: [c.raw] }); });
  D.discrepancyTypes.forEach(function (x, i) { add({ key: 'dt:' + i, mod: 'cloud', kind: '직면 틀', title: x.k, snip: x.d, text: x.d + ' ' + x.f.replace(/\{[AB]\}/g, '') }); });
  D.reflectCases.forEach(function (c) { add({ key: 'rc:' + c.id, mod: 'reflect', kind: '연습 사례', title: c.who, snip: c.s[0] + ' …', text: c.s.join(' ') + ' ' + c.feel.join(' ') + ' ' + c.ex.fe }); });
  D.cloudCases.forEach(function (c) { add({ key: 'mc:' + c.id, mod: 'cloud', kind: '연습 사례', title: c.who, snip: c.t.slice(0, 40) + '…', text: c.t }); });
  D.drills.forEach(function (q, i) { var ok = q.o.filter(function (o) { return o.ok; })[0]; add({ key: 'dr:' + i, mod: q.m, kind: '연습 문제', title: q.c, snip: '더 나은 응답: ' + (ok ? ok.t : ''), text: q.c + ' ' + (ok ? ok.t + ' ' + ok.f : ''), ex: [q.c].concat(q.o.filter(function (o) { return !o.ok; }).map(function (o) { return o.t; })) }); });
  D.structureList.forEach(function (x, i) { add({ key: 'sl:' + i, mod: 'frame', kind: '구조화 문장', title: x.k, snip: x.line, text: x.line, copy: x.line.replace(/^"|"$/g, '') }); });

  /* 문서 빈도 → 드문 조각일수록 무겁게 */
  ITEMS.forEach(function (it) { NDOC++; for (var k in it.g) DF[k] = (DF[k] || 0) + 1; });
  /* 어미·조사처럼 어디에나 붙는 조각은 따로 가볍게 본다 */
  var STOP = {}; '어요 아요 해요 세요 에요 예요 니다 습니 는데 하고 고싶 싶어 싶은 있어 없어 같아 거예 이에 하는 해서 는거 게요 할게 지요 네요 군요 데요 나요 까요 가요 셨어 했어 었어 았어 이야 에서 으로 하게 하지 지만 그냥 근데 그런 이런 저는 제가 하면 해도 는게 은데 어서 아서 거든 든요 잖아 이고 이랑 한테 에게 도요'.split(' ').forEach(function (k) { STOP[k] = 1; });
  function idf(k) { return Math.log(1 + NDOC / (1 + (DF[k] || 0))) * (STOP[k] ? .25 : 1); }
  function vec(g) { var v = {}, n = 0, k; for (k in g) { v[k] = (1 + Math.log(g[k])) * idf(k); n += v[k] * v[k]; } return { v: v, n: Math.sqrt(n) || 1 }; }
  ITEMS.forEach(function (it) { it.vec = vec(it.g); it.exv = it.exg.map(vec); });

  /* 연결망: 양방향으로 */
  var NB = {};
  function link(a, b, w) { (NB[a] = NB[a] || []).push([b, w]); }
  Object.keys(D.links || {}).forEach(function (a) { D.links[a].forEach(function (x) { link(a, x[0], x[1]); link(x[0], a, x[1] * .8); }); });

  function cos(q, d) { var s = 0, k; for (k in q.v) if (d.v[k]) s += q.v[k] * d.v[k]; return s / (q.n * d.n); }
  function cover(q, d) { var s = 0, k; for (k in d.v) if (q.v[k]) s += d.v[k] * d.v[k]; return s / (d.n * d.n); }

  /* ───────── 찾기 ───────── */
  function search(text, opt) {
    opt = opt || {};
    text = String(text || '').trim();
    if (!text) return { hits: [], signals: [], heat: [], text: text };
    var qg = grams(text), q = vec(qg), sig = detect(text), qs = {};
    sig.forEach(function (s) { qs[s.sig] = s.w; });
    var qRule = sig.some(function (s) { return /^q:/.test(s.sig); }), hasQ = qRule || /\?\s*$/.test(text);
    var hasSoft = sig.some(function (s) { return /^soft:/.test(s.sig); });
    var hasPair = sig.some(function (s) { return /^pair:/.test(s.sig); });
    var hasFeel = sig.some(function (s) { return /^feel:/.test(s.sig); });
    var longQ = norm(text).t.length > 24;
    var direct = {};
    ITEMS.forEach(function (it) {
      if (opt.only && !opt.only(it)) return;
      var best = cos(q, it.vec), bi = -1;
      var qlen = norm(text).t.length;
      it.exv.forEach(function (ev, i) {
        var c = cos(q, ev), el = norm(it.ex[i]).t.length;
        /* 짧은 예문이 긴 입력의 한 귀퉁이와만 맞을 때는 덜 믿는다 */
        if (el < qlen / 2) c *= .5 + .5 * el / (qlen / 2);
        if (longQ && ev.n > 0) c = Math.max(c, cover(q, ev) * .8);
        if (c > best) { best = c; bi = i; }
      });
      var s = best * 1.0, why = [];
      /* 신호 맞물림 */
      for (var k in qs) {
        if (it.sigs[k]) { s += qs[k] * (k.indexOf('hint:') === 0 ? 1 : .6); why.push(k); }
        else if (it.sigs[k.split(':')[0] + ':*']) { s += qs[k] * .5; why.push(k); }
      }
      if (qs['hint:' + it.key]) s += .4;
      /* 입력의 모양이 가리키는 갈래 쪽으로 살짝 기울인다 */
      /* 질문 규칙·걸리는 표현이 잡혔다면 상담사가 쓴 말일 가능성이 커서 그 갈래를 크게 올린다 */
      if (hasQ && it.mod === 'question') s += qRule ? .32 : .08;
      if (hasSoft && it.mod === 'cushion') s += .25;
      if (hasPair && it.mod === 'cloud') s += .1;
      if (hasFeel && it.mod === 'reflect') s += .05;
      if (s > 0) direct[it.key] = { s: s, best: best, ex: bi, why: why };
    });
    /* 한 걸음 전파 */
    var final = {};
    Object.keys(direct).forEach(function (k) { final[k] = direct[k].s; });
    Object.keys(direct).forEach(function (k) {
      (NB[k] || []).forEach(function (e) { if (opt.only && BYKEY[e[0]] && !opt.only(BYKEY[e[0]])) return; final[e[0]] = (final[e[0]] || 0) + direct[k].s * e[1] * .3; });
    });
    if (qs['hint:stuck:crisis']) final['stuck:crisis'] = 99;
    var hits = Object.keys(final).map(function (k) { return { key: k, it: BYKEY[k], s: final[k], d: direct[k] || null }; })
      /* 위기 카드는 위험 신호가 잡혔을 때만 띄운다(우연한 글자 겹침으로 뜨지 않게) */
      .filter(function (h) { return h.it && h.s >= (opt.min || .22) && (h.key !== 'stuck:crisis' || qs['hint:stuck:crisis']); })
      .sort(function (a, b) { return b.s - a.s; });
    /* 아무것도 못 찾았어도 말의 모양으로 갈래 하나는 가리킨다 */
    if (!hits.length) {
      var fb = hasQ ? 'mod:question' : hasSoft ? 'mod:cushion' : hasPair ? 'mod:cloud' : hasFeel ? 'mod:reflect' : '';
      if (fb && (!opt.only || opt.only(BYKEY[fb]))) hits.push({ key: fb, it: BYKEY[fb], s: .22, d: null, weak: true });
    }
    var top = hits[0];
    return { hits: hits, signals: sig, heat: heat(text, q, top, sig), text: text, top: top };
  }

  /* 어텐션처럼: 입력의 어느 글자가 맨 윗 결과를 끌어왔는지 */
  function heat(text, q, top, sig) {
    var n = norm(text), H = new Array(text.length).fill(0);
    if (top && top.it) {
      var d = top.d && top.d.ex >= 0 ? top.it.exv[top.d.ex] : top.it.vec;
      for (var i = 0; i < n.t.length - 1; i++) {
        var k = n.t.substr(i, 2);
        if (d.v[k] && q.v[k]) { var w = q.v[k] * d.v[k]; H[n.map[i]] += w; H[n.map[i + 1]] += w; }
      }
    }
    sig.forEach(function (s) { s.spans.forEach(function (sp) { for (var i = sp[0]; i < sp[1]; i++) H[i] += s.w * 6; }); });
    var mx = Math.max.apply(null, H.concat([0.0001]));
    return H.map(function (v) { return v / mx; });
  }

  function neighbors(key) { return (NB[key] || []).slice().sort(function (a, b) { return b[1] - a[1]; }); }

  window.TalkFinder = { search: search, neighbors: neighbors, item: function (k) { return BYKEY[k]; }, icon: ICON, name: NAME, size: function () { return { items: ITEMS.length, examples: ITEMS.reduce(function (a, it) { return a + it.ex.length; }, 0) }; } };
})();
