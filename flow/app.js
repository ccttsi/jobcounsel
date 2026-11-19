/* app.js — 27번 상담 플로우 아키텍트 (2026-11-20)
 *
 * 하는 일
 *   1) 키워드(또는 직접 적은 말)로 첫 자료를 고르고, 그 자료가 **무엇이며 무엇을 설명하는지** 먼저 보여 준다.
 *   2) 고른 자료마다 다음 가지(후보)를 자료실의 실제 연결로 뻗는다. 후보마다
 *      「앞 자료와의 근거(자료실 연결 짝·겹치는 말)」와 「지금 흐름 + 이 자료가 함께 덮는 것」을 적는다.
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
    if (G.kw[w]) return G.kw[w];
    /* 품긴 말로 찾기 — 짧은 말부터(「훈련」→ 「구직자 훈련」) */
    var keys = Object.keys(G.kw).filter(function (k) { return k.indexOf(w) >= 0; });
    if (keys.length) {
      var ids = {}, out = [];
      keys.forEach(function (k) { G.kw[k].forEach(function (id) { if (!ids[id]) { ids[id] = 1; out.push(id); } }); });
      return out;
    }
    /* 자료 이름·딱지·검색어에서 찾기 */
    var byName = [];
    G.sectors.forEach(function (s) {
      if (s.id === G.self) return;
      var hay = norm(s.title + ' ' + s.badge + ' ' + s.short + ' ' + s.kw.join(' '));
      if (hay.indexOf(w) >= 0) byName.push(s.id);
    });
    return byName;
  }

  function renderMaterials(ids, label, lead) {
    var host = $('starts');
    clear(host);
    ids = (ids || []).filter(function (id) { return SEC[id] && id !== G.self; });
    if (!ids.length) {
      var p = el('p', 'ok-msg bad', '그 말로 이어지는 자료를 찾지 못했습니다. 위의 키워드를 눌러 보거나, 자료 이름(예: 상담 대화 연습장)으로 적어 보세요.');
      host.appendChild(p);
      return;
    }
    if (label) {
      var h = el('p', 'cover-h', label + ' ' + ids.length + '곳');
      host.appendChild(h);
    }
    ids.slice(0, 6).forEach(function (id) {
      host.appendChild(materialCard(id));
    });
  }

  function materialCard(id) {
    var s = SEC[id];
    var card = el('div', 'pick');
    var hd = el('div', 'pick-hd');
    var b = el('span', 'tag', s.badge);
    var n = el('span', 'tag num', s.no + '번');
    hd.appendChild(b); hd.appendChild(n);
    card.appendChild(hd);
    card.appendChild(el('h3', null, s.title));
    card.appendChild(el('p', null, s.desc));
    var meta = el('div', 'meta');
    metaOf(id).forEach(function (m) { meta.appendChild(el('span', null, m)); });
    if (meta.childNodes.length) card.appendChild(meta);
    var go = el('button', 'pick-go', '여기서 시작');
    go.type = 'button';
    go.addEventListener('click', function () { startChain(id); });
    card.appendChild(go);
    return card;
  }

  /* ---------- 흐름 ---------- */
  function startChain(id) {
    CHAIN = [id];
    OVERRIDE = false;
    PENDING = null;
    SHOWALL = false;
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

  function addTo(id) {
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
      var why = el('p', 'why');
      why.appendChild(el('b', null, ids.length + '개를 잇는 근거 ' + (ids.length - 1) + '쌍'));
      why.appendChild(document.createTextNode(
        ' — 자료실 연결 짝 ' + linked + '쌍' +
        (words.length ? ' · 여러 자료에서 되풀이되는 말: ' + words.slice(0, 4).join(', ') : ' · 되풀이되는 말은 아직 없음') + '.'));
      host.appendChild(why);
    }
  }

  function renderCands() {
    var host = $('cands');
    clear(host);
    var list = candidates();
    $('forkN').textContent = list.length ? list.length + '곳 — 근거가 있는 다음 자료' : '';
    if (!list.length) {
      var p = el('p', 'ok-msg', '이 자료와 근거로 이어지는 다음 자료가 더 없습니다. 여기서 덱을 만들어도 됩니다.');
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

  function candCard(c, ord) {
    var s = SEC[c.id], p = c.p;
    var card = el('article', 'cand');
    var top = el('div', 'c-top');
    top.appendChild(el('span', 'tag', s.badge));
    top.appendChild(el('span', 'tag num', s.no + '번'));
    top.appendChild(el('span', 'c-no', '후보'));
    card.appendChild(top);
    card.appendChild(el('h3', null, s.title));
    card.appendChild(el('p', 'c-desc', s.desc));

    var syn = el('div', 'syn');
    var sh = el('p', 'syn-h');
    sh.appendChild(el('em', null, '시너지'));
    sh.appendChild(el('span', null, '지금 흐름 + 이 자료'));
    syn.appendChild(sh);
    var ul = el('ul', 'syn-l');

    var why = '';
    if (p.link) why = '자료실 연결 짝';
    if (p.shared && p.shared.length) {
      why += (why ? ' · ' : '') + '겹치는 말 ' + p.shared.length + '개(' + sharedText(p, 4) + ')';
    }
    if (!c.direct) why += (why ? ' · ' : '') + '흐름의 「' + (SEC[c.via] || {}).short + '」와 이어짐';

    var li1 = el('li');
    li1.appendChild(el('b', null, '근거 '));
    li1.appendChild(document.createTextNode('— ' + (why || '자료실 자료로만 확인')));
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

    if (CHAIN.length >= 2) {
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

    var add = el('button', 'c-add', CHAIN.length >= MAX ? '＋ 그래도 잇기' : '＋ 이 자료 잇기');
    add.type = 'button';
    if (CHAIN.length >= MAX) add.setAttribute('data-over', '');
    add.addEventListener('click', function () { addTo(c.id); });
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
      KW = '';
      renderKws(true);
      var ids = resolve(q);
      renderMaterials(ids, '「' + q + '」로 찾은 자료', '');
    });
    $('againBtn').addEventListener('click', function () {
      CHAIN = [];
      OVERRIDE = false;
      PENDING = null;
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
