/* 직업상담 통합 자료실 · 기기 간 연동(로그인)
   - marker.js가 자동으로 불러온다. 설정(주소·공개 키)이 비어 있으면 아무것도 하지 않는다.
   - 받는 정보는 아이디와 비밀번호뿐. 비밀번호는 서버에서 bcrypt로만 저장된다(assets/supabase-setup.sql).
   - 연동하는 것: 탐색 진도, 형광펜·포스트잇, 도구함 설정, 화면 테마, 이론 위키 학습 기록, 매뉴얼 마지막 쪽.
   - 연동 단위는 localStorage 항목. 항목마다 마지막으로 바꾼 시각(t)을 두고 더 최근 것을 남긴다.
     형광펜·포스트잇과 탐색 진도는 덮어쓰지 않고 합친다. */
(function () {
  'use strict';
  if (window.JCSync) return;

  var CFG = window.JC_SYNC_CONFIG || {
    url: 'https://vzxwdfswlolhcluljkgi.supabase.co',
    key: 'sb_publishable_1qTUCjJRWlAvBTsW6MDwUw_RfgxMsxW'   // 공개용 키(사이트에 드러나도 되는 값). secret/service_role 키는 절대 넣지 않는다
  };
  var SYNC_RE = /^(jc-marks:.{0,180}|jc-marker-prefs|jc-archive-visited|jc-theme|jobwiki-2026|kua-wiki-page)$/;
  var META = 'jc-sync-meta', SESS = 'jc-sync-session';
  var d = document, root = d.documentElement;
  var configured = !!(CFG.url && CFG.key);
  var LS = null; try { LS = window.localStorage; } catch (e) {}

  var api = window.JCSync = { configured: configured, open: function () {}, user: function () { return null; }, state: function () { return {}; } };
  if (!configured || !LS) return;

  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem, rawGet = Storage.prototype.getItem;
  function get(k) { try { return rawGet.call(LS, k); } catch (e) { return null; } }
  function put(k, v) { try { if (v === null || v === undefined) rawRemove.call(LS, k); else rawSet.call(LS, k, v); } catch (e) {} }
  function readJ(k, def) { try { var v = get(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function writeJ(k, v) { put(k, JSON.stringify(v)); }
  var sess = readJ(SESS, null);
  var dirty = {};

  /* ---------- 기기에서 바뀐 항목 추적 ---------- */
  function touch(k) {
    if (!SYNC_RE.test(k)) return;
    var m = readJ(META, {}); m[k] = Date.now(); writeJ(META, m);
    dirty[k] = 1; schedule();
  }
  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === LS) touch(String(k)); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === LS) touch(String(k)); };

  /* ---------- 합치기 ---------- */
  function mergeable(k) { return k.indexOf('jc-marks:') === 0 || k === 'jc-archive-visited'; }
  function merge(k, a, b) {
    try {
      if (k === 'jc-archive-visited') {
        var x = JSON.parse(a || '[]'), y = JSON.parse(b || '[]'), u = [];
        x.concat(y).forEach(function (id) { if (u.indexOf(id) < 0) u.push(id); });
        return JSON.stringify(u);
      }
      var A = JSON.parse(a || '{}'), B = JSON.parse(b || '{}');
      var del = {}; (A.del || []).concat(B.del || []).forEach(function (id) { del[id] = 1; });
      var byId = {};
      (B.items || []).concat(A.items || []).forEach(function (it) {   // 같은 id면 더 최근에 고친 것(u 또는 t)
        if (!it || !it.id || del[it.id]) return;
        var o = byId[it.id]; if (!o || (it.u || it.t || 0) >= (o.u || o.t || 0)) byId[it.id] = it;
      });
      var items = Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (p, q) { return (p.t || 0) - (q.t || 0); });
      return JSON.stringify({ v: 1, items: items, del: Object.keys(del).slice(-500) });
    } catch (e) { return a; }
  }

  /* ---------- 서버 호출 ---------- */
  function rpc(fn, body, keepalive) {
    var h = { 'Content-Type': 'application/json', apikey: CFG.key };
    if (/^eyJ/.test(CFG.key)) h.Authorization = 'Bearer ' + CFG.key;
    return fetch(CFG.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(body), keepalive: !!keepalive, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw { net: true, status: r.status, j: j }; return j; }); });
  }

  /* ---------- 연동 ---------- */
  var busy = false, again = false, timer = null, status = { at: 0, err: '' };
  function schedule(ms) { if (!sess) return; clearTimeout(timer); timer = setTimeout(function () { sync('change'); }, ms == null ? 2000 : ms); }
  function syncKeysLocal() { var out = []; for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (SYNC_RE.test(k)) out.push(k); } return out; }
  function sync(reason) {
    if (!sess) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true;
    return rpc('jc_pull', { p_token: sess.token }).then(function (r) {
      if (r.error === 'session') { expire(); return; }
      if (typeof r.admin === 'boolean' && sess.admin !== r.admin) { sess.admin = r.admin; writeJ(SESS, sess); }
      var server = (r.data && r.data.keys) || {}, meta = readJ(META, {}), out = {}, changed = [], now = Date.now();
      var keys = {}; Object.keys(server).forEach(function (k) { keys[k] = 1; }); syncKeysLocal().forEach(function (k) { keys[k] = 1; }); Object.keys(dirty).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        if (!SYNC_RE.test(k)) return;
        var s = server[k], lv = get(k), lt = meta[k] || 0, st = s ? (s.t || 0) : 0;
        if (s && lv !== null && s.v !== null && lv !== s.v && mergeable(k)) {
          var m = merge(k, lv, s.v);
          if (m !== lv) { put(k, m); changed.push(k); }
          if (m !== s.v) { out[k] = { v: m, t: now }; meta[k] = now; } else meta[k] = st;
        } else if (s && st > lt) {
          if (s.v !== lv) { put(k, s.v); changed.push(k); }
          meta[k] = st;
        } else if (lt > st || (!s && lv !== null)) {
          var t = lt || now; out[k] = { v: lv, t: t }; meta[k] = t;
        }
      });
      writeJ(META, meta);
      var send = Object.keys(out).length ? rpc('jc_push', { p_token: sess.token, p_keys: out }) : Promise.resolve({ ok: true });
      return send.then(function (p) {
        if (p && p.error === 'session') { expire(); return; }
        dirty = {}; status = { at: Date.now(), err: '' }; sess.last = status.at; writeJ(SESS, sess);
        if (changed.length) {
          if (reason === 'login') { location.reload(); return; }
          changed.forEach(function (k) { try { window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: get(k), storageArea: LS })); } catch (e) {} });
        }
        paint();
      });
    }).catch(function () { status.err = '연결이 잠시 끊겼어요. 다시 연결되면 이어서 저장해요.'; paint(); })
      .then(function () { busy = false; if (again) { again = false; schedule(1500); } });
  }
  function pushNow() {   // 페이지를 떠날 때: 받기 없이 바뀐 것만 올린다
    if (!sess) return; var ks = Object.keys(dirty); if (!ks.length) return;
    var meta = readJ(META, {}), out = {};
    ks.forEach(function (k) { out[k] = { v: get(k), t: meta[k] || Date.now() }; });
    try { rpc('jc_push', { p_token: sess.token, p_keys: out }, true).catch(function () {}); } catch (e) {}
  }
  function expire() { sess = null; put(SESS, null); status = { at: 0, err: '' }; paint(); toast('로그인이 만료됐어요. 다시 로그인해 주세요.'); }

  /* ---------- 로그인 창 ---------- */
  var host, sr, view = 'login', msg = '', working = false;
  var ERR = {
    bad_username: '아이디는 영문 소문자·숫자·밑줄(_)로 4~20자예요.',
    bad_password: '비밀번호는 8자 이상(72자 이하)이어야 해요.',
    taken: '이미 쓰고 있는 아이디예요. 다른 아이디를 골라 주세요.',
    reserved: '운영용으로 남겨 둔 아이디예요. 다른 아이디를 골라 주세요.',
    bad_login: '아이디 또는 비밀번호가 맞지 않아요.',
    locked: '비밀번호를 여러 번 틀려서 15분 동안 잠겼어요. 잠시 뒤 다시 시도해 주세요.',
    session: '로그인이 만료됐어요. 다시 로그인해 주세요.',
    mismatch: '두 비밀번호가 서로 달라요.',
    agree: '안내를 읽고 동의에 표시해 주세요.',
    net: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'
  };
  var CSS = [
    ':host{all:initial;--ink:#2a2521;--muted:#6b6158;--panel:#fffdf8;--line:#e6dccb;--soft:#f5efe4;--acc:#0f766e;--acc-ink:#fff;--bad:#b42318;--shadow:0 30px 80px -20px rgba(60,40,20,.5);font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:var(--ink)}',
    ':host([data-dark]){--ink:#e6e9ef;--muted:#9aa2b4;--panel:#111621;--line:#2a3243;--soft:#182030;--acc:#2dd4bf;--acc-ink:#08221f;--bad:#fda29b;--shadow:0 30px 80px -20px rgba(0,0,0,.8)}',
    '*{box-sizing:border-box;font:inherit;color:inherit;margin:0}',
    'button{cursor:pointer;background:none;border:0;padding:0}',
    ':focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:8px}',
    '.ov{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:flex-start;justify-content:center;padding:max(12px,7vh) 12px 12px;background:rgba(40,30,20,.42);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);overflow:auto}',
    ':host([data-dark]) .ov{background:rgba(3,4,7,.7)}',
    '.box{position:relative;width:min(420px,100%);background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:26px 20px 18px;animation:pop .18s cubic-bezier(.2,1.2,.4,1)}',
    '@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}',
    '.tape{position:absolute;top:-11px;left:50%;width:96px;height:22px;transform:translateX(-50%) rotate(-3deg);background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 6px,transparent 6px 12px),rgba(244,201,150,.75)}',
    ':host([data-dark]) .tape{background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 6px,transparent 6px 12px),rgba(45,212,191,.35)}',
    '.x{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:12px;font-size:20px;color:var(--muted)}',
    '.x:hover{background:var(--soft)}',
    'h2{font-size:20px;font-weight:750;letter-spacing:-.02em}',
    '.sub{font-size:13.5px;color:var(--muted);margin-top:4px;line-height:1.55}',
    '.sub b{color:var(--ink);font-weight:700}',
    '.tabs{display:flex;gap:4px;padding:3px;margin-top:16px;border-radius:12px;background:var(--soft);border:1px solid var(--line)}',
    '.tabs button{flex:1;min-height:42px;border-radius:9px;font-size:14px;font-weight:650;color:var(--muted)}',
    '.tabs button[aria-selected="true"]{background:var(--panel);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}',
    'form{display:grid;gap:12px;margin-top:16px}',
    'label.f{display:grid;gap:6px;font-size:13.5px;font-weight:650}',
    'label.f small{font-weight:500;color:var(--muted);font-size:12px}',
    'input[type=text],input[type=password]{width:100%;min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--soft);font-size:16px;color:var(--ink)}',
    'input:focus{outline:2px solid var(--acc);outline-offset:0;border-color:transparent}',
    '.pwf{position:relative;display:block}',
    '.pwf input{padding-right:52px}',
    '.eye{position:absolute;right:2px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:10px;display:grid;place-items:center;color:var(--muted)}',
    '.eye:hover{color:var(--ink)}',
    '.eye:focus-visible{outline:2px solid var(--acc);outline-offset:-4px}',
    '.eye svg{width:22px;height:22px}',
    '.eye .shut{display:none}.eye[aria-pressed="true"] .open{display:none}.eye[aria-pressed="true"] .shut{display:block}',
    '.agree{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.55;color:var(--muted);padding:12px;border-radius:12px;background:var(--soft);border:1px dashed var(--line)}',
    '.agree input{width:20px;height:20px;margin-top:1px;flex:none;accent-color:var(--acc)}',
    '.agree ul{margin:6px 0 0;padding-left:16px}',
    '.go{min-height:48px;border-radius:12px;background:var(--acc);color:var(--acc-ink);font-size:15.5px;font-weight:700}',
    '.go[disabled]{opacity:.6;cursor:wait}',
    '.btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line);font-size:14px;font-weight:650}',
    '.btn:hover{border-color:var(--acc)}',
    '.btn.bad{color:var(--bad)}',
    '.msg{font-size:13.5px;line-height:1.5;color:var(--bad);min-height:0}',
    '.msg.ok{color:var(--acc)}',
    '.who{display:flex;align-items:center;gap:12px;margin-top:16px;padding:14px;border-radius:14px;background:var(--soft);border:1px solid var(--line)}',
    '.av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--acc);color:var(--acc-ink);font-weight:800;font-size:18px;flex:none}',
    '.who b{display:block;font-size:16px}.who span{font-size:12.5px;color:var(--muted)}',
    '.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}',
    'details{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}',
    'summary{cursor:pointer;min-height:40px;display:flex;align-items:center;font-size:14px;font-weight:650;color:var(--muted)}',
    '.foot{margin-top:14px;font-size:12px;color:var(--muted);line-height:1.6}',
    '.adm{position:relative;margin-top:12px;padding:14px;border-radius:14px;border:1px solid color-mix(in srgb,#b4532a 45%,var(--line));background:color-mix(in srgb,#f4c996 18%,var(--panel))}',
    ':host([data-dark]) .adm{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.07)}',
    '.adm-hd{display:flex;align-items:center;justify-content:space-between}',
    '.adm-hd b{font-size:12.5px;font-weight:800;letter-spacing:.04em;color:#b4532a}:host([data-dark]) .adm-hd b{color:#fbbf24}',
    '.adm-re{min-height:36px;padding:0 10px;border-radius:9px;font-size:12.5px;font-weight:650;color:var(--muted)}.adm-re:hover{background:var(--soft)}',
    '.adm-n{font-size:15px;font-weight:650;margin-top:2px}.adm-n span{font-size:34px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;margin-right:2px}',
    '.adm-sub{font-size:12.5px;color:var(--muted);line-height:1.55;margin-top:2px}',
    '.foot a{color:var(--acc)}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}'
  ].join('\n');
  /* 비밀번호 입력란: 오른쪽 눈 아이콘으로 표시·숨김 */
  var EYE = '<svg class="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
  function pwInput(attrs) {
    return '<span class="pwf"><input type="password" ' + attrs + ' autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button type="button" class="eye" data-act="eye" aria-pressed="false" aria-label="비밀번호 보기" title="비밀번호 보기">' + EYE + '</button></span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function hubURL() {
    var s = d.querySelector('script[src*="assets/marker.js"]'); var src = s ? s.src : location.href;
    return src.replace(/assets\/marker\.js.*$/, '');
  }
  function ago(t) { if (!t) return '아직 연동 전'; var s = Math.round((Date.now() - t) / 1000); if (s < 60) return '방금 연동됨'; if (s < 3600) return Math.floor(s / 60) + '분 전 연동'; return new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' 연동'; }
  function render() {
    if (!sr) return;
    var body;
    if (sess) {
      body = '<h2>내 계정</h2><p class="sub">이 기기의 학습 기록과 메모가 계정과 연동되고 있어요.</p>' +
        '<div class="who"><span class="av" aria-hidden="true">' + esc(sess.username.charAt(0).toUpperCase()) + '</span><div><b>' + esc(sess.username) + '</b><span>' + (status.err ? esc(status.err) : ago(status.at || sess.last)) + '</span></div></div>' +
        (sess.admin ? adminCard() : '') +
        '<div class="row"><button class="btn" data-act="now">지금 연동하기</button><button class="btn" data-act="logout">로그아웃</button></div>' +
        '<p class="msg' + (msg && msg.ok ? ' ok' : '') + '" role="status">' + esc(msg ? msg.t : '') + '</p>' +
        '<details><summary>비밀번호 바꾸기</summary><form data-form="pw"><label class="f">지금 비밀번호' + pwInput('name="old" autocomplete="current-password" required') + '</label>' +
        '<label class="f">새 비밀번호 <small>8자 이상</small>' + pwInput('name="pw" autocomplete="new-password" minlength="8" maxlength="72" required') + '</label><button class="go" type="submit">바꾸기</button></form></details>' +
        '<details><summary>계정과 기록 완전히 삭제</summary><form data-form="del"><p class="sub">서버에 저장된 아이디·비밀번호·학습 기록·메모가 모두 지워지고 되돌릴 수 없어요. 이 기기에 남은 기록은 그대로 둡니다.</p>' +
        '<label class="f">비밀번호 확인' + pwInput('name="pw" autocomplete="current-password" required') + '</label><button class="btn bad" type="submit">삭제하기</button></form></details>';
    } else {
      var su = view === 'signup';
      body = '<h2>' + (su ? '새 계정 만들기' : '로그인') + '</h2><p class="sub"><b>로그인하지 않아도 모든 기능을 그대로 쓸 수 있어요.</b> 로그인은 선택이며, 하면 탐색 진도, 형광펜, 포스트잇 메모가 저장되어 다른 기기에서도 이어져요.</p>' +
        '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="login" aria-selected="' + !su + '">로그인</button><button role="tab" data-act="tab" data-v="signup" aria-selected="' + su + '">새로 만들기</button></div>' +
        '<form data-form="' + (su ? 'signup' : 'login') + '" novalidate>' +
        '<label class="f">아이디 ' + (su ? '<small>영문 소문자·숫자·밑줄(_) 4~20자</small>' : '') + '<input type="text" name="id" autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="text" maxlength="20" required></label>' +
        '<label class="f">비밀번호 ' + (su ? '<small>8자 이상</small>' : '') + pwInput('name="pw" autocomplete="' + (su ? 'new-password' : 'current-password') + '" maxlength="72" required') + '</label>' +
        (su ? '<label class="f">비밀번호 확인' + pwInput('name="pw2" autocomplete="new-password" maxlength="72" required') + '</label>' +
          '<label class="agree"><input type="checkbox" name="ok"><span><b>아래 안내를 읽었어요</b><ul><li>이메일·이름·연락처는 받지 않아요. 그래서 <b>비밀번호를 잊으면 찾을 수 없어요.</b></li><li>메모에 내담자의 이름·연락처 같은 개인정보를 적지 마세요.</li><li>언제든 계정과 기록을 완전히 지울 수 있어요.</li></ul></span></label>' : '') +
        '<p class="msg' + (msg && msg.ok ? ' ok' : '') + '" role="alert">' + esc(msg ? msg.t : '') + '</p>' +
        '<button class="go" type="submit"' + (working ? ' disabled' : '') + '>' + (working ? '잠시만요…' : su ? '만들고 연동 시작' : '로그인') + '</button></form>';
    }
    sr.querySelector('.box').innerHTML = '<span class="tape" aria-hidden="true"></span><button class="x" data-act="close" aria-label="닫기">×</button>' + body +
      '<p class="foot">비밀번호는 되돌릴 수 없는 방식으로 암호화해 저장해요. <a href="' + esc(hubURL()) + '#privacy">개인정보와 보안 안내</a></p>';
  }
  var stats = null, statsBusy = false;
  function adminCard() {
    if (!stats && !statsBusy) loadStats();
    var s = stats;
    return '<div class="adm"><div class="adm-hd"><b>관리자</b><button class="adm-re" data-act="stats" aria-label="가입자 수 새로 고침">새로 고침</button></div>' +
      (s && !s.error ? '<p class="adm-n"><span>' + s.users.toLocaleString('ko-KR') + '</span>개</p><p class="adm-sub">가입된 아이디 수(관리자 포함) · 일반 회원 ' + s.members.toLocaleString('ko-KR') + ' · 최근 7일 가입 ' + s.last7.toLocaleString('ko-KR') + '</p>'
        : '<p class="adm-sub">' + (s && s.error ? '가입자 수를 불러오지 못했어요.' : '불러오는 중…') + '</p>') +
      '<p class="adm-sub">개별 아이디와 기록은 사이트에서 보여 주지 않아요.</p></div>';
  }
  function loadStats() {
    if (!sess || statsBusy) return; statsBusy = true;
    rpc('jc_admin_stats', { p_token: sess.token }).then(function (r) {
      statsBusy = false;
      if (r.error === 'forbidden') { sess.admin = false; writeJ(SESS, sess); stats = null; render(); return; }
      if (r.error === 'session') { expire(); return; }
      stats = r; render();
    }).catch(function () { statsBusy = false; stats = { error: 'net' }; render(); });
  }
  var lastFocus = null;
  function open(v) {
    if (!host) build();
    view = v || 'login'; msg = ''; lastFocus = d.activeElement;
    host.hidden = false; root.style.overflow = 'hidden'; sync2theme(); render();
    setTimeout(function () { var i = sr.querySelector('input'); (i || sr.querySelector('.x')).focus(); }, 30);
  }
  function close() { if (!host || host.hidden) return; host.hidden = true; root.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function sync2theme() { if (host) { if (isDark()) host.setAttribute('data-dark', ''); else host.removeAttribute('data-dark'); } }
  function build() {
    host = d.createElement('div'); host.id = 'jc-sync-ui'; host.hidden = true;
    host.style.cssText = 'position:fixed!important;z-index:2147483600!important;left:0;top:0;width:0;height:0';
    sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<style>' + CSS + '</style><div class="ov" id="ov"><div class="box" role="dialog" aria-modal="true" aria-label="로그인"></div></div>';
    d.body.appendChild(host);
    sr.getElementById('ov').addEventListener('click', function (e) { if (e.target.id === 'ov') close(); });
    sr.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); e.stopPropagation(); });
    sr.addEventListener('keyup', function (e) { e.stopPropagation(); });
    sr.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var a = b.getAttribute('data-act');
      if (a === 'eye') {
        var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기'); b.title = b.getAttribute('aria-label');
        try { var n = inp.value.length; inp.focus({ preventScroll: true }); inp.setSelectionRange(n, n); } catch (x) {}
        return;
      }
      if (a === 'close') close();
      else if (a === 'tab') { view = b.getAttribute('data-v'); msg = ''; render(); var i = sr.querySelector('input'); if (i) i.focus(); }
      else if (a === 'stats') { stats = null; render(); }
      else if (a === 'now') { msg = { t: '연동하는 중…', ok: true }; render(); sync('manual').then(function () { msg = status.err ? { t: status.err } : { t: '연동했어요.', ok: true }; render(); }); }
      else if (a === 'logout') {
        var tok = sess.token; pushNow();
        rpc('jc_logout', { p_token: tok }).catch(function () {});
        sess = null; put(SESS, null); paint(); msg = { t: '로그아웃했어요. 이 기기에 저장된 기록은 그대로 남아 있어요.', ok: true }; view = 'login'; render();
      }
    });
    sr.addEventListener('submit', function (e) {
      e.preventDefault(); if (working) return;
      var f = e.target, kind = f.getAttribute('data-form'), v = function (n) { var i = f.querySelector('[name="' + n + '"]'); return i ? (i.type === 'checkbox' ? i.checked : i.value) : ''; };
      if (kind === 'signup' || kind === 'login') {
        var id = String(v('id')).trim().toLowerCase(), pw = String(v('pw'));
        if (!/^[a-z0-9_]{4,20}$/.test(id)) return fail('bad_username', kind === 'login' ? 'bad_login' : null);
        if (kind === 'signup') { if (pw.length < 8) return fail('bad_password'); if (pw !== v('pw2')) return fail('mismatch'); if (!v('ok')) return fail('agree'); }
        working = true; msg = ''; render();
        rpc(kind === 'signup' ? 'jc_signup' : 'jc_login', { p_username: id, p_password: pw }).then(function (r) {
          working = false;
          if (r.error) return fail(r.error);
          sess = { token: r.token, username: r.username, admin: !!r.admin, last: 0 }; writeJ(SESS, sess); stats = null;
          msg = { t: kind === 'signup' ? '계정을 만들었어요. 이 기기의 기록을 올리는 중…' : '로그인했어요. 기록을 맞추는 중…', ok: true }; render(); paint();
          return sync('login').then(function () { msg = { t: '연동을 시작했어요.', ok: true }; render(); });
        }).catch(function () { working = false; fail('net'); });
      } else if (kind === 'pw') {
        if (String(v('pw')).length < 8) return fail('bad_password');
        rpc('jc_change_password', { p_token: sess.token, p_old: v('old'), p_new: v('pw') }).then(function (r) {
          if (r.error) return fail(r.error); msg = { t: '비밀번호를 바꿨어요. 다른 기기는 다시 로그인해야 해요.', ok: true }; render();
        }).catch(function () { fail('net'); });
      } else if (kind === 'del') {
        if (!window.confirm('정말 계정과 서버의 기록을 모두 지울까요? 되돌릴 수 없어요.')) return;
        rpc('jc_delete_account', { p_token: sess.token, p_password: v('pw') }).then(function (r) {
          if (r.error) return fail(r.error);
          sess = null; put(SESS, null); paint(); view = 'login'; msg = { t: '계정과 서버의 기록을 모두 지웠어요.', ok: true }; render();
        }).catch(function () { fail('net'); });
      }
      function fail(code, alt) { working = false; msg = { t: ERR[alt || code] || ERR.net }; render(); return false; }
    });
    new MutationObserver(sync2theme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- 페이지에 상태 표시 ---------- */
  var toastFn = null;
  function toast(m) { if (toastFn) toastFn(m); }
  function paint() {
    var u = sess ? sess.username : null;
    Array.prototype.forEach.call(d.querySelectorAll('[data-jc-login]'), function (b) {
      b.hidden = false;
      var label = b.querySelector('[data-jc-login-label]') || b;
      label.textContent = u ? u : '로그인';
      b.setAttribute('aria-label', u ? '내 계정: ' + u : '로그인해서 다른 기기와 연동하기');
      b.classList.toggle('jc-in', !!u);
    });
    if (window.JCMarker && window.JCMarker.refresh) window.JCMarker.refresh();
    if (host && !host.hidden) render();
  }
  api.open = open;
  api.user = function () { return sess ? sess.username : null; };
  api.state = function () { return { user: sess ? sess.username : null, at: status.at || (sess && sess.last) || 0, err: status.err }; };
  api.label = function () { return sess ? (status.err ? '연결 대기 중' : ago(status.at || sess.last)) : ''; };
  api.setToast = function (fn) { toastFn = fn; };

  function start() {
    d.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-jc-login]'); if (b) { e.preventDefault(); open(); } });
    paint();
    if (location.hash === '#login') open();
    if (sess) sync('load');
    d.addEventListener('visibilitychange', function () { if (d.hidden) pushNow(); else if (sess) sync('focus'); });
    window.addEventListener('pagehide', pushNow);
    setInterval(function () { if (sess && !d.hidden) sync('tick'); }, 60000);
    window.addEventListener('online', function () { if (sess) sync('online'); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
