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
//      stream:true 면 :streamGenerateContent(SSE)로 글자를 바로 흘려보내고, 끝에 done 이벤트로 답·모델·근거·웹 출처를 보낸다.
//      스트림이 열리는 순간 stage 이벤트({stage:'thinking'})를 한 번 보내, 기다리는 사람에게 「추론 중」을 알린다.
//   4) 내 대화 기록함(history_*) — 스레드 목록·메시지의 저장·조회·이름변경·삭제·전체비우기.
//      user_id 는 언제나 session_token 에서만 정하고, 모든 쿼리에 user_id 조건을 붙인다.
//   5) 연결 테스트(ping) — 9초 안에 끝난다. 건너뛴 모델은 모델명·사유·HTTP 코드만 `skipped` 로 돌려주고,
//      타임아웃·5xx로 밀렸을 때만 구글 공식 상태 피드를 2초 안에 확인해 `google_status` 로 붙인다.
//
// 지키는 선
//   · 원본 키는 응답·로그 어디에도 다시 나오지 않는다.
//   · **질문·검색어를 console 에 남기지 않는다.** 대화는 사용자가 로그인했을 때만,
//     그 사람의 기록함(jc_assistant_threads·jc_assistant_messages)에만 쌓이고 다른 사람은 볼 수 없다.
//     남는 것은 그 대화와 호출 횟수(jc_assistant_usage: user_id, 분, 횟수)뿐이다.
//
// 환경변수 (README 참고)
//   JC_KEY_MASTER_SECRET  필수. 키 암호화 열쇠(32바이트 이상 아무 문자열).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  Supabase 가 자동 주입.
//   JC_ALLOW_ORIGINS      선택. 쉼표로 구분한 허용 출처. 기본 https://witw.pages.dev,https://ccttsi.github.io,https://ccttsi.pages.dev
//   JC_GEMINI_MODEL       선택. 1순위 모델 이름. 비우면 무료 폴백 체인(3.8-flash → 3.6-flash → 3.5-flash-lite → 3.1-flash-lite)을 쓴다.
//
// 무료 한도(429)는 **모델마다 따로** 잡혀 있어, 한도가 찬 모델은 건너뛰고 다음 무료 모델로 이어서 답한다.
// 답한 모델 이름은 응답 JSON 의 model 칸으로 돌려준다(키 탭 「연결 테스트」가 이 값을 보여 준다).

/* 질문 범위 판정기 — assistant/scope.js 와 바이트까지 같은 사본(validate_repo.py 가 동기를 본다).
   브라우저도 보내기 전에 같은 판정을 하지만, 그것은 건너뛸 수 있으므로 여기가 최종 관문이다. */
import './scope.js';
type ScopeVerdict = { verdict: 'in' | 'mixed' | 'off'; cats: string[]; label: string; message: string; note: string };
const SCOPE = (globalThis as unknown as { JCAssistScope: { check: (q: string) => ScopeVerdict } }).JCAssistScope;

/* 지침·프롬프트 조립·딸린 글 정리 — prompt.ts 하나를 서버와 성적표 러너(ops/eval/aup_eval.mjs)가 함께 쓴다.
   주입·탈옥 분류기(guard.js, assistant/guard.js 와 바이트까지 같은 사본)도 prompt.ts 가 불러 GUARD 로 내보낸다. */
import {
  GUARD, SYS, SYS_SIGS, FMT_JSON, FMT_PLAIN, MODES, MODE_TXT,
  cleanEvidence, cleanPage, cleanMap, cleanRoute, buildUser,
} from './prompt.ts';
import type { Evidence } from './prompt.ts';

const enc = new TextEncoder();

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MASTER = Deno.env.get('JC_KEY_MASTER_SECRET') || '';
const MODEL_PREF = (Deno.env.get('JC_GEMINI_MODEL') || '').trim();
const ALLOW = (Deno.env.get('JC_ALLOW_ORIGINS') || 'https://witw.pages.dev,https://ccttsi.github.io,https://ccttsi.pages.dev')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 256000;     // 요청 본문 상한(바이트) — 대화 한 편(30턴×답 4,000자)을 저장할 수 있는 크기
const MAX_ASK_BODY = 32000;  // 질의(ask) 요청 상한 — 질문 1,200자·근거 6건이면 넉넉하다
const MAX_Q = 1200;          // 질문 길이 상한
const RATE_LIMIT = 12;       // 분당 호출 수

/* 무료 폴백 체인 — 2026-11 Google AI Studio 문서 확인 기준.
   모델별 무료 한도는 따로 잡히고(429 RESOURCE_EXHAUSTED), 한 모델이 차면 다음 모델로 넘어간다.
   3.7-flash 는 3.8-flash 로 자동 라우팅되어 따로 셀 한도가 없으므로 넣지 않는다. */
const FALLBACK_CHAIN = [
  'gemini-3.8-flash',        // 최신 Flash — 기본 1순위
  'gemini-3.6-flash',        // 이전 세대 Flash — 별도 무료 한도
  'gemini-3.5-flash-lite',   // Lite — 무료 한도가 크다
  'gemini-3.1-flash-lite',   // Lite 예비 — 마지막 한 칸
];
/* JC_GEMINI_MODEL 이 있으면 그 모델을 1순위로 두고 뒤에 같은 체인을 잇는다(중복은 뺀다). */
const MODEL_TRIES = MODEL_PREF
  ? [MODEL_PREF].concat(FALLBACK_CHAIN.filter((m) => m !== MODEL_PREF))
  : FALLBACK_CHAIN.slice();

const MODEL_TIMEOUT_MS = 12000;   // 모델 한 번 호출 상한(일반 대화 첫 응답) — 25초는 너무 느렸다
const CHAIN_DEADLINE_MS = 55000;  // 체인 전체 상한(Edge Function 실행 한도 안쪽)
const PING_TIMEOUT_MS = 8000;     // 연결 테스트 — 모델 한 번 호출 상한(타사이트처럼 10초 안쪽)
const PING_DEADLINE_MS = 9000;    // 연결 테스트 — 체인 전체 상한(구글 상태 확인 2초는 겹쳐 돌린다)
const STATUS_TIMEOUT_MS = 2000;   // 구글 공식 상태 피드 확인 상한
const STATUS_URL = 'https://status.cloud.google.com/incidents.json';
const STATUS_PAGE = 'https://status.cloud.google.com/';

/* 요청마다 바뀌는 보안 표식 — 답에 보이면 지침이 샌 것이다. */
function newCanary(): string {
  return 'JC-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
}

/* 「연결 테스트」 — 키가 실제로 도는지 한 번 불러 보는 아주 짧은 대화.
   출력 토큰을 16개로 묶으므로 답도 그 안에 들어오는 한 문장(15자 안쪽)만 시킨다. */
const PING_SYS = [
  '연결 확인용 짧은 대화입니다.',
  '사용자의 인사에는 "연결됐어요"처럼 15자 안쪽의 아주 짧은 한 문장으로만 답하세요.',
  'JSON·목록·설명·이모지 없이 문장 하나만 씁니다.',
].join('\n');

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

function bad(origin: string | null, code: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  return out(status, Object.assign({}, extra || {}, { ok: false, error: code, message }), origin);
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

/* 분당 한도 — 한 표(분 단위 카운터)에 넘기면 true. DB 가 답하지 않으면 그냥 통과시킨다. */
async function overRate(userId: number): Promise<boolean> {
  const r = await sb('rpc/jc_assistant_take', {
    method: 'POST',
    body: JSON.stringify({ p_user: userId, p_limit: RATE_LIMIT, p_window_sec: 60 }),
  });
  if (!r.ok) return false;
  try {
    const left = await r.json();
    return typeof left === 'number' && left < 0;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- 내 대화 기록함 */

/* 한 스레드에 담는 양 — 화면(assets/assistant.js)의 상한과 같은 값이어야 한다. */
const HIST_THREADS_MAX = 60;
const HIST_TURNS_MAX = 40;
const HIST_TITLE_MAX = 80;
const HIST_Q_MAX = 1200;
const HIST_A_MAX = 4000;

function cleanUuid(v: unknown): string {
  const s = String(v || '').toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : '';
}

function oneLine(v: unknown, n: number): string {
  return String(v || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, n);
}

/* 제목 — 사용자가 적었으면 그대로, 아니면 첫 질문을 한 줄로 줄인다. */
function cleanTitle(v: unknown, firstQ: string): string {
  const t = oneLine(v, HIST_TITLE_MAX);
  if (t) return t;
  const q = oneLine(firstQ, 44);
  return q || '새 대화';
}

/* 답변 본문 — 줄바꿈은 살리고 제어문자만 지운다. */
function cleanBody(v: unknown, n: number): string {
  return String(v || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, n);
}

const PATH_RE = /^\.?\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]*$/;

function cleanRefs(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [];
  const out: unknown[] = [];
  for (const raw of v.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const url = String(o.url || '');
    if (!PATH_RE.test(url)) continue;                    // 자료실 안 주소만
    out.push({
      title: oneLine(o.title, 120),
      sector: oneLine(o.sector, 40),
      url: url.slice(0, 300),
    });
  }
  return out;
}

function cleanWeb(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [];
  const out: unknown[] = [];
  for (const raw of v.slice(0, 5)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const url = String(o.url || '');
    if (!/^https?:\/\//.test(url) || url.length > 400) continue;
    out.push({ title: oneLine(o.title, 120), url });
  }
  return out;
}

type TurnRow = {
  turn_id: string;
  seq: number;
  question: string;
  answer: string;
  refs: unknown;
  web: unknown;
  mode: string | null;
  websearch: boolean;
  err: boolean;
};

/* 브라우저가 보낸 메시지 배열을 저장할 모양으로 다듬는다. 빈 질문은 버린다. */
function cleanTurns(v: unknown): TurnRow[] {
  if (!Array.isArray(v)) return [];
  const out: Array<TurnRow> = [];
  for (const raw of v.slice(-HIST_TURNS_MAX)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const q = cleanBody(o.q, HIST_Q_MAX).trim();
    if (!q) continue;
    out.push({
      turn_id: oneLine(o.id, 40) || 't' + (out.length + 1),
      seq: out.length + 1,
      question: q,
      answer: cleanBody(o.a, HIST_A_MAX),
      refs: cleanRefs(o.refs),
      web: cleanWeb(o.web),
      mode: MODES.includes(String(o.mode || '')) ? String(o.mode) : null,
      websearch: o.websearch === true,
      err: o.err === true,
    });
  }
  return out;
}

/* 상한을 넘긴 오래된 스레드는 정리한다(대화가 무한정 쌓여 저장소를 먹지 않게). */
async function trimThreads(userId: number): Promise<void> {
  const r = await sb('jc_assistant_threads?user_id=eq.' + userId +
    '&select=id&order=updated_at.desc&offset=' + HIST_THREADS_MAX);
  if (!r.ok) return;
  let rows: Array<{ id: string }> = [];
  try { rows = await r.json(); } catch { return; }
  for (const row of rows.slice(0, 20)) {
    const id = cleanUuid(row.id);
    if (id) await sb('jc_assistant_threads?id=eq.' + id + '&user_id=eq.' + userId, { method: 'DELETE' });
  }
}

async function threadRow(userId: number, id: string): Promise<{ id: string; title: string } | null> {
  const r = await sb('jc_assistant_threads?id=eq.' + id + '&user_id=eq.' + userId +
    '&select=id,title&limit=1');
  if (!r.ok) return null;
  let rows: Array<{ id: string; title: string }> = [];
  try { rows = await r.json(); } catch { return null; }
  return rows.length ? rows[0] : null;
}

/* ---------------------------------------------------------------- Gemini 호출 */

type Chat = { system: string; user: string };
type WebSrc = { title: string; url: string };
type Reply = { text: string; web: WebSrc[]; model: string };
type Ask = { web: boolean; json: boolean; maxTokens: number; thinking: boolean };
type FailKind = 'quota' | 'key' | 'missing' | 'timeout' | 'transient' | 'request';

/* 건너뛴 모델 한 줄 — 모델 이름·사유·HTTP 코드만 담는다. 키·요청 본문·질문·오류 원문은 담지 않는다. */
type Skip = { model: string; reason: string; code: number };
const SKIP_REASON: Record<FailKind, string> = {
  quota: '한도초과',
  key: '권한',
  missing: '모델없음',
  timeout: '타임아웃',
  transient: '일시오류',
  request: '요청거부',
};

/* 체인 실행 옵션 — 연결 테스트는 짧은 상한과 건너뛴 이유 수집을 함께 넘긴다. */
type ChainOpts = {
  timeoutMs?: number;                              // 모델 한 번 호출 상한(기본 MODEL_TIMEOUT_MS)
  deadlineMs?: number;                             // 체인 전체 상한(기본 CHAIN_DEADLINE_MS)
  skipped?: Skip[];                                // 건너뛴 모델을 여기에 쌓는다
  onSkip?: (s: Skip) => void;                      // 건너뛸 때마다 알린다(연결 테스트가 구글 상태 확인을 겹쳐 띄운다)
};

/* 한 모델 호출의 결과 — 실패는 '왜'만 남긴다. 구글이 준 오류 본문은 분류에만 쓰고 응답·로그에 남기지 않는다. */
type Attempt =
  | { ok: true; text: string; web: WebSrc[] }
  | { ok: false; kind: FailKind; code: number };

/* 스트리밍 한 번의 결과 — emitted 는 '이미 글자가 나갔는지'. 나갔으면 다른 모델로 갈아타지 않는다. */
type StreamOut =
  | { ok: true; text: string; web: WebSrc[] }
  | { ok: false; kind: FailKind; emitted: boolean };

/* 체인이 끝까지 갔다 — 어느 쪽이었는지만 handler 에게 전한다. */
class ChainFail extends Error {
  kind: 'key' | 'quota' | 'upstream';
  constructor(kind: 'key' | 'quota' | 'upstream') {
    super(kind);
    this.kind = kind;
  }
}

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

/* 요청 본문 — thinkingLevel 'low' 로 3.x Flash 의 첫 글자 지연을 줄인다(미지원 모델은 400 → 빼고 재시도). */
function buildBody(chat: Chat, ask: Ask): Record<string, unknown> {
  const gen: Record<string, unknown> = { temperature: 0.3, maxOutputTokens: ask.maxTokens };
  if (ask.thinking) gen.thinkingConfig = { thinkingLevel: 'low' };
  if (ask.json) gen.responseMimeType = 'application/json';
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: chat.system }] },
    contents: [{ role: 'user', parts: [{ text: chat.user }] }],
    generationConfig: gen,
  };
  if (ask.web) {
    /* 구글 검색 그라운딩 — 자료실 RAG 와 교차 확인한 출처가 groundingMetadata 로 돌아온다. */
    (body as { tools?: unknown[] }).tools = [{ google_search: {} }];
  }
  return body;
}

/* 실패를 '왜'로 분류한다. 상태 코드와 오류 이름만 읽고 본문은 남기지 않는다. */
async function classifyFail(r: Response): Promise<{ kind: FailKind; code: number }> {
  let status = '';
  let message = '';
  try {
    const err = await r.json();
    status = String(err?.error?.status || '');
    message = String(err?.error?.message || '');
  } catch { /* 본문이 비어 있어도 상태 코드로 판단한다 */ }
  return { kind: classifyTag(status, message, r.status), code: r.status };
}

function classifyTag(status: string, message: string, code: number): FailKind {
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') return 'quota';
  if (code === 401 || code === 403 || status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED') return 'key';
  if (/api[\s_-]?key|credential|permission/i.test(message)) return 'key';
  if (code === 404) return 'missing';                       // 이름이 바뀌었거나 내려간 모델
  if (code >= 500 || status === 'UNAVAILABLE' || status === 'INTERNAL') return 'transient';
  return 'request';                                        // 400 등 — 요청 자체의 문제
}

/* 요청이 400 으로 막히면 한 가지만 빼고 그 모델에 한 번 더 물어본다(thinking → tools). */
function relaxAsk(ask: Ask, kind: FailKind): Ask | null {
  if (kind !== 'request') return null;
  if (ask.thinking) return { ...ask, thinking: false };
  if (ask.web) return { ...ask, web: false };
  return null;
}

/* 웹 출처 목록 — 스트림·일반 응답 두 곳에서 같이 쓴다. */
function addWeb(list: WebSrc[], chunks: unknown): void {
  if (!Array.isArray(chunks)) return;
  chunks.forEach((c: { web?: { uri?: string; title?: string } }) => {
    const u = c?.web?.uri;
    if (!u || !/^https?:\/\//.test(u)) return;
    if (list.some((x) => x.url === u)) return;
    list.push({ title: String(c.web?.title || u).slice(0, 120), url: u.slice(0, 400) });
  });
}

async function geminiOnce(key: string, chat: Chat, model: string, ask: Ask, timeoutMs = MODEL_TIMEOUT_MS): Promise<Attempt> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent';

  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(buildBody(chat, ask)),
    });
  } catch (e) {
    /* 시간 초과와 연결 실패를 구분한다 — 시간 초과일 때만 구글 서버 상태를 확인해 보여 준다. */
    const name = String((e as { name?: string })?.name || '');
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, kind: 'timeout', code: 0 };
    return { ok: false, kind: 'transient', code: 0 };      // 연결 실패 — 다음 모델로
  }
  if (!r.ok) {
    const f = await classifyFail(r);
    return { ok: false, kind: f.kind, code: f.code };
  }

  const j = await r.json();
  const cand = j?.candidates?.[0] || {};
  const parts = cand.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text || '').join('') : '';
  const web2: WebSrc[] = [];
  addWeb(web2, cand.groundingMetadata?.groundingChunks);
  if (!text && cand.finishReason && cand.finishReason !== 'STOP') return { ok: false, kind: 'request', code: 200 };
  return { ok: true, text, web: web2.slice(0, 6) };
}

/* 스트리밍 한 번 — 글자가 오는 대로 onDelta 로 넘긴다. 첫 글자 전 오류면 다음 모델로 넘어갈 수 있다. */
async function streamModelOnce(
  key: string,
  chat: Chat,
  model: string,
  ask: Ask,
  onDelta: (s: string) => void,
): Promise<StreamOut> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':streamGenerateContent?alt=sse';

  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, accept: 'text/event-stream' },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS + 15000),
      body: JSON.stringify(buildBody(chat, ask)),
    });
  } catch {
    return { ok: false, kind: 'transient', emitted: false };
  }
  if (!r.ok) {
    const f = await classifyFail(r);
    return { ok: false, kind: f.kind, emitted: false };
  }
  if (!r.body) return { ok: false, kind: 'transient', emitted: false };

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  const web2: WebSrc[] = [];
  let buf = '';
  let text = '';
  let emitted = false;

  /* SSE 한 줄(data: {...})을 풀어 글자·출처를 꺼낸다. 오류가 보이면 그 종류를 돌려준다. */
  const feed = (payload: string): FailKind | null => {
    if (!payload || payload === '[DONE]') return null;
    let j: Record<string, unknown> | null = null;
    try { j = JSON.parse(payload); } catch { return null; }
    const err = (j as { error?: { status?: string; message?: string } })?.error;
    if (err) return classifyTag(String(err.status || ''), String(err.message || ''), 400);
    const cand = (j as { candidates?: Array<Record<string, unknown>> })?.candidates?.[0] || {};
    const parts = cand.content as { parts?: Array<{ text?: string }> } | undefined;
    if (Array.isArray(parts?.parts)) {
      const piece = parts.parts.map((p) => p?.text || '').join('');
      if (piece) { text += piece; emitted = true; onDelta(piece); }
    }
    addWeb(web2, (cand.groundingMetadata as { groundingChunks?: unknown })?.groundingChunks);
    return null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.startsWith('data:')) {
          const kind = feed(line.slice(5).trim());
          if (kind) {
            try { await reader.cancel(); } catch { /* 이미 끝났다 */ }
            return { ok: false, kind, emitted };
          }
        }
        nl = buf.indexOf('\n');
      }
    }
  } catch {
    if (!emitted) return { ok: false, kind: 'transient', emitted: false };
  }

  if (!emitted && !text.trim()) return { ok: false, kind: 'transient', emitted: false };
  return { ok: true, text, web: web2.slice(0, 6) };
}

/* 무료 한도가 찬 모델은 건너뛰고 다음 무료 모델로 — 실제로 답한 모델 이름을 함께 돌려준다(일반 응답).
   chain.skipped 를 넘기면 「어느 모델을 왜 건너뛰었는지」를 모아 준다(연결 테스트가 그대로 보여 준다). */
async function callGemini(key: string, chat: Chat, ask: Ask, chain: ChainOpts = {}): Promise<Reply> {
  const started = Date.now();
  const deadline = started + (chain.deadlineMs ?? CHAIN_DEADLINE_MS);
  const perModel = chain.timeoutMs ?? MODEL_TIMEOUT_MS;
  let tried = 0;
  let allQuota = true;

  for (const model of MODEL_TRIES) {
    if (deadline - Date.now() <= 0) break;
    let opts = ask;
    let quotaOnly = true;

    for (;;) {
      /* 남은 시간을 넘기지 않게 모델 한 번의 상한을 깎는다 — 연결 테스트가 10초를 넘지 않는 이유. */
      const budget = Math.min(perModel, deadline - Date.now());
      const attempt = await geminiOnce(key, chat, model, opts, budget);
      if (attempt.ok) return { text: attempt.text, web: attempt.web, model };
      if (attempt.kind === 'key') throw new ChainFail('key');       // 키가 틀렸다 — 다른 모델도 마찬가지다
      const next = relaxAsk(opts, attempt.kind);
      if (next && deadline - Date.now() > 1500) { opts = next; continue; }
      if (attempt.kind === 'request') throw new ChainFail('upstream');
      if (attempt.kind !== 'quota') quotaOnly = false;
      const skip: Skip = { model, reason: SKIP_REASON[attempt.kind], code: attempt.code };
      if (chain.skipped) chain.skipped.push(skip);
      if (chain.onSkip) { try { chain.onSkip(skip); } catch { /* 알림 실패는 무시 */ } }
      break;
    }

    tried++;
    if (!quotaOnly) allQuota = false;
  }

  throw new ChainFail(tried > 0 && allQuota ? 'quota' : 'upstream');
}

/* ---------- 구글 공식 서버 상태 ----------
   연결 테스트에서 타임아웃·5xx로 밀렸을 때만 부른다(정상 200·한도초과 429는 추가 호출 없이 넘긴다).
   공개 피드(incidents.json)에서 **아직 안 끝난(end 없음)** 인시던트 중 Gemini·Vertex·AI Studio 관련이
   있는지만 본다. 확인에 실패하면 «정상»이라고 꾸미지 않고 확인하지 못했다고 그대로 알린다. */
const GEMINI_STATUS_RE = /gemini|vertex|generative\s*language|ai\s*studio|google\s*ai/i;

type StatusOut = { text: string; url: string };

function isGeminiIncident(it: Record<string, unknown>): boolean {
  if (!it || it.end) return false;
  const products = Array.isArray(it.affected_products) ? it.affected_products as Array<{ title?: string }> : [];
  const names = [it.service_name, it.external_desc].concat(products.map((p) => p && p.title));
  return names.some((x) => GEMINI_STATUS_RE.test(String(x || '')));
}

async function checkGoogleStatus(): Promise<StatusOut> {
  const unknown: StatusOut = {
    text: '확인하지 못했습니다 (공식 상태 페이지에서 직접 볼 수 있어요)',
    url: STATUS_PAGE,
  };
  try {
    const r = await fetch(STATUS_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!r.ok) return unknown;
    const list: unknown = await r.json();
    if (!Array.isArray(list)) return unknown;
    const hit = list.find((x) => isGeminiIncident(x as Record<string, unknown>)) as
      { external_desc?: string; begin?: string } | undefined;
    if (!hit) return { text: '정상 (공식 장애 공지 없음)', url: STATUS_PAGE };
    const desc = String(hit.external_desc || '진행 중인 장애').replace(/\s+/g, ' ').trim().slice(0, 60);
    const when = String(hit.begin || '').slice(0, 16).replace('T', ' ');
    return { text: '공식 장애/지연 공지 확인됨: ' + desc + (when ? ' (' + when + ' UTC)' : ''), url: STATUS_PAGE };
  } catch {
    return unknown;
  }
}

/* 스트리밍 체인 — 첫 글자가 나가기 전에는 다음 모델로 갈아탈 수 있고, 나간 뒤에는 끝까지 간다. */
async function streamChain(
  key: string,
  chat: Chat,
  ask: Ask,
  onDelta: (s: string) => void,
): Promise<{ reply: Reply } | { fail: 'key' | 'quota' | 'upstream' }> {
  const started = Date.now();
  let tried = 0;
  let allQuota = true;

  for (const model of MODEL_TRIES) {
    if (Date.now() - started >= CHAIN_DEADLINE_MS) break;
    let opts = ask;
    let quotaOnly = true;

    for (;;) {
      const res = await streamModelOnce(key, chat, model, opts, onDelta);
      if (res.ok) return { reply: { text: res.text, web: res.web, model } };
      if (res.emitted) return { fail: 'upstream' };         // 이미 글자가 나갔다 — 갈아타지 않는다
      if (res.kind === 'key') return { fail: 'key' };
      const next = relaxAsk(opts, res.kind);
      if (next) { opts = next; continue; }
      if (res.kind === 'request') return { fail: 'upstream' };
      if (res.kind !== 'quota') quotaOnly = false;
      break;
    }

    tried++;
    if (!quotaOnly) allQuota = false;
  }

  return { fail: tried > 0 && allQuota ? 'quota' : 'upstream' };
}

/* 스트리밍 답 — 본문은 평문, 맨 끝 [[REFS:e1,e2]] 만 근거 번호로 떼어 낸다. */
function splitRefs(text: string): { answer: string; refs: string[] } {
  let raw = String(text || '');
  const refs: string[] = [];
  const m = /\[\[\s*REFS?\s*:([^\]]*)\]\]/i.exec(raw);
  if (m) {
    m[1].split(/[,;\s]+/).forEach((x) => {
      const id = x.trim().toLowerCase();
      if (/^e\d$/.test(id) && refs.indexOf(id) < 0) refs.push(id);
    });
    raw = (raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length));
  }
  raw = raw.replace(/\[\[\s*REFS?[\s\S]*$/i, '').trim();      // 잘려 들어온 마커도 지운다
  if (!refs.length && /^\s*\{/.test(raw)) {                     // 형식을 어기고 JSON 으로 답한 경우
    const p = parseJsonAnswer(raw);
    return { answer: p.answer.replace(/\s+/g, ' ').trim().slice(0, 4000), refs: p.refs };
  }
  return { answer: raw.slice(0, 4000), refs: refs.slice(0, 3) };
}

/* 체인 실패를 사용자에게 보여 줄 응답으로 옮긴다(대화·연결 테스트 두 곳에서 같은 문구).
   extra 를 주면 걸린 시간·건너뛴 모델·구글 상태 같은 진단을 오류 응답에도 함께 실어 보낸다. */
function chainFail(e: unknown, origin: string | null, extra?: Record<string, unknown>): Response {
  if (e instanceof ChainFail) {
    if (e.kind === 'key') return bad(origin, 'bad_key', '키가 거부되었습니다. 키를 다시 확인해 주세요.', 400, extra);
    if (e.kind === 'quota') {
      return bad(origin, 'quota',
        '무료 모델 ' + MODEL_TRIES.length + '개의 한도를 모두 썼습니다. 1분 뒤(분당 한도) 또는 내일(하루 한도가 새로 채워질 때) 다시 시도해 주세요.', 429, extra);
    }
  }
  return bad(origin, 'upstream', 'AI 서비스에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 502, extra);
}

/* ---------- 스트리밍 응답 (text/event-stream) ----------
   delta(글자) → done(답·모델·근거·웹 출처) 또는 error 한 번. 중간 버퍼링 없이 받는 대로 내보낸다. */

const QUOTA_MSG = '무료 모델 ' + MODEL_TRIES.length + '개의 한도를 모두 썼습니다. 1분 뒤(분당 한도) 또는 내일(하루 한도가 새로 채워질 때) 다시 시도해 주세요.';

function sseHeaders(origin: string | null): Headers {
  const h = cors(origin);
  h.set('content-type', 'text/event-stream; charset=utf-8');
  h.set('x-accel-buffering', 'no');
  return h;
}

function streamAnswer(
  key: string, chat: Chat, ask: Ask, ev: Evidence[], webOn: boolean, mode: string, origin: string | null,
  canary = '',
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
        } catch {
          closed = true;      // 브라우저가 먼저 닫았다
        }
      };
      const end = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* 이미 닫혔다 */ }
      };

      /* 기다리는 사람에게 「지금 무엇 중인지」를 먼저 알린다 — 스트림이 열린 순간이 곧 모델에 물은 순간이다.
         글자(delta) 가기 전에 한 번만 보내므로 스트림 속도를 거의 건드리지 않는다. */
      send('stage', { stage: 'thinking', label: '추론 중' });

      /* 글자를 흘려보내되 끝 48자는 잡아 두고 본다 — 보안 표식·지침 조각이 화면에 닿기 전에 끊는다.
         새어 나온 것이 보이면 그 뒤로는 글자를 보내지 않고, done 에서 답 전체를 안내문으로 바꾼다(화면은 done 의 답으로 덮인다). */
      const HOLD = 48;
      let acc = '';
      let sent = 0;
      let leak = false;
      const onDelta = (d: string) => {
        acc += d;
        if (leak) return;
        if (GUARD.leaked(acc, canary, SYS_SIGS)) { leak = true; return; }
        const upto = acc.length - HOLD;
        if (upto > sent) { send('delta', { t: acc.slice(sent, upto) }); sent = upto; }
      };
      streamChain(key, chat, ask, onDelta).then((out) => {
        if ('reply' in out && (leak || GUARD.leaked(out.reply.text, canary, SYS_SIGS))) {
          send('done', {
            ok: true, answer: GUARD.leakMessage, model: out.reply.model, references: [], web: [],
            websearch: false, mode: mode || null, provider: 'gemini', guard: 'leak',
          });
        } else if ('reply' in out) {
          const { answer, refs } = splitRefs(out.reply.text);
          const picked = refs.length ? ev.filter((e) => refs.includes(e.id)) : ev.slice(0, 2);
          send('done', {
            ok: true,
            answer: answer.slice(0, 4000),
            model: out.reply.model,
            references: picked.map((e) => ({ title: e.title, sector: e.sector, url: e.url, snippet: e.snippet })),
            web: webOn ? out.reply.web : [],
            websearch: webOn,
            mode: mode || null,
            provider: 'gemini',
          });
        } else if (out.fail === 'key') {
          send('error', { ok: false, error: 'bad_key', message: '키가 거부되었습니다. 키를 다시 확인해 주세요.' });
        } else if (out.fail === 'quota') {
          send('error', { ok: false, error: 'quota', message: QUOTA_MSG });
        } else {
          send('error', { ok: false, error: 'upstream', message: 'AI 서비스에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
        }
        end();
      }).catch(() => {
        send('error', { ok: false, error: 'upstream', message: 'AI 서비스에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
        end();
      });
    },
  });
  return new Response(body, { status: 200, headers: sseHeaders(origin) });
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
    if (JSON.stringify(body).length > MAX_ASK_BODY) {
      return bad(origin, 'bad_request', '질문에 딸린 내용이 너무 큽니다. 질문을 조금 줄여 주세요.', 413);
    }
    const question = String(body.question || '').trim();
    if (question.length < 2) return bad(origin, 'bad_request', '질문을 조금 더 적어 주세요.');
    if (question.length > MAX_Q) return bad(origin, 'bad_request', '질문이 너무 깁니다. 조금 줄여 주세요.', 413);

    /* 자료실과 관계없는 요청은 모델을 부르지 않는다(키 한도도 쓰지 않는다) — 웹 확인을 켰든 껐든 같다.
       질문 내용은 남기지 않고, 판정 결과만 응답에 싣는다. */
    /* ① 주입·탈옥 — 범위 판정보다 먼저 본다. 막힌 질문은 모델에 닿지 않는다. */
    const guard = GUARD.check(question);
    if (guard.verdict === 'attack') {
      return out(200, {
        ok: true, answer: GUARD.message, references: [], web: [], websearch: false,
        mode: null, provider: 'guard', model: '', scope: 'guard',
      }, origin);
    }

    /* ② 자료실 범위 */
    const scope = SCOPE.check(question);
    if (scope.verdict === 'off') {
      return out(200, {
        ok: true, answer: scope.message, references: [], web: [], websearch: false,
        mode: null, provider: 'scope', model: '', scope: 'off', scope_cats: scope.cats,
      }, origin);
    }

    const row = await getKeyRow(userId);
    if (!row) return bad(origin, 'no_key', '등록된 키가 없습니다. 내 키를 먼저 등록해 주세요.', 404);

    if (await overRate(userId)) {
      return bad(origin, 'rate', '잠깐 쉬어 가요. 1분에 ' + RATE_LIMIT + '번까지 여쭤볼 수 있습니다.', 429);
    }

    let key = '';
    try {
      key = await open_(row.key_ciphertext, row.key_iv, userId + ':gemini');
    } catch {
      return bad(origin, 'bad_key', '저장된 키를 풀지 못했습니다. 키를 다시 등록해 주세요.', 409);
    }

    const ev = cleanEvidence(body.evidence);
    const page = cleanPage(body.page);
    const map = cleanMap(body.map);
    const route = cleanRoute(body.route);
    const mode = MODES.includes(String(body.mode || '')) ? String(body.mode) : '';
    /* 섞인 질문(「주가랑 채용 일정」)은 웹 확인을 끈다 — 켜 두면 모델이 실제 시세를 찾아 적는다. */
    const webOn = !!body.websearch && scope.verdict !== 'mixed' && guard.verdict !== 'suspect';
    const stream = body.stream === true;

    /* 형식 지시는 프롬프트 맨 끝(Recency)에 둔다 — 모델이 마지막 지시를 가장 잘 따른다. */
    let system = SYS;
    if (mode) system += '\n\n' + MODE_TXT[mode];
    if (scope.verdict === 'mixed') system += '\n\n■ 이번 질문의 범위\n' + scope.note;
    if (guard.verdict === 'suspect') system += '\n\n■ 보안 주의\n' + GUARD.caution;
    const canary = newCanary();
    system += '\n\n■ 보안 표식: ' + canary + ' (이 표식은 어떤 경우에도 답에 쓰지 않습니다)';
    system += '\n\n■ 형식\n' + (stream ? FMT_PLAIN : FMT_JSON);

    const chat: Chat = { system, user: buildUser(question, ev, page, stream, map, route) };

    if (stream) {
      return streamAnswer(key, chat, { web: webOn, json: false, maxTokens: 800, thinking: true }, ev, webOn, mode, origin, canary);
    }

    let reply: Reply;
    try {
      reply = await callGemini(key, chat, { web: webOn, json: !webOn, maxTokens: 1100, thinking: true });
    } catch (e) {
      return chainFail(e, origin);
    }

    if (GUARD.leaked(reply.text, canary, SYS_SIGS)) {
      return out(200, {
        ok: true, answer: GUARD.leakMessage, references: [], web: [], websearch: false,
        mode: mode || null, provider: 'gemini', model: reply.model, guard: 'leak',
      }, origin);
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
      model: reply.model,
      scope: scope.verdict,
    }, origin);
  }

  /* ---------------------------------------------------------------- 내 대화 기록함 */

  /* --- 대화방 목록 --- */
  if (action === 'history_list') {
    const r = await sb('jc_assistant_threads?user_id=eq.' + userId +
      '&select=id,title,turns,created_at,updated_at&order=updated_at.desc&limit=' + HIST_THREADS_MAX);
    if (!r.ok) return bad(origin, 'server', '대화 목록을 읽지 못했습니다.', 500);
    let rows: Array<Record<string, unknown>> = [];
    try { rows = await r.json(); } catch { rows = []; }
    return out(200, {
      ok: true,
      threads: (rows || []).map((x) => ({
        id: x.id,
        title: String(x.title || '새 대화'),
        turns: Number(x.turns || 0),
        created: x.created_at,
        updated: x.updated_at,
      })),
    }, origin);
  }

  /* --- 대화방 하나 열기(메시지 포함) --- */
  if (action === 'history_get') {
    const id = cleanUuid(body.thread_id);
    if (!id) return bad(origin, 'bad_request', '대화방 번호를 확인해 주세요.');
    const tr = await threadRow(userId, id);
    if (!tr) return bad(origin, 'not_found', '그 대화를 찾지 못했습니다.', 404);
    const r = await sb('jc_assistant_messages?thread_id=eq.' + id + '&user_id=eq.' + userId +
      '&select=turn_id,seq,question,answer,refs,web,mode,websearch,err&order=seq.asc&limit=' + HIST_TURNS_MAX);
    if (!r.ok) return bad(origin, 'server', '대화를 읽지 못했습니다.', 500);
    let rows: Array<Record<string, unknown>> = [];
    try { rows = await r.json(); } catch { rows = []; }
    return out(200, {
      ok: true,
      thread: {
        id,
        title: tr.title,
        turns: (rows || []).map((m) => ({
          id: String(m.turn_id || ''),
          q: String(m.question || ''),
          a: String(m.answer || ''),
          refs: Array.isArray(m.refs) ? m.refs : [],
          web: Array.isArray(m.web) ? m.web : [],
          mode: m.mode || '',
          websearch: m.websearch === true,
          err: m.err === true,
        })),
      },
    }, origin);
  }

  /* --- 대화방 저장(처음이면 만들고, 있으면 그 자리에 다시 쓴다) --- */
  if (action === 'history_save') {
    const turns = cleanTurns(body.turns);
    if (!turns.length) return bad(origin, 'bad_request', '저장할 대화가 비어 있습니다.');
    const title = cleanTitle(body.title, turns[0].question);
    const want = cleanUuid(body.thread_id);
    let id = '';
    if (want && await threadRow(userId, want)) id = want;

    if (id) {
      const up = await sb('jc_assistant_threads?id=eq.' + id + '&user_id=eq.' + userId, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ title, turns: turns.length, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) id = '';                     // 다른 기기에서 지워졌다 — 새 방으로 이어 간다
    }
    if (!id) {
      const cr = await sb('jc_assistant_threads', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, title, turns: turns.length }),
      });
      if (!cr.ok) return bad(origin, 'server', '대화를 저장하지 못했습니다.', 500);
      let made: Array<{ id: string }> = [];
      try { made = await cr.json(); } catch { made = []; }
      id = made.length ? String(made[0].id) : '';
      if (!id) return bad(origin, 'server', '대화를 저장하지 못했습니다.', 500);
    }

    /* 메시지는 「그 차례 그대로」로 다시 쓴다 — 지운 차례·고친 답이 그대로 반영되게. */
    const del = await sb('jc_assistant_messages?thread_id=eq.' + id + '&user_id=eq.' + userId, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    });
    if (!del.ok) return bad(origin, 'server', '대화를 저장하지 못했습니다.', 500);
    const ins = await sb('jc_assistant_messages', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(turns.map((t) => ({ ...t, thread_id: id, user_id: userId }))),
    });
    if (!ins.ok) return bad(origin, 'server', '대화를 저장하지 못했습니다.', 500);

    await trimThreads(userId);
    return out(200, { ok: true, thread_id: id, title, turns: turns.length }, origin);
  }

  /* --- 대화방 제목 바꾸기 --- */
  if (action === 'history_rename') {
    const id = cleanUuid(body.thread_id);
    if (!id) return bad(origin, 'bad_request', '대화방 번호를 확인해 주세요.');
    const title = oneLine(body.title, HIST_TITLE_MAX);
    if (!title) return bad(origin, 'bad_request', '제목을 적어 주세요.');
    const r = await sb('jc_assistant_threads?id=eq.' + id + '&user_id=eq.' + userId, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return bad(origin, 'server', '제목을 바꾸지 못했습니다.', 500);
    let rows: unknown[] = [];
    try { rows = await r.json(); } catch { rows = []; }
    if (!Array.isArray(rows) || !rows.length) return bad(origin, 'not_found', '그 대화를 찾지 못했습니다.', 404);
    return out(200, { ok: true, thread_id: id, title }, origin);
  }

  /* --- 대화방 하나 지우기(메시지는 cascade) --- */
  if (action === 'history_delete') {
    const id = cleanUuid(body.thread_id);
    if (!id) return bad(origin, 'bad_request', '대화방 번호를 확인해 주세요.');
    const r = await sb('jc_assistant_threads?id=eq.' + id + '&user_id=eq.' + userId, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    });
    if (!r.ok) return bad(origin, 'server', '대화를 지우지 못했습니다.', 500);
    return out(200, { ok: true }, origin);
  }

  /* --- 내 대화 전부 비우기 --- */
  if (action === 'history_clear') {
    const r = await sb('jc_assistant_threads?user_id=eq.' + userId, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    });
    if (!r.ok) return bad(origin, 'server', '대화를 지우지 못했습니다.', 500);
    return out(200, { ok: true }, origin);
  }

  /* --- 연결 테스트(내 키 탭): 실제로 한 번 불러 보고 답·걸린 시간·모델 이름을 돌려준다 --- */
  if (action === 'ping') {
    const row = await getKeyRow(userId);
    if (!row) return bad(origin, 'no_key', '등록된 키가 없습니다. 내 키를 먼저 등록해 주세요.', 404);

    if (await overRate(userId)) {
      return bad(origin, 'rate', '잠깐 쉬어 가요. 1분에 ' + RATE_LIMIT + '번까지 여쭤볼 수 있습니다.', 429);
    }

    let key = '';
    try {
      key = await open_(row.key_ciphertext, row.key_iv, userId + ':gemini');
    } catch {
      return bad(origin, 'bad_key', '저장된 키를 풀지 못했습니다. 키를 다시 등록해 주세요.', 409);
    }

    const chat: Chat = { system: PING_SYS, user: '안녕하세요' };
    const started = Date.now();

    /* 건너뛴 모델은 «모델명·사유·HTTP 코드»만 모은다. 타임아웃·5xx가 처음 나오는 순간
       구글 공식 상태 확인을 «겹쳐» 띄워, 상태 확인 2초가 전체 시간 뒤에 더 붙지 않게 한다. */
    const skipped: Skip[] = [];
    const probe: { job: Promise<StatusOut> | null } = { job: null };   // onSkip 안에서 채워진다
    const needStatus = (s: Skip) => {
      if (!probe.job && (s.reason === SKIP_REASON.timeout || s.reason === SKIP_REASON.transient)) {
        probe.job = checkGoogleStatus();
      }
    };

    let reply: Reply;
    try {
      reply = await callGemini(key, chat, { web: false, json: false, maxTokens: 16, thinking: false }, {
        timeoutMs: PING_TIMEOUT_MS,
        deadlineMs: PING_DEADLINE_MS,
        skipped,
        onSkip: needStatus,
      });
    } catch (e) {
      const extra: Record<string, unknown> = { ms: Date.now() - started };
      if (skipped.length) extra.skipped = skipped;
      if (probe.job) {
        const g = await probe.job;
        extra.google_status = g.text;
        extra.google_status_url = g.url;
      }
      return chainFail(e, origin, extra);
    }

    /* 체인은 이미 끝났다. 상태 확인이 떠 있으면 그 결과만 받아 붙는다(보통 1초 안쪽). */
    const status = probe.job ? await probe.job : null;
    const text = String(reply.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return out(200, {
      ok: true,
      reply: text || '연결됐어요',
      model: reply.model,
      ms: Date.now() - started,
      skipped,
      google_status: status ? status.text : '',
      google_status_url: status ? status.url : '',
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
