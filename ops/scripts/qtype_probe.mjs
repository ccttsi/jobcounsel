#!/usr/bin/env node
// AUP-6 질문 유형 판정기 시험 러너 — validate_repo.py 가 부른다(모델 호출 0).
//
//   node ops/scripts/qtype_probe.mjs <저장소 루트>
//
// 셋을 본다.
//   ① 시험 문항 assistant/test/qtype-cases.json — 판정이 기대(calc·policy·guide·counsel)와 같은가
//   ② 성적표 문항 assistant/eval/items.jsonl — qtype 정답표(ops/eval/qtype-labels.json 에서 온 값)와 견준 정확도
//      (사람이 적은 정답표라, 판정기를 고칠 때 이 숫자가 오르내리면 그 자리에서 보인다)
//   prompt.ts 배선은 이 러너가 아니라 validate_repo.py 가 글자로 본다
//   (CI 의 정적 검사 노드는 20 이라 TypeScript 파일을 불러올 수 없다 — 타입 제거 옵션이 없다).
//
// 출력은 JSON 하나(표준출력). 판정 결과만 찍고 질문·답 내용은 로그에 남기지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.argv[2] || process.cwd());
const require = createRequire(import.meta.url);
const Q = require(path.join(ROOT, 'assistant', 'qtype.js'));

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'assistant', 'test', 'qtype-cases.json'), 'utf8')).cases || [];
const items = fs.readFileSync(path.join(ROOT, 'assistant', 'eval', 'items.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((it) => it.qtype);

const out = { version: Q.VERSION, types: Q.TYPES, cases: [], splits: {} };

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

process.stdout.write(JSON.stringify(out));
