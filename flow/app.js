/* app.js — 27번 상담 플로우 아키텍트 (2026-11-20)
 *
 * 하는 일
 *   1) 키워드(또는 직접 적은 말)로 첫 자료를 고르고, 그 자료가 **무엇이며 무엇을 설명하는지** 먼저 보여 준다.
 *   2) 고른 자료마다 다음 가지(후보)를 자료실의 실제 연결로 뻗는다. 후보마다
 *      「앞 자료와의 근거(자료실 연결 짝·겹치는 말)」와 「지금 흐름 + 이 자료가 함께 덮는 것」을 적는다.
 *      추천 가지 밖의 자료도 매 단계 검색창(이름·분류·키워드·설명)에서 직접 찾아 이을 수 있고,
 *      근거가 없는 조합은 「직접 엮은 흐름 — 시드/매치 자유 조합」으로 따로 표시한다.
 *   3) 2·3·4개 어디서든 「이대로 만들어볼래요」로 덱을 완성한다(리허설·실행 미리보기 포함).
 *   4) 6개를 넘기려 하면 부드럽게 제지하고, 그래도 원하면 한 개씩 더 받되 8개에서 멈춘다.
 *   5) 완성한 덱은 마이덱(로그인 = 내 계정 / 로그아웃 = 이 브라우저)에 저장하고, 시드·매치 덱으로 넘길 수 있다.
 *
 * 시너지의 근거는 전부 ./data/graph.json 이다(ops/scripts/build_flow_graph.py 가 자료실 장부·지도·용어에서 만든다).
 * 이 파일은 문장을 지어내지 않고, graph.json의 칸(제목·딱지·설명·meta·겹치는 말·연결 짝)만 늘어놓는다.
 */
(function () {
  'use strict';
  if (window.__jcFlow) return;
  window.__jcFlow = true;

  var $ = function (id) { return document.getElementById(id); };
  var MAX = 6, HARD = 8;
  var G = null, SEC = {}, PAIR = {}, CHAIN = [], KW = '', OVERRIDE = false, PENDING = null;
  var DECK_NAME = '', SHEET = '', REH = 0, SHOWALL = false;
  var SIDX = {}, PQ = '', PRAF = 0;   /* PQ — 단계마다 다른 자료를 직접 찾는 검색어 */
  /* EXT — 메인 화면 검색과 같은 자료실 색인(문서 4,501 + 기업 9,137 + 약어 사전)을 flow 안에서 따로 받아 둔다.
     「세스코」나 「계명대」처럼 지도(graph.json)에는 없는 이름을 쳐도 그 이름이 실린 자료를 찾아내기 위해서다.
     처음 검색창을 건드릴 때 한 번만 받고(2MB 안팎), 그 뒤로는 메모리에 둔다. */
  var EXT = { ready: false, loading: null, err: '', failAt: 0, rows: [], dict: [] };
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function norm(w) {
    return String(w || '').trim().toLowerCase().replace(/[·ㆍ・]/g, '').replace(/\s+/g, '');
  }
  /* 받침에 맞춰 조사를 고른다(「이론 163개」+ 를 / 「상황 카드 25장」+ 을) */
  function josa(word, withJong, noJong) {
    var s = String(word || '').replace(/\s+$/, '');
    var c = s.charCodeAt(s.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return noJong;
    return ((c - 0xac00) % 28) ? withJong : noJong;
  }
  /* 초성만 친 말(ㅅㅅㅋ·ㄱㅁㄷ)을 알아보기 위한 두 가지 — 자모만인지, 한글을 초성으로 바꾸면 무엇인지 */
  function isJamo(s) { return /^[ㄱ-ㅎ]+$/.test(String(s || '')); }
  function choseong(s) {
    var out = '', i;
    for (i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += (c >= 0xac00 && c <= 0xd7a3) ? CHO[Math.floor((c - 0xac00) / 588)] : s.charAt(i);
    }
    return out;
  }
  /* 색인 이름 비교용 — 괄호·마침표 같은 기호를 모두 떼고 글자만 남긴다((주)세스코 → 세스코) */
  function flat(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, ''); }
  /* 화면에 보이는 이름 — 법인격 표기((주)·주식회사)는 읽기에 방해만 되므로 뗀다 */
  function cleanLabel(s) {
    var t = String(s == null ? '' : s).replace(/^㈜\s*/, '').replace(/^\(주\)\s*/, '')
      .replace(/\s*㈜$/, '').replace(/\s*주식회사\s*$/, '').replace(/\s*\(주\)\s*$/, '').trim();
    return t || String(s == null ? '' : s).trim();
  }
  /* 「국민취업지원제도」로 / 「경력단절여성」으로 */
  function josaRo(word) {
    var s = String(word || ''), c = s.charCodeAt(s.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return '';
    var jong = (c - 0xac00) % 28;
    return (jong && jong !== 8) ? '으로' : '로';
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('on'); }, 3400);
  }

  /* ---------- 지도 읽기 ---------- */
  function index() {
    G.sectors.forEach(function (s) { SEC[s.id] = s; });
    G.pairs.forEach(function (p) {
      var k = [p.a, p.b].sort().join('|');
      PAIR[k] = p;
    });
    /* 검색용 색인 — graph.json의 이름·분류(딱지)·키워드(영문 포함)·설명만 쓴다.
       키워드는 자료별 목록에 더해, 시작 키워드 사전(G.kw — 경단녀·국취 같은 현장 말)도 함께 담는다. */
    G.sectors.forEach(function (s) {
      if (s.id === G.self) return;
      SIDX[s.id] = {
        name: norm(s.title + ' ' + (s.short || '')),
        badge: norm(s.badge || ''),
        kw: (s.kw || []).map(norm),
        body: norm((s.desc || '') + ' ' + (s.meta || []).join(' ') + ' ' + (s.gi || ''))
      };
    });
    Object.keys(G.kw || {}).forEach(function (word) {
      var w = norm(word);
      if (!w) return;
      (G.kw[word] || []).forEach(function (id) {
        if (SIDX[id] && SIDX[id].kw.indexOf(w) < 0) SIDX[id].kw.push(w);
      });
    });
  }
  function pairOf(a, b) { return PAIR[[a, b].sort().join('|')] || null; }
  function neigh(id) {
    var out = [];
    G.pairs.forEach(function (p) {
      if (p.a === id) out.push({ id: p.b, p: p });
      else if (p.b === id) out.push({ id: p.a, p: p });
    });
    return out;
  }
  function noOf(id) { return parseInt((SEC[id] || {}).no, 10) || 999; }
  function metaOf(id, n) { return (SEC[id] || {}).meta || []; }
  function firstMeta(id) { return metaOf(id)[0] || ''; }

  /* ---------- 자료실 색인 (메인 화면 검색과 같은 범위) ----------
     메인 화면은 assistant/data/index.json(문서)·index-companies.json(기업 9,137곳)·
     rag-preface.json(약어·현장 말)을 함께 본다. 플로우는 지도(graph.json)만 봐서
     「세스코」(기업 명함첩)·「계명대」(대학학과위키)처럼 지도에 이름이 없는 말을 못 찾았다.
     같은 세 파일을 flow 안에서 독립적으로(상대 경로 ../assistant/data/) 받아 이름 색인을 만든다. */
  function loadExt() {
    if (EXT.ready) return Promise.resolve(EXT);
    if (EXT.loading) return EXT.loading;
    if (EXT.failAt && Date.now() - EXT.failAt < 8000) return Promise.resolve(EXT);   /* 방금 실패했으면 잠깐 쉰다 */
    var urls = ['../assistant/data/rag-preface.json', '../assistant/data/index.json', '../assistant/data/index-companies.json'];
    EXT.loading = Promise.all(urls.map(function (u) {
      return fetch(u, { cache: 'default' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    })).then(function (res) {
      /* 세 파일을 하나도 못 받았으면(오프라인·404) 색인 없이 지도만으로 찾는다 — 8초 뒤 다시 시도한다. */
      if (!res[0] && !res[1] && !res[2]) {
        EXT.err = 'load';
        EXT.failAt = Date.now();
        EXT.loading = null;
        if ($('pq') && norm(PQ)) { try { renderCands(); } catch (e) {} }
        return EXT;
      }
      try {
        buildExt(res[0], res[1], res[2]);
        EXT.ready = true;
      } catch (e) {
        EXT.err = String((e && e.message) || e);
        EXT.failAt = Date.now();
      }
      EXT.loading = null;
      if ($('pq') && norm(PQ)) { try { renderCands(); } catch (e) {} }   /* 단계 검색창이 열려 있었다면 다시 그린다 */
      return EXT;
    }, function () {
      EXT.err = 'load';
      EXT.failAt = Date.now();
      EXT.loading = null;
      return EXT;
    });
    return EXT.loading;
  }

  function buildExt(pref, ix, comp) {
    var rows = [], seen = {}, i;
    function push(sec, title, keys, alts) {
      if (!sec || sec === G.self || !SEC[sec]) return;
      var t = cleanLabel(title);
      if (t.length < 2) return;
      var n = flat(t);
      if (!n || seen[sec + '|' + n]) return;
      seen[sec + '|' + n] = 1;
      var row = { s: sec, t: t.slice(0, 60), n: n, c: choseong(n) };
      if (keys) { var k = flat(keys); if (k) row.k = k.slice(0, 160); }
      if (alts) {
        var a = [];
        alts.forEach(function (x) { var v = flat(cleanLabel(x)); if (v && v !== n && a.indexOf(v) < 0) a.push(v); });
        if (a.length) { row.a = a; row.ca = a.map(choseong); }
      }
      rows.push(row);
    }
    /* ① 자료 색인의 문서 — 대학(계명대학교)·자격·용어 등 이름이 한 줄씩 들어 있다 */
    ((ix && ix.docs) || []).forEach(function (d) {
      if (!d || !d.s) return;
      push(d.s, d.t, d.k ? String(d.k).slice(0, 220) : '');
    });
    /* ② 기업 명함첩 — 지연 로드 파일의 한 줄 형식: id|이름|업종|분류|직원수|별칭|키워드 */
    String((comp && comp.rows) || '').split('\n').forEach(function (line) {
      var p = line.split('|');
      if (p.length < 5 || !p[1]) return;
      push('company', p[1], p[2] || '', (p[5] || '').split(';'));
    });
    /* ③ 약어·현장 말 사전 — 「국취」를 국민취업지원제도로 읽고, 그 말이 실린 자료를 가리킨다 */
    var dict = [];
    ((pref && pref.dict) || []).forEach(function (e) {
      if (!e || !e.c) return;
      var secs = (e.s || []).filter(function (id) { return SEC[id] && id !== G.self; });
      if (!secs.length) return;
      var forms = [e.c].concat(e.a || []).map(flat).filter(Boolean);
      if (!forms.length) return;
      dict.push({ c: String(e.c), n: flat(e.c), forms: forms, s: secs });
    });
    EXT.rows = rows;
    EXT.dict = dict;
  }

  /* 색인에서 한 말이 걸린 자료를 섹터 단위로 모은다 — 섹터마다 가장 잘 맞은 이름 하나와 몇 곳이 걸렸는지만 남긴다. */
  function extHits(q) {
    var order = [], bySec = {};
    if (!EXT.ready) return order;
    var n = flat(q), text = String(q || '').replace(/\s+/g, ' ').trim();
    if (!n) return order;
    var jamo = isJamo(n);
    function add(sec, sc, label, kind) {
      var h = bySec[sec];
      if (!h) { h = bySec[sec] = { id: sec, sc: 0, kind: kind, labels: [] }; order.push(h); }
      if (h.labels.indexOf(label) < 0 && h.labels.length < 40) h.labels.push(label);
      if (sc > h.sc) { h.sc = sc; h.best = label; h.kind = kind || h.kind; }
    }
    var rows = EXT.rows, i;               /* 문서(대학·용어…) → 기업 명함첩 순서 */
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], sc = 0;
      if (jamo) {
        /* 초성은 «앞머리»를 본다. 짧게 끝나는 이름일수록 그 초성에 더 가깝다(ㅅㅅㅋ → 세스코 > 삼성카드). */
        if (r.c === n) sc = 100;
        else if (r.c.indexOf(n) === 0) sc = 88 - Math.min(10, r.c.length - n.length);
        else if (r.ca && r.ca.some(function (c) { return c.indexOf(n) === 0; })) sc = 76;
      } else if (r.n === n) sc = 100;
      else if (r.a && r.a.indexOf(n) >= 0) sc = 92;
      else if (n.length >= 2 && r.n.indexOf(n) === 0) sc = 84;
      else if (r.a && n.length >= 2 && r.a.some(function (a) { return a.indexOf(n) === 0; })) sc = 74;
      else if (n.length >= 2 && r.n.indexOf(n) >= 0) sc = 64;
      else if (n.length >= 2 && r.k && r.k.indexOf(n) >= 0) sc = 30;
      if (!sc) continue;
      add(r.s, sc, r.t, r.s === 'company' ? 'company' : 'doc');
    }
    /* 약어 — 사용자가 별칭(국취·경단녀)·줄임말을 쳤을 때만 정식 용어로 펼친다 */
    if (!jamo && n.length >= 2) {
      for (var d = 0; d < EXT.dict.length; d++) {
        var e = EXT.dict[d], hit = 0;
        if (e.n === n) continue;
        for (var f = 0; f < e.forms.length; f++) {
          var w = e.forms[f];
          if (!w || w === e.n) continue;
          if (w === n) { hit = 2; break; }
          if (w.indexOf(n) === 0) hit = Math.max(hit, 1);
        }
        if (!hit) continue;
        for (var j = 0; j < e.s.length; j++) add(e.s[j], (hit === 2 ? 90 : 78) - j * 2, e.c, 'dict');
      }
    }
    /* 근거 문장 만들기 — 이름 하나면 「이름」 수록, 여럿이면 「대표 이름」 외 N곳 수록 */
    var out = [];
    order.forEach(function (h) {
      var s = SEC[h.id] || {};
      var title = (s.title || h.id) + (s.no ? ' ' + s.no + '번' : '');
      var label = cleanLabel(h.best || '');
      var extra = h.labels.length - 1;
      if (!label) return;
      if (h.kind === 'dict') {
        out.push({ id: h.id, sc: h.sc, kind: 'dict', label: label,
          tag: '약어 「' + text + '」 → ' + label,
          note: '약어 사전에서 「' + text + '」를 ' + label + josaRo(label) + ' 읽었습니다.' });
        return;
      }
      out.push({ id: h.id, sc: h.sc, kind: h.kind, label: label,
        tag: extra > 0 ? '「' + label + '」 외 ' + extra + '곳 수록' : '「' + label + '」 수록',
        note: extra > 0
          ? '「' + label + '」 외 ' + extra + '곳이 ' + title + ' 자료에 수록돼 있습니다.'
          : '「' + label + '」' + josa(label, '이', '가') + ' ' + title + ' 자료에 수록돼 있습니다.' });
    });
    out.sort(function (a, b) { return (b.sc - a.sc) || (noOf(a.id) - noOf(b.id)); });
    return out;
  }

  /* ---------- 시작 ---------- */
  function renderKws(expanded) {
    var host = $('kws');
    clear(host);
    var primary = ['경력단절여성', '국민취업지원제도', '구직급여', '직무분석', '법령', '면접', '자격증', '신산업'];
    var list = G.starts.slice();
    list.sort(function (a, b) {
      var ia = primary.indexOf(a.k), ib = primary.indexOf(b.k);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    var show = expanded ? list : list.slice(0, 8);
    show.forEach(function (s) {
      var b = el('button', 'kw', s.k);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(norm(KW) === norm(s.k)));
      b.addEventListener('click', function () { pickKeyword(s.k, s.to); });
      host.appendChild(b);
    });
    if (!expanded && list.length > show.length) {
      var more = el('button', 'kw-more', '키워드 ' + (list.length - show.length) + '개 더');
      more.type = 'button';
      more.addEventListener('click', function () { renderKws(true); });
      host.appendChild(more);
    }
  }

  function pickKeyword(word, targets) {
    KW = word;
    renderKws(true);
    var label = '「' + word + '」에 이어지는 첫 자료';
    renderMaterials(targets || G.kw[norm(word)] || [], label, '이 말로 시작하는 자료입니다. 하나를 고르면 그 자료가 무엇인지 먼저 보여 드립니다.');
  }

  function resolve(q) {
    var w = norm(q);
    if (!w) return [];
    var ids = {}, out = [];
    function add(id) {
      if (!SEC[id] || id === G.self || ids[id]) return;
      ids[id] = 1;
      out.push({ id: id });
    }
    if (G.kw[w]) G.kw[w].forEach(add);
    else {
      /* 품긴 말로 찾기 — 짧은 말부터(「훈련」→ 「구직자 훈련」) */
      var keys = Object.keys(G.kw).filter(function (k) { return k.indexOf(w) >= 0; });
      if (keys.length) keys.forEach(function (k) { G.kw[k].forEach(add); });
      else {
        /* 자료 이름·딱지·검색어에서 찾기 */
        G.sectors.forEach(function (s) {
          if (s.id === G.self) return;
          var hay = norm(s.title + ' ' + s.badge + ' ' + s.short + ' ' + s.kw.join(' '));
          if (hay.indexOf(w) >= 0) add(s.id);
        });
      }
    }
    /* 지도에 이름이 없어도 자료실 색인(기업 명함첩·대학학과위키·약어 사전)에 실려 있으면 그 자료를 보여 준다.
       「세스코」 → 기업 명함첩, 「계명대」 → 대학학과위키. */
    extHits(q).forEach(function (h) {
      if (ids[h.id]) return;
      ids[h.id] = 1;
      out.push({ id: h.id, ext: h });
    });
    return out;
  }

  function renderMaterials(ids, label, lead) {
    var host = $('starts');
    clear(host);
    var seen = {};
    ids = (ids || []).map(function (x) { return typeof x === 'string' ? { id: x } : x; })
      .filter(function (e) {
        if (!e || !SEC[e.id] || e.id === G.self || seen[e.id]) return false;
        seen[e.id] = 1;
        return true;
      });
    if (!ids.length) {
      var p = el('p', 'ok-msg bad', '그 말로 이어지는 자료를 찾지 못했습니다. 위의 키워드를 눌러 보거나, 자료 이름(예: 상담 대화 연습장)으로 적어 보세요.');
      host.appendChild(p);
      if (!EXT.ready && lead === 'search') {
        loadExt();
        host.appendChild(el('p', 'load-note', '자료실 색인(기업 명함첩·대학학과위키 등 1만 3천여 곳)을 불러오는 중입니다. 불러오면 같은 말로 한 번 더 찾습니다.'));
      }
      return;
    }
    if (label) {
      var h = el('p', 'cover-h', label + ' ' + ids.length + '곳');
      host.appendChild(h);
    }
    ids.slice(0, 6).forEach(function (e) {
      host.appendChild(materialCard(e.id, e.ext));
    });
    if (!EXT.ready && lead === 'search') {
      loadExt();
      host.appendChild(el('p', 'load-note', '기업·대학 이름까지 찾도록 자료실 색인을 불러오는 중입니다.'));
    }
  }

  function materialCard(id, ext) {
    var s = SEC[id];
    var card = el('div', 'pick');
    var hd = el('div', 'pick-hd');
    var b = el('span', 'tag', s.badge);
    var n = el('span', 'tag num', s.no + '번');
    hd.appendChild(b); hd.appendChild(n);
    if (ext) hd.appendChild(el('span', 'tag src', ext.tag));
    card.appendChild(hd);
    card.appendChild(el('h3', null, s.title));
    card.appendChild(el('p', null, s.desc));
    if (ext) {
      var src = el('p', 'src');
      src.appendChild(el('b', null, '찾은 까닭 '));
      src.appendChild(document.createTextNode('— ' + ext.note));
      card.appendChild(src);
    }
    var meta = el('div', 'meta');
    metaOf(id).forEach(function (m) { meta.appendChild(el('span', null, m)); });
    if (meta.childNodes.length) card.appendChild(meta);
    var go = el('button', 'pick-go', '여기서 시작');
    go.type = 'button';
    go.addEventListener('click', function () { startChain(id); });
    card.appendChild(go);
    return card;
  }

  /* 시작 검색창에서 한 번 찾기 — 색인이 늦게 도착하면 같은 말로 다시 찾아 카드를 갈아 끼운다 */
  function searchStart(q) {
    KW = '';
    renderKws(true);
    renderMaterials(resolve(q), '「' + q + '」로 찾은 자료', 'search');
    if (EXT.ready) return;
    loadExt().then(function () {
      if (($('q').value || '').trim() !== q) return;     /* 그사이 다른 말을 찾았다면 그대로 둔다 */
      if (!extHits(q).length) return;
      renderMaterials(resolve(q), '「' + q + '」로 찾은 자료', 'search');
    });
  }

  /* ---------- 흐름 ---------- */
  function startChain(id) {
    CHAIN = [id];
    OVERRIDE = false;
    PENDING = null;
    SHOWALL = false;
    setQuery('');
    $('treeSec').hidden = false;
    cutStart(true);
    render();
    setTimeout(function () {
      var top = $('treeSec').getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }, 40);
  }

  /* 시작 구간 접기 — 첫 자료를 고른 뒤에는 자리만 차지하지 않게 한 줄로 줄인다 */
  function cutStart(on) {
    var sec = $('startSec');
    sec.classList.toggle('cut', !!on);
    $('startSum').hidden = !on;
    if (on) {
      var s = SEC[CHAIN[0]] || {};
      $('sumKw').textContent = KW || '직접 고른 자료';
      $('sumTxt').textContent = '로 시작 — ' + (s.title || '');
    }
  }
  function uncutStart() {
    cutStart(false);
    $('q').value = '';
    KW = '';
    renderKws(false);
    clear($('starts'));
  }

  function addTo(id, fromSearch) {
    if (CHAIN.indexOf(id) >= 0) return;
    if (CHAIN.length >= MAX && !OVERRIDE) {
      PENDING = id;
      showRestraint();
      return;
    }
    if (CHAIN.length >= HARD) {
      toast('여덟 개를 넘으면 흐름이 흐려져요. 지금 흐름으로 덱을 만드는 걸 권해요.');
      return;
    }
    CHAIN.push(id);
    PENDING = null;
    hideNote();
    if (fromSearch) setQuery('');   /* 엮은 뒤에는 검색을 접고 추천 가지로 돌아간다 */
    render();
  }

  function showRestraint() {
    var n = $('note');
    clear(n);
    n.appendChild(el('span', null, '내용 혼재 및 과다 정보예요. 핵심 흐름만 남기는 걸 권해요.'));
    var more = el('div', 'more');
    var b = el('button', null, '그래도 ' + (SEC[PENDING] ? '「' + SEC[PENDING].title + '」' : '이 자료') + ' 넣기');
    b.type = 'button';
    b.addEventListener('click', function () {
      OVERRIDE = true;
      hideNote();
      var id = PENDING;
      PENDING = null;
      if (id) addTo(id);
    });
    more.appendChild(b);
    n.appendChild(more);
    n.hidden = false;
    toast('내용 혼재 및 과다 정보예요. 핵심 흐름만 남기는 걸 권해요.');
  }
  function hideNote() { var n = $('note'); if (n) { n.hidden = true; clear(n); } }

  function candidates() {
    if (!CHAIN.length) return [];
    var last = CHAIN[CHAIN.length - 1];
    var used = {};
    CHAIN.forEach(function (id) { used[id] = 1; });
    used[G.self] = 1;
    var out = [], seen = {};
    neigh(last).forEach(function (nb) {
      if (used[nb.id] || seen[nb.id]) return;
      seen[nb.id] = 1;
      out.push({ id: nb.id, p: nb.p, direct: true, via: last });
    });
    if (out.length < 4) {
      /* 곁가지: 지금 흐름의 다른 자료와 이어지는 후보도 보여 준다(근거는 그대로) */
      var extra = [];
      CHAIN.forEach(function (m) {
        if (m === last) return;
        neigh(m).forEach(function (nb) {
          if (used[nb.id] || seen[nb.id]) return;
          seen[nb.id] = 1;
          extra.push({ id: nb.id, p: nb.p, direct: false, via: m });
        });
      });
      extra.sort(function (a, b) { return (b.p.w - a.p.w) || (b.p.n - a.p.n) || (noOf(a.id) - noOf(b.id)); });
      out = out.concat(extra);
    }
    out.sort(function (a, b) {
      if (a.direct !== b.direct) return a.direct ? -1 : 1;
      return (b.p.w - a.p.w) || (b.p.n - a.p.n) || (noOf(a.id) - noOf(b.id));
    });
    return out.slice(0, 6);
  }

  function sharedText(p, max) {
    var list = (p.shared || []).slice(0, max || 3);
    if (!list.length) return '';
    var more = (p.shared || []).length > list.length ? ' 외 ' + ((p.shared || []).length - list.length) + '개' : '';
    return list.join(', ') + more;
  }

  /* ---------- 그리기 ---------- */
  function render() {
    renderChain();
    renderCover();
    renderCands();
    renderDone();
  }

  function renderChain() {
    var host = $('chain');
    clear(host);
    CHAIN.forEach(function (id, i) {
      var s = SEC[id];
      if (!s) return;
      var li = el('li', 'node');
      li.appendChild(el('span', 'n-no', String(i + 1)));
      var bd = el('div', 'n-bd');
      bd.appendChild(el('b', 'n-tt', s.title));
      var why = el('p', 'n-why');
      if (i === 0) {
        why.textContent = (KW ? '「' + KW + '」로 이어진 시작 자료입니다. ' : '시작 자료입니다. ') +
          '여기서 할 일 — ' + s.gi;
      } else {
        var prev = CHAIN[i - 1], p = pairOf(prev, id);
        var bits = [];
        if (p) {
          var why1 = p.link ? '자료실 연결 짝' : '';
          if (p.shared && p.shared.length) {
            why1 += (why1 ? ' · ' : '') + '겹치는 말 ' + p.shared.length + '개(' + sharedText(p, 3) + ')';
          }
          bits.push('근거 — ' + (why1 || '자료실 연결 짝'));
        } else {
          bits.push('근거 — 직접 엮은 흐름 · 시드/매치 자유 조합(자료실이 잇는 짝 없음)');
        }
        bits.push('이어서 할 일 — ' + s.gi);
        if (i >= 2) {
          var cover = coverMeta(CHAIN.slice(0, i + 1));
          bits.push('1~' + (i + 1) + ' 연결 — 함께 덮는 범위 ' + cover.slice(0, 3).join(' · ') +
            (cover.length > 3 ? ' 외 ' + (cover.length - 3) + '개' : '') );
        }
        why.textContent = bits.join('  ·  ');
      }
      bd.appendChild(why);
      li.appendChild(bd);
      var go = el('a', 'n-go', '열기');
      go.href = '../' + String(s.path || '').replace(/^\.\//, '');
      li.appendChild(go);
      host.appendChild(li);
    });
  }

  /* 흐름 전체가 함께 덮는 것 — 각 자료의 meta를 겹치지 않게 모은다(자료에 적힌 값 그대로) */
  function coverMeta(ids) {
    var out = [], seen = {};
    ids.forEach(function (id) {
      metaOf(id).forEach(function (m) {
        if (!m || seen[m]) return;
        seen[m] = 1;
        out.push(m);
      });
    });
    return out;
  }
  /* 흐름 안에서 **두 쌍 이상**에서 겹친 말 — 한 쌍에서만 겹친 말은 그 카드의 근거에 이미 있다 */
  function sharedOften(ids) {
    var count = {};
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var p = pairOf(ids[i], ids[j]);
        if (!p) continue;
        (p.shared || []).forEach(function (w) { count[w] = (count[w] || 0) + 1; });
      }
    }
    return Object.keys(count).filter(function (w) { return count[w] >= 2; })
      .sort(function (a, b) { return (count[b] - count[a]) || a.localeCompare(b); });
  }

  function renderCover() {
    var host = $('cover');
    clear(host);
    var ids = CHAIN.slice();
    host.appendChild(el('p', 'cover-h', '지금 흐름'));
    var line = el('p', 'flowline');
    ids.forEach(function (id, i) {
      if (i) line.appendChild(el('i', null, '→'));
      var s = SEC[id] || {};
      line.appendChild(el('span', null, s.short + ' ' + (s.no ? s.no : '')));
    });
    host.appendChild(line);
    var mets = coverMeta(ids);
    if (mets.length) {
      var box = el('div', 'mets');
      var cap = window.innerWidth < 900 ? 6 : 10;
      mets.slice(0, cap).forEach(function (m) { box.appendChild(el('span', null, m)); });
      if (mets.length > cap) box.appendChild(el('span', null, '외 ' + (mets.length - cap) + '개'));
      host.appendChild(box);
    }
    if (ids.length >= 2) {
      var words = sharedOften(ids);
      var pairs = [];
      for (var i = 1; i < ids.length; i++) pairs.push(i);
      var linked = 0;
      for (var j = 1; j < ids.length; j++) {
        var p = pairOf(ids[j - 1], ids[j]);
        if (p && p.link) linked++;
      }
      var manual = 0;
      for (var m = 1; m < ids.length; m++) if (!pairOf(ids[m - 1], ids[m])) manual++;
      var why = el('p', 'why');
      why.appendChild(el('b', null, ids.length + '개를 잇는 근거 ' + (ids.length - 1) + '쌍'));
      why.appendChild(document.createTextNode(
        ' — 자료실 연결 짝 ' + linked + '쌍' +
        (manual ? ' · 직접 엮은 흐름 ' + manual + '쌍' : '') +
        (words.length ? ' · 여러 자료에서 되풀이되는 말: ' + words.slice(0, 4).join(', ') : ' · 되풀이되는 말은 아직 없음') + '.'));
      host.appendChild(why);
    }
  }

  /* ---------- 단계마다: 다른 자료 직접 찾기 ---------- */
  /* 검색어 한 마디로 나머지 자료 전부를 훑는다 — 이름·분류(딱지)·키워드(영문 포함)·설명 순으로 무게를 준다 */
  function searchMaterials(q) {
    var n = norm(q), used = {}, out = [];
    CHAIN.forEach(function (id) { used[id] = 1; });
    Object.keys(SIDX).forEach(function (id) {
      var x = SIDX[id], sc = 0, why = [];
      var kwHit = x.kw.some(function (k) { return k && k.indexOf(n) >= 0; });
      if (kwHit) { sc += 100; why.push('키워드'); }
      if (x.name === n) { sc += 90; if (why.indexOf('이름') < 0) why.push('이름'); }
      else if (x.name.indexOf(n) >= 0) { sc += 60; if (why.indexOf('이름') < 0) why.push('이름'); }
      if (x.badge.indexOf(n) >= 0) { sc += 45; why.push('분류'); }
      if (x.body.indexOf(n) >= 0) { sc += 20; why.push('설명'); }
      if (!sc) return;
      out.push({ id: id, sc: sc, why: why, used: !!used[id] });
    });
    /* 자료실 색인(기업 명함첩·대학학과위키·약어 사전)에서 걸린 자료 — 지도에 이름이 없는 말도 후보로 올린다. */
    extHits(q).forEach(function (h) {
      for (var i = 0; i < out.length; i++) {
        if (out[i].id !== h.id) continue;
        /* 그래프에서 이미 걸린 자료는 그 근거를 그대로 두고, 이름·별칭이 꼭 같을 때만 색인 근거를 보탠다 */
        if (!out[i].ext && h.sc >= 95) out[i].ext = h;
        return;
      }
      out.push({ id: h.id, sc: 54 + h.sc * 0.42, why: [], ext: h, used: !!used[h.id] });
    });
    out.sort(function (a, b) { return (b.sc - a.sc) || (noOf(a.id) - noOf(b.id)); });
    return out;
  }
  /* 찾은 자료를 지금 흐름 끝에 잇는다 — 그래프에 짝이 있으면 그 근거를, 없으면 '직접 엮음'으로 */
  function searchHit(id) {
    var last = CHAIN[CHAIN.length - 1], p = pairOf(last, id), via = last;
    if (!p) {
      for (var i = CHAIN.length - 1; i >= 0; i--) {
        var pp = pairOf(CHAIN[i], id);
        if (pp) { p = pp; via = CHAIN[i]; break; }
      }
    }
    return { id: id, p: p, direct: via === last, via: via, manual: !p, search: true };
  }

  function renderPicks() {
    var host = $('picks');
    clear(host);
    var q = PQ.trim();
    var all = searchMaterials(q);
    var show = all.filter(function (r) { return !r.used; });
    var usedN = all.length - show.length;
    if (!EXT.ready) loadExt();
    var stat = $('pqStat');
    clear(stat);
    stat.hidden = false;
    stat.appendChild(el('b', null, '「' + q + '」 ' + show.length + '곳 찾음'));
    if (usedN) stat.appendChild(document.createTextNode(' · 이미 흐름에 담긴 ' + usedN + '곳은 뺐습니다'));
    if (!EXT.ready) stat.appendChild(document.createTextNode(EXT.err
      ? ' · 기업·대학 색인을 불러오지 못해 지도 안에서만 찾았습니다'
      : ' · 기업·대학 색인 불러오는 중'));
    if (!show.length) {
      var box = el('div', 'pick-empty');
      box.appendChild(el('p', null, all.length
        ? '「' + q + '」는 이미 흐름에 담겨 있습니다. 다른 말로 찾거나 검색어를 지워 추천 가지로 돌아가세요.'
        : (EXT.ready
          ? '그 말로 이어지는 자료를 찾지 못했습니다. 자료 이름이나 분류(예: 법전, 번역기, 세스코, 계명대)로 다시 적어 보세요.'
          : (EXT.err
            ? '그 말로 이어지는 자료를 찾지 못했습니다. 자료 이름이나 분류(예: 법전, 번역기, 기업)로 다시 적어 보세요.'
            : '기업·대학 이름까지 찾도록 자료실 색인을 불러오는 중입니다. 잠시 뒤 같은 말로 다시 찾아보세요.'))));
      var row = el('div', 'row');
      var cl = el('button', null, '검색어 지우기');
      cl.type = 'button';
      cl.addEventListener('click', clearQuery);
      row.appendChild(cl);
      box.appendChild(row);
      host.appendChild(box);
      return;
    }
    show.slice(0, 12).forEach(function (r, i) {
      host.appendChild(candCard(searchHit(r.id), i + 1, r.why, r.ext));
    });
    if (show.length > 12) {
      host.appendChild(el('p', 'pstat', '나머지 ' + (show.length - 12) + '곳은 검색어를 더 적어 좁혀 보세요.'));
    }
  }

  function setQuery(v) {
    PQ = v == null ? '' : v;
    var inp = $('pq'), cl = $('pqClear');
    if (inp && inp.value !== PQ) inp.value = PQ;
    if (cl) cl.hidden = !PQ;
    if (CHAIN.length) renderCands();
  }
  function clearQuery() {
    setQuery('');
    var inp = $('pq');
    if (inp) inp.focus();
  }

  function renderCands() {
    var host = $('cands');
    var picks = $('picks');
    clear(host);
    if (norm(PQ)) {
      host.hidden = true;
      $('moreBtn').hidden = true;
      picks.hidden = false;
      $('forkT').textContent = '찾은 자료';
      renderPicks();
      $('forkN').textContent = '지우면 추천 가지로 돌아갑니다';
      return;
    }
    host.hidden = false;
    picks.hidden = true;
    clear(picks);
    $('pqStat').hidden = true;
    $('forkT').textContent = '다음 가지';
    var list = candidates();
    $('forkN').textContent = list.length ? list.length + '곳 — 근거가 있는 다음 자료' : '';
    if (!list.length) {
      var p = el('p', 'ok-msg', '이 자료와 근거로 이어지는 다음 자료가 더 없습니다. 위에서 다른 자료를 직접 찾아 이어도 됩니다.');
      host.appendChild(p);
      return;
    }
    list.forEach(function (c, i) {
      var wrap = el('div', 'branch');
      wrap.setAttribute('data-cand', c.id);
      wrap.appendChild(candCard(c, i + 1));
      host.appendChild(wrap);
    });
    var narrow = window.innerWidth < 900;
    var per = narrow ? 2 : list.length;
    var cut = narrow && !SHOWALL && list.length > per;
    host.classList.toggle('limit2', !!cut);
    var more = $('moreBtn');
    more.hidden = !(narrow && list.length > per);
    more.textContent = SHOWALL ? '후보 접기' : '남은 후보 ' + (list.length - per) + '곳 보기';
    var pane = document.querySelector('.pane.r');
    if (pane) {
      pane.scrollTop = 0;
      /* 클릭한 단추로 브라우저가 스크롤한 것을 한 프레임 뒤에 되돌린다 */
      requestAnimationFrame(function () { pane.scrollTop = 0; });
    }
  }

  function candCard(c, ord, why, ext) {
    var s = SEC[c.id], p = c.p;
    var card = el('article', 'cand');
    var top = el('div', 'c-top');
    top.appendChild(el('span', 'tag', s.badge));
    top.appendChild(el('span', 'tag num', s.no + '번'));
    top.appendChild(el('span', 'c-no', ext ? ext.tag
      : (why && why.length ? why.join(' · ') + '에서 찾음' : (c.manual ? '직접 엮기' : '후보'))));
    card.appendChild(top);
    card.appendChild(el('h3', null, s.title));
    card.appendChild(el('p', 'c-desc', s.desc));

    var syn = el('div', 'syn');
    var sh = el('p', 'syn-h');
    if (c.manual) {
      sh.appendChild(el('em', null, '직접 엮은 흐름'));
      sh.appendChild(el('span', null, '시드/매치 자유 조합'));
    } else {
      sh.appendChild(el('em', null, '시너지'));
      sh.appendChild(el('span', null, '지금 흐름 + 이 자료'));
    }
    syn.appendChild(sh);
    var ul = el('ul', 'syn-l');

    if (ext) {
      var liS = el('li');
      liS.appendChild(el('b', null, '찾은 까닭 '));
      liS.appendChild(document.createTextNode('— ' + ext.note));
      ul.appendChild(liS);
    }

    var why1 = '';
    if (p && p.link) why1 = '자료실 연결 짝';
    if (p && p.shared && p.shared.length) {
      why1 += (why1 ? ' · ' : '') + '겹치는 말 ' + p.shared.length + '개(' + sharedText(p, 4) + ')';
    }
    if (!c.direct) why1 += (why1 ? ' · ' : '') + '흐름의 「' + (SEC[c.via] || {}).short + '」와 이어짐';

    var li1 = el('li');
    if (p) {
      li1.appendChild(el('b', null, '근거 '));
      li1.appendChild(document.createTextNode('— ' + (why1 || '자료실 자료로만 확인')));
    } else {
      li1.appendChild(el('b', null, '근거 '));
      li1.appendChild(document.createTextNode('— 자료실이 잇는 짝이 없어 내가 골라 엮는 조합입니다.'));
    }
    ul.appendChild(li1);

    var prev = CHAIN[CHAIN.length - 1];
    var li2 = el('li');
    li2.appendChild(el('b', null, (CHAIN.length + 1) + '개 연결 '));
    li2.appendChild(document.createTextNode('— 함께 쓰는 것: 「' + (SEC[prev] || {}).short + '」 ' +
      metaOf(prev).slice(0, 2).join(' · ') + ' / 「' + s.short + '」 ' + metaOf(c.id).slice(0, 2).join(' · ')));
    ul.appendChild(li2);

    var li3 = el('li');
    li3.appendChild(el('b', null, '이어서 할 일 '));
    li3.appendChild(document.createTextNode('— ' + s.gi));
    ul.appendChild(li3);

    if (c.manual) {
      var li5 = el('li');
      li5.appendChild(el('b', null, '덱에는 '));
      li5.appendChild(document.createTextNode('— 내가 엮은 순서 그대로 담깁니다(근거 문장은 붙지 않습니다)'));
      ul.appendChild(li5);
    } else if (CHAIN.length >= 2) {
      var words = sharedOften(CHAIN.concat([c.id]));
      var li4 = el('li');
      li4.appendChild(el('b', null, '흐름 전체 '));
      li4.appendChild(document.createTextNode('— ' + (words.length
        ? '여러 자료에서 되풀이되는 말 ' + words.length + '개(' + words.slice(0, 3).join(', ') + (words.length > 3 ? ' 외' : '') + ')'
        : '겹치는 말은 없고 자료실 연결 짝으로만 이어집니다')));
      ul.appendChild(li4);
    }
    syn.appendChild(ul);
    card.appendChild(syn);

    var add = el('button', 'c-add', c.manual ? '＋ 직접 엮어 잇기'
      : (CHAIN.length >= MAX ? '＋ 그래도 잇기' : '＋ 이 자료 잇기'));
    add.type = 'button';
    if (CHAIN.length >= MAX) add.setAttribute('data-over', '');
    add.addEventListener('click', function () { addTo(c.id, !!c.search); });
    card.appendChild(add);
    return card;
  }

  function renderDone() {
    var n = CHAIN.length;
    var txt = $('doneTxt');
    clear(txt);
    txt.appendChild(el('b', null, '지금 ' + n + '개'));
    txt.appendChild(document.createTextNode(n < 2
      ? ' — 한 개만으로도 덱이 되지만, 두 개부터 「A 다음에 B」가 보입니다.'
      : (n > MAX ? ' — 권장(6개)을 넘었어요. 핵심만 남기면 덱이 더 또렷해집니다.'
        : ' — 여기서 멈추고 덱으로 만들어도 됩니다.')));
    $('makeBtn').disabled = false;
  }

  /* ---------- 시트: 덱 완성 · 저장 · 리허설 ---------- */
  function openSheet(mode) {
    hideNote();
    toast('');
    SHEET = mode || 'done';
    REH = 0;
    $('sheet').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    renderSheet();
    var bd = document.querySelector('.sheet-bd');
    if (bd) setTimeout(function () { bd.focus(); }, 30);
  }
  function closeSheet() {
    $('sheet').hidden = true;
    document.documentElement.style.overflow = '';
  }

  function deckSteps() {
    return CHAIN.map(function (id) {
      var s = SEC[id] || {};
      return { id: id, no: s.no || '', title: s.title || id, badge: s.badge || '' };
    });
  }
  function defaultName() {
    var first = SEC[CHAIN[0]] || {};
    var last = SEC[CHAIN[CHAIN.length - 1]] || {};
    var t = (first.short || '') + (CHAIN.length > 1 ? ' → ' + (last.short || '') : '') + ' ' + CHAIN.length + '단계';
    return t.slice(0, 60);
  }

  function renderSheet() {
    var host = $('sheetMain'), ft = $('sheetFt');
    clear(host); clear(ft);
    if (SHEET === 'rehearsal') return renderRehearsal(host, ft);
    renderDoneSheet(host, ft);
  }

  function renderDoneSheet(host, ft) {
    $('sheetT').textContent = '내 덱 — ' + CHAIN.length + '개 자료';
    var field = el('div', 'field');
    var lab = el('label', null, '덱 이름');
    lab.setAttribute('for', 'deckName');
    var inp = document.createElement('input');
    inp.id = 'deckName';
    inp.type = 'text';
    inp.maxLength = 60;
    inp.value = DECK_NAME || defaultName();
    inp.addEventListener('input', function () { DECK_NAME = inp.value; });
    field.appendChild(lab); field.appendChild(inp);
    host.appendChild(field);

    var list = el('ol', 'steps');
    CHAIN.forEach(function (id, i) {
      var s = SEC[id] || {};
      var li = el('li');
      li.appendChild(el('span', 'si', String(i + 1)));
      var a = el('a', null, s.title || id);
      a.href = '../' + String(s.path || '').replace(/^\.\//, '');
      li.appendChild(a);
      li.appendChild(el('span', 'sb', (s.no || '') + '번 · ' + (s.badge || '')));
      list.appendChild(li);
    });
    host.appendChild(list);

    var cover = coverMeta(CHAIN);
    if (cover.length) {
      var p = el('p', 'ok-msg', '이 덱이 함께 덮는 범위 — ' + cover.slice(0, 6).join(' · ') +
        (cover.length > 6 ? ' 외 ' + (cover.length - 6) + '개' : ''));
      host.appendChild(p);
    }

    var saved = el('p', 'ok-msg');
    saved.id = 'saveMsg';
    host.appendChild(saved);

    var b1 = el('button', 'ghost', '리허설');
    b1.type = 'button';
    b1.addEventListener('click', function () { SHEET = 'rehearsal'; REH = 0; renderSheet(); });
    var b2 = el('button', 'primary', '마이덱에 저장');
    b2.type = 'button';
    b2.addEventListener('click', doSave);
    var b3 = el('button', 'ghost', '시드·매치 덱으로');
    b3.type = 'button';
    b3.addEventListener('click', sendToDeck);
    ft.appendChild(b1); ft.appendChild(b2); ft.appendChild(b3);
  }

  function renderRehearsal(host, ft) {
    $('sheetT').textContent = '리허설 — ' + (REH + 1) + ' / ' + CHAIN.length;
    var id = CHAIN[REH], s = SEC[id] || {};
    var box = el('div', 'reh');
    var hd = el('div', 'reh-hd');
    hd.appendChild(el('span', 'si', String(REH + 1)));
    hd.appendChild(el('span', 'tag', s.badge || ''));
    hd.appendChild(el('span', 'tag num', (s.no || '') + '번'));
    box.appendChild(hd);
    var h4 = el('h4', null, s.title || id);
    box.appendChild(h4);
    box.appendChild(el('p', null, s.desc || ''));
    var mets = el('div', 'mets');
    metaOf(id).forEach(function (m) { mets.appendChild(el('span', null, m)); });
    if (mets.childNodes.length) box.appendChild(mets);
    if (REH > 0) {
      var p = pairOf(CHAIN[REH - 1], id);
      if (p) {
        box.appendChild(el('p', null, '앞 자료와의 근거 — ' + (p.link ? '자료실 연결 짝' : '겹치는 말') +
          (p.shared && p.shared.length ? ' · ' + sharedText(p, 4) : '')));
      }
    }
    host.appendChild(box);
    var a = el('a', 'pick-go', '이 자료 열기');
    a.href = '../' + String(s.path || '').replace(/^\.\//, '');
    host.appendChild(a);

    var prev = el('button', 'ghost', '이전');
    prev.type = 'button';
    prev.disabled = REH === 0;
    prev.addEventListener('click', function () { if (REH > 0) { REH--; renderSheet(); } });
    var next = el('button', 'primary', REH === CHAIN.length - 1 ? '리허설 마치기' : '다음 자료');
    next.type = 'button';
    next.addEventListener('click', function () {
      if (REH < CHAIN.length - 1) { REH++; renderSheet(); }
      else { SHEET = 'done'; renderSheet(); }
    });
    var back = el('button', 'ghost', '덱으로 돌아가기');
    back.type = 'button';
    back.addEventListener('click', function () { SHEET = 'done'; renderSheet(); });
    ft.appendChild(prev); ft.appendChild(next); ft.appendChild(back);
  }

  function doSave() {
    var nameIn = $('deckName');
    var name = (nameIn && nameIn.value || DECK_NAME || defaultName()).trim().slice(0, 60);
    var msg = $('saveMsg');
    if (!window.JCDeck) { if (msg) { msg.className = 'ok-msg bad'; msg.textContent = '저장 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.'; } return; }
    var deck = window.JCDeck.deckFromSteps(deckSteps(), name);
    if (!deck) { if (msg) { msg.className = 'ok-msg bad'; msg.textContent = '덱 모양이 맞지 않아 저장하지 못했어요.'; } return; }
    if (msg) { msg.className = 'ok-msg'; msg.textContent = '저장하는 중…'; }
    window.JCDeck.save(deck).then(function (r) {
      var where = r.source === 'server' ? '내 계정의 마이덱' : '이 브라우저(이 기기에만)';
      if (msg) {
        msg.className = 'ok-msg';
        clear(msg);
        msg.appendChild(el('b', null, where + '에 저장했어요. '));
        var a = el('a', null, '마이덱 열기');
        a.href = '../mydeck/';
        a.style.color = 'var(--acc)';
        a.style.fontWeight = '750';
        a.style.display = 'inline-block';
        a.style.minHeight = '44px';
        a.style.lineHeight = '44px';
        msg.appendChild(a);
        if (r.source !== 'server') {
          msg.appendChild(el('span', null, window.JCDeck && window.JCDeck.loggedIn()
            ? ' — 계정 저장소가 배포되면 계정에도 보관됩니다.'
            : ' — 로그인하면 다른 기기에서도 이어집니다.'));
        }
      }
      toast(r.source === 'server' ? '마이덱에 저장했어요.'
        : (window.JCDeck && window.JCDeck.loggedIn() ? '이 기기에 저장했어요. 계정 저장소가 배포되면 계정에 보관됩니다.'
                                                    : '이 기기에 저장했어요. 로그인하면 계정에 보관됩니다.'));
    }, function (e) {
      if (msg) { msg.className = 'ok-msg bad'; msg.textContent = window.JCDeck.errText(e || {}) || '저장하지 못했어요.'; }
    });
  }

  /* 시드·매치 덱에 이 순서를 꽂고 대문으로 넘어간다(deck.js가 읽는 자리와 같은 곳). */
  function sendToDeck() {
    var seed = [], match = [];
    (window.JC_TOOLS || []).forEach(function (t) { (t.mode === 'seed' ? seed : match).push(t.id); });
    var slots = match.length, seedSlots = seed.length;
    var how = CHAIN.length <= seedSlots ? 'seed' : 'match';
    var arr = [], i;
    for (i = 0; i < (how === 'seed' ? seedSlots : slots); i++) arr.push(CHAIN[i] || null);
    try {
      localStorage.setItem('jc-deck-' + how, JSON.stringify(arr));
      localStorage.removeItem('jc-preset-' + how);
    } catch (e) {}
    toast((how === 'seed' ? '시드' : '매치') + ' 덱에 이 순서를 꽂았어요.');
    location.href = '../?mode=' + how;
  }

  /* ---------- 시작 ---------- */
  function bind() {
    $('pvToggle').addEventListener('click', function () {
      var open = $('pv').classList.toggle('open');
      $('pvToggle').setAttribute('aria-expanded', String(open));
      $('pvBody').hidden = !open;
      $('pvLabel').textContent = open ? '접기' : '펼치기';
    });
    $('findForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = ($('q').value || '').trim();
      if (!q) { renderKws(false); clear($('starts')); return; }
      searchStart(q);
    });
    $('againBtn').addEventListener('click', function () {
      CHAIN = [];
      OVERRIDE = false;
      PENDING = null;
      setQuery('');
      hideNote();
      $('treeSec').hidden = true;
      uncutStart();
      var top = $('startSec').getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
    $('moreBtn').addEventListener('click', function () {
      SHOWALL = !SHOWALL;
      renderCands();
    });
    /* 시작 검색창 — 지도에 없어도 자료실 색인(기업·대학)에 실린 이름을 찾아 준다.
       색인을 아직 받는 중이었다면 다 받은 뒤 같은 말로 한 번 더 찾는다. */
    if ($('q')) $('q').addEventListener('focus', function () { loadExt(); });

    /* 단계마다 다른 자료를 직접 찾는 칸 — 입력 즉시 한 프레임에 한 번만 다시 그린다 */
    if ($('pq')) {
      $('pq').addEventListener('focus', function () { loadExt(); });
      $('pq').addEventListener('input', function () {
        if (PRAF) return;
        PRAF = requestAnimationFrame(function () { PRAF = 0; setQuery($('pq').value); });
      });
      $('pq').addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); clearQuery(); }
      });
    }
    if ($('pqClear')) $('pqClear').addEventListener('click', clearQuery);
    window.addEventListener('resize', function () { if (CHAIN.length) renderCands(); }, { passive: true });
    $('undoBtn').addEventListener('click', function () {
      if (CHAIN.length <= 1) { toast('첫 자료입니다. 「처음부터」로 다시 고를 수 있어요.'); return; }
      CHAIN.pop();
      OVERRIDE = false;
      hideNote();
      if (CHAIN.length <= 1) { /* 한 개만 남으면 그대로 둔다(시작은 첫 자료) */ }
      render();
    });
    $('resetBtn').addEventListener('click', function () {
      CHAIN = []; OVERRIDE = false; PENDING = null; DECK_NAME = ''; SHOWALL = false;
      setQuery('');
      hideNote();
      $('treeSec').hidden = true;
      uncutStart();
      var top = $('startSec').getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
    $('makeBtn').addEventListener('click', function () { openSheet('done'); });
    $('saveBtn').addEventListener('click', function () { openSheet('done'); });
    $('sheetX').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    });
    var brand = $('brand');
    if (brand) brand.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function init() {
    renderKws(false);
    bind();
    /* 점검용 — 자료실 색인을 몇 줄 받았는지 밖에서 잴 수 있게 (화면에는 쓰지 않는다) */
    window.JCFlowExt = function () { return { ready: EXT.ready, rows: EXT.rows.length, dict: EXT.dict.length, err: EXT.err }; };
    document.documentElement.setAttribute('data-jc-flow', 'ready');
  }

  function boot() {
    fetch('./data/graph.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('graph'); return r.json(); })
      .then(function (g) { G = g; index(); init(); })
      .catch(function () {
        var host = $('starts');
        if (host) host.appendChild(el('p', 'ok-msg bad', '시너지 지도를 불러오지 못했습니다. 잠시 뒤 화면을 새로 열어 주세요.'));
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
