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
    diff: {
      base: './data/', file: 'job-diff.json', unit: '직업',
      qLabel: '직업명·분류·유사직업으로 찾기',
      ph: '직업명·분류 (예: 사회복지사)',
      chips: null, chipLabel: '개편 상태'
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
    var base = TABS[name].base || BASE;
    return fetch(base + TABS[name].file, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) { data[name] = doc; return doc; });
  }

  function itemsOf(name) {
    var doc = data[name];
    return (doc && doc.items) || [];
  }

  function searchText(item) {
    var parts = [item.name, item.field || '', item.category || '', item.salary_band || '', item.growth || ''];
    if (tab === 'diff') {
      var o = item.old || {}, n = item.new || {};
      parts.push(o.field || '', n.group || '', o.salary_band || '', o.growth || '');
      (o.similar_jobs || []).forEach(function (s) { parts.push(s); });
      (n.related_job_names || []).forEach(function (s) { parts.push(s); });
      (n.related_major_names || []).forEach(function (s) { parts.push(s); });
      (n.required_licenses || []).forEach(function (s) { parts.push(s); });
    }
    (item.similar_jobs || []).forEach(function (s) { parts.push(s); });
    (item.related_departments || []).forEach(function (s) { parts.push(s); });
    return parts.join(' ').toLowerCase();
  }

  function filtered() {
    var list = itemsOf(tab);
    var q = query.trim().toLowerCase();
    if (pick) {
      list = list.filter(function (it) {
        if (tab === 'job') return it.salary_band === pick;
        if (tab === 'diff') return it.k === pick;
        return it.category === pick;
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
    if (tab === 'diff') {
      var sts = [['', '전체'], ['common', '공통'], ['new', '신설'], ['old', '구버전 전용']];
      box.hidden = false;
      box.innerHTML = '<span class="sr">' + esc(conf.chipLabel) + '</span>' + sts.map(function (p) {
        var n = p[0] ? list.filter(function (it) { return it.k === p[0]; }).length : list.length;
        return '<button type="button" data-pick="' + esc(p[0]) + '" aria-pressed="' + (pick === p[0] ? 'true' : 'false') + '">'
          + esc(p[1]) + '<span class="n num">' + n + '</span></button>';
      }).join('');
      return;
    }
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

  function diffStatus(it) {
    if (it.k === 'new') return '<span class="st st-new">2023.08 개편 신설</span>';
    if (it.k === 'old') return '<span class="st st-old">개편 후 미수록</span>';
    return it.chg && it.chg.cls ? '<span class="st st-chg">분류 이동</span>' : '';
  }

  function rowHtml(it) {
    if (tab === 'diff') {
      var o = it.old || {}, n = it.new || {};
      var meta = [];
      if (it.k !== 'new' && o.field) meta.push('<span class="k">' + esc(o.field) + '</span>');
      if (it.k === 'new' && n.group) meta.push('<span class="k">' + esc(n.group) + '</span>');
      if (o.salary_band) meta.push('<span>연봉 ' + esc(o.salary_band) + '</span>');
      if (n.salary_10k_krw != null) meta.push('<span>신버전 ' + n.salary_10k_krw.toLocaleString('ko-KR') + '만원</span>');
      if (it.k !== 'new' && o.growth) meta.push('<span>발전 ' + esc(o.growth) + '</span>');
      var sub = '';
      if (it.k === 'common') {
        var bits = [];
        if (it.chg && (it.chg.add.length || it.chg.rm.length)) {
          if (it.chg.add.length) bits.push('유사직업 추가 ' + it.chg.add.length);
          if (it.chg.rm.length) bits.push('제외 ' + it.chg.rm.length);
        } else if ((n.related_job_names || []).length) {
          bits.push('유사직업 ' + n.related_job_names.length + '개');
        }
        if (n.related_major_names && n.related_major_names.length) bits.push('관련학과 ' + n.related_major_names.length);
        if (bits.length) sub = '<span class="sub">신버전 — ' + bits.join(' · ') + '</span>';
      } else if (it.k === 'new') {
        var names = (n.related_job_names || []).slice(0, 3);
        if (names.length) sub = '<span class="sub">유사직업 ' + esc(names.join(' · ')) + '</span>';
      }
      return '<button type="button" class="row" data-i="' + esc(it.idx) + '">'
        + '<span class="nm">' + esc(it.name) + '</span>'
        + '<span class="meta">' + diffStatus(it) + meta.join('') + '</span>'
        + sub + '</button>';
    }
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
    var dsum = $('diffSum');
    if (tab === 'diff' && doc && doc.counts) {
      dsum.hidden = false;
      dsum.innerHTML = '<span>구버전 API <b class="num">' + doc.counts.old.toLocaleString('ko-KR') + '</b>건</span>'
        + '<span class="ar" aria-hidden="true">↔</span><span>신버전 직업백과 <b class="num">' + doc.counts.new.toLocaleString('ko-KR') + '</b>건</span>'
        + '<span>공통 <b class="num">' + doc.counts.common.toLocaleString('ko-KR') + '</b></span>'
        + '<span>신설 <b class="num">' + doc.counts.new_only.toLocaleString('ko-KR') + '</b></span>'
        + '<span>미수록 <b class="num">' + doc.counts.old_only.toLocaleString('ko-KR') + '</b></span>';
    } else { dsum.hidden = true; dsum.innerHTML = ''; }
    if (tab === 'diff' && doc && doc.basis) {
      $('basis').textContent = '구버전 ' + (doc.basis.old.fetched_at || '') + ' 수집분(2023.08 개편 전) · 신버전 ' + (doc.basis.new.generated_at || '') + ' 정리분';
    } else {
      $('basis').textContent = doc && doc.fetched_at ? '커리어넷 원천 ' + doc.fetched_at.slice(0, 10) + ' 기준' : '';
    }
    chipRow();
    $('scroller').scrollTop = 0;
  }

  function diffTags(label, names) {
    return '<h4>' + esc(label) + '</h4><div class="tags">' + names.map(function (s) {
      return '<span>' + esc(s) + '</span>';
    }).join('') + '</div>';
  }

  function diffDetail(it) {
    var o = it.old || {}, n = it.new || {};
    var meta = [];
    if (it.k === 'new') meta.push('<span class="st st-new">2023.08 개편 신설</span>');
    if (it.k === 'old') meta.push('<span class="st st-old">개편 후 미수록</span>');
    if (it.k === 'common' && it.chg && it.chg.cls && o.field && n.group)
      meta.push('<span class="st st-chg">분류 이동 · ' + esc(o.field) + ' → ' + esc(n.group) + '</span>');

    var body = '';
    if (it.k !== 'new') {
      var od = [];
      if (o.field) od.push(['분류', o.field]);
      if (o.salary_band) od.push(['연봉구간', o.salary_band]);
      if (o.growth) od.push(['발전가능성', o.growth]);
      if (o.equal_employment) od.push(['고용 평등', o.equal_employment]);
      if (o.jobdic_seq) od.push(['사전 번호', o.jobdic_seq]);
      if (o.job_code) od.push(['직업 코드', o.job_code]);
      if (o.cnet_class_code) od.push(['분류 코드', o.cnet_class_code]);
      body += '<section class="cmp-b"><h4>구버전 · 2023.08 개편 전 API</h4><dl>'
        + od.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('')
        + '</dl>' + ((o.similar_jobs || []).length ? diffTags('유사직업', o.similar_jobs) : '') + '</section>';
    }
    if (it.k !== 'old') {
      var nd = [];
      if (n.group) nd.push(['분류', n.group]);
      if (n.salary_10k_krw != null) nd.push(['평균연봉(중앙값)', n.salary_10k_krw.toLocaleString('ko-KR') + '만원']);
      if (n.keco_detail) nd.push(['고용직업분류 세분류', n.keco_detail]);
      if (n.ksco_detail) nd.push(['표준직업분류 세분류', n.ksco_detail]);
      if (n.job_code) nd.push(['직업 코드', n.job_code]);
      if (n.required_licenses && n.required_licenses.length) nd.push(['필수 면허', n.required_licenses.join(', ')]);
      if (n.updated) nd.push(['정리 기준', n.updated]);
      body += '<section class="cmp-b"><h4>신버전 · 커리어넷 직업백과(2025 갱신분 기반)</h4><dl>'
        + nd.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('')
        + '</dl>'
        + ((n.related_job_names || []).length ? diffTags('유사직업', n.related_job_names) : '')
        + ((n.related_major_names || []).length ? diffTags('관련학과', n.related_major_names) : '')
        + '</section>';
    }

    var chg = '';
    if (it.k === 'common' && it.chg) {
      var rows = [];
      if (it.chg.cls && o.field && n.group) rows.push('<p><b>분류</b> ' + esc(o.field) + ' → ' + esc(n.group) + '</p>');
      if (it.chg.add.length) rows.push(diffTags('유사직업 추가', it.chg.add));
      if (it.chg.rm.length) rows.push(diffTags('유사직업 제외', it.chg.rm));
      if (rows.length) chg = '<section class="chg"><h4>개편 전후 변화</h4>' + rows.join('') + '</section>';
    }

    var url = (it.k !== 'old' && n.source_url) || o.official_url || '';
    var links = url
      ? '<a class="go" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">커리어넷 공식 페이지<small>새 창</small></a>'
      : '';
    if (it.k !== 'old') {
      links += '<a class="go" href="../decalcomania/?q=' + encodeURIComponent(it.name) + '">커리어데칼코마니에서 이어보기<small>학과·직업 연결</small></a>';
    }
    var oldNote = it.k === 'old'
      ? '<p class="note">신버전 직업백과 데이터셋(552건)에 같은 이름의 직업이 없습니다. 통합·명칭 변경 여부는 커리어넷 원문에서 확인하세요.</p>'
      : '';
    $('detK').textContent = '개편 비교 상세';
    $('detBody').innerHTML = '<h2>' + esc(it.name) + '</h2>'
      + (meta.length ? '<p class="op">' + meta.join(' ') + '</p>' : '')
      + '<div class="cmp">' + body + '</div>'
      + chg + oldNote
      + '<p class="note">값은 각 데이터셋이 준 사실 그대로입니다. 「하는 일」 같은 설명문은 두 데이터셋 모두 이용약관상 싣지 않으며, 구버전과 신버전의 연봉은 조사 시점·방법이 다르므로 수치를 나란히 볼 때 그 차이를 함께 봐야 합니다.</p>'
      + links;
  }

  function detail(it) {
    if (tab === 'diff') { diffDetail(it); return; }
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
    ['job', 'diff', 'major', 'high'].forEach(function (k) {
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
    Promise.all([load('job'), load('diff'), load('major'), load('high')]).then(function () {
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
