/* mydeck-store.js — 마이덱(내가 짠 상담 덱) 저장소 (2026-11-20)
 *
 * 쓰는 곳: 상담 플로우(flow/ — 왼쪽 아래 카드덱 단추로 연다)의 「마이덱에 저장」과 마이덱 화면(mydeck/).
 *
 * 저장이 가는 두 곳
 *   1) 로그인했으면 **내 계정**(Supabase Edge Function my-decks-proxy → jc_my_decks · jc_my_deck_prefs).
 *      user_id 는 언제나 세션 토큰에서만 서버가 정한다. 이 파일은 user_id 를 보내지 않는다.
 *   2) 로그인하지 않았거나, 서버 함수가 아직 배포되지 않았으면 **이 브라우저**(localStorage).
 *      함수가 없어도 화면이 멈추지 않게, 한 번 실패하면 이번 화면에서는 서버를 다시 부르지 않고
 *      「이 기기에만 저장」으로 조용히 내려간다(배포되는 순간부터 그대로 서버 저장이 된다).
 *
 * 지키는 선
 *   · 덱에는 자료 id·제목·딱지·번호와 이름만 담는다. 내담자 정보·메모 내용은 담지 않는다.
 *   · 서버가 준 덱과 이 기기의 덱을 같은 모양(where: 'server'|'local')으로 돌려준다.
 *   · 공개 키(anon)는 부르지 않는다 — 함수는 세션 토큰만 받는다.
 */
(function () {
  'use strict';
  if (window.JCDeck) return;

  var CFG = window.JC_SYNC_CONFIG || {
    url: 'https://vzxwdfswlolhcluljkgi.supabase.co',
    key: 'sb_publishable_1qTUCjJRWlAvBTsW6MDwUw_RfgxMsxW'
  };
  var API = String(CFG.url || '').replace(/\/+$/, '') + '/functions/v1/my-decks-proxy';

  var LOCAL = 'jc-mydeck-local';
  var SESS = 'jc-sync-session';
  var MAX_STEPS = 12, MAX_NAME = 60, MAX_DECKS = 60;

  var st = { off: false, checked: false, err: '' };

  function raw(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function readJson(k, def) { try { var v = raw(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }

  function sess() {
    var o = readJson(SESS, null);
    return o && o.token ? o : null;
  }
  function user() { var s = sess(); return s ? String(s.username || '') : ''; }
  function loggedIn() { return !!sess(); }

  /* ---------- 모양 다듬기 ---------- */
  function cleanStep(x) {
    if (!x || typeof x !== 'object') return null;
    var id = String(x.id || '');
    if (!/^[a-z0-9][a-z0-9_-]{1,23}$/.test(id)) return null;
    return {
      id: id,
      no: String(x.no || '').slice(0, 4),
      title: String(x.title || '').slice(0, 40),
      badge: String(x.badge || '').slice(0, 16)
    };
  }
  function cleanDeck(d, where) {
    if (!d || typeof d !== 'object') return null;
    var steps = (Array.isArray(d.steps) ? d.steps : []).map(cleanStep).filter(Boolean);
    if (!steps.length || steps.length > MAX_STEPS) return null;
    var seen = {}, uniq = [];
    steps.forEach(function (s) { if (!seen[s.id]) { seen[s.id] = 1; uniq.push(s); } });
    var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!name) name = '이름 없는 덱';
    return {
      id: String(d.id || ''),
      name: name,
      steps: uniq,
      where: where || 'local',
      created_at: String(d.created_at || ''),
      updated_at: String(d.updated_at || '')
    };
  }
  function deckFromSteps(steps, name) {
    return cleanDeck({ name: name, steps: steps }, 'local');
  }

  /* ---------- 이 브라우저 저장소 ---------- */
  function localAll() {
    var o = readJson(LOCAL, null);
    if (!o || typeof o !== 'object') o = { v: 1, decks: [], prefs: {} };
    if (!Array.isArray(o.decks)) o.decks = [];
    if (!o.prefs || typeof o.prefs !== 'object') o.prefs = {};
    return o;
  }
  function localWrite(o) { put(LOCAL, JSON.stringify(o)); }

  function localList() {
    return localAll().decks.map(function (d) { return cleanDeck(d, 'local'); }).filter(Boolean);
  }
  function localSave(deck) {
    var o = localAll(), list = [], done = false;
    o.decks.forEach(function (d) {
      var c = cleanDeck(d, 'local');
      if (!c) return;
      if (c.id === deck.id) { list.push(deck); done = true; } else list.push(c);
    });
    if (!done) list.unshift(deck);
    o.decks = list.slice(0, MAX_DECKS);
    localWrite(o);
    return deck;
  }
  function localRemove(id) {
    var o = localAll();
    o.decks = o.decks.filter(function (d) { return String(d && d.id) !== id; });
    localWrite(o);
  }
  function newLocalId() {
    var a = '0123456789abcdef', s = 'l-';
    for (var i = 0; i < 12; i++) s += a.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* ---------- 서버(Edge Function) ---------- */
  function call(action, extra) {
    var s = sess();
    if (!s) return Promise.reject({ error: 'session' });
    if (st.off) return Promise.reject({ error: 'off' });
    var body = { action: action, session_token: s.token };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          /* 함수가 아직 없거나(404) 서버가 죽었으면 이번 화면에서는 서버를 쓰지 않는다. */
          if (r.status === 404 || r.status === 502 || r.status === 503 || r.status >= 500) st.off = true;
          throw (j && j.error ? j : { error: 'server', status: r.status });
        }
        st.checked = true;
        return j;
      });
    }, function () {
      st.off = true;
      throw { error: 'net' };
    });
  }

  var ERR = {
    session: '로그인이 풀렸어요. 다시 로그인해 주세요.',
    off: '계정 저장소가 아직 준비되지 않았어요.',
    net: '연결이 잠시 끊겼어요.',
    server: '서버에서 처리하지 못했어요.',
    too_many: '저장할 수 있는 덱 수(' + MAX_DECKS + '개)를 넘었어요. 쓰지 않는 덱을 지워 주세요.',
    bad_deck: '덱 모양이 맞지 않아 저장하지 못했어요.',
    bad_name: '이름은 1~' + MAX_NAME + '자로 적어 주세요.',
    not_found: '그 덱을 찾지 못했어요.'
  };
  function errText(e) { return (e && ERR[e.error]) || ERR.server; }

  /* ---------- 공개 ---------- */
  function list() {
    var local = localList();
    if (!loggedIn()) return Promise.resolve({ decks: local, source: 'local', off: false });
    return call('list').then(function (j) {
      var server = (j.decks || []).map(function (d) { return cleanDeck(d, 'server'); }).filter(Boolean);
      /* 서버에 올라간 덱과 같은 id 는 이 기기 사본을 남기지 않는다 */
      var ids = {};
      server.forEach(function (d) { ids[d.id] = 1; });
      var only = local.filter(function (d) { return !ids[d.id] && d.where === 'local'; });
      return { decks: server.concat(only), source: 'server', off: false, only_local: only.length };
    }, function (e) {
      if (e && e.error === 'session') return { decks: local, source: 'local', off: true, session: true };
      return { decks: local, source: 'local', off: true };
    });
  }

  function save(deck) {
    var c = cleanDeck(deck, loggedIn() ? 'server' : 'local');
    if (!c) return Promise.reject({ error: 'bad_deck' });
    if (!loggedIn() || st.off) {
      c.id = c.id || newLocalId();
      c.where = 'local';
      c.updated_at = new Date().toISOString();
      c.created_at = c.created_at || c.updated_at;
      return Promise.resolve({ deck: localSave(c), source: 'local', off: st.off || !loggedIn() });
    }
    return call('save', { deck: { id: c.id || '', name: c.name, steps: c.steps } }).then(function (j) {
      var out = cleanDeck(j.deck, 'server') || c;
      localSave(out);          /* 이 기기에도 사본을 둔다(오프라인에서 목록이 비지 않게) */
      return { deck: out, source: 'server' };
    }, function (e) {
      if (e && (e.error === 'session')) throw e;
      c.id = c.id || newLocalId();
      c.where = 'local';
      c.updated_at = new Date().toISOString();
      var saved = localSave(c);
      return { deck: saved, source: 'local', off: true, err: errText(e) };
    });
  }

  function rename(deck, name) {
    var nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!nm) return Promise.reject({ error: 'bad_name' });
    if (!loggedIn() || st.off || String(deck.id).indexOf('l-') === 0) {
      var d = cleanDeck(deck, 'local');
      if (!d) return Promise.reject({ error: 'bad_deck' });
      d.name = nm; d.updated_at = new Date().toISOString();
      localSave(d);
      return Promise.resolve({ deck: d, source: 'local' });
    }
    return call('rename', { id: deck.id, name: nm }).then(function (j) {
      var out = cleanDeck(j.deck, 'server') || deck;
      out.name = nm; localSave(out);
      return { deck: out, source: 'server' };
    });
  }

  function remove(id) {
    localRemove(id);
    if (!loggedIn() || st.off || String(id).indexOf('l-') === 0) return Promise.resolve({ source: 'local' });
    return call('delete', { id: id }).then(function () { return { source: 'server' }; },
      function (e) { return { source: 'local', err: errText(e) }; });
  }

  /* 이 기기에만 있던 덱을 내 계정으로 올린다(로그인 + 서버 준비됨) */
  function adopt(deck) {
    if (!loggedIn() || st.off) return Promise.reject({ error: st.off ? 'off' : 'session' });
    return call('save', { deck: { id: '', name: deck.name, steps: deck.steps } }).then(function (j) {
      var out = cleanDeck(j.deck, 'server');
      if (out) { localRemove(deck.id); localSave(out); }
      return { deck: out, source: 'server' };
    });
  }

  /* ---------- DIY 설정 ---------- */
  function localPrefs() {
    var o = localAll();
    return o.prefs || {};
  }
  function prefs() {
    var local = localPrefs();
    if (!loggedIn()) return Promise.resolve({ prefs: local, source: 'local', off: st.off });
    return call('prefs_get').then(function (j) {
      return { prefs: j.prefs || local, source: 'server' };
    }, function () {
      return { prefs: local, source: 'local', off: true };
    });
  }
  function savePrefs(theme, values) {
    var o = localAll();
    o.prefs = o.prefs || {};
    o.prefs[theme] = values;
    localWrite(o);
    if (!loggedIn() || st.off) return Promise.resolve({ source: 'local', off: st.off || !loggedIn() });
    return call('prefs_save', { theme: theme, prefs: values }).then(function () {
      return { source: 'server' };
    }, function () { return { source: 'local', off: true }; });
  }

  window.JCDeck = {
    user: user, loggedIn: loggedIn, errText: errText, ERR: ERR,
    serverOff: function () { return st.off; },
    serverChecked: function () { return st.checked; },
    list: list, save: save, rename: rename, remove: remove, adopt: adopt,
    prefs: prefs, savePrefs: savePrefs,
    localList: localList, localPrefs: localPrefs,
    deckFromSteps: deckFromSteps, cleanDeck: cleanDeck,
    MAX_STEPS: MAX_STEPS, MAX_NAME: MAX_NAME, MAX_DECKS: MAX_DECKS
  };
})();
