/* 미니 달력 팝오버 — 17번 브리핑·17-1 원문이 함께 쓴다.
   최소 달 2026-11 고정, 최대 달은 (오늘의 실제 달) vs (보관된 마지막 달) 중 늦은 쪽 — 시간이 지나면 달이 스스로 늘어난다.
   아카이브가 있는 날만 고를 수 있고 점을 찍는다. 없는 날은 비활성.
   문서 수신기는 이 파일에서 한 번만 건다(화면을 다시 그려도 쌓이지 않는다). */
(function () {
  'use strict';
  var MIN = '2026-11';
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var active = null;   // 지금 열려 있는 달력 하나

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function key(y, m, day) { return y + '-' + pad(m + 1) + '-' + pad(day); }
  function parseYm(s) { var m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, 1) : null; }
  function later(a, b) { return a > b ? a : b; }

  window.JC_CAL = function (opts) {
    var btn = opts.button, dates = [], have = {}, current = '';
    var minD = parseYm(opts.minMonth || MIN) || new Date(2026, 10, 1);
    var view = new Date(minD.getTime());
    var wrap = btn.parentNode;
    if (wrap && !wrap.classList.contains('datewrap')) {
      wrap = document.createElement('span'); wrap.className = 'datewrap';
      btn.parentNode.insertBefore(wrap, btn); wrap.appendChild(btn);
    }
    var cal = document.createElement('div');
    cal.className = 'cal'; cal.hidden = true;
    cal.setAttribute('role', 'dialog');
    cal.setAttribute('aria-label', '날짜 선택');
    wrap.appendChild(cal);
    var api = {};

    function latestMonth() {
      var latest = '';
      dates.forEach(function (d) { var m = String(d).slice(0, 7); if (m > latest) latest = m; });
      return parseYm(latest);
    }
    function maxD() {
      var now = new Date();
      var nowM = new Date(now.getFullYear(), now.getMonth(), 1);
      var arch = latestMonth();
      return arch ? later(nowM, arch) : nowM;
    }
    function syncButton() {
      var t = btn.querySelector('[data-cal-label]');
      if (t) t.textContent = opts.label ? opts.label(current) : current;
      btn.setAttribute('aria-label', (opts.label ? opts.label(current) : current) + ' · 날짜 고르기');
    }
    function draw() {
      var y = view.getFullYear(), m = view.getMonth();
      var min = minD, max = maxD();
      var atMin = y === min.getFullYear() && m === min.getMonth();
      var atMax = y === max.getFullYear() && m === max.getMonth();
      var first = new Date(y, m, 1).getDay();
      var last = new Date(y, m + 1, 0).getDate();
      var cells = '';
      for (var b = 0; b < first; b++) cells += '<span aria-hidden="true"></span>';
      for (var d = 1; d <= last; d++) {
        var k = key(y, m, d), on = !!have[k];
        cells += '<button type="button" class="cal-d" data-d="' + k + '"' + (on ? '' : ' disabled') +
          ' aria-current="' + (k === current) + '" aria-label="' + y + '년 ' + (m + 1) + '월 ' + d + '일' + (on ? ' · 브리핑 있음' : ' · 브리핑 없음') + '">' +
          d + (on ? '<i class="dot" aria-hidden="true"></i>' : '') + '</button>';
      }
      var count = 0; dates.forEach(function (x) { if (x.slice(0, 7) === ym(view)) count++; });
      cal.innerHTML = '<div class="cal-hd"><button type="button" class="cal-mv" data-m="-1" aria-label="이전 달"' + (atMin ? ' disabled' : '') + '>‹</button>' +
        '<b class="num" aria-live="polite">' + y + '년 ' + (m + 1) + '월</b>' +
        '<button type="button" class="cal-mv" data-m="1" aria-label="다음 달"' + (atMax ? ' disabled' : '') + '>›</button></div>' +
        '<div class="cal-wd" aria-hidden="true">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
        '<div class="cal-g">' + cells + '</div>' +
        '<div class="cal-ft"><i aria-hidden="true"></i>점이 있는 날은 브리핑이 있습니다 · 이 달 ' + count + '일</div>';
      bind();
      placeIfOpen();
    }
    function placeIfOpen() {
      if (!cal.classList.contains('open')) return;
      cal.style.transform = '';
      var r = cal.getBoundingClientRect(), vw = document.documentElement.clientWidth, pad = 10, dx = 0;
      if (r.right > vw - pad) dx -= Math.ceil(r.right - (vw - pad));
      if (r.left + dx < pad) dx = Math.ceil(pad - r.left);
      cal.style.transform = dx ? 'translateX(' + dx + 'px)' : '';
    }
    function bind() {
      Array.prototype.forEach.call(cal.querySelectorAll('[data-m]'), function (b) {
        b.addEventListener('click', function () {
          view = new Date(view.getFullYear(), view.getMonth() + (+b.getAttribute('data-m')), 1); draw();
        });
      });
      Array.prototype.forEach.call(cal.querySelectorAll('.cal-d'), function (b) {
        if (b.disabled) return;
        b.addEventListener('click', function () {
          var d = b.getAttribute('data-d');
          current = d; close(); syncButton();
          if (opts.onPick) opts.onPick(d);
        });
        b.addEventListener('keydown', function (e) {
          var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 7 : e.key === 'ArrowUp' ? -7 : 0;
          if (!step) return;
          var all = Array.prototype.slice.call(cal.querySelectorAll('.cal-d:not([disabled])'));
          var i = all.indexOf(b) + step;
          if (i >= 0 && i < all.length) { all[i].focus(); e.preventDefault(); }
        });
      });
    }
    function open() {
      if (active && active !== api) active.close();
      active = api;
      view = parseYm(String(current).slice(0, 7)) || view;
      draw(); cal.hidden = false;
      requestAnimationFrame(function () {
        cal.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); placeIfOpen();
        var pick = cal.querySelector('.cal-d[aria-current="true"]:not([disabled])') || cal.querySelector('.cal-d:not([disabled])');
        if (pick) pick.focus({ preventScroll: true });
      });
    }
    function close() {
      if (!cal.classList.contains('open')) return;
      cal.classList.remove('open'); cal.style.transform = '';
      btn.setAttribute('aria-expanded', 'false');
      if (active === api) active = null;
      setTimeout(function () { if (!cal.classList.contains('open')) cal.hidden = true; }, 220);
    }
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () { if (cal.classList.contains('open')) close(); else open(); });

    api.setDates = function (list, cur) {
      dates = (list || []).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }).sort();
      have = {}; dates.forEach(function (x) { have[x] = 1; });
      if (cur) current = cur;
      syncButton(); if (cal.classList.contains('open')) draw();
    };
    api.setCurrent = function (d) { if (d) { current = d; syncButton(); } };
    api.close = close;
    api.el = cal;
    window.__jcCalActive = function () { return active; };
    return api;
  };

  document.addEventListener('pointerdown', function (e) {
    if (!active) return;
    var cal = active.el;
    if (!cal || cal.contains(e.target) || cal.parentNode.contains(e.target)) return;
    active.close();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!active) return;
    if (e.key === 'Escape') { var b = active.el && active.el.parentNode.querySelector('button'); active.close(); if (b) b.focus({ preventScroll: true }); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.slice.call(active.el.querySelectorAll('button:not([disabled])'));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });
})();
