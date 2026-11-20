/*
 * 내담자 응급실 트리아지 배정 보드 · 화면 엔진
 *
 * 자료(읽기만 한다)
 *   data/triage.json  client-triage-board v1.0.0 — 5단계 등급·요건·금액·출처·사례
 *
 * 하는 일
 *   다섯 축(생계·주거 / 심리·건강 / 구직의지 / 소득·재산 / 최근 2년 취업경험)을 읽어
 *   번호가 낮은(더 급한) 등급부터 차례로 대조하고, 그 등급의 우선 배정 제도·요건 대조·오늘 할 일을 그린다.
 *
 * 규칙
 *   - 외부 API·저장 없음. 입력값은 화면 안에서만 계산한다.
 *   - 화면에 그리는 문장·수치는 data/triage.json 에서 나온다. 계산은 이 파일이 한다.
 *   - 등급이 바뀌면 판정 카드만 다시 그린다(입력칸은 건드리지 않는다).
 */
(function () {
  'use strict';
  var d = document;
  var $ = function (id) { return d.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var num = function (n) { return Number(n).toLocaleString('ko-KR'); };
  var won = function (n) { return num(Math.round(n)) + '원'; };
  var pct = function (p) { return (Math.round(p * 10) / 10).toFixed(1) + '%'; };

  var D = null;
  var LVCOL = ['--l1', '--l2', '--l3', '--l4', '--l5'];
  var lastLevel = null;
  var st = {
    crisis: 'none', mind: 'none', will: 'prepare', age: 'mid', size: 4,
    income: null, asset: '1to4', exp: 'none',
    special: false, basic: false, ui: false, touched: false
  };
  var ASSET_LABEL = { lt1: '1억원 미만', '1to4': '1억~4억원', '4to5': '4억~5억원', gt5: '5억원 초과' };
  var EXP_LABEL = { d100: '100일 이상', h800: '800시간 이상', none: '미달·없음' };
  var AGE_LABEL = { youth: '청년(15~34세)', mid: '중장년(35~69세)', senior: '70세 이상' };
  var DEFAULTS = { crisis: 'none', mind: 'none', will: 'prepare', age: 'mid', asset: '1to4', exp: 'none' };

  /* ---------- 읽기 ---------- */
  function radio(name) {
    var el = d.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function readUI() {
    st.crisis = radio('crisis') || 'none';
    st.mind = radio('mind') || 'none';
    st.will = radio('will') || 'prepare';
    st.age = radio('age') || 'mid';
    st.exp = radio('exp') || 'none';
    st.size = Number(($('size') || {}).value || 4);
    st.asset = ($('asset') || {}).value || '1to4';
    var raw = String(($('income') || {}).value || '').replace(/[^\d]/g, '');
    st.income = raw === '' ? null : Number(raw);
    st.special = !!($('special') || {}).checked;
    st.basic = !!($('basic') || {}).checked;
    st.ui = !!($('ui') || {}).checked;
  }

  /* ---------- 기준선 ---------- */
  function median() {
    var k = String(st.size);
    return k === '8' ? D.median.over : (D.median.table[k] || D.median.over);
  }
  function sizeLabel() { return st.size >= 8 ? '8인 이상' : st.size + '인'; }

  /* ---------- 판정 ---------- */
  function evaluate() {
    var med = median();
    var T = D.thresholds;
    var p = st.income == null ? null : (st.income / med) * 100;
    var youth = st.age === 'youth';
    var midlife = st.age === 'mid';
    var inAge = st.age !== 'senior';
    var a4 = st.asset === 'lt1' || st.asset === '1to4';      // 4억원 이하
    var a5 = a4 || st.asset === '4to5';                       // 5억원 이하
    var expOK = st.exp !== 'none';
    var blocked = st.basic || st.ui;

    var t1 = inAge && p != null && !blocked &&
      ((youth && p <= T.type1_youth_pct && a5) || (!youth && p <= T.type1_pct && a4 && expOK));
    var t1sub = !t1 ? '' : (expOK ? '요건심사형' : (youth ? '선발형(청년)' : '선발형(비경활)'));
    var t2 = inAge && (st.special || youth || (midlife && p != null && p <= T.type2_midlife_pct));

    var lv = null;
    var reasons = [];
    var checks = [];
    var warn = [];
    var m60 = med * T.type1_pct / 100, m75 = med * T.hardship_pct / 100,
        m100 = med, m120 = med * T.type1_youth_pct / 100;

    var incomeLine = p == null
      ? '월 소득을 넣지 않아 중위소득 기준선과 견주지 못했습니다.'
      : '월 소득 ' + won(st.income) + '은 ' + sizeLabel() + ' 기준 중위 ' + pct(p) +
        ' (60% ' + won(m60) + ' · 100% ' + won(m100) + ')';
    var assetLine = '재산 ' + (ASSET_LABEL[st.asset] || '미확인') +
      (a4 ? ' — Ⅰ유형 4억원 기준 통과' : (a5 ? ' — 4억원 초과, 청년 5억원 기준만 통과' : ' — 5억원 기준도 초과'));

    function whyNot1() {
      if (!inAge) return '나이가 70세 이상입니다(국취 대상 15~69세)';
      if (st.basic) return '생계급여를 받고 있습니다';
      if (st.ui) return '실업급여를 받고 있습니다';
      if (p == null) return '소득이 확인되지 않았습니다';
      if (youth ? p > T.type1_youth_pct : p > T.type1_pct) return '소득이 ' + (youth ? '120%' : '60%') + ' 기준(' + won(youth ? m120 : m60) + ')을 넘습니다';
      if (youth ? !a5 : !a4) return '재산이 기준(' + (youth ? '5억' : '4억') + '원)을 넘습니다';
      if (!expOK) return '최근 2년 취업경험이 100일·800시간에 못 미칩니다';
      return '요건을 다 채우지 못했습니다';
    }

    if (st.mind === 'urgent') {
      lv = 1;
      reasons.push('<b>심리·건강</b> 축에서 자해·자살 위험(또는 응급 치료 필요)을 골랐습니다. 취업지원보다 위기개입이 먼저입니다.');
      reasons.push('109(자살예방상담)와 정신건강복지센터 연계를 같은 날 잡고, 119·112가 필요한 상태인지 확인합니다.');
      reasons.push(incomeLine + ' — 위기 종료 뒤 Ⅰ·Ⅱ유형을 다시 봅니다.');
      checks = [
        { label: '자살 위험', s: 'yes', t: '109 · 정신건강복지센터 연계' },
        { label: '생계·주거 지원', s: p != null && p <= T.hardship_pct ? 'yes' : 'chk', t: '긴급복지 소득 기준 75% ' + won(m75) + (p == null ? ' — 소득 확인 필요' : (p <= T.hardship_pct ? ' 이하: 충족' : ' 초과: 지자체·민간')) }
      ];
    } else if (st.crisis === 'collapse') {
      lv = 1;
      reasons.push('<b>생계·주거</b> 축에서 붕괴(퇴거·노숙·화재)를 골랐습니다. 긴급복지 주거지원 대상인지 먼저 확인합니다.');
      reasons.push(incomeLine + ' — 긴급복지 소득 기준 75%' + (p == null ? '는 소득 확인 뒤 판단합니다.' : (p <= T.hardship_pct ? ' 이하: 충족합니다.' : ' 초과: 지자체 조례·민간 지원으로 바꿉니다.')));
      reasons.push('재산·금융재산 기준은 지자체 확인이 필요합니다(대도시 2억 4,100만원, 주거용 재산 공제).');
      checks = [
        { label: '위기사유', s: 'yes', t: '화재·재해·퇴거 등 긴급복지지원법 위기상황' },
        { label: '소득 75% 이하', s: p != null ? (p <= T.hardship_pct ? 'yes' : 'no') : 'chk', t: won(m75) + (p == null ? ' — 소득 확인 필요' : '') },
        { label: '재산·금융재산', s: 'chk', t: '대도시 2억 4,100만원 · 금융재산 생활준비금+600만원' }
      ];
    } else if (st.crisis === 'risk') {
      lv = 1;
      reasons.push('<b>생계 위기</b>(소득 단절·체납)를 골랐습니다. 실직·휴폐업은 긴급복지지원법의 위기사유입니다.');
      reasons.push(incomeLine + ' — 긴급복지 소득 기준 75%' + (p == null ? '는 소득 확인 뒤 판단합니다.' : (p <= T.hardship_pct ? ' 이하: 신청할 수 있습니다.' : ' 초과: 긴급복지 대상이 아닙니다.')));
      reasons.push('생계비 3개월분과 주거·의료 지원을 먼저 붙이고, Ⅰ·Ⅱ유형은 위기 지원과 함께 준비합니다.');
      checks = [
        { label: '위기사유', s: 'yes', t: '실직·휴업·폐업으로 소득 상실' },
        { label: '소득 75% 이하', s: p != null ? (p <= T.hardship_pct ? 'yes' : 'no') : 'chk', t: won(m75) + (p == null ? ' — 소득 확인 필요' : '') },
        { label: '재산·금융재산', s: 'chk', t: '대도시 2억 4,100만원 · 금융재산 생활준비금+600만원' },
        { label: '국취 Ⅰ유형', s: t1 ? 'yes' : 'no', t: t1 ? '긴급지원과 함께 신청할 수 있습니다' : '이번 조건으로는 대상이 아닙니다' }
      ];
    } else if (t1) {
      lv = 2;
      reasons.push('<b>Ⅰ유형 요건을 채웠습니다.</b> ' + AGE_LABEL[st.age] + ' · 소득 ' + (p == null ? '미확인' : pct(p)) + ' · ' + assetLine + ' · 취업경험 ' + EXP_LABEL[st.exp] + '.');
      reasons.push('구직촉진수당 월 60만원이 6개월 붙고, 부양가족이 있으면 1인당 월 10만원(최대 40만원)이 더해집니다.');
      reasons.push(t1sub === '요건심사형'
        ? '요건심사형입니다. 예산 선발과 무관하게 요건으로 수급자격을 심사합니다.'
        : '선발형입니다. 요건은 맞지만 예산에 따라 선발되지 않을 수 있어 Ⅱ유형을 함께 준비합니다.');
      checks = [
        { label: '나이 15~69세', s: inAge ? 'yes' : 'no', t: AGE_LABEL[st.age] },
        { label: '소득 ' + (youth ? '120%' : '60%') + ' 이하', s: p != null ? (p <= (youth ? T.type1_youth_pct : T.type1_pct) ? 'yes' : 'no') : 'chk', t: p == null ? '소득 확인 필요' : pct(p) + ' (기준 ' + won(youth ? m120 : m60) + ')' },
        { label: '재산 ' + (youth ? '5억' : '4억') + '원 이하', s: youth ? a5 : a4, t: ASSET_LABEL[st.asset] },
        { label: '취업경험 100일·800시간', s: (youth && !expOK) || expOK ? 'yes' : 'no', t: (youth && !expOK) ? '청년 선발형은 경험 무관' : EXP_LABEL[st.exp] },
        { label: '생계급여·실업급여 수급 중 아님', s: blocked ? 'no' : 'yes', t: blocked ? '수급 중에는 Ⅰ유형 신청 불가' : '해당 없음' }
      ];
    } else if (t2) {
      lv = 3;
      reasons.push('<b>Ⅰ유형 대상이 아닙니다.</b> ' + whyNot1() + '. ' + incomeLine + '.');
      reasons.push('Ⅱ유형은 ' + (st.special ? '특정계층' : (youth ? '청년(소득·재산 무관)' : '중장년 소득 100% 이하')) + ' 조건으로 문이 열립니다.');
      reasons.push('참여수당 최대 25만원과 참여장려수당 최대 10만원, 집단상담·훈련 연계가 붙습니다.');
      checks = [
        { label: '나이 15~69세', s: inAge ? 'yes' : 'no', t: AGE_LABEL[st.age] },
        { label: '특정계층·청년이거나 중장년 100% 이하', s: (st.special || youth) ? 'yes' : (p != null ? (p <= T.type2_midlife_pct ? 'yes' : 'no') : 'chk'), t: st.special ? '특정계층 확인됨' : (youth ? '청년: 소득·재산 무관' : '중장년 ' + (p == null ? '소득 확인 필요' : pct(p)) + ' (기준 100% ' + won(m100) + ')') },
        { label: '생계급여·실업급여 수급 중 아님', s: blocked ? 'no' : 'yes', t: blocked ? '수급 중에는 Ⅱ유형도 신청 불가' : '해당 없음' }
      ];
    } else if (st.will === 'ready') {
      lv = 5;
      reasons.push('<b>구직의지</b> 축에서 바로 지원 가능을 골랐습니다. 국취 Ⅰ·Ⅱ유형 대상은 아닙니다 — ' + whyNot1() + '.');
      reasons.push(incomeLine + '.');
      reasons.push('채용 매칭과 실업급여 요건 확인(이직 전 18개월 중 180일)이 먼저입니다.');
      checks = [
        { label: '구직급여 180일', s: 'chk', t: '이직 전 18개월 피보험 단위기간 — 고용24에서 확인' },
        { label: '비자발적 이직', s: 'chk', t: '권고사직·계약만료·정당한 사유인지 확인' },
        { label: '국취 Ⅰ·Ⅱ유형', s: 'no', t: whyNot1() }
      ];
    } else {
      lv = 4;
      reasons.push('국취 Ⅰ·Ⅱ유형 대상이 아닙니다 — ' + whyNot1() + '.');
      reasons.push(incomeLine + '.');
      reasons.push('바로 지원할 자리가 적으니 훈련·자격으로 직무를 바꾸는 쪽이 빠릅니다(훈련비 300만원+200만원).');
      checks = [
        { label: '나이 75세 미만', s: inAge ? 'yes' : 'no', t: AGE_LABEL[st.age] },
        { label: '생계급여 수급 중 아님', s: st.basic ? 'no' : 'yes', t: st.basic ? '생계급여 수급자는 카드 발급 제외' : '해당 없음' },
        { label: '훈련할 직무', s: 'chk', t: '직무 후보 하나를 정한 뒤 과정 검색' }
      ];
    }

    if (!inAge) warn.push('만 70세 이상은 국민취업지원제도(15~69세) 대상이 아닙니다. 지자체 노인일자리·고용24 알선으로 안내합니다.');
    if (st.basic) warn.push('생계급여 수급 중이면 Ⅰ유형은 신청할 수 없습니다(Ⅱ유형 특정계층·자활사업으로).');
    if (st.ui) warn.push('실업급여 수급 중에는 국민취업지원제도에 함께 참여할 수 없습니다. 수급 종료 6개월 뒤 신청할 수 있습니다.');
    if (p == null) warn.push('월 소득을 넣으면 등급이 확정됩니다. 지금 등급은 잠정입니다.');

    return { lv: lv, sub: lv === 2 ? t1sub : '', reasons: reasons, checks: checks, warn: warn, p: p };
  }

  /* ---------- 그리기 ---------- */
  function render() {
    readUI();
    var res = $('res'), lvBox = $('lv'), strip = $('strip');
    var r = st.touched ? evaluate() : null;
    var L = r && r.lv ? D.levels[r.lv - 1] : null;

    /* 소득 기준선 안내 */
    var med = median(), m60 = med * D.thresholds.type1_pct / 100;
    $('incNote').innerHTML = sizeLabel() + ' 기준 60% <b>' + won(m60) + '</b> · 100% <b>' + won(med) + '</b>';

    if (!L) {
      lvBox.setAttribute('data-empty', 'true');
      lvBox.style.removeProperty('--lvl');
      res.style.removeProperty('--lvl');
      strip.style.removeProperty('--lvl');
      strip.removeAttribute('data-lv');
      $('lvN').textContent = '–';
      $('lvName').textContent = '아직 판정 전';
      $('lvTag').textContent = '다섯 축을 고르면 나옵니다';
      $('stN').textContent = '–';
      $('stName').textContent = '아직 판정 전';
      $('stTag').textContent = '사례 단추 또는 축을 고르세요';
      $('live').textContent = '';
      $('resLine').innerHTML = '위의 사례 단추를 누르거나, 1~5번 축을 하나씩 고르세요. <b>소득·재산</b>만 넣어도 초안이 나옵니다.';
      $('why').innerHTML = '<li>등급이 정해지면 이 자리에 <b>왜 이 등급인지</b>가 숫자와 함께 나옵니다.</li>';
      ['route', 'alongBox', 'todoBox', 'warn'].forEach(function (id) { $(id).hidden = true; });
      Array.prototype.forEach.call(d.querySelectorAll('#ladder i'), function (el) { el.classList.remove('on'); });
      lastLevel = null;
      return;
    }

    var col = 'var(' + LVCOL[r.lv - 1] + ')';
    lvBox.setAttribute('data-empty', 'false');
    lvBox.style.setProperty('--lvl', col);
    res.style.setProperty('--lvl', col);
    strip.style.setProperty('--lvl', col);
    strip.setAttribute('data-lv', String(r.lv));
    $('lvN').textContent = String(r.lv);
    $('lvName').textContent = L.name;
    $('lvTag').textContent = L.tag + (r.sub ? ' · ' + r.sub : '');
    if (lastLevel !== r.lv) $('live').textContent = r.lv + '단계 ' + L.name + '. ' + L.tag;
    $('stN').textContent = String(r.lv);
    $('stName').textContent = r.lv + '단계 · ' + L.name;
    $('stTag').textContent = L.tag;
    $('resLine').textContent = L.line;

    Array.prototype.forEach.call(d.querySelectorAll('#ladder i'), function (el, i) {
      el.classList.toggle('on', i < r.lv);
    });

    $('why').innerHTML = r.reasons.slice(0, 3).map(function (t) {
      return '<li>' + t + '</li>';
    }).join('');

    $('route').hidden = false;
    $('rtName').textContent = L.route.system + (r.sub ? ' · ' + r.sub : '');
    $('rtOrg').textContent = L.route.org;
    $('rtSup').innerHTML = L.route.support.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('rtReq').innerHTML = r.checks.map(function (c) {
      var mark = c.s === 'yes' ? '✓' : (c.s === 'no' ? '✕' : '–');
      var word = c.s === 'yes' ? '충족' : (c.s === 'no' ? '미달' : '확인 필요');
      return '<li><span class="ok" data-s="' + c.s + '" aria-hidden="true">' + mark + '</span>' +
        '<span><b>' + esc(c.label) + '</b><span class="sr"> ' + word + '</span> — ' + esc(c.t) + '</span></li>';
    }).join('');
    $('rtLaw').innerHTML = '근거 ' + L.route.law.map(function (t) { return esc(t); }).join(' · ');

    $('alongBox').hidden = false;
    $('along').innerHTML = L.along.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');

    $('todoBox').hidden = false;
    $('todo').innerHTML = L.next.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

    var warns = [L.warn].concat(r.warn);
    $('warn').hidden = false;
    $('warn').innerHTML = warns.map(function (t) { return '<b>주의</b> ' + esc(t); }).join('<br>');

    if (lastLevel !== null && lastLevel !== r.lv && !reduce()) {
      lvBox.classList.remove('pulse');
      void lvBox.offsetWidth;
      lvBox.classList.add('pulse');
      setTimeout(function () { lvBox.classList.remove('pulse'); }, 320);
    }
    lastLevel = r.lv;
  }

  function reduce() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- 사례 ---------- */
  function applyPreset(p) {
    var v = p.v;
    ['crisis', 'mind', 'will', 'age', 'exp'].forEach(function (k) {
      var el = d.querySelector('input[name="' + k + '"][value="' + v[k] + '"]');
      if (el) el.checked = true;
    });
    $('size').value = String(v.size);
    $('asset').value = v.asset || '1to4';
    $('income').value = v.income == null ? '' : num(v.income);
    $('special').checked = !!v.special;
    $('basic').checked = !!v.basic;
    $('ui').checked = !!v.ui;
    st.touched = true;
    markPreset(p.id);
    render();
  }
  function markPreset(id) {
    Array.prototype.forEach.call(d.querySelectorAll('#presets .ps[data-id]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-id') === id ? 'true' : 'false');
    });
  }
  function clearPreset() {
    Array.prototype.forEach.call(d.querySelectorAll('#presets .ps[data-id]'), function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
  }
  function resetAll() {
    ['crisis', 'mind', 'will', 'age', 'exp'].forEach(function (k) {
      var el = d.querySelector('input[name="' + k + '"][value="' + DEFAULTS[k] + '"]');
      if (el) el.checked = true;
    });
    $('size').value = '4';
    $('asset').value = '1to4';
    $('income').value = '';
    $('special').checked = false;
    $('basic').checked = false;
    $('ui').checked = false;
    st.touched = false;
    clearPreset();
    render();
  }

  function buildPresets() {
    var box = $('presets');
    box.innerHTML = D.presets.map(function (p) {
      return '<button type="button" class="ps" data-id="' + esc(p.id) + '" aria-pressed="false">' +
        esc(p.label) + '<small>' + esc(p.note || '') + '</small></button>';
    }).join('') + '<button type="button" class="ps ps-reset" id="resetBtn">처음부터</button>';

    box.addEventListener('click', function (e) {
      var b = e.target.closest('.ps');
      if (!b) return;
      if (b.id === 'resetBtn') { resetAll(); return; }
      var preset = D.presets.filter(function (p) { return p.id === b.getAttribute('data-id'); })[0];
      if (preset) applyPreset(preset);
    });
  }

  /* ---------- 기준표·규칙·출처 ---------- */
  function buildReference() {
    $('lvtab').innerHTML = D.levels.map(function (l) {
      return '<li style="--lvcol:var(--l' + l.n + ')">' +
        '<span class="lvt-n" aria-hidden="true">' + l.n + '</span>' +
        '<span class="lvt-b"><b>' + esc(l.name) + ' <em>' + esc(l.tag) + '</em></b>' +
        '<span>' + esc(l.ladder.criteria) + '</span>' +
        '<span>' + esc(l.route.system) + ' — ' + esc(l.ladder.amount) + '</span>' +
        '<em>' + esc(l.route.law[0]) + '</em></span></li>';
    }).join('');

    $('rules').innerHTML = D.rules.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

    var m = D.median, rows = ['1', '2', '3', '4', '5', '6', '7'];
    var head = '<thead><tr><th>가구원</th><th>60%</th><th>75%</th><th>100%</th><th>120%</th></tr></thead>';
    var body = rows.map(function (k) {
      var v = m.table[k];
      return '<tr><td>' + k + '인</td><td>' + num(Math.round(v * 0.6)) + '</td><td>' + num(Math.round(v * 0.75)) + '</td><td>' + num(v) + '</td><td>' + num(Math.round(v * 1.2)) + '</td></tr>';
    }).join('') + '<tr><td>8인 이상</td><td>' + num(Math.round(m.over * 0.6)) + '</td><td>' + num(Math.round(m.over * 0.75)) + '</td><td>' + num(m.over) + '</td><td>' + num(Math.round(m.over * 1.2)) + '</td></tr>';
    $('mtab').innerHTML = head + '<tbody>' + body + '</tbody>';

    $('srcs').innerHTML = D.sources.map(function (s) {
      return '<li><b>' + esc(s.org) + '</b> 「' + esc(s.title) + '」 <em>' + esc(s.date) + '</em><br>' +
        esc(s.use) + ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">원문</a><br>' +
        '<em>' + esc(s.license) + '</em></li>';
    }).join('');
  }

  /* ---------- 기준 보기: 한 번에 하나만 펼친다 ---------- */
  function buildPanels() {
    var btns = Array.prototype.slice.call(d.querySelectorAll('#refTabs button'));
    function closeAll() {
      btns.forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
        $('pnl-' + b.getAttribute('data-panel')).hidden = true;
      });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') === 'true';
        closeAll();
        if (open) return;
        b.setAttribute('aria-expanded', 'true');
        $('pnl-' + b.getAttribute('data-panel')).hidden = false;
      });
    });
  }

  /* ---------- 연결 ---------- */
  function bind() {
    var axes = $('axes');
    axes.addEventListener('change', function () { st.touched = true; clearPreset(); render(); });

    var inc = $('income'), tick = false;
    inc.addEventListener('input', function () {
      var digits = inc.value.replace(/[^\d]/g, '');
      if (digits !== inc.value) inc.value = digits;
      st.touched = true;
      clearPreset();
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () { tick = false; render(); });
    });
    inc.addEventListener('blur', function () {
      var v = inc.value.replace(/[^\d]/g, '');
      if (v) inc.value = num(v);
    });
    inc.addEventListener('focus', function () {
      inc.value = inc.value.replace(/[^\d]/g, '');
    });

    var pvT = $('pvT'), pvB = $('pvB');
    pvT.addEventListener('click', function () {
      var open = pvT.getAttribute('aria-expanded') === 'true';
      pvT.setAttribute('aria-expanded', open ? 'false' : 'true');
      pvB.hidden = open;
      $('pv').querySelector('.pv-c').textContent = open ? '펼치기' : '접기';
    });
  }

  function init(data) {
    D = data;
    buildPresets();
    buildReference();
    buildPanels();
    bind();
    render();
  }

  fetch('./data/triage.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(init)
    .catch(function () {
      var res = $('res');
      if (res) res.innerHTML = '<p class="empty">기준 자료를 불러오지 못했습니다. 잠시 뒤 화면을 다시 열어 주세요.</p>';
    });
})();
