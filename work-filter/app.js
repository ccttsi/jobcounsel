/* 직업 현실 리얼 필터 — 화면 로직
 *
 * 자료는 셋뿐이다.
 *   data/work-context.json — 직무(KSCO 8차 세분류)마다 O*NET 근무환경 여섯 축(0~100)
 *   data/clusters.json     — 기업 명함첩 주소를 시군구로 묶은 산업 분야·지역 집계
 *   data/job-fields.json   — 직무 이름에 산업 분야 낱말이 겹칠 때만 잇는 참고 연결
 *
 * 값을 지어내지 않는다: 축 값이 null이면 그 축 조건에는 걸리지 않게 하고 화면에 「지표 없음」으로 적는다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    levels: {},        // 축 id → 'lo' | 'mid' | 'hi'
    q: '',
    page: 1,
    sel: null,
    tab: 0,
    who: null,
    cmode: 'field',
    csel: null,
    cq: '',
    preset: null
  };
  var DATA = { axes: [], jobs: [], fields: [], regions: [], links: {}, meta: null };
  var PAGE_SIZE = 24;
  // 「낮은 편·보통·높은 편」의 경계는 자료(axis.cuts)에서 온다 — 축마다 직무들을 값 순서로 3등분한 값.
  var LEVELS = [
    { id: 'lo', name: '낮은 편' },
    { id: 'mid', name: '보통' },
    { id: 'hi', name: '높은 편' }
  ];
  var WHO_CHOICES = [
    { id: 'customers', name: '외부 고객', full: '외부 고객·대중' },
    { id: 'care', name: '돌봄·지도', full: '돌봄·지도 대상' },
    { id: 'internal', name: '내부 팀', full: '내부 팀·동료' },
    { id: 'alone', name: '단독 집중', full: '대면 적은 단독 집중' },
    { id: 'conflict', name: '민원·갈등', full: '민원·갈등 응대 잦음' }
  ];
  var PRESETS = [
    { id: 'desk', name: '사무·컴퓨터 중심', levels: { screen: 'hi', field: 'lo' } },
    { id: 'people', name: '사람 만나는 일', levels: { people: 'hi' } },
    { id: 'field', name: '현장·야외', levels: { field: 'hi' } },
    { id: 'alone', name: '혼자 하는 일', levels: { people: 'lo', team: 'lo' } },
    { id: 'noshift', name: '교대 없이', levels: { shift: 'lo' } },
    { id: 'notravel', name: '이동 적은 일', levels: { travel: 'lo' } }
  ];

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function n(value) { return Math.round(value); }
  function round1(value) { return (Math.round(value * 10) / 10).toFixed(1); }
  function q(text) { return encodeURIComponent(text); }

  /* ---------------------------------------------------------------- 자료 */
  function loadJson(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  function boot() {
    Promise.all([loadJson('data/work-context.json'), loadJson('data/clusters.json'), loadJson('data/job-fields.json')])
      .then(function (docs) {
        var wc = docs[0], cl = docs[1], jf = docs[2];
        DATA.axes = wc.axes || [];
        DATA.whoTypes = {};
        (wc.who_types || []).forEach(function (w) { DATA.whoTypes[w.id] = w; });
        DATA.jobs = wc.jobs || [];
        DATA.meta = wc;
        DATA.fields = (cl.fields || []).filter(function (f) { return f.total > 0; });
        DATA.regions = cl.regions || [];
        DATA.clusterMeta = cl;
        DATA.links = jf.links || {};
        DATA.jobs.sort(function (a, b) {
          var am = (a.missing || []).length === 0 ? 0 : 1;
          var bm = (b.missing || []).length === 0 ? 0 : 1;
          return am - bm || String(a.ksco).localeCompare(String(b.ksco));
        });
        DATA.axes.forEach(function (axis) { state.levels[axis.id] = null; });

        var initial = '';
        try { initial = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) {}
        if (initial) { state.q = initial; $('q').value = initial; }

        buildPresets();
        buildWhoStrip();
        buildFilters();
        renderJobs();
        renderClusterList();
        pickDefault();
      })
      .catch(function (err) {
        $('list').innerHTML = '<p class="empty">자료를 불러오지 못했습니다. <b>잠시 뒤 새로 고치면</b> 대개 다시 열립니다.</p>';
        $('count').textContent = '–';
        if (window.console) console.error(err);
      });
  }

  function pickDefault() {
    var first = DATA.jobs.filter(function (job) { return (job.missing || []).length === 0; })[0] || DATA.jobs[0];
    if (!first) return;
    state.sel = first.id;
    renderDetail();
    renderJobs();
  }

  /* ---------------------------------------------------------------- 사례 */
  function buildPresets() {
    var box = $('presets');
    var frag = document.createDocumentFragment();
    PRESETS.forEach(function (preset) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ps';
      b.textContent = preset.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var same = state.preset === preset.id;
        state.preset = same ? null : preset.id;
        DATA.axes.forEach(function (axis) {
          state.levels[axis.id] = same ? null : (preset.levels[axis.id] || null);
        });
        state.page = 1;
        renderAll();
      });
      frag.appendChild(b);
    });
    box.appendChild(frag);
  }

  function syncPresets() {
    var buttons = $('presets').children;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(PRESETS[i].id === state.preset));
    }
  }

  /* ---------------------------------------------------------------- 주로 만나는 사람 */
  function buildWhoStrip() {
    var box = $('whoStrip');
    var html = '<span class="lb">만나는 사람</span>';
    WHO_CHOICES.forEach(function (choice) {
      html += '<button type="button" class="who-chip" data-who="' + choice.id + '" aria-pressed="false" title="' +
        choice.full + ' · 다시 누르면 풀립니다">' + choice.name + '</button>';
    });
    box.innerHTML = html;
    box.addEventListener('click', function (event) {
      var target = event.target.closest('button[data-who]');
      if (!target) return;
      var value = target.getAttribute('data-who') || null;
      state.who = (state.who === value) ? null : value;
      state.page = 1;
      syncWhoStrip();
      renderJobs();
    });
  }

  function syncWhoStrip() {
    var buttons = $('whoStrip').querySelectorAll('button[data-who]');
    for (var i = 0; i < buttons.length; i++) {
      var value = buttons[i].getAttribute('data-who') || null;
      buttons[i].setAttribute('aria-pressed', String(!!value && value === state.who));
    }
  }

  /* ---------------------------------------------------------------- 조건 */
  function axisButtons(axis) {
    var cuts = axis.cuts || [33.3, 66.6];
    var titles = [cuts[0] + ' 이하', cuts[0] + ' 초과 ~ ' + cuts[1] + ' 이하', cuts[1] + ' 초과'];
    var html = '<div class="seg" role="group" aria-label="정도 (다시 누르면 풀립니다)">';
    LEVELS.forEach(function (lv, i) {
      html += '<button type="button" data-lv="' + lv.id + '" aria-pressed="false" title="' + titles[i] + '">' + lv.name + '</button>';
    });
    return html + '</div>';
  }

  function buildFilters() {
    [$('axList'), $('sheetBody')].forEach(function (host) {
      host.innerHTML = '';
      var frag = document.createDocumentFragment();
      DATA.axes.forEach(function (axis) {
        var box = document.createElement('div');
        box.className = 'ax';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-labelledby', 'ax-' + axis.id + '-' + (host.id || 'x'));
        box.dataset.axis = axis.id;
        box.title = axis.name + ' — ' + axis.question;
        box.setAttribute('aria-description', axis.question);
        box.innerHTML =
          '<div class="ax-h"><b id="ax-' + axis.id + '-' + (host.id || 'x') + '">' + esc(axis.name) + '</b>' +
          '<span class="ax-q">' + esc(axis.left) + ' ↔ ' + esc(axis.right) + '</span></div>' +
          axisButtons(axis);
        box.addEventListener('click', function (event) {
          var target = event.target.closest('button[data-lv]');
          if (!target) return;
          var lv = target.getAttribute('data-lv') || null;
          state.levels[axis.id] = (state.levels[axis.id] === lv) ? null : lv;
          state.preset = null;
          state.page = 1;
          renderAll();
        });
        frag.appendChild(box);
      });
      host.appendChild(frag);
    });
    syncFilters();
  }

  function renderSelected() {
    var box = $('selBox');
    var chosen = DATA.axes.filter(function (axis) { return !!state.levels[axis.id]; });
    if (!chosen.length) {
      box.innerHTML = '<span class="f-sel-k">지금 건 조건</span><p>아직 없습니다. 위에서 고르거나 위쪽 사례 단추를 눌러 보세요.</p>';
      return;
    }
    var html = '<span class="f-sel-k">지금 건 조건</span><ul>';
    chosen.forEach(function (axis) {
      var level = LEVELS.filter(function (lv) { return lv.id === state.levels[axis.id]; })[0];
      html += '<li>' + esc(axis.name) + ' ' + esc(level ? level.name : '') +
        '<button type="button" data-off="' + axis.id + '" aria-label="' + esc(axis.name) + ' 조건 풀기">×</button></li>';
    });
    box.innerHTML = html + '</ul>';
    box.addEventListener('click', function (event) {
      var target = event.target.closest('button[data-off]');
      if (!target) return;
      state.levels[target.getAttribute('data-off')] = null;
      state.preset = null;
      state.page = 1;
      renderAll();
    });
  }

  function syncFilters() {
    var hosts = [$('axList'), $('sheetBody')];
    var chosen = 0;
    hosts.forEach(function (host) {
      var boxes = host.querySelectorAll('.ax');
      for (var i = 0; i < boxes.length; i++) {
        var box = boxes[i];
        var lv = state.levels[box.dataset.axis] || '';
        if (lv) chosen = Math.max(chosen, 0);
        box.dataset.on = lv ? '1' : '0';
        var buttons = box.querySelectorAll('button[data-lv]');
        for (var j = 0; j < buttons.length; j++) {
          var on = (buttons[j].getAttribute('data-lv') || '') === lv;
          buttons[j].setAttribute('aria-pressed', String(on));
        }
      }
    });
    var count = DATA.axes.filter(function (a) { return !!state.levels[a.id]; }).length;
    $('mCond').textContent = String(count);
    syncPresets();
    renderSelected();
  }

  /* ---------------------------------------------------------------- 거르기 */
  function inLevel(value, levelId, axis) {
    var cuts = (axis && axis.cuts) || [33.3, 66.6];
    if (levelId === 'lo') return value <= cuts[0];
    if (levelId === 'mid') return value > cuts[0] && value <= cuts[1];
    if (levelId === 'hi') return value > cuts[1];
    return true;
  }

  function axisConditionCount() {
    return DATA.axes.filter(function (a) { return !!state.levels[a.id]; }).length;
  }

  function filteredJobs() {
    var text = state.q.trim().toLowerCase();
    return DATA.jobs.filter(function (job) {
      for (var i = 0; i < DATA.axes.length; i++) {
        var axis = DATA.axes[i];
        var level = state.levels[axis.id];
        if (!level) continue;
        var value = job.profile[axis.id];
        if (value == null) return false;
        if (!inLevel(value, level, axis)) return false;
      }
      if (state.who) {
        var who = job.who || {};
        if (state.who === 'conflict') {
          if (!who.conflict) return false;
        } else if (who.primary !== state.who) {
          return false;
        }
      }
      if (text) {
        var hay = (job.name + ' ' + (job.keco_name || []).join(' ') + ' ' + (job.ksco_middle || '')).toLowerCase();
        if (hay.indexOf(text) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------------------------------------------------------- 목록 */
  function bars(job) {
    var out = '<span class="jc-bars" aria-hidden="true">';
    DATA.axes.forEach(function (axis) {
      var v = job.profile[axis.id];
      out += '<i style="--v:' + (v == null ? 0 : n(v)) + '%"></i>';
    });
    return out + '</span>';
  }

  function renderJobs() {
    var rows = filteredJobs();
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var page = rows.slice(start, start + PAGE_SIZE);

    if (total && !rows.some(function (job) { return job.id === state.sel; })) {
      state.sel = rows[0].id;
      renderDetail();
    }
    $('count').innerHTML = '직무 <b>' + total + '</b> / ' + DATA.jobs.length;
    $('pageN').textContent = state.page + ' / ' + pages;
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= pages;

    if (!total) {
      $('list').innerHTML = '<p class="empty">조건에 맞는 직무가 없습니다. <b>조건을 하나 풀어 보세요.</b> 축 값을 여섯 개 다 걸면 남는 직무가 거의 없습니다.</p>';
      return;
    }

    var frag = document.createDocumentFragment();
    page.forEach(function (job) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jc';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(job.id === state.sel));
      b.setAttribute('aria-current', job.id === state.sel ? 'true' : 'false');
      b.dataset.id = job.id;
      var meta = job.keco_name && job.keco_name.length ? job.keco_name[0] : (job.ksco_middle || '');
      b.innerHTML = '<span class="jc-n">' + esc(job.name) + '</span>' + bars(job) +
        '<span class="jc-m">' + esc(job.ksco) + ' · ' + esc(meta) + '</span>';
      b.addEventListener('click', function () {
        state.sel = job.id;
        renderDetail();
        renderJobs();
        if (window.matchMedia('(max-width:1023px)').matches) openSheet('detail', '직무 상세');
      });
      frag.appendChild(b);
    });
    $('list').innerHTML = '';
    $('list').appendChild(frag);
  }

  /* ---------------------------------------------------------------- 상세 */
  function axisDetailHTML(job) {
    var out = '<div class="axr">';
    DATA.axes.forEach(function (axis) {
      var v = job.profile[axis.id];
      var has = v != null;
      out += '<div class="axr-row">' +
        '<div class="axr-top"><b>' + esc(axis.name) + '</b>' +
        '<span class="axr-v">' + (has ? n(v) : '—') + (has ? '<small>/100</small>' : '') + '</span></div>' +
        (has
          ? '<div class="bar"><i style="width:' + n(v) + '%"></i></div>'
          : '<p class="basis">지표 없음 — O*NET에 이 축의 응답이 없습니다.</p>') +
        '<div class="axr-ends"><span>' + esc(axis.left) + '</span><span>' + esc(axis.right) + '</span></div>' +
        '</div>';
    });
    return out + '</div>';
  }

  function whoLabel(id) {
    var type = DATA.whoTypes[id];
    if (type) return type.name;
    if (id === 'alone') return '대면 적은 단독 집중';
    if (id === 'mixed') return '여러 대상과 고루';
    return '';
  }

  function whoHTML(job) {
    var who = job.who;
    if (!who || !who.primary) {
      return '<div class="sect"><span class="sect-k">주로 만나는 사람</span>' +
        '<p class="nodata">O*NET 응답이 없어 만나는 대상을 가릴 수 없습니다.</p></div>';
    }
    var scores = who.scores || {};
    var label = whoLabel(who.primary);
    var main = scores[who.primary];
    var html = '<div class="sect"><span class="sect-k">주로 만나는 사람</span>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">' +
      '<span class="who-badge">' + esc(label) + (main != null ? '<b>' + n(main) + '/100</b>' : '') + '</span>' +
      (who.conflict ? '<span class="who-tag">민원·갈등 응대 잦음</span>' : '') +
      '</div><div style="display:grid;gap:5px;margin-top:8px">';
    ['customers', 'care', 'internal', 'conflict'].forEach(function (id) {
      var type = DATA.whoTypes[id];
      var value = scores[id];
      var name = type ? type.short : id;
      html += '<div class="who-row"><b>' + esc(name) + '</b>' +
        '<span class="track"><i class="' + (id === 'conflict' ? 'soft' : '') + '" style="width:' + (value == null ? 0 : n(value)) + '%"></i></span>' +
        '<span class="v">' + (value == null ? '—' : n(value)) + '</span></div>';
    });
    html += '</div>' +
      '<details style="margin-top:6px"><summary style="min-height:44px;display:flex;align-items:center;font-size:12px;font-weight:700;color:var(--muted)">O*NET 근거 항목 보기</summary><ul class="exlist" style="margin-top:2px">';
    ['customers', 'care', 'internal', 'conflict'].forEach(function (id) {
      var type = DATA.whoTypes[id];
      if (!type) return;
      html += '<li>' + esc(type.name) + ' — ' + type.items.map(function (item) { return esc(item.name); }).join(', ') + '</li>';
    });
    html += '</ul><p class="src" style="margin-top:4px">네 점수는 다른 직무들과 견줘 어느 쪽이 두드러지는지로 대표를 고릅니다. 타인 접촉이 가장 낮은 편이면 「단독 집중」입니다.</p></details></div>';
    return html;
  }

  function clusterHTML(job) {
    var hits = DATA.links[job.id] || [];
    if (!hits.length) {
      return '<div class="sect"><span class="sect-k">지역·산업 클러스터</span>' +
        '<p class="nodata">이 직무 이름에 겹치는 산업 분야가 없어 지역 클러스터를 싣지 않습니다. 기업 명함첩에서 직접 찾아보세요.</p>' +
        '<div class="links"><a class="lk" href="../company/?q=' + q(job.name) + '">' + linkIcon() + '기업 명함첩에서 「' + esc(job.name) + '」 찾기</a></div></div>';
    }
    var out = '<div class="sect"><span class="sect-k">지역·산업 클러스터 · 기업 명함첩 실데이터</span>';
    hits.forEach(function (hit) {
      var field = DATA.fields.filter(function (f) { return f.id === hit.field; })[0];
      if (!field) return;
      out += '<div class="ck"><div class="ck-h"><b>' + esc(field.name) + '</b>' +
        '<span class="ck-n">' + field.total + '곳 · 주소 ' + field.with_address + '곳</span></div>';
      if (field.regions.length) {
        out += '<ul class="ck-r">';
        field.regions.slice(0, 4).forEach(function (region) {
          out += '<li><span>' + esc(region.region) + '</span><span>' + region.companies + '곳</span></li>';
        });
        out += '</ul>';
      } else {
        out += '<p class="basis">주소가 공개된 기업이 없어 지역 집계를 싣지 않습니다.</p>';
      }
      out += '<div class="links" style="margin-top:6px"><a class="lk" href="../company/?q=' + q(field.name) + '">' + linkIcon() + '기업 명함첩에서 보기</a></div>';
      out += '<p class="src">직무 이름에 「' + esc(hit.basis) + '」가 겹쳐 이은 참고 연결입니다. 공식 직무↔산업 매핑이 아닙니다.</p>';
      out += '</div>';
    });
    return out + '</div>';
  }

  function linkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.6-5.6L11 8"/><path d="M14 10a4 4 0 0 0-6-.5l-2 2A4 4 0 0 0 11.6 17L13 16"/></svg>';
  }

  function detailHTML(job) {
    var isco = (job.isco || []).join(' · ');
    var keco = (job.keco_name || []).join(' · ');
    var out = '<div class="d-k"><b>KSCO ' + esc(job.ksco) + '</b>' +
      (job.keco && job.keco.length ? '<span>KECO ' + esc(job.keco.join('·')) + '</span>' : '<span>KECO 연계 없음</span>') +
      '</div>' +
      '<h2 class="d-name">' + esc(job.name) + '</h2>' +
      '<p class="d-sub">' + esc(job.ksco_middle || '') + (keco ? ' · 고용24 ' + esc(keco) : '') + (isco ? ' · ISCO ' + esc(isco) : '') + '</p>' +
      axisDetailHTML(job) +
      whoHTML(job) +
      '<div class="sect"><span class="sect-k">이 값의 근거</span>' +
      '<p class="basis">O*NET 31.0 직업 <b>' + job.onet_n + '개</b>의 응답을 평균했습니다(한 직업이 여러 ISCO 분류로 갈리면 그 수만큼 무게를 나눔). 축 값은 0~100으로 환산한 값입니다.</p>' +
      '<ul class="exlist">' + (job.onet_examples || []).map(function (title) { return '<li>' + esc(title) + '</li>'; }).join('') + '</ul>' +
      '<details style="margin-top:6px"><summary style="min-height:44px;display:flex;align-items:center;font-size:12px;font-weight:700;color:var(--muted)">축을 만든 O*NET 항목 보기</summary>' +
      '<ul class="exlist" style="margin-top:2px">' + DATA.axes.map(function (axis) {
        return '<li>' + esc(axis.name) + ' — ' + axis.items.map(function (item) { return esc(item.name); }).join(', ') + '</li>';
      }).join('') + '</ul></details></div>' +
      clusterHTML(job) +
      '<div class="sect"><span class="sect-k">이어 보기</span><div class="links">' +
      '<a class="lk" href="../taxonomy/?q=' + q(job.name) + '">' + linkIcon() + '분류 교차 사전</a>' +
      '<a class="lk" href="../company/?q=' + q(job.name) + '">' + linkIcon() + '기업 명함첩</a>' +
      '<a class="lk" href="../translator/?q=' + q(keywordOf(job)) + '">' + linkIcon() + '언어 번역기</a>' +
      '<a class="lk" href="../kdt-calc/">' + linkIcon() + '국비지원 계산기</a>' +
      '<a class="lk" href="../flow/">' + linkIcon() + '상담 플로우</a>' +
      '</div></div>' +
      '<p class="src"><b>출처</b> O*NET® 31.0 Database(USDOL/ETA, CC BY 4.0) · KSCO 8차↔ISCO-08 연계표(국가데이터처) · KECO 2025(한국고용정보원) · 기업 명함첩(공정위·알리오·중견기업정보마당·행안부)에서 자료실이 계산. O*NET 값은 미국 직업 응답이라 한국의 같은 이름 직무와 100% 같지 않습니다.</p>';
    return out;
  }

  function keywordOf(job) {
    var hits = DATA.links[job.id];
    if (hits && hits.length) return hits[0].basis;
    return job.name;
  }

  function renderDetail() {
    var job = DATA.jobs.filter(function (j) { return j.id === state.sel; })[0];
    var box = $('detail');
    if (!job) {
      box.innerHTML = '<div class="d-empty"><p>왼쪽 목록에서 직무를 누르면 <b>근무환경 여섯 축</b>과 <b>지역 클러스터</b>가 여기 열립니다.</p></div>';
      return;
    }
    box.innerHTML = detailHTML(job);
  }

  /* ---------------------------------------------------------------- 시트 */
  var sheetKind = null;

  function openSheet(kind, title, html) {
    sheetKind = kind;
    $('sheetTitle').textContent = title || (kind === 'filters' ? '근무 조건' : kind === 'cluster' ? '지역·산업 클러스터' : '직무 상세');
    $('sheetReset').hidden = kind !== 'filters';
    if (kind === 'filters') {
      $('sheetBody').innerHTML = '';
      $('sheetBody').appendChild($('axList').cloneNode(true));
      bindSheetAxes();
      syncSheetAxes();
    } else if (kind === 'cluster') {
      $('sheetBody').innerHTML = html || '';
    } else {
      var job = DATA.jobs.filter(function (j) { return j.id === state.sel; })[0];
      $('sheetBody').innerHTML = job ? detailHTML(job) : '';
    }
    $('sheet').hidden = false;
    document.body.setAttribute('data-sheet', kind);
    requestAnimationFrame(function () { $('sheet').classList.add('open'); });
  }

  function closeSheet() {
    $('sheet').classList.remove('open');
    document.body.removeAttribute('data-sheet');
    var done = function () { $('sheet').hidden = true; $('sheetBody').innerHTML = ''; };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 270);
    sheetKind = null;
  }

  function bindSheetAxes() {
    var boxes = $('sheetBody').querySelectorAll('.ax');
    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        box.addEventListener('click', function (event) {
          var target = event.target.closest('button[data-lv]');
          if (!target) return;
          var lv = target.getAttribute('data-lv') || null;
          state.levels[box.dataset.axis] = (state.levels[box.dataset.axis] === lv) ? null : lv;
          state.preset = null;
          state.page = 1;
          renderAll();
          syncSheetAxes();
        });
      })(boxes[i]);
    }
  }

  function syncSheetAxes() {
    var boxes = $('sheetBody').querySelectorAll('.ax');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var lv = state.levels[box.dataset.axis] || '';
      box.dataset.on = lv ? '1' : '0';
      var buttons = box.querySelectorAll('button[data-lv]');
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].setAttribute('aria-pressed', String((buttons[j].getAttribute('data-lv') || '') === lv));
      }
    }
  }

  /* ---------------------------------------------------------------- 클러스터 */
  function renderClusterList() {
    var text = state.cq.trim().toLowerCase();
    var rows;
    if (state.cmode === 'field') {
      rows = DATA.fields.filter(function (f) { return !text || f.name.toLowerCase().indexOf(text) >= 0; });
      $('cHint').textContent = '기업 명함첩 ' + DATA.clusterMeta.totals.companies + '곳 중 업종이 있는 ' + DATA.clusterMeta.totals.companies_with_industry + '곳을 분야로 묶음';
    } else {
      rows = DATA.regions.filter(function (r) { return !text || r.region.toLowerCase().indexOf(text) >= 0; });
      $('cHint').textContent = '주소를 시군구로 묶어 기업 5곳 이상인 ' + DATA.regions.length + '곳';
    }
    if (!state.csel || !rows.some(function (r) { return (r.id || r.region) === state.csel; })) {
      state.csel = rows.length ? (rows[0].id || rows[0].region) : null;
    }
    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var key = row.id || row.region;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'crow';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(key === state.csel));
      b.setAttribute('aria-current', key === state.csel ? 'true' : 'false');
      if (state.cmode === 'field') {
        b.innerHTML = '<b>' + esc(row.name) + '</b><span>' + row.total + '곳</span><small>주소 공개 ' + row.with_address + '곳 · ' + row.region_count + '개 시군구</small>';
      } else {
        b.innerHTML = '<b>' + esc(row.region) + '</b><span>' + row.total + '곳</span><small>' + esc(row.fields[0] ? row.fields[0].name + ' 외 ' + Math.max(0, row.fields.length - 1) + '개 분야' : '') + '</small>';
      }
      b.addEventListener('click', function () {
        state.csel = key;
        renderClusterList();
        renderClusterDetail();
        if (window.matchMedia('(max-width:767px)').matches) {
          openSheet('cluster', '지역·산업 클러스터', $('cdetail').innerHTML);
        }
      });
      frag.appendChild(b);
    });
    $('clist').innerHTML = '';
    if (!rows.length) {
      $('clist').innerHTML = '<p class="empty">찾는 이름이 없습니다. <b>다른 낱말로</b> 찾아보세요.</p>';
    } else {
      $('clist').appendChild(frag);
    }
    renderClusterDetail();
  }

  function renderClusterDetail() {
    var box = $('cdetail');
    if (!state.csel) {
      box.innerHTML = '<div class="d-empty"><p>왼쪽에서 산업 분야나 지역을 고르면 <b>기업 수와 지역 분포</b>가 여기 열립니다.</p></div>';
      return;
    }
    if (state.cmode === 'field') {
      var field = DATA.fields.filter(function (f) { return f.id === state.csel; })[0];
      if (!field) { box.innerHTML = ''; return; }
      var max = field.regions.length ? field.regions[0].companies : 1;
      var html = '<div><div class="d-k"><b>산업 분야</b><span>기업 명함첩 집계</span></div>' +
        '<h2 class="d-name">' + esc(field.name) + '</h2>' +
        '<p class="d-sub">기업 ' + field.total + '곳 · 주소 공개 ' + field.with_address + '곳 · ' + field.region_count + '개 시군구</p>' +
        (field.total > 0 && field.with_address / field.total < 0.6
          ? '<p class="nodata">주소가 공개된 기업이 ' + field.with_address + '/' + field.total + '곳뿐이라 지역 분포는 일부만 보입니다.</p>'
          : '') +
        '<div class="sect"><span class="sect-k">기업이 많은 지역</span>' +
        (field.regions.length
          ? '<div class="rb">' + field.regions.map(function (region) {
            return '<div class="rb-row"><b>' + esc(region.region) + '</b><span>' + region.companies + '곳</span>' +
              '<div class="rb-bar"><i style="width:' + Math.max(3, Math.round(region.companies / max * 100)) + '%"></i></div></div>';
          }).join('') + '</div>'
          : '<p class="basis">주소가 공개된 기업이 없어 지역 집계를 싣지 않습니다.</p>') +
        '</div>';
      if (field.ksic_names.length) {
        html += '<div class="sect"><span class="sect-k">이 분야에 묶인 업종</span><ul class="ck-r">' +
          field.ksic_names.map(function (k) {
            return '<li><span>' + esc(k.name) + '</span><span>' + k.companies + '곳</span></li>';
          }).join('') + '</ul></div>';
      }
      if (field.examples.length) {
        html += '<div class="sect"><span class="sect-k">직원 수가 많은 기업</span><ul class="ck-r">' +
          field.examples.map(function (e) {
            return '<li><span>' + esc(e.name) + ' <small style="color:var(--dim)">' + esc(e.region || '주소 미공개') + '</small></span><span>' + (e.employees ? e.employees.toLocaleString('ko-KR') + '명' : '—') + '</span></li>';
          }).join('') + '</ul></div>';
      }
      html += '<div class="sect"><span class="sect-k">이어 보기</span><div class="links">' +
        '<a class="lk" href="../company/?q=' + q(field.name) + '">' + linkIcon() + '기업 명함첩에서 기업 보기</a>' +
        '<a class="lk" href="../taxonomy/?q=' + q(field.name) + '">' + linkIcon() + '분류 교차 사전</a>' +
        '<a class="lk" href="../translator/?q=' + q(field.name) + '">' + linkIcon() + '언어 번역기</a>' +
        '<a class="lk" href="../kdt-calc/">' + linkIcon() + '국비지원 계산기</a>' +
        '<a class="lk" href="../flow/">' + linkIcon() + '상담 플로우</a>' +
        '</div></div>' +
        '<p class="src"><b>출처</b> 기업 명함첩(공정거래위원회·알리오·중견기업정보마당·행정안전부 공개 자료)에서 주소를 시군구로 묶어 센 값. 산업 분야는 자료실이 업종 이름을 묶은 편집 기준입니다.</p></div>';
      box.innerHTML = html;
    } else {
      var region = DATA.regions.filter(function (r) { return r.region === state.csel; })[0];
      if (!region) { box.innerHTML = ''; return; }
      var rmax = region.fields.length ? region.fields[0].companies : 1;
      box.innerHTML = '<div><div class="d-k"><b>지역</b><span>기업 명함첩 집계</span></div>' +
        '<h2 class="d-name">' + esc(region.region) + '</h2>' +
        '<p class="d-sub">주소가 이곳인 기업 ' + region.total + '곳</p>' +
        '<div class="sect"><span class="sect-k">이 지역에서 많은 산업</span><div class="rb">' +
        region.fields.map(function (f) {
          return '<div class="rb-row"><b>' + esc(f.name) + '</b><span>' + f.companies + '곳</span>' +
            '<div class="rb-bar"><i style="width:' + Math.max(3, Math.round(f.companies / rmax * 100)) + '%"></i></div></div>';
        }).join('') + '</div></div>' +
        '<div class="sect"><span class="sect-k">이어 보기</span><div class="links">' +
        '<a class="lk" href="../company/?q=' + q(region.region.split(' ').pop()) + '">' + linkIcon() + '기업 명함첩에서 지역으로 보기</a>' +
        '<a class="lk" href="../taxonomy/?q=' + q(region.fields[0] ? region.fields[0].name : region.region) + '">' + linkIcon() + '분류 교차 사전</a>' +
        '<a class="lk" href="../flow/">' + linkIcon() + '상담 플로우</a>' +
        '</div></div>' +
        '<p class="src"><b>출처</b> 기업 명함첩의 본사·소재지 주소를 시군구로 묶어 센 값입니다. 주소가 공개되지 않은 기업은 빠져 있습니다.</p></div>';
    }
  }

  /* ---------------------------------------------------------------- 공통 */
  function renderAll() {
    syncFilters();
    syncWhoStrip();
    renderJobs();
    if (state.tab === 1) renderClusterList();
    if (state.tab === 0 && document.body.getAttribute('data-sheet') === 'detail') {
      var job = DATA.jobs.filter(function (j) { return j.id === state.sel; })[0];
      if (job) $('sheetBody').innerHTML = detailHTML(job);
    }
  }

  /* ---------------------------------------------------------------- 연결 */
  function wire() {
    $('pvT').addEventListener('click', function () {
      var open = $('pvT').getAttribute('aria-expanded') === 'true';
      $('pvT').setAttribute('aria-expanded', String(!open));
      $('pvB').hidden = open;
    });

    $('q').addEventListener('input', function (event) {
      state.q = event.target.value;
      state.page = 1;
      renderJobs();
    });

    $('reset').addEventListener('click', function () {
      DATA.axes.forEach(function (axis) { state.levels[axis.id] = null; });
      state.preset = null;
      state.who = null;
      state.q = '';
      $('q').value = '';
      state.page = 1;
      renderAll();
    });

    $('prev').addEventListener('click', function () {
      if (state.page > 1) { state.page--; renderJobs(); $('list').scrollTop = 0; }
    });
    $('next').addEventListener('click', function () {
      state.page++; renderJobs(); $('list').scrollTop = 0;
    });

    $('openFilters').addEventListener('click', function () { openSheet('filters'); });
    $('sheetClose').addEventListener('click', closeSheet);
    $('sheetReset').addEventListener('click', function () {
      DATA.axes.forEach(function (axis) { state.levels[axis.id] = null; });
      state.preset = null;
      state.who = null;
      state.page = 1;
      renderAll();
      syncSheetAxes();
    });

    $('tabJobs').addEventListener('click', function () { switchTab(0); });
    $('tabCluster').addEventListener('click', function () { switchTab(1); });

    $('cIndustry').addEventListener('click', function () { state.cmode = 'field'; state.csel = null; syncClusterMode(); renderClusterList(); });
    $('cRegion').addEventListener('click', function () { state.cmode = 'region'; state.csel = null; syncClusterMode(); renderClusterList(); });
    $('cq').addEventListener('input', function (event) { state.cq = event.target.value; renderClusterList(); });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.getAttribute('data-sheet')) closeSheet();
    });
  }

  function syncClusterMode() {
    $('cIndustry').setAttribute('aria-pressed', String(state.cmode === 'field'));
    $('cRegion').setAttribute('aria-pressed', String(state.cmode === 'region'));
  }

  function switchTab(index) {
    state.tab = index;
    $('tabJobs').setAttribute('aria-selected', String(index === 0));
    $('tabCluster').setAttribute('aria-selected', String(index === 1));
    $('tabJobs').tabIndex = index === 0 ? 0 : -1;
    $('tabCluster').tabIndex = index === 1 ? 0 : -1;
    $('paneJobs').hidden = index !== 0;
    $('paneCluster').hidden = index !== 1;
    if (index === 1) renderClusterList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(); boot(); });
  else { wire(); boot(); }
})();
