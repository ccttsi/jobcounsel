/* app.js — 23번 「포트폴리오 편집실」 화면
 *
 * 네 단계(스캔 · 컷 · 조립 · 검문소)를 영상 편집대의 네 칸(소스 · 모니터 · 인스펙터 · 타임라인)에 담는다.
 * 화면 문구·수치·예시는 data/studio.js가 원본이고, 여기서는 그리기와 손짓만 맡는다.
 * 저장하지 않는다 — 적은 문장과 고른 소재는 이 화면 안에서만 쓴다.
 *
 * 재생헤드는 세로선(.ph)과 손잡이(.tl-thumb)를 같은 부모(.tl-stage) 안에 두고
 * 둘 다 left:var(--x) + translateX(-50%) 로만 움직인다. 눈금 폭을 다시 재지 않으므로
 * 화면 폭이 바뀌어도 두 요소의 중심 X는 언제나 같다.
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
    if (S.mod === 'cut') { bn = kept().length + ' / ' + D.sources.length; tn = '3~5개'; }
    if (S.mod === 'story') { bn = D.tracks.filter(trackFilled).length + ' / ' + D.tracks.length; tn = '6트랙'; }
    if (S.mod === 'gate') { bn = ethicsDone() + ' / ' + D.ethics.length; tn = '3분'; }
    $('binN').textContent = bn;
    $('inspN').textContent = S.mod === 'scan' ? (S.scene + 1) + ' / ' + D.scan.scenes.length : '';
    $('tlN').textContent = tn;
    var nb = $('nextBtn');
    if (nb) nb.hidden = S.mod !== 'scan';
  }

  function renderBin() {
    var h = '';
    if (S.mod === 'scan') {
      D.scan.scenes.forEach(function (s, i) {
        h += '<button type="button" class="clip" role="listitem" data-act="scene" data-i="' + i + '" aria-current="' + (i === S.scene) + '">' +
          '<span class="no">' + two(i + 1) + '</span>' +
          '<span class="t">' + esc(s.name) + '</span>' +
          '<span class="m">' + s.t0 + '–' + s.t1 + '초</span>' +
          '<span class="k">' + (s.t1 - s.t0) + 's</span></button>';
      });
    } else if (S.mod === 'cut') {
      D.sources.forEach(function (s) {
        var on = !!S.keep[s.id];
        h += '<button type="button" class="clip' + (on ? '' : ' is-cut') + '" role="listitem" data-act="keep" data-id="' + s.id + '" aria-pressed="' + on + '">' +
          '<span class="no">' + (on ? '↑' : '—') + '</span>' +
          '<span class="t">' + esc(s.name) + '</span>' +
          '<span class="m">' + esc(s.kind) + ' · 몫 ' + s.share + '%</span>' +
          '<span class="k">' + scoreOf(s) + '</span></button>';
      });
    } else if (S.mod === 'story') {
      D.tracks.forEach(function (t, i) {
        var v = (S.draft[t.id] || '').trim();
        h += '<button type="button" class="clip" role="listitem" data-act="track" data-id="' + t.id + '" aria-current="' + (t.id === S.track) + '">' +
          '<span class="no">' + two(i + 1) + '</span>' +
          '<span class="t">' + esc(t.name) + '</span>' +
          '<span class="m">' + (v ? v.length + '자' : '비어 있음') + '</span>' +
          '<span class="k">' + (v ? '✓' : '—') + '</span></button>';
      });
    } else {
      D.ethics.forEach(function (e) {
        var on = !!S.ethics[e.id];
        h += '<button type="button" class="clip ' + (on ? 'done' : 'todo') + '" role="listitem" data-act="eth" data-id="' + e.id + '" aria-pressed="' + on + '">' +
          '<span class="no">' + (on ? '✓' : '!') + '</span>' +
          '<span class="t">' + esc(e.name) + '</span>' +
          '<span class="k risk ' + (e.risk === '높음' ? 'hi' : 'mid') + '">' + esc(e.risk) + '</span></button>';
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
    if (id === 'project') return '<div class="wf"><div class="wf-h"><span class="wf-b"></span><span class="wf-tag">프로젝트</span></div>' +
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
      '<div class="mon-frame"' + (big ? ' style="min-height:min(38dvh,300px)"' : '') + '>' + wire(s.id) + '</div>' +
      '<p class="mon-ask">' + esc(s.ask) + '</p>' +
      '<p class="mon-cap"><span class="q">?</span><span><b>읽는 사람</b> ' + esc(s.inner) + '</span></p>' +
      '</div>';
  }

  function renderView() {
    var h = '';
    if (S.mod === 'scan') {
      var s = D.scan.scenes[S.scene];
      h = monHTML(s, false);
      $('fsBtn').hidden = false;
    } else if (S.mod === 'cut') {
      var k = kept(), names = k.map(function (x) { return '<span class="wf-chip">' + esc(x.name) + '</span>'; }).join('');
      var n = k.length;
      h = '<div class="mon"><div class="mon-top"><span class="rec"></span><span>TIMELINE</span><span>·</span><span>올린 소재</span><span class="tcs">' + n + ' / 5</span></div>' +
        '<div class="mon-frame"><div class="wf"><div class="wf-h"><span class="wf-b" style="width:52%"></span><span class="wf-tag">' + (n >= 3 && n <= 5 ? '적정' : n > 5 ? '과다' : '부족') + '</span></div>' +
        (n ? '<div class="wf-row">' + names + '</div><div class="wf-box"><span class="wf-b xs"></span><span class="wf-b xs" style="width:76%"></span><span class="wf-b xs" style="width:58%"></span></div>'
          : '<div class="wf-b xs" style="width:70%"></div><div class="wf-b xs" style="width:44%"></div>') +
        '<div class="wf-num"><span>관련성</span><span>기여도</span><span>정량화</span></div></div></div>' +
        '<p class="mon-ask">' + (n === 0 ? '왼쪽에서 소재를 고르세요.' : n < 3 ? '3개까지 더 올릴 수 있습니다.' : n > 5 ? '5개를 넘었습니다. 컷하세요.' : '적정합니다. 순서를 정하세요.') + '</p>' +
        '<p class="mon-cap"><span class="q">?</span><span><b>읽는 사람</b> 개수보다 관련성. 8점 아래는 컷.</span></p></div>';
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
        '<div class="ex"><div class="ex-h"><b>첨삭 예시</b><span class="badge">' + D.pairs.length + '</span>' +
        '<button type="button" class="go2" data-act="openBa">전후 비교 열기</button></div>' +
        '<p>수치·역할·의사결정 중심으로 고친 전후를 나란히 봅니다.</p></div>' +
        '</div>';
      $('fsBtn').hidden = true;
    } else {
      var done = ethicsDone(), left = ethicsHighLeft();
      h = '<div class="editor">' +
        '<div class="ed-h"><b>검문 ' + done + ' / ' + D.ethics.length + '</b>' +
        '<span class="badge ' + (left === 0 ? 'ok' : 'cut') + '">' + (left === 0 ? '높음 위험 모두 확인' : '높음 ' + left + '개 남음') + '</span></div>' +
        '<div class="meter"><span>통과</span><span class="bar"><i style="transform:scaleX(' + (done / D.ethics.length) + ')"></i></span><b>' + Math.round(done / D.ethics.length * 100) + '%</b></div>' +
        talkHTML() + '</div>';
      $('fsBtn').hidden = true;
    }
    $('view').className = 'p-bd m-' + S.mod;
    $('view').innerHTML = h;
    if (S.mod === 'story') { bindEditor(); placeCurtain(); }
    if (S.mod === 'gate') { lastPart = talkPart(S.talkT).name; $('tc').textContent = mmss(S.talkT) + ' / 03:00'; }
    if (S.mod === 'scan') $('tc').textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    if (S.mod === 'cut') $('tc').textContent = kept().length + ' / 5';
    if (S.mod === 'story') $('tc').textContent = D.tracks.filter(trackFilled).length + ' / 6';
  }

  function talkHTML() {
    var p = talkPart(S.talkT);
    return '<div class="mon" data-talk data-p="' + esc(p.name) + '"><div class="mon-top"><span class="rec"></span><span>TALK</span><span>·</span><span>' + esc(p.name) + '</span>' +
      '<span class="tcs">' + mmss(p.t0) + '–' + mmss(p.t1) + '</span></div>' +
      '<div class="mon-frame" style="min-height:120px"><p class="mon-ask" style="margin:0">' + esc(p.say) + '</p>' +
      '<div class="wf-row"><span class="wf-chip">' + mmss(p.t0) + '</span><span class="wf-chip">' + (p.t1 - p.t0) + '초</span></div></div>' +
      '<p class="mon-cap"><span class="q">?</span><span><b>발표</b> 아래 재생헤드로 구간을 확인합니다.</span></p></div>';
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
    syncRail(); syncCurrent();
  }

  function lintHTML(v) {
    var out = lintOf(v).map(function (f) {
      return '<span class="f ' + (f.ok ? 'on' : (f.kind === 'warn' ? 'warn' : 'off')) + '">' + (f.ok ? '✓ ' : f.kind === 'warn' ? '! ' : '× ') + esc(f.label) + '</span>';
    }).join('');
    if (!out) out = '<span class="f off">× 아직 비어 있습니다</span>';
    return out;
  }

  /* ── 인스펙터 ─────────────────────────────────────── */
  function accHTML(i, title, body) {
    var on = !!S.open[S.mod][i];
    return '<div class="acc-i"><button type="button" class="acc-h" data-act="acc" data-i="' + i + '" aria-expanded="' + on + '">' + title + '<span class="cv"></span></button>' +
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
      h += accHTML(0, '선별 기준', '<p>' + esc(D.cutRule) + '</p>');
      h += accHTML(1, '무경험 소재 발굴',
        D.discover.map(function (d) {
          return '<div class="kv"><div class="r"><b>' + esc(d.name) + '</b><span>' + esc(d.why) + '</span></div>' +
            '<ul>' + d.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
            '<div class="r"><b>남길 것</b><span>' + esc(d.out) + '</span></div></div>';
        }).join(''));
      h += accHTML(2, '컷 기준', '<ul><li>관련성이 낮으면 실력과 무관하게 컷.</li><li>내 몫 30% 아래는 팀 성과로만 적음.</li><li>숫자가 없으면 「과정 기록」 카드로 옮김.</li><li>같은 직무 소재가 둘이면 최근 것만.</li></ul>');
    } else if (S.mod === 'story') {
      h += accHTML(0, '문장 점검 기준',
        '<ul><li><b>숫자</b> — 전후 값과 기간이 한 문장에</li>' +
        '<li><b>내 역할</b> — 한 일과 비율이 보이는가</li>' +
        '<li><b>근거</b> — 인터뷰·현장의 말, 지표</li>' +
        '<li><b>대안·이유</b> — 버린 안과 그 이유</li>' +
        '<li><b>다음 행동</b> — 배운 점이 행동으로</li>' +
        '<li><b>모호한 표현</b> — 「다양한·원활·시너지」 표시</li></ul>' +
        '<p>표시가 있는지만 봅니다. 내용을 평가하지 않습니다.</p>');
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
      h += accHTML(1, '검문 통과 기준', '<ul><li>높음 위험 5항목(기밀·팀원 결과물·허위·개인정보·반출) 모두 확인.</li><li>확인 안 되는 항목은 싣지 않음.</li><li>수치는 측정 방법과 기간을 함께 적음.</li></ul>');
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
        ? '아래 칸이 AFTER입니다.'
        : '손잡이를 끌어 두 문장의 자리를 나눕니다.') + '</p>';
  }

  function renderCmp() {
    $('cmpBody').innerHTML = '<div id="baWrap">' + baHTML() + '</div>' +
      '<div class="acc-i"><div class="acc-h" style="cursor:default">이 예시를 쓰는 법</div>' +
      '<div class="acc-b"><p>왼쪽에서 빠진 것이 무엇인지 찾고, 오른쪽에서 그 자리에 무엇이 들어갔는지 봅니다.</p></div></div>';
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
    var n = Math.round(total / step), h = '', i, p;
    for (i = 0; i <= n; i++) {
      p = (i / n * 100).toFixed(4);
      h += i === n ? '<span class="tk" style="right:0"></span>' : '<span class="tk" style="left:' + p + '%"></span>';
    }
    for (i = 0; i <= n; i++) {
      p = (i / n * 100).toFixed(4);
      if (i === 0) h += '<span class="lb first" style="left:0">' + mmss(0) + '</span>';
      else if (i === n) h += '<span class="lb end" style="right:0">' + mmss(total) + '</span>';
      else h += '<span class="lb" style="left:' + p + '%">' + mmss(i * step) + '</span>';
    }
    return h;
  }

  /* 세로선과 손잡이가 같은 --x 를 쓰도록 한 부모(.tl-stage) 안에 둔다. */
  function stageHTML(total, t, rowHTML, label, step) {
    var pct = (Math.max(0, Math.min(total, t)) / total * 100).toFixed(4);
    return '<div class="tl-stage" id="stage" style="--x:' + pct + '%">' +
      '<div class="tl-ruler" aria-hidden="true">' + ruler(total, step) + '</div>' +
      rowHTML +
      '<div class="tl-rail" id="rail" role="slider" tabindex="0" aria-label="' + esc(label) + '"' +
      ' aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + Math.round(t) + '"' +
      ' aria-valuetext="' + mmss(t) + ' / ' + mmss(total) + '">' +
      '<span class="tl-line"><i></i></span><span class="tl-thumb"></span></div>' +
      '<div class="ph" id="ph" aria-hidden="true"></div>' +
      '</div>';
  }

  /* 좁은 화면(600px 미만)은 트랙을 시간 비례로만 그리고, 고르기는 소스 칸이 맡는다.
     그래야 눈금·트랙·재생바의 오른쪽 끝이 같은 세로선에 놓인다. */
  function tlWidth() { var e = $('tline'); return Math.max(200, (e ? e.clientWidth : window.innerWidth) - 54); }
  function clipEl(id, dur, total, extra, inner) {
    var narrow = window.innerWidth < 600;
    var tag = narrow ? 'span' : 'button';
    var attrs = narrow ? 'role="presentation"' : 'type="button" ' + extra;
    var i = inner;
    return '<' + tag + ' class="sc" ' + attrs + ' style="flex:' + dur + ' 1 0">' + i + '</' + tag + '>';
  }
  function clipLabel(name, dur, total, sub) {
    var w = tlWidth() * dur / total;
    if (window.innerWidth < 600 && w < 46) return '';
    return '<b>' + esc(name) + '</b><small>' + sub + '</small>';
  }

  function renderTline() {
    var h = '';
    if (S.mod === 'scan') {
      var row = '<div class="tl-row">' + D.scan.scenes.map(function (s, i) {
        var lab = clipLabel(s.name, s.t1 - s.t0, TOTAL, s.t0 + 's');
        var tiny = !lab;
        if (tiny) lab = '<b>' + two(i + 1) + '</b>'; /* 좁은 칸은 번호만 남긴다 */
        var el = clipEl(i, s.t1 - s.t0, TOTAL,
          'data-act="scene" data-i="' + i + '" title="' + esc(s.name) + ' ' + s.t0 + '–' + s.t1 + '초" aria-current="' + (i === S.scene) + '"',
          lab);
        var cls = 'sc' + (tiny ? ' tiny' : '');
        if (i === S.scene && window.innerWidth < 600) cls += '" aria-current="true';
        if (cls !== 'sc') el = el.replace('class="sc"', 'class="' + cls + '"');
        return el;
      }).join('') + '</div>';
      h = '<div class="tl">' + stageHTML(TOTAL, S.t, row, '스캔 재생헤드 (90초)', window.innerWidth < 600 ? 30 : 15) + '</div>';
    } else if (S.mod === 'cut') {
      var k = kept();
      var krow = k.length ? k.map(function (s) {
        var inner = clipLabel(s.name, 1, 1, scoreOf(s) + '점');
        if (window.innerWidth < 600 && !inner) inner = '';
        var tag = window.innerWidth < 600 ? 'span' : 'button';
        var attrs = window.innerWidth < 600 ? 'role="presentation"' : 'type="button" data-act="keep" data-id="' + s.id + '" title="' + esc(s.name) + '"';
        return '<' + tag + ' class="sc on" ' + attrs + ' style="flex:1 1 0">' + inner + '</' + tag + '>';
      }).join('') : '';
      h = '<div class="tl' + (k.length ? '' : ' tl-empty') + '">' + (k.length
        ? '<div class="tl-row" aria-label="올린 소재">' + krow + '</div><p class="tl-hint">고른 소재는 여기에 모입니다. 다시 누르면 빠집니다.</p>'
        : '<p class="tl-hint">아직 올린 소재가 없습니다. 왼쪽에서 소재를 고르세요.</p>') + '</div>';
    } else if (S.mod === 'story') {
      h = '<div class="tl"><div class="tl-row">' + D.tracks.map(function (t) {
        var v = (S.draft[t.id] || '').trim();
        var inner = clipLabel(t.name, 1, 6, v ? v.length + '자' : '빈 트랙');
        var tag = window.innerWidth < 600 ? 'span' : 'button';
        var attrs = window.innerWidth < 600 ? 'role="presentation" data-id="' + t.id + '"' : 'type="button" data-act="track" data-id="' + t.id + '" title="' + esc(t.name) + '"';
        return '<' + tag + ' class="sc' + (v ? ' on' : '') + '" ' + attrs + ' style="flex:1 1 0"' + (t.id === S.track ? ' aria-current="true"' : '') + '>' + inner + '</' + tag + '>';
      }).join('') + '</div>' +
        '<p class="tl-hint">' + (window.innerWidth < 600 ? '트랙은 왼쪽 6트랙 목록에서 고릅니다.' : '트랙을 눌러 편집기로 가져옵니다.') + '</p></div>';
    } else {
      var prow = '<div class="tl-row">' + D.talk.parts.map(function (p) {
        var on = S.talkT >= p.t0 && S.talkT < p.t1;
        var el = clipEl(p.t0, p.t1 - p.t0, TALK,
          'data-act="talk" data-t="' + p.t0 + '" title="' + esc(p.name) + ' ' + mmss(p.t0) + '–' + mmss(p.t1) + '" aria-current="' + on + '"',
          clipLabel(p.name, p.t1 - p.t0, TALK, mmss(p.t0)));
        if (on && window.innerWidth < 600) el = el.replace('class="sc"', 'class="sc" aria-current="true"');
        return el;
      }).join('') + '</div>';
      h = '<div class="tl">' + stageHTML(TALK, S.talkT, prow, '발표 재생헤드 (3분)', window.innerWidth < 600 ? 60 : 30) + '</div>';
    }
    $('tline').innerHTML = h;
    geomCache = null;
    syncCurrent();
    syncRail();
  }

  /* 장면 칸의 실제 위치 — 재생헤드를 칸 안쪽 비율로 놓기 위한 캐시 */
  var geomCache = null;
  function sceneGeom() {
    var row = q('.tline .tl-row'), st = q('.tl-stage');
    if (!row || !st) return null;
    var cards = qa('.sc', row);
    if (cards.length !== D.scan.scenes.length) return null;
    var base = st.getBoundingClientRect(), w = base.width || 1;
    var sig = w.toFixed(1) + ':' + cards.length;
    if (geomCache && geomCache.sig === sig) return geomCache;
    geomCache = { sig: sig, w: w, x: cards.map(function (c) {
      var r = c.getBoundingClientRect();
      return [r.left - base.left, r.right - base.left];
    }) };
    return geomCache;
  }

  /* --x(퍼센트)만 갱신한다. 폭을 재지 않으므로 선과 손잡이가 함께 움직인다. */
  function syncRail() {
    var stage = $('stage'); if (!stage) return;
    var total = S.mod === 'gate' ? TALK : TOTAL;
    var t = S.mod === 'gate' ? S.talkT : S.t;
    var g = S.mod === 'scan' ? sceneGeom() : null;
    var pct;
    if (g) {
      /* 칸의 왼쪽·오른쪽 경계 사이에서 시간 비례로 놓는다 — 장면 한가운데면 칸 한가운데 */
      var si = sceneAt(Math.max(0, Math.min(total, t))), sp = D.scan.scenes[si], seg = g.x[si];
      var k = Math.max(0, Math.min(1, (t - sp.t0) / Math.max(1e-6, sp.t1 - sp.t0)));
      pct = ((seg[0] + k * (seg[1] - seg[0])) / g.w * 100).toFixed(4);
    } else {
      pct = (Math.max(0, Math.min(total, t)) / total * 100).toFixed(4);
    }
    stage.style.setProperty('--x', pct + '%');
    var rail = $('rail');
    if (rail) {
      rail.setAttribute('aria-valuenow', String(Math.round(t)));
      rail.setAttribute('aria-valuetext', mmss(t) + ' / ' + mmss(total));
    }
  }
  var placePh = syncRail;

  /* 칸 경계 좌표(x)를 시간으로 되돌린다 — 누른 자리와 재생헤드가 어긋나지 않게 */
  function timeAtPx(x) {
    var g = sceneGeom();
    if (!g) return null;
    for (var i = 0; i < g.x.length; i++) {
      var a = g.x[i][0], b = g.x[i][1];
      if (x <= b || i === g.x.length - 1) {
        var sp = D.scan.scenes[i];
        var k = Math.max(0, Math.min(1, (x - a) / Math.max(1, b - a)));
        return sp.t0 + k * (sp.t1 - sp.t0);
      }
    }
    return null;
  }

  /* ── 스캔 조작 ────────────────────────────────────── */
  function sceneAt(t) {
    var arr = D.scan.scenes, i;
    for (i = 0; i < arr.length; i++) if (t < arr[i].t1) return i;
    return arr.length - 1;
  }
  /* 장면을 고를 때는 재생헤드를 그 칸의 정가운데에 둔다 — 칸 경계선에 걸치지 않는다. */
  function centerOf(i) {
    var s = D.scan.scenes[i];
    return (s.t0 + s.t1) / 2;
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
    if (si !== S.scene) { S.scene = si; renderView(); renderInsp(); renderHeads(); }
    var tc = $('tc'); if (tc) tc.textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    syncCurrent(); syncRail();
  }
  /* 장면을 고르면 모니터·소스 목록·타임라인·인스펙터·머리 숫자를 한 번에 맞춘다 */
  function goScene(i) {
    var n = D.scan.scenes.length;
    S.scene = ((i % n) + n) % n;
    S.t = centerOf(S.scene);
    renderBin(); renderView(); renderTline(); renderInsp(); renderHeads();
    var tc = $('tc'); if (tc) tc.textContent = mmss(S.t) + ' / ' + mmss(TOTAL);
    if ($('fs').classList.contains('on')) renderFS();
  }
  function setTalk(v) {
    S.talkT = Math.max(0, Math.min(TALK, v));
    updateTalk(false);
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
      if (bd) { bd.textContent = left === 0 ? '높음 위험 모두 확인' : '높음 ' + left + '개 남음'; bd.className = 'badge ' + (left === 0 ? 'ok' : 'cut'); }
      var eb = q('.editor .ed-h b'); if (eb) eb.textContent = '검문 ' + done + ' / ' + D.ethics.length;
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
      qa('[data-act="track"]').forEach(function (b) {
        if (b.dataset.id !== S.track) return;
        var m = q('.m', b); if (m) m.textContent = ta.value.trim() ? ta.value.length + '자' : '비어 있음';
        var k = q('.k', b); if (k) k.textContent = ta.value.trim() ? '✓' : '—';
      });
      qa('.tline .sc').forEach(function (b) {
        if (b.dataset.id !== S.track) return;
        var sm = q('small', b);
        if (sm) sm.textContent = ta.value.trim() ? ta.value.length + '자' : '빈 트랙';
        b.classList.toggle('on', !!ta.value.trim());
      });
      var f = D.tracks.filter(trackFilled).length;
      $('tc').textContent = f + ' / 6';
      $('binN').textContent = f + ' / 6';
    });
  }

  /* ── 인스펙터 시트(1240 미만) ─────────────────────── */
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
    $('fsFt').innerHTML = '<div class="fs-nav">' +
      '<button type="button" class="fs-btn" data-act="fsPrev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5.5-6.5 6.5L14 18.5"/></svg>이전 장면</button>' +
      '<button type="button" class="fs-btn primary" data-act="fsNext">다음 장면<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 5.5 6.5 6.5L10 18.5"/></svg></button>' +
      '</div>';
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
    var t = '<table class="tb"><thead><tr><th style="width:52px">회차</th><th>주제</th><th>수업 활동</th><th>산출물</th><th>과제</th></tr></thead><tbody>' +
      D.course.map(function (c) {
        return '<tr><td class="n">' + c.n + '회</td><td><b>' + esc(c.title) + '</b></td><td>' + esc(c.act) + '</td><td>' + esc(c.out) + '</td><td>' + esc(c.home) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var m = '<div class="crs-mob">' + D.course.map(function (c) {
      return '<div class="acc-i"><div class="acc-h" style="cursor:default">' + esc(c.n) + '회 · ' + esc(c.title) + '</div>' +
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
    var diff = '<div class="dpanel-h"><h3>차별화 포인트</h3><span class="cnt">' + two(D.diff.length) + '</span></div>' +
      '<p class="dpanel-lead">학원·온라인 강의와 견줄 때 수강생이 실제로 보는 지점.</p>' +
      '<ul class="dlist">' + D.diff.map(function (d, i) {
        return '<li class="dcard"><span class="num">' + two(i + 1) + '</span><b>' + esc(d.t) + '</b>' +
          '<span class="tx">' + esc(d.b) + '</span></li>';
      }).join('') + '</ul>';

    var tab = S.crsTab || 'course';
    var on = function (k) { return k === tab ? ' on' : ''; };
    var tabs = [['course', '커리큘럼'], ['ops', '수업 운영'], ['diff', '차별화']].map(function (x) {
      return '<button type="button" data-act="crsTab" data-t="' + x[0] + '" aria-selected="' + (x[0] === tab) + '">' + x[1] + '</button>';
    }).join('');

    $('crs').innerHTML =
      '<div class="crs-h"><h2>상담사·강사용 설계표</h2><p>4~6회 수업의 회차·활동·산출물과 운영 기준.</p></div>' +
      '<div class="crs-tabs" role="tablist" aria-label="강사용 자료">' + tabs + '</div>' +
      '<div class="crs-course' + on('course') + '" data-crs="course"><div class="pane"><div class="p-hd"><b>커리큘럼</b><span class="sp">4~6회</span></div><div class="p-bd" style="overflow:visible">' + t + m + '</div></div></div>' +
      '<div class="crs-side ops' + on('ops') + '" data-crs="ops">' + ops + '</div>' +
      '<div class="crs-side diff' + on('diff') + '" data-crs="diff">' + diff + '</div>';
  }


  /* ── 튜토리얼 ─────────────────────────────────────── */
  var TUT = [
    { t: '소스에서 장면 고르기',
      fig: '<div class="row"><span class="n">01</span>표지<span style="margin-left:auto">0–8초</span></div>' +
           '<div class="row hi"><span class="n">02</span>프로젝트<span style="margin-left:auto">26–62초</span></div>' +
           '<div class="row"><span class="n">03</span>마무리<span style="margin-left:auto">82–90초</span></div>',
      d: '왼쪽(휴대폰은 아래) <b>소스</b>에서 장면을 누르면 가운데 모니터가 그 장면으로 바뀝니다. 90초 중 무엇을 볼지 여기서 정합니다.',
      w: '소스 칸' },
    { t: '모니터로 보는 사람의 눈높이',
      fig: '<div class="scr"><div class="ln" style="width:62%"></div><div class="ln" style="width:88%"></div>' +
           '<div class="q">무슨 일을 하는 사람인가?</div><div class="ln" style="width:46%"></div></div>',
      d: '모니터는 그 장면을 <b>채용 담당자가 몇 초만 봤을 때</b>의 화면입니다. 노란 질문에 답이 바로 보이는지 확인합니다.',
      w: '모니터 칸' },
    { t: '재생헤드로 구간 옮기기',
      fig: '<div class="rail"><i></i><s></s><b></b></div>',
      d: '타임라인의 <b>빨간 동그라미를 좌우로 끌면</b> 그 시점으로 갑니다. 동그라미를 누른 뒤 ←→ 키로 1초씩, Home·End로 처음·끝도 됩니다.',
      w: '타임라인 · 빨간 동그라미' },
    { t: '6트랙으로 문장 조립',
      fig: '<div class="six"><span class="on">문제</span><span class="on">목표</span><span class="on">역할</span>' +
           '<span>결정</span><span>성과</span><span>배움</span></div>',
      d: '<b>03 트랙 조립</b>에서 여섯 질문에 한 문장씩 씁니다. 숫자·내 역할·근거가 들어가면 아래에 ✓ 표시가 붙습니다.',
      w: '03 트랙 조립' },
    { t: '검문소에서 위험 확인',
      fig: '<div class="ck on"><u>✓</u>회사 기밀</div><div class="ck on"><u>✓</u>개인정보</div>' +
           '<div class="ck"><u></u>타사 화면·로고</div>',
      d: '<b>04 검문소</b>에서 기밀·개인정보·허위를 확인하고, 3분 발표 큐로 말해 봅니다. 적은 내용은 어디에도 저장되지 않습니다.',
      w: '04 검문소' }
  ];
  var tutStep = 0;

  /* 단계 설명에 쓰는 글자를 미리 받아 둔다. 단계를 넘길 때 새 글꼴 조각이 뒤늦게 도착하며
     글줄이 밀리는 일을 없앤다. */
  var TUT_TEXT = (function () {
    var txt = '';
    for (var i = 0; i < TUT.length; i++) {
      txt += TUT[i].t + ' ' + TUT[i].d.replace(/<[^>]+>/g, ' ') + ' ' + TUT[i].w + ' ' +
        TUT[i].fig.replace(/<[^>]+>/g, ' ') + ' ';
    }
    return txt;
  })();
  function tutPreload(cb) {
    if (!document.fonts || !document.fonts.load) { if (cb) cb(); return; }
    var faces = ['850 20px "Pretendard Variable"', '850 16.5px "Pretendard Variable"',
      '800 12.5px "Pretendard Variable"', '800 12px "Pretendard Variable"',
      '750 13.5px "Pretendard Variable"', '700 12.5px "Pretendard Variable"'];
    var jobs = [];
    for (var i = 0; i < faces.length; i++) {
      try { jobs.push(document.fonts.load(faces[i], TUT_TEXT)); } catch (e) {}
    }
    Promise.all(jobs).then(function () { return document.fonts.ready; })
      .then(function () { if (cb) cb(); }).catch(function () { if (cb) cb(); });
  }
  tutPreload();

  function tutBody(i) {
    var t = TUT[i];
    return '<div class="tut-step"><i>' + two(i + 1) + '</i>' + (i + 1) + ' / ' + TUT.length + '</div>' +
      '<div class="tut-fig">' + t.fig + '</div>' +
      '<h3 class="tut-t">' + esc(t.t) + '</h3>' +
      '<p class="tut-p">' + t.d + '</p>' +
      '<p class="tut-where">' + esc(t.w) + '</p>';
  }

  /* 단계를 넘겨도 카드가 자라거나 줄지 않게, 가장 긴 단계의 높이를 재어 본문 최소 높이로 잡는다.
     높이가 변하지 않으니 스크롤바도 생기지 않고 화면도 움직이지 않는다.
     도해·제목·본문 상자도 다섯 단계 모두 같은 높이로 묶는다 — 단계마다 그림 높이가 달라지면
     아래 제목·본문이 밀려 넘길 때마다 '움찔'거린다. */
  function tutFit() {
    var bd = $('tutBd'), card = bd.parentNode, hd = card.firstElementChild, ft = card.lastElementChild;
    if (!bd || !bd.clientWidth) return;
    bd.style.minHeight = '0px';
    var probe = document.createElement('div');
    probe.className = 'tut-bd';
    probe.setAttribute('aria-hidden', 'true');
    /* 카드 밖(body)에 둔다 — 카드는 나타날 때 scale 전환이 걸려 있어 그 안에서 재면 높이가 0.99배로 잰힌다. */
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;' +
      'min-height:0;width:' + bd.clientWidth + 'px';
    document.body.appendChild(probe);
    var highest = function (sel) {
      var best = 0;
      for (var i = 0; i < TUT.length; i++) {
        probe.innerHTML = tutBody(i);
        var n = probe.querySelector(sel);
        if (n) best = Math.max(best, n.getBoundingClientRect().height);
      }
      return Math.ceil(best);
    };
    var box = { '--tut-fig-h': highest('.tut-fig'), '--tut-t-h': highest('.tut-t'), '--tut-p-h': highest('.tut-p') };
    for (var k in box) { bd.style.setProperty(k, box[k] + 'px'); probe.style.setProperty(k, box[k] + 'px'); }
    var tallest = 0;
    for (var i = 0; i < TUT.length; i++) {
      probe.innerHTML = tutBody(i);
      tallest = Math.max(tallest, probe.offsetHeight);
    }
    probe.parentNode.removeChild(probe);
    var cs = getComputedStyle(card);
    var limit = parseFloat(cs.maxHeight);
    if (!isFinite(limit)) limit = 1e5;
    var room = limit - hd.offsetHeight - ft.offsetHeight -
      parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    bd.style.minHeight = Math.max(0, Math.floor(Math.min(tallest, room))) + 'px';
    bd.classList.toggle('cut', bd.scrollHeight - bd.clientHeight > 1);
  }

  function renderTut() {
    var bdT = $('tutBd');
    bdT.innerHTML = tutBody(tutStep);
    bdT.scrollTop = 0;
    bdT.classList.toggle('cut', bdT.scrollHeight - bdT.clientHeight > 1);
    var dots = '';
    for (var i = 0; i < TUT.length; i++) dots += '<span' + (i === tutStep ? ' class="on"' : '') + '></span>';
    $('tutDots').innerHTML = dots;
    $('tutPrev').disabled = tutStep === 0;
    $('tutNext').textContent = tutStep === TUT.length - 1 ? '시작하기' : '다음';
  }
  function openTut() {
    var el = $('tut');
    el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
    tutFit();
    tutStep = 0; renderTut();
    tutPreload(function () { if (el.classList.contains('on')) tutFit(); });
    setTimeout(function () { var x = $('tutX'); if (x) x.focus(); }, 60);
  }
  function closeTut() {
    var el = $('tut');
    el.classList.remove('on'); el.setAttribute('aria-hidden', 'true');
    var b = $('tutBtn'); if (b) b.focus();
  }
  function tutGo(d) {
    var n = Math.max(0, Math.min(TUT.length - 1, tutStep + d));
    if (n === tutStep) { if (d > 0) closeTut(); return; }
    tutStep = n; renderTut();
  }
  $('tutBtn').addEventListener('click', openTut);
  $('tutX').addEventListener('click', closeTut);
  $('tutPrev').addEventListener('click', function () { tutGo(-1); });
  $('tutNext').addEventListener('click', function () { tutGo(1); });
  $('tut').addEventListener('click', function (e) { if (e.target === $('tut')) closeTut(); });
  var tutFitT = 0;
  window.addEventListener('resize', function () {
    if (!$('tut').classList.contains('on')) return;
    clearTimeout(tutFitT);
    tutFitT = setTimeout(tutFit, 150);
  });

  /* ── 그리기 ───────────────────────────────────────── */
  function render() {
    var coach = S.mode === 'coach';
    $('modeCreator').setAttribute('aria-selected', String(!coach));
    $('modeCoach').setAttribute('aria-selected', String(coach));
    q('.stepbar').hidden = coach;
    $('wk').hidden = coach;
    $('crs').hidden = !coach;
    qa('#mods button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mod === S.mod)); });
    $('wk').className = 'wk wk-' + S.mod;
    if (coach) { renderCourse(); return; }
    renderHeads(); renderBin(); renderView(); renderInsp(); renderTline();
  }

  /* ── 손짓 ─────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'scene') {
      goScene(+b.dataset.i);
    } else if (act === 'next') {
      goScene(S.scene + 1);
    } else if (act === 'fsPrev' || act === 'fsNext') {
      goScene(S.scene + (act === 'fsNext' ? 1 : -1));
    } else if (act === 'keep') {
      var id = b.dataset.id;
      S.keep[id] = !S.keep[id];
      b.setAttribute('aria-pressed', String(!!S.keep[id]));
      b.classList.toggle('is-cut', !S.keep[id]);
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
      if ($('tut').classList.contains('on')) closeTut();
      if ($('fs').classList.contains('on')) closeFS();
      if ($('cmpfs').classList.contains('on')) closeCmp();
      if ($('inspPane').classList.contains('on')) setInsp(false);
    }
    if ($('tut').classList.contains('on') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault(); tutGo(e.key === 'ArrowRight' ? 1 : -1); return;
    }
    var rail = e.target.closest && e.target.closest('.tl-rail');
    if (rail) {
      var total = S.mod === 'gate' ? TALK : TOTAL;
      var cur = S.mod === 'gate' ? S.talkT : S.t;
      var step = e.shiftKey ? 10 : (S.mod === 'gate' ? 2 : 1);
      var v = null;
      if (e.key === 'ArrowLeft') v = cur - step;
      else if (e.key === 'ArrowRight') v = cur + step;
      else if (e.key === 'Home') v = 0;
      else if (e.key === 'End') v = total;
      else if (e.key === 'PageDown') v = cur + 10;
      else if (e.key === 'PageUp') v = cur - 10;
      if (v !== null) {
        e.preventDefault();
        if (S.mod === 'gate') setTalk(v); else setT(v);
      }
      return;
    }
    var h = e.target.closest && e.target.closest('.ba-h');
    if (h && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setCurtain(S.pairX + (e.key === 'ArrowRight' ? 5 : -5));
    }
  });

  /* 재생헤드 끌기 — 눈금(.tl-rail) 어디를 눌러도 그 자리로 간다 */
  var railDrag = null;
  function seekAt(clientX) {
    var rail = railDrag || q('.tl-rail');
    if (!rail) return;
    var r = rail.getBoundingClientRect();
    var k = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
    if (S.mod === 'gate') { setTalk(k * TALK); return; }
    var tc = timeAtPx(k * r.width);
    setT(tc === null ? k * TOTAL : tc);
  }
  document.addEventListener('pointerdown', function (e) {
    if ($('tut').classList.contains('on') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault(); tutGo(e.key === 'ArrowRight' ? 1 : -1); return;
    }
    var rail = e.target.closest && e.target.closest('.tl-rail');
    if (!rail) return;
    railDrag = rail;
    try { rail.setPointerCapture(e.pointerId); } catch (x) {}
    seekAt(e.clientX);
    e.preventDefault();
  });
  document.addEventListener('pointermove', function (e) { if (railDrag) seekAt(e.clientX); });
  document.addEventListener('pointerup', function () { railDrag = null; });
  document.addEventListener('pointercancel', function () { railDrag = null; });

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
  function setCurtain(p) {
    S.pairX = Math.max(20, Math.min(80, p));
    var ba = $('ba'); if (!ba) return;
    ba.style.setProperty('--xpx', Math.round(ba.clientWidth * S.pairX / 100) + 'px');
    var h = $('baH'); if (h) h.setAttribute('aria-valuenow', String(Math.round(S.pairX)));
  }

  /* 크기 바뀔 때 커튼 자리만 다시 잡는다(재생헤드는 --x 퍼센트라 다시 잴 필요가 없다) */
  var rz = null, narrow = window.innerWidth < 600;
  window.addEventListener('resize', function () {
    if (rz) return;
    rz = requestAnimationFrame(function () {
      rz = null; placeCurtain();
      var n = window.innerWidth < 600;
      if (n !== narrow) { narrow = n; if (S.mode === 'creator') renderTline(); }
    });
  });

  /* 시작 — 첫 장면(표지)의 정가운데에서 연다 */
  S.t = centerOf(S.scene);
  render();
})();
