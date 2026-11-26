// /api/layer-merge — 경험×공고 레이어의 «연결부 설명»만 서버 AI로 다듬는 엔드포인트.
//
// 무엇을 하나
//   화면(layer-merge/app.js)이 내장 엔진으로 먼저 계산한 «뽑아낸 낱말»(직무군 이름·요구 라벨·K/S/A 한 줄·
//   경험 이름·행동)만 받아, Groq에 «왜 이 경험이 이 요구와 닿는지» 두 문장과 전개 방향 한 줄을 부탁한다.
//   완성된 자소서·이력서 문장은 만들지 않는다(문장을 쓰는 사람의 아이디어를 막지 않기 위해서다).
//
// 지키는 선 (헌법 제3조)
//   · 입력한 원문(공고문·경험 문장)은 받지도, 넘기지도 않는다. 화면이 보내는 것은 이미 계산된 라벨뿐이다.
//   · 키는 Cloudflare Pages 환경변수 GROQ_API_KEY에만 둔다. 없으면 조용히 { ok:false, fallback:true }.
//   · 실패·시간 초과·형식 오류도 같은 모양으로 돌려주고, 화면은 내장 엔진 결과를 그대로 보여 준다.
//   · 받은 값을 저장하지 않고, 응답에 요청 내용을 되비추지 않는다.
//
// 무료 한도(ops/ROLES.md · ops/model-routing.json «layer_merge»): Groq은 모델마다 하루 1,000회·분당 30회.
// 연결 설명은 병합할 때 한 번만 부른다. 120b는 수집 전용이라 쓰지 않는다.

const MODEL = 'openai/gpt-oss-20b';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 9000;      // 생각하는 모델이라 첫 글자까지 시간이 든다 — 화면 쪽 기다림(10초)보다 짧게
// gpt-oss-20b 는 «생각(reasoning)» 토큰도 출력 한도에 함께 센다. 예전 max_tokens: 700 은 생각에 다 써 버려
// 본문(JSON)이 비거나 잘려 늘 fallback 됐다 → 생각은 낮게(low)·응답에 싣지 않고, 한도는 생각 몫까지 넉넉히.
const MAX_OUT = 1600;
const MAX_REQS = 6;
const MAX_TEXT = 60;          // 라벨 한 칸 길이 상한
const MAX_WHY = 240;          // 돌려줄 설명 길이 상한

const SYSTEM = [
  '너는 한국의 취업 서류 작성을 돕는 도우미다. 사용자가 이미 계산해 둔 «요구»와 «경험» 라벨만 보고,',
  '각 요구마다 왜 그 경험이 그 요구와 닿는지 설명한다.',
  '',
  '규칙',
  '1. 완성된 자기소개서·이력서 문장을 쓰지 않는다. 사용자가 직접 쓸 수 있도록 «왜 연결되는지»와 «무엇을 확인하면 좋은지»만 적는다.',
  '2. 요구마다 두 문장 이내, 90자 안팎. 감탄·과장·면접 합격 예측·점수는 쓰지 않는다.',
  '3. 주어진 라벨에 없는 경험·수치·회사명·자격을 만들어 내지 않는다. 경험의 행동 라벨은 짐작일 수 있으니 «했다고» 단정하지 말고 «~했다면»처럼 조건으로 쓴다.',
  '4. 딱딱한 보고서 말투 대신, 옆에서 짚어 주는 담백한 한국어로 쓴다.',
  '5. 출력은 JSON 하나뿐이다. 형식: {"notes":{"<요구 id>":{"why":"..."}}}',
  '',
  '예: "편의점 매장" 경험 × "재고·발주" 요구 → {"notes":{"retail03":{"why":"수량과 유통기한을 매번 대조한 경험이 재고 차이를 잡는 일과 같습니다. 실사 주기와 오차를 어떻게 처리했는지 한 줄 붙이면 근거가 됩니다."}}}'
].join('\n');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function fallback() {
  return json({ ok: false, fallback: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.GROQ_API_KEY) return fallback();          // 키가 없으면 화면이 조용히 내장 엔진으로 돈다

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, fallback: true, error: 'bad_json' }, 400);
  }

  const reqs = Array.isArray(body && body.reqs) ? body.reqs.slice(0, MAX_REQS) : [];
  if (!reqs.length) return json({ ok: false, fallback: true, error: 'empty' }, 400);

  const job = clean(body.job, 40);
  const exps = (Array.isArray(body.exps) ? body.exps.slice(0, 3) : []).map((e) => ({
    label: clean(e && e.label, MAX_TEXT),
    verb: clean(e && e.verb, MAX_TEXT),
    comp: clean(e && e.comp, MAX_TEXT),
  }));
  const items = reqs.map((r) => ({
    id: clean(r && r.id, 12),
    label: clean(r && r.label, MAX_TEXT),
    k: clean(r && r.k, MAX_TEXT),
    s: clean(r && r.s, MAX_TEXT),
    a: clean(r && r.a, MAX_TEXT),
  })).filter((r) => r.id && r.label);

  if (!items.length || !exps.length) return json({ ok: false, fallback: true, error: 'empty' }, 400);

  const user = [
    job ? `직무군: ${job}` : '직무군: 확인되지 않음',
    '경험: ' + exps.map((e) => [e.label, e.verb, e.comp].filter(Boolean).join(' · ')).join(' / '),
    '요구:',
    ...items.map((r) => `- ${r.id} | ${r.label} | K ${r.k} | S ${r.s} | A ${r.a}`),
    '',
    '위 요구마다 notes를 만들어라. 설명에 없는 경험을 지어내지 말고, 주어진 라벨 안에서만 연결하라.'
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: MAX_OUT,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return fallback();                          // 429·5xx도 화면에는 조용히
    const data = await res.json();
    const choice = data && data.choices && data.choices[0];
    const text = choice && choice.message && choice.message.content;
    if (!text || (choice && choice.finish_reason === 'length')) return fallback();   // 잘린 JSON은 믿지 않는다
    const parsed = JSON.parse(text);
    const raw = (parsed && parsed.notes) || {};
    const allowed = new Set(items.map((r) => r.id));
    const notes = {};
    Object.keys(raw).forEach((id) => {
      if (!allowed.has(id)) return;                          // 요청에 없는 id는 버린다
      const why = clean(raw[id] && raw[id].why, MAX_WHY);
      if (why) notes[id] = { why };
    });
    if (!Object.keys(notes).length) return fallback();
    return json({ ok: true, model: MODEL, notes });
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, fallback: true, error: 'method' }, 405);
}
