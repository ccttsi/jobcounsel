/* 오늘의 원문(17-1) — briefing/data/news.json(NEWS-SCHEMA.md v1.x)을 읽기만 한다.
   수집·번역·외부 API 호출은 넣지 않는다. 라이선스 조건을 못 맞춘 항목은 그리지 않고 건수만 보여 준다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var main = $('main'), reader = $('reader');
  var DATA = '../data/', PER = 15;
  var ALLOWED = { 'KOGL-1': 1, 'PUBLIC-DOMAIN': 1, 'CC-BY-4.0': 1 };
  var S = { themes: 0, d: null, items: [], dropped: 0, kw: '', topic: '', src: '', issue: '', page: 0, mode: 'ko', y: 0, briefCards: {} };
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function url(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function foreign(it) { return ((it.source || {}).country || 'KR').toUpperCase() !== 'KR'; }
  function title(it) { return foreign(it) && it.title_ko ? it.title_ko : it.title_original; }
  function when(s) { var m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(s || '')); return m ? m[1] + (m[2] ? ' ' + m[2] : '') : ''; }
  var ED = { 'kr-0700': ['kr', '한국판 07:00'], 'global-2300': ['gl', '해외판 23:00'] };
  function edB(x) { var e = Array.isArray(x.edition) ? x.edition : (typeof x.edition === 'string' ? [x.edition] : []); return e.filter(function (k) { return ED[k]; }).map(function (k) { return '<span class="bd ed ' + ED[k][0] + '">' + ED[k][1] + '</span>'; }).join(''); }
  function paras(t) { return String(t || '').split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean); }

  /* NEWS-SCHEMA §1: 모두 만족해야 그린다 */
  function allowed(it) {
    var L = (it.source || {}).license || {}, R = it.rights || {};
    if (it.track !== 'A' || L.verified !== true || !ALLOWED[L.type] || R.full_text_allowed !== true || !String(it.body_original || '').trim()) return false;
    if (foreign(it) && (R.ai_translation_allowed !== true || !String(it.body_ko_ai || '').trim())) return false;
    if (!/^[A-Za-z0-9-]+$/.test(String(it.id || ''))) return false;
    return true;
  }
  function licBadges(it) {
    var L = (it.source || {}).license || {};
    return '<span class="bd">A · 원문 허용</span><span class="stamp">' + esc(L.name || L.type) + '</span>' + (foreign(it) ? '<span class="ai">AI 번역본(원문 기준)</span>' : '');
  }

  /* ---------- 지난 호 — 날짜 선택 상자 ----------
     news-archive/<날짜>.json은 자기 날짜만 archive_dates에 담고 있어서, 그 파일만 보고 그리면
     지난 호를 연 순간 선택 상자가 사라져 최신 호로 돌아올 길이 없다. 한 번이라도 본 날짜를 모아 두고,
     「최신」 표시는 실제 최신 호(data/news.json)에만 붙인다(오늘의 브리핑과 같은 방식). */
  var knownDates = [], latestDate = '';
  function archiveList(d) {
    var seen = {};
    knownDates.concat(arr(d && d.archive_dates), [d && d.date]).forEach(function (x) { x = String(x || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(x)) seen[x] = 1; });
    knownDates = Object.keys(seen).sort().reverse();
    return knownDates;
  }
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  function wd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? WEEKDAY[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : ''; }
  function fmtDate(s) { return String(s || '').replace(/-/g, '.'); }
  function calLabel(s) { return fmtDate(s) + ' (' + wd(s) + ')'; }
  function dateButton(d) {
    return '<span class="datewrap"><button type="button" class="datebtn" id="dateBtn" aria-haspopup="dialog">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/></svg>' +
      '<span data-cal-label>' + esc(calLabel(d.date)) + '</span>' +
      '<svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></span>';
  }
  var CAL = null;
  function initCal(d) {
    var btn = $('dateBtn'); if (!btn || !window.JC_CAL) return;
    var dates = archiveList(d);
    CAL = JC_CAL({ button: btn, dates: dates, current: d.date, label: calLabel, onPick: function (x) { goDate(x); } });
    CAL.setDates(dates, d.date);
  }

  /* ---------- 목록 ---------- */
  function filtered() {
    return S.items.filter(function (it) {
      if (S.kw && arr(it.keywords).indexOf(S.kw) < 0) return false;
      if (S.topic && arr(it.topics).indexOf(S.topic) < 0) return false;
      if (S.src && (it.source || {}).source_name !== S.src) return false;
      if (S.issue && it.issue_id !== S.issue) return false;
      return true;
    });
  }
  function chips(name, key, list) {
    return '<fieldset><legend>' + name + '</legend><div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip" data-k="' + key + '" data-v="' + esc(v) + '" aria-pressed="' + (S[key] === v) + '">' + esc(v) + '</button>';
    }).join('') + '</div></fieldset>';
  }
  function render(notice) {
    var d = S.d, list = filtered(), total = S.items.length;
    var topics = [], srcs = [];
    S.items.forEach(function (it) { arr(it.topics).forEach(function (t) { if (topics.indexOf(t) < 0) topics.push(t); }); var n = (it.source || {}).source_name; if (n && srcs.indexOf(n) < 0) srcs.push(n); });
    var dropped = S.dropped + ((d.excluded || {}).count || 0);
    var nOn = ['kw', 'topic', 'src', 'issue'].filter(function (k) { return S[k]; }).length;

    var h = '<header class="mast"><div class="mast-rule"></div><div class="mast-meta"><span class="l"><span class="num dateonly">' + esc(calLabel(d.date)) + '</span><span class="sep">·</span><span>허용 자료 ' + total + '건' + (dropped ? ' · 라이선스로 뺀 ' + dropped + '건' : '') + '</span></span>' + dateButton(d) + '</div>' +
      '<h1 class="nameplate">오늘의 원문<small>오늘의 브리핑 · 원문 자료실</small></h1><div class="mast-double"></div></header>';
    if (d.data_status && d.data_status !== 'ok') h += '<p class="status" role="status"><b>' + (d.data_status === 'fallback' ? '오늘 자 갱신 실패' : '일부 자료 누락') + '</b> ' + esc(d.data_status_note || '') + '</p>';
    if (notice) h += '<p class="status" role="status">' + esc(notice) + '</p>';

    if (arr(d.keywords).length) h += '<nav class="kw" aria-label="오늘의 키워드">' + arr(d.keywords).slice(0, 7).map(function (k) {
      return '<button type="button" data-k="kw" data-v="' + esc(k.word) + '" aria-pressed="' + (S.kw === k.word) + '">' + esc(k.word) + '<sup>' + esc(k.count) + '</sup></button>';
    }).join('') + '</nav>';

    if (!total && !arr(d.archive_dates).length) {
      main.innerHTML = '<header class="mast"><div class="mast-rule"></div><div class="mast-meta"><span class="l"><span class="num">' + esc(calLabel(d.date)) + '</span></span>' + dateButton(d) + '</div><h1 class="nameplate">오늘의 원문<small>오늘의 브리핑 · 원문 자료실</small></h1><div class="mast-double"></div></header><p class="empty"><b>첫 호를 준비하고 있습니다.</b> 원문 재게시와 번역이 허용된 자료가 모이면 이곳에 매일 아침 올라옵니다. 오늘의 요약은 <a href="../">오늘의 브리핑</a>에서 볼 수 있습니다.</p>';
      bindPicker();
      return;
    }
    if (!total) {
      h += '<div class="sh"><h2>머리기사</h2></div><p class="empty"><b>오늘은 허용된 원문 자료가 0건입니다.</b> ' +
        (dropped ? '수집한 자료 가운데 ' + dropped + '건은 원문 재게시나 번역이 허용되지 않아 싣지 않았습니다. ' : '') + '요약은 <a href="../">오늘의 브리핑</a>에서 볼 수 있습니다.</p>';
    } else {
      var heads = S.items.filter(function (it) { return it.headline; }); if (!heads.length) heads = S.items.slice(0, 3);
      h += '<div class="sh"><h2>머리기사</h2><small class="num">' + Math.min(3, heads.length) + '건</small></div><div class="heads">' + heads.slice(0, 3).map(function (it) {
        return '<button type="button" class="head" data-open="' + esc(it.id) + '"><span class="meta">' + licBadges(it) + '<span>' + esc((it.source || {}).source_name) + '</span><span class="num">' + esc(when(it.published_at)) + '</span></span>' +
          '<h3>' + esc(title(it)) + '</h3>' + (foreign(it) ? '<span class="orig">' + esc(it.title_original) + '</span>' : '') +
          (arr(it.related_jobs).length ? '<span class="jobs">' + arr(it.related_jobs).slice(0, 3).map(function (j) { return '<span>' + esc(j) + '</span>'; }).join('') + '</span>' : '') + '</button>';
      }).join('') + '</div>';

      h += '<div class="sh"><h2>피드</h2><small class="num">' + list.length + '건' + (nOn ? ' · 조건 ' + nOn + '개' : '') + '</small></div>' +
        '<div class="fbar"><button type="button" class="fbtn" id="fOpen" aria-controls="flt" aria-expanded="false">주제·출처로 좁히기' + (nOn ? ' (' + nOn + ')' : '') + '</button>' +
        (nOn ? '<button type="button" class="fbtn" data-reset style="display:inline-flex">조건 풀기</button>' : '') + '</div>' +
        '<div class="flt" id="flt" role="group" aria-label="주제·출처로 좁히기">' + chips('주제', 'topic', topics) + chips('출처', 'src', srcs) +
        '<button type="button" class="pbtn done" id="fDone">결과 ' + list.length + '건 보기</button></div>';
      var pages = Math.max(1, Math.ceil(list.length / PER)); S.page = Math.min(S.page, pages - 1);
      h += list.length ? '<ol class="feed">' + list.slice(S.page * PER, (S.page + 1) * PER).map(function (it) {
        return '<li><button type="button" data-open="' + esc(it.id) + '"><span class="t">' + esc(title(it)) + '</span><span class="m"><span>' + esc((it.source || {}).source_name) + '</span><span class="num">' + esc(when(it.published_at)) + '</span>' +
          (foreign(it) ? '<span class="ai">AI 번역</span>' : '<span>국내 원문</span>') + edB(it) + arr(it.topics).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span></button></li>';
      }).join('') + '</ol>' + (pages > 1 ? '<div class="pager"><button type="button" class="pbtn" data-pg="-1"' + (S.page ? '' : ' disabled') + '>← 이전</button><span class="num">' + (S.page + 1) + ' / ' + pages + '</span><button type="button" class="pbtn" data-pg="1"' + (S.page < pages - 1 ? '' : ' disabled') + '>다음 →</button></div>' : '')
        : '<p class="empty">이 조건에 맞는 원문이 없습니다. <b>조건 풀기</b>를 누르면 전체가 보입니다.</p>';
    }

    var lic = {};
    S.items.forEach(function (it) { var s = it.source || {}, L = s.license || {}, k = s.source_name + '|' + L.type; if (!lic[k]) lic[k] = { s: s, L: L, n: 0 }; lic[k].n++; });
    h += '<div class="sh"><h2>이번 호 출처·라이선스</h2></div>' + (Object.keys(lic).length ? '<ul class="lic">' + Object.keys(lic).map(function (k) {
      var o = lic[k], lu = url(o.L.url);
      return '<li>' + esc(o.s.source_name) + ' · <span class="num">' + o.n + '건</span><small>' + esc(o.L.name) + (o.L.verified_at ? ' · 확인 ' + esc(o.L.verified_at) : '') + (o.L.evidence ? ' · ' + esc(o.L.evidence) : '') + '</small>' + (lu ? '<a href="' + esc(lu) + '" target="_blank" rel="noopener">라이선스 원문</a>' : '') + '</li>';
    }).join('') + '</ul>' : '') +
      '<p class="why">왜 이 자료만 싣나요? 번역은 원문을 바꿔 새로 쓰는 일이라, 원문을 다시 게시해도 되고 번역해도 된다고 밝힌 자료(공공누리 제1유형, 미국 연방정부 저작물, CC BY 4.0)만 고릅니다. 언론 기사는 싣지 않고, 요약과 링크만 오늘의 브리핑에서 다룹니다. 사진·도표 이미지는 옮기지 않습니다.</p>';

    if (S.themes) h += '<p class="why"><a href="../#themes">메인테마 ' + S.themes + '개 — 날짜와 무관하게 계속 보는 핵심은 오늘의 브리핑 아래에 →</a></p>';
    var T = d.takedown || {}, tu = url(T.contact_url);
    h += '<div class="sh"><h2>정정·비노출 요청</h2></div><div class="td"><p>권리자나 독자가 요청하면 해당 항목을 바로 내리고 이력을 남깁니다.' + (tu ? ' <a href="' + esc(tu) + '" target="_blank" rel="noopener">요청 창구</a>' : '') + '</p>' +
      (arr(T.recent).length ? '<ul>' + arr(T.recent).map(function (r) { return '<li class="num">' + esc(r.date) + ' · ' + esc(r.title_ko) + ' · ' + esc(r.reason) + '</li>'; }).join('') + '</ul>' : '<p>최근 비노출 이력 없음.</p>') + '</div>' +
      '<p class="why num">갱신 ' + esc(String(d.updated_at || '').replace('T', ' ').slice(0, 16)) + ' · 스키마 ' + esc(d.schema_version) + '</p>';

    main.innerHTML = h;
    initCal(d);
  }

  /* ---------- 리더 ---------- */
  function byId(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
  function body(it) {
    var o = paras(it.body_original);
    if (!foreign(it) || S.mode === 'orig') return '<div class="rd-body">' + o.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
    var k = paras(it.body_ko_ai);
    if (S.mode === 'ko') return '<div class="rd-body">' + k.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
    var n = Math.max(o.length, k.length), rows = '';
    for (var i = 0; i < n; i++) rows += '<div class="pair-row"><p>' + esc(k[i] || '') + '</p><p class="o" lang="en">' + esc(o[i] || '') + '</p></div>';
    return '<div class="rd-body pair">' + rows + '</div>';
  }
  function drawReader(it) {
    var s = it.source || {}, L = s.license || {}, su = url(s.source_url), lu = url(L.url), f = foreign(it), T = it.translation || {};
    var card = it.issue_id && S.briefCards[it.issue_id];
    reader.innerHTML = '<div class="rd-in"><div class="rd-top"><button type="button" class="pbtn" data-close>← 목록으로</button><span class="sp"></span>' +
      (f ? '<div class="modes" role="radiogroup" aria-label="읽기 방식">' + [['ko', '번역'], ['orig', '원문'], ['pair', '나란히']].map(function (m) {
        return '<button type="button" role="radio" data-mode="' + m[0] + '" aria-checked="' + (S.mode === m[0]) + '">' + m[1] + '</button>';
      }).join('') + '</div>' : '') + '</div>' +
      '<div class="rd-meta" style="margin-top:14px">' + licBadges(it) + edB(it) + '<span>' + esc(s.source_name) + '</span><span class="num">게시 ' + esc(when(it.published_at)) + '</span>' +
      (f && T.translated_at ? '<span class="num">번역 ' + esc(when(T.translated_at)) + '</span>' : '') + '</div>' +
      '<h2 class="rd-h" id="rdH">' + esc(f && S.mode !== 'orig' ? (it.title_ko || it.title_original) : it.title_original) + '</h2>' +
      (f ? '<p class="rd-sub" lang="' + (S.mode === 'orig' ? 'ko' : 'en') + '">' + esc(S.mode === 'orig' ? it.title_ko : it.title_original) + '</p>' : '') +
      (card ? '<a class="rd-link" href="../#' + esc(card) + '">이 소식을 3분 요약으로 →</a>' : '') +
      body(it) +
      '<div class="rd-foot">' + esc(L.attribution_text || s.source_name) +
      (L.type === 'CC-BY-4.0' ? ' · ' + (f ? 'AI 한국어 번역, 내용 변경 없음' : '변경 없음') : '') +
      (lu ? '<a href="' + esc(lu) + '" target="_blank" rel="noopener">라이선스</a>' : '') +
      (su ? '<a href="' + esc(su) + '" target="_blank" rel="noopener">원문 사이트</a>' : '') +
      '<span>' + (f ? '번역은 AI가 원문을 기준으로 옮긴 것이며, 법적 효력은 원문에 있습니다.' : '원문 그대로 게시합니다.') + '</span></div></div>';
  }
  var openId = '';
  function openReader(id, push) {
    var it = byId(id); if (!it) return;
    if (!openId) S.y = window.scrollY;
    openId = id; drawReader(it);
    reader.hidden = false; document.body.classList.add('rd-open');
    requestAnimationFrame(function () { reader.classList.add('open'); reader.scrollTop = 0; var b = reader.querySelector('[data-close]'); if (b) b.focus({ preventScroll: true }); });
    if (push) try { history.pushState({ a: id }, '', location.pathname + location.search + '#a=' + id); } catch (e) {}
  }
  function closeReader(fromPop) {
    if (!openId) return;
    var last = openId; openId = '';
    reader.classList.remove('open'); document.body.classList.remove('rd-open');
    setTimeout(function () { if (!openId) { reader.hidden = true; reader.innerHTML = ''; } }, reduce.matches ? 0 : 260);
    window.scrollTo(0, S.y);
    var b = main.querySelector('[data-open="' + last + '"]'); if (b) b.focus({ preventScroll: true });
    if (!fromPop) try { history.back(); } catch (e) {}
  }
  reader.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeReader(false); return; }
    var m = e.target.closest('[data-mode]'); if (!m) return;
    S.mode = m.getAttribute('data-mode'); try { localStorage.setItem('jc-news-mode', S.mode); } catch (er) {}
    var it = byId(openId); if (it) { var y = reader.scrollTop; drawReader(it); reader.scrollTop = y; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openId) closeReader(false); });
  window.addEventListener('popstate', function () {
    var m = /#a=([A-Za-z0-9-]+)/.exec(location.hash);
    if (m) openReader(m[1], false); else closeReader(true);
  });

  /* ---------- 목록 조작 ---------- */
  function setUrl() {
    var q = new URLSearchParams(location.search);
    ['issue', 'topic'].forEach(function (k) { if (S[k]) q.set(k, S[k]); else q.delete(k); });
    var qs = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) {}
  }
  main.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-open]'))) { openReader(t.getAttribute('data-open'), true); return; }
    if ((t = e.target.closest('[data-k]'))) { var k = t.getAttribute('data-k'), v = t.getAttribute('data-v'); S[k] = S[k] === v ? '' : v; S.page = 0; keep(); setUrl(); return; }
    if (e.target.closest('[data-reset]')) { S.kw = S.topic = S.src = S.issue = ''; S.page = 0; keep(); setUrl(); return; }
    if ((t = e.target.closest('[data-pg]'))) { S.page += +t.getAttribute('data-pg'); render(); var f = main.querySelector('.feed'); if (f) f.scrollIntoView({ block: 'start' }); return; }
    if (e.target.closest('#fOpen')) { var fl = $('flt'); fl.classList.add('open'); e.target.closest('#fOpen').setAttribute('aria-expanded', 'true'); return; }
    if (e.target.closest('#fDone')) { $('flt').classList.remove('open'); var o = $('fOpen'); if (o) { o.setAttribute('aria-expanded', 'false'); o.focus(); } }
  });
  function keep() { var open = $('flt') && $('flt').classList.contains('open'), y = window.scrollY; render(); window.scrollTo(0, y); if (open && $('flt')) { $('flt').classList.add('open'); var o = $('fOpen'); if (o) o.setAttribute('aria-expanded', 'true'); } }

  /* ---------- 불러오기 ---------- */
  function get(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function use(d, notice) {
    S.d = d; S.items = []; S.dropped = 0;
    arr(d.items).forEach(function (it) { if (allowed(it)) S.items.push(it); else { S.dropped++; console.warn('[news] 수록 조건 미충족으로 그리지 않음:', it && it.id); } });
    render(notice);
    var m = /#a=([A-Za-z0-9-]+)/.exec(location.hash); if (m) openReader(m[1], false);
  }
  function emptyFirst() {
    main.innerHTML = '<header class="mast"><h1 class="nameplate">오늘의 원문<small>오늘의 브리핑 · 원문 자료실</small></h1></header><p class="empty"><b>첫 호를 준비하고 있습니다.</b> 원문 재게시와 번역이 허용된 자료가 모이면 이곳에 매일 아침 올라옵니다. 오늘의 요약은 <a href="../">오늘의 브리핑</a>에서 볼 수 있습니다.</p>';
  }

  /* ---------- 날짜 바꾸기: 주소의 ?date= 에 남긴다(최신 호는 주소에서 지운다) ---------- */
  function setDateUrl(date) {
    var q = new URLSearchParams(location.search);
    if (!date || date === latestDate) q.delete('date'); else q.set('date', date);
    var s = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) {}
  }
  function goDate(date, fromLink) {
    if (!date) return;
    if (date === (S.d || {}).date) return;
    var y = window.scrollY;
    if (!fromLink) {   // 이슈·키워드는 그날 자료에만 있는 값이라 날짜를 바꾸면 풀어 준다(빈 화면으로 보이지 않게)
      S.kw = S.topic = S.src = S.issue = ''; S.page = 0; setUrl();
    }
    if (S.latest && date === latestDate) {
      use(S.latest); setDateUrl(''); window.scrollTo(0, y); return;
    }
    get(DATA + 'news-archive/' + date + '.json').then(function (d) { use(d); setDateUrl(date); window.scrollTo(0, y); })
      .catch(function () {
        knownDates = knownDates.filter(function (x) { return x !== date; });
        use(S.latest, date + ' 원문 호가 없어 최신 호를 보여 드립니다.'); setDateUrl('');
      });
  }
  try { var mm = localStorage.getItem('jc-news-mode'); if (mm === 'ko' || mm === 'orig' || mm === 'pair') S.mode = mm; } catch (e) {}
  var q = new URLSearchParams(location.search);
  S.issue = q.get('issue') || ''; S.topic = q.get('topic') || '';
  var want = q.get('date');
  get(DATA + 'briefing.json').then(function (b) { arr(b.cards).forEach(function (c) { if (c.issue_id) S.briefCards[c.issue_id] = c.id; }); S.themes = arr(b.main_themes).length; }).catch(function () {}).then(function () {
    /* 최신 호는 언제나 먼저 받는다 — 지난 호 직접 링크(?date=)로 들어와도 날짜 선택 상자에 최신 호가 남는다. */
    return get(DATA + 'news.json').then(function (d) {
      S.latest = d; latestDate = d.date || ''; archiveList(d);
      if (want && /^\d{4}-\d{2}-\d{2}$/.test(want) && want !== latestDate) {
        if (knownDates.indexOf(want) < 0) { use(d, want + ' 원문 호가 없어 최신 호를 보여 드립니다.'); setDateUrl(''); return; }   // 없는 호는 부르지 않는다(404 소음 없이)
        return goDate(want, true);
      }
      if (want) setDateUrl('');
      use(d);
    });
  }).catch(function () { emptyFirst(); });
})();
