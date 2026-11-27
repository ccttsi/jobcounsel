// AUP-8 답 평가 주간 집계 — «어느 유형·어느 자료에서 답이 약한가»
//
//   node ops/feedback/weekly.mjs [--days 7] [--notion]
//   node ops/feedback/weekly.mjs --self-test          # 집계 규칙만 확인(네트워크 0)
//
// 읽는 것: Supabase 함수 jc_assistant_feedback_week(days) 의 묶음(유형 × 섹터)뿐 — 질문·답 문장은 DB에도 없다.
//   Supabase Management API(SQL)로 부른다. 비밀값 이름: SUPABASE_ACCESS_TOKEN · NOTION_TOKEN_MCL(진행일지 한 줄, 선택).
// 내는 것: Actions 요약(표) + feedback-week.json(산출물) + 평가가 있을 때만 진행일지 한 줄.
// «보강 후보» = 평가 3건 이상이고 👎 비율 40% 이상인 묶음 → 성적표(AUP-2) 문항 보강·FTN-1 문답집을 어디부터 쓸지의 지도.
// 설계: ops/feedback/DESIGN.md
import fs from 'node:fs';

const ENV = process.env;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DAYS = Math.max(1, Math.min(90, Number(arg('--days', '7')) || 7));
const PROJECT = ENV.SUPABASE_PROJECT_REF || 'vzxwdfswlolhcluljkgi';
const NOTION_DB = '42214d0ef550812d8ebbdbf845d34b38';   // 📓 MCL Goal 진행일지
const MIN_N = 3, DOWN_RATE = 0.4;

const QLABEL = { calc: '계산', policy: '제도', guide: '안내', counsel: '상담 진행', '': '(빠른 버튼·판정 없음)' };
const RLABEL = { wrong: '틀림', offtopic: '질문과 다름', hard: '어려움', long: '김' };

export function candidates(week) {
  return (week.groups || [])
    .filter((g) => g.n >= MIN_N && g.down / g.n >= DOWN_RATE)
    .map((g) => {
      const top = Object.keys(RLABEL).map((k) => [k, g[k] || 0]).sort((a, b) => b[1] - a[1])[0];
      return { qtype: g.qtype, sector: g.sector, n: g.n, down: g.down, rate: Math.round((g.down / g.n) * 100), why: top && top[1] ? top[0] : '' };
    })
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
}

export function markdown(week, cands) {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const lines = [`## AUP-8 답 평가 주간 집계 (최근 ${week.days}일)`, '',
    `- 평가 ${week.total}건 · 아쉬움 ${week.down}건(${pct(week.down, week.total)}) — 질문·답 문장 없이 유형·인용 섹터·이유만 센다.`, ''];
  if (!week.total) { lines.push('이번 주 평가가 없습니다(답 평가 단추는 켠 사람에게만 보인다).'); return lines.join('\n'); }
  lines.push('| 유형 | 평가 | 아쉬움 |', '| --- | --- | --- |');
  Object.entries(week.by_qtype || {}).forEach(([q, v]) => lines.push(`| ${QLABEL[q] || q} | ${v.n} | ${pct(v.down, v.n)} |`));
  lines.push('', `### 보강 후보 (평가 ${MIN_N}건 이상 · 아쉬움 ${DOWN_RATE * 100}% 이상)`, '');
  if (!cands.length) lines.push('없음');
  else {
    lines.push('| 유형 | 섹터 | 평가 | 아쉬움 | 많은 이유 |', '| --- | --- | --- | --- | --- |');
    cands.forEach((c) => lines.push(`| ${QLABEL[c.qtype] || c.qtype} | ${c.sector || '(인용 없음)'} | ${c.n} | ${c.rate}% | ${RLABEL[c.why] || '—'} |`));
  }
  return lines.join('\n');
}

async function fetchWeek() {
  const token = ENV.SUPABASE_ACCESS_TOKEN;
  if (!token) return { skip: 'SUPABASE_ACCESS_TOKEN 없음' };
  // 읽기 전용 SQL 길을 먼저 쓴다(권한이 더 좁다). 집계 함수는 select 만 한다.
  const query = `select public.jc_assistant_feedback_week(${DAYS}) as w`;
  const codes = [];
  for (const tail of ['database/query/read-only', 'database/query']) {
    let r;
    try {
      r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/${tail}`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
    } catch { codes.push(tail.split('/').pop() + ' 네트워크'); continue; }
    if (!r.ok) {
      // 거절 이유를 남긴다 — 상태 코드만으로는 «권한 없음»과 «SQL 오류»를 가릴 수 없다.
      let why = '';
      try { why = (await r.text() || '').replace(/\s+/g, ' ').trim().slice(0, 160); } catch {}
      codes.push(tail.split('/').pop() + ' ' + r.status + (why ? ' «' + why + '»' : ''));
      continue;
    }
    codes.push(tail.split('/').pop() + ' ' + r.status);
    const rows = await r.json();
    const w = Array.isArray(rows) && rows[0] ? rows[0].w : null;
    return w && typeof w === 'object' ? { week: w } : { fail: '집계 모양이 다름' };
  }
  // 토큰은 있는데 거절됐다 — 조용히 넘기면 매주 빈 집계가 «성공»으로 남는다. 실패로 드러낸다.
  return { fail: `Supabase가 SQL 실행을 거절(${codes.join(' · ')}) — SUPABASE_ACCESS_TOKEN에 데이터베이스 읽기 권한이 필요하다` };
}

async function notion(week, cands) {
  const key = ENV.NOTION_TOKEN_MCL;
  if (!key || !argv.includes('--notion') || !week.total) return 'skip';
  const day = new Date().toISOString().slice(0, 10);
  const text = (s) => [{ type: 'text', text: { content: String(s).slice(0, 1900) } }];
  const top = cands.slice(0, 5).map((c) => `${QLABEL[c.qtype] || c.qtype}×${c.sector || '-'} ${c.rate}%(${c.n})`).join(' · ') || '없음';
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'Notion-Version': '2022-06-28' },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB },
      properties: {
        '무엇을 했나': { title: text(`AUP-8 답 평가 주간 집계 ${day}`) },
        '날짜': { date: { start: day } },
        '단계': { select: { name: 'AUP' } },
        '하부계획': { rich_text: text('AUP-8') },
        '누가': { select: { name: '자동화' } },
        '상태': { status: { name: '완료' } },
        '결과': { rich_text: text(`평가 ${week.total} · 아쉬움 ${week.down} · 보강 후보: ${top}`) },
        '다음 할 일': { rich_text: text(cands.length ? '보강 후보 묶음의 성적표 문항 보강(AUP-2) · FTN-1 문답집 우선순위' : '—') },
      },
    }),
  });
  return 'notion ' + r.status;
}

function selfTest() {
  const week = { days: 7, total: 9, down: 5, by_qtype: { calc: { n: 6, down: 4 }, guide: { n: 3, down: 1 } }, groups: [
    { qtype: 'calc', sector: 'pay-calc', n: 5, down: 4, wrong: 3, offtopic: 0, hard: 1, long: 0 },
    { qtype: 'calc', sector: 'law', n: 2, down: 2, wrong: 2, offtopic: 0, hard: 0, long: 0 },          // 3건 미만 — 후보 아님
    { qtype: 'guide', sector: 'cert', n: 3, down: 1, wrong: 0, offtopic: 1, hard: 0, long: 0 },        // 33% — 후보 아님
  ] };
  const c = candidates(week);
  const ok = c.length === 1 && c[0].sector === 'pay-calc' && c[0].rate === 80 && c[0].why === 'wrong'
    && /보강 후보/.test(markdown(week, c)) && /평가가 없습니다/.test(markdown({ days: 7, total: 0, down: 0 }, []));
  console.log(ok ? 'self-test 통과' : 'self-test 실패', JSON.stringify(c));
  process.exit(ok ? 0 : 1);
}

if (argv.includes('--self-test')) selfTest();
else {
  const got = await fetchWeek();
  const week = got.week || { days: DAYS, total: 0, down: 0, by_qtype: {}, groups: [] };
  const cands = candidates(week);
  let md = markdown(week, cands);
  if (got.skip) md = `## AUP-8 답 평가 주간 집계\n\n건너뜀 — ${got.skip}`;
  if (got.fail) md = `## AUP-8 답 평가 주간 집계\n\n실패 — ${got.fail}`;
  console.log(md);
  if (ENV.GITHUB_STEP_SUMMARY) fs.appendFileSync(ENV.GITHUB_STEP_SUMMARY, md + '\n');
  fs.writeFileSync('feedback-week.json', JSON.stringify({ days: DAYS, skip: got.skip || '', fail: got.fail || '', week, candidates: cands }, null, 1) + '\n');
  if (got.fail) process.exit(1);
  if (!got.skip) console.log(await notion(week, cands).catch(() => 'notion 실패(네트워크)'));
}
