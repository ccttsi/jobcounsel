/* 커리어넷 원천 사전 — 커리어넷 Open API로 받아 둔 사실 필드만 보여 준다.
 *
 * 자료: data/openapi/careernet/{jobs,majors,high-majors}.json (월간 배치가 갱신)
 * 원칙: ① 값은 원천 그대로(빈 값은 칸을 만들지 않는다) ② 서술문은 싣지 않고 official_url로 넘긴다
 *       ③ 검색·거르기는 화면 안에서만 한다(서버 전송 0)
 */
(function () {
  'use strict';

  var BASE = '../data/openapi/careernet/';
  var data = { job: null, major: null, high: null };
  var tab = 'job';
  var query = '';
  var pick = '';
  var rows = [];
  var lastFocus = null;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  var TABS = {
    job: {
      file: 'jobs.json', unit: '직업',
      qLabel: '직업명·분류로 찾기',
      ph: '직업명·분류 (예: 사회복지사)',
      chips: ['4천만원 ↑', '3천만원 ↑', '2천만원 ↑', '2천만원 ↓'],
      chipLabel: '연봉구간'
    },
    major: {
      file: 'majors.json', unit: '학과',
      qLabel: '학과명·세부관련학과로 찾기',
      ph: '학과명 (예: 사회복지학과)',
      chips: null, chipLabel: '계열'
    },
    high: {
      file: 'high-majors.json', unit: '학과',
      qLabel: '학과명·세부관련학과로 찾기',
      ph: '학과명 (예: 간호)',
      chips: null, chipLabel: '계열'
    }
  };

  function load(name) {
    return fetch(BASE + TABS[name].file, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) { data[name] = doc; return doc; });
  }

  function itemsOf(name) {
    var doc = data[name];
    return (doc && doc.items) || [];
  }

  function searchText(item) {
    var parts = [item.name, item.field || '', item.category || '', item.salary_band || '', item.growth || ''];
    (item.similar_jobs || []).forEach(function (s) { parts.push(s); });
    (item.related_departments || []).forEach(function (s) { parts.push(s); });
    return parts.join(' ').toLowerCase();
  }

  function filtered() {
    var list = itemsOf(tab);
    var q = query.trim().toLowerCase();
    if (pick) {
      list = list.filter(function (it) {
        return tab === 'job' ? it.salary_band === pick : it.category === pick;
      });
    }
    if (q) {
      list = list.filter(function (it) { return searchText(it).indexOf(q) >= 0; });
    }
    return list;
  }

  function chipRow() {
    var box = $('chips');
    var conf = TABS[tab];
    var list = itemsOf(tab);
    var values = conf.chips;
    if (!values) {
      var seen = {};
      values = [];
      list.forEach(function (it) {
        if (it.category && !seen[it.category]) { seen[it.category] = 1; values.push(it.category); }
      });
    }
    if (!values.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    var head = '<span class="sr">' + esc(conf.chipLabel) + '</span>';
    box.innerHTML = head + values.map(function (v) {
      var n = list.filter(function (it) {
        return tab === 'job' ? it.salary_band === v : it.category === v;
      }).length;
      return '<button type="button" data-pick="' + esc(v) + '" aria-pressed="' + (pick === v ? 'true' : 'false') + '">'
        + esc(v) + '<span class="n num">' + n + '</span></button>';
    }).join('');
  }

  function rowHtml(it) {
    var meta = [];
    if (tab === 'job') {
      if (it.field) meta.push('<span class="k">' + esc(it.field) + '</span>');
      if (it.salary_band) meta.push('<span>연봉 ' + esc(it.salary_band) + '</span>');
      if (it.growth) meta.push('<span>발전 ' + esc(it.growth) + '</span>');
    } else {
      if (it.category) meta.push('<span class="k">' + esc(it.category) + '</span>');
      if (it.related_department_count) meta.push('<span>세부관련학과 ' + it.related_department_count + '개</span>');
    }
    var sub = '';
    if (tab === 'job' && it.similar_jobs && it.similar_jobs.length) {
      sub = '<span class="sub">유사직업 ' + esc(it.similar_jobs.slice(0, 3).join(' · '))
        + (it.similar_jobs.length > 3 ? ' 외 ' + (it.similar_jobs.length - 3) : '') + '</span>';
    } else if (tab !== 'job' && it.related_departments && it.related_departments.length) {
      sub = '<span class="sub">' + esc(it.related_departments.slice(0, 3).join(' · '))
        + (it.related_departments.length > 3 ? ' 외 ' + (it.related_departments.length - 3) : '') + '</span>';
    }
    return '<button type="button" class="row" data-i="' + esc(it.idx) + '">'
      + '<span class="nm">' + esc(it.name) + '</span>'
      + (meta.length ? '<span class="meta">' + meta.join('') + '</span>' : '')
      + sub + '</button>';
  }

  function render() {
    rows = filtered().map(function (it, i) { it.idx = i; return it; });
    var grid = $('grid');
    if (!rows.length) {
      grid.innerHTML = '<p class="empty">맞는 자료가 없습니다.<br>검색어를 줄이거나 거르기를 풀어 보세요.'
        + '<br><button type="button" id="resetBtn">검색·거르기 지우기</button></p>';
      $('resetBtn').addEventListener('click', reset);
    } else {
      grid.innerHTML = rows.map(rowHtml).join('');
    }
    $('cnt').textContent = rows.length.toLocaleString('ko-KR');
    $('cntL').textContent = TABS[tab].unit;
    var doc = data[tab];
    $('basis').textContent = doc && doc.fetched_at ? '커리어넷 원천 ' + doc.fetched_at.slice(0, 10) + ' 기준' : '';
    chipRow();
    $('scroller').scrollTop = 0;
  }

  function detail(it) {
    var conf = TABS[tab];
    var body = [];
    var meta = [];
    if (tab === 'job') {
      if (it.field) meta.push('<span>' + esc(it.field) + '</span>');
      if (it.salary_band) meta.push('<span>연봉 ' + esc(it.salary_band) + '</span>');
      body.push(['발전가능성', it.growth]);
      body.push(['고용 평등', it.equal_employment]);
      body.push(['직업 코드', it.job_code]);
      body.push(['사전 번호', it.jobdic_seq]);
      body.push(['분류 코드', it.cnet_class_code]);
    } else {
      if (it.category) meta.push('<span>' + esc(it.category) + '</span>');
      body.push(['학과 번호', it.major_seq]);
      body.push(['세부관련학과', it.related_department_count ? it.related_department_count + '개' : '']);
    }
    var dl = body.filter(function (p) { return p[1]; }).map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>';
    }).join('');
    var chips = '';
    if (tab === 'job' && it.similar_jobs && it.similar_jobs.length) {
      chips = '<h3>유사직업</h3><div class="tags">' + it.similar_jobs.map(function (s) {
        return '<span>' + esc(s) + '</span>';
      }).join('') + '</div>';
    }
    if (tab !== 'job' && it.related_departments && it.related_departments.length) {
      chips = '<h3>세부관련학과</h3><div class="tags">' + it.related_departments.map(function (s) {
        return '<span>' + esc(s) + '</span>';
      }).join('') + '</div>';
    }
    $('detK').textContent = conf.unit + ' 상세';
    $('detBody').innerHTML = '<h2>' + esc(it.name) + '</h2>'
      + (meta.length ? '<p class="op">' + meta.join(' · ') + '</p>' : '')
      + (dl ? '<dl>' + dl + '</dl>' : '')
      + chips
      + '<p class="note">「하는 일」 같은 설명문은 커리어넷 이용약관상 저장하지 않습니다. 아래 공식 페이지에서 원문을 확인하세요.</p>'
      + (it.official_url
        ? '<a class="go" href="' + esc(it.official_url) + '" target="_blank" rel="noopener noreferrer">커리어넷 공식 페이지<small>새 창</small></a>'
        : '');
  }

  function openSheet(it) {
    lastFocus = document.activeElement;
    detail(it);
    var sheet = $('sheet');
    sheet.classList.add('on');
    sheet.setAttribute('aria-hidden', 'false');
    var grid = $('grid');
    Array.prototype.forEach.call(grid.querySelectorAll('.row'), function (el) {
      el.setAttribute('aria-current', String(el.getAttribute('data-i') === String(it.idx)));
    });
    $('det').focus();
  }

  function closeSheet() {
    var sheet = $('sheet');
    if (!sheet.classList.contains('on')) return;
    sheet.classList.remove('on');
    sheet.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call($('grid').querySelectorAll('.row'), function (el) {
      el.setAttribute('aria-current', 'false');
    });
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function reset() {
    query = '';
    pick = '';
    $('q').value = '';
    render();
    $('q').focus();
  }

  function setTab(name, keep) {
    tab = name;
    pick = '';
    if (!keep) { query = ''; $('q').value = ''; }
    Array.prototype.forEach.call($('tabs').querySelectorAll('[data-tab]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === name));
    });
    var conf = TABS[name];
    $('q').setAttribute('aria-labelledby', 'qLabel');
    $('qLabel').textContent = conf.qLabel;
    $('q').placeholder = conf.ph;
    closeSheet();
    render();
  }

  function counts() {
    ['job', 'major', 'high'].forEach(function (k) {
      var n = itemsOf(k).length;
      var el = $('n' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.textContent = n ? n.toLocaleString('ko-KR') : '—';
    });
  }

  function wire() {
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) setTab(b.getAttribute('data-tab'), false);
    });
    $('q').addEventListener('input', function () {
      query = this.value;
      render();
    });
    $('q').addEventListener('search', function () {
      query = this.value;
      render();
    });
    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      var v = b.getAttribute('data-pick');
      pick = pick === v ? '' : v;
      render();
    });
    $('grid').addEventListener('click', function (e) {
      var b = e.target.closest('.row');
      if (!b) return;
      var it = rows[Number(b.getAttribute('data-i'))];
      if (it) openSheet(it);
    });
    $('detX').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) {
      if (e.target === this) closeSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });
    var pvT = $('pvT'), pvB = $('pvB'), pvL = $('pvL');
    pvT.addEventListener('click', function () {
      var open = pvB.hidden;
      pvB.hidden = !open;
      pvT.setAttribute('aria-expanded', String(open));
      pvL.textContent = open ? '접기' : '펼치기';
    });
  }

  function start() {
    wire();
    setTab('job', true);
    Promise.all([load('job'), load('major'), load('high')]).then(function () {
      counts();
      var q = new URLSearchParams(location.search).get('q');
      if (q) { query = q; $('q').value = q; }
      render();
      var at = data.job && data.job.fetched_at ? data.job.fetched_at.slice(0, 10) : '';
      if (at) $('footAt').textContent = at + ' 수집분';
    }).catch(function () {
      $('grid').innerHTML = '<p class="empty">자료를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
