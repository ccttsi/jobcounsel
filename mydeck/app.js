/* app.js — 마이덱 (2026-11-20)
 *
 * 하는 일
 *   1) 내 덱 목록 — 저장한 덱을 이름·단계·저장 위치와 함께 보여 주고, 순서대로 열기·리허설·이름 바꾸기·삭제.
 *   2) 로그인 상태 — 로그인하면 내 계정(jc_my_decks), 로그인하지 않으면 **이 창(sessionStorage)**.
 *      비로그인 상태의 덱·꾸미기 설정은 창을 닫으면 초기화된다(store.js가 그릇을 바꿔 준다).
 *   3) 공간 꾸미기 — 여섯 요소 × 여섯 조건, 테마(밝게·세피아·어둡게)마다 따로 저장. 바꾸는 즉시 덱 공간에 적용.
 *   4) 리허설 — 덱의 단계를 한 줄 레일로 늘어놓고, 눌러서 어느 단계로든 건너뛰며 본다(deck-nav.js).
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
  var decks = [], prefs = {}, edit = 'light', dirty = false, SHEET = '', PICK = null, REH = 0, step = 'bg', ABOUT = 'algo';

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
    clearTimeout(toast.t);
    /* 빈 말로 지울 때는 알약을 띄우지 않는다 — 내용 없는 점만 남지 않게 */
    if (!String(m == null ? '' : m).trim()) {
      t.textContent = '';
      t.classList.remove('on');
      return;
    }
    t.textContent = m;
    t.classList.add('on');
    toast.t = setTimeout(function () { t.classList.remove('on'); }, 3600);
  }
  var EMOJI = ['🗂', '🧭', '📎', '🌿', '🔖', '🧩', '📐', '🪄'];

  function pageTheme() {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (t === 'light' && document.documentElement.getAttribute('data-jc-tone') === 'sepia') return 'sepia';
    return t;
  }

  /* ---------- 상태 줄 (계정 정보) ---------- */
  function renderWho() {
    var host = $('who');
    if (!host) return;
    clear(host);
    var user = D.user();
    if (user) {
      host.appendChild(el('b', null, user + ' 님의 계정에 저장합니다.'));
      host.appendChild(el('span', null, D.serverOff()
        ? '계정 저장소가 아직 준비되지 않아 지금은 이 창에만 저장됩니다.'
        : '다른 기기에서 같은 아이디로 로그인해도 이 덱들이 보입니다.'));
    } else {
      host.appendChild(el('b', null, '로그인하지 않았습니다 — 이 창에만 저장합니다.'));
      host.appendChild(el('span', null, '비로그인 상태에서는 창을 닫으면 초기화되며, 로그인하면 계정에 영구 저장됩니다.'));
    }
    var acts = el('div', 'who-acts');
    if (!user) {
      var b = el('button', 'ghost sm', '로그인');
      b.type = 'button';
      b.setAttribute('data-jc-login', '');
      b.addEventListener('click', function () { if (window.JCSync && window.JCSync.open) window.JCSync.open(); });
      acts.appendChild(b);
    }
    var info = el('button', 'linkbtn', '설명');
    info.type = 'button';
    info.setAttribute('aria-haspopup', 'dialog');
    info.setAttribute('aria-label', '마이덱과 마이덱 라이브 설명');
    info.addEventListener('click', function () { PICK = null; SHEET = 'about'; openSheet(); });
    acts.appendChild(info);
    host.appendChild(acts);
  }

  function renderOffMsg() {
    var off = $('offmsg');
    if (!off) return;
    if (D.loggedIn() && D.serverOff()) {
      off.hidden = false;
      clear(off);
      off.appendChild(el('b', null, '계정 저장소가 아직 준비되지 않았습니다. '));
      off.appendChild(document.createTextNode('지금 저장한 덱은 이 창에 남고, 서버 함수(my-decks-proxy)가 배포되면 그때부터 계정에 저장됩니다. 로그인이 풀리지 않았다면 화면을 새로 열어 보세요.'));
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
    decks.forEach(function (dk, i) { host.appendChild(deckCard(dk, i)); });
  }

  function toolOf(id) {
    var t = null;
    (window.JC_TOOLS || []).forEach(function (x) { if (x.id === id) t = x; });
    return t;
  }

  function markDeck(deck, index) {
    if (window.JCDeckNav) window.JCDeckNav.context(deck, index);
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
      var tool = toolOf(st.id);
      var a = el('a', null, st.title || st.id);
      a.href = tool ? '../' + String(tool.path || '').replace(/^\.\//, '') : '../flow/';
      a.addEventListener('click', function () { markDeck(dk, j); });
      li.appendChild(a);
      if (st.badge) li.appendChild(el('span', 'd-sb', st.badge));
      ol.appendChild(li);
    });
    card.appendChild(ol);

    var meta = el('div', 'd-meta');
    meta.appendChild(el('span', null, dk.steps.length + '단계'));
    if (fmt(dk.updated_at || dk.created_at)) meta.appendChild(el('span', null, fmt(dk.updated_at || dk.created_at) + ' 저장'));
    meta.appendChild(el('span', null, dk.where === 'server' ? '내 계정' : '이 창에만'));
    card.appendChild(meta);

    var act = el('div', 'd-act');
    var b1 = el('button', 'd-b go', '리허설');
    b1.type = 'button';
    b1.addEventListener('click', function () { openRehearsal(dk); });
    act.appendChild(b1);

    /* 마이덱 라이브 — 로그인한 사람에게만 */
    if (D.loggedIn()) {
      var b0 = el('button', 'd-b live', '라이브 실행');
      b0.type = 'button';
      b0.setAttribute('aria-label', dk.name + ' 덱으로 실전 상담 OS 만들기');
      b0.addEventListener('click', function () {
        if (window.JCDeckLive) window.JCDeckLive.open(dk.id, dk);
        else toast('라이브 화면을 불러오지 못했어요. 화면을 새로 열어 주세요.');
      });
      act.appendChild(b0);
    }

    var b2 = el('button', 'd-b', '이름 바꾸기');
    b2.type = 'button';
    b2.addEventListener('click', function () { openRename(dk); });
    var b3 = el('button', 'd-b bad', '삭제');
    b3.type = 'button';
    b3.addEventListener('click', function () { askDelete(dk); });
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
    if (SHEET === 'about') return renderAbout(host, ft);
  }

  function openRehearsal(dk) { PICK = dk; REH = 0; SHEET = 'rehearsal'; openSheet(); }
  function openRename(dk) { PICK = dk; SHEET = 'rename'; openSheet(); }

  function renderRehearsal(host, ft) {
    var dk = PICK;
    $('sheetT').textContent = '리허설 — ' + dk.name;

    /* 단계 이동 — 한 줄 레일에서 어느 단계로든 건너뛴다 */
    if (window.JCDeckNav) {
      host.appendChild(window.JCDeckNav.make(dk, REH, function (i) { REH = i; renderSheet(); }, true));
    }

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
      box.appendChild(el('p', null, '앞 자료 — ' + (prev.title || '')));
    }
    host.appendChild(box);

    var a = el('a', 'd-b go', '이 자료 열기');
    a.href = tool.path ? '../' + String(tool.path).replace(/^\.\//, '') : '../flow/';
    a.style.display = 'inline-flex';
    a.style.alignItems = 'center';
    a.style.justifySelf = 'start';
    a.addEventListener('click', function () { markDeck(dk, REH); });
    host.appendChild(a);

    var prevB = el('button', 'ghost', '‹ 이전');
    prevB.type = 'button';
    prevB.disabled = REH === 0;
    prevB.addEventListener('click', function () { if (REH > 0) { REH--; renderSheet(); } });
    var nextB = el('button', 'primary', REH === dk.steps.length - 1 ? '리허설 마치기' : '다음 ›');
    nextB.type = 'button';
    nextB.addEventListener('click', function () {
      if (REH < dk.steps.length - 1) { REH++; renderSheet(); }
      else { toast('리허설을 마쳤어요.'); closeSheet(); }
    });
    ft.appendChild(prevB); ft.appendChild(nextB);
  }

  /* 설명 — 「마이덱 알고리즘」과 「마이덱 라이브」를 꼭지로 나눠 본다(flow/의 설명과 같은 구성) */
  function renderAbout(host, ft) {
    $('sheetT').textContent = '마이덱 설명';
    var pick = el('div', 'lv-pick ab-tabs');
    pick.setAttribute('role', 'tablist');
    pick.setAttribute('aria-label', '설명 고르기');
    var body = el('div', 'about');
    host.appendChild(pick);
    host.appendChild(body);

    function para(bold, rest) {
      var p = el('p');
      if (bold) p.appendChild(el('b', null, bold));
      if (rest) p.appendChild(document.createTextNode(rest));
      return p;
    }
    function steps(items) {
      var ol = el('ol');
      items.forEach(function (x) {
        var li = el('li');
        li.appendChild(el('b', null, x[0] + ' — '));
        li.appendChild(document.createTextNode(x[1]));
        ol.appendChild(li);
      });
      return ol;
    }
    function openMode(m) {
      closeSheet();
      if (window.JCDeckLive) {
        window.JCDeckLive.setMode('live');
        if (window.JCDeckLive.pick) window.JCDeckLive.pick(m);
      }
    }

    function paint() {
      Array.prototype.forEach.call(pick.querySelectorAll('button'), function (b) {
        var on = b.getAttribute('data-ab') === ABOUT;
        b.setAttribute('aria-selected', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      clear(body);
      clear(ft);

      if (ABOUT === 'algo') {
        body.appendChild(para('개념 하나를 누르면 세 가지 완성덱.', ' 상담에서 하려는 일에 가까운 말을 하나만 고르면, 자료실 색인과 시너지 지도에서 걸리는 섹터로 서로 다른 세 가지 흐름을 짜 줍니다.'));
        body.appendChild(steps([
          ['개념 하나 고르기', '「경력단절여성」「직무분석」처럼 상담에서 하려는 일에 가까운 말을 하나 누릅니다.'],
          ['세 흐름 고르기', '정석 적용형 · 실전 연습형 · 사례·법령 집중형 — 단계와 순서가 서로 다릅니다.'],
          ['손보고 실행', '단계를 지워 덱을 다듬고, 마음에 드는 흐름으로 상담 OS 보드(발문·체크·근거 카드)를 엽니다.']
        ]));
        body.appendChild(para('로그인한 사람에게만 보입니다.', ' 저장한 덱은 계정에 남아 다른 기기에서도 이어집니다.'));
        if (D.loggedIn()) {
          var go = el('button', 'primary', '마이덱 알고리즘 열기');
          go.type = 'button';
          go.addEventListener('click', function () { openMode('algo'); });
          ft.appendChild(go);
        }
        return;
      }

      body.appendChild(para('하고 싶은 일을 한 문장으로 적으면, 세 가지 흐름으로 짜 줍니다.', ' 자료실 색인·약어 사전·시너지 지도에서 걸리는 섹터를 찾아 순서를 세우고, 마음에 드는 하나를 고르면 곧바로 내 덱에 저장합니다.'));
      body.appendChild(steps([
        ['한 문장 적기', '「경력단절 내담자 첫 상담 흐름 짜기」처럼 상담에서 하려는 일을 그대로 적습니다.'],
        ['세 흐름 고르기', '정석 적용형 · 실전 연습형 · 사례·법령 집중형 — 단계와 순서가 서로 다릅니다.'],
        ['바로 실행', '고른 흐름은 내 덱에 저장되고, 그 덱으로 상담 OS 보드가 열립니다.']
      ]));
      body.appendChild(para('로그인한 사람에게만 보입니다.', ' 저장한 덱은 계정에 남아 다른 기기에서도 이어집니다.'));
      if (D.loggedIn()) {
        var live = el('button', 'primary', '마이덱 라이브 열기');
        live.type = 'button';
        live.addEventListener('click', function () { openMode('live'); });
        ft.appendChild(live);
      }
    }

    [['algo', '마이덱 알고리즘'], ['live', '마이덱 라이브']].forEach(function (m) {
      var b = el('button', null, m[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-ab', m[0]);
      b.addEventListener('click', function () { ABOUT = m[0]; paint(); });
      pick.appendChild(b);
    });
    paint();
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
    var chain = Promise.resolve({ source: 'session' });
    var last = 'session';
    list.forEach(function (t) {
      chain = chain.then(function () {
        return D.savePrefs(t, ensureTheme(t)).then(function (r) { last = r.source; return r; });
      });
    });
    chain.then(function () {
      dirty = false;
      msg.textContent = last === 'server' ? '내 계정에 저장했어요.'
        : (D.loggedIn() ? '이 창에 저장했어요. 계정 저장소가 배포되면 계정에도 보관됩니다.'
                        : '이 창에 저장했어요. 창을 닫으면 초기화되며, 로그인하면 계정에 영구 저장됩니다.');
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
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) { closeSheet(); return; }
      if ($('sheet').hidden || SHEET !== 'rehearsal' || !PICK) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft' && REH > 0) { REH--; renderSheet(); }
      else if (e.key === 'ArrowRight' && REH < PICK.steps.length - 1) { REH++; renderSheet(); }
    });
    var main = $('sheetMain');
    if (main && window.JCDeckNav) {
      window.JCDeckNav.swipe(main,
        function () { if (PICK && REH > 0) { REH--; renderSheet(); } },
        function () { if (PICK && REH < PICK.steps.length - 1) { REH++; renderSheet(); } });
    }
    window.addEventListener('jc-sync-change', function () {
      if (!D.loggedIn() && window.JCDeckLive) window.JCDeckLive.setMode('decks');
      load();
    });
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
