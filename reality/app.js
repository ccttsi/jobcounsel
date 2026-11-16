/* 취업 현위치 — reality/data/reality_stats.json을 읽기만 한다(고치지 않는다).
   네 단계: ① 예측과 실제 ② 조건별 내 위치 ③ 패배 문장 반박 ④ 통제 분리·방패 카드.
   입력값은 이 기기(localStorage)에만 둔다. 화면 밖으로 내보내는 기능은 두지 않는다. */
(function () {
  'use strict';
  var D = null, KEY = 'jc-reality';
  var S = { stage: 1, i: 0, guess: {}, shown: {}, seg: {}, line: 'fail10', m: 10, n: 20, p: 0.05, pick: '', pins: {}, pinOnly: false };
  var $ = function (id) { return document.getElementById(id); };
  var main = $('main');
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in o) if (k in S) S[k] = o[k]; } catch (e) {} }
  function save() { try { var o = {}; ['i', 'guess', 'shown', 'seg', 'line', 'm', 'n', 'p', 'pick', 'pins', 'pinOnly'].forEach(function (k) { o[k] = S[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function r1(v) { return Math.round(v * 10) / 10; }
  function nf(v) { return (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ko-KR') : String(r1(v))); }
  function fmt(v, u) { return nf(v) + (u === '%' ? '%' : u === '개월' ? '개월' : u ? ' ' + u : ''); }

  /* 출처 한 줄: 기관 · 조사 · 기준시점 · 증거 수준 */
  function src(s, extra) {
    if (!s) return '';
    var priv = /민간|모형/.test(s.evidence_level || '');
    return '<p class="src"><span class="lvl' + (priv ? ' pv2' : '') + '">' + esc(s.evidence_level || '') + '</span>' +
      esc(s.org) + (s.survey ? ' 「' + esc(s.survey) + '」' : '') + (s.period ? ' · 기준 ' + esc(s.period) : '') +
      (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">원문 보기</a>' : '') + (extra ? ' · ' + extra : '') + '</p>';
  }
  function bars(rows, o) {
    o = o || {}; var max = o.max || 100;
    return '<ul class="bars">' + rows.map(function (r) {
      return '<li class="' + (r.on ? 'on' : '') + (r.me ? ' me' : '') + '"><span class="lb">' + esc(r.label) + '</span>' +
        '<span class="tr"><i style="--v:' + Math.max(0, Math.min(1, r.value / max)).toFixed(4) + '"></i>' +
        (o.ref != null ? '<b style="--ref:' + (o.ref / max * 100).toFixed(2) + '%" aria-hidden="true"></b>' : '') + '</span>' +
        '<span class="vl">' + esc(nf(r.value)) + (o.unit || '') + '</span></li>';
    }).join('') + '</ul>' + (o.legend ? '<p class="legend">' + o.legend + '</p>' : '');
  }

  var SHORT = {
    large_firm_workforce_share: '300인 이상 사업체 종사자 비중', college_grad_large_company_share: '대졸 취업자 중 대기업',
    first_job_search_months: '첫 일자리까지 걸린 기간', major_job_mismatch: '전공과 일자리 불일치',
    first_job_tenure_months: '첫 일자리 평균 근속', grad_employment_rate: '대졸자 취업률',
    grad_job_retention_11m: '취업 11개월 뒤 유지', youth_employment_rate: '청년 고용률',
    youth_unemployment_rate: '청년 실업률', career_break_reentry_months: '경력단절 뒤 재취업까지'
  };
  function short(c) { return SHORT[c.id] || c.category; }
  function item(id) { for (var i = 0; i < D.illusion_checks.length; i++) if (D.illusion_checks[i].id === id) return D.illusion_checks[i]; return null; }
  function mid(c) { var v = (c.slider_min + c.slider_max) / 2; return Math.round(v / c.slider_step) * c.slider_step; }
  function pct(c, v) { return ((v - c.slider_min) / (c.slider_max - c.slider_min) * 100).toFixed(2) + '%'; }
  function gapText(c, g) {
    var d = r1(g - c.actual_value), u = c.unit === '%' ? '%p' : c.unit, tol = (c.slider_max - c.slider_min) * 0.02;
    if (Math.abs(d) <= tol) return '거의 맞혔습니다. 차이 ' + nf(Math.abs(d)) + u;
    return '실제보다 <em>' + nf(Math.abs(d)) + u + ' ' + (d > 0 ? '높게' : '낮게') + '</em> 봤습니다.';
  }

  /* ---------- ① 예측과 실제 ---------- */
  function dist(c) {
    var b = c.distribution_buckets || [];
    if (!b.length || c.distribution_kind === 'none') return '';
    if (c.distribution_kind === 'partition' && b.length === 2) {
      var hit = b[1], on = Math.round(hit.value), dots = '';
      for (var k = 0; k < 100; k++) dots += '<i' + (k < on ? ' class="on"' : '') + '></i>';
      return '<div class="dots" role="img" aria-label="100명 중 ' + on + '명: ' + esc(hit.label) + '">' + dots + '</div>' +
        '<p class="legend"><span><i style="background:var(--bar)"></i>' + esc(hit.label) + ' ' + nf(hit.value) + '%</span><span><i style="background:var(--bar-2)"></i>' + esc(b[0].label) + ' ' + nf(b[0].value) + '%</span><span>점 하나 = 1%</span></p>';
    }
    if (c.distribution_kind === 'comparison_group') {
      return bars(b.map(function (x) { return { label: x.label, value: x.value }; }), { unit: '%', ref: c.actual_value, legend: '세로선 = 전체 ' + nf(c.actual_value) + '%' });
    }
    return bars(b.map(function (x) { return { label: x.label, value: x.value, on: x.value === c.actual_value }; }), { unit: '%', legend: '구간별 비율(%)' });
  }
  function outHtml(c, g) {
    if (!S.shown[c.id]) return '<p class="empty">왼쪽에서 내 예측을 정하고 <b>실제 값 보기</b>를 누르면 여기에 실제 통계와 차이가 나옵니다.</p>';
    var cn = c.counselor_note || {};
    return '<div class="res-top"><span class="big num">' + esc(fmt(c.actual_value, c.unit)) + '</span><small>' + esc(c.actual_label) + '</small></div>' +
      '<p class="gap" id="gap">내 예측 ' + esc(fmt(g, c.unit)) + ' — ' + gapText(c, g) + '</p>' +
      dist(c) +
      '<p class="fact">' + esc(c.insight_reframe) + '</p>' +
      '<div class="todo"><b>지금 바꿀 수 있는 것 하나</b>' + esc(c.controllable_action) + '</div>' +
      '<h4 class="fd">상담에서 물어볼 질문</h4><div><ul>' + (cn.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' +
      (cn.avoid ? '<p class="note"><b>피할 말:</b> ' + esc(cn.avoid) + '</p>' : '') + '</div>' +
      (c.calc_note ? '<h4 class="fd">계산 방법과 주의</h4><div><p class="note">' + esc(c.calc_note) + '</p></div>' : '') +
      src(c.source);
  }
  function s1() {
    var L = D.illusion_checks, N = L.length; S.i = Math.max(0, Math.min(N - 1, S.i | 0));
    var c = L[S.i], g = c.id in S.guess ? S.guess[c.id] : mid(c), shown = !!S.shown[c.id];
    var done = L.filter(function (x) { return S.shown[x.id]; }).length;
    var html = '<div class="s1"><section class="card in" aria-labelledby="q1">' +
      '<span class="kick">착시 점검 <span class="num">' + (S.i + 1) + ' / ' + N + '</span><i>' + esc(c.category) + '</i></span>' +
      '<h2 class="tt" id="q1">' + esc(c.question) + '</h2>' +
      '<p class="myth"><b>흔한 생각</b> “' + esc(c.myth_statement) + '”</p>' +
      (c.term_note ? '<p class="term"><b>용어 주의</b> ' + esc(String(c.term_note).replace(/아래 calc_note 참조\.?/, '아래 「계산 방법과 주의」를 함께 보세요.')) + '</p>' : '') +
      '<div class="guess"><label for="rg">내 예측 <output id="go" for="rg" class="num">' + esc(fmt(g, c.unit)) + '</output></label>' +
      '<div class="ruler' + (shown ? ' shown' : '') + '" id="ruler" aria-hidden="true"><span class="tk"></span>' +
      '<span class="mk me" id="mkMe" style="--x:' + pct(c, g) + '"><i>내 예측</i></span>' +
      (shown ? '<span class="mk real" id="mkReal" style="--x:' + pct(c, c.actual_value) + '"><i>실제</i></span>' : '') + '</div>' +
      '<input type="range" id="rg" min="' + c.slider_min + '" max="' + c.slider_max + '" step="' + c.slider_step + '" value="' + g + '" aria-valuetext="' + esc(fmt(g, c.unit)) + '">' +
      '<div class="scale num" aria-hidden="true"><span>' + esc(fmt(c.slider_min, c.unit)) + '</span><span>' + esc(fmt(c.slider_max, c.unit)) + '</span></div></div>' +
      '<div class="act-row">' + (shown ? '<button type="button" class="btn" id="again">다시 찍어 보기</button>' : '<button type="button" class="btn pri" id="reveal">실제 값 보기</button>') + '</div>' +
      '<div class="pager"><button type="button" class="btn" id="prev"' + (S.i ? '' : ' disabled') + '>← 이전</button><span class="pos num">' + (S.i + 1) + ' / ' + N + '</span>' +
      '<button type="button" class="btn" id="next"' + (S.i < N - 1 ? '' : ' disabled') + '>다음 →</button></div></section>' +
      '<section class="card out' + (shown ? ' live' : '') + '" id="out" aria-live="polite" aria-label="실제 통계">' + outHtml(c, g) + '</section></div>' +
      '<section class="card log" aria-labelledby="logH"><h3 id="logH">점검 기록 <span class="num">' + done + ' / ' + N + '</span></h3><ol>' +
      L.map(function (x, k) {
        var gx = x.id in S.guess ? S.guess[x.id] : null, d = S.shown[x.id] && gx != null ? r1(gx - x.actual_value) : null;
        return '<li><button type="button" data-go="' + k + '"' + (k === S.i ? ' aria-current="true"' : '') + '><span class="n num">' + (k + 1) + '</span><span class="q">' + esc(short(x)) + '</span>' +
          (d == null ? '<span class="d wait">아직</span>' : '<span class="d num">' + (d > 0 ? '+' : '') + nf(d) + (x.unit === '%' ? '%p' : x.unit) + '</span>') + '</button></li>';
      }).join('') + '</ol><p class="note">숫자는 내 예측에서 실제 값을 뺀 차이입니다. + 는 실제보다 높게, − 는 낮게 본 것입니다.</p></section>';
    main.innerHTML = html + sources();

    var rg = $('rg'), queued = 0;
    rg.addEventListener('input', function () {
      if (queued) return;
      queued = requestAnimationFrame(function () {
        queued = 0; var v = +rg.value;
        $('go').textContent = fmt(v, c.unit); rg.setAttribute('aria-valuetext', fmt(v, c.unit));
        $('mkMe').style.setProperty('--x', pct(c, v));
        if (S.shown[c.id] && $('gap')) $('gap').innerHTML = '내 예측 ' + esc(fmt(v, c.unit)) + ' — ' + gapText(c, v);
      });
    });
    rg.addEventListener('change', function () { S.guess[c.id] = +rg.value; save(); if (S.shown[c.id]) refreshLog(); });
    if ($('reveal')) $('reveal').addEventListener('click', function () {
      S.guess[c.id] = +rg.value; S.shown[c.id] = true; save();
      var from = pct(c, +rg.value); s1();
      var mk = $('mkReal');
      if (mk && !reduce.matches) { mk.style.transition = 'none'; mk.style.setProperty('--x', from); void mk.offsetWidth; mk.style.transition = ''; mk.style.setProperty('--x', pct(c, c.actual_value)); }
      var out = $('out');
      if (out && !window.matchMedia('(min-width:1024px)').matches) out.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
    });
    if ($('again')) $('again').addEventListener('click', function () { delete S.shown[c.id]; save(); s1(); $('rg').focus(); });
    $('prev').addEventListener('click', function () { go(S.i - 1); });
    $('next').addEventListener('click', function () { go(S.i + 1); });
    main.querySelector('.log').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) go(+b.getAttribute('data-go')); });
  }
  function refreshLog() { /* 기록 표만 다시: 차례 이동 없이 */ var y = window.scrollY; s1(); window.scrollTo(0, y); }
  function go(k) {
    S.i = k; save(); s1();
    var top = main.getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  /* ---------- ② 조건별 내 위치 ---------- */
  function s2() {
    var F = D.segment_filters, sg = S.seg;
    var ages = F.age_employment_rate_2025.values, edus = F.education_first_job_search.values,
      sch = F.school_type_employment_rate.values, fld = F.major_field_rates.values,
      size = F.firm_size_profile.values, brk = F.career_break_detail;
    function chips(name, list, key) {
      return '<fieldset><legend>' + name + '</legend><div class="chips">' + list.map(function (v) {
        return '<button type="button" class="chip" data-k="' + key + '" data-v="' + esc(v) + '" aria-pressed="' + (sg[key] === v) + '">' + esc(v) + '</button>';
      }).join('') + '</div></fieldset>';
    }
    var schoolNames = sch.filter(function (x) { return x.school_type !== '전체'; }).map(function (x) { return x.school_type; });
    var total = sch.filter(function (x) { return x.school_type === '전체'; })[0];
    var eduAll = edus.filter(function (x) { return /전체/.test(x.education); })[0];
    var brkNames = brk.values.map(function (x) { return x.break_reason; });
    var picked = ['age', 'edu', 'school', 'field', 'size', 'brk'].filter(function (k) { return sg[k]; }).length;

    var flt = '<section class="card flt" aria-labelledby="f2"><span class="kick">내 조건 고르기</span><h2 class="tt" id="f2">해당하는 칸만 누르세요</h2>' +
      '<p class="lead">고른 칸이 아래 분포 위에 표시됩니다. 고르지 않아도 분포는 그대로 보입니다.</p>' +
      chips('연령대', ages.map(function (x) { return x.age_group; }), 'age') +
      chips('최종 학력', edus.filter(function (x) { return !/전체/.test(x.education); }).map(function (x) { return x.education; }), 'edu') +
      chips('졸업한 학교 유형', schoolNames, 'school') +
      chips('전공 계열', fld.map(function (x) { return x.field; }), 'field') +
      chips('일하는(또는 희망) 사업체 규모', size.map(function (x) { return x.size; }), 'size') +
      chips('경력이 끊긴 적이 있다면 사유', brkNames, 'brk') +
      '<button type="button" class="btn reset" id="reset"' + (picked ? '' : ' disabled') + '>조건 풀기' + (picked ? ' <span class="num">(' + picked + ')</span>' : '') + '</button></section>';

    function say(on, txt) { return '<p class="say">' + (on ? txt : '<span class="note">위에서 고르면 내 칸이 진하게 표시됩니다.</span>') + '</p>'; }
    var a = ages.filter(function (x) { return x.age_group === sg.age; })[0];
    var e = edus.filter(function (x) { return x.education === sg.edu; })[0];
    var s = sch.filter(function (x) { return x.school_type === sg.school; })[0];
    var f = fld.filter(function (x) { return x.field === sg.field; })[0];
    var z = size.filter(function (x) { return x.size === sg.size; })[0];
    var b = brk.values.filter(function (x) { return x.break_reason === sg.brk; })[0];
    var totW = size.reduce(function (t, x) { return t + x.workers_thousand; }, 0);
    var emax = Math.max.apply(null, edus.map(function (x) { return x.months; })) * 1.15;
    var cv = brk.context_values || {};

    var p = '<div class="panels">' +
      '<section class="card panel"><h3>' + esc(F.age_employment_rate_2025.label) + '</h3>' +
      say(a, '<b>' + esc(sg.age) + '</b> 고용률 <b class="num">' + nf(a && a.employment_rate) + '%</b>') +
      bars(ages.map(function (x) { return { label: x.age_group, value: x.employment_rate, on: x === a }; }), { unit: '%' }) +
      '<p class="note">' + esc(F.age_employment_rate_2025.note) + '</p>' + src(F.age_employment_rate_2025.source) + '</section>' +

      '<section class="card panel"><h3>' + esc(F.education_first_job_search.label) + '</h3>' +
      say(e, '<b>' + esc(sg.edu) + '</b> 평균 <b class="num">' + nf(e && e.months) + '개월</b>' + (eduAll ? ' · 전체 평균 ' + nf(eduAll.months) + '개월' : '')) +
      bars(edus.filter(function (x) { return !/전체/.test(x.education); }).map(function (x) { return { label: x.education, value: x.months, on: x === e }; }), { unit: '개월', max: emax, ref: eduAll ? eduAll.months : null, legend: eduAll ? '세로선 = 전체 평균 ' + nf(eduAll.months) + '개월' : '' }) +
      '<p class="note">' + esc(F.education_first_job_search.note) + '</p>' + src(F.education_first_job_search.source) + '</section>' +

      '<section class="card panel"><h3>' + esc(F.school_type_employment_rate.label) + '</h3>' +
      say(s, '<b>' + esc(sg.school) + '</b> 취업률 <b class="num">' + nf(s && s.rate) + '%</b>' + (total ? ' · 전체 ' + nf(total.rate) + '%' : '')) +
      bars(sch.filter(function (x) { return x.school_type !== '전체'; }).map(function (x) { return { label: x.school_type, value: x.rate, on: x === s }; }), { unit: '%', ref: total ? total.rate : null, legend: total ? '세로선 = 전체 ' + nf(total.rate) + '%' : '' }) +
      src(F.school_type_employment_rate.source) + '</section>' +

      '<section class="card panel"><h3>' + esc(F.major_field_rates.label) + '</h3>' +
      say(f, '<b>' + esc(sg.field) + '</b> 취업률 <b class="num">' + nf(f && f.employment_rate) + '%</b> · 유지취업률 <b class="num">' + nf(f && f.retention_rate) + '%</b>') +
      '<p class="legend">취업률</p>' + bars(fld.map(function (x) { return { label: x.field, value: x.employment_rate, on: x === f }; }), { unit: '%' }) +
      '<p class="legend">유지취업률(취업 뒤 일정 기간 계속 일한 비율)</p>' + bars(fld.map(function (x) { return { label: x.field, value: x.retention_rate, on: x === f }; }), { unit: '%' }) +
      '<p class="note">' + esc(F.major_field_rates.note) + '</p>' + src(F.major_field_rates.source) + '</section>' +

      '<section class="card panel"><h3>' + esc(F.firm_size_profile.label) + '</h3>' +
      say(z, '<b>' + esc(sg.size) + ' 사업체</b>에서 일하는 사람은 전체 종사자의 <b class="num">' + nf(z ? z.workers_thousand / totW * 100 : 0) + '%</b>') +
      '<p class="legend">종사자 비중(%)</p>' + bars(size.map(function (x) { return { label: x.size, value: r1(x.workers_thousand / totW * 100), on: x === z }; }), { unit: '%' }) +
      '<p class="legend">월평균 임금총액(천원, 세전)</p>' + bars(size.map(function (x) { return { label: x.size, value: x.monthly_wage_thousand_krw, on: x === z }; }), { max: 6500 }) +
      '<p class="note">' + esc(F.firm_size_profile.note) + ' 「300인 이상 사업체」는 사업장 단위이며 법정 대기업 분류와 다릅니다.</p>' + src(F.firm_size_profile.source) + '</section>' +

      '<section class="card panel"><h3>' + esc(brk.label) + '</h3>' +
      (b ? '<p class="say">재취업까지 평균 <b class="num">' + nf(b.avg_reentry_months) + '개월</b>' +
        (b.reentry_over_2y_pct != null ? ' · 2년 넘게 걸린 비율 <b class="num">' + nf(b.reentry_over_2y_pct) + '%</b>' : '') +
        (b.reentry_within_6m_pct != null ? ' · 6개월 안에 재취업 <b class="num">' + nf(b.reentry_within_6m_pct) + '%</b>' : '') + '</p>'
        : '<p class="say"><span class="note">경력이 끊긴 적이 있다면 위에서 사유를 고르세요. 만 19~54세 여성 대상 조사입니다.</span></p>') +
      bars(brk.values.map(function (x) { return { label: x.break_reason, value: x.avg_reentry_months, on: x === b }; }), { unit: '개월', max: 100, legend: '사유별 재취업까지 평균 기간' }) +
      (cv.real_wage_before_manwon ? '<p class="note">재취업 후 첫 일자리 실질임금 ' + nf(cv.real_wage_before_manwon) + '만원 → ' + nf(cv.real_wage_after_manwon) + '만원, 시간제 비중 ' + nf(cv.part_time_share_before_pct) + '% → ' + nf(cv.part_time_share_after_pct) + '%.</p>' : '') +
      src(brk.source) + '</section></div>';

    main.innerHTML = '<div class="s2">' + flt + p + '</div>' + sources();
    main.querySelector('.flt').addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-k]');
      if (t) { var k = t.getAttribute('data-k'), v = t.getAttribute('data-v'); if (sg[k] === v) delete sg[k]; else sg[k] = v; }
      else if (ev.target.closest('#reset')) S.seg = {};
      else return;
      save(); keepScroll(s2); setUrl();
    });
  }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  /* ---------- ③ 패배 문장 반박 ---------- */
  function fact(v, p, s, hard) { return { v: v, p: p, s: s, hard: hard }; }
  function lines() {
    var F = D.segment_filters, T = D.timeline_and_odds, C = D.metadata.calculations;
    var fj = item('first_job_search_months'), mm = item('major_job_mismatch'), lg = item('college_grad_large_company_share'),
      tn = item('first_job_tenure_months'), rt = item('grad_job_retention_11m'), ye = item('youth_employment_rate'),
      yu = item('youth_unemployment_rate'), cb = item('career_break_reentry_months'), snap = F.youth_labor_market_snapshot.values;
    var over1y = r1(fj.distribution_buckets.filter(function (x) { return /1~2년|2~3년|3년 이상/.test(x.label); }).reduce(function (t, x) { return t + x.value; }, 0));
    var cp = T.college_prep_period.values, in3 = r1(cp[0].share + cp[1].share);
    var pc = T.public_center_odds.values, mc = T.market_churn.values, hc = T.hiring_channel_now.values, ee = T.employer_experience_signal.values;
    var bd = F.career_break_detail.values, cv = F.career_break_detail.context_values;
    var eduV = F.education_first_job_search.values;
    return [
      { id: 'fail10', t: '열 번 넘게 떨어졌으니 나는 안 되는 사람이다', sim: true,
        f: [fact(nf(pc.placement_rate_pct) + '%', '고용센터·고용24에 등록된 구직 1건당 취업 처리 비율(2025년). 고용센터 밖 경로의 취업은 빠진 값입니다.', T.public_center_odds.source)],
        cav: T.application_odds_model.caveats },
      { id: 'year', t: '졸업하고 1년 넘게 못 구했으면 끝난 것이다', item: fj,
        f: [fact(nf(over1y) + '%', '첫 일자리까지 1년 이상 걸린 청년 비율(1~2년·2~3년·3년 이상 구간을 더한 값).', fj.source),
          fact(nf(fj.actual_value) + '개월', '졸업 후 첫 일자리(임금근로자)까지 평균 기간. 고졸 이하 ' + nf(eduV[0].months) + '개월, 대졸 이상 ' + nf(eduV[1].months) + '개월.', fj.source),
          fact(nf(cp[cp.length - 1].share) + '%', '대졸자 가운데 졸업 후 9개월이 지나 취업한 비율. 졸업 후 3개월 안에 취업 상태가 된 비율은 ' + nf(in3) + '%입니다.', T.college_prep_period.source, true)] },
      { id: 'major', t: '전공과 다른 일을 하면 실패한 것이다', item: mm,
        f: [fact(nf(mm.actual_value) + '%', '취업 경험이 있는 청년 가운데 최근 일자리가 전공과 「불일치」한다고 답한 비율(약간 불일치 + 매우 불일치).', mm.source)] },
      { id: 'bigco', t: '대기업에 못 가면 의미가 없다', item: lg,
        f: [fact(nf(lg.actual_value) + '%', '고등교육기관 졸업 취업자 가운데 대기업에 다니는 비율. 중소기업은 ' + nf(lg.distribution_buckets[0].value) + '%입니다.', lg.source),
          fact(nf(C.wage_gap_ge300_vs_lt300_pct.value) + '% 높음', '300인 이상 사업체의 월평균 임금총액이 300인 미만보다 높은 정도(2025년 6월, 세전). 격차는 사실입니다.', F.firm_size_profile.source, true)] },
      { id: 'quit', t: '첫 직장을 금방 그만두면 경력이 끝난다', item: tn,
        f: [fact(nf(tn.actual_value) + '개월', '첫 일자리(임금근로자)의 평균 근속기간.', tn.source),
          fact(nf(tn.distribution_buckets[0].value) + '%', '첫 직장을 이미 그만둔 청년 비율. 첫 직장에 계속 다니는 비율은 ' + nf(tn.distribution_buckets[1].value) + '%입니다.', tn.source),
          fact(nf(rt.actual_value) + '%', '취업한 대졸자 가운데 11개월 뒤에도 직장을 유지한 비율(유지취업률).', rt.source)] },
      { id: 'nojobs', t: '일자리 자체가 없다', item: null,
        f: [fact(nf(mc.entries_dec_2025 / 10) + '만 명', '2025년 12월 한 달 동안 사업체에 새로 들어간(입직) 사람. 같은 달 이직은 ' + nf(mc.exits_dec_2025 / 10) + '만 명입니다.', T.market_churn.source),
          fact(nf(pc.jobs_per_seeker) + '개', '고용24에 등록된 구직 1건당 신규 구인 인원(2025년). 고용센터 등록 건 기준이며 전체 노동시장이 아닙니다.', T.public_center_odds.source, true),
          fact(nf(hc['수시채용']) + '%', '채용 방식으로 수시채용을 쓴다고 답한 기업 비율(기업 650곳, 복수응답). 정기공채는 ' + nf(hc['정기공채']) + '%.', T.hiring_channel_now.source),
          fact(nf(ee['기업_일경험이_적응에_도움']) + '%', '일경험이 입사 후 적응에 도움이 된다고 답한 기업 비율(매출 상위 500대 기업 중 응답 396개사).', T.employer_experience_signal.source)] },
      { id: 'break', t: '경력이 끊기면 다시는 돌아갈 수 없다', item: cb,
        f: [fact(nf(bd[1].avg_reentry_months) + '개월', '근로조건(임금·업무강도·계약만료·폐업 등)으로 경력이 끊긴 경우 재취업까지 평균 기간. ' + nf(bd[1].reentry_within_6m_pct) + '%는 6개월 안에 재취업했습니다.', F.career_break_detail.source),
          fact(nf(bd[0].avg_reentry_months) + '개월', '결혼·임신·출산·육아·가족돌봄으로 끊긴 경우 재취업까지 평균 기간. 재취업 후 첫 일자리 실질임금은 ' + nf(cv.real_wage_before_manwon) + '만원에서 ' + nf(cv.real_wage_after_manwon) + '만원으로 낮아졌습니다.', F.career_break_detail.source, true)] },
      { id: 'alone', t: '나만 빼고 다 취업했다', item: ye,
        f: [fact(nf(ye.actual_value) + '%', '청년(15~29세) 고용률(2025년 연간). 분모는 인구 전체라 재학생·취업준비생이 포함됩니다.', ye.source),
          fact(nf(yu.actual_value) + '%', '청년(15~29세) 실업률(2025년 연간). 분모가 경제활동인구라 고용률과 같은 선에 놓지 않습니다.', yu.source),
          fact(nf(snap.extended_unemployment_rate_dec_pct) + '%', '청년 확장실업률(2025년 12월). 일할 뜻이 있지만 일하지 못한 사람까지 넓혀 센 값입니다.', F.youth_labor_market_snapshot.source, true)] }
    ];
  }
  function oddsHtml() {
    var p = S.p, m = S.m, n = S.n, q = 1 - p;
    var allFail = Math.pow(q, m) * 100, atl = (1 - Math.pow(q, n)) * 100,
      n50 = Math.ceil(Math.log(.5) / Math.log(q)), n80 = Math.ceil(Math.log(.2) / Math.log(q));
    return '<div class="odds"><div><b class="num">' + nf(allFail) + '%</b><span>회당 ' + nf(p * 100) + '%일 때 ' + m + '번 모두 떨어질 확률</span></div>' +
      '<div><b class="num">' + nf(atl) + '%</b><span>앞으로 ' + n + '번 더 지원해 한 번 이상 붙을 확률</span></div>' +
      '<div><b class="num">' + n50 + '번</b><span>한 번 이상 붙을 확률이 50%를 넘는 지원 횟수</span></div>' +
      '<div><b class="num">' + n80 + '번</b><span>80%를 넘는 지원 횟수</span></div></div>';
  }
  function s3() {
    var L = lines(), cur = L.filter(function (x) { return x.id === S.line; })[0] || L[0], M = D.timeline_and_odds.application_odds_model;
    var P = [[0.02, '2% 가정'], [0.05, '5% 가정'], [0.10, '10% 가정'], [0.245, '24.5% 고용센터 성사율 참고']];
    var pick = '<section class="card pick" aria-labelledby="h3p"><span class="kick">패배 문장 고르기</span><h2 class="tt" id="h3p">요즘 가장 자주 드는 생각은?</h2><ul class="lines">' +
      L.map(function (x) { return '<li><button type="button" data-l="' + x.id + '" aria-pressed="' + (x === cur) + '">“' + esc(x.t) + '”</button></li>'; }).join('') + '</ul></section>';
    var body = '<section class="card rb" aria-live="polite"><span class="kick">데이터가 말하는 것</span><h3><s>' + esc(cur.t) + '</s></h3>';
    if (cur.sim) {
      body += '<div class="sim"><div class="row"><label for="rm">지금까지 지원한 횟수 <output id="om" class="num">' + S.m + '번</output></label><input type="range" id="rm" min="1" max="100" step="1" value="' + S.m + '" aria-valuetext="' + S.m + '번"></div>' +
        '<div class="row"><label for="rn">앞으로 더 지원할 횟수 <output id="on" class="num">' + S.n + '번</output></label><input type="range" id="rn" min="1" max="100" step="1" value="' + S.n + '" aria-valuetext="' + S.n + '번"></div>' +
        '<fieldset style="border:0;margin:0;padding:0;min-width:0"><legend style="font-weight:750;font-size:15px;margin-bottom:6px;padding:0">회당 합격 확률(가정)</legend><div class="chips">' +
        P.map(function (x) { return '<button type="button" class="chip" data-p="' + x[0] + '" aria-pressed="' + (S.p === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></fieldset>' +
        '<div id="odds">' + oddsHtml() + '</div></div>' +
        '<p class="note">' + esc(M.model) + '. ' + esc(M.base_rate_note) + '</p>';
    }
    body += '<ul class="facts">' + cur.f.map(function (x) {
      return '<li' + (x.hard ? ' class="hard"' : '') + '><span class="v num">' + esc(x.v) + '</span><p>' + esc(x.p) + '</p>' + (x.hard ? '<p class="note">지우지 않고 그대로 두는 사실입니다.</p>' : '') + src(x.s) + '</li>';
    }).join('') + '</ul>';
    if (cur.cav) body += '<h4 class="fd">이 계산의 한계</h4><div><ul>' + cur.cav.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>';
    if (cur.item) body += '<h4 class="fd">사실을 다시 읽으면</h4><div><p>' + esc(cur.item.insight_reframe) + '</p><div class="todo"><b>지금 바꿀 수 있는 것 하나</b>' + esc(cur.item.controllable_action) + '</div></div>';
    body += '</section>';
    main.innerHTML = '<div class="s3">' + pick + body + '</div>' + sources();

    main.querySelector('.lines').addEventListener('click', function (e) {
      var b = e.target.closest('[data-l]'); if (!b) return; S.line = b.getAttribute('data-l'); save(); keepScroll(s3);
      if (!window.matchMedia('(min-width:1024px)').matches) main.querySelector('.rb').scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
    });
    if (cur.sim) {
      var q = 0;
      var upd = function () { if (q) return; q = requestAnimationFrame(function () { q = 0; S.m = +$('rm').value; S.n = +$('rn').value; $('om').textContent = S.m + '번'; $('on').textContent = S.n + '번'; $('rm').setAttribute('aria-valuetext', S.m + '번'); $('rn').setAttribute('aria-valuetext', S.n + '번'); $('odds').innerHTML = oddsHtml(); }); };
      $('rm').addEventListener('input', upd); $('rn').addEventListener('input', upd);
      $('rm').addEventListener('change', save); $('rn').addEventListener('change', save);
      main.querySelector('.sim .chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-p]'); if (!b) return; S.p = +b.getAttribute('data-p'); save();
        Array.prototype.forEach.call(this.querySelectorAll('[data-p]'), function (x) { x.setAttribute('aria-pressed', String(+x.getAttribute('data-p') === S.p)); });
        $('odds').innerHTML = oddsHtml();
      });
    }
  }

  /* ---------- ④ 통제 분리 · 방패 카드 ---------- */
  function s4() {
    var L = D.illusion_checks, F = D.segment_filters, T = D.timeline_and_odds, C = D.metadata.calculations;
    var ye = item('youth_employment_rate'), lg = item('college_grad_large_company_share'), cb = item('career_break_reentry_months');
    var outs = [
      [nf(ye.actual_value) + '%', '청년(15~29세) 고용률', ye.source],
      [nf(T.public_center_odds.values.jobs_per_seeker) + '개', '고용24 구직 1건당 신규 구인 인원', T.public_center_odds.source],
      [nf(C.wage_gap_ge300_vs_lt300_pct.value) + '%', '300인 이상 사업체 임금이 더 높은 정도', F.firm_size_profile.source],
      [nf(lg.actual_value) + '%', '대졸 취업자 가운데 대기업 비율', lg.source],
      [nf(cb.actual_value) + '개월', '결혼·출산 등으로 끊긴 경력의 재취업까지 평균', cb.source]
    ];
    var pk = L.filter(function (c) { return c.id === S.pick; })[0];
    var split = '<div class="split"><section class="card" aria-labelledby="o4"><span class="kick">통제 밖</span><h3 id="o4">시장이 정하는 것</h3><p class="note">내가 바꿀 수 없으니, 알고만 있으면 되는 숫자입니다.</p><ul class="out-list">' +
      outs.map(function (o) { return '<li><b class="num">' + esc(o[0]) + '</b>' + esc(o[1]) + '<small>' + esc(o[2].org) + ' · 기준 ' + esc(o[2].period) + '</small></li>'; }).join('') + '</ul></section>' +
      '<section class="card" aria-labelledby="i4"><span class="kick">통제 안</span><h3 id="i4">내가 고를 수 있는 것 — 하나만</h3><p class="note">여러 개를 한꺼번에 잡으면 부담이 됩니다. 이번 주에 할 것 하나만 고르세요.</p>' +
      '<div class="pickd" id="pickd"' + (pk ? '' : ' hidden') + '><b>이번 주에 할 하나</b><span id="pickT">' + (pk ? esc(pk.controllable_action) : '') + '</span></div>' +
      '<ul class="in-list">' + L.map(function (c) {
        return '<li><label><input type="radio" name="pick" value="' + c.id + '"' + (c.id === S.pick ? ' checked' : '') + '><span>' + esc(c.controllable_action) + '</span></label></li>';
      }).join('') + '</ul></section></div>';
    var pinN = L.filter(function (c) { return S.pins[c.id]; }).length;
    var deck = '<div class="deck-h"><h3>데이터 방패 카드</h3><button type="button" class="chip" id="pinOnly" aria-pressed="' + !!S.pinOnly + '">고정한 카드만 <span class="num">' + pinN + '</span></button></div>' +
      '<p class="note">불안할 때 꺼내 보는 카드입니다. ☆를 누르면 고정되어, 다음에 열었을 때 고정한 것만 모아 볼 수 있습니다.</p>' +
      (S.pinOnly && !pinN ? '<p class="note">아직 고정한 카드가 없습니다. 「고정한 카드만」을 한 번 더 누르면 전체 카드가 보입니다.</p>' : '') +
      '<ul class="deck">' + L.filter(function (c) { return !S.pinOnly || S.pins[c.id]; }).map(function (c) {
        return '<li class="shield jc-pop"><button type="button" class="pin" data-pin="' + c.id + '" aria-pressed="' + !!S.pins[c.id] + '" aria-label="' + esc(short(c)) + ' 카드 고정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg></button>' +
          '<span class="my">' + esc(String(c.myth_statement).split(' / ')[0]) + '</span>' +
          '<span class="ft">' + esc(short(c)) + ' <b class="num">' + esc(fmt(c.actual_value, c.unit)) + '</b></span>' +
          '<span class="note" style="margin:0">' + esc(c.actual_label) + '</span>' +
          '<span class="sr2">' + esc(c.source.org) + ' · 기준 ' + esc(c.source.period) + '</span></li>';
      }).join('') + '</ul>';
    main.innerHTML = split + deck + sources();
    main.querySelector('.in-list').addEventListener('change', function (e) {
      S.pick = e.target.value; save(); var c = item(S.pick);
      $('pickd').hidden = false; $('pickT').textContent = c ? c.controllable_action : '';
    });
    main.querySelector('.deck-h').addEventListener('click', function (e) { if (!e.target.closest('#pinOnly')) return; S.pinOnly = !S.pinOnly; save(); keepScroll(s4); });
    main.querySelector('.deck').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pin]'); if (!b) return; var id = b.getAttribute('data-pin');
      if (S.pins[id]) delete S.pins[id]; else S.pins[id] = 1; save();
      b.setAttribute('aria-pressed', String(!!S.pins[id]));
      var n = Object.keys(S.pins).length, t = $('pinOnly').querySelector('.num'); if (t) t.textContent = n;
      if (S.pinOnly) keepScroll(s4);
    });
  }

  /* ---------- 출처 목록 ---------- */
  function sources() {
    var m = D.metadata;
    return '<section class="card" style="margin-top:24px"><h4 class="fd">출처 목록 · 데이터셋 v' + esc(m.version) + ' (' + esc(m.generated_at) + ')</h4><div><p class="note">' + esc(m.disclaimer) + '</p><ul>' +
      m.sources.map(function (s) {
        return '<li><span class="lvl' + (s.tier === 'official' ? '' : ' pv2') + '">' + (s.tier === 'official' ? '공식' : '민간') + '</span>' + esc(s.org) + ' 「' + esc(s.survey) + '」 · 기준 ' + esc(s.period) + ' · 공표 ' + esc(s.published) +
          (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">원문 보기</a>' : '') + '</li>';
      }).join('') + '</ul><p class="note">주의: ' + m.caveats.map(esc).join(' / ') + '</p></div></section>';
  }

  /* ---------- 단계 전환·주소 ---------- */
  var STAGES = { 1: s1, 2: s2, 3: s3, 4: s4 };
  function setUrl() {
    var q = new URLSearchParams();
    if (S.stage === 2) ['age', 'edu', 'school', 'field', 'size', 'brk'].forEach(function (k) { if (S.seg[k]) q.set(k, S.seg[k]); });
    var qs = q.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#s' + S.stage); } catch (e) {}
  }
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('.step'), function (b) {
      if (+b.getAttribute('data-s') === S.stage) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    STAGES[S.stage]();
  }
  function stage(n) {
    S.stage = n; setUrl(); render();
    var top = main.getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo(0, top);
  }
  $('steps').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (b) stage(+b.getAttribute('data-s')); });
  document.querySelector('.brand').addEventListener('click', function (e) { e.preventDefault(); stage(1); });
  $('pvT').addEventListener('click', function () {
    var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기';
  });

  function start() {
    load();
    var h = /^#s([1-4])$/.exec(location.hash); if (h) S.stage = +h[1];
    var q = new URLSearchParams(location.search), any = false;
    ['age', 'edu', 'school', 'field', 'size', 'brk'].forEach(function (k) { var v = q.get(k); if (v) { if (!any) { S.seg = {}; any = true; } S.seg[k] = v; } });
    if (any) S.stage = 2;
    setUrl(); render();
  }
  fetch('./data/reality_stats.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { D = j; start(); })
    .catch(function () { main.innerHTML = '<p class="loading">통계 파일을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>'; });
})();
