/* 미니 달력 팝오버 — 오늘의 브리핑(18번)과 원문 피드가 함께 쓴다.
   · 달 이름(YYYY년 MM월)을 누르면 1~12월을 고르는 n×n 행렬이 열린다(좁은 화면 3×4, 넓은 화면 4×3).
     자료가 있는 달은 강조색, 없는 달은 흐리게(비활성).
   · 최소 달은 고정값이 아니라 보관된 자료의 가장 이른 달에서 나온다(자료가 늘면 안내도 따라 바뀐다).
     최대 달은 (오늘의 실제 달) vs (보관된 마지막 달) 중 늦은 쪽.
   · 아카이브가 있는 날만 고를 수 있고 점을 찍는다. 없는 날은 비활성.
   문서 수신기는 이 파일에서 한 번만 건다(화면을 다시 그려도 쌓이지 않는다). */
(function () {
  'use strict';
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var active = null;   // 지금 열려 있는 달력 하나

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function key(y, m, day) { return y + '-' + pad(m + 1) + '-' + pad(day); }
  function parseYm(s) { var m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, 1) : null; }
  function later(a, b) { return a > b ? a : b; }
  function sameM(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

  window.JC_CAL = function (opts) {
    var btn = opts.button, dates = [], have = {}, byMonth = {}, current = '';
    var minD = parseYm(opts.minMonth) || null;
    var view = minD ? new Date(minD.getTime()) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    var mode = 'd';                 // 'd' 일간 · 'm' 월 고르기
    var yearView = view.getFullYear();
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
    function countMonth(mi) {   // 그 달에 자료가 있는 날 수
      var n = 0; dates.forEach(function (x) { var d = new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, 1); if (d.getMonth() === mi) n++; });
      return n;
    }
    function totalCount() { return dates.length; }
    function countInView() {
      var n = 0; dates.forEach(function (x) { if (x.slice(0, 7) === ym(view)) n++; });
      return n;
    }
    function minLabel() { var m = minD || view; return m.getFullYear() + '년 ' + (m.getMonth() + 1) + '월'; }
    function syncButton() {
      var t = btn.querySelector('[data-cal-label]');
      if (t) t.textContent = opts.label ? opts.label(current) : current;
      btn.setAttribute('aria-label', (opts.label ? opts.label(current) : current) + ' · 날짜 고르기');
    }
    /* ── 일간 ── */
    function drawDays() {
      var y = view.getFullYear(), m = view.getMonth();
      var min = minD, max = maxD();
      var atMin = min && y === min.getFullYear() && m === min.getMonth();
      var atMax = !max || (y === max.getFullYear() && m === max.getMonth()) || (y > max.getFullYear()) || (y === max.getFullYear() && m > max.getMonth());
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
      cal.innerHTML = '<div class="cal-hd">' +
        '<button type="button" class="cal-mv" data-m="-1" aria-label="이전 달"' + (atMin ? ' disabled' : '') + '>‹</button>' +
        '<button type="button" class="cal-title" data-mode="m" aria-expanded="false" aria-label="' + y + '년 ' + (m + 1) + '월 · 연도와 월 고르기"><b class="num">' + y + '년 ' + (m + 1) + '월</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
        '<button type="button" class="cal-mv" data-m="1" aria-label="다음 달"' + (atMax ? ' disabled' : '') + '>›</button></div>' +
        '<div class="cal-wd" aria-hidden="true">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
        '<div class="cal-g">' + cells + '</div>' +
        '<div class="cal-ft"><span><i aria-hidden="true"></i>점이 있는 날은 지면이 있습니다 · 이 달 ' + countInView() + '일</span>' +
        '<span class="cal-since">지난 지면은 ' + minLabel() + '부터</span></div>';
    }
    /* ── 1~12월 n×n ── */
    function drawMonths() {
      var min = minD, max = maxD();
      var atMinYear = min && yearView <= min.getFullYear();
      var atMaxYear = max && yearView >= max.getFullYear();
      var cells = '';
      for (var i = 0; i < 12; i++) {
        var n = 0; dates.forEach(function (x) { if (+x.slice(0, 4) === yearView && +x.slice(5, 7) === i + 1) n++; });
        var on = n > 0;
        var isCur = current && +current.slice(0, 4) === yearView && +current.slice(5, 7) === i + 1;
        cells += '<button type="button" class="cal-m" data-mi="' + i + '"' + (on ? '' : ' disabled') +
          ' aria-pressed="' + !!isCur + '" aria-label="' + yearView + '년 ' + (i + 1) + '월' + (on ? ' · 지면 ' + n + '일' : ' · 지면 없음') + '">' +
          '<b>' + (i + 1) + '월</b><span class="num">' + (on ? n + '일' : '–') + '</span></button>';
      }
      var yearDays = 0; dates.forEach(function (x) { if (+x.slice(0, 4) === yearView) yearDays++; });
      cal.innerHTML = '<div class="cal-hd">' +
        '<button type="button" class="cal-mv" data-y="-1" aria-label="이전 해"' + (atMinYear ? ' disabled' : '') + '>‹</button>' +
        '<button type="button" class="cal-title" data-mode="d" aria-label="' + yearView + '년 · 일간 달력으로 돌아가기"><b class="num">' + yearView + '년</b></button>' +
        '<button type="button" class="cal-mv" data-y="1" aria-label="다음 해"' + (atMaxYear ? ' disabled' : '') + '>›</button></div>' +
        '<div class="cal-mg" role="group" aria-label="월 고르기">' + cells + '</div>' +
        '<div class="cal-ft"><span><i aria-hidden="true"></i>색이 있는 달에 지면이 있습니다 · ' + yearView + '년 ' + yearDays + '일</span>' +
        '<span class="cal-since">전체 ' + totalCount() + '일</span></div>';
    }
    function draw() { if (mode === 'm') drawMonths(); else drawDays(); bind(); placeIfOpen(); }
    function placeIfOpen() {
      if (!cal.classList.contains('open')) return;
      /* 위치는 offset(레이아웃)로 읽는다 — 자기 transform에 영향받지 않게. 화면 밖으로 나가면 안쪽으로 민다. */
      var op = cal.offsetParent || wrap;
      var pr = op.getBoundingClientRect();
      var left = pr.left + cal.offsetLeft, right = left + cal.offsetWidth;
      var vw = document.documentElement.clientWidth, pad = 10, dx = 0;
      if (right > vw - pad) dx -= Math.ceil(right - (vw - pad));
      if (left + dx < pad) dx += Math.ceil(pad - (left + dx));
      cal.style.transform = dx ? 'translateX(' + dx + 'px)' : '';
    }
    function bind() {
      Array.prototype.forEach.call(cal.querySelectorAll('[data-m]'), function (b) {
        b.addEventListener('click', function () {
          view = new Date(view.getFullYear(), view.getMonth() + (+b.getAttribute('data-m')), 1); draw();
          focusIn('.cal-d[aria-current="true"]:not([disabled])');
        });
      });
      Array.prototype.forEach.call(cal.querySelectorAll('[data-y]'), function (b) {
        b.addEventListener('click', function () {
          yearView = yearView + (+b.getAttribute('data-y')); draw();
          focusIn('.cal-m:not([disabled])');
        });
      });
      var title = cal.querySelector('.cal-title');
      if (title) title.addEventListener('click', function () {
        if (mode === 'd') { mode = 'm'; yearView = view.getFullYear(); draw(); focusIn('.cal-m[aria-pressed="true"]:not([disabled]), .cal-m:not([disabled])'); }
        else { mode = 'd'; draw(); focusIn('.cal-d[aria-current="true"]:not([disabled])'); }
      });
      Array.prototype.forEach.call(cal.querySelectorAll('.cal-m'), function (b) {
        if (b.disabled) return;
        b.addEventListener('click', function () {
          var mi = +b.getAttribute('data-mi');
          view = new Date(yearView, mi, 1); mode = 'd'; draw();
          focusIn('.cal-d:not([disabled])');
        });
        b.addEventListener('keydown', function (e) {
          var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 3 : e.key === 'ArrowUp' ? -3 : 0;
          if (!step) return;
          var all = Array.prototype.slice.call(cal.querySelectorAll('.cal-m:not([disabled])'));
          var i = all.indexOf(b) + step;
          if (i >= 0 && i < all.length) { all[i].focus(); e.preventDefault(); }
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
    function focusIn(sel) {
      var el = cal.querySelector(sel);
      if (el) requestAnimationFrame(function () { el.focus({ preventScroll: true }); });
    }
    function open() {
      if (active && active !== api) active.close();
      active = api;
      var m = parseYm(String(current).slice(0, 7));
      if (m) view = m;
      else if (minD) view = minD;
      mode = 'd';
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
      if (!opts.minMonth) {           // 가장 이른 자료의 달이 곧 최소 달
        var earliest = dates[0] ? String(dates[0]).slice(0, 7) : '';
        minD = parseYm(earliest) || minD || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      }
      if (!view || view < minD) view = new Date(minD.getTime());
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
