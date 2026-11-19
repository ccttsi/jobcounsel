// assistant-proxy — 자료실 비서의 서버 쪽 (Supabase Edge Function · Deno)
//
// 키는 **Google Gemini 하나**만 쓴다. 외부 임의 주소를 대신 부르는 길이 없어 SSRF 위험이 없고,
// 모든 사용자가 같은 방식으로 구글 검색 교차 확인(google_search 그라운딩)을 쓸 수 있다.
//
// 하는 일
//   1) session_token 을 jc_sessions(SHA-256 token_hash, 만료 검사)로 확인해 **로그인 사용자만** 통과시킨다.
//   2) Gemini 키를 AES-256-GCM 으로 암호화해 jc_user_api_keys 에 넣고, 끝 4자리만 돌려준다.
//   3) 질의(ask)는 서버 안에서만 키를 풀어 Gemini 를 부르고, 답변 JSON 만 돌려준다.
//      웹 교차 확인을 켜면 google_search 로 확인한 출처를 함께 돌려준다.
//
// 지키는 선
//   · 원본 키는 응답·로그 어디에도 다시 나오지 않는다.
//   · **질문·대화·검색어를 저장하지도, console 에 남기지도 않는다.**
//     DB 에 남는 것은 호출 횟수뿐이다(jc_assistant_usage: user_id, 분, 횟수).
//
// 환경변수 (README 참고)
//   JC_KEY_MASTER_SECRET  필수. 키 암호화 열쇠(32바이트 이상 아무 문자열).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  Supabase 가 자동 주입.
//   JC_ALLOW_ORIGINS      선택. 쉼표로 구분한 허용 출처. 기본 https://ccttsi.github.io
//   JC_GEMINI_MODEL       선택. 기본 gemini-flash-latest.

const enc = new TextEncoder();

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MASTER = Deno.env.get('JC_KEY_MASTER_SECRET') || '';
const MODEL = Deno.env.get('JC_GEMINI_MODEL') || 'gemini-flash-latest';
const ALLOW = (Deno.env.get('JC_ALLOW_ORIGINS') || 'https://ccttsi.github.io')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 32000;      // 요청 본문 상한(바이트)
const MAX_Q = 1200;          // 질문 길이 상한
const MAX_EVIDENCE = 6;      // 근거 개수 상한
const RATE_LIMIT = 12;       // 분당 호출 수
const MODES = ['easy3', 'mock', 'compare', 'opening'];

const SYS = [
  '당신은 「직업상담 통합 자료실」의 개인 비서입니다. 직업상담사와 구직자의 일을 자료실의 자료로 돕습니다.',
  '',
  '답변 원칙',
  '1. [자료실 근거]에 적힌 내용만 "자료실 기준"으로 말합니다. 근거에 없는 수치·법령·직업 정보는 절대 지어내지 않습니다.',
  '2. [지금 열려 있는 자료]가 함께 오면, 사용자가 "이 자료"라고 할 때 그것을 가리킵니다. 그 자료의 제목과 화면에 보이는 내용 안에서 설명합니다.',
  '3. [외부 확인]이 함께 오면 답을 세 덩이로 나눠 씁니다.',
  '   · 자료실 기준 — 어떤 자료의 무엇인지(섹터·제목)와 기준 시점을 함께.',
  '   · 외부 확인 — 웹에서 확인된 내용과 출처 주소. 확인된 범위만.',
  '   · 해석 — 둘이 같으면 같다고, 다르면 무엇이 어떻게 다른지와 상담 현장에서 어떻게 쓸지.',
  '   외부 확인이 없으면 외부 사실을 말하지 않습니다.',
  '4. 근거만으로 답할 수 없으면 "자료실 자료에서는 확인하지 못했어요"라고 솔직히 말하고, 가장 가까운 자료를 안내합니다.',
  '5. 말투는 친절하고 따뜻한 직업상담사입니다. 존댓말로, 결론부터 3~6문장. 필요하면 짧은 목록(최대 5개)을 씁니다.',
  '6. 사용자가 적은 내담자 이름·연락처 같은 개인정보는 답변에 다시 쓰지 않습니다. 사례를 말할 때는 "내담자"라고만 씁니다.',
  '7. 법률·의학적 단정은 하지 않습니다. "자료실의 근거"와 "현장에서 확인할 부분"을 구분합니다.',
  '8. 자료를 안내할 때는 근거에 적힌 주소만 씁니다. 없는 주소를 만들지 않습니다.',
  '9. 답변은 반드시 JSON 하나로만 씁니다: {"answer":"…","refs":["e1","e2"]}',
  '   refs 에는 실제로 답에 쓴 근거 번호만 최대 3개 적습니다. 쓴 근거가 없으면 [] 입니다.',
].join('\n');

/* 실무 활용 모드 — 화면의 빠른 버튼이 이 값을 보낸다. */
const MODE_TXT: Record<string, string> = {
  easy3: [
    '이번 답변은 「내담자 눈높이 쉬운 3줄」 모드입니다.',
    '- 내담자에게 그대로 읽어 줄 수 있는 쉬운 말로 딱 3줄. 각 줄은 40자 안쪽.',
    '- 전문용어(구제, 수급자격, 고용보험법 등)는 일상말로 풀어 씁니다.',
    '- 3줄 뒤에 "자료실에서 확인한 근거"를 한 줄 덧붙입니다.',
  ].join('\n'),
  mock: [
    '이번 답변은 「비식별 모의면접·서류 피드백」 모드입니다.',
    '- 이름·연락처·회사 실명은 쓰지 않고 "지원자"로만 적습니다.',
    '- 면접: 예상 질문 2개와 각 질문의 의도, 답변 뼈대(첫 문장 포함)를 자료실 면접 자료 기준으로 적습니다.',
    '- 서류: 지원자가 준 문장에서 고칠 곳 1~2개와 고친 예시 문장을 자료실 공고 해부 기준으로 적습니다.',
    '- 실제 기업·인물을 특정하지 않습니다.',
  ].join('\n'),
  compare: [
    '이번 답변은 「교차 비교 요약」 모드입니다.',
    '- 두 대상(산업·기업·직무·자격 등)을 같은 축으로 나란히 비교합니다. 축은 자료실 데이터에 있는 것만 씁니다.',
    '- 각 축에 자료실 수치와 기준 시점을 붙이고, 자료가 없는 칸은 "자료 없음"으로 둡니다(추정 금지).',
    '- 마지막에 "상담에서 이렇게 쓰세요" 한 줄.',
  ].join('\n'),
  opening: [
    '이번 답변은 「상담 오프닝 질문지」 모드입니다.',
    '- 상담 첫 10분에 쓸 질문 5개를 순서대로: ① 호소 들어 주기 ② 사실 확인 ③ 감정 ④ 자원·제약 ⑤ 다음 한 걸음.',
    '- 질문은 내담자가 예/아니오로 끝내지 않도록 열린 질문으로 씁니다.',
    '- 각 질문 아래에 "왜 이 질문인지" 한 줄.',
  ].join('\n'),
};

/* ---------------------------------------------------------------- 작은 도구 */

function cors(origin: string | null): Headers {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'Origin',
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

function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const b = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i);
  return b;
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function masterKey(): Promise<CryptoKey> {
  if (MASTER.length < 16) throw new Error('no_master');
  const d = await crypto.subtle.digest('SHA-256', enc.encode(MASTER));
  return crypto.subtle.importKey('raw', d, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(plain: string, aad: string): Promise<{ ct: string; iv: string }> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad), tagLength: 128 },
    key, enc.encode(plain),
  );
  return { ct: b64(ct), iv: b64(iv) };
}

async function open_(ct: string, iv: string, aad: string): Promise<string> {
  const key = await masterKey();
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(aad), tagLength: 128 },
    key, unb64(ct),
  );
  return new TextDecoder().decode(pt);
}

/* ---------------------------------------------------------------- Supabase REST */

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

type KeyRow = {
  key_ciphertext: string;
  key_iv: string;
  key_last4: string;
  updated_at: string;
};

async function getKeyRow(userId: number): Promise<KeyRow | null> {
  const r = await sb(
    'jc_user_api_keys?user_id=eq.' + userId + '&provider=eq.gemini' +
    '&select=key_ciphertext,key_iv,key_last4,updated_at&limit=1',
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* ---------------------------------------------------------------- Gemini 호출 */

type Chat = { system: string; user: string };
type WebSrc = { title: string; url: string };
type Reply = { text: string; web: WebSrc[] };

function parseJsonAnswer(text: string): { answer: string; refs: string[] } {
  let raw = String(text || '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  if (fence) raw = fence[1].trim();
  const i = raw.indexOf('{');
  const j = raw.lastIndexOf('}');
  if (i >= 0 && j > i) raw = raw.slice(i, j + 1);
  try {
    const o = JSON.parse(raw);
    const answer = typeof o.answer === 'string' ? o.answer : '';
    const refs = Array.isArray(o.refs) ? o.refs.filter((x: unknown) => typeof x === 'string').slice(0, 3) : [];
    if (answer) return { answer, refs: refs as string[] };
  } catch { /* 아래로 */ }
  return { answer: String(text || '').trim().slice(0, 4000), refs: [] };
}

async function callGemini(key: string, chat: Chat, web: boolean): Promise<Reply> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(MODEL) + ':generateContent';
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: chat.system }] },
    contents: [{ role: 'user', parts: [{ text: chat.user }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1100 },
  };
  if (web) {
    /* 구글 검색 그라운딩 — 자료실 RAG 와 교차 확인한 출처가 groundingMetadata 로 돌아온다. */
    (body as { tools?: unknown[] }).tools = [{ google_search: {} }];
  } else {
    (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('upstream_' + r.status);
  const j = await r.json();
  const cand = j?.candidates?.[0] || {};
  const parts = cand.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text || '').join('') : '';
  const web2: WebSrc[] = [];
  const chunks = cand.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    chunks.forEach((c: { web?: { uri?: string; title?: string } }) => {
      const u = c?.web?.uri;
      if (!u || !/^https?:\/\//.test(u)) return;
      if (web2.some((x) => x.url === u)) return;
      web2.push({ title: String(c.web?.title || u).slice(0, 120), url: u.slice(0, 400) });
    });
  }
  return { text, web: web2.slice(0, 6) };
}

/* ---------------------------------------------------------------- 입력 정리 */

type Evidence = { id: string; title: string; sector: string; url: string; snippet: string };

function cleanEvidence(input: unknown): Evidence[] {
  if (!Array.isArray(input)) return [];
  const out: Evidence[] = [];
  for (const raw of input.slice(0, MAX_EVIDENCE)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const url = String(o.url || '');
    if (!/^\.?\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]*$/.test(url)) continue;   // 자료실 안 주소만
    out.push({
      id: 'e' + (out.length + 1),
      title: String(o.title || '').slice(0, 120),
      sector: String(o.sector || '').slice(0, 40),
      url: url.slice(0, 300),
      snippet: String(o.snippet || '').slice(0, 400),
    });
  }
  return out;
}

/* 지금 열려 있는 자료 — 사용자가 "이 자료"라고 할 때의 그 자료. */
type Page = { path: string; title: string; heading: string; desc: string; text: string };

function cleanPage(input: unknown): Page | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const clean = (s: unknown, n: number) => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, n);
  const p: Page = {
    path: clean(o.path, 200),
    title: clean(o.title, 120),
    heading: clean(o.heading, 120),
    desc: clean(o.desc, 240),
    text: clean(o.text, 700),
  };
  return (p.title || p.text) ? p : null;
}

function buildUser(question: string, ev: Evidence[], page: Page | null, web: boolean): string {
  const lines: string[] = [];
  lines.push('[자료실 근거]');
  if (!ev.length) lines.push('(전달된 근거 없음)');
  ev.forEach((e) => {
    lines.push(`${e.id} · 섹터: ${e.sector} · 제목: ${e.title}`);
    if (e.snippet) lines.push('내용: ' + e.snippet);
    lines.push('주소: ' + e.url);
  });
  if (page) {
    lines.push('', '[지금 열려 있는 자료]');
    lines.push('주소: ' + page.path);
    if (page.title) lines.push('화면 제목: ' + page.title);
    if (page.heading) lines.push('큰 제목: ' + page.heading);
    if (page.desc) lines.push('설명: ' + page.desc);
    if (page.text) lines.push('본문 일부: ' + page.text);
  }
  lines.push('', '[질문]', question);
  lines.push('', web
    ? '자료실 근거와 구글 검색 결과를 나눠서 답하세요. 확인되지 않은 수치는 쓰지 마세요. JSON 하나로만 답하세요.'
    : '자료실 근거 안에서만 답하고, JSON 하나로만 답하세요.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------- 동작 */

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) return bad(origin, 'server', '서버 설정이 비어 있습니다.', 500);
  if (MASTER.length < 16) return bad(origin, 'server', '키 암호화 열쇠(JC_KEY_MASTER_SECRET)가 설정되지 않았습니다.', 500);

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

  /* --- 내 키 목록 --- */
  if (action === 'list_keys') {
    const r = await sb('jc_user_api_keys?user_id=eq.' + userId +
      '&select=provider,key_last4,updated_at&order=updated_at.asc');
    if (!r.ok) return bad(origin, 'server', '키 목록을 읽지 못했습니다.', 500);
    const rows = await r.json();
    return out(200, {
      ok: true,
      keys: (rows || []).map((k: { provider: string; key_last4: string; updated_at: string }) => ({
        provider: k.provider,
        masked: '****' + (k.key_last4 || ''),
        updated_at: k.updated_at,
      })),
    }, origin);
  }

  /* --- 키 등록·교체 --- */
  if (action === 'set_key') {
    const key = String(body.key || '').trim();
    if (key.length < 8 || key.length > 400 || /\s/.test(key)) {
      return bad(origin, 'bad_key', '키 형식을 확인해 주세요.');
    }
    const last4 = key.slice(-4);
    const sealed = await seal(key, userId + ':gemini');
    const row = {
      user_id: userId,
      provider: 'gemini',
      key_ciphertext: sealed.ct,
      key_iv: sealed.iv,
      key_last4: last4,
      updated_at: new Date().toISOString(),
    };
    const r = await sb('jc_user_api_keys?on_conflict=user_id,provider', {
      method: 'POST',
      headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) return bad(origin, 'server', '키를 저장하지 못했습니다.', 500);
    return out(200, { ok: true, provider: 'gemini', masked: '****' + last4 }, origin);
  }

  /* --- 키 삭제 --- */
  if (action === 'delete_key') {
    const r = await sb('jc_user_api_keys?user_id=eq.' + userId + '&provider=eq.gemini', {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    });
    if (!r.ok) return bad(origin, 'server', '키를 지우지 못했습니다.', 500);
    return out(200, { ok: true }, origin);
  }

  /* --- 비서 질의 --- */
  if (action === 'ask') {
    const question = String(body.question || '').trim();
    if (question.length < 2) return bad(origin, 'bad_request', '질문을 조금 더 적어 주세요.');
    if (question.length > MAX_Q) return bad(origin, 'bad_request', '질문이 너무 깁니다. 조금 줄여 주세요.', 413);

    const row = await getKeyRow(userId);
    if (!row) return bad(origin, 'no_key', '등록된 키가 없습니다. 내 키를 먼저 등록해 주세요.', 404);

    const limit = await sb('rpc/jc_assistant_take', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_limit: RATE_LIMIT, p_window_sec: 60 }),
    });
    if (limit.ok) {
      const left = await limit.json();
      if (typeof left === 'number' && left < 0) {
        return bad(origin, 'rate', '잠깐 쉬어 가요. 1분에 ' + RATE_LIMIT + '번까지 여쭤볼 수 있습니다.', 429);
      }
    }

    let key = '';
    try {
      key = await open_(row.key_ciphertext, row.key_iv, userId + ':gemini');
    } catch {
      return bad(origin, 'bad_key', '저장된 키를 풀지 못했습니다. 키를 다시 등록해 주세요.', 409);
    }

    const ev = cleanEvidence(body.evidence);
    const page = cleanPage(body.page);
    const mode = MODES.includes(String(body.mode || '')) ? String(body.mode) : '';
    const webOn = !!body.websearch;

    let system = SYS;
    if (mode) system += '\n\n' + MODE_TXT[mode];

    const chat: Chat = { system, user: buildUser(question, ev, page, webOn) };
    let reply: Reply;
    try {
      reply = await callGemini(key, chat, webOn);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'upstream';
      if (/^upstream_(401|403)$/.test(msg)) return bad(origin, 'bad_key', '키가 거부되었습니다. 키를 다시 확인해 주세요.', 400);
      if (/^upstream_429$/.test(msg)) return bad(origin, 'quota', '제공자의 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.', 429);
      return bad(origin, 'upstream', 'AI 서비스에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 502);
    }

    const { answer, refs } = parseJsonAnswer(reply.text);
    const picked = refs.length ? ev.filter((e) => refs.includes(e.id)) : ev.slice(0, 2);
    return out(200, {
      ok: true,
      answer: answer.slice(0, 4000),
      references: picked.map((e) => ({ title: e.title, sector: e.sector, url: e.url, snippet: e.snippet })),
      web: webOn ? reply.web : [],
      websearch: webOn,
      mode: mode || null,
      provider: 'gemini',
    }, origin);
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
