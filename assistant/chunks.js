/* 자료실 비서 — 근거 조각 찾기 (assistant/chunks.js · AUP-3)

   비서에게 «섹터 소개문» 대신 «실제 내용 조각»(법정 수치·법령 쉬운 풀이·조문)을 근거로 건넨다.
   조각은 assistant/data/chunks.json(ops/scripts/build_chunks.py 가 만든다).

   한 파일을 두 곳이 함께 쓴다 — 브라우저(assets/assistant.js → window.JCAssistChunks)와
   AUP-2 성적표 러너(ops/eval/aup_eval.mjs). 근거를 고르는 규칙이 하나라야 성적표 점수가 라이브와 같다.

   찾는 법(가볍게, 네트워크 없이)
     · 글자 2-gram 겹침을 조각 전체에서의 드묾(idf)으로 무게를 준다 — 조사·어미가 달라도 닿는다.
     · 조각의 찾기 낱말(k)이 질문에 그대로 들어 있으면 더 얹는다(«실급»·«최저시급»처럼 짧은 구어).
     · 문턱 아래는 버린다 — 관계없는 조각을 끼워 넣으면 비서가 엉뚱한 숫자를 말한다.

   뜻으로 한 겹 더(AUP-7)
     · assistant/data/semantic-vectors.json 의 조각 벡터(int8·길이 1)를 useVectors() 로 받고,
       질문 벡터가 있을 때만(setQueryVector) 코사인을 «더한다». 둘 다 없으면 위의 글자 규칙만 돈다(지금과 같다).
     · 더한 점수도 같은 문턱(MIN)을 넘어야 하므로, 글자가 하나도 안 닿는 조각은 뜻이 아주 가까울 때만 들어온다.

   evidence(q, hits) — 조각 상위 몇 개를 앞에, 기존 검색 결과를 뒤에 붙여 5개로 맞춘다.
   같은 주소·같은 조각은 한 번만. 결과 모양은 assets/assistant.js 의 evidence() 와 같다({title, sector, url, snippet}). */
(function (root) {
  'use strict';

  var VERSION = 'witw-chunks-find/1.1.0';
  var data = null, grams = null, df = null, N = 0;

  /* AUP-7 — 조각 벡터와 질문 벡터. 없으면 null 로 두고 글자 규칙만 쓴다. */
  var VEC = null, VMODEL = '', QV = null, QMODEL = '';
  /* 2026-11-27 실측: 조각 층에 뜻 점수를 더해도 근거 조각이 붙는 문항(31%)과 법정 수치 적중(32/32)이
     그대로였다 — 조각은 이미 글자 규칙이 강하게 잡고, 뜻 점수는 순서만 흔들었다. 그래서 기본은 0(꺼짐)이다.
     벡터는 붙여 두고(useVectors·setQueryVector), 조각을 더 넓히는 쪽으로 쓸 때 cfg()로 켠다. */
  var SEM_LO = 0.70, SEM_HI = 0.85, SEM_K = 0;   // 코사인 문턱·포화점·더하는 최대 점수(글자 점수와 같은 눈금)

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\s.,·:;!?()\[\]「」『』“”"'‘’\-–—/~%]+/g, '');
  }
  function bigrams(s) {
    var t = norm(s), out = {};
    for (var i = 0; i < t.length - 1; i++) out[t.slice(i, i + 2)] = 1;
    return out;
  }

  function use(json) {
    data = json && Array.isArray(json.chunks) ? json : { chunks: [] };
    N = data.chunks.length; df = {}; grams = [];
    data.chunks.forEach(function (c) {
      var g = bigrams(c.t + ' ' + c.x);
      grams.push(g);
      for (var k in g) df[k] = (df[k] || 0) + 1;
    });
    return api;
  }

  /* 정적 조각 벡터(semantic-vectors.json)를 붙인다 — 조각 번호(c.i)로 잇는다. */
  function unit(b64) {
    try {
      var bin = atob(String(b64 || '')), n = bin.length;
      if (!n) return null;
      var out = new Float32Array(n), i, x, sum = 0;
      for (i = 0; i < n; i++) { x = (bin.charCodeAt(i) << 24) >> 24; out[i] = x; sum += x * x; }
      sum = Math.sqrt(sum);
      if (!sum) return null;
      for (i = 0; i < n; i++) out[i] /= sum;
      return out;
    } catch (e) { return null; }
  }
  function useVectors(json) {
    VEC = null; VMODEL = '';
    if (!json || !json.chunks) return api;
    var m = {}, ok = 0;
    for (var k in json.chunks) { var v = unit(json.chunks[k]); if (v) { m[k] = v; ok++; } }
    if (!ok) return api;
    VEC = m; VMODEL = String(json.model || '');
    return api;
  }

  /* 질문 벡터 — 부르는 쪽(경량 질의 임베딩 경로)이 있을 때만 온다. 모델·차원이 다르면 받지 않는다. */
  function setQueryVector(vec, model) {
    QV = null; QMODEL = '';
    if (!VEC || !vec || !vec.length) return false;
    if (model && VMODEL && String(model) !== VMODEL) return false;
    var n = 0, i, any = VEC[Object.keys(VEC)[0]];
    if (any && any.length !== vec.length) return false;
    for (i = 0; i < vec.length; i++) n += vec[i] * vec[i];
    n = Math.sqrt(n);
    if (!n) return false;
    var out = new Float32Array(vec.length);
    for (i = 0; i < vec.length; i++) out[i] = vec[i] / n;
    QV = out; QMODEL = String(model || '');
    return true;
  }

  function score(q, i) {
    var c = data.chunks[i], qg = bigrams(q), g = grams[i], s = 0, n = 0;
    for (var k in qg) {
      n++;
      if (g[k]) s += Math.log(1 + N / (df[k] || 1));
    }
    if (!n) return 0;
    s = s / Math.sqrt(n);
    var nq = norm(q), kw = 0;
    (c.k || []).forEach(function (w) { var nw = norm(w); if (nw.length >= 2 && nq.indexOf(nw) >= 0) kw += nw.length >= 3 ? 1.6 : 1.1; });
    s += Math.min(kw, 4.5);
    /* 숫자를 묻는 질문이면 법정 수치 조각을 앞세운다 — 법령 조각은 «얼마»를 말하지 않는다 */
    if (NUMQ.test(String(q)) && /legal-constants/.test(c.src)) s += 3.5;
    /* 뜻이 가까우면 더한다 — 문턱(SEM_LO) 아래는 0, SEM_HI 부터 최대 SEM_K. */
    if (QV && VEC && VEC[i]) {
      var cv = VEC[i], dot = 0;
      for (var z = 0; z < cv.length; z++) dot += cv[z] * QV[z];
      var g = (dot - SEM_LO) / (SEM_HI - SEM_LO);
      if (g > 0) s += SEM_K * (g > 1 ? 1 : g);
    }
    return s;
  }
  var NUMQ = /얼마|몇\s*(퍼센트|%|프로|시간|원|만\s*원|일|달)|퍼센트|요율|상한|하한|최저\s*(로|금액)|금액|\d+\s*(%|원|만\s*원|시간)|맞(죠|나요|아요)\?|월급|일당|시급|떼/;

  /* 상위 조각 — 문턱(MIN)을 넘는 것만, 같은 원천 묶음은 하나만 */
  var MIN = 4;
  function find(q, k) {
    if (!data) return [];
    var list = [];
    for (var i = 0; i < N; i++) { var s = score(q, i); if (s >= MIN) list.push({ i: i, s: s }); }
    list.sort(function (a, b) { return b.s - a.s; });
    var out = [], seen = {};
    for (var j = 0; j < list.length && out.length < (k || 2); j++) {
      var c = data.chunks[list[j].i];
      if (seen[c.src]) continue;
      seen[c.src] = 1;
      out.push({ title: c.t, sector: c.s, url: c.u, snippet: c.x, score: Math.round(list[j].s * 10) / 10, chunk: c.i });
    }
    return out;
  }

  /* 비서에게 건넬 근거 5개 — 조각(최대 2) + 검색 결과 */
  function evidence(q, hits, total) {
    total = total || 5;
    var out = [], urls = {};
    find(q, 2).forEach(function (c) { out.push({ title: c.title, sector: c.sector, url: c.url, snippet: c.snippet, kind: 'chunk' }); });
    (hits || []).forEach(function (h) {
      if (out.length >= total) return;
      var dup = out.some(function (o) { return o.kind === 'chunk' && o.url === h.url && o.title === h.title; });
      if (dup || urls[h.url + '|' + h.title]) return;
      urls[h.url + '|' + h.title] = 1;
      out.push({ title: h.title, sector: h.sector, url: h.url, snippet: h.snippet || '' });
    });
    return out.slice(0, total);
  }

  var api = { version: VERSION, use: use, find: find, evidence: evidence, ready: function () { return !!data; },
    useVectors: useVectors, setQueryVector: setQueryVector,
    /* 시험·조율용 — 뜻 점수의 문턱·포화점·세기를 바꿔 본다(화면에서는 쓰지 않는다). */
    cfg: function (lo, hi, k) {
      if (typeof lo === 'number') SEM_LO = lo;
      if (typeof hi === 'number') SEM_HI = hi;
      if (typeof k === 'number') SEM_K = k;
      return { lo: SEM_LO, hi: SEM_HI, k: SEM_K };
    },
    vectors: function () { return VEC ? { model: VMODEL, query: !!QV } : null; } };
  root.JCAssistChunks = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
