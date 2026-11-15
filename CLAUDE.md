# CLAUDE.md — 이 저장소에서 일하는 Claude를 위한 지침

직업상담 통합 자료실(정적 사이트, 빌드 없음, GitHub Pages). 각 섹터는 `폴더/index.html` 한 파일(일부는 `app.js`·`data/` 분리)이고, 공용 층은 `assets/prefs.js`(테마·글자 크기·집중 보기·디자인 층·접기), `assets/marker.js`(형광펜·포스트잇), `assets/sync.js`(선택 로그인·연동)다.

## 작업 시작 전 — 반드시 읽는다

1. **`DESIGN.md`** — 토큰, 4대 원칙, 집중 보기 호환 규칙, 모션 가드레일. 화면을 건드리는 모든 작업의 기준이다.
2. **`.claude/skills/design-lead.md`** — 새 섹터 개발·디자인 개편 전에 밟는 루틴(레퍼런스 탐색 → 저작권 필터 → 학습 노트 → 셀프 검수).
3. **`design/HANDOFF.md`** — 앞 세션이 남긴 완료 단계·남은 일·다음 시작 파일. 이어 하는 작업이면 여기서 출발한다.
4. 관련 학습 노트: `design/studies/` 최신 파일 1~2개.

## 작업 중 — 지킬 것

- 원문 저작물(보고서·매뉴얼·검사 문항)을 옮기지 않는다. README의 「저작권과 출처」를 따른다.
- 유머 문구·드립·AI식 위트 카피를 쓰지 않는다. 새로 넣는 문구는 버튼 이름표·안내처럼 기능적인 것만.
- **자료실 섹터 개수를 코드·문서·문구에 고정하지 않는다.** 대문은 `TOOLS` 배열 길이에서 세고(`data-count`), 문서에는 "섹터마다", "모든 섹터"처럼 쓴다.
- 모션은 `transform`·`opacity`만. 레이아웃 속성(width·height·top·left·grid-template-rows·max-height)·`filter: blur`·`box-shadow` 애니메이션 금지, 상시 도는 JS 루프 금지. `prefers-reduced-motion`과 집중 보기(`html[data-jc-imm]`)에서는 꾸밈 모션을 멈춘다.
- 휴대폰 세로(≤899px)와 큰 화면 가로(≥900px, 특히 ≥1200px)를 따로 설계한다. 휴대폰은 접고 누르면 펼치기, 큰 화면은 좌우 분할·다단.
- 가독성: 보조 글자색 대비 4.5:1 이상(`--dim` 밝게 `#6e645b`), 글자 11px 이상, 터치 대상 44px 이상.
- 새 섹터: 본문을 `<main>`에, 머리말에 `<span data-jc-prefs></span>`, `</body>` 앞에 `marker.js`·`prefs.js`. 화면을 다시 그리는 고정 차례는 `html[data-jc-imm] .x{display:none}`로 숨긴다. 휴대폰 상세는 `window.JC_FOLD`로 접는다.

## 작업 끝 — 반드시 남긴다

1. 새로 발견·정리한 패턴은 **`DESIGN.md`의 「패턴 기록」 맨 아래에 누적**한다(날짜, 어디에 썼는지, 왜). 지우지 않고 더한다.
2. 레퍼런스를 탐색했다면 `design/studies/YYYY-MM-DD-주제.md` 노트를 남긴다.
3. 큰 작업은 단계마다 커밋하고 `design/HANDOFF.md`의 [완료된 단계 / 남은 작업 / 다음 시작 파일]을 갱신한다(중단 대비).
4. README의 해당 섹터 설명이 바뀌었으면 함께 고친다.
