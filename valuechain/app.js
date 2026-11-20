/* app.js — 산업별 공정·밸류체인 지도
 *
 * 자료는 ./data/industries.json 하나다(build_industries.py가 만든다).
 * 단계·기업·직무·연계 주소는 모두 그 파일이 정한 값만 쓴다 — 화면에서 기업이나 직무를 지어내지 않는다.
 *
 * 주소: ?i=<산업 id>&s=<단계 번호>  (없으면 첫 산업·첫 단계)
 * 화면: 왼쪽(큰 화면) 산업 색인 · 오른쪽 위 단계 레일 · 아래 단계 상세(하는 일·상담 팁·직무·기업)
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var D = null, ST = { ind: null, step: 1 }, NA = '—';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) {
    return (n == null || n === '') ? '' : Number(n).toLocaleString('ko-KR');
  }
  function q(s) { return encodeURIComponent(String(s)); }

  function byId(id) {
    for (var i = 0; i < D.industries.length; i++) if (D.industries[i].id === id) return D.industries[i];
    return null;
  }

  /* ── 산업 색인 ── */
  function renderInds() {
    $('inds').innerHTML = D.industries.map(function (it) {
      var on = it.id === ST.ind;
      return '<button type="button" class="ind" data-ind="' + esc(it.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="n">' + esc(it.no) + '</span><span class="nm">' + esc(it.short) + '</span>' +
        '<span class="ct">' + it.steps.length + '단계</span></button>';
    }).join('');
  }

  /* ── 산업 머리 ── */
  function renderHead(it) {
    $('iName').textContent = it.name;
    $('iEn').textContent = it.en || '';
    $('iTag').textContent = it.tagline || '';
    $('iStruct').textContent = it.structure || '';

    var r = $('iRoles');
    if (it.roles && it.roles.length) {
      r.innerHTML = it.roles.map(function (x) {
        var cs = (x.comps || []).map(function (cid) {
          var c = D.companies[cid];
          if (!c) return '';
          return '<a href="../company/#' + esc(cid) + '">' + esc(c.name) + '</a>';
        }).filter(Boolean).join('<span aria-hidden="true"> · </span>');
        return '<span class="r"><b>' + esc(x.role) + '</b>' + (cs || '<span class="none">명함첩 수록 없음</span>') + '</span>';
      }).join('');
      r.hidden = false;
    } else {
      r.innerHTML = '';
      r.hidden = true;
    }

    var L = [];
    (it.thermo || []).forEach(function (t) {
      L.push('<a href="../thermometer/?i=' + q(t.id) + '"><span class="k">온도계</span>' + esc(t.name) + '</a>');
    });
    L.push('<a href="../work-filter/?q=' + q(it.wfq) + '"><span class="k">근무환경</span>' + esc(it.wfq) + '</a>');
    (it.terms || []).forEach(function (t) {
      L.push('<a href="../translator/?q=' + q(t.w) + '"><span class="k">용어</span>' + esc(t.w) + '</a>');
    });
    $('iLinks').innerHTML = L.join('');
  }

  /* ── 단계 레일 ── */
  function renderRail(it) {
    $('rail').innerHTML = it.steps.map(function (s) {
      var on = s.no === ST.step;
      return '<button type="button" class="stp" data-step="' + s.no + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="n">' + s.no + '</span><span class="nm">' + esc(s.name) + '</span></button>';
    }).join('');
    var cur = $('rail').querySelector('[aria-pressed="true"]');
    if (cur && cur.scrollIntoView) {
      // 고른 단계가 레일 밖으로 밀려 있으면 보이는 자리로 (세로 스크롤은 건드리지 않는다)
      var rl = $('rail');
      var dx = cur.offsetLeft - rl.scrollLeft;
      if (dx < 0 || dx + cur.offsetWidth > rl.clientWidth) rl.scrollLeft = Math.max(0, cur.offsetLeft - 12);
    }
  }

  /* ── 단계 상세 ── */
  function renderStep(it) {
    var s = it.steps[ST.step - 1];
    if (!s) { $('det').innerHTML = ''; return; }
    var last = it.steps.length;

    var jobs = (s.jobs || []).map(function (j) {
      return '<a href="../taxonomy/?q=' + q(j) + '">' + esc(j) + '<span class="ar" aria-hidden="true">↗</span></a>';
    }).join('');

    var cos = (s.comps || []).map(function (cid) {
      var c = D.companies[cid];
      if (!c) return '';
      var meta = [c.cat || '', c.ind || '', c.emp ? '직원 ' + num(c.emp) + '명' : ''].filter(Boolean).join(' · ');
      return '<a class="co" href="../company/#' + esc(cid) + '">' +
        '<span class="nm">' + esc(c.name) + '</span>' +
        '<span class="cat">' + esc(c.cat || '기업') + '</span>' +
        '<span class="mt">' + esc(meta) + '</span></a>';
    }).filter(Boolean).join('');

    $('det').innerHTML =
      '<div class="dh"><span class="dn">단계 ' + s.no + ' / ' + last + '</span><h3>' + esc(s.name) + '</h3>' +
      '<span class="dw">직무 ' + (s.jobs || []).length + ' · 기업 ' + (s.comps || []).length + '</span></div>' +
      '<div class="grid2">' +
        '<div>' +
          '<div class="blk"><h4>핵심 하는 일</h4><p>' + esc(s.what) + '</p></div>' +
          '<div class="blk tip" style="margin-top:8px"><h4>상담 팁</h4><p>' + esc(s.tip) + '</p></div>' +
        '</div>' +
        '<div>' +
          '<div class="blk"><h4>투입 직무 <span class="c">NCS 세분류로 열기</span></h4>' +
            (jobs ? '<div class="chips">' + jobs + '</div>' : '<p class="none">이 단계에 걸어 둔 직무 이름이 없습니다.</p>') +
          '</div>' +
          '<div class="blk" style="margin-top:8px"><h4>이 단계의 기업 <span class="c">명함첩에서 열기</span></h4>' +
            (cos ? '<div class="cos">' + cos + '</div>'
                 : '<p class="none">명함첩에 수록된 기업이 없는 단계입니다 — 위 설명과 용어로만 다룹니다.</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pager">' +
        '<button type="button" data-move="-1"' + (ST.step <= 1 ? ' disabled' : '') + '>← 이전 단계</button>' +
        '<button type="button" data-move="1"' + (ST.step >= last ? ' disabled' : '') + '>다음 단계 →</button>' +
        '<span class="pos">' + s.no + ' / ' + last + '</span>' +
      '</div>';
  }

  function render() {
    var it = byId(ST.ind) || D.industries[0];
    ST.ind = it.id;
    if (ST.step < 1) ST.step = 1;
    if (ST.step > it.steps.length) ST.step = it.steps.length;
    Array.prototype.forEach.call($('inds').children, function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ind') === ST.ind ? 'true' : 'false');
    });
    renderHead(it);
    renderRail(it);
    renderStep(it);
  }

  function go(indId, stepNo) {
    if (indId) {
      var it = byId(indId);
      if (it) {
        if (it.id !== ST.ind) ST.step = 1;
        ST.ind = it.id;
      }
    }
    if (stepNo) {
      var cur = byId(ST.ind);
      var n = parseInt(stepNo, 10);
      if (n >= 1 && n <= cur.steps.length) ST.step = n;
    }
    render();
    var h = '#i=' + q(ST.ind) + '&s=' + ST.step;
    try { history.replaceState(null, '', location.pathname + '?' + h.slice(1)); } catch (e) { }
  }

  /* ── 방법·출처 ── */
  function renderMore() {
    var m = D.meta || {};
    var src = (D.sources || []).map(function (s) {
      return '<li><b>' + esc(s.name) + '</b> — ' + esc(s.used_for) + ' · ' + esc(s.as_of) +
        ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">원문</a></li>';
    }).join('');
    var b = m.basis || {};
    $('moreIn').innerHTML =
      '<p>' + esc(m.notice || '') + '</p>' +
      '<p><b>단계(공정)</b> — ' + esc(b.structure || '') + '</p>' +
      '<p><b>기업</b> — ' + esc(b.company || '') + '</p>' +
      '<p><b>직무</b> — ' + esc(b.job || '') + '</p>' +
      '<p><b>연계</b> — ' + esc(b.thermometer || '') + ' / ' + esc(b.work_filter || '') + ' / ' + esc(b.translator || '') + '</p>' +
      '<p><b>출처</b></p><ul>' + src + '</ul>';
    $('vcNote').textContent = '산업 ' + D.meta.counts.industries + ' · 단계 ' + D.meta.counts.steps +
      ' · 명함첩 기업 ' + D.meta.counts.companies + ' · 직무 연결 ' + D.meta.counts.jobs +
      ' — ' + (D.meta.generated_at || '');
  }

  function fail() {
    $('vcNote').textContent = '자료를 불러오지 못했습니다.';
    $('det').innerHTML = '<p class="load">단계 자료를 불러오지 못했습니다. 잠시 뒤 새로 고치면 대개 다시 열립니다.</p>';
  }

  /* ── 사건 ── */
  $('inds').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ind]');
    if (b) go(b.getAttribute('data-ind'), 1);
  });
  $('rail').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (b) go(null, b.getAttribute('data-step'));
  });
  $('rail').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    var it = byId(ST.ind);
    var n = ST.step + (e.key === 'ArrowRight' ? 1 : -1);
    if (n < 1 || n > it.steps.length) return;
    go(null, n);
    var b = $('rail').querySelector('[data-step="' + n + '"]');
    if (b) b.focus();
  });
  $('det').addEventListener('click', function (e) {
    var b = e.target.closest('[data-move]');
    if (!b || b.disabled) return;
    go(null, ST.step + parseInt(b.getAttribute('data-move'), 10));
  });

  /* ── 시작 ── */
  fetch('./data/industries.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      if (!d || !d.industries || !d.industries.length) throw 0;
      D = d;
      var p = new URLSearchParams(location.search);
      var wantInd = (p.get('i') || '').trim(), wantStep = (p.get('s') || '').trim();
      ST.ind = (wantInd && byId(wantInd)) ? wantInd : d.industries[0].id;
      ST.step = parseInt(wantStep, 10) || 1;
      renderInds();
      renderMore();
      render();
    })
    .catch(fail);
})();
