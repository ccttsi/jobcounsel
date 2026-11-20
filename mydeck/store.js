/* store.js — 비로그인 저장을 「창(sessionStorage)」으로 옮기는 얇은 층 (2026-11-20)
 *
 * 왜
 *   비로그인 상태에서 만든 덱·공간 꾸미기 설정은 **창(탭)을 닫으면 사라져야 한다**(계정에 남기지 않는다).
 *   로그인했을 때만 내 계정(jc_my_decks · jc_my_deck_prefs)에 영구 보관한다.
 *
 * 어떻게
 *   저장 자체(모양 다듬기·계정 서버 호출·오류 문구)는 공용 `assets/mydeck-store.js`(JCDeck)가 이미 맡는다.
 *   그 파일은 다른 화면도 함께 쓰는 공용 층이라 고치지 않고, 이 파일이 **로그인했을 때는 그대로 넘기고,
 *   로그인하지 않았을 때만 그릇을 localStorage → sessionStorage로 바꾼다**(같은 키 이름, 다른 그릇).
 *
 * 쓰는 곳
 *   mydeck/index.html · flow/index.html — `assets/mydeck-store.js` **다음에** 읽는다(defer 없이).
 *   flow는 마이덱 폴더의 이 파일 하나를 같이 쓴다(같은 규칙이 두 벌로 갈라지지 않게).
 *
 * 옮겨 오기
 *   이 파일이 생기기 전에 이 브라우저에 남아 있던 **비로그인 덱(where:'local')** 은 처음 한 번만
 *   이 창의 저장소로 옮긴다. 계정 덱 사본(where:'server')은 계정 저장소가 맡으므로 건드리지 않는다.
 */
(function () {
  'use strict';
  var base = window.JCDeck;
  if (!base || window.JCDeckSession) return;

  var KEY = 'jc-mydeck-local';          /* 같은 이름, 다른 그릇 */
  var MAX_DECKS = base.MAX_DECKS || 60;

  function SS() { try { return window.sessionStorage; } catch (e) { return null; } }
  function LS() { try { return window.localStorage; } catch (e) { return null; } }
  function get(store, k) { try { return store ? store.getItem(k) : null; } catch (e) { return null; } }
  function put(store, k, v) { try { if (store) store.setItem(k, v); } catch (e) {} }

  function sessAll() {
    var o = null;
    try { o = JSON.parse(get(SS(), KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = { v: 1, decks: [], prefs: {} };
    if (!Array.isArray(o.decks)) o.decks = [];
    if (!o.prefs || typeof o.prefs !== 'object') o.prefs = {};
    return o;
  }
  function sessWrite(o) { put(SS(), KEY, JSON.stringify(o)); }

  /* ---------- 이 브라우저에 남아 있던 비로그인 덱을 이 창으로 옮긴다 ---------- */
  function migrate() {
    var ss = SS(), ls = LS();
    if (!ss || !ls) return;
    if (get(ss, KEY)) return;                              /* 이 창에 이미 작업이 있으면 그대로 둔다 */
    var old = null;
    try { old = JSON.parse(get(ls, KEY) || 'null'); } catch (e) { old = null; }
    if (!old || typeof old !== 'object' || !Array.isArray(old.decks)) return;
    var local = old.decks.filter(function (d) { return d && d.where !== 'server'; });
    if (!local.length) return;
    sessWrite({ v: 1, decks: local, prefs: (old.prefs && typeof old.prefs === 'object') ? old.prefs : {} });
    if (get(ss, KEY)) {                                    /* 옮긴 것이 확인되면 원본에서 그 덱만 뺀다 */
      old.decks = old.decks.filter(function (d) { return d && d.where === 'server'; });
      put(ls, KEY, JSON.stringify(old));
    }
  }

  /* ---------- 이 창의 저장소 ---------- */
  function localList() {
    return sessAll().decks.map(function (d) { return base.cleanDeck(d, 'local'); }).filter(Boolean);
  }
  function localSave(deck) {
    var o = sessAll(), out = [], done = false;
    o.decks.forEach(function (d) {
      var c = base.cleanDeck(d, 'local');
      if (!c) return;
      if (c.id === deck.id) { out.push(deck); done = true; } else out.push(c);
    });
    if (!done) out.unshift(deck);
    o.decks = out.slice(0, MAX_DECKS);
    sessWrite(o);
    return deck;
  }
  function localRemove(id) {
    var o = sessAll();
    o.decks = o.decks.filter(function (d) { return String(d && d.id) !== String(id); });
    sessWrite(o);
  }
  function newId() {
    var a = '0123456789abcdef', s = 'l-';
    for (var i = 0; i < 12; i++) s += a.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* ---------- 공개 API (모양은 JCDeck과 같다) ---------- */
  function list() {
    if (base.loggedIn()) return base.list();
    return Promise.resolve({ decks: localList(), source: 'session', off: true });
  }
  function save(deck) {
    if (base.loggedIn()) return base.save(deck);
    var c = base.cleanDeck(deck, 'local');
    if (!c) return Promise.reject({ error: 'bad_deck' });
    c.id = c.id || newId();
    c.where = 'local';
    c.updated_at = new Date().toISOString();
    c.created_at = c.created_at || c.updated_at;
    return Promise.resolve({ deck: localSave(c), source: 'session', off: true });
  }
  function rename(deck, name) {
    if (base.loggedIn()) return base.rename(deck, name);
    var nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, base.MAX_NAME || 60);
    if (!nm) return Promise.reject({ error: 'bad_name' });
    var d = base.cleanDeck(deck, 'local');
    if (!d) return Promise.reject({ error: 'bad_deck' });
    d.name = nm;
    d.updated_at = new Date().toISOString();
    localSave(d);
    return Promise.resolve({ deck: d, source: 'session' });
  }
  function remove(id) {
    localRemove(id);
    if (!base.loggedIn()) return Promise.resolve({ source: 'session' });
    return base.remove(id);
  }
  function adopt(deck) {
    if (!base.loggedIn()) return Promise.reject({ error: 'session' });
    return base.adopt(deck);
  }
  function prefs() {
    if (base.loggedIn()) return base.prefs();
    return Promise.resolve({ prefs: sessAll().prefs || {}, source: 'session', off: true });
  }
  function savePrefs(theme, values) {
    if (base.loggedIn()) return base.savePrefs(theme, values);
    var o = sessAll();
    o.prefs[theme] = values;
    sessWrite(o);
    return Promise.resolve({ source: 'session', off: true });
  }

  if (!base.loggedIn()) migrate();

  window.JCDeckSession = { key: KEY, migrate: migrate };
  window.JCDeck = {
    user: function () { return base.user(); },
    loggedIn: function () { return base.loggedIn(); },
    errText: function (e) { return base.errText(e); },
    ERR: base.ERR,
    serverOff: function () { return base.serverOff(); },
    serverChecked: function () { return base.serverChecked(); },
    list: list, save: save, rename: rename, remove: remove, adopt: adopt,
    prefs: prefs, savePrefs: savePrefs,
    localList: localList,
    localPrefs: function () { return sessAll().prefs || {}; },
    deckFromSteps: function (steps, name) { return base.deckFromSteps(steps, name); },
    cleanDeck: function (d, where) { return base.cleanDeck(d, where); },
    MAX_STEPS: base.MAX_STEPS, MAX_NAME: base.MAX_NAME, MAX_DECKS: MAX_DECKS
  };
})();
