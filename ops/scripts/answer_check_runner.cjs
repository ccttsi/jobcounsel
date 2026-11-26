// AUP-5 답 검사기 시험 러너 — validate_repo.py --only answercheck 가 부른다.
//   ① check-data.js(생성물) + answer-check.js(서버 사본)를 그대로 싣고
//   ② assistant/test/answer-check-cases.json 의 기대와 맞대고
//   ③ 자료실 지면 글(근거 조각·색인·법전) 전수에서 «바뀐 것 0»을 확인한다(오탐 0).
// 입력(표준입력): {"cases": [...]}. 출력: {"caseBad": [[id,[이유]], ...], "corpus": {"total": n, "changed": n, "sample": [...]}}
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
require(path.join(ROOT, 'supabase', 'functions', 'assistant-proxy', 'check-data.js'));
const CHECK = require(path.join(ROOT, 'supabase', 'functions', 'assistant-proxy', 'answer-check.js'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const caseBad = [];
for (const c of input.cases || []) {
  const r = CHECK.check(c.answer, c.references || []);
  const e = c.expect || {};
  const bad = [];
  if (e.unchanged && r.answer !== c.answer) bad.push('답이 바뀌었다');
  if (e.exact != null && r.answer !== e.exact) bad.push('답이 다르다: ' + JSON.stringify(r.answer.slice(0, 120)));
  for (const s of e.contains || []) if (r.answer.indexOf(s) < 0) bad.push('빠짐: ' + s);
  for (const s of e.absent || []) if (r.answer.indexOf(s) >= 0) bad.push('남음: ' + s);
  if (e.numbers != null && r.fixed.numbers !== e.numbers) bad.push('고친 수 ' + r.fixed.numbers + ' ≠ ' + e.numbers);
  if (e.links != null && r.fixed.links !== e.links) bad.push('지운 링크 ' + r.fixed.links + ' ≠ ' + e.links);
  if (e.refs) {
    const got = r.references.map((x) => x.url);
    if (JSON.stringify(got) !== JSON.stringify(e.refs)) bad.push('근거 ' + JSON.stringify(got));
  }
  if (bad.length) caseBad.push([c.id, bad]);
}

/* 자료실 지면 글 전수 — 근거 조각·색인 글·법전 글이 바뀌면 오탐이다. */
const texts = [];
function addTexts(node) {
  if (typeof node === 'string') { if (node.length > 20) texts.push(node); return; }
  if (Array.isArray(node)) { node.forEach(addTexts); return; }
  if (node && typeof node === 'object') { Object.keys(node).forEach((k) => addTexts(node[k])); }
}
function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { return null; }
}
const chunks = readJson('assistant/data/chunks.json');
(chunks && chunks.chunks || []).forEach((c) => texts.push(String(c.t || '') + '\n' + String(c.x || '')));
const index = readJson('assistant/data/index.json');
(index && index.docs || []).forEach((d) => texts.push(String(d.t || '') + '\n' + String(d.x || '')));
addTexts(readJson('law/data/laws.json'));

let changedCount = 0;
const sample = [];
for (const t of texts) {
  const r = CHECK.check(t, []);
  if (r.answer !== t) {
    changedCount++;
    if (sample.length < 3) sample.push([t.slice(0, 80), r.answer.slice(Math.max(0, r.answer.length - 80))]);
  }
}

process.stdout.write(JSON.stringify({
  caseBad: caseBad,
  corpus: { total: texts.length, changed: changedCount, sample: sample },
}));
