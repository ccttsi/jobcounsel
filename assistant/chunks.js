/* 자료실 비서 — 근거 조각 찾기 (assistant/chunks.js · AUP-3)

   비서에게 «섹터 소개문» 대신 «실제 내용 조각»(법정 수치·법령 쉬운 풀이·조문)을 근거로 건넨다.
   조각은 assistant/data/chunks.json(ops/scripts/build_chunks.py 가 만든다).

   한 파일을 두 곳이 함께 쓴다 — 브라우저(assets/assistant.js → window.JCAssistChunks)와
   AUP-2 성적표 러너(ops/eval/aup_eval.mjs). 근거를 고르는 규칙이 하나라야 성적표 점수가 라이브와 같다.

   찾는 법(가볍게, 네트워크 없이)
     · 글자 2-gram 겹침을 조각 전체에서의 드묾(idf)으로 무게를 준다 — 조사·어미가 달라도 닿는다.
     · 조각의 찾기 낱말(k)이 질문에 그대로 들어 있으면 더 얹는다(«실급»·«최저시급»처럼 짧은 구어).
     · 문턱 아래는 버린다 — 관계없는 조각을 끼워 넣으면 비서가 엉뚱한 숫자를 말한다.

   evidence(q, hits) — 조각 상위 몇 개를 앞에, 기존 검색 결과를 뒤에 붙여 5개로 맞춘다.
   같은 주소·같은 조각은 한 번만. 결과 모양은 assets/assistant.js 의 evidence() 와 같다({title, sector, url, snippet}). */
(function (root) {
  'use strict';

  var VERSION = 'witw-chunks-find/1.0.0';
  var data = null, grams = null, df = null, N = 0;

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

  var api = { version: VERSION, use: use, find: find, evidence: evidence, ready: function () { return !!data; } };
  root.JCAssistChunks = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
