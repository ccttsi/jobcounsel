// FTN-1 초안 검사 — AUP-5 답 검사기(assistant/answer-check.js)를 초안 묶음에 그대로 돌린다.
//   입력(표준입력): {"items":[{"id","answer","references":[{"id":"e1","url":"./law/"}]}]}
//   출력:            {"items":[{"id","answer"(검사기 통과본),"fixed":{"numbers","links"},"links":[남은 근거 id]}]}
// 검사기·자료(check-data.js)는 서버·성적표와 같은 파일을 쓴다 — 규칙을 두 벌로 두지 않는다.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
require(path.join(ROOT, 'supabase', 'functions', 'assistant-proxy', 'check-data.js'));
const CHECK = require(path.join(ROOT, 'supabase', 'functions', 'assistant-proxy', 'answer-check.js'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = [];
for (const item of input.items || []) {
  const refs = (item.references || []).filter((r) => r && r.url).map((r) => ({ id: r.id, url: r.url, title: r.title || '' }));
  const r = CHECK.check(item.answer || '', refs);
  out.push({ id: item.id, answer: r.answer, fixed: r.fixed, links: r.references.map((x) => x.id) });
}
process.stdout.write(JSON.stringify({ items: out }));
