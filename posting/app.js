/* 공고문 법령 점검대 — app.js
 * 1) signals.json(규칙) + articles.json(조문 원문) + samples.json + meta.json + model.json(보조 분류기)
 * 2) 문장을 나누고, 유형별 패턴으로 신호를 잡는다. 규칙이 잡은 문장만 모델에 넣어 유형을 확인한다.
 * 3) 최저임금은 2026년 고용노동부 고시(시급 10,320원)를 화면이 직접 들고 자동 비교한다.
 * 4) 붙여넣은 글은 어디에도 저장하지 않는다(브라우저 메모리에서만 계산).
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DATA = {}, TYPES = [], ART = {}, MODEL = null, MODEL_STATE = 0;

  /* ---------- 최저임금 기준값 (2026년 고용노동부 고시) ----------
   * 고시 제2025-47호: 2026.1.1~12.31 적용, 시급 10,320원 / 일급 82,560원(1일 8시간)
   * 월 환산 2,156,880원(주 40시간·유급주휴 8시간 포함 209시간). 해가 바뀌면 이 값과 meta.json만 고친다.
   */
  var MIN_WAGE = {
    year: 2026, hourly: 10320, daily: 82560, monthly: 2156880,
    notice: '고용노동부고시 제2025-47호', title: '2026년 적용 최저임금 고시',
    period: '2026. 1. 1. ~ 2026. 12. 31.', source: '고용노동부'
  };

  function fetchJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------- 탭 ---------- */
  var tabs = $$('.tab');
  function showTab(name, focus) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var p = document.getElementById('p-' + t.getAttribute('data-tab'));
      if (p) p.hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); showTab(tabs[n].getAttribute('data-tab'), true); }
    });
  });

  /* ---------- 문장 나누기 ---------- */
  function splitSentences(text) {
    var out = [], lines = text.split(/\n+/);
    lines.forEach(function (line) {
      var t = line.replace(/^[\s•·\-*–—>]+/, '').trim();
      if (!t) return;
      var parts = t.split(/(?<=[.!?。])\s+/);
      parts.forEach(function (p) {
        var s = p.trim();
        if (s.length >= 2) out.push(s);
      });
    });
    return out;
  }

  /* ---------- 규칙 ---------- */
  function compile(types) {
    types.forEach(function (t) {
      t._inc = (t.patterns || []).map(function (p) { return new RegExp(p); });
      t._veto = (t.veto || []).map(function (p) { return new RegExp(p); });
    });
  }
  function matchType(t, sentence) {
    var vetoed = t._veto.some(function (r) { return r.test(sentence); });
    if (vetoed) return false;
    return t._inc.some(function (r) { return r.test(sentence); });
  }

  /* ---------- 최저임금 (내장한 2026년 고시 시급과 맞대기) ---------- */
  function mwBasis() { return MIN_WAGE.year + '년 고시 시급 ' + num(MIN_WAGE.hourly) + '원'; }

  function wagesIn(sentence) {
    var res = [], m;
    var re = /(시급|일급|월급|연봉)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(만)?\s*원/g;
    while ((m = re.exec(sentence))) {
      var v = parseFloat(m[2].replace(/,/g, ''), 10);
      if (!isFinite(v) || v <= 0) continue;
      if (m[3]) v = Math.round(v * 10000);
      v = Math.round(v);
      if (m[1] === '시급') res.push({ kind: '시급', value: v, hourly: v, basis: '' });
      else if (m[1] === '일급') res.push({ kind: '일급', value: v, hourly: Math.round(v / 8), basis: '1일 8시간' });
      else if (m[1] === '월급') res.push({ kind: '월급', value: v, hourly: Math.round(v / 209), basis: '월 209시간' });
      else if (m[1] === '연봉') res.push({ kind: '연봉', value: v, hourly: Math.round(v / 12 / 209), basis: '연 12개월 × 월 209시간' });
    }
    return res;
  }

  function wageNote(w) {
    var head = w.kind + ' ' + num(w.value) + '원';
    if (w.kind !== '시급') head += ' → 시급 환산 ' + num(w.hourly) + '원(' + w.basis + ')';
    return head + ', ' + mwBasis() + '보다 ' + num(MIN_WAGE.hourly - w.hourly) + '원 낮음';
  }

  /* ---------- 학습 분류기 (보조) ---------- */
  function loadModel() {
    if (MODEL_STATE === 2) return Promise.resolve(MODEL);
    if (MODEL_STATE === 1) return MODEL._p;
    MODEL_STATE = 1;
    MODEL = { _p: fetchJSON('data/model.json').then(function (m) { MODEL = m; MODEL_STATE = 2; return m; })
      .catch(function () { MODEL_STATE = 0; MODEL = null; return null; }) };
    return MODEL._p;
  }
  function tokenize(text) {
    var t = String(text).toLowerCase().replace(/[^0-9a-z가-힣%]+/g, ' ');
    var out = t.split(' ').filter(Boolean).map(function (w) { return 'w:' + w; });
    var c = t.replace(/\s+/g, '');
    for (var n = 2; n <= 3; n++) for (var i = 0; i <= c.length - n; i++) out.push('c' + n + ':' + c.substr(i, n));
    (c.match(/\d+/g) || []).forEach(function (d) { out.push('n:' + d); });
    return out;
  }
  function classify(m, text) {
    if (!m) return [];
    var f = Object.create(null), n = 0;
    tokenize(text).forEach(function (x) { f[x] = (f[x] || 0) + 1; n++; });
    var scores = m.classes.map(function (label) {
      var d = (m.features && m.features[label]) || {}, un = m.unseen[label] || -9;
      var s = (m.priors[label] || 0) + n * un;
      for (var k in f) if (d[k] != null) s += f[k] * (d[k] - un);
      return { label: label, s: s };
    });
    var T = m.temperature || 1, mx = Math.max.apply(null, scores.map(function (x) { return x.s; }));
    var sum = 0;
    scores.forEach(function (x) { x.p = Math.exp((x.s - mx) / T); sum += x.p; });
    scores.forEach(function (x) { x.p = x.p / sum; });
    scores.sort(function (a, b) { return b.p - a.p; });
    return scores.slice(0, 3);
  }
  var NAMES = {
    'mw-below': '최저임금', probation: '수습 감액', rest: '주휴·휴일', overtime: '가산수당',
    contract: '서면 계약', insurance: '4대보험', severance: '퇴직금', bias: '차별·개인정보',
    fee: '채용 비용', term: '기간제', hours: '근로시간', dispatch: '파견·도급'
  };

  /* ---------- 점검 ---------- */
  function runCheck() {
    var ta = $('#posting'), text = (ta.value || '').trim();
    var sentences = splitSentences(text);
    var hits = {};                 // typeId -> [{sentence, extra}]
    var scanned = 0;

    sentences.forEach(function (s) {
      var matched = [];
      TYPES.forEach(function (t) {
        if (matchType(t, s)) matched.push(t.id);
      });
      var short = wagesIn(s).filter(function (w) { return w.hourly < MIN_WAGE.hourly; });
      if (short.length && matched.indexOf('mw-below') < 0) matched.push('mw-below');
      if (matched.length) {
        scanned++;
        matched.forEach(function (id) {
          var box = (hits[id] = hits[id] || []);
          var row = null;
          for (var i = 0; i < box.length; i++) if (box[i].sentence === s) row = box[i];
          if (!row) { row = { sentence: s, extra: '' }; box.push(row); }
          if (id === 'mw-below' && short.length && !row.extra) row.extra = short.map(wageNote).join(' · ');
        });
      }
    });

    render(text, sentences.length, hits, scanned);
    return Promise.resolve();
  }

  function levelOf(score, danger, warn) {
    if (danger && danger > 0) return 'bad';
    if (warn && warn > 0) return 'warn';
    if (score >= 45) return 'bad';
    if (score >= 20) return 'warn';
    return 'ok';
  }

  function render(text, total, hits, scanned) {
    var empty = $('#empty'), verdict = $('#verdict'), cards = $('#cards');
    if (!total) {
      empty.hidden = false; verdict.hidden = true; cards.innerHTML = '';
      $('.em-t', empty).textContent = '공고문을 먼저 넣어 주세요';
      $('.em-s', empty).textContent = '모집요강·근무조건·처우 부분을 붙여넣으면 문장마다 점검합니다. 최저임금은 ' + mwBasis() + '과 자동으로 맞대어 보고, 왼쪽 예시 공고로 시작해도 됩니다.';
      $('#srLive').textContent = '공고문이 비어 있습니다.';
      return;
    }
    empty.hidden = true;

    var order = TYPES.filter(function (t) { return hits[t.id]; }).sort(function (a, b) {
      var la = a.level === '위험' ? 0 : 1, lb = b.level === '위험' ? 0 : 1;
      if (la !== lb) return la - lb;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return hits[b.id].length - hits[a.id].length;
    }).map(function (t) { return t.id; });
    var score = 0, danger = 0, warn = 0;
    order.forEach(function (id) {
      var t = TYPES.filter(function (x) { return x.id === id; })[0];
      var c = Math.min(hits[id].length, 2);
      score += t.weight * c;
      if (t.level === '위험') danger++; else warn++;
    });
    score = Math.min(100, score);
    var lvl = levelOf(score, danger, warn);

    var titles = { bad: '고칠 것이 있는 공고입니다', warn: '확인해 볼 지점이 있습니다', ok: '법령 위반 소지 신호가 잡히지 않았습니다' };
    var subs = {
      bad: '위험 신호 ' + danger + '가지' + (warn ? ' · 확인 신호 ' + warn + '가지' : '') + ' · 문장 ' + total + '개 중 ' + scanned + '개에서 걸렸습니다',
      warn: '바로 위법이라 단정할 수는 없지만, 조건을 확인해야 하는 신호 ' + warn + '가지가 잡혔습니다',
      ok: '문장 ' + total + '개를 훑었지만, 이 화면이 아는 유형의 신호는 나오지 않았습니다'
    };
    var stamps = { bad: '확인 필요', warn: '조건 확인', ok: '신호 없음' };

    verdict.hidden = false;
    $('#vTitle').textContent = titles[lvl];
    $('#vSub').textContent = subs[lvl] + ' · ' + mwBasis() + ' 기준';
    var st = $('#vStamp'); st.className = 'stamp ' + lvl; st.textContent = stamps[lvl];
    var bar = $('#vBar'); bar.className = 'ruler-bar ' + lvl;
    $('#vFill').style.setProperty('--v', (score / 100).toFixed(3));
    var lamps = ['#lamp1', '#lamp2', '#lamp3'];
    lamps.forEach(function (id, i) {
      var el = $(id); el.className = '';
      if (lvl === 'bad' && i === 0) el.className = 'on-bad';
      if (lvl === 'warn' && i === 1) el.className = 'on-warn';
      if (lvl === 'ok' && i === 2) el.className = 'on-ok';
    });
    var foot = $('#vFoot'); foot.innerHTML = '';
    foot.appendChild(pill('위험도 ' + score + '/100', lvl));
    foot.appendChild(pill('문장 ' + total + '개 점검', ''));
    if (danger) foot.appendChild(pill('위험 신호 ' + danger, 'bad'));
    if (warn) foot.appendChild(pill('확인 신호 ' + warn, 'warn'));

    cards.innerHTML = '';
    if (!order.length) {
      var d = document.createElement('div');
      d.className = 'verdict';
      d.style.marginTop = '11px';
      d.innerHTML = '<div class="empty" style="padding:6px 2px"><div class="em-t">법에 어긋나는 표현이 보이지 않습니다</div>' +
        '<div class="em-s">다만 이 화면은 12가지 유형만 봅니다. 급여 계산·근무표·계약서 원본처럼 숫자가 걸린 부분은 ②근거 조문과 다른 섹터에서 따로 확인하세요.</div></div>';
      cards.appendChild(d);
    }
    order.forEach(function (id, i) { cards.appendChild(makeCard(id, hits[id], i)); });

    $('#srLive').textContent = titles[lvl] + '. 위험도 ' + score + '점, 신호 ' + order.length + '가지.';
    loadModel().then(function (m) {
      if (!m) return;
      $$('.card').forEach(function (card) {
        var id = card.getAttribute('data-type'), slot = $('.model-top', card);
        if (!id || !slot) return;
        var rows = hits[id] || [];
        if (!rows.length) return;
        var res = classify(m, rows[0].sentence);
        if (!res.length) return;
        slot.innerHTML = '모델 참고 순위 · ' + res.map(function (r) {
          return '<b>' + esc(NAMES[r.label] || r.label) + '</b> ' + Math.round(r.p * 100) + '%';
        }).join(' · ');
      });
    });
  }

  function pill(text, cls) {
    var s = document.createElement('span');
    s.className = 'tag' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function makeCard(id, rows, i) {
    var t = TYPES.filter(function (x) { return x.id === id; })[0];
    var d = document.createElement('details');
    d.className = 'card';
    d.setAttribute('data-type', id);
    var cls = t.level === '위험' ? 'bad' : 'warn';
    var first = rows[0];
    var html = '';
    html += '<summary><span class="cx ' + cls + '">' + (cls === 'bad' ? '!' : '?') + '</span>' +
      '<span class="cs"><b>' + esc(t.label) + '</b><q>' + esc(first.sentence) + '</q></span>' +
      '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>';
    html += '<div class="cbody">';
    if (rows.length > 1 || first.extra) {
      html += '<h4>걸린 문장</h4><ul>';
      rows.slice(0, 3).forEach(function (r) {
        html += '<li>' + esc(r.sentence) + (r.extra ? ' — <b>' + esc(r.extra) + '</b>' : '') + '</li>';
      });
      html += '</ul>';
    }
    if (t.why) html += '<h4>왜 신호인가</h4><p>' + esc(t.why) + '</p>';
    html += '<h4>근거 조문</h4><div class="lawchips">';
    (t.articles || []).forEach(function (aid) {
      var a = ART[aid];
      if (!a) return;
      html += '<button class="lawchip" type="button" data-art="' + esc(aid) + '">' + esc(a.law) + ' ' + esc(a.no) + '</button>';
    });
    html += '</div>';
    if (t.ask && t.ask.length) {
      html += '<h4>상담에서 물어볼 것</h4><ul>' + t.ask.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>';
    }
    if (t.tell) html += '<div class="say"><b>내담자에게</b><p>' + esc(t.tell) + '</p></div>';
    if (t.todo) html += '<h4>이어서 할 일</h4><p>' + esc(t.todo) + '</p>';
    html += '<p class="hint model-top" style="margin-top:9px">모델 참고 순위 · 계산 중…</p>';
    html += '</div>';
    d.innerHTML = html;
    $$('.lawchip', d).forEach(function (b) {
      b.addEventListener('click', function () { openArticle(b.getAttribute('data-art')); });
    });
    return d;
  }

  function openArticle(aid) {
    showTab('law');
    var det = $('.lblock details[data-art="' + aid + '"]');
    if (!det) return;
    det.open = true;
    det.scrollIntoView({ block: 'center' });
  }

  /* ---------- 근거 조문 그리기 ---------- */
  function renderLaws() {
    var grid = $('#lawGrid'), groups = {}, order = [];
    Object.keys(ART).forEach(function (id) {
      var a = ART[id], key = a.law + '|' + a.effective;
      if (!groups[key]) { groups[key] = { law: a.law, effective: a.effective, items: [] }; order.push(key); }
      groups[key].items.push({ id: id, a: a });
    });
    function cmp(x, y) {
      var nx = parseInt((x.match(/#제(\d+)/) || [0, 0])[1], 10), ny = parseInt((y.match(/#제(\d+)/) || [0, 0])[1], 10);
      return nx - ny;
    }
    grid.innerHTML = order.map(function (k) {
      var g = groups[k];
      g.items.sort(function (p, q) { return cmp(p.a.no, q.a.no); });
      var eff = g.effective ? g.effective.slice(0, 4) + '.' + g.effective.slice(4, 6) + '.' + g.effective.slice(6, 8) : '';
      return '<div class="lblock"><h3>' + esc(g.law) + '</h3><div class="eff">시행 ' + esc(eff) + ' 기준 · 조문 ' + g.items.length + '개</div>' +
        g.items.map(function (it) {
          return '<details data-art="' + esc(it.id) + '"><summary><span class="no">' + esc(it.a.no) + '</span><span class="ttl">' + esc(it.a.title) + '</span></summary>' +
            '<div class="art">' + esc(it.a.text) + '<a href="' + esc(it.a.url) + '" target="_blank" rel="noopener">국가법령정보센터 원문</a></div></details>';
        }).join('') + '</div>';
    }).join('');
  }

  /* ---------- 모델·근거 패널 ---------- */
  function renderSources() {
    var m = DATA.meta || {};
    if (m.collected_at) $('#srcDate').textContent = m.collected_at;
    if (m.laws) $('#srcLaws').textContent = '법령 ' + m.laws + '편';
    if (m.chunks) $('#srcChunks').textContent = num(m.chunks);
    var kv = $('#kvSource');
    if (kv) kv.innerHTML = [
      ['원천', m.source || '국가법령정보센터(law.go.kr)'],
      ['법령', (m.laws || '—') + '편 (법률·시행령)'],
      ['조문', num(m.chunks || 0) + '개'],
      ['기준일', m.collected_at || '—'],
      ['원문 대조', (m.verified || 0) + ' / ' + (m.chunks || 0) + ' 통과'],
      ['최저임금', mwBasis() + ' (' + MIN_WAGE.notice + ')'],
      ['라이선스', '저작권법 제7조']
    ].map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    var mw = $('#kvMinWage');
    if (mw) mw.innerHTML = [
      ['시급', num(MIN_WAGE.hourly) + '원'],
      ['일급', num(MIN_WAGE.daily) + '원 (1일 8시간)'],
      ['월 환산', num(MIN_WAGE.monthly) + '원 (주 40시간·유급주휴 8시간 포함 209시간)'],
      ['적용 기간', MIN_WAGE.period],
      ['고시', MIN_WAGE.title + ' · ' + MIN_WAGE.notice]
    ].map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
  }

  function renderModelPanel() {
    loadModel().then(function (m) {
      if (!m) { $('#kvModel').innerHTML = '<dt>상태</dt><dd>모델을 불러오지 못했습니다</dd>'; return; }
      var met = m.metrics || {};
      $('#kvModel').innerHTML = [
        ['방식', m.method || '—'],
        ['학습 예시', (m.train_examples || 0) + '개 (직접 작성)'],
        ['5겹 정확도', Math.round((met.cv5_accuracy || 0) * 1000) / 10 + '%'],
        ['macro F1', Math.round((met.cv5_macro_f1 || 0) * 1000) / 10 + '%']
      ].map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      $('#modelNote').textContent = '학습 예시는 상담 현장에서 흔한 공고 표현을 직접 써서 라벨링했습니다(실제 공고 복제 없음). 정상 문구를 넣으면 위반 유형으로 치우치는 경향이 있어, 이 모델은 유형 확인 보조로만 씁니다.';
      var per = (met.per_class || []).slice().sort(function (a, b) { return (b.f1 || 0) - (a.f1 || 0); });
      $('#modelBars').innerHTML = per.map(function (p) {
        var w = Math.max(0.02, p.f1 || 0);
        return '<div class="bar-row"><span class="bn">' + esc(NAMES[p.label] || p.label) + '</span>' +
          '<span class="bb"><i style="--w:' + w.toFixed(3) + '"></i></span><span class="bv">' + Math.round((p.f1 || 0) * 100) + '%</span></div>';
      }).join('');
    });
  }

  /* ---------- 예시 칩 ---------- */
  function renderSamples() {
    var box = $('#samples'), list = (DATA.samples && DATA.samples.samples) || [];
    box.innerHTML = list.map(function (s, i) {
      return '<button class="chip" type="button" data-i="' + i + '" aria-pressed="false">' + esc(s.title) + '</button>';
    }).join('');
    $$('.chip', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        $('#posting').value = list[i].text;
        $$('.chip', box).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        $('#srLive').textContent = list[i].title + ' 예시를 넣었습니다.';
        runCheck();
      });
    });
  }

  /* ---------- 시작 ---------- */
  function boot() {
    Promise.all([
      fetchJSON('data/signals.json').catch(function () { return null; }),
      fetchJSON('data/articles.json').catch(function () { return null; }),
      fetchJSON('data/samples.json').catch(function () { return null; }),
      fetchJSON('data/meta.json').catch(function () { return null; })
    ]).then(function (res) {
      DATA.signals = res[0]; DATA.meta = res[3];
      if (DATA.meta && DATA.meta.minimum_wage) {
        for (var k in DATA.meta.minimum_wage) if (DATA.meta.minimum_wage[k] != null) MIN_WAGE[k] = DATA.meta.minimum_wage[k];
      }
      ART = res[1] || {};
      TYPES = (res[0] && res[0].types) || [];
      compile(TYPES);
      DATA.samples = res[2];
      renderSamples();
      renderLaws();
      renderSources();
      renderModelPanel();
      var btn = $('#runBtn');
      btn.disabled = false;
      btn.addEventListener('click', function () {
        runCheck();
        if (window.innerWidth < 900) $('#result').scrollIntoView({ block: 'start' });
      });
      $('#posting').addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runCheck(); }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
