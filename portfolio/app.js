/* app.js — 22번 「포트폴리오 편집실」 화면
 *
 * 네 단계(스캔 · 컷 · 조립 · 검문소)를 영상 편집대의 네 칸(소스 · 모니터 · 인스펙터 · 타임라인)에 담는다.
 * 화면 문구·수치·예시는 data/studio.js가 원본이고, 여기서는 그리기와 손짓만 맡는다.
 * 저장하지 않는다 — 적은 문장과 고른 소재는 이 화면 안에서만 쓴다.
 */
(function () {
  'use strict';
  var D = window.PF;
  if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function two(n) { return ('0' + n).slice(-2); }
  function mmss(s) { s = Math.max(0, Math.round(s)); return two(Math.floor(s / 60)) + ':' + two(s % 60); }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var S = {
    mod: 'scan', mode: 'creator',
    scene: 0, t: 0,
    pair: 0, pairX: 50,
    talkT: 0, track: 't1',
    draft: {}, keep: {}, ethics: {}, files: {},
    open: { scan: { 0: true }, cut: { 0: true }, story: { 0: true }, gate: { 0: true } },
    crsTab: 'course'
  };
  var TOTAL = 90, TALK = 180;

  /* ── 점수·검사 ─────────────────────────────────────── */
  function scoreOf(s) { return s.rel * 2 + s.quant + (s.share >= 60 ? 2 : s.share >= 30 ? 1 : 0); }
  function kept() { return D.sources.filter(function (s) { return S.keep[s.id]; }); }
  function ethicsDone() { return D.ethics.filter(function (e) { return S.ethics[e.id]; }).length; }
  function ethicsHighLeft() {
    return D.ethics.filter(function (e) { return e.risk === '높음' && !S.ethics[e.id]; }).length;
  }
  function trackFilled(t) { var v = (S.draft[t.id] || '').trim(); return v.length > 0; }
  var RULES = {
    num: { label: '숫자', re: /\d/ },
    role: { label: '내 역할', re: /(제가|내가|저는|저희 중|담당|맡았|맡아|직접|혼자)/ },
    alt: { label: '대안·이유', re: /(대신|버렸|버린|비교|대안|후보|대신에|고민했|골랐|선택|기준)/ },
    evidence: { label: '근거', re: /(인터뷰|설문|후기|불편|요청|건의|데이터|지표|현장|고객|사용자|동료|피드백)/ },
    next: { label: '다음 행동', re: /(다음|다시|이후|앞으로|바꾸|바꿀|정했|세웠|기준을)/ }
  };
  var VAGUE = /(다양한|원활|시너지|열정|성실|최선을|소통을 통해|많은 도움|최고의|완벽하게)/;

  function lintOf(text) {
    var t = text || '', out = [];
    var tr = D.tracks.filter(function (x) { return x.id === S.track; })[0] || D.tracks[0];
    tr.needs.forEach(function (k) {
      out.push({ ok: RULES[k].re.test(t), label: RULES[k].label, kind: 'need' });
    });
    if (t.length > 4 && VAGUE.test(t)) out.push({ ok: false, label: '모호한 표현', kind: 'warn' });
    return out;
  }

  /* ── 머리 · 소스 ───────────────────────────────────── */
  var HEAD = {
    scan: { bin: '소스', view: '모니터', tl: '타임라인' },
    cut: { bin: '소재 후보', view: '모니터', tl: '타임라인' },
    story: { bin: '6트랙', view: '편집기', tl: '트랙 선반' },
    gate: { bin: '점검 항목', view: '모니터', tl: '발표 큐' }
  };

  function renderHeads() {
    var h = HEAD[S.mod];
    $('binT').textContent = h.bin;
    $('viewT').textContent = h.view;
    $('tlT').textContent = h.tl;
    var bn = '', tn = '';
    if (S.mod === 'scan') { bn = D.scan.scenes.length + '장면'; tn = '90초'; }
    if (S.mod === 'cut') { bn = D.sources.length + '개 · ' + kept().length + '개 올림'; tn = '3~5개 권장'; }
    if (S.mod === 'story') {
      var f = D.tracks.filter(trackFilled).length;
      bn = f + ' / ' + D.tracks.length + ' 작성'; tn = '6트랙';
    }
    if (S.mod === 'gate') { bn = ethicsDone() + ' / ' + D.ethics.length + ' 통과'; tn = '3분 발표'; }
    $('binN').textContent = bn;
    $('inspN').textContent = S.mod === 'scan' ? '장면 ' + (S.scene + 1) + ' / ' + D.scan.scenes.length : '';
    $('tlN').textContent = tn;
  }

  function renderBin() {
    var h = '';
    if (S.mod === 'scan') {
      D.scan.scenes.forEach(function (s, i) {
        h += '<button type="button" class="clip" role="listitem" data-act="scene" data-i="' + i + '" aria-current="' + (i === S.scene) + '">' +
          '<span class="no">' + two(i + 1) + '</span>' +
          '<span class="t">' + esc(s.name) + '<small>' + s.t0 + '–' + s.t1 + '초 · ' + esc(s.ask) + '</small></span>' +
          '<span class="k">' + (s.t1 - s.t0) + 's</span></button>';
      });
    } else if (S.mod === 'cut') {
      D.sources.forEach(function (s) {
        var on = !!S.keep[s.id];
        h += '<button type="button" class="clip' + (on ? '' : ' is-cut') + '" role="listitem" data-act="keep" data-id="' + s.id + '" aria-pressed="' + on + '">' +
          '<span class="no">' + (on ? '↑' : '—') + '</span>' +
          '<span class="t">' + esc(s.name) + '<small>' + esc(s.kind) + ' · 관련성 ' + s.rel + ' · 내 몫 ' + s.share + '%</small>' +
          '<span class="score"><span class="bar"><i style="transform:scaleX(' + (scoreOf(s) / 12) + ')"></i></span></span></span>' +
          '<span class="k">' + scoreOf(s) + '</span></button>';
      });
    } else if (S.mod === 'story') {
      D.tracks.forEach(function (t, i) {
        var v = (S.draft[t.id] || '').trim();
        h += '<button type="button" class="clip" role="listitem" data-act="track" data-id="' + t.id + '" aria-current="' + (t.id === S.track) + '">' +
          '<span class="no">' + two(i + 1) + '</span>' +
          '<span class="t">' + esc(t.name) + '<small>' + (v ? v.length + '자 적음' : '비어 있음') + '</small></span>' +
          '<span class="k">' + (v ? '✓' : '—') + '</span></button>';
      });
    } else {
      D.ethics.forEach(function (e) {
        var on = !!S.ethics[e.id];
        h += '<button type="button" class="clip ' + (on ? 'done' : 'todo') + '" role="listitem" data-act="eth" data-id="' + e.id + '" aria-pressed="' + on + '">' +
          '<span class="no">' + (on ? '✓' : '!') + '</span>' +
          '<span class="t">' + esc(e.name) + '<small>' + esc(e.ask) + '</small></span>' +
          '<span class="k">' + esc(e.risk) + '</span></button>';
      });
    }
    $('bin').innerHTML = h;
  }

  /* ── 모니터(스캔) ─────────────────────────────────── */
  function wire(id) {
    if (id === 'cover') return '<div class="wf"><div class="wf-h"><span class="wf-b"></span><span class="wf-tag">지원 직무</span></div>' +
      '<div class="wf-b sm" style="width:72%"></div><div class="wf-row"><span class="wf-chip">프로젝트 01</span><span class="wf-chip">02</span><span class="wf-chip">03</span></div>' +
      '<div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:82%"></span></div><div class="wf-b xs" style="width:46%"></div></div>';
    if (id === 'skill') return '<div class="wf"><div class="wf-h"><span class="wf-b sm" style="width:38%"></span><span class="wf-tag">JD 대응</span></div>' +
      '<div class="wf-box"><div class="wf-h"><span class="wf-b xs" style="width:60%"></span><span class="wf-chip">공고 어휘</span></div><span class="wf-b xs"></span></div>' +
      '<div class="wf-box"><div class="wf-h"><span class="wf-b xs" style="width:52%"></span><span class="wf-chip">증거</span></div><span class="wf-b xs"></span></div>' +
      '<div class="wf-box"><div class="wf-h"><span class="wf-b xs" style="width:66%"></span><span class="wf-chip">행동</span></div></div></div>';
    if (id === 'project') return '<div class="wf"><div class="wf-h"><span class="wf-b"></span><span class="wf-tag">프로젝트 1</span></div>' +
      '<div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:88%"></span><span class="wf-b xs" style="width:70%"></span></div>' +
      '<div class="wf-num"><span>3단계</span><span>4주</span><span>+17%</span></div><div class="wf-b xs" style="width:54%"></div></div>';
    if (id === 'contrib') return '<div class="wf"><div class="wf-h"><span class="wf-b sm" style="width:44%"></span><span class="wf-tag">내 몫 60%</span></div>' +
      '<div class="wf-num"><span>62% → 79%</span><span>2주</span></div><div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:64%"></span></div></div>';
    return '<div class="wf"><div class="wf-h"><span class="wf-b sm" style="width:40%"></span><span class="wf-tag">링크</span></div>' +
      '<div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:72%"></span></div>' +
      '<div class="wf-row"><span class="wf-chip">웹</span><span class="wf-chip">PDF</span><span class="wf-chip">저장소</span></div>' +
      '<div class="wf-b xs" style="width:38%"></div></div>';
  }
  function monHTML(s, big) {
    return '<div class="mon">' +
      '<div class="mon-top"><span class="rec"></span><span>PREVIEW</span><span>·</span><span>' + esc(s.name) + '</span>' +
      '<span class="tcs">' + s.t0 + '–' + s.t1 + 's</span></div>' +
      '<div class="mon-frame"' + (big ? ' style="min-height:min(38dvh,300px)"' : '') + '>' + wire(s.id) + '<span class="wf-mark">SAFE AREA</span></div>' +
      '<p class="mon-ask">' + esc(s.ask) + '</p>' +
      '<p class="mon-cap"><span class="q">?</span><span><b>읽는 사람</b> ' + esc(s.inner) + '</span></p>' +
      '</div>';
  }

  function renderView() {
    var h = '';
    if (S.mod === 'scan') {
      var s = D.scan.scenes[S.scene];
      h = monHTML(s, false) +
        '<p class="mon-note">인스펙터의 「이 장면에서 보는 것」을 접어 두었습니다. 장면을 옮기면 같은 자리에서 내용이 바뀝니다.</p>';
      $('fsBtn').hidden = false;
    } else if (S.mod === 'cut') {
      var k = kept(), names = k.map(function (x) { return '<span class="wf-chip">' + esc(x.name) + '</span>'; }).join('');
      var n = k.length;
      h = '<div class="mon"><div class="mon-top"><span class="rec"></span><span>TIMELINE</span><span>·</span><span>올린 소재</span><span class="tcs">' + n + ' / 5</span></div>' +
        '<div class="mon-frame"><div class="wf"><div class="wf-h"><span class="wf-b" style="width:52%"></span><span class="wf-tag">' + (n >= 3 && n <= 5 ? '적정' : n > 5 ? '과다' : '부족') + '</span></div>' +
        (n ? '<div class="wf-row">' + names + '</div><div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:76%"></span><span class="wf-b xs" style="width:58%"></span></div>'
          : '<div class="wf-b xs" style="width:70%"></div><div class="wf-b xs" style="width:44%"></div>') +
        '<div class="wf-num"><span>관련성</span><span>기여도</span><span>정량화</span></div></div></div>' +
        '<p class="mon-ask">' + (n === 0 ? '왼쪽(휴대폰은 위)에서 소재를 눌러 타임라인에 올리세요.' : n < 3 ? '3개까지 더 올릴 수 있습니다.' : n > 5 ? '5개를 넘었습니다. 약한 것을 컷하세요.' : '적정합니다. 이제 순서를 정하세요.') + '</p>' +
        '<p class="mon-cap"><span class="q">?</span><span><b>읽는 사람</b> 개수보다 관련성입니다. 8점 아래는 과감히 컷합니다.</span></p></div>' +
        '<p class="mon-note">' + esc(D.cutRule) + '</p>';
      $('fsBtn').hidden = true;
    } else if (S.mod === 'story') {
      var tr = D.tracks.filter(function (x) { return x.id === S.track; })[0] || D.tracks[0];
      var v = S.draft[tr.id] || '';
      h = '<div class="editor">' +
        '<div class="ed-h"><b>' + esc(tr.name) + '</b><span class="count" id="taCount">' + v.length + '자</span>' +
        '<span class="badge" id="taState">' + (v.trim() ? '적음' : '비어 있음') + '</span></div>' +
        '<p class="ed-q">' + esc(tr.q) + '</p>' +
        '<label class="sr" for="ta">' + esc(tr.name) + ' 문장</label>' +
        '<textarea class="ta" id="ta" rows="4" placeholder="' + esc(tr.signal) + '">' + esc(v) + '</textarea>' +
        '<div class="lint" id="lint">' + lintHTML(v) + '</div>' +
        '<div class="ex"><div class="ex-h"><b>첨삭 예시</b><span class="badge">' + D.pairs.length + '개</span>' +
        '<button type="button" class="go2" data-act="openBa">전후 비교 열기</button></div>' +
        '<p>모호한 팀플 문장, AI 티 나는 문장을 수치·역할·의사결정 중심으로 고친 전후를 나란히 봅니다.</p></div>' +
        '</div>';
      $('fsBtn').hidden = true;
    } else {
      var done = ethicsDone(), left = ethicsHighLeft();
      h = '<div class="editor">' +
        '<div class="ed-h"><b>검문 ' + done + ' / ' + D.ethics.length + '</b>' +
        '<span class="badge ' + (left === 0 ? 'ok' : 'cut') + '">' + (left === 0 ? '위험 높음 모두 확인' : '위험 높음 ' + left + '개 남음') + '</span></div>' +
        '<div class="meter"><span>통과</span><span class="bar"><i style="transform:scaleX(' + (done / D.ethics.length) + ')"></i></span><b>' + Math.round(done / D.ethics.length * 100) + '%</b></div>' +
        talkHTML() + '</div>';
      $('fsBtn').hidden = true;
    }
    $('view').innerHTML = h;
    if (S.mod === 'story') { bindEditor(); placeCurtain(); }
    if (S.mod === 'gate') { lastPart = talkPart(S.talkT).name; $('tc').textContent = mmss(S.talkT) + ' / 03:00'; }
    if (S.mod === 'scan') $('tc').textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    if (S.mod === 'cut') $('tc').textContent = kept().length + ' / 5';
    if (S.mod === 'story') $('tc').textContent = D.tracks.filter(trackFilled).length + ' / 6 트랙';
  }

  function talkHTML() {
    var p = talkPart(S.talkT);
    return '<div class="mon" data-talk data-p="' + esc(p.name) + '"><div class="mon-top"><span class="rec"></span><span>TALK</span><span>·</span><span>' + esc(p.name) + '</span>' +
      '<span class="tcs">' + mmss(p.t0) + '–' + mmss(p.t1) + '</span></div>' +
      '<div class="mon-frame" style="min-height:104px"><p class="mon-ask" style="margin:0">' + esc(p.say) + '</p>' +
      '<div class="wf-row"><span class="wf-chip">' + mmss(p.t0) + '</span><span class="wf-chip">' + (p.t1 - p.t0) + '초</span></div></div>' +
      '<p class="mon-cap"><span class="q">?</span><span><b>발표</b> 아래 재생헤드를 끌어 구간을 확인하세요. 합계 3분을 넘기지 않습니다.</span></p></div>';
  }
  function talkPart(t) {
    var arr = D.talk.parts, i;
    for (i = 0; i < arr.length; i++) if (t >= arr[i].t0 && t < arr[i].t1) return arr[i];
    return arr[arr.length - 1];
  }
  var lastPart = null;
  function updateTalk(force) {
    var p = talkPart(S.talkT);
    var box = q('[data-talk]');
    if (box && (force || lastPart !== p.name || !box.getAttribute('data-p') || box.getAttribute('data-p') !== p.name)) {
      box.outerHTML = talkHTML();
    }
    lastPart = p.name;
    placeTsc(); syncCurrent(); placePh();
  }

  function lintHTML(v) {
    var out = lintOf(v).map(function (f) {
      return '<span class="f ' + (f.ok ? 'on' : (f.kind === 'warn' ? 'warn' : 'off')) + '">' + (f.ok ? '✓ ' : f.kind === 'warn' ? '! ' : '× ') + esc(f.label) + '</span>';
    }).join('');
    if (!out) out = '<span class="f off">× 아직 비어 있습니다</span>';
    return out;
  }

  /* ── 인스펙터 ─────────────────────────────────────── */
  function accHTML(i, title, body, extra) {
    var on = !!S.open[S.mod][i];
    return '<div class="acc-i"><button type="button" class="acc-h" data-act="acc" data-i="' + i + '" aria-expanded="' + on + '">' +
      '<em>' + two(i + 1) + '</em>' + title + '<span class="cv"></span></button>' +
      '<div class="acc-b"' + (on ? '' : ' hidden') + '>' + body + '</div></div>';
  }

  function renderInsp() {
    var h = '';
    if (S.mod === 'scan') {
      var s = D.scan.scenes[S.scene];
      h += accHTML(0, '이 장면에서 보는 것',
        '<ul>' + s.look.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<div class="note-line"><b>흔한 감점</b> ' + esc(s.miss) + '</div>' +
        '<p><b>고치기</b> ' + esc(s.fix) + '</p>');
      h += accHTML(1, '역할 비교',
        D.roles.map(function (r) {
          return '<div class="kv"><div class="r"><b>' + esc(r.name) + '</b><span>' + esc(r.purpose) + '</span></div>' +
            '<div class="r"><b>분량</b><span>' + esc(r.len) + '</span></div>' +
            '<div class="r"><b>읽는 사람</b><span>' + esc(r.reader) + '</span></div>' +
            '<div class="r"><b>판단</b><span>' + esc(r.judged) + '</span></div></div>';
        }).join(''));
      h += accHTML(2, '직군별 JD 역량',
        '<div class="jd">' + D.jd.map(function (j) {
          return '<div class="c"><h4>' + esc(j.job) + '</h4><p><b>요구</b> ' + esc(j.req) + '</p>' +
            '<p><b>증거</b> ' + esc(j.proof) + '</p><p><b>감점</b> ' + esc(j.miss) + '</p></div>';
        }).join('') + '</div>');
      h += accHTML(3, '90초 기준', '<p>' + esc(D.scan.note) + '</p>');
    } else if (S.mod === 'cut') {
      h += accHTML(0, '선별 점수 기준', '<p>' + esc(D.cutRule) + '</p><p>관련성은 공고의 요구 역량과 겹치는가, 정량화는 전후 숫자로 말할 수 있는가입니다.</p>');
      h += accHTML(1, '무경험 소재 발굴',
        D.discover.map(function (d) {
          return '<div class="kv"><div class="r"><b>' + esc(d.name) + '</b><span>' + esc(d.why) + '</span></div>' +
            '<ul>' + d.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
            '<div class="r"><b>남길 것</b><span>' + esc(d.out) + '</span></div></div>';
        }).join(''));
      h += accHTML(2, '컷 기준', '<ul><li>관련성이 낮으면 실력과 상관없이 컷합니다.</li><li>내 몫이 30% 아래면 팀 성과로 따로 적고 프로젝트 칸에서는 뺍니다.</li><li>숫자로 말할 수 없으면 컷이 아니라 「과정 기록」 카드로 옮깁니다.</li><li>같은 직무를 보여 주는 소재가 둘이면 최근 것만 남깁니다.</li></ul>');
    } else if (S.mod === 'story') {
      h += accHTML(0, '문장 점검 기준',
        '<ul><li><b>숫자</b> — 전후 값과 기간이 한 문장에 있는가</li>' +
        '<li><b>내 역할</b> — 내가 한 일과 비율이 보이는가</li>' +
        '<li><b>근거</b> — 인터뷰·현장의 말이나 지표가 붙어 있는가</li>' +
        '<li><b>대안·이유</b> — 버린 안과 그 이유가 있는가</li>' +
        '<li><b>다음 행동</b> — 배운 점이 행동으로 바뀌었는가</li>' +
        '<li><b>모호한 표현</b> — 「다양한·원활·시너지·열정」은 표시가 뜹니다</li></ul>' +
        '<p>문장 점검은 숫자·내 역할·근거 같은 표시가 있는지만 봅니다. 내용을 평가하지 않습니다.</p>');
      h += accHTML(1, '6트랙 질문',
        D.tracks.map(function (t) {
          return '<div class="kv"><div class="r"><b>' + esc(t.name) + '</b><span>' + esc(t.q) + '</span></div>' +
            '<div class="r"><b>좋은 신호</b><span>' + esc(t.signal) + '</span></div></div>';
        }).join(''));
      h += accHTML(2, '파일·링크 체크',
        '<div class="gate">' + D.files.map(function (f) {
          var on = !!S.files[f.id];
          return '<button type="button" class="g" data-act="file" data-id="' + f.id + '" aria-pressed="' + on + '">' +
            '<span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>' +
            '<span><b>' + esc(f.name) + '</b><p>' + esc(f.rule) + '</p></span></button>';
        }).join('') + '</div>');
    } else {
      h += accHTML(0, '꼬리질문 예측',
        D.tails.map(function (t) {
          return '<div class="kv"><div class="r"><b>' + esc(t.aim) + '</b><span>' + esc(t.q) + '</span></div>' +
            '<div class="r"><b>뼈대</b><span>' + esc(t.frame) + '</span></div></div>';
        }).join(''));
      h += accHTML(1, '검문 통과 기준', '<ul><li>위험 높음 5항목(기밀·팀원 결과물·허위·개인정보·반출)을 모두 확인합니다.</li><li>확인이 안 되는 항목은 싣지 않는 쪽을 고릅니다.</li><li>수치는 측정 방법과 기간을 함께 적어 면접에서 방어할 수 있게 합니다.</li></ul>');
      h += accHTML(2, '3분 발표 구성',
        '<div class="kv">' + D.talk.parts.map(function (p) {
          return '<div class="r"><b>' + mmss(p.t0) + ' ' + esc(p.name) + '</b><span>' + esc(p.say) + '</span></div>';
        }).join('') + '</div>');
    }
    $('insp').innerHTML = h;
    if (S.mod === 'story') placeCurtain();
  }

  function baHTML() {
    var p = D.pairs[S.pair];
    return '<div class="ba-tabs" role="group" aria-label="첨삭 예시 고르기">' + D.pairs.map(function (x, i) {
      return '<button type="button" data-act="pair" data-i="' + i + '" aria-pressed="' + (i === S.pair) + '">' + esc(x.label) + '</button>';
    }).join('') + '</div>' +
      '<div class="ba" id="ba">' +
      '<div class="ba-p before"><span class="lab">BEFORE</span><p>' + esc(p.before) + '</p></div>' +
      '<div class="ba-p after"><span class="lab">AFTER</span><p>' + esc(p.after) + '</p><span class="why">' + esc(p.why) + '</span></div>' +
      '<button type="button" class="ba-h" id="baH" tabindex="0" aria-label="전후 비교 경계" aria-valuemin="20" aria-valuemax="80" aria-valuenow="' + Math.round(S.pairX) + '" role="slider">' +
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg></span></button>' +
      '</div><p class="ba-hint">' + (window.innerWidth < 600
        ? '두 문장을 위아래로 놓고 비교합니다. 아래 칸이 AFTER입니다.'
        : '가운데 손잡이를 끌어 두 문장의 자리를 나눠 봅니다. 오른쪽 칸이 AFTER입니다.') + '</p>';
  }

  function renderCmp() {
    $('cmpBody').innerHTML = '<div id="baWrap">' + baHTML() + '</div>' +
      '<div class="acc-i" style="margin-top:2px"><div class="acc-h" style="cursor:default"><em>!</em>이 예시를 쓰는 법</div>' +
      '<div class="acc-b"><p>왼쪽 문장에서 무엇이 빠졌는지 먼저 찾고, 오른쪽 문장에서 그 자리에 무엇이 들어갔는지 확인합니다. 손잡이를 끌어 두 칸의 폭을 바꿀 수 있습니다.</p></div></div>';
    placeCurtain();
  }
  function openCmp() {
    var o = $('cmpfs');
    o.classList.add('on'); o.setAttribute('aria-hidden', 'false');
    renderCmp();
    setTimeout(function () { var x = $('cmpX'); if (x) x.focus(); }, 40);
  }
  function closeCmp() {
    var o = $('cmpfs');
    o.classList.remove('on'); o.setAttribute('aria-hidden', 'true');
    var b = q('[data-act="openBa"]'); if (b) b.focus();
  }

  function placeCurtain() {
    var ba = $('ba'); if (!ba) return;
    var w = ba.clientWidth || 1;
    var x = Math.max(w * 0.2, Math.min(w * 0.8, w * S.pairX / 100));
    ba.style.setProperty('--xpx', Math.round(x) + 'px');
  }

  /* ── 타임라인 ─────────────────────────────────────── */
  function ruler(total, step) {
    var h = '', i;
    for (i = 0; i <= total; i += step) h += '<span>' + mmss(i) + '</span>';
    return h;
  }

  function renderTline() {
    var h = '';
    if (S.mod === 'scan') {
      h = '<div class="tl"><div class="tl-ruler">' + ruler(TOTAL, 15) + '</div>' +
        '<div class="tl-row">' + D.scan.scenes.map(function (s, i) {
          return '<button type="button" class="sc" style="flex:' + (s.t1 - s.t0) + ' 1 0" data-act="scene" data-i="' + i + '" aria-current="' + (i === S.scene) + '">' +
            '<b>' + esc(s.name) + '</b><small>' + s.t0 + 's</small></button>';
        }).join('') + '</div>' +
        '<div class="tl-scrub"><input type="range" id="scrub" min="0" max="' + TOTAL + '" step="1" value="' + Math.round(S.t) + '" aria-label="스캔 재생헤드 (90초)">' +
        '<button type="button" class="go" data-act="next">다음 장면<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></div>' +
        '<div class="ph" id="ph"></div>' +
        '<p class="tl-hint">재생헤드를 끌면 그 초에 채용 담당자가 보는 장면으로 모니터가 바뀝니다. 장면을 눌러 바로 갈 수도 있습니다.</p></div>';
    } else if (S.mod === 'cut') {
      var k = kept();
      var krow = k.length ? k.map(function (s) {
        return '<button type="button" class="sc on" style="flex:1 1 0" data-act="keep" data-id="' + s.id + '"><b>' + esc(s.name) + '</b><small>' + scoreOf(s) + '점</small></button>';
      }).join('') : '<p class="tl-hint" style="min-height:44px;display:flex;align-items:center">아직 올린 소재가 없습니다.</p>';
      var crow = D.sources.filter(function (s) { return !S.keep[s.id]; }).map(function (s) {
        return '<button type="button" class="sc off" style="flex:1 1 0" data-act="keep" data-id="' + s.id + '"><b>' + esc(s.name) + '</b><small>' + scoreOf(s) + '점</small></button>';
      }).join('');
      h = '<div class="tl"><div class="tl-row" aria-label="올린 소재">' + krow + '</div>' +
        '<div class="tl-row" aria-label="컷한 소재">' + crow + '</div>' +
        '<p class="tl-hint">위 줄로 올리면 아래 줄에서 빠집니다. 점수가 낮은 소재는 남겨 두어도 읽지 않습니다.</p></div>';
    } else if (S.mod === 'story') {
      h = '<div class="tl"><div class="tl-row">' + D.tracks.map(function (t, i) {
        var v = (S.draft[t.id] || '').trim();
        return '<button type="button" class="sc' + (v ? ' on' : '') + '" style="flex:1 1 0" data-act="track" data-id="' + t.id + '" aria-current="' + (t.id === S.track) + '">' +
          '<b>' + esc(t.name) + '</b><small>' + (v ? v.length + '자' : '빈 트랙') + '</small></button>';
      }).join('') + '</div>' +
        '<p class="tl-hint">6개 트랙이 모두 차면 한 프로젝트가 완성됩니다. 트랙을 눌러 편집기로 가져옵니다.</p></div>';
    } else {
      h = '<div class="tl"><div class="tl-ruler">' + ruler(TALK, 30) + '</div>' +
        '<div class="tl-row">' + D.talk.parts.map(function (p, i) {
          return '<button type="button" class="sc" style="flex:' + (p.t1 - p.t0) + ' 1 0" data-act="talk" data-t="' + p.t0 + '" aria-current="' + (S.talkT >= p.t0 && S.talkT < p.t1) + '">' +
            '<b>' + esc(p.name) + '</b><small>' + mmss(p.t0) + '</small></button>';
        }).join('') + '</div>' +
        '<div class="tl-scrub"><input type="range" id="tscrub" min="0" max="' + TALK + '" step="1" value="' + Math.round(S.talkT) + '" aria-label="발표 재생헤드 (3분)">' +
        '<span class="tc" id="tsc">' + mmss(S.talkT) + ' / 03:00</span></div>' +
        '<div class="ph" id="ph"></div>' +
        '<p class="tl-hint">3분 발표의 구간입니다. 재생헤드를 끌어 그 시점에 말할 내용을 확인합니다.</p></div>';
    }
    $('tline').innerHTML = h;
    requestAnimationFrame(placePh);
  }

  function placePh() {
    var ph = $('ph'); if (!ph) return;
    var tl = ph.parentNode;
    var total = S.mod === 'gate' ? TALK : TOTAL;
    var t = S.mod === 'gate' ? S.talkT : S.t;
    ph.style.transform = 'translateX(' + Math.round((tl.clientWidth - 2) * t / total) + 'px)';
  }
  function placeTsc() {
    var e = $('tsc'); if (e) e.textContent = mmss(S.talkT) + ' / 03:00';
    var ts = $('tscrub'); if (ts) ts.style.setProperty('--v', (S.talkT / TALK * 100) + '%');
    $('tc').textContent = mmss(S.talkT) + ' / 03:00';
  }

  /* ── 스캔 조작 ────────────────────────────────────── */
  function sceneAt(t) {
    var arr = D.scan.scenes, i;
    for (i = 0; i < arr.length; i++) if (t < arr[i].t1) return i;
    return arr.length - 1;
  }
  function syncCurrent() {
    qa('[data-act="scene"]').forEach(function (b) {
      b.setAttribute('aria-current', String(+b.dataset.i === S.scene));
    });
    qa('[data-act="talk"]').forEach(function (b) {
      var t = +b.dataset.t, p = D.talk.parts.filter(function (x) { return x.t0 === t; })[0];
      b.setAttribute('aria-current', String(!!p && S.talkT >= p.t0 && S.talkT < p.t1));
    });
  }
  function setT(v) {
    S.t = Math.max(0, Math.min(TOTAL, v));
    var si = sceneAt(S.t);
    if (si !== S.scene) { S.scene = si; renderView(); }
    var tc = $('tc'); if (tc) tc.textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    var sc = $('scrub'); if (sc) sc.style.setProperty('--v', (S.t / TOTAL * 100) + '%');
    syncCurrent(); placePh();
  }

  /* ── 저장 없이 숫자만 갱신 ────────────────────────── */
  function updateCounts() {
    renderHeads();
    if (S.mod === 'gate') {
      var done = ethicsDone(), left = ethicsHighLeft();
      qa('[data-act="eth"]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(!!S.ethics[b.dataset.id]));
        b.classList.toggle('done', !!S.ethics[b.dataset.id]);
        b.classList.toggle('todo', !S.ethics[b.dataset.id]);
      });
      var m = q('.meter .bar i'); if (m) m.style.transform = 'scaleX(' + (done / D.ethics.length) + ')';
      var mb = q('.meter b'); if (mb) mb.textContent = Math.round(done / D.ethics.length * 100) + '%';
      var bd = q('.editor .badge');
      if (bd) { bd.textContent = left === 0 ? '위험 높음 모두 확인' : '위험 높음 ' + left + '개 남음'; bd.className = 'badge ' + (left === 0 ? 'ok' : 'cut'); }
      q('.editor .ed-h b') && (q('.editor .ed-h b').textContent = '검문 ' + done + ' / ' + D.ethics.length);
    }
  }

  /* ── 편집기(3번) ──────────────────────────────────── */
  function bindEditor() {
    var ta = $('ta');
    if (!ta) return;
    ta.addEventListener('input', function () {
      S.draft[S.track] = ta.value;
      var c = $('taCount'); if (c) c.textContent = ta.value.length + '자';
      var st = $('taState');
      if (st) { st.textContent = ta.value.trim() ? '적음' : '비어 있음'; }
      var l = $('lint'); if (l) l.innerHTML = lintHTML(ta.value);
      qa('[data-act="track"], .tl .sc').forEach(function (b) {
        if (b.dataset.id === S.track) {
          var sm = q('small', b); if (sm) sm.textContent = ta.value.trim() ? ta.value.length + '자' : '비어 있음';
        }
      });
      var f = D.tracks.filter(trackFilled).length;
      $('tc').textContent = f + ' / 6 트랙';
      $('binN').textContent = f + ' / 6 작성';
    });
  }

  /* ── 인스펙터 시트(1200 미만) ─────────────────────── */
  function setInsp(on) {
    var el = $('inspPane'), bk = $('inspBk'), b = $('inspBtn');
    if (!el || !bk) return;
    el.classList.toggle('on', on);
    b.setAttribute('aria-expanded', String(on));
    if (on) {
      bk.hidden = false;
      requestAnimationFrame(function () { bk.classList.add('on'); });
      setTimeout(function () { var x = $('inspX'); if (x) x.focus(); }, 80);
    } else {
      bk.classList.remove('on');
      setTimeout(function () { bk.hidden = true; }, 200);
      if (document.activeElement === $('inspX')) b.focus();
    }
  }

  /* ── 전체 화면 미리보기 ───────────────────────────── */
  function renderFS() {
    if (S.mod !== 'scan') return;
    var s = D.scan.scenes[S.scene];
    $('fsT').textContent = '미리보기 · ' + s.name;
    $('fsMain').innerHTML = monHTML(s, true);
    $('fsFt').innerHTML = '<button type="button" class="lnk" data-act="fsPrev" style="min-height:44px;justify-content:center;border:1px solid rgba(238,243,244,.28);border-radius:11px;background:rgba(238,243,244,.06);color:#eef3f4">← 이전 장면</button>' +
      '<button type="button" class="lnk" data-act="fsNext" style="min-height:44px;justify-content:center;border:1px solid rgba(238,243,244,.28);border-radius:11px;background:rgba(238,243,244,.06);color:#eef3f4">다음 장면 →</button>';
  }
  function openFS() {
    var fs = $('fs');
    fs.classList.add('on'); fs.setAttribute('aria-hidden', 'false');
    renderFS();
    setTimeout(function () { var x = $('fsX'); if (x) x.focus(); }, 40);
  }
  function closeFS() {
    var fs = $('fs');
    fs.classList.remove('on'); fs.setAttribute('aria-hidden', 'true');
    var b = $('fsBtn'); if (b) b.focus();
  }

  /* ── 강사·상담사 모드 ─────────────────────────────── */
  function renderCourse() {
    var t = '<table class="tb"><thead><tr><th style="width:44px">회차</th><th>주제</th><th>수업 활동</th><th>산출물</th><th>과제</th></tr></thead><tbody>' +
      D.course.map(function (c) {
        return '<tr><td class="n">' + c.n + '회</td><td><b>' + esc(c.title) + '</b></td><td>' + esc(c.act) + '</td><td>' + esc(c.out) + '</td><td>' + esc(c.home) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var m = '<div class="crs-mob">' + D.course.map(function (c) {
      return '<div class="acc-i"><div class="acc-h" style="cursor:default"><em>' + c.n + '회</em>' + esc(c.title) + '</div>' +
        '<div class="acc-b"><div class="kv"><div class="r"><b>활동</b><span>' + esc(c.act) + '</span></div>' +
        '<div class="r"><b>산출물</b><span>' + esc(c.out) + '</span></div>' +
        '<div class="r"><b>과제</b><span>' + esc(c.home) + '</span></div></div></div></div>';
    }).join('') + '</div>';

    var ops = '<div class="card"><h3>90분 배분</h3><ul>' +
      D.ops.lesson.map(function (x) { return '<li>' + esc(x[0]) + ' ' + esc(x[1]) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h3>첨삭 3원칙</h3><ul>' + D.ops.edit3.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h3>평가 루브릭 5항목</h3><ul>' + D.ops.rubric.map(function (x) {
        return '<li><b style="color:var(--ink)">' + esc(x[0]) + '</b> — ' + esc(x[1]) + '</li>';
      }).join('') + '</ul></div>' +
      '<div class="card"><h3>1:1 진단 60분</h3><ul>' + D.ops.oneOnOne.map(function (x) { return '<li>' + esc(x[0]) + ' ' + esc(x[1]) + '</li>'; }).join('') + '</ul></div>';
    var diff = '<div class="card"><h3>차별화 포인트</h3><ul class="dlist">' + D.diff.map(function (d) {
      return '<li><b>' + esc(d.t) + '</b> — ' + esc(d.b) + '</li>';
    }).join('') + '</ul></div>';

    var tab = S.crsTab || 'course';
    var on = function (k) { return k === tab ? ' on' : ''; };
    var tabs = [['course', '커리큘럼'], ['ops', '수업 운영'], ['diff', '차별화']].map(function (x) {
      return '<button type="button" data-act="crsTab" data-t="' + x[0] + '" aria-selected="' + (x[0] === tab) + '">' + x[1] + '</button>';
    }).join('');

    $('crs').innerHTML =
      '<div class="crs-h"><h2>상담사·강사용 설계표</h2><p>4~6회 수업으로 묶을 때의 회차·활동·산출물입니다. 수업 운영과 1:1 진단 기준, 다른 강의와 구분되는 지점도 함께 두었습니다.</p></div>' +
      '<div class="crs-tabs" role="tablist" aria-label="강사용 자료">' + tabs + '</div>' +
      '<div class="crs-course' + on('course') + '" data-crs="course"><div class="pane"><div class="p-hd"><b>커리큘럼</b><span class="sp">4~6회</span></div><div class="p-bd" style="overflow:visible">' + t + m + '</div></div></div>' +
      '<div class="crs-side ops' + on('ops') + '" data-crs="ops">' + ops + '</div>' +
      '<div class="crs-side diff' + on('diff') + '" data-crs="diff">' + diff + '</div>';
  }

  /* ── 그리기 ───────────────────────────────────────── */
  function render() {
    var coach = S.mode === 'coach';
    $('modeCreator').setAttribute('aria-selected', String(!coach));
    $('modeCoach').setAttribute('aria-selected', String(coach));
    $('mods').hidden = coach;
    $('wk').hidden = coach;
    $('crs').hidden = !coach;
    qa('#mods button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mod === S.mod)); });
    if (coach) { renderCourse(); return; }
    renderHeads(); renderBin(); renderView(); renderInsp(); renderTline();
  }

  /* ── 손짓 ─────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'scene') {
      var i = +b.dataset.i;
      S.scene = i; S.t = D.scan.scenes[i].t0;
      renderBin(); renderView(); renderTline();
      var tc = $('tc'); if (tc) tc.textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
      if ($('fs').classList.contains('on')) renderFS();
    } else if (act === 'next') {
      S.scene = (S.scene + 1) % D.scan.scenes.length; S.t = D.scan.scenes[S.scene].t0;
      renderBin(); renderView(); renderTline();
      var tc2 = $('tc'); if (tc2) tc2.textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    } else if (act === 'fsPrev' || act === 'fsNext') {
      S.scene = (S.scene + (act === 'fsNext' ? 1 : D.scan.scenes.length - 1)) % D.scan.scenes.length;
      S.t = D.scan.scenes[S.scene].t0;
      renderFS(); renderBin(); renderView(); renderTline();
    } else if (act === 'keep') {
      var id = b.dataset.id;
      S.keep[id] = !S.keep[id];
      b.setAttribute('aria-pressed', String(!!S.keep[id]));
      b.classList.toggle('is-cut', !S.keep[id]);
      var kl = q('.k', b); if (kl) kl.textContent = S.keep[id] ? '↑' : '—';
      var nl = q('.no', b); if (nl) nl.textContent = S.keep[id] ? '↑' : '—';
      renderView(); renderTline(); renderHeads();
    } else if (act === 'track') {
      S.track = b.dataset.id;
      renderBin(); renderView(); renderTline();
    } else if (act === 'eth') {
      var eid = b.dataset.id;
      S.ethics[eid] = !S.ethics[eid];
      b.setAttribute('aria-pressed', String(!!S.ethics[eid]));
      b.classList.toggle('done', !!S.ethics[eid]);
      b.classList.toggle('todo', !S.ethics[eid]);
      var en = q('.no', b); if (en) en.textContent = S.ethics[eid] ? '✓' : '!';
      updateCounts();
    } else if (act === 'acc') {
      var ai = b.dataset.i;
      var on = !S.open[S.mod][ai];
      S.open[S.mod][ai] = on;
      b.setAttribute('aria-expanded', String(on));
      var body = b.nextElementSibling;
      if (body) body.hidden = !on;
    } else if (act === 'openBa') {
      openCmp();
    } else if (act === 'pair') {
      S.pair = +b.dataset.i; S.pairX = 50;
      var w = $('baWrap'); if (w) { w.innerHTML = baHTML(); placeCurtain(); }
    } else if (act === 'talk') {
      S.talkT = +b.dataset.t;
      var ts = $('tscrub'); if (ts) ts.value = S.talkT;
      updateTalk(true);
    } else if (act === 'crsTab') {
      S.crsTab = b.dataset.t;
      renderCourse();
    } else if (act === 'file') {
      var fid = b.dataset.id;
      S.files[fid] = !S.files[fid];
      b.setAttribute('aria-pressed', String(!!S.files[fid]));
    }
  });
  qa('#mods button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.mod = b.dataset.mod;
      qa('#mods button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      render();
    });
  });
  $('modeCreator').addEventListener('click', function () { S.mode = 'creator'; render(); window.scrollTo(0, 0); });
  $('modeCoach').addEventListener('click', function () { S.mode = 'coach'; render(); window.scrollTo(0, 0); });
  $('pvT').addEventListener('click', function () {
    var pvB = $('pvB'), pvT = $('pvT'), open = pvB.hidden;
    pvB.hidden = !open; pvT.setAttribute('aria-expanded', String(open));
    q('.pv-c', pvT).textContent = open ? '접기' : '펼치기';
  });
  $('inspBtn').addEventListener('click', function () { setInsp(true); });
  $('inspX').addEventListener('click', function () { setInsp(false); });
  $('inspBk').addEventListener('click', function () { setInsp(false); });
  $('cmpX').addEventListener('click', closeCmp);
  $('cmpfs').addEventListener('click', function (e) { if (e.target === $('cmpfs')) closeCmp(); });
  $('fsBtn').addEventListener('click', openFS);
  $('fsX').addEventListener('click', closeFS);
  $('fs').addEventListener('click', function (e) { if (e.target === $('fs')) closeFS(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('fs').classList.contains('on')) closeFS();
      if ($('cmpfs').classList.contains('on')) closeCmp();
      if ($('inspPane').classList.contains('on')) setInsp(false);
    }
    var h = e.target.closest && e.target.closest('.ba-h');
    if (h && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setCurtain(S.pairX + (e.key === 'ArrowRight' ? 5 : -5));
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'scrub') setT(+e.target.value);
    if (e.target.id === 'tscrub') { S.talkT = +e.target.value; updateTalk(false); }
  });

  /* 커튼 끌기 */
  var drag = null;
  document.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('.ba-h');
    if (!h) return;
    var ba = h.closest('.ba');
    drag = { h: h, ba: ba };
    try { h.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var r = drag.ba.getBoundingClientRect();
    var x = Math.max(r.width * 0.2, Math.min(r.width * 0.8, e.clientX - r.left));
    setCurtain(x / r.width * 100);
  });
  document.addEventListener('pointerup', function () { drag = null; });
  document.addEventListener('pointercancel', function () { drag = null; });
  function setCurtain(p) {
    S.pairX = Math.max(20, Math.min(80, p));
    var ba = $('ba'); if (!ba) return;
    ba.style.setProperty('--xpx', Math.round(ba.clientWidth * S.pairX / 100) + 'px');
    var h = $('baH'); if (h) h.setAttribute('aria-valuenow', String(Math.round(S.pairX)));
  }

  /* 크기 바뀔 때 재생헤드·커튼 자리 다시 잡기 */
  var rz = null;
  window.addEventListener('resize', function () {
    if (rz) return;
    rz = requestAnimationFrame(function () { rz = null; placePh(); placeCurtain(); });
  });

  /* 시작 */
  render();
  requestAnimationFrame(function () { placePh(); });
})();
