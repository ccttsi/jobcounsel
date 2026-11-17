/* headfold.js — 상단 머리말 접기·펼치기 (2026-11-17)
 *
 * 머리말에 단추 둘을 붙인다: 펼쳤을 때는 머리말 안의 「접기」(.jh-fold),
 * 접혔을 때는 머리말 아래에 남는 44px 손잡이 줄의 「펼치기」(.jh-open).
 * 상태는 localStorage 'jc-hf'('off'|'on')에 남겨 다음에 열 때도 그대로 둔다.
 * 규격과 쓰는 법은 assets/headfold.css 머리말을 본다.
 */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var KEY = 'jc-hf';
  var hd = null, rail = null, fold = null, open = null, busy = false, timer = 0, mid = 0;

  var CHEV_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  var CHEV_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function off() { return root.getAttribute('data-jc-hf') === 'off'; }
  function railH() { var v = parseFloat(getComputedStyle(root).getPropertyValue('--jh-rail')); return v > 0 ? v : 44; }
  function h() { return Math.round(hd.getBoundingClientRect().height); }
  function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  function at(fn, ms) { clearTimeout(mid); mid = setTimeout(fn, ms); }
  function focusIt(el) { try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} } }

  function label() {
    var v = (hd.getAttribute('data-jc-headfold') || '').trim();
    if (v) return v;
    var b = hd.querySelector('b, strong, h1, h2');
    if (b && b.textContent.trim()) return b.textContent.trim();
    return (d.title || '머리말').trim();
  }

  function build() {
    hd = d.querySelector('[data-jc-headfold]');
    if (!hd || hd.__jh) return false;
    hd.__jh = true;
    if (!hd.id) hd.id = 'jh-head';
    if (getComputedStyle(hd).position === 'static') hd.style.position = 'relative'; // 손잡이 줄(absolute)의 기준

    rail = d.createElement('div');
    rail.className = 'jh-rail';
    rail.setAttribute('data-jc-ignore', '');
    var id = d.createElement('span');
    id.className = 'jh-id';
    var dot = d.createElement('i'); dot.setAttribute('aria-hidden', 'true');
    var nm = d.createElement('b'); nm.textContent = label();
    id.appendChild(dot); id.appendChild(nm);
    open = d.createElement('button');
    open.type = 'button';
    open.className = 'jh-open';
    open.setAttribute('aria-label', '머리말 펼치기');
    open.title = '머리말 펼치기';
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-controls', hd.id);
    var chip = d.createElement('span');
    chip.className = 'jh-chip';
    chip.innerHTML = CHEV_DOWN;
    var ct = d.createElement('span'); ct.className = 'jh-l'; ct.textContent = '머리말 펼치기';
    chip.appendChild(ct);
    open.appendChild(chip);
    rail.appendChild(id); rail.appendChild(open);
    hd.appendChild(rail);

    fold = d.createElement('button');
    fold.type = 'button';
    fold.className = 'jh-fold';
    fold.setAttribute('aria-label', '머리말 접기');
    fold.title = '머리말 접기';
    fold.setAttribute('aria-expanded', 'true');
    fold.setAttribute('aria-controls', hd.id);
    var fchip = d.createElement('span');
    fchip.className = 'jh-chip';
    fchip.innerHTML = CHEV_UP;
    var fl = d.createElement('span'); fl.className = 'jh-l'; fl.textContent = '접기';
    fchip.appendChild(fl);
    fold.appendChild(fchip);
    var slot = hd.querySelector('[data-jc-prefs]');
    var acts = hd.querySelector('.a-actions, [data-jc-headfold-actions]');
    if (acts) acts.appendChild(fold);
    else if (slot && slot.parentNode === hd) hd.insertBefore(fold, slot.nextSibling);
    else hd.appendChild(fold);

    fold.addEventListener('click', function () { shut(false); });
    open.addEventListener('click', function () { spread(false); });
    return true;
  }

  function mark(isOff) {
    if (fold) fold.setAttribute('aria-expanded', String(!isOff));
    if (open) open.setAttribute('aria-expanded', String(isOff));
  }

  function shut(instant) {
    if (!hd || busy || off()) return;
    busy = true; mark(true);
    var from = h(), to = railH(), inHd = hd.contains(d.activeElement);
    if (instant || reduced()) { land(true, inHd); return; }
    hd.style.height = from + 'px';
    hd.style.overflow = 'hidden';
    hd.classList.add('jh-anim', 'jh-hiding');
    void hd.offsetHeight;                                  // 시작 높이를 먼저 확정한 뒤 줄인다
    requestAnimationFrame(function () { hd.style.height = to + 'px'; });
    at(function () { root.setAttribute('data-jc-hf', 'off'); }, 130); // 줄어드는 중에 손잡이 줄이 나타난다
    later(function () { land(true, inHd); }, 380);
  }

  function spread(instant) {
    if (!hd || busy || !off()) return;
    busy = true; mark(false);
    var inHd = hd.contains(d.activeElement);
    if (instant || reduced()) { land(false, inHd); return; }
    hd.style.height = railH() + 'px';
    hd.style.overflow = 'hidden';
    hd.classList.add('jh-anim', 'jh-showing');
    root.removeAttribute('data-jc-hf');                     // 안쪽을 다시 보이게 한 뒤 자연 높이를 잰다
    hd.style.height = 'auto';
    var to = h();
    hd.style.height = railH() + 'px';
    void hd.offsetHeight;
    requestAnimationFrame(function () { hd.style.height = to + 'px'; });
    later(function () { land(false, inHd); }, 380);
  }

  function land(isOff, keepFocus) {
    clearTimeout(timer); clearTimeout(mid);
    hd.classList.remove('jh-anim', 'jh-hiding', 'jh-showing');
    hd.style.height = ''; hd.style.overflow = '';
    if (isOff) root.setAttribute('data-jc-hf', 'off'); else root.removeAttribute('data-jc-hf');
    mark(isOff);
    busy = false;
    save(isOff ? 'off' : 'on');
    if (keepFocus) focusIt(isOff ? open : fold);
  }

  function init() {
    if (!build()) return;
    if (off()) { mark(true); return; }                      // <head> 인라인 스크립트가 이미 정해 뒀다
    mark(false);
    if (get() === 'off') land(true, false);                 // 인라인 스크립트가 없는 화면: 첫 그림에서 바로 접는다
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
