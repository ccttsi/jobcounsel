# HANDOFF — 자율 디자인 시스템 구축 + 첫 실행

브랜치: `feat/design-system` (main 043a146 위)

## 완료된 단계
- [x] Step 1: `CLAUDE.md` · `DESIGN.md` · `.claude/skills/design-lead.md` 생성
- [x] Step 2: 레퍼런스 탐색(Codrops·web.dev·Chrome Developers/MDN) → `design/studies/2026-11-16-progressive-disclosure-motion.md`
- [x] Step 3: `index.html`(상시 rAF 루프 제거·blur/width/box-shadow/grid-rows 모션 제거·통찰 풀이 접기·키워드 칩·좁은 폭 위치 숫자·섹터 수 고정 제거) · `assets/prefs.js`(공용 접기에 떠오르는 펼침·게이지 밑줄)

## 남은 작업
- [ ] Step 4: 섹터 2~3개 단위 점검·개선(묶음마다 이 파일 갱신)
- [ ] 반응형·집중 보기 검수, PR

## 다음 시작 파일
섹터 묶음 1: `transit/index.html`, `library/index.html`, `decalcomania/index.html`(transition에 box-shadow·width·max-height가 들어간 곳)

## 측정 도구(세션마다 새로)
`/home/claude/tools/audit.py [페이지…]` — 6개 폭 × 가로 넘침·콘솔 오류·첫 화면 글자 수·대기 3초 rAF·금지 속성 애니메이션·집중 보기 왕복. 기준값 `audit-base.json`.
