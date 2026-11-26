#!/usr/bin/env node
// AUP-6 질문 유형 판정기 시험 러너 — validate_repo.py 가 부른다(모델 호출 0).
//
//   node --experimental-strip-types ops/scripts/qtype_probe.mjs <저장소 루트>
//
// 셋을 본다.
//   ① 시험 문항 assistant/test/qtype-cases.json — 판정이 기대(calc·policy·guide·counsel)와 같은가
//   ② 성적표 문항 assistant/eval/items.jsonl — qtype 정답표(ops/eval/qtype-labels.json 에서 온 값)와 견준 정확도
//      (사람이 적은 정답표라, 판정기를 고칠 때 이 숫자가 오르내리면 그 자리에서 보인다)
//   ③ prompt.ts 배선 — 네 유형이 다 있고, typeBrief 가 질문에 맞는 유형의 지시를 골라 주는가
//
// 출력은 JSON 하나(표준출력). 판정 결과만 찍고 질문·답 내용은 로그에 남기지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.argv[2] || process.cwd());
const require = createRequire(import.meta.url);
const Q = require(path.join(ROOT, 'assistant', 'qtype.js'));

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'assistant', 'test', 'qtype-cases.json'), 'utf8')).cases || [];
const items = fs.readFileSync(path.join(ROOT, 'assistant', 'eval', 'items.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((it) => it.qtype);

const out = { version: Q.VERSION, types: Q.TYPES, cases: [], splits: {}, prompt: {} };

for (const c of cases) {
  const r = Q.check(c.q, c.ctx || []);
  if (r.type !== c.expect) out.cases.push([c.q, c.expect, r.type, JSON.stringify(r.scores)]);
}

const bump = (key, ok, miss) => {
  const s = out.splits[key] || (out.splits[key] = { n: 0, ok: 0, miss: [] });
  s.n++; s.ok += ok ? 1 : 0;
  if (!ok && s.miss.length < 3 && miss) s.miss.push(miss);
};
for (const it of items) {
  const r = Q.check(it.q, it.ctx || []);
  const ok = r.type === it.qtype;
  bump(it.split || '?', ok, [it.id, it.qtype, r.type]);
  bump('type:' + it.qtype, ok, null);
}

try {
  const P = await import(pathToFileURL(path.join(ROOT, 'supabase', 'functions', 'assistant-proxy', 'prompt.ts')).href);
  out.prompt.keys = Object.keys(P.TYPE_TXT || {}).sort();
  out.prompt.principle = String(P.SYS || '').includes('첫 문장에 먼저');
  out.prompt.calc = String(P.typeBrief('최저임금 시급이 얼마예요?') || '').includes(P.TYPE_TXT.calc);
  out.prompt.counsel = String(P.typeBrief('내담자가 계속 울기만 하는데 상담을 어떻게 진행할까요?') || '').includes(P.TYPE_TXT.counsel);
  out.prompt.prev = String(P.typeBrief('그럼 수습 기간엔요?', ['최저임금 시급이 얼마예요?']) || '').includes(P.TYPE_TXT.calc);
  out.prompt.same = P.QTYPE && P.QTYPE.VERSION === Q.VERSION;
} catch (e) {
  out.prompt.error = String(e && e.message ? e.message : e).slice(0, 200);
}

process.stdout.write(JSON.stringify(out));
