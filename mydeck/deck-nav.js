/* deck-nav.js — 덱 안을 자유롭게 오가는 이동 막대 (2026-11-20)
 *
 * 왜
 *   덱은 순서대로만 보는 물건이 아니다. 5개로 짠 덱이면 1→2→3→4→5로 걷기도 하지만,
 *   1→5→3→4→2처럼 아무 데나 건너뛰며 봐야 한다(상담 중에 4단계 근거를 다시 확인하고 2단계로 돌아오는 식).
 *   그래서 덱을 쓰는 모든 자리(마이덱 라이브 보드 · 리허설)에 **한 줄짜리 단계 레일 + 이전/다음**을 둔다.
 *
 * 보이는 것
 *   덱 안 순서(1, 2, 3, 4, 5) + 자료 제목만. 내부 자료 번호(17번 같은 것)는 쓰지 않는다.
 *   상자·테두리 없이 활자와 1px 헤어라인만 — 지금 단계만 액센트 밑줄로 선다.
 *   레일은 한 번 누르면 그 단계로 곧장 가고(랜덤워크), 옆의 ‹ ›는 앞뒤로 한 칸씩 간다.
 *
 * 넘겨주는 것 (window.JCDeckNav)
 *   make(deck, index, onPick)  — 막대 요소를 만들어 준다(누르면 onPick(i))
 *   context(deck, index)       — 지금 덱과 자리를 sessionStorage('jc_active_deck')에 적어 둔다.
 *                                자료 화면으로 넘어간 뒤 (앞으로 붙을) 미니 덱 스위처가 이 값을 읽어
 *                                다른 자료로 바로 건너뛸 수 있게 하는 핸드오프다.
 *   clear()                    — 덱을 떠날 때 지운다.
 *   key(el, count, get, set)   — ←/→ 키로 앞뒤 이동(입력 중에는 듣지 않는다)
 *   swipe(el, prev, next)      — 좌우로 밀어 이동(48px 넘게)
 */
(function () {
  'use strict';
  if (window.JCDeckNav) return;

  var KEY = 'jc_active_deck';

  function store() { try { return window.sessionStorage; } catch (e) { return null; } }

  function stepsOf(deck) {
    return ((deck && deck.steps) || []).map(function (s) {
      return { id: String(s.id || ''), title: String(s.title || s.id || ''), badge: String(s.badge || '') };
    });
  }

  function context(deck, index) {
    var ss = store();
    if (!ss || !deck || !deck.steps || !deck.steps.length) return;
    var i = Math.max(0, Math.min(deck.steps.length - 1, Number(index) || 0));
    var o = {
      v: 1, id: String(deck.id || ''), name: String(deck.name || ''), where: String(deck.where || ''),
      steps: stepsOf(deck), index: i, at: Date.now()
    };
    try { ss.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  function clear() { var ss = store(); try { if (ss) ss.removeItem(KEY); } catch (e) {} }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';

  /* 막대 — 덱의 모든 단계를 한 줄에. tight면 시트 안에서 쓴다. */
  function make(deck, index, onPick, tight) {
    var steps = (deck && deck.steps) || [];
    var i = Math.max(0, Math.min(Math.max(0, steps.length - 1), Number(index) || 0));
    var bar = el('div', 'dk' + (tight ? ' sheet-dk' : ''));
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', '덱 단계 이동 — 눌러서 어느 단계로든 건너뛰기');

    var rail = el('div', 'dk-rail');
    var btns = [];
    steps.forEach(function (st, k) {
      var b = el('button', 'dk-step');
      b.type = 'button';
      b.setAttribute('aria-selected', String(k === i));
      b.setAttribute('aria-current', String(k === i));
      b.setAttribute('aria-label', (k + 1) + '단계 ' + (st.title || st.id));
      b.appendChild(el('span', 'n', String(k + 1)));
      b.appendChild(el('span', 't', st.title || st.id));
      b.addEventListener('click', function () { onPick(k); });
      btns.push(b);
      rail.appendChild(b);
    });
    bar.appendChild(rail);

    var mv = el('div', 'dk-mv');
    var prev = el('button');
    prev.type = 'button';
    prev.innerHTML = CHEV_L;
    prev.setAttribute('aria-label', '이전 단계');
    prev.disabled = i <= 0;
    var pos = el('span', 'dk-pos', (i + 1) + ' / ' + steps.length);
    var next = el('button');
    next.type = 'button';
    next.innerHTML = CHEV_R;
    next.setAttribute('aria-label', '다음 단계');
    next.disabled = i >= steps.length - 1;
    prev.addEventListener('click', function () { if (i > 0) onPick(i - 1); });
    next.addEventListener('click', function () { if (i < steps.length - 1) onPick(i + 1); });
    mv.appendChild(prev);
    mv.appendChild(pos);
    mv.appendChild(next);
    bar.appendChild(mv);

    requestAnimationFrame(function () {
      var cur = btns[i];
      if (cur && rail.scrollWidth > rail.clientWidth + 2) {
        /* 지금 단계를 레일 왼쪽에 세운다 — 앞 단계가 잘려 보이지 않게 */
        rail.scrollLeft = Math.max(0, cur.offsetLeft - 6);
      }
    });
    return bar;
  }

  /* ←/→ — 입력칸에 초점이 있을 때는 듣지 않는다 */
  function key(el, count, get, set) {
    if (!el || !el.addEventListener) return;
    el.addEventListener('keydown', function (e) {
      if (e.defaultPrevented) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var i = get();
      var ni = e.key === 'ArrowLeft' ? i - 1 : i + 1;
      if (ni < 0 || ni >= count) return;
      e.preventDefault();
      set(ni);
    });
  }

  /* 좌우로 밀어 이동 */
  function swipe(el, prev, next) {
    if (!el || !el.addEventListener) return;
    var x0 = 0, y0 = 0, on = false;
    el.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { on = false; return; }
      var t = e.target;
      if (t && t.closest && t.closest('.dk-rail,input,textarea,select')) { on = false; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; on = true;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!on) return;
      on = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) next(); else prev();
    }, { passive: true });
  }

  window.JCDeckNav = { make: make, context: context, clear: clear, key: key, swipe: swipe, KEY: KEY };
})();
