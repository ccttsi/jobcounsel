/* deck.js — 시드(11)·매치(12) 재구성 화면: 세로 슬롯 덱 (2026-11-17, 2026-11-18 CP3, 2026-11-19 프리셋)
 *
 * 「내 목차」를 직접 꽂는 화면. 왼쪽(휴대폰은 위)은 1번부터 내려가는 세로 슬롯, 오른쪽(휴대폰은 아래)은 자료 선반.
 *   PC: 선반 카드를 슬롯으로 끌어다 놓기 / 1클릭(들기) → 슬롯 1클릭.  휴대폰: 1탭(들기) → 슬롯 1탭.
 *   2026-11-18: 꽂힌 자료는 누른다고 선반으로 빠지지 않는다(고정). 누르면 플로팅 카드가 떠서
 *   「이 자료 열기 · 자리 옮기기 · 선반으로 빼기」를 고른다. 선반 자료 클릭 = 들고 배치 대기, 꽂힌 자료 클릭 = 미리보기.
 *   배치는 모드별로 이 기기에 저장한다(jc-deck-seed · jc-deck-match).
 *
 * 2026-11-19 — 상담 프리셋(assets/presets.js). 덱 머리 아래 한 줄 칩을 누르면 그 프리셋의 카드가
 *   **단계 순서대로** 1번 칸부터 꽂히고, 슬롯 사이에 「1단계 · 지표」 같은 단계 머리와 그 단계의 질문이 끼어
 *   상담 진행 순서가 덱 자체에 남는다. 덱 아래 한 줄에 「왜 이 순서」 근거가 뜨고 「프리셋 풀기」로 되돌린다.
 *   프리셋 카드는 id로만 가리키므로, 아직 없는 섹터는 조용히 건너뛴다. 손으로 꽂거나 빼면 프리셋 표시만 풀린다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = { seed: 'jc-deck-seed', match: 'jc-deck-match' };
  var INFO = {
    seed: { k: '시드', en: 'SEED', sub: '지식·원리·기준 쌓기' },
    match: { k: '매치', en: 'MATCH', sub: '현장·실무 쓰기' }
  };
  var deck = { seed: [], match: [] };   /* 칸 수만큼의 배열. 빈 칸은 null */
  var PKEY = { seed: 'jc-preset-seed', match: 'jc-preset-match' };
  var pre = { seed: '', match: '' };        /* 지금 적용된 프리셋 id */
  var prev = { seed: null, match: null };   /* 프리셋 적용 직전 배치 — 「프리셋 풀기」가 되돌린다 */
  var mode = 'all';
  var hold = null;    /* {id, from} — from=null이면 선반에서 들고 있음, 숫자면 그 칸에서 옮기는 중 */
  var view = null;    /* {id, idx} — 꽂힌 자료 미리보기(고정된 자리) */
  var drag = null, suppress = false, shelfDrag = null, suppressShelf = false;
  var tutStep = 0, tutOpen = false, built = false;

  /* ---------- 장부 ---------- */
  function all() { return window.JC_TOOLS || []; }
  /* 자료 선반은 언제나 표시 번호(no) 오름차순이다 — 01, 03, 04 … 24.
     (2026-11-19 지적: mo 순서로 늘어놓아 선반이 01 → 12 → 03 으로 섞여 보였다.
      mo는 같은 번호가 겹칠 때만 쓰는 보조 열쇠로 남긴다.) */
  function listFor(m) {
    return all().filter(function (t) { return t.mode === m; })
      .sort(function (a, b) {
        var na = parseInt(a.no, 10), nb = parseInt(b.no, 10);
        if (isNaN(na)) na = 999; if (isNaN(nb)) nb = 999;
        return (na - nb) || ((a.mo || 99) - (b.mo || 99));
      });
  }
  function byId(id) { var a = all(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function maxOf(m) { return listFor(m).length; }
  /* 칸은 처음부터 전부 있고, 배치는 「몇 번 칸에 무엇」이다(빈 칸 null). 모드별로 따로 저장한다.
     프리셋은 다른 모드의 섹터도 한 흐름에 꽂으므로, 칸이 받는 id는 그 모드 목록이 아니라 **장부 전체**다. */
  function valid(m, arr) {
    var ids = {}, out = [], max = maxOf(m);
    all().forEach(function (t) { ids[t.id] = 1; });
    arr = Array.isArray(arr) ? arr : [];
    for (var i = 0; i < max; i++) {
      var x = arr[i];
      if (x && ids[x] && out.indexOf(x) < 0) { out[i] = x; ids[x] = 2; }
      else out[i] = null;
    }
    return out;
  }
  function read(m) { try { return valid(m, JSON.parse(localStorage.getItem(KEY[m]) || '[]')); } catch (e) { return valid(m, []); } }
  function save() { try { localStorage.setItem(KEY[mode], JSON.stringify(deck[mode])); } catch (e) { } }

  /* ---------- 상담 프리셋 (assets/presets.js) ---------- */
  function presetList(m) {
    var src = (window.JC_PRESETS || {})[m];
    return Array.isArray(src) ? src.filter(function (p) { return p && p.id && p.steps && p.steps.length; }) : [];
  }
  function presetOf(m, id) {
    var a = presetList(m);
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  function presetCards(p) {
    var out = [];
    (p.steps || []).forEach(function (s) {
      (s.cards || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    });
    return out;
  }
  /* 아직 없는 섹터(머지 전)는 세지 않는다 — 프리셋이 조용히 줄어들 뿐 빈 칸이 생기지 않는다 */
  function presetLive(p) { return presetCards(p).filter(function (c) { return !!byId(c); }); }
  function readPre(m) {
    try { var v = localStorage.getItem(PKEY[m]) || ''; return v && presetOf(m, v) ? v : ''; } catch (e) { return ''; }
  }
  function savePre() {
    try { if (pre[mode]) localStorage.setItem(PKEY[mode], pre[mode]); else localStorage.removeItem(PKEY[mode]); } catch (e) { }
  }
  /* 저장된 표시가 실제 배치와 맞는지 — 손으로 고친 뒤 남은 표시를 지운다 */
  function deckFitsPreset(m, id) {
    var p = presetOf(m, id); if (!p) return false;
    var want = presetLive(p), arr = deck[m] || [];
    if (!want.length) return false;
    for (var i = 0; i < want.length; i++) if (arr[i] !== want[i]) return false;
    return true;
  }
  function applyPreset(id) {
    var p = presetOf(mode, id); if (!p) return false;
    var max = maxOf(mode), arr = [], n = 0;
    for (var k = 0; k < max; k++) arr[k] = null;
    presetLive(p).forEach(function (c) {
      if (n < max && arr.indexOf(c) < 0) arr[n++] = c;
    });
    if (!n) return false;
    prev[mode] = deck[mode].slice();
    deck[mode] = valid(mode, arr);
    pre[mode] = id; stepSel = 0; save(); savePre();
    hold = null; view = null;
    render(); flash(0);
    var sc = $('deckScroll'); if (sc) sc.scrollTop = 0;
    return true;
  }
  function clearPreset() {
    if (prev[mode]) { deck[mode] = valid(mode, prev[mode]); save(); }
    prev[mode] = null; pre[mode] = ''; savePre();
    hold = null; view = null;
    render();
  }
  /* 손으로 꽂거나 빼면 프리셋 표시만 조용히 푼다(배치는 그대로) */
  function unmark() {
    if (!pre[mode]) return;
    pre[mode] = ''; prev[mode] = null; savePre();
  }

  /* ---------- 그리기 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slotCount() { return maxOf(mode); }
  function renderDeck() {
    /* 스크롤 위치 보존: innerHTML을 갈아 끼우면 scrollTop이 0으로 튄다(CP3 버그). 같은 틱에 되돌린다. */
    var sc = $('deckScroll'), top = sc ? sc.scrollTop : 0;
    var arr = deck[mode], n = slotCount(), h = "";
    for (var i = 0; i < n; i++) {
      var t = arr[i] ? byId(arr[i]) : null;
      var moving = hold && hold.from === i ? ' a-moving' : '';
      if (t) {
        h += '<li class="a-dslot a-on a-' + t.color + moving + '" data-i="' + i + '">'
          + '<button type="button" class="a-dslot-b" data-dslot="' + i + '" aria-label="' + (i + 1) + '번 칸, ' + esc(t.title) + '. 미리보기 열기">'
          + '<span class="a-dslot-n a-num">' + (i + 1) + '</span>'
          + '<span class="a-dslot-t"><b>' + esc(t.gi || t.title) + '</b><small>' + esc(t.title) + '</small></span>'
          + '<span class="a-dslot-tag">' + esc(t.badge) + '</span>'
          + '</button></li>';
      } else {
        h += '<li class="a-dslot a-dslot-empty' + (hold ? ' a-take' : '') + '" data-i="' + i + '">'
          + '<button type="button" class="a-dslot-b" data-dslot="' + i + '" aria-label="' + (i + 1) + '번 빈 슬롯' + (hold ? ', 여기에 꽂기' : '') + '">'
          + '<span class="a-dslot-n a-num">' + (i + 1) + '</span>'
          + (hold ? '<span class="a-dslot-ph">여기에 꽂기</span>' : '')
          + '</button></li>';
      }
    }
    $('deckList').innerHTML = h;
    if (sc) sc.scrollTop = top;
  }
  function renderShelf() {
    /* 덱과 같은 이유로 스크롤 위치를 지킨다: 자료를 들 때마다 innerHTML을 갈아 끼우는데,
       그대로 두면 선반이 맨 위로 튀어 다시 내려가야 했다(2026-11-18 R3). */
    var ssc = $('shelfScroll'), stop = ssc ? ssc.scrollTop : 0;
    var placed = {}, left = [];
    deck[mode].forEach(function (id) { placed[id] = 1; });
    listFor(mode).forEach(function (t) { if (!placed[t.id]) left.push(t); });
    if (!left.length) {
      $('shelfList').innerHTML = '';
      $('shelfEmpty').hidden = false;
    } else {
      $('shelfEmpty').hidden = true;
      $('shelfList').innerHTML = left.map(function (t) {
        var on = hold && hold.from === null && hold.id === t.id;
        return '<li><button type="button" class="a-sc' + (on ? ' a-float' : '') + '" data-id="' + t.id + '"'
          + ' draggable="true" aria-pressed="' + on + '"'
          + ' aria-label="' + esc(t.gi || t.title) + ' 골라서 슬롯에 꽂기">'
          + '<span class="a-sc-n a-num">' + esc(t.no) + '</span>'
          + '<span class="a-sc-in"><b>' + esc(t.gi || t.title) + '</b><small>' + esc(t.title) + '</small></span>'
          + '</button></li>';
      }).join('');
    }
    $('shelfN').textContent = left.length + ' / ' + maxOf(mode);
    if (ssc) ssc.scrollTop = stop;
  }
  function renderHint() {
    var h = $('deckHint');
    h.classList.remove('a-onfloat');
    if (!hold && !view && pre[mode]) {
      h.innerHTML = '<span class="a-hint-tx">프리셋은 <b>내담자 유형·상황만</b> 고릅니다. 이름·연령·연락처는 받지 않고, 꽂은 순서만 이 기기에 저장됩니다.</span>';
      return;
    }
    if (hold) h.innerHTML = hold.from === null
      ? '번호 칸을 눌러 꽂으세요. (들고 있는 자료: <b>' + esc((byId(hold.id) || {}).title || '') + '</b>)'
      : '옮길 칸을 누르세요. 선반으로 빼려면 위 카드에서 「선반으로 빼기」.';
    else if (view) h.innerHTML = '꽂힌 자료를 눌러 미리보기 · 열기 · 자리 옮기기를 고를 수 있습니다.';
    else h.innerHTML = '선반에서 자료를 한 번 눌러 들고, 슬롯을 눌러 꽂으세요. 꽂은 자료를 누르면 미리보기가 열립니다.';
  }
  /* 플로팅 카드: 들고 있는 자료(배치 대기) · 꽂힌 자료(미리보기 + 동작) */
  function renderSheet() {
    var box = $('deckSheet'); if (!box) return;
    var t = hold ? byId(hold.id) : (view ? byId(view.id) : null);
    if (!t) { box.hidden = true; box.innerHTML = ''; box.className = 'a-dsheet'; return; }
    var placedNow = hold ? hold.from : (view ? view.idx : null);
    var meta = (t.meta || []).join(' · ');
    /* 들고 있는 동안은 낮은 띠 하나만 — 덱의 칸을 가리지 않게(칸을 눌러야 하므로) */
    if (hold) {
      box.className = 'a-dsheet a-ds-hold';
      box.innerHTML = '<div class="a-ds-card a-ds-mini" role="group" aria-label="' + esc(t.title) + ' 들고 있음">'
        + '<div class="a-ds-top">'
        + '<span class="a-ds-no a-num">' + esc(t.no) + '</span>'
        + '<span class="a-ds-badge">' + esc(t.badge) + '</span>'
        + '<b class="a-ds-t2">' + esc(t.title) + '</b>'
        + '<span class="a-ds-where">' + (placedNow === null ? '선반에서 듦' : (placedNow + 1) + '번 칸에서 옮기는 중') + '</span>'
        + '</div>'
        + '<div class="a-ds-act">'
        + '<a class="a-ds-b a-ds-pri" href="' + esc(t.path) + '" data-visit="' + esc(t.id) + '">이 자료 열기</a>'
        + '<button type="button" class="a-ds-b" data-act="cancel">들기 취소</button>'
        + '</div>'
        + '</div>';
      box.hidden = false;
      return;
    }
    var acts = '<div class="a-ds-act">'
      + '<a class="a-ds-b a-ds-pri" href="' + esc(t.path) + '" data-visit="' + esc(t.id) + '">이 자료 열기</a>'
      + '<button type="button" class="a-ds-b" data-act="move">자리 옮기기</button></div>'
      + '<div class="a-ds-sub"><button type="button" class="a-ds-out" data-act="out">'
      + (t.mode === mode ? '선반으로 빼기' : (t.mode === 'match' ? '매치 선반으로 빼기' : '시드 선반으로 빼기'))
      + '</button></div>';
    box.className = 'a-dsheet a-ds-view';
    box.innerHTML = '<div class="a-ds-veil" data-act="cancel"></div>'
      + '<div class="a-ds-card" role="dialog" aria-modal="true" aria-label="' + esc(t.title) + ' 미리보기">'
      + '<div class="a-ds-top">'
      + '<span class="a-ds-no a-num">' + esc(t.no) + '</span>'
      + '<span class="a-ds-badge">' + esc(t.badge) + '</span>'
      + '<span class="a-ds-where">' + (placedNow + 1) + '번 칸</span>'
      + '<button type="button" class="a-ds-x" data-act="cancel" aria-label="닫기">&#10005;</button>'
      + '</div>'
      + '<b class="a-ds-t">' + esc(t.title) + '</b>'
      + '<p class="a-ds-d">' + esc(t.desc || t.lead || '') + '</p>'
      + (meta ? '<p class="a-ds-meta">' + esc(meta) + '</p>' : '')
      + acts
      + '</div>';
    box.hidden = false;
  }
  function renderTools() {
    var p = pre[mode] ? presetOf(mode, pre[mode]) : null;
    $('deckTool').innerHTML = '<b class="a-num">' + placedN() + '</b> / ' + maxOf(mode) + '칸 꽂음'
      + (p ? '<button type="button" class="a-dt-x" data-act="unpreset" aria-label="프리셋을 풀고 꽂기 전 배치로 되돌리기">프리셋 풀기</button>' : '');
  }
  /* ---------- 프리셋 진행판: 단계 → 질문 → 확인 ---------- */
  var stepSel = 0;
  function renderFlow() {
    var box = $('preFlow'), p = pre[mode] ? presetOf(mode, pre[mode]) : null;
    if (!box) return;
    var deckEl = $('deckView');
    if (deckEl) deckEl.classList.toggle('a-haspre', !!p);
    if (!p) { box.hidden = true; box.innerHTML = ''; return; }
    var steps = p.steps || [];
    if (stepSel >= steps.length) stepSel = 0;
    var tabs = steps.map(function (s, i) {
      var on = i === stepSel;
      return '<button type="button" role="tab" class="a-flow-t' + (on ? ' a-on' : '') + '" data-step="' + i + '"'
        + ' aria-selected="' + on + '" aria-controls="flowBody" aria-label="' + (i + 1) + '단계 ' + esc(s.k) + '">'
        + '<span class="a-flow-n a-num">' + (i + 1) + '</span><span class="a-flow-k">' + esc(s.k) + '</span></button>';
    }).join('');
    var st = steps[stepSel] || { k: '', q: '', c: '', cards: [] };
    box.hidden = false;
    box.innerHTML = '<div class="a-flow-steps" id="flowSteps" role="tablist" aria-label="상담 진행 단계">' + tabs + '</div>'
      + '<div class="a-flow-body" id="flowBody" role="tabpanel" aria-live="polite">'
      + '<p class="a-flow-q">' + esc(st.q) + '</p>'
      + '<p class="a-flow-c"><b>확인</b>' + esc(st.c) + '</p>'
      + '<p class="a-flow-w"><b>왜 이 순서</b>' + esc(p.why) + '</p>'
      + (p.basis ? '<p class="a-flow-b"><b>이론·현장 근거</b>' + esc(p.basis) + '</p>' : '')
      + '</div>';
  }
  /* 단계를 고르면 그 단계의 첫 카드가 꽂힌 칸으로 덱을 내린다 */
  function jumpStep(i) {
    var p = presetOf(mode, pre[mode]); if (!p) return;
    var s = p.steps[i]; if (!s) return;
    var firstId = (s.cards || []).filter(function (c) { return !!byId(c); })[0];
    if (!firstId) return;
    var idx = deck[mode].indexOf(firstId);
    if (idx < 0) return;
    flash(idx);
  }
  function renderRail() {
    var box = $('preList'); if (!box) return;
    var a = presetList(mode), k = $('preK');
    if (k) k.textContent = mode === 'seed' ? '상황 프리셋' : '유형 프리셋';
    box.innerHTML = a.map(function (p, i) {
      var on = pre[mode] === p.id;
      return '<button type="button" class="a-pre-c' + (on ? ' a-on' : '') + '" data-pre="' + esc(p.id) + '"'
        + ' aria-pressed="' + on + '" aria-label="' + esc(p.k) + ' — ' + esc(p.w) + ' (프리셋으로 꽂기)">'
        + '<span class="a-pre-n a-num">' + ('0' + (i + 1)).slice(-2) + '</span>'
        + '<span class="a-pre-t">' + esc(p.k) + '</span>'
        + '<span class="a-pre-s">' + p.steps.length + '단계</span>'
        + '</button>';
    }).join('');
  }
  function render() { renderRail(); renderFlow(); renderDeck(); renderShelf(); renderHint(); renderTools(); renderSheet(); }

  function flash(i) {
    var li = $('deckList').querySelector('[data-i="' + i + '"]');
    if (!li) return;
    li.classList.add('a-new');
    setTimeout(function () { li.classList.remove('a-new'); }, 460);
    var sc = $('deckScroll'); if (!sc) return;
    /* 2026-11-19: offsetTop은 스크롤 상자가 아닌 **위치가 잡힌 조상**을 기준으로 재어져,
       4번째 칸부터 스크롤이 어긋나 칸 위쪽이 잘려 보였다. 두 상자의 화면 좌표 차이로
       스크롤 상자 안에서의 자리를 재고, 위·아래 여유(pad)까지 넣어 칸이 통째로 보이게 한다. */
    var pad = 12, box = sc.getBoundingClientRect(), r = li.getBoundingClientRect();
    var top = r.top - box.top + sc.scrollTop, bot = top + r.height;
    if (top - pad < sc.scrollTop) sc.scrollTop = Math.max(0, top - pad);        /* 위가 잘리면 내린다 */
    else if (bot + pad > sc.scrollTop + sc.clientHeight) sc.scrollTop = bot + pad - sc.clientHeight;
  }

  /* ---------- 꽂기·빼기 ---------- */
  function insert(id, idx) {
    var arr = deck[mode], max = maxOf(mode);
    if (idx === undefined || idx === null || idx < 0 || idx >= max) return false;
    if (arr[idx] === id) return true;
    var at = arr.indexOf(id);           /* 다른 칸에 있던 같은 자료는 빼고 옮긴다 */
    if (at >= 0) arr[at] = null;
    arr[idx] = id;
    unmark();
    save(); return true;
  }
  function drop(i) { if (i < 0 || i >= deck[mode].length) return false; deck[mode][i] = null; unmark(); save(); return true; }
  function placedN() { var n = 0; deck[mode].forEach(function (x) { if (x) n++; }); return n; }

  /* ---------- 붙이기 ---------- */
  function bind() {
    if (built) return; built = true;

    $('deckList').addEventListener('click', function (e) {
      if (suppress) { suppress = false; return; }
      var b = e.target.closest('[data-dslot]'); if (!b) return;
      var i = +b.getAttribute('data-dslot'), arr = deck[mode];
      if (hold) {                                   /* 들고 있으면: 누른 자리에 꽂는다 */
        if (hold.from === i) { hold = null; render(); return; }
        var id = hold.id;
        if (insert(id, i)) { hold = null; view = null; render(); flash(i); }
        return;
      }
      if (arr[i]) { view = { id: arr[i], idx: i }; render(); }   /* 꽂힌 자료: 고정하고 미리보기 */
    });

    $('shelfList').addEventListener('click', function (e) {
      if (suppressShelf) { suppressShelf = false; return; }   /* 끌어서 넘긴 뒤의 클릭은 삼킨다 */
      var b = e.target.closest('[data-id]'); if (!b) return;
      var id = b.getAttribute('data-id');
      if (hold && hold.from === null && hold.id === id) { hold = null; render(); return; }
      hold = { id: id, from: null }; view = null; render();
    });

    /* PC 끌어다 놓기 */
    $('shelfList').addEventListener('dragstart', function (e) {
      /* 세로로 끌던 중이면 스크롤이다 — 카드 끌기(슬롯으로 놓기)는 가로로 끌 때만 */
      if (shelfDrag && shelfDrag.moved) { e.preventDefault(); return; }
      shelfDrag = null;
      var b = e.target.closest('[data-id]'); if (!b) { e.preventDefault(); return; }
      try { e.dataTransfer.setData('text/plain', b.getAttribute('data-id')); e.dataTransfer.effectAllowed = 'copy'; } catch (x) { }
      hold = { id: b.getAttribute('data-id'), from: null }; view = null; render();
    });
    $('deckList').addEventListener('dragover', function (e) {
      var s = e.target.closest('.a-dslot'); if (!s) return;
      e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) { }
      s.classList.add('a-over');
    });
    $('deckList').addEventListener('dragleave', function (e) {
      var s = e.target.closest('.a-dslot'); if (s) s.classList.remove('a-over');
    });
    $('deckList').addEventListener('drop', function (e) {
      var s = e.target.closest('.a-dslot'); if (!s) return;
      e.preventDefault(); s.classList.remove('a-over');
      var id = hold && hold.id; try { id = e.dataTransfer.getData('text/plain') || id; } catch (x) { }
      if (!id) return;
      var i = +s.getAttribute('data-i');
      if (insert(id, i)) { hold = null; view = null; render(); flash(i); }
    });

    /* PC: 클릭 앤 드래그로 덱 상하 이동(휠은 브라우저 기본) */
    var sc = $('deckScroll');
    sc.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { y: e.clientY, top: sc.scrollTop, moved: false };
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) < 6) return;
      drag.moved = true; sc.classList.add('a-drag');
      sc.scrollTop = drag.top - dy;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointerup', function () {
      if (!drag) return;
      if (drag.moved) { suppress = true; setTimeout(function () { suppress = false; }, 0); }
      sc.classList.remove('a-drag'); drag = null;
    });
    window.addEventListener('pointercancel', function () { if (drag) { sc.classList.remove('a-drag'); drag = null; } });

    /* PC: 자료 선반도 클릭 앤 드래그로 넘긴다(세로). 카드를 슬롯으로 끌어다 놓는 기본 끌기와
       겹치지 않게, 세로로 먼저 움직이면(4px 이상, 가로보다 클 때) 스크롤로 보고 dragstart를 취소한다.
       가로로 끌면 예전처럼 카드가 슬롯으로 따라온다. 휠·터치 스크롤은 브라우저 기본 그대로. */
    var ssc = $('shelfScroll');
    if (ssc) {
      ssc.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        shelfDrag = { y: e.clientY, x: e.clientX, top: ssc.scrollTop, moved: false };
      });
      window.addEventListener('pointermove', function (e) {
        if (!shelfDrag) return;
        var dy = e.clientY - shelfDrag.y, dx = e.clientX - shelfDrag.x;
        if (!shelfDrag.moved) {
          if (Math.abs(dy) < 4) return;
          if (Math.abs(dy) <= Math.abs(dx)) { shelfDrag = null; return; }   /* 가로 = 카드 끌기 */
          shelfDrag.moved = true; ssc.classList.add('a-drag');
        }
        ssc.scrollTop = shelfDrag.top - dy;
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      window.addEventListener('pointerup', function () {
        if (!shelfDrag) return;
        if (shelfDrag.moved) { suppressShelf = true; setTimeout(function () { suppressShelf = false; }, 0); }
        ssc.classList.remove('a-drag'); shelfDrag = null;
      });
      window.addEventListener('pointercancel', function () {
        if (shelfDrag) { ssc.classList.remove('a-drag'); shelfDrag = null; }
      });
    }

    /* 플로팅 카드 동작 */
    var sheet = $('deckSheet');
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) {
        var act = b.getAttribute('data-act');
        if (act === 'cancel') { hold = null; view = null; render(); return; }
        if (act === 'move' && view) { hold = { id: view.id, from: view.idx }; view = null; render(); return; }
        if (act === 'out' && view) { drop(view.idx); view = null; render(); return; }
      }
      /* 카드 안쪽(설명·여백)을 누르면 닫지 않는다 — 바깥(베일)만 닫기 */
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (tutOpen) return;
        if (view || hold) { e.preventDefault(); hold = null; view = null; render(); }
      }
    });

    /* 프리셋 칩 · 단계 · 풀기 */
    var rail = $('preList');
    if (rail) rail.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pre]'); if (!b) return;
      applyPreset(b.getAttribute('data-pre'));
    });
    var tabs = $('preFlow');
    if (tabs) tabs.addEventListener('click', function (e) {
      var u = e.target.closest('[data-act="unpreset"]');
      if (u) { clearPreset(); return; }
      var b = e.target.closest('[data-step]'); if (!b) return;
      stepSel = +b.getAttribute('data-step');
      renderFlow();
      var row = $('flowSteps'), on = row ? row.querySelector('.a-flow-t.a-on') : null;
      if (row && on) row.scrollLeft = Math.max(0, on.offsetLeft - 6);   /* 넘친 단계를 골라도 그 탭이 보이게 */
      jumpStep(stepSel);
    });
    /* 단계 탭은 방향키로도 오간다(role=tab) */
    if (tabs) tabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var cur = e.target.closest('[data-step]'); if (!cur) return;
      var p = presetOf(mode, pre[mode]); if (!p) return;
      e.preventDefault();
      stepSel = (stepSel + (e.key === 'ArrowRight' ? 1 : -1) + p.steps.length) % p.steps.length;
      renderFlow();
      var row = $('flowSteps'), on = row ? row.querySelector('.a-flow-t.a-on') : null;
      if (row && on) { row.scrollLeft = Math.max(0, on.offsetLeft - 6); try { on.focus({ preventScroll: true }); } catch (x) { } }
      jumpStep(stepSel);
    });
    var hint = $('deckHint');
    if (hint) hint.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="unpreset"]'); if (!b) return;
      clearPreset();
    });
    var tools = $('deckTool');
    if (tools) tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="unpreset"]'); if (!b) return;
      clearPreset();
    });


    /* MAIN · 튜토리얼 */
    $('mainBtn').addEventListener('click', function () {
      hold = null; view = null;
      if (window.JC_NAV && window.JC_NAV.applyMode) window.JC_NAV.applyMode('all');
    });
    $('tutBtn').addEventListener('click', openTut);
    $('tutX').addEventListener('click', closeTut);
    $('tutPrev').addEventListener('click', function () { goTut(tutStep - 1); });
    $('tutNext').addEventListener('click', function () {
      if (tutStep >= TUT.length - 1) { closeTut(); return; }
      goTut(tutStep + 1);
    });
    $('tuts').addEventListener('click', function (e) { if (e.target === $('tuts')) closeTut(); });
    document.addEventListener('keydown', function (e) {
      if (!tutOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); closeTut(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (tutStep < TUT.length - 1) goTut(tutStep + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (tutStep > 0) goTut(tutStep - 1); }
    });
    window.addEventListener('resize', function () { if (tutOpen) fitTut(); });
  }

  /* ---------- 튜토리얼 ---------- */
  var TUT = [
    {
      t: '선반에서 자료를 듭니다',
      p: '오른쪽(휴대폰은 아래) <b>자료 선반</b>에는 이 모드의 자료가 놓여 있습니다. 꽂고 싶은 카드를 한 번 누르면 살짝 떠오르고 아래에 <b>미리보기 카드</b>가 열립니다.',
      f: '<div class="r hi"><span class="n">01</span><span class="w">직업상담 이론 위키</span><em>들었습니다</em></div>'
        + '<div class="r"><span class="n">03</span><span class="w">DACUM 마스터 아키텍처</span></div>'
        + '<div class="r"><span class="n">04</span><span class="w">구직자취업촉진법 실무 가이드</span></div>'
    },
    {
      t: '슬롯에 꽂습니다',
      p: '<b>번호가 적힌 칸</b>을 누르면 그 자리에 꽂힙니다. 들고 있는 동안 빈 칸에 「여기에 꽂기」가 뜹니다. 컴퓨터에서는 선반 카드를 슬롯까지 <b>끌어다 놓아도</b> 됩니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">직업상담 이론 위키</span></div>'
        + '<div class="r hi"><span class="n">2</span><span class="w">↓ 여기에 꽂힙니다</span></div>'
        + '<div class="r"><span class="n">3</span><span class="w"></span></div>'
    },
    {
      t: '꽂힌 자료는 그대로 있습니다',
      p: '꽂힌 카드를 누르면 <b>플로팅 카드</b>가 떠서 <b>이 자료 열기</b> · <b>자리 옮기기</b> · <b>선반으로 빼기</b>를 고를 수 있습니다. 누른다고 선반으로 빠지지 않습니다. 카드 바깥이나 <b>×</b>를 누르면 닫힙니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">다시 읽는 『직업의 선택』</span></div>'
        + '<div class="r hi"><span class="n">2</span><span class="w">직업상담 이론 위키 · 고정</span><em>3번 칸</em></div>'
        + '<div class="r"><span class="n">3</span><span class="w">DACUM 마스터 아키텍처</span></div>'
    },
    {
      t: '칸은 처음부터 전부 열려 있습니다',
      p: '이 모드의 칸 <b>{N}개</b>가 처음부터 다 있습니다. 화면에는 다섯 칸쯤 보이니, 슬롯을 위아래로 끌어(휴대폰은 손가락으로 밀어) <b>빈 칸</b>을 찾아 꽂으세요. 꽂은 순서는 이 기기에 <b>저장</b>되고, <b>MAIN</b>을 누르면 원래 대문으로 돌아갑니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">직업상담 이론 위키</span></div>'
        + '<div class="r"><span class="n">2</span><span class="w">다시 읽는 『직업의 선택』</span></div>'
        + '<div class="r hi"><span class="n">3</span><span class="w">다음 빈 칸이 여기에</span><em>자동</em></div>'
    },
    {
      t: '프리셋으로 한 번에 꽂습니다',
      p: '손으로 하나씩 꽂는 대신, 덱 위 <b>상황 프리셋</b>(매치는 <b>유형 프리셋</b>) 줄에서 상담 상황 하나를 누르면 그 순서대로 자료가 <b>한 번에</b> 꽂히고, 아래에 <b>단계 → 질문 → 확인</b> 진행판이 열립니다. 손으로 칸을 바꾸면 프리셋 표시만 조용히 풀리고, <b>프리셋 풀기</b>를 누르면 꽂기 전 배치로 돌아갑니다.',
      f: '<div class="r hi"><span class="n">01</span><span class="w">오늘 고용·산업 동향</span><em>3단계 · 꽂힘</em></div>'
        + '<div class="r"><span class="n">02</span><span class="w">법령·수당·자격 팩트체크</span><em>4단계</em></div>'
        + '<div class="r"><span class="n">03</span><span class="w">이론·검사 발문 점검</span><em>4단계</em></div>'
    }
  ];
  function fitTut() {
    /* 단계마다 높이가 달라도 팝업 틀이 움직이지 않게: 가장 긴 단계를 재어 본문 최소 높이로 고정 */
    var bd = $('tutsBd'), keep = bd.innerHTML, h = 0;
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px;top:0;width:' + bd.clientWidth + 'px;';
    document.body.appendChild(box);
    TUT.forEach(function (s) { box.innerHTML = tutHtml(s, 0); h = Math.max(h, box.offsetHeight); });
    document.body.removeChild(box);
    bd.style.minHeight = h + 'px';
    bd.innerHTML = keep;
  }
  function tutHtml(s, i) {
    return '<div class="a-tuts-step"><i>' + (i + 1) + '</i>나만의 목차 꽂는 법 ' + (i + 1) + ' / ' + TUT.length + '</div>'
      + '<h3 class="a-tuts-t">' + s.t + '</h3>'
      + '<p class="a-tuts-p">' + String(s.p).replace(/\{N\}/g, maxOf(mode)) + '</p>'
      + '<div class="a-tuts-fig">' + s.f + '</div>';
  }
  function goTut(i) {
    tutStep = Math.max(0, Math.min(TUT.length - 1, i));
    var bd = $('tutsBd');
    bd.innerHTML = tutHtml(TUT[tutStep], tutStep);
    bd.scrollTop = 0;
    bd.classList.toggle('cut', bd.scrollHeight > bd.clientHeight + 4);
    $('tutDots').innerHTML = TUT.map(function (_, k) { return '<span class="' + (k === tutStep ? 'on' : '') + '"></span>'; }).join('');
    $('tutPrev').disabled = tutStep === 0;
    $('tutNext').textContent = tutStep === TUT.length - 1 ? '알겠습니다' : '다음';
  }
  function openTut() {
    tutOpen = true;
    $('tuts').classList.add('on');
    $('tuts').removeAttribute('aria-hidden');
    goTut(0); fitTut(); goTut(0);
    try { $('tutX').focus({ preventScroll: true }); } catch (e) { }
    document.documentElement.style.overflow = 'hidden';
  }
  function closeTut() {
    tutOpen = false;
    $('tuts').classList.remove('on');
    $('tuts').setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    try { $('tutBtn').focus({ preventScroll: true }); } catch (e) { }
  }

  /* ---------- 보이기/숨기기 ---------- */
  function show(m) {
    var was = mode;
    mode = (m === 'seed' || m === 'match') ? m : 'all';
    if (mode === 'all') { hide(); return; }
    bind();
    if (was !== mode) { hold = null; view = null; prev[mode] = null; }
    deck[mode] = read(mode);
    pre[mode] = readPre(mode);
    if (pre[mode] && !deckFitsPreset(mode, pre[mode])) pre[mode] = '';   /* 배치가 바뀌었으면 표시를 지운다 */
    if (hold) { var hi = deck[mode].indexOf(hold.id); hold = hi >= 0 ? { id: hold.id, from: hi } : null; }
    if (view) { var vi = deck[mode].indexOf(view.id); view = vi >= 0 ? { id: view.id, idx: vi } : null; }
    var inf = INFO[mode];
    $('deckView').hidden = false;
    $('deckView').className = 'a-deck a-deck-' + mode;
    $('deckK').textContent = inf.k;
    $('deckEn').textContent = inf.en;
    $('deckSub').textContent = inf.sub;
    render();
  }
  function hide() {
    $('deckView').hidden = true; hold = null; view = null;
    var s = $('deckSheet'); if (s) { s.hidden = true; s.innerHTML = ''; }
    if (tutOpen) closeTut();
  }

  window.JCDECK = {
    show: show, hide: hide,
    preset: function (id) { return applyPreset(id); },
    unpreset: function () { clearPreset(); },
    presetNow: function () { return pre[mode] || ''; },
    count: function (m) { return (m === 'seed' || m === 'match') ? maxOf(m) : 0; },
    placed: function (m) {
      if (m !== 'seed' && m !== 'match') return 0;
      var n = 0; read(m).forEach(function (x) { if (x) n++; }); return n;
    }
  };
})();
