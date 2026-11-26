/* 경험×공고 레이어 — 화면 코드(자료는 layer-merge/data/lm-core.json, 생성 ops/scripts/build_layer_merge/build.py).
   계약: 두 칸을 겹쳐 K(지식)·S(기술)·A(태도) 연결 근거와 전개 순서만 낸다. 완성 문장을 대신 쓰지 않는다.
   입력한 글은 이 화면 안에서만 계산하고 저장하지 않는다. 내보내기·인쇄·복사 장치는 두지 않는다. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slots(s) { return esc(s).replace(/\[([^\]\s][^\]]{0,14})\]/g, '<span class="slot">[$1]</span>'); }
  var rm = matchMedia('(prefers-reduced-motion: reduce)'), mq = matchMedia('(min-width:900px)');
  function still() { return rm.matches || d.documentElement.hasAttribute('data-jc-imm'); }
  function compact(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ''); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  var D = null, UI = { l1: '', l2: '', merged: false, sample: '', exp: null, post: null, rows: [], ai: {}, open: {} };
  var REQ = {}, FAM = {}, EXP = {};

  fetch('./data/lm-core.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      D = j;
      (j.reqs || []).concat(j.genericReqs || []).forEach(function (x) { REQ[x.id] = x; });
      (j.families || []).forEach(function (f) { FAM[f.id] = f; });
      (j.experiences || []).forEach(function (e) { EXP[e.id] = e; });
      if (PENDING) { UI.l1 = PENDING; $('l1in').value = PENDING; PENDING = ''; }
      renderSamples(); renderFeet();
      $('foot').textContent = '요구를 K·S·A로 나눈 문장과 연결 설명은 자료실이 새로 쓴 해석틀입니다. NCS 능력단위 이름·요소·KSA 항목만 한국산업인력공단 원문(기준일 2026-09-08)이고, 공고·경험 예시는 자료실이 썼습니다. [숫자]·[기간] 자리는 내 사실로 채웁니다.';
    })
    .catch(function () { $('out').innerHTML = '<p class="blank"><span class="note">자료를 불러오지 못했습니다. 잠시 뒤 페이지를 새로 고쳐 주세요.</span></p>'; });

  /* ───── 대문 검색이 넘긴 ?q= — 경험 칸에 그 말을 넣어 둔다 ───── */
  var PENDING = '';
  window.JCDeepLink = function (term) {
    if (!term) return true;
    var el = $('l1in');
    if (!el) { PENDING = String(term).slice(0, 60); return false; }   /* 아직 칸이 없다 — core가 다음 차례에 다시 부른다 */
    UI.l1 = String(term).slice(0, 60); el.value = UI.l1; if (D) renderFeet(); return true;
  };

  /* ───── L1 — 단어 하나를 역량·행동·수치로 넓히기 ───── */
  function findExp(tok) {
    if (!D) return null;
    var n = compact(tok), best = null, bl = 0, i, j;
    for (i = 0; i < D.experiences.length; i++) {
      var e = D.experiences[i];
      for (j = 0; j < e.kw.length; j++) if (compact(e.kw[j]) === n) return { e: e, how: 'exact' };
    }
    for (i = 0; i < D.experiences.length; i++) {
      var x = D.experiences[i];
      for (j = 0; j < x.kw.length; j++) {
        var k = compact(x.kw[j]);
        if (k.length >= 2 && n.length >= 1 && (n.indexOf(k) > -1 || k.indexOf(n) > -1)) { if (k.length > bl) { best = x; bl = k.length; } }
      }
    }
    if (best) return { e: best, how: 'partial' };
    var cats = D.catFallback || {}, keys = Object.keys(cats);
    for (i = 0; i < keys.length; i++) {
      var c = keys[i], hints = cats[c].hints || [];
      for (j = 0; j < hints.length; j++) if (n.indexOf(compact(hints[j])) > -1) return { e: catExp(c, cats[c]), how: 'category' };
    }
    return { e: { id: 'generic', label: '맡은 일', comp: ['기초 역량'], verb: ['정리'], metric: ['[숫자]건 처리'], caps: (D.genericCaps || ['adapt']) }, how: 'generic' };
  }
  function catExp(code, c) { return { id: 'cat_' + code, label: c.label, comp: c.comp, verb: c.verb, metric: c.metric, caps: c.caps }; }

  function parseExp(text) {
    var raw = String(text || '').split(/[,，·ㆍ\/\n;]+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 8);
    var picks = [], nums = [];
    raw.forEach(function (tok) {
      var m = tok.match(/(\d+(?:\.\d+)?)\s*(년|개월|달|주|일|시간|건|명|회|%|곳|개|점)?/);
      if (m) nums.push(m[0].trim());
      var host = tok.replace(/\d+(?:\.\d+)?\s*(년|개월|달|주|일|시간|건|명|회|%|곳|개|점)?/g, '').trim() || tok;
      var f = findExp(host);
      if (f && !picks.some(function (p) { return p.id === f.e.id; })) { f.e.how = f.how; picks.push(f.e); }
    });
    return { picks: picks, nums: nums, raw: raw };
  }

  /* ───── L2 — 공고에서 직무군과 요구 잡기 ───── */
  function parsePost(text) {
    var t = norm(text);
    if (!D || !t) return { fam: null, reqs: [], guessed: false, text: '' };
    var fam = null, top = 0;
    D.families.forEach(function (f) {
      var s = 0;
      f.alias.forEach(function (a) { var k = compact(a); if (k.length >= 2 && compact(t).indexOf(k) > -1) s += 1; });
      if (s > top) { top = s; fam = f; }
    });
    var hits = [];
    function scan(list, weight, isGuessPool) {
      list.forEach(function (req) {
        var score = 0, longest = '';
        req.kw.forEach(function (kw) {
          var k = norm(kw);
          if (k.length < 2) return;
          if (t.indexOf(k) < 0) return;
          score += k.length >= 3 ? 1.4 : 1;
          if (k.length > longest.length) longest = k;
        });
        if (score > 0) hits.push({ req: req, score: score * weight, phrase: phraseOf(text, longest), guessed: !!isGuessPool });
      });
    }
    if (fam) scan(D.reqs.filter(function (r) { return r.fam === fam.id; }), 1, false);
    scan(D.genericReqs || [], 0.6, false);
    hits.sort(function (a, b) { return b.score - a.score || a.req.id.localeCompare(b.req.id); });
    var out = [], seenCap = {};
    hits.forEach(function (hit) {
      if (out.length >= 5) return;
      if (out.some(function (o) { return o.req.id === hit.req.id; })) return;
      /* 같은 역량이 두 번 서면 카드가 겹쳐 보인다 — 세 번째부터는 건너뛴다 */
      var n = seenCap[hit.req.cap] || 0;
      if (n >= 2) return;
      seenCap[hit.req.cap] = n + 1;
      out.push(hit);
    });
    var guessed = false;
    if (!out.length) {
      guessed = true;
      var pool = fam ? D.reqs.filter(function (r) { return r.fam === fam.id; }) : (D.genericReqs || []);
      pool.slice(0, 4).forEach(function (req) { out.push({ req: req, score: 0, phrase: '', guessed: true }); });
    }
    return { fam: fam, reqs: out, guessed: guessed, text: text };
  }
  function phraseOf(text, kw) {
    var k = norm(kw);
    if (!k) return '';
    var lines = String(text).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var segs = [];
    lines.forEach(function (line) { line.split(/[·•,;|]+/).forEach(function (part) { var q = part.trim(); if (q) segs.push(q); }); });
    var best = '', bs = -1;
    segs.forEach(function (q) {
      var n = norm(q);
      if (n.indexOf(k) < 0) return;
      /* 같은 말이 여러 줄에 걸리면 그 말이 더 많이 들어 있는 줄을 고른다(제목 줄에 끌려가지 않게) */
      var s = (n.split(k).length - 1) * 10 + Math.min(k.length, 8) - q.length / 200;
      if (s > bs) { bs = s; best = q; }
    });
    if (!best) return '';
    best = best.replace(/^[\s\-–—*●▪]+/, '').replace(/\s+/g, ' ').trim();
    return best.length > 46 ? best.slice(0, 46).replace(/\s+\S*$/, '') + '…' : best;
  }

  /* ───── 병합 — 요구마다 붙일 경험과 연결 근거 고르기 ───── */
  function pickExp(req, picks) {
    var best = null, bs = -1;
    (picks || []).forEach(function (p) {
      var s = 0;
      if ((p.caps || []).indexOf(req.cap) >= 0) s += 3;
      (p.caps || []).forEach(function (c) { if (c === req.cap) s += 1; });
      (req.kw || []).forEach(function (k) { (p.kw || []).forEach(function (pk) { if (pk.indexOf(k) > -1 || k.indexOf(pk) > -1) s += 1.2; }); });
      (p.comp || []).forEach(function (c) { if (req.label.indexOf(c) > -1 || c.indexOf(req.label) > -1) s += 1.5; });
      if (s > bs) { bs = s; best = p; }
    });
    return { exp: best, score: bs };
  }

  /* 경험의 행동 중 이 요구에 가장 가까운 것을 고른다
     ① 역량 자리가 맞는 행동 ② 요구 낱말이 들어 있는 행동(교대·인수인계 ↔ 「교대 인수인계」) ③ 역량의 기본 행동 */
  function verbOf(e, cap, req) {
    if (e.verbmap && e.verbmap[cap]) return e.verbmap[cap];
    var i = (e.caps || []).indexOf(cap);
    if (i >= 0 && (e.verb || [])[i]) return e.verb[i];
    var best = '', bl = 0;
    (e.verb || []).forEach(function (v) {
      var flat = v.replace(/\s+/g, '');
      ((req && req.kw) || []).forEach(function (k) {
        var kk = k.replace(/\s+/g, '');
        if (kk.length >= 2 && flat.indexOf(kk) > -1 && flat.length > bl) { best = v; bl = flat.length; }
      });
    });
    if (best) return best;
    return ((D && D.caps[cap]) || {}).verb || (e.verb || ['정리'])[0];
  }
  function fillWhy(cap, exp, req) {
    var s = (D.caps[cap] || {}).why || '{req}에 닿는 경험입니다.';
    return fixParticles(s.split('{context}').join(exp.label).split('{verb}').join(verbOf(exp, cap, req)).split('{req}').join(req.label));
  }
  function fillNums(s, nums) {
    (nums || []).forEach(function (n) {
      var m = String(n).match(/^(\d+(?:\.\d+)?)\s*(년|개월|달|주|일|시간|건|명|회|%|곳|개|점)?$/);
      if (!m) return;
      var period = /^(년|개월|달|주|일|시간)$/.test(m[2] || '');
      if (period) { if (s.indexOf('[기간]') > -1) s = s.replace('[기간]', m[1] + (m[2] || '')); }
      else if (s.indexOf('[숫자]') > -1) s = s.replace('[숫자]', m[1] + (m[2] && m[2] !== '개' && m[2] !== '점' ? m[2] : ''));
    });
    return s;
  }

  function merge() {
    if (!D) return;
    var exp = parseExp(UI.l1), post = parsePost(UI.l2);
    UI.exp = exp; UI.post = post; UI.merged = true; UI.ai = {};
    UI.rows = post.reqs.map(function (hit, i) {
      var req = hit.req, pick = pickExp(req, exp.picks);
      /* 역량이 겹치지 않는 경험에 억지로 행동을 붙이지 않는다 — 약하면 «넣어 볼 장면»을 대신 보여 준다 */
      var e = pick.score >= 2 ? pick.exp : null;
      var fit = pick.score >= 4 ? 'good' : e ? 'mid' : 'low';
      var verb = e ? verbOf(e, req.cap, req) : '';
      var metric = e ? (e.metric || ['[숫자]건 처리'])[0] : '[숫자]건 처리';
      return {
        id: req.id, no: (i + 1 < 10 ? '0' : '') + (i + 1), req: req, hit: hit, exp: e, fit: fit, score: pick.score,
        verb: verb, metric: metric,
        why: e ? fillWhy(req.cap, e, req) : '',
        resume: e ? e.label + ' · ' + verb + ' — ' + metric : '',
        steps: e ? [
          { k: '자리', v: e.label + ' · ' + verb },
          { k: '행동', v: (D.caps[req.cap] || {}).act || '무엇을 어떻게 했는지' },
          { k: '연결', v: req.label + ' — ' + req.s + '로 이어 붙이기' }
        ] : [],
      };
    });
    UI.open = {};
    renderFeet(); renderL3(); renderBoard(true);
    var lay = $('layers'); if (lay) lay.scrollTop = 0;
    tryServer();
  }
  function UIRows() { return UI.rows.filter(function (r) { return r.exp; }); }

  /* ───── 그리기 ───── */
  function renderSamples() {
    if (!D) return;
    $('samples').innerHTML = '<span class="lbl">예시로 채우기</span>' + D.samples.map(function (s) {
      return '<button type="button" data-sample="' + s.id + '" aria-pressed="' + (UI.sample === s.id) + '" title="' + esc(s.full || s.label) + '">' + esc(s.label) + '</button>';
    }).join('');
  }
  function renderFeet() {
    if (!D) return;
    var ex = UI.exp || parseExp(UI.l1), po = UI.post || parsePost(UI.l2);
    if (!UI.l1.trim()) $('l1f').innerHTML = '<span class="emptyline">단어를 넣으면 역량·행동·수치로 넓혀 봅니다.</span>';
    else {
      $('l1f').innerHTML = ex.picks.slice(0, 3).map(function (p, i) {
        if (i === 0) return '<span class="tag"><b>' + esc(p.label) + '</b></span>' +
          '<span class="tag">역량 · ' + esc((p.comp || [])[0] || '') + '</span>' +
          '<span class="tag">행동 · ' + esc((p.verb || [])[0] || '') + '</span>' +
          '<span class="tag">수치 · ' + esc((p.metric || [])[0] || '') + '</span>';
        return '<span class="tag">' + esc(p.label) + '</span>';
      }).join('') + (ex.nums.length ? '<span class="tag"><b>숫자</b> ' + ex.nums.map(esc).join(' · ') + '</span>' : '');
    }
    if (!UI.l2.trim()) $('l2f').innerHTML = '<span class="emptyline">공고를 넣으면 직무군과 요구를 먼저 잡습니다.</span>';
    else {
      var h = '';
      if (po.fam) h += '<span class="tag"><b>직무군</b> ' + esc(po.fam.name) + '</span>';
      if (po.reqs.length) h += '<span class="tag">요구 ' + po.reqs.length + '개' + (po.guessed ? ' · 흔한 요구' : '') + '</span>';
      if (!h) h += '<span class="emptyline">공고에서 직무군을 잡지 못했습니다. 직무 이름을 한 줄 넣어 보세요.</span>';
      $('l2f').innerHTML = h;
    }
    var ready = !!(UI.l1.trim() && UI.l2.trim());
    $('merge').disabled = !ready || !D;
    $('mergeHint').textContent = ready ? '두 레이어를 겹쳐 K·S·A 연결 근거를 뽑습니다.' : '두 칸을 채우면 병합할 수 있습니다.';
  }

  function renderL3() {
    var l3 = $('l3'), rows = UIRows();
    l3.classList.toggle('on', !!(UI.merged && rows.length));
    $('l3sub').textContent = UI.merged ? (rows.length ? '두 레이어를 겹친 결과 · ' + rows.length + '개 요구' : '붙일 경험을 찾지 못했습니다') : '병합하면 여기에 겹쳐집니다';
    var K = [], S = [], A = [];
    UI.rows.forEach(function (r) {
      if (!r.exp) return;
      if (K.indexOf(r.req.k) < 0) K.push(r.req.k);
      if (S.indexOf(r.verb + ' → ' + r.req.s) < 0) S.push(r.verb + ' → ' + r.req.s);
      if (A.indexOf(r.req.a) < 0) A.push(r.req.a);
    });
    $('l3ksa').innerHTML = [
      ['K 지식', 'var(--k)', K], ['S 기술', 'var(--s)', S], ['A 태도', 'var(--a)', A]
    ].map(function (c) {
      return '<div style="--c:' + c[1] + '"><b>' + c[0] + (c[2].length ? ' <i>' + c[2].length + '</i>' : '') + '</b><span>' + esc(c[2][0] || '—') + '</span></div>';
    }).join('');
  }

  function renderBoard(anim) {
    var out = $('out'), board = $('board');
    if (!UI.merged) {
      out.innerHTML = '<div class="blank"><h3>두 레이어를 겹치면 이렇게 나옵니다</h3>' +
        '<ol class="steps3">' +
        '<li><b>① 요구를 잡고</b>공고에서 요구를 최대 5개 골라 K·S·A로 나눕니다.</li>' +
        '<li><b>② 경험을 붙이고</b>경험 칸의 낱말을 역량·행동·수치로 넓혀 요구에 잇습니다.</li>' +
        '<li><b>③ 전개만 남기고</b>왜 닿는지와 이력서 한 줄·자소서 뼈대만 적습니다. 문장은 직접 씁니다.</li>' +
        '</ol>' +
        '<div class="ksa-def">' +
        '<div><b>K</b><span>지식 — 이 요구를 하려면 알아야 하는 것</span></div>' +
        '<div><b>S</b><span>기술 — 실제로 해 본 행동</span></div>' +
        '<div><b>A</b><span>태도 — 반복해서 지켜야 하는 기준</span></div>' +
        '</div>' +
        '<p class="note">위의 예시 단추를 누르면 두 칸이 한 번에 채워지고 병합까지 됩니다.</p>' +
        '<p class="note" style="margin-top:6px"><b style="color:var(--ink)">완성 문장을 대신 쓰지 않습니다.</b> 문장을 정하는 사람의 아이디어를 막지 않도록, 연결 근거와 전개 순서만 남기고 문장은 직접 쓰게 합니다.</p>' +
        '<p class="note" style="margin-top:6px"><b style="color:var(--ink)">점수·합격 예측은 하지 않습니다.</b> 대신 어느 요구에 경험이 약하게 닿는지를 표시하고, 넣어 볼 장면을 함께 적습니다. 직무군이 잡히면 그 직무군의 NCS 능력단위 원문 KSA를 결과 맨 끝에 붙입니다.</p></div>';
      $('bhT').innerHTML = '무엇이 나오는지';
      $('bhS').textContent = '경험 한 줄 × 공고 한 장 → K·S·A 연결 근거 · 이력서 한 줄 · 자소서 뼈대';
      return;
    }
    var rows = UI.rows, linked = UIRows().length, strong = rows.filter(function (r) { return r.fit === 'good'; }).length;
    $('bhT').innerHTML = '요구 ' + rows.length + '개 <span class="pill">연결 ' + linked + '</span>' + (strong ? '<span class="pill">강한 연결 ' + strong + '</span>' : '');
    $('bhS').textContent = (UI.post.fam ? UI.post.fam.name + ' · ' : '') + (UI.post.guessed ? '공고에서 요구 표현을 찾지 못해 이 직무군에서 흔한 요구로 채웠습니다.' : '공고에서 잡은 요구를 기준으로 정리했습니다.') + (mq.matches ? ' 문장은 직접 씁니다.' : ' 카드를 누르면 펼쳐집니다.');
    out.innerHTML = rows.map(function (r) { return card(r); }).join('') + ncsCard() +
      '<p class="note" style="margin:2px 2px 0;font-size:12px;color:var(--dim);line-height:1.6">K·S·A는 요구를 나눈 해석틀입니다. 숫자와 장면은 내 사실로 채우고, 완성 문장은 직접 쓰세요.</p>';
    if (anim && !still()) { board.classList.remove('go'); void board.offsetWidth; board.classList.add('go'); }
  }

  /* 이 직무군의 NCS 능력단위 — 결과판 맨 끝에서 원문 KSA를 펼쳐 본다 */
  function ncsCard() {
    var fam = UI.post && UI.post.fam;
    if (!fam || !fam.unit) return '';
    var u = fam.unit;
    return '<details class="sol ncs-card"><summary class="ncs-s"><span class="no">NCS</span><span class="ncs-t">' + esc(u.name) + '</span><span class="fit low">' + esc(fam.name) + '</span></summary>' +
      '<div class="ncs-b"><p class="ncs-l">NCS 능력단위 ' + esc(u.code) + (u.level ? ' · 수준 ' + u.level : '') + '</p>' +
      (u.elements || []).slice(0, 3).map(function (el) {
        return '<p class="el"><b>' + esc(el.f) + '</b><span>K ' + esc((el.k || [])[0] || '') + '</span><span>S ' + esc((el.s || [])[0] || '') + '</span><span>A ' + esc((el.a || [])[0] || '') + '</span></p>';
      }).join('') +
      '<p class="ncs-l">출처 한국산업인력공단 국가직무능력표준 정보(15157547, 이용허락범위 제한 없음) · 기준일 2026-09-08 · 능력단위요소마다 KSA 첫 항목만 실었습니다.</p></div></details>';
  }

  function card(r) {
    var req = r.req, open = !!UI.open[r.id], ai = UI.ai[r.id];
    var fitTxt = r.fit === 'good' ? '강한 연결' : r.fit === 'mid' ? '연결 가능' : '약한 연결';
    var h = '<article class="sol' + (open ? ' open' : '') + (r.exp ? '' : ' dim') + '">';
    h += '<button type="button" class="sol-t" data-card="' + r.id + '" aria-expanded="' + open + '"><span class="no num">' + r.no + '</span><h3>' + esc(req.label) + '</h3><span class="fit ' + r.fit + '">' + fitTxt + '</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>';
    h += '<div class="sol-b">';
    if (r.hit.phrase) h += '<p class="quote"><b>공고에서 잡은 말</b> · ' + esc(r.hit.phrase) + '</p>';
    h += '<div class="ksa">' +
      '<div style="--c:var(--k)"><b>K</b><span>' + esc(req.k) + '</span></div>' +
      '<div style="--c:var(--s)"><b>S</b><span>' + (r.exp ? esc(r.verb) + ' → ' : '') + esc(req.s) + '</span></div>' +
      '<div style="--c:var(--a)"><b>A</b><span>' + esc(req.a) + '</span></div>' +
      '</div>';
    if (r.exp) {
      h += '<p class="why"><b>왜 연결되는가</b> ' + esc(r.why) + '</p>';
      h += '<div class="flow"><h4>전개 방향 — 문장은 직접</h4><ol>' +
        r.steps.map(function (s, i) { return '<li><i>' + '①②③'[i] + '</i><span><b>' + s.k + '</b> · ' + esc(s.v) + '</span></li>'; }).join('') +
        '</ol><p class="resume"><b>이력서 한 줄 포인트</b> ' + slots(fillNums(r.resume, (UI.exp || {}).nums)) + '</p></div>';
      if (ai) h += '<p class="ai"><b>서버 AI 보조</b> ' + esc(ai) + '</p>';
    } else {
      h += '<p class="add"><b>붙일 경험이 아직 뚜렷하지 않습니다</b> ' + esc(req.label) + '에 닿는 장면을 경험 칸에 한 줄 더 넣어 보세요. 예: ' + esc(req.add) + '</p>';
      h += '<p class="why" style="color:var(--muted)"><b>공고가 보려는 것</b> ' + esc(req.ask) + '</p>';
    }
    return h + '</div></article>';
  }

  /* ───── 서버 AI 보조 — 연결 설명만 받아 온다(입력 문장은 보내지 않는다) ───── */
  function tryServer() {
    if (location.protocol !== 'https:' || !UI.merged || !UIRows().length) return;
    var body = {
      v: '1',
      job: UI.post.fam ? UI.post.fam.name : '',
      reqs: UI.rows.map(function (r) { return { id: r.id, label: r.req.label, k: r.req.k, s: r.req.s, a: r.req.a }; }),
      exps: (UI.exp.picks || []).slice(0, 3).map(function (p) { return { label: p.label, verb: (p.verb || [])[0] || '', comp: (p.comp || [])[0] || '' }; }),
      caps: UI.rows.map(function (r) { return r.req.cap; })
    };
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4500) : null;
    fetch('/api/layer-merge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.notes) return;
        var keys = Object.keys(j.notes);
        if (!keys.length) return;
        var changed = false;
        UI.rows.forEach(function (r) { if (j.notes[r.id]) { UI.ai[r.id] = String(j.notes[r.id].why || '').slice(0, 300); changed = true; } });
        if (changed) renderBoard(false);
      })
      .catch(function () { /* 키가 없거나 늦으면 내장 엔진 결과를 그대로 둔다 — 오류를 드러내지 않는다 */ })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  /* ───── 조사(을/를) 고치기 — surgery/data/validate.py 와 같은 규칙 ───── */
  function lastHangul(t) { for (var i = t.length - 1; i >= 0; i--) { var ch = t.charAt(i); if (ch >= '가' && ch <= '힣') return ch.charCodeAt(0); if (/[0-9A-Za-z)\\]}]/.test(ch)) return -1; } return -1; }
  function hasB(t) { var c = lastHangul(t); return c < 0 ? true : (c - 0xAC00) % 28 !== 0; }
  function rieul(t) { var ch = t.charAt(t.length - 1); return ch >= '가' && ch <= '힣' && (ch.charCodeAt(0) - 0xAC00) % 28 === 8; }
  function fixParticles(s) {
    s = s.replace(/(\((?:을|를|은|는|이|가|로)\))\1+/g, '$1');
    [['을(를)', '을', '를'], ['은(는)', '은', '는'], ['이(가)', '이', '가'], ['으로(로)', '으로', '로']].forEach(function (p) {
      var re = new RegExp('(\\S+?)' + p[0].replace(/[()]/g, '\\$&'), 'g');
      s = s.replace(re, function (m, w) { if (p[0] === '으로(로)') return w + ((!hasB(w) || rieul(w)) ? '로' : '으로'); return w + (hasB(w) ? p[1] : p[2]); });
    });
    return s.replace(/(\S+?)이었습니다/g, function (m, w) { return w + (hasB(w) ? '이었습니다' : '였습니다'); });
  }

  /* ───── 사건 ───── */
  var t1 = 0, t2 = 0;
  $('l1in').addEventListener('input', function () { UI.l1 = this.value; UI.sample = ''; renderSamples(); clearTimeout(t1); t1 = setTimeout(function () { UI.exp = null; renderFeet(); }, 140); });
  $('l2in').addEventListener('input', function () { UI.l2 = this.value; UI.sample = ''; renderSamples(); clearTimeout(t2); t2 = setTimeout(function () { UI.post = null; renderFeet(); }, 140); });

  d.addEventListener('click', function (e) {
    var b = e.target.closest('button, summary');
    if (!b) return;
    if (b.hasAttribute('data-sample')) {
      var s = (D.samples || []).filter(function (x) { return x.id === b.getAttribute('data-sample'); })[0];
      if (!s) return;
      UI.sample = s.id; UI.l1 = s.l1; UI.l2 = s.l2; UI.exp = null; UI.post = null;
      $('l1in').value = s.l1; $('l2in').value = s.l2;
      renderSamples(); merge();
      if (!mq.matches) { var tgt = $('board'); if (tgt && tgt.getBoundingClientRect().top > innerHeight * .6) window.scrollTo({ top: scrollY + tgt.getBoundingClientRect().top - 8, behavior: still() ? 'auto' : 'smooth' }); }
      return;
    }
    if (b.id === 'merge') { merge(); return; }
    if (b.hasAttribute('data-eye')) {
      var id = b.getAttribute('data-eye'), box = $(id + 'b');
      var folded = box.classList.toggle('fold');
      b.setAttribute('aria-pressed', String(folded));
      b.setAttribute('aria-label', (id === 'l2' ? 'L2 직무·공고' : 'L1 경험·경력') + ' 칸 ' + (folded ? '펼치기' : '접기'));
      return;
    }
    if (b.hasAttribute('data-card')) {
      var key = b.getAttribute('data-card'), art = b.closest('.sol');
      if (mq.matches) return;                       /* 큰 화면은 늘 펼쳐 둔다 */
      UI.open[key] = !UI.open[key];
      art.classList.toggle('open', !!UI.open[key]);
      b.setAttribute('aria-expanded', String(!!UI.open[key]));
      return;
    }
  });

  d.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); merge(); return; }
    if (e.key === 'Escape') { var f = d.activeElement; if (f && f.tagName === 'TEXTAREA') f.blur(); }
  });

  $('pvT').addEventListener('click', function () { var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기'; });
  $('rst').addEventListener('click', function () {
    UI = { l1: '', l2: '', merged: false, sample: '', exp: null, post: null, rows: [], ai: {}, open: {} };
    $('l1in').value = ''; $('l2in').value = '';
    renderSamples(); renderFeet(); renderL3(); renderBoard(false); window.scrollTo(0, 0);
  });
  if (mq.addEventListener) mq.addEventListener('change', function () { renderBoard(false); });

  renderFeet(); renderL3(); renderBoard(false);
})();
