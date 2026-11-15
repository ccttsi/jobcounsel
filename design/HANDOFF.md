# HANDOFF — 자율 디자인 시스템 구축 + 첫 실행

브랜치: `feat/design-system` (main 043a146 위)

## 완료된 단계
- [x] Step 1: `CLAUDE.md` · `DESIGN.md` · `.claude/skills/design-lead.md` 생성
- [x] Step 2: 레퍼런스 탐색(Codrops·web.dev·Chrome Developers/MDN) → `design/studies/2026-11-16-progressive-disclosure-motion.md`
- [x] Step 3: `index.html`(상시 rAF 루프 제거·blur/width/box-shadow/grid-rows 모션 제거·통찰 풀이 접기·키워드 칩·좁은 폭 위치 숫자·섹터 수 고정 제거) · `assets/prefs.js`(공용 접기에 떠오르는 펼침·게이지 밑줄)

## 남은 작업
- [ ] Step 4: 섹터 2~3개 단위 점검·개선(묶음마다 이 파일 갱신)
  - [x] 묶음 1: 환승노선도·서재·커리어데칼코마니
  - [x] 묶음 2: 국취 매뉴얼·파슨스·DACUM
  - [x] 묶음 3: 대학학과위키·국취 HUD·대학원 탐구생활·기업 명함첩·자격증 도감(+ 이용 안내 문구를 쓰는 섹터 전체)
- [ ] 반응형·집중 보기 검수, PR

## 다음 시작 파일
최종 검수: `/home/claude/tools/audit.py`(전 섹터), 그다음 README·DESIGN.md 패턴 기록, PR

## 측정 도구(세션마다 새로)
`/home/claude/tools/audit.py [페이지…]` — 6개 폭 × 가로 넘침·콘솔 오류·첫 화면 글자 수·대기 3초 rAF·금지 속성 애니메이션·집중 보기 왕복. 기준값 `audit-base.json`.
