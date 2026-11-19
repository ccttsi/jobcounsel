/* app.js — 마이덱 (2026-11-20)
 *
 * 하는 일
 *   1) 내 덱 목록 — 저장한 덱을 이름·단계·저장 위치와 함께 보여 주고, 순서대로 열기·리허설·이름 바꾸기·삭제.
 *   2) 로그인 상태 — 로그인하면 내 계정(jc_my_decks), 로그아웃이면 이 브라우저. 서버 함수가 아직 없으면
 *      이 기기에만 저장하고 그 사실을 화면에 적는다(오류로 멈추지 않는다).
 *   3) 공간 꾸미기 — 여섯 요소 × 여섯 조건, 테마(밝게·세피아·어둡게)마다 따로 저장. 바꾸는 즉시 덱 공간에 적용.
 *
 * 저장·대비 계산은 assets/mydeck-store.js · assets/mydeck-diy.js 가 맡는다. 이 파일은 화면만 그린다.
 */
(function () {
  'use strict';
  if (window.__jcMyDeck) return;
  window.__jcMyDeck = true;

  var $ = function (id) { return document.getElementById(id); };
  var D = window.JCDeck;
  var THEMES = [['light', '밝게'], ['sepia', '세피아'], ['dark', '어둡게']];
  var decks = [], prefs = {}, edit = 'light', dirty = false, SHEET = '', PICK = null, REH = 0, step = 'bg';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function toast(m) {
    var t = $('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('on'); }, 3400);
  }
  var EMOJI = ['🗂', '🧭', '📎', '🌿', '🔖', '🧩', '📐', '🪄'];

  function pageTheme() {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (t === 'light' && document.documentElement.getAttribute('data-jc-tone') === 'sepia') return 'sepia';
    return t;
  }

  /* ---------- 상태 줄 ---------- */
  function renderWho() {
    var host = $('who');
    clear(host);
    var user = D.user();
    if (user) {
      host.appendChild(el('b', null, user + ' 님의 계정에 저장합니다.'));
      host.appendChild(el('span', null, D.serverOff()
        ? '계정 저장소가 아직 준비되지 않아 지금은 이 기기에만 저장됩니다.'
        : '다른 기기에서 같은 아이디로 로그인해도 이 덱들이 보입니다.'));
      return;
    }
    host.appendChild(el('b', null, '로그인하지 않았습니다 — 지금은 이 기기에만 저장됩니다.'));
    host.appendChild(el('span', null, '로그인하면 덱이 내 계정에 보관되어 다른 기기에서도 이어집니다.'));
    var b = el('button', 'd-b', '로그인');
    b.type = 'button';
    b.setAttribute('data-jc-login', '');
    b.style.marginTop = '6px';
    b.style.maxWidth = '140px';
    b.addEventListener('click', function () { if (window.JCSync && window.JCSync.open) window.JCSync.open(); });
    host.appendChild(b);
  }

  function renderOffMsg() {
    var off = $('offmsg');
    if (D.loggedIn() && D.serverOff()) {
      off.hidden = false;
      clear(off);
      off.appendChild(el('b', null, '계정 저장소가 아직 준비되지 않았습니다. '));
      off.appendChild(document.createTextNode('지금 저장한 덱은 이 브라우저에 남고, 서버 함수(my-decks-proxy)가 배포되면 그때부터 계정에 저장됩니다. 로그인이 풀리지 않았다면 화면을 새로 열어 보세요.'));
    } else {
      off.hidden = true;
    }
  }

  /* ---------- 덱 목록 ---------- */
  function load() {
    renderWho();
    return D.list().then(function (r) {
      decks = r.decks || [];
      renderOffMsg();
      renderWho();
      renderDecks();
    }, function () {
      decks = D.localList();
      renderDecks();
    });
  }

  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2);
  }

  function renderDecks() {
    var host = $('decks');
    clear(host);
    $('spaceN').textContent = decks.length ? decks.length + '개' : '';
    $('empty').hidden = decks.length > 0;
    decks.forEach(function (dk, i) {
      host.appendChild(deckCard(dk, i));
    });
  }

  function deckCard(dk, i) {
    var card = el('article', 'd-card');
    card.setAttribute('data-deck', dk.id);
    var top = el('div', 'd-top');
    top.appendChild(el('span', 'd-no', String(i + 1)));
    top.appendChild(el('span', 'd-name', dk.name));
    top.appendChild(el('span', 'd-emo', EMOJI[i % EMOJI.length]));
    card.appendChild(top);

    var ol = el('ol', 'd-steps');
    dk.steps.forEach(function (st, j) {
      var li = el('li');
      li.appendChild(el('span', 'd-si', String(j + 1)));
      var a = el('a', null, st.title || st.id);
      var tool = null;
      (window.JC_TOOLS || []).forEach(function (t) { if (t.id === st.id) tool = t; });
      a.href = tool ? '../' + String(tool.path || '').replace(/^\.\//, '') : '../flow/';
      li.appendChild(a);
      li.appendChild(el('span', 'd-sb', (st.no || '') + '번'));
      ol.appendChild(li);
    });
    card.appendChild(ol);

    var meta = el('div', 'd-meta');
    meta.appendChild(el('span', null, dk.steps.length + '단계'));
    if (fmt(dk.updated_at || dk.created_at)) meta.appendChild(el('span', null, fmt(dk.updated_at || dk.created_at) + ' 저장'));
    meta.appendChild(el('span', null, dk.where === 'server' ? '내 계정' : '이 기기에만'));
    card.appendChild(meta);

    var act = el('div', 'd-act');
    var b1 = el('button', 'd-b go', '리허설');
    b1.type = 'button';
    b1.addEventListener('click', function () { openRehearsal(dk); });
    var b2 = el('button', 'd-b', '이름 바꾸기');
    b2.type = 'button';
    b2.addEventListener('click', function () { openRename(dk); });
    var b3 = el('button', 'd-b bad', '삭제');
    b3.type = 'button';
    b3.addEventListener('click', function () { askDelete(dk); });
    act.appendChild(b1);
    act.appendChild(b2);
    act.appendChild(b3);
    if (dk.where !== 'server' && D.loggedIn() && !D.serverOff()) {
      var b4 = el('button', 'd-b', '계정으로 옮기기');
      b4.type = 'button';
      b4.addEventListener('click', function () { adopt(dk); });
      act.appendChild(b4);
    }
    card.appendChild(act);
    return card;
  }

  function adopt(dk) {
    D.adopt(dk).then(function () {
      toast('계정으로 옮겼어요.');
      load();
    }, function (e) {
      toast(D.errText(e || {}));
    });
  }

  function askDelete(dk) {
    if (!window.confirm('「' + dk.name + '」 덱을 지울까요? 되돌릴 수 없습니다.')) return;
    D.remove(dk.id).then(function () {
      toast('덱을 지웠어요.');
      load();
    });
  }

  /* ---------- 시트 ---------- */
  function openSheet() {
    $('sheet').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    renderSheet();
    var bd = document.querySelector('.sheet-bd');
    if (bd) setTimeout(function () { bd.focus(); }, 30);
  }
  function closeSheet() {
    $('sheet').hidden = true;
    document.documentElement.style.overflow = '';
    SHEET = ''; PICK = null;
  }
  function renderSheet() {
    var host = $('sheetMain'), ft = $('sheetFt');
    clear(host); clear(ft);
    if (SHEET === 'rename') return renderRename(host, ft);
    if (SHEET === 'rehearsal') return renderRehearsal(host, ft);
  }

  function openRehearsal(dk) { PICK = dk; REH = 0; SHEET = 'rehearsal'; openSheet(); }
  function openRename(dk) { PICK = dk; SHEET = 'rename'; openSheet(); }

  function toolOf(id) {
    var t = null;
    (window.JC_TOOLS || []).forEach(function (x) { if (x.id === id) t = x; });
    return t;
  }

  function renderRehearsal(host, ft) {
    var dk = PICK;
    $('sheetT').textContent = '리허설 — ' + dk.name + ' (' + (REH + 1) + '/' + dk.steps.length + ')';
    var st = dk.steps[REH] || {};
    var tool = toolOf(st.id) || {};
    var box = el('div', 'reh');
    var hd = el('div', 'd-top');
    hd.appendChild(el('span', 'd-si', String(REH + 1)));
    hd.appendChild(el('b', 'd-name', st.title || st.id));
    box.appendChild(hd);
    box.appendChild(el('p', null, tool.desc || ''));
    var mets = el('div', 'mets');
    (tool.meta || []).forEach(function (m) { mets.appendChild(el('span', null, m)); });
    if (mets.childNodes.length) box.appendChild(mets);
    if (REH > 0) {
      var prev = toolOf((dk.steps[REH - 1] || {}).id) || {};
      box.appendChild(el('p', null, '앞 자료 — ' + (prev.title || '') + ' (' + (prev.badge || '') + ')'));
    }
    host.appendChild(box);
    var a = el('a', 'd-b go', '이 자료 열기');
    a.href = tool.path ? '../' + String(tool.path).replace(/^\.\//, '') : '../flow/';
    a.style.display = 'inline-flex';
    a.style.alignItems = 'center';
    host.appendChild(a);

    var prevB = el('button', 'ghost', '이전');
    prevB.type = 'button';
    prevB.disabled = REH === 0;
    prevB.addEventListener('click', function () { if (REH > 0) { REH--; renderSheet(); } });
    var nextB = el('button', 'primary', REH === dk.steps.length - 1 ? '리허설 마치기' : '다음 자료');
    nextB.type = 'button';
    nextB.addEventListener('click', function () {
      if (REH < dk.steps.length - 1) { REH++; renderSheet(); }
      else { toast('리허설을 마쳤어요.'); closeSheet(); }
    });
    ft.appendChild(prevB); ft.appendChild(nextB);
  }

  function renderRename(host, ft) {
    $('sheetT').textContent = '이름 바꾸기';
    var field = el('div', 'field');
    var lab = el('label', null, '덱 이름');
    lab.setAttribute('for', 'nm');
    var inp = document.createElement('input');
    inp.id = 'nm'; inp.type = 'text'; inp.maxLength = 60; inp.value = PICK.name;
    field.appendChild(lab); field.appendChild(inp);
    host.appendChild(field);
    var msg = el('p', 'diy-msg');
    msg.id = 'nmMsg';
    host.appendChild(msg);
    var save = el('button', 'primary', '저장');
    save.type = 'button';
    save.addEventListener('click', function () {
      D.rename(PICK, inp.value).then(function () {
        toast('이름을 바꿨어요.');
        closeSheet();
        load();
      }, function (e) {
        msg.className = 'diy-msg bad';
        msg.textContent = D.errText(e || {}) || '이름을 바꾸지 못했어요.';
      });
    });
    var cancel = el('button', 'ghost', '취소');
    cancel.type = 'button';
    cancel.addEventListener('click', closeSheet);
    ft.appendChild(save); ft.appendChild(cancel);
  }

  /* ---------- 공간 꾸미기 ---------- */
  function ensureTheme(t) {
    if (!prefs[t]) prefs[t] = (window.JCDiy || {}).toSaved ? window.JCDiy.toSaved(window.JCDiy.defaults(t)) : {};
    return prefs[t];
  }
  function applyPreview() {
    if (!window.JCDiy) return;
    var v = window.JCDiy.normalize(edit, ensureTheme(edit));
    window.JCDiy.apply($('space'), v);
    var tag = $('pvTag');
    if (edit !== pageTheme()) {
      tag.hidden = false;
      var label = '미리보기 — ';
      THEMES.forEach(function (x) { if (x[0] === edit) label += x[1]; });
      tag.textContent = label;
    } else {
      tag.hidden = true;
    }
  }

  function setOpt(elmId, optId, hex) {
    var s = ensureTheme(edit);
    if (elmId === 'bg' || elmId === 'ink') {
      if (optId === 'custom') { s[elmId] = 'custom'; s[elmId + '_custom'] = hex || ''; }
      else { s[elmId] = optId; s[elmId + '_custom'] = ''; }
    } else {
      s[elmId] = optId;
    }
    dirty = true;
    applyPreview();
    renderDiy();
  }

  function contrastLine(values) {
    var r = window.JCDiy.contrast(values.bgHex, values.inkHex);
    var ok = r >= 4.5;
    return { text: '바탕·글자 대비 ' + r + ':1 — ' + (ok ? '읽기 좋아요' : '읽기 어려워요 (4.5:1 이상 권장)'), ok: ok };
  }

  function renderTabs() {
    var host = $('diyTabs');
    clear(host);
    THEMES.forEach(function (t) {
      var b = el('button', null, t[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(edit === t[0]));
      b.addEventListener('click', function () {
        edit = t[0];
        applyPreview();
        renderTabs();
        renderDiy();
      });
      host.appendChild(b);
    });
  }

  function renderDiy() {
    if (!window.JCDiy) return;
    var host = $('diyBody');
    clear(host);
    var saved = ensureTheme(edit);
    var vals = window.JCDiy.normalize(edit, saved);
    var line = contrastLine(vals);
    var ct = el('p', 'ct' + (line.ok ? '' : ' bad'), line.text);
    ct.style.margin = '12px 0 0';
    host.appendChild(ct);

    var chips = $('diySteps');
    clear(chips);
    window.JCDiy.elements.forEach(function (g, gi) {
      var c = el('button', null, (gi + 1) + ' ' + g.short);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(step === g.id));
      c.addEventListener('click', function () { step = g.id; renderDiy(); });
      chips.appendChild(c);
    });

    window.JCDiy.elements.forEach(function (g, gi) {
      var box = el('div', 'diy-grp');
      if (step === g.id) box.setAttribute('data-on', '');
      var hd = el('div', 'diy-g-hd');
      hd.appendChild(el('span', 'diy-n', String(gi + 1)));
      hd.appendChild(el('b', null, g.name));
      hd.appendChild(el('span', null, g.kind === 'color' ? '팔레트 6 + 자유 색상표' : '6가지'));
      box.appendChild(hd);
      box.appendChild(el('p', 'diy-note', g.note));

      var opts = el('div', 'opts');
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-label', g.name);
      g.options.forEach(function (o) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(vals[g.id] === o.id));
        if (g.kind === 'color') {
          var i = document.createElement('i');
          i.style.background = o[edit === 'dark' ? 'dark' : 'light'];
          b.appendChild(i);
        }
        var tx = el('span', 'ot');
        tx.appendChild(el('b', null, o.name));
        var sub = g.kind === 'color'
          ? (o[edit === 'dark' ? 'dark' : 'light'])
          : (o.desc || '');
        tx.appendChild(el('span', null, sub));
        b.appendChild(tx);
        b.addEventListener('click', function () { setOpt(g.id, o.id); });
        opts.appendChild(b);
      });
      box.appendChild(opts);

      if (g.kind === 'color') {
        var cur = g.id === 'bg' ? vals.bgHex : vals.inkHex;
        var row = el('div', 'custom');
        var lab = el('label', null, '자유 색상표');
        lab.setAttribute('for', g.id + 'Color');
        row.appendChild(lab);
        var pick = document.createElement('input');
        pick.type = 'color';
        pick.id = g.id + 'Color';
        pick.value = cur;
        pick.setAttribute('aria-label', g.name + ' 직접 고르기');
        var hex = document.createElement('input');
        hex.type = 'text';
        hex.id = g.id + 'Hex';
        hex.value = cur.toUpperCase();
        hex.maxLength = 7;
        hex.setAttribute('aria-label', g.name + ' HEX 값');
        pick.addEventListener('input', function () {
          hex.value = pick.value.toUpperCase();
          setOpt(g.id, 'custom', pick.value.toUpperCase());
        });
        hex.addEventListener('change', function () {
          var v = String(hex.value || '').trim();
          if (!/^#/.test(v)) v = '#' + v;
          if (!window.JCDiy.isHex(v)) { hex.value = cur.toUpperCase(); return; }
          pick.value = v.toUpperCase();
          setOpt(g.id, 'custom', v.toUpperCase());
        });
        row.appendChild(pick); row.appendChild(hex);
        box.appendChild(row);
      }
      host.appendChild(box);
    });
  }

  function savePrefs() {
    var msg = $('diyMsg');
    msg.className = 'diy-msg';
    msg.textContent = '저장하는 중…';
    var list = THEMES.map(function (t) { return t[0]; });
    var chain = Promise.resolve({ source: 'local' });
    var last = 'local';
    list.forEach(function (t) {
      chain = chain.then(function () {
        return D.savePrefs(t, ensureTheme(t)).then(function (r) { last = r.source; return r; });
      });
    });
    chain.then(function () {
      dirty = false;
      msg.textContent = last === 'server' ? '내 계정에 저장했어요.'
        : (D.loggedIn() ? '이 기기에 저장했어요. 계정 저장소(my-decks-proxy)가 배포되면 계정에도 보관됩니다.'
                        : '이 기기에 저장했어요. 로그인하면 계정에도 보관됩니다.');
      toast(msg.textContent);
    }, function () {
      msg.className = 'diy-msg bad';
      msg.textContent = '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    });
  }

  function resetTheme() {
    prefs[edit] = window.JCDiy.toSaved(window.JCDiy.defaults(edit));
    dirty = true;
    applyPreview();
    renderDiy();
    toast('이 테마를 처음 모습으로 되돌렸어요. 「저장」을 눌러야 남습니다.');
  }
  function resetAll() {
    THEMES.forEach(function (t) { prefs[t[0]] = window.JCDiy.toSaved(window.JCDiy.defaults(t[0])); });
    dirty = true;
    applyPreview();
    renderDiy();
    toast('세 테마를 모두 처음 모습으로 되돌렸어요. 「저장」을 눌러야 남습니다.');
  }

  /* ---------- 시작 ---------- */
  function bind() {
    $('diyBtn').addEventListener('click', function () {
      var open = $('diy').hidden;
      $('diy').hidden = !open;
      $('diyBtn').setAttribute('aria-expanded', String(open));
      if (open) {
        $('diyBtn').textContent = '꾸미기 접기';
        var top = $('diy').getBoundingClientRect().top + window.pageYOffset - 12;
        window.scrollTo({ top: top, behavior: 'smooth' });
      } else {
        $('diyBtn').textContent = '공간 꾸미기';
      }
    });
    $('diySave').addEventListener('click', savePrefs);
    $('diyReset').addEventListener('click', resetTheme);
    $('diyAllReset').addEventListener('click', resetAll);
    $('sheetX').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
    window.addEventListener('jc-sync-change', function () { load(); });
    var mo = new MutationObserver(function () { applyPreview(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-jc-tone'] });
    window.addEventListener('storage', function (e) {
      if (e && e.key === 'jc-sync-session') load();
    });
  }

  function boot() {
    if (!D) return;
    THEMES.forEach(function (t) { ensureTheme(t[0]); });
    edit = pageTheme();
    bind();
    applyPreview();
    renderTabs();
    renderDiy();
    D.prefs().then(function (r) {
      var got = r.prefs || {};
      THEMES.forEach(function (t) {
        if (got[t[0]]) prefs[t[0]] = window.JCDiy.toSaved(got[t[0]]);
      });
      applyPreview();
      renderDiy();
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
