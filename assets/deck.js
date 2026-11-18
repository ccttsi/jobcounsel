/* deck.js — 시드(11)·매치(12) 재구성 화면: 세로 슬롯 덱 (2026-11-17, 2026-11-18 CP3 개정)
 *
 * 「내 목차」를 직접 꽂는 화면. 왼쪽(휴대폰은 위)은 1번부터 내려가는 세로 슬롯, 오른쪽(휴대폰은 아래)은 자료 선반.
 *   PC: 선반 카드를 슬롯으로 끌어다 놓기 / 1클릭(들기) → 슬롯 1클릭.  휴대폰: 1탭(들기) → 슬롯 1탭.
 *   2026-11-18: 꽂힌 자료는 누른다고 선반으로 빠지지 않는다(고정). 누르면 플로팅 카드가 떠서
 *   「이 자료 열기 · 자리 옮기기 · 선반으로 빼기」를 고른다. 선반 자료 클릭 = 들고 배치 대기, 꽂힌 자료 클릭 = 미리보기.
 *   배치는 모드별로 이 기기에 저장한다(jc-deck-seed · jc-deck-match).
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
      + '<div class="a-ds-sub"><button type="button" class="a-ds-out" data-act="out">선반으로 빼기</button></div>';
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
    $('deckTool').innerHTML = '<b class="a-num">' + placedN() + '</b> / ' + maxOf(mode) + '칸 꽂음';
  }
  function render() { renderDeck(); renderShelf(); renderHint(); renderTools(); renderSheet(); }

  function flash(i) {
    var li = $('deckList').querySelector('[data-i="' + i + '"]');
    if (!li) return;
    li.classList.add('a-new');
    setTimeout(function () { li.classList.remove('a-new'); }, 460);
    var sc = $('deckScroll'); if (!sc) return;
    var top = li.offsetTop, bot = top + li.offsetHeight;
    if (top < sc.scrollTop || bot > sc.scrollTop + sc.clientHeight) {
      sc.scrollTop = Math.max(0, top - 12);   /* 칸 안에서만 움직인다(페이지가 튀지 않게) */
    }
  }

  /* ---------- 꽂기·빼기 ---------- */
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
    if (prev !== mode) { hold = null; view = null; }
    deck[mode] = read(mode);
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
    count: function (m) { return (m === 'seed' || m === 'match') ? maxOf(m) : 0; },
    placed: function (m) {
      if (m !== 'seed' && m !== 'match') return 0;
      var n = 0; read(m).forEach(function (x) { if (x) n++; }); return n;
    }
  };
})();
