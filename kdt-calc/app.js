/* =========================================================================
   국비지원 자부담 계산기 (kdt-calc)
   · 기준: 국민내일배움카드 운영규정 — 고용노동부고시 제2026-101호(2026-01-01 시행),
     현행 제2026-39호(2026-05-11 일부개정) · 고용24 제도안내
   · 수치는 data/rules-2026.json 한 곳에만 둔다. 계산은 이 파일의 compute() 하나.
   · 제출 단추 없이 입력이 바뀌면 같은 프레임에 한 번만 다시 계산한다.
   ========================================================================= */
(function () {
  'use strict';

  var R = null;                 // rules
  var state = null;             // 현재 조건
  var raf = 0;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 숫자 ---------- */
  function round10(n) { return Math.round(n / 10) * 10; }   // 국고금 관리법 제47조: 10원 미만 버림
  function comma(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function won(n) { return comma(n) + '원'; }
  function signed(n) { return (n < 0 ? '−' : '') + comma(Math.abs(n)); }
  function man(n) {
    var v = n / 10000;
    return (Math.abs(v) >= 100 ? Math.round(v) : (Math.round(v * 10) / 10)) + '만';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ---------- 규칙 찾기 ---------- */
  function procOf(id) { for (var i = 0; i < R.processes.length; i++) if (R.processes[i].id === id) return R.processes[i]; return R.processes[0]; }
  function bandOf(id) { for (var i = 0; i < R.general.bands.length; i++) if (R.general.bands[i].id === id) return R.general.bands[i]; return R.general.bands[2]; }
  function labelOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label; return ''; }

  function tierOf(fee) {
    var t = R.special.tiers;
    for (var i = 0; i < t.length; i++) if (t[i].max === null || fee <= t[i].max) return t[i];
    return t[t.length - 1];
  }
  function tierText(fee) {
    var i = R.special.tiers.indexOf(tierOf(fee));
    var names = ['300만원 이하', '300~600만원', '600~1,200만원', '1,200~1,800만원', '1,800만원 초과'];
    var rates = ['10%', '30만원', '40만원', '50만원', '60만원'];
    return names[i] + ' 구간(' + rates[i] + ')';
  }

  /* ---------- 계산 ---------- */
  function compute(s) {
    var p = procOf(s.proc);
    var notes = [];
    var selfPay = 0, support = 0, cardUse = 0, why = '';
    var fee = Math.max(0, s.fee);

    if (p.kind === 'special') {
      var tier = tierOf(fee);
      var base = tier.amount != null ? tier.amount : Math.round(fee * tier.rate);
      base = Math.min(base, R.special.selfPayMax);

      var aiOk = (s.user === 'ai' && p.id === 'kdt');
      if (s.user === 'ai' && p.id !== 'kdt') notes.push({ k: 'warn', t: 'AI 캠퍼스 전액 지원은 KDT 과정 안내입니다. 이 과정에는 적용하지 않았습니다.' });

      if (s.user === 'exempt' || aiOk) {
        selfPay = 0;
        why = s.user === 'ai'
          ? 'KDT AI 캠퍼스 — 훈련비 전액 지원 안내(고용노동부 안내, 고용센터 확인)'
          : '국취 Ⅰ유형·Ⅱ유형 특정계층 등 — 특화훈련 훈련비 전액 지원';
      } else if (s.user === 'wage') {
        selfPay = round10(base * 0.5);
        why = '특화훈련 자부담 ' + won(base) + '의 50% 경감(고용24 훈련생 유의사항) → ' + won(selfPay);
      } else {
        selfPay = round10(base);
        why = '특화훈련 90% 이상 지원 · ' + tierText(fee) + ' → 자부담 ' + won(base);
      }

      if (s.user === 'ii') notes.push({ k: 'info', t: '국취 Ⅱ유형 청년·중장년은 특화훈련 자부담 경감 대상이 아닙니다(Ⅱ유형 특정계층은 면제).' });

      support = Math.max(0, fee - selfPay);

      if (s.balance <= 0 && p.id !== 'kdtShort' && p.id !== 'sandaeShort') {
        cardUse = 0;
        notes.push({ k: 'warn', t: '계좌 잔액이 0원이면 단기 과정이 아닌 경우 참여할 수 없습니다(고용24 안내).' });
      } else {
        cardUse = Math.min(p.cardCap, support);
        if (s.balance <= 0) notes.push({ k: 'ok', t: '단기 과정은 계좌 잔액이 0원이어도 유효한 카드만 있으면 참여할 수 있습니다(고용24).' });
        else if (s.balance < cardUse) {
          cardUse = s.balance;
          notes.push({ k: 'info', t: '남은 한도가 차감액보다 적어 잔액 전액만 차감되고, 나머지는 국비로 지원됩니다.' });
        }
      }
    } else {
      var band = bandOf(s.band);
      var key = (s.user === 'ai') ? 'general' : s.user;
      var rate = (band.rates[key] != null) ? band.rates[key] : band.rates.general;
      var wanted = round10(fee * rate);
      support = Math.min(wanted, Math.max(0, s.balance));
      selfPay = Math.max(0, fee - support);
      cardUse = support;
      why = '직종 취업률 ' + band.label + ' · ' + (s.user === 'exempt' ? '국취 Ⅰ·Ⅱ 특정계층' : s.user === 'wage' ? '근로·자녀장려금' : s.user === 'ii' ? '국취 Ⅱ유형 청년·중장년' : '일반 훈련생') + ' → 자부담 ' + Math.round((1 - rate) * 100) + '%';
      if (s.user === 'ai') notes.push({ k: 'info', t: 'AI 캠퍼스 전액 지원은 KDT 과정 안내입니다. 일반 과정에는 적용하지 않았습니다.' });
      if (wanted > s.balance) notes.push({ k: 'warn', t: '계좌 한도를 넘는 ' + won(wanted - s.balance) + '은 본인 부담으로 더해집니다.' });
      if (band.id === 'b0' && s.user === 'exempt') notes.push({ k: 'info', t: '국취 Ⅰ·Ⅱ 특정계층도 취업률 40% 미만 구간은 자부담 20%입니다(별표 4).' });
    }

    /* 훈련장려금 */
    var A = R.allowance;
    var conf = (s.pay === 'self') ? A.selfEmployed : (p.kind === 'special' ? A.special : A.general);
    var dayRate = s.day5 ? conf.day5 : conf.dayShort;
    var cap = s.day5 ? conf.cap5 : conf.capShort;
    var allow = 0;

    if (s.pay === 'ui') {
      notes.push({ k: 'warn', t: '실업급여 수급 중에는 훈련장려금·특별훈련수당이 지급되지 않습니다.' });
    } else if (s.hours < A.minHours) {
      notes.push({ k: 'warn', t: '총 훈련시간이 ' + A.minHours + '시간 미만이면 훈련장려금이 없습니다(현재 ' + s.hours + '시간).' });
    } else if (s.remote) {
      notes.push({ k: 'warn', t: '원격훈련은 훈련장려금·특별훈련수당이 지급되지 않습니다.' });
    } else if (!s.attend) {
      notes.push({ k: 'warn', t: '단위기간 출석률이 80% 미만이면 그 달 장려금은 0원입니다.' });
    } else {
      allow = Math.min(round10(s.days * dayRate), cap);
    }

    /* 특별훈련수당 */
    var S = R.specialAllowance;
    var sp = 0;
    if (p.specialAllowance) {
      var boost = !!(s.boost && S.boostedProcesses.indexOf(p.id) >= 0);
      var cfg = (boost ? S.boosted : S.base)[s.region];
      if (s.pay === 'ui') {
        /* 위에서 안내 */
      } else if (s.pay === 'self') {
        notes.push({ k: 'info', t: '자영업자인 고용보험 피보험자는 특별훈련수당 대상에서 빠집니다.' });
      } else if (s.hours < S.minHours) {
        notes.push({ k: 'info', t: '총 ' + S.minHours + '시간 미만 과정은 특별훈련수당이 없습니다(현재 ' + s.hours + '시간).' });
      } else if (s.remote) {
        /* 위에서 안내 */
      } else if (!s.attend) {
        /* 위에서 안내 */
      } else {
        sp = Math.min(round10(s.days * cfg.day), cfg.cap);
        notes.push({ k: 'info', t: '특별훈련수당은 과정 정보에 지급 대상으로 표시된 과정만 받습니다(고시는 장관이 정하는 훈련에 한해 지급).' });
        if (boost) notes.push({ k: 'ok', t: 'AI캠퍼스 등 상향 과정 기준(수도권 20·비수도권 40·인구감소지역 60만원 안내)을 적용했습니다.' });
      }
    } else if (p.kind === 'special') {
      notes.push({ k: 'info', t: p.label + ' 과정은 특별훈련수당이 지급되지 않습니다.' });
    } else if (s.boost) {
      notes.push({ k: 'info', t: '상향 특별훈련수당은 KDT 일부 과정 안내입니다. 일반 과정에는 적용하지 않았습니다.' });
    }

    var months = Math.max(1, s.months);
    var receive = (allow + sp) * months;
    var net = selfPay - receive;

    if (s.pay === 'self' && allow > 0) notes.push({ k: 'ok', t: '자영업자인 피보험자 기준(일 ' + comma(dayRate) + '원, 월 최대 ' + won(cap) + ')을 적용했습니다.' });
    if (!s.day5 && allow > 0) notes.push({ k: 'info', t: '1일 5시간 미만 기준(일 ' + comma(dayRate) + '원)을 적용했습니다.' });

    return {
      proc: p, selfPay: selfPay, support: support, cardUse: cardUse,
      allow: allow, sp: sp, receive: receive, net: net, months: months,
      why: why, notes: notes, dayRate: dayRate, day5: s.day5
    };
  }

  /* ---------- 그리기: 조건 ---------- */
  function chipButton(attrs, label, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', 'false');
    for (var k in attrs) b.setAttribute(k, attrs[k]);
    b.innerHTML = '<span class="dot" aria-hidden="true"></span><span>' + label + '</span>';
    if (title) b.title = title;
    return b;
  }

  function buildProc() {
    var box = $('proc'); box.innerHTML = '';
    R.processes.forEach(function (p) {
      var b = chipButton({ 'data-proc': p.id }, p.label, p.name + ' — ' + p.note);
      b.addEventListener('click', function () {
        state.proc = p.id;
        if (p.kind === 'general' && state.band == null) state.band = 'b50';
        sync(); schedule();
      });
      box.appendChild(b);
    });
  }

  function buildRegion() {
    var box = $('region'); box.innerHTML = '';
    R.regions.forEach(function (r) {
      var b = chipButton({ 'data-region': r.id }, r.label);
      b.addEventListener('click', function () { state.region = r.id; sync(); schedule(); });
      box.appendChild(b);
    });
  }

  function buildSelects() {
    var u = $('user'); u.innerHTML = '';
    R.userTypes.forEach(function (t) {
      var o = document.createElement('option'); o.value = t.id; o.textContent = t.label; u.appendChild(o);
    });
    u.addEventListener('change', function () { state.user = u.value; sync(); schedule(); });

    var p = $('pay'); p.innerHTML = '';
    R.payTypes.forEach(function (t) {
      var o = document.createElement('option'); o.value = t.id; o.textContent = t.label; p.appendChild(o);
    });
    p.addEventListener('change', function () { state.pay = p.value; sync(); schedule(); });

    var b = $('band'); b.innerHTML = '';
    R.general.bands.forEach(function (t) {
      var o = document.createElement('option'); o.value = t.id;
      o.textContent = t.label + ' (일반 훈련생 자부담 ' + Math.round((1 - t.rates.general) * 100) + '%)';
      b.appendChild(o);
    });
    b.addEventListener('change', function () { state.band = b.value; schedule(); });
  }

  function buildPresets() {
    var box = $('presets'); box.innerHTML = '';
    R.presets.forEach(function (pres) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pchip';
      b.setAttribute('data-preset', pres.id);
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/></svg><span>' + pres.label + '</span>';
      b.addEventListener('click', function () {
        state = clone(pres.state);
        sync(); schedule(true);
        if (window.matchMedia('(max-width:899px)').matches) setStage('out', true);
      });
      box.appendChild(b);
    });
  }

  function clone(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

  /* ---------- 그리기: 결과 ---------- */
  function render() {
    if (!R || !state) return;
    var r = compute(state);
    var p = r.proc;
    var fee = Math.max(0, state.fee);

    var sPct = fee > 0 ? (r.support / fee * 100) : 0;
    var cPct = fee > 0 ? (r.selfPay / fee * 100) : 0;
    var cls = r.net < 0 ? 'neg' : 'pos';
    var html = '';
    html += '<div class="rc">';
    html += '<div class="rc-h"><div>';
    html += '<div class="rc-k">' + r.months + '개월 체감비용</div>';
    html += '<div class="rc-big ' + cls + '"><b>' + signed(r.net) + '</b><span>원</span></div>';
    html += '<div class="rc-sub">자부담 ' + won(r.selfPay) + ' − ' + r.months + '개월 수령 ' + won(r.receive) + '</div>';
    html += '</div><div class="seal" aria-hidden="true">2026<br>기준</div></div>';

    html += '<div class="bar" role="img" aria-label="훈련비 구성: 국비 지원 ' + Math.round(sPct) + '퍼센트, 자부담 ' + Math.round(cPct) + '퍼센트">';
    if (fee > 0) {
      html += '<i class="bs" style="width:' + sPct.toFixed(2) + '%"></i>';
      html += '<i class="bc" style="width:' + cPct.toFixed(2) + '%"></i>';
    }
    html += '</div>';
    html += '<div class="legend"><span><i style="background:var(--ben)"></i>국비 ' + comma(r.support) + '원</span>';
    html += '<span><i style="background:var(--cost)"></i>자부담 ' + comma(r.selfPay) + '원</span>';
    html += '<span class="dim">카드 차감 ' + comma(r.cardUse) + '원</span></div>';

    html += '<div class="rule"></div>';
    html += '<dl class="rows">';
    html += '<div class="row"><dt>수강 전 낼 돈 <em>자부담</em></dt><dd class="cost">' + won(r.selfPay) + '</dd></div>';
    html += '<div class="row"><dt>국비 지원 <em>훈련비 중</em></dt><dd class="ben">' + won(r.support) + '</dd></div>';
    html += '<div class="row"><dt>월 훈련장려금 <em>출석 ' + state.days + '일</em></dt><dd>' + won(r.allow) + '</dd></div>';
    html += '<div class="row"><dt>월 특별훈련수당 <em>' + labelOf(R.regions, state.region) + '</em></dt><dd class="gold">' + won(r.sp) + '</dd></div>';
    html += '<div class="row sum"><dt>' + r.months + '개월 받는 돈 <em>장려+특별</em></dt><dd class="ben">' + won(r.receive) + '</dd></div>';
    html += '</dl>';
    html += '<div class="why">' + r.why + '</div>';
    if (r.notes.length) {
      html += '<div class="notes">';
      r.notes.forEach(function (n) { html += '<span class="note ' + n.k + '">' + n.t + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
    $('res').innerHTML = html;

    renderCmp(r);
  }

  function renderCmp(cur) {
    var box = $('cmp');
    var html = '';
    html += crowHtml(null, cur);
    R.presets.forEach(function (pres) {
      var r = compute(pres.state);
      html += crowHtml(pres, r);
    });
    box.innerHTML = html;
    box.querySelectorAll('button.crow').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-preset');
        for (var i = 0; i < R.presets.length; i++) if (R.presets[i].id === id) { state = clone(R.presets[i].state); break; }
        sync(); schedule(true);
        if (window.matchMedia('(max-width:899px)').matches) setStage('out', true);
      });
    });
  }

  function crowHtml(pres, r) {
    var cur = !pres;
    var tag = cur ? 'div' : 'button';
    var label = cur ? '내 조건' : pres.label;
    var sub = cur ? ('· ' + r.proc.label + ' · ' + labelOf(R.regions, state.region)) : '';
    var netCls = r.net < 0 ? 'neg' : 'pos';
    var al = label + ': 자부담 ' + comma(r.selfPay) + '원, 월 수령 ' + comma(r.allow + r.sp) + '원, 기간 순수령 ' + comma(r.receive) + '원, 기간 체감비용 ' + (r.net < 0 ? '마이너스 ' : '') + comma(Math.abs(r.net)) + '원';
    var h = '<' + tag + (cur ? '' : ' type="button" aria-label="' + al + '"') + ' class="crow"' + (cur ? ' data-cur="1"' : ' data-preset="' + pres.id + '"') + '>';
    h += '<span class="cname"><i aria-hidden="true"></i><span>' + label + (sub ? ' <small>' + sub + '</small>' : '') + '</span></span>';
    h += '<span class="cnum" data-l="자부담">' + comma(r.selfPay) + '</span>';
    h += '<span class="cnum" data-l="월 수령">' + comma(r.allow + r.sp) + '</span>';
    h += '<span class="cnum" data-l="순수령">' + comma(r.receive) + '</span>';
    h += '<span class="cnum ' + netCls + '" data-l="체감">' + signed(r.net) + '</span>';
    h += '</' + tag + '>';
    return h;
  }

  /* ---------- 상태 반영 ---------- */
  function sync() {
    if (!R || !state) return;
    setVal('fee', state.fee, comma);
    if (document.activeElement !== $('feeRange')) $('feeRange').value = Math.min(state.fee, 20000000);
    $('feeMan').textContent = man(state.fee) + '원';
    $('user').value = state.user;
    $('pay').value = state.pay;
    $('band').value = state.band;
    setVal('hours', state.hours);
    setVal('days', state.days);
    setVal('months', state.months);
    setVal('balance', state.balance, comma);
    $('day5').setAttribute('aria-checked', String(!!state.day5));
    $('attend').setAttribute('aria-checked', String(!!state.attend));
    $('boost').setAttribute('aria-checked', String(!!state.boost));
    $('remote').setAttribute('aria-checked', String(!!state.remote));

    var isGeneral = procOf(state.proc).kind === 'general';
    $('bandGrp').hidden = !isGeneral;
    $('advsum').textContent = state.months + '개월 · 월 ' + state.days + '일 · ' + comma(state.hours) + '시간';

    document.querySelectorAll('#proc .chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-proc') === state.proc));
    });
    document.querySelectorAll('#region .chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-region') === state.region));
    });
    document.querySelectorAll('#presets .pchip').forEach(function (b) {
      var id = b.getAttribute('data-preset');
      var hit = false;
      for (var i = 0; i < R.presets.length; i++) if (R.presets[i].id === id) {
        var s = R.presets[i].state, same = true;
        for (var k in s) if (s[k] !== state[k]) { same = false; break; }
        hit = same; break;
      }
      b.setAttribute('aria-pressed', String(hit));
    });
  }

  function schedule(force) {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { raf = 0; sync(); render(); });
  }

  /* ---------- 입력 ---------- */
  function setVal(id, v, fmt) {
    var el = $(id);
    if (!el || document.activeElement === el) return;
    el.value = fmt ? fmt(v) : String(v);
  }

  function field(id, key, lo, hi, money, after) {
    var el = $(id);
    el.addEventListener('input', function () {
      var raw = el.value.replace(/[^\d]/g, '');
      if (raw !== el.value) el.value = raw;
      var v = raw ? parseInt(raw, 10) : 0;
      state[key] = clamp(v, lo, hi);
      if (after) after(state[key]);
      schedule();
    });
    el.addEventListener('blur', function () {
      el.value = money ? comma(state[key]) : String(state[key]);
    });
  }

  function bind() {
    field('fee', 'fee', 0, 50000000, true, function (v) {
      if (document.activeElement !== $('feeRange')) $('feeRange').value = Math.min(v, 20000000);
    });
    $('feeRange').addEventListener('input', function () {
      state.fee = clamp(parseInt($('feeRange').value, 10) || 0, 0, 20000000);
      if (document.activeElement !== $('fee')) $('fee').value = comma(state.fee);
      schedule();
    });
    field('hours', 'hours', 1, 3000);
    field('days', 'days', 1, 31);
    field('months', 'months', 1, 24);
    field('balance', 'balance', 0, 5000000, true);

    ['day5', 'attend', 'boost', 'remote'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        state[id] = !state[id];
        $(id).setAttribute('aria-checked', String(state[id]));
        schedule();
      });
    });

    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) setStage(b.getAttribute('data-tab'), true);
    });
    $('go').addEventListener('click', function () { setStage('out', true); });
    $('back').addEventListener('click', function () { setStage('in', true); });
  }

  var STAGES = ['in', 'out', 'cmp'];
  function setStage(name, doScroll) {
    if (STAGES.indexOf(name) < 0) name = 'in';
    document.body.setAttribute('data-stage', name);
    document.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name));
    });
    document.querySelectorAll('.stage').forEach(function (s) {
      s.classList.toggle('is-off', s.getAttribute('data-stage') !== name);
    });
    var host = document.getElementById('stage-' + name);
    if (doScroll && host && window.matchMedia('(max-width:899px)').matches) {
      var y = host.getBoundingClientRect().top + window.pageYOffset - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    }
  }

  function renderSources() {
    var box = $('srclist');
    if (!box || !R.meta || !R.meta.sources) return;
    var html = '';
    R.meta.sources.forEach(function (s) {
      html += '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a> — ' + s.used + '</li>';
    });
    box.innerHTML = html;
  }

  /* ---------- 시작 ---------- */
  function boot() {
    fetch('./data/rules-2026.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('rules ' + r.status); return r.json(); })
      .then(function (data) {
        R = data;
        state = clone(R.presets[0].state);
        buildProc(); buildRegion(); buildSelects(); buildPresets();
        renderSources();
        bind(); sync(); render();
        setStage('in');
      })
      .catch(function () {
        $('res').innerHTML = '<div class="rc"><p style="font-size:13.5px;color:var(--muted)">계산 기준 자료를 불러오지 못했습니다. 화면을 새로 열어 주세요.</p></div>';
        $('cmp').innerHTML = '<p style="padding:14px;font-size:12.5px;color:var(--muted)">계산 기준을 불러오지 못해 비교를 만들지 못했습니다.</p>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
