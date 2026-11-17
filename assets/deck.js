/* deck.js — 시드(11)·매치(12) 재구성 화면: 세로 슬롯 덱 (2026-11-17)
 *
 * 「내 목차」를 직접 꽂는 화면. 왼쪽(휴대폰은 위)은 1번부터 내려가는 세로 슬롯, 오른쪽(휴대폰은 아래)은 자료 선반.
 *   빈 칸은 처음 5개(연한 번호만) → 꽂을 때마다 다음 번호 칸이 아래로 하나씩 늘어난다(그 모드 최대 개수까지).
 *   PC: 선반 카드를 슬롯으로 끌어다 놓기 / 1클릭(뜸) → 슬롯 1클릭.  휴대폰: 1탭(뜸) → 슬롯 1탭.
 *   꽂힌 카드를 누르면 다시 떠올라 그 자리에서 옮기거나 선반으로 돌려보낼 수 있다(연결리스트처럼 당겨진다).
 *   배치는 모드별로 이 기기에 저장한다(jc-deck-seed · jc-deck-match).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var EMPTY_HEAD = 0;               /* 칸은 모드 전체를 미리 만든다(빈 칸 = 연한 번호만) */
  var KEY = { seed: 'jc-deck-seed', match: 'jc-deck-match' };
  var INFO = {
    seed: { k: '시드', en: 'SEED', sub: '지식·원리·기준 쌓기' },
    match: { k: '매치', en: 'MATCH', sub: '현장·실무 쓰기' }
  };
  var deck = { seed: [], match: [] };   /* 칸 수만큼의 배열. 빈 칸은 null */
  var mode = 'all', floatId = null, floatFrom = null, tools = null, built = false;
  var drag = null, suppress = false, tutStep = 0, tutOpen = false;

  /* ---------- 장부 ---------- */
  function all() { return window.JC_TOOLS || []; }
  function listFor(m) {
    return all().filter(function (t) { return t.mode === m; })
      .sort(function (a, b) { return (a.mo || 99) - (b.mo || 99); });
  }
  function byId(id) { var a = all(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function maxOf(m) { return listFor(m).length; }
  /* 칸은 처음부터 전부 있고, 배치는 「몇 번 칸에 무엇」이다(빈 칸 null). 모드별로 따로 저장한다. */
  function valid(m, arr) {
    var ids = {}, out = [], max = maxOf(m);
    listFor(m).forEach(function (t) { ids[t.id] = 1; });
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

  /* ---------- 그리기 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slotCount() { return maxOf(mode); }   /* seed 11칸 · match 12칸을 처음부터 전부 만든다 */
  function renderDeck() {
    var arr = deck[mode], n = slotCount(), h = "";
    for (var i = 0; i < n; i++) {
      var t = arr[i] ? byId(arr[i]) : null;
      if (t) {
        h += '<li class="a-dslot a-on a-' + t.color + '" data-i="' + i + '">'
          + '<button type="button" class="a-dslot-b" data-dslot="' + i + '" aria-label="' + (i + 1) + '번, ' + esc(t.gi || t.title) + '. 눌러서 옮기기">'
          + '<span class="a-dslot-n a-num">' + (i + 1) + '</span>'
          + '<span class="a-dslot-t"><b>' + esc(t.gi || t.title) + '</b><small>' + esc(t.title) + '</small></span>'
          + '<span class="a-dslot-tag">' + esc(t.badge) + '</span>'
          + '</button></li>';
      } else {
        h += '<li class="a-dslot a-dslot-empty" data-i="' + i + '">'
          + '<button type="button" class="a-dslot-b" data-dslot="' + i + '" aria-label="' + (i + 1) + '번 빈 슬롯">'
          + '<span class="a-dslot-n a-num">' + (i + 1) + '</span>'
          + '</button></li>';
      }
    }
    $('deckList').innerHTML = h;
  }
  function renderShelf() {
    var placed = {}, left = [];
    deck[mode].forEach(function (id) { placed[id] = 1; });
    listFor(mode).forEach(function (t) { if (!placed[t.id]) left.push(t); });
    if (!left.length) {
      $('shelfList').innerHTML = '';
      $('shelfEmpty').hidden = false;
    } else {
      $('shelfEmpty').hidden = true;
      $('shelfList').innerHTML = left.map(function (t) {
        return '<li><button type="button" class="a-sc' + (floatId === t.id ? ' a-float' : '') + '" data-id="' + t.id + '"'
          + ' draggable="true" aria-pressed="' + (floatId === t.id) + '"'
          + ' aria-label="' + esc(t.gi || t.title) + ' 골라서 슬롯에 꽂기">'
          + '<span class="a-sc-n a-num">' + esc(t.no) + '</span>'
          + '<span class="a-sc-in"><b>' + esc(t.gi || t.title) + '</b><small>' + esc(t.title) + '</small></span>'
          + '</button></li>';
      }).join('');
    }
    $('shelfN').textContent = left.length + ' / ' + maxOf(mode);
  }
  function renderHint() {
    var h = $('deckHint');
    if (floatId) {
      var t = byId(floatId);
      h.innerHTML = '<div class="a-float">'
        + '<a class="a-float-go" href="' + esc(t.path) + '" data-visit="' + esc(t.id) + '" aria-label="' + esc(t.gi || t.title) + ' 열기">'
        + '<span class="a-float-n a-num">' + esc(t.no) + '</span>'
        + '<span class="a-float-in"><b>' + esc(t.gi || t.title) + '</b><span class="a-float-d">' + esc(t.lead || t.desc) + '</span></span>'
        + '<span class="a-float-o">열기</span></a>'
        + '<button type="button" class="a-float-x" data-float-x="1" aria-label="미리보기 닫고 원래 자리로">&#10005;</button>'
        + '</div>';
      h.classList.add('a-onfloat');
    } else {
      h.innerHTML = '선반에서 자료를 한 번 눌러 들고, 슬롯을 눌러 꽂으세요.';
      h.classList.remove('a-onfloat');
    }
  }
  function closeFloat(restore) {
    if (!floatId) return;
    if (restore && floatFrom !== null && floatFrom !== undefined) {
      deck[mode][floatFrom] = floatId; save();
    }
    floatId = null; floatFrom = null; render();
  }
  function renderTools() {
    $('deckTool').innerHTML = '<b class="a-num">' + placedN() + '</b> / ' + maxOf(mode) + '칸 꽂음';
  }
  function render() { renderDeck(); renderShelf(); renderHint(); renderTools(); }

  function flash(i) {
    var li = $('deckList').querySelector('[data-i="' + i + '"]');
    if (!li) return;
    li.classList.add('a-new');
    setTimeout(function () { li.classList.remove('a-new'); }, 460);
    if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 꽂기·빼기 ---------- */
  function setFloat(id) { floatId = id; render(); }
  function insert(id, idx) {
    var arr = deck[mode], max = maxOf(mode);
    if (idx === undefined || idx === null || idx < 0 || idx >= max) return false;
    if (arr[idx] === id) return true;
    var at = arr.indexOf(id);           /* 다른 칸에 있던 같은 자료는 빼고 옮긴다 */
    if (at >= 0) arr[at] = null;
    arr[idx] = id;
    save(); return true;
  }
  function drop(i) { if (i < 0 || i >= deck[mode].length) return false; deck[mode][i] = null; save(); return true; }
  function placedN() { var n = 0; deck[mode].forEach(function (x) { if (x) n++; }); return n; }

  /* ---------- 붙이기 ---------- */
  function bind() {
    if (built) return; built = true;

    $('deckList').addEventListener('click', function (e) {
      if (suppress) { suppress = false; return; }
      var b = e.target.closest('[data-dslot]'); if (!b) return;
      var i = +b.getAttribute('data-dslot'), arr = deck[mode];
      if (floatId) {
        var id = floatId;
        if (insert(id, i)) { floatId = null; floatFrom = null; render(); flash(i); }
        else { closeFloat(true); }
        return;
      }
      if (arr[i]) { closeFloat(true); floatId = arr[i]; floatFrom = i; drop(i); render(); }
    });

    $('shelfList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      var id = b.getAttribute('data-id');
      if (floatId === id) { closeFloat(true); return; }
      closeFloat(true);
      floatId = id; floatFrom = null; render();
      if ($('deckScroll')) $('deckScroll').scrollTop = Math.min($('deckScroll').scrollTop, 20);
    });

    /* PC 끌어다 놓기 */
    $('shelfList').addEventListener('dragstart', function (e) {
      var b = e.target.closest('[data-id]'); if (!b) { e.preventDefault(); return; }
      try { e.dataTransfer.setData('text/plain', b.getAttribute('data-id')); e.dataTransfer.effectAllowed = 'copy'; } catch (x) { }
      closeFloat(true); floatId = b.getAttribute('data-id'); floatFrom = null; render();
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
      var id = floatId; try { id = e.dataTransfer.getData('text/plain') || id; } catch (x) { }
      if (!id) return;
      var i = +s.getAttribute('data-i');
      if (insert(id, i)) { floatId = null; floatFrom = null; render(); flash(i); }
      else { closeFloat(true); }
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

    /* 미리보기 안(설명·열기)은 자료로 이동, ×나 바깥을 누르면 원래 자리로 되돌린다 */
    $('deckView').addEventListener('click', function (e) {
      if (!floatId) return;
      if (e.target.closest('.a-float')) {
        if (e.target.closest('[data-float-x]')) closeFloat(true);
        return;
      }
      if (e.target.closest('[data-dslot],[data-id]')) return;
      if (e.target.closest('#tutBtn,#mainBtn,.a-tut,.a-main')) return;
      closeFloat(true);
    });

    /* MAIN · 튜토리얼 */
    $('mainBtn').addEventListener('click', function () {
      closeFloat(true);
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
      p: '오른쪽(휴대폰은 아래) <b>자료 선반</b>에는 이 모드의 자료가 놓여 있습니다. 꽂고 싶은 카드를 한 번 누르면 살짝 떠오릅니다.',
      f: '<div class="r hi"><span class="n">01</span><span class="w">직업상담 이론 위키</span><em>들었습니다</em></div>'
        + '<div class="r"><span class="n">02</span><span class="w">다시 읽는 『직업의 선택』</span></div>'
        + '<div class="r"><span class="n">03</span><span class="w">DACUM 마스터 아키텍처</span></div>'
    },
    {
      t: '슬롯에 꽂습니다',
      p: '<b>번호가 적힌 빈 칸</b>을 누르면 그 자리에 꽂힙니다. 컴퓨터에서는 선반 카드를 슬롯까지 <b>끌어다 놓아도</b> 됩니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">직업상담 이론 위키</span></div>'
        + '<div class="r hi"><span class="n">2</span><span class="w">↓ 여기에 꽂힙니다</span></div>'
        + '<div class="r"><span class="n">3</span><span class="w"></span></div>'
    },
    {
      t: '옮기기 · 빼기',
      p: '꽂힌 카드를 누르면 다시 떠오릅니다. 다른 번호를 누르면 <b>그 자리로 옮겨</b> 꽂히고, 미리보기의 <b>×</b>나 바깥을 누르면 <b>원래 자리로</b> 돌아갑니다. 미리보기의 설명이나 <b>열기</b>를 누르면 그 자료가 바로 열립니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">다시 읽는 『직업의 선택』</span></div>'
        + '<div class="r hi"><span class="n">2</span><span class="w">직업상담 이론 위키 · 떠 있음</span><em>옮기는 중</em></div>'
        + '<div class="r"><span class="n">3</span><span class="w">DACUM 마스터 아키텍처</span></div>'
    },
    {
      t: '칸은 처음부터 전부 열려 있습니다',
      p: '이 모드의 칸 <b>{N}개</b>가 처음부터 다 있습니다. 화면에는 다섯 칸쯤 보이니, 슬롯을 위아래로 끌어(휴대폰은 손가락으로 밀어) <b>빈 칸</b>을 찾아 꽂으세요. 꽂은 순서는 이 기기에 <b>저장</b>되고, <b>MAIN</b>을 누르면 원래 대문으로 돌아갑니다.',
      f: '<div class="r"><span class="n">1</span><span class="w">직업상담 이론 위키</span></div>'
        + '<div class="r"><span class="n">2</span><span class="w">다시 읽는 『직업의 선택』</span></div>'
        + '<div class="r hi"><span class="n">3</span><span class="w">다음 빈 칸이 여기에</span><em>자동</em></div>'
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
    var prev = mode;
    mode = (m === 'seed' || m === 'match') ? m : 'all';
    if (mode === 'all') { hide(); return; }
    bind();
    if (prev === mode && floatId && floatFrom !== null) { /* 같은 화면 다시 그리기: 뜬 카드는 그대로 */ }
    else { floatId = null; floatFrom = null; }
    deck[mode] = read(mode);
    if (floatId) { var fi = deck[mode].indexOf(floatId); floatFrom = null; if (fi >= 0) { deck[mode][fi] = null; floatFrom = fi; } }
    var inf = INFO[mode];
    $('deckView').hidden = false;
    $('deckView').className = 'a-deck a-deck-' + mode;
    $('deckK').textContent = inf.k;
    $('deckEn').textContent = inf.en;
    $('deckSub').textContent = inf.sub;
    render();
  }
  function hide() { $('deckView').hidden = true; floatId = null; floatFrom = null; if (tutOpen) closeTut(); }

  window.JCDECK = {
    show: show, hide: hide,
    count: function (m) { return (m === 'seed' || m === 'match') ? maxOf(m) : 0; },
    placed: function (m) {
      if (m !== 'seed' && m !== 'match') return 0;
      var n = 0; read(m).forEach(function (x) { if (x) n++; }); return n;
    }
  };
})();
