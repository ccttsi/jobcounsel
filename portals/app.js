/* 19. 채용 사이트 안내판 — 화면 코드만(자료는 portals/data/portals.json, 피클 담당 · 읽기 전용).
   계약: portals/data/SCHEMA.md. 공고·로고·슬로건·바뀌는 값(공고 수·평점)은 만들지 않는다. 내보내기 기능 없음.
   모션: 카드는 한 번만 만들고 필터가 바뀌면 자리만 옮긴다(FLIP, transform·opacity만 · WAAPI). 상시 rAF 루프 없음. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* 검색용 정규화: 소문자로 만들고 띄어쓰기·가운뎃점·마침표·붙임표를 지운다.
     이렇게 해야 `gosi.kr`·`gosi kr`·`GOSI` 가 모두 `gosikr` 로 맞는다. */
  function nz(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z가-힣]+/g, ''); }
  function hostOf(u) { return String(u || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''); }
  var wide = matchMedia('(min-width:900px)'), xwide = matchMedia('(min-width:1240px)'), rm = matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return rm.matches || d.documentElement.hasAttribute('data-jc-imm'); }

  /* 3초 진단: 상황 하나 → 대상 조건 묶음(화면 길잡이. 사이트 자료는 바꾸지 않는다) */
  var DX = [
    ['first', '처음 구직', '신입·청년', ['신입', '청년', '인턴']],
    ['move', '경력 이직', '경력·외국계', ['경력', '임원', '외국계']],
    ['back', '다시 일하기', '경력단절·중장년', ['경력단절여성', '여성', '중장년', '노인']],
    ['study', '학생·인턴', '대학생·직업계고', ['대학생', '인턴', '직업계고']],
    ['support', '지원이 필요해요', '장애인·외국인 등', ['장애인', '외국인', '다문화가족', '북한이탈주민']],
    ['flex', '일하는 방식', '프리랜서·단기', ['프리랜서', '단기·아르바이트', '계약직', '파견']]
  ];
  var D = null, BY = {}, SEC = {}, CARDS = {};
  var S = { s: '', r: [], e: [], q: '', dx: '', p: '' };

  /* 주소(hash)에 상태를 남긴다: #s=tech&r=IT·개발&e=신입&q=…&dx=first&p=work24 */
  function readHash() {
    var raw = String(location.hash || '').replace(/^#/, '');
    var o = { s: '', r: [], e: [], q: '', dx: '', p: '' };
    /* `#work24`처럼 아이디만 붙인 짧은 딥링크도 `#p=work24`와 같게 받는다. */
    if (raw && raw.indexOf('=') < 0) {
      try { o.p = decodeURIComponent(raw).trim(); } catch (e) { o.p = raw.trim(); }
      return o;
    }
    raw.split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      if (k === 'r' || k === 'e') o[k] = v ? v.split(',') : []; else if (k in o) o[k] = v;
    });
    return o;
  }
  /* ?q=·?p= 로도 받는다(다른 화면·메시지에서 바로 링크할 때). */
  function readQP(name) {
    var m = new RegExp('(?:^|[?&])' + name + '=([^&]*)').exec(location.search || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch (e) { return ''; }
  }
  function writeHash(push) {
    var a = [];
    if (S.s) a.push('s=' + encodeURIComponent(S.s));
    if (S.r.length) a.push('r=' + encodeURIComponent(S.r.join(',')));
    if (S.e.length) a.push('e=' + encodeURIComponent(S.e.join(',')));
    if (S.q) a.push('q=' + encodeURIComponent(S.q));
    if (S.dx) a.push('dx=' + S.dx);
    if (S.p) a.push('p=' + encodeURIComponent(S.p));
    var h = a.length ? '#' + a.join('&') : location.pathname + location.search;
    if (h.charAt(0) === '#') {
      var rest = location.search.replace(/^\?/, '').split('&').filter(function (kv) { return kv && kv.indexOf('q=') !== 0 && kv.indexOf('p=') !== 0; }).join('&');
      h = location.pathname + (rest ? '?' + rest : '') + h;   // ?q=·?p= 는 해시로 옮기고 지운다
    }
    try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (e) {}
  }

  fetch('./data/portals.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    D = j; j.sectors.forEach(function (s) { SEC[s.code] = s; });
    j.portals.forEach(function (p, i) {
      p._i = i;
      p._n = nz([p.name, p.operator, p.strengths, p.tips, p.roles.join(' '), p.eligibility.join(' '),
        (SEC[p.sector] || {}).name, hostOf(p.url), (p.aliases || []).join(' '), (p.shows || []).join(' ')].join(' '));
      BY[p.id] = p;
    });
    var h = readHash(), qp = readQP('q'), pp = readQP('p');
    if (qp && !h.q) h.q = qp;
    if (pp && !h.p) h.p = pp;
    S = h; clean();
    buildCards(); renderFilters(); renderFoot(); apply(true);
    if (qp) writeHash(false);   // ?q= 로 들어온 검색어는 해시로 옮기고 주소창의 ?q= 는 지운다
    if (S.p && BY[S.p]) {
      openDet(S.p, true, true);
      revealCard(S.p, false);   // 카드가 목록 위쪽에 있도록 스크롤하고 하이라이트
    } else if (qp) {
      var r0 = results()[0]; if (r0) markDL(r0.id);
    }
  }).catch(function () { $('grid').innerHTML = '<p class="empty">사이트 목록을 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>'; });
  function clean() {
    var R = D.vocabulary.roles, E = D.vocabulary.eligibility;
    S.r = S.r.filter(function (x) { return R.indexOf(x) >= 0; }); S.e = S.e.filter(function (x) { return E.indexOf(x) >= 0; });
    if (S.s && !SEC[S.s]) S.s = ''; if (S.p && !BY[S.p]) S.p = '';
    if (S.dx && !DX.some(function (x) { return x[0] === S.dx; })) S.dx = '';
  }

  /* ───── 판정 ───── */
  function hit(p) {
    if (S.s && p.sector !== S.s) return 0;
    if (S.r.length && !S.r.some(function (x) { return p.roles.indexOf(x) >= 0; })) return 0;
    if (S.e.length && !S.e.some(function (x) { return p.eligibility.indexOf(x) >= 0; })) return 0;
    if (S.q && !hitQ(p)) return 0;
    var sc = 1 + qRank(p) * 4; S.r.forEach(function (x) { if (p.roles.indexOf(x) >= 0) sc++; }); S.e.forEach(function (x) { if (p.eligibility.indexOf(x) >= 0) sc++; });
    return sc;
  }
  /* 띄어 쓴 여러 낱말은 모두 들어 있어야 맞는다(도메인·영문 약어 포함). */
  function qTokens() { return String(S.q || '').split(/\s+/).map(nz).filter(Boolean); }
  function hitQ(p) { var t = qTokens(); return t.every(function (x) { return p._n.indexOf(x) >= 0; }); }
  /* 이름 > 별칭·도메인 > 「가서 볼 수 있는 것」 > 본문 순으로 앞세운다. */
  function qRank(p) {
    var t = qTokens(); if (!t.length) return 0;
    var nm = nz(p.name);
    if (t.every(function (x) { return nm.indexOf(x) >= 0; })) return 3;
    var al = (p.aliases || []).map(nz).concat([nz(hostOf(p.url))]);
    if (al.some(function (a) { return a && t.every(function (x) { return a.indexOf(x) >= 0; }); })) return 2;
    var sh = nz((p.shows || []).join(' '));
    if (t.every(function (x) { return sh.indexOf(x) >= 0; })) return 1;
    return 0;
  }
  function results() {
    var out = []; D.portals.forEach(function (p) { var s = hit(p); if (s) out.push([s, p]); });
    out.sort(function (a, b) { return b[0] - a[0] || a[1]._i - b[1]._i; });
    return out.map(function (x) { return x[1]; });
  }

  /* ───── 딥링크 도착 표시 ─────
     메인 검색에서 포털을 누르면 `#p=아이디`로 들어온다. 그 카드를 목록 위쪽에 두고
     살짝 다른 종이색으로 표시해, 안내판 첫 화면에서 다시 찾지 않게 한다. */
  var dlId = '';
  function markDL(id) {
    if (dlId && CARDS[dlId]) CARDS[dlId].classList.remove('dl');
    dlId = CARDS[id] ? id : '';
    if (dlId) CARDS[dlId].classList.add('dl');
  }
  function clearDL() { if (dlId && CARDS[dlId]) CARDS[dlId].classList.remove('dl'); dlId = ''; }
  function revealCard(id, smooth) {
    var c = CARDS[id]; if (!c) return;
    markDL(id);
    var sc = $('scroller');
    var top = c.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6;
    top = Math.max(0, Math.min(top, sc.scrollHeight - sc.clientHeight));
    try { sc.scrollTo({ top: top, behavior: (smooth && !still()) ? 'smooth' : 'auto' }); }
    catch (e) { sc.scrollTop = top; }
  }

  /* ───── 카드: 한 번만 만든다 ───── */
  function buildCards() {
    var g = $('grid'); g.innerHTML = '';
    D.portals.forEach(function (p, i) {
      var b = d.createElement('button'); b.type = 'button'; b.className = 'card'; b.setAttribute('data-p', p.id);
      b.style.setProperty('--c', 'var(--s-' + p.sector + ')');
      b.innerHTML = '<span class="t"><span class="nm">' + esc(p.name) + '</span><span class="no num">' + String(i + 1).padStart(2, '0') + '</span></span><span class="op">' + esc(p.operator) + (p.verify_method === 'official' ? ' <em class="ict">국내 접속</em>' : '') + '</span><span class="kw"></span>';
      CARDS[p.id] = b; g.appendChild(b);
    });
    var em = d.createElement('div'); em.className = 'empty'; em.id = 'none'; em.hidden = true;
    em.innerHTML = '조건에 맞는 사이트가 없습니다. 조건을 하나씩 풀어 보세요.<br><button type="button" data-clear>조건 모두 풀기</button>';
    g.appendChild(em);
  }
  /* 카드 한 줄: 검색·필터에 걸린 말을 앞세우고, 그 뒤에 「가서 볼 수 있는 것」을 붙인다. */
  function kwHtml(p) {
    var hits = [], sel = S.r.concat(S.e), t = qTokens();
    p.roles.concat(p.eligibility).forEach(function (x) {
      if (x !== '전 직종' && sel.indexOf(x) >= 0 && hits.indexOf(x) < 0) hits.push(x);
    });
    if (t.length) {
      var al = (p.aliases || []).concat([hostOf(p.url), p.name]);
      for (var i = 0; i < al.length; i++) {
        var n = nz(al[i]);
        if (n && t.some(function (q) { return n.indexOf(q) >= 0; }) && hits.indexOf(al[i]) < 0) { hits.unshift(al[i]); break; }
      }
    }
    var items = hits.slice();
    (p.shows || []).forEach(function (x) { if (items.indexOf(x) < 0) items.push(x); });
    var show = items.slice(0, 5), more = items.length - show.length, hn = Math.min(hits.length, show.length);
    return show.map(function (x, i) { return '<span' + (i < hn ? ' class="hit"' : '') + '>' + esc(x) + '</span>'; }).join('') +
      (more > 0 ? '<span class="more">+' + more + '</span>' : '');
  }

  /* ───── 적용: FLIP ───── */
  var lastN = -1;
  function apply(first) {
    var list = results(), g = $('grid'), keep = {}, before = {};
    var anim = !first && !still() && typeof Element.prototype.animate === 'function';
    if (anim) Object.keys(CARDS).forEach(function (id) { var c = CARDS[id]; if (!c.hidden) before[id] = c.getBoundingClientRect(); });
    list.forEach(function (p) { keep[p.id] = 1; });
    Object.keys(CARDS).forEach(function (id) { CARDS[id].hidden = !keep[id]; });
    list.forEach(function (p) { var c = CARDS[p.id]; c.querySelector('.kw').innerHTML = kwHtml(p); c.setAttribute('aria-current', String(S.p === p.id)); g.appendChild(c); });
    var none = $('none'); none.hidden = list.length > 0; g.appendChild(none);
    if (anim) {
      var k = 0, sc = $('scroller').getBoundingClientRect();
      list.forEach(function (p) {
        var c = CARDS[p.id], a = c.getBoundingClientRect(), b = before[p.id];
        if (a.bottom < sc.top - 40 || a.top > sc.bottom + 40) return;   // 화면 밖은 움직이지 않는다
        if (b) { var dx = b.left - a.left, dy = b.top - a.top; if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1)' }); }
        else { c.animate([{ opacity: 0, transform: 'translateY(9px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: Math.min(k++, 10) * 34, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' }); }
      });
    }
    roll(list.length, first);
    renderAct(); syncFilters();
  }
  function roll(n, first) {
    var o = $('odo'); if (n === lastN) return;
    while (o.children.length > 1) o.removeChild(o.firstChild);   // 빠르게 연달아 누르면 앞의 숫자는 바로 치운다
    var old = o.firstChild, nu = d.createElement('span'); nu.textContent = n;
    if (old && old.getAnimations) old.getAnimations().forEach(function (a) { a.cancel(); });
    var up = n > lastN; lastN = n;
    if (first || still() || !old || typeof nu.animate !== 'function') { o.innerHTML = ''; o.appendChild(nu); return; }
    nu.style.position = 'absolute'; nu.style.left = '0'; nu.style.top = '0'; o.appendChild(nu);
    o.style.minWidth = Math.max(old.offsetWidth, 30) + 'px';
    old.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + (up ? '-' : '') + '100%)', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    var a = nu.animate([{ transform: 'translateY(' + (up ? '' : '-') + '100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)' });
    a.onfinish = function () { if (old.parentNode) old.remove(); nu.style.position = ''; o.style.minWidth = ''; };
  }

  /* ───── 필터 ───── */
  function counts(key, val) { var n = 0; D.portals.forEach(function (p) { if (p[key].indexOf(val) >= 0) n++; }); return n; }
  function renderFilters() {
    $('dxm').innerHTML = DX.map(function (x) { return '<button type="button" data-dx="' + x[0] + '" aria-pressed="false">' + x[1] + '</button>'; }).join('');
    $('dx').innerHTML = DX.map(function (x) { return '<button type="button" data-dx="' + x[0] + '" aria-pressed="false">' + x[1] + '<small>' + x[2] + '</small></button>'; }).join('');
    var sh = '<button type="button" data-sec="" aria-pressed="false" style="--c:var(--ink)"><i></i>전체<span class="ct num">' + D.portals.length + '</span></button>';
    D.sectors.forEach(function (s) { var n = D.portals.filter(function (p) { return p.sector === s.code; }).length; sh += '<button type="button" data-sec="' + s.code + '" aria-pressed="false" style="--c:var(--s-' + s.code + ')" title="' + esc(s.desc) + '"><i></i>' + esc(s.name) + '<span class="ct num">' + n + '</span></button>'; });
    $('sec').innerHTML = sh;
    $('roles').innerHTML = D.vocabulary.roles.map(function (x) { return '<button type="button" data-r="' + esc(x) + '" aria-pressed="false">' + esc(x) + '<span class="n num">' + counts('roles', x) + '</span></button>'; }).join('');
    $('elig').innerHTML = D.vocabulary.eligibility.map(function (x) { return '<button type="button" data-e="' + esc(x) + '" aria-pressed="false">' + esc(x) + '<span class="n num">' + counts('eligibility', x) + '</span></button>'; }).join('');
    $('q').value = S.q;
  }
  function syncFilters() {
    d.querySelectorAll('[data-dx]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-dx') === S.dx)); });
    $('sec').querySelectorAll('[data-sec]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sec') === S.s)); });
    $('roles').querySelectorAll('[data-r]').forEach(function (b) { b.setAttribute('aria-pressed', String(S.r.indexOf(b.getAttribute('data-r')) >= 0)); });
    $('elig').querySelectorAll('[data-e]').forEach(function (b) { b.setAttribute('aria-pressed', String(S.e.indexOf(b.getAttribute('data-e')) >= 0)); });
    var n = (S.s ? 1 : 0) + S.r.length + S.e.length; $('fcnt').hidden = !n; $('fcnt').textContent = n;
  }
  function renderAct() {
    var h = '';
    if (S.dx) { var x = DX.filter(function (y) { return y[0] === S.dx; })[0]; h += '<button type="button" data-un="dx" aria-label="진단 풀기: ' + x[1] + '">진단 · ' + x[1] + '</button>'; }
    else S.e.forEach(function (v) { h += '<button type="button" data-un="e|' + esc(v) + '" aria-label="' + esc(v) + ' 풀기">' + esc(v) + '</button>'; });
    if (S.s) h += '<button type="button" data-un="s" aria-label="대분류 풀기">' + esc(SEC[S.s].name.split('·')[0]) + '</button>';
    S.r.forEach(function (v) { h += '<button type="button" data-un="r|' + esc(v) + '" aria-label="' + esc(v) + ' 풀기">' + esc(v) + '</button>'; });
    $('act').innerHTML = h;
    $('cntL').textContent = (S.s || S.r.length || S.e.length || S.q) ? '곳이 조건에 맞습니다' : '곳 · 전체';
  }
  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function changed() { clearDL(); if (S.p && !hit(BY[S.p])) closeDet(true); writeHash(false); apply(false); }

  d.addEventListener('click', function (e) {
    if (!D) return; var b = e.target.closest('button,a'); if (!b) return;
    if (b.hasAttribute('data-dx')) { var id = b.getAttribute('data-dx'); if (S.dx === id) { S.dx = ''; S.e = []; } else { S.dx = id; S.e = DX.filter(function (x) { return x[0] === id; })[0][3].slice(); } changed(); return; }
    if (b.hasAttribute('data-sec')) { var s = b.getAttribute('data-sec'); S.s = S.s === s ? '' : s; changed(); return; }
    if (b.hasAttribute('data-r')) { toggle(S.r, b.getAttribute('data-r')); changed(); return; }
    if (b.hasAttribute('data-e')) { toggle(S.e, b.getAttribute('data-e')); S.dx = ''; changed(); return; }
    if (b.hasAttribute('data-un')) { var u = b.getAttribute('data-un').split('|'); if (u[0] === 'dx') { S.dx = ''; S.e = []; } else if (u[0] === 's') S.s = ''; else toggle(S[u[0]], u[1]); changed(); return; }
    if (b.hasAttribute('data-clear')) { S.s = ''; S.r = []; S.e = []; S.q = ''; S.dx = ''; $('q').value = ''; changed(); return; }
    if (b.hasAttribute('data-p') && b.classList.contains('card')) { clearDL(); openDet(b.getAttribute('data-p')); return; }
    if (b.hasAttribute('data-close')) { var w = b.getAttribute('data-close'); if (w === 'dSheet') closeDet(); else closeSheet('fSheet'); return; }
    if (b.id === 'fbtn') { openSheet('fSheet'); return; }
  });
  var qT = 0;
  $('q').addEventListener('input', function () { var v = this.value; clearTimeout(qT); qT = setTimeout(function () { S.q = v.trim(); changed(); }, 200); });
  $('rst').addEventListener('click', function () { if (!D) return; closeSheet('fSheet'); clearDL(); S = { s: '', r: [], e: [], q: '', dx: '', p: '' }; $('q').value = ''; closeDet(true); writeHash(false); apply(false); $('scroller').scrollTop = 0; window.scrollTo(0, 0); });
  $('pvT').addEventListener('click', function () { var o = $('pvB').hidden; $('pvB').hidden = !o; this.setAttribute('aria-expanded', String(o)); $('pvL').textContent = o ? '접기' : '펼치기'; });
  window.addEventListener('popstate', function () { if (!D) return; var h = readHash(); var wasP = S.p; S = h; clean(); $('q').value = S.q; apply(false); if (S.p) { openDet(S.p, true, true); revealCard(S.p, true); } else if (wasP) closeDet(true); });

  /* ───── 상세 ───── */
  var VM = { curl: '자동 접속 확인', 'curl-mobile': '모바일 접속 확인', browser: '브라우저로 화면 확인', official: '공식 안내로 확인' };
  function openDet(id, quiet, land) {
    var p = BY[id]; if (!p) return; var pushed = S.p !== id; S.p = id;
    Object.keys(CARDS).forEach(function (k) { CARDS[k].setAttribute('aria-current', String(k === id)); });
    var sec = SEC[p.sector], dt = p.verified_at.split('-');
    var h = '<div class="sh-x"><b>사이트 안내</b><button type="button" data-close="dSheet">닫기</button></div>';
    h += '<span class="sb" style="--c:var(--s-' + p.sector + ')"><i></i>' + esc(sec.name) + '</span><h2>' + esc(p.name) + '</h2><p class="op">운영 · ' + esc(p.operator) + '</p>';
    h += '<h3>무엇이 강한가</h3><p class="tx">' + esc(p.strengths) + '</p>';
    h += '<h3>가서 볼 수 있는 것</h3><div class="tags shw">' + (p.shows || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    h += '<h3>상담 활용 팁</h3><p class="tx">' + esc(p.tips) + '</p>';
    h += '<h3>직무</h3><div class="tags">' + p.roles.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    h += '<h3>대상·근무형태</h3><div class="tags">' + p.eligibility.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    if (p.eligibility.some(function (x) { return ['청년', '중장년', '노인'].indexOf(x) >= 0; })) h += '<p class="note">연령 대상은 그 사업을 운영한다는 뜻이며, 다른 연령의 지원을 막는다는 뜻은 아닙니다.</p>';
    h += '<div class="stampv" aria-label="검증일 ' + esc(p.verified_at) + '"><span>접속 확인</span><b>' + esc(dt[0] + '.' + dt[1] + '.' + dt[2]) + '</b><span>' + esc(VM[p.verify_method] || '') + '</span></div>';
    if (p.verify_method === 'official') h += '<p class="note">' + esc(p.verify_note || '') + ' 국내 접속 기준이며 해외망에서는 차단될 수 있습니다.</p>';
    h += '<a class="go" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">사이트로 가기 <span aria-hidden="true">↗</span><small>새 탭</small></a>';
    $('det').innerHTML = h; $('det').scrollTop = 0;
    if (!quiet) writeHash(pushed);
    /* 딥링크로 도착했을 때는 넓지 않은 화면에서도 상세 시트를 덮지 않는다 —
       카드가 목록 맨 위에 보이는 것이 이 링크의 목적이다. 카드를 누르면 그때 펼친다. */
    if (!xwide.matches && !land) openSheet('dSheet');
  }
  function closeDet(silent) {
    clearDL();
    S.p = ''; Object.keys(CARDS).forEach(function (k) { CARDS[k].setAttribute('aria-current', 'false'); });
    $('det').innerHTML = '<div class="pick"><div><b>카드를 누르면 여기에 펼쳐집니다</b>특징 · 상담 활용 팁 · 검증일 · 사이트로 가기</div></div>';
    closeSheet('dSheet'); if (!silent) writeHash(false);
  }
  /* 시트 */
  var lastFocus = null;
  function openSheet(id) { var w = $(id); if ((id === 'fSheet' && wide.matches) || (id === 'dSheet' && xwide.matches) || w.classList.contains('on')) return; lastFocus = d.activeElement; w.classList.add('on'); d.documentElement.style.overflow = 'hidden'; setTimeout(function () { var x = w.querySelector('.sh-x button'); if (x) x.focus({ preventScroll: true }); }, 40); }
  function closeSheet(id) { var w = $(id); if (!w.classList.contains('on')) return; w.classList.remove('on'); if (!d.querySelector('.sheet.on')) d.documentElement.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
  ['fSheet', 'dSheet'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) { if (id === 'dSheet') closeDet(); else closeSheet(id); } }); });
  d.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; if ($('dSheet').classList.contains('on')) closeDet(); else closeSheet('fSheet'); });
  function onResize() { if (wide.matches) closeSheet('fSheet'); if (xwide.matches && $('dSheet').classList.contains('on')) { $('dSheet').classList.remove('on'); d.documentElement.style.overflow = ''; } }
  if (wide.addEventListener) { wide.addEventListener('change', onResize); xwide.addEventListener('change', onResize); }

  /* 출처·제외 목록 */
  function renderFoot() {
    var v = D.meta.verification || {}, ex = v.excluded || [];
    $('foot').innerHTML = '<p>' + esc(D.meta.notice) + ' ' + esc(D.meta.license) + '</p>' +
      '<details><summary>검증 방법 · 제외한 곳 ' + ex.length + '</summary><p>검증 ' + esc(v.checked_at || '') + ' · ' + esc(v.method || '') + ' · 통과 ' + esc(v.passed || '') + '곳</p><ul>' +
      ex.map(function (x) { return '<li>' + esc(x.name) + ' — ' + esc(x.reason) + '</li>'; }).join('') + '</ul></details>';
  }
})();
