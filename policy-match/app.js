/*
 * 지원제도 중복·우선순위 매칭기 · 화면 엔진
 *
 * 자료(읽기만 한다)
 *   data/policy.json  policy-match v1.0.0 — 제도 7·관계 21·순서 문안·사례·출처
 *
 * 하는 일
 *   ① 네 단계(상태·나이/대상·소득/재산·목표)를 읽어, 지금 쓸 수 있는 제도만 남기고
 *      목표에 맞춰 1·2·3순위와 '언제'를 정한다. 겹치는 제도는 관계표에서 근거를 가져온다.
 *   ② 일곱 제도의 21쌍 관계를 표로 그린다. 칸을 누르면 근거·상담 팁이 열린다.
 *
 * 규칙
 *   - 외부 API·저장 없음. 입력값은 화면 안에서만 계산한다.
 *   - 화면에 그리는 문장·수치는 data/policy.json 에서 나온다. 계산(자격 판정·순서)은 이 파일이 한다.
 *   - 확인되지 않은 조합은 '확인 필요'로 두고 단정하지 않는다.
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

  var D = null;
  var SYS = {};
  /* 관계표의 열 — 국민취업지원제도는 Ⅰ·Ⅱ를 한 칸으로 묶는다(유형 차이는 칸 설명에서 가른다) */
  var COLS = [
    { id: 'ui', label: '실업급여', full: '실업급여' },
    { id: 'kuk', label: '국취', full: '국민취업지원제도' },
    { id: 'card', label: '내일배움', full: '국민내일배움카드' },
    { id: 'exp', label: '일경험', full: '미래내일 일경험' },
    { id: 'youth', label: '청년도전', full: '청년도전지원사업' },
    { id: 'mid', label: '경력지원', full: '중장년 경력지원제' },
    { id: 'saeil', label: '새일인턴', full: '새일여성인턴' }
  ];
  var STATE = {
    ok: { sym: '○', word: '가능', label: '동시 가능' },
    adjust: { sym: '△', word: '조정', label: '감액·조정' },
    no: { sym: '✕', word: '불가', label: '중복 불가(순차)' },
    check: { sym: '?', word: '확인', label: '확인 필요' },
    na: { sym: '–', word: '없음', label: '해당 없음' }
  };
  var STATUS_LABEL = { ui: '실업급여 수급 중', uiSoon: '실업급여 수급 예정', none: '미취업·비수급', work: '재직·이직 준비', self: '자영업·특고' };
  var AGE_LABEL = { youth: '청년 15~34세', mid: '35~49세', fifty: '50~64세', senior: '65세 이상' };
  var INCOME_LABEL = { '60': '중위 60% 이하', '100': '중위 100% 이하', '120': '중위 120% 이하', over: '중위 120% 초과', unknown: '소득 모름' };
  var GOAL_LABEL = { living: '생계지원+취업알선', train: '직무훈련', exp: '일경험·인턴', job: '즉시 취업' };
  var WHEN = {
    now: '지금', afterUI: '수급 종료 후', after6: '6개월 뒤', afterJob: '이직 후', afterTrain: '훈련 이수 후', afterExit: '폐업 후', afterYouth: '청년도전 이수 후'
  };

  var st = {
    status: 'none', age: 'mid', income: '100', asset: '5', size: 4, goal: 'living',
    women: false, weak: false, jobless: false, exp: false, touched: false
  };
  var pairIndex = {};
  var selected = null;      /* 지금 열어 둔 관계 칸 */
  var filter = {};          /* 관계 종류 필터 */
  var focus = '';           /* 강조한 제도 */
  var lastHead = '';

  /* ---------------- 읽기 ---------------- */
  function radio(name, fallback) {
    var el = d.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }
  function readUI() {
    st.status = radio('status', 'none');
    st.age = radio('age', 'mid');
    st.income = radio('income', '100');
    st.goal = radio('goal', 'living');
    st.asset = ($('asset') || {}).value || '5';
    st.size = Number(($('size') || {}).value || 4);
    st.women = !!($('women') || {}).checked;
    st.weak = !!($('weak') || {}).checked;
    st.jobless = !!($('jobless') || {}).checked;
    st.exp = !!($('exp') || {}).checked;
  }

  /* ---------------- 기준선 ---------------- */
  function median() {
    var k = String(st.size);
    return k === '6' ? D.median.over : (D.median.table[k] || D.median.table['4']);
  }
  function sizeLabel() { return st.size >= 6 ? '6인 이상' : st.size + '인'; }
  function won(n) { return num(Math.round(n)) + '원'; }

  /* ---------------- 자격 판정 ---------------- */
  function c() {
    var med = median();
    var youth = st.age === 'youth';
    var fifty = st.age === 'fifty';
    var senior = st.age === 'senior';
    var inKuk = !senior;                        /* 65~69세는 국취 대상, 70세 이상은 밖 — 화면에서 확인 문구 */
    var inc = st.income;
    var incKnown = inc !== 'unknown';
    var inc60 = inc === '60';
    var inc100 = inc === '100' || inc60;
    var inc120 = inc === '120' || inc100;
    var asset4 = st.asset === '4';
    var asset5 = st.asset === '5' || asset4;
    var assetKnown = st.asset !== 'unknown';
    var emp = st.exp;

    /* Ⅰ유형: 소득 60%(청년 120%) · 재산 4억(청년 5억) · 최근 2년 취업 100일/800시간 */
    var k1Income = youth ? inc120 : inc60;
    var k1Asset = youth ? asset5 : asset4;
    var k1ok = st.status === 'none' && inKuk && k1Income && k1Asset && (emp || youth);
    var k1Select = k1ok && !emp;                /* 청년 선발형(예산 범위) */
    var k1check = st.status === 'none' && inKuk && (!incKnown || !assetKnown);
    /* Ⅱ유형: 중위 100% 이하 · 청년·특정계층은 소득 무관 */
    var k2ok = st.status === 'none' && inKuk && (youth || st.weak || inc100 || !incKnown);

    return {
      med: med, youth: youth, fifty: fifty, senior: senior, inKuk: inKuk,
      inc: inc, incKnown: incKnown, inc60: inc60, inc100: inc100, inc120: inc120,
      asset4: asset4, asset5: asset5, assetKnown: assetKnown, emp: emp,
      k1ok: k1ok, k1Select: k1Select, k1check: k1check, k2ok: k2ok,
      m60: med * 0.6, m100: med, m120: med * 1.2
    };
  }

  /* Ⅰ유형 요건을 한 줄로 (카드 안 작은 줄) */
  var SHORT_INCOME = { '60': '중위 60% 이하', '100': '100% 이하', '120': '120% 이하', over: '120% 초과', unknown: '모름' };
  var SHORT_ASSET = { '4': '재산 4억 이하', '5': '재산 5억 이하', over: '재산 5억 초과', unknown: '재산 모름' };
  function kuk1Qual(x) {
    return SHORT_INCOME[st.income] + ' · ' + SHORT_ASSET[st.asset] + ' · 취업경험 ' +
      (x.emp ? '충족' : (x.youth ? '없음(선발형)' : '미달'));
  }

  /* ---------------- 순서 짜기 ---------------- */
  function planFor() {
    var x = c();
    var steps = [];
    var blocked = [];
    var head = '';

    function add(sid, whenKey, why, act, caution, qual) {
      steps.push({
        sid: sid, when: whenKey, why: why, act: act || [], caution: caution || '', qual: qual || '',
        links: (SYS[sid] && SYS[sid].links) || []
      });
    }
    function fromData(statusKey, sid) {
      var p = (D.plan[statusKey] || {})[sid];
      return p || { why: '', act: [], caution: '' };
    }

    if (st.status === 'ui') {
      var a = fromData('ui', 'ui'), b = fromData('ui', 'card'), e = fromData('ui', 'kuk2');
      add('ui', 'now', a.why, a.act, a.caution);
      add('card', 'now', b.why, b.act, b.caution);
      add('kuk2', 'afterUI', e.why, e.act, e.caution);
      head = '실업급여를 지키고, 수급이 끝나면 Ⅱ유형으로 잇습니다.';
      blocked.push(['국민취업지원제도 Ⅰ·Ⅱ', '실업급여 수급 중에는 참여할 수 없습니다']);
      if (x.youth) blocked.push(['청년도전지원사업', '수급 중·종료 6개월 미경과 참여 제한']);
      if (st.women) blocked.push(['새일여성인턴', '인턴은 근로계약 — 시작하면 수급이 종료됩니다']);
    } else if (st.status === 'uiSoon') {
      var a2 = fromData('uiSoon', 'ui'), b2 = fromData('uiSoon', 'card'), e2 = fromData('uiSoon', 'kuk2');
      add('ui', 'now', a2.why, a2.act, a2.caution);
      add('card', 'now', b2.why, b2.act, b2.caution);
      add('kuk2', 'afterUI', e2.why, e2.act, e2.caution);
      head = '실업급여 신청부터, 수급이 끝나면 Ⅱ유형으로 잇습니다.';
      blocked.push(['국민취업지원제도 Ⅰ유형', '마지막 수급일 다음 날부터 6개월이 지나야 합니다']);
      if (x.youth) blocked.push(['청년도전지원사업', '수급 중·종료 6개월 미경과 참여 제한']);
    } else if (st.status === 'work') {
      var w1 = fromData('work', 'card'), w2 = fromData('work', 'ui'), w3 = fromData('work', 'kuk2');
      add('card', 'now', w1.why, w1.act, w1.caution);
      add('ui', 'afterJob', w2.why, w2.act, w2.caution);
      add('kuk2', 'afterJob', w3.why, w3.act, w3.caution);
      head = '지금은 훈련 카드, 나머지는 이직 뒤에 열립니다.';
      blocked.push(['국민취업지원제도', '주 30시간 이상 근무 중이면 참여 제한']);
      blocked.push(['미래내일 일경험·경력지원제·청년도전', '미취업자 대상 — 재직 중에는 신청할 수 없습니다']);
    } else if (st.status === 'self') {
      var s1 = fromData('self', 'card'), s2 = fromData('self', 'kuk2'), s3 = fromData('self', 'ui');
      add('card', 'now', s1.why, s1.act, s1.caution);
      add('kuk2', 'now', s2.why, s2.act, s2.caution);
      add('ui', 'afterExit', s3.why, s3.act, s3.caution);
      head = '카드와 Ⅱ유형, 폐업하면 실업급여를 봅니다.';
      blocked.push(['미래내일 일경험·청년도전', '사업자등록 중에는 참여할 수 없습니다']);
      blocked.push(['중장년 경력지원제', '사업자등록 중이면 제외 — 폐업 신고 뒤에 가능']);
    } else {
      /* 미취업·비수급 — 목표에 따라 후보를 줄 세운다 */
      var base = {
        kuk1: { living: 30, train: 20, exp: 14, job: 18 },
        kuk2: { living: 26, train: 18, exp: 14, job: 22 },
        card: { living: 12, train: 32, exp: 16, job: 12 },
        exp: { living: 8, train: 12, exp: 28, job: 16 },
        youth: { living: 24, train: 16, exp: 12, job: 10 },
        mid: { living: 6, train: 14, exp: 30, job: 12 },
        saeil: { living: 8, train: 14, exp: 26, job: 28 }
      };
      var cand = [];
      var g = st.goal;
      if (x.k1ok) cand.push(['kuk1', base.kuk1[g] + (x.inc60 ? 4 : 0) - (x.k1Select ? 5 : 0)]);
      if (x.k2ok) cand.push(['kuk2', base.kuk2[g] + (g === 'job' ? 2 : 0)]);
      cand.push(['card', base.card[g]]);
      if (x.youth) cand.push(['exp', base.exp[g] + (g === 'exp' ? 4 : 0)]);
      if (x.youth && st.jobless) cand.push(['youth', base.youth[g] + 14]);
      if (x.fifty) cand.push(['mid', base.mid[g] + (g === 'exp' ? 6 : 0)]);
      if (st.women) cand.push(['saeil', base.saeil[g] + (g === 'exp' || g === 'job' ? 6 : 0)]);
      cand.sort(function (p, q) { return q[1] - p[1]; });

      /* 국취 Ⅰ·Ⅱ는 같은 제도의 두 유형 — 한 계획에 둘을 나란히 놓으면 두 번 받는 것처럼 읽힌다. */
      var picked = [], fam = {};
      cand.forEach(function (p) {
        var f = group(p[0]);
        if (fam[f] || picked.length >= 3) return;
        fam[f] = 1;
        picked.push(p[0]);
      });
      var whens = {
        kuk1: 'now', kuk2: 'now', card: 'now', exp: 'now',
        youth: 'now', mid: (st.exp ? 'now' : 'afterTrain'), saeil: 'now'
      };
      /* 청년도전에 참여하는 동안에는 국취에 참여할 수 없다 — 국취는 그 뒤 순서다. */
      if (picked.indexOf('youth') >= 0) {
        if (picked.indexOf('kuk1') >= 0) whens.kuk1 = 'afterYouth';
        if (picked.indexOf('kuk2') >= 0) whens.kuk2 = 'afterYouth';
      }
      picked.forEach(function (sid) {
        var p = fromData('none', sid);
        var why = p.why, caution = p.caution, qual = '';
        if (sid === 'kuk1') {
          qual = kuk1Qual(x);
          if (x.k1Select) caution = '청년 선발형이라 예산에 따라 밀릴 수 있습니다. 요건은 충족.';
          if (whens.kuk1 === 'afterYouth') why = '청년도전을 마치면 Ⅰ유형으로 바로 넘어갈 수 있습니다. ' + why;
          else caution += ' Ⅰ유형이 안 되면 Ⅱ유형도 문이 열려 있습니다.';
        }
        if (sid === 'kuk2') {
          qual = '가구소득 ' + SHORT_INCOME[st.income] + (x.youth || st.weak ? ' · 청년·특정계층은 소득 무관' : '');
          if (whens.kuk2 === 'afterYouth') why = '청년도전을 마친 뒤 Ⅱ유형으로 취업지원을 이어받습니다. ' + why;
          if (x.k1ok) caution += ' Ⅰ유형 요건을 채우면 월 60만원 수당까지 붙습니다.';
        }
        if (sid === 'mid' && !st.exp) caution = '자격취득이나 훈련을 먼저 마쳐야 문이 열립니다(그 직무 경험 1년 미만).';
        add(sid, whens[sid], why, p.act, caution, qual);
      });

      head = ({
        saeil: '새일센터 상담·인턴으로 시작해 훈련 카드로 직무를 보강합니다.',
        mid: '훈련·자격을 먼저, 그 뒤 경력지원제 일경험으로 잇습니다.',
        youth: '청년도전으로 의욕부터, 그 뒤 국취·훈련으로 잇습니다.',
        exp: '일경험으로 경력을 먼저 채웁니다.',
        kuk1: '현금 수당(국취 Ⅰ)을 먼저, 훈련 카드로 재취업활동을 채웁니다.',
        kuk2: '국취 Ⅱ로 지원을 받으며 훈련·일자리를 찾습니다.',
        card: '훈련 카드로 직무를 먼저 바꿉니다.'
      })[picked[0]] || ({
        living: '현금 수당을 앞에, 훈련 카드로 재취업활동을 채웁니다.',
        train: '훈련 카드를 먼저, 수당이 붙는 국취를 다음에.',
        exp: '일경험·인턴을 먼저, 대상에 맞는 문으로 골랐습니다.',
        job: '바로 지원할 자리와 취업알선부터.'
      })[g];

      var inPlan = {};
      picked.forEach(function (sid) { inPlan[group(sid)] = 1; });
      if (!x.inKuk) blocked.push(['국민취업지원제도 Ⅰ·Ⅱ', '만 70세 이상은 대상 밖(65~69세는 가능)']);
      else if (!inPlan.kuk) blocked.push(['국민취업지원제도 Ⅱ유형', '소득이 중위 100%를 넘고 청년·특정계층도 아닙니다']);
      if (!x.youth) blocked.push(['미래내일 일경험·청년도전', '만 34세 이하(군필·지역특화 39세) 대상']);
      else if (!inPlan.youth) blocked.push(['청년도전지원사업', '최근 6개월 취업·교육 이력이 있으면(구직단념 아님) 대상이 아닙니다']);
      if (!x.fifty) blocked.push(['중장년 경력지원제', '만 50~65세 대상 — 지금은 나이 밖']);
      if (!st.women) blocked.push(['새일여성인턴', '경력보유여성이 아니면 해당 없음']);
      blocked = blocked.slice(0, 3);
    }

    return { x: x, steps: steps, blocked: blocked, head: head };
  }

  /* ---------------- 관계 ---------------- */
  function group(sid) { return sid === 'kuk1' || sid === 'kuk2' ? 'kuk' : sid; }
  function pairOf(a, b) {
    var k = [a, b].sort().join('|');
    return pairIndex[k] || null;
  }
  function crossPairs(steps) {
    var ids = [], seen = {};
    steps.forEach(function (s) {
      var g = group(s.sid);
      if (!seen[g]) { seen[g] = 1; ids.push(g); }
    });
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var p = pairOf(ids[i], ids[j]);
        if (p) out.push(p);
      }
    }
    return out;
  }

  /* ---------------- 그리기: 순서 ---------------- */
  function renderPlan() {
    var tl = $('tl'), head = $('plHead'), cross = $('cross'), blk = $('blk'), empty = $('planEmpty');
    if (!st.touched) {
      head.textContent = '네 단계를 고르면 순서가 나옵니다.';
      if (empty) empty.hidden = false;
      tl.hidden = true; cross.hidden = true; blk.hidden = true;
      $('stN').textContent = '–';
      $('stName').textContent = '아직 판정 전';
      $('stTag').textContent = '사례 단추 또는 네 단계를 고르세요';
      $('live').textContent = '';
      return;
    }
    if (empty) empty.hidden = true;
    tl.hidden = false;

    var r = planFor();
    head.innerHTML = '<b>' + esc(STATUS_LABEL[st.status]) + ' · ' + esc(AGE_LABEL[st.age]) + ' · ' + esc(GOAL_LABEL[st.goal]) + '</b> → ' + esc(r.head);

    tl.innerHTML = r.steps.map(function (s, i) {
      var sys = SYS[s.sid] || { name: s.sid, short: s.sid, links: [] };
      var w = WHEN[s.when] || '지금';
      var more = (sys.links && sys.links.length)
        ? ' <a class="ts-more" href="' + esc(sys.links[0].h) + '">' + esc(sys.links[0].t) + ' →</a>' : '';
      return '<li class="ts" data-rank="' + (i + 1) + '" data-sid="' + esc(s.sid) + '">' +
        '<span class="ts-n num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<div class="ts-b">' +
          '<span class="ts-k"><span class="ts-when" data-w="' + (s.when === 'now' ? 'now' : 'next') + '">' + esc(w) + '</span>' + (i + 1) + '순위</span>' +
          '<b>' + esc(sys.name) + '</b>' +
          '<p class="ts-w">' + esc(s.why) + more + '</p>' +
          (s.qual ? '<p class="ts-q">' + esc(s.qual) + '</p>' : '') +
          (s.act && s.act.length ? '<ul class="ts-a">' + s.act.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
          (s.caution ? '<p class="ts-c"><b>주의</b> ' + esc(s.caution) + '</p>' : '') +
        '</div></li>';
    }).join('');

    /* 겹치는 조합 */
    var pairs = crossPairs(r.steps).filter(function (p) { return p.state !== 'ok' && p.state !== 'na'; });
    if (pairs.length) {
      cross.hidden = false;
      $('crossList').innerHTML = pairs.map(function (p) {
        var s = STATE[p.state];
        return '<button type="button" class="cross-b" data-pair="' + esc([p.a, p.b].sort().join('|')) + '" aria-label="' + esc(nameOf(p.a) + ' × ' + nameOf(p.b) + ' — ' + s.label + ' 근거 열기') + '">' +
          '<i style="color:var(--m-' + (p.state === 'adjust' ? 'adj' : p.state === 'no' ? 'no' : p.state === 'check' ? 'chk' : 'na') + ')">' + s.sym + ' ' + esc(s.word) + '</i>' +
          '<span>' + esc(shortOf(p.a)) + ' × ' + esc(shortOf(p.b)) + '</span></button>';
      }).join('');
    } else {
      cross.hidden = true;
    }

    if (r.blocked.length) {
      blk.hidden = false;
      blk.innerHTML = '<b>지금은 대상이 아님</b> — ' + r.blocked.map(function (b) {
        return esc(b[0]) + '(' + esc(b[1]) + ')';
      }).join(' · ');
    } else {
      blk.hidden = true;
    }

    var first = SYS[r.steps[0].sid];
    $('stN').textContent = '1';
    $('stName').textContent = first ? first.name : '–';
    $('stTag').textContent = first ? (first.one || (first.give && first.give[0]) || '') : '';
    if (head.textContent !== lastHead) {
      lastHead = head.textContent;
      $('live').textContent = '1순위 ' + (first ? first.name : '') + '. ' + (first ? (first.one || '') : '');
    }
  }

  function shortOf(id) {
    for (var i = 0; i < COLS.length; i++) if (COLS[i].id === id) return COLS[i].label;
    return id;
  }

  function nameOf(id) {
    for (var i = 0; i < COLS.length; i++) if (COLS[i].id === id) return COLS[i].full;
    return id;
  }

  /* ---------------- 그리기: 매트릭스 ---------------- */
  function buildMatrix() {
    $('mxHead').innerHTML = '<tr>' + '<th scope="col"><span class="hb" aria-hidden="true">제도</span></th>' +
      COLS.map(function (c2) {
        return '<th scope="col"><button type="button" class="hb" data-focus="' + c2.id + '" aria-pressed="false" aria-label="' + esc(c2.full) + ' 줄만 강조">' + esc(c2.label) + '</button></th>';
      }).join('') + '</tr>';

    $('mxBody').innerHTML = COLS.map(function (row) {
      return '<tr>' +
        '<th scope="row"><button type="button" class="hb" data-dir="row" data-focus="' + row.id + '" aria-pressed="false" aria-label="' + esc(row.full) + ' 줄만 강조">' + esc(row.label) + '</button></th>' +
        COLS.map(function (col) {
          if (row.id === col.id) return '<td><span class="mc diag" aria-hidden="true"><b>—</b><i>&nbsp;</i></span></td>';
          var p = pairOf(row.id, col.id);
          if (!p) return '<td><span class="mc diag" aria-hidden="true"><b>–</b><i>&nbsp;</i></span></td>';
          var s = STATE[p.state];
          return '<td><button type="button" class="mc" data-s="' + p.state + '" data-row="' + row.id + '" data-col="' + col.id + '" data-pair="' + esc([p.a, p.b].sort().join('|')) + '" aria-pressed="false" aria-label="' +
            esc(row.full) + '와 ' + esc(col.full) + ' — ' + esc(s.label) + '. 근거 열기"><b>' + s.sym + '</b><i>' + esc(s.word) + '</i></button></td>';
        }).join('') + '</tr>';
    }).join('');

    $('legend').innerHTML = ['ok', 'adjust', 'no', 'check', 'na'].map(function (k) {
      return '<button type="button" class="lg" data-s="' + k + '" aria-pressed="false"><i>' + STATE[k].sym + '</i>' + esc(STATE[k].label) + '</button>';
    }).join('');
  }

  function applyMatrixView() {
    var anyFilter = Object.keys(filter).some(function (k) { return filter[k]; });
    Array.prototype.forEach.call(d.querySelectorAll('#mx .mc[data-pair]'), function (b) {
      var s = b.getAttribute('data-s'), row = b.getAttribute('data-row'), col = b.getAttribute('data-col');
      var dimF = anyFilter && !filter[s];
      var dimX = focus && row !== focus && col !== focus;
      b.classList.toggle('dim', !!(dimF || dimX));
      b.setAttribute('aria-pressed', selected === b.getAttribute('data-pair') ? 'true' : 'false');
    });
    Array.prototype.forEach.call(d.querySelectorAll('#mx .hb[data-focus]'), function (b) {
      b.setAttribute('aria-pressed', focus === b.getAttribute('data-focus') ? 'true' : 'false');
    });
  }

  function showPair(key) {
    var parts = key.split('|');
    var p = pairIndex[key];
    var box = $('mxd');
    if (!p) {
      box.innerHTML = '<p class="empty">이 조합의 관계는 확인되지 않았습니다. 고용센터에 문의하세요.</p>';
      return;
    }
    var s = STATE[p.state];
    box.innerHTML =
      '<div class="mxd-h"><b>' + esc(nameOf(p.a)) + ' × ' + esc(nameOf(p.b)) + '</b>' +
      '<span class="mxd-s" data-s="' + p.state + '">' + s.sym + ' ' + esc(s.label) + '</span></div>' +
      '<p><b>근거</b> ' + esc(p.why) + '</p>' +
      '<p class="tip"><b>상담 팁</b> ' + esc(p.tip) + '</p>' +
      '<p class="law">법적 근거 · ' + esc(p.law) + '</p>';
  }

  /* ---------------- 기준 보기 ---------------- */
  function buildReference() {
    $('sysList').innerHTML = D.systems.map(function (s) {
      return '<li><b>' + esc(s.name) + ' <em>' + esc(s.org) + '</em></b>' +
        '<span>' + esc(s.who) + '</span>' +
        '<span class="give">' + s.give.map(function (g) { return esc(g); }).join(' · ') + '</span>' +
        '<span>' + esc(s.caveat) + '</span></li>';
    }).join('');

    $('ruleList').innerHTML = D.rules.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

    var m = D.median;
    var head = '<thead><tr><th>가구원</th><th>60%</th><th>100%</th><th>120%</th></tr></thead>';
    var rows = ['1', '2', '3', '4', '5'];
    var body = rows.map(function (k) {
      var v = m.table[k];
      return '<tr><td>' + k + '인</td><td>' + num(Math.round(v * 0.6)) + '</td><td>' + num(v) + '</td><td>' + num(Math.round(v * 1.2)) + '</td></tr>';
    }).join('') + '<tr><td>6인 이상</td><td>' + num(Math.round(m.over * 0.6)) + '</td><td>' + num(m.over) + '</td><td>' + num(Math.round(m.over * 1.2)) + '</td></tr>';
    $('mtab').innerHTML = head + '<tbody>' + body + '</tbody>';

    $('srcs').innerHTML = D.sources.map(function (s) {
      return '<li><b>' + esc(s.org) + '</b> 「' + esc(s.title) + '」 <em>' + esc(s.date) + '</em><br>' +
        esc(s.use) + ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">원문</a><br>' +
        '<em>' + esc(s.license) + '</em></li>';
    }).join('');
  }

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

  /* ---------------- 사례 ---------------- */
  function buildPresets() {
    var box = $('presets');
    box.innerHTML = D.presets.map(function (p) {
      return '<button type="button" class="ps" data-id="' + esc(p.id) + '" aria-pressed="false">' + esc(p.label) + '<small>' + esc(p.note || '') + '</small></button>';
    }).join('') + '<button type="button" class="ps ps-reset" id="resetBtn">처음부터</button>';

    box.addEventListener('click', function (e) {
      var b = e.target.closest('.ps');
      if (!b) return;
      if (b.id === 'resetBtn') { resetAll(); return; }
      var preset = D.presets.filter(function (p) { return p.id === b.getAttribute('data-id'); })[0];
      if (preset) applyPreset(preset);
    });
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
  function applyPreset(p) {
    var v = p.v;
    [['status', 'status'], ['age', 'age'], ['income', 'income'], ['goal', 'goal']].forEach(function (k) {
      var el = d.querySelector('input[name="' + k[0] + '"][value="' + v[k[1]] + '"]');
      if (el) el.checked = true;
    });
    $('asset').value = v.asset || '5';
    $('women').checked = !!v.women;
    $('weak').checked = !!v.weak;
    $('jobless').checked = !!v.jobless;
    $('exp').checked = !!v.exp;
    st.touched = true;
    markPreset(p.id);
    setStep(0);
    render();
  }
  function resetAll() {
    ['status'].forEach(function (k) {
      var el = d.querySelector('input[name="' + k + '"][value="none"]');
      if (el) el.checked = true;
    });
    var age = d.querySelector('input[name="age"][value="mid"]'); if (age) age.checked = true;
    var inc = d.querySelector('input[name="income"][value="100"]'); if (inc) inc.checked = true;
    var goal = d.querySelector('input[name="goal"][value="living"]'); if (goal) goal.checked = true;
    $('asset').value = '5';
    $('size').value = '4';
    $('women').checked = false; $('weak').checked = false; $('jobless').checked = false; $('exp').checked = false;
    st.touched = false;
    clearPreset();
    render();
  }

  /* ---------------- 연결 ---------------- */
  function switchTab(v) {
    var isPlan = v === 'plan';
    $('tabPlan').setAttribute('aria-selected', isPlan ? 'true' : 'false');
    $('tabMx').setAttribute('aria-selected', isPlan ? 'false' : 'true');
    $('vPlan').hidden = !isPlan;
    $('vMx').hidden = isPlan;
  }

  /* ---------- 휴대폰 단계 이동 ---------- */
  var curStep = 0;
  function setStep(i) {
    curStep = Math.max(0, Math.min(3, i));
    Array.prototype.forEach.call(d.querySelectorAll('#stp button'), function (b) {
      b.setAttribute('aria-pressed', Number(b.getAttribute('data-step')) === curStep ? 'true' : 'false');
    });
    Array.prototype.forEach.call(d.querySelectorAll('#steps .st'), function (el) {
      el.classList.toggle('on', Number(el.getAttribute('data-i')) === curStep);
    });
  }
  function smallScreen() { return window.innerWidth < 900; }

  function bind() {
    $('steps').addEventListener('change', function (e) {
      st.touched = true;
      clearPreset();
      render();
      var t = e.target;
      if (t && t.type === 'radio' && smallScreen()) {
        var step = Number(t.closest('.st').getAttribute('data-i'));
        if (step === curStep && curStep < 3) setTimeout(function () { if (smallScreen()) setStep(curStep + 1); }, 180);
      }
    });
    $('stp').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-step]');
      if (b) setStep(Number(b.getAttribute('data-step')));
    });
    $('size').addEventListener('change', function () { st.touched = true; clearPreset(); render(); });
    $('asset').addEventListener('change', function () { st.touched = true; clearPreset(); render(); });

    var pvT = $('pvT'), pvB = $('pvB');
    pvT.addEventListener('click', function () {
      var open = pvT.getAttribute('aria-expanded') === 'true';
      pvT.setAttribute('aria-expanded', open ? 'false' : 'true');
      pvB.hidden = open;
      d.querySelector('#pv .pv-c').textContent = open ? '펼치기' : '접기';
    });

    $('tabPlan').addEventListener('click', function () { switchTab('plan'); });
    $('tabMx').addEventListener('click', function () { switchTab('mx'); });

    $('legend').addEventListener('click', function (e) {
      var b = e.target.closest('.lg');
      if (!b) return;
      var k = b.getAttribute('data-s');
      filter[k] = !filter[k];
      b.setAttribute('aria-pressed', filter[k] ? 'true' : 'false');
      applyMatrixView();
    });

    $('mx').addEventListener('click', function (e) {
      var cell = e.target.closest('.mc[data-pair]');
      if (cell) {
        selected = cell.getAttribute('data-pair');
        showPair(selected);
        applyMatrixView();
        return;
      }
      var h = e.target.closest('.hb[data-focus]');
      if (h) {
        var id = h.getAttribute('data-focus');
        focus = focus === id ? '' : id;
        applyMatrixView();
      }
    });

    $('crossList').addEventListener('click', function (e) {
      var b = e.target.closest('.cross-b');
      if (!b) return;
      switchTab('mx');
      selected = b.getAttribute('data-pair');
      showPair(selected);
      applyMatrixView();
      var cell = d.querySelector('#mx .mc[data-pair="' + selected + '"]');
      if (cell && cell.scrollIntoView) cell.scrollIntoView({ block: 'nearest', inline: 'center' });
    });

    $('strip').addEventListener('click', function (e) {
      if (e.target.closest('a')) switchTab('plan');
    });
  }

  function render() {
    readUI();
    var x = c();
    $('incNote').innerHTML = sizeLabel() + ' 기준 60% <b>' + won(x.m60) + '</b> · 100% <b>' + won(x.m100) + '</b> · 120% <b>' + won(x.m120) + '</b>';
    renderPlan();
  }

  function init(data) {
    D = data;
    D.systems.forEach(function (s) { SYS[s.id] = s; });
    D.matrix.forEach(function (p) {
      pairIndex[[p.a, p.b].sort().join('|')] = p;
    });
    buildPresets();
    setStep(0);
    buildMatrix();
    buildReference();
    buildPanels();
    bind();
    applyMatrixView();
    render();
  }

  fetch('./data/policy.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(init)
    .catch(function () {
      var res = $('res');
      if (res) res.innerHTML = '<p class="empty">기준 자료를 불러오지 못했습니다. 잠시 뒤 화면을 다시 열어 주세요.</p>';
    });
})();
