/* 자료 간 연결고리(체인) 시트 — 같은 theme_key 자료를 모아 시간순/글로벌 두 방식으로 보여 준다.
   자료 색인은 briefing/data/chain.json(날짜별 카드에서 만든 파생 파일) 하나만 읽는다. 날짜별 JSON을 모두 받지 않는다. */
(function () {
  'use strict';
  var DATA = null, OPEN = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(d) { var s = String(d || ''); return s.slice(5, 7) + '.' + s.slice(8, 10); }
  function yr(d) { return String(d || '').slice(0, 4); }
  function url(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function region(it) { return it.region === 'global' ? 'global' : 'kr'; }
  function rgBadge(r) { return '<span class="rg ' + (r === 'global' ? 'gl' : 'kr') + '">' + (r === 'global' ? 'GLOBAL' : 'KR') + '</span>'; }
  function pageLink(it) { return '?date=' + encodeURIComponent(it.date) + '#' + encodeURIComponent(it.card_id); }

  function timeline(items) {
    var asc = items.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return '<ol class="tl">' + asc.map(function (it) {
      var su = url(it.source_url);
      return '<li' + (it.date === items._today ? ' class="now"' : '') + '><span class="dt">' + esc(md(it.date)) + '<small>' + esc(yr(it.date)) + '</small></span>' +
        '<div class="node"><span class="tt">' + esc(it.title) + '</span><span class="mt"><span class="mm">' + rgBadge(region(it)) +
        '<span>' + esc(it.source_name || '') + '</span>' + (it.category ? '<span>' + esc(it.category) + '</span>' : '') +
        '</span><span class="lk"><a class="link" href="' + esc(pageLink(it)) + '">그날 지면 →</a>' + (su ? '<a class="link" href="' + esc(su) + '" target="_blank" rel="noopener">원문</a>' : '') +
        '</span></span></div></li>';
    }).join('') + '</ol>';
  }

  function globalView(items) {
    var kr = items.filter(function (x) { return region(x) === 'kr'; }), gl = items.filter(function (x) { return region(x) === 'global'; });
    function col(name, sub, list) {
      return '<section class="gv-c"><div class="gv-h"><b>' + name + '</b><span>' + sub + ' ' + list.length + '건</span></div>' +
        (list.length ? '<ul class="gv-l">' + list.map(function (it) {
          return '<li><span class="tt">' + esc(it.title) + '</span><span class="mt"><span class="mm"><span class="num">' + esc(md(it.date)) + '</span><span>' + esc(it.source_name || '') + '</span></span>' +
            '<span class="lk"><a href="' + esc(pageLink(it)) + '">그날 지면 →</a></span></span></li>';
        }).join('') + '</ul>'
          : '<p class="gv-empty">이 테마의 ' + (name === '국내' ? '국내' : '해외') + ' 자료는 아직 없습니다. 다른 날짜의 같은 테마가 쌓이면 이 칸에 나란히 놓입니다.</p>') +
        '</section>';
    }
    return '<div class="gv">' + col('국내', 'KR', kr) + col('해외', 'GLOBAL', gl) + '</div>';
  }

  function sheet() {
    var el = document.getElementById('cnSheet');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'cn-sheet'; el.id = 'cnSheet'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'cnTT');
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-cn-close]')) { close(); return; }
      var t = e.target.closest('[data-cn-tab]');
      if (t) select(t.getAttribute('data-cn-tab'));
    });
    return el;
  }
  function select(tab) {
    var el = document.getElementById('cnSheet'); if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('[data-cn-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-cn-tab') === tab)); });
    var pane = el.querySelector('#cnBody');
    var items = el._items || [];
    if (pane) pane.innerHTML = (tab === 'global' ? globalView(items) : timeline(items));
    el._tab = tab;
  }
  function close() {
    var el = document.getElementById('cnSheet'); if (!el || el.hidden) return;
    el.classList.remove('open');
    setTimeout(function () { if (!el.classList.contains('open')) { el.hidden = true; el.innerHTML = ''; } }, 250);
    var b = document.querySelector('[data-chain="' + OPEN + '"]'); if (b) b.focus({ preventScroll: true });
    OPEN = '';
  }
  function open(key, opts) {
    opts = opts || {};
    var el = sheet();
    var theme = DATA && DATA.themes && DATA.themes[key];
    var items = (theme && theme.items) || [];
    if (items.length) items._today = opts.today || '';
    var label = (theme && theme.label) || opts.label || '연결된 자료';
    OPEN = key;
    el.innerHTML = '<div class="cn-in"><div class="cn-top"><div class="cn-tt"><b id="cnTT">' + esc(label) + '</b>' +
      '<small>같은 흐름의 자료 <span class="num">' + items.length + '</span>건 · 날짜와 권역으로 이어 봅니다</small></div>' +
      '<button type="button" class="cn-x" data-cn-close aria-label="닫기">닫기</button></div>' +
      '<div class="cn-tabs" role="tablist" aria-label="보는 방식">' +
      '<button type="button" class="cn-tab" role="tab" data-cn-tab="time" aria-selected="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>시간순</button>' +
      '<button type="button" class="cn-tab" role="tab" data-cn-tab="global" aria-selected="false">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.6 12h16.8M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5C9.6 18.1 8.4 15.2 8.4 12S9.6 5.9 12 3.5z"/></svg>글로벌</button></div>' +
      '<div class="cn-body" id="cnBody"></div></div>';
    el._items = items;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('open'); select(opts.tab === 'global' ? 'global' : 'time'); var x = el.querySelector('[data-cn-close]'); if (x) x.focus({ preventScroll: true }); });
  }

  window.JC_CHAIN = {
    load: function (base) {
      if (DATA) return Promise.resolve(DATA);
      return fetch((base || 'data/') + 'chain.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { DATA = d; return d; });
    },
    counts: function () {
      var out = {};
      if (!DATA) return out;
      Object.keys(DATA.themes || {}).forEach(function (k) { out[k] = ((DATA.themes[k] || {}).items || []).length; });
      return out;
    },
    open: function (key, opts) {
      opts = opts || {};
      if (!DATA) {
        JC_CHAIN.load(opts.base).then(function () { open(key, opts); }).catch(function () { open(key, opts); });
        return;
      }
      open(key, opts);
    },
    close: close
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
