/* app.js — 실업급여·근로조건 계산기 (pay-calc)
 *
 * 하는 일: 조건을 바꾸면 그 자리에서 다시 계산해 명세서를 다시 그린다(계산 단추 없음).
 *  ① 구직급여  ② 실수령액·주휴수당  ③ 퇴직금·미수령 연차수당
 *
 * 지키는 것
 *  · 법정 수치는 공용 단일 원천(data/legal-constants.json → assets/legal-constants.js)에서 읽는다. 여기에 숫자를 다시 적지 않는다.
 *  · 확인되지 않은 값을 지어내지 않는다. 표에 없는 구간(월 1,000만원 초과 소득세)은 빼지 않고 그 사실을 적는다.
 *  · 계산은 이 브라우저 안에서만 한다(서버·외부 요청 0). 입력값을 저장하지 않는다.
 *  · 소득세는 「소득세법 시행령 별표 2」 근로소득 간이세액표(data/taxtable.js)를 그대로 찾아 쓴다.
 */
(function () {
  'use strict';
  var d = document;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function pressed(sel) {
    var el = $(sel + '[aria-pressed="true"]');
    return el ? el.getAttribute(sel.replace('[', '').replace(']', '')) : null;
  }

  /* ── 값의 원천 ────────────────────────────────────────────────────────
     최저임금·구직급여 상·하한·4대보험 요율은 여러 섹터가 함께 쓰는 법정 수치다.
     그래서 숫자를 이 파일에 다시 적지 않고, 단일 원천 data/legal-constants.json에서 만든
     assets/legal-constants.js(window.JC_LEGAL)를 읽는다 — 출처·적용기간·확인일도 그 파일에 있다.
     해가 바뀌면 원천만 고치고 python3 ops/scripts/build_legal_constants.py 로 사본을 다시 만든다. */
  var L = window.JC_LEGAL;
  if (!L || !L.baseYear || !L.minimumWage || !L.jobSeeking || !L.socialInsurance) {
    // 원천을 못 받았으면 숫자를 지어내지 않고 멈춘다(옛 값으로 계산해 주는 것이 더 나쁘다).
    ['#benSheet', '#netSheet', '#lvSheet'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.innerHTML = '<div class="empty">법정 수치 원천(<b>assets/legal-constants.js</b>)을 불러오지 못해 계산을 멈췄습니다. 화면을 새로 고치면 다시 됩니다.</div>';
    });
    return;
  }
  var F = {
    year: L.baseYear.year,                   // 기준년도
    mw: L.minimumWage.hourly,                // 최저임금 시간급
    mwMonth: L.minimumWage.monthly,          // 월 환산(209시간)
    monthHoursAt40: L.minimumWage.monthlyHours,  // 주 40시간+주휴 8시간의 월 기준시간
    benBaseMax: L.jobSeeking.baseDailyCap,   // 급여기초임금일액 상한(고용보험법 시행령 제68조)
    benMax: L.jobSeeking.dailyCap,           // 구직급여일액 상한
    benRate: L.jobSeeking.rate,              // 구직급여일액 = 기초일액의 60%
    benFloorRate: L.jobSeeking.floorRate,    // 하한 = 최저임금×1일 소정근로시간×80%
    pnRate: L.socialInsurance.pensionRateWorker, pnMin: L.socialInsurance.pensionBaseMin, pnMax: L.socialInsurance.pensionBaseMax,
    hiRate: L.socialInsurance.healthRateTotal, hiPremMin: L.socialInsurance.healthPremiumMin, hiPremMax: L.socialInsurance.healthPremiumMax,
    ltRate: L.socialInsurance.ltcRateOnHealth,       // 장기요양 = 건강보험료×13.14%
    eiRate: L.socialInsurance.employmentRateWorker,  // 고용보험 실업급여분 근로자
    days3: 91.25,            // 3개월 총일수(365÷12×3) — 법이 정한 값이 아니라 어림셈 상수
    childCut: [0, 20830, 45830, 33330]  // 8~20세 자녀 1·2명, 3명째부터 1명당(소득세법 시행령 별표 2)
  };
  var WEEKS = 365 / 12 / 7;  // 한 달 평균 주 수(4.3452…)

  /* ── 숫자 도우미 ─────────────────────────────────────────────────── */
  function digits(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return s === '' ? null : Number(s);
  }
  function comma(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function won(n) { return comma(Math.round(n || 0)) + '원'; }
  function cut10(n) { return Math.floor(Math.round(n || 0) / 10) * 10; }   // 10원 미만 절사(국고금 관리법 제47조)
                                                          // (0.009 같은 소수 요율의 부동소수 오차를 먼저 원 단위로 정리한다)
  function day(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length !== 3) return null;
    var t = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(t.getTime()) ? null : t;
  }

  /* ── 탭 ─────────────────────────────────────────────────────────── */
  var tabs = $$('.tab'), panels = $$('[role="tabpanel"]');
  var srLive = $('#srLive');
  function showTab(id, focus) {
    var found = false;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === id; if (on) found = true;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    if (!found) return;
    panels.forEach(function (p) { p.hidden = p.id !== 'p-' + id; });
    qa();
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    t.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(t), n = tabs.length, j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft') j = (i + n - 1) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      showTab(tabs[j].getAttribute('data-tab'), true);
    });
  });
  function live(text) { if (srLive) srLive.textContent = text; }

  /* ── ① 구직급여 ──────────────────────────────────────────────────── */
  var BEN_DAYS = [[120, 150, 180, 210, 240], [120, 180, 210, 240, 270]];  // [50세 미만][50세 이상·장애인]
  function benSheet() {
    var age = pressed('[data-age]') === 'o50' ? 1 : 0;
    var yrs = Number(pressed('[data-yrs]') || 0);
    var pay = digits($('#benPay').value);
    var h = Number($('#benHours').value) || 8;
    var span = digits($('#benDays').value);
    if (!span || span < 30 || span > 120) span = 91;
    var manual = digits($('#benBase').value);
    var floorDay = Math.floor(F.mw * h * F.benFloorRate);   // 최저구직급여일액
    var lowest = F.mw * h;                          // 최저기초일액
    var avg = manual != null ? manual : (pay != null ? pay * 3 / span : null);
    if (!avg || avg <= 0) {
      return '<div class="empty">조건 칸에 <b>월평균 급여</b>를 입력하면 바로 계산됩니다.<br>나이와 피보험기간을 고르면 소정급여일수도 함께 나옵니다.</div>';
    }
    var base = Math.max(avg, lowest);
    var floored = avg < lowest;
    var capped = base > F.benBaseMax;
    if (capped) base = F.benBaseMax;
    var rate = floored ? F.benFloorRate : F.benRate;
    var daily = Math.floor(base * rate);
    var byFloor = daily < floorDay;
    if (byFloor) daily = floorDay;
    var byCap = daily > F.benMax;
    if (byCap) daily = F.benMax;
    var idx = yrs <= 0 ? 0 : yrs === 1 ? 1 : yrs === 3 ? 2 : yrs === 5 ? 3 : 4;
    var days = BEN_DAYS[age][idx];
    var total = daily * days;

    var rule = byCap ? '상한액 <b>' + comma(F.benMax) + '원</b> 적용 — 평균임금이 높습니다.'
      : byFloor ? '하한액 <b>' + comma(floorDay) + '원</b> 적용 — 최저임금의 80%가 더 큽니다.'
      : floored ? '최저기초일액의 <b>80%</b>를 주었습니다(최저임금×' + h + '시간).'
      : '평균임금의 <b>60%</b> 그대로(상·하한 안).';

    var rows = ''
      + '<div class="row opt"><dt>입력한 월평균 급여</dt><dd>' + won(pay != null ? pay : 0) + '</dd></div>'
      + row('1일 평균임금', won(avg), '3개월 ' + span + '일 기준')
      + row('최저기초일액', won(lowest), '최저임금×' + h + '시간')
      + row('적용 기초일액', won(base), capped ? '상한 적용' : floored ? '최저기초일액' : '평균임금')
      + '<div class="row opt"><dt>지급률<em>' + (floored ? '최저구직급여일액' : '기본') + '</em></dt><dd>' + Math.round(rate * 100) + '%</dd></div>'
      + row('1일 구직급여액', '<b>' + won(daily) + '</b>', '', 'acc')
      + row('소정급여일수', days + '일', age ? '50세 이상·장애인' : '50세 미만')
      + row('예상 총 수령액', won(total), '1일액×' + days + '일', 'sum');

    return ''
      + '<div class="slip-h"><div class="slip-k">구직급여 모의계산 · ' + F.year + '년 기준</div><div class="stamp">' + F.year + ' 기준</div></div>'
      + '<div class="tear"></div>'
      + '<div class="big"><b>' + comma(daily) + '원</b><span>1일</span></div>'
      + '<p class="sub">소정급여일수 <b>' + days + '일</b> · 예상 총 수령액 <b>' + won(total) + '</b></p>'
      + '<div class="ruleline">' + rule + '</div>'
      + '<dl class="rows">' + rows + '</dl>'
      + '<div class="chip-row">'
      + '<span class="tagline">수급기간 이직 다음 날부터 12개월</span>'
      + '<span class="tagline">처음 7일은 대기기간</span>'
      + '</div>'
      + '<details class="req"' + (window.matchMedia('(min-width:900px)').matches ? ' open' : '') + '>'
      + '<summary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>이 계산이 전제하는 수급 요건 4가지</summary>'
      + '<div class="rq"><ul>'
      + '<li><span class="no">1</span><span>이직 전 18개월 중 피보험단위기간(보수를 받은 날)이 <b>180일 이상</b><span class="law">법 제40조①</span></span></li>'
      + '<li><span class="no">2</span><span>해고·계약만료·권고사직 같은 <b>비자발적 이직</b>(자발적 이직이면 제한)<span class="law">법 제58조</span></span></li>'
      + '<li><span class="no">3</span><span>근로의 의사와 능력이 있는데도 <b>취업하지 못한 상태</b><span class="law">법 제40조②</span></span></li>'
      + '<li><span class="no">4</span><span>실업인정 기간에 <b>재취업 노력</b>을 적극적으로 할 것<span class="law">법 제40조④</span></span></li>'
      + '</ul></div></details>';
  }

  /* ── ② 실수령액·주휴수당 ─────────────────────────────────────────── */
  function taxOf(monthly, fam, kids) {
    var rows = window.PAY_TAX_ROWS;
    if (!rows || !rows.length) return { amt: 0, over: false, missing: true };
    if (monthly < 770000) return { amt: 0, over: false, missing: false };
    if (monthly >= 10000000) return { amt: 0, over: true, missing: false };
    var k = Math.floor(monthly / 1000), lo = 0, hi = rows.length - 1, pos = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid][0] <= k) { pos = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (pos < 0) return { amt: 0, over: false, missing: false };
    var col = Math.min(Math.max(fam, 1), 11);
    var v = rows[pos][col] || 0;
    var cut = kids <= 0 ? 0 : kids === 1 ? F.childCut[1] : kids === 2 ? F.childCut[2] : F.childCut[2] + F.childCut[3] * (kids - 2);
    return { amt: cut10(Math.max(0, v - cut)), over: false, missing: false };
  }

  function netSheet() {
    var mode = pressed('[data-mode]') || 'month';
    var pay = digits($('#netPay').value);
    var weekly = Number($('#netHours').value) || 0;
    var fam = Number($('#netFam').value) || 1;
    var kids = Number(pressed('[data-kids]') || 0);
    var holH = weekly >= 15 ? (weekly >= 40 ? 8 : weekly / 40 * 8) : 0;
    var monthH = (weekly + holH) * (F.monthHoursAt40 / 48);
    if (!pay || pay <= 0) {
      return '<div class="empty">조건 칸에 <b>' + (mode === 'month' ? '세전 월급' : '시급') + '</b>을 입력하면 바로 계산됩니다.<br>공제대상 가족 수와 자녀 수에 따라 소득세가 달라집니다.</div>';
    }
    var hourly, monthly;
    if (mode === 'hour') { hourly = pay; monthly = pay * monthH; }
    else { monthly = pay; hourly = monthH > 0 ? pay / monthH : 0; }

    var pnBase = Math.min(Math.max(monthly, F.pnMin), F.pnMax);
    var pn = cut10(pnBase * F.pnRate);
    var hiTotal = Math.min(Math.max(monthly * F.hiRate, F.hiPremMin), F.hiPremMax);
    var hi = cut10(hiTotal / 2);
    var lt = cut10(hi * F.ltRate);
    var ei = cut10(monthly * F.eiRate);
    var tax = taxOf(monthly, fam, kids);
    var local = cut10(tax.amt * 0.1);
    var deduct = pn + hi + lt + ei + tax.amt + local;
    var net = monthly - deduct;
    var holWeek = Math.floor(holH * hourly);
    var holMonth = holWeek * WEEKS;
    var mwGap = hourly - F.mw;

    var rows = ''
      + row('국민연금', '-' + won(pn), '기준소득월액 ' + comma(Math.round(pnBase)), 'bad')
      + row('건강보험', '-' + won(hi), '보수월액 3.595%', 'bad')
      + row('장기요양', '-' + won(lt), '건강보험료 13.14%', 'bad')
      + row('고용보험', '-' + won(ei), '실업급여분 0.9%', 'bad')
      + (tax.missing ? '' : row('소득세', tax.over ? '표 밖' : '-' + won(tax.amt), tax.over ? '월 1,000만원 초과' : '간이세액표 100%', 'bad'))
      + (tax.missing ? '' : row('지방소득세', tax.over ? '표 밖' : '-' + won(local), '소득세의 10%', 'bad'))
      + row('공제 합계', '-' + won(deduct), tax.over ? '소득세 제외' : '', '')
      + row('예상 실수령액', won(net), tax.over ? '세전−4대보험' : '세전−공제', 'sum');

    var warn = '';
    if (tax.over) warn = '<div class="ruleline">월 급여가 <b>1,000만원</b>을 넘어 표 범위 밖 — 소득세를 빼지 않았습니다.</div>';
    else if (tax.missing) warn = '<div class="ruleline">세액표를 불러오지 못해 <b>소득세를 빼지 않았습니다</b>.</div>';
    else warn = '<div class="ruleline">소득세는 <b>매달 떼는 간이세액</b> — 연말정산에서 확정됩니다.</div>';

    var mwTag = mwGap < -0.5
      ? '<span class="tagline bad">최저임금 미달 — 시급 환산 ' + comma(Math.floor(hourly)) + '원(' + F.year + '년 ' + comma(F.mw) + '원)</span>'
      : '<span class="tagline ok">최저임금 이상 — 시급 환산 ' + comma(Math.floor(hourly)) + '원</span>';

    var holTag = holH > 0
      ? (mode === 'month'
        ? '<span class="tagline">월급에 주휴 포함 — 주 ' + comma(holWeek) + '원 상당</span>'
        : '<span class="tagline">주휴 주 ' + comma(holWeek) + '원 · 월 ' + comma(Math.round(holMonth)) + '원</span>')
      : '<span class="tagline warn">주 15시간 미만 — 주휴수당 없음</span>';

    return ''
      + '<div class="slip-h"><div class="slip-k">' + F.year + '년 요율 · ' + (mode === 'month' ? '월급' : '시급') + ' 기준</div><div class="stamp">' + F.year + ' 기준</div></div>'
      + '<div class="tear"></div>'
      + '<div class="big"><b>' + comma(net) + '원</b><span>예상 실수령액</span></div>'
      + '<p class="sub">세전 <b>' + won(monthly) + '</b> · 공제 <b>' + won(deduct) + '</b>' + (mode === 'hour' ? ' · 월 소정 ' + comma(Math.round(monthH)) + '시간' : '') + '</p>'
      + '<dl class="rows">' + rows + '</dl>'
      + warn
      + '<div class="chip-row">' + mwTag + holTag + '</div>';
  }

  /* ── ③ 퇴직금·미사용 연차수당 ────────────────────────────────────── */
  function annualDays(years, months) {
    if (years < 1) return Math.min(11, months);
    var y = Math.floor(years);
    return Math.min(25, 15 + (y >= 3 ? Math.floor((y - 1) / 2) : 0));
  }
  function lvSheet() {
    var din = day($('#lvIn').value), dout = day($('#lvOut').value);
    var pay = digits($('#lvPay').value);
    var avgManual = digits($('#lvAvg').value);
    var ordManual = digits($('#lvOrd').value);
    if (!din || !dout) return '<div class="empty">입사일과 퇴사일을 고르면 근속일수와 <b>퇴직금</b>을 계산합니다.</div>';
    var days = Math.round((dout - din) / 86400000) + 1;
    if (days <= 0) return '<div class="empty">퇴사일이 입사일보다 앞섭니다. 두 날짜를 바꿔 주세요.</div>';
    var years = days / 365;
    var months = (dout.getFullYear() - din.getFullYear()) * 12 + (dout.getMonth() - din.getMonth()) - (dout.getDate() < din.getDate() ? 1 : 0);
    var avg = avgManual != null ? avgManual : (pay != null ? pay * 3 / F.days3 : null);
    var ord = ordManual != null ? ordManual : (pay != null ? pay / F.monthHoursAt40 : null);
    if (avg == null && ord == null) return '<div class="empty">조건 칸에 <b>월평균 급여</b>를 입력하면 바로 계산됩니다.</div>';

    var eligible = days >= 365;
    var sev = eligible && avg != null ? Math.floor(avg * 30 * days / 365) : 0;
    var entitled = annualDays(years, Math.max(0, months));
    var usedEl = $('#lvUsed');
    usedEl.max = String(Math.max(1, entitled));
    if (!usedEl.dataset.touched) usedEl.value = String(entitled);
    var used = Math.max(0, Math.min(Number(usedEl.value) || 0, entitled));
    var usedOut = $('#lvUsedOut'); if (usedOut) usedOut.textContent = used + '일';
    var leave = ord != null ? Math.floor(ord * used) : 0;
    var total = sev + leave;

    var yrs = years >= 1 ? (Math.floor(years) + '년 ' + Math.round((years - Math.floor(years)) * 12) + '개월') : (months + '개월');
    var daysOut = $('#lvDaysOut');
    if (daysOut) daysOut.textContent = '근속 ' + comma(days) + '일 · ' + yrs + (eligible ? '' : ' (1년 미만)');
    var rows = ''
      + row('근속일수', comma(days) + '일', yrs)
      + row('1일 평균임금', won(avg != null ? avg : 0), '월급×3÷91.25')
      + row('퇴직금(1년에 30일분)', eligible ? won(sev) : '대상 아님', eligible ? '1년 이상' : '계속근로 1년 미만', '')
      + row('연차 발생일수', entitled + '일', years < 1 ? '월 개근 1일(최대 11일)' : '1년 15일')
      + row('1일 통상임금', won(ord != null ? ord : 0), '월급÷209')
      + row('미사용 연차수당', won(leave), used + '일분')
      + row('퇴직 시 정산 합계', won(total), '퇴직금+연차수당', 'sum');

    var warn = '';
    if (!eligible) warn = '<div class="ruleline">계속근로 <b>1년 미만</b>은 퇴직금 지급 대상이 아닙니다(근로자퇴직급여 보장법 제4조·제8조). 연차수당은 근속과 상관없이 발생분을 받습니다.</div>';
    else warn = '<div class="ruleline">퇴직금은 <b>1일 평균임금</b>으로 계산합니다 — 상여·연차수당이 3개월 임금총액에 들어가는지에 따라 달라집니다.</div>';

    return ''
      + '<div class="slip-h"><div class="slip-k">퇴직 정산 모의계산 · ' + F.year + '년 기준</div><div class="stamp">' + F.year + ' 기준</div></div>'
      + '<div class="tear"></div>'
      + '<div class="big"><b>' + comma(sev) + '원</b><span>예상 퇴직금</span></div>'
      + '<p class="sub">근속 <b>' + yrs + '</b>(' + comma(days) + '일) · 연차수당 <b>' + won(leave) + '</b> 포함 정산 <b>' + won(total) + '</b></p>'
      + '<dl class="rows">' + rows + '</dl>'
      + warn
      + '<div class="chip-row">'
      + '<span class="tagline">퇴직 후 14일 안에 지급</span>'
      + '<span class="tagline">주 15시간 미만은 퇴직금 없음</span>'
      + '</div>';
  }

  function row(label, value, note, cls) {
    return '<div class="row' + (cls === 'sum' ? ' sum' : '') + '"><dt>' + label + (note ? '<em>' + note + '</em>' : '') + '</dt>'
      + '<dd class="' + (cls && cls !== 'sum' ? cls : '') + '">' + value + '</dd></div>';
  }

  /* ── 다시 그리기(한 프레임에 한 번) ─────────────────────────────── */
  var raf = 0;
  function qa() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var active = 'ben';
      tabs.forEach(function (t) { if (t.getAttribute('aria-selected') === 'true') active = t.getAttribute('data-tab'); });
      if (active === 'ben') {
        $('#benSheet').innerHTML = benSheet();
        var txt = $('#benSheet').textContent.replace(/\s+/g, ' ').trim();
        live(txt.slice(0, 120));
      } else if (active === 'net') {
        $('#netSheet').innerHTML = netSheet();
        live($('#netSheet').textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
      } else {
        $('#lvSheet').innerHTML = lvSheet();
        live($('#lvSheet').textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
      }
    });
  }

  /* ── 입력 사건 ───────────────────────────────────────────────────── */
  // 칩: 같은 무리 안에서 하나만 눌린다
  $$('.chips').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.chip') : null;
      if (!b || !group.contains(b)) return;
      $$('.chip', group).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (b.getAttribute('data-mode')) {
        var mode = b.getAttribute('data-mode');
        var payEl = $('#netPay');
        $('#netPayLabel').textContent = mode === 'hour' ? '시급' : '세전 월급';
        $('#netPayHint').textContent = mode === 'hour'
          ? '시급×월 소정근로시간(주휴 포함)으로 월급을 환산해 계산합니다.'
          : '비과세 식대 등이 있으면 그만큼 뺀 금액을 넣습니다(간이세액표 기준).';
        payEl.value = mode === 'hour' ? comma(F.mw) : '3,000,000';
      }
      qa();
    });
  });

  // 범위 손잡이: 값 이름표를 함께 고친다
  function bindRange(id, out, unit) {
    var el = $(id), o = $(out);
    if (!el) return;
    function sync() { if (o) o.textContent = el.value + (unit || ''); }
    el.addEventListener('input', function () {
      if (id === '#lvUsed') el.dataset.touched = '1';
      sync(); qa();
    });
    sync();
  }
  bindRange('#benHours', '#benHoursOut', '시간');
  bindRange('#netHours', '#netHoursOut', '시간');
  bindRange('#lvUsed', '#lvUsedOut', '일');

  $$('#benPay,#benDays,#benBase,#netPay,#lvPay,#lvIn,#lvOut,#lvAvg,#lvOrd,#netFam,#lvUsed').forEach(function (el) {
    el.addEventListener('input', qa);
    el.addEventListener('change', qa);
    if (el.type === 'text') {
      el.addEventListener('blur', function () {
        var n = digits(el.value);
        el.value = n == null ? '' : comma(n);
        qa();
      });
    }
  });

  /* 주소로 들어온 탭(#net·#leave)을 연다 — 탭을 바꿀 때 주소는 건드리지 않는다.
     공용 core.js의 뒤로가기 장치(JCBackStack)가 주소를 되돌려 탭과 어긋나는 일을 막는다. */
  var h0 = (location.hash || '').replace('#', '');
  if (h0 === 'net' || h0 === 'leave' || h0 === 'ben') showTab(h0); else qa();
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (h === 'net' || h === 'leave' || h === 'ben') showTab(h);
  });

  // 처음 값이 그려진 뒤 한 번 더(글꼴·테마가 붙은 뒤 숫자 폭이 달라지지 않게)
  window.addEventListener('load', function () { qa(); });
})();
