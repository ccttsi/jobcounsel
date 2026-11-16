/* 18. 직업·직무 3대 분류 교차 사전 — 화면 코드만(자료는 taxonomy/data/, 피클 담당 · 읽기 전용).
   계약: taxonomy/data/SCHEMA.md. 공식 매핑에 없는 연결은 「공식 매핑 자료 없음」으로 끊고 추정하지 않는다.
   KSA는 능력단위를 열 때만 ksa/index.json → 대분류 샤드를 받는다. 내보내기(저장·인쇄·복사) 기능 없음. */
(function () {
  'use strict';
  var d = document, $ = function (id) { return d.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nz(s) { return String(s || '').toLowerCase().replace(/[·‧ㆍ・\s]/g, ''); }
  function n0(n) { return Number(n).toLocaleString('ko-KR'); }
  var mq = matchMedia('(min-width:900px)');

  var SYS = {
    ncs: { name: 'NCS', kind: '직무', full: '국가직무능력표준', c: 'var(--c-ncs)', levels: ['major', 'middle', 'minor', 'sub'] },
    keco: { name: 'KECO', kind: '직업', full: '한국고용직업분류 2025', c: 'var(--c-keco)', levels: ['major', 'middle', 'minor', 'sub'] },
    ksco: { name: 'KSCO', kind: '직업', full: '한국표준직업분류 제8차', c: 'var(--c-ksco)', levels: ['major', 'middle', 'minor', 'sub', 'detail'] }
  };
  var TABS = [['ncs', 'NCS', '직무'], ['keco', 'KECO', '고용직업'], ['ksco', 'KSCO', '표준직업'], ['job', '직업명', '고용24'], ['src', '출처', '한계']];
  var T = null, LV = {};
  var UI = { tab: 'ncs', path: { ncs: [], keco: [], ksco: [] }, sel: null, q: '', more: 50, jobMore: 100 };
  try { var sv = JSON.parse(localStorage.getItem('jc-taxonomy') || 'null'); if (sv && sv.tab) { UI.tab = sv.tab; if (sv.path) UI.path = sv.path; if (sv.sel) UI.sel = sv.sel; } } catch (e) {}
  function save() { try { localStorage.setItem('jc-taxonomy', JSON.stringify({ tab: UI.tab, path: UI.path, sel: UI.sel })); } catch (e) {} }

  /* ───── 자료 ───── */
  fetch('./data/taxonomy.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    T = j; LV = j.meta.level_keys;
    var N = T.N = { ncs: {}, keco: {}, ksco: {} }, K = T.K = { ncs: {}, keco: {}, ksco: {} };
    ['ncs', 'keco', 'ksco'].forEach(function (s) {
      SYS[s].levels.forEach(function (l) {
        j[s].levels[l].forEach(function (x) { x.sys = s; x.lv = l; x._n = nz(x.name); N[s][x.code] = x; var p = x.parent || ''; (K[s][p] = K[s][p] || []).push(x); });
      });
    });
    (j.ncs.legacy || []).forEach(function (x) { if (N.ncs[x.code]) return; var o = { code: x.code, name: x.name, parent: x.parent, sys: 'ncs', lv: x.level, legacy: true, _n: nz(x.name) }; N.ncs[x.code] = o; (K.ncs[o.parent || ''] = K.ncs[o.parent || ''] || []).push(o); });
    T.U = {}; T.UC = {};
    j.ncs.units.forEach(function (u) { T.UC[u.code] = u; u.subs.forEach(function (s) { (T.U[s] = T.U[s] || []).push(u); }); });
    T.NK = {}; T.KN = {}; T.KK = {}; T.SK = {}; T.TR = {}; T.JK = {}; T.JS = {}; T.J = {};
    j.mappings.ncs_keco.forEach(function (m) { push(T.NK, m.ncs_code, m.keco_code); push(T.KN, m.keco_code, m.ncs_code); });
    j.mappings.keco_ksco.forEach(function (m) { T.KK[m.keco_code] = m.ksco_code; push(T.SK, m.ksco_code, m.keco_code); });
    j.mappings.ncs_training.forEach(function (m) { push(T.TR, m.ncs_code, m.training_name); });
    j.jobs.forEach(function (x) { x._n = nz(x.name); T.J[x.konet] = x; push(T.JK, x.keco_code, x.konet); if (x.ksco_code) push(T.JS, x.ksco_code, x.konet); });
    T.JOBS = j.jobs.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    renderTabs(); render();
  }).catch(function () { $('list').innerHTML = '<p class="empty">분류 자료를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>'; });
  function push(o, k, v) { var a = o[k] = o[k] || []; if (a.indexOf(v) < 0) a.push(v); }

  function node(s, c) { return T.N[s][c] || null; }
  function lvName(x) { var k = LV[x.sys] || {}; return k[x.lv] || ''; }
  function pathOf(x) { var out = []; while (x) { out.unshift(x); x = x.parent ? node(x.sys, x.parent) : null; } return out; }
  function kids(s, c) { return T.K[s][c || ''] || []; }
  function badge(s) { if (s === 'job') return '<span class="bd" style="--c:var(--c-job)">직업 · 고용24</span>'; return '<span class="bd" style="--c:' + SYS[s].c + '">' + SYS[s].name + ' · ' + SYS[s].kind + '</span>'; }

  /* ───── 탭 ───── */
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) { var c = SYS[t[0]] ? SYS[t[0]].c : 'var(--c-job)'; return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0] && !UI.q) + '" style="--c:' + c + '">' + t[1] + '<small>' + t[2] + '</small></button>'; }).join('');
  }
  function setTab(t) { UI.tab = t; UI.q = ''; $('q').value = ''; $('qx').hidden = true; UI.more = 50; UI.jobMore = 100; save(); renderTabs(); render(); }
  d.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b && T) setTab(b.getAttribute('data-tab')); });

  /* ───── 목록 ───── */
  function render() {
    var src = UI.tab === 'src' && !UI.q;
    $('split').hidden = src; $('src').hidden = !src; $('foot').hidden = src;
    if (src) { renderSrc(); return; }
    if (UI.q) renderSearch(); else if (UI.tab === 'job') renderJobs(); else renderTree();
    if (UI.sel) renderDet(UI.sel, true); else $('det').innerHTML = pickHtml();
  }
  function pickHtml() { return '<div class="det-x"><button type="button" data-close>닫기</button></div><div class="pick"><div><b>항목을 고르면 여기에 연결이 보입니다</b>세 분류 사이의 공식 연결, 능력단위, KSA(지식·기술·태도)</div></div>'; }
  function rowHtml(x, opt) {
    opt = opt || {};
    var n = x.sys ? kids(x.sys, x.code).length : 0, cur = UI.sel && UI.sel.s === x.sys && UI.sel.c === x.code;
    var meta = n ? n0(n) : (x.sys === 'ncs' && x.lv === 'sub' ? '능력단위 ' + (T.U[x.code] || []).length : '');
    return '<button type="button" class="row" data-s="' + x.sys + '" data-c="' + esc(x.code) + '"' + (cur ? ' aria-current="true"' : '') + '><span class="cd">' + esc(x.code) + '</span><span class="nm">' + esc(x.name) + (opt.sub ? '<small>' + opt.sub + '</small>' : '') + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + (opt.badge ? badge(x.sys) : '') + '<span class="ct">' + meta + '</span>' + (n ? '<span class="ar" aria-hidden="true">›</span>' : '') + '</button>';
  }
  function renderTree() {
    var s = UI.tab, p = UI.path[s] || [], par = p.length ? node(s, p[p.length - 1]) : null;
    if (p.length && !par) { UI.path[s] = []; p = []; }
    var h = '<button type="button" data-crumb="-1">' + SYS[s].name + ' 전체</button>';
    p.forEach(function (c, i) { var x = node(s, c); if (x) h += '<span class="sep" aria-hidden="true">›</span><button type="button" data-crumb="' + i + '">' + esc(x.name) + '</button>'; });
    h = '<div class="cr-s">' + h + '</div>';
    if (par) h += '<button type="button" class="more" data-open="' + s + '|' + esc(par.code) + '">자세히</button>';
    $('crumb').innerHTML = h; var cs = $('crumb').firstChild; cs.scrollLeft = cs.scrollWidth;
    var list = kids(s, par ? par.code : '');
    var lvl = list[0] ? lvName(list[0]) : '';
    $('lh').innerHTML = '<b>' + (par ? esc(par.name) : SYS[s].full) + '</b><span>' + (lvl ? lvl + ' ' : '') + n0(list.length) + '개</span>' + (s === 'ncs' ? '<span>· 직무 기준</span>' : '<span>· 직업 기준</span>');
    $('list').innerHTML = list.length ? list.map(function (x) { return rowHtml(x); }).join('') : '<p class="empty">아래 단계가 없습니다.</p>';
    $('list').scrollTop = 0;
  }
  function renderJobs() {
    $('crumb').innerHTML = '<div class="cr-s"><button type="button">고용24 직업 전체</button></div>';
    $('lh').innerHTML = '<b>직업명 가나다순</b><span>' + n0(T.JOBS.length) + '개 · 직업 기준</span>';
    var a = T.JOBS.slice(0, UI.jobMore);
    $('list').innerHTML = a.map(jobRow).join('') + (UI.jobMore < T.JOBS.length ? '<button type="button" class="morebtn" data-jmore>100개 더 보기</button>' : '');
  }
  function jobRow(x) { var cur = UI.sel && UI.sel.s === 'job' && UI.sel.c === x.konet; return '<button type="button" class="row" data-s="job" data-c="' + x.konet + '"' + (cur ? ' aria-current="true"' : '') + '><span class="nm">' + esc(x.name) + '<small>' + esc((node('keco', x.keco_code) || {}).name || '') + '</small></span>' + (UI.q ? badge('job') : '') + '</button>'; }

  /* ───── 검색 ───── */
  var qT = 0;
  $('q').addEventListener('input', function () { $('qx').hidden = !this.value; clearTimeout(qT); var v = this.value; qT = setTimeout(function () { UI.q = v.trim(); UI.more = 50; if (T) { renderTabs(); render(); } }, 200); });
  $('qx').addEventListener('click', function () { $('q').value = ''; this.hidden = true; UI.q = ''; if (T) { renderTabs(); render(); } $('q').focus(); });
  function renderSearch() {
    var q = nz(UI.q), raw = UI.q.trim(), hits = [];
    ['ncs', 'keco', 'ksco'].forEach(function (s) { for (var c in T.N[s]) { var x = T.N[s][c]; if (x._n.indexOf(q) >= 0 || c.indexOf(raw) === 0) hits.push(x); } });
    T.jobs.forEach(function (x) { if (x._n.indexOf(q) >= 0) hits.push(x); });
    hits.sort(function (a, b) { var an = a._n === q ? 0 : a._n.indexOf(q) === 0 ? 1 : 2, bn = b._n === q ? 0 : b._n.indexOf(q) === 0 ? 1 : 2; return an - bn; });
    $('crumb').innerHTML = '<div class="cr-s"><button type="button">검색 · 「' + esc(raw) + '」</button></div>';
    $('lh').innerHTML = '<b>' + n0(hits.length) + '건</b><span>세 분류와 직업을 함께 찾았습니다</span>';
    if (!hits.length) { $('list').innerHTML = '<p class="empty">맞는 항목이 없습니다. 더 짧게 적거나 코드 앞자리로 찾아 보세요.</p>'; return; }
    $('list').innerHTML = hits.slice(0, UI.more).map(function (x) { if (x.konet) return jobRow(x); var p = pathOf(x); return rowHtml(x, { badge: true, sub: lvName(x) + (p.length > 1 ? ' · ' + esc(p[p.length - 2].name) : '') }); }).join('') + (hits.length > UI.more ? '<button type="button" class="morebtn" data-more>' + n0(Math.min(50, hits.length - UI.more)) + '건 더 보기</button>' : '');
  }

  /* ───── 목록 누르기 ───── */
  $('split').addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-crumb]'))) { var i = +b.getAttribute('data-crumb'); UI.path[UI.tab] = UI.path[UI.tab].slice(0, i + 1); save(); renderTree(); return; }
    if ((b = e.target.closest('[data-more]'))) { UI.more += 50; var st = $('list').scrollTop; renderSearch(); $('list').scrollTop = st; return; }
    if ((b = e.target.closest('[data-jmore]'))) { UI.jobMore += 100; var st2 = $('list').scrollTop; renderJobs(); $('list').scrollTop = st2; return; }
    if ((b = e.target.closest('[data-open]'))) { var p = b.getAttribute('data-open').split('|'); select(p[0], p[1]); return; }
    if ((b = e.target.closest('[data-close]'))) { closeSheet(); return; }
    if ((b = e.target.closest('.row[data-s]'))) {
      var s = b.getAttribute('data-s'), c = b.getAttribute('data-c');
      if (s !== 'job' && !UI.q && kids(s, c).length) { UI.path[s] = pathOf(node(s, c)).map(function (x) { return x.code; }); save(); renderTree(); if (mq.matches) select(s, c); return; }
      if (UI.q && s !== 'job') { UI.tab = s; UI.path[s] = pathOf(node(s, c)).slice(0, -1).map(function (x) { return x.code; }); }
      select(s, c);
      $('list').querySelectorAll('.row[aria-current]').forEach(function (x) { x.removeAttribute('aria-current'); }); b.setAttribute('aria-current', 'true');
      return;
    }
    if ((b = e.target.closest('[data-go]'))) { var g = b.getAttribute('data-go').split('|'); goTo(g[0], g[1]); return; }
    if ((b = e.target.closest('[data-unit]'))) { openUnit(b.getAttribute('data-unit')); return; }
    if ((b = e.target.closest('[data-back]'))) { var k = b.getAttribute('data-back').split('|'); renderDet({ s: k[0], c: k[1] }); return; }
    if ((b = e.target.closest('[data-jl]'))) { var jl = b.parentNode; jl.querySelectorAll('[hidden]').forEach(function (x) { x.hidden = false; }); b.remove(); return; }
  });
  function goTo(s, c) {
    if (s === 'job') { select('job', c); return; }
    var x = node(s, c); if (!x) return;
    UI.q = ''; $('q').value = ''; $('qx').hidden = true; UI.tab = s;
    var p = pathOf(x).map(function (y) { return y.code; }); UI.path[s] = kids(s, c).length ? p : p.slice(0, -1);
    save(); renderTabs(); renderTree(); select(s, c);
  }
  function select(s, c) { UI.sel = { s: s, c: c }; save(); renderDet(UI.sel); openSheet(); }

  /* ───── 상세 ───── */
  var X = '<div class="det-x"><button type="button" data-close>닫기</button></div>';
  function lk(s, c, extra) { var x = s === 'job' ? T.J[c] : node(s, c); if (!x) return ''; return '<button type="button" data-go="' + s + '|' + esc(c) + '">' + (s === 'job' ? '' : '<span class="cd">' + esc(c) + '</span>') + '<span class="nm">' + esc(x.name) + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + (extra ? '<span class="ct">' + extra + '</span>' : '') + '</button>'; }
  var NONE = '<span class="none">공식 매핑 자료 없음</span>';
  function renderDet(sel, quiet) {
    var h = X, s = sel.s, c = sel.c;
    if (s === 'job') { h += jobDet(T.J[c]); }
    else {
      var x = node(s, c); if (!x) { $('det').innerHTML = pickHtml(); return; }
      var p = pathOf(x);
      h += '<div class="tags">' + badge(s) + '<span class="bd" style="--c:var(--dim)">' + lvName(x) + '</span>' + (x.legacy ? '<span class="bd lg">현행 고시에 없음</span>' : '') + '</div>';
      h += '<h2>' + esc(x.name) + '</h2><p class="path num">' + esc(c) + (p.length > 1 ? ' · ' + p.slice(0, -1).map(function (y) { return esc(y.name); }).join(' › ') : '') + '</p>';
      if (s === 'ncs') h += ncsDet(x); else if (s === 'keco') h += kecoDet(x); else h += kscoDet(x);
      var ks = kids(s, c); if (ks.length) h += '<h3>아래 ' + lvName(ks[0]) + ' <small>' + n0(ks.length) + '개 · 왼쪽 목록에서 고릅니다</small></h3>';
    }
    if (s !== 'job' && T.meta.corrections) T.meta.corrections.forEach(function (k) { if (k.code === c && s === 'keco') h += '<p class="path">원자료 오기 정정: 「' + esc(k.asis) + '」 → 「' + esc(k.tobe) + '」</p>'; });
    $('det').innerHTML = h; if (!quiet) $('det').scrollTop = 0;
  }
  function ncsDet(x) {
    var h = '', minor = x.code.length >= 6 ? x.code.slice(0, 6) : null;
    if (minor) {
      var ke = T.NK[minor] || [];
      h += '<h3>이어지는 직업(KECO 세분류) <small>공식 연결은 NCS 소분류 기준' + (x.code.length > 6 ? ' · 「' + esc((node('ncs', minor) || {}).name || minor) + '」' : '') + '</small></h3>';
      h += ke.length ? '<div class="lk">' + ke.map(function (k) { return lk('keco', k, (T.JK[k] || []).length ? '직업 ' + (T.JK[k] || []).length : ''); }).join('') + '</div>' : NONE;
      var tr = (T.TR[x.code] || []).concat(x.code.length > 6 ? [] : []).filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (tr.length) h += '<h3>국가기간·전략산업직종 <small>공식 연결 훈련직종</small></h3><div class="chips">' + tr.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    if (x.lv === 'sub' || x.code.length === 8) {
      var u = T.U[x.code] || [];
      h += '<h3>능력단위 <small>' + u.length + '개 · 누르면 KSA(지식·기술·태도)</small></h3>';
      h += u.length ? '<div class="units">' + u.map(unitRow).join('') + '</div>' : '<p class="path">연결된 능력단위 자료가 없습니다.</p>';
    }
    return h;
  }
  function unitRow(u) { return '<button type="button" class="unit" data-unit="' + esc(u.code) + '"><span class="nm">' + esc(u.name) + (u.sub_link === 'code' ? '<span class="cdlk" title="고시 별표에 없어 분류번호로 이은 연결">번호 연결</span>' : '') + '</span><span class="mt">수준 ' + (u.level == null ? '—' : u.level) + '<br>' + (u.hours == null ? '—' : u.hours + '시간') + '</span></button>'; }
  function kecoDet(x) {
    if (x.lv !== 'sub') return '';
    var h = '<h3>표준직업분류(KSCO) <small>세분류 1:1 공식 연결</small></h3>';
    var ks = T.KK[x.code]; h += ks ? '<div class="lk">' + lk('ksco', ks) + '</div>' : NONE;
    var nm = T.KN[x.code] || [];
    h += '<h3>필요한 직무(NCS 소분류) <small>공식 연결</small></h3>' + (nm.length ? '<div class="lk">' + nm.map(function (c) { return lk('ncs', c); }).join('') + '</div>' : NONE);
    return h + jobsBlock(T.JK[x.code] || []);
  }
  function kscoDet(x) {
    var sub = x.lv === 'detail' ? x.parent : x.lv === 'sub' ? x.code : null; if (!sub) return '';
    var h = '<h3>역추적 <small>KSCO → KECO → NCS → 능력단위</small></h3><ol class="chain">';
    h += '<li style="--c:var(--c-ksco)"><p class="st">KSCO 세분류</p><div class="lk">' + lk('ksco', sub) + '</div></li>';
    var ke = T.SK[sub] || [];
    if (!ke.length) { h += '<li class="cut"><p class="st" style="color:var(--warn)">KECO 세분류</p>' + NONE + '</li></ol>'; return h + jobsBlock(T.JS[sub] || []); }
    h += '<li style="--c:var(--c-keco)"><p class="st">KECO 세분류</p><div class="lk">' + ke.map(function (k) { return lk('keco', k); }).join('') + '</div></li>';
    var nm = []; ke.forEach(function (k) { (T.KN[k] || []).forEach(function (m) { if (nm.indexOf(m) < 0) nm.push(m); }); });
    if (!nm.length) { h += '<li class="cut"><p class="st" style="color:var(--warn)">NCS 소분류</p>' + NONE + '</li></ol>'; return h + jobsBlock(T.JS[sub] || []); }
    h += '<li style="--c:var(--c-ncs)"><p class="st">NCS 소분류</p><div class="lk">' + nm.map(function (m) { return lk('ncs', m); }).join('') + '</div></li>';
    var subs = []; nm.forEach(function (m) { kids('ncs', m).forEach(function (y) { subs.push(y); }); });
    h += '<li style="--c:var(--c-ncs)"><p class="st">NCS 세분류 → 능력단위</p><div class="lk">' + subs.map(function (y) { return lk('ncs', y.code, '능력단위 ' + (T.U[y.code] || []).length); }).join('') + '</div></li></ol>';
    return h + jobsBlock(T.JS[sub] || []);
  }
  function jobsBlock(ids) {
    if (!ids.length) return '<h3>이 분류의 직업 <small>고용24</small></h3><p class="path">연결된 직업이 없습니다.</p>';
    return '<h3>이 분류의 직업 <small>고용24 ' + n0(ids.length) + '개</small></h3><div class="lk">' + ids.map(function (k, i) { return (i >= 12 ? lk('job', k).replace('<button ', '<button hidden ') : lk('job', k)); }).join('') + (ids.length > 12 ? '<button type="button" class="morebtn" data-jl>' + n0(ids.length - 12) + '개 더 보기</button>' : '') + '</div>';
  }
  function jobDet(x) {
    if (!x) return pickHtml();
    var h = '<div class="tags">' + badge('job') + '</div><h2>' + esc(x.name) + '</h2><p class="path num">고용24 직업코드 ' + esc(x.konet) + '</p>';
    var nm = T.KN[x.keco_code] || [];
    h += '<h3>세 분류에서 이 직업은 <small>공식 매핑만</small></h3><div class="jc">';
    h += '<div class="r" style="--c:var(--c-ncs)"><b>NCS 직무</b><div class="v">' + (nm.length ? '<div class="lk">' + nm.map(function (m) { return lk('ncs', m); }).join('') + '</div>' : NONE) + '</div></div>';
    h += '<div class="r" style="--c:var(--c-keco)"><b>KECO</b><div class="v"><div class="lk">' + lk('keco', x.keco_code) + '</div></div></div>';
    h += '<div class="r" style="--c:var(--c-ksco)"><b>KSCO</b><div class="v">' + (x.ksco_code && node('ksco', x.ksco_code) ? '<div class="lk">' + lk('ksco', x.ksco_code) + '</div>' : NONE) + '</div></div></div>';
    return h;
  }

  /* ───── 능력단위 · KSA ───── */
  var KI = null, KS = {};
  function openUnit(code) {
    var u = T.UC[code]; if (!u) return; var back = UI.sel;
    var head = X + '<button type="button" class="back" data-back="' + back.s + '|' + esc(back.c) + '">‹ ' + esc((back.s === 'job' ? T.J[back.c] : node(back.s, back.c) || {}).name || '') + '</button>' +
      '<div class="tags">' + badge('ncs') + '<span class="bd" style="--c:var(--dim)">능력단위</span>' + (u.in_notice ? '' : '<span class="bd lg">고시 별표 밖</span>') + (u.sub_link === 'code' ? '<span class="bd lg">분류번호로 이은 연결</span>' : '') + '</div>' +
      '<h2>' + esc(u.name) + '</h2><p class="path num">' + esc(u.code) + ' · 수준 ' + (u.level == null ? '—' : u.level) + ' · 표준 훈련시간 ' + (u.hours == null ? '—' : u.hours + '시간') + '</p><h3>KSA <small>지식 · 기술 · 태도 — 원문 그대로</small></h3>';
    $('det').innerHTML = head + '<p class="loading">KSA를 불러오고 있습니다…</p>'; $('det').scrollTop = 0;
    var mj = u.code10.slice(0, 2);
    (KI ? Promise.resolve(KI) : fetch('./data/ksa/index.json', { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { KI = j; return j; }))
      .then(function (ix) { var sh = null; ix.shards.forEach(function (x) { if (x.major === mj) sh = x; }); if (!sh) return null; return KS[mj] || fetch('./data/ksa/' + sh.file.split('/').pop(), { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { KS[mj] = j; return j; }); })
      .then(function (sd) {
        if (!$('det').querySelector('[data-back]')) return;
        var rec = sd && sd.units && sd.units[u.code], h = head;
        if (!rec || !rec.e || !rec.e.length) h += '<span class="none">KSA 원천 자료 없음</span>';
        else h += '<div class="ksa">' + rec.e.map(function (el, i) {
          return '<details class="el"' + (i === 0 ? ' open' : '') + '><summary>' + esc(el.f) + '</summary><div class="kb">' + [['k', '지식', 'var(--c-ncs)'], ['s', '기술', 'var(--c-keco)'], ['a', '태도', 'var(--c-ksco)']].map(function (z) {
            var a = el[z[0]] || []; return '<div style="--c:' + z[2] + '"><h4>' + z[1] + '</h4>' + (a.length ? '<ul>' + a.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="nil">원천에 없음</p>') + '</div>';
          }).join('') + '</div></details>';
        }).join('') + '</div>';
        h += '<p class="path" style="margin-top:12px">출처 · 한국산업인력공단 국가직무능력표준 정보_GW(공공데이터포털 15157547, 이용허락범위 제한 없음)</p>';
        $('det').innerHTML = h;
      }).catch(function () { if ($('det').querySelector('[data-back]')) $('det').innerHTML = head + '<p class="empty">KSA 자료를 불러오지 못했습니다.</p>'; });
  }
  $('det').addEventListener('click', function (e) { var b; if ((b = e.target.closest('[data-close]'))) { closeSheet(); e.stopPropagation(); } });

  /* ───── 휴대폰 시트 ───── */
  var last = null;
  function openSheet() { if (mq.matches) return; var w = $('detWrap'); if (w.classList.contains('on')) return; last = d.activeElement; w.classList.add('on'); d.documentElement.style.overflow = 'hidden'; setTimeout(function () { $('det').focus({ preventScroll: true }); }, 30); }
  function closeSheet() { var w = $('detWrap'); if (!w.classList.contains('on')) return; w.classList.remove('on'); d.documentElement.style.overflow = ''; if (last && last.focus) last.focus({ preventScroll: true }); }
  $('detWrap').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  mq.addEventListener ? mq.addEventListener('change', function () { closeSheet(); }) : null;

  /* ───── 출처·한계 ───── */
  function renderSrc() {
    var h = '<section class="pane"><h2>출처 · 라이선스</h2><ul class="sl">' + T.sources.map(function (s) { return '<li><b>' + esc(s.name) + '</b><span>' + esc(s.publisher) + ' · <span class="lc">' + esc(s.license) + '</span> · 기준 ' + esc(s.base_date) + '</span><span>쓰임: ' + esc(s.used_for) + '</span>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">원자료 안내 ↗</a>' : '') + '</li>'; }).join('');
    h += '</ul></section><section class="pane"><h2>알려진 한계</h2><ol class="lim">';
    var c = T.meta.counts, v = T.meta.coverage;
    [
      'NCS ↔ KECO 공식 매핑은 NCS 소분류 단위로만 있고, KECO 세분류 ' + n0(c.keco.sub) + '개 가운데 ' + n0(Object.keys(T.KN).length) + '개만 덮습니다. 없는 연결은 「자료 없음」이지 「관계 없음」이 아닙니다.',
      'KECO 세분류 ' + n0(c.keco.sub - v.keco_sub_with_ksco) + '개는 KSCO 연결이 없고, 고용24 직업 ' + n0(v.jobs_total - v.jobs_with_ksco) + '개는 KSCO가 비어 있습니다.',
      '능력단위 일부는 고시 별표에 없어 분류번호로 이었습니다(「번호 연결」 표시).',
      'NCS ' + n0(v.ncs_legacy_codes) + '개 코드는 현행 고시에 없습니다(「현행 고시에 없음」 표시, 건수에 합산하지 않음).',
      'KSA는 능력단위요소별 원문 목록이며, 원천에 없는 능력단위는 「KSA 원천 자료 없음」으로 둡니다.',
      'KECO 2025는 2018년판과 코드 번호가 다릅니다. 예전 자료와 코드로 섞지 마세요.'
    ].forEach(function (t) { h += '<li>' + t + '</li>'; });
    h += '</ol>' + (T.meta.corrections || []).map(function (k) { return '<p class="foot">원자료 오기 정정 · KECO ' + esc(k.code) + ' 「' + esc(k.asis) + '」 → 「' + esc(k.tobe) + '」</p>'; }).join('');
    h += '<p class="foot">' + esc(T.meta.notice) + ' 워크넷 직업사전·한국직업전망 등 재가공이 허용되지 않는 자료는 쓰지 않았습니다.</p></section>';
    $('src').innerHTML = h;
  }
})();
