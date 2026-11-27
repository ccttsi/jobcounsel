// /api/embed — 질문 하나를 «뜻 벡터»(1024차원)로 바꿔 주는 엔드포인트. (AUP-7)
//
// 무엇을 하나
//   비서 화면(assets/assistant.js)이 질문을 보내면, Cloudflare Workers AI 바인딩(`env.AI`)의
//   `@cf/baai/bge-m3` 로 그 질문의 임베딩을 받아 돌려준다. 화면은 이 벡터를 정적 파일
//   `assistant/data/semantic-vectors.json` 의 섹터 벡터와 코사인으로 견주어 «뜻이 가까운 섹터»를
//   조금 민다(assistant/search.js). 정적 벡터도 같은 모델로 만들어 두어야 코사인이 뜻을 가진다 —
//   화면은 돌려준 model 이름이 정적 파일의 model 과 다르면 벡터를 쓰지 않는다.
//
// 지키는 선 (헌법 제3조)
//   · 받은 질문은 **어디에도 저장·기록하지 않는다**(로그·캐시·DB 없음). 응답은 `no-store`.
//   · 실패·시간 초과·모양 오류는 모두 같은 모양(`ok:false, fallback:true`)으로 돌려주고,
//     원문을 되비추지 않는다. 화면은 그때 글자 검색 그대로 돈다(무중단 폴백).
//   · `env.AI` 바인딩이 없으면 부르지도 않고 조용히 폴백을 알린다 — 배포 환경이 바뀌어도 화면은 멀쩡하다.
//
// 모델 — BAAI bge-m3 (MIT). e5 계열과 달리 `query:`/`passage:` 접두사를 붙이지 않는다.
//   한국어를 포함한 다국어·긴 문맥(8,192 토큰)을 다루고, 출력은 길이 1 로 정규화된 1024차원 float 이다.
//   비용은 Cloudflare Workers AI 무료 한도(하루 뉴런) 안에서 쓰고, 질문 한 건당 한 번만 부른다.

const MODEL = '@cf/baai/bge-m3';
const DIM = 1024;
const MAX_Q = 200;             // 질문 길이 상한 — 넘으면 잘라서 임베딩한다(검색에는 충분한 길이)
const TIMEOUT_MS = 8000;       // 화면은 2~3초만 기다린다 — 늦으면 폴백이 낫다

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',            // 질문은 남기지 않는다(중간 캐시에도)
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
function fallback() {
  return json({ ok: false, fallback: true });
}
/* 받은 질문 정리 — 태그를 걷고 공백을 하나로. 원문을 그대로 되돌려 주는 곳은 없다. */
function cleanQuery(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_Q);
}
/* Workers AI 응답에서 1024차원 숫자 배열만 꺼낸다.
   모양이 `{ shape:[1,1024], data:[[...]] }` 이거나 `{ data:[[...]] }`, 혹은 배열 자체일 수 있어 방어적으로 본다. */
function pickVector(res) {
  let row = null;
  if (res && Array.isArray(res.data)) row = Array.isArray(res.data[0]) ? res.data[0] : res.data;
  else if (Array.isArray(res)) row = Array.isArray(res[0]) ? res[0] : res;
  if (!Array.isArray(row) || row.length !== DIM) return null;
  const out = new Float64Array(DIM);
  let sum = 0;
  for (let i = 0; i < DIM; i++) {
    const x = Number(row[i]);
    if (!Number.isFinite(x)) return null;
    out[i] = x;
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  if (!norm) return null;
  // 화면은 받은 벡터를 다시 길이 1로 맞추지만, 여기서 맞춰 두면 전송·계산이 가볍고
  // 소수점 6자리로 줄여도 int8(127단계) 양자화 정밀도에 아무 영향이 없다.
  const vec = new Array(DIM);
  for (let i = 0; i < DIM; i++) vec[i] = Math.round((out[i] / norm) * 1e6) / 1e6;
  return vec;
}

async function runWithTimeout(ai, text) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([ai.run(MODEL, { text: [text] }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env || !env.AI || typeof env.AI.run !== 'function') return fallback();   // 바인딩이 없으면 조용히

  const q = cleanQuery(new URL(request.url).searchParams.get('q'));
  if (!q) return json({ ok: false, fallback: true, error: 'empty' }, 400);

  try {
    const res = await runWithTimeout(env.AI, q);
    const vector = pickVector(res);
    if (!vector) return fallback();
    return json({ ok: true, model: MODEL, dim: DIM, vector });
  } catch {
    return fallback();                              // 실패·시간 초과·모델 오류 — 원인을 화면에 싣지 않는다
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response(JSON.stringify({ ok: false, fallback: true, error: 'method' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      allow: 'GET',
    },
  });
}
