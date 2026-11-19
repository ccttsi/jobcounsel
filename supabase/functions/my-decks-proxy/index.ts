// my-decks-proxy — 마이덱(내가 짠 상담 덱)의 서버 쪽 (Supabase Edge Function · Deno)
//
// 27번 「상담 플로우 아키텍트」에서 만든 덱과 마이덱 화면의 공간 꾸미기 설정을 **로그인한 사용자 자기 계정**에
// 보관한다. AI 호출은 하지 않는다 — 저장·조회만 한다(키도, 외부 주소도 쓰지 않는다).
//
// 하는 일
//   list        내 덱 목록(최근 고친 순, 최대 60개)
//   save        새 덱 저장 / 있던 덱 덮어쓰기(같은 id 는 내 것일 때만)
//   rename      덱 이름 바꾸기
//   delete      덱 지우기
//   prefs_get   공간 꾸미기 설정(테마별 세 벌)
//   prefs_save  테마 하나의 설정 저장
//
// 지키는 선
//   · session_token 을 jc_sessions(SHA-256 token_hash, 만료 검사)와 맞춰 **로그인 사용자만** 통과시킨다.
//   · user_id 는 언제나 세션에서만 정한다 — 요청 본문의 user_id 는 아예 받지 않고, 모든 쿼리에 붙인다.
//   · 두 표(jc_my_decks·jc_my_deck_prefs)는 RLS 를 켜고 anon·authenticated 권한을 회수했다.
//     이 함수만 Service Role 로 만진다.
//   · 덱에는 자료 id·번호·제목·딱지와 이름만 담는다(모양을 여기서 다시 다듬는다).
//
// 환경변수
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  Supabase 가 자동 주입.
//   JC_ALLOW_ORIGINS  선택. 쉼표로 구분한 허용 출처. 기본 https://ccttsi.github.io
//
// 배포: supabase functions deploy my-decks-proxy --no-verify-jwt
//   (사이트는 세션 토큰으로 직접 확인하므로 Supabase JWT 검사는 끈다 — assistant-proxy 와 같은 방식)

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW = (Deno.env.get('JC_ALLOW_ORIGINS') || 'https://ccttsi.github.io')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 64000;      // 요청 본문 상한(바이트) — 덱 한 장(12단계)은 넉넉히 들어간다
const MAX_DECKS = 60;        // 사용자당 덱 수
const MAX_STEPS = 12;        // 덱 한 장의 단계 수
const MAX_NAME = 60;
const THEMES = ['light', 'sepia', 'dark'];
const STR_KEYS = ['bg', 'ink', 'card', 'font', 'layout', 'deco'];
const HEX_KEYS = ['bg_custom', 'ink_custom'];

const enc = new TextEncoder();

function cors(origin: string | null): Headers {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  });
  if (origin && ALLOW.some((a) => a === origin || (a.endsWith('*') && origin.startsWith(a.slice(0, -1))))) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-methods', 'POST, OPTIONS');
    h.set('access-control-allow-headers', 'content-type');
    h.set('access-control-max-age', '86400');
  }
  return h;
}
function out(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}
function bad(origin: string | null, code: string, message: string, status = 400): Response {
  return out(status, { ok: false, error: code, message }, origin);
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const h = new Headers(init.headers || {});
  h.set('apikey', SERVICE_KEY);
  h.set('authorization', 'Bearer ' + SERVICE_KEY);
  if (init.body && !h.has('content-type')) h.set('content-type', 'application/json');
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { ...init, headers: h });
}

async function userFromToken(token: string): Promise<number | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const hash = await sha256hex(token);
  const r = await sb(
    'jc_sessions?token_hash=eq.' + encodeURIComponent(hash) +
    '&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=user_id&limit=1',
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? Number(rows[0].user_id) : null;
}

/* ---------------------------------------------------------------- 모양 다듬기 */

type Step = { id: string; no: string; title: string; badge: string };

function oneLine(v: unknown, n: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}
function cleanUuid(v: unknown): string {
  const s = String(v || '').toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : '';
}

/** 단계 하나 — 자료실 섹터 id 와 화면에 보일 이름만. 모르는 칸은 버린다. */
function cleanStep(x: unknown): Step | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const id = String(o.id || '');
  if (!/^[a-z0-9_]{2,20}$/.test(id)) return null;
  return {
    id,
    no: String(o.no || '').replace(/[^0-9]/g, '').slice(0, 4),
    title: oneLine(o.title, 40),
    badge: oneLine(o.badge, 16),
  };
}

function cleanSteps(v: unknown): Step[] {
  if (!Array.isArray(v)) return [];
  const seen: Record<string, 1> = {};
  const out: Step[] = [];
  for (const item of v) {
    const s = cleanStep(item);
    if (!s || seen[s.id]) continue;
    seen[s.id] = 1;
    out.push(s);
    if (out.length >= MAX_STEPS) break;
  }
  return out;
}

/** 공간 꾸미기 설정 — 여섯 요소의 선택값과 자유 색 두 칸만 남긴다. */
function cleanPrefs(v: unknown): Record<string, string> {
  const o = (v && typeof v === 'object') ? v as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const k of STR_KEYS) {
    const val = String(o[k] || '');
    if (/^[a-z0-9_]{2,20}$/.test(val)) out[k] = val;
  }
  for (const k of HEX_KEYS) {
    const val = String(o[k] || '').toUpperCase();
    out[k] = /^#[0-9A-F]{6}$/.test(val) ? val : '';
  }
  return out;
}

/* ---------------------------------------------------------------- 동작 */

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) return bad(origin, 'server', '서버 설정이 비어 있습니다.', 500);

  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return bad(origin, 'bad_request', '요청이 너무 큽니다.', 413);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad(origin, 'bad_request', '요청을 읽지 못했습니다.');
  }
  if (!body || typeof body !== 'object') return bad(origin, 'bad_request', '요청을 읽지 못했습니다.');

  const action = String(body.action || '');
  const userId = await userFromToken(String(body.session_token || ''));
  if (!userId) return bad(origin, 'session', '로그인이 풀렸습니다. 다시 로그인해 주세요.', 401);

  /* --- 목록 --- */
  if (action === 'list') {
    const r = await sb('jc_my_decks?user_id=eq.' + userId +
      '&select=id,name,steps,created_at,updated_at&order=updated_at.desc&limit=' + MAX_DECKS);
    if (!r.ok) return bad(origin, 'server', '덱 목록을 읽지 못했습니다.', 500);
    const rows = await r.json();
    return out(200, {
      ok: true,
      decks: (rows || []).map((d: Record<string, unknown>) => ({
        id: d.id,
        name: d.name,
        steps: cleanSteps(d.steps),
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
    }, origin);
  }

  /* --- 저장(새 덱 / 있던 덱) --- */
  if (action === 'save') {
    const deck = (body.deck && typeof body.deck === 'object') ? body.deck as Record<string, unknown> : {};
    const name = oneLine(deck.name, MAX_NAME);
    const steps = cleanSteps(deck.steps);
    if (!name) return bad(origin, 'bad_name', '이름은 1~' + MAX_NAME + '자로 적어 주세요.');
    if (!steps.length) return bad(origin, 'bad_deck', '담을 자료가 없습니다.');

    const id = cleanUuid(deck.id);
    if (id) {
      const patch = await sb('jc_my_decks?id=eq.' + id + '&user_id=eq.' + userId, {
        method: 'PATCH',
        headers: { 'prefer': 'return=representation' },
        body: JSON.stringify({ name, steps, updated_at: new Date().toISOString() }),
      });
      if (!patch.ok) return bad(origin, 'server', '덱을 고치지 못했습니다.', 500);
      const rows = await patch.json();
      if (!Array.isArray(rows) || !rows.length) return bad(origin, 'not_found', '그 덱을 찾지 못했어요.', 404);
      return out(200, { ok: true, deck: { ...rows[0], steps: cleanSteps(rows[0].steps) } }, origin);
    }

    /* 새 덱 — 사용자당 상한을 먼저 센다 */
    const cnt = await sb('jc_my_decks?user_id=eq.' + userId + '&select=id', {
      headers: { prefer: 'count=exact', range: '0-0' },
    });
    const total = Number((cnt.headers.get('content-range') || '/').split('/')[1] || 0);
    if (total >= MAX_DECKS) {
      return bad(origin, 'too_many', '저장할 수 있는 덱 수(' + MAX_DECKS + '개)를 넘었어요. 쓰지 않는 덱을 지워 주세요.');
    }
    const made = await sb('jc_my_decks', {
      method: 'POST',
      headers: { 'prefer': 'return=representation' },
      body: JSON.stringify({ user_id: userId, name, steps }),
    });
    if (!made.ok) return bad(origin, 'server', '덱을 저장하지 못했습니다.', 500);
    const rows = await made.json();
    const first = Array.isArray(rows) ? rows[0] : null;
    if (!first) return bad(origin, 'server', '덱을 저장하지 못했습니다.', 500);
    return out(200, { ok: true, deck: { ...first, steps: cleanSteps(first.steps) } }, origin);
  }

  /* --- 이름 바꾸기 --- */
  if (action === 'rename') {
    const id = cleanUuid(body.id);
    const name = oneLine(body.name, MAX_NAME);
    if (!id) return bad(origin, 'not_found', '그 덱을 찾지 못했어요.', 404);
    if (!name) return bad(origin, 'bad_name', '이름은 1~' + MAX_NAME + '자로 적어 주세요.');
    const r = await sb('jc_my_decks?id=eq.' + id + '&user_id=eq.' + userId, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return bad(origin, 'server', '이름을 바꾸지 못했습니다.', 500);
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return bad(origin, 'not_found', '그 덱을 찾지 못했어요.', 404);
    return out(200, { ok: true, deck: { ...rows[0], steps: cleanSteps(rows[0].steps) } }, origin);
  }

  /* --- 지우기 --- */
  if (action === 'delete') {
    const id = cleanUuid(body.id);
    if (!id) return bad(origin, 'not_found', '그 덱을 찾지 못했어요.', 404);
    const r = await sb('jc_my_decks?id=eq.' + id + '&user_id=eq.' + userId, { method: 'DELETE' });
    if (!r.ok) return bad(origin, 'server', '덱을 지우지 못했습니다.', 500);
    return out(200, { ok: true }, origin);
  }

  /* --- 공간 꾸미기 설정 읽기 --- */
  if (action === 'prefs_get') {
    const r = await sb('jc_my_deck_prefs?user_id=eq.' + userId + '&select=theme,prefs');
    if (!r.ok) return bad(origin, 'server', '설정을 읽지 못했습니다.', 500);
    const rows = await r.json();
    const prefs: Record<string, unknown> = {};
    for (const row of (rows || [])) {
      const t = String((row as Record<string, unknown>).theme || '');
      if (THEMES.includes(t)) prefs[t] = cleanPrefs((row as Record<string, unknown>).prefs);
    }
    return out(200, { ok: true, prefs }, origin);
  }

  /* --- 공간 꾸미기 설정 저장(테마 하나) --- */
  if (action === 'prefs_save') {
    const theme = String(body.theme || '');
    if (!THEMES.includes(theme)) return bad(origin, 'bad_request', '테마는 light·sepia·dark 중 하나입니다.');
    const prefs = cleanPrefs(body.prefs);
    const r = await sb('jc_my_deck_prefs?on_conflict=user_id,theme', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, theme, prefs, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return bad(origin, 'server', '설정을 저장하지 못했습니다.', 500);
    return out(200, { ok: true }, origin);
  }

  return bad(origin, 'bad_request', '알 수 없는 요청입니다.');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return bad(origin, 'method', 'POST 만 받습니다.', 405);
  try {
    return await handle(req, origin);
  } catch {
    return bad(origin, 'server', '서버에서 처리하지 못했습니다.', 500);
  }
});
